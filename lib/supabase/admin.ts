import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Cliente con la SECRET KEY: ignora RLS. SOLO para código de servidor sin
// usuario (route handlers públicos, webhooks, crons). El panel /admin usa
// lib/supabase/server.ts (sesión del usuario + RLS is_admin).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
