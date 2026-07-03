"use client";

import { useTransition } from "react";
import { ChevronDownIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";
import { setContactStatus } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

export function ContactActions({
  contactId,
  status,
}: {
  contactId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: "subscribed" | "unsubscribed") {
    startTransition(async () => {
      try {
        await setContactStatus(contactId, next);
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

  return (
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
            disabled={status === "subscribed"}
            onClick={() => change("subscribed")}
          >
            <UserCheckIcon />
            Marcar como suscrito
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={status === "unsubscribed"}
            onClick={() => change("unsubscribed")}
          >
            <UserXIcon />
            Dar de baja (suprimir)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
