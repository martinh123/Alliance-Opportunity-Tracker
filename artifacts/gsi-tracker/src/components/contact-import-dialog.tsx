import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  useBulkImportPartnerResources,
  useBulkImportInternalResources,
  getListPartnerResourcesQueryKey,
  getListInternalResourcesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactField = "name" | "func" | "email" | "phone" | "location" | "isManager" | "notes" | "skip";

const FIELD_OPTIONS: { value: ContactField; label: string }[] = [
  { value: "skip", label: "Skip" },
  { value: "name", label: "Name *" },
  { value: "func", label: "Function / Role" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "location", label: "Location" },
  { value: "isManager", label: "Is Manager?" },
  { value: "notes", label: "Notes" },
];

type ParsedRow = Record<string, string>;

interface ContactImportDialogProps {
  mode: "partner" | "internal";
  partnerId?: number;
  partnerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Best-guess auto-mapping from a column header string to a ContactField. */
function autoMap(header: string): ContactField {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^name/.test(h) || h === "fullname" || h === "contactname") return "name";
  if (/email/.test(h)) return "email";
  if (/phone|mobile|tel/.test(h)) return "phone";
  if (/location|city|country|region|geo|office/.test(h)) return "location";
  if (/func|role|title|jobtitle|position|department/.test(h)) return "func";
  if (/manager|ismanager|mgr/.test(h)) return "isManager";
  if (/note|comment|remark|description/.test(h)) return "notes";
  return "skip";
}

function parseFile(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (jsonRows.length === 0) { resolve({ headers: [], rows: [] }); return; }
        const headers: string[] = jsonRows[0].map((h: any) => String(h ?? "").trim()).filter(Boolean);
        const dataRows: ParsedRow[] = jsonRows.slice(1).map((row) => {
          const obj: ParsedRow = {};
          headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
          return obj;
        }).filter((r) => Object.values(r).some((v) => v !== ""));
        resolve({ headers, rows: dataRows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function applyMapping(rows: ParsedRow[], mapping: Record<string, ContactField>) {
  return rows.map((row) => {
    const out: Record<string, string | boolean> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field === "skip") continue;
      const val = (row[header] ?? "").trim();
      if (field === "isManager") {
        out.isManager = /^(1|yes|true|y)$/i.test(val);
      } else if (val) {
        out[field] = val;
      }
    }
    return out;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = "idle" | "mapping" | "importing" | "done";

export function ContactImportDialog({
  mode,
  partnerId,
  partnerName,
  open,
  onOpenChange,
}: ContactImportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkPartner = useBulkImportPartnerResources();
  const bulkInternal = useBulkImportInternalResources();

  const [step, setStep] = useState<Step>("idle");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, ContactField>>({});
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  const reset = () => {
    setStep("idle");
    setHeaders([]);
    setAllRows([]);
    setMapping({});
    setResult(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { headers: h, rows: r } = await parseFile(file);
      if (h.length === 0) {
        toast({ title: "Empty file", description: "No column headers found in the file.", variant: "destructive" });
        return;
      }
      const autoMapping: Record<string, ContactField> = {};
      h.forEach((header) => { autoMapping[header] = autoMap(header); });
      setHeaders(h);
      setAllRows(r);
      setMapping(autoMapping);
      setStep("mapping");
    } catch {
      toast({ title: "Could not read file", description: "Make sure it's a valid .xlsx, .xls, or .csv file.", variant: "destructive" });
    }
  };

  const setFieldFor = (header: string, field: ContactField) => {
    setMapping((prev) => {
      const next = { ...prev };
      // Only one column can map to each non-skip field (except isManager which is boolean)
      if (field !== "skip") {
        for (const [h, f] of Object.entries(next)) {
          if (f === field && h !== header) next[h] = "skip";
        }
      }
      next[header] = field;
      return next;
    });
  };

  const mapped = applyMapping(allRows, mapping);
  const willImport = mapped.filter((r) => r.name && String(r.name).trim());
  const willSkip = mapped.length - willImport.length;
  const hasNameCol = Object.values(mapping).includes("name");

  const handleConfirm = async () => {
    setStep("importing");
    try {
      const rows = willImport.map((r) => ({
        name: String(r.name),
        func: r.func ? String(r.func) : undefined,
        email: r.email ? String(r.email) : undefined,
        phone: r.phone ? String(r.phone) : undefined,
        location: r.location ? String(r.location) : undefined,
        isManager: r.isManager === true,
        notes: r.notes ? String(r.notes) : undefined,
      }));

      let res;
      if (mode === "partner") {
        res = await bulkPartner.mutateAsync({ data: { partnerId: partnerId!, rows } });
        queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId }) });
      } else {
        res = await bulkInternal.mutateAsync({ data: { rows } });
        queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });
      }
      setResult(res);
      setStep("done");
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.response?.data?.error ?? err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
      setStep("mapping");
    }
  };

  const previewRows = mapped.slice(0, 5);
  const previewFields: ContactField[] = ["name", "func", "email", "phone", "location", "isManager", "notes"];
  const usedFields = previewFields.filter((f) => Object.values(mapping).includes(f));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-muted-foreground" />
            Import contacts
            {mode === "partner" && partnerName && (
              <span className="text-sm font-normal text-muted-foreground ml-1">— {partnerName}</span>
            )}
            {mode === "internal" && (
              <span className="text-sm font-normal text-muted-foreground ml-1">— Internal resources</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">

          {/* ── Step: idle ─────────────────────────────────────── */}
          {step === "idle" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="rounded-full border-2 border-dashed border-border p-6">
                <Upload size={28} className="text-muted-foreground" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Select a spreadsheet to import</p>
                <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, and .csv. You'll map columns to fields before importing.</p>
              </div>
              <Button type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-2" />Choose file
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* ── Step: mapping ──────────────────────────────────── */}
          {step === "mapping" && (
            <div className="space-y-5 mt-1">
              <p className="text-xs text-muted-foreground">
                {allRows.length} rows found. Assign each column to a contact field, or skip it.
              </p>

              {/* Column mapping table */}
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[40%]">Spreadsheet column</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-12 text-center"></th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Maps to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {headers.map((header) => (
                      <tr key={header} className={mapping[header] === "skip" ? "opacity-40" : ""}>
                        <td className="px-3 py-2 font-mono text-foreground">{header}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">
                          <ArrowRight size={12} />
                        </td>
                        <td className="px-3 py-2">
                          <Select value={mapping[header] ?? "skip"} onValueChange={(v) => setFieldFor(header, v as ContactField)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && usedFields.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Preview (first {previewRows.length} rows)</p>
                  <div className="rounded-md border border-border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          {usedFields.map((f) => (
                            <th key={f} className="text-left px-3 py-1.5 font-medium text-muted-foreground capitalize">
                              {f === "isManager" ? "Manager?" : f}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewRows.map((row, i) => (
                          <tr key={i} className={!row.name ? "opacity-40" : ""}>
                            {usedFields.map((f) => (
                              <td key={f} className="px-3 py-1.5 text-foreground">
                                {f === "isManager"
                                  ? (row[f] === true ? <Badge variant="secondary" className="text-[10px] px-1.5">Yes</Badge> : <span className="text-muted-foreground">—</span>)
                                  : f === "notes"
                                    ? (String(row[f] ?? "") ? <span className="truncate max-w-[180px] block" title={String(row[f])}>{String(row[f]).slice(0, 40)}{String(row[f]).length > 40 ? "…" : ""}</span> : <span className="text-muted-foreground">—</span>)
                                    : String(row[f] ?? "") || <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-md bg-muted/30 border border-border px-4 py-3 text-sm space-y-1">
                {!hasNameCol && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1.5">
                    <AlertCircle size={13} />Assign a column to "Name" before importing.
                  </p>
                )}
                {hasNameCol && (
                  <>
                    <p className="text-foreground">
                      <span className="font-semibold">{willImport.length}</span> {willImport.length === 1 ? "contact" : "contacts"} will be imported
                    </p>
                    {willSkip > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {willSkip} {willSkip === 1 ? "row" : "rows"} skipped — missing name
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step: importing ────────────────────────────────── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Importing contacts…</p>
            </div>
          )}

          {/* ── Step: done ─────────────────────────────────────── */}
          {step === "done" && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
                <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {result.inserted} {result.inserted === 1 ? "contact" : "contacts"} imported
                </p>
                {result.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">{result.skipped} already existed and were skipped</p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 w-full max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-destructive mb-1">{result.errors.length} row{result.errors.length > 1 ? "s" : ""} had errors:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-between items-center pt-3 border-t border-border mt-2 shrink-0">
          {step === "mapping" && (
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => fileRef.current?.click()}>
              <Upload size={13} className="mr-1.5" />Choose different file
            </Button>
          )}
          {step !== "mapping" && <div />}

          <div className="flex gap-2">
            {step === "done" ? (
              <Button type="button" onClick={() => handleClose(false)}>Done</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
                {step === "mapping" && (
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!hasNameCol || willImport.length === 0}
                  >
                    Import {willImport.length > 0 ? `${willImport.length} contacts` : ""}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Hidden file input for "choose different file" */}
        {step !== "idle" && (
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={handleFileChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}
