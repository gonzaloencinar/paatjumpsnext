"use client";

import { useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { addContact } from "@/lib/crm/actions";
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

export function AddContactDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addContact, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Contacto creado");
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            Añadir contacto
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir contacto</DialogTitle>
          <DialogDescription>
            Alta manual: se registra con consentimiento &ldquo;alta manual desde
            el CRM&rdquo; y estado suscrito.
          </DialogDescription>
        </DialogHeader>

        <form
          key={String(open)}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <Field data-invalid={state?.error ? true : undefined}>
              <FieldLabel htmlFor="new-contact-email">Email</FieldLabel>
              <Input
                id="new-contact-email"
                name="email"
                type="email"
                placeholder="cliente@email.com"
                required
                aria-invalid={state?.error ? true : undefined}
              />
              {state?.error ? <FieldError>{state.error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="new-contact-name">
                Nombre (opcional)
              </FieldLabel>
              <Input id="new-contact-name" name="first_name" />
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
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Guardar contacto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
