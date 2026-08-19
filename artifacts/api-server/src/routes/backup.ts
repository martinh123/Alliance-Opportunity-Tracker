import { Router, type IRouter } from "express";
import { ImportBackupBody } from "@workspace/api-zod";
import { requireAdmin } from "../lib/requireAdmin";
import { exportAll, importAll, clearAll, type BackupPayload } from "../lib/backup";

const router: IRouter = Router();

router.get("/backup/export", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const data = await exportAll();
  res.json(data);
});

router.post("/backup/import", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const parsed = ImportBackupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const payload = parsed.data as BackupPayload;
  const users = (payload.tables?.users ?? []) as Array<{ role?: string }>;
  // Refuse a restore that would leave no admin account — that would lock everyone
  // out. This also covers an empty or omitted users array.
  if (!users.some((u) => u && u.role === "admin")) {
    res.status(400).json({ error: "Backup must contain at least one admin account — refusing to import to avoid lockout." });
    return;
  }

  try {
    const counts = await importAll(payload);
    res.json({ ok: true, message: "Backup restored.", counts });
  } catch (err) {
    req.log.error({ err }, "Backup import failed");
    res.status(400).json({ error: "Could not restore backup. The file may be invalid or incompatible." });
  }
});

router.post("/backup/clear", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const counts = await clearAll(admin.email);
  res.json({ ok: true, message: "All data cleared. Admin account preserved.", counts });
});

export default router;
