import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  isUserArea: boolean;
  canViewAmounts: boolean;
  areaIds: string[];
  activeAreaId: string | null;
  setActiveAreaId: (areaId: string | null) => void;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadRoles(user: User): Promise<UserAreaRole[]> {
  const email = user.email?.toLowerCase() ?? "";
  if (!email) return [];

  const { data, error } = await supabase
    .from("user_area_roles")
    .select("*")
    .eq("active", true)
    .or(`user_id.eq.${user.id},email.eq.${email}`)
    .order("role", { ascending: true });

  if (error) {
    console.error("[KPI] Errore caricamento ruoli", error);
    return [];
  }

  return (data ?? []) as UserAreaRole[];
}

function getDefaultAreaId(rows: UserAreaRole[]): string | null {
  return rows.find((row) => row.business_area_id)?.business_area_id ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserAreaRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshInProgress = useRef(false);

  const refreshRoles = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;

    try {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;
      if (!mountedRef.current) return;

      setSession(currentSession);

      if (!currentSession?.user) {
        setRoles([]);
        setActiveAreaId(null);
        setLoading(false);
        return;
      }

      const nextRoles = await loadRoles(currentSession.user);
      if (!mountedRef.current) return;

      setRoles(nextRoles);
      setActiveAreaId((current) => {
        if (current && nextRoles.some((role) => role.business_area_id === current || role.role === "SUPER_ADMIN")) {
          return current;
        }
        return getDefaultAreaId(nextRoles);
      });
      setLoading(false);
    } finally {
      refreshInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshRoles();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_OUT") {
        setRoles([]);
        setActiveAreaId(null);
        setLoading(false);
        return;
      }
      window.setTimeout(() => {
        void refreshRoles();
      }, 200);
    });

    const channel = supabase
      .channel("kpi-user-area-roles-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_area_roles" }, () => {
        void refreshRoles();
      })
      .subscribe();

    const refreshOnFocus = () => {
      void refreshRoles();
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void refreshRoles();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [refreshRoles]);

  const value = useMemo<AuthContextValue>(() => {
    const isSuperAdmin = roles.some((role) => role.role === "SUPER_ADMIN");
    const isAdminArea = roles.some((role) => role.role === "ADMIN_AREA");
    const isUserArea = roles.some((role) => role.role === "USER_AREA");
    const canViewAmounts = isSuperAdmin || roles.some((role) => role.can_view_amounts || role.role === "ADMIN_AREA");
    const areaIds = Array.from(new Set(roles.map((role) => role.business_area_id).filter((id): id is string => Boolean(id))));

    return {
      session,
      user: session?.user ?? null,
      roles,
      loading,
      isSuperAdmin,
      isAdminArea,
      isUserArea,
      canViewAmounts,
      areaIds,
      activeAreaId,
      setActiveAreaId,
      refreshRoles,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [activeAreaId, loading, refreshRoles, roles, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export const useCurrentUserRole = useAuth;
