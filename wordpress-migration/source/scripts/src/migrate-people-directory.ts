import pg from "pg";

/**
 * One-time, idempotent people-directory migration (Task: central people directory).
 *
 * 1. Seeds internal_resources from opportunity contacts with org "HPE".
 * 2. Seeds partner_resources from opportunity contacts with org "Partner"
 *    (attributed to the opportunity's partner), from partners' legacy
 *    free-text contact_name/contact_email fields, and from opportunities'
 *    legacy free-text partner_contact / partner_contact_role fields.
 * 3. Backfills contacts[].directoryRef (internal:<id> / partner:<id>) wherever
 *    a contact matches a directory row by normalized name+email.
 * 4. Backfills partners.primary_contact_id from the legacy contact fields.
 *
 * Dedupe key everywhere: lower(trim(name)) + "|" + lower(trim(email ?? "")).
 * Safe to re-run: existing directory rows are reused, refs only set when missing.
 */

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const key = (name: string | null | undefined, email: string | null | undefined) => `${norm(name)}|${norm(email)}`;

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const internals = (await client.query(`SELECT id, name, email FROM internal_resources`)).rows;
    const partnersRes = (await client.query(`SELECT id, partner_id, name, email FROM partner_resources`)).rows;
    const partners = (await client.query(`SELECT id, name, contact_name, contact_email, primary_contact_id FROM partners`)).rows;
    const opps = (await client.query(`SELECT id, partner_id, contacts, partner_contact, partner_contact_role FROM opportunities`)).rows;

    const internalByKey = new Map<string, number>(internals.map((r) => [key(r.name, r.email), r.id]));
    const partnerByKey = new Map<string, number>(partnersRes.map((r) => [`${r.partner_id}:${key(r.name, r.email)}`, r.id]));

    let createdInternal = 0, createdPartner = 0, linked = 0;

    const ensureInternal = async (c: { name: string; role?: string | null; email?: string | null; phone?: string | null }) => {
      const k = key(c.name, c.email);
      let id = internalByKey.get(k);
      if (id == null) {
        const r = await client.query(
          `INSERT INTO internal_resources (name, function, email, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
          [c.name.trim(), c.role || null, c.email || null, c.phone || null]
        );
        id = r.rows[0].id as number;
        internalByKey.set(k, id);
        createdInternal++;
      }
      return id;
    };

    const ensurePartner = async (partnerId: number, c: { name: string; role?: string | null; email?: string | null; phone?: string | null }) => {
      const k = `${partnerId}:${key(c.name, c.email)}`;
      let id = partnerByKey.get(k);
      if (id == null) {
        const r = await client.query(
          `INSERT INTO partner_resources (partner_id, name, function, email, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [partnerId, c.name.trim(), c.role || null, c.email || null, c.phone || null]
        );
        id = r.rows[0].id as number;
        partnerByKey.set(k, id);
        if (c.email) partnerByEmail.set(`${partnerId}:${norm(c.email)}`, id);
        createdPartner++;
      }
      return id;
    };

    // Match an existing partner resource by email alone (for legacy fields that
    // stored an email in a name slot, or emails without a matching name).
    const partnerByEmail = new Map<string, number>();
    for (const r of partnersRes) {
      if (r.email) partnerByEmail.set(`${r.partner_id}:${norm(r.email)}`, r.id);
    }

    const looksLikeEmail = (s: string) => /\S+@\S+\.\S+/.test(s);

    // Legacy free-text partner contact fields → partner_resources + primary contact
    let primariesSet = 0;
    for (const p of partners) {
      if (p.contact_name && String(p.contact_name).trim()) {
        const id = await ensurePartner(p.id, { name: String(p.contact_name), email: p.contact_email || null });
        if (p.primary_contact_id == null) {
          await client.query(`UPDATE partners SET primary_contact_id = $1 WHERE id = $2`, [id, p.id]);
          primariesSet++;
        }
      }
    }

    // Legacy per-opportunity free-text partner contact → partner_resources
    for (const o of opps) {
      const raw = (o.partner_contact ?? "").trim();
      if (!raw || o.partner_id == null) continue;
      const email = looksLikeEmail(raw) ? raw : null;
      // Reuse an existing row when the email already exists for this partner.
      if (email && partnerByEmail.has(`${o.partner_id}:${norm(email)}`)) continue;
      const id = await ensurePartner(o.partner_id, { name: raw, role: o.partner_contact_role || null, email });
      if (email) partnerByEmail.set(`${o.partner_id}:${norm(email)}`, id);
    }

    // Opportunity contacts → directories + directoryRef backfill
    for (const o of opps) {
      const contacts: any[] = Array.isArray(o.contacts) ? o.contacts : [];
      if (contacts.length === 0) continue;
      let changed = false;
      for (const c of contacts) {
        if (!c?.name || !String(c.name).trim()) continue;
        if (c.directoryRef) continue;
        if (c.org === "HPE") {
          const id = await ensureInternal(c);
          c.directoryRef = `internal:${id}`;
          changed = true; linked++;
        } else if (c.org === "Partner" && o.partner_id != null) {
          const id = await ensurePartner(o.partner_id, c);
          c.directoryRef = `partner:${id}`;
          changed = true; linked++;
        }
      }
      if (changed) {
        await client.query(`UPDATE opportunities SET contacts = $1::jsonb WHERE id = $2`, [JSON.stringify(contacts), o.id]);
      }
    }

    await client.query("COMMIT");
    console.log(`Done. Created ${createdInternal} internal resource(s), ${createdPartner} partner resource(s); linked ${linked} contact(s) via directoryRef; set ${primariesSet} partner primary contact(s).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
