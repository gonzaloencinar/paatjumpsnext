import { NextResponse } from "next/server";
import { syncPacklinkShipments } from "@/lib/crm/packlink-sync";

// Sincronización Packlink PRO → CRM (lib/crm/packlink-sync.ts): Vercel Cron
// cada hora con `Authorization: Bearer CRON_SECRET`. Cada ejecución recorre
// el listado completo (volumen pequeño) y upsertea por referencia, así que
// también re-extrae campos tras un cambio en el extractor.

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await syncPacklinkShipments();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/packlink-sync]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
