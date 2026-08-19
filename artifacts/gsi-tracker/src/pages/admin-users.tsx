import { useState, useRef, useEffect } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useOrgImport,
  orgExport,
  getListUsersQueryKey,
  type OrgExportBundle,
  type OrgImportResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Pencil, Trash2, Users, Download, Upload, Database, AlertTriangle, Terminal, Copy, Check, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UserForm = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "rep";
  quota: string;
  region: string;
};

const emptyForm = (): UserForm => ({
  email: "", password: "", name: "", role: "rep", quota: "", region: "",
});

export default function AdminUsers() {
  const { data: users = [], isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());

  // MCP connection info (per-org key)
  const [mcpInfo, setMcpInfo] = useState<{ mcpKey: string | null; mcpUrl: string | null } | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpGenerating, setMcpGenerating] = useState(false);
  const [copied, setCopied] = useState<"url" | "key" | null>(null);

  useEffect(() => {
    fetch("/api/admin/mcp-info", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setMcpInfo(data); })
      .catch(() => {})
      .finally(() => setMcpLoading(false));
  }, []);

  const handleGenerateMcpKey = async () => {
    setMcpGenerating(true);
    try {
      const r = await fetch("/api/admin/mcp-key/generate", { method: "POST", credentials: "include" });
      if (r.ok) setMcpInfo(await r.json());
      else toast({ title: "Failed to generate key", variant: "destructive" });
    } catch {
      toast({ title: "Failed to generate key", variant: "destructive" });
    } finally {
      setMcpGenerating(false);
    }
  };

  const copyToClipboard = (text: string, field: "url" | "key") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Export / import state
  const importFileRef = useRef<HTMLInputElement>(null);
  const orgImport = useOrgImport();
  const [exporting, setExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ bundle: OrgExportBundle; preview: OrgImportResult } | null>(null);
  const [importing, setImporting] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await orgExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      a.href = url;
      a.download = `gsi-org-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const counts = Object.values(data.data ?? {}).map((arr: any) => arr?.length ?? 0);
      const total = counts.reduce((s: number, n: number) => s + n, 0);
      toast({ title: "Export complete", description: `Downloaded ${total} records across ${data.org?.name ?? "your org"}.` });
    } catch {
      toast({ title: "Export failed", description: "Could not export org data.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let bundle: OrgExportBundle;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.version !== "2" || !parsed.data) throw new Error("not v2");
      bundle = parsed as OrgExportBundle;
    } catch {
      toast({ title: "Invalid file", description: "Select a valid org export file (version 2).", variant: "destructive" });
      return;
    }
    try {
      const preview = await orgImport.mutateAsync({ data: bundle, params: { dryRun: "true" } });
      setImportPreview({ bundle, preview });
    } catch {
      toast({ title: "Preview failed", description: "Could not read the export file.", variant: "destructive" });
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await orgImport.mutateAsync({ data: importPreview.bundle, params: { dryRun: "false" } });
      setImportPreview(null);
      queryClient.clear();
      const total = Object.values(result.counts ?? {}).reduce((s, n) => s + n, 0);
      toast({ title: "Import complete", description: `${total} records imported successfully.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.response?.data?.error ?? "Could not complete the import.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (u: any) => {
    setEditId(u.id);
    setForm({ email: u.email, password: "", name: u.name, role: u.role, quota: u.quota ? String(u.quota) : "", region: u.region || "" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      name: form.name,
      role: form.role,
      quota: form.quota ? Number(form.quota) : null,
      region: form.region || null,
    };
    if (editId) {
      if (form.password) data.password = form.password;
      await updateUser.mutateAsync({ id: editId, data });
    } else {
      data.email = form.email;
      data.password = form.password;
      await createUser.mutateAsync({ data });
    }
    invalidate();
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteUser.mutateAsync({ id: deleteId });
    invalidate();
    setDeleteId(null);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and access</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={15} className="mr-2" />Add user
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">No users yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Region</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quota</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.region || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.quota != null ? `$${Number(u.quota).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-size-key="admin-user-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {!editId && (
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@company.com" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>{editId ? "New password (leave blank to keep)" : "Password"}</Label>
              <Input type="password" required={!editId} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rep">Rep</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Americas" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quota ($)</Label>
              <Input type="number" min="0" value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })} placeholder="e.g. 5000000" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {(createUser.isPending || updateUser.isPending) ? <Loader2 size={15} className="animate-spin" /> : (editId ? "Save" : "Create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Data export / import ─────────────────────────────────────────── */}
      <Card className="mt-10 border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database size={16} className="text-muted-foreground" />
            Data Export &amp; Import
          </CardTitle>
          <CardDescription className="text-xs">
            Export your organisation's complete data as a portable JSON file, or re-import a previous export.
            All relationships (partners → opportunities → contacts → MEDDPICC) are preserved during import.
            Import is additive — it does not delete existing records.
            Exported files contain sensitive information — store them securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Export */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Export data</p>
              <p className="text-xs text-muted-foreground">
                Download all your org's data — users, partners, opportunities, MEDDPICC, contacts, and reminders.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={handleExport} disabled={exporting} className="shrink-0">
              {exporting ? <><Loader2 size={15} className="animate-spin mr-2" />Exporting…</> : <><Download size={15} className="mr-2" />Export</>}
            </Button>
          </div>

          {/* Import */}
          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Import data</p>
              <p className="text-xs text-muted-foreground">
                Restore from an org export file. Shows a preview before committing — safe to cancel.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => importFileRef.current?.click()}
              disabled={orgImport.isPending || importing}
              className="shrink-0"
            >
              {orgImport.isPending ? <><Loader2 size={15} className="animate-spin mr-2" />Previewing…</> : <><Upload size={15} className="mr-2" />Import</>}
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFileSelected}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Developer Access (MCP) ────────────────────────────────────────── */}
      <Card className="mt-6 border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal size={16} className="text-muted-foreground" />
            Developer Access (MCP)
          </CardTitle>
          <CardDescription className="text-xs">
            Connect Claude or other AI tools directly to this app's live database via the Model Context Protocol.
            The API key grants read-only access — no writes are permitted.
            Store it securely. Use the "Regenerate" button below to rotate it at any time — the old key stops working immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mcpLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />Loading…
            </div>
          ) : (
            <>
              {/* MCP URL */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Terminal size={12} />MCP Endpoint URL
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate border border-border">
                    {mcpInfo?.mcpUrl ?? "unavailable — REPLIT_DEV_DOMAIN not set"}
                  </code>
                  {mcpInfo?.mcpUrl && (
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => copyToClipboard(mcpInfo.mcpUrl!, "url")}>
                      {copied === "url" ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                    </Button>
                  )}
                </div>
              </div>

              {/* Per-org API key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Key size={12} />API Key (scoped to your organisation)
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={handleGenerateMcpKey} disabled={mcpGenerating}>
                    {mcpGenerating
                      ? <><Loader2 size={12} className="animate-spin" />Generating…</>
                      : mcpInfo?.mcpKey ? "Regenerate" : "Generate key"}
                  </Button>
                </div>
                {mcpInfo?.mcpKey ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate border border-border">
                      {`${mcpInfo.mcpKey.slice(0, 8)}${"•".repeat(24)}${mcpInfo.mcpKey.slice(-8)}`}
                    </code>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => copyToClipboard(mcpInfo.mcpKey!, "key")}>
                      {copied === "key" ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No key yet — click "Generate key" to create one for your organisation.
                  </p>
                )}
              </div>

              {/* Usage instructions */}
              <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">How to connect Claude</p>
                <p>1. Generate a key above, then copy both the URL and key.</p>
                <p>2. In Claude Desktop → Settings → Developer → MCP Servers, add a new server.</p>
                <p>3. Set the URL to the endpoint above and the Authorization header to <code className="font-mono bg-muted px-1 rounded">Bearer &lt;key&gt;</code>.</p>
                <p>4. Claude will have access to <code className="font-mono bg-muted px-1 rounded">list_tables</code>, <code className="font-mono bg-muted px-1 rounded">get_schema</code>, <code className="font-mono bg-muted px-1 rounded">get_sample_data</code>, and <code className="font-mono bg-muted px-1 rounded">get_api_spec</code> — all read-only and scoped to your organisation's data.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import preview dialog */}
      <Dialog open={!!importPreview} onOpenChange={(o) => { if (!o) setImportPreview(null); }}>
        <DialogContent data-size-key="org-import-preview" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              Review before importing
            </DialogTitle>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-4 mt-1">
              <p className="text-sm text-muted-foreground">
                From org <span className="font-semibold text-foreground">{importPreview.bundle.org?.name ?? "Unknown"}</span>,
                exported {importPreview.bundle.exportedAt ? new Date(importPreview.bundle.exportedAt).toLocaleString() : "unknown time"}.
                These records will be <span className="font-semibold text-foreground">added</span> to your current data.
              </p>

              {importPreview.preview.warnings && importPreview.preview.warnings.length > 0 && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
                  {importPreview.preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />{w}
                    </p>
                  ))}
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/20 divide-y divide-border text-sm">
                {Object.entries(importPreview.preview.preview ?? {}).map(([key, count]) => (
                  count > 0 && (
                    <div key={key} className="flex items-center justify-between px-3 py-2">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                  )
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirmImport} disabled={importing}>
                  {importing ? <><Loader2 size={14} className="animate-spin mr-1.5" />Importing…</> : "Confirm import"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
