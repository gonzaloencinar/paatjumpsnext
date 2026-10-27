import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

// Lista de email de FitComba (app.fitcomba.com → /admin/leads): quien compra
// en la tienda y quien deja el email en la barra de descuento entra también
// en la lista de FitComba, con su origen. Cada hora (crons.ts) se envía la
// lista entera a POST <FITCOMBA_LEADS_URL> (Convex de FitComba, leads.ts); allí
// es idempotente y solo escribe lo que cambia. Las bajas y rebotes
// (suppressions) viajan como `unsubscribed` y FitComba deja de escribirles.
// Sin FITCOMBA_LEADS_URL / FITCOMBA_LEADS_SECRET (p. ej. en dev) no hace nada.

type LeadSource =
  | "paatjumps_compra"
  | "paatjumps_descuento"
  | "paatjumps_newsletter";

type Lead = {
  email: string;
  name?: string;
  phone?: string;
  source: LeadSource;
  at: number;
  consent: boolean;
  unsubscribed?: boolean;
  paatjumps?: { orders: number; spentCents: number };
};

const SCAN = 20_000;
const BATCH = 500; // máximo por llamada en FitComba

export const collect = internalQuery({
  args: {},
  handler: async (ctx): Promise<Lead[]> => {
    const suppressed = new Set(
      (await ctx.db.query("suppressions").take(SCAN)).map((s) => s.email),
    );
    const leads: Lead[] = [];

    // Clientes de Shopify (sincronizados por shopifySync): compradores y
    // quien aceptó marketing sin comprar.
    for (const c of await ctx.db.query("customers").take(SCAN)) {
      const email = c.email?.trim().toLowerCase();
      if (!email) continue;
      const bought = c.ordersCount > 0;
      if (!bought && !c.acceptsEmailMarketing) continue;
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      leads.push({
        email,
        ...(name ? { name } : {}),
        ...(c.phone ? { phone: c.phone } : {}),
        source: bought ? "paatjumps_compra" : "paatjumps_newsletter",
        at: c.shopifyCreatedAt ?? c.createdAt,
        consent: c.acceptsEmailMarketing === true,
        ...(suppressed.has(email) ? { unsubscribed: true } : {}),
        ...(bought
          ? {
              paatjumps: {
                orders: c.ordersCount,
                spentCents: Math.round(c.totalSpent * 100),
              },
            }
          : {}),
      });
    }

    // Contactos del CRM: la barra de descuento (sticky_bar) y quien aceptó
    // marketing en el checkout (si además compró, ya viene arriba).
    for (const c of await ctx.db.query("contacts").take(SCAN)) {
      leads.push({
        email: c.email,
        ...(c.firstName ? { name: c.firstName } : {}),
        source:
          c.source === "sticky_bar"
            ? "paatjumps_descuento"
            : "paatjumps_newsletter",
        at: c.createdAt,
        consent: c.consent,
        ...(c.status === "unsubscribed" || suppressed.has(c.email)
          ? { unsubscribed: true }
          : {}),
      });
    }
    return leads;
  },
});

export const push = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const url = process.env.FITCOMBA_LEADS_URL;
    const secret = process.env.FITCOMBA_LEADS_SECRET;
    if (!url || !secret) return null;
    const leads = await ctx.runQuery(internal.fitcombaLeads.collect, {});
    for (let i = 0; i < leads.length; i += BATCH) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leads: leads.slice(i, i + BATCH) }),
      });
      if (!res.ok) {
        throw new Error(
          `FitComba /leads/ingest respondió ${res.status}: ${await res.text()}`,
        );
      }
    }
    return null;
  },
});
