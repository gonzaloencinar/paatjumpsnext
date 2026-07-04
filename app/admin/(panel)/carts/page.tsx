import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MailIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { getCartsData } from "@/lib/crm/queries";

export const metadata = { title: "Carritos" };

const nf = new Intl.NumberFormat("es-ES");

type LineItem = { title?: string; quantity?: number };

function itemsSummary(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items = raw as LineItem[];
  const units = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const first = items[0]?.title ?? "";
  const extra = items.length - 1;
  return `${units} ud. · ${first}${extra > 0 ? ` +${extra}` : ""}`;
}

const FILTERS: { key?: string; label: string }[] = [
  { label: "Todos" },
  { key: "abandoned", label: "Abandonados" },
  { key: "reached_checkout", label: "En checkout" },
  { key: "recovered", label: "Recuperados" },
  { key: "converted", label: "Convertidos" },
];

export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { carts, total, page, perPage, kpis } = await getCartsData({
    estado: sp.estado,
    page: Number(sp.page) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allCount =
    kpis.abandoned + kpis.reachedCheckout + kpis.recovered + kpis.converted;
  const recoveryRate =
    kpis.contacted > 0
      ? Math.round((kpis.recovered / kpis.contacted) * 100)
      : null;

  const countFor = (key?: string) =>
    key === "abandoned"
      ? kpis.abandoned
      : key === "reached_checkout"
        ? kpis.reachedCheckout
        : key === "recovered"
          ? kpis.recovered
          : key === "converted"
            ? kpis.converted
            : allCount;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (sp.estado) params.set("estado", sp.estado);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/carts${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Carritos"
        description={`${nf.format(total)} ${sp.estado ? "con este estado" : "en total"} · checkouts de Shopify y carritos de la web identificados`}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Abandonados ahora</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.abandoned)}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">
              Contactados por email
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.contacted)}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Recuperados</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {nf.format(kpis.recovered)}
              {kpis.recoveredRevenue > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {formatMoney(kpis.recoveredRevenue)}
                </span>
              ) : null}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">
              Tasa de recuperación
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {recoveryRate === null ? "—" : `${recoveryRate}%`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => {
            const active = (sp.estado ?? undefined) === filter.key;
            const href = filter.key
              ? `/admin/carts?estado=${filter.key}`
              : "/admin/carts";
            return (
              <Button
                key={filter.label}
                variant={active ? "secondary" : "outline"}
                size="sm"
                render={<Link href={href} />}
              >
                {filter.label}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {nf.format(countFor(filter.key))}
                </Badge>
              </Button>
            );
          })}
        </div>

        {carts.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCartIcon />
              </EmptyMedia>
              <EmptyTitle>
                {sp.estado ? "Nada con este estado" : "Aún no hay carritos"}
              </EmptyTitle>
              <EmptyDescription>
                {sp.estado
                  ? "Prueba con otro filtro."
                  : "Aquí aparecen los checkouts de Shopify (webhook al instante) y los carritos de la web de visitantes identificados — quienes llegan desde un enlace de email del CRM o se suscriben. Los emails de recuperación salen de la automatización «Recuperación de carrito»."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
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
                    <TableHead className="hidden lg:table-cell">
                      Actividad
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carts.map((cart) => {
                    const status = CHECKOUT_STATUS[cart.status] ?? {
                      label: cart.status,
                      badge: "outline" as const,
                    };
                    const summary = itemsSummary(cart.line_items);
                    const sends = [...cart.email_sends].sort((a, b) =>
                      (a.sent_at ?? "").localeCompare(b.sent_at ?? ""),
                    );
                    const enrollment = cart.automation_enrollments.find(
                      (e) => e.status === "active",
                    );
                    return (
                      <TableRow key={cart.id}>
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
                                {cart.contacts?.first_name?.trim() ||
                                  cart.email}
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
                            ? formatMoney(
                                cart.total_price,
                                cart.currency ?? "EUR",
                              )
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
                                    <Badge variant="destructive">
                                      {sendStatus}
                                    </Badge>
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
                                <ClockIcon
                                  aria-hidden
                                  className="size-3 shrink-0"
                                />
                                Próximo email {timeAgo(enrollment.next_run_at)}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {cart.last_event_at
                            ? timeAgo(cart.last_event_at)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    render={
                      page > 1 ? <Link href={pageUrl(page - 1)} /> : undefined
                    }
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    render={
                      page < totalPages ? (
                        <Link href={pageUrl(page + 1)} />
                      ) : undefined
                    }
                  >
                    Siguiente
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
