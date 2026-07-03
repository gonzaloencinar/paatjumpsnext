import type { Tables } from "@/lib/supabase/types";

export type Contact = Tables<"contacts">;
export type Campaign = Tables<"campaigns">;
export type Automation = Tables<"automations">;
export type Suppression = Tables<"suppressions">;
export type EmailSend = Tables<"email_sends">;
export type DiscountCode = Tables<"discount_codes">;
export type Order = Tables<"orders">;
export type CrmEvent = Tables<"events">;

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const CONTACT_STATUS: Record<
  string,
  { label: string; dot: string; badge: BadgeVariant }
> = {
  subscribed: { label: "Suscrito", dot: "bg-primary", badge: "outline" },
  pending: { label: "Pendiente", dot: "bg-foreground/40", badge: "secondary" },
  unsubscribed: {
    label: "Baja",
    dot: "bg-foreground/40",
    badge: "secondary",
  },
  bounced: { label: "Rebotado", dot: "bg-destructive", badge: "destructive" },
  complained: { label: "Queja", dot: "bg-destructive", badge: "destructive" },
};

export const CAMPAIGN_STATUS: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  draft: { label: "Borrador", badge: "secondary" },
  scheduled: { label: "Programada", badge: "outline" },
  sending: { label: "Enviando", badge: "outline" },
  sent: { label: "Enviada", badge: "default" },
  paused: { label: "Pausada", badge: "outline" },
  canceled: { label: "Cancelada", badge: "secondary" },
};

export const EMAIL_SEND_STATUS: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  queued: { label: "En cola", badge: "secondary" },
  sent: { label: "Enviado", badge: "outline" },
  delivered: { label: "Entregado", badge: "default" },
  bounced: { label: "Rebotado", badge: "destructive" },
  complained: { label: "Queja", badge: "destructive" },
  failed: { label: "Fallido", badge: "destructive" },
};

export const SUPPRESSION_REASON: Record<string, string> = {
  unsubscribe: "Baja voluntaria",
  hard_bounce: "Rebote duro",
  complaint: "Queja (spam)",
  manual: "Manual",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  signup: "Alta de contacto",
  status_changed: "Cambio de estado",
  cart_created: "Carrito creado",
  checkout_abandoned: "Checkout abandonado",
  checkout_recovered: "Checkout recuperado",
  order_placed: "Pedido realizado",
  email_sent: "Email enviado",
  email_opened: "Email abierto",
  email_clicked: "Clic en email",
  unsubscribed: "Baja",
  suppression_added: "Añadido a supresiones",
};

export function eventLabel(type: string) {
  return EVENT_TYPE_LABEL[type] ?? type;
}

// Zona horaria fija: el server (Vercel) corre en UTC y el panel se opera
// desde España — sin esto las horas saldrían desplazadas según dónde rendericen.
const TZ = "Europe/Madrid";

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatMoney(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

const RTF = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secondsInUnit] of ranges) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return RTF.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return "ahora mismo";
}

export function contactDisplayName(contact: {
  email: string;
  first_name: string | null;
}) {
  return contact.first_name?.trim() || contact.email;
}
