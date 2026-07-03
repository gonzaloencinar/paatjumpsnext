"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteCampaign } from "@/lib/crm/actions";
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

export function DeleteCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        await deleteCampaign(campaignId);
        router.push("/admin/campaigns");
      } catch {
        toast.error("No se pudo eliminar la campaña");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            <Trash2Icon data-icon="inline-start" />
            Eliminar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar este borrador?</DialogTitle>
          <DialogDescription>
            Se borra la campaña y su contenido. Esta acción no se puede
            deshacer.
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
