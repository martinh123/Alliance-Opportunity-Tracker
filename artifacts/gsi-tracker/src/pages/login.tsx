import { useState } from "react";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const loginMutation = useLogin();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await loginMutation.mutateAsync({ data: { email, password } });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-2">Alliance Sales</div>
          <div className="text-2xl font-bold text-sidebar-foreground">GSI Tracker</div>
        </div>
        <div className="space-y-8">
          <blockquote className="text-sidebar-foreground/70 text-lg font-light leading-relaxed">
            "One platform to qualify, track, and close your most complex GSI partner deals — built around MEDDPICC."
          </blockquote>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Pipeline Visibility", desc: "Real-time rollup across all partners" },
              { label: "MEDDPICC Built-in", desc: "8 qualification layers per deal" },
              { label: "Deal Scoring", desc: "Completeness health at a glance" },
              { label: "Partner-centric", desc: "Opportunities & initiatives per GSI" },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-lg bg-sidebar-accent/50 border border-sidebar-border">
                <div className="text-xs font-semibold text-sidebar-primary mb-1">{item.label}</div>
                <div className="text-xs text-sidebar-foreground/60">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-sidebar-foreground/30">
          Built for VP-level alliance &amp; partner sales teams
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">Access your GSI partner pipeline</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin mr-2" />Signing in...</>
              ) : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
