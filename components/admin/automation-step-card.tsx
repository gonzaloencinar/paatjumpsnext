"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAutomationStep,
  moveAutomationStep,
  toggleAutomationStep,
  updateAutomationStep,
} from "@/lib/crm/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { delayLabel, type AutomationStep } from "@/lib/crm/format";
import type { StepStats } from "@/lib/crm/queries";

// Mejor unidad para mostrar el delay guardado (minutos) en el formulario
function delayParts(minutes: number): { value: number; unit: string } {
  if (minutes > 0 && minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: "days" };
  }
  if (minutes > 0 && minutes % 60 === 0) {
    return { value: minutes / 60, unit: "hours" };
  }
  return { value: minutes, unit: "minutes" };
}

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AutomationStepCard({
  automationId,
  step,
  stats,
  index,
  total,
  cartTags = false,
}: {
  automationId: string;
  step: AutomationStep;
  stats: StepStats | null;
  index: number;
  total: number;
  cartTags?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(step.enabled);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [state, formAction, savePending] = useActionState(
    updateAutomationStep.bind(null, automationId, step.id),
    null,
  );
  useEffect(() => {
    if (state?.ok) toast.success("Paso guardado");
    if (state?.error) toast.error(state.error);
  }, [state]);

  const incomplete = !step.subject?.trim() || !step.body_html?.trim();
  const delay = delayParts(step.delay_minutes);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch {
        toast.error("No se pudo completar la acción");
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Paso {index + 1}</h2>
            <Badge variant="secondary">
              {index === 0
                ? `${delayLabel(step.delay_minutes)} tras el inicio`
                : `${delayLabel(step.delay_minutes)} tras el paso ${index}`}
            </Badge>
            {incomplete ? (
              <Badge variant="destructive">Sin contenido — no se envía</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Subir paso"
              disabled={pending || index === 0}
              onClick={() =>
                run(() => moveAutomationStep(automationId, step.id, "up"))
              }
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Bajar paso"
              disabled={pending || index === total - 1}
              onClick={() =>
                run(() => moveAutomationStep(automationId, step.id, "down"))
              }
            >
              <ArrowDownIcon />
            </Button>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar paso"
                    disabled={pending}
                  >
                    <Trash2Icon />
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>¿Eliminar el paso {index + 1}?</DialogTitle>
                  <DialogDescription>
                    Las inscripciones en curso saltarán al siguiente paso.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={
                      <Button type="button" variant="outline">
                        Volver
                      </Button>
                    }
                  />
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      run(() => deleteAutomationStep(automationId, step.id));
                      setDeleteOpen(false);
                    }}
                  >
                    Eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Switch
              checked={enabled}
              disabled={pending}
              aria-label={`Activar paso ${index + 1}`}
              onCheckedChange={(next) => {
                const value = Boolean(next);
                setEnabled(value);
                startTransition(async () => {
                  try {
                    await toggleAutomationStep(automationId, step.id, value);
                  } catch {
                    setEnabled(!value);
                    toast.error("No se pudo guardar el cambio");
                  }
                });
              }}
            />
          </div>
        </div>

        {stats && stats.sent > 0 ? (
          <p className="text-xs text-muted-foreground">
            Enviados: {stats.sent} · Aperturas: {stats.opened} · Clics:{" "}
            {stats.clicked}
          </p>
        ) : null}

        <form action={formAction} className="flex flex-col gap-4">
          <fieldset disabled={savePending} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={`step-delay-${step.id}`}>Espera</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`step-delay-${step.id}`}
                  name="delay_value"
                  type="number"
                  min={0}
                  step="any"
                  required
                  defaultValue={delay.value}
                  className="w-24"
                />
                <select
                  name="delay_unit"
                  defaultValue={delay.unit}
                  className={selectClass}
                  aria-label="Unidad de espera"
                >
                  <option value="minutes">minutos</option>
                  <option value="hours">horas</option>
                  <option value="days">días</option>
                </select>
              </div>
              <FieldDescription>
                {index === 0
                  ? "Desde el alta/inscripción hasta este email."
                  : "Desde el paso anterior hasta este email."}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={`step-subject-${step.id}`}>
                Asunto
              </FieldLabel>
              <Input
                id={`step-subject-${step.id}`}
                name="subject"
                defaultValue={step.subject ?? ""}
                placeholder="¿Ya sabes con cuál quedarte?"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`step-preheader-${step.id}`}>
                Preheader
              </FieldLabel>
              <Input
                id={`step-preheader-${step.id}`}
                name="preheader"
                defaultValue={step.preheader ?? ""}
                placeholder="La segunda línea en la bandeja de entrada (opcional)"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`step-body-${step.id}`}>
                Contenido (HTML)
              </FieldLabel>
              <Textarea
                id={`step-body-${step.id}`}
                name="body_html"
                rows={8}
                defaultValue={step.body_html ?? ""}
                placeholder="<p>Hola…</p>"
                className="font-mono text-xs"
              />
              <FieldDescription>
                Se envuelve con la plantilla de marca (cabecera, fondo oscuro,
                baja). Admite{" "}
                <code className="font-mono">{"{{codigo_descuento}}"}</code> (la
                promo activa o un código personal 15% de un solo uso, 48 h)
                {cartTags ? (
                  <>
                    , <code className="font-mono">{"{{url_carrito}}"}</code>{" "}
                    (enlace que retoma el carrito y aplica el código) y{" "}
                    <code className="font-mono">{"{{productos_carrito}}"}</code>{" "}
                    (resumen de lo que dejó; sin el tag se añade solo al final
                    del email)
                  </>
                ) : null}
                .
              </FieldDescription>
            </Field>
          </fieldset>

          <div>
            <Button type="submit" size="sm" disabled={savePending}>
              {savePending && <Spinner data-icon="inline-start" />}
              Guardar paso
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
