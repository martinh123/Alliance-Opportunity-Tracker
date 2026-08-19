---
name: DB seeding
description: How to seed the database in this project
---

Use the raw pg CommonJS client (not ESM import) to seed:

```js
const pg = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
```

Password must be hashed with scrypt (node:crypto), not bcrypt.

Admin credentials: madgh411@gmail.com / Mart08812!in (stored as scrypt hash).

Run via: `node -e "..."` from /home/runner/workspace.
