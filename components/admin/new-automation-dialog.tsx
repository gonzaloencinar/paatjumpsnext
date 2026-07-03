"use client";

import { useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createAutomation } from "@/lib/crm/actions";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function NewAutomationDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAutomation, null);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            Nueva secuencia
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva secuencia</DialogTitle>
          <DialogDescription>
            Se crea desactivada y sin pasos; los añades en el editor.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="automation-name">Nombre</FieldLabel>
            <Input
              id="automation-name"
              name="name"
              required
              placeholder="Mini-curso de freestyle"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="automation-trigger">Inicio</FieldLabel>
            <select
              id="automation-trigger"
              name="trigger"
              defaultValue="manual"
              className={selectClass}
            >
              <option value="manual">
                Manual — inscribes suscriptores cuando quieras
              </option>
              <option value="signup">
                Al suscribirse — cada alta nueva entra sola
              </option>
            </select>
            <FieldDescription>
              Los triggers de checkout/pedidos llegan con la Fase 2.
            </FieldDescription>
          </Field>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
