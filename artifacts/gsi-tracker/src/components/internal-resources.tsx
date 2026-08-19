import { useMemo, useState } from "react";
import {
  useListInternalResources,
  useCreateInternalResource,
  useUpdateInternalResource,
  useDeleteInternalResource,
  getListInternalResourcesQueryKey,
  useListOpportunities,
} from "@workspace/api-client-react";
import { ContactImportDialog } from "@/components/contact-import-dialog";
import type { InternalResource, Note } from "@workspace/api-client-react";
import { NotesEditor } from "@/components/notes-editor";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Users, Mail, Phone, MapPin, CornerDownRight, ChevronDown, ChevronRight, MessageSquare, UserSearch, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const NONE = "__none__";

type ResourceForm = {
  name: string;
  func: string;
  email: string;
  phone: string;
  location: string;
  isManager: boolean;
  managerId: string; // NONE or id string
  notes: Note[];
};

const emptyForm = (): ResourceForm => ({ name: "", func: "", email: "", phone: "", location: "", isManager: false, managerId: NONE, notes: [] });

/** An internal (rep's own company) contact already captured on an opportunity/initiative. */
type OppTeamContact = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  location: string | null;
};

type TreeNode = { resource: InternalResource; children: TreeNode[] };

/**
 * Build a hierarchy: roots are resources without a (valid) manager; reports
 * nest under their manager. Cycle-tolerant: if bad data ever contains a
 * reporting loop, the loop is broken at an arbitrary member (rendered as a
 * root) instead of recursing forever.
 */
function buildTree(resources: InternalResource[]): TreeNode[] {
  const byId = new Map(resources.map((r) => [r.id, r]));

  // Detect nodes stuck in a cycle by walking each manager chain.
  const inCycleBreakers = new Set<number>();
  for (const r of resources) {
    const seen = new Set<number>();
    let cur: InternalResource | undefined = r;
    while (cur && cur.managerId != null && byId.has(cur.managerId)) {
      if (seen.has(cur.id)) { inCycleBreakers.add(cur.id); break; }
      seen.add(cur.id);
      cur = byId.get(cur.managerId);
    }
  }

  const nodeMap = new Map<number, TreeNode>(resources.map((r) => [r.id, { resource: r, children: [] }]));
  const roots: TreeNode[] = [];
  for (const r of resources) {
    const node = nodeMap.get(r.id)!;
    if (r.managerId != null && byId.has(r.managerId) && r.managerId !== r.id && !inCycleBreakers.has(r.id)) {
      nodeMap.get(r.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Managers first among roots, then alphabetical everywhere
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.resource.name.localeCompare(b.resource.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  roots.sort((a, b) => Number(b.resource.isManager) - Number(a.resource.isManager));
  return roots;
}

/** True if candidate is in the reporting chain beneath resource (would create a cycle). */
function isDescendant(resources: InternalResource[], resourceId: number, candidateId: number): boolean {
  const childrenOf = new Map<number, number[]>();
  for (const r of resources) {
    if (r.managerId != null) {
      childrenOf.set(r.managerId, [...(childrenOf.get(r.managerId) ?? []), r.id]);
    }
  }
  const stack = [resourceId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === candidateId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return false;
}

function ResourceRow({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  onEdit: (r: InternalResource) => void;
  onDelete: (id: number) => void;
}) {
  const r = node.resource;
  return (
    <>
      <div
        className="group flex items-center gap-2 py-1.5 pr-2 rounded-md hover:bg-muted/40 transition-colors"
        style={{ paddingLeft: depth === 0 ? 8 : 8 + depth * 22 }}
      >
        {depth > 0 && <CornerDownRight size={11} className="text-muted-foreground/50 flex-shrink-0" />}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">{r.name}</span>
          {r.isManager && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Manager</Badge>}
          {r.func && <span className="text-xs text-muted-foreground">{r.func}</span>}
          {r.email && (
            <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Mail size={10} />{r.email}
            </a>
          )}
          {r.phone && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone size={10} />{r.phone}
            </span>
          )}
          {r.location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={10} />{r.location}
            </span>
          )}
          {Array.isArray(r.notes) && r.notes.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground" title={r.notes.map((n) => n.text).join("\n")}>
              <MessageSquare size={10} />{r.notes.length}
            </span>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(r)}><Pencil size={11} /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(r.id)}><Trash2 size={11} /></Button>
        </div>
      </div>
      {node.children.map((c) => (
        <ResourceRow key={c.resource.id} node={c} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

/**
 * Internal people resources for the rep's own company, shown at the top of the
 * Partners page. Supports function, contact info, an "is manager" flag, and a
 * manager assignment that renders the list as a reporting hierarchy.
 */
export function InternalResources() {
  const { data: resources = [], isLoading } = useListInternalResources();
  const { data: allOpps = [] } = useListOpportunities({});
  const createResource = useCreateInternalResource();
  const updateResource = useUpdateInternalResource();
  const deleteResource = useDeleteInternalResource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ResourceForm>(emptyForm());

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });

  const tree = useMemo(() => buildTree(resources), [resources]);
  const managers = useMemo(
    () =>
      resources
        .filter((r) => r.isManager && r.id !== editId && !(editId != null && isDescendant(resources, editId, r.id)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [resources, editId]
  );

  // Internal (rep's own company) contacts already captured on opportunities/initiatives,
  // deduped by name+email, offered as prefill in the add dialog.
  const oppContacts = useMemo<OppTeamContact[]>(() => {
    const map = new Map<string, OppTeamContact>();
    for (const o of allOpps as any[]) {
      const contacts = Array.isArray(o.contacts) ? o.contacts : [];
      for (const c of contacts) {
        if (!c?.name || c.org !== "HPE") continue;
        const key = `${c.name.trim().toLowerCase()}|${(c.email || "").trim().toLowerCase()}`;
        const existing = map.get(key);
        if (existing) {
          // Fill any gaps from other opportunities' copies of the same person
          existing.email = existing.email || c.email || null;
          existing.phone = existing.phone || c.phone || null;
          existing.role = existing.role || c.role || null;
          existing.location = existing.location || c.location || null;
        } else {
          map.set(key, { key, name: c.name, email: c.email || null, phone: c.phone || null, role: c.role || null, location: c.location || null });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allOpps]);

  const [pickedContact, setPickedContact] = useState<string>(NONE);

  const applyContact = (key: string) => {
    setPickedContact(key);
    if (key === NONE) return;
    const c = oppContacts.find((x) => x.key === key);
    if (!c) return;
    setForm((f) => ({
      ...f,
      name: c.name,
      func: f.func || c.role || "",
      email: f.email || c.email || "",
      phone: f.phone || c.phone || "",
      location: f.location || c.location || "",
    }));
  };

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setPickedContact(NONE); setDialogOpen(true); };
  const openEdit = (r: InternalResource) => {
    setEditId(r.id);
    setForm({
      name: r.name,
      func: r.func ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      location: r.location ?? "",
      isManager: r.isManager,
      managerId: r.managerId != null ? String(r.managerId) : NONE,
      notes: Array.isArray(r.notes) ? r.notes : [],
    });
    setPickedContact(NONE);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: `"${email}" doesn't look like a valid email address. Fix it or clear the field.`,
        variant: "destructive",
      });
      return;
    }
    const data = {
      name: form.name.trim(),
      func: form.func.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
      isManager: form.isManager,
      managerId: form.managerId === NONE ? null : Number(form.managerId),
      notes: form.notes,
    };
    try {
      if (editId) {
        await updateResource.mutateAsync({ id: editId, data });
      } else {
        await createResource.mutateAsync({ data });
      }
    } catch (err: any) {
      toast({
        title: editId ? "Could not save changes" : "Could not add person",
        description: err?.response?.data?.error || err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      return;
    }
    invalidate();
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteResource.mutateAsync({ id: deleteId });
    invalidate();
    setDeleteId(null);
  };

  const saving = createResource.isPending || updateResource.isPending;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <Users size={15} className="text-muted-foreground" />
          Internal Resources
          <span className="text-xs font-normal text-muted-foreground">
            {resources.length} {resources.length === 1 ? "person" : "people"}
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload size={12} />Import
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={openCreate}>
            <Plus size={12} />Add person
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-border px-2 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-16"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : resources.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No internal resources yet — add the people at your company who support these partnerships
            </p>
          ) : (
            <div className={cn("space-y-0.5")}>
              {tree.map((n) => (
                <ResourceRow key={n.resource.id} node={n} depth={0} onEdit={openEdit} onDelete={setDeleteId} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-size-key="internal-resource-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Internal Resource" : "Add Internal Resource"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-4 mt-2">
            {!editId && oppContacts.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserSearch size={13} />Start from an opportunity contact
                </Label>
                <Select value={pickedContact} onValueChange={applyContact}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an existing contact…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-muted-foreground">Start blank</SelectItem>
                    {oppContacts.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.name}{c.role ? ` · ${c.role}` : ""}{c.email ? ` · ${c.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Prefills details already captured on an opportunity or initiative — you can still edit everything below.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Function</Label>
              <Input value={form.func} onChange={(e) => setForm({ ...form, func: e.target.value })} placeholder="e.g. Solutions Architect, Legal, Deal Desk" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. London, NY, India" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-manager"
                checked={form.isManager}
                onCheckedChange={(checked) => setForm({ ...form, isManager: !!checked })}
              />
              <Label htmlFor="is-manager" className="cursor-pointer">Is manager</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Select value={form.managerId} onValueChange={(v) => setForm({ ...form, managerId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="No manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-muted-foreground">No manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}{m.func ? ` · ${m.func}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {managers.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Mark someone as manager first to assign them as a manager here.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MessageSquare size={13} className="text-muted-foreground" />Notes
              </Label>
              <NotesEditor
                notes={form.notes}
                onChange={(notes) => setForm((f) => ({ ...f, notes }))}
                placeholder="Add a note about this person…"
                compact
                reminder={editId != null ? { entityType: "internal_resource", entityId: String(editId), entityLabel: form.name.trim() || "Internal resource" } : null}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : (editId ? "Save" : "Add person")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete internal resource?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone reporting to this person will simply have no manager afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContactImportDialog
        mode="internal"
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}
