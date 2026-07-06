# Auditoría SEO — julio 2026

Auditoría de `www.paatjumps.com` + keyword research (DataForSEO, Google España y Google US)

- análisis del competidor directo `elevaterope.com`. Informe visual completo:
  https://claude.ai/code/artifact/b1ece1c5-db24-49d8-b639-b97414eca71e
  · Keywords con volúmenes en [keyword-research-2026-07.xlsx](./keyword-research-2026-07.xlsx)
  (hojas España / Estados Unidos / Long-tail) · CSVs crudos en `~/dataforseo_outputs/`.

> Hallazgos extra del long-tail (Google ES): **«comba decathlon» 1.900/mes** y
> **«double unders» 1.900/mes** — ambos perfectos para el futuro blog (comparativa
> honesta vs Decathlon y guía de dobles).

**Alcance actual del catálogo:** solo vendemos **combas PVC (speed)** y **combas
segmentadas (beaded)**. Todo lo relativo a otros tipos (crossfit, lastradas, boxeo, niños…)
está en [Futuro](#futuro-cuando-haya-productos) y **no** se implementa todavía: sin producto
no se puede posicionar ni convertir esa demanda.

## Estado de partida (2026-07-03)

| Métrica                               | Paat Jumps | Elevate Rope               |
| ------------------------------------- | ---------- | -------------------------- |
| Keywords orgánicas (Google US)        | 0          | 3.519 (~5.400 visitas/mes) |
| Keywords orgánicas (Google ES)        | 0          | 115                        |
| Autoridad de dominio (backlinks rank) | 0          | 305                        |
| Origen del tráfico orgánico           | —          | ~90 % blog, no fichas      |

Lo que ya estaba bien montado (no tocar): hreflang `es/en/x-default` recíproco y
self-canonical en todas las plantillas; middleware que **nunca** redirige bots por geo-IP;
`checkout.paatjumps.com` canonicaliza a www; apex→www 308; sitemap bilingüe; robots.txt;
alt text con fallback; AVIF/WebP.

## Keyword research

### España (Google ES) — mercado principal

La cabeza del mercado usa **«comba»**; «cuerda de saltar» es la variante neutra/LatAm.
Elevate no usa «comba» en ningún sitio (su /es es traducción automática): ese vocabulario
está sin dueño especializado.

| Keyword                                                  |            Vol/mes | Targeting hoy                |
| -------------------------------------------------------- | -----------------: | ---------------------------- |
| comba / combas                                           |              4.400 | Home + `/search`             |
| saltar a la comba                                        | 2.900 (comp. baja) | Futuro blog                  |
| ~~comba crossfit~~                                       |              1.900 | **Futuro** — sin producto    |
| cuerda para saltar                                       |                720 | Sinónimo en copy             |
| ~~comba boxeo~~                                          |                480 | **Futuro** — sin producto    |
| cuerda de saltar                                         |                480 | Sinónimo en copy             |
| comba de saltar                                          |                260 | Home (title)                 |
| beneficios saltar a la comba                             |         170 (baja) | Futuro blog                  |
| ~~comba lastrada~~                                       |                140 | **Futuro** — gap de producto |
| comba profesional                                        |                110 | Copy home                    |
| comprar comba · comba doble salto · ejercicios con comba |             70 c/u | Catálogo · futuro blog       |
| speed rope · **comba segmentada** · beaded rope          |             50 c/u | Colecciones actuales         |
| **comba pvc / combas pvc** · comba de velocidad          |             40 c/u | Colección PVC                |
| mejores combas                                           |                 20 | Futuro blog comparativa      |
| comba freestyle · comba de cuentas · comba beaded        |             10 c/u | Copy segmentadas             |

### English (Google US) — referencia para el mercado EN/EU

| Keyword                                     |            Vol/mes | Targeting hoy                       |
| ------------------------------------------- | -----------------: | ----------------------------------- |
| jump rope / jump ropes                      |            246.000 | Cabeza, inalcanzable a corto        |
| ~~weighted jump rope~~                      |             14.800 | **Futuro** — sin producto           |
| jump rope for beginners                     |              6.600 | Copy segmentadas (beads = aprender) |
| **beaded jump rope** · beaded skipping rope |          3.600 c/u | Colección segmentadas EN            |
| speed jump rope · skipping rope             |          3.600 c/u | Colección PVC EN                    |
| speed rope · best jump rope                 |          2.400 c/u | PVC EN · futuro blog                |
| **pvc jump rope** · ~~boxing jump rope~~    |          1.900 c/u | PVC EN · futuro                     |
| ~~crossfit jump rope~~                      |              1.300 | **Futuro**                          |
| jump rope tricks / for tricks               | 1.000 (comp. baja) | Copy segmentadas + futuro blog      |
| professional jump rope · for adults         |            720 c/u | Copy home EN                        |
| beaded rope                                 |                390 | Secundaria                          |
| freestyle jump rope · segmented jump rope   |             90 c/u | Copy segmentadas EN                 |
| best beaded jump rope                       |                 70 | Futuro blog                         |

> **Regla EN:** siempre «jump rope», nunca «rope» a secas — _beaded jump rope_ (3.600)
> vs _beaded rope_ (390), 9×. Aplica a titles, H1 y nombres de producto EN.

Long-tail EN con intención clara (para FAQs y futuro blog): _beaded jump rope vs pvc ·
best beaded jump rope for tricks · beaded jump rope for beginners · how to adjust beaded
jump rope · benefits of beaded jump rope_. ES: _cómo ajustar la cuerda de saltar · largo de
cuerda para saltar · comba decathlon (comparativa)_.

## Cambios implementados (julio 2026)

Hallazgos de la auditoría → fix aplicado:

| #   | Hallazgo                                              | Fix                                                                                                                              |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Title de la home = «Paat Jumps» sin keywords          | `home.metaTitle` ES/EN en diccionarios + `generateMetadata`                                                                      |
| 2   | Categorías sin H1 ni texto                            | H1 + descripción de colección (Shopify) + **FAQs** al pie con schema `FAQPage`                                                   |
| 3   | `<html lang="es">` también en /en                     | Layouts raíz por grupo de rutas: `(store)/[locale]` (lang dinámico) y `admin`; `not-found`/`error` movidos al árbol de la tienda |
| 4   | Meta description de producto = volcado de 700+ chars  | `seo.description` escrita por producto en Shopify (`tools/seo/apply-seo.mjs`) + truncado de seguridad en código                  |
| 5   | EN apuntaba a «Beaded Ropes» (390/mes)                | Renombrado EN a «Beaded **Jump** Ropes» (colección y productos) vía traducciones de Shopify                                      |
| 6   | JSON-LD Product sin brand/url/price                   | Offer completo (price, currency, availability, url, itemCondition, priceValidUntil) + brand + imágenes                           |
| 7   | Sin Organization/WebSite/BreadcrumbList               | Organization + WebSite (con SearchAction) en el layout de tienda; BreadcrumbList en ficha y colección                            |
| 8   | `/search/frontpage` indexable y en sitemap            | Excluida del sitemap + `noindex` (igual que `hidden-*`)                                                                          |
| 9   | `/search` con title «Buscar» y sin H1                 | «Todas las combas» + H1 + intro                                                                                                  |
| 10  | Fallback de description en inglés en ES               | Fallback localizado por diccionario                                                                                              |
| 11  | Sin Twitter card                                      | `summary_large_image` global                                                                                                     |
| 12  | H1 del hero «combas​son» (falta espacio en el `<br>`) | Espacio añadido                                                                                                                  |
| 13  | Sitemap sin x-default                                 | Añadido                                                                                                                          |

**Pendiente manual (no automatizable desde código):**

- [ ] Verificar propiedad en **Google Search Console** y enviar `https://www.paatjumps.com/sitemap.xml`; revisar cobertura de indexación de las ~46 URLs.
- [ ] Ídem en **Bing Webmaster Tools** (importa la propiedad desde GSC).
- [ ] Cuando haya reseñas de clientes, añadir `aggregateRating` al JSON-LD de producto.

## Copy aplicado (referencia)

### Titles y descriptions

| Página      | Title (ES / EN)                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Home        | Combas de saltar profesionales hechas a mano \| Paat Jumps · Handmade Beaded & PVC Jump Ropes \| Paat Jumps       |
| Segmentadas | Combas segmentadas para freestyle y trucos \| Paat Jumps · Beaded Jump Ropes for Freestyle & Tricks \| Paat Jumps |
| PVC         | Combas PVC de velocidad y freestyle \| Paat Jumps · PVC Jump Ropes — Speed & Freestyle \| Paat Jumps              |
| /search     | Todas las combas \| Paat Jumps · All Jump Ropes \| Paat Jumps                                                     |
| Producto    | El title es el nombre del producto (ya keyword-rich); solo se escribe `seo.description`                           |

Las meta descriptions de producto siguen la plantilla (~150 chars): material + hecho a mano
en España + beneficio (ritmo/velocidad) + ajustable + envío. Ver `tools/seo/apply-seo.mjs`.

### FAQs de categoría

Contenido en `lib/i18n/dictionaries.ts` (`collectionFaqs`), renderizadas como `<details>` al
pie de la colección + JSON-LD `FAQPage`. Cubren long-tail real: qué es una segmentada,
cuál elegir (segmentada vs PVC), ajuste de longitud, para quién es cada una, envío.
Nota 2023+: Google ya casi no muestra rich results de FAQ para tiendas pequeñas — el valor
está en el **contenido indexable** (hoy las categorías no tenían ni una frase), no en el snippet.

## Futuro (cuando haya productos)

Demanda medida esperando catálogo — **no crear páginas antes de tener el producto**:

| Oportunidad                      | Vol ES | Vol US | Producto necesario                                               |
| -------------------------------- | -----: | -----: | ---------------------------------------------------------------- |
| Comba CrossFit (speed metálica)  |  1.900 |  1.300 | Comba de cable/rodamientos para double unders                    |
| Comba lastrada / weighted        |    140 | 14.800 | Cuerda o mangos con peso                                         |
| Comba boxeo                      |    480 |  1.900 | PVC larga estilo boxeo (quizá reposicionable con la PVC actual)  |
| Comba niños / colegios           |      — |      — | Pack infantil (las beaded ya encajan; falta ángulo B2B colegios) |
| Long handle (freestyle avanzado) |      — |     20 | Mangos largos                                                    |

**Blog** (el 90 % del tráfico de Elevate; montar cuando toque — Shopify Blogs vía Storefront
API o MDX en el repo):

1. «Saltar a la comba: guía completa para empezar» — 2.900/mes, comp. baja
2. «Beneficios de saltar a la comba» — 170/mes, comp. baja
3. «Comba segmentada vs comba PVC: cuál elegir» — transaccional, enlaza ambas colecciones
4. «Cómo ajustar la longitud de tu comba (tabla por altura)» — long-tail
5. «Ejercicios con comba: rutina de 20 minutos» — 70/mes
6. «Double unders: técnica y errores» — 70/mes ES (+1.900 si algún día hay comba crossfit)

**Autoridad:** 5–10 dominios de referencia en el primer trimestre — prensa fitness ES
(historia: fundadora referente del salto de comba, fabricación artesanal en España),
comunidades de salto/crossfit, directorios ecommerce ES.

## Competidor: Elevate Rope

### Estrategia SEO (lo que funciona)

- **El blog es el negocio orgánico**: sus top pages son artículos informacionales
  («does jumping rope make you taller» ETV 274, «4-week jump rope training program»,
  «what are beaded jump ropes», «jump rope for seniors»). Sus colecciones apenas rankean.
- Fórmula de title: `Keyword | Beneficio – Marca`.
- Schema: Organization + SportingGoodsStore + WebSite en home; ItemList + BreadcrumbList +
  FAQPage en colecciones.
- Colecciones segmentadas por tipo (speed/beaded/heavy/long-handle) **y** por caso de uso
  (crossfit, boxing-mma, kids, lose-weight).
- i18n /es /it /fr /de /nl con hreflang completo, pero traducción automática (su ES dice
  «cuerdas para saltar con cuentas», nunca «comba») → nuestro contenido ES nativo puede ganarles.
- Debilidad: sus colecciones tampoco tienen H1 y su rank comercial es flojo; la batalla
  comercial ES real es contra Decathlon/Amazon/Velites.

### Estructura de landings de publicidad (ideas para paid, NO para SEO)

Elevate mantiene ~80 landing pages bajo `/pages/` para tráfico de pago. Taxonomía
observada (sitemap `sitemap_pages_1.xml`), documentada como inspiración para cuando
hagamos paid:

**1. Advertoriales por audiencia** — una página por segmento del ad set, mismo esqueleto,
copy adaptado al dolor del segmento:
`busymoms · busy-dads · busy-professionals · boxers · travelers · weightloss-seekers ·
women-on-fitness-journeys · hiit-crossfit-athletes · people-that-hate-cardio ·
no-time-for-the-gym · people-who-hate-their-gym-routine`

Anatomía (ej. `pages/busymoms`): titular de beneficio con tiempo («ponte en forma en solo
minutos al día») → pitch del bundle (producto + app con +100 workouts) → «¿por qué el
paquete?» con 4 bloques de beneficio (cuerpo completo, rutinas guiadas, eficiencia,
calorías/hora) → social proof → CTA. Sin H1 (van a conversión, no a SEO).

**2. Listicles/advertorials de ángulo** — formato «N razones» contra una objeción:
`5-reasons-to-quit-the-gym · 5-reasons-cardio-haters-switch-to-jump-rope ·
5-tiny-tweaks-to-get-fit · list-7-reasons-athletes · why-you-hate-cardio ·
why-gym-members-quit · gym-guilt-solution · jump-rope-changed-my-life ·
adv-absolute-beginners`

Anatomía (ej. `5-reasons-cardio-haters…`): H1 de dolor reencuadrado («You don't hate
cardio. You hate boring cardio.») → las 5 razones como H2s escaneables → transición
(«So here's the thing…») → presentación de producto («Meet Ascent MAX») → testimonios
(«What Cardio Converts Say») → manejo de objeciones («Still Not Sure?» — garantía) → CTA.

**3. Landings de producto/bundle**: `ascent · ascent-max · athlete-bundle ·
elevate-essentials · build` (configurador) + variantes por audiencia del mismo bundle
(`busy-mom-ascent-max · ascent-max-for-athletes · ascent-max-gym-replacement`).

**4. Comunidad/retención (foso competitivo)**: `trickvault` (biblioteca de trucos) ·
`coaching · clinics · membership · app · ambassador · elevatefamily · meetups · events`.

**5. Ofertas/estacionales**: `freerope («Your Second Rope Is On Us») · bogo ·
buy-2-get-1-free · black-friday-sale · elevate25/26 · the-perfect-gift ·
summer-strong-starts-here`.

Traducción a Paat Jumps cuando haya presupuesto de paid: 1 advertorial por audiencia core
(principiantes que quieren aprender · padres/madres sin tiempo · crossfiteros para dobles ·
freestylers) + 1–2 listicles de ángulo («por qué la comba engancha más que el gimnasio»,
«5 razones por las que no aprendiste a saltar (y cómo la segmentada lo arregla)») apuntando
al bundle/colección, con `noindex` si el copy duplica.

## Herramientas

- **DataForSEO**: credenciales en `~/.dataforseo_config.json`; cliente Python en la skill
  `dataforseo` (`~/.claude/skills/dataforseo/scripts/dataforseo_client.py`). Coste de esta
  auditoría: ~$0,52.
- **`tools/seo/apply-seo.mjs`**: aplica seo.title/seo.description + traducciones EN a
  colecciones y productos vía `shopify store execute` (mismo mecanismo que
  `tools/shopify-create`). Idempotente; `--dry-run` para previsualizar.
