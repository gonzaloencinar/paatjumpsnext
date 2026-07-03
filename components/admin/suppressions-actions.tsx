"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { addSuppression, removeSuppression } from "@/lib/crm/actions";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function AddSuppressionDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addSuppression, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Email añadido a supresiones");
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <PlusIcon data-icon="inline-start" />
            Suprimir email
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suprimir un email</DialogTitle>
          <DialogDescription>
            No se le enviará nada nunca más. Si es un contacto, pasa a estado de
            baja.
          </DialogDescription>
        </DialogHeader>
        <form
          key={String(open)}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <Field data-invalid={state?.error ? true : undefined}>
              <FieldLabel htmlFor="suppression-email">Email</FieldLabel>
              <Input
                id="suppression-email"
                name="email"
                type="email"
                required
                placeholder="cliente@email.com"
                aria-invalid={state?.error ? true : undefined}
              />
              {state?.error ? <FieldError>{state.error}</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Suprimir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveSuppressionButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        await removeSuppression(email);
        toast.success("Supresión eliminada");
        setOpen(false);
      } catch {
        toast.error("No se pudo eliminar la supresión");
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
            aria-label={`Quitar ${email} de supresiones`}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Quitar de supresiones?</DialogTitle>
          <DialogDescription>
            {email} volverá a poder recibir emails. Hazlo solo si lo ha pedido
            explícitamente.
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
            {pending && <Spinner data-icon="inline-start" />}
            Quitar supresión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
