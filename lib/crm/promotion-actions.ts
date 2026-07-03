"use server";

import { revalidatePath, updateTag } from "next/cache";
import {
  createShopifyDiscount,
  deleteShopifyDiscount,
  hasAdminToken,
  setShopifyDiscountActive,
  updateShopifyDiscount,
  type DiscountFields,
} from "@/lib/shopify/admin";
import { requireAdmin } from "./actions";
import { PROMOTIONS_TAG } from "./promotions";

// Promociones CRM ↔ Shopify. Si falta SHOPIFY_ADMIN_API_TOKEN se guarda igual
// en Supabase y la promo queda "sin sincronizar" (aviso al usuario); el resto
// de la app funciona.

export type PromotionActionState = {
  error?: string;
  ok?: boolean;
  warning?: string;
} | null;

const CODE_RE = /^[A-Z0-9-]{3,40}$/;
const NO_SYNC_WARNING =
  "Guardada en el CRM, pero sin sincronizar con Shopify: configura SHOPIFY_ADMIN_API_TOKEN.";

type ParsedPromotion = {
  type: "general" | "affiliate";
  name: string;
  code: string;
  percentage: number;
  starts_at: string;
  ends_at: string | null;
  affiliate_name: string | null;
  affiliate_commission_pct: number | null;
};

function parseForm(formData: FormData): ParsedPromotion | { error: string } {
  const type = formData.get("type") === "affiliate" ? "affiliate" : "general";
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const percentage = Math.round(Number(formData.get("percentage")));
  const startsDate = String(formData.get("starts_at") ?? "").trim();
  const endsDate = String(formData.get("ends_at") ?? "").trim();
  const affiliateName = String(formData.get("affiliate_name") ?? "").trim();
  const commissionRaw = String(
    formData.get("affiliate_commission_pct") ?? "",
  ).trim();
  const commission = commissionRaw ? Number(commissionRaw) : null;

  if (!name) return { error: "La promoción necesita un nombre." };
  if (!CODE_RE.test(code)) {
    return { error: "Código no válido (3–40 caracteres, A-Z, 0-9 y guiones)." };
  }
  if (!Number.isFinite(percentage) || percentage < 1 || percentage > 100) {
    return { error: "El descuento debe estar entre 1 y 100%." };
  }
  if (type === "affiliate") {
    if (!affiliateName) return { error: "Falta el nombre del afiliado." };
    if (
      commission === null ||
      !Number.isFinite(commission) ||
      commission < 0 ||
      commission > 100
    ) {
      return { error: "La comisión del afiliado debe estar entre 0 y 100%." };
    }
  }

  // Fechas como día completo (Madrid): inicio a las 00:00, fin a las 23:59 CEST.
  const starts_at = startsDate
    ? `${startsDate}T00:00:00+02:00`
    : new Date().toISOString();
  const ends_at = endsDate ? `${endsDate}T23:59:00+02:00` : null;
  if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
    return { error: "La fecha de fin debe ser posterior al inicio." };
  }

  return {
    type,
    name,
    code,
    percentage,
    starts_at,
    ends_at,
    affiliate_name: type === "affiliate" ? affiliateName : null,
    affiliate_commission_pct: type === "affiliate" ? commission : null,
  };
}

function discountFields(p: ParsedPromotion): DiscountFields {
  return {
    title: `${p.type === "affiliate" ? "Afiliado" : "Promo"}: ${p.name} (CRM)`,
    code: p.code,
    percentage: p.percentage,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
    // General (p.ej. lanzamiento): un uso por cliente. Afiliados: sin límite.
    oncePerCustomer: p.type === "general",
  };
}

export async function createPromotion(
  _prev: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  const supabase = await requireAdmin();
  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  let shopifyDiscountId: string | null = null;
  let warning: string | undefined;
  if (hasAdminToken()) {
    try {
      shopifyDiscountId = await createShopifyDiscount(discountFields(parsed));
    } catch (error) {
      return {
        error: `Shopify rechazó el descuento: ${error instanceof Error ? error.message : "error"}`,
      };
    }
  } else {
    warning = NO_SYNC_WARNING;
  }

  const { error } = await supabase.from("promotions").insert({
    ...parsed,
    active: true,
    announce: false,
    shopify_discount_id: shopifyDiscountId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una promoción con ese código."
          : "No se pudo guardar la promoción.",
    };
  }

  updateTag(PROMOTIONS_TAG);
  revalidatePath("/admin/promotions");
  return { ok: true, warning };
}

export async function updatePromotion(
  promotionId: string,
  _prev: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  const supabase = await requireAdmin();
  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  const { data: current } = await supabase
    .from("promotions")
    .select("id, shopify_discount_id")
    .eq("id", promotionId)
    .maybeSingle();
  if (!current) return { error: "La promoción no existe." };

  let shopifyDiscountId = current.shopify_discount_id;
  let warning: string | undefined;
  if (hasAdminToken()) {
    try {
      if (shopifyDiscountId) {
        await updateShopifyDiscount(shopifyDiscountId, discountFields(parsed));
      } else {
        // Sync pendiente de cuando no había token: sanar ahora.
        shopifyDiscountId = await createShopifyDiscount(discountFields(parsed));
      }
    } catch (error) {
      return {
        error: `Shopify rechazó el cambio: ${error instanceof Error ? error.message : "error"}`,
      };
    }
  } else {
    warning = NO_SYNC_WARNING;
  }

  const { error } = await supabase
    .from("promotions")
    .update({ ...parsed, shopify_discount_id: shopifyDiscountId })
    .eq("id", promotionId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una promoción con ese código."
          : "No se pudo guardar la promoción.",
    };
  }

  updateTag(PROMOTIONS_TAG);
  revalidatePath("/admin/promotions");
  return { ok: true, warning };
}

export async function togglePromotionActive(
  promotionId: string,
  active: boolean,
): Promise<PromotionActionState> {
  const supabase = await requireAdmin();
  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, shopify_discount_id")
    .eq("id", promotionId)
    .maybeSingle();
  if (!promotion) return { error: "La promoción no existe." };

  let warning: string | undefined;
  if (promotion.shopify_discount_id && hasAdminToken()) {
    try {
      await setShopifyDiscountActive(promotion.shopify_discount_id, active);
    } catch (error) {
      return {
        error: `Shopify rechazó el cambio: ${error instanceof Error ? error.message : "error"}`,
      };
    }
  } else {
    warning = NO_SYNC_WARNING;
  }

  const { error } = await supabase
    .from("promotions")
    .update({ active })
    .eq("id", promotionId);
  if (error) return { error: "No se pudo guardar el cambio." };

  updateTag(PROMOTIONS_TAG);
  revalidatePath("/admin/promotions");
  return { ok: true, warning };
}

export async function togglePromotionAnnounce(
  promotionId: string,
  announce: boolean,
): Promise<PromotionActionState> {
  const supabase = await requireAdmin();
  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, type")
    .eq("id", promotionId)
    .maybeSingle();
  if (!promotion) return { error: "La promoción no existe." };
  if (promotion.type !== "general") {
    return { error: "Solo las promociones generales se anuncian en la web." };
  }

  const { error } = await supabase
    .from("promotions")
    .update({ announce })
    .eq("id", promotionId);
  if (error) return { error: "No se pudo guardar el cambio." };

  // La barra del storefront lee la promo con cache tag: refresco inmediato.
  updateTag(PROMOTIONS_TAG);
  revalidatePath("/admin/promotions");
  return { ok: true };
}

export async function deletePromotion(
  promotionId: string,
): Promise<PromotionActionState> {
  const supabase = await requireAdmin();
  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, shopify_discount_id")
    .eq("id", promotionId)
    .maybeSingle();
  if (!promotion) return { error: "La promoción no existe." };

  if (promotion.shopify_discount_id && hasAdminToken()) {
    try {
      await deleteShopifyDiscount(promotion.shopify_discount_id);
    } catch (error) {
      return {
        error: `No se pudo borrar en Shopify: ${error instanceof Error ? error.message : "error"}`,
      };
    }
  }

  const { error } = await supabase
    .from("promotions")
    .delete()
    .eq("id", promotionId);
  if (error) return { error: "No se pudo eliminar la promoción." };

  updateTag(PROMOTIONS_TAG);
  revalidatePath("/admin/promotions");
  return { ok: true };
}
