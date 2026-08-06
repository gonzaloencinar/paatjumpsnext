"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import { requireAdmin } from "./actions";
import { currentMadridMonth, freezePastMonthsIrpf } from "./finance";
import { FINANCE_FREQUENCIES } from "./format";

// Mutaciones de /admin/finance: movimientos manuales, recurrentes y % IRPF.
// El gate sigue siendo requireAdmin() (sesión + allowlist); los datos viven en
// Convex (convex/finance.ts).

export type FinanceActionState = { error?: string; ok?: boolean } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FINANCE_PATH = "/admin/finance";

// Ejecuta la mutación traduciendo tanto el error de negocio ({ error }) como
// el fallo de infraestructura (throw) a la forma legacy del formulario.
async function runMutation(
  work: Promise<{ error?: string; ok?: boolean }>,
  fallback: string,
): Promise<FinanceActionState> {
  try {
    const result = await work;
    if (result?.error) return { error: result.error };
  } catch {
    return { error: fallback };
  }
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const value = Number(
    String(raw ?? "")
      .trim()
      .replace(",", "."),
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function parsePartner(
  raw: FormDataEntryValue | null,
): "gonzalo" | "patri" | null {
  const value = String(raw ?? "");
  return value === "gonzalo" || value === "patri" ? value : null;
}

// ─────────────────────────── movimientos ───────────────────────────

type ParsedEntry = {
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: "gonzalo" | "patri";
  entryDate: string;
  notes: string | undefined;
};

function parseEntryForm(formData: FormData): ParsedEntry | { error: string } {
  const type = formData.get("type") === "income" ? "income" : "expense";
  const concept = String(formData.get("concept") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const partner = parsePartner(formData.get("partner"));
  const entryDate = String(formData.get("entry_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!concept) return { error: "El movimiento necesita un concepto." };
  if (amount === null) return { error: "Importe no válido." };
  if (!partner) return { error: "Elige quién lo paga o lo cobra." };
  if (!DATE_RE.test(entryDate)) return { error: "Fecha no válida." };

  return { type, concept, amount, partner, entryDate, notes };
}

export async function createFinanceEntry(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseEntryForm(formData);
  if ("error" in parsed) return parsed;
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.createEntry, parsed),
    "No se pudo guardar el movimiento.",
  );
}

export async function updateFinanceEntry(
  id: string,
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseEntryForm(formData);
  if ("error" in parsed) return parsed;
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.updateEntry, { id, ...parsed }),
    "No se pudo actualizar el movimiento.",
  );
}

// Las entradas generadas por un recurrente se marcan con deletedAt
// (tombstone) para que la materialización no las recree; las manuales se
// borran de verdad. La distinción vive en la mutación (transaccional).
export async function deleteFinanceEntry(
  id: string,
): Promise<FinanceActionState> {
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.deleteEntry, { id }),
    "No se pudo eliminar el movimiento.",
  );
}

// ─────────────────────────── recurrentes ───────────────────────────

type ParsedRecurring = {
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: "gonzalo" | "patri";
  frequency: "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly";
  dayOfMonth: number;
  startsOn: string;
  endsOn: string | undefined;
  notes: string | undefined;
};

const RECURRING_FREQUENCIES = [
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const;

function parseRecurringForm(
  formData: FormData,
): ParsedRecurring | { error: string } {
  const type = formData.get("type") === "income" ? "income" : "expense";
  const concept = String(formData.get("concept") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const partner = parsePartner(formData.get("partner"));
  const frequency = String(formData.get("frequency") ?? "monthly");
  const dayOfMonth = Math.round(Number(formData.get("day_of_month") ?? 1));
  const startsOn = String(formData.get("starts_on") ?? "").trim();
  const endsOn = String(formData.get("ends_on") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!concept) return { error: "El recurrente necesita un concepto." };
  if (amount === null) return { error: "Importe no válido." };
  if (!partner) return { error: "Elige quién lo paga o lo cobra." };
  const knownFrequency = RECURRING_FREQUENCIES.find((f) => f === frequency);
  if (!knownFrequency || !FINANCE_FREQUENCIES[frequency]) {
    return { error: "Periodicidad no válida." };
  }
  if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    return { error: "El día del mes debe estar entre 1 y 28." };
  }
  if (!DATE_RE.test(startsOn)) return { error: "Fecha de inicio no válida." };
  if (endsOn && !DATE_RE.test(endsOn))
    return { error: "Fecha de fin no válida." };
  if (endsOn && endsOn < startsOn) {
    return { error: "La fecha de fin debe ser posterior al inicio." };
  }

  return {
    type,
    concept,
    amount,
    partner,
    frequency: knownFrequency,
    dayOfMonth,
    startsOn,
    endsOn: endsOn || undefined,
    notes,
  };
}

export async function createFinanceRecurring(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseRecurringForm(formData);
  if ("error" in parsed) return parsed;
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.createRecurring, parsed),
    "No se pudo guardar el recurrente.",
  );
}

export async function updateFinanceRecurring(
  id: string,
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseRecurringForm(formData);
  if ("error" in parsed) return parsed;
  await requireAdmin();
  // La mutación también borra la entrada ya materializada del mes en curso en
  // adelante para regenerarla con los nuevos datos (los meses pasados no se
  // tocan; los tombstones se respetan).
  return runMutation(
    convexMutation(api.finance.updateRecurring, {
      id,
      fromPeriod: currentMadridMonth(),
      ...parsed,
    }),
    "No se pudo actualizar el recurrente.",
  );
}

export async function toggleFinanceRecurring(
  id: string,
  active: boolean,
): Promise<FinanceActionState> {
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.toggleRecurring, { id, active }),
    "No se pudo cambiar el estado.",
  );
}

// Al borrar el recurrente, sus movimientos ya generados se conservan como
// movimientos sueltos (la mutación limpia su recurringId).
export async function deleteFinanceRecurring(
  id: string,
): Promise<FinanceActionState> {
  await requireAdmin();
  return runMutation(
    convexMutation(api.finance.deleteRecurring, { id }),
    "No se pudo eliminar el recurrente.",
  );
}

// ─────────────────────────── ajustes ───────────────────────────

// Tipo marginal de IRPF (lo mete Gonzalo a mano): global + override del mes
// visto. Al cambiar el global, los meses pasados sin tipo propio se congelan
// con el valor antiguo — el cambio solo afecta al mes en curso y siguientes.
export async function updateIrpfPct(
  month: string,
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Mes no válido." };

  const globalRaw = String(formData.get("irpf_global") ?? "").trim();
  const monthRaw = String(formData.get("irpf_month") ?? "").trim();
  const globalPct = Number(globalRaw.replace(",", "."));
  if (!Number.isFinite(globalPct) || globalPct < 0 || globalPct > 60) {
    return { error: "El % global debe estar entre 0 y 60." };
  }
  let monthPct: number | null = null;
  if (monthRaw) {
    monthPct = Number(monthRaw.replace(",", "."));
    if (!Number.isFinite(monthPct) || monthPct < 0 || monthPct > 60) {
      return { error: "El % del mes debe estar entre 0 y 60." };
    }
  }

  await requireAdmin();
  const settings = await convexQuery(api.finance.settings, {});
  const oldGlobal = settings?.irpfPct ?? 37;

  if (globalPct !== oldGlobal) {
    try {
      await freezePastMonthsIrpf(oldGlobal);
      await convexMutation(api.finance.setGlobalIrpf, { irpfPct: globalPct });
    } catch {
      return { error: "No se pudo guardar el % global." };
    }
  }

  if (monthPct !== null) {
    try {
      await convexMutation(api.finance.upsertMonthIrpf, {
        month,
        irpfPct: monthPct,
      });
    } catch {
      return { error: "No se pudo guardar el % del mes." };
    }
  } else if (month >= currentMadridMonth()) {
    // Campo vacío = seguir el global; en meses pasados no se toca la fila
    // para no des-congelar un mes ya cerrado.
    try {
      await convexMutation(api.finance.deleteMonthIrpf, { month });
    } catch {
      return { error: "No se pudo guardar el % del mes." };
    }
  }

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}
