import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";

// Únicas funciones que usan ctx.auth (sesión de Convex Auth): el resto del
// backend sigue gateado por serverKey (convex/lib/server.ts) y solo es
// invocable desde el servidor Next. Aquí el sujeto es el usuario logueado y
// la autorización es la allowlist admin_users — el equivalente de is_admin().

async function identityEmail(ctx: QueryCtx): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  return email || null;
}

/** ¿El usuario autenticado está en la allowlist admin_users? */
export const isAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const email = await identityEmail(ctx);
    if (!email) return false;
    const row = await ctx.db
      .query("admin_users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    return row !== null;
  },
});

/** Email (lowercase) de la identidad autenticada — null si no hay sesión. */
export const me = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => identityEmail(ctx),
});
