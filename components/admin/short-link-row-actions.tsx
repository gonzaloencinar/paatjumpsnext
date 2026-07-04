"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteShortLink } from "@/lib/crm/link-actions";
import { Button } from "@/components/ui/button";
import {
  ShortLinkDialog,
  type ShortLink,
} from "@/components/admin/short-link-dialog";

export function CopyShortLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Copiar ${url}`}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Enlace copiado");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

export function ShortLinkRowActions({ link }: { link: ShortLink }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-1">
      <ShortLinkDialog link={link} />
      <Button
        variant="ghost"
        size="sm"
        aria-label="Borrar enlace"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `¿Borrar /l/${link.slug}? El enlace dejará de funcionar donde esté publicado.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            const result = await deleteShortLink(link.id);
            if (result?.error) toast.error(result.error);
            else toast.success("Enlace borrado");
          });
        }}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
