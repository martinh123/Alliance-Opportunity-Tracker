import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Handshake,
  Trophy,
  MapPin,
  LogOut,
  Settings,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionsPanel, useOpenActionCounts, OPEN_ACTIONS_EVENT } from "@/components/actions-panel";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Partners", href: "/partners", icon: Handshake },
  { label: "Outcomes", href: "/outcomes", icon: Trophy },
  { label: "Nearby", href: "/nearby", icon: MapPin },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [actionsOpen, setActionsOpen] = useState(false);
  const { needsAttention, overdue, open: openCount } = useOpenActionCounts();

  // Anything in the app can open the panel via openActionsPanel()
  useEffect(() => {
    const handler = () => setActionsOpen(true);
    window.addEventListener(OPEN_ACTIONS_EVENT, handler);
    return () => window.removeEventListener(OPEN_ACTIONS_EVENT, handler);
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("gsi.sidebarCollapsed") === "true";
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("gsi.sidebarCollapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync(undefined as any);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.clear();
    window.location.href = "/login";
  };

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-200 overflow-hidden",
          collapsed ? "w-14" : "w-60"
        )}
      >
        {/* Logo / Toggle */}
        <div className={cn("flex items-center border-b border-sidebar-border", collapsed ? "justify-center py-4 px-2" : "px-4 py-4 gap-3")}>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">Alliance Sales</div>
              <div className="text-sm font-bold text-sidebar-foreground tracking-tight">GSI Tracker</div>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors flex-shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 py-3 space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
          {/* Actions — always visible, opens the slide-out panel */}
          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            className={cn(linkClass(false), "w-full relative", collapsed && "justify-center px-0")}
            title={collapsed ? "Actions" : undefined}
          >
            <span className="relative flex-shrink-0">
              <Bell size={16} />
              {needsAttention > 0 && collapsed && (
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white",
                  overdue > 0 ? "bg-red-500" : "bg-amber-500",
                )}>
                  {needsAttention > 9 ? "9+" : needsAttention}
                </span>
              )}
            </span>
            {!collapsed && (
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span>Actions</span>
                {needsAttention > 0 ? (
                  <span className={cn(
                    "ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white",
                    overdue > 0 ? "bg-red-500" : "bg-amber-500",
                  )}>
                    {needsAttention > 99 ? "99+" : needsAttention}
                  </span>
                ) : openCount > 0 ? (
                  <span className="ml-auto text-[10px] text-sidebar-foreground/40">{openCount}</span>
                ) : null}
              </span>
            )}
          </button>

          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(linkClass(active), collapsed && "justify-center px-0")}
                title={collapsed ? label : undefined}
              >
                <Icon size={16} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}

          {user?.role === "admin" && (
            <Link
              href="/admin/users"
              className={cn(linkClass(isActive("/admin/users")), collapsed && "justify-center px-0")}
              title={collapsed ? "Users" : undefined}
            >
              <Users size={16} className="flex-shrink-0" />
              {!collapsed && <span>Users</span>}
            </Link>
          )}
        </nav>

        {/* Bottom */}
        <div className={cn("py-3 border-t border-sidebar-border space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
          <Link
            href="/profile"
            className={cn(linkClass(isActive("/profile")), collapsed && "justify-center px-0")}
            title={collapsed ? "Profile & Settings" : undefined}
          >
            <Settings size={16} className="flex-shrink-0" />
            {!collapsed && <span>Profile & Settings</span>}
          </Link>

          {!collapsed && (
            <div className="px-3 py-2">
              <div className="text-xs text-sidebar-foreground/50 truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground/30 truncate">{user?.email}</div>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
              collapsed ? "justify-center px-0" : "justify-start gap-3 px-3"
            )}
            onClick={handleLogout}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>

      <ActionsPanel open={actionsOpen} onOpenChange={setActionsOpen} />
    </div>
  );
}
