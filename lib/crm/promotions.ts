import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const PROMOTIONS_TAG = "promotions";

// Promo general vigente (activa y dentro de fechas). Sin cache: la usa
// /api/subscribe para decidir qué código va en la bienvenida.
export async function getActiveGeneralPromotion() {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("promotions")
    .select("id, code, percentage, ends_at")
    .eq("type", "general")
    .eq("active", true)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// Datos de la promo con este código (tipo + fecha de fin), para: (1) caducar la
// cookie pj_discount cuando termina la promo y (2) decidir si ocultamos la barra
// sticky (afiliado → no pisamos su comisión). null si el código no existe.
export async function getPromotionByCode(code: string) {
  "use cache";
  cacheTag(PROMOTIONS_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("promotions")
    .select("type, ends_at")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// Promo anunciada en el storefront (toggle `announce` del CRM). Cacheada con
// tag: los toggles del panel hacen updateTag(PROMOTIONS_TAG) y la barra
// aparece/desaparece al momento.
export async function getAnnouncedPromotion() {
  "use cache";
  cacheTag(PROMOTIONS_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("promotions")
    .select("name, code, percentage, ends_at")
    .eq("type", "general")
    .eq("active", true)
    .eq("announce", true)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
