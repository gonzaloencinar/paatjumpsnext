import { NextResponse } from "next/server";
import {
  syncShopifyCustomers,
  syncShopifyOrders,
} from "@/lib/crm/shopify-sync";

// Sincronización Shopify → CRM (lib/crm/shopify-sync.ts): Vercel Cron cada
// 10 minutos con `Authorization: Bearer CRON_SECRET`. Primera ejecución =
// backfill completo (sin cursor); las siguientes son incrementales por
// updated_at. `?full=1` fuerza un resync completo (p. ej. tras añadir campos).

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const full = new URL(request.url).searchParams.get("full") === "1";
  try {
    const orders = await syncShopifyOrders({ full });
    const customers = await syncShopifyCustomers({ full });
    return NextResponse.json({ ok: true, orders, customers });
  } catch (error) {
    console.error("[cron/shopify-sync]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}
