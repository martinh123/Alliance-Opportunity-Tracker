import { pool } from "@workspace/db";

/**
 * Tables included in a full backup, ordered parent -> child so that a restore
 * can insert rows without violating foreign keys. Delete/truncate uses CASCADE,
 * so reverse ordering is not required.
 */
const TABLES = [
  "users",
  "profiles",
  "partners",
  "opportunities",
  "meddpicc_entries",
  "meddpicc_section_meta",
  "company_research",
] as const;

export interface BackupPayload {
  version?: string;
  exportedAt?: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Coerce a JSON-parsed value into a parameter safe for a parameterized INSERT.
 * Arrays and plain objects correspond to jsonb columns and must be serialized,
 * otherwise node-pg would treat a JS array as a Postgres array literal. All
 * other scalar values (including ISO timestamp/date strings) pass through.
 */
function coerceParam(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

/** Export every row from every backed-up table. */
export async function exportAll(): Promise<BackupPayload> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM ${t} ORDER BY id ASC`);
    tables[t] = rows;
  }
  return { version: "1", exportedAt: new Date().toISOString(), tables };
}

/**
 * Replace the entire database with the contents of a backup. Runs in a single
 * transaction: truncate everything, re-insert rows preserving their ids, then
 * fix each serial sequence so future inserts don't collide with restored ids.
 */
export async function importAll(payload: BackupPayload): Promise<Record<string, number>> {
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("BEGIN");

    // Whitelist the real columns of each table so identifiers used to build the
    // INSERT statements can never come from untrusted backup JSON keys. Any
    // unknown column aborts the whole transaction (no partial restore).
    const colMeta = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TABLES as unknown as string[]],
    );
    const allowedColumns: Record<string, Set<string>> = {};
    for (const t of TABLES) allowedColumns[t] = new Set();
    for (const r of colMeta.rows) allowedColumns[r.table_name]?.add(r.column_name);

    await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const t of TABLES) {
      const rows = payload.tables[t] ?? [];
      const allowed = allowedColumns[t];
      counts[t] = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        for (const c of cols) {
          if (!allowed.has(c)) {
            throw new Error(`Unknown column "${c}" for table "${t}"`);
          }
        }
        const params = cols.map((c) => coerceParam((row as Record<string, unknown>)[c]));
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const colList = cols.map((c) => `"${c}"`).join(", ");
        await client.query(`INSERT INTO ${t} (${colList}) VALUES (${placeholders})`, params);
        counts[t]++;
      }
      // Re-sync the id sequence: if the table has rows, set to MAX(id) and mark
      // called (next nextval = MAX+1); if empty, set to 1 and not-called.
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence($1, 'id'),
           GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1),
           (SELECT COUNT(*) FROM ${t}) > 0
         )`,
        [t],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return counts;
}

/**
 * Delete all user-entered data while preserving the admin account so the app
 * stays usable. Deleting partners cascades to opportunities and all of their
 * MEDDPICC children; deleting non-admin users cascades to their profiles. The
 * admin's profile settings are reset to defaults.
 */
export async function clearAll(adminEmail: string): Promise<Record<string, number>> {
  const client = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("BEGIN");

    const partners = await client.query("DELETE FROM partners");
    const users = await client.query("DELETE FROM users WHERE lower(email) <> lower($1)", [adminEmail]);

    await client.query(
      `UPDATE profiles SET
         revenue_metric = 'ACV',
         fiscal_year_start = '1',
         fiscal_year_end = '12',
         quota = NULL,
         q1_goal_pct = '25',
         q2_goal_pct = '25',
         q3_goal_pct = '25',
         q4_goal_pct = '25'
       WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower($1))`,
      [adminEmail],
    );

    await client.query("COMMIT");

    counts.partnersDeleted = partners.rowCount ?? 0;
    counts.usersDeleted = users.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return counts;
}
