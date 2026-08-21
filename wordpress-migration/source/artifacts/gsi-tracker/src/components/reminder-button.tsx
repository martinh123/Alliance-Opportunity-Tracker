import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateReminder,
  useListPartners,
  getListPartnersQueryKey,
  getListRemindersQueryKey,
} from "@workspace/api-client-react";
import type { PersonSearchResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Loader2, Link2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PersonTypeahead } from "@/components/person-typeahead";
import { cn } from "@/lib/utils";

export type ReminderContext = {
  entityType: string;
  entityId: string;
  entityLabel: string;
};

/** Default due value for the datetime picker: tomorrow 9:00 local, formatted for datetime-local. */
function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Map PersonSearchResult.source to the entityType stored on reminders. */
function sourceToEntityType(source: string): string {
  if (source === "internal") return "internal_resource";
  if (source === "partner") return "partner_resource";
  return "contact";
}

/**
 * "Add reminder" button + dialog. Rendered next to every "Add note" button and
 * carries the same association as that notes list (context prop). Due time is
 * set either as an explicit date & time or as N days from now.
 *
 * When context is null the dialog shows Company and Contact pickers so the user
 * can manually link the reminder to any partner or person.
 */
export function ReminderButton({
  context,
  className,
}: {
  context?: ReminderContext | null;
  className?: string;
}) {
  const createReminder = useCreateReminder();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Partners list for the company picker (only fetched when dialog is open).
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: partners = [] } = useListPartners({
    query: { enabled: dialogOpen && !context, queryKey: getListPartnersQueryKey() },
  });

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"datetime" | "days">("datetime");
  const [dueLocal, setDueLocal] = useState(defaultDueLocal());
  const [days, setDays] = useState("1");

  // Entity link state — only used when context is null.
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [contactText, setContactText] = useState("");
  const [contactPicked, setContactPicked] = useState<PersonSearchResult | null>(null);

  const resetLink = () => {
    setSelectedPartnerId(null);
    setContactText("");
    setContactPicked(null);
  };

  const openDialog = () => {
    setName("");
    setNotes("");
    setMode("datetime");
    setDueLocal(defaultDueLocal());
    setDays("1");
    resetLink();
    setDialogOpen(true);
  };

  // Derive the entity fields to send on save.
  const resolvedEntity = (): { entityType: string | null; entityId: string | null; entityLabel: string | null } => {
    if (context) {
      return { entityType: context.entityType, entityId: context.entityId, entityLabel: context.entityLabel };
    }
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

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Reminder name is required", variant: "destructive" });
      return;
    }
    let due: Date;
    if (mode === "datetime") {
      due = new Date(dueLocal);
      if (isNaN(due.getTime())) {
        toast({ title: "Invalid date/time", description: "Pick a valid date and time for the reminder.", variant: "destructive" });
        return;
      }
    } else {
      const n = Number(days);
      if (!Number.isFinite(n) || n <= 0) {
        toast({ title: "Invalid number of days", description: "Enter how many days from now the reminder is due.", variant: "destructive" });
        return;
      }
      due = new Date();
      due.setDate(due.getDate() + Math.round(n));
      due.setHours(9, 0, 0, 0);
    }
    const entity = resolvedEntity();
    try {
      await createReminder.mutateAsync({
        data: {
          name: name.trim(),
          dueAt: due.toISOString(),
          entityType: entity.entityType,
          entityId: entity.entityId,
          entityLabel: entity.entityLabel,
          notes: notes.trim() || null,
        },
      });
    } catch (err: any) {
      toast({
        title: "Could not add reminder",
        description: err?.response?.data?.error || err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
    toast({ title: "Reminder added", description: `"${name.trim()}" — due ${due.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` });
    setDialogOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-2", className)}
        onClick={openDialog}
        title="Add a reminder"
      >
        <Bell size={13} />Add reminder
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-size-key="reminder-dialog" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell size={15} className="text-muted-foreground" />Add Reminder
            </DialogTitle>
            {context?.entityLabel && (
              <p className="text-xs text-muted-foreground">For: {context.entityLabel}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label>Reminder name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Follow up on proposal"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
              />
            </div>

            {/* Company + contact pickers — only shown when there is no auto-context */}
            {!context && (
              <div className="space-y-3 rounded-md border border-border px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Link2 size={11} />
                  Link to (optional)
                </div>

                {/* Contact typeahead — takes priority over company when picked */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact</Label>
                  {contactPicked ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
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
                        // Contact takes precedence — clear company picker
                        setSelectedPartnerId(null);
                      }}
                      scope="all"
                      placeholder="Search contacts…"
                    />
                  )}
                </div>

                {/* Company (partner) select — hidden when a contact is selected */}
                {!contactPicked && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company</Label>
                    <select
                      value={selectedPartnerId ?? ""}
                      onChange={(e) => setSelectedPartnerId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
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

            <div className="space-y-1.5">
              <Label>Due</Label>
              <div className="flex gap-1 rounded-md bg-muted p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => setMode("datetime")}
                  className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors", mode === "datetime" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  Date &amp; time
                </button>
                <button
                  type="button"
                  onClick={() => setMode("days")}
                  className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors", mode === "days" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  Days from now
                </button>
              </div>
              {mode === "datetime" ? (
                <Input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">day{Number(days) === 1 ? "" : "s"} from now (9:00 AM)</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Details (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm resize-none" placeholder="Any context for this action…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={createReminder.isPending || !name.trim()}>
                {createReminder.isPending ? <Loader2 size={15} className="animate-spin" /> : "Add reminder"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
