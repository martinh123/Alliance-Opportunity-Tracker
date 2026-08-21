import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReminders,
  useUpdateReminder,
  getListRemindersQueryKey,
  type Reminder,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { ReminderButton } from "@/components/reminder-button";
import { openActionsPanel } from "@/components/actions-panel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function fmtDue(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Collapsible list of OPEN actions, shown beside Internal Resources on the
 * Partners page. Check off to complete; "View all" opens the Actions panel
 * (which also holds the completed history and full editing).
 */
export function RemindersList() {
  const params = { status: "open" as const };
  const { data: reminders = [], isLoading } = useListReminders(params, {
    query: { queryKey: getListRemindersQueryKey(params) },
  });
  const updateReminder = useUpdateReminder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);

  const now = Date.now();

  const handleComplete = async (r: Reminder) => {
    try {
      await updateReminder.mutateAsync({ id: r.id, data: { completed: true } });
    } catch (err: any) {
      toast({ title: "Could not complete action", description: err?.message || "Please try again.", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
    toast({ title: "Action completed", description: `"${r.name}" moved to Completed — see the Actions panel.` });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <Bell size={15} className="text-muted-foreground" />
          Actions
          <Badge variant="secondary" className="ml-1">{reminders.length}</Badge>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openActionsPanel}
            className="text-[11px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
          >
            View all
          </button>
          <ReminderButton />
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : reminders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No open actions — add one here or from any notes list
            </p>
          ) : (
            <div className="space-y-1.5">
              {reminders.map((r) => {
                const overdue = new Date(r.dueAt).getTime() < now;
                return (
                  <div key={r.id} className="group flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleComplete(r)}
                      title="Mark as done"
                      className="mt-0.5 flex-shrink-0 h-[16px] w-[16px] rounded-full border border-muted-foreground/40 hover:border-emerald-500 hover:text-emerald-500 text-transparent flex items-center justify-center transition-colors"
                    >
                      <Check size={10} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <p className={cn("text-[11px]", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {overdue ? "Overdue · " : "Due "}{fmtDue(r.dueAt)}
                      </p>
                      {r.entityLabel && (
                        <p className="text-[11px] text-muted-foreground truncate">↳ {r.entityLabel}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
