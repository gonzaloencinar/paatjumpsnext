"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createFinanceEntry,
  createFinanceRecurring,
  deleteFinanceEntry,
  deleteFinanceRecurring,
  toggleFinanceRecurring,
  updateFinanceEntry,
  updateFinanceRecurring,
  updateIrpfPct,
  type FinanceActionState,
} from "@/lib/crm/finance-actions";
import {
  FINANCE_FREQUENCIES,
  FINANCE_PARTNER_LABEL,
  FINANCE_PARTNERS,
} from "@/lib/crm/format";
import type { Tables } from "@/lib/crm/db-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type FinanceEntry = Tables<"finance_entries">;
type FinanceRecurring = Tables<"finance_recurring">;

function notify(state: Exclude<FinanceActionState, null>, success: string) {
  if (state.error) toast.error(state.error);
  else if (state.ok) toast.success(success);
}

function TypeToggle({
  value,
  onChange,
}: {
  value: "income" | "expense";
  onChange: (next: "income" | "expense") => void;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(groupValue: unknown) => {
        const next = Array.isArray(groupValue) ? groupValue[0] : groupValue;
        if (next === "income" || next === "expense") onChange(next);
      }}
      className="w-full"
    >
      <ToggleGroupItem value="expense" className="flex-1">
        Gasto
      </ToggleGroupItem>
      <ToggleGroupItem value="income" className="flex-1">
        Ingreso
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function PartnerToggle({
  type,
  defaultValue,
}: {
  type: "income" | "expense";
  defaultValue: string;
}) {
  const [partner, setPartner] = useState(defaultValue);
  return (
    <Field>
      <FieldLabel>{type === "expense" ? "Lo paga" : "Lo cobra"}</FieldLabel>
      <input type="hidden" name="partner" value={partner} />
      <ToggleGroup
        value={[partner]}
        onValueChange={(groupValue: unknown) => {
          const next = Array.isArray(groupValue) ? groupValue[0] : groupValue;
          if (next === "gonzalo" || next === "patri") setPartner(next);
        }}
        className="w-full"
      >
        {FINANCE_PARTNERS.map((value) => (
          <ToggleGroupItem key={value} value={value} className="flex-1">
            {FINANCE_PARTNER_LABEL[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

// ─────────────────────────── movimientos ───────────────────────────

export function FinanceEntryDialog({
  entry,
  defaultDate,
}: {
  entry?: FinanceEntry;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">(
    entry?.type === "income" ? "income" : "expense",
  );
  const action = entry
    ? updateFinanceEntry.bind(null, entry.id)
    : createFinanceEntry;
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    notify(state, "Movimiento guardado");
    if (state.ok) setOpen(false);
  }, [state]);

  const isEdit = Boolean(entry);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${entry!.concept}`}
            >
              <PencilIcon />
            </Button>
          ) : (
            <Button size="sm">
              <PlusIcon data-icon="inline-start" />
              Nuevo movimiento
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar ${entry!.concept}` : "Nuevo movimiento"}
          </DialogTitle>
          <DialogDescription>
            Gasto o ingreso manual del mes, asignado a un socio para el cuadre.
          </DialogDescription>
        </DialogHeader>

        <form
          key={`${open}-${entry?.updated_at ?? "new"}`}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <input type="hidden" name="type" value={type} />
          <FieldGroup>
            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <TypeToggle value={type} onChange={setType} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="entry-concept">Concepto</FieldLabel>
                <Input
                  id="entry-concept"
                  name="concept"
                  required
                  defaultValue={entry?.concept ?? ""}
                  placeholder={
                    type === "expense" ? "Material, envíos…" : "Venta feria…"
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="entry-amount">Importe (€)</FieldLabel>
                <Input
                  id="entry-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={entry?.amount ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PartnerToggle
                type={type}
                defaultValue={entry?.partner ?? "gonzalo"}
              />
              <Field>
                <FieldLabel htmlFor="entry-date">Fecha</FieldLabel>
                <Input
                  id="entry-date"
                  name="entry_date"
                  type="date"
                  required
                  defaultValue={entry?.entry_date ?? defaultDate}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="entry-notes">Notas</FieldLabel>
              <Textarea
                id="entry-notes"
                name="notes"
                rows={2}
                defaultValue={entry?.notes ?? ""}
                placeholder="Opcional"
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {isEdit ? "Guardar cambios" : "Añadir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFinanceEntryButton({ entry }: { entry: FinanceEntry }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteFinanceEntry(entry.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Movimiento eliminado");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Eliminar ${entry.concept}`}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar movimiento?</DialogTitle>
          <DialogDescription>
            {entry.recurring_id
              ? "Se quitará solo este mes; el recurrente seguirá generando los siguientes."
              : `"${entry.concept}" se eliminará del cuadre.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── recurrentes ───────────────────────────

export function FinanceRecurringDialog({
  recurring,
  today,
}: {
  recurring?: FinanceRecurring;
  // Fecha del servidor: calcular new Date() aquí en render rompería la
  // hidratación cerca de medianoche (SSR y cliente darían días distintos)
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">(
    recurring?.type === "income" ? "income" : "expense",
  );
  const [frequency, setFrequency] = useState(recurring?.frequency ?? "monthly");
  const action = recurring
    ? updateFinanceRecurring.bind(null, recurring.id)
    : createFinanceRecurring;
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    notify(state, "Recurrente guardado");
    if (state.ok) setOpen(false);
  }, [state]);

  const isEdit = Boolean(recurring);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${recurring!.concept}`}
            >
              <PencilIcon />
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <PlusIcon data-icon="inline-start" />
              Nuevo recurrente
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar ${recurring!.concept}` : "Nuevo recurrente"}
          </DialogTitle>
          <DialogDescription>
            Se genera solo cada periodo como movimiento del mes que toque.
          </DialogDescription>
        </DialogHeader>

        <form
          key={`${open}-${recurring?.updated_at ?? "new"}`}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="frequency" value={frequency} />
          <FieldGroup>
            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <TypeToggle value={type} onChange={setType} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rec-concept">Concepto</FieldLabel>
                <Input
                  id="rec-concept"
                  name="concept"
                  required
                  defaultValue={recurring?.concept ?? ""}
                  placeholder="Shopify, dominio, gestoría…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rec-amount">Importe (€)</FieldLabel>
                <Input
                  id="rec-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={recurring?.amount ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PartnerToggle
                type={type}
                defaultValue={recurring?.partner ?? "gonzalo"}
              />
              <Field>
                <FieldLabel htmlFor="rec-day">Día del mes</FieldLabel>
                <Input
                  id="rec-day"
                  name="day_of_month"
                  type="number"
                  min="1"
                  max="28"
                  required
                  defaultValue={recurring?.day_of_month ?? 1}
                />
                <FieldDescription>
                  1–28, para que exista en todos los meses.
                </FieldDescription>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Periodicidad</FieldLabel>
                <Select
                  value={frequency}
                  onValueChange={(value) =>
                    setFrequency(String(value ?? "monthly"))
                  }
                >
                  <SelectTrigger aria-label="Periodicidad">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(FINANCE_FREQUENCIES).map(
                        ([value, meta]) => (
                          <SelectItem key={value} value={value}>
                            {meta.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rec-starts">Desde</FieldLabel>
                <Input
                  id="rec-starts"
                  name="starts_on"
                  type="date"
                  required
                  defaultValue={recurring?.starts_on ?? today}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rec-ends">Hasta</FieldLabel>
                <Input
                  id="rec-ends"
                  name="ends_on"
                  type="date"
                  defaultValue={recurring?.ends_on ?? ""}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rec-notes">Notas</FieldLabel>
              <Textarea
                id="rec-notes"
                name="notes"
                rows={2}
                defaultValue={recurring?.notes ?? ""}
                placeholder="Opcional"
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {isEdit ? "Guardar cambios" : "Añadir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringActiveSwitch({
  recurring,
}: {
  recurring: FinanceRecurring;
}) {
  const [checked, setChecked] = useState(recurring.active);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={`Activar ${recurring.concept}`}
      onCheckedChange={(next) => {
        const value = Boolean(next);
        setChecked(value);
        startTransition(async () => {
          const result = await toggleFinanceRecurring(recurring.id, value);
          if (result?.error) {
            setChecked(!value);
            toast.error(result.error);
          }
        });
      }}
    />
  );
}

export function DeleteRecurringButton({
  recurring,
}: {
  recurring: FinanceRecurring;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteFinanceRecurring(recurring.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Recurrente eliminado");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Eliminar ${recurring.concept}`}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar recurrente?</DialogTitle>
          <DialogDescription>
            No se generarán más movimientos de &ldquo;{recurring.concept}
            &rdquo;; los ya generados se conservan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancelar</Button>} />
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── ajustes ───────────────────────────

export function IrpfDialog({
  month,
  monthLabel,
  globalIrpfPct,
  monthIrpfPct,
  irpfOverridden,
}: {
  month: string;
  monthLabel: string;
  globalIrpfPct: number;
  monthIrpfPct: number;
  irpfOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = updateIrpfPct.bind(null, month);
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    notify(state, "% de IRPF actualizado");
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Editar % de IRPF">
            <PencilIcon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tipo de IRPF</DialogTitle>
          <DialogDescription>
            Tu tipo marginal. Se reserva sobre tu base (tus ingresos menos tus
            gastos deducibles) antes del reparto; la retienes tú. Lo de Patri no
            tributa.
          </DialogDescription>
        </DialogHeader>
        <form
          key={`${open}-${month}`}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="irpf-month">
                Tipo de {monthLabel} (%)
              </FieldLabel>
              <Input
                id="irpf-month"
                name="irpf_month"
                type="number"
                min="0"
                max="60"
                step="0.1"
                defaultValue={irpfOverridden ? monthIrpfPct : ""}
                placeholder={`Global (${globalIrpfPct}%)`}
              />
              <FieldDescription>
                Vacío = sigue el global. Los meses pasados quedan congelados con
                el tipo que tenían.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="irpf-global">Tipo global (%)</FieldLabel>
              <Input
                id="irpf-global"
                name="irpf_global"
                type="number"
                min="0"
                max="60"
                step="0.1"
                required
                defaultValue={globalIrpfPct}
              />
              <FieldDescription>
                Cambiarlo solo afecta al mes en curso y siguientes; los
                anteriores conservan su tipo.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancelar</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
