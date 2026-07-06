"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./actions";
import { currentMadridMonth, freezePastMonthsIrpf } from "./finance";
import { FINANCE_FREQUENCIES } from "./format";

// Mutaciones de /admin/finance: movimientos manuales, recurrentes y % IRPF.

export type FinanceActionState = { error?: string; ok?: boolean } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FINANCE_PATH = "/admin/finance";

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
  entry_date: string;
  notes: string | null;
};

function parseEntryForm(formData: FormData): ParsedEntry | { error: string } {
  const type = formData.get("type") === "income" ? "income" : "expense";
  const concept = String(formData.get("concept") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const partner = parsePartner(formData.get("partner"));
  const entryDate = String(formData.get("entry_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!concept) return { error: "El movimiento necesita un concepto." };
  if (amount === null) return { error: "Importe no válido." };
  if (!partner) return { error: "Elige quién lo paga o lo cobra." };
  if (!DATE_RE.test(entryDate)) return { error: "Fecha no válida." };

  return { type, concept, amount, partner, entry_date: entryDate, notes };
}

export async function createFinanceEntry(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseEntryForm(formData);
  if ("error" in parsed) return parsed;
  const supabase = await requireAdmin();
  const { error } = await supabase.from("finance_entries").insert(parsed);
  if (error) return { error: "No se pudo guardar el movimiento." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

export async function updateFinanceEntry(
  id: string,
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseEntryForm(formData);
  if ("error" in parsed) return parsed;
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("finance_entries")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el movimiento." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

// Las entradas generadas por un recurrente se marcan con deleted_at
// (tombstone) para que la materialización no las recree; las manuales se
// borran de verdad.
export async function deleteFinanceEntry(
  id: string,
): Promise<FinanceActionState> {
  const supabase = await requireAdmin();
  const { data: entry } = await supabase
    .from("finance_entries")
    .select("id, recurring_id, period")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return { error: "Movimiento no encontrado." };

  const { error } =
    entry.recurring_id && entry.period
      ? await supabase
          .from("finance_entries")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
      : await supabase.from("finance_entries").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar el movimiento." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

// ─────────────────────────── recurrentes ───────────────────────────

type ParsedRecurring = {
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: "gonzalo" | "patri";
  frequency: string;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
};

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
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!concept) return { error: "El recurrente necesita un concepto." };
  if (amount === null) return { error: "Importe no válido." };
  if (!partner) return { error: "Elige quién lo paga o lo cobra." };
  if (!FINANCE_FREQUENCIES[frequency]) {
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
    frequency,
    day_of_month: dayOfMonth,
    starts_on: startsOn,
    ends_on: endsOn || null,
    notes,
  };
}

export async function createFinanceRecurring(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseRecurringForm(formData);
  if ("error" in parsed) return parsed;
  const supabase = await requireAdmin();
  const { error } = await supabase.from("finance_recurring").insert(parsed);
  if (error) return { error: "No se pudo guardar el recurrente." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

export async function updateFinanceRecurring(
  id: string,
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const parsed = parseRecurringForm(formData);
  if ("error" in parsed) return parsed;
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("finance_recurring")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar el recurrente." };

  // La entrada ya materializada del mes en curso se regenera con los nuevos
  // datos (los meses pasados no se tocan; los tombstones se respetan).
  await supabase
    .from("finance_entries")
    .delete()
    .eq("recurring_id", id)
    .gte("period", currentMadridMonth())
    .is("deleted_at", null);

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

export async function toggleFinanceRecurring(
  id: string,
  active: boolean,
): Promise<FinanceActionState> {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("finance_recurring")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
}

// Al borrar el recurrente, sus movimientos ya generados se conservan como
// movimientos sueltos (FK con set null).
export async function deleteFinanceRecurring(
  id: string,
): Promise<FinanceActionState> {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("finance_recurring")
    .delete()
    .eq("id", id);
  if (error) return { error: "No se pudo eliminar el recurrente." };
  revalidatePath(FINANCE_PATH);
  return { ok: true };
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

  const supabase = await requireAdmin();
  const { data: settings } = await supabase
    .from("finance_settings")
    .select("irpf_pct")
    .eq("id", true)
    .maybeSingle();
  const oldGlobal = settings?.irpf_pct ?? 37;

  if (globalPct !== oldGlobal) {
    await freezePastMonthsIrpf(supabase, oldGlobal);
    const { error } = await supabase
      .from("finance_settings")
      .update({ irpf_pct: globalPct, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { error: "No se pudo guardar el % global." };
  }

  if (monthPct !== null) {
    const { error } = await supabase.from("finance_month_irpf").upsert(
      {
        month,
        irpf_pct: monthPct,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "month" },
    );
    if (error) return { error: "No se pudo guardar el % del mes." };
  } else if (month >= currentMadridMonth()) {
    // Campo vacío = seguir el global; en meses pasados no se toca la fila
    // para no des-congelar un mes ya cerrado.
    const { error } = await supabase
      .from("finance_month_irpf")
      .delete()
      .eq("month", month);
    if (error) return { error: "No se pudo guardar el % del mes." };
  }

  revalidatePath(FINANCE_PATH);
  return { ok: true };
}
