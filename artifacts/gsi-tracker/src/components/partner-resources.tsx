import { useMemo, useState } from "react";
import {
  useListPartnerResources,
  useCreatePartnerResource,
  useUpdatePartnerResource,
  useDeletePartnerResource,
  getListPartnerResourcesQueryKey,
} from "@workspace/api-client-react";
import { ContactImportDialog } from "@/components/contact-import-dialog";
import type { PartnerResource, Note, PersonSearchResult } from "@workspace/api-client-react";
import { NotesEditor } from "@/components/notes-editor";
import { PersonTypeahead } from "@/components/person-typeahead";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Users, Mail, Phone, MapPin, CornerDownRight, ChevronDown, ChevronRight, MessageSquare, Upload } from "lucide-react";
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

type TreeNode = { resource: PartnerResource; children: TreeNode[] };

/** Cycle-tolerant reporting hierarchy (same rules as internal resources). */
function buildTree(resources: PartnerResource[]): TreeNode[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const inCycleBreakers = new Set<number>();
  for (const r of resources) {
    const seen = new Set<number>();
    let cur: PartnerResource | undefined = r;
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
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.resource.name.localeCompare(b.resource.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  roots.sort((a, b) => Number(b.resource.isManager) - Number(a.resource.isManager));
  return roots;
}

/** True if candidate is beneath resource in the reporting chain (cycle guard). */
function isDescendant(resources: PartnerResource[], resourceId: number, candidateId: number): boolean {
  const childrenOf = new Map<number, number[]>();
  for (const r of resources) {
    if (r.managerId != null) childrenOf.set(r.managerId, [...(childrenOf.get(r.managerId) ?? []), r.id]);
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
  onEdit: (r: PartnerResource) => void;
  onDelete: (id: number) => void;
}) {
  const r = node.resource;
  return (
    <>
      <div
        className="group flex items-center gap-2 py-1 pr-1 rounded-md hover:bg-muted/40 transition-colors"
        style={{ paddingLeft: depth === 0 ? 4 : 4 + depth * 18 }}
      >
        {depth > 0 && <CornerDownRight size={11} className="text-muted-foreground/50 flex-shrink-0" />}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
          <span className="text-xs font-medium text-foreground">{r.name}</span>
          {r.isManager && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Manager</Badge>}
          {r.func && <span className="text-[11px] text-muted-foreground">{r.func}</span>}
          {r.email && (
            <a href={`mailto:${r.email}`} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Mail size={10} />{r.email}
            </a>
          )}
          {r.phone && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone size={10} />{r.phone}
            </span>
          )}
          {r.location && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin size={10} />{r.location}
            </span>
          )}
          {Array.isArray(r.notes) && r.notes.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={r.notes.map((n) => n.text).join("\n")}>
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
 * People directory for a single GSI partner, shown inside that partner's card.
 * Same UX as InternalResources: reporting hierarchy, manager flag, notes.
 * The add dialog's name field is a directory typeahead so an existing person
 * (e.g. an opportunity contact) can prefill the form.
 */
export function PartnerResources({ partnerId, partnerName }: { partnerId: number; partnerName: string }) {
  const params = { partnerId };
  const { data: resources = [], isLoading } = useListPartnerResources(params, {
    query: { queryKey: getListPartnerResourcesQueryKey(params) },
  });
  const createResource = useCreatePartnerResource();
  const updateResource = useUpdatePartnerResource();
  const deleteResource = useDeletePartnerResource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [collapsed, setCollapsed] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ResourceForm>(emptyForm());

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey(params) });

  const tree = useMemo(() => buildTree(resources), [resources]);
  const managers = useMemo(
    () =>
      resources
        .filter((r) => r.isManager && r.id !== editId && !(editId != null && isDescendant(resources, editId, r.id)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [resources, editId]
  );

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (r: PartnerResource) => {
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
    setDialogOpen(true);
  };

  // Picking a person from the directory prefills the form fields.
  const applyPicked = (p: PersonSearchResult) => {
    setForm((f) => ({
      ...f,
      name: p.name,
      func: f.func || p.role || "",
      email: f.email || p.email || "",
      phone: f.phone || p.phone || "",
      location: f.location || p.location || "",
    }));
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
        await createResource.mutateAsync({ data: { ...data, partnerId } });
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
    <div className="border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <Users size={12} className="text-muted-foreground" />
          People
          <span className="text-[11px] font-normal text-muted-foreground">
            {resources.length}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => setImportOpen(true)}>
            <Upload size={11} />Import
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={openCreate}>
            <Plus size={11} />Add
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="pt-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center h-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : resources.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">
              No people yet — add your contacts at {partnerName}
            </p>
          ) : (
            <div className="space-y-0">
              {tree.map((n) => (
                <ResourceRow key={n.resource.id} node={n} depth={0} onEdit={openEdit} onDelete={setDeleteId} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-size-key="partner-person-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? `Edit person at ${partnerName}` : `Add person at ${partnerName}`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              {editId ? (
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Smith" />
              ) : (
                <PersonTypeahead
                  value={form.name}
                  onChange={(name) => setForm((f) => ({ ...f, name }))}
                  onPick={applyPicked}
                  onAddNew={(name) => setForm((f) => ({ ...f, name }))}
                  addNewLabel={`Add "${form.name.trim()}" as a new person at ${partnerName}`}
                  partnerId={partnerId}
                  placeholder="Type a name — matches from your directories prefill the form"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Function</Label>
              <Input value={form.func} onChange={(e) => setForm({ ...form, func: e.target.value })} placeholder="e.g. Alliance Lead, Practice Head" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@partner.com" />
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
                id={`pr-is-manager-${partnerId}`}
                checked={form.isManager}
                onCheckedChange={(checked) => setForm({ ...form, isManager: !!checked })}
              />
              <Label htmlFor={`pr-is-manager-${partnerId}`} className="cursor-pointer">Is manager</Label>
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
                reminder={editId != null ? { entityType: "partner_resource", entityId: String(editId), entityLabel: `${form.name.trim() || "Person"} (${partnerName})` } : null}
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
            <AlertDialogTitle>Delete person?</AlertDialogTitle>
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
        mode="partner"
        partnerId={partnerId}
        partnerName={partnerName}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}
