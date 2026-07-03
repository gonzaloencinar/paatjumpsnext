import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Solo el CRM: la tienda no toca Supabase y no debe pagar este coste.
  matcher: ["/admin/:path*"],
};
