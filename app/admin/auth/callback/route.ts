import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Callback del flujo OAuth (PKCE): intercambia el `code` por la sesión
// y entra al panel. El guard de (panel)/layout aplica la allowlist después.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/admin`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/login?error=google`);
}
