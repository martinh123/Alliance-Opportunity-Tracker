import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListReminders,
  useUpdateReminder,
  useDeleteReminder,
  useCreateReminder,
  useListPartners,
  getListPartnersQueryKey,
  getListRemindersQueryKey,
  type Reminder,
  type ReminderUpdate,
} from "@workspace/api-client-react";
import type { PersonSearchResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PersonTypeahead } from "@/components/person-typeahead";
import { cn } from "@/lib/utils";

/** Fire this anywhere to open the actions panel from outside the layout. */
export const OPEN_ACTIONS_EVENT = "gsi:open-actions";
export function openActionsPanel() {
  window.dispatchEvent(new CustomEvent(OPEN_ACTIONS_EVENT));
}

const REMINDERS_KEY_PREFIX = getListRemindersQueryKey();

/** Map PersonSearchResult.source to the entityType stored on reminders. */
function sourceToEntityType(source: string): string {
  if (source === "internal") return "internal_resource";
  if (source === "partner") return "partner_resource";
  return "contact";
}

export function useOpenActionCounts() {
  const { data: reminders = [] } = useListReminders(
    { status: "open" },
    { query: { queryKey: getListRemindersQueryKey({ status: "open" }) } },
  );
  return useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    let overdue = 0, dueToday = 0;
    for (const r of reminders) {
      const due = new Date(r.dueAt);
      if (due.getTime() < now.getTime()) overdue++;
      else if (due.getTime() <= endOfToday.getTime()) dueToday++;
    }
    return { overdue, dueToday, open: reminders.length, needsAttention: overdue + dueToday };
  }, [reminders]);
}

function fmtDue(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

/** Where to navigate for a reminder's linked record, or null when unlinked. */
function entityHref(r: Reminder): string | null {
  if (!r.entityType || !r.entityId) return null;
  switch (r.entityType) {
    case "opportunity":
      return `/opportunities/${r.entityId}`;
    case "meddpicc_section": {
      const oppId = r.entityId.split(":")[0];
      return oppId ? `/opportunities/${oppId}` : null;
    }
    case "partner":
    case "internal_resource":
    case "partner_resource":
      return "/partners";
    default:
      return null;
  }
}

function snoozeDate(kind: "1d" | "3d" | "1w", from: string): Date {
  const base = new Date(from);
  const start = isNaN(base.getTime()) || base.getTime() < Date.now() ? new Date() : base;
  const d = new Date(start);
  if (kind === "1d") d.setDate(d.getDate() + 1);
  if (kind === "3d") d.setDate(d.getDate() + 3);
  if (kind === "1w") {
    // Next Monday 9AM from today
    const t = new Date();
    const day = t.getDay();
    const delta = ((8 - day) % 7) || 7;
    t.setDate(t.getDate() + delta);
    t.setHours(9, 0, 0, 0);
    return t;
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

// ─── Single action row ───────────────────────────────────────────────────────

function ActionRow({
  r,
  completed,
  onNavigate,
}: {
  r: Reminder;
  completed: boolean;
  onNavigate: () => void;
}) {
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const [notes, setNotes] = useState(r.notes ?? "");
  const [dueLocal, setDueLocal] = useState(toLocalInput(r.dueAt));

  // Entity types the edit form can manage. opportunity/meddpicc_section links are
  // set by other parts of the app and must not be touched here.
  const EDITABLE_ENTITY_TYPES = ["partner", "contact", "internal_resource", "partner_resource"];
  const canEditEntity = !r.entityType || EDITABLE_ENTITY_TYPES.includes(r.entityType);

  // editEntity holds the full triplet that will be saved. Initialized from the
  // reminder on startEdit and updated atomically when the user makes a selection,
  // so resolvedEntity never needs to do an async lookup.
  type EntityTriplet = { entityType: string | null; entityId: string | null; entityLabel: string | null };
  const NULL_ENTITY: EntityTriplet = { entityType: null, entityId: null, entityLabel: null };
  const [editEntity, setEditEntity] = useState<EntityTriplet>(NULL_ENTITY);

  // UI-only state for the pickers (do not use to derive the save payload)
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [contactText, setContactText] = useState("");
  const [contactPicked, setContactPicked] = useState<PersonSearchResult | null>(null);

  // Load partners when the link section is open so the select is populated.
  const { data: partners = [] } = useListPartners({
    query: { enabled: editing && linkOpen, queryKey: getListPartnersQueryKey() },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: REMINDERS_KEY_PREFIX });

  const patch = async (data: ReminderUpdate, errTitle: string) => {
    try {
      await updateReminder.mutateAsync({ id: r.id, data });
      invalidate();
      return true;
    } catch (err: any) {
      toast({ title: errTitle, description: err?.response?.data?.error || err?.message || "Please try again.", variant: "destructive" });
      return false;
    }
  };

  const startEdit = () => {
    setName(r.name);
    setNotes(r.notes ?? "");
    setDueLocal(toLocalInput(r.dueAt));
    // Pre-fill entity link only for editable entity types.
    // The full triplet is stored in editEntity so no later async lookup is needed.
    if (canEditEntity && r.entityType && r.entityId && r.entityLabel) {
      setEditEntity({ entityType: r.entityType, entityId: r.entityId, entityLabel: r.entityLabel });
      if (r.entityType === "partner") {
        setSelectedPartnerId(Number(r.entityId)); // drives the select control
        setContactPicked(null);
        setContactText("");
      } else {
        // contact / internal_resource / partner_resource — drive the typeahead chip
        const source = r.entityType === "internal_resource" ? "internal"
          : r.entityType === "partner_resource" ? "partner"
          : "contact";
        setContactPicked({ name: r.entityLabel, org: "", source, ref: r.entityId });
        setContactText(r.entityLabel);
        setSelectedPartnerId(null);
      }
      setLinkOpen(true);
    } else {
      setEditEntity(NULL_ENTITY);
      setSelectedPartnerId(null);
      setContactPicked(null);
      setContactText("");
      setLinkOpen(false);
    }
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const due = new Date(dueLocal);
    if (isNaN(due.getTime())) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    // Only patch entity fields for types the edit form manages. For opportunity/
    // meddpicc_section links, omit entity fields entirely so they are preserved.
    const entityPatch: EntityTriplet | Record<never, never> = canEditEntity ? editEntity : {};
    const ok = await patch({
      name: name.trim(),
      dueAt: due.toISOString(),
      notes: notes.trim() || null,
      ...entityPatch,
    }, "Could not save action");
    if (ok) setEditing(false);
  };

  const snooze = async (kind: "1d" | "3d" | "1w") => {
    const due = snoozeDate(kind, r.dueAt);
    const ok = await patch({ dueAt: due.toISOString() }, "Could not reschedule");
    if (ok) toast({ title: "Rescheduled", description: `"${r.name}" — due ${fmtDue(due.toISOString())}` });
  };

  const toggleComplete = async () => {
    const ok = await patch({ completed: !completed }, completed ? "Could not reopen action" : "Could not complete action");
    if (ok && !completed) toast({ title: "Action completed", description: `"${r.name}" moved to Completed.` });
  };

  const handleDelete = async () => {
    try {
      await deleteReminder.mutateAsync({ id: r.id });
      invalidate();
    } catch (err: any) {
      toast({ title: "Could not delete action", description: err?.message || "Please try again.", variant: "destructive" });
    }
  };

  const href = entityHref(r);
  const overdue = !completed && new Date(r.dueAt).getTime() < Date.now();

  // Label shown in the link-section toggle button — derived from editEntity so
  // it reflects the persisted triplet even before the partners list has loaded.
  const editLinkedLabel = editEntity.entityLabel ?? null;

  if (editing) {
    return (
      <div className="rounded-md border border-primary/40 bg-card px-3 py-2.5 space-y-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Action name" autoFocus />
        <Input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details / notes (optional)" rows={2} className="text-sm resize-none" />

        {/* Collapsible link-to section — only shown for editable entity types */}
        {canEditEntity && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => {
              const next = !linkOpen;
              setLinkOpen(next);
              if (!next) {
                // Collapsing the section = explicit unlink
                setEditEntity(NULL_ENTITY);
                setSelectedPartnerId(null);
                setContactPicked(null);
                setContactText("");
              }
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {linkOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Link2 size={11} />
            {editLinkedLabel ? (
              <span className="text-foreground font-medium truncate max-w-[180px]">{editLinkedLabel}</span>
            ) : (
              "Link to a company or contact"
            )}
          </button>

          {linkOpen && (
            <div className="mt-2 space-y-2 pl-1">
              {/* Contact typeahead */}
              <div className="space-y-1">
                <Label className="text-xs">Contact</Label>
                {contactPicked ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                    <span className="text-sm text-foreground truncate">
                      {contactPicked.name}
                      {contactPicked.org && <span className="text-muted-foreground"> · {contactPicked.org}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setContactPicked(null); setContactText(""); setEditEntity(NULL_ENTITY); }}
                      title="Clear contact"
                      className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <PersonTypeahead
                    value={contactText}
                    onChange={setContactText}
                    onPick={(person) => {
                      setContactPicked(person);
                      setContactText(person.name);
                      setSelectedPartnerId(null);
                      setEditEntity({
                        entityType: sourceToEntityType(person.source),
                        entityId: person.ref,
                        entityLabel: person.name + (person.org ? ` at ${person.org}` : ""),
                      });
                    }}
                    scope="all"
                    placeholder="Search contacts…"
                  />
                )}
              </div>

              {/* Company select — hidden when contact selected */}
              {!contactPicked && (
                <div className="space-y-1">
                  <Label className="text-xs">Company</Label>
                  <select
                    value={selectedPartnerId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setSelectedPartnerId(id);
                      if (id !== null) {
                        const p = partners.find((p) => p.id === id);
                        // p is guaranteed to exist — the user picked from the loaded list
                        setEditEntity({ entityType: "partner", entityId: String(id), entityLabel: p?.name ?? String(id) });
                      } else {
                        setEditEntity(NULL_ENTITY);
                      }
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                  >
                    <option value="">None</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setEditing(false)}><X size={13} /></Button>
          <Button type="button" size="sm" className="h-7 px-2" onClick={saveEdit} disabled={updateReminder.isPending}>
            {updateReminder.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "group rounded-md border px-3 py-2.5",
      completed ? "border-border bg-muted/30" : overdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
    )}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggleComplete}
          title={completed ? "Mark as not done" : "Mark as done"}
          className={cn(
            "mt-0.5 flex-shrink-0 h-[18px] w-[18px] rounded-full border flex items-center justify-center transition-colors",
            completed
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-muted-foreground/40 hover:border-emerald-500 hover:text-emerald-500 text-transparent",
          )}
        >
          <Check size={11} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium break-words", completed ? "text-muted-foreground line-through" : "text-foreground")}>{r.name}</p>
          <p className={cn("text-[11px]", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            {completed
              ? `Completed ${r.completedAt ? fmtDue(r.completedAt) : ""} · was due ${fmtDue(r.dueAt)}`
              : `${overdue ? "Overdue · " : "Due "}${fmtDue(r.dueAt)}`}
          </p>
          {r.notes && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words mt-0.5">{r.notes}</p>}
          {r.entityLabel && (
            href ? (
              <button
                type="button"
                onClick={() => { onNavigate(); setLocation(href); }}
                className="text-[11px] text-violet-600 dark:text-violet-300 hover:underline inline-flex items-center gap-1 max-w-full"
              >
                <span className="truncate">↳ {r.entityLabel}</span><ExternalLink size={10} className="flex-shrink-0" />
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground truncate">↳ {r.entityLabel}</p>
            )
          )}
          {!completed && (
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-muted-foreground mr-0.5">Snooze:</span>
              {([["1d", "+1 day"], ["3d", "+3 days"], ["1w", "next week"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => snooze(k)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {completed ? (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleComplete} title="Reopen">
              <RotateCcw size={12} />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEdit} title="Edit">
              <Pencil size={12} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={handleDelete} title="Delete">
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add form ────────────────────────────────────────────────────────────────

function AddActionForm({ onDone }: { onDone: () => void }) {
  const createReminder = useCreateReminder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [dueLocal, setDueLocal] = useState(defaultDueLocal());
  const [notes, setNotes] = useState("");

  // Link-to section
  const [linkOpen, setLinkOpen] = useState(false);
  const { data: partners = [] } = useListPartners({
    query: { enabled: linkOpen, queryKey: getListPartnersQueryKey() },
  });
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [contactText, setContactText] = useState("");
  const [contactPicked, setContactPicked] = useState<PersonSearchResult | null>(null);

  const clearLink = () => {
    setSelectedPartnerId(null);
    setContactText("");
    setContactPicked(null);
  };

  const resolvedEntity = () => {
    if (contactPicked) {
      return {
        entityType: sourceToEntityType(contactPicked.source),
        entityId: contactPicked.ref,
        entityLabel: contactPicked.name + (contactPicked.org ? ` at ${contactPicked.org}` : ""),
      };
    }
    if (selectedPartnerId !== null) {
      const p = partners.find((p) => p.id === selectedPartnerId);
      if (p) return { entityType: "partner", entityId: String(p.id), entityLabel: p.name };
    }
    return { entityType: null, entityId: null, entityLabel: null };
  };

  const handleAdd = async () => {
    if (!name.trim()) { toast({ title: "Action name is required", variant: "destructive" }); return; }
    const due = new Date(dueLocal);
    if (isNaN(due.getTime())) { toast({ title: "Invalid date/time", variant: "destructive" }); return; }
    const entity = resolvedEntity();
    try {
      await createReminder.mutateAsync({
        data: {
          name: name.trim(),
          dueAt: due.toISOString(),
          notes: notes.trim() || null,
          entityType: entity.entityType,
          entityId: entity.entityId,
          entityLabel: entity.entityLabel,
        },
      });
    } catch (err: any) {
      toast({ title: "Could not add action", description: err?.response?.data?.error || err?.message || "Please try again.", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: REMINDERS_KEY_PREFIX });
    toast({ title: "Action added", description: `"${name.trim()}" — due ${fmtDue(due.toISOString())}` });
    onDone();
  };

  const linkedLabel = contactPicked
    ? contactPicked.name + (contactPicked.org ? ` · ${contactPicked.org}` : "")
    : selectedPartnerId !== null
    ? (partners.find((p) => p.id === selectedPartnerId)?.name ?? null)
    : null;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-3 space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">What needs doing? *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Follow up with Accenture EB"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Due</Label>
        <Input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Details (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm resize-none" placeholder="Any context for future-you…" />
      </div>

      {/* Collapsible link-to section */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => { setLinkOpen((o) => !o); if (linkOpen) clearLink(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {linkOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Link2 size={11} />
          {linkedLabel ? (
            <span className="text-foreground font-medium truncate max-w-[180px]">{linkedLabel}</span>
          ) : (
            "Link to a company or contact"
          )}
        </button>

        {linkOpen && (
          <div className="mt-2 space-y-2 pl-1">
            {/* Contact typeahead */}
            <div className="space-y-1">
              <Label className="text-xs">Contact</Label>
              {contactPicked ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <span className="text-sm text-foreground truncate">
                    {contactPicked.name}
                    {contactPicked.org && <span className="text-muted-foreground"> · {contactPicked.org}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setContactPicked(null); setContactText(""); }}
                    title="Clear contact"
                    className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <PersonTypeahead
                  value={contactText}
                  onChange={setContactText}
                  onPick={(person) => {
                    setContactPicked(person);
                    setContactText(person.name);
                    setSelectedPartnerId(null);
                  }}
                  scope="all"
                  placeholder="Search contacts…"
                />
              )}
            </div>

            {/* Company select — hidden when contact selected */}
            {!contactPicked && (
              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <select
                  value={selectedPartnerId ?? ""}
                  onChange={(e) => setSelectedPartnerId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                >
                  <option value="">None</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="button" size="sm" onClick={handleAdd} disabled={createReminder.isPending || !name.trim()}>
          {createReminder.isPending ? <Loader2 size={14} className="animate-spin" /> : "Add action"}
        </Button>
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ActionsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [adding, setAdding] = useState(false);

  const { data: openActions = [], isLoading: loadingOpen } = useListReminders(
    { status: "open" },
    { query: { queryKey: getListRemindersQueryKey({ status: "open" }), enabled: open } },
  );
  const { data: completedActions = [], isLoading: loadingCompleted } = useListReminders(
    { status: "completed" },
    { query: { queryKey: getListRemindersQueryKey({ status: "completed" }), enabled: open && tab === "completed" } },
  );

  const groups = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    const overdue: Reminder[] = [], today: Reminder[] = [], upcoming: Reminder[] = [];
    for (const r of openActions) {
      const t = new Date(r.dueAt).getTime();
      if (t < now.getTime()) overdue.push(r);
      else if (t <= endOfToday.getTime()) today.push(r);
      else upcoming.push(r);
    }
    return { overdue, today, upcoming };
  }, [openActions]);

  const close = () => onOpenChange(false);

  const renderGroup = (label: string, items: Reminder[], tone?: "destructive" | "warning") => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}>
            {label}
          </span>
          <Badge variant={tone === "destructive" ? "destructive" : "secondary"} className="h-4 px-1.5 text-[10px]">{items.length}</Badge>
        </div>
        {items.map((r) => <ActionRow key={r.id} r={r} completed={false} onNavigate={close} />)}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-size-key="actions-panel" className="w-full sm:max-w-[440px] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell size={15} className="text-muted-foreground" />
            Actions
          </SheetTitle>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-md bg-muted p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setTab("open")}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors", tab === "open" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Open{openActions.length > 0 ? ` (${openActions.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("completed")}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors", tab === "completed" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Completed
              </button>
            </div>
            {tab === "open" && !adding && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => setAdding(true)}>
                <Plus size={13} />New action
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {tab === "open" ? (
            <>
              {adding && <AddActionForm onDone={() => setAdding(false)} />}
              {loadingOpen ? (
                <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
              ) : openActions.length === 0 && !adding ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All clear — no open actions</p>
                  <p className="text-xs mt-1">Add one here or from any notes list</p>
                </div>
              ) : (
                <>
                  {renderGroup("Overdue", groups.overdue, "destructive")}
                  {renderGroup("Due today", groups.today, "warning")}
                  {renderGroup("Upcoming", groups.upcoming)}
                </>
              )}
            </>
          ) : loadingCompleted ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : completedActions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nothing completed yet</p>
              <p className="text-xs mt-1">Checked-off actions land here with their completion date</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {completedActions.map((r) => <ActionRow key={r.id} r={r} completed onNavigate={close} />)}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
