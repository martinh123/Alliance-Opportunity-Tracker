import { useEffect, useRef, useState } from "react";
import type { OppContact, CompanyResearchSection, Note } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { NotesEditor } from "@/components/notes-editor";
import type { ReminderContext } from "@/components/reminder-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, RefreshCw, Loader2, Sparkles, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const ORG_COLOR: Record<string, string> = {
  HPE: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Partner: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Customer: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const NONE = "__none__";

/** Locally-built suggested search context for a section refresh — no AI call. */
function buildSectionSuggestion(
  label: string,
  endCustomer: string | null,
  entries: string[],
  ownerName: string | null,
  noteTexts: string[],
): string {
  const company = endCustomer || "the end customer";
  const parts: string[] = [`${label} research for ${company}.`];
  if (entries.length > 0) {
    const anchors = entries.slice(0, 2).map((e) => (e.length > 120 ? `${e.slice(0, 120)}…` : e));
    parts.push(`Anchor on what we already know: ${anchors.join(" | ")}`);
  }
  if (ownerName) parts.push(`Key person: ${ownerName}.`);
  if (noteTexts.length > 0) {
    const hints = noteTexts.slice(0, 2).map((t) => (t.length > 100 ? `${t.slice(0, 100)}…` : t));
    parts.push(`Focus areas: ${hints.join(" | ")}`);
  }
  return parts.join(" ");
}

/**
 * Right-hand panel for one MEDDPICC element: the section-specific AI research
 * result plus the controls that focus it — an owner (key person), free-text
 * additional context, and the AI refresh trigger. Everything here is
 * presentation-only and NEVER affects the weighted MEDDPICC score.
 */
export function SectionPanel({
  label,
  reminderContext = null,
  instructions,
  endCustomer,
  contacts,
  ownerId,
  onSetOwner,
  onAddNewOwner,
  notes,
  onSaveNotes,
  entries = [],
  onRefresh,
  refreshing,
  canRefresh,
  research,
  researchLoading,
  onViewFull,
}: {
  label: string;
  reminderContext?: ReminderContext | null;
  instructions: string;
  endCustomer: string | null;
  contacts: OppContact[];
  ownerId: string | null;
  onSetOwner: (id: string | null) => void;
  onAddNewOwner: () => void;
  notes: Note[];
  onSaveNotes: (notes: Note[]) => void | Promise<void>;
  /** Rep entry contents for this element — used to build the suggested search context. */
  entries?: string[];
  onRefresh: (searchContext: string) => void;
  refreshing: boolean;
  canRefresh: boolean;
  research: CompanyResearchSection | undefined;
  researchLoading: boolean;
  onViewFull: (section: CompanyResearchSection) => void;
}) {
  const owner = ownerId ? contacts.find((c) => c.id === ownerId) ?? null : null;

  // Local optimistic copy so each add/edit/delete is derived from the freshest
  // state (not a stale server prop), and saves are serialized to avoid races.
  const [localNotes, setLocalNotes] = useState<Note[]>(notes);
  const pendingRef = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  // Adopt server state only when we have no in-flight save (else we'd clobber
  // an optimistic update with a stale refetch).
  useEffect(() => {
    if (pendingRef.current === 0) setLocalNotes(notes);
  }, [notes]);

  // Editable search context: null = untouched (tracks the live suggestion).
  const [editedContext, setEditedContext] = useState<string | null>(null);
  const suggestion = buildSectionSuggestion(
    label,
    endCustomer,
    entries,
    owner?.name ?? null,
    localNotes.map((n) => n.text),
  );
  const contextValue = editedContext ?? suggestion;

  const handleNotesChange = (next: Note[]) => {
    setLocalNotes(next);
    pendingRef.current += 1;
    saveChain.current = saveChain.current
      .then(() => onSaveNotes(next))
      .catch(() => {})
      .finally(() => { pendingRef.current -= 1; });
  };

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300 flex items-center gap-1.5">
        <Sparkles size={12} />AI research — {label}
      </div>

      {/* Owner / key person */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">Owner</div>
        <div className="flex items-center gap-1.5">
          <Select
            value={ownerId ?? NONE}
            onValueChange={(v) => onSetOwner(v === NONE ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Select owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs text-muted-foreground">No owner</SelectItem>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}{c.org ? ` · ${c.org}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={onAddNewOwner}>
            <UserPlus size={12} />New
          </Button>
        </div>
        {owner && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground">{owner.name}</span>
            {owner.role && <span className="text-muted-foreground">· {owner.role}</span>}
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", ORG_COLOR[owner.org] ?? ORG_COLOR.Other)}>{owner.org}</span>
          </div>
        )}
      </div>

      {/* Additional context — a list of notes; instructions live inside as placeholder */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">Additional context</div>
        <NotesEditor
          notes={localNotes}
          onChange={handleNotesChange}
          placeholder={instructions}
          compact
          reminder={reminderContext}
        />
      </div>

      {/* Search context + refresh */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">Search context</div>
          {editedContext !== null && (
            <button
              type="button"
              onClick={() => setEditedContext(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RotateCcw size={10} />Reset to suggestion
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1">
          <Sparkles size={11} className="text-violet-500 mt-0.5 flex-shrink-0" />
          {editedContext === null
            ? <span><span className="font-medium text-violet-600 dark:text-violet-300">Suggested</span> — based on your entries, owner &amp; context notes for this element. Edit freely.</span>
            : <span>Edited search context.</span>}
        </p>
        <Textarea
          value={contextValue}
          onChange={(e) => setEditedContext(e.target.value)}
          rows={3}
          className="text-xs resize-y"
          disabled={refreshing}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Steers the web search for this element. Presentation-only.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => onRefresh(contextValue.trim())}
            disabled={refreshing || !canRefresh}
            title={canRefresh ? undefined : "Set an end customer first"}
          >
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            AI refresh
          </Button>
        </div>
      </div>

      {/* AI result */}
      {(() => {
        if (!endCustomer) {
          return <p className="text-xs text-muted-foreground/60">Add an end customer to this opportunity to generate AI research.</p>;
        }
        if (refreshing) {
          return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" />Researching {endCustomer}…</div>;
        }
        if (researchLoading) {
          return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" />Loading research…</div>;
        }
        if (!research) {
          return <p className="text-xs text-muted-foreground/60">No AI research for this element yet — use AI refresh above.</p>;
        }
        return (
          <div className="rounded-md border border-violet-200/60 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-900/10 p-3 space-y-2">
            <p className="text-sm text-foreground/90 line-clamp-4 break-words">{research.summary}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{research.sources.length} source{research.sources.length !== 1 ? "s" : ""}</span>
              <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-violet-600 dark:text-violet-300 hover:text-violet-700" onClick={() => onViewFull(research)}>
                <Maximize2 size={11} />View full
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
