"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";
import { requireAdmin, type ActionState } from "@/lib/crm/actions";

// Acciones del acortador de enlaces (/admin/links). El slug es la parte
// visible (paatjumps.com/l/<slug>); destino + UTMs se componen al redirigir
// en app/l/[slug]/route.ts. Los checks de unicidad/alias y el renombrado con
// alias viven en la mutation (convex/links.ts), donde son transaccionales.

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

export async function saveShortLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const destination = String(formData.get("destination") ?? "/").trim() || "/";

  if (!SLUG_RE.test(slug)) {
    return {
      error: "Slug no válido: solo minúsculas, números y guiones (máx. 40).",
    };
  }
  if (!destination.startsWith("/") && !destination.startsWith("https://")) {
    return { error: "El destino debe empezar por / o https://." };
  }

  const result = await convexMutation(api.links.save, {
    id,
    slug,
    destination,
    utmSource: optional(formData, "utm_source"),
    utmMedium: optional(formData, "utm_medium"),
    utmCampaign: optional(formData, "utm_campaign"),
    utmTerm: optional(formData, "utm_term"),
    utmContent: optional(formData, "utm_content"),
    notes: optional(formData, "notes"),
  });
  if (result.error) return { error: result.error };

  revalidatePath("/admin/links");
  return { ok: true };
}

export async function deleteShortLink(id: string): Promise<ActionState> {
  await requireAdmin();
  const result = await convexMutation(api.links.remove, { id });
  if (result.error) return { error: `No se pudo borrar: ${result.error}` };
  revalidatePath("/admin/links");
  return { ok: true };
}
