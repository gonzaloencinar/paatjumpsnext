"use client";

import { useState } from "react";
import Link from "next/link";
import { ClockIcon, ExternalLinkIcon, MailIcon, UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHECKOUT_ORIGIN,
  CHECKOUT_STATUS,
  EMAIL_SEND_STATUS,
  formatDateTime,
  formatMoney,
  timeAgo,
} from "@/lib/crm/format";
import type { getCartsData } from "@/lib/crm/queries";

type Cart = Awaited<ReturnType<typeof getCartsData>>["carts"][number];

// Forma del JSON checkouts.line_items (webhook de Shopify y lib/crm/local-cart.ts)
type LineItem = {
  title?: string;
  variant?: string | null;
  quantity?: number;
  price?: string | null; // unitario, IVA incluido (precios de tienda)
};

function lineItemsOf(cart: Cart): LineItem[] {
  return Array.isArray(cart.line_items) ? (cart.line_items as LineItem[]) : [];
}

function itemsSummary(items: LineItem[]) {
  if (items.length === 0) return null;
  const units = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const first = items[0]?.title ?? "";
  const extra = items.length - 1;
  return `${units} ud. · ${first}${extra > 0 ? ` +${extra}` : ""}`;
}

function sortedSends(cart: Cart) {
  return [...cart.email_sends].sort((a, b) =>
    (a.sent_at ?? "").localeCompare(b.sent_at ?? ""),
  );
}

export function CartsTable({ carts }: { carts: Cart[] }) {
  const [selected, setSelected] = useState<Cart | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Carrito</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recuperación</TableHead>
              <TableHead className="hidden lg:table-cell">Actividad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carts.map((cart) => {
              const status = CHECKOUT_STATUS[cart.status] ?? {
                label: cart.status,
                badge: "outline" as const,
              };
              const summary = itemsSummary(lineItemsOf(cart));
              const sends = sortedSends(cart);
              const enrollment = cart.automation_enrollments.find(
                (e) => e.status === "active",
              );
              return (
                <TableRow
                  key={cart.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    // Los enlaces internos de la fila (contacto) navegan; el
                    // resto de la fila abre el detalle
                    if ((event.target as HTMLElement).closest("a")) return;
                    setSelected(cart);
                    setOpen(true);
                  }}
                >
                  <TableCell>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span>
                        <Badge variant="outline">
                          {CHECKOUT_ORIGIN[cart.origin] ?? cart.origin}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(cart.abandoned_at)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      {cart.contact_id ? (
                        <Link
                          href={`/admin/contacts/${cart.contact_id}`}
                          className="truncate transition-colors hover:text-orange-400"
                        >
                          {cart.contacts?.first_name?.trim() || cart.email}
                        </Link>
                      ) : (
                        <span className="truncate">
                          {cart.email ?? "Sin email"}
                        </span>
                      )}
                      {summary ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {summary}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Carrito vacío
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cart.total_price != null
                      ? formatMoney(cart.total_price, cart.currency ?? "EUR")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.badge}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 flex-col gap-1">
                      {sends.length === 0 && !enrollment ? (
                        <span className="text-xs text-muted-foreground">
                          Sin emails
                        </span>
                      ) : null}
                      {sends.map((send) => {
                        const sendStatus =
                          send.status !== "sent" &&
                          send.status !== "delivered" &&
                          send.status !== "queued"
                            ? (EMAIL_SEND_STATUS[send.status]?.label ??
                              send.status)
                            : null;
                        return (
                          <span
                            key={send.id}
                            className="flex min-w-0 items-center gap-1.5 text-xs"
                          >
                            <MailIcon
                              aria-hidden
                              className="size-3 shrink-0 text-muted-foreground"
                            />
                            <span className="truncate">
                              {send.subject ?? "Email"}
                            </span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {send.sent_at ? timeAgo(send.sent_at) : ""}
                            </span>
                            {sendStatus ? (
                              <Badge variant="destructive">{sendStatus}</Badge>
                            ) : (
                              <span className="shrink-0 text-muted-foreground">
                                {send.clicked_at
                                  ? "· clic ✓"
                                  : send.opened_at
                                    ? "· abierto"
                                    : ""}
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {enrollment?.next_run_at ? (
                        <span className="flex items-center gap-1.5 text-xs text-orange-400">
                          <ClockIcon aria-hidden className="size-3 shrink-0" />
                          Próximo email {timeAgo(enrollment.next_run_at)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {cart.last_event_at ? timeAgo(cart.last_event_at) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {selected ? <CartDetail cart={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function CartDetail({ cart }: { cart: Cart }) {
  const status = CHECKOUT_STATUS[cart.status] ?? {
    label: cart.status,
    badge: "outline" as const,
  };
  const items = lineItemsOf(cart);
  const currency = cart.currency ?? "EUR";
  const units = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const itemsTotal = items.reduce(
    (sum, item) => sum + (item.quantity ?? 1) * Number(item.price ?? 0),
    0,
  );
  // El total del checkout de Shopify puede incluir envío o descuentos que los
  // artículos por sí solos no reflejan
  const showItemsSubtotal =
    cart.total_price != null &&
    itemsTotal > 0 &&
    Math.abs(itemsTotal - cart.total_price) >= 0.01;
  const sends = sortedSends(cart);
  const enrollment = cart.automation_enrollments.find(
    (e) => e.status === "active",
  );

  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle className="flex items-center gap-2">
          Detalle del carrito
          <Badge variant={status.badge}>{status.label}</Badge>
        </SheetTitle>
        <SheetDescription>
          {CHECKOUT_ORIGIN[cart.origin] ?? cart.origin} · abandonado{" "}
          {formatDateTime(cart.abandoned_at)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 p-4 pt-0">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Artículos {items.length > 0 ? `(${units} ud.)` : ""}
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Carrito vacío</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {items.map((item, i) => {
                const quantity = item.quantity ?? 1;
                const price = Number(item.price ?? 0);
                return (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm">
                        {item.title || "Artículo"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.variant ? `${item.variant} · ` : ""}
                        {quantity} × {formatMoney(price, currency)}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatMoney(quantity * price, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col gap-1">
            {showItemsSubtotal ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Artículos</span>
                <span className="tabular-nums">
                  {formatMoney(itemsTotal, currency)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total (IVA incl.)</span>
              <span className="font-medium tabular-nums">
                {cart.total_price != null
                  ? formatMoney(cart.total_price, currency)
                  : "—"}
              </span>
            </div>
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Cliente
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <UserIcon aria-hidden className="size-4 text-muted-foreground" />
            {cart.contact_id ? (
              <Link
                href={`/admin/contacts/${cart.contact_id}`}
                className="truncate transition-colors hover:text-orange-400"
              >
                {cart.contacts?.first_name?.trim() || cart.email}
              </Link>
            ) : (
              <span className="truncate">{cart.email ?? "Sin email"}</span>
            )}
          </div>
          {cart.contact_id && cart.email ? (
            <p className="text-sm text-muted-foreground">{cart.email}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {cart.buyer_accepts_marketing == null
              ? "Consentimiento de marketing desconocido"
              : cart.buyer_accepts_marketing
                ? "Acepta marketing"
                : "No acepta marketing"}
          </p>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Recuperación
          </h3>
          {sends.length === 0 && !enrollment ? (
            <p className="text-sm text-muted-foreground">
              Sin emails de recuperación
            </p>
          ) : null}
          {sends.map((send) => {
            const sendStatus = EMAIL_SEND_STATUS[send.status] ?? {
              label: send.status,
              badge: "outline" as const,
            };
            return (
              <div key={send.id} className="flex flex-col gap-0.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <MailIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{send.subject ?? "Email"}</span>
                </span>
                <span className="pl-5 text-xs text-muted-foreground">
                  {send.sent_at ? formatDateTime(send.sent_at) : "—"} ·{" "}
                  {sendStatus.label}
                  {send.clicked_at
                    ? " · clic ✓"
                    : send.opened_at
                      ? " · abierto"
                      : ""}
                </span>
              </div>
            );
          })}
          {enrollment?.next_run_at ? (
            <p className="flex items-center gap-1.5 text-sm text-orange-400">
              <ClockIcon aria-hidden className="size-3.5 shrink-0" />
              Próximo email {timeAgo(enrollment.next_run_at)} (paso{" "}
              {enrollment.step + 1})
            </p>
          ) : null}
          {cart.recovery_url ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 self-start"
              render={
                <a
                  href={cart.recovery_url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Abrir carrito recuperable
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          ) : null}
        </section>

        <Separator />

        <section className="flex flex-col gap-1 text-sm">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Actividad
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Creado</span>
            <span className="tabular-nums">
              {formatDateTime(cart.created_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Abandonado</span>
            <span className="tabular-nums">
              {formatDateTime(cart.abandoned_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Última actividad</span>
            <span className="tabular-nums">
              {formatDateTime(cart.last_event_at)}
            </span>
          </div>
          {cart.recovery_sent_at ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Primer email</span>
              <span className="tabular-nums">
                {formatDateTime(cart.recovery_sent_at)}
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
