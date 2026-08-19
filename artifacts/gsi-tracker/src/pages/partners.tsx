import { useState } from "react";
import {
  useListPartners,
  useCreatePartner,
  useUpdatePartner,
  useDeletePartner,
  getListPartnersQueryKey,
  useCreatePartnerResource,
  useListPartnerResources,
  getListPartnerResourcesQueryKey,
  useSearchPartnerMacro,
} from "@workspace/api-client-react";
import type { Note } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Handshake, Search, MessageSquare } from "lucide-react";
import { NotesEditor } from "@/components/notes-editor";
import { NoteText, parseNoteText } from "@/components/note-text";
import { MacroSearchBox } from "@/components/macro-search";
import { InternalResources } from "@/components/internal-resources";
import { RemindersList } from "@/components/reminders-list";
import { PartnerResources } from "@/components/partner-resources";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function fmtTarget(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

type PartnerForm = {
  name: string;
  tier: string;
  region: string;
  primaryContactId: number | null;
  newContactName: string;
  newContactEmail: string;
  notes: Note[];
  revenueTarget: string;
};

const emptyForm = (): PartnerForm => ({
  name: "", tier: "", region: "", primaryContactId: null, newContactName: "", newContactEmail: "", notes: [], revenueTarget: "",
});

/** Locally-built suggested macro-search context — no AI call involved. */
function buildPartnerMacroSuggestion(form: PartnerForm): string {
  const name = form.name.trim() || "this partner";
  const parts = [
    `Latest financial results, market sentiment, senior leadership changes, major divisions, and strategic initiatives for ${name}`,
  ];
  if (form.tier.trim()) parts.push(`a ${form.tier.trim()}-tier alliance partner`);
  if (form.region.trim()) parts.push(`with focus on the ${form.region.trim()} region`);
  return parts.join(", ") + ". Include recent partnership and alliance news relevant to enterprise IT.";
}

/** Card line resolving the partner's primary contact from its people directory. */
function PrimaryContactLine({ partner }: { partner: any }) {
  const params = { partnerId: partner.id };
  const { data: resources = [] } = useListPartnerResources(params, {
    query: { queryKey: getListPartnerResourcesQueryKey(params), enabled: partner.primaryContactId != null },
  });
  if (partner.primaryContactId != null) {
    const r = resources.find((x: any) => x.id === partner.primaryContactId);
    if (!r) return null;
    return (
      <>
        <div><span className="text-foreground/70">Contact: </span>{r.name}{r.func ? ` — ${r.func}` : ""}</div>
        {r.email && <div><span className="text-foreground/70">Email: </span>{r.email}</div>}
      </>
    );
  }
  // Legacy free-text fields, shown read-only until a primary contact is set
  if (!partner.contactName && !partner.contactEmail) return null;
  return (
    <>
      {partner.contactName && <div><span className="text-foreground/70">Contact (legacy): </span>{partner.contactName}</div>}
      {partner.contactEmail && <div><span className="text-foreground/70">Email (legacy): </span>{partner.contactEmail}</div>}
    </>
  );
}

export default function Partners() {
  const { data: partners = [], isLoading } = useListPartners();
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const deletePartner = useDeletePartner();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Partner whose notes are shown in the read-only "More" popup
  const [notesViewId, setNotesViewId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm());
  const createPartnerResource = useCreatePartnerResource();
  // Legacy free-text contact fields of the partner being edited (read-only display)
  const [legacyContact, setLegacyContact] = useState<{ name: string; email: string }>({ name: "", email: "" });
  // Partner resources for the edit dialog's primary-contact select
  const editResourceParams = { partnerId: editId ?? 0 };
  const { data: editResources = [] } = useListPartnerResources(editResourceParams, {
    query: { queryKey: getListPartnerResourcesQueryKey(editResourceParams), enabled: dialogOpen && editId != null },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });

  const filtered = partners.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.region || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.tier || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setLegacyContact({ name: "", email: "" }); setDialogOpen(true); };
  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, tier: p.tier || "", region: p.region || "", primaryContactId: p.primaryContactId ?? null, newContactName: "", newContactEmail: "", notes: Array.isArray(p.notes) ? p.notes : [], revenueTarget: p.revenueTarget != null ? String(p.revenueTarget) : "" });
    setLegacyContact({ name: p.contactName || "", email: p.contactEmail || "" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: form.name,
      tier: form.tier || null,
      region: form.region || null,
      notes: form.notes,
      revenueTarget: form.revenueTarget.trim() ? Number(form.revenueTarget) : null,
      // Only sent on edit; create rejects it (a new partner has no people yet)
      ...(editId ? { primaryContactId: form.primaryContactId } : {}),
    };
    let partnerId = editId;
    if (editId) {
      await updatePartner.mutateAsync({ id: editId, data });
    } else {
      const created = await createPartner.mutateAsync({ data });
      partnerId = created.id;
    }
    // "New person" fields: create the partner resource, then point the
    // partner's primary contact at it.
    const newName = form.newContactName.trim();
    if (partnerId != null && newName) {
      const resource = await createPartnerResource.mutateAsync({
        data: { partnerId, name: newName, email: form.newContactEmail.trim() || null },
      });
      await updatePartner.mutateAsync({ id: partnerId, data: { primaryContactId: resource.id } });
      queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId }) });
    }
    invalidate();
    setDialogOpen(false);
  };

  const searchPartnerMacro = useSearchPartnerMacro();

  /**
   * Run the grounded macro web search for the partner in the dialog.
   * In create mode the partner is saved first (so the note has a home),
   * then the dialog switches to edit mode for that partner.
   */
  const runPartnerMacro = async (context: string) => {
    const name = form.name.trim();
    if (!name) throw new Error("Enter a partner name first.");
    let pid = editId;
    if (pid == null) {
      const created = await createPartner.mutateAsync({
        data: {
          name,
          tier: form.tier || null,
          region: form.region || null,
          notes: form.notes,
          revenueTarget: form.revenueTarget.trim() ? Number(form.revenueTarget) : null,
        },
      });
      pid = created.id;
      setEditId(pid);
      invalidate();
    }
    const updated = await searchPartnerMacro.mutateAsync({ id: pid, data: { context } });
    const serverNotes: Note[] = Array.isArray(updated.notes) ? (updated.notes as Note[]) : [];
    const newNote = serverNotes[serverNotes.length - 1];
    if (newNote) {
      setForm((f) => (f.notes.some((n) => n.id === newNote.id) ? f : { ...f, notes: [...f.notes, newNote] }));
    }
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deletePartner.mutateAsync({ id: deleteId });
    invalidate();
    setDeleteId(null);
  };

  return (
    <div className="p-8">
      {/* Internal people resources + reminders — shown side by side above partners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 items-start">
        <InternalResources />
        <RemindersList />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GSI Partners</h1>
          <p className="text-sm text-muted-foreground mt-1">{partners.length} partner{partners.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={15} className="mr-2" />Add partner
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search partners..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Handshake size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">{search ? "No partners match your search" : "No partners yet — add your first GSI partner"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-card border border-card-border rounded-lg p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-foreground">{p.name}</div>
                  {p.tier && <Badge variant="outline" className="mt-1 text-xs">{p.tier}</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {p.revenueTarget != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground/70">Revenue Target: </span>
                    <span className="font-semibold text-foreground">{fmtTarget(Number(p.revenueTarget))}</span>
                    <span className="text-muted-foreground/50">/ yr</span>
                  </div>
                )}
                {p.region && <div><span className="text-foreground/70">Region: </span>{p.region}</div>}
                <PrimaryContactLine partner={p} />
              </div>
              {Array.isArray(p.notes) && p.notes.length > 0 && (
                <div className="border-t border-border pt-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <MessageSquare size={11} />{p.notes.length} note{p.notes.length !== 1 ? "s" : ""}
                    <button
                      type="button"
                      onClick={() => setNotesViewId(p.id)}
                      className="ml-auto text-[11px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                    >
                      More
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words">{parseNoteText(p.notes[p.notes.length - 1].text).body}</p>
                </div>
              )}
              <PartnerResources partnerId={p.id} partnerName={p.name} />
            </div>
          ))}
        </div>
      )}

      {/* Read-only notes popup (More link on the partner card) */}
      <Dialog open={notesViewId != null} onOpenChange={(o) => { if (!o) setNotesViewId(null); }}>
        <DialogContent data-size-key="partner-notes-view" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Notes — {partners.find((p) => p.id === notesViewId)?.name ?? "Partner"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            {((partners.find((p) => p.id === notesViewId)?.notes as Note[] | undefined) ?? [])
              .slice()
              .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
              .map((note) => (
                <div key={note.id} className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1">
                  <NoteText text={note.text} />
                  {note.createdAt && (
                    <div className="text-[10px] text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</div>
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-size-key="partner-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Partner" : "Add GSI Partner"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Partner Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Accenture, Deloitte, Wipro" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Input value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} placeholder="e.g. Platinum" />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. Americas" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Primary Contact</Label>
              {editId != null && editResources.length > 0 && (
                <Select
                  value={form.primaryContactId != null ? String(form.primaryContactId) : "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, primaryContactId: v === "none" ? null : Number(v), newContactName: v === "none" ? f.newContactName : "", newContactEmail: v === "none" ? f.newContactEmail : "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick from this partner's people" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {editResources.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}{r.func ? ` — ${r.func}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {form.primaryContactId == null && (
                <div className="grid grid-cols-2 gap-4">
                  <Input value={form.newContactName} onChange={(e) => setForm({ ...form, newContactName: e.target.value })} placeholder={editId != null && editResources.length > 0 ? "…or add a new person" : "New contact name"} />
                  <Input type="email" value={form.newContactEmail} onChange={(e) => setForm({ ...form, newContactEmail: e.target.value })} placeholder="contact@partner.com" />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">The primary contact is a person in this partner's People directory. A new name here is added to the directory on save.</p>
              {(legacyContact.name || legacyContact.email) && form.primaryContactId == null && (
                <p className="text-[11px] text-muted-foreground">
                  Legacy contact (read-only): {legacyContact.name}{legacyContact.email ? ` · ${legacyContact.email}` : ""}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Annual Revenue Target</Label>
              <Input type="number" min="0" value={form.revenueTarget} onChange={(e) => setForm({ ...form, revenueTarget: e.target.value })} placeholder="e.g. 5000000" />
              <p className="text-[11px] text-muted-foreground">Annual pipeline target for this partner (used for attainment % on dashboard)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <NotesEditor
                notes={form.notes}
                onChange={(notes) => setForm({ ...form, notes })}
                placeholder="Partnership notes, context…"
                compact
                reminder={editId != null ? { entityType: "partner", entityId: String(editId), entityLabel: form.name.trim() || "Partner" } : null}
              />
            </div>
            <div className="space-y-1.5 rounded-md border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-3">
              <Label className="text-xs">Partner Macro Info (AI web search)</Label>
              <MacroSearchBox
                suggestion={buildPartnerMacroSuggestion(form)}
                suggestionReason="based on this partner's name, tier, and region"
                buttonLabel="Search Partner Macro"
                searching={searchPartnerMacro.isPending || (editId == null && createPartner.isPending)}
                disabled={!form.name.trim()}
                disabledHint={!form.name.trim() ? "Enter a partner name first." : undefined}
                onSearch={runPartnerMacro}
                successMessage={editId == null ? "Summary saved as a partner note (partner was created)." : "Summary saved as a partner note below."}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createPartner.isPending || updatePartner.isPending}>
                {(createPartner.isPending || updatePartner.isPending) ? <Loader2 size={15} className="animate-spin" /> : (editId ? "Save" : "Add partner")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete partner?</AlertDialogTitle>
            <AlertDialogDescription>This will also delete all associated opportunities and initiatives.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
