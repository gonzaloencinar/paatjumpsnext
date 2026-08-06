import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Helpers compartidos por los motores y webhooks del CRM (convex/engine.ts,
// convex/shopifySync.ts, convex/carts.ts). Todo corre DENTRO de la mutation
// llamante, así que cada flujo completo es transaccional — sustituye a los
// RPC con FOR UPDATE SKIP LOCKED del legacy sin necesidad de locks.

const FETCH_LIMIT = 1000;

// Un paso solo participa si está activo Y tiene contenido (misma regla que
// effectiveSteps en lib/crm/automation-engine.ts)
export function isEffectiveStep(step: Doc<"automation_steps">) {
  return Boolean(step.enabled && step.subject?.trim() && step.bodyHtml?.trim());
}

export async function stepsOfAutomation(
  ctx: QueryCtx | MutationCtx,
  automationId: Id<"automations">,
) {
  return await ctx.db
    .query("automation_steps")
    .withIndex("by_automation_and_position", (q) =>
      q.eq("automationId", automationId),
    )
    .take(FETCH_LIMIT);
}

export function firstEffectiveStep(steps: Doc<"automation_steps">[]) {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .find(isEffectiveStep);
}

export async function checkoutByLegacyId(
  ctx: QueryCtx | MutationCtx,
  checkoutId: number,
) {
  return await ctx.db
    .query("checkouts")
    .withIndex("by_checkout_id", (q) => q.eq("checkoutId", checkoutId))
    .first();
}

export async function contactByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
) {
  return await ctx.db
    .query("contacts")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

export async function enrollmentsOfCheckout(
  ctx: QueryCtx | MutationCtx,
  checkoutDocId: Id<"checkouts">,
) {
  return await ctx.db
    .query("automation_enrollments")
    .withIndex("by_checkout", (q) => q.eq("checkoutId", checkoutDocId))
    .take(200);
}

export async function cancelActiveEnrollmentsForCheckout(
  ctx: MutationCtx,
  checkoutDocId: Id<"checkouts">,
) {
  const rows = await enrollmentsOfCheckout(ctx, checkoutDocId);
  for (const enrollment of rows) {
    if (enrollment.status !== "active") continue;
    await ctx.db.patch("automation_enrollments", enrollment._id, {
      status: "canceled",
      nextRunAt: undefined,
    });
  }
}

// Inscribe un checkout (real o sintético) en la secuencia cart_recovery y
// reinicia el reloj del paso 0 en cada toque. Unicidad legacy: una inscripción
// por (automatización, contacto, checkout) — check-before-write transaccional.
export async function enrollCheckoutInCartRecovery(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  checkoutDocId: Id<"checkouts">,
) {
  const automation = await ctx.db
    .query("automations")
    .withIndex("by_key", (q) => q.eq("key", "cart_recovery"))
    .first();
  if (!automation?.enabled) return;
  const first = firstEffectiveStep(await stepsOfAutomation(ctx, automation._id));
  if (!first) return;

  const nextRunAt = Date.now() + first.delayMinutes * 60_000;

  const existing = (await enrollmentsOfCheckout(ctx, checkoutDocId)).find(
    (e) => e.automationId === automation._id && e.contactId === contactId,
  );
  if (!existing) {
    await ctx.db.insert("automation_enrollments", {
      automationId: automation._id,
      contactId,
      checkoutId: checkoutDocId,
      step: 0,
      status: "active",
      nextRunAt,
      createdAt: Date.now(),
    });
    return;
  }
  // …y si sigue en el paso 0 sin enviar, cada toque reinicia el reloj
  if (existing.status === "active" && existing.step === 0) {
    await ctx.db.patch("automation_enrollments", existing._id, { nextRunAt });
  }
}

// Cierra un checkout que acabó en pedido: 'recovered' si algún email de
// recuperación ya había salido (enrollment con step ≥ 1), 'converted' si no.
// Idempotente: reintentos y orders/updated tardíos no duplican nada.
export async function markCheckoutConverted(
  ctx: MutationCtx,
  checkout: Doc<"checkouts">,
  order: { orderId: number; total: string | number | null },
  contactId: Id<"contacts"> | null,
) {
  const enrollments = await enrollmentsOfCheckout(ctx, checkout._id);
  const recovered = enrollments.some((e) => e.step >= 1);

  await ctx.db.patch("checkouts", checkout._id, {
    status: recovered ? "recovered" : "converted",
    lastEventAt: Date.now(),
  });
  for (const enrollment of enrollments) {
    if (enrollment.status !== "active") continue;
    await ctx.db.patch("automation_enrollments", enrollment._id, {
      status: "canceled",
      nextRunAt: undefined,
    });
  }

  if (recovered && contactId) {
    const events = await ctx.db
      .query("events")
      .withIndex("by_contact_and_created_at", (q) =>
        q.eq("contactId", contactId),
      )
      .take(2000);
    const dup = events.some(
      (e) =>
        e.type === "checkout_recovered" &&
        (e.payload as { checkout_id?: number } | null)?.checkout_id ===
          checkout.checkoutId,
    );
    if (!dup) {
      await ctx.db.insert("events", {
        contactId,
        type: "checkout_recovered",
        payload: {
          checkout_id: checkout.checkoutId,
          order_id: order.orderId,
          total: order.total,
        },
        createdAt: Date.now(),
      });
    }
  }
}

// Derivados del contacto recalculados desde la tabla de pedidos → idempotente
// ante reintentos (mismo cálculo en webhook y sync)
export async function recomputeContactOrders(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .take(5000);
  await ctx.db.patch("contacts", contactId, {
    ordersCount: orders.length,
    totalSpent: orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0),
    lastOrderAt: orders.reduce<number | undefined>(
      (max, o) => (max !== undefined && max > o.createdAt ? max : o.createdAt),
      undefined,
    ),
  });
}

// Evento order_placed único por (contacto, payload.order_id): el equivalente
// transaccional del índice único events_order_placed_unique del legacy
export async function insertOrderPlacedEventUnique(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  payload: { order_id: number; total: string | number | null; discount_code: string | null },
) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_contact_and_created_at", (q) => q.eq("contactId", contactId))
    .take(2000);
  const dup = events.some(
    (e) =>
      e.type === "order_placed" &&
      (e.payload as { order_id?: number } | null)?.order_id ===
        payload.order_id,
  );
  if (dup) return;
  await ctx.db.insert("events", {
    contactId,
    type: "order_placed",
    payload,
    createdAt: Date.now(),
  });
}
