import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../integrations/supabase/client";
import type { UserAreaRole } from "../types/db";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: UserAreaRole[];
  loading: boolean;
  isSuperAdmin: boolean;
  isAdminArea: boolean;
  canViewAmounts: boolean;
  areaIds: string[];
  activeRoleLabel: string;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserAreaRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshRoles = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData.session;
    const currentUser = currentSession?.user ?? null;
    setSession(currentSession ?? null);

    if (!currentUser?.email) {
      setRoles([]);
      return;
    }

    const email = currentUser.email.toLowerCase();
    const { data, error } = await supabase
      .from("user_area_roles")
      .select("*")
      .eq("active", true)
      .or(`user_id.eq.${currentUser.id},email.eq.${email}`)
      .order("role", { ascending: true });

    if (error) {
      console.error("Errore caricamento ruoli", error);
      setRoles([]);
      return;
    }

    setRoles((data ?? []) as UserAreaRole[]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      await refreshRoles();
      if (mounted) setLoading(false);
    };

    boot();

    const { data: listener } = supabase.auth.onAuthStateChange(async () => {
      await refreshRoles();
      if (mounted) setLoading(false);
    });

    const onFocus = () => refreshRoles();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshRoles();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const channel = supabase
      .channel("user-area-roles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_area_roles" }, () => {
        refreshRoles();
      })
      .subscribe();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [refreshRoles]);

  const value = useMemo<AuthContextValue>(() => {
    const activeRoles = roles.filter((r) => r.active);
    const isSuperAdmin = activeRoles.some((r) => r.role === "SUPER_ADMIN");
    const isAdminArea = activeRoles.some((r) => r.role === "ADMIN_AREA");
    const canViewAmounts = isSuperAdmin || activeRoles.some((r) => r.can_view_amounts || r.role === "ADMIN_AREA");
    const areaIds = activeRoles.map((r) => r.business_area_id).filter(Boolean) as string[];
    const activeRoleLabel = isSuperAdmin ? "SUPER_ADMIN" : isAdminArea ? "ADMIN_AREA" : activeRoles.length ? "USER_AREA" : "NESSUN RUOLO";

    return {
      session,
      user: session?.user ?? null,
      roles: activeRoles,
      loading,
      isSuperAdmin,
      isAdminArea,
      canViewAmounts,
      areaIds,
      activeRoleLabel,
      refreshRoles,
      signOut: async () => {
        await supabase.auth.signOut();
        setRoles([]);
        setSession(null);
      },
    };
  }, [session, roles, loading, refreshRoles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return ctx;
}
