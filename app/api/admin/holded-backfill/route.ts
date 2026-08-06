import { NextResponse } from "next/server";
import { backfillOldOrders, previewOldOrders } from "@/lib/holded/receipts";

// Backfill de tickets de venta en Holded para pedidos históricos (anteriores
// a HOLDED_AUTO_SINCE). NO envía emails. Idempotente: el estado por pedido
// vive en order_invoices. Protegido con CRON_SECRET (mismo patrón que los
// crons) para poder lanzarlo por curl:
//   GET /api/admin/holded-backfill?dry=1        → vista previa (no toca Holded)
//   GET /api/admin/holded-backfill?limit=30     → emite de verdad
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const limit = Number(url.searchParams.get("limit") ?? "30");

  try {
    if (dry) {
      const previews = await previewOldOrders(limit);
      return NextResponse.json({ ok: true, dry: true, previews });
    }
    const results = await backfillOldOrders(limit);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("[admin/holded-backfill]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
