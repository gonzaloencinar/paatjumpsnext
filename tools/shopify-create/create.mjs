#!/usr/bin/env node
/**
 * create.mjs — Crea los productos de combas (PVC + segmentadas) en la tienda Shopify
 * "Paat Jumps" usando el Admin GraphQL a través de `shopify store execute` (auth ya guardada).
 *
 * Por producto: sube las fotos 1:1 (staged uploads), crea el producto (ACTIVE) con su
 * colección + metafield custom.color + media, pone el precio en la variante por defecto y
 * lo publica en "Tienda online" y "Paat Jumps Headless".
 *
 * REGLA segmentadas: cada segmentada lleva como ÚLTIMA foto el infográfico de calidad
 * public/combasBeaded-1:1/explicaciónCalidadBeaded.PNG (cuerda gruesa 4 mm vs 2,5 mm).
 *
 * Idempotente: se salta los productos cuyo handle ya exista.
 *
 * Uso:
 *   node tools/shopify-create/create.mjs --dry-run          # plan, sin tocar la tienda
 *   node tools/shopify-create/create.mjs --only naranja     # solo el/los cuyo slug contenga eso
 *   node tools/shopify-create/create.mjs --limit 1          # solo el primero pendiente
 *   node tools/shopify-create/create.mjs                    # crea todos los pendientes
 *   node tools/shopify-create/create.mjs --update-existing  # actualiza desc + foto de calidad en segmentadas YA creadas
 *   node tools/shopify-create/create.mjs --no-publish       # crea pero no publica en canales
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(__dirname, ".tmp");

const STORE = "ars0a5-xx.myshopify.com";
const ADMIN_STORE = "ars0a5-xx";
const COL_PVC = "gid://shopify/Collection/682482073932"; // Combas PVC
const COL_SEG = "gid://shopify/Collection/682481418572"; // Combas segmentadas
const PUB_TIENDA = "gid://shopify/Publication/346150011212"; // Tienda online
const PUB_HEADLESS = "gid://shopify/Publication/353476280652"; // Paat Jumps Headless

// Foto de calidad que va SIEMPRE la última en toda segmentada.
const EXTRA_BEADED = path.join(ROOT, "public/combasBeaded-1:1/explicaciónCalidadBeaded.PNG");
const EXTRA_ALT = "Paat Jumps · cuerda gruesa de 4 mm frente a los 2,5 mm de otras marcas: más control, durabilidad y estabilidad";

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("⚠ ", ...a);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
const slug = (s) => s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── catálogo ──────────────────────────────────────────────────────────────────
const PVC = [
  { slug: "negro",   title: "Comba PVC Negra",   color: "Negra" },
  { slug: "naranja", title: "Comba PVC Naranja", color: "Naranja" },
  { slug: "rosa",    title: "Comba PVC Rosa",    color: "Rosa" },
  { slug: "verde",   title: "Comba PVC Verde",   color: "Verde" },
].map((x) => ({ ...x, kind: "pvc", productType: "Comba PVC", price: "19.90", collectionId: COL_PVC, tags: ["Comba", "PVC", "Velocidad"], dir: path.join(ROOT, "public/combasPVC-1:1", x.slug) }));

const SEG = [
  { slug: "black",               title: "Comba Segmentada Negra",           color: "Negra" },
  { slug: "bright-orange",       title: "Comba Segmentada Naranja",         color: "Naranja" },
  { slug: "bright-apple-green",  title: "Comba Segmentada Verde Manzana",   color: "Verde Manzana" },
  { slug: "forest-green",        title: "Comba Segmentada Verde Bosque",    color: "Verde Bosque" },
  { slug: "cobalt-blue",         title: "Comba Segmentada Azul Cobalto",    color: "Azul Cobalto" },
  { slug: "magenta",             title: "Comba Segmentada Magenta",         color: "Magenta" },
  { slug: "violet-purple",       title: "Comba Segmentada Violeta",         color: "Violeta" },
  { slug: "bright-orange-black", title: "Comba Segmentada Naranja y Negra", color: "Naranja y Negra", bicolor: true },
  { slug: "magenta-black",       title: "Comba Segmentada Magenta y Negra", color: "Magenta y Negra", bicolor: true },
  { slug: "lime-and-black",      title: "Comba Segmentada Lima y Negra",    color: "Lima y Negra", bicolor: true },
].map((x) => ({ ...x, kind: "seg", productType: "Comba segmentada", price: "29.90", collectionId: COL_SEG, tags: ["Comba", "Segmentada", "Principiantes"], dir: path.join(ROOT, "public/combasBeaded-1:1", x.slug) }));

const PRODUCTS = [...PVC, ...SEG];

function buildDesc(p) {
  if (p.kind === "pvc") {
    return [
      `<p><strong>${p.title}</strong> — velocidad y control sin enredos. El cable de PVC macizo gira fluido y aguanta impacto tras impacto, para que entrenes rápido y sin excusas.</p>`,
      `<ul>`,
      `<li><strong>Cable de PVC de ~5 mm</strong>: ligero y veloz en el aire, perfecto para dobles, HIIT, CrossFit, boxeo y cardio.</li>`,
      `<li><strong>Mangos negros mate</strong> con el logo Paat Jumps grabado: agarre firme y buen equilibrio.</li>`,
      `<li><strong>Longitud ajustable</strong> en un minuto con unas tijeras, a tu medida (apta de ~1,50 m a ~2,00 m de altura).</li>`,
      `<li><strong>Giro directo</strong>, sin rodamientos que se atasquen, con tapones que sujetan bien el cable.</li>`,
      `<li>Incluye <strong>bolsa de transporte Paat Jumps</strong>.</li>`,
      `</ul>`,
      `<p>Salta más, piensa menos.</p>`,
    ].join("");
  }
  const bicolor = p.bicolor ? `<li><strong>Diseño bicolor</strong>: cuentas de ${p.color} alternadas.</li>` : "";
  return [
    `<p><strong>${p.title}</strong> — la forma más fácil de aprender a saltar. Las cuentas hacen «tic-tic-tic» cada vez que la comba toca el suelo: un metrónomo natural que le enseña a tu cuerpo cuándo saltar, así aprendes en días.</p>`,
    `<ul>`,
    `<li><strong>Cuerda gruesa de 4 mm</strong> (frente a los 2,5 mm de otras marcas): más <strong>control</strong>, más <strong>durabilidad</strong> y mayor <strong>estabilidad</strong> en cada vuelta.</li>`,
    `<li><strong>Cuentas de PVC</strong> con el peso justo y feedback sonoro que marca el ritmo, sin enredos.</li>`,
    bicolor,
    `<li>Ideal para <strong>empezar</strong>, para <strong>freestyle</strong> y para trucos; de principiante a avanzado.</li>`,
    `<li><strong>Mangos negros mate</strong> con el logo Paat Jumps grabado, resistentes a los golpes.</li>`,
    `<li><strong>Longitud ajustable</strong> con tijeras en un minuto. Incluye <strong>bolsa Paat Jumps</strong>.</li>`,
    `</ul>`,
    `<p>No todas las combas son iguales: el grosor marca la diferencia.</p>`,
  ].join("");
}

// ── GraphQL vía shopify CLI ─────────────────────────────────────────────────────
let gqlSeq = 0;
async function gql(query, variables = {}, { mutation = false } = {}) {
  await mkdir(TMP, { recursive: true });
  const n = ++gqlSeq;
  const qf = path.join(TMP, `op.graphql`);
  const vf = path.join(TMP, `vars.json`);
  const of = path.join(TMP, `out.json`);
  await writeFile(qf, query);
  await writeFile(vf, JSON.stringify(variables));
  const args = ["store", "execute", "--store", STORE, "--query-file", qf, "--variable-file", vf, "--json", "--output-file", of];
  if (mutation) args.push("--allow-mutations");
  let stderr = "";
  try {
    const r = await execFileP("shopify", args, { maxBuffer: 128 * 1024 * 1024, cwd: ROOT });
    stderr = r.stderr || "";
  } catch (e) {
    stderr = (e.stderr || "") + (e.stdout || "");
  }
  let raw;
  try { raw = await readFile(of, "utf8"); }
  catch { throw new Error(`gql#${n} sin salida. stderr: ${stderr.slice(-500)}`); }
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error(`gql#${n} salida no-JSON: ${raw.slice(0, 400)}`); }
  if (json.errors) throw new Error(`gql#${n} errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
  return json.data || json;
}
const checkUE = (obj, label) => { const ue = obj?.userErrors; if (ue && ue.length) throw new Error(`${label}: ${JSON.stringify(ue)}`); };

// ── staged uploads ──────────────────────────────────────────────────────────────
const Q_STAGE = `mutation Stage($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`;

async function stageUpload(files) {
  const input = files.map((f) => ({ filename: path.basename(f), mimeType: "image/png", resource: "IMAGE", httpMethod: "POST" }));
  const d = await gql(Q_STAGE, { input }, { mutation: true });
  checkUE(d.stagedUploadsCreate, "stagedUploadsCreate");
  const targets = d.stagedUploadsCreate.stagedTargets;
  for (let i = 0; i < files.length; i++) {
    const t = targets[i];
    const cargs = ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST"];
    for (const p of t.parameters) cargs.push("-F", `${p.name}=${p.value}`);
    cargs.push("-F", `file=@${files[i]};type=image/png`, t.url);
    const { stdout } = await execFileP("curl", cargs, { maxBuffer: 32 * 1024 * 1024 });
    if (!/^2\d\d$/.test(stdout.trim())) throw new Error(`upload ${path.basename(files[i])} → HTTP ${stdout.trim()}`);
  }
  return targets.map((t) => t.resourceUrl);
}

// ── mutaciones de producto ───────────────────────────────────────────────────────
const Q_CREATE = `mutation Create($product:ProductCreateInput!,$media:[CreateMediaInput!]){ productCreate(product:$product,media:$media){ product{ id handle title variants(first:1){ edges{ node{ id } } } } userErrors{ field message } } }`;
const Q_PRICE = `mutation Price($productId:ID!,$variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$productId,variants:$variants){ productVariants{ id price } userErrors{ field message } } }`;
const Q_PUBLISH = `mutation Pub($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id,input:$input){ userErrors{ field message } } }`;
const Q_UPDATE = `mutation Upd($product:ProductUpdateInput!,$media:[CreateMediaInput!]){ productUpdate(product:$product,media:$media){ product{ id } userErrors{ field message } } }`;

async function existingHandles() {
  const d = await gql(`{ products(first:100){ edges{ node{ handle } } } }`);
  return new Set(d.products.edges.map((e) => e.node.handle));
}

async function findByHandle(handle) {
  const d = await gql(`query($q:String!){ products(first:1,query:$q){ edges{ node{ id media(first:40){ edges{ node{ alt } } } } } } }`, { q: `handle:${handle}` });
  return d.products.edges[0]?.node || null;
}

async function productImages(p) {
  return (await readdir(p.dir)).filter((f) => /-\d+\.png$/i.test(f)).sort().map((f) => path.join(p.dir, f));
}

async function createOne(p, { noPublish }) {
  const imgs = await productImages(p);
  if (!imgs.length) throw new Error(`sin imágenes en ${p.dir}`);
  const files = p.kind === "seg" ? [...imgs, EXTRA_BEADED] : imgs; // la de calidad, la última
  log(`   subiendo ${files.length} foto(s)…`);
  const urls = await stageUpload(files);

  const product = {
    title: p.title,
    descriptionHtml: buildDesc(p),
    vendor: "Paat Jumps",
    productType: p.productType,
    status: "ACTIVE",
    tags: p.tags,
    collectionsToJoin: [p.collectionId],
    metafields: [{ namespace: "custom", key: "color", type: "single_line_text_field", value: p.color }],
  };
  const media = urls.map((u, i) => {
    const isExtra = p.kind === "seg" && i === urls.length - 1;
    return { originalSource: u, alt: isExtra ? EXTRA_ALT : `${p.title} (${i + 1})`, mediaContentType: "IMAGE" };
  });
  const dc = await gql(Q_CREATE, { product, media }, { mutation: true });
  checkUE(dc.productCreate, "productCreate");
  const prod = dc.productCreate.product;
  const variantId = prod.variants.edges[0].node.id;

  const dp = await gql(Q_PRICE, { productId: prod.id, variants: [{ id: variantId, price: p.price }] }, { mutation: true });
  checkUE(dp.productVariantsBulkUpdate, "productVariantsBulkUpdate");

  if (!noPublish) {
    const du = await gql(Q_PUBLISH, { id: prod.id, input: [{ publicationId: PUB_TIENDA }, { publicationId: PUB_HEADLESS }] }, { mutation: true });
    checkUE(du.publishablePublish, "publishablePublish");
  }
  return prod;
}

// Actualiza un producto ya existente: descripción + (segmentadas) foto de calidad al final si falta.
async function updateOne(p) {
  const node = await findByHandle(slug(p.title));
  if (!node) { warn(`no existe ${p.title}, saltado`); return null; }
  const hasExtra = node.media.edges.some((e) => (e.node.alt || "") === EXTRA_ALT);
  let media = [];
  if (p.kind === "seg" && !hasExtra) {
    const [url] = await stageUpload([EXTRA_BEADED]);
    media = [{ originalSource: url, alt: EXTRA_ALT, mediaContentType: "IMAGE" }];
  }
  const d = await gql(Q_UPDATE, { product: { id: node.id, descriptionHtml: buildDesc(p) }, media }, { mutation: true });
  checkUE(d.productUpdate, "productUpdate");
  return { id: node.id, addedImage: media.length > 0 };
}

// ── main ────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") o.only = argv[++i];
    else if (a === "--limit") o.limit = parseInt(argv[++i], 10);
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-publish") o.noPublish = true;
    else if (a === "--update-existing") o.updateExisting = true;
    else warn(`flag ignorado: ${a}`);
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let list = PRODUCTS;
  if (args.only) list = list.filter((p) => p.slug.includes(args.only) || p.title.toLowerCase().includes(args.only.toLowerCase()));
  if (!list.length) die(`nada coincide con --only "${args.only}"`);

  log(`\n● Tienda: ${STORE}`);

  if (args.updateExisting) {
    const segs = list.filter((p) => p.kind === "seg");
    log(`● Modo update-existing · segmentadas: ${segs.length}\n`);
    let ok = 0;
    for (const p of segs) {
      log(`► ${p.title}`);
      try {
        const r = await updateOne(p);
        if (r) { ok++; log(`   ✓ descripción actualizada${r.addedImage ? " + foto de calidad añadida (última)" : " (ya tenía la foto)"}`); }
      } catch (e) { warn(`fallo en ${p.title}: ${e.message}`); }
    }
    log(`\n✅ Actualizadas ${ok}/${segs.length} segmentadas.`);
    return;
  }

  log(`● Candidatos: ${list.length}${args.only ? ` (--only ${args.only})` : ""}`);

  if (args.dryRun) {
    log(`\n— DRY RUN —`);
    await gql(`{ shop { name } }`);
    for (const p of list) {
      const files = (await readdir(p.dir).catch(() => [])).filter((f) => /-\d+\.png$/i.test(f)).sort();
      const all = p.kind === "seg" ? [...files, "explicaciónCalidadBeaded.PNG"] : files;
      log(`\n▶ ${p.title}  [${p.productType} · ${p.price}€ · color=${p.color}]`);
      log(`   handle: ${slug(p.title)} · colección: ${p.collectionId.split("/").pop()} · fotos: ${all.join(", ")}`);
    }
    log(`\n(auth OK)`);
    return;
  }

  const have = await existingHandles();
  const pending = list.filter((p) => !have.has(slug(p.title)));
  const skipped = list.length - pending.length;
  if (skipped) log(`● Ya existen (saltados): ${skipped}`);
  if (args.limit) pending.splice(args.limit);
  log(`● A crear ahora: ${pending.length}\n`);

  const done = [];
  for (const p of pending) {
    log(`► ${p.title}`);
    try {
      const prod = await createOne(p, { noPublish: args.noPublish });
      const numId = prod.id.split("/").pop();
      log(`   ✓ ${prod.handle}  ·  https://admin.shopify.com/store/${ADMIN_STORE}/products/${numId}`);
      done.push(prod);
    } catch (e) {
      warn(`fallo en ${p.title}: ${e.message}`);
    }
  }
  log(`\n✅ Creados ${done.length}/${pending.length}${args.noPublish ? " (sin publicar)" : " (activos y publicados)"}.`);
  if (!done.length && pending.length) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
