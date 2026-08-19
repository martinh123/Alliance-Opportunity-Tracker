import { useState, useEffect, useMemo, useRef } from "react";
import {
  useGetProfile,
  useUpdateProfile,
  useGetMe,
  getGetProfileQueryKey,
  exportBackup,
  useImportBackup,
  useClearData,
  type BackupData,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Check, CalendarDays, Download, Upload, Trash2, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const REVENUE_METRICS = ["ACV", "TCV", "ARR", "Bookings"];

function pad2(n: number) { return String(n).padStart(2, "0"); }

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function computeFiscalPreview(fyStartMonthStr: string) {
  const start = Math.max(1, Math.min(12, Number(fyStartMonthStr) || 1));
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const fyStartYear = month >= start ? year : year - 1;
  const fyEndMonth = start === 1 ? 12 : start - 1;
  const fyEndYear = start === 1 ? fyStartYear : fyStartYear + 1;

  const fyStart = `${MONTH_SHORT[start - 1]} 1, ${fyStartYear}`;
  const fyEnd = `${MONTH_SHORT[fyEndMonth - 1]} ${daysInMonth(fyEndYear, fyEndMonth)}, ${fyEndYear}`;
  const fyLabel = `FY${fyStartYear}–${String(fyEndYear).slice(2)}`;

  const monthsIntoFY = (month - start + 12) % 12;
  const qIdx = Math.floor(monthsIntoFY / 3);

  const qStartMonthRaw = start + qIdx * 3;
  const qStartYear = qStartMonthRaw > 12 ? fyStartYear + 1 : fyStartYear;
  const qStartMonth = qStartMonthRaw > 12 ? qStartMonthRaw - 12 : qStartMonthRaw;
  const qEndMonthRaw = qStartMonthRaw + 2;
  const qEndYear = qEndMonthRaw > 12 ? fyStartYear + 1 : fyStartYear;
  const qEndMonth = qEndMonthRaw > 12 ? qEndMonthRaw - 12 : qEndMonthRaw;

  const qLabel = `Q${qIdx + 1}`;
  const qRange = `${MONTH_SHORT[qStartMonth - 1]} ${qStartYear} – ${MONTH_SHORT[qEndMonth - 1]} ${qEndYear}`;

  return { fyStart, fyEnd, fyLabel, qLabel, qRange, fyEndMonth: String(fyEndMonth), qIdx };
}

export default function Profile() {
  const { data: me } = useGetMe();
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  const [revenueMetric, setRevenueMetric] = useState("ACV");
  const [fiscalYearStart, setFiscalYearStart] = useState("1");
  const [quota, setQuota] = useState("");
  const [q1GoalPct, setQ1GoalPct] = useState("25");
  const [q2GoalPct, setQ2GoalPct] = useState("25");
  const [q3GoalPct, setQ3GoalPct] = useState("25");
  const [q4GoalPct, setQ4GoalPct] = useState("25");

  // Re-sync local form state from the server whenever the *server values*
  // change — initial load, remount (navigating away and back), or after a save.
  // Depending on the primitive field values (not the `profile` object reference)
  // means an identical background refetch won't clobber in-progress edits, while
  // a genuine change — including the undefined->value transition on every mount —
  // correctly repopulates the form. The earlier one-time-ref guard skipped this
  // remount repopulation, leaving the controlled Select with no matching value.
  useEffect(() => {
    if (!profile) return;
    setRevenueMetric(profile.revenueMetric || "ACV");
    setFiscalYearStart(profile.fiscalYearStart ? String(profile.fiscalYearStart) : "1");
    setQuota(profile.quota != null ? String(profile.quota) : "");
    setQ1GoalPct(profile.q1GoalPct != null ? String(profile.q1GoalPct) : "25");
    setQ2GoalPct(profile.q2GoalPct != null ? String(profile.q2GoalPct) : "25");
    setQ3GoalPct(profile.q3GoalPct != null ? String(profile.q3GoalPct) : "25");
    setQ4GoalPct(profile.q4GoalPct != null ? String(profile.q4GoalPct) : "25");
  }, [
    profile?.revenueMetric,
    profile?.fiscalYearStart,
    profile?.quota,
    profile?.q1GoalPct,
    profile?.q2GoalPct,
    profile?.q3GoalPct,
    profile?.q4GoalPct,
  ]);

  const isAdmin = me?.role === "admin";
  const importBackupMut = useImportBackup();
  const clearDataMut = useClearData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      a.href = url;
      a.download = `gsi-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Backup exported", description: "Your data was downloaded as a JSON file." });
    } catch {
      toast({ title: "Export failed", description: "Could not export the backup.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupData;
      if (!parsed || typeof parsed !== "object" || typeof parsed.tables !== "object") {
        throw new Error("invalid");
      }
      setPendingImport(parsed);
      setConfirmImport(true);
    } catch {
      toast({ title: "Invalid file", description: "That file is not a valid backup JSON.", variant: "destructive" });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    try {
      await importBackupMut.mutateAsync({ data: pendingImport });
      setConfirmImport(false);
      setPendingImport(null);
      queryClient.clear();
      toast({ title: "Backup restored", description: "All data was replaced from the backup file." });
    } catch {
      toast({ title: "Restore failed", description: "The backup could not be restored.", variant: "destructive" });
    }
  };

  const handleConfirmClear = async () => {
    try {
      await clearDataMut.mutateAsync();
      setConfirmClear(false);
      queryClient.clear();
      toast({ title: "Data cleared", description: "All data was deleted. Your admin account was preserved." });
    } catch {
      toast({ title: "Clear failed", description: "Could not clear the data.", variant: "destructive" });
    }
  };

  const preview = useMemo(() => computeFiscalPreview(fiscalYearStart), [fiscalYearStart]);

  const annualQuota = quota ? Number(quota) : null;
  const qPcts = [Number(q1GoalPct) || 0, Number(q2GoalPct) || 0, Number(q3GoalPct) || 0, Number(q4GoalPct) || 0];
  const totalPct = qPcts.reduce((s, p) => s + p, 0);
  const currentQGoal = annualQuota != null ? annualQuota * (qPcts[preview.qIdx] / 100) : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile.mutateAsync({
      data: {
        revenueMetric: revenueMetric as any,
        fiscalYearStart,
        fiscalYearEnd: preview.fyEndMonth,
        quota: quota ? Number(quota) : null,
        q1GoalPct: Number(q1GoalPct) || 25,
        q2GoalPct: Number(q2GoalPct) || 25,
        q3GoalPct: Number(q3GoalPct) || 25,
        q4GoalPct: Number(q4GoalPct) || 25,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    toast({ title: "Preferences saved", description: "Your pipeline preferences have been updated." });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Profile &amp; Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your revenue tracking and fiscal year preferences</p>
      </div>

      <div className="space-y-6">
        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{me?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{me?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{me?.role}</span>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <form onSubmit={handleSave}>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Preferences</CardTitle>
                <CardDescription className="text-xs">
                  These settings control how revenue is measured and how fiscal periods are calculated across your pipeline.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Revenue Metric</Label>
                  <Select value={revenueMetric} onValueChange={(v) => v && setRevenueMetric(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REVENUE_METRICS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The primary revenue unit used for quota and pipeline reporting</p>
                </div>

                <div className="space-y-2">
                  <Label>Fiscal Year Start Month</Label>
                  <Select value={fiscalYearStart} onValueChange={(v) => v && setFiscalYearStart(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The month your fiscal year begins. The end month is automatically set to one month before this.
                  </p>

                  {/* Live fiscal period preview */}
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 mt-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <CalendarDays size={13} className="text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Effective fiscal periods</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="text-muted-foreground">Fiscal year</div>
                      <div className="font-medium">
                        <span className="text-foreground/60 mr-1.5">{preview.fyLabel}</span>
                        {preview.fyStart} – {preview.fyEnd}
                      </div>
                      <div className="text-muted-foreground">Current quarter</div>
                      <div className="font-medium">
                        <span className="text-foreground/60 mr-1.5">{preview.qLabel}</span>
                        {preview.qRange}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Personal Quota ({revenueMetric})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={quota}
                    onChange={(e) => setQuota(e.target.value)}
                    placeholder="e.g. 5000000"
                  />
                  <p className="text-xs text-muted-foreground">Your individual revenue quota for the fiscal year — used to calculate % attainment on the dashboard</p>
                </div>
              </CardContent>
            </Card>

            {/* Quarterly Goal Split */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quarterly Goal Split</CardTitle>
                <CardDescription className="text-xs">
                  Set what percentage of your annual quota is targeted each quarter. Values don&apos;t need to sum to 100%, but it&apos;s recommended.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { label: "Q1", val: q1GoalPct, set: setQ1GoalPct },
                    { label: "Q2", val: q2GoalPct, set: setQ2GoalPct },
                    { label: "Q3", val: q3GoalPct, set: setQ3GoalPct },
                    { label: "Q4", val: q4GoalPct, set: setQ4GoalPct },
                  ] as const).map(({ label, val, set }) => {
                    const pct = Number(val) || 0;
                    const dollar = annualQuota != null ? annualQuota * pct / 100 : null;
                    return (
                      <div key={label} className="space-y-1">
                        <Label className="text-xs">{label} — % of Annual</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            className="pr-8"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        {dollar != null && (
                          <p className="text-[11px] text-muted-foreground">{fmtCurrency(dollar)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className={`text-xs font-medium ${Math.abs(totalPct - 100) < 0.1 ? "text-emerald-600" : "text-amber-600"}`}>
                    Total: {totalPct.toFixed(1)}%
                  </div>
                  {Math.abs(totalPct - 100) >= 0.1 && (
                    <span className="text-xs text-muted-foreground">(recommend summing to 100%)</span>
                  )}
                </div>
                {currentQGoal != null && (
                  <div className="rounded-md bg-muted/30 border border-border px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Current quarter ({preview.qLabel}) target: </span>
                    <span className="font-semibold text-foreground">{fmtCurrency(currentQGoal)}</span>
                    <span className="text-muted-foreground"> ({qPcts[preview.qIdx]}% of annual)</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button type="submit" disabled={updateProfile.isPending || saved}>
              {updateProfile.isPending ? (
                <><Loader2 size={16} className="animate-spin mr-2" />Saving...</>
              ) : saved ? (
                <><Check size={16} className="mr-2" />Saved</>
              ) : "Save preferences"}
            </Button>
          </div>
        </form>

        {/* Data Management — admin only (exposes all data incl. credentials, destructive) */}
        {isAdmin && (
          <Card className="border-amber-300/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database size={16} className="text-amber-600" />
                Data Management
              </CardTitle>
              <CardDescription className="text-xs">
                Back up, restore, or reset the entire database. These actions affect all users&apos; data and are admin-only.
                Exported files contain sensitive information — store them securely.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Export backup</p>
                  <p className="text-xs text-muted-foreground">
                    Download a complete JSON backup of all data to your computer.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={handleExport} disabled={exporting}>
                  {exporting ? (
                    <><Loader2 size={16} className="animate-spin mr-2" />Exporting...</>
                  ) : (
                    <><Download size={16} className="mr-2" />Export</>
                  )}
                </Button>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Import backup</p>
                  <p className="text-xs text-muted-foreground">
                    Restore from a JSON backup file. This replaces all existing data.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importBackupMut.isPending}
                >
                  {importBackupMut.isPending ? (
                    <><Loader2 size={16} className="animate-spin mr-2" />Restoring...</>
                  ) : (
                    <><Upload size={16} className="mr-2" />Import</>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>

              <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-destructive">Clear all data</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete all opportunities, partners, MEDDPICC data, and rep accounts.
                    Your admin login is preserved.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmClear(true)}
                  disabled={clearDataMut.isPending}
                >
                  {clearDataMut.isPending ? (
                    <><Loader2 size={16} className="animate-spin mr-2" />Clearing...</>
                  ) : (
                    <><Trash2 size={16} className="mr-2" />Clear data</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm restore */}
      <AlertDialog open={confirmImport} onOpenChange={(o) => { if (!o) { setConfirmImport(false); setPendingImport(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently replace ALL current data with the contents of the selected backup file.
              This cannot be undone. Make sure you have exported a current backup first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importBackupMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmImport(); }}
              disabled={importBackupMut.isPending}
            >
              {importBackupMut.isPending ? "Restoring..." : "Replace all data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm clear */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every opportunity, partner, MEDDPICC record, and rep account.
              Only your admin login will remain. This cannot be undone — export a backup first if you may need this data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearDataMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleConfirmClear(); }}
              disabled={clearDataMut.isPending}
            >
              {clearDataMut.isPending ? "Clearing..." : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
