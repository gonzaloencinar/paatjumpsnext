import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PackageIcon,
} from "lucide-react";
import { OrdersToolbar } from "@/components/admin/orders-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import {
  PacklinkCell,
  RefreshShipmentsButton,
} from "@/components/admin/packlink-cell";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney, PACKLINK_PHASE } from "@/lib/crm/format";
import { geneiPanelUrl } from "@/lib/crm/genei";
import { isUrgentShipping, packlinkPanelUrl } from "@/lib/crm/packlink";
import { getOrdersView, shopifyAdminUrl } from "@/lib/crm/store-queries";

export const metadata = { title: "Pedidos" };

const nf = new Intl.NumberFormat("es-ES");

type LineItem = { title?: string; quantity?: number };

function itemsSummary(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items = raw as LineItem[];
  const units = orderUnits(raw);
  const first = items[0]?.title ?? "";
  const extra = items.length - 1;
  return `${units} ud. · ${first}${extra > 0 ? ` +${extra}` : ""}`;
}

// Unidades del pedido: con más de 2 la celda de envío pide medidas y peso
function orderUnits(raw: unknown) {
  if (!Array.isArray(raw)) return 1;
  return (raw as LineItem[]).reduce(
    (sum, item) => sum + (item.quantity ?? 1),
    0,
  );
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00`));
}

const ESTADO_TABS = [
  { value: "", label: "Todos" },
  { value: "pendientes", label: "Pendientes de enviar" },
  { value: "enviados", label: "Enviados" },
] as const;

// El pedido admite borrador Packlink: cobrado, sin cancelar y sin enviar
const SHIPPABLE_FINANCIAL = new Set([
  "paid",
  "partially_paid",
  "partially_refunded",
]);

type SearchParams = {
  q?: string;
  fuente?: string;
  estado?: string;
  envio?: string;
  desde?: string;
  hasta?: string;
  recogida?: string;
  rdesde?: string;
  rhasta?: string;
  urgente?: string;
  page?: string;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { orders, shipments, awaitingId, total, page, perPage, kpis } =
    await getOrdersView({
      q: sp.q,
      fuente: sp.fuente,
      estado: sp.estado,
      envio: sp.envio,
      desde: sp.desde,
      hasta: sp.hasta,
      recogida: sp.recogida,
      rdesde: sp.rdesde,
      rhasta: sp.rhasta,
      urgente: sp.urgente,
      page: Number(sp.page) || 1,
    });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const filtering = Boolean(
    sp.q ||
      sp.fuente ||
      sp.estado ||
      sp.envio ||
      sp.desde ||
      sp.hasta ||
      sp.recogida ||
      sp.rdesde ||
      sp.rhasta ||
      sp.urgente,
  );

  function pageUrl(p: number, overrides: Partial<SearchParams> = {}) {
    const merged = { ...sp, ...overrides, page: p > 1 ? String(p) : undefined };
    const params = new URLSearchParams();
    for (const key of [
      "q",
      "fuente",
      "estado",
      "envio",
      "desde",
      "hasta",
      "recogida",
      "rdesde",
      "rhasta",
      "urgente",
      "page",
    ] as const) {
      const value = merged[key];
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  const kpiCards = [
    {
      label: "Pendientes de enviar",
      value: kpis.pendientes,
      href: pageUrl(1, {
        estado: "pendientes",
        envio: undefined,
        recogida: undefined,
        urgente: undefined,
      }),
    },
    {
      label: "Urgentes 24h",
      value: kpis.urgentes,
      href: pageUrl(1, {
        estado: "pendientes",
        urgente: "1",
        envio: undefined,
        recogida: undefined,
      }),
      highlight: kpis.urgentes > 0,
    },
    {
      label: "Recogida hoy",
      value: kpis.recogidaHoy,
      href: pageUrl(1, {
        recogida: "hoy",
        estado: undefined,
        envio: undefined,
        urgente: undefined,
      }),
    },
    {
      label: "Recogida mañana",
      value: kpis.recogidaManana,
      href: pageUrl(1, {
        recogida: "manana",
        estado: undefined,
        envio: undefined,
        urgente: undefined,
      }),
    },
    {
      label: "Incidencias",
      value: kpis.incidencias,
      href: pageUrl(1, {
        envio: "incidencia",
        estado: undefined,
        recogida: undefined,
        urgente: undefined,
      }),
      highlight: kpis.incidencias > 0,
    },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pedidos"
        description={`${nf.format(total)} ${filtering ? "resultados" : "en total"} · sincronizados de Shopify · envíos Packlink PRO`}
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpiCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className={`flex flex-col rounded-xl border px-3 py-2 transition-colors hover:border-orange-400/60 ${
                card.highlight ? "border-orange-400/40" : ""
              }`}
            >
              <span className="text-xs text-muted-foreground">
                {card.label}
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {nf.format(card.value)}
              </span>
            </Link>
          ))}
        </div>

        <OrdersToolbar />

        <div className="flex flex-wrap items-center gap-2">
          {ESTADO_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={(sp.estado ?? "") === tab.value ? "default" : "outline"}
              size="sm"
              render={
                <Link href={pageUrl(1, { estado: tab.value || undefined })} />
              }
            >
              {tab.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {filtering ? (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/orders" />}
              >
                Limpiar filtros
              </Button>
            ) : null}
            <RefreshShipmentsButton />
          </div>
        </div>

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
                  ? "Prueba con otros filtros."
                  : "Los pedidos llegan por webhook al instante y el cron shopify-sync (cada 10 min) trae el histórico. Si la tabla sigue vacía, revisa que la custom app tenga los scopes read_orders y read_customers."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="min-w-48">Envío</TableHead>
                    <TableHead>Recogida</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead className="hidden 2xl:table-cell">
                      Fuente
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const netTotal =
                      (order.total_price ?? 0) - (order.total_refunded ?? 0);
                    const summary = itemsSummary(order.line_items);
                    const shipment = shipments.get(order.id) ?? null;
                    const urgent = isUrgentShipping(order.shipping_line_title);
                    const fulfilled = order.fulfillment_status === "fulfilled";
                    const canCreate =
                      !order.cancelled_at &&
                      !order.test &&
                      !fulfilled &&
                      SHIPPABLE_FINANCIAL.has(order.financial_status ?? "");
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
                        <TableCell>
                          <PacklinkCell
                            orderId={order.id}
                            units={orderUnits(order.line_items)}
                            awaitingId={awaitingId.has(order.id)}
                            canCreate={canCreate}
                            orderFulfilled={fulfilled}
                            shipment={
                              shipment
                                ? {
                                    reference: shipment.reference,
                                    provider: shipment.provider,
                                    phase: shipment.phase,
                                    panelUrl:
                                      shipment.provider === "genei"
                                        ? geneiPanelUrl(shipment.reference)
                                        : packlinkPanelUrl(
                                            shipment.reference,
                                            shipment.phase,
                                          ),
                                    carrier: shipment.carrier,
                                    service: shipment.service,
                                    priceBase:
                                      shipment.cost && shipment.cost > 0
                                        ? shipment.cost
                                        : shipment.price_base,
                                    priceTotal: shipment.price_total,
                                    homeToHome: shipment.home_to_home,
                                    collectionDate: shipment.collection_date,
                                    collectionTime: shipment.collection_time,
                                    tracking: shipment.tracking,
                                    trackingUrl: shipment.tracking_url,
                                    labelUrl: shipment.label_url,
                                  }
                                : null
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {shipment?.collection_date ? (
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {formatDay(shipment.collection_date)}
                              </span>
                              {shipment.collection_time ? (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {shipment.collection_time}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            {urgent ? (
                              <Badge className="w-fit bg-orange-400 text-black">
                                Urgente 24h
                              </Badge>
                            ) : order.shipping_line_title ? (
                              <span className="truncate text-sm">
                                {order.shipping_line_title}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {shipment?.estimated_delivery_date ? (
                              <span className="text-xs text-muted-foreground">
                                est.{" "}
                                {formatDay(shipment.estimated_delivery_date)}
                              </span>
                            ) : null}
                            <span className="truncate text-xs text-muted-foreground">
                              {[
                                order.shipping_city,
                                order.shipping_country_code === "ES"
                                  ? order.shipping_province
                                  : order.shipping_country_code,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell">
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
