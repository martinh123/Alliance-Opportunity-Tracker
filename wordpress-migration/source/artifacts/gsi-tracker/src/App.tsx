import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import OpportunityDetail from "@/pages/opportunity-detail";
import Partners from "@/pages/partners";
import Outcomes from "@/pages/outcomes";
import Nearby from "@/pages/nearby";
import AdminUsers from "@/pages/admin-users";
import Profile from "@/pages/profile";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't silently refetch user data on window focus — it can clobber
      // in-progress form edits (e.g. the profile fiscal-year selection) with
      // server data before the user has saved.
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        const status = error?.status || error?.response?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

function useAuth() {
  const result = useGetMe({ query: { retry: false, staleTime: 30_000 } as any });
  const isLoading = result.isLoading && result.fetchStatus !== "idle";
  return { user: result.data ?? null, isLoading };
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <AuthLoading />;
  if (!user) return <Redirect to="/login" />;

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function LoginRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (user) return <Redirect to="/dashboard" />;
  return <Login />;
}

function RootRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  return <Redirect to={user ? "/dashboard" : "/login"} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginRoute} />
      <Route path="/" component={RootRoute} />
      <Route path="/dashboard">
        {(params) => <ProtectedRoute component={Dashboard} params={params} />}
      </Route>
      <Route path="/opportunities/:id">
        {(params) => <ProtectedRoute component={OpportunityDetail} params={params} />}
      </Route>
      <Route path="/partners">
        {(params) => <ProtectedRoute component={Partners} params={params} />}
      </Route>
      <Route path="/outcomes">
        {(params) => <ProtectedRoute component={Outcomes} params={params} />}
      </Route>
      <Route path="/nearby">
        {(params) => <ProtectedRoute component={Nearby} params={params} />}
      </Route>
      <Route path="/admin/users">
        {(params) => <ProtectedRoute component={AdminUsers} params={params} />}
      </Route>
      <Route path="/profile">
        {(params) => <ProtectedRoute component={Profile} params={params} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
