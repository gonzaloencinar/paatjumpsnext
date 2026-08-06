import { createElement } from "react";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { transportSend } from "@/lib/email/provider";
import {
  DniAlertEmail,
  DniRequestEmail,
  dniRequestSubject,
} from "@/lib/email/templates/dni-request";
import { signEmailToken, verifyEmailToken } from "@/lib/email/tokens";
import { getOrderShippingDetails } from "@/lib/shopify/admin";
import { CRM } from "./config";

// Petición de DNI/NIE post-pedido (tabla order_dni_requests): cuando entra un
// pedido con destino de aduana se le pide al cliente por email con enlace a
// un formulario propio (/id/<token>).
//   · Canarias/Ceuta/Melilla → email en ESPAÑOL
//   · internacional (fuera de España) → email en INGLÉS
// El cron de 1 min (automations) manda el primer email, un recordatorio a las
// 24 h y, a las 48 h sin respuesta, un aviso a contacto@paatjumps.com para
// llamar al cliente. Emails transaccionales: van directos por transportSend
// (sin chequeo de supresiones ni enlace de baja — el cliente los necesita
// para recibir su pedido).

export const DNI_ALERT_TO = "contacto@paatjumps.com";
const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;
const ALERT_AFTER_MS = 48 * 60 * 60 * 1000;

export type DniLocale = "es" | "en";

// CP con aduana dentro de España: 35/38 Canarias · 51 Ceuta · 52 Melilla
const CUSTOMS_ZIP_PREFIXES = new Set(["35", "38", "51", "52"]);

// Idioma del email si el destino exige DNI, o null si no lo exige
export function dniRequestLocale(
  countryCode: string | null | undefined,
  zip: string | null | undefined,
): DniLocale | null {
  const country = (countryCode ?? "").toUpperCase();
  if (!country) return null;
  if (country !== "ES") return "en";
  return CUSTOMS_ZIP_PREFIXES.has((zip ?? "").trim().slice(0, 2)) ? "es" : null;
}

// ─────────────────────────── token del formulario ───────────────────────────

// /id/<orderId>.<hmac> — firmado con EMAIL_LINK_SIGNING_SECRET, sin caducidad
// (el enlace del email debe funcionar días después).
export function dniFormToken(orderId: number): string {
  return `${orderId}.${signEmailToken("dni-form", String(orderId))}`;
}

export function dniFormUrl(orderId: number): string {
  return `${CRM.baseUrl}/id/${dniFormToken(orderId)}`;
}

export function verifyDniFormToken(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  if (!id || !signature || !/^\d{1,15}$/.test(id)) return null;
  return verifyEmailToken("dni-form", id, signature) ? Number(id) : null;
}

// ─────────────────────────── alta y envío ───────────────────────────

export function sanitizeDniValue(
  dni: string | null | undefined,
): string | null {
  const clean = (dni ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9 .-]{4,18}$/.test(clean) ? clean : null;
}

// Llamado desde el webhook orders/create: crea la petición si el destino la
// necesita. Idempotente (la mutation ignora duplicados por orderId, como el
// upsert legacy con ignoreDuplicates); el cron envía después.
export async function ensureDniRequest(params: {
  orderId: number;
  orderName: string | null;
  email: string | null;
  countryCode: string | null | undefined;
  zip: string | null | undefined;
}): Promise<void> {
  const locale = dniRequestLocale(params.countryCode, params.zip);
  if (!locale || !params.email) return;
  await convexMutation(api.dni.ensureRequest, {
    orderId: params.orderId,
    ...(params.orderName !== null ? { orderName: params.orderName } : {}),
    email: params.email,
    locale,
  });
}

// Tick del cron: primer email → recordatorio (24 h) → aviso interno (48 h).
// Idempotente ante reintentos vía idempotencyKey de Resend + timestamps.
export async function processDniRequests(): Promise<{
  sent: number;
  reminded: number;
  alerted: number;
}> {
  const rows = await convexQuery(api.dni.pendingRequests, { limit: 100 });

  let sent = 0;
  let reminded = 0;
  let alerted = 0;
  const now = Date.now();

  for (const row of rows) {
    const locale = row.locale;
    const orderName = row.orderName ?? `#${row.orderId}`;
    const formUrl = dniFormUrl(row.orderId);
    try {
      if (!row.firstSentAt) {
        await transportSend({
          to: row.email,
          subject: dniRequestSubject(locale, orderName, false),
          react: createElement(DniRequestEmail, {
            locale,
            orderName,
            formUrl,
            reminder: false,
          }),
          idempotencyKey: `dni-first-${row.orderId}`,
        });
        await convexMutation(api.dni.markSent, {
          orderId: row.orderId,
          mark: "first",
        });
        sent += 1;
      } else if (
        !row.reminderSentAt &&
        now - row.firstSentAt >= REMINDER_AFTER_MS
      ) {
        await transportSend({
          to: row.email,
          subject: dniRequestSubject(locale, orderName, true),
          react: createElement(DniRequestEmail, {
            locale,
            orderName,
            formUrl,
            reminder: true,
          }),
          idempotencyKey: `dni-reminder-${row.orderId}`,
        });
        await convexMutation(api.dni.markSent, {
          orderId: row.orderId,
          mark: "reminder",
        });
        reminded += 1;
      } else if (
        row.reminderSentAt &&
        now - row.firstSentAt >= ALERT_AFTER_MS
      ) {
        // Teléfono del cliente para el aviso (best effort)
        let phone: string | null = null;
        try {
          const details = await getOrderShippingDetails(row.orderId);
          phone = details?.shippingAddress?.phone ?? null;
        } catch {
          // sin teléfono el aviso sale igual
        }
        await transportSend({
          to: DNI_ALERT_TO,
          subject: `⚠️ ${orderName}: el cliente no ha enviado su DNI (48 h) — llamar`,
          react: createElement(DniAlertEmail, {
            orderName,
            email: row.email,
            phone,
            formUrl,
            adminUrl: `${CRM.baseUrl}/admin/orders?q=${encodeURIComponent(orderName)}`,
          }),
          idempotencyKey: `dni-alert-${row.orderId}`,
        });
        await convexMutation(api.dni.markSent, {
          orderId: row.orderId,
          mark: "alerted",
        });
        alerted += 1;
      }
    } catch (error) {
      // Un fallo de envío no bloquea el resto; se reintenta al siguiente tick
      console.error(`[dni-requests] pedido ${row.orderId}`, error);
    }
  }

  return { sent, reminded, alerted };
}

// ─────────────────────────── formulario público ───────────────────────────

export type DniRequestView = {
  orderId: number;
  orderName: string;
  locale: DniLocale;
  submitted: boolean;
};

export async function getDniRequestByToken(
  token: string,
): Promise<DniRequestView | null> {
  const orderId = verifyDniFormToken(token);
  if (orderId === null) return null;
  const row = await convexQuery(api.dni.requestByOrderId, { orderId });
  if (!row) return null;
  return {
    orderId: row.orderId,
    orderName: row.orderName ?? `#${row.orderId}`,
    locale: row.locale,
    submitted: row.submittedAt !== null,
  };
}

// Envío del formulario (token verificado dentro). Devuelve false si el token
// o el DNI no son válidos (o si falla la escritura, como el error legacy).
export async function submitDniForm(
  token: string,
  rawDni: string,
): Promise<boolean> {
  const orderId = verifyDniFormToken(token);
  const dni = sanitizeDniValue(rawDni);
  if (orderId === null || !dni) return false;
  try {
    await convexMutation(api.dni.submitDni, {
      orderId,
      dni,
      onlyIfUnsubmitted: false,
    });
    return true;
  } catch {
    return false;
  }
}

// DNI ya recibido de un pedido (para el borrador de envío del CRM) o null
export async function getOrderDni(orderId: number): Promise<string | null> {
  const row = await convexQuery(api.dni.requestByOrderId, { orderId });
  return row?.submittedAt ? (row.dni ?? null) : null;
}

// El admin resolvió el DNI a mano (input del selector de envío, p. ej. tras
// llamar al cliente): se guarda para que paren recordatorios/avisos (sin
// pisar un DNI que el cliente ya hubiera enviado).
export async function recordManualDni(
  orderId: number,
  dni: string,
): Promise<void> {
  await convexMutation(api.dni.submitDni, {
    orderId,
    dni,
    onlyIfUnsubmitted: true,
  });
}
