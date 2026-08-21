/**
 * MCP (Model Context Protocol) server — read-only, per-org scoped.
 *
 * Auth: each Organisation has its own mcp_key stored in the organisations table.
 *       The key is presented as `Authorization: Bearer <key>`.
 *       The key lookup resolves the caller's org_id; every data query is then
 *       scoped to that org via PostgreSQL Row-Level Security (mcp_reader role).
 *
 * Read-only enforcement:
 *   - get_sample_data runs inside a `BEGIN READ ONLY` transaction as `mcp_reader`.
 *   - RLS policies on all 11 user-data tables restrict rows to the caller's org.
 *   - set_config is revoked from mcp_reader so session GUCs cannot be overridden
 *     from within a query (defense-in-depth).
 *
 * Required DB objects (applied by lib/db/migrations/0001_mcp_rls.sql and
 * verified at startup by checkMcpDbObjects()):
 *   - mcp_reader role with SELECT on all tables
 *   - RLS enabled + per-org policies on all 11 user-data tables
 *   - mcp_org_partner_ids / mcp_org_user_ids / mcp_org_opportunity_ids functions
 */

import { Router, type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type ListToolsResult,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { pool } from "@workspace/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

// ── Startup DB-objects check ──────────────────────────────────────────────────
// Verifies that the required PostgreSQL role, RLS policies, and SECURITY DEFINER
// helper functions exist.  Logs a fatal-level warning if they are missing so that
// a deploy on a fresh database fails loudly instead of silently serving
// cross-tenant data.  The objects are created by
// lib/db/migrations/0001_mcp_rls.sql, which post-merge.sh runs automatically.

export async function checkMcpDbObjects(): Promise<void> {
  const errors: string[] = [];

  // 1. mcp_reader role
  const { rows: roleRows } = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'mcp_reader') AS exists",
  );
  if (!roleRows[0]?.exists) errors.push("role 'mcp_reader' is missing");

  // 2. RLS enabled on the 11 user-data tables
  const EXPECTED_TABLES = [
    "organizations", "users", "partners", "internal_resources",
    "partner_resources", "opportunities", "profiles",
    "meddpicc_entries", "meddpicc_section_meta", "company_research", "reminders",
  ];
  const { rows: rlsRows } = await pool.query<{ relname: string }>(
    `SELECT relname FROM pg_class
     WHERE relname = ANY($1::text[]) AND relrowsecurity = true`,
    [EXPECTED_TABLES],
  );
  const rlsEnabled = new Set(rlsRows.map((r) => r.relname));
  const rlsMissing = EXPECTED_TABLES.filter((t) => !rlsEnabled.has(t));
  if (rlsMissing.length > 0) errors.push(`RLS not enabled on: ${rlsMissing.join(", ")}`);

  // 3. mcp_reader RLS policies exist
  const { rows: policyRows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM pg_policies WHERE policyname LIKE 'mcp_%' AND roles @> '{mcp_reader}'",
  );
  const policyCount = parseInt(policyRows[0]?.count ?? "0", 10);
  if (policyCount < EXPECTED_TABLES.length) {
    errors.push(`Expected ${EXPECTED_TABLES.length} mcp_reader RLS policies, found ${policyCount}`);
  }

  // 4. SECURITY DEFINER helper functions
  const EXPECTED_FNS = ["mcp_org_partner_ids", "mcp_org_user_ids", "mcp_org_opportunity_ids"];
  const { rows: fnRows } = await pool.query<{ proname: string }>(
    "SELECT proname FROM pg_proc WHERE proname = ANY($1::text[])",
    [EXPECTED_FNS],
  );
  const fnFound = new Set(fnRows.map((r) => r.proname));
  const fnMissing = EXPECTED_FNS.filter((f) => !fnFound.has(f));
  if (fnMissing.length > 0) errors.push(`SECURITY DEFINER functions missing: ${fnMissing.join(", ")}`);

  if (errors.length > 0) {
    const msg =
      `[MCP] Required DB objects are missing — run lib/db/migrations/0001_mcp_rls.sql:\n  • ` +
      errors.join("\n  • ");
    // Log at error level so it surfaces in workflow logs
    console.error(msg);
    throw new Error(msg);
  }
}

// ── Per-org API key lookup ────────────────────────────────────────────────────

async function lookupOrgByKey(key: string): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM organizations WHERE mcp_key = $1",
    [key],
  );
  return rows[0]?.id ?? null;
}

async function extractAndValidateKey(req: Request, res: Response): Promise<number | null> {
  const auth = req.headers.authorization;
  // Require Bearer header only — never accept keys in query params to prevent
  // accidental credential exposure in access logs or copy-pasted URLs.
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!provided) {
    res.status(401).json({ error: "Authorization required: provide a per-org MCP API key as 'Authorization: Bearer <key>'" });
    return null;
  }

  const orgId = await lookupOrgByKey(provided);
  if (!orgId) {
    res.status(401).json({ error: "Invalid MCP API key" });
    return null;
  }
  return orgId;
}

// ── Org-scoped read-only query helper ─────────────────────────────────────────
// Runs SQL inside a READ ONLY transaction as the mcp_reader role with the
// org_id set as a session variable.  PostgreSQL RLS policies on mcp_reader
// enforce tenant isolation.  The transaction is always rolled back so no
// changes can ever be committed even if a write somehow reached this path.

async function runOrgScopedQuery(
  sql: string,
  params: unknown[],
  orgId: number,
): Promise<{ rowCount: number | null; rows: unknown[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE mcp_reader");
    await client.query(`SET LOCAL app.org_id = '${orgId}'`);
    let rowCount: number | null;
    let rows: unknown[];
    try {
      const result = await client.query(sql, params);
      rowCount = result.rowCount;
      rows = result.rows;
    } finally {
      await client.query("ROLLBACK").catch(() => {});
    }
    return { rowCount, rows };
  } finally {
    client.release();
  }
}

// ── MCP Server factory (orgId captured in closure) ───────────────────────────

function createMcpServer(orgId: number): Server {
  const server = new Server(
    { name: "gsi-tracker", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // list tools ─────────────────────────────────────────────────────────────
  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => ({
      tools: [
        {
          name: "list_tables",
          description: "List all user tables in the database with approximate row counts.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_schema",
          description:
            "Get the full database schema: all tables with columns (name, type, nullable, default) and all foreign-key relationships. No row data is returned.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_sample_data",
          description:
            "Return up to 20 rows from a named table, scoped to your organisation.",
          inputSchema: {
            type: "object",
            required: ["table"],
            properties: {
              table: { type: "string", description: "Table name (from list_tables)" },
              limit: { type: "number", description: "Max rows (default 10, max 20)" },
            },
          },
        },
        {
          name: "get_api_spec",
          description:
            "Return the full OpenAPI YAML specification describing every REST endpoint, request/response schema, and tag.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }),
  );

  // call tool ───────────────────────────────────────────────────────────────
  server.setRequestHandler(
    CallToolRequestSchema,
    async (req): Promise<CallToolResult> => {
      const { name, arguments: args } = req.params;
      try {
        switch (name) {
          // ── Structural tools (no tenant data, run as the main postgres user) ──

          case "list_tables": {
            const { rows } = await pool.query(
              `SELECT relname AS table_name, n_live_tup AS approx_rows
               FROM pg_stat_user_tables ORDER BY relname`,
            );
            return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
          }

          case "get_schema": {
            const [cols, fks] = await Promise.all([
              pool.query(`
                SELECT table_name, column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
              `),
              pool.query(`
                SELECT tc.table_name, kcu.column_name,
                       ccu.table_name AS ref_table, ccu.column_name AS ref_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.constraint_schema = kcu.constraint_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.constraint_schema = tc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.constraint_schema = 'public'
                ORDER BY tc.table_name, kcu.column_name
              `),
            ]);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ columns: cols.rows, foreignKeys: fks.rows }, null, 2),
              }],
            };
          }

          case "get_api_spec": {
            const specPath = resolve(process.cwd(), "../../lib/api-spec/openapi.yaml");
            const spec = readFileSync(specPath, "utf-8");
            return { content: [{ type: "text", text: spec }] };
          }

          // ── Data tools (org-scoped via RLS + mcp_reader role) ─────────────────

          case "get_sample_data": {
            const table = String(args?.table ?? "").replace(/[^a-z0-9_]/gi, "");
            if (!table) {
              return {
                content: [{ type: "text", text: "Error: table name is required" }],
                isError: true,
              };
            }
            const limit = Math.min(Number(args?.limit ?? 10) || 10, 20);
            const { rowCount, rows } = await runOrgScopedQuery(
              `SELECT * FROM "${table}" LIMIT $1`,
              [limit],
              orgId,
            );
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ table, rowCount, rows }, null, 2),
              }],
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  return server;
}

// ── Active sessions ───────────────────────────────────────────────────────────

const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: Server; orgId: number }
>();

// ── MCP transport endpoint ────────────────────────────────────────────────────

router.all("/mcp", async (req: Request, res: Response): Promise<void> => {
  const orgId = await extractAndValidateKey(req, res);
  if (!orgId) return;

  try {
    const incomingId = req.headers["mcp-session-id"] as string | undefined;
    if (incomingId) {
      const session = sessions.get(incomingId);
      if (!session) {
        res.status(404).json({ error: "MCP session not found or expired" });
        return;
      }
      // Verify the authenticated org matches the session's org — prevents one
      // org's key from being used to drive another org's already-open session.
      if (session.orgId !== orgId) {
        res.status(403).json({ error: "API key does not match the session's organisation" });
        return;
      }
      await session.transport.handleRequest(
        req as Parameters<typeof session.transport.handleRequest>[0],
        res as Parameters<typeof session.transport.handleRequest>[1],
        req.body,
      );
      return;
    }

    // New session — orgId captured in the server closure and stored for later validation
    const sessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    const server = createMcpServer(orgId);

    sessions.set(sessionId, { transport, server, orgId });
    transport.onclose = () => sessions.delete(sessionId);

    await server.connect(transport);
    await transport.handleRequest(
      req as Parameters<typeof transport.handleRequest>[0],
      res as Parameters<typeof transport.handleRequest>[1],
      req.body,
    );
  } catch (err: unknown) {
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  }
});

// ── Admin: view MCP connection info for this org ──────────────────────────────

router.get("/admin/mcp-info", async (req: Request, res: Response): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { rows } = await pool.query<{ mcp_key: string | null }>(
    "SELECT mcp_key FROM organizations WHERE id = (SELECT org_id FROM users WHERE id = $1)",
    [admin.id],
  );
  const mcpKey = rows[0]?.mcp_key ?? null;
  const devDomain = process.env["REPLIT_DEV_DOMAIN"] ?? null;
  const mcpUrl = devDomain ? `https://${devDomain}/api/mcp` : null;

  res.json({ mcpKey, mcpUrl });
});

// ── Admin: generate / rotate this org's MCP API key ──────────────────────────

router.post("/admin/mcp-key/generate", async (req: Request, res: Response): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const newKey = randomBytes(32).toString("hex");

  await pool.query(
    `UPDATE organizations
     SET mcp_key = $1
     WHERE id = (SELECT org_id FROM users WHERE id = $2)`,
    [newKey, admin.id],
  );

  const devDomain = process.env["REPLIT_DEV_DOMAIN"] ?? null;
  const mcpUrl = devDomain ? `https://${devDomain}/api/mcp` : null;

  res.json({ mcpKey: newKey, mcpUrl });
});

export default router;
