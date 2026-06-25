import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://afvadcljctwduhoskccl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmdmFkY2xqY3R3ZHVob3NrY2NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTYwOTksImV4cCI6MjA5Nzg3MjA5OX0.Z2_vSgGPV5YHK6aQ8e1dB81N-M19GbgIofygV1uvybI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const isSupabaseConfigured = true;