import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Blog CMS. Las lecturas públicas reciben `now` del caller (la cache de Next
// con tag "blog" hace de publicador de lo programado, igual que antes).

const postFields = {
  title: v.string(),
  slug: v.string(),
  excerpt: v.optional(v.string()),
  contentMd: v.string(),
  coverImageUrl: v.optional(v.string()),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  keywords: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  publishedAt: v.optional(v.number()),
};

export const published = query({
  args: { serverKey: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, now }) => {
    assertServerKey(serverKey);
    return await ctx.db
      .query("blog_posts")
      .withIndex("by_status_and_published_at", (q) =>
        q.eq("status", "published").lte("publishedAt", now),
      )
      .order("desc")
      .take(200);
  },
});

export const publishedBySlug = query({
  args: { serverKey: v.string(), slug: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, slug, now }) => {
    assertServerKey(serverKey);
    const post = await ctx.db
      .query("blog_posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (
      !post ||
      post.status !== "published" ||
      post.publishedAt === undefined ||
      post.publishedAt > now
    ) {
      return null;
    }
    return post;
  },
});

export const listAll = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const posts = await ctx.db.query("blog_posts").collect();
    // Orden legacy: published_at desc con borradores sin fecha primero,
    // desempate por created_at desc
    return posts.sort((a, b) => {
      if (a.publishedAt === undefined && b.publishedAt === undefined)
        return b.createdAt - a.createdAt;
      if (a.publishedAt === undefined) return -1;
      if (b.publishedAt === undefined) return 1;
      return b.publishedAt - a.publishedAt || b.createdAt - a.createdAt;
    });
  },
});

export const get = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const postId = ctx.db.normalizeId("blog_posts", id);
    return postId ? await ctx.db.get("blog_posts", postId) : null;
  },
});

export const create = mutation({
  args: { serverKey: v.string(), ...postFields },
  handler: async (ctx, { serverKey, ...fields }) => {
    assertServerKey(serverKey);
    const existing = await ctx.db
      .query("blog_posts")
      .withIndex("by_slug", (q) => q.eq("slug", fields.slug))
      .unique();
    if (existing) return { error: "Ya existe una entrada con ese slug." };
    const now = Date.now();
    const id = await ctx.db.insert("blog_posts", {
      ...fields,
      author: "Patri",
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const update = mutation({
  args: { serverKey: v.string(), id: v.string(), ...postFields },
  handler: async (ctx, { serverKey, id, ...fields }) => {
    assertServerKey(serverKey);
    const postId = ctx.db.normalizeId("blog_posts", id);
    if (!postId) return { error: "La entrada ya no existe." };
    const existing = await ctx.db
      .query("blog_posts")
      .withIndex("by_slug", (q) => q.eq("slug", fields.slug))
      .unique();
    if (existing && existing._id !== postId) {
      return { error: "Ya existe una entrada con ese slug." };
    }
    // Claves siempre presentes: undefined elimina el campo (= poner a null)
    await ctx.db.patch("blog_posts", postId, {
      title: fields.title,
      slug: fields.slug,
      excerpt: fields.excerpt,
      contentMd: fields.contentMd,
      coverImageUrl: fields.coverImageUrl,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      keywords: fields.keywords,
      status: fields.status,
      publishedAt: fields.publishedAt,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const postId = ctx.db.normalizeId("blog_posts", id);
    if (!postId) return { error: "La entrada ya no existe." };
    await ctx.db.delete("blog_posts", postId);
    return { ok: true };
  },
});
