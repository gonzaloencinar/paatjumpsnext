"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createPromotion,
  deletePromotion,
  togglePromotionActive,
  togglePromotionAnnounce,
  updatePromotion,
  type PromotionActionState,
} from "@/lib/crm/promotion-actions";
import type { Tables } from "@/lib/supabase/types";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Promotion = Tables<"promotions">;

function notify(state: Exclude<PromotionActionState, null>) {
  if (state.error) toast.error(state.error);
  else if (state.warning) toast.warning(state.warning);
  else if (state.ok) toast.success("Promoción guardada");
}

export function PromotionDialog({ promotion }: { promotion?: Promotion }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"general" | "affiliate">(
    promotion?.type === "affiliate" ? "affiliate" : "general",
  );
  const action = promotion
    ? updatePromotion.bind(null, promotion.id)
    : createPromotion;
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    notify(state);
    if (state.ok) setOpen(false);
  }, [state]);

  const isEdit = Boolean(promotion);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${promotion!.name}`}
            >
              <PencilIcon />
            </Button>
          ) : (
            <Button size="sm">
              <PlusIcon data-icon="inline-start" />
              Nueva promoción
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar ${promotion!.name}` : "Nueva promoción"}
          </DialogTitle>
          <DialogDescription>
            Se sincroniza con Shopify como código de descuento.
          </DialogDescription>
        </DialogHeader>

        <form
          key={`${open}-${promotion?.updated_at ?? "new"}`}
          action={formAction}
          className="flex flex-col gap-6"
        >
          <input type="hidden" name="type" value={type} />

          <FieldGroup>
            {!isEdit ? (
              <Field>
                <FieldLabel>Tipo</FieldLabel>
                <ToggleGroup
                  value={[type]}
                  onValueChange={(groupValue: unknown) => {
                    const next = Array.isArray(groupValue)
                      ? groupValue[0]
                      : groupValue;
                    if (next === "general" || next === "affiliate") {
                      setType(next);
                    }
                  }}
                  className="w-full"
                >
                  <ToggleGroupItem value="general" className="flex-1">
                    General
                  </ToggleGroupItem>
                  <ToggleGroupItem value="affiliate" className="flex-1">
                    Afiliado
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {type === "general"
                    ? "Código compartido con duración definida (un uso por cliente). Puede anunciarse en la web."
                    : "Código de un afiliado con comisión sobre sus ventas (sin límite de clientes)."}
                </FieldDescription>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="promo-name">Nombre</FieldLabel>
                <Input
                  id="promo-name"
                  name="name"
                  required
                  defaultValue={promotion?.name ?? ""}
                  placeholder={type === "general" ? "Rebajas verano" : "María"}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="promo-code">Código</FieldLabel>
                <Input
                  id="promo-code"
                  name="code"
                  required
                  defaultValue={promotion?.code ?? ""}
                  placeholder={type === "general" ? "VERANO15" : "MARIA10"}
                  className="font-mono uppercase"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="promo-pct">Descuento %</FieldLabel>
                <Input
                  id="promo-pct"
                  name="percentage"
                  type="number"
                  min={1}
                  max={100}
                  required
                  defaultValue={promotion?.percentage ?? 20}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="promo-starts">Inicio</FieldLabel>
                <Input
                  id="promo-starts"
                  name="starts_at"
                  type="date"
                  defaultValue={promotion?.starts_at.slice(0, 10) ?? today}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="promo-ends">Fin (opcional)</FieldLabel>
                <Input
                  id="promo-ends"
                  name="ends_at"
                  type="date"
                  defaultValue={promotion?.ends_at?.slice(0, 10) ?? ""}
                />
              </Field>
            </div>

            {type === "affiliate" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="promo-affiliate">
                    Nombre del afiliado
                  </FieldLabel>
                  <Input
                    id="promo-affiliate"
                    name="affiliate_name"
                    required
                    defaultValue={promotion?.affiliate_name ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="promo-commission">Comisión %</FieldLabel>
                  <Input
                    id="promo-commission"
                    name="affiliate_commission_pct"
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    required
                    defaultValue={promotion?.affiliate_commission_pct ?? 10}
                  />
                  <FieldDescription>
                    Sobre las ventas atribuidas a su código.
                  </FieldDescription>
                </Field>
              </div>
            ) : null}

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
              {isEdit ? "Guardar cambios" : "Crear promoción"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PromotionActiveSwitch({ promotion }: { promotion: Promotion }) {
  const [checked, setChecked] = useState(promotion.active);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={`Activar ${promotion.name}`}
      onCheckedChange={(next) => {
        const value = Boolean(next);
        setChecked(value);
        startTransition(async () => {
          const result = await togglePromotionActive(promotion.id, value);
          if (result?.error) {
            setChecked(!value);
            toast.error(result.error);
          } else if (result?.warning) {
            toast.warning(result.warning);
          } else {
            toast.success(
              value
                ? `${promotion.code} activada`
                : `${promotion.code} desactivada`,
            );
          }
        });
      }}
    />
  );
}

export function PromotionAnnounceSwitch({
  promotion,
}: {
  promotion: Promotion;
}) {
  const [checked, setChecked] = useState(promotion.announce);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      disabled={pending || !promotion.active}
      aria-label={`Anunciar ${promotion.name} en la web`}
      onCheckedChange={(next) => {
        const value = Boolean(next);
        setChecked(value);
        startTransition(async () => {
          const result = await togglePromotionAnnounce(promotion.id, value);
          if (result?.error) {
            setChecked(!value);
            toast.error(result.error);
          } else {
            toast.success(
              value
                ? "Anuncio visible en la web"
                : "Anuncio retirado de la web",
            );
          }
        });
      }}
    />
  );
}

export function DeletePromotionButton({ promotion }: { promotion: Promotion }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deletePromotion(promotion.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Promoción eliminada");
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
            aria-label={`Eliminar ${promotion.name}`}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar {promotion.name}?</DialogTitle>
          <DialogDescription>
            Se borra del CRM y también el descuento {promotion.code} en Shopify.
            Esta acción no se puede deshacer.
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
