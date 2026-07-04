"use client";

import { useActionState, useEffect, useState } from "react";
import { ClipboardPasteIcon, PencilIcon, PlusIcon } from "lucide-react";
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

type FormValues = {
  slug: string;
  destination: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  notes: string;
};

function initialValues(link?: ShortLink): FormValues {
  return {
    slug: link?.slug ?? "",
    destination: link?.destination ?? "/",
    utm_source: link ? (link.utm_source ?? "") : "instagram",
    utm_medium: link ? (link.utm_medium ?? "") : "social",
    utm_campaign: link?.utm_campaign ?? "",
    utm_term: link?.utm_term ?? "",
    utm_content: link?.utm_content ?? "",
    notes: link?.notes ?? "",
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
}

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

// Parsea un enlace completo pegado y lo separa en destino + UTMs. El resto de
// query params (p. ej. ?code=X) se quedan en el destino.
function parsePastedUrl(raw: string): Partial<FormValues> | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)?.trim();
    if (value) utm[key] = value;
    url.searchParams.delete(key);
  }

  const own =
    /(^|\.)paatjumps\.com$/i.test(url.hostname) || url.hostname === "localhost";
  const rest = url.searchParams.toString();
  const destination = `${own ? "" : url.origin}${url.pathname}${
    rest ? `?${rest}` : ""
  }`;

  return { destination: destination || "/", ...utm };
}

// Crea (sin prop) o edita (con `link`) un enlace corto. El slug es la parte
// pública (/l/<slug>): se puede cambiar, pero el enlace antiguo deja de
// funcionar — mejor cambiar solo destino/UTMs en enlaces ya publicados.
export function ShortLinkDialog({ link }: { link?: ShortLink }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(link));
  const [pasted, setPasted] = useState("");
  const [state, formAction, pending] = useActionState(saveShortLink, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(link ? "Enlace actualizado" : "Enlace creado");
      setOpen(false);
    }
  }, [state, link]);

  const set = (key: keyof FormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function applyPasted(raw: string) {
    setPasted(raw);
    const parsed = parsePastedUrl(raw);
    if (!parsed) return;
    setValues((prev) => ({
      ...prev,
      ...parsed,
      // Sugerir slug desde la campaña solo si aún no hay uno escrito
      slug:
        prev.slug ||
        (parsed.utm_campaign ? slugify(parsed.utm_campaign) : prev.slug),
    }));
    toast.success("Campos rellenados desde el enlace");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initialValues(link));
          setPasted("");
        }
      }}
    >
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
            Pega un enlace completo con UTMs y los campos se rellenan solos, o
            escríbelos a mano. El enlace público es
            paatjumps.com/l/&lt;slug&gt;.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-6">
          {link ? <input type="hidden" name="id" value={link.id} /> : null}
          <input type="hidden" name="utm_term" value={values.utm_term} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="link-paste">
                <ClipboardPasteIcon
                  aria-hidden
                  className="size-3.5 text-muted-foreground"
                />
                Pegar enlace completo (opcional)
              </FieldLabel>
              <Input
                id="link-paste"
                value={pasted}
                onChange={(e) => applyPasted(e.target.value)}
                placeholder="https://www.paatjumps.com/combas?utm_source=…"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state?.error ? true : undefined}>
                <FieldLabel htmlFor="link-slug">Slug</FieldLabel>
                <Input
                  id="link-slug"
                  name="slug"
                  placeholder="bio"
                  required
                  pattern="[a-z0-9-]{1,40}"
                  value={values.slug}
                  onChange={(e) => set("slug")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-destination">Destino</FieldLabel>
                <Input
                  id="link-destination"
                  name="destination"
                  placeholder="/ o /combas…"
                  value={values.destination}
                  onChange={(e) => set("destination")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-source">utm_source</FieldLabel>
                <Input
                  id="link-source"
                  name="utm_source"
                  value={values.utm_source}
                  onChange={(e) => set("utm_source")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-medium">utm_medium</FieldLabel>
                <Input
                  id="link-medium"
                  name="utm_medium"
                  value={values.utm_medium}
                  onChange={(e) => set("utm_medium")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-campaign">utm_campaign</FieldLabel>
                <Input
                  id="link-campaign"
                  name="utm_campaign"
                  placeholder="story-rebajas"
                  value={values.utm_campaign}
                  onChange={(e) => set("utm_campaign")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="link-content">
                  utm_content (opcional)
                </FieldLabel>
                <Input
                  id="link-content"
                  name="utm_content"
                  value={values.utm_content}
                  onChange={(e) => set("utm_content")(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="link-notes">Nota (opcional)</FieldLabel>
              <Input
                id="link-notes"
                name="notes"
                placeholder="Dónde está publicado este enlace"
                value={values.notes}
                onChange={(e) => set("notes")(e.target.value)}
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
