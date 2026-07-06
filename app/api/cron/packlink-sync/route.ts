import { NextResponse } from "next/server";
import {
  pushPacklinkFulfillments,
  syncGeneiShipments,
  syncPacklinkShipments,
} from "@/lib/crm/packlink-sync";

// Sincronización Packlink PRO + Genei → CRM (lib/crm/packlink-sync.ts):
// Vercel Cron cada 10 min con `Authorization: Bearer CRON_SECRET`. Cada
// ejecución recorre el listado completo de Packlink (volumen pequeño) y
// upsertea por referencia, así que también re-extrae campos tras un cambio en
// el extractor; después refresca los envíos Genei no finales. Por último
// empuja a Shopify los fulfillments de las etiquetas ya compradas (tracking
// incluido).

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await syncPacklinkShipments();
    const genei = await syncGeneiShipments();
    const fulfillments = await pushPacklinkFulfillments();
    return NextResponse.json({
      ok: true,
      ...result,
      geneiSynced: genei.synced,
      ...fulfillments,
    });
  } catch (error) {
    console.error("[cron/packlink-sync]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
