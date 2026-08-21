import { useState } from "react";
import {
  useGetOpportunity,
  useUpdateOpportunity,
  useGetMeddpicc,
  useCreateMeddpiccEntry,
  useUpdateMeddpiccEntry,
  useDeleteMeddpiccEntry,
  useGetCompanyResearch,
  useRefreshCompanyResearch,
  useGetMeddpiccSections,
  useUpdateMeddpiccSection,
  useRefreshCompanyResearchSection,
  getGetOpportunityQueryKey,
  getGetMeddpiccQueryKey,
  getGetCompanyResearchQueryKey,
  getGetMeddpiccSectionsQueryKey,
  useCreatePartnerResource,
  useCreateInternalResource,
  useUpdatePartnerResource,
  useUpdateInternalResource,
  getListPartnerResourcesQueryKey,
  getListInternalResourcesQueryKey,
  useSearchOpportunityMacro,
} from "@workspace/api-client-react";
import type { CompanyResearch, CompanyResearchSection, MeddpiccSectionMeta, OppContact, Note } from "@workspace/api-client-react";
import { SectionPanel } from "@/components/section-workspace";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowLeft, Loader2, Star, UserPlus, Users, Mail, Phone, MapPin, ListChecks, Sparkles, RefreshCw, ExternalLink, Building2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { makeId } from "@/lib/uid";
import { MEDDPICC_META, ELEMENTS, qualificationBand } from "@/lib/meddpicc";
import { CompanyPicker } from "@/components/company-picker";
import { PersonTypeahead } from "@/components/person-typeahead";
import { MacroSearchBox } from "@/components/macro-search";
import { hostOf } from "@/components/note-text";

const STAGE_COLORS: Record<string, string> = {
  Qualify: "bg-slate-400", Discovery: "bg-blue-400", Propose: "bg-indigo-400",
  Negotiate: "bg-amber-400", Commit: "bg-teal-500", ClosedWon: "bg-emerald-500", ClosedLost: "bg-red-400",
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// The element's qualification guidance, rendered as placeholder text INSIDE the
// input box (rather than above it).
function entryPlaceholder(element: string): string {
  const meta = MEDDPICC_META[element];
  if (!meta) return "What did you learn? Capture specifics, names, and numbers.";
  return `${meta.description}\n\nCapture:\n${meta.capture.map((c) => `• ${c}`).join("\n")}\n\nAsk:\n${meta.questions.map((q) => `› ${q}`).join("\n")}`;
}

function contextPlaceholder(element: string): string {
  const meta = MEDDPICC_META[element];
  if (!meta) return "Anything to focus the AI research on for this element.";
  return `What should the AI dig into for ${meta.label}? e.g. ${meta.capture[0]?.toLowerCase()}. Add names, angles, or hypotheses to focus the search.`;
}

export default function OpportunityDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: opp, isLoading: oppLoading } = useGetOpportunity(id, { query: { enabled: !!id, queryKey: getGetOpportunityQueryKey(id) } });
  const { data: meddpicc, isLoading: meddpiccLoading } = useGetMeddpicc(id, { query: { enabled: !!id, queryKey: getGetMeddpiccQueryKey(id) } });
  const { data: research, isLoading: researchLoading } = useGetCompanyResearch(id, { query: { enabled: !!id, queryKey: getGetCompanyResearchQueryKey(id), retry: false } });

  const createEntry = useCreateMeddpiccEntry();
  const updateEntry = useUpdateMeddpiccEntry();
  const deleteEntry = useDeleteMeddpiccEntry();
  const updateOpp = useUpdateOpportunity();
  const refreshResearch = useRefreshCompanyResearch();
  const updateSection = useUpdateMeddpiccSection();
  const refreshSection = useRefreshCompanyResearchSection();
  const createPartnerResource = useCreatePartnerResource();
  const createInternalResource = useCreateInternalResource();
  const updatePartnerResource = useUpdatePartnerResource();
  const updateInternalResource = useUpdateInternalResource();

  const { data: sectionMeta } = useGetMeddpiccSections(id, { query: { enabled: !!id, queryKey: getGetMeddpiccSectionsQueryKey(id) } });
  const sectionMetaByElement = new Map<string, MeddpiccSectionMeta>();
  for (const s of (sectionMeta ?? [])) sectionMetaByElement.set(s.element, s);
  const [refreshingElement, setRefreshingElement] = useState<string | null>(null);

  const [contextDialog, setContextDialog] = useState<{ element: string; section: CompanyResearchSection } | null>(null);
  const [companyDialog, setCompanyDialog] = useState(false);

  const researchByElement = new Map<string, CompanyResearchSection>();
  for (const s of (research?.sections ?? [])) researchByElement.set(s.element, s);

  const handleRefreshResearch = async () => {
    if (!opp?.endCustomer) return;
    try {
      await refreshResearch.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetCompanyResearchQueryKey(id) });
    } catch {
      /* surfaced via mutation error state below */
    }
  };

  const handleCompanyChange = async (value: { endCustomer: string; endCustomerDomain: string } | null) => {
    await updateOpp.mutateAsync({
      id,
      data: {
        endCustomer: value?.endCustomer ?? null,
        endCustomerDomain: value?.endCustomerDomain || null,
      },
    });
    // Changing the end customer clears the stored company research server-side.
    // Drop the cached research entry outright (not just invalidate) so the old
    // company's sections can never render under the new end customer while a
    // refetch is in flight or after it 404s.
    queryClient.removeQueries({ queryKey: getGetCompanyResearchQueryKey(id), exact: true });
    queryClient.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) });
    if (value) setCompanyDialog(false);
  };

  const [openElements, setOpenElements] = useState<Set<string>>(new Set());
  const [teamDialog, setTeamDialog] = useState(false);
  const [entryDialog, setEntryDialog] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<number | null>(null);
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [entryElement, setEntryElement] = useState("");
  const [entryContent, setEntryContent] = useState("");
  const [entryValidated, setEntryValidated] = useState(false);
  const [entryRelevance, setEntryRelevance] = useState(3);

  // Contact state
  const [teamContactsCopied, setTeamContactsCopied] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogSection, setContactDialogSection] = useState<string | null>(null);
  // When set, a contact created from the dialog is assigned as that element's owner.
  const [contactDialogOwnerSection, setContactDialogOwnerSection] = useState<string | null>(null);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cOrg, setCOrg] = useState("HPE");
  const [cRole, setCRole] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cLocation, setCLocation] = useState("");
  // Optional link back to the directory record a contact was picked from.
  const [cDirectoryRef, setCDirectoryRef] = useState<string | null>(null);

  const invalidateMeddpicc = () => {
    queryClient.invalidateQueries({ queryKey: getGetMeddpiccQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) });
  };

  const toggleElement = (el: string) => {
    setOpenElements((prev) => {
      const next = new Set(prev);
      if (next.has(el)) next.delete(el); else next.add(el);
      return next;
    });
  };

  const openCreateEntry = (element: string) => {
    setEditEntryId(null);
    setEntryElement(element);
    setEntryContent("");
    setEntryValidated(false);
    setEntryRelevance(3);
    setEntryDialog(true);
  };

  const openEditEntry = (entry: any) => {
    setEditEntryId(entry.id);
    setEntryElement(entry.element);
    setEntryContent(entry.content);
    setEntryValidated(entry.customerValidated);
    setEntryRelevance(entry.relevanceScore ?? 3);
    setEntryDialog(true);
  };

  const handleEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editEntryId) {
      await updateEntry.mutateAsync({
        id: editEntryId,
        data: { content: entryContent, customerValidated: entryValidated, relevanceScore: entryRelevance },
      });
    } else {
      await createEntry.mutateAsync({
        data: { opportunityId: id, element: entryElement as any, content: entryContent, customerValidated: entryValidated, relevanceScore: entryRelevance },
      });
    }
    invalidateMeddpicc();
    setEntryDialog(false);
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryId) return;
    await deleteEntry.mutateAsync({ id: deleteEntryId });
    invalidateMeddpicc();
    setDeleteEntryId(null);
  };

  const openCreateContact = (section?: string) => {
    setEditContactId(null);
    setContactDialogSection(section ?? null);
    setContactDialogOwnerSection(null);
    setCName(""); setCOrg("HPE"); setCRole(""); setCEmail(""); setCPhone(""); setCLocation("");
    setCDirectoryRef(null);
    setContactDialogOpen(true);
  };

  // Create a brand-new contact and assign it as the given element's owner.
  const openCreateOwner = (element: string) => {
    setEditContactId(null);
    setContactDialogSection(null);
    setContactDialogOwnerSection(element);
    setCName(""); setCOrg("Customer"); setCRole(""); setCEmail(""); setCPhone(""); setCLocation("");
    setCDirectoryRef(null);
    setContactDialogOpen(true);
  };

  const openEditContact = (c: any) => {
    setEditContactId(c.id);
    setContactDialogSection(null);
    setContactDialogOwnerSection(null);
    setCName(c.name ?? ""); setCOrg(c.org ?? "HPE"); setCRole(c.role ?? "");
    setCEmail(c.email ?? ""); setCPhone(c.phone ?? ""); setCLocation(c.location ?? "");
    setCDirectoryRef(c.directoryRef ?? null);
    setContactDialogOpen(true);
  };

  // Picking someone from the directory prefills the contact form and records
  // where they came from (internal:<id> / partner:<id> / contact:<uuid>).
  const applyPickedPerson = (p: { ref: string; source: string; name: string; role?: string | null; email?: string | null; phone?: string | null; location?: string | null; org?: string | null }) => {
    setCName(p.name);
    setCRole((r) => r || p.role || "");
    setCEmail((e) => e || p.email || "");
    setCPhone((ph) => ph || p.phone || "");
    setCLocation((l) => l || p.location || "");
    if (p.source === "internal") setCOrg("HPE");
    else if (p.source === "partner") setCOrg("Partner");
    else if (p.org && ["HPE", "Partner", "Customer", "Other"].includes(p.org)) setCOrg(p.org);
    setCDirectoryRef(p.source === "contact" ? null : p.ref);
  };

  const setSectionOwner = (element: string, ownerId: string | null) => {
    void saveSectionMeta(element, { ownerId });
  };

  const saveSectionMeta = async (element: string, patch: { notes?: Note[]; contactIds?: string[]; ownerId?: string | null }) => {
    // Send only the changed field; the server does a partial update so the other
    // field is never clobbered by stale client state.
    await updateSection.mutateAsync({ id, element: element as any, data: patch });
    queryClient.invalidateQueries({ queryKey: getGetMeddpiccSectionsQueryKey(id) });
  };

  const handleRefreshSection = async (element: string, searchContext: string) => {
    setRefreshingElement(element);
    try {
      await refreshSection.mutateAsync({ id, element: element as any, data: { context: searchContext || null } });
      queryClient.invalidateQueries({ queryKey: getGetCompanyResearchQueryKey(id) });
    } finally {
      setRefreshingElement(null);
    }
  };

  const searchOppMacro = useSearchOpportunityMacro();

  /** Locally-built suggested macro-search context — no AI call involved. */
  const oppMacroSuggestion = (() => {
    if (!opp) return "";
    const company = opp.endCustomer || "the end customer";
    const parts = [
      `Latest financial results, market sentiment, senior leadership changes, major divisions, and strategic initiatives for ${company}`,
    ];
    if (opp.useCase) parts.push(`especially anything related to ${opp.useCase}`);
    if (opp.partnerName) parts.push(`and recent news involving ${opp.partnerName}`);
    return parts.join(", ") + ".";
  })();

  const runOppMacro = async (context: string) => {
    await searchOppMacro.mutateAsync({ id, data: { context } });
    queryClient.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) });
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    const existing: any[] = Array.isArray(opp?.contacts) ? opp!.contacts : [];
    let updated: any[];
    let newContactId: string | null = null;
    if (editContactId) {
      updated = existing.map((c) =>
        c.id === editContactId ? { ...c, name: cName, org: cOrg, role: cRole || null, email: cEmail || null, phone: cPhone || null, location: cLocation || null, directoryRef: cDirectoryRef } : c
      );
      // Keep the linked directory record in sync with the edited contact
      // (best-effort — the contact itself still saves either way).
      if (cDirectoryRef) {
        const patch = { name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null };
        try {
          const [kind, rawId] = cDirectoryRef.split(":");
          const refId = Number(rawId);
          if (kind === "partner" && Number.isFinite(refId)) {
            await updatePartnerResource.mutateAsync({ id: refId, data: patch });
            if (opp?.partnerId != null) queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId: opp.partnerId }) });
          } else if (kind === "internal" && Number.isFinite(refId)) {
            await updateInternalResource.mutateAsync({ id: refId, data: patch });
            queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });
          }
        } catch { /* best-effort sync */ }
      }
    } else {
      newContactId = makeId();
      // A brand-new person (not picked from a directory) is also written to the
      // matching central directory so they're findable app-wide from now on.
      let directoryRef = cDirectoryRef;
      if (!directoryRef && cName.trim()) {
        try {
          if (cOrg === "Partner" && opp?.partnerId != null) {
            const r = await createPartnerResource.mutateAsync({
              data: { partnerId: opp.partnerId, name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null },
            });
            directoryRef = `partner:${r.id}`;
            queryClient.invalidateQueries({ queryKey: getListPartnerResourcesQueryKey({ partnerId: opp.partnerId }) });
          } else if (cOrg === "HPE") {
            const r = await createInternalResource.mutateAsync({
              data: { name: cName.trim(), func: cRole.trim() || null, email: cEmail.trim() || null, phone: cPhone.trim() || null, location: cLocation.trim() || null },
            });
            directoryRef = `internal:${r.id}`;
            queryClient.invalidateQueries({ queryKey: getListInternalResourcesQueryKey() });
          }
        } catch {
          // Directory write-back is best-effort — the contact itself still saves.
        }
      }
      updated = [...existing, { id: newContactId, name: cName, org: cOrg, role: cRole || null, email: cEmail || null, phone: cPhone || null, location: cLocation || null, directoryRef, createdAt: new Date().toISOString() }];
    }
    await updateOpp.mutateAsync({ id, data: { contacts: updated } });
    queryClient.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) });

    // Link a newly created contact to the section it was added from.
    if (newContactId && contactDialogSection) {
      const current = sectionMetaByElement.get(contactDialogSection)?.contactIds ?? [];
      await saveSectionMeta(contactDialogSection, { contactIds: [...current, newContactId] });
    }
    // Assign a newly created contact as the owner of the element it was added for.
    if (newContactId && contactDialogOwnerSection) {
      await saveSectionMeta(contactDialogOwnerSection, { ownerId: newContactId });
    }
    setContactDialogSection(null);
    setContactDialogOwnerSection(null);
    setContactDialogOpen(false);
  };

  const handleDeleteContact = async () => {
    if (!deleteContactId || !opp) return;
    const updated = (opp.contacts ?? []).filter((c: any) => c.id !== deleteContactId);
    await updateOpp.mutateAsync({ id, data: { contacts: updated } });
    queryClient.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) });
    setDeleteContactId(null);
  };

  if (oppLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!opp) {
    return <div className="p-8 text-muted-foreground text-sm">Opportunity not found.</div>;
  }

  const overallScore = Number(meddpicc?.overallScore ?? opp.meddpiccScore ?? 0);
  const band = qualificationBand(overallScore);

  const elementDataByName = new Map<string, any>();
  for (const e of (meddpicc?.elements ?? [])) elementDataByName.set((e as any).element, e);

  const expandElement = (element: string) => {
    setOpenElements((prev) => new Set(prev).add(element));
    // Defer the scroll until the collapsible has rendered its content.
    requestAnimationFrame(() => {
      document.getElementById(`element-${element}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={15} />Back to dashboard
      </button>

      <div className="bg-card border border-card-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs capitalize">{opp.type}</Badge>
              <span className={cn("text-xs px-2 py-0.5 rounded-full text-white font-medium", STAGE_COLORS[opp.stage] || "bg-slate-400")}>{opp.stage}</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">{opp.name}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {opp.partnerName && <span><span className="text-foreground/60">Partner:</span> {opp.partnerName}</span>}
              {opp.endCustomer && <span><span className="text-foreground/60">End customer:</span> {opp.endCustomer}</span>}
              {opp.ownerName && <span><span className="text-foreground/60">Owner:</span> {opp.ownerName}</span>}
              {opp.revenueValue != null && <span><span className="text-foreground/60">Value:</span> {fmt(Number(opp.revenueValue))}</span>}
              {opp.closeDate && <span><span className="text-foreground/60">Close:</span> {opp.closeDate}</span>}
            </div>
            {opp.description && <p className="text-sm text-muted-foreground">{opp.description}</p>}
          </div>

          {/* MEDDPICC Score */}
          <div className={cn("text-center flex-shrink-0 rounded-lg border px-4 py-3", band.bg, band.border)}>
            <div className={cn("text-3xl font-bold", band.text)}>{Math.round(overallScore)}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">MEDDPICC score</div>
            <Progress value={overallScore} className="w-24 h-1.5 mt-2" />
            <div className={cn("mt-2 text-xs font-semibold", band.text)}>{band.label}</div>
            <div className="text-[11px] text-muted-foreground">{band.blurb}</div>
          </div>
        </div>
      </div>

      {/* MEDDPICC snapshot — the clean, at-a-glance digest on landing */}
      <div className="bg-card border border-card-border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">MEDDPICC snapshot</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setTeamDialog(true)}>
              <Users size={12} />Team contacts
              <Badge variant="secondary" className="text-[10px] ml-0.5">{opp.contacts?.length ?? 0}</Badge>
            </Button>
            <span className={cn("text-xs font-semibold", band.text)}>{band.label} · {Math.round(overallScore)}%</span>
          </div>
        </div>
        {meddpiccLoading ? (
          <div className="flex items-center justify-center h-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ELEMENTS.map((element) => {
              const meta = MEDDPICC_META[element];
              const data = elementDataByName.get(element);
              const score = data?.score ?? 0;
              const count = data?.entries?.length ?? 0;
              return (
                <button
                  key={element}
                  onClick={() => expandElement(element)}
                  className="text-left rounded-md border border-card-border bg-background hover:bg-muted/30 transition-colors p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground text-[10px] font-bold flex-shrink-0">{meta.letter}</span>
                    <span className="text-xs font-medium text-foreground truncate">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", qualificationBand(score).bar)} style={{ width: `${score}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground w-7 text-right tabular-nums">{Math.round(score)}%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">{count > 0 ? `${count} entr${count === 1 ? "y" : "ies"}` : "No entries"}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MEDDPICC panels */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">MEDDPICC Qualification</h2>
          {opp.endCustomer ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Building2 size={12} />
                <span className="font-medium text-foreground">{opp.endCustomer}</span>
                {research?.generatedAt && (
                  <span className="text-muted-foreground/70">· updated {new Date(research.generatedAt).toLocaleDateString()}</span>
                )}
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleRefreshResearch} disabled={refreshResearch.isPending} title="Generate AI research for all elements at once">
                <RefreshCw size={12} className={cn(refreshResearch.isPending && "animate-spin")} />
                {research?.generatedAt ? "Refresh all" : "Generate all"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setCompanyDialog(true)} disabled={updateOpp.isPending}>
                <Pencil size={12} />
                Change
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setCompanyDialog(true)} disabled={updateOpp.isPending}>
              <Building2 size={12} />
              Add end customer
            </Button>
          )}
        </div>
        {opp.endCustomer && (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles size={12} className="text-violet-500 mt-0.5 flex-shrink-0" />
            <span>AI research is presentation-only — it helps you focus, but never affects the MEDDPICC score. Only your entries count.</span>
          </div>
        )}
        {refreshResearch.isError && (
          <p className="text-xs text-destructive">Couldn't generate AI research. Please try again.</p>
        )}

        {/* Macro web search on the end customer — result saved as an opportunity note */}
        <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300 flex items-center gap-1.5">
            <Sparkles size={12} />Macro info — {opp.endCustomer || "end customer"} (AI web search)
          </div>
          <MacroSearchBox
            suggestion={oppMacroSuggestion}
            suggestionReason="based on this opportunity's end customer, use case, and partner"
            buttonLabel="Search Macro Info"
            searching={searchOppMacro.isPending}
            disabled={!opp.endCustomer}
            disabledHint={!opp.endCustomer ? "Add an end customer first." : undefined}
            onSearch={runOppMacro}
            successMessage="Summary saved to this opportunity's notes (see Notes on the dashboard)."
          />
        </div>

        {meddpiccLoading ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {ELEMENTS.map((element) => {
              const meta = MEDDPICC_META[element];
              const elementData = meddpicc?.elements?.find((e: any) => e.element === element);
              const entries = elementData?.entries ?? [];
              const elementScore = elementData?.score ?? 0;
              const weight = elementData?.weight ?? 0;
              const isOpen = openElements.has(element);
              const hasEntries = entries.length > 0;

              return (
                <Collapsible key={element} open={isOpen} onOpenChange={() => toggleElement(element)}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between px-4 py-3 bg-card border border-card-border rounded-lg cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                        <div className="flex items-center justify-center w-6 h-6 rounded bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
                          {meta.letter}
                        </div>
                        <span className="text-sm font-medium">{meta.label}</span>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">weight {weight}%</Badge>
                        {hasEntries && (
                          <Badge variant="secondary" className="text-xs">{entries.length} entr{entries.length === 1 ? "y" : "ies"}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {hasEntries ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", qualificationBand(elementScore).bar)}
                                style={{ width: `${elementScore}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(elementScore)}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">No entries</span>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div id={`element-${element}`} className="bg-card border border-t-0 border-card-border rounded-b-lg px-4 pb-4 pt-3 scroll-mt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* LEFT — rep entries (the only thing that scores) */}
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70 flex items-center gap-1.5">
                            <ListChecks size={12} />Micro Focus — your entries
                          </div>
                          {entries.length > 0 ? (
                            <div className="space-y-2">
                              {entries.map((entry: any) => (
                                <div key={entry.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-md group">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground">{entry.content}</p>
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <Checkbox
                                          id={`validated-${entry.id}`}
                                          checked={entry.customerValidated}
                                          onCheckedChange={async (checked) => {
                                            await updateEntry.mutateAsync({ id: entry.id, data: { customerValidated: !!checked } });
                                            invalidateMeddpicc();
                                          }}
                                        />
                                        <label htmlFor={`validated-${entry.id}`} className="text-xs text-muted-foreground cursor-pointer">Customer Validated</label>
                                      </div>
                                      {entry.relevanceScore && (
                                        <div className="flex items-center gap-0.5">
                                          {[1,2,3,4,5].map((s) => (
                                            <Star key={s} size={11} className={cn("fill-current", s <= entry.relevanceScore ? "text-amber-400" : "text-muted-foreground/30")} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEntry(entry)}><Pencil size={12} /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteEntryId(entry.id)}><Trash2 size={12} /></Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground/60 py-2">No entries yet — your qualification notes here drive the MEDDPICC score.</p>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openCreateEntry(element)}>
                            <Plus size={12} />Add {meta.label} entry
                          </Button>
                        </div>

                        {/* RIGHT — section-specific AI research + owner + additional context (presentation only) */}
                        <div className="md:border-l md:border-border md:pl-4">
                          <SectionPanel
                            label={meta.label}
                            reminderContext={{ entityType: "section", entityId: `${opp.id}:${element}`, entityLabel: `${opp.name} — ${meta.label}` }}
                            instructions={contextPlaceholder(element)}
                            endCustomer={opp.endCustomer ?? null}
                            contacts={(opp.contacts ?? []) as OppContact[]}
                            ownerId={sectionMetaByElement.get(element)?.ownerId ?? null}
                            onSetOwner={(ownerId) => setSectionOwner(element, ownerId)}
                            onAddNewOwner={() => openCreateOwner(element)}
                            notes={sectionMetaByElement.get(element)?.notes ?? []}
                            onSaveNotes={(notes) => saveSectionMeta(element, { notes })}
                            entries={entries.map((e: any) => String(e.content ?? ""))}
                            onRefresh={(searchContext) => void handleRefreshSection(element, searchContext)}
                            refreshing={refreshingElement === element}
                            canRefresh={!!opp.endCustomer}
                            research={researchByElement.get(element)}
                            researchLoading={researchLoading}
                            onViewFull={(section) => setContextDialog({ element, section })}
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>

      {/* Team contacts dialog */}
      <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
        <DialogContent data-size-key="opp-team-contacts" className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={15} />Team contacts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {(() => {
                const emails = (opp.contacts as any[] ?? []).map((c: any) => c.email).filter(Boolean) as string[];
                const joined = emails.join(", ");
                if (emails.length === 0) return <span />;
                return (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(joined).then(() => {
                          setTeamContactsCopied(true);
                          setTimeout(() => setTeamContactsCopied(false), 1800);
                        });
                      }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {teamContactsCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      <span>{teamContactsCopied ? "Copied!" : "Copy emails"}</span>
                    </button>
                    <span className="text-muted-foreground/30">·</span>
                    <a
                      href={`mailto:${joined}`}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Mail size={12} /><span>Open in email</span>
                    </a>
                  </div>
                );
              })()}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openCreateContact()}>
                <UserPlus size={12} />Add contact
              </Button>
            </div>
            {(!opp.contacts || opp.contacts.length === 0) ? (
              <p className="text-xs text-muted-foreground/60 text-center py-6">No contacts yet — add HPE, partner, or customer contacts for this opportunity.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(opp.contacts as any[]).map((c: any) => {
                  const orgColor: Record<string, string> = {
                    HPE: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                    Partner: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                    Customer: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                    Other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                  };
                  return (
                    <div key={c.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-md group border border-transparent hover:border-border transition-colors">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", orgColor[c.org] ?? orgColor.Other)}>{c.org}</span>
                        </div>
                        {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail size={10} />{c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone size={10} />{c.phone}</span>}
                          {c.location && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={10} />{c.location}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContact(c)}><Pencil size={12} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteContactId(c.id)}><Trash2 size={12} /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* End customer dialog */}
      <Dialog open={companyDialog} onOpenChange={setCompanyDialog}>
        <DialogContent data-size-key="opp-end-customer" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{opp.endCustomer ? "Change end customer" : "Set end customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 mt-2">
            <CompanyPicker
              value={opp.endCustomer ? { endCustomer: opp.endCustomer, endCustomerDomain: opp.endCustomerDomain ?? "" } : null}
              onChange={handleCompanyChange}
              disabled={updateOpp.isPending}
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Sparkles size={12} className="text-violet-500 mt-0.5 flex-shrink-0" />
              Changing or clearing the end customer removes the saved AI company context. Use Generate afterward to rebuild it for the new company. This never affects your MEDDPICC score.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry dialog */}
      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent data-size-key="meddpicc-entry" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntryId ? "Edit" : "Add"} {MEDDPICC_META[entryElement]?.label} Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEntrySubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Details *</Label>
              <Textarea
                required
                rows={8}
                value={entryContent}
                onChange={(e) => setEntryContent(e.target.value)}
                placeholder={entryPlaceholder(entryElement)}
                autoFocus
                className="resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Relevance (1–5)</Label>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map((s) => (
                  <button key={s} type="button" onClick={() => setEntryRelevance(s)} className="p-0.5">
                    <Star size={20} className={cn("fill-current transition-colors", s <= entryRelevance ? "text-amber-400" : "text-muted-foreground/30")} />
                  </button>
                ))}
                <span className="text-xs text-muted-foreground ml-2">relevance to deal progression</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="customer-validated"
                checked={entryValidated}
                onCheckedChange={(v) => setEntryValidated(!!v)}
              />
              <label htmlFor="customer-validated" className="text-sm cursor-pointer">Customer Validated</label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEntryDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createEntry.isPending || updateEntry.isPending}>
                {(createEntry.isPending || updateEntry.isPending) ? <Loader2 size={15} className="animate-spin" /> : (editEntryId ? "Save" : "Add entry")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent data-size-key="opp-contact-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editContactId
                ? "Edit Contact"
                : contactDialogOwnerSection
                  ? `Add owner for ${MEDDPICC_META[contactDialogOwnerSection]?.label ?? "section"}`
                  : "Add Contact"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <PersonTypeahead
                value={cName}
                onChange={(name) => { setCName(name); setCDirectoryRef(null); }}
                onPick={applyPickedPerson}
                onAddNew={(name) => { setCName(name); setCDirectoryRef(null); }}
                addNewLabel={cOrg === "HPE" || cOrg === "Partner" ? undefined : `Use "${cName.trim()}" as a new contact`}
                partnerId={opp.partnerId}
                placeholder="Full name — matches from your directories prefill the form"
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Organization</Label>
                <Select value={cOrg} onValueChange={setCOrg}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HPE">HPE</SelectItem>
                    <SelectItem value="Partner">Partner</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Role / Title</Label>
                <Input value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="e.g. Alliance Director" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateOpp.isPending}>
                {updateOpp.isPending ? <Loader2 size={15} className="animate-spin" /> : (editContactId ? "Save" : "Add Contact")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete contact confirm */}
      <AlertDialog open={!!deleteContactId} onOpenChange={() => setDeleteContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove contact?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContact} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete entry confirm */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full company-context popup */}
      <Dialog open={!!contextDialog} onOpenChange={(o) => { if (!o) setContextDialog(null); }}>
        <DialogContent data-size-key="research-view-full" className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={15} className="text-violet-500" />
              {contextDialog ? MEDDPICC_META[contextDialog.element]?.label : ""} — company context
            </DialogTitle>
          </DialogHeader>
          {contextDialog && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Building2 size={12} />
                {opp.endCustomer}
                <span className="ml-auto rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5">Presentation only · not scored</span>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed break-words">{contextDialog.section.summary}</p>
              {contextDialog.section.sources.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">Sources</div>
                  {contextDialog.section.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-start gap-1.5 text-xs text-violet-600 dark:text-violet-300 hover:underline"
                    >
                      <ExternalLink size={11} className="mt-0.5 flex-shrink-0" />
                      <span className="truncate max-w-[420px]">{src.title || hostOf(src.url)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
