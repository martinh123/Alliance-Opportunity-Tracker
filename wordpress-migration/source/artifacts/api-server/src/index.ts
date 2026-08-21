import app from "./app";
import { logger } from "./lib/logger";
import { checkMcpDbObjects } from "./routes/mcp";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Verify required MCP DB objects (mcp_reader role, RLS policies, helper functions)
// exist BEFORE accepting any traffic.  Missing objects mean the migration hasn't
// run; post-merge.sh applies lib/db/migrations/0001_mcp_rls.sql automatically.
// Fail hard here so a misconfigured deploy is immediately visible rather than
// silently serving cross-tenant MCP data.
checkMcpDbObjects()
  .then(() => {
    logger.info("MCP DB objects verified");

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err: unknown) => {
    logger.fatal(
      { err },
      "MCP DB objects check failed — run lib/db/migrations/0001_mcp_rls.sql and restart. " +
      "Server will not start until the required role, RLS policies, and functions exist.",
    );
    process.exit(1);
  });
