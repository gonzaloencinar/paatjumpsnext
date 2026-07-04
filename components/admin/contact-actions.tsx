"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  MailIcon,
  PencilIcon,
  Trash2Icon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  createCampaignFromContacts,
  createCampaignFromCustomerEmail,
  deleteContact,
  setContactStatus,
  updateContact,
} from "@/lib/crm/actions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type ContactSummary = {
  id: string;
  email: string;
  first_name: string | null;
  status: string;
};

function EditContactDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: ContactSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateContact.bind(null, contact.id),
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Contacto guardado");
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar contacto</DialogTitle>
          <DialogDescription>
            El cambio queda registrado en su timeline.
          </DialogDescription>
        </DialogHeader>

        <form
          key={String(open)}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <Field data-invalid={state?.error ? true : undefined}>
              <FieldLabel htmlFor={`edit-email-${contact.id}`}>
                Email
              </FieldLabel>
              <Input
                id={`edit-email-${contact.id}`}
                name="email"
                type="email"
                required
                defaultValue={contact.email}
                aria-invalid={state?.error ? true : undefined}
              />
              {state?.error ? <FieldError>{state.error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-name-${contact.id}`}>
                Nombre (opcional)
              </FieldLabel>
              <Input
                id={`edit-name-${contact.id}`}
                name="first_name"
                defaultValue={contact.first_name ?? ""}
              />
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
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteContactDialog({
  contact,
  open,
  onOpenChange,
  redirectTo,
}: {
  contact: ContactSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Desde la ficha se vuelve a la lista; desde la lista basta el revalidate.
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteContact(contact.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Contacto eliminado");
        onOpenChange(false);
        if (redirectTo) router.push(redirectTo);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar {contact.email}?</DialogTitle>
          <DialogDescription>
            Se borra el contacto con su timeline e inscripciones. Sus pedidos,
            códigos y emails enviados se conservan desvinculados, y si estaba en
            supresiones sigue ahí. Esta acción no se puede deshacer.
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
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Acciones de la fila en /admin/contacts: editar y eliminar a mano.
export function ContactRowActions({ contact }: { contact: ContactSummary }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar ${contact.email}`}
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Eliminar ${contact.email}`}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon />
        </Button>
      </div>
      <EditContactDialog
        contact={contact}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteContactDialog
        contact={contact}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}

// Sobre en la fila de /admin/customers: email 1-a-1 al cliente, si su email
// ya es contacto suscrito del CRM (la acción valida y explica si no).
export function EmailCustomerButton({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();

  function compose() {
    startTransition(async () => {
      const result = await createCampaignFromCustomerEmail(email);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Enviar email a ${email}`}
      disabled={pending}
      onClick={compose}
    >
      {pending ? <Spinner /> : <MailIcon />}
    </Button>
  );
}

// Menú de la ficha del contacto (/admin/contacts/[id]).
export function ContactActions({ contact }: { contact: ContactSummary }) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function change(next: "subscribed" | "unsubscribed") {
    startTransition(async () => {
      try {
        await setContactStatus(contact.id, next);
        toast.success(
          next === "subscribed"
            ? "Contacto marcado como suscrito"
            : "Contacto dado de baja y añadido a supresiones",
        );
      } catch {
        toast.error("No se pudo cambiar el estado");
      }
    });
  }

  // Campaña borrador para este contacto; la acción redirige al editor.
  function composeEmail() {
    startTransition(async () => {
      const result = await createCampaignFromContacts([contact.id]);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Acciones
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={contact.status !== "subscribed"}
              onClick={composeEmail}
            >
              <MailIcon />
              Enviar email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Editar datos
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={contact.status === "subscribed"}
              onClick={() => change("subscribed")}
            >
              <UserCheckIcon />
              Marcar como suscrito
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={contact.status === "unsubscribed"}
              onClick={() => change("unsubscribed")}
            >
              <UserXIcon />
              Dar de baja (suprimir)
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            Eliminar contacto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditContactDialog
        contact={contact}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteContactDialog
        contact={contact}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        redirectTo="/admin/contacts"
      />
    </>
  );
}
