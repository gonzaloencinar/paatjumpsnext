import {
  BanIcon,
  CircleDotIcon,
  MailIcon,
  MailOpenIcon,
  MousePointerClickIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import type { Json } from "@/lib/supabase/types";
import {
  CONTACT_STATUS,
  eventLabel,
  formatMoney,
  timeAgo,
} from "@/lib/crm/format";

const EVENT_ICON: Record<string, LucideIcon> = {
  signup: UserPlusIcon,
  status_changed: RefreshCwIcon,
  cart_created: ShoppingCartIcon,
  checkout_abandoned: ShoppingCartIcon,
  checkout_recovered: ShoppingCartIcon,
  order_placed: ShoppingBagIcon,
  email_sent: MailIcon,
  email_opened: MailOpenIcon,
  email_clicked: MousePointerClickIcon,
  unsubscribed: BanIcon,
  suppression_added: BanIcon,
};

export function eventIcon(type: string): LucideIcon {
  return EVENT_ICON[type] ?? CircleDotIcon;
}

function payloadSummary(type: string, payload: Json | null): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const p = payload as Record<string, Json | undefined>;
  if (type === "status_changed" && p.from && p.to) {
    const from = CONTACT_STATUS[String(p.from)]?.label ?? String(p.from);
    const to = CONTACT_STATUS[String(p.to)]?.label ?? String(p.to);
    return `${from} → ${to}`;
  }
  if (type === "signup" && p.source) return `Origen: ${String(p.source)}`;
  if (type === "order_placed" && typeof p.total === "number") {
    return formatMoney(p.total);
  }
  return null;
}

export function Timeline({
  events,
}: {
  events: {
    // number (bigint legacy) o string (_id de Convex): solo se usa como key
    id: number | string;
    type: string;
    payload: Json | null;
    created_at: string;
  }[];
}) {
  return (
    <ol className="ml-1.5 flex flex-col gap-6 border-l border-border pl-6">
      {events.map((event) => {
        const Icon = eventIcon(event.type);
        const summary = payloadSummary(event.type, event.payload);
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className="absolute top-0.5 -left-[31px] flex size-2.5 items-center justify-center rounded-full bg-primary ring-4 ring-background"
            />
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium">{eventLabel(event.type)}</p>
                {summary ? (
                  <p className="text-xs text-muted-foreground">{summary}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {timeAgo(event.created_at)}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
