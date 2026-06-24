import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserAreaRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshRoles = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user;
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
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await refreshRoles();
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      await refreshRoles();
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const activeRoles = roles.filter((r) => r.active);
    const isSuperAdmin = activeRoles.some((r) => r.role === "SUPER_ADMIN");
    const isAdminArea = activeRoles.some((r) => r.role === "ADMIN_AREA");
    const canViewAmounts = isSuperAdmin || activeRoles.some((r) => r.can_view_amounts || r.role === "ADMIN_AREA");
    const areaIds = activeRoles.map((r) => r.business_area_id).filter(Boolean) as string[];

    return {
      session,
      user: session?.user ?? null,
      roles: activeRoles,
      loading,
      isSuperAdmin,
      isAdminArea,
      canViewAmounts,
      areaIds,
      refreshRoles,
      signOut: async () => {
        await supabase.auth.signOut();
        setRoles([]);
      },
    };
  }, [session, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return ctx;
}
