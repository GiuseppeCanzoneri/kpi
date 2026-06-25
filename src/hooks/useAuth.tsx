import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, RealtimeChannel, Session, User } from "@supabase/supabase-js";
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
  activeAreaId: string | null;
  setActiveAreaId: (areaId: string | null) => void;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserAreaRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);

  const refreshRoles = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user;
    setSession(sessionData.session ?? null);

    if (!currentUser?.email) {
      setRoles([]);
      setActiveAreaId(null);
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
      setActiveAreaId(null);
      return;
    }

    const nextRoles = (data ?? []) as UserAreaRole[];
    setRoles(nextRoles);
    const firstArea = nextRoles.find((r) => r.business_area_id)?.business_area_id ?? null;
    setActiveAreaId((current) => current ?? firstArea);
  }, []);

  useEffect(() => {
    let mounted = true;
    let channel: RealtimeChannel | null = null;

    const start = async () => {
      setLoading(true);
      await refreshRoles();
      if (!mounted) return;
      setLoading(false);
    };

    start();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, newSession: Session | null) => {
      setSession(newSession);
      await refreshRoles();
      setLoading(false);
    });

    channel = supabase
      .channel("kpi-user-area-roles-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_area_roles" }, () => {
        void refreshRoles();
      })
      .subscribe();

    const onFocus = () => { void refreshRoles(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshRoles();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshRoles]);

  const value = useMemo<AuthContextValue>(() => {
    const activeRoles = roles.filter((r) => r.active);
    const isSuperAdmin = activeRoles.some((r) => r.role === "SUPER_ADMIN");
    const isAdminArea = activeRoles.some((r) => r.role === "ADMIN_AREA");
    const canViewAmounts = isSuperAdmin || activeRoles.some((r) => r.can_view_amounts || r.role === "ADMIN_AREA");
    const areaIds = Array.from(new Set(activeRoles.map((r) => r.business_area_id).filter(Boolean))) as string[];

    return {
      session,
      user: session?.user ?? null,
      roles: activeRoles,
      loading,
      isSuperAdmin,
      isAdminArea,
      canViewAmounts,
      areaIds,
      activeAreaId,
      setActiveAreaId,
      refreshRoles,
      signOut: async () => {
        await supabase.auth.signOut();
        setRoles([]);
        setActiveAreaId(null);
      },
    };
  }, [session, roles, loading, activeAreaId, refreshRoles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return ctx;
}

export const useCurrentUserRole = useAuth;
