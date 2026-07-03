import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PackageIcon,
  SearchIcon,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import {
  OrderFulfillmentBadge,
  OrderPaymentBadge,
} from "@/components/admin/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/crm/format";
import { listOrders, shopifyAdminUrl } from "@/lib/crm/store-queries";

export const metadata = { title: "Pedidos" };

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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fuente?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { orders, total, page, perPage } = await listOrders({
    q: sp.q,
    fuente: sp.fuente,
    page: Number(sp.page) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const filtering = Boolean(sp.q || sp.fuente);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.fuente) params.set("fuente", sp.fuente);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pedidos"
        description={`${nf.format(total)} ${filtering ? "resultados" : "en total"} · sincronizados de Shopify`}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <form action="/admin/orders" className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <SearchIcon
              aria-hidden
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Buscar por email o nº de pedido…"
              className="pl-8"
            />
          </div>
          {sp.fuente ? (
            <input type="hidden" name="fuente" value={sp.fuente} />
          ) : null}
          <Button type="submit" variant="outline">
            Buscar
          </Button>
          {filtering ? (
            <Button variant="ghost" render={<Link href="/admin/orders" />}>
              Limpiar
            </Button>
          ) : null}
        </form>

        {orders.length === 0 ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filtering ? "Sin resultados" : "Aún no hay pedidos"}
              </EmptyTitle>
              <EmptyDescription>
                {filtering
                  ? "Prueba con otra búsqueda."
                  : "Los pedidos llegan por webhook al instante y el cron shopify-sync (cada 10 min) trae el histórico. Si la tabla sigue vacía, revisa que la custom app tenga los scopes read_orders y read_customers."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Fuente
                    </TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Envío a
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const netTotal =
                      (order.total_price ?? 0) - (order.total_refunded ?? 0);
                    const summary = itemsSummary(order.line_items);
                    return (
                      <TableRow
                        key={order.id}
                        className={order.cancelled_at ? "opacity-60" : ""}
                      >
                        <TableCell>
                          <a
                            href={shopifyAdminUrl(`orders/${order.id}`)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="flex min-w-0 flex-col transition-colors hover:text-orange-400"
                          >
                            <span className="inline-flex items-center gap-1 font-medium">
                              {order.name ?? `#${order.id}`}
                              <ExternalLinkIcon
                                aria-hidden
                                className="size-3 text-muted-foreground"
                              />
                              {order.test ? (
                                <Badge variant="secondary">Test</Badge>
                              ) : null}
                              {order.cancelled_at ? (
                                <Badge variant="destructive">Cancelado</Badge>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatDateTime(order.created_at)}
                            </span>
                          </a>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {order.email ?? "—"}
                            </span>
                            {summary ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {summary}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="flex flex-col items-end">
                            <span className="font-medium">
                              {formatMoney(netTotal, order.currency ?? "EUR")}
                            </span>
                            {order.total_refunded > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                −{formatMoney(order.total_refunded)} reemb.
                              </span>
                            ) : null}
                            {order.discount_code ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {order.discount_code}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <OrderPaymentBadge
                              status={order.financial_status}
                            />
                            <OrderFulfillmentBadge
                              status={order.fulfillment_status}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {order.utm_source ? (
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate">
                                {order.utm_source}
                                {order.utm_medium
                                  ? ` / ${order.utm_medium}`
                                  : ""}
                              </span>
                              {order.utm_campaign ? (
                                <span className="truncate text-xs text-muted-foreground">
                                  {order.utm_campaign}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              directo
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground xl:table-cell">
                          {[
                            order.shipping_city,
                            order.shipping_province,
                            order.shipping_country_code === "ES"
                              ? null
                              : order.shipping_country_code,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
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
