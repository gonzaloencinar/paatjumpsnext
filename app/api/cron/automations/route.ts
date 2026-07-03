import { NextResponse } from "next/server";
import { processAutomations } from "@/lib/crm/automation-engine";
import { processCampaigns } from "@/lib/crm/campaign-engine";

// Runner único del CRM (plan §10 y §16.1): Vercel Cron lo golpea cada minuto
// (vercel.json) con `Authorization: Bearer CRON_SECRET`. Procesa campañas
// (§16.3) y secuencias (§16.4) con un presupuesto de emails compartido; la
// Fase 2 enchufará aquí los triggers de checkout/pedidos.

export const maxDuration = 60; // el presupuesto del tick está dimensionado para caber

const TICK_EMAIL_BUDGET = 50; // 50 × 600 ms ≈ 30 s de envío + overhead de DB

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Campañas primero (cap interno 40); las secuencias usan lo que quede —
    // un blast grande las retrasa unos minutos como mucho, irrelevante para
    // delays de días.
    const campaigns = await processCampaigns();
    const used = campaigns.sent + campaigns.skipped + campaigns.failed;
    const automations = await processAutomations(
      Math.max(0, TICK_EMAIL_BUDGET - used),
    );
    return NextResponse.json({ ok: true, campaigns, automations });
  } catch (error) {
    console.error("[cron/automations]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
