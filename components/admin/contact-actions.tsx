"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  PencilIcon,
  Trash2Icon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
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

export function ContactActions({
  contact,
}: {
  contact: {
    id: string;
    email: string;
    first_name: string | null;
    status: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [editState, editAction, editPending] = useActionState(
    updateContact.bind(null, contact.id),
    null,
  );

  useEffect(() => {
    if (editState?.ok) {
      toast.success("Contacto guardado");
      setEditOpen(false);
    }
  }, [editState]);

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

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteContact(contact.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Contacto eliminado");
        router.push("/admin/contacts");
      }
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
            <DialogDescription>
              El cambio queda registrado en su timeline.
            </DialogDescription>
          </DialogHeader>

          <form
            key={String(editOpen)}
            action={editAction}
            className="flex flex-col gap-6"
          >
            <FieldGroup>
              <Field data-invalid={editState?.error ? true : undefined}>
                <FieldLabel htmlFor="edit-contact-email">Email</FieldLabel>
                <Input
                  id="edit-contact-email"
                  name="email"
                  type="email"
                  required
                  defaultValue={contact.email}
                  aria-invalid={editState?.error ? true : undefined}
                />
                {editState?.error ? (
                  <FieldError>{editState.error}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-contact-name">
                  Nombre (opcional)
                </FieldLabel>
                <Input
                  id="edit-contact-name"
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
              <Button type="submit" disabled={editPending}>
                {editPending && <Spinner data-icon="inline-start" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar {contact.email}?</DialogTitle>
            <DialogDescription>
              Se borra el contacto con su timeline e inscripciones. Sus pedidos,
              códigos y emails enviados se conservan desvinculados, y si estaba
              en supresiones sigue ahí. Esta acción no se puede deshacer.
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
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
