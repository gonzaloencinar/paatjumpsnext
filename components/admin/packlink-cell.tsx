"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  PrinterIcon,
  RefreshCwIcon,
  Trash2Icon,
  TruckIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  changePacklinkServiceAction,
  createPacklinkDraftAction,
  deletePacklinkDraftAction,
  getLabelAction,
  listQuotesAction,
  payPacklinkDraftAction,
  refreshPacklinkAction,
  type ParcelDims,
} from "@/lib/crm/packlink-actions";
import type { PacklinkQuote } from "@/lib/crm/packlink";
import { PACKLINK_PHASE } from "@/lib/crm/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

// Celda "Envío" de /admin/orders: fase del envío, proveedor (Packlink PRO o
// Genei), precio sin IVA, selector de servicio comparando AMBOS proveedores
// (domicilio-domicilio primero, ⚠️ si no lo es), pago de la etiqueta desde el
// CRM y descarga/impresión de la etiqueta.

export type PacklinkCellShipment = {
  reference: string;
  /** "packlink" | "genei" */
  provider: string;
  phase: string;
  panelUrl: string;
  carrier: string | null;
  service: string | null;
  priceBase: number | null;
  priceTotal: number | null;
  homeToHome: boolean | null;
  collectionDate: string | null;
  collectionTime: string | null;
  tracking: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
};

const linkClass =
  "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-orange-400";

const euro = (value: number) => `${value.toFixed(2).replace(".", ",")} €`;

const providerName = (provider: string) =>
  provider === "genei" ? "Genei" : "Packlink";

// Distinguir el proveedor de un vistazo: Packlink azul, Genei verde
function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 text-[10px] uppercase tracking-wide",
        provider === "genei"
          ? "border-emerald-400/40 text-emerald-400"
          : "border-sky-400/40 text-sky-400",
      )}
    >
      {providerName(provider)}
    </Badge>
  );
}

// ───────────────────────── selector de servicio ─────────────────────────

function QuoteRow({
  quote,
  selected,
  onSelect,
}: {
  quote: PacklinkQuote;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-orange-400/60 bg-orange-400/10"
          : "hover:bg-accent/50",
      )}
    >
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          <ProviderBadge provider={quote.provider} />
          <span className="truncate">
            {[quote.carrier, quote.name].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {quote.homeToHome ? (
            "Recogida y entrega a domicilio"
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <AlertTriangleIcon aria-hidden className="size-3" />
              Requiere punto de recogida o entrega
            </span>
          )}
          {quote.estimatedDelivery
            ? ` · entrega ~${formatDay(quote.estimatedDelivery)}`
            : quote.transit
              ? ` · ${quote.transit.toLowerCase()}`
              : ""}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-medium tabular-nums">
          {euro(quote.priceBase)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {euro(quote.priceTotal)} IVA incl.
        </span>
      </div>
    </button>
  );
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00`));
}

// Medidas (cm) y peso (kg) del paquete, siempre editables. Se prefillan con
// el sobre estándar y el peso real del pedido de Shopify.
type ParcelForm = {
  length: string;
  width: string;
  height: string;
  weight: string;
};

const parseNum = (value: string) => Number(value.replace(",", "."));

function ParcelFields({
  form,
  onChange,
  onQuote,
  loading,
  cta,
}: {
  form: ParcelForm;
  onChange: (form: ParcelForm) => void;
  onQuote: () => void;
  loading: boolean;
  cta: string;
}) {
  const fields = [
    { key: "length", label: "Largo", unit: "cm", step: 1 },
    { key: "width", label: "Ancho", unit: "cm", step: 1 },
    { key: "height", label: "Alto", unit: "cm", step: 1 },
    { key: "weight", label: "Peso", unit: "kg", step: 0.05 },
  ] as const;
  return (
    <div className="flex items-end gap-2">
      {fields.map((field) => (
        <label key={field.key} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {field.label} ({field.unit})
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={field.key === "weight" ? 0.05 : 1}
            step={field.step}
            value={form[field.key]}
            onChange={(event) =>
              onChange({ ...form, [field.key]: event.target.value })
            }
            className="h-8 w-full rounded-md border bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:border-orange-400/60"
          />
        </label>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onQuote}
        disabled={loading}
      >
        {loading ? <Spinner data-icon="inline-start" /> : null}
        {cta}
      </Button>
    </div>
  );
}

function ServiceDialog({
  orderId,
  reference,
  units,
  open,
  onOpenChange,
}: {
  orderId: number;
  /** con referencia = cambiar servicio de un borrador; sin ella = crear */
  reference?: string;
  /** unidades del pedido: con más de 2 hay que revisar medidas y peso */
  units: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [quotes, setQuotes] = useState<PacklinkQuote[] | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ParcelForm>({
    length: "",
    width: "",
    height: "",
    weight: "",
  });
  // Destino con aduana (Canarias/Ceuta/Melilla): Genei exige DNI/NIE del
  // destinatario. Se prefilla con el del pedido (campo del carrito) si llegó.
  const [needsDni, setNeedsDni] = useState(false);
  const [dni, setDni] = useState("");
  // Con más de 2 combas no cabe el sobre estándar: primero revisar el paquete
  const needsReview = units > 2;
  const [reviewing, setReviewing] = useState(needsReview);

  function formDims(): ParcelDims | undefined {
    const dims = {
      length: parseNum(form.length),
      width: parseNum(form.width),
      height: parseNum(form.height),
      weight: parseNum(form.weight),
    };
    return [dims.length, dims.width, dims.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
      ? dims
      : undefined;
  }

  function loadQuotes(dims: ParcelDims | undefined, prefillOnly: boolean) {
    setLoading(true);
    setQuotes(null);
    setSelectedKey(null);
    listQuotesAction(orderId, dims).then((result) => {
      setLoading(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setForm({
        length: String(result.parcel.length),
        width: String(result.parcel.width),
        height: String(result.parcel.height),
        weight: String(result.parcel.weight),
      });
      setNeedsDni(result.needsDni);
      setDni((current) => current || result.dni || "");
      setUrgent(result.urgent);
      if (prefillOnly) return;
      setQuotes(result.quotes);
      setSelectedKey(result.defaultKey);
    });
  }

  useEffect(() => {
    if (!open) return;
    setQuotes(null);
    setSelectedKey(null);
    setReviewing(needsReview);
    // Con revisión pendiente la carga solo prefilla medidas y peso reales
    loadQuotes(undefined, needsReview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  function quoteWithForm() {
    setReviewing(false);
    loadQuotes(formDims(), false);
  }

  function confirm() {
    if (!selectedKey) return;
    startTransition(async () => {
      const dims = formDims();
      const dniValue = dni.trim() || undefined;
      const result = reference
        ? await changePacklinkServiceAction(
            reference,
            orderId,
            selectedKey,
            dims,
            dniValue,
          )
        : await createPacklinkDraftAction(orderId, selectedKey, dims, dniValue);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          `${reference ? "Servicio cambiado" : `Borrador ${result.reference} creado`} · ${result.service} (${result.priceBase})`,
        );
        onOpenChange(false);
      }
    });
  }

  const selected = quotes?.find((quote) => quote.key === selectedKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {reference
              ? "Cambiar servicio de envío"
              : "Elegir servicio de envío"}
          </DialogTitle>
          <DialogDescription>
            Packlink PRO y Genei a la vez · precios sin IVA ·
            domicilio-domicilio primero
            {urgent ? " · el cliente eligió URGENTE 24h en el checkout" : ""}
          </DialogDescription>
        </DialogHeader>
        {reviewing ? (
          <p className="text-xs text-amber-400">
            <AlertTriangleIcon aria-hidden className="mr-1 inline size-3" />
            Pedido de {units} unidades: no cabe en el sobre estándar. Revisa las
            medidas y el peso antes de cotizar.
          </p>
        ) : null}
        <ParcelFields
          form={form}
          onChange={setForm}
          onQuote={quoteWithForm}
          loading={loading}
          cta={reviewing || !quotes ? "Cotizar" : "Recotizar"}
        />
        {needsDni ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              DNI/NIE del destinatario (aduana Canarias/Ceuta/Melilla — lo exige
              Genei)
            </span>
            <input
              type="text"
              value={dni}
              maxLength={20}
              placeholder="12345678A"
              onChange={(event) => setDni(event.target.value.toUpperCase())}
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm uppercase outline-none placeholder:normal-case focus-visible:border-orange-400/60"
            />
          </label>
        ) : null}
        {!reviewing ? (
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : (
              (quotes ?? []).map((quote) => (
                <QuoteRow
                  key={quote.key}
                  quote={quote}
                  selected={quote.key === selectedKey}
                  onSelect={() => setSelectedKey(quote.key)}
                />
              ))
            )}
          </div>
        ) : null}
        {selected?.collection ? (
          <p className="text-xs text-muted-foreground">
            Recogida: {formatDay(selected.collection.date)} ·{" "}
            {selected.collection.time}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            }
          />
          <Button onClick={confirm} disabled={pending || !selectedKey}>
            {pending && <Spinner data-icon="inline-start" />}
            {reference ? "Cambiar" : "Crear borrador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── pagar ─────────────────────────

function PayDialog({
  orderId,
  shipment,
  open,
  onOpenChange,
}: {
  orderId: number;
  shipment: PacklinkCellShipment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await payPacklinkDraftAction(shipment.reference, orderId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          `Etiqueta comprada (${result.reference}${result.total ? ` · ${result.total}` : ""})`,
        );
        onOpenChange(false);
        if (result.labelUrl) {
          window.open(result.labelUrl, "_blank", "noopener,noreferrer");
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Pagar la etiqueta?</DialogTitle>
          <DialogDescription>
            {[
              providerName(shipment.provider),
              shipment.carrier,
              shipment.service,
            ]
              .filter(Boolean)
              .join(" · ")}
            {shipment.priceBase != null
              ? ` — ${euro(shipment.priceBase)} s/IVA${
                  shipment.priceTotal != null
                    ? ` (${euro(shipment.priceTotal)} IVA incl.)`
                    : ""
                }`
              : ""}
            {shipment.collectionDate
              ? ` · recogida ${formatDay(shipment.collectionDate)}${
                  shipment.collectionTime ? ` ${shipment.collectionTime}` : ""
                }`
              : ""}
            .{" "}
            {shipment.provider === "genei"
              ? "El cargo va al saldo de tu cuenta Genei."
              : "El cargo va al método de pago de tu cuenta Packlink PRO."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            }
          />
          <Button onClick={confirm} disabled={pending}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CreditCardIcon data-icon="inline-start" />
            )}
            Pagar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── celda ─────────────────────────

// Petición de DNI (aduana/internacional) sin responder: el cliente tiene el
// email con el formulario; recordatorio a las 24 h y aviso interno a las 48 h
function AwaitingIdBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-400/40 text-amber-400"
      title="Se le ha pedido el DNI por email (aduana). Recordatorio a las 24 h; aviso a contacto@ a las 48 h."
    >
      Esperando ID
    </Badge>
  );
}

export function PacklinkCell({
  orderId,
  units,
  awaitingId,
  canCreate,
  orderFulfilled,
  shipment,
}: {
  orderId: number;
  /** unidades del pedido (para pedir medidas del paquete si son >2) */
  units: number;
  /** petición de DNI (aduana/internacional) pendiente de respuesta */
  awaitingId: boolean;
  canCreate: boolean;
  orderFulfilled: boolean;
  shipment: PacklinkCellShipment | null;
}) {
  const [serviceOpen, setServiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Sin envío
  if (!shipment) {
    if (!canCreate)
      return awaitingId ? (
        <AwaitingIdBadge />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    return (
      <div className="flex flex-wrap items-center gap-1">
        {awaitingId ? <AwaitingIdBadge /> : null}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            // Con más de 2 unidades el sobre estándar no vale: el selector
            // pide revisar medidas y peso antes de cotizar
            if (units > 2) {
              setServiceOpen(true);
              return;
            }
            startTransition(async () => {
              const result = await createPacklinkDraftAction(orderId);
              if ("error" in result) toast.error(result.error);
              else {
                toast.success(
                  `Borrador ${result.reference} · ${result.service} (${result.priceBase})`,
                );
              }
            });
          }}
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <TruckIcon data-icon="inline-start" />
          )}
          Borrador
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Elegir servicio"
          onClick={() => setServiceOpen(true)}
        >
          <ChevronDownIcon />
        </Button>
        <ServiceDialog
          orderId={orderId}
          units={units}
          open={serviceOpen}
          onOpenChange={setServiceOpen}
        />
      </div>
    );
  }

  const meta = PACKLINK_PHASE[shipment.phase] ?? {
    label: shipment.phase,
    badge: "secondary" as const,
  };
  const isDraft = shipment.phase === "borrador";
  const price = shipment.priceBase;

  function openLabel() {
    if (shipment!.labelUrl) {
      window.open(shipment!.labelUrl, "_blank", "noopener,noreferrer");
      return;
    }
    startTransition(async () => {
      const result = await getLabelAction(shipment!.reference);
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else toast.error(result.error ?? "Etiqueta no disponible");
    });
  }

  function removeDraft() {
    startTransition(async () => {
      const result = await deletePacklinkDraftAction(shipment!.reference);
      if (result.error) toast.error(result.error);
      else toast.success("Borrador eliminado");
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={meta.badge}>{meta.label}</Badge>
        <ProviderBadge provider={shipment.provider} />
        {awaitingId ? <AwaitingIdBadge /> : null}
        {shipment.homeToHome === false ? (
          <span
            title="Este servicio NO es domicilio-domicilio"
            className="text-amber-400"
          >
            <AlertTriangleIcon aria-hidden className="size-3.5" />
          </span>
        ) : null}
        {isDraft && orderFulfilled ? (
          <Badge variant="destructive">Pedido ya enviado</Badge>
        ) : null}
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {[shipment.carrier, shipment.service].filter(Boolean).join(" · ") ||
          shipment.reference}
        {price != null ? (
          <span className="tabular-nums"> · {euro(price)} s/IVA</span>
        ) : null}
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <a
          href={shipment.panelUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          {providerName(shipment.provider)}
          <ExternalLinkIcon aria-hidden className="size-3" />
        </a>
        {!isDraft ? (
          <button type="button" onClick={openLabel} className={linkClass}>
            <PrinterIcon aria-hidden className="size-3" />
            Etiqueta
          </button>
        ) : null}
        {shipment.tracking ? (
          shipment.trackingUrl ? (
            <a
              href={shipment.trackingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={linkClass}
              title={shipment.tracking}
            >
              Tracking
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">
              {shipment.tracking}
            </span>
          )
        ) : null}
        {isDraft ? (
          <>
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className={cn(linkClass, "font-medium text-orange-400")}
            >
              <CreditCardIcon aria-hidden className="size-3" />
              Pagar
            </button>
            <button
              type="button"
              onClick={() => setServiceOpen(true)}
              className={linkClass}
            >
              Cambiar servicio
            </button>
            <button
              type="button"
              onClick={removeDraft}
              disabled={pending}
              className={cn(linkClass, "hover:text-destructive")}
              title="Eliminar borrador"
            >
              <Trash2Icon aria-hidden className="size-3" />
            </button>
          </>
        ) : null}
      </div>
      <ServiceDialog
        orderId={orderId}
        reference={shipment.reference}
        units={units}
        open={serviceOpen}
        onOpenChange={setServiceOpen}
      />
      <PayDialog
        orderId={orderId}
        shipment={shipment}
        open={payOpen}
        onOpenChange={setPayOpen}
      />
    </div>
  );
}

// Botón de la toolbar: fuerza el sync Packlink → CRM → fulfillment Shopify
export function RefreshShipmentsButton() {
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await refreshPacklinkAction();
      if (result.error) toast.error(result.error);
      else toast.success("Envíos sincronizados");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={refresh} disabled={pending}>
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <RefreshCwIcon data-icon="inline-start" />
      )}
      Actualizar envíos
    </Button>
  );
}
