import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { baseUrl } from "@/lib/utils";

// Acortador de enlaces del CRM: /l/<slug> → destino con los UTMs del enlace
// (p. ej. /l/bio para la biografía de Instagram). Los enlaces se gestionan en
// /admin/links; cada visita suma un clic vía register_link_click (un solo
// roundtrip). El proxy deja pasar /l/* sin el rewrite de locales; el idioma
// lo decide después el middleware al aterrizar en el destino.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

  let target = new URL(baseUrl);
  if (clean) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .rpc("register_link_click", { p_slug: clean })
        .maybeSingle();
      if (data?.destination) {
        target = new URL(data.destination, baseUrl);
        const utms = [
          ["utm_source", data.utm_source],
          ["utm_medium", data.utm_medium],
          ["utm_campaign", data.utm_campaign],
          ["utm_term", data.utm_term],
          ["utm_content", data.utm_content],
        ] as const;
        for (const [key, value] of utms) {
          if (value && !target.searchParams.has(key)) {
            target.searchParams.set(key, value);
          }
        }
      }
    } catch {
      // Slug roto o DB caída: a la home sin UTMs antes que un error.
    }
  }
  return NextResponse.redirect(target, 302);
}
