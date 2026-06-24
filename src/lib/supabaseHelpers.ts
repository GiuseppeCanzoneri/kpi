import { supabase } from "../integrations/supabase/client";

export async function requireData<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

export async function loadOptions<T>(table: string, select = "*"): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}
