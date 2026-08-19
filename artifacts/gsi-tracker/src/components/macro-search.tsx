import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Globe2, RotateCcw, Sparkles } from "lucide-react";

/**
 * Editable AI macro-search context box. The textarea is prefilled with a
 * locally-built suggestion (no AI call) and clearly labeled as suggested;
 * the rep can edit it freely before running the grounded search.
 * All AI output is presentation-only and never affects the MEDDPICC score.
 */
export function MacroSearchBox({
  suggestion,
  suggestionReason,
  buttonLabel,
  onSearch,
  searching,
  disabled = false,
  disabledHint,
  rows = 3,
  successMessage,
}: {
  /** Locally-built suggested context (from data already in the app). */
  suggestion: string;
  /** One-line static reason shown next to the "Suggested" label. */
  suggestionReason: string;
  buttonLabel: string;
  onSearch: (context: string) => Promise<void>;
  searching: boolean;
  disabled?: boolean;
  disabledHint?: string;
  rows?: number;
  /** Shown after a successful search (e.g. where the note landed). */
  successMessage?: string;
}) {
  // null = untouched (track the live suggestion); string = rep-edited.
  const [editedText, setEditedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const value = editedText ?? suggestion;
  const isSuggested = editedText === null;

  const handleSearch = async () => {
    setError(null);
    setSucceeded(false);
    try {
      await onSearch(value.trim());
      setSucceeded(true);
    } catch (e: any) {
      const msg = typeof e?.error === "string" ? e.error
        : typeof e?.message === "string" && !/fetch/i.test(e.message) ? e.message
        : "Macro search failed. Please try again.";
      setError(msg);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          {isSuggested ? (
            <>
              <Sparkles size={11} className="text-violet-500" />
              <span><span className="font-medium text-violet-600 dark:text-violet-300">Suggested</span> — {suggestionReason}. Edit freely before searching.</span>
            </>
          ) : (
            <span>Edited search context</span>
          )}
        </span>
        {!isSuggested && (
          <button
            type="button"
            onClick={() => setEditedText(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw size={10} />Reset to suggestion
          </button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setEditedText(e.target.value)}
        rows={rows}
        className="text-xs resize-y"
        disabled={searching}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground/70">Uses public web search only — presentation-only, never affects the score.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 flex-shrink-0"
          onClick={handleSearch}
          disabled={searching || disabled || !value.trim()}
          title={disabled ? disabledHint : undefined}
        >
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Globe2 size={12} />}
          {searching ? "Searching…" : buttonLabel}
        </Button>
      </div>
      {searching && <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Running grounded web research — this can take up to a minute.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {succeeded && !searching && successMessage && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{successMessage}</p>}
      {disabled && disabledHint && <p className="text-[11px] text-muted-foreground/70">{disabledHint}</p>}
    </div>
  );
}
