import type { Tables } from "@/lib/crm/db-types";

export type Contact = Tables<"contacts">;
export type Customer = Tables<"customers">;
export type Campaign = Tables<"campaigns">;
export type Automation = Tables<"automations">;
export type AutomationStep = Tables<"automation_steps">;
export type Suppression = Tables<"suppressions">;
export type EmailSend = Tables<"email_sends">;
export type DiscountCode = Tables<"discount_codes">;
export type Order = Tables<"orders">;
export type CrmEvent = Tables<"events">;
export type BlogPost = Tables<"blog_posts">;

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

// Estados de pedido: claves REST (webhook, minúsculas) y GraphQL display
// (sync, pasadas a minúsculas) conviven — el mapa cubre ambos vocabularios.
export const ORDER_FINANCIAL_STATUS: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  paid: { label: "Pagado", badge: "default" },
  pending: { label: "Pendiente", badge: "secondary" },
  authorized: { label: "Autorizado", badge: "outline" },
  partially_paid: { label: "Pago parcial", badge: "outline" },
  partially_refunded: { label: "Reemb. parcial", badge: "outline" },
  refunded: { label: "Reembolsado", badge: "destructive" },
  voided: { label: "Anulado", badge: "secondary" },
  expired: { label: "Expirado", badge: "secondary" },
};

export const ORDER_FULFILLMENT_STATUS: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  fulfilled: { label: "Enviado", badge: "default" },
  unfulfilled: { label: "Sin enviar", badge: "secondary" },
  partial: { label: "Envío parcial", badge: "outline" },
  partially_fulfilled: { label: "Envío parcial", badge: "outline" },
  in_progress: { label: "En preparación", badge: "outline" },
  on_hold: { label: "En espera", badge: "outline" },
  scheduled: { label: "Programado", badge: "outline" },
  restocked: { label: "Devuelto a stock", badge: "secondary" },
};

// Fases del envío Packlink (lib/crm/packlink.ts → packlinkPhase)
export const PACKLINK_PHASE: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  borrador: { label: "Borrador", badge: "secondary" },
  etiqueta: { label: "Etiqueta generada", badge: "outline" },
  recogida: { label: "Pendiente recogida", badge: "outline" },
  enviado: { label: "Enviado", badge: "default" },
  entregado: { label: "Entregado", badge: "default" },
  incidencia: { label: "Incidencia", badge: "destructive" },
  cancelado: { label: "Cancelado", badge: "secondary" },
};

// Estados del ciclo de un carrito/checkout (webhook + tracking storefront)
export const CHECKOUT_STATUS: Record<
  string,
  { label: string; badge: BadgeVariant }
> = {
  abandoned: { label: "Abandonado", badge: "outline" },
  reached_checkout: { label: "En checkout", badge: "secondary" },
  recovered: { label: "Recuperado", badge: "default" },
  converted: { label: "Convertido", badge: "secondary" },
};

// De dónde salió el carrito: checkout de Shopify o carrito de la web (pre-
// checkout, identificado por la cookie pj_contact)
export const CHECKOUT_ORIGIN: Record<string, string> = {
  shopify: "Checkout",
  storefront: "Web",
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

// Triggers de automatización (§16.4). Los marcados Fase 2 existen en el
// esquema pero aún no se procesan (checkout_abandoned ya es operativo: lo
// inscriben los webhooks de checkouts desde la Fase 2).
export const AUTOMATION_TRIGGER: Record<
  string,
  { label: string; phase2?: boolean }
> = {
  signup: { label: "Al suscribirse" },
  manual: { label: "Manual" },
  checkout_abandoned: { label: "Checkout abandonado" },
  order_placed: { label: "Tras comprar", phase2: true },
  winback: { label: "Winback", phase2: true },
};

// 4320 → "3 días", 90 → "1,5 h", 30 → "30 min"
export function delayLabel(minutes: number) {
  if (minutes === 0) return "inmediato";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 día" : `${days} días`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes > 60) {
    return `${new Intl.NumberFormat("es-ES").format(Math.round((minutes / 60) * 10) / 10)} h`;
  }
  return `${minutes} min`;
}

export const SUPPRESSION_REASON: Record<string, string> = {
  unsubscribe: "Baja voluntaria",
  hard_bounce: "Rebote duro",
  complaint: "Queja (spam)",
  manual: "Manual",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  signup: "Alta de contacto",
  status_changed: "Cambio de estado",
  contact_updated: "Datos editados",
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

// Finanzas de socios (/admin/finance)
export type FinancePartner = "gonzalo" | "patri";

export const FINANCE_PARTNERS: FinancePartner[] = ["gonzalo", "patri"];

export const FINANCE_PARTNER_LABEL: Record<FinancePartner, string> = {
  gonzalo: "Gonzalo",
  patri: "Patri",
};

export const FINANCE_FREQUENCIES: Record<
  string,
  { label: string; months: number }
> = {
  monthly: { label: "Mensual", months: 1 },
  bimonthly: { label: "Bimestral", months: 2 },
  quarterly: { label: "Trimestral", months: 3 },
  semiannual: { label: "Semestral", months: 6 },
  yearly: { label: "Anual", months: 12 },
};

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
