import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";
import { baseUrl } from "@/lib/utils";

// Acortador de enlaces del CRM: /l/<slug> → destino con los UTMs del enlace
// (p. ej. /l/bio para la biografía de Instagram). Los enlaces se gestionan en
// /admin/links; cada visita suma un clic en la misma mutation (un solo
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
      const data = await convexMutation(api.links.resolveAndRegisterClick, {
        slug: clean,
      });
      if (data?.destination) {
        target = new URL(data.destination, baseUrl);
        const utms = [
          ["utm_source", data.utmSource],
          ["utm_medium", data.utmMedium],
          ["utm_campaign", data.utmCampaign],
          ["utm_term", data.utmTerm],
          ["utm_content", data.utmContent],
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
