// Per-partner accent palette — deterministic by partner position so each
// partner card/table row is visually distinct across the app.
const PARTNER_ACCENTS = [
  { border: "border-l-blue-500", bg: "bg-blue-50/60 dark:bg-blue-950/20", chip: "bg-blue-600", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { border: "border-l-violet-500", bg: "bg-violet-50/60 dark:bg-violet-950/20", chip: "bg-violet-600", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { border: "border-l-emerald-500", bg: "bg-emerald-50/60 dark:bg-emerald-950/20", chip: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { border: "border-l-amber-500", bg: "bg-amber-50/60 dark:bg-amber-950/20", chip: "bg-amber-600", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { border: "border-l-rose-500", bg: "bg-rose-50/60 dark:bg-rose-950/20", chip: "bg-rose-600", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { border: "border-l-cyan-500", bg: "bg-cyan-50/60 dark:bg-cyan-950/20", chip: "bg-cyan-600", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { border: "border-l-fuchsia-500", bg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20", chip: "bg-fuchsia-600", text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
  { border: "border-l-lime-600", bg: "bg-lime-50/60 dark:bg-lime-950/20", chip: "bg-lime-600", text: "text-lime-700 dark:text-lime-300", dot: "bg-lime-500" },
];

export function partnerAccent(index: number) {
  return PARTNER_ACCENTS[((index % PARTNER_ACCENTS.length) + PARTNER_ACCENTS.length) % PARTNER_ACCENTS.length];
}

export function partnerInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
