"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, type ActionState } from "@/lib/crm/actions";

// Acciones del acortador de enlaces (/admin/links). El slug es la parte
// visible (paatjumps.com/l/<slug>); destino + UTMs se componen al redirigir
// en app/l/[slug]/route.ts.

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function saveShortLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
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

  // El slug nuevo no puede ser alias de otro enlace (redirigiría al ajeno)
  let conflictQuery = supabase
    .from("short_links")
    .select("slug")
    .contains("aliases", [slug]);
  if (id) conflictQuery = conflictQuery.neq("id", id);
  const { data: aliasConflict } = await conflictQuery.maybeSingle();
  if (aliasConflict) {
    return {
      error: `"${slug}" ya redirige a /l/${aliasConflict.slug} (es un alias suyo).`,
    };
  }

  const row: {
    slug: string;
    destination: string;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
    notes: string | null;
    updated_at: string;
    aliases?: string[];
  } = {
    slug,
    destination,
    utm_source: optional(formData, "utm_source"),
    utm_medium: optional(formData, "utm_medium"),
    utm_campaign: optional(formData, "utm_campaign"),
    utm_term: optional(formData, "utm_term"),
    utm_content: optional(formData, "utm_content"),
    notes: optional(formData, "notes"),
    updated_at: new Date().toISOString(),
  };

  // Renombrar el slug no rompe lo publicado: el antiguo queda como alias del
  // mismo enlace (redirige igual y suma el clic aquí, sin fila propia).
  if (id) {
    const { data: current } = await supabase
      .from("short_links")
      .select("slug, aliases")
      .eq("id", id)
      .maybeSingle();
    if (current && current.slug !== slug) {
      const aliases = new Set(current.aliases ?? []);
      aliases.add(current.slug);
      aliases.delete(slug); // por si recupera un nombre que era alias
      row.aliases = [...aliases];
    }
  }

  const { error } = id
    ? await supabase.from("short_links").update(row).eq("id", id)
    : await supabase.from("short_links").insert(row);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `El slug "${slug}" ya existe.`
          : `No se pudo guardar: ${error.message}`,
    };
  }

  revalidatePath("/admin/links");
  return { ok: true };
}

export async function deleteShortLink(id: string): Promise<ActionState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("short_links").delete().eq("id", id);
  if (error) return { error: `No se pudo borrar: ${error.message}` };
  revalidatePath("/admin/links");
  return { ok: true };
}
