import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";

export const PROMOTIONS_TAG = "promotions";

// Los datos viven en Convex (convex/promotions.ts); este módulo adapta los
// docs a la forma legacy (snake_case, ISO, null) que espera el storefront.
// Regla: las queries de Convex no leen el reloj, `now` viaja como argumento.

// Promo general vigente (activa y dentro de fechas). Sin cache: la usa
// /api/subscribe para decidir qué código va en la bienvenida.
export async function getActiveGeneralPromotion() {
  const promo = await convexQuery(api.promotions.activeGeneral, {
    now: Date.now(),
  });
  if (!promo) return null;
  return {
    id: promo._id,
    code: promo.code,
    percentage: promo.percentage,
    ends_at: msToIso(promo.endsAt ?? undefined),
  };
}

// Datos de la promo con este código (tipo + fecha de fin), para: (1) caducar la
// cookie pj_discount cuando termina la promo y (2) decidir si ocultamos la barra
// sticky (afiliado → no pisamos su comisión). null si el código no existe.
export async function getPromotionByCode(code: string) {
  "use cache";
  cacheTag(PROMOTIONS_TAG);
  cacheLife("minutes");

  const promo = await convexQuery(api.promotions.byCode, { code });
  if (!promo) return null;
  return {
    type: promo.type,
    ends_at: msToIso(promo.endsAt ?? undefined),
  };
}

// Promo anunciada en el storefront (toggle `announce` del CRM). Cacheada con
// tag: los toggles del panel hacen updateTag(PROMOTIONS_TAG) y la barra
// aparece/desaparece al momento.
export async function getAnnouncedPromotion() {
  "use cache";
  cacheTag(PROMOTIONS_TAG);
  cacheLife("minutes");

  const promo = await convexQuery(api.promotions.announced, {
    now: Date.now(),
  });
  if (!promo) return null;
  return {
    name: promo.name,
    code: promo.code,
    percentage: promo.percentage,
    ends_at: msToIso(promo.endsAt ?? undefined),
  };
}
