# Recolor de la comba Paat Jumps (GPT Image 2 · kie.ai)

Genera fotos de producto **idénticas** a las de referencia pero **cambiando el color de las
cuentas** (mono o bicolor), para lanzar colores nuevos sin repetir el set de fotografía.

- **Producto:** comba con cuentas (beaded skipping rope). Cuentas cilíndricas de plástico
  brillante sobre cable de acero negro, dos mangos de aluminio negro mate con el wordmark
  blanco en script **"Paat Jumps"**, fondo carbón con viñeta.
- **Modelo:** `gpt-image-2-image-to-image` (el último de OpenAI en kie.ai — confirmado: lo
  llaman *GPT Image 2* en el market) en modo **image-to-image / edición**.
- **Salida:** 2 estilos por color (los que haya en `public/fotos_producto_referencia/`).

---

## Por qué image-to-image (y no text-to-image)

Para que el resultado sea "exactamente igual pero con otro color", **editamos la propia foto de
referencia**: la composición, la luz, los mangos, el logo, el cable y el fondo los aporta la
imagen original; el prompt solo ordena **recolorear las cuentas y no tocar nada más**. Es mucho
más fiel que describir la escena con palabras y generarla de cero.

Cada imagen de referencia = un **estilo**. Se descubren solas, así que da igual que sean 2 o 3:

| Fichero de referencia            | Estilo                         |
| -------------------------------- | ------------------------------ |
| `fotoProductoPrincipal.PNG`      | Packshot cenital (flat-lay)    |
| `fotoProductoSecundaria.PNG`     | Macro de detalle de los mangos |

> El "prompt maestro" (descripción completa de la escena) y las notas por estilo viven en
> [`prompts.mjs`](./prompts.mjs), por si algún día quieres generar desde cero (text-to-image).

---

## El prompt maestro

**Operativo (el que se envía, bicolor):**

> Edit this product photo. The ONLY change: recolour the cylindrical beads. Replace them with an
> alternating two-colour pattern of **{COLOR_A}** and **{COLOR_B}**, following the same
> alternating rhythm and bead layout as the original. Keep the same glossy plastic finish and
> specular highlights on every bead. Keep the composition, framing, the two matte-black handles,
> the white 'Paat Jumps' cursive script logos, the black cable, the dark background, the lighting,
> reflections and shadows EXACTLY as they are in the reference image. Do NOT alter the handles,
> the logo or any text. Photorealistic result, identical to the original except for the bead colour.

En **mono** cambia a *"recolour ALL the cylindrical beads to a single uniform colour {COLOR_A}"*.

---

## Cómo funciona (pipeline)

1. **Descubre** las referencias en `public/fotos_producto_referencia/`.
2. **Comprime** cada una con `sips` (nativo de macOS) a JPEG ~1024 px (de ~2 MB a ~200–400 KB)
   para que la subida sea rápida y ligera. Cacheado en `.cache/`.
3. **Sube** a kie.ai (`POST /api/file-base64-upload`) → URL temporal (`downloadUrl`, dura 3 días).
   La subida se cachea por hash de contenido en `.cache/uploads.json` (no resube si ya está).
4. **Crea la tarea** (`POST /api/v1/jobs/createTask`, `model: gpt-image-2-image-to-image`) con la
   URL de la referencia + el prompt de recoloreado.
5. **Polling** (`GET /api/v1/jobs/recordInfo?taskId=…`) hasta `state: success | fail`.
6. **Descarga** el resultado de `resultJson.resultUrls` a `resultados/<color>/<estilo>.png`.

Endpoints (base `https://api.kie.ai`):

| Paso     | Método y ruta                          | Campo clave de respuesta        |
| -------- | -------------------------------------- | ------------------------------- |
| Subir    | `POST /api/file-base64-upload`         | `data.downloadUrl`              |
| Crear    | `POST /api/v1/jobs/createTask`         | `data.taskId`                   |
| Consultar| `GET  /api/v1/jobs/recordInfo?taskId=` | `data.state`, `data.resultJson` |

---

## Setup (una vez)

1. Consigue tu API key en <https://kie.ai/api-key>.
2. Copia el ejemplo de entorno y pega la key:

   ```bash
   cp tools/recolor/.env.example tools/recolor/.env
   # edita tools/recolor/.env  →  KIE_API_KEY=sk-...
   ```

   `.env` y `.cache/` están en `.gitignore` (la key nunca se commitea). Las imágenes generadas
   van a `tools/recolor/resultados/` (carpeta **visible**, no ignorada, para verlas en el proyecto).

No hay dependencias que instalar: usa Node 22 (ya en el repo) y `sips` (macOS).

---

## Uso

```bash
# Monocolor (todas las cuentas iguales)
node tools/recolor/recolor.mjs --color "rojo fuego"

# Bicolor (dos colores alternados, como la referencia)
node tools/recolor/recolor.mjs --colors "rosa chicle, negro"

# Un solo estilo, 2 variantes, con hex
node tools/recolor/recolor.mjs --color "#22C55E" --style principal --variants 2

# Ver el plan y el prompt SIN gastar créditos
node tools/recolor/recolor.mjs --colors "azul klein, blanco" --dry-run
```

El color admite **texto libre** ("verde lima neón", "negro mate") o **hex** ("#E11D2A").

### Flags

| Flag                   | Descripción                                              | Default |
| ---------------------- | ------------------------------------------------------- | ------- |
| `--color "<c>"`        | Monocolor                                               | —       |
| `--colors "<A>, <B>"`  | Bicolor (alternado)                                     | —       |
| `--style <txt>`        | Filtra estilo por substring (`principal`, `secundaria`) | todos   |
| `--variants <n>`       | Variantes por estilo                                    | 1       |
| `--resolution <1K\|2K>`| Resolución de salida (1:1 no admite 4K)                 | 2K      |
| `--aspect <ratio>`     | Relación de aspecto                                     | 1:1     |
| `--quality <1-100>`    | Calidad JPEG de la referencia comprimida                | 90      |
| `--max <px>`           | Lado mayor de la referencia comprimida                  | 1024    |
| `--no-compress`        | Sube la referencia original sin comprimir               | off     |
| `--dry-run`            | Imprime plan + prompts, no llama a la API               | off     |

### Salida

```
tools/recolor/resultados/<color-slug>/
  ├─ fotoproductoprincipal.png
  └─ fotoproductosecundaria.png
```

---

## Notas y límites

- **Coste:** pago por uso (créditos kie.ai). Empieza con `--dry-run` y luego **1 color × 1 estilo**
  para validar antes de tirar muchos.
- **Fidelidad del logo/texto:** la edición conserva el logo de la referencia. Si algún resultado
  lo deforma, sube `--quality` o repite (`--variants`).
- Las URLs subidas a kie.ai caducan a los **3 días**; el script resube si hace falta.
- El número de imágenes de salida depende de lo que devuelva el modelo (normalmente 1 por tarea).
