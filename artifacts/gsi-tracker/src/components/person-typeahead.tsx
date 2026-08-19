import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchPeople, getSearchPeopleQueryKey } from "@workspace/api-client-react";
import type { PersonSearchResult } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Building2, Users, Contact } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_META: Record<string, { label: string; icon: typeof Users }> = {
  internal: { label: "Internal", icon: Users },
  partner: { label: "Partner", icon: Building2 },
  contact: { label: "Contact", icon: Contact },
};

/**
 * App-wide person lookup combobox backed by GET /people/search.
 * Free-text input with a debounced dropdown of directory matches; picking a
 * match emits the full record via onPick, and typing an unknown name offers
 * an "Add as new…" row (onAddNew) so the caller can create a directory entry.
 */
export function PersonTypeahead({
  value,
  onChange,
  onPick,
  onAddNew,
  addNewLabel,
  scope,
  partnerId,
  placeholder = "Type a name…",
  disabled = false,
  autoFocus = false,
  required = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (person: PersonSearchResult) => void;
  /** When provided, an "Add as new…" row appears for unknown names. */
  onAddNew?: (name: string) => void;
  addNewLabel?: string;
  scope?: "all" | "internal" | "partner" | "contact";
  partnerId?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [debounced, setDebounced] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  // Suppress reopening right after a pick until the user types again.
  const pickedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);

  // The server treats an empty query as browse mode (capped alphabetical list
  // for the scope), so focusing an empty field shows existing people right away.
  const browsing = debounced.length === 0;
  const params = { q: debounced, ...(scope ? { scope } : {}), ...(partnerId != null ? { partnerId } : {}), limit: browsing ? 12 : 8 };
  const enabled = open;
  const { data: results = [], isFetching } = useSearchPeople(params, {
    query: { enabled, queryKey: getSearchPeopleQueryKey(params), staleTime: 30_000 },
  });

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const exactMatch = useMemo(
    () => results.some((r) => r.name.trim().toLowerCase() === value.trim().toLowerCase()),
    [results, value]
  );
  const showAddNew = !!onAddNew && value.trim().length >= 2 && !exactMatch;
  const optionCount = results.length + (showAddNew ? 1 : 0);
  const visible = open && (optionCount > 0 || isFetching);

  useEffect(() => setHighlighted(0), [debounced, results.length]);

  const pick = (r: PersonSearchResult) => {
    pickedRef.current = true;
    setOpen(false);
    onPick(r);
  };

  const addNew = () => {
    pickedRef.current = true;
    setOpen(false);
    onAddNew?.(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!visible) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, optionCount - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      if (optionCount > 0) {
        e.preventDefault();
        if (highlighted < results.length) pick(results[highlighted]);
        else if (showAddNew) addNew();
      }
    } else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder}
        onChange={(e) => { pickedRef.current = false; onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (!pickedRef.current) setOpen(true); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {visible && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />Searching…
            </div>
          ) : (
            <>
              {results.map((r, i) => {
                const meta = SOURCE_META[r.source] ?? SOURCE_META.contact;
                const Icon = meta.icon;
                return (
                  <button
                    key={r.ref}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-2 flex items-center gap-2 text-sm",
                      i === highlighted ? "bg-muted" : "hover:bg-muted/60"
                    )}
                    onMouseEnter={() => setHighlighted(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r)}
                  >
                    <Icon size={13} className="text-muted-foreground flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{r.name}</span>
                      {(r.role || r.email) && (
                        <span className="text-xs text-muted-foreground"> · {[r.role, r.email].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                      {r.source === "partner" && r.org ? r.org : meta.label}
                    </Badge>
                  </button>
                );
              })}
              {showAddNew && (
                <button
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 flex items-center gap-2 text-sm border-t border-border",
                    highlighted === results.length ? "bg-muted" : "hover:bg-muted/60"
                  )}
                  onMouseEnter={() => setHighlighted(results.length)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addNew}
                >
                  <UserPlus size={13} className="text-primary flex-shrink-0" />
                  <span className="text-primary font-medium">{addNewLabel ?? `Add "${value.trim()}" as new person…`}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
