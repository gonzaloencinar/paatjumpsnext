#!/usr/bin/env node
// Volcado one-shot Supabase -> Convex (dev por defecto; --prod para producción).
// Lee todas las tablas por PostgREST con la service key, transforma a los
// nombres/tipos del schema de Convex y las inserta por lotes vía
// `npx convex run migration:importChunk`. Orden de import = orden de
// dependencias (los padres antes que las filas que los referencian).
//
// Uso:  node tools/convex-migrate/import.mjs [--no-wipe] [--prod]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const WIPE = !process.argv.includes("--no-wipe");
const PROD = process.argv.includes("--prod");

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}

const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Columnas DATE / periodo que se conservan como string (el resto de *_at y
// las listadas en `timestamps` pasan a ms epoch)
const TABLES = [
  { name: "contacts", rename: { id: "legacyId" } },
  { name: "events", drop: ["id"], refs: { contact_id: "contactLegacyId" } },
  { name: "checkouts", rename: { id: "checkoutId" }, refs: { contact_id: "contactLegacyId" } },
  { name: "campaigns", rename: { id: "legacyId" } },
  { name: "discount_codes", rename: { id: "legacyId" }, refs: { contact_id: "contactLegacyId" } },
  { name: "automations", rename: { id: "legacyId" } },
  {
    name: "automation_steps",
    rename: { id: "legacyId" },
    refs: { automation_id: "automationLegacyId" },
  },
  {
    name: "email_sends",
    rename: { id: "legacyId" },
    refs: {
      contact_id: "contactLegacyId",
      campaign_id: "campaignLegacyId",
      automation_id: "automationLegacyId",
      automation_step_id: "automationStepLegacyId",
      checkout_id: "checkoutLegacyId",
    },
  },
  {
    name: "campaign_recipients",
    drop: ["id"],
    refs: {
      campaign_id: "campaignLegacyId",
      contact_id: "contactLegacyId",
      email_send_id: "emailSendLegacyId",
    },
  },
  {
    name: "automation_enrollments",
    drop: ["id"],
    refs: {
      automation_id: "automationLegacyId",
      contact_id: "contactLegacyId",
      checkout_id: "checkoutLegacyId",
    },
  },
  { name: "suppressions" },
  { name: "admin_users" },
  { name: "promotions", rename: { id: "legacyId" } },
  {
    name: "orders",
    rename: { id: "orderId" },
    refs: { contact_id: "contactLegacyId", campaign_id: "campaignLegacyId" },
  },
  { name: "customers", rename: { id: "customerId" } },
  { name: "sync_state" },
  {
    name: "packlink_shipments",
    dateOnly: ["collection_date", "estimated_delivery_date"],
    timestamps: ["shipment_date"],
  },
  { name: "order_dni_requests" },
  { name: "order_invoices" },
  { name: "order_credit_notes" },
  { name: "finance_recurring", rename: { id: "legacyId" }, dateOnly: ["starts_on", "ends_on"] },
  {
    name: "finance_entries",
    rename: { id: "legacyId" },
    refs: { recurring_id: "recurringLegacyId" },
    dateOnly: ["entry_date"],
  },
  { name: "finance_settings", drop: ["id"] },
  { name: "finance_month_irpf" },
  { name: "blog_posts", rename: { id: "legacyId" } },
  { name: "short_links", rename: { id: "legacyId" } },
];

// Etiquetas Genei: el PDF base64 de raw.etiqueta se saca del documento (roza el
// límite de 1 MiB/doc) y se sube a File Storage tras importar la tabla
const pendingLabels = [];

function transform(row, cfg) {
  if (cfg.name === "packlink_shipments" && row.raw?.etiqueta) {
    pendingLabels.push({ reference: row.reference, base64: row.raw.etiqueta });
    row.raw = { ...row.raw };
    delete row.raw.etiqueta;
  }
  const out = {};
  for (const [k, val] of Object.entries(row)) {
    if (val === null || cfg.drop?.includes(k)) continue;
    if (cfg.refs?.[k] !== undefined) {
      out[cfg.refs[k]] = val;
      continue;
    }
    const key = cfg.rename?.[k] ?? snakeToCamel(k);
    let v = val;
    if (!cfg.dateOnly?.includes(k) && (k.endsWith("_at") || cfg.timestamps?.includes(k))) {
      v = Date.parse(val);
      if (Number.isNaN(v)) throw new Error(`${cfg.name}.${k}: timestamp inválido ${val}`);
    }
    out[key] = v;
  }
  return out;
}

async function fetchTable(name) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=*&limit=10000`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

function convexRun(fn, argsJson) {
  const args = ["convex", "run", fn];
  if (argsJson !== undefined) args.push(argsJson);
  if (PROD) args.push("--prod");
  return execFileSync("npx", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Lotes acotados por tamaño de JSON: el límite práctico es ARG_MAX del SO
function* chunks(rows, maxBytes = 400_000, maxRows = 50) {
  let batch = [];
  let size = 0;
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length;
    if (batch.length > 0 && (size + rowSize > maxBytes || batch.length >= maxRows)) {
      yield batch;
      batch = [];
      size = 0;
    }
    batch.push(row);
    size += rowSize;
  }
  if (batch.length > 0) yield batch;
}

if (WIPE) {
  console.log("Vaciando tablas Convex…");
  convexRun("migration:wipeAllForReimport");
}

const expected = {};
for (const cfg of TABLES) {
  const rows = await fetchTable(cfg.name);
  expected[cfg.name] = rows.length;
  let inserted = 0;
  for (const batch of chunks(rows.map((r) => transform(r, cfg)))) {
    const out = convexRun(
      "migration:importChunk",
      JSON.stringify({ table: cfg.name, rows: batch }),
    );
    const parsed = JSON.parse(out);
    inserted += parsed.inserted;
    for (const w of parsed.warnings) console.warn(`  ⚠ ${w}`);
  }
  console.log(`${cfg.name}: ${inserted}/${rows.length}`);
}

for (const { reference, base64 } of pendingLabels) {
  const uploadUrl = JSON.parse(convexRun("migration:generateLabelUploadUrl"));
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from(base64, "base64"),
  });
  if (!res.ok) throw new Error(`upload etiqueta ${reference}: HTTP ${res.status}`);
  const { storageId } = await res.json();
  convexRun("migration:attachLabel", JSON.stringify({ reference, storageId }));
  console.log(`etiqueta ${reference} → storage ${storageId}`);
}

console.log("\nVerificando conteos en Convex…");
const counts = JSON.parse(convexRun("migration:counts"));
let ok = true;
for (const [table, n] of Object.entries(expected)) {
  const status = counts[table] === n ? "✓" : "✗";
  if (counts[table] !== n) ok = false;
  console.log(`  ${status} ${table}: supabase=${n} convex=${counts[table]}`);
}
process.exit(ok ? 0 : 1);
