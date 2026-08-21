import { useState } from "react";
import { resolveCompany } from "@workspace/api-client-react";
import type { CompanyCandidate } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

export type CompanyValue = { endCustomer: string; endCustomerDomain: string };

/** A previously resolved end customer that can be reused without a new AI search. */
export type KnownCompany = CompanyValue & { hint?: string };

const DEFAULT_HINT =
  "AI looks up the real company so it can build corporate context for each MEDDPICC element. Optional.";

export function CompanyPicker({
  value,
  onChange,
  disabled = false,
  searchHint = DEFAULT_HINT,
  knownCompanies = [],
}: {
  value: CompanyValue | null;
  onChange: (value: CompanyValue | null) => void;
  disabled?: boolean;
  searchHint?: string;
  /** Already-resolved companies (e.g. from this partner's other opportunities) offered for one-click reuse. */
  knownCompanies?: KnownCompany[];
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CompanyCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearched(true);
    setError(false);
    try {
      const results = await resolveCompany({ q });
      setCandidates(results);
    } catch {
      setCandidates([]);
      setError(true);
    } finally {
      setSearching(false);
    }
  };

  const select = (c: CompanyCandidate) => {
    onChange({ endCustomer: c.name, endCustomerDomain: c.domain ?? "" });
    setCandidates([]);
    setSearched(false);
    setError(false);
    setQuery("");
  };

  if (value?.endCustomer) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{value.endCustomer}</div>
          {value.endCustomerDomain && (
            <div className="text-[11px] text-muted-foreground truncate">{value.endCustomerDomain}</div>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          title="Clear"
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted flex-shrink-0 disabled:opacity-50"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      {knownCompanies.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Already researched — click to reuse (no new AI search needed):</p>
          <div className="flex flex-wrap gap-1.5">
            {knownCompanies.map((k) => (
              <button
                key={`${k.endCustomer}|${k.endCustomerDomain}`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange({ endCustomer: k.endCustomer, endCustomerDomain: k.endCustomerDomain });
                  setCandidates([]);
                  setSearched(false);
                  setError(false);
                  setQuery("");
                }}
                title={k.hint}
                className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors disabled:opacity-50"
              >
                {k.endCustomer}
                {k.endCustomerDomain && <span className="text-muted-foreground ml-1">{k.endCustomerDomain}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
          placeholder="Search the customer company…"
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={handleSearch} disabled={!query.trim() || searching || disabled}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : "Search"}
        </Button>
      </div>
      {searchHint && <p className="text-[11px] text-muted-foreground">{searchHint}</p>}
      {searching && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 size={12} className="animate-spin" />Searching public sources…</div>
      )}
      {!searching && error && (
        <p className="text-xs text-destructive py-1">Company lookup failed. Please try again.</p>
      )}
      {!searching && !error && searched && candidates.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">No matches found. Try a different name.</p>
      )}
      {candidates.length > 0 && (
        <div className="border border-border rounded-md divide-y divide-border max-h-52 overflow-y-auto">
          {candidates.map((c, i) => (
            <button
              key={`${c.name}-${i}`}
              type="button"
              onClick={() => select(c)}
              className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{c.name}</span>
                {c.domain && <span className="text-[11px] text-muted-foreground">{c.domain}</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {c.industry && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.industry}</span>}
                {c.location && <span className="text-[10px] text-muted-foreground">{c.location}</span>}
              </div>
              {c.description && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
