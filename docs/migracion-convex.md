# Migración Supabase → Convex

Estado vivo de la migración. Proyecto Convex: team `paat-jumps`, proyecto `paatjumpsnext`
(dev: `vibrant-sockeye-680`). Supabase origen: `hlrstnhhlkfsyiopfgca`.

## Hecho

- **F0 — Proyecto**: proyecto Convex creado, `convex` en package.json, guidelines de IA
  instaladas, env vars de dev en `.env.local`.
- **F1 — Schema + volcado**: `convex/schema.ts` replica las 26 tablas de `public` con
  índices equivalentes a los de Postgres. Pipeline de import
  (`tools/convex-migrate/import.mjs` + `convex/migration.ts`) volcado y verificado en dev:
  26/26 tablas con conteos idénticos y 0 referencias colgantes.

### Convenciones del modelo

- `timestamptz` → ms epoch (`v.number()`); `date`/`period` → string `YYYY-MM-DD` / `YYYY-MM`.
- uuid de Postgres → `legacyId` (trazabilidad); las FKs son `v.id(...)` remapeadas al importar.
- ids bigint de Shopify → campo numérico propio (`orderId`, `customerId`, `checkoutId`;
  los checkouts sintéticos conservan ids negativos).
- `CHECK` de estados → uniones de literales en el validador.
- Re-ejecutar el volcado: `node tools/convex-migrate/import.mjs` (hace wipe + import + verify;
  `--prod` para producción en el corte final).

## Pendiente (fases)

### F2 — Capa de datos Convex + swap del código Next

Crear queries/mutations en `convex/` por área y cambiar cada módulo de `lib/` para llamarlas
(vía `fetchQuery`/`fetchMutation` de `convex/nextjs` en servidor). Orden por riesgo creciente:

1. **Links** (`short_links`): `lib/crm/link-actions.ts`, `app/l/[slug]/route.ts`,
   `app/admin/(panel)/links/page.tsx`. El RPC `register_link_click` pasa a ser una mutation
   (lookup por slug con fallback a `aliases` escaneando la tabla — 4 filas — y `clicks + 1`).
2. **Blog** (`blog_posts`): `lib/blog/queries.ts` (público), `lib/crm/blog-actions.ts`.
3. **Finanzas**: `lib/crm/finance.ts`, `lib/crm/finance-actions.ts`. El upsert
   `onConflict recurring_id,period` → índice `by_recurring_and_period` + insert-si-no-existe
   dentro de la mutation (transaccional). Singleton `finance_settings` → `.first()`.
4. **Promos** (`promotions`, público + admin): `lib/crm/promotions.ts`,
   `lib/crm/promotion-actions.ts`.
5. **Tienda lecturas** (`orders`, `customers`, analytics): `lib/crm/store-queries.ts`,
   partes de `lib/crm/queries.ts`. Los `count exact` → contadores denormalizados o conteo
   directo mientras el volumen sea pequeño; agregaciones por mes siguen en TS.
6. **Envíos**: `lib/crm/packlink-sync.ts`, `lib/crm/packlink-actions.ts`,
   `app/api/admin/genei-label/[reference]`. Las etiquetas Genei ya viven en File Storage
   (`labelStorageId`, resuelto en F1): la ruta del PDF pasa a servir desde
   `ctx.storage.getUrl()` y las compras nuevas de Genei deben subir el PDF a storage
   (upload URL) en vez de guardar base64 en `raw.etiqueta`.
7. **Facturación Holded**: `lib/holded/receipts.ts`, `lib/holded/credit-notes.ts`,
   `lib/crm/dni-requests.ts`, `app/api/admin/holded-backfill`.
8. **CRM núcleo**: `lib/crm/{actions,queries,segments}.ts`, `lib/email/send.ts`,
   `app/api/{subscribe,unsubscribe}`. Los `ilike`/`or()` de búsqueda → filtro en JS sobre
   resultados acotados (volumen actual ínfimo); si crece, search indexes de Convex.
9. **Motores** (`campaign-engine`, `automation-engine`, `shopify-sync`, `local-cart`):
   los RPC `claim_*` con `FOR UPDATE SKIP LOCKED` se vuelven mutations normales (cada
   mutation es transacción serializable; mantener el rescate a los 15 min por `claimedAt`).
10. **Webhooks** (`shopify`, `resend`): se quedan como rutas Next (verificación HMAC/Svix
    intacta) y sustituyen los writes de Supabase por mutations. Idempotencia por índice
    (`by_order_id`, `by_checkout_id`, `by_provider_message_id`) dentro de la mutation.

Notas transversales:

- Upserts `onConflict` → patrón query-por-índice + `patch`/`insert` en mutation.
- Embedded selects de PostgREST (`automation_steps(*)`, `contacts(email)`) → lecturas
  compuestas dentro de la query de Convex.
- Los KPI `count exact head:true` → conteos sobre `.collect()` mientras las tablas sean
  pequeñas; pasar a `@convex-dev/aggregate` si crecen.
- La unicidad parcial de Postgres (p. ej. `events_order_placed_unique`,
  `enrollments_active_no_checkout_key`) se garantiza con check-before-insert en la mutation
  (transaccional, sin carreras).

### F3 — Auth del admin

Sustituir Supabase Auth por **Convex Auth** (`@convex-dev/auth`): providers Password +
Google OAuth, integración Next (`convexAuthNextjsMiddleware` en `proxy.ts`,
`convexAuthNextjsToken()` para `fetchQuery` server-side). `requireAdmin(ctx)` en Convex =
identidad autenticada + email en `admin_users` (reemplaza `is_admin()` RLS). Afecta a:
`lib/supabase/middleware.ts`, `app/admin/login/*`, `app/admin/auth/callback`,
`app/admin/(panel)/layout.tsx`, `lib/crm/actions.ts:requireAdmin`.

- Las contraseñas actuales NO se pueden migrar (hashes en Supabase Auth): los 3 admins
  crean contraseña nueva o entran con Google.
- Hace falta un OAuth client de Google nuevo (redirect al dominio de Convex Auth).

### F4 — Crons nativos

`convex/crons.ts`: automations cada minuto, shopify-sync y packlink-sync cada 10 min, como
`internalAction` que llaman a las mutations. Los engines usan `fetch` (Shopify/Resend/
Packlink/Genei/Holded) → actions. Al terminar: borrar `vercel.json` crons, rutas
`app/api/cron/*` y `CRON_SECRET`. Secretos de terceros → `npx convex env set` en dev y prod.

### F5 — Corte a producción

1. `npx convex deploy` desde CI de Vercel (build command `npx convex deploy --cmd 'pnpm build'`
   con `CONVEX_DEPLOY_KEY` de prod) → crea el deployment de prod.
2. Env vars en Vercel: `NEXT_PUBLIC_CONVEX_URL` (prod) + `CONVEX_DEPLOY_KEY`.
3. Congelar escrituras (pausar crons ~10 min), `node tools/convex-migrate/import.mjs --prod`,
   verificar conteos, desplegar el código ya migrado.
4. Días después: retirar `@supabase/*` del package.json, `lib/supabase/`, migraciones SQL,
   y pausar el proyecto Supabase (queda como backup frío).

## Gotchas conocidos

- Límite de documento Convex 1 MiB: RESUELTO para etiquetas Genei — el import extrae
  `raw.etiqueta` (PDF base64 ~1 MB; gzip solo ahorra ~2%, son imágenes ya comprimidas) y
  lo sube a File Storage (`labelStorageId`); el doc queda en ~8 KB. El wipe del re-import
  borra también los ficheros de storage. Verificado round-trip (PDF 1.7 íntegro, 729 KB).
- `blog_posts` publicación programada por cache tag: la revalidación por tiempo sigue en
  Next; Convex solo aporta el dato (`publishedAt`).
- `orders`/`customers` usan el id de Shopify como clave natural (`by_order_id`,
  `by_customer_id`); el doc `_id` de Convex es interno y no se expone a Shopify.
- PostgREST devolvía `numeric` como number; en Convex ya son `v.number()` — cuidado con
  formateos que asumían string.
