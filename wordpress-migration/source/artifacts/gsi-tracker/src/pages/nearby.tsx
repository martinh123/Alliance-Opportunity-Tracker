import { useState } from "react";
import { useFindNearbyPeople, getFindNearbyPeopleQueryKey } from "@workspace/api-client-react";
import type { FindNearbyPeopleParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, MapPin, Mail, Users, Building2, Contact, SearchX, Navigation } from "lucide-react";

const SOURCE_META: Record<string, { label: string; icon: typeof Users }> = {
  internal: { label: "Internal", icon: Users },
  partner: { label: "Partner", icon: Building2 },
  contact: { label: "Contact", icon: Contact },
};

function errorMessage(err: unknown): string {
  const e = err as any;
  const msg = e?.errorData?.error ?? e?.data?.error ?? e?.body?.error;
  if (typeof msg === "string" && msg) return msg;
  return "Search failed. Please try again.";
}

export default function Nearby() {
  const [origin, setOrigin] = useState("");
  const [radiusText, setRadiusText] = useState("100");
  const [unit, setUnit] = useState<"mi" | "km">("mi");
  const [params, setParams] = useState<FindNearbyPeopleParams | null>(null);

  const { data, error, isFetching } = useFindNearbyPeople(params ?? { origin: "", radius: 0 }, {
    query: {
      enabled: params != null,
      queryKey: getFindNearbyPeopleQueryKey(params ?? { origin: "", radius: 0 }),
      retry: false,
      staleTime: 60_000,
      refetchOnMount: false,
    },
  });

  const radius = Number(radiusText);
  const canSearch = origin.trim().length > 0 && Number.isFinite(radius) && radius > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    setParams({ origin: origin.trim(), radius, unit });
  };

  const results = data?.results ?? [];
  const unresolved = data?.unresolved ?? [];

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-foreground">Nearby Contacts</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Find contacts across all directories within a distance of a destination
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px] space-y-1.5">
            <Label htmlFor="nearby-origin" className="text-xs">Destination</Label>
            <Input
              id="nearby-origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder={'City, state, or country — e.g. "NYC"'}
              autoFocus
            />
          </div>
          <div className="w-24 space-y-1.5">
            <Label htmlFor="nearby-radius" className="text-xs">Within</Label>
            <Input
              id="nearby-radius"
              type="number"
              min={1}
              value={radiusText}
              onChange={(e) => setRadiusText(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unit</Label>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["mi", "km"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "px-3 h-9 text-xs font-medium transition-colors",
                    unit === u ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={!canSearch || isFetching} className="gap-2">
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            Search
          </Button>
        </div>
      </form>

      {isFetching && (
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-4 py-3">
          <Loader2 size={14} className="animate-spin flex-shrink-0" />
          Looking up contact locations — the first search can take a minute while places are resolved.
        </div>
      )}

      {!isFetching && error != null && (
        <div className="flex items-center gap-2.5 text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-3">
          <SearchX size={14} className="flex-shrink-0" />
          {errorMessage(error)}
        </div>
      )}

      {!isFetching && data && (
        <>
          <div className="bg-card border border-card-border rounded-lg px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{results.length}</span> contact{results.length !== 1 ? "s" : ""} within{" "}
            <span className="font-semibold text-foreground">{params?.radius} {data.unit}</span> of{" "}
            <span className="font-semibold text-foreground">{data.origin.name}</span>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              <MapPin size={24} className="mx-auto mb-2 opacity-30" />
              No contacts within this radius — try a larger distance
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
              {results.map((r) => {
                const meta = SOURCE_META[r.source] ?? SOURCE_META.contact;
                const Icon = meta.icon;
                return (
                  <div key={r.ref} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon size={15} className="text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{r.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.source === "internal" ? "Internal" : r.org ?? meta.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[r.role, r.location].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-muted rounded px-2 py-0.5">
                        <MapPin size={11} className="text-muted-foreground" />
                        {r.distance} {data.unit}
                      </span>
                      {r.email ? (
                        <a
                          href={`mailto:${r.email}`}
                          title={`Email ${r.name} (${r.email})`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Mail size={13} />
                          Email
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">No email</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unresolved.length > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-4 py-3 space-y-1">
              <div className="font-medium text-foreground">
                Couldn't place {unresolved.reduce((s, u) => s + u.count, 0)} contact{unresolved.reduce((s, u) => s + u.count, 0) !== 1 ? "s" : ""} — these locations weren't recognized:
              </div>
              <div>
                {unresolved.map((u) => `"${u.location}" (${u.count})`).join(", ")}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
