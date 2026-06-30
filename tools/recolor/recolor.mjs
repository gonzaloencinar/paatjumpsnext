#!/usr/bin/env node
/**
 * recolor.mjs — Genera variantes de color de la comba con cuentas de Paat Jumps
 * usando GPT Image 2 (image-to-image) a través de la API de kie.ai.
 *
 * Flujo:
 *   1. Descubre las imágenes de referencia en public/fotos_producto_referencia/
 *   2. Las comprime (sips → JPEG ~1024px) para que pesen poco al subirlas
 *   3. Las sube a kie.ai (file-base64-upload) → obtiene una URL temporal (caché 3 días)
 *   4. Por cada estilo: createTask (gpt-image-2-image-to-image) con la instrucción de recoloreado
 *   5. Hace polling de recordInfo hasta success/fail
 *   6. Descarga el resultado en tools/recolor/out/<color>/<estilo>-<n>.png
 *
 * Uso:
 *   node tools/recolor/recolor.mjs --color "rojo fuego"
 *   node tools/recolor/recolor.mjs --colors "rosa chicle, negro"     # bicolor
 *   node tools/recolor/recolor.mjs --color "#22C55E" --style principal --variants 2
 *   node tools/recolor/recolor.mjs --color rojo --dry-run            # no llama a la API
 *
 * Requiere KIE_API_KEY (en el entorno o en tools/recolor/.env).
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecolorPrompt, STYLE_NOTES, MASTER_PROMPT } from "./prompts.mjs";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const REF_DIR = path.join(ROOT, "public/fotos_producto_referencia");
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "resultados");

const KIE_BASE = process.env.KIE_BASE_URL || "https://api.kie.ai";
// El servicio de subida de ficheros vive en otro host (devuelve URLs tempfile.redpandaai.co)
const KIE_FILE_BASE = process.env.KIE_FILE_BASE_URL || "https://kieai.redpandaai.co";
const UPLOAD_URL = `${KIE_FILE_BASE}/api/file-base64-upload`;
const CREATE_URL = `${KIE_BASE}/api/v1/jobs/createTask`;
const RECORD_URL = `${KIE_BASE}/api/v1/jobs/recordInfo`;
const MODEL = "gpt-image-2-image-to-image";

const REF_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 6 * 60 * 1000; // 6 min
const UPLOAD_TTL_MS = 2 * 24 * 60 * 60 * 1000; // re-subir si la URL cacheada tiene > 2 días

// ── utilidades ───────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("⚠ ", ...a);
const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "color";

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const out = { variants: 1, resolution: "2K", aspect: "1:1", quality: 90, max: 1024 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--color": out.color = next(); break;          // mono
      case "--colors": out.colors = next(); break;        // "A, B" bicolor
      case "--finish": out.finish = next(); break;        // override del acabado de cuentas (p.ej. negro mate)
      case "--style": out.style = next(); break;          // substring: principal | secundaria | all
      case "--variants": out.variants = Math.max(1, parseInt(next(), 10) || 1); break;
      case "--resolution": out.resolution = next(); break; // 1K | 2K
      case "--aspect": out.aspect = next(); break;
      case "--quality": out.quality = parseInt(next(), 10) || 90; break;
      case "--max": out.max = parseInt(next(), 10) || 1024; break;
      case "--no-compress": out.noCompress = true; break;
      case "--dry-run": out.dryRun = true; break;
      case "-h": case "--help": out.help = true; break;
      default: warn(`flag desconocido ignorado: ${a}`);
    }
  }
  return out;
}

function printHelp() {
  log(`
Recolor de la comba Paat Jumps (GPT Image 2 / kie.ai)

  --color "<color>"        Monocolor: todas las cuentas del mismo color (nombre libre o hex)
  --colors "<A>, <B>"      Bicolor: dos colores alternados como la referencia
  --style <txt>            Limita a un estilo por substring (principal | secundaria). Por defecto: todos
  --variants <n>           Nº de variantes por estilo (default 1)
  --resolution <1K|2K>     Resolución de salida (default 2K; 1:1 no admite 4K)
  --aspect <ratio>         Relación de aspecto (default 1:1)
  --quality <1-100>        Calidad JPEG de la referencia comprimida (default 90)
  --max <px>               Lado mayor de la referencia comprimida (default 1024)
  --no-compress            Sube la referencia original sin comprimir
  --dry-run                Imprime el plan y los prompts SIN llamar a la API (no gasta créditos)
  -h, --help               Esta ayuda

Ejemplos:
  node tools/recolor/recolor.mjs --color "rojo fuego"
  node tools/recolor/recolor.mjs --colors "rosa chicle, negro" --variants 2
  node tools/recolor/recolor.mjs --color "#22C55E" --style principal --dry-run
`);
}

// ── kie.ai API ───────────────────────────────────────────────────────────────
function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.KIE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function kiePost(url, body) {
  const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`POST ${url} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function uploadBase64(filePath) {
  const buf = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const json = await kiePost(UPLOAD_URL, {
    base64Data: dataUrl,
    uploadPath: "paatjumps/recolor-refs",
    fileName: path.basename(filePath),
  });
  const url = json?.data?.downloadUrl || json?.data?.url || json?.data?.fileUrl;
  if (!url) throw new Error(`upload sin downloadUrl: ${JSON.stringify(json).slice(0, 300)}`);
  return url;
}

async function createTask(prompt, inputUrls, { resolution, aspect }) {
  const json = await kiePost(CREATE_URL, {
    model: MODEL,
    input: { prompt, input_urls: inputUrls, aspect_ratio: aspect, resolution },
  });
  const taskId = json?.data?.taskId || json?.data?.task_id;
  if (!taskId) throw new Error(`createTask sin taskId: ${JSON.stringify(json).slice(0, 300)}`);
  return taskId;
}

async function pollTask(taskId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    const d = json?.data || {};
    const state = d.state;
    if (state === "success") {
      let urls = [];
      try { urls = JSON.parse(d.resultJson || "{}").resultUrls || []; } catch {}
      if (!urls.length) throw new Error(`success sin resultUrls: ${JSON.stringify(d).slice(0, 300)}`);
      return urls;
    }
    if (state === "fail") throw new Error(`task fail [${d.failCode || "?"}]: ${d.failMsg || "sin mensaje"}`);
    process.stdout.write(`   …${state || "?"}\r`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timeout esperando taskId=${taskId}`);
}

// ── compresión + caché de subida ─────────────────────────────────────────────
async function compressRef(srcPath, { quality, max }) {
  await mkdir(CACHE_DIR, { recursive: true });
  const st = statSync(srcPath);
  const key = createHash("sha1")
    .update(`${srcPath}:${st.mtimeMs}:${st.size}:${max}:${quality}`)
    .digest("hex")
    .slice(0, 12);
  const outPath = path.join(CACHE_DIR, `${path.parse(srcPath).name}.${key}.jpg`);
  if (existsSync(outPath)) return outPath;
  // sips: redimensiona el lado mayor a `max` y convierte a JPEG con la calidad dada
  await execFileP("sips", [
    "-Z", String(max),
    "-s", "format", "jpeg",
    "-s", "formatOptions", String(quality),
    srcPath, "--out", outPath,
  ]);
  return outPath;
}

function readUploadCache() {
  const p = path.join(CACHE_DIR, "uploads.json");
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
}
async function writeUploadCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, "uploads.json"), JSON.stringify(cache, null, 2));
}

async function ensureUploaded(localPath, cache) {
  const bytes = await readFile(localPath);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const hit = cache[hash];
  if (hit && Date.now() - hit.ts < UPLOAD_TTL_MS) return hit.url;
  const url = await uploadBase64(localPath);
  cache[hash] = { url, ts: Date.now() };
  await writeUploadCache(cache);
  return url;
}

// ── descubrimiento de estilos ────────────────────────────────────────────────
async function discoverStyles(filter) {
  if (!existsSync(REF_DIR)) die(`no existe la carpeta de referencias: ${REF_DIR}`);
  const files = (await readdir(REF_DIR))
    .filter((f) => REF_EXT.has(path.extname(f).toLowerCase()))
    .sort();
  let styles = files.map((f) => {
    const key = path.parse(f).name.toLowerCase();
    return { key, file: f, path: path.join(REF_DIR, f), label: STYLE_NOTES[key]?.label || key };
  });
  if (filter && filter !== "all") {
    const q = filter.toLowerCase();
    styles = styles.filter((s) => s.key.includes(q));
  }
  if (!styles.length) die(`sin imágenes de referencia que coincidan con --style "${filter || "all"}"`);
  return styles;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  // resolver modo/colores
  let mode, colorA, colorB;
  if (args.colors) {
    const parts = args.colors.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) die(`--colors necesita dos colores separados por coma, p.ej. --colors "rojo, negro"`);
    mode = "bicolor"; [colorA, colorB] = parts;
  } else if (args.color) {
    mode = "mono"; colorA = args.color.trim();
  } else {
    printHelp();
    die("indica un color: --color \"<color>\"  o  --colors \"<A>, <B>\"");
  }

  const prompt = buildRecolorPrompt({ mode, colorA, colorB, finish: args.finish });
  const colorLabel = mode === "bicolor" ? `${colorA} + ${colorB}` : colorA;
  const colorSlug = mode === "bicolor" ? `${slug(colorA)}-${slug(colorB)}` : slug(colorA);
  const styles = await discoverStyles(args.style);

  log(`\n● Producto: comba con cuentas Paat Jumps`);
  log(`● Color   : ${colorLabel}  (${mode})`);
  log(`● Estilos : ${styles.map((s) => s.label).join("  |  ")}`);
  log(`● Salida  : ${args.resolution} ${args.aspect} · ${args.variants} variante(s)/estilo`);
  log(`\n── prompt operativo (image-to-image) ──\n${prompt}\n`);

  if (args.dryRun) {
    log("— DRY RUN — no se llama a la API ni se gastan créditos.");
    log("\nReferencias que se usarían:");
    for (const s of styles) log(`  • [${s.key}] ${s.file}`);
    log(`\nPrompt maestro de escena (referencia):\n${MASTER_PROMPT}\n`);
    return;
  }

  if (!process.env.KIE_API_KEY) {
    die(`falta KIE_API_KEY. Ponla en tools/recolor/.env  (copia .env.example)  o expórtala en el entorno.`);
  }

  const outDir = path.join(OUT_DIR, colorSlug);
  await mkdir(outDir, { recursive: true });
  const uploadCache = readUploadCache();

  // 1) comprimir + subir referencias (una sola vez por estilo)
  log("Subiendo referencias…");
  for (const s of styles) {
    const local = args.noCompress ? s.path : await compressRef(s.path, { quality: args.quality, max: args.max });
    if (!args.noCompress) {
      const kb = (statSync(local).size / 1024).toFixed(0);
      log(`  • ${s.key}: comprimida → ${kb} KB`);
    }
    s.url = await ensureUploaded(local, uploadCache);
    log(`  • ${s.key}: ${s.url}`);
  }

  // 2) generar por estilo × variante
  const results = [];
  for (const s of styles) {
    for (let v = 1; v <= args.variants; v++) {
      const tag = args.variants > 1 ? `${s.key}-v${v}` : s.key;
      log(`\n► Generando ${tag} …`);
      try {
        const taskId = await createTask(prompt, [s.url], { resolution: args.resolution, aspect: args.aspect });
        log(`   taskId=${taskId}`);
        const urls = await pollTask(taskId);
        for (let k = 0; k < urls.length; k++) {
          const suffix = urls.length > 1 ? `-${k + 1}` : "";
          const ext = (urls[k].match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || "png").toLowerCase();
          const dest = path.join(outDir, `${tag}${suffix}.${ext}`);
          const img = Buffer.from(await (await fetch(urls[k])).arrayBuffer());
          await writeFile(dest, img);
          results.push(dest);
          log(`   ✓ ${path.relative(ROOT, dest)}`);
        }
      } catch (e) {
        warn(`fallo en ${tag}: ${e.message}`);
      }
    }
  }

  log(`\n✅ Listo. ${results.length} imagen(es) en ${path.relative(ROOT, outDir)}/`);
  if (!results.length) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
