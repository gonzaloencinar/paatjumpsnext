#!/usr/bin/env node
/**
 * apply-seo.mjs — Aplica el copy SEO de la auditoría (docs/seo-auditoria-2026-07.md)
 * a la tienda Shopify vía Admin GraphQL (`shopify store execute`, auth ya guardada).
 *
 * Qué hace:
 *  1. Colecciones (combas-pvc, combas-segmentadas): seo.title + seo.description en ES
 *     y traducciones EN de title / meta_title / meta_description.
 *     El title EN pasa a «Beaded Jump Ropes» / «PVC Jump Ropes» — en inglés la keyword
 *     es «beaded JUMP rope» (3.600/mes), no «beaded rope» (390/mes).
 *  2. Productos: seo.description ES (~150 chars; sin ella la web volcaba la descripción
 *     entera en la meta description) + traducciones EN de title y meta_description.
 *     El title EN gana «Jump»: «Black Beaded Rope» → «Black Beaded Jump Rope».
 *
 * El seo.title de producto se deja vacío a propósito: el nombre del producto ya es la
 * keyword y la web hace fallback a él.
 *
 * Idempotente (re-ejecutar deja el mismo resultado). Uso:
 *   node tools/seo/apply-seo.mjs --dry-run     # muestra el plan, no toca la tienda
 *   node tools/seo/apply-seo.mjs               # aplica todo
 *   node tools/seo/apply-seo.mjs --only negra  # solo productos cuyo handle contenga eso
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(__dirname, ".tmp");

const STORE = "ars0a5-xx.myshopify.com";

const DRY = process.argv.includes("--dry-run");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const log = (...a) => console.log(...a);
const die = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

// ── copy ─────────────────────────────────────────────────────────────────────

const COLLECTIONS = {
  "combas-segmentadas": {
    seo: {
      title: "Combas segmentadas para freestyle y trucos",
      description:
        "Combas segmentadas (beaded ropes) hechas a mano: cuentas de PVC sobre cuerda de 4 mm para ritmo, control y trucos. De principiante a freestyle. Envío gratis 24/48 h.",
    },
    en: {
      title: "Beaded Jump Ropes",
      meta_title: "Beaded Jump Ropes for Freestyle & Tricks",
      meta_description:
        "Handmade beaded jump ropes: PVC beads on a thick 4 mm cord for rhythm, control and tricks. The easiest jump rope to learn on — from beginner to freestyle.",
    },
  },
  "combas-pvc": {
    seo: {
      title: "Combas PVC de velocidad y freestyle",
      description:
        "Combas PVC ligeras y rápidas hechas a mano en España: la comba ideal para velocidad, dobles y freestyle. Ajustable y duradera. Envío gratis 24/48 h.",
    },
    en: {
      title: "PVC Jump Ropes",
      meta_title: "PVC Jump Ropes — Speed & Freestyle",
      meta_description:
        "Light, fast PVC jump ropes handmade in Spain: ideal for speed work, double unders and freestyle. Adjustable and durable. Fast EU shipping.",
    },
  },
};

const isPvc = (handle) => handle.startsWith("comba-pvc");

const productDescEs = (p) =>
  isPvc(p.handle)
    ? `${p.title}, hecha a mano en España: ligera y rápida para velocidad, dobles y freestyle. Se ajusta a tu altura en un minuto. Envío gratis 24/48 h.`
    : `${p.title}, hecha a mano en España: cuentas de PVC sobre cuerda gruesa de 4 mm que marcan el ritmo para aprender, entrenar y hacer trucos. Envío gratis 24/48 h.`;

const productDescEn = (p, titleEn) =>
  isPvc(p.handle)
    ? `${titleEn}, handmade in Spain: light and fast for speed work, double unders and freestyle. Adjusts to your height in a minute. Fast EU shipping.`
    : `${titleEn}, handmade in Spain: PVC beads on a thick 4 mm cord that set the rhythm — learn, train and do tricks from day one. Fast EU shipping.`;

// «Black Beaded Rope» → «Black Beaded Jump Rope» (no-op si ya dice Jump Rope).
const withJump = (titleEn) =>
  /jump\s+ropes?/i.test(titleEn)
    ? titleEn
    : titleEn.replace(/\bRopes\b/, "Jump Ropes").replace(/\bRope\b/, "Jump Rope");

// ── GraphQL vía shopify CLI (mismo mecanismo que tools/shopify-create) ────────

let gqlSeq = 0;
async function gql(query, variables = {}, { mutation = false } = {}) {
  await mkdir(TMP, { recursive: true });
  const n = ++gqlSeq;
  const qf = path.join(TMP, `op.graphql`);
  const vf = path.join(TMP, `vars.json`);
  const of = path.join(TMP, `out.json`);
  await writeFile(qf, query);
  await writeFile(vf, JSON.stringify(variables));
  const args = [
    "store",
    "execute",
    "--store",
    STORE,
    "--query-file",
    qf,
    "--variable-file",
    vf,
    "--json",
    "--output-file",
    of,
  ];
  if (mutation) args.push("--allow-mutations");
  let stderr = "";
  try {
    const r = await execFileP("shopify", args, {
      maxBuffer: 128 * 1024 * 1024,
      cwd: ROOT,
    });
    stderr = r.stderr || "";
  } catch (e) {
    stderr = (e.stderr || "") + (e.stdout || "");
  }
  let raw;
  try {
    raw = await readFile(of, "utf8");
  } catch {
    throw new Error(`gql#${n} sin salida. stderr: ${stderr.slice(-500)}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`gql#${n} salida no-JSON: ${raw.slice(0, 400)}`);
  }
  if (json.errors)
    throw new Error(
      `gql#${n} errors: ${JSON.stringify(json.errors).slice(0, 500)}`,
    );
  return json.data || json;
}
const checkUE = (obj, label) => {
  const ue = obj?.userErrors;
  if (ue && ue.length) throw new Error(`${label}: ${JSON.stringify(ue)}`);
};

// ── queries/mutations ────────────────────────────────────────────────────────

const Q_PRODUCTS = `query Products($q:String){ products(first:50, query:$q){ nodes{ id handle title seo{ title description } } } }`;
const Q_COLLECTION = `query Col($handle:String!){ collectionByHandle(handle:$handle){ id handle title seo{ title description } } }`;
const Q_TRANSLATABLE = `query Tr($id:ID!){ translatableResource(resourceId:$id){ translatableContent{ key digest } translations(locale:"en"){ key value } } }`;
const M_PRODUCT = `mutation Upd($product:ProductUpdateInput!){ productUpdate(product:$product){ product{ id } userErrors{ field message } } }`;
const M_COLLECTION = `mutation Upd($input:CollectionInput!){ collectionUpdate(input:$input){ collection{ id } userErrors{ field message } } }`;
const M_TRANSLATE = `mutation Tr($id:ID!,$translations:[TranslationInput!]!){ translationsRegister(resourceId:$id,translations:$translations){ userErrors{ field message } } }`;

// EN se registra vía la API de traducciones: necesita el digest del contenido
// ORIGEN (ES) de cada campo, por eso el orden es «ES primero, EN después».
async function registerEn(resourceId, entries, label) {
  const tr = await gql(Q_TRANSLATABLE, { id: resourceId });
  const digests = Object.fromEntries(
    (tr.translatableResource?.translatableContent ?? []).map((c) => [
      c.key,
      c.digest,
    ]),
  );
  const current = Object.fromEntries(
    (tr.translatableResource?.translations ?? []).map((c) => [c.key, c.value]),
  );
  const translations = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    if (!digests[key]) {
      log(`   ⚠ ${label}: sin contenido origen para «${key}», lo salto`);
      continue;
    }
    if (current[key] === value) continue; // ya está
    translations.push({
      locale: "en",
      key,
      value,
      translatableContentDigest: digests[key],
    });
  }
  if (!translations.length) {
    log(`   EN al día (sin cambios)`);
    return { current };
  }
  if (DRY) {
    for (const t of translations) log(`   [dry] EN ${t.key} → «${t.value}»`);
    return { current };
  }
  const d = await gql(M_TRANSLATE, { id: resourceId, translations }, { mutation: true });
  checkUE(d.translationsRegister, `translationsRegister ${label}`);
  for (const t of translations) log(`   ✓ EN ${t.key} → «${t.value}»`);
  return { current };
}

// ── main ─────────────────────────────────────────────────────────────────────

log(`Aplicando SEO en ${STORE} ${DRY ? "(DRY RUN)" : ""}\n`);

// 1) Colecciones
for (const [handle, copy] of Object.entries(COLLECTIONS)) {
  const d = await gql(Q_COLLECTION, { handle });
  const col = d.collectionByHandle;
  if (!col) {
    log(`⚠ Colección «${handle}» no encontrada, la salto`);
    continue;
  }
  log(`▶ Colección ${col.title} (${handle})`);
  const seoUpToDate =
    col.seo?.title === copy.seo.title &&
    col.seo?.description === copy.seo.description;
  if (seoUpToDate) {
    log(`   ES al día (sin cambios)`);
  } else if (DRY) {
    log(`   [dry] ES seo.title → «${copy.seo.title}»`);
    log(`   [dry] ES seo.description → «${copy.seo.description}»`);
  } else {
    const u = await gql(
      M_COLLECTION,
      { input: { id: col.id, seo: copy.seo } },
      { mutation: true },
    );
    checkUE(u.collectionUpdate, `collectionUpdate ${handle}`);
    log(`   ✓ ES seo.title → «${copy.seo.title}»`);
  }
  await registerEn(col.id, copy.en, handle);
}

// 2) Productos
const d = await gql(Q_PRODUCTS, { q: "status:active" });
let products = d.products.nodes.filter((p) => p.handle.startsWith("comba"));
if (ONLY) products = products.filter((p) => p.handle.includes(ONLY));
log(`\n${products.length} productos\n`);

for (const p of products) {
  log(`▶ ${p.title} (${p.handle})`);
  const descEs = productDescEs(p);
  if (p.seo?.description === descEs) {
    log(`   ES al día (sin cambios)`);
  } else if (DRY) {
    log(`   [dry] ES seo.description → «${descEs}»`);
  } else {
    const u = await gql(
      M_PRODUCT,
      { product: { id: p.id, seo: { description: descEs } } },
      { mutation: true },
    );
    checkUE(u.productUpdate, `productUpdate ${p.handle}`);
    log(`   ✓ ES seo.description`);
  }

  // EN: primero necesitamos el title EN actual para derivar el nuevo.
  const tr = await gql(Q_TRANSLATABLE, { id: p.id });
  const currentEnTitle = (tr.translatableResource?.translations ?? []).find(
    (t) => t.key === "title",
  )?.value;
  if (!currentEnTitle) {
    log(`   ⚠ sin traducción EN del título — reviso a mano; salto EN`);
    continue;
  }
  const titleEn = withJump(currentEnTitle);
  await registerEn(
    p.id,
    { title: titleEn, meta_description: productDescEn(p, titleEn) },
    p.handle,
  );
}

log(`\nHecho.`);
