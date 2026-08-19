import * as React from "react";
import { ExternalLink } from "lucide-react";

export interface ParsedNoteSource {
  title: string;
  url: string;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/**
 * Split a note body from its trailing "Sources:" section (as written by the
 * AI macro search) and parse each `• Title — url` line into {title, url}.
 */
export function parseNoteText(text: string): { body: string; sources: ParsedNoteSource[] } {
  const m = text.match(/(?:^|\n)\s*Sources:\s*\n([\s\S]*)$/i);
  if (!m || m.index == null) return { body: text, sources: [] };
  const body = text.slice(0, m.index).trimEnd();
  const sources: ParsedNoteSource[] = [];
  for (const rawLine of m[1].split("\n")) {
    const line = rawLine.replace(/^\s*[•\-*]\s*/, "").trim();
    if (!line) continue;
    const urlMatch = line.match(/(https?:\/\/\S+)/);
    if (urlMatch) {
      const url = urlMatch[1].replace(/[).,]+$/, "");
      const title = line
        .replace(urlMatch[1], "")
        .replace(/\s*[—–-]\s*$/, "")
        .trim();
      sources.push({ title: title || hostOf(url), url });
    } else {
      sources.push({ title: line, url: "" });
    }
  }
  return { body, sources };
}

const URL_SPLIT_RE = /(https?:\/\/[^\s)]+)/g;

/** Replace bare URLs in prose with small clickable hostname links. */
function linkifyBody(body: string): React.ReactNode {
  const parts = body.split(URL_SPLIT_RE);
  if (parts.length === 1) return body;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-violet-600 dark:text-violet-300 hover:underline"
      >
        {hostOf(part)}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/**
 * Render a note body without horizontal overflow: prose wraps, bare URLs
 * become hostname links, and a trailing "Sources:" section is shown as
 * compact clickable attribution links instead of full URLs.
 */
export function NoteText({ text, className }: { text: string; className?: string }) {
  const { body, sources } = React.useMemo(() => parseNoteText(text), [text]);
  return (
    <div className="min-w-0 space-y-1.5">
      <p className={className ?? "text-sm leading-relaxed whitespace-pre-wrap break-words"}>{linkifyBody(body)}</p>
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Sources</span>
          {sources.map((s, i) =>
            s.url ? (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                title={s.title}
                className="inline-flex max-w-[240px] items-center gap-1 text-[11px] text-violet-600 dark:text-violet-300 hover:underline"
              >
                <ExternalLink size={10} className="flex-shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            ) : (
              <span key={i} className="max-w-[240px] truncate text-[11px] text-muted-foreground">{s.title}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
