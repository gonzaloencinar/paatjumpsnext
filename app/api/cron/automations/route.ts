import { NextResponse } from "next/server";
import { processCampaigns } from "@/lib/crm/campaign-engine";

// Runner único del CRM (plan §10 y §16.1): Vercel Cron lo golpea cada minuto
// (vercel.json) con `Authorization: Bearer CRON_SECRET`. Hoy procesa campañas
// (§16.3); la Fase 2 añadirá aquí los enrollments (recuperación de carrito)
// con las mismas garantías — idempotente, re-entrante, lotes pequeños.

export const maxDuration = 60; // el lote del motor está dimensionado para caber

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const campaigns = await processCampaigns();
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    console.error("[cron/automations]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
