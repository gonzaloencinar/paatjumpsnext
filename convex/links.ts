import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Acortador /l/<slug>. Tabla pequeña gestionada a mano en /admin/links: el
// fallback por alias escanea la tabla entera, aceptable a esta escala.

export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const links = await ctx.db.query("short_links").collect();
    return links.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const resolveAndRegisterClick = mutation({
  args: { serverKey: v.string(), slug: v.string() },
  handler: async (ctx, { serverKey, slug }) => {
    assertServerKey(serverKey);
    let link = await ctx.db
      .query("short_links")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!link) {
      link =
        (await ctx.db.query("short_links").collect()).find((l) =>
          l.aliases.includes(slug),
        ) ?? null;
    }
    if (!link) return null;
    await ctx.db.patch("short_links", link._id, {
      clicks: link.clicks + 1,
      lastClickedAt: Date.now(),
    });
    return {
      destination: link.destination,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      utmTerm: link.utmTerm,
      utmContent: link.utmContent,
    };
  },
});

export const save = mutation({
  args: {
    serverKey: v.string(),
    id: v.optional(v.string()),
    slug: v.string(),
    destination: v.string(),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    utmTerm: v.optional(v.string()),
    utmContent: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { serverKey, id, slug, ...fields }) => {
    assertServerKey(serverKey);
    const linkId = id ? ctx.db.normalizeId("short_links", id) : null;
    if (id && !linkId) return { error: "El enlace ya no existe." };

    const bySlug = await ctx.db
      .query("short_links")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (bySlug && bySlug._id !== linkId) {
      return { error: `El slug "${slug}" ya existe.` };
    }

    // El slug nuevo no puede ser alias de otro enlace (redirigiría al ajeno)
    const aliasOwner = (await ctx.db.query("short_links").collect()).find(
      (l) => l._id !== linkId && l.aliases.includes(slug),
    );
    if (aliasOwner) {
      return {
        error: `"${slug}" ya redirige a /l/${aliasOwner.slug} (es un alias suyo).`,
      };
    }

    const now = Date.now();
    if (linkId) {
      const current = await ctx.db.get("short_links", linkId);
      if (!current) return { error: "El enlace ya no existe." };
      // Renombrar el slug no rompe lo publicado: el antiguo queda como alias
      let aliases = current.aliases;
      if (current.slug !== slug) {
        const set = new Set(current.aliases);
        set.add(current.slug);
        set.delete(slug); // por si recupera un nombre que era alias
        aliases = [...set];
      }
      // Claves siempre presentes: undefined elimina el campo (= poner a null)
      await ctx.db.patch("short_links", linkId, {
        slug,
        aliases,
        destination: fields.destination,
        utmSource: fields.utmSource,
        utmMedium: fields.utmMedium,
        utmCampaign: fields.utmCampaign,
        utmTerm: fields.utmTerm,
        utmContent: fields.utmContent,
        notes: fields.notes,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("short_links", {
        slug,
        aliases: [],
        ...fields,
        clicks: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const linkId = ctx.db.normalizeId("short_links", id);
    if (!linkId) return { error: "El enlace ya no existe." };
    await ctx.db.delete("short_links", linkId);
    return { ok: true };
  },
});
