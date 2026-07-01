#!/usr/bin/env node
/**
 * reframe.mjs — Reencuadra a 1:1 (cuadrado) las fotos de producto de las combas de PVC
 * usando GPT Image 2 (image-to-image) a través de la API de kie.ai.
 *
 * NO recolorea ni reinventa la escena: usa cada foto como referencia y pide la MISMA
 * imagen (mismo color de cuerda, mismos mangos, mismo logo, mismo fondo y luz) pero en
 * formato cuadrado 1:1, extendiendo el fondo (outpaint) para no recortar el producto.
 *
 * Flujo:
 *   1. Descubre las 16 fotos en public/combasPVC-16:9/<color>/<color>-N.(png|jpg)
 *   2. Las comprime (sips → JPEG ~1024px) y las sube a kie.ai → URL temporal
 *   3. Por cada una: createTask (gpt-image-2-image-to-image, aspect_ratio 1:1)
 *   4. Polling de recordInfo hasta success/fail
 *   5. Descarga en public/combasPVC-1:1/<color>/<color>-N.png
 *
 * Uso:
 *   node tools/reframe/reframe.mjs --dry-run           # plan + prompts, no gasta créditos
 *   node tools/reframe/reframe.mjs --only naranja-1    # solo una (prueba)
 *   node tools/reframe/reframe.mjs                      # todas las que falten
 *   node tools/reframe/reframe.mjs --force              # regenera aunque ya existan
 *
 * Requiere KIE_API_KEY (en tools/recolor/.env, tools/reframe/.env o el entorno).
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT, "public/combasPVC-16:9");
const OUT_DIR = path.join(ROOT, "public/combasPVC-1:1");
const CACHE_DIR = path.join(__dirname, ".cache");

const KIE_BASE = process.env.KIE_BASE_URL || "https://api.kie.ai";
const KIE_FILE_BASE = process.env.KIE_FILE_BASE_URL || "https://kieai.redpandaai.co";
const UPLOAD_URL = `${KIE_FILE_BASE}/api/file-base64-upload`;
const CREATE_URL = `${KIE_BASE}/api/v1/jobs/createTask`;
const RECORD_URL = `${KIE_BASE}/api/v1/jobs/recordInfo`;
const MODEL = "gpt-image-2-image-to-image";

const REF_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const COLORS = ["verde", "rosa", "negro", "naranja"];
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 6 * 60 * 1000;
const UPLOAD_TTL_MS = 2 * 24 * 60 * 60 * 1000;

// Nombre de color en inglés para el prompt (mayor fidelidad del modelo).
const COLOR_EN = {
  verde: "bright fluorescent green",
  rosa: "hot neon pink / magenta",
  negro: "pure black (jet-black, not grey)",
  naranja: "vivid orange",
};

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("⚠ ", ...a);
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDotEnv() {
  const candidates = [path.join(__dirname, ".env"), path.join(ROOT, "tools/recolor/.env")];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function parseArgs(argv) {
  const out = { resolution: "2K", aspect: "1:1", quality: 90, max: 1024, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--only": out.only = next(); break;            // substring del nombre (p.ej. "naranja-1" o "verde")
      case "--resolution": out.resolution = next(); break;
      case "--aspect": out.aspect = next(); break;
      case "--quality": out.quality = parseInt(next(), 10) || 90; break;
      case "--max": out.max = parseInt(next(), 10) || 1024; break;
      case "--concurrency": out.concurrency = Math.max(1, parseInt(next(), 10) || 1); break;
      case "--no-compress": out.noCompress = true; break;
      case "--force": out.force = true; break;
      case "--dry-run": out.dryRun = true; break;
      case "-h": case "--help": out.help = true; break;
      default: warn(`flag desconocido ignorado: ${a}`);
    }
  }
  return out;
}

// ── Prompt de reencuadre a cuadrado (image-to-image) ─────────────────────────
function buildReframePrompt(color) {
  const c = COLOR_EN[color] || color;
  return [
    "Edit this product photo. Re-frame and re-compose it to a perfectly SQUARE 1:1 aspect ratio,",
    "keeping absolutely everything else identical to the reference.",
    `This is a speed jump rope with a solid glossy ${c} PVC cable and two matte-black cylindrical`,
    "handles engraved with the white cursive script wordmark 'Paat Jumps'.",
    "KEEP EXACTLY as in the reference, with no change of colour, material, shape or branding:",
    "the rope colour and thickness and the way it is coiled, the two handles, the white 'Paat Jumps'",
    "logo and any text, any transparent plastic end-caps, the black branded storage pouch if it appears,",
    "the dark near-black seamless studio background, the premium e-commerce lighting, reflections and shadows.",
    "Center the subject in the square frame and naturally EXTEND / outpaint the background on the sides",
    "or top and bottom as needed so that NOTHING of the rope, handles or pouch is cropped or cut off.",
    "Do NOT add, remove, duplicate or rearrange any object. Do NOT alter the logo or any text.",
    "Photorealistic, high-end commercial product photography, identical look and materials to the original —",
    "the ONLY change is the framing, now a 1:1 square.",
  ].join(" ");
}

// ── kie.ai API ───────────────────────────────────────────────────────────────
const authHeaders = () => ({
  Authorization: `Bearer ${process.env.KIE_API_KEY}`,
  "Content-Type": "application/json",
});

async function kiePost(url, body) {
  const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
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
    uploadPath: "paatjumps/reframe-refs",
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
    if (d.state === "success") {
      let urls = [];
      try { urls = JSON.parse(d.resultJson || "{}").resultUrls || []; } catch {}
      if (!urls.length) throw new Error(`success sin resultUrls: ${JSON.stringify(d).slice(0, 300)}`);
      return urls;
    }
    if (d.state === "fail") throw new Error(`task fail [${d.failCode || "?"}]: ${d.failMsg || "sin mensaje"}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timeout esperando taskId=${taskId}`);
}

// ── compresión + caché de subida ─────────────────────────────────────────────
async function compressRef(srcPath, { quality, max }) {
  await mkdir(CACHE_DIR, { recursive: true });
  const st = statSync(srcPath);
  const key = createHash("sha1").update(`${srcPath}:${st.mtimeMs}:${st.size}:${max}:${quality}`).digest("hex").slice(0, 12);
  const outPath = path.join(CACHE_DIR, `${path.parse(srcPath).name}.${key}.jpg`);
  if (existsSync(outPath)) return outPath;
  await execFileP("sips", ["-Z", String(max), "-s", "format", "jpeg", "-s", "formatOptions", String(quality), srcPath, "--out", outPath]);
  return outPath;
}

const cachePath = () => path.join(CACHE_DIR, "uploads.json");
function readUploadCache() {
  if (!existsSync(cachePath())) return {};
  try { return JSON.parse(readFileSync(cachePath(), "utf8")); } catch { return {}; }
}
async function writeUploadCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(), JSON.stringify(cache, null, 2));
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

// ── descubrimiento ────────────────────────────────────────────────────────────
async function discover(only) {
  if (!existsSync(SRC_DIR)) die(`no existe la carpeta origen: ${SRC_DIR}`);
  const items = [];
  for (const color of COLORS) {
    const dir = path.join(SRC_DIR, color);
    if (!existsSync(dir)) { warn(`falta subcarpeta ${color}`); continue; }
    const files = (await readdir(dir)).filter((f) => REF_EXT.has(path.extname(f).toLowerCase())).sort();
    for (const f of files) {
      const base = path.parse(f).name; // p.ej. "verde-1"
      items.push({ color, base, name: f, src: path.join(dir, f) });
    }
  }
  const filtered = only ? items.filter((it) => it.name.toLowerCase().includes(only.toLowerCase()) || it.color.includes(only.toLowerCase())) : items;
  if (!filtered.length) die(`nada que procesar${only ? ` para --only "${only}"` : ""}`);
  return filtered;
}

// ── pool de concurrencia ───────────────────────────────────────────────────────
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await worker(items[idx], idx); }
      catch (e) { results[idx] = { error: e.message }; warn(`fallo en ${items[idx].color}/${items[idx].name}: ${e.message}`); }
    }
  });
  await Promise.all(runners);
  return results;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log("ver cabecera del archivo para el uso"); return; }

  const all = await discover(args.only);
  const todo = args.force ? all : all.filter((it) => !existsSync(path.join(OUT_DIR, it.color, `${it.base}.png`)));

  log(`\n● Reencuadre a ${args.aspect} · ${args.resolution} (gpt-image-2-image-to-image)`);
  log(`● Origen : ${path.relative(ROOT, SRC_DIR)}`);
  log(`● Destino: ${path.relative(ROOT, OUT_DIR)}`);
  log(`● Fotos  : ${all.length} descubiertas · ${todo.length} a generar${args.force ? " (--force)" : ""}`);
  if (args.only) log(`● Filtro : --only "${args.only}"`);

  if (args.dryRun) {
    log(`\n— DRY RUN — no se llama a la API ni se gastan créditos.\n`);
    for (const it of todo) log(`  • ${it.color}/${it.name}  →  ${path.relative(ROOT, path.join(OUT_DIR, it.color, it.base + ".png"))}`);
    log(`\n── prompt (ejemplo, ${todo[0]?.color || "color"}) ──\n${buildReframePrompt(todo[0]?.color || "naranja")}\n`);
    return;
  }
  if (!todo.length) { log(`\n✅ Nada pendiente: ya existen todas las de salida. Usa --force para regenerar.`); return; }
  if (!process.env.KIE_API_KEY) die(`falta KIE_API_KEY (tools/recolor/.env, tools/reframe/.env o el entorno).`);

  // 1) comprimir + subir referencias (secuencial, para no corromper la caché)
  log(`\nSubiendo ${todo.length} referencia(s)…`);
  const cache = readUploadCache();
  for (const it of todo) {
    const local = args.noCompress ? it.src : await compressRef(it.src, { quality: args.quality, max: args.max });
    it.url = await ensureUploaded(local, cache);
    log(`  • ${it.color}/${it.name} → subida`);
  }

  // 2) generar en paralelo (pool)
  log(`\nGenerando (concurrencia ${args.concurrency})…`);
  const results = await runPool(todo, async (it) => {
    const taskId = await createTask(buildReframePrompt(it.color), [it.url], { resolution: args.resolution, aspect: args.aspect });
    const urls = await pollTask(taskId);
    const ext = (urls[0].match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || "png").toLowerCase();
    const destDir = path.join(OUT_DIR, it.color);
    await mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `${it.base}.${ext}`);
    const img = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
    await writeFile(dest, img);
    log(`  ✓ ${path.relative(ROOT, dest)}`);
    return { dest };
  }, args.concurrency);

  const ok = results.filter((r) => r && r.dest).length;
  const fail = results.length - ok;
  log(`\n✅ Listo. ${ok}/${results.length} generadas en ${path.relative(ROOT, OUT_DIR)}/${fail ? `  (${fail} fallidas)` : ""}`);
  if (!ok) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
