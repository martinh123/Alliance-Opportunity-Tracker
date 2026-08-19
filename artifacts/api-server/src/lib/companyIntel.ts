import { ai } from "@workspace/integrations-gemini-ai";
import type { CompanyResearchSection, CompanySource } from "@workspace/db";

const MODEL = "gemini-2.5-flash";

const ELEMENT_GUIDANCE: Record<string, string> = {
  metrics:
    "Publicly reported business/financial metrics, growth figures, strategic targets, KPIs or efficiency goals the company has stated that a value case could anchor to.",
  economic_buyer:
    "Likely economic buyers / budget owners: named executives (CEO, CFO, CIO, CISO, COO), their public priorities, and org structure signals.",
  decision_criteria:
    "Publicly stated strategic priorities, technology standards, certifications, or selection criteria the company is known to value.",
  decision_process:
    "Any public signals about how the company makes large purchasing or technology decisions (governance, committees, procurement posture). Only include if substantiated.",
  paper_process:
    "Public signals about procurement, legal, security review, or compliance requirements (e.g. regulated industry obligations). Only include if substantiated.",
  identify_pain:
    "Concrete business challenges, risks, headwinds, transformation initiatives, or pressures evident from news, filings, or the company's own statements.",
  champion:
    "Executives or influencers who publicly advocate for relevant initiatives (digital transformation, security, cloud, AI) and could become internal champions.",
  competition:
    "Known incumbent vendors, technology partners, competitors, or market dynamics relevant to a sales pursuit.",
};

const ALLOWED_ELEMENTS = new Set(Object.keys(ELEMENT_GUIDANCE));

export interface CompanyCandidate {
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  description: string | null;
}

export interface CompanyResearchResult {
  overview: string | null;
  sections: CompanyResearchSection[];
}

/**
 * Escape raw control characters (newlines, tabs, etc.) that appear INSIDE JSON
 * string literals. Gemini frequently returns multi-line text inside string
 * values without escaping, which is invalid JSON and breaks JSON.parse.
 */
function escapeControlCharsInStrings(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = input.charCodeAt(i);
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (code < 0x20) {
        // Raw control char inside a string -> escape it.
        if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(s));
  }
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Try direct parse first (with control-char sanitization fallback).
  try {
    return tryParse(cleaned);
  } catch {
    // Fall back to first {...} or [...] block.
    const objMatch = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (objMatch) {
      return tryParse(objMatch[0]);
    }
    throw new Error("Model did not return valid JSON");
  }
}

function isHttpUrl(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

function normalizeSources(raw: unknown): CompanySource[] {
  if (!Array.isArray(raw)) return [];
  const out: CompanySource[] = [];
  for (const s of raw) {
    if (s && typeof s === "object" && isHttpUrl((s as any).url)) {
      out.push({
        url: (s as any).url,
        title: typeof (s as any).title === "string" && (s as any).title.trim() ? (s as any).title.trim() : (s as any).url,
      });
    }
  }
  // Dedupe by url.
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

function groundingSources(response: any): CompanySource[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: CompanySource[] = [];
  for (const c of chunks) {
    const web = c?.web;
    if (web && isHttpUrl(web.uri)) {
      out.push({ url: web.uri, title: typeof web.title === "string" && web.title.trim() ? web.title.trim() : web.uri });
    }
  }
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

/**
 * Find candidate end-customer companies for a free-text query using Gemini with
 * Google Search grounding so results are grounded in real public information.
 */
export async function resolveCompanies(query: string): Promise<CompanyCandidate[]> {
  const prompt = `A B2B sales rep is searching for a real end-customer corporation by name.
The search text they typed is: "${query}".

Use web search to identify the actual company (or companies) whose NAME matches or closely matches "${query}".
The first result MUST be the company whose name is the closest match to "${query}". Do NOT return unrelated companies or a generic "top companies" list. If "${query}" clearly names one specific company, return that company first, then optionally up to 4 plausible alternatives that could be confused with it (e.g. same-name companies, subsidiaries).

Return ONLY a JSON array (no prose, no markdown fences) of up to 5 real, distinct companies. Each item must be an object with keys:
  "name" (official company name),
  "domain" (primary website domain like "acme.com", or null),
  "industry" (short industry label, or null),
  "location" (HQ city/country, or null),
  "description" (one short sentence, or null).
If you cannot find any credible match, return an empty array [].`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { tools: [{ googleSearch: {} }], temperature: 0, maxOutputTokens: 8192 },
  });

  const text = response.text ?? "";
  if (!text.trim()) return [];

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((c) => c && typeof c === "object" && typeof (c as any).name === "string" && (c as any).name.trim())
    .slice(0, 5)
    .map((c: any) => ({
      name: c.name.trim(),
      domain: typeof c.domain === "string" && c.domain.trim() ? c.domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : null,
      industry: typeof c.industry === "string" && c.industry.trim() ? c.industry.trim() : null,
      location: typeof c.location === "string" && c.location.trim() ? c.location.trim() : null,
      description: typeof c.description === "string" && c.description.trim() ? c.description.trim() : null,
    }));
}

/**
 * Generate per-MEDDPICC-element corporate context for a company using grounded
 * web research. This output is presentation-only and must never influence the
 * weighted MEDDPICC score.
 */
export async function generateCompanyResearch(company: { name: string; domain?: string | null }): Promise<CompanyResearchResult> {
  const elementList = Object.entries(ELEMENT_GUIDANCE)
    .map(([el, guide]) => `- "${el}": ${guide}`)
    .join("\n");

  const target = company.domain ? `${company.name} (${company.domain})` : company.name;

  const prompt = `You are a B2B sales research analyst. Using web search, research the company: ${target}.
Produce corporate context organized by the MEDDPICC qualification framework, to help a sales rep understand the customer.

Only use information that is publicly available and that you can substantiate with a source. Be concise and factual; do NOT invent facts, financials, or names. If you have nothing credible for an element, omit that element entirely.

The MEDDPICC elements and what public context fits each:
${elementList}

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "overview": "2-3 sentence neutral company overview",
  "sections": [
    {
      "element": "<one of: ${Object.keys(ELEMENT_GUIDANCE).join(", ")}>",
      "summary": "concise paragraph of company context for this element",
      "sources": [ { "title": "source title", "url": "https://..." } ]
    }
  ]
}
Include 2-6 sections, only for elements with substantiated public information. Every section should cite at least one real source URL you used.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      // gemini-2.5-flash is a thinking model; thinking tokens count against
      // maxOutputTokens. Cap thinking and give the JSON ample room so it is
      // never truncated mid-object.
      thinkingConfig: { thinkingBudget: 4096 },
      maxOutputTokens: 24576,
    },
  });

  const text = response.text ?? "";
  if (!text.trim()) {
    throw new Error("Empty response from research model");
  }

  const parsed = extractJson(text) as any;
  const fallbackSources = groundingSources(response);

  const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const sections: CompanyResearchSection[] = [];
  const seenElements = new Set<string>();

  for (const s of rawSections) {
    if (!s || typeof s !== "object") continue;
    const element = typeof s.element === "string" ? s.element.trim() : "";
    if (!ALLOWED_ELEMENTS.has(element) || seenElements.has(element)) continue;
    const summary = typeof s.summary === "string" ? s.summary.trim() : "";
    if (!summary) continue;
    let sources = normalizeSources(s.sources);
    if (sources.length === 0) sources = fallbackSources.slice(0, 3);
    seenElements.add(element);
    sections.push({ element, summary, sources });
  }

  if (sections.length === 0) {
    throw new Error("Research produced no usable company context");
  }

  const overview = typeof parsed?.overview === "string" && parsed.overview.trim() ? parsed.overview.trim() : null;
  return { overview, sections };
}

export interface MacroResearchResult {
  summary: string;
  sources: CompanySource[];
}

/**
 * Grounded macro-level research on a company (a GSI partner or an end
 * customer): current financials, analyst/review sentiment, senior management,
 * divisions, and current corporate initiatives and goals. The rep can steer
 * the search with an edited free-text context. Presentation-only — the result
 * is saved as a note and never affects the weighted MEDDPICC score.
 */
export async function generateMacroResearch(
  target: { name: string; domain?: string | null },
  kind: "partner" | "customer",
  context?: string | null,
): Promise<MacroResearchResult> {
  const name = target.name.trim();
  if (!name) throw new Error("No company name to research");
  const label = target.domain ? `${name} (${target.domain})` : name;
  const role = kind === "partner"
    ? "a Global System Integrator (GSI) partner the rep co-sells with"
    : "the end-customer company of a sales opportunity";

  const ctx = (context ?? "").trim();
  const ctxBlock = ctx
    ? `\n\nThe rep provided this search context — treat it as the primary steer for what to research and emphasize:\n"""${ctx}"""`
    : "";

  const prompt = `You are a B2B sales research analyst. Using web search, research the company: ${label}. This company is ${role}.
Produce a concise MACRO briefing covering, where publicly substantiated:
- Current financial performance and outlook (revenue, growth, guidance, recent results)
- Reviews and analyst/market sentiment
- Senior management (key executives, recent leadership changes)
- Major divisions / business units
- Current corporate initiatives, strategy, and stated goals
- Any other significant macro signals (M&A, restructuring, partnerships, headwinds/tailwinds)${ctxBlock}

Only use information that is publicly available and that you can substantiate with a source. Be concise and factual; do NOT invent facts, financials, or names. Omit any topic with nothing credible.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "summary": "the macro briefing as short labeled paragraphs or bullet lines (plain text, no markdown headers)",
  "sources": [ { "title": "source title", "url": "https://..." } ]
}
Cite the real source URLs you used.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 4096 },
      maxOutputTokens: 24576,
    },
  });

  const text = response.text ?? "";
  if (!text.trim()) {
    throw new Error("Empty response from research model");
  }

  // Grounded responses sometimes contain quotes/characters that break strict
  // JSON parsing. Since the shape here is just {summary, sources}, fall back
  // to treating the whole reply as the summary and pulling sources from the
  // grounding metadata rather than failing the request.
  let summary = "";
  let sources: CompanySource[] = [];
  try {
    const parsed = extractJson(text) as any;
    summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
    sources = normalizeSources(parsed?.sources);
  } catch {
    /* fall through to plain-text fallback below */
  }
  if (!summary) {
    summary = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .replace(/^\s*\{\s*"summary"\s*:\s*"?/i, "")
      .replace(/"\s*,\s*"sources"\s*:[\s\S]*$/i, "")
      .replace(/"?\s*\}\s*$/, "")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }
  if (!summary) {
    throw new Error("Research produced no usable macro summary");
  }
  if (sources.length === 0) sources = groundingSources(response).slice(0, 8);

  return { summary, sources };
}

export interface SectionFocusContact {
  name: string;
  role?: string | null;
  org?: string | null;
}

export interface SectionFocus {
  notes?: string | null;
  contacts?: SectionFocusContact[];
  /** The contact designated as owner / key person for this element. */
  owner?: SectionFocusContact | null;
  /** The rep's qualification entries for this element (their findings). */
  entries?: string[];
  /** Rep-edited free-text search context — the primary steer when present. */
  searchContext?: string | null;
}

export function isAllowedElement(element: string): boolean {
  return ALLOWED_ELEMENTS.has(element);
}

/**
 * Regenerate corporate context for a SINGLE MEDDPICC element, focusing the
 * grounded web research using the rep's section notes and the contacts they
 * have associated with the element. Presentation-only — never influences the
 * weighted MEDDPICC score.
 */
export async function generateSectionResearch(
  company: { name: string; domain?: string | null },
  element: string,
  focus: SectionFocus,
): Promise<CompanyResearchSection> {
  if (!ALLOWED_ELEMENTS.has(element)) {
    throw new Error(`Unknown MEDDPICC element: ${element}`);
  }

  const target = company.domain ? `${company.name} (${company.domain})` : company.name;
  const guidance = ELEMENT_GUIDANCE[element];

  const notes = (focus.notes ?? "").trim();
  const contacts = (focus.contacts ?? []).filter((c) => c && c.name && c.name.trim());
  const owner = focus.owner && focus.owner.name && focus.owner.name.trim() ? focus.owner : null;
  const entries = (focus.entries ?? []).map((e) => (e ?? "").trim()).filter(Boolean);

  const fmtPerson = (c: SectionFocusContact) =>
    `${c.name!.trim()}${c.role ? `, ${c.role}` : ""}${c.org ? ` (${c.org})` : ""}`;

  const searchContext = (focus.searchContext ?? "").trim();

  const focusLines: string[] = [];
  if (searchContext) {
    focusLines.push(
      `The rep wrote/edited this search context for this element — treat it as the PRIMARY steer for what to research and emphasize:\n"""${searchContext}"""`,
    );
  }
  if (entries.length > 0) {
    const entryList = entries.map((e) => `- ${e}`).join("\n");
    focusLines.push(
      `The rep's qualification entries for this element (their own findings about this deal). Use these to anchor and focus the research — surface public, substantiated information that supports, validates, or expands on them:\n${entryList}`,
    );
  }
  if (owner) {
    focusLines.push(
      `The person designated as the owner / key person for this element: ${fmtPerson(owner)}. If this is a named individual at the customer (${company.name}), research their public role, background (e.g. whether they were recently hired, their tenure and prior roles), stated priorities, and public statements relevant to this element.`,
    );
  }
  if (notes) {
    focusLines.push(`Additional context the rep added for this element (use it to steer the research toward what matters to this deal):\n"""${notes}"""`);
  }
  if (contacts.length > 0) {
    const contactList = contacts.map((c) => `- ${fmtPerson(c)}`).join("\n");
    focusLines.push(
      `Other people the rep has associated with this element. Where they are named individuals at the customer, research their public role, priorities, and statements relevant to this element:\n${contactList}`,
    );
  }
  const focusBlock = focusLines.length > 0 ? `\n\nFocus context provided by the rep:\n${focusLines.join("\n\n")}` : "";

  const prompt = `You are a B2B sales research analyst. Using web search, research the company: ${target}.
Produce focused, grounded corporate context for ONE MEDDPICC element only.

MEDDPICC element: "${element}".
What public context fits this element: ${guidance}${focusBlock}

Only use information that is publicly available and that you can substantiate with a source. Be concise and factual; do NOT invent facts, financials, or names. Prioritize information that addresses the rep's focus context above when it is relevant and substantiated.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "summary": "concise paragraph of company context for this element",
  "sources": [ { "title": "source title", "url": "https://..." } ]
}
Cite at least one real source URL you used. If you find nothing credible for this element, return {"summary": "", "sources": []}.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 4096 },
      maxOutputTokens: 24576,
    },
  });

  const text = response.text ?? "";
  if (!text.trim()) {
    throw new Error("Empty response from research model");
  }

  const parsed = extractJson(text) as any;
  const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) {
    throw new Error("Research produced no usable company context for this element");
  }

  let sources = normalizeSources(parsed?.sources);
  if (sources.length === 0) sources = groundingSources(response).slice(0, 3);

  return { element, summary, sources };
}
