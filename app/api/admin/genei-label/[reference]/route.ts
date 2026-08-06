import { api } from "@/convex/_generated/api";
import { convexQuery } from "@/lib/convex/server";
import { getGeneiLabelPdf } from "@/lib/crm/genei";
import { createClient } from "@/lib/supabase/server";

// Etiqueta PDF de un envío Genei: su API solo la da en base64 (sin URL
// pública como Packlink), así que el sync la sube a Convex File Storage
// (labelStorageId) y el admin la sirve inline desde aquí. Si aún no se ha
// subido (compra muy reciente), respaldo con la API de Genei en vivo. Mismo
// control de acceso que las server actions (sesión + is_admin).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return new Response("No autorizado", { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    return new Response("No autorizado", { status: 403 });
  }

  const { reference } = await params;

  let pdf: ArrayBuffer | Uint8Array | null = null;
  const storedUrl = await convexQuery(api.shipments.labelUrl, { reference });
  if (storedUrl) {
    const stored = await fetch(storedUrl);
    if (stored.ok) pdf = await stored.arrayBuffer();
  }
  if (!pdf) pdf = await getGeneiLabelPdf(reference);
  if (!pdf) {
    return new Response("La etiqueta aún no está disponible.", { status: 404 });
  }
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiqueta-genei-${reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
