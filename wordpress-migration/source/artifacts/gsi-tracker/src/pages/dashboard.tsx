import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useListOpportunities,
  useListPartners,
  useListUsers,
  useCreateOpportunity,
  useUpdateOpportunity,
  useDeleteOpportunity,
  useGetProfile,
  useGetMe,
  getListOpportunitiesQueryKey,
  getListPartnersQueryKey,
  useCreatePartnerResource,
  useCreateInternalResource,
  useUpdatePartnerResource,
  useUpdateInternalResource,
  getListPartnerResourcesQueryKey,
  getListInternalResourcesQueryKey,
} from "@workspace/api-client-react";

import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, ChevronDown, ChevronRight, Trash2, ExternalLink, Loader2, TrendingUp, Check, X, MessageSquare, Pencil, CheckCircle2, Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { makeId } from "@/lib/uid";
import { ReminderButton } from "@/components/reminder-button";
import { openActionsPanel, useOpenActionCounts } from "@/components/actions-panel";
import { NoteText } from "@/components/note-text";
import { qualificationBand } from "@/lib/meddpicc";
import { partnerAccent, partnerInitials } from "@/lib/partner-accent";
import { CompanyPicker } from "@/components/company-picker";
import { PersonTypeahead } from "@/components/person-typeahead";

interface OppContact {
  id: string;
  name: string;
  org: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  directoryRef?: string | null;
  createdAt?: string;
}

const ORG_COLORS: Record<string, string> = {
  HPE: "bg-green-100 text-green-700",
  Partner: "bg-blue-100 text-blue-700",
  Customer: "bg-orange-100 text-orange-700",
  Other: "bg-gray-100 text-gray-600",
};

interface OppNote { id: string; text: string; createdAt: string; }

function pad2(n: number) { return String(n).padStart(2, "0"); }

function daysInMonth(year: number, month: number) {
  // month is 1-indexed; day 0 of next month = last day of this month
  return new Date(year, month, 0).getDate();
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ACTIVE_STAGES = new Set(["Qualify", "Discovery", "Propose", "Negotiate", "Commit"]);
const ACTIVE_STAGE_LIST = ["Qualify", "Discovery", "Propose", "Negotiate", "Commit"];

const STAGE_LABELS: Record<string, string> = {
  Qualify: "Qualify",
  Discovery: "Discovery",
  Propose: "Propose",
  Negotiate: "Negotiate",
  Commit: "Commit",
  ClosedWon: "Closed Won",
  ClosedLost: "Closed Lost",
  Dormant: "Dormant",
};

const STAGE_COLORS: Record<string, string> = {
  Qualify: "text-blue-600 bg-blue-50 border-blue-200",
  Discovery: "text-violet-600 bg-violet-50 border-violet-200",
  Propose: "text-amber-600 bg-amber-50 border-amber-200",
  Negotiate: "text-orange-600 bg-orange-50 border-orange-200",
  Commit: "text-teal-700 bg-teal-50 border-teal-200",
  ClosedWon: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ClosedLost: "text-red-600 bg-red-50 border-red-200",
  Dormant: "text-gray-500 bg-gray-100 border-gray-200",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(num: number, denom: number) {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function fiscalPeriodBounds(fyStartMonth: number) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed local month

  // Clamp to valid month range
  const start = Math.max(1, Math.min(12, Math.round(fyStartMonth) || 1));

  // Which fiscal year are we in?
  // If current month >= FY start month → FY started this calendar year
  // Otherwise → FY started last calendar year
  const fyStartYear = month >= start ? year : year - 1;

  // FY end month = one calendar month before FY start (wraps: Jan start → Dec end)
  const fyEndMonth = start === 1 ? 12 : start - 1;
  const fyEndYear = start === 1 ? fyStartYear : fyStartYear + 1;

  // Build date strings directly — avoids UTC toISOString() shifting the date
  // by the local timezone offset (would give wrong day in UTC+12 etc.)
  const fyStart = `${fyStartYear}-${pad2(start)}-01`;
  const fyEnd = `${fyEndYear}-${pad2(fyEndMonth)}-${pad2(daysInMonth(fyEndYear, fyEndMonth))}`;

  // Which fiscal quarter are we in? (qIdx 0=Q1, 1=Q2, 2=Q3, 3=Q4)
  const monthsIntoFY = (month - start + 12) % 12; // 0-11
  const qIdx = Math.floor(monthsIntoFY / 3);

  // Quarter start month (raw, may be > 12 if it spans into next calendar year)
  const qStartMonthRaw = start + qIdx * 3;
  const qStartYear = qStartMonthRaw > 12 ? fyStartYear + 1 : fyStartYear;
  const qStartMonth = qStartMonthRaw > 12 ? qStartMonthRaw - 12 : qStartMonthRaw;

  // Quarter end month = 2 months after quarter start
  const qEndMonthRaw = qStartMonthRaw + 2;
  const qEndYear = qEndMonthRaw > 12 ? fyStartYear + 1 : fyStartYear;
  const qEndMonth = qEndMonthRaw > 12 ? qEndMonthRaw - 12 : qEndMonthRaw;

  const qStart = `${qStartYear}-${pad2(qStartMonth)}-01`;
  const qEnd = `${qEndYear}-${pad2(qEndMonth)}-${pad2(daysInMonth(qEndYear, qEndMonth))}`;

  // Human-readable labels for display in the UI
  const fyLabel = `FY${fyStartYear}–${String(fyEndYear).slice(2)}`; // e.g. "FY2025–26"
  const qLabel = `Q${qIdx + 1}`; // e.g. "Q3"
  const fyRangeLabel = `${MONTH_NAMES[start - 1]} ${fyStartYear} – ${MONTH_NAMES[fyEndMonth - 1]} ${fyEndYear}`;
  const qRangeLabel = `${MONTH_NAMES[qStartMonth - 1]} – ${MONTH_NAMES[qEndMonth - 1]} ${qEndYear}`;

  return { fyStart, fyEnd, qStart, qEnd, fyLabel, qLabel, fyRangeLabel, qRangeLabel, qIdx };
}

function fmtNoteTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ─── Editable cell ────────────────────────────────────────────────────────────

type EditableCellProps = {
  value: string | number | null | undefined;
  display?: React.ReactNode;
  kind: "text" | "date" | "number";
  placeholder?: string;
  onSave: (raw: string) => Promise<void>;
  className?: string;
  align?: "left" | "right";
};

function EditableCell({ value, kind, placeholder = "—", onSave, className, align = "left" }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setVal(String(value ?? ""));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value]);

  const commit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(val); } finally { setSaving(false); setEditing(false); }
  }, [onSave, val, saving]);

  const cancel = () => { setEditing(false); setVal(String(value ?? "")); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  const cellBase = cn("px-2 py-1.5 rounded text-xs w-full min-h-[28px] leading-tight", align === "right" && "text-right");

  if (editing) {
    return (
      <input ref={inputRef} type={kind} value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit} onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(cellBase, "border border-primary rounded bg-background outline-none")} />
    );
  }

  const isEmpty = value == null || value === "";
  return (
    <div onClick={() => setEditing(true)} title="Click to edit"
      className={cn(cellBase, "cursor-pointer hover:bg-primary/8 hover:outline hover:outline-1 hover:outline-primary/30 transition-colors",
        isEmpty && "text-muted-foreground/30 italic", className)}>
      {saving ? <Loader2 size={12} className="animate-spin inline" /> : (isEmpty ? placeholder : String(value))}
    </div>
  );
}

// ─── Notes sheet ──────────────────────────────────────────────────────────────

function NotesSheet({
  opp,
  open,
  onClose,
  onSaveNotes,
}: {
  opp: any;
  open: boolean;
  onClose: () => void;
  onSaveNotes: (id: number, notes: OppNote[]) => Promise<void>;
}) {
  const [notes, setNotes] = useState<OppNote[]>([]);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && opp) {
      const raw = Array.isArray(opp.notes) ? opp.notes : [];
      setNotes([...raw].sort((a: OppNote, b: OppNote) => b.createdAt.localeCompare(a.createdAt)));
    }
  }, [open, opp]);

  const persist = async (updated: OppNote[]) => {
    setSaving(true);
    try { await onSaveNotes(opp.id, updated); } finally { setSaving(false); }
    setNotes([...updated].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  const handleAdd = async () => {
    if (!newText.trim()) return;
    const note: OppNote = { id: makeId(), text: newText.trim(), createdAt: new Date().toISOString() };
    const updated = [note, ...notes];
    await persist(updated);
    setNewText("");
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await persist(notes.filter((n) => n.id !== id));
  };

  const startEdit = (note: OppNote) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const updated = notes.map((n) => n.id === editingId ? { ...n, text: editText.trim() || n.text } : n);
    await persist(updated);
    setEditingId(null);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" data-size-key="opportunity-notes" className="w-full sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare size={15} className="text-muted-foreground" />
            Notes — {opp?.name}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{notes.length} note{notes.length !== 1 ? "s" : ""}</p>
        </SheetHeader>

        <div className="px-4 py-3 border-b border-border bg-muted/20">
          {adding ? (
            <div className="space-y-2">
              <Textarea
                ref={textareaRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Type your note…"
                rows={3}
                autoFocus
                className="text-sm resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleAdd(); if (e.key === "Escape") { setAdding(false); setNewText(""); } }}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setAdding(false); setNewText(""); }}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={!newText.trim() || saving}>
                  {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Add note
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => { setAdding(true); setTimeout(() => textareaRef.current?.focus(), 50); }}>
                <Plus size={13} />Add a note
              </Button>
              {opp && <ReminderButton context={{ entityType: "opportunity", entityId: String(opp.id), entityLabel: opp.name }} />}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {notes.length === 0 && (
            <div className="text-center py-10 text-xs text-muted-foreground">
              <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
              No notes yet — add the first one above
            </div>
          )}
          {notes.map((note) => (
            <div key={note.id} className="group/note rounded-lg border border-border bg-card px-3.5 py-3 space-y-1.5">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3}
                    autoFocus className="text-sm resize-none"
                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleEditSave(); if (e.key === "Escape") setEditingId(null); }} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"><X size={13} /></button>
                    <button onClick={handleEditSave} disabled={saving} className="p-1 rounded bg-primary text-primary-foreground hover:opacity-90">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <NoteText text={note.text} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{fmtNoteTime(note.createdAt)}</span>
                    <div className="flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(note)} title="Edit"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDelete(note.id)} title="Delete"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type CreateForm = { name: string; type: string; partnerId: string; ownerId: string; endCustomer: string; endCustomerDomain: string };
const emptyCreate = (): CreateForm => ({ name: "", type: "opportunity", partnerId: "", ownerId: "", endCustomer: "", endCustomerDomain: "" });

function ActionsAttentionCue() {
  const { overdue, dueToday, needsAttention } = useOpenActionCounts();
  if (needsAttention === 0) return null;
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (dueToday > 0) parts.push(`${dueToday} due today`);
  return (
    <button
      type="button"
      onClick={openActionsPanel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
        overdue > 0
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70"
          : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", overdue > 0 ? "bg-red-500" : "bg-amber-500")} />
      {parts.join(" · ")}
    </button>
  );
}

export default function Dashboard() {
  const { data: partners = [] } = useListPartners();
  const { data: users = [] } = useListUsers();
  const { data: profile } = useGetProfile();
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: allOpps = [], isLoading: oppsLoading } = useListOpportunities({});

  const fyStartMonth = profile?.fiscalYearStart ? Number(profile.fiscalYearStart) : 1;
  const { fyStart, fyEnd, qStart, qEnd, fyLabel, qLabel, fyRangeLabel, qRangeLabel, qIdx } = fiscalPeriodBounds(fyStartMonth);
  const quota = profile?.quota ? Number(profile.quota) : null;

  // Quarterly goal derived from per-quarter percentages set in Profile
  const qGoalPcts = [
    profile?.q1GoalPct != null ? Number(profile.q1GoalPct) : 25,
    profile?.q2GoalPct != null ? Number(profile.q2GoalPct) : 25,
    profile?.q3GoalPct != null ? Number(profile.q3GoalPct) : 25,
    profile?.q4GoalPct != null ? Number(profile.q4GoalPct) : 25,
  ];
  const currentQPct = qGoalPcts[qIdx] ?? 25;
  const qGoal = quota != null ? quota * currentQPct / 100 : null;

  // Days left in the current quarter (inclusive of today)
  const [qEndY, qEndM, qEndD] = qEnd.split("-").map(Number);
  const qEndDate = new Date(qEndY, qEndM - 1, qEndD);
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const daysLeftInQ = Math.max(0, Math.round((qEndDate.getTime() - todayMidnight.getTime()) / 86400000) + 1);

  const createOpp = useCreateOpportunity();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();

  const [collapsedPartners, setCollapsedPartners] = useState<Set<number>>(new Set());
  const [createDialog, setCreateDialog] = useState<{ partnerId?: number; type: string } | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate());
  const [deleteOppId, setDeleteOppId] = useState<number | null>(null);
  const [notesOpp, setNotesOpp] = useState<any | null>(null);
  const [wonLostPopup, setWonLostPopup] = useState<{ items: any[]; label: string; variant: "won" | "lost" | "dormant" } | null>(null);

  // Stage filters — a global filter plus optional per-partner overrides.
  // "all" = no filter; per-partner "inherit" = follow the global filter.
  const [globalStage, setGlobalStage] = useState<string>("all");
  const [partnerStage, setPartnerStage] = useState<Record<number, string>>({});
  const effectiveStage = (partnerId: number) => {
    const local = partnerStage[partnerId];
    return local && local !== "inherit" ? local : globalStage;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
  };

  const togglePartner = (id: number) =>
    setCollapsedPartners((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openCreate = (partnerId?: number, type = "opportunity") => {
    setCreateForm({ ...emptyCreate(), partnerId: partnerId ? String(partnerId) : "", type });
    setCreateDialog({ partnerId, type });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createOpp.mutateAsync({
      data: {
        name: createForm.name,
        type: createForm.type as "opportunity" | "initiative",
        partnerId: Number(createForm.partnerId),
        ownerId: Number(createForm.ownerId),
        stage: "Qualify",
        endCustomer: createForm.endCustomer.trim() || null,
        endCustomerDomain: createForm.endCustomerDomain.trim() || null,
      },
    });
    invalidate();
    setCreateDialog(null);
  };

  const handleCellSave = useCallback(async (id: number, field: string, rawVal: string) => {
    const numFields = ["numEndpoints", "revenueValue"];
    const data: Record<string, any> = {};
    if (numFields.includes(field)) {
      data[field] = rawVal.trim() ? Number(rawVal) : null;
    } else {
      data[field] = rawVal.trim() || null;
    }
    await updateOpp.mutateAsync({ id, data });
    invalidate();
  }, [updateOpp]);

  const handleStageChange = useCallback(async (id: number, stage: string) => {
    await updateOpp.mutateAsync({ id, data: { stage } as any });
    invalidate();
  }, [updateOpp]);

  const handleSaveContacts = useCallback(async (id: number, contacts: OppContact[]) => {
    await updateOpp.mutateAsync({ id, data: { contacts } as any });
    invalidate();
  }, [updateOpp]);

  // End customers already resolved on existing opportunities/initiatives — offered
  // in the create dialog for one-click reuse so no new AI search is needed.
  // Same-partner customers are listed first.
  const knownCompanies = useMemo(() => {
    const selectedPartnerId = createForm.partnerId ? Number(createForm.partnerId) : null;
    const map = new Map<string, { endCustomer: string; endCustomerDomain: string; hint?: string; samePartner: boolean }>();
    for (const o of allOpps as any[]) {
      const name = (o.endCustomer || "").trim();
      if (!name) continue;
      const domain = (o.endCustomerDomain || "").trim();
      const key = `${name.toLowerCase()}|${domain.toLowerCase()}`;
      const samePartner = selectedPartnerId != null && o.partnerId === selectedPartnerId;
      const existing = map.get(key);
      if (existing) {
        existing.samePartner = existing.samePartner || samePartner;
      } else {
        map.set(key, { endCustomer: name, endCustomerDomain: domain, hint: `Used on "${o.name}"`, samePartner });
      }
    }
    return [...map.values()]
      .sort((a, b) => Number(b.samePartner) - Number(a.samePartner) || a.endCustomer.localeCompare(b.endCustomer))
      .slice(0, 8)
      .map(({ samePartner, ...k }) => k);
  }, [allOpps, createForm.partnerId]);

  const handleSaveNotes = useCallback(async (id: number, notes: OppNote[]) => {
    await updateOpp.mutateAsync({ id, data: { notes } as any });
    setNotesOpp((prev: any) => prev?.id === id ? { ...prev, notes } : prev);
    invalidate();
  }, [updateOpp]);

  const handleDelete = async () => {
    if (!deleteOppId) return;
    await deleteOpp.mutateAsync({ id: deleteOppId });
    invalidate();
    setDeleteOppId(null);
  };

  // Group opps by partner and status
  const oppsByPartner = partners.reduce<Record<number, { active: any[]; closedWon: any[]; closedLost: any[]; dormant: any[] }>>((acc, p) => {
    const items = allOpps.filter((o) => o.partnerId === p.id);
    acc[p.id] = {
      active: items.filter((o) => ACTIVE_STAGES.has(o.stage)),
      closedWon: items.filter((o) => o.stage === "ClosedWon"),
      closedLost: items.filter((o) => o.stage === "ClosedLost"),
      dormant: items.filter((o) => o.stage === "Dormant"),
    };
    return acc;
  }, {});

  // Partner-level metrics
  const partnerMetrics = partners.map((p) => {
    const { active, closedWon } = oppsByPartner[p.id] || { active: [], closedWon: [], closedLost: [], dormant: [] };

    // Pipeline = active only; revenueValue is numeric (string from DB) — always coerce to Number
    const rv = (o: any) => (o.revenueValue != null ? Number(o.revenueValue) : 0);
    const totalPipe = active.reduce((s, o) => s + rv(o), 0);

    // Closed won filtered by fiscal period (compare date portion of ISO timestamp)
    const wonFY = closedWon.filter((o) => {
      const d = o.closedWonAt?.slice(0, 10);
      return d && d >= fyStart && d <= fyEnd;
    });
    const wonQ = closedWon.filter((o) => {
      const d = o.closedWonAt?.slice(0, 10);
      return d && d >= qStart && d <= qEnd;
    });

    const fyClosed = wonFY.reduce((s, o) => s + rv(o), 0);
    const qClosed = wonQ.reduce((s, o) => s + rv(o), 0);

    const oppCount = active.filter((o) => o.type === "opportunity").length;
    const initCount = active.filter((o) => o.type === "initiative").length;

    return { partner: p, oppCount, initCount, totalPipe, fyClosed, qClosed };
  });

  // Revenue sums for the current stage filters
  const rvOf = (o: any) => (o.revenueValue != null ? Number(o.revenueValue) : 0);
  const globalFilteredSum = partners.reduce((sum, p) => {
    const { active } = oppsByPartner[p.id] || { active: [] };
    const stage = effectiveStage(p.id);
    const matching = stage === "all" ? active : active.filter((o) => o.stage === stage);
    return sum + matching.reduce((s, o) => s + rvOf(o), 0);
  }, 0);

  const totalPipeAll = partnerMetrics.reduce((s, m) => s + m.totalPipe, 0);
  const totalFyClosed = partnerMetrics.reduce((s, m) => s + m.fyClosed, 0);
  const totalQClosed = partnerMetrics.reduce((s, m) => s + m.qClosed, 0);
  const totalOpps = partnerMetrics.reduce((s, m) => s + m.oppCount, 0);
  const totalInits = partnerMetrics.reduce((s, m) => s + m.initCount, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">GSI Sourced Opportunities</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Click a cell to edit inline (Enter to save, Esc to cancel) · Click a contact cell to open the contacts form</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionsAttentionCue />
          <Button size="sm" onClick={() => openCreate()}>
            <Plus size={13} className="mr-1.5" />Add
          </Button>
        </div>
      </div>

      {/* Summary metrics */}
      {partners.length > 0 && (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          {me?.name && (
            <div className="px-3 pt-2.5 pb-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{me.name}</span>
                {quota != null && (
                  <span className="text-[11px] text-muted-foreground">Annual goal: <span className="font-medium text-foreground">{fmt(quota)}</span></span>
                )}
                {qGoal != null && (
                  <span className="text-[11px] text-muted-foreground">{qLabel} goal: <span className="font-medium text-foreground">{fmt(qGoal)}</span></span>
                )}
                <span className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{daysLeftInQ}</span> day{daysLeftInQ !== 1 ? "s" : ""} left in {qLabel}</span>
              </div>
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  { label: "Partner", right: false },
                  { label: "Partner Target", right: true },
                  { label: "# Opps", right: true },
                  { label: "# Init", right: true },
                  { label: "Pipeline", right: true },
                  { label: `FY Closed Won`, title: fyRangeLabel, right: true },
                  { label: `vs ${fyLabel} Plan`, title: fyRangeLabel, right: true },
                  { label: `${qLabel} Closed Won`, title: qRangeLabel, right: true },
                  { label: `vs ${qLabel} Plan`, title: qRangeLabel, right: true },
                ].map(({ label, right, title }: { label: string; right: boolean; title?: string }) => (
                  <th key={label} title={title} className={cn("px-3 py-2 font-medium text-muted-foreground", right ? "text-right" : "text-left")}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partnerMetrics.map(({ partner, oppCount, initCount, totalPipe, fyClosed, qClosed }, pIdx) => {
                const target = partner.revenueTarget != null ? Number(partner.revenueTarget) : null;
                const accent = partnerAccent(pIdx);
                return (
                  <tr key={partner.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full flex-shrink-0", accent.dot)} />
                        {partner.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {target != null ? <span className="font-medium text-foreground/80">{fmt(target)}</span> : <span className="text-muted-foreground/40 text-[11px]">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{oppCount}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{initCount}</td>
                    <td className="px-3 py-2 text-right font-medium">{totalPipe > 0 ? fmt(totalPipe) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">{fyClosed > 0 ? fmt(fyClosed) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {quota ? (
                        <span className={cn("font-medium", fyClosed / quota >= 1 ? "text-emerald-700" : "text-muted-foreground")}>
                          {pct(fyClosed, quota)}
                        </span>
                      ) : <span className="text-muted-foreground/40 text-[11px]">Set quota</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">{qClosed > 0 ? fmt(qClosed) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {quota ? (
                        <span className={cn("font-medium", qClosed / (quota / 4) >= 1 ? "text-emerald-700" : "text-muted-foreground")}>
                          {pct(qClosed, quota / 4)}
                        </span>
                      ) : <span className="text-muted-foreground/40 text-[11px]">Set quota</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2 text-xs text-muted-foreground">Total</td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  {(() => {
                    const tot = partnerMetrics.reduce((s, m) => s + (m.partner.revenueTarget != null ? Number(m.partner.revenueTarget) : 0), 0);
                    return tot > 0 ? fmt(tot) : "—";
                  })()}
                </td>
                <td className="px-3 py-2 text-right">{totalOpps}</td>
                <td className="px-3 py-2 text-right">{totalInits}</td>
                <td className="px-3 py-2 text-right">{totalPipeAll > 0 ? fmt(totalPipeAll) : "—"}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{totalFyClosed > 0 ? fmt(totalFyClosed) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {quota ? <span className={cn("font-semibold", totalFyClosed / quota >= 1 ? "text-emerald-700" : "")}>{pct(totalFyClosed, quota)}</span> : "—"}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">{totalQClosed > 0 ? fmt(totalQClosed) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {quota ? <span className={cn("font-semibold", totalQClosed / (quota / 4) >= 1 ? "text-emerald-700" : "")}>{pct(totalQClosed, quota / 4)}</span> : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="px-3 py-1.5 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground/70">{fyLabel}</span>
              <span className="mx-1">·</span>{fyRangeLabel}
              <span className="mx-1.5 opacity-40">|</span>
              <span className="font-medium text-foreground/70">{qLabel}</span>
              <span className="mx-1">·</span>{qRangeLabel}
            </span>
            {!quota && (
              <span className="text-amber-600 font-medium">Set quota in Profile to see % attainment</span>
            )}
          </div>
        </div>
      )}

      {/* Global stage filter */}
      {partners.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-card border border-card-border rounded-lg px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stage filter</span>
          <select
            value={globalStage}
            onChange={(e) => setGlobalStage(e.target.value)}
            className={cn(
              "text-xs font-medium px-2 py-1 rounded border cursor-pointer outline-none focus:ring-1 focus:ring-primary/30",
              globalStage === "all" ? "text-foreground bg-background border-border" : STAGE_COLORS[globalStage] ?? "text-foreground bg-background border-border"
            )}
          >
            <option value="all">All stages</option>
            {ACTIVE_STAGE_LIST.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">
            {Object.values(partnerStage).some((v) => v && v !== "inherit")
              ? "Displayed pipeline (incl. partner overrides)"
              : globalStage === "all" ? "Total active pipeline" : `${STAGE_LABELS[globalStage]} revenue`}:{" "}
            <span className="font-semibold text-foreground">{globalFilteredSum > 0 ? fmt(globalFilteredSum) : "—"}</span>
          </span>
          {Object.values(partnerStage).some((v) => v && v !== "inherit") && (
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => setPartnerStage({})}
            >
              Clear partner overrides
            </button>
          )}
        </div>
      )}

      {/* Partner sections */}
      {oppsLoading ? (
        <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : partners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-30" />
          <p>No partners yet — add your first GSI partner</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((partner, pIdx) => {
            const { active, closedWon, closedLost, dormant } = oppsByPartner[partner.id] || { active: [], closedWon: [], closedLost: [], dormant: [] };
            const totalAll = active.length + closedWon.length + closedLost.length + dormant.length;
            const stageF = effectiveStage(partner.id);
            const filteredActive = stageF === "all" ? active : active.filter((o) => o.stage === stageF);
            const filteredSum = filteredActive.reduce((s, o) => s + rvOf(o), 0);
            const activeOpps = filteredActive.filter((o) => o.type === "opportunity");
            const activeInits = filteredActive.filter((o) => o.type === "initiative");
            const collapsed = collapsedPartners.has(partner.id);
            const accent = partnerAccent(pIdx);
            return (
              <div key={partner.id} className={cn("bg-card border border-card-border rounded-lg overflow-hidden border-l-4", accent.border)}>
                <div
                  className={cn("flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors", accent.bg)}
                  onClick={() => togglePartner(partner.id)}
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {collapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    <span className={cn("h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0", accent.chip)}>
                      {partnerInitials(partner.name)}
                    </span>
                    <span className={cn("font-semibold text-sm", accent.text)}>{partner.name}</span>
                    <span className="text-xs text-muted-foreground">{active.length} active</span>
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                      <select
                        value={partnerStage[partner.id] ?? "inherit"}
                        onChange={(e) => setPartnerStage((prev) => ({ ...prev, [partner.id]: e.target.value }))}
                        className={cn(
                          "text-[11px] font-medium px-1.5 py-0.5 rounded border cursor-pointer outline-none focus:ring-1 focus:ring-primary/30",
                          stageF !== "all" ? STAGE_COLORS[stageF] : "text-muted-foreground bg-background border-border"
                        )}
                        title="Stage filter for this partner"
                      >
                        <option value="inherit">{globalStage === "all" ? "All stages" : `Global (${STAGE_LABELS[globalStage]})`}</option>
                        <option value="all">All stages</option>
                        {ACTIVE_STAGE_LIST.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                      <span className="text-[11px] text-muted-foreground">
                        {stageF === "all" ? "Pipeline" : STAGE_LABELS[stageF]}:{" "}
                        <span className="font-semibold text-foreground">{filteredSum > 0 ? fmt(filteredSum) : "—"}</span>
                      </span>
                    </span>
                    {closedWon.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setWonLostPopup({ items: closedWon, label: `${partner.name} — Closed Won`, variant: "won" }); }}
                        className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        {closedWon.length} won
                      </button>
                    )}
                    {closedLost.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setWonLostPopup({ items: closedLost, label: `${partner.name} — Closed Lost`, variant: "lost" }); }}
                        className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        {closedLost.length} lost
                      </button>
                    )}
                    {dormant.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setWonLostPopup({ items: dormant, label: `${partner.name} — Dormant`, variant: "dormant" }); }}
                        className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        {dormant.length} dormant
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2.5" onClick={() => openCreate(partner.id, "opportunity")}>
                      <Plus size={11} />Opportunity
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2.5" onClick={() => openCreate(partner.id, "initiative")}>
                      <Plus size={11} />Initiative
                    </Button>
                  </div>
                </div>

                {!collapsed && (
                  <div className="border-t border-border">
                    {/* Active opportunities */}
                    {activeOpps.length > 0 && (
                      <PartnerSection label="Opportunities" rows={activeOpps} users={users}
                        onOpen={(o) => setLocation(`/opportunities/${o.id}`)}
                        onDelete={(o) => setDeleteOppId(o.id)}
                        onNotes={(o) => setNotesOpp(o)}
                        onContact={handleSaveContacts}
                        onSave={handleCellSave}
                        onStageChange={handleStageChange} />
                    )}
                    {/* Active initiatives */}
                    {activeInits.length > 0 && (
                      <PartnerSection label="Initiatives" rows={activeInits} users={users}
                        onOpen={(o) => setLocation(`/opportunities/${o.id}`)}
                        onDelete={(o) => setDeleteOppId(o.id)}
                        onNotes={(o) => setNotesOpp(o)}
                        onContact={handleSaveContacts}
                        onSave={handleCellSave}
                        onStageChange={handleStageChange}
                        className={activeOpps.length > 0 ? "border-t border-border" : ""} />
                    )}
                    {filteredActive.length === 0 && active.length > 0 && (
                      <div className="px-4 py-4 text-xs text-center text-muted-foreground">
                        No {stageF !== "all" ? `${STAGE_LABELS[stageF]} ` : ""}items match the current stage filter
                      </div>
                    )}
                    {active.length === 0 && (
                      <div className="px-4 py-4 text-xs text-center text-muted-foreground">
                        No items —{" "}
                        <button className="text-primary hover:underline" onClick={() => openCreate(partner.id, "opportunity")}>opportunity</button>
                        {" or "}
                        <button className="text-primary hover:underline" onClick={() => openCreate(partner.id, "initiative")}>initiative</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes sheet */}
      {notesOpp && (
        <NotesSheet
          opp={notesOpp}
          open={!!notesOpp}
          onClose={() => setNotesOpp(null)}
          onSaveNotes={handleSaveNotes}
        />
      )}

      {/* Create dialog */}
      <Dialog open={!!createDialog} onOpenChange={() => setCreateDialog(null)}>
        <DialogContent data-size-key="new-opportunity" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New {createDialog?.type === "initiative" ? "Initiative" : "Opportunity"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={createForm.type} onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="opportunity">Opportunity</SelectItem>
                  <SelectItem value="initiative">Initiative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Partner *</Label>
              <Select value={createForm.partnerId} onValueChange={(v) => setCreateForm((f) => ({ ...f, partnerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Opportunity or initiative name" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>End customer</Label>
              <CompanyPicker
                value={createForm.endCustomer ? { endCustomer: createForm.endCustomer, endCustomerDomain: createForm.endCustomerDomain } : null}
                onChange={(v) => setCreateForm((f) => ({ ...f, endCustomer: v?.endCustomer ?? "", endCustomerDomain: v?.endCustomerDomain ?? "" }))}
                knownCompanies={knownCompanies}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Owner *</Label>
              <Select value={createForm.ownerId} onValueChange={(v) => setCreateForm((f) => ({ ...f, ownerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">All other fields can be edited directly in the grid after adding.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={createOpp.isPending || !createForm.name || !createForm.partnerId || !createForm.ownerId}>
                {createOpp.isPending ? <Loader2 size={14} className="animate-spin" /> : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Won / Lost / Dormant popup */}
      <Dialog open={!!wonLostPopup} onOpenChange={(v) => !v && setWonLostPopup(null)}>
        <DialogContent data-size-key="won-lost-popup" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{wonLostPopup?.label}</DialogTitle>
          </DialogHeader>
          <div className="mt-1 overflow-x-auto max-h-[60vh] overflow-y-auto">
            {wonLostPopup && wonLostPopup.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No items</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stage</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Close Date</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {wonLostPopup?.items.map((o) => (
                    <tr key={o.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2 font-medium">{o.name}</td>
                      <td className="px-3 py-2">
                        <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-medium border", STAGE_COLORS[o.stage] ?? "text-gray-600 bg-gray-50 border-gray-200")}>
                          {STAGE_LABELS[o.stage] ?? o.stage}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {o.revenueValue != null ? fmt(Number(o.revenueValue)) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {o.closeDate ?? (o.closedWonAt ? o.closedWonAt.slice(0, 10) : <span className="opacity-40">—</span>)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          title="View notes"
                          onClick={() => setNotesOpp(o)}
                          className={cn(
                            "p-1 rounded transition-colors",
                            (o.notes?.length ?? 0) > 0
                              ? "text-primary hover:bg-primary/10"
                              : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <MessageSquare size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteOppId} onOpenChange={() => setDeleteOppId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>All MEDDPICC entries will also be deleted.</AlertDialogDescription>
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

// ─── Partner section ──────────────────────────────────────────────────────────

function PartnerSection({ label, rows, users, onOpen, onDelete, onNotes, onContact, onSave, onStageChange, className, sectionVariant }: {
  label: string; rows: any[]; users: any[];
  onOpen: (o: any) => void; onDelete: (o: any) => void; onNotes: (o: any) => void;
  onContact: (id: number, contacts: OppContact[]) => Promise<void>;
  onSave: (id: number, field: string, val: string) => Promise<void>;
  onStageChange: (id: number, stage: string) => Promise<void>;
  className?: string;
  sectionVariant?: "won" | "lost" | "dormant";
}) {
  const headerCls = cn(
    "px-4 py-1.5 text-[10px] font-semibold border-b border-border uppercase tracking-widest",
    sectionVariant === "won" && "text-emerald-700 bg-emerald-50/60",
    sectionVariant === "lost" && "text-red-600 bg-red-50/50",
    sectionVariant === "dormant" && "text-gray-500 bg-gray-50/80",
    !sectionVariant && "text-muted-foreground bg-muted/20",
  );

  return (
    <div className={className}>
      <div className={headerCls}>
        {label} ({rows.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1020px]">
          <thead>
            <tr className="border-b border-border/30 bg-muted/5">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[150px]">Name</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[110px]">Stage</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[50px]">Ctry</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[88px]">Date In</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[150px]">HPE Contacts</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[150px]">Partner Contacts</th>
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground/70 w-[88px]">Revenue</th>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground/70 w-[88px]">Close Date</th>
              <th className="text-center px-2 py-1.5 font-medium text-muted-foreground/70 w-[120px]">MEDDPICC</th>
              <th className="text-center px-2 py-1.5 font-medium text-muted-foreground/70 w-[52px]">Notes</th>
              <th className="w-[72px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <OppRow key={o.id} opp={o} users={users} onOpen={onOpen} onDelete={onDelete} onNotes={onNotes} onContact={onContact} onSave={onSave} onStageChange={onStageChange} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Contacts cell (hover-expand list + add/edit dialog) ───────────────────────

function ContactsCell({ contacts, orgFilter, partnerId, onSave }: {
  contacts: OppContact[];
  orgFilter: string;
  partnerId: number | null;
  onSave: (updated: OppContact[]) => Promise<void>;
}) {
  const filtered = contacts.filter((c) => c.org === orgFilter);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cLocation, setCLocation] = useState("");
  const [cDirectoryRef, setCDirectoryRef] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const createPartnerResource = useCreatePartnerResource();
  const createInternalResource = useCreateInternalResource();
  const updatePartnerResource = useUpdatePartnerResource();
  const updateInternalResource = useUpdateInternalResource();

  const clearLeave = () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); };
  const scheduleClose = () => { leaveTimer.current = setTimeout(() => setPopoverOpen(false), 120); };

  const openAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(null); setCName(""); setCRole(""); setCEmail(""); setCPhone(""); setCLocation(""); setCDirectoryRef(null);
    setDialogOpen(true);
  };

  const openEdit = (c: OppContact, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverOpen(false);
    setEditId(c.id); setCName(c.name); setCRole(c.role ?? ""); setCEmail(c.email ?? ""); setCPhone(c.phone ?? ""); setCLocation(c.location ?? "");
    setCDirectoryRef(c.directoryRef ?? null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await onSave(contacts.filter((c) => c.id !== id));
  };

  // Keep the linked directory record in sync when an edited contact changes
  // (best-effort — the contact itself still saves either way).
  const syncDirectory = async (ref: string) => {
    const patch = { name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null };
    try {
      const [kind, rawId] = ref.split(":");
      const refId = Number(rawId);
      if (kind === "partner" && Number.isFinite(refId)) {
        await updatePartnerResource.mutateAsync({ id: refId, data: patch });
        if (partnerId != null) queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId }) });
      } else if (kind === "internal" && Number.isFinite(refId)) {
        await updateInternalResource.mutateAsync({ id: refId, data: patch });
        queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });
      }
    } catch { /* best-effort sync */ }
  };

  // A brand-new person (not picked from the directory) is also written to the
  // matching central directory so they're findable app-wide from now on.
  const writeBackNew = async (): Promise<string | null> => {
    try {
      if (orgFilter === "Partner" && partnerId != null) {
        const r = await createPartnerResource.mutateAsync({
          data: { partnerId, name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null },
        });
        queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId }) });
        return `partner:${r.id}`;
      }
      if (orgFilter === "HPE") {
        const r = await createInternalResource.mutateAsync({
          data: { name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null },
        });
        queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });
        return `internal:${r.id}`;
      }
    } catch { /* best-effort write-back */ }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    setSaving(true);
    try {
      let updated: OppContact[];
      if (editId) {
        if (cDirectoryRef) await syncDirectory(cDirectoryRef);
        updated = contacts.map((c) => c.id === editId ? { ...c, name: cName, org: orgFilter, role: cRole || null, email: cEmail || null, phone: cPhone || null, location: cLocation || null, directoryRef: cDirectoryRef } : c);
      } else {
        const directoryRef = cDirectoryRef ?? await writeBackNew();
        updated = [...contacts, { id: makeId(), name: cName, org: orgFilter, role: cRole || null, email: cEmail || null, phone: cPhone || null, location: cLocation || null, directoryRef, createdAt: new Date().toISOString() }];
      }
      await onSave(updated);
      setDialogOpen(false);
    } finally { setSaving(false); }
  };

  const summary = filtered.length === 0
    ? null
    : filtered.length === 1
      ? filtered[0].name
      : `${filtered[0].name} +${filtered.length - 1}`;

  const orgLabel = orgFilter === "HPE" ? "HPE" : orgFilter;
  const colorCls = ORG_COLORS[orgFilter] ?? "bg-gray-100 text-gray-600";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <div
            className="flex items-center gap-1 px-1 py-0.5 min-h-[24px] rounded hover:bg-muted/60 transition-colors cursor-default"
            onMouseEnter={() => { clearLeave(); if (filtered.length > 0) setPopoverOpen(true); }}
            onMouseLeave={scheduleClose}
          >
            {summary
              ? <span className="text-xs text-foreground flex-1 truncate">{summary}</span>
              : <span className="text-xs text-muted-foreground/40 flex-1">None</span>
            }
            <button
              type="button"
              onClick={openAdd}
              onMouseEnter={clearLeave}
              className="shrink-0 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title={`Add ${orgLabel} contact`}
            >
              <Plus size={11} />
            </button>
          </div>
        </PopoverTrigger>

        {filtered.length > 0 && (
          <PopoverContent
            side="bottom"
            align="start"
            className="p-2 w-60 space-y-1"
            onMouseEnter={clearLeave}
            onMouseLeave={scheduleClose}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-0.5">{orgLabel} Contacts</p>
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 text-xs group/contact">
                <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium", colorCls)}>{orgLabel}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  {c.role && <p className="text-muted-foreground text-[10px] truncate">{c.role}</p>}
                  {c.email && <p className="text-muted-foreground text-[10px] truncate">{c.email}</p>}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover/contact:opacity-100 transition-opacity shrink-0">
                  <button onClick={(e) => openEdit(c, e)} className="p-0.5 rounded hover:bg-muted" title="Edit"><Pencil size={10} /></button>
                  <button onClick={(e) => handleDelete(c.id, e)} className="p-0.5 rounded hover:bg-muted text-destructive" title="Remove"><Trash2 size={10} /></button>
                </div>
              </div>
            ))}
            <div className="pt-1 border-t border-border space-y-1">
              {(() => {
                const emails = filtered.map((c) => c.email).filter(Boolean) as string[];
                const joined = emails.join(", ");
                if (emails.length === 0) return null;
                return (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(joined).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        });
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy email addresses"
                    >
                      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      <span>{copied ? "Copied!" : "Copy emails"}</span>
                    </button>
                    <span className="text-muted-foreground/30">·</span>
                    <a
                      href={`mailto:${joined}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Open in email client"
                    >
                      <Mail size={11} /><span>Open in email</span>
                    </a>
                  </div>
                );
              })()}
              <button onClick={openAdd} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
                <Plus size={11} /><span>Add {orgLabel} contact</span>
              </button>
            </div>
          </PopoverContent>
        )}
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent data-size-key="dashboard-contact-dialog" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? `Edit ${orgLabel} Contact` : `Add ${orgLabel} Contact`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <PersonTypeahead
                value={cName}
                onChange={(text) => { setCName(text); setCDirectoryRef(null); }}
                onPick={(p) => {
                  setCName(p.name);
                  setCRole(p.role ?? cRole);
                  setCEmail(p.email ?? "");
                  setCPhone(p.phone ?? "");
                  setCLocation(p.location ?? "");
                  setCDirectoryRef(p.source === "internal" || p.source === "partner" ? p.ref : null);
                }}
                scope={orgFilter === "HPE" ? "internal" : "partner"}
                partnerId={orgFilter === "Partner" && partnerId != null ? partnerId : undefined}
                placeholder="Full name"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role / Title</Label>
              <Input value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="e.g. Alliance Director" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+1 555 000 0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={cLocation} onChange={(e) => setCLocation(e.target.value)} placeholder="City, Country" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : (editId ? "Save" : "Add")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function OppRow({ opp, users, onOpen, onDelete, onNotes, onContact, onSave, onStageChange }: {
  opp: any; users: any[];
  onOpen: (o: any) => void; onDelete: (o: any) => void; onNotes: (o: any) => void;
  onContact: (id: number, contacts: OppContact[]) => Promise<void>;
  onSave: (id: number, field: string, val: string) => Promise<void>;
  onStageChange: (id: number, stage: string) => Promise<void>;
}) {
  const save = useCallback((field: string) => async (raw: string) => onSave(opp.id, field, raw), [opp.id, onSave]);
  const noteCount = Array.isArray(opp.notes) ? opp.notes.length : 0;
  const [stageSaving, setStageSaving] = useState(false);
  const isActive = ACTIVE_STAGES.has(opp.stage);

  const handleStage = async (stage: string) => {
    if (stage === opp.stage) return;
    setStageSaving(true);
    try { await onStageChange(opp.id, stage); } finally { setStageSaving(false); }
  };

  const handleWon = async () => {
    if (opp.stage === "ClosedWon") return;
    setStageSaving(true);
    try { await onStageChange(opp.id, "ClosedWon"); } finally { setStageSaving(false); }
  };

  return (
    <tr className="border-b border-border/20 last:border-b-0 hover:bg-muted/10 transition-colors group/row align-top">
      <td className="px-1 py-1"><EditableCell value={opp.name} kind="text" placeholder="Name" onSave={save("name")} /></td>

      {/* Stage selector */}
      <td className="px-1 py-1">
        <div className="relative">
          {stageSaving ? (
            <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 size={11} className="animate-spin" />
            </div>
          ) : (
            <select
              value={opp.stage}
              onChange={(e) => handleStage(e.target.value)}
              className={cn(
                "w-full text-[11px] font-medium px-1.5 py-1 rounded border cursor-pointer appearance-none outline-none",
                "focus:ring-1 focus:ring-primary/30 transition-colors",
                STAGE_COLORS[opp.stage] ?? "text-gray-600 bg-gray-50 border-gray-200"
              )}
            >
              {Object.entries(STAGE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          )}
        </div>
      </td>

      <td className="px-1 py-1"><EditableCell value={opp.country} kind="text" placeholder="US" onSave={save("country")} /></td>
      <td className="px-1 py-1"><EditableCell value={opp.dateIn} kind="date" onSave={save("dateIn")} /></td>
      <td className="px-1 py-0.5">
        <ContactsCell contacts={opp.contacts ?? []} orgFilter="HPE" partnerId={opp.partnerId ?? null} onSave={(contacts) => onContact(opp.id, contacts)} />
      </td>
      <td className="px-1 py-0.5">
        <ContactsCell contacts={opp.contacts ?? []} orgFilter="Partner" partnerId={opp.partnerId ?? null} onSave={(contacts) => onContact(opp.id, contacts)} />
      </td>
      <td className="px-1 py-1">
        <EditableCell value={opp.revenueValue != null ? String(opp.revenueValue) : ""} kind="number" placeholder="$0" align="right"
          display={opp.revenueValue != null ? <span className="font-medium">{fmt(Number(opp.revenueValue))}</span> : undefined}
          onSave={save("revenueValue")} />
      </td>
      <td className="px-1 py-1"><EditableCell value={opp.closeDate} kind="date" onSave={save("closeDate")} /></td>

      {/* MEDDPICC qualification — clickable, opens detail */}
      <td className="px-1 py-1">
        {(() => {
          const score = Number(opp.meddpiccScore ?? 0);
          const band = qualificationBand(score);
          return (
            <button
              onClick={() => onOpen(opp)}
              title={`${band.label} — ${band.blurb}. Open MEDDPICC detail`}
              className={cn(
                "w-full flex items-center gap-1.5 px-1.5 py-1 rounded border transition-colors hover:brightness-95",
                band.bg, band.border
              )}
            >
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", band.dot)} />
              <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", band.bar)} style={{ width: `${score}%` }} />
              </div>
              <span className={cn("text-[11px] font-semibold w-7 text-right", band.text)}>{Math.round(score)}%</span>
            </button>
          );
        })()}
      </td>

      {/* Notes */}
      <td className="px-1 py-1 text-center">
        <button
          onClick={() => onNotes(opp)}
          title={noteCount ? `${noteCount} note${noteCount !== 1 ? "s" : ""}` : "Add notes"}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors",
            noteCount > 0
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
          )}
        >
          <MessageSquare size={11} />
          {noteCount > 0 && <span className="font-medium">{noteCount}</span>}
        </button>
      </td>

      {/* Actions */}
      <td className="px-1 py-1">
        <div className="flex items-center gap-0.5 pt-0.5">
          {/* Closed Won quick button — always visible for active opps */}
          {isActive && (
            <button
              title="Mark as Closed Won"
              onClick={handleWon}
              disabled={stageSaving}
              className="p-1 rounded text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          {/* Hover actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button title="Open detail" onClick={() => onOpen(opp)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
              <ExternalLink size={11} />
            </button>
            <button title="Delete" onClick={() => onDelete(opp)} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
