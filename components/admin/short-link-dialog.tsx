"use client";

import { useActionState, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { saveShortLink } from "@/lib/crm/link-actions";
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

export type ShortLink = {
  id: string;
  slug: string;
  destination: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  notes: string | null;
};

// Crea (sin prop) o edita (con `link`) un enlace corto. El slug es la parte
// pública (/l/<slug>): se puede cambiar, pero el enlace antiguo deja de
// funcionar — mejor cambiar solo destino/UTMs en enlaces ya publicados.
export function ShortLinkDialog({ link }: { link?: ShortLink }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveShortLink, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(link ? "Enlace actualizado" : "Enlace creado");
      setOpen(false);
    }
  }, [state, link]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          link ? (
            <Button variant="ghost" size="sm" aria-label="Editar enlace">
              <PencilIcon />
            </Button>
          ) : (
            <Button size="sm">
              <PlusIcon data-icon="inline-start" />
              Nuevo enlace
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {link ? `Editar /l/${link.slug}` : "Nuevo enlace corto"}
          </DialogTitle>
          <DialogDescription>
            El enlace público es paatjumps.com/l/&lt;slug&gt;; el visitante
            aterriza en el destino con los UTMs puestos.
          </DialogDescription>
        </DialogHeader>

        <form
          key={String(open)}
          action={formAction}
          className="flex flex-col gap-6"
        >
          {link ? <input type="hidden" name="id" value={link.id} /> : null}
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state?.error ? true : undefined}>
                <FieldLabel htmlFor="link-slug">Slug</FieldLabel>
                <Input
                  id="link-slug"
                  name="slug"
                  placeholder="bio"
                  required
                  pattern="[a-z0-9-]{1,40}"
                  defaultValue={link?.slug ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-destination">Destino</FieldLabel>
                <Input
                  id="link-destination"
                  name="destination"
                  placeholder="/ o /combas…"
                  defaultValue={link?.destination ?? "/"}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-source">utm_source</FieldLabel>
                <Input
                  id="link-source"
                  name="utm_source"
                  defaultValue={link ? (link.utm_source ?? "") : "instagram"}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-medium">utm_medium</FieldLabel>
                <Input
                  id="link-medium"
                  name="utm_medium"
                  defaultValue={link ? (link.utm_medium ?? "") : "social"}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-campaign">utm_campaign</FieldLabel>
                <Input
                  id="link-campaign"
                  name="utm_campaign"
                  placeholder="story-rebajas"
                  defaultValue={link?.utm_campaign ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-content">
                  utm_content (opcional)
                </FieldLabel>
                <Input
                  id="link-content"
                  name="utm_content"
                  defaultValue={link?.utm_content ?? ""}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="link-notes">Nota (opcional)</FieldLabel>
              <Input
                id="link-notes"
                name="notes"
                placeholder="Dónde está publicado este enlace"
                defaultValue={link?.notes ?? ""}
              />
            </Field>
            {state?.error ? <FieldError>{state.error}</FieldError> : null}
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
              {link ? "Guardar cambios" : "Crear enlace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
