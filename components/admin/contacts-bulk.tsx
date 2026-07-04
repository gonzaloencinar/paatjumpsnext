"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { MailIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { createCampaignFromContacts } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";

// Selección de contactos para bulk email (§tabla /admin/contacts): el provider
// (cliente) envuelve la tabla server-rendered y los checkboxes hoja comparten
// su estado por contexto. "Redactar email" crea una campaña borrador con la
// faceta ids (selección manual) y salta al editor — mismo flujo de
// probar/programar/enviar que cualquier campaña.

type Selection = {
  selected: Set<string>;
  toggle: (id: string, on: boolean) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Falta ContactsSelectionProvider");
  return ctx;
}

export function ContactsSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const value = useMemo<Selection>(
    () => ({
      selected,
      toggle: (id, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setMany: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      clear: () => setSelected(new Set()),
    }),
    [selected],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function ContactSelectCheckbox({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const { selected, toggle } = useSelection();
  return (
    <Checkbox
      aria-label={`Seleccionar ${email}`}
      checked={selected.has(id)}
      onCheckedChange={(checked) => toggle(id, Boolean(checked))}
    />
  );
}

// Cabecera: selecciona/deselecciona la página visible.
export function ContactSelectAllCheckbox({ pageIds }: { pageIds: string[] }) {
  const { selected, setMany } = useSelection();
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));
  return (
    <Checkbox
      aria-label="Seleccionar los contactos de esta página"
      checked={allSelected}
      indeterminate={!allSelected && someSelected}
      onCheckedChange={(checked) => setMany(pageIds, Boolean(checked))}
    />
  );
}

// Barra que aparece con la selección: recuento + redactar + limpiar.
export function BulkEmailBar() {
  const { selected, clear } = useSelection();
  const [pending, startTransition] = useTransition();
  if (selected.size === 0) return null;

  function compose() {
    startTransition(async () => {
      const result = await createCampaignFromContacts([...selected]);
      // Si todo va bien la acción redirige al editor de la campaña
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5">
      <p className="text-sm">
        <span className="font-semibold">{selected.size}</span>{" "}
        {selected.size === 1
          ? "contacto seleccionado"
          : "contactos seleccionados"}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
          <XIcon data-icon="inline-start" />
          Limpiar
        </Button>
        <Button size="sm" onClick={compose} disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <MailIcon data-icon="inline-start" />
          )}
          Redactar email
        </Button>
      </div>
    </div>
  );
}
