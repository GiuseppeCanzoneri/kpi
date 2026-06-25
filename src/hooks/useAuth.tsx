"use client";

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

  const fetchRoles = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("user_area_roles")
      .select("*")
      .eq("active", true)
      .or(`user_id.eq.${userId},email.eq.${email.toLowerCase()}`)
      .order("role", { ascending: true });

    if (error) {
      console.error("[auth] Error fetching roles:", error);
      return [];
    }
    return (data ?? []) as UserAreaRole[];
  }, []);

  const refreshRoles = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    setSession(currentSession);

    if (currentSession?.user) {
      const userRoles = await fetchRoles(currentSession.user.id, currentSession.user.email!);
      setRoles(userRoles);
      
      // Set default active area if not set
      if (!activeAreaId && userRoles.length > 0) {
        const firstArea = userRoles.find(r => r.business_area_id)?.business_area_id;
        if (firstArea) setActiveAreaId(firstArea);
      }
    } else {
      setRoles([]);
      setActiveAreaId(null);
    }
    setLoading(false);
  }, [activeAreaId, fetchRoles]);

  useEffect(() => {
    // Initial session check
    refreshRoles();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        await refreshRoles();
      } else if (event === 'SIGNED_OUT') {
        setRoles([]);
        setActiveAreaId(null);
        setLoading(false);
      }
    });

    // Realtime updates for roles
    const channel = supabase
      .channel('public:user_area_roles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_area_roles' }, () => {
        refreshRoles();
      })
      .subscribe();

    // Refresh on window focus or visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRoles();
    };
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshRoles]);

  const value = useMemo(() => {
    const isSuperAdmin = roles.some(r => r.role === "SUPER_ADMIN");
    const isAdminArea = roles.some(r => r.role === "ADMIN_AREA");
    const canViewAmounts = isSuperAdmin || roles.some(r => r.can_view_amounts || r.role === "ADMIN_AREA");
    const areaIds = Array.from(new Set(roles.map(r => r.business_area_id).filter(Boolean))) as string[];

    return {
      session,
      user: session?.user ?? null,
      roles,
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
      },
    };
  }, [session, roles, loading, activeAreaId, refreshRoles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export const useCurrentUserRole = useAuth;