import { getGeneiLabelPdf } from "@/lib/crm/genei";
import { createClient } from "@/lib/supabase/server";

// Etiqueta PDF de un envío Genei: su API solo la da en base64 (sin URL
// pública como Packlink), así que el admin la descarga aquí y la sirve
// inline. Mismo control de acceso que las server actions (sesión + is_admin).

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
  const pdf = await getGeneiLabelPdf(reference);
  if (!pdf) {
    return new Response("La etiqueta aún no está disponible.", { status: 404 });
  }
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiqueta-genei-${reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
