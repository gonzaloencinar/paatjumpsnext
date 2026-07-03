"use client";

import { useState, useTransition } from "react";
import { UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { enrollSubscribers } from "@/lib/crm/actions";
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
import { Spinner } from "@/components/ui/spinner";

export function EnrollSubscribersButton({
  automationId,
  audienceCount,
}: {
  automationId: string;
  audienceCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await enrollSubscribers(automationId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setOpen(false);
        toast.success(result?.message ?? "Suscriptores inscritos");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UsersIcon data-icon="inline-start" />
            Inscribir suscriptores
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Inscribir a los suscritos actuales?</DialogTitle>
          <DialogDescription>
            Hay {audienceCount}{" "}
            {audienceCount === 1 ? "contacto suscrito" : "contactos suscritos"}.
            Solo se inscribe a quien nunca ha pasado por esta secuencia; el
            primer paso sale según su espera.
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
          <Button onClick={confirm} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Inscribir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
