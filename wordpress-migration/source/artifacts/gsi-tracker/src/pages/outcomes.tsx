import { useMemo, useState } from "react";
import { useListOpportunities, useListPartners } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { partnerAccent, partnerInitials } from "@/lib/partner-accent";
import { Trophy, XCircle, Moon, ExternalLink, Loader2 } from "lucide-react";

type Tab = "won" | "lost" | "dormant";

const TABS: { key: Tab; label: string; stage: string; icon: typeof Trophy; activeCls: string; sumCls: string }[] = [
  { key: "won", label: "Closed Won", stage: "ClosedWon", icon: Trophy, activeCls: "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300", sumCls: "text-emerald-700 dark:text-emerald-300" },
  { key: "lost", label: "Closed Lost", stage: "ClosedLost", icon: XCircle, activeCls: "border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-300", sumCls: "text-red-600 dark:text-red-300" },
  { key: "dormant", label: "Dormant", stage: "Dormant", icon: Moon, activeCls: "border-gray-400 text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300", sumCls: "text-gray-600 dark:text-gray-300" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const rv = (o: any) => (o.revenueValue != null ? Number(o.revenueValue) : 0);

export default function Outcomes() {
  const { data: partners = [] } = useListPartners();
  const { data: allOpps = [], isLoading } = useListOpportunities({});
  const [tab, setTab] = useState<Tab>("won");
  const [, setLocation] = useLocation();

  const tabDef = TABS.find((t) => t.key === tab)!;

  const byPartner = useMemo(() => {
    return partners.map((p, idx) => {
      const items = (allOpps as any[]).filter((o) => o.partnerId === p.id && o.stage === tabDef.stage);
      return { partner: p, idx, items, sum: items.reduce((s, o) => s + rv(o), 0) };
    }).filter((g) => g.items.length > 0);
  }, [partners, allOpps, tabDef.stage]);

  const totalCount = byPartner.reduce((s, g) => s + g.items.length, 0);
  const totalSum = byPartner.reduce((s, g) => s + g.sum, 0);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-foreground">Opportunity Outcomes</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Won, lost, and dormant opportunities grouped by GSI partner</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = (allOpps as any[]).filter((o) => o.stage === t.stage).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                tab === t.key ? t.activeCls : "border-border text-muted-foreground hover:bg-muted/40"
              )}
            >
              <Icon size={13} />
              {t.label}
              <span className="text-[10px] font-semibold opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Totals */}
      <div className="bg-card border border-card-border rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
        <span className="text-muted-foreground">{tabDef.label} total:{" "}
          <span className={cn("font-semibold", tabDef.sumCls)}>{totalCount} opportunit{totalCount === 1 ? "y" : "ies"}</span>
        </span>
        <span className="text-muted-foreground">Revenue:{" "}
          <span className={cn("font-semibold", tabDef.sumCls)}>{totalSum > 0 ? fmt(totalSum) : "—"}</span>
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : byPartner.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <tabDef.icon size={32} className="mx-auto mb-3 opacity-30" />
          <p>No {tabDef.label.toLowerCase()} opportunities yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {byPartner.map(({ partner, idx, items, sum }) => {
            const accent = partnerAccent(idx);
            return (
              <div key={partner.id} className={cn("bg-card border border-card-border rounded-lg overflow-hidden border-l-4", accent.border)}>
                <div className={cn("flex items-center justify-between px-4 py-2.5", accent.bg)}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold text-white", accent.chip)}>
                      {partnerInitials(partner.name)}
                    </span>
                    <span className={cn("font-semibold text-sm", accent.text)}>{partner.name}</span>
                    <span className="text-xs text-muted-foreground">{items.length} {tabDef.label.toLowerCase()}</span>
                  </div>
                  <span className={cn("text-xs font-semibold", tabDef.sumCls)}>{sum > 0 ? fmt(sum) : "—"}</span>
                </div>
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground/70">Name</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground/70">Type</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground/70">End Customer</th>
                        <th className="text-right px-3 py-1.5 font-medium text-muted-foreground/70">Revenue</th>
                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground/70">Close Date</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o) => (
                        <tr key={o.id} className="border-b border-border/20 last:border-b-0 hover:bg-muted/10 transition-colors">
                          <td className="px-3 py-2 font-medium">{o.name}</td>
                          <td className="px-3 py-2 text-muted-foreground capitalize">{o.type}</td>
                          <td className="px-3 py-2 text-muted-foreground">{o.endCustomer ?? <span className="opacity-40">—</span>}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {o.revenueValue != null ? fmt(Number(o.revenueValue)) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">
                            {o.closeDate ?? (o.closedWonAt ? String(o.closedWonAt).slice(0, 10) : <span className="opacity-40">—</span>)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              title="Open detail"
                              onClick={() => setLocation(`/opportunities/${o.id}`)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
