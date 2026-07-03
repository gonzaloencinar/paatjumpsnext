# Plan: Campaña de lanzamiento + CRM/Email marketing propio

> Estado: **Fase 1 y panel /admin (2026-07-02)**; **motor de campañas (3a), secuencias (3c) y Fase 2 (webhooks Shopify + recuperación de carrito) ✅ implementados y probados (2026-07-03)** — `cart_recovery` y la serie de bienvenida esperan a que el dueño revise el copy y las encienda; 3b (segmentos) y 3d (editor de bloques) pendientes.
> Objetivo doble: (1) sacar la **campaña de lanzamiento -20%** con captación de email, y (2) sentar la base de un **CRM + plataforma de email marketing propia** dentro de esta misma app (Next.js) para campañas, automatizaciones (recuperación de carrito, bienvenida), segmentos y métricas.

---

## 0. Índice

1. [Decisiones tomadas](#1-decisiones-tomadas)
2. [Decisiones pendientes](#2-decisiones-pendientes)
3. [Arquitectura general](#3-arquitectura-general)
4. [Stack técnico](#4-stack-técnico)
5. [Modelo de datos (Supabase)](#5-modelo-de-datos-supabase)
6. [Estructura de la app](#6-estructura-de-la-app)
7. [Flujos detallados](#7-flujos-detallados)
8. [Shopify: descuento, webhooks y scopes](#8-shopify-descuento-webhooks-y-scopes)
9. [Envío de email (Resend + dominio)](#9-envío-de-email-resend--dominio)
10. [Cron / scheduler](#10-cron--scheduler)
11. [RGPD, legal y deliverability](#11-rgpd-legal-y-deliverability)
12. [Métricas](#12-métricas)
13. [Variables de entorno](#13-variables-de-entorno)
14. [Fases de implementación](#14-fases-de-implementación)
15. [Riesgos y notas](#15-riesgos-y-notas)
16. [Campañas 2.0 (diseño ampliado)](#16-campañas-20-diseño-ampliado)

---

## 1. Decisiones tomadas

| Tema                    | Decisión                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vía                     | **DIY**: CRM propio dentro de esta app Next.js, no Klaviyo/Mailchimp                                                                                                                                                                                                                                                               |
| Base de datos           | **Supabase** (ya disponible vía MCP)                                                                                                                                                                                                                                                                                               |
| Auth admin              | **Supabase Auth** (login con Google Workspace del dueño)                                                                                                                                                                                                                                                                           |
| Captación (lanzamiento) | **Barra sticky superior** (announcement bar)                                                                                                                                                                                                                                                                                       |
| Descuento               | **Código único por suscriptor**, 20% en todos los productos, gestionado en Shopify                                                                                                                                                                                                                                                 |
| Checkout                | Sigue siendo el **hosted checkout de Shopify** (`cart.checkoutUrl`); el storefront no cambia su flujo                                                                                                                                                                                                                              |
| ESP (transporte email)  | **Resend** (SDK + React Email, webhooks de eventos). Remitente `hola@paatjumps.com` con dominio autenticado; capa abstraída en `lib/email/provider.ts` para poder migrar a SES si el volumen/coste lo pide (§9)                                                                                                                    |
| Scheduler               | **Vercel Cron** (hay plan Pro → frecuencia sub-horaria OK); pg_cron queda como alternativa (§10)                                                                                                                                                                                                                                   |
| Panel /admin            | ✅ **Hecho (2026-07-02)**: UI CRM completa (dashboard, contactos, campañas, promociones, automatizaciones, supresiones) con shadcn, tras login Supabase Auth (email+contraseña, Google opcional) + allowlist `admin_users` vía RLS `is_admin()`                                                                                    |
| Códigos de descuento    | **Un código compartido por promoción**, no pool por suscriptor (decisión 2026-07-02). Tabla `promotions` gestionada en `/admin/promotions` y en sync con Shopify (§8): **generales** (duración definida + toggle de anuncio en la web) y de **afiliados** (comisión % sobre sus ventas). Lanzamiento: `PAAT20` −20% hasta el 1-ago |
| Doble opt-in            | **No** (decisión 2026-07-02): el código va directo en la bienvenida                                                                                                                                                                                                                                                                |
| Fase 1 captación        | ✅ **Hecha y probada end-to-end (2026-07-02)** — ver §14                                                                                                                                                                                                                                                                           |
| Alcance futuro          | Recuperación de carrito, campañas (blasts), segmentos, métricas de aperturas/clics/ingresos                                                                                                                                                                                                                                        |
| Campañas 2.0            | **Diseño 2026-07-03 (§16)**: motor de envío por lotes + programación, segmentos por facetas (lead/cliente/actividad/tags), secuencias multi-paso sobre `automations`, editor de bloques con productos                                                                                                                              |

## 2. Decisiones pendientes

_(2026-07-02: no queda ninguna — todas las decisiones iniciales están tomadas; ver §1.)_

## 3. Arquitectura general

```
                          ┌─────────────────────────────────────────┐
                          │            App Next.js (Vercel)          │
                          │                                          │
  Visitante ── sticky ───►│  /api/subscribe ──► crea contacto        │
     bar (email)          │        │           genera código único   │──► Shopify Admin API
                          │        └────────────► envía bienvenida ──┼──► Resend ─► inbox
                          │                                          │
  Shopify ── webhooks ───►│  /api/webhooks/shopify/*                 │
  (checkouts, orders)     │        └──► escribe en Supabase          │
                          │                                          │
  Resend ── webhooks ────►│  /api/webhooks/resend                    │
  (rebotes, opens, clics) │        └──► email_sends / suppressions   │
                          │                                          │
  Vercel Cron ──────────► │  /api/cron/automations ──► procesa       │──► Resend (recuperación,
                          │                            inscripciones │     recordatorios)
                          │                                          │
  Dueño ── login ───────► │  /admin (protegido) ──► dashboard, campañas, métricas
                          └──────────────────┬───────────────────────┘
                                             │
                                     ┌───────▼────────┐
                                     │    Supabase    │
                                     │  Postgres+Auth │
                                     └────────────────┘
```

**Principio clave:** Supabase es la fuente de verdad del CRM. Shopify solo aporta el **descuento** y el **checkout**, y nos **notifica** (webhooks) de checkouts abandonados y pedidos. Resend solo **transporta** email y nos devuelve eventos (entregas, rebotes, aperturas, clics) por webhook.

## 4. Stack técnico

- **Next.js** (App Router, ya en uso) — route handlers para API, webhooks y cron; middleware para proteger `/admin`.
- **Supabase** — Postgres (datos CRM) + Auth (login admin) + opcionalmente Edge Functions / pg_cron.
- **Shopify Admin API** (GraphQL, `2025-01` o versión estable vigente) — generar códigos, leer pedidos/checkouts, registrar webhooks. Sobre el **mismo custom app** que ya emite el Storefront token, ampliando scopes.
- **Resend** (+ React Email para plantillas) — envío transaccional y de campañas con dominio autenticado; eventos de entrega/rebote/apertura/clic por webhook. Abstraído en `lib/email/provider.ts` por si migramos a SES.
- **Vercel Cron** (o alternativa) — disparador de automatizaciones.

## 5. Modelo de datos (Supabase)

> ✅ **Aplicado (2026-07-02)** en el proyecto Supabase `Paat Jumps` (migraciones espejo en `supabase/migrations/`). Todas las tablas con **RLS activada** y una única policy por tabla: `is_admin()` (SECURITY INVOKER, comprueba el email del JWT contra la tabla `admin_users`). El panel `/admin` accede con la sesión del usuario (publishable key + RLS); `anon` no tiene grants. El backend futuro (subscribe/webhooks/cron) usará la **service role key** (server-only), que ignora RLS.

```sql
-- ─────────────────────────── Contactos ───────────────────────────
create table contacts (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  first_name    text,
  status        text not null default 'pending', -- pending | subscribed | unsubscribed | bounced | complained
  source        text,                             -- 'sticky_bar' | 'checkout' | 'import' | ...
  consent       boolean not null default false,
  consent_text  text,                             -- copia literal del texto aceptado (RGPD)
  consent_at    timestamptz,
  consent_ip    text,
  shopify_customer_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Timeline event-sourced: el corazón del CRM
create table events (
  id          bigint generated always as identity primary key,
  contact_id  uuid references contacts(id) on delete cascade,
  type        text not null,   -- signup | cart_created | checkout_abandoned | order_placed
                               -- email_sent | email_opened | email_clicked | unsubscribed ...
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index on events (contact_id, created_at desc);
create index on events (type, created_at desc);

-- ──────────────────── Checkouts abandonados (Shopify) ────────────────────
create table checkouts (
  id                bigint primary key,           -- Shopify checkout id
  token             text,                          -- checkout_token
  cart_token        text,
  contact_id        uuid references contacts(id),
  email             text,
  currency          text,
  total_price       numeric,
  line_items        jsonb,
  recovery_url      text,                          -- abandoned_checkout_url
  status            text not null default 'abandoned', -- abandoned | recovered | converted
  abandoned_at      timestamptz,
  last_event_at     timestamptz,
  recovery_sent_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index on checkouts (status, abandoned_at);

-- ──────────────────────────── Pedidos ────────────────────────────
create table orders (
  id                bigint primary key,           -- Shopify order id
  contact_id        uuid references contacts(id),
  email             text,
  checkout_token    text,
  cart_token        text,
  total_price       numeric,
  currency          text,
  discount_code     text,                          -- para atribución
  campaign_id       uuid,                          -- atribución (nullable)
  created_at        timestamptz not null default now()
);

-- ────────────────────── Códigos de descuento ──────────────────────
create table discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  contact_id        uuid references contacts(id),
  shopify_discount_id text,                        -- id del DiscountCodeBasic / price rule
  percentage        int not null default 20,
  expires_at        timestamptz,
  redeemed          boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ───────────────────────── Campañas (blasts) ─────────────────────────
create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  subject      text,
  body_html    text,
  segment      jsonb,          -- criterios de segmentación
  status       text not null default 'draft', -- draft | scheduled | sending | sent
  scheduled_at timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ──────────────────── Automatizaciones (flows) ────────────────────
create table automations (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,  -- 'welcome' | 'cart_recovery' | ...
  name        text not null,
  enabled     boolean not null default true,
  config      jsonb,                 -- delays, nº de pasos, plantillas
  created_at  timestamptz not null default now()
);

-- Estado por contacto dentro de una automatización (máquina de estados)
create table automation_enrollments (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid references automations(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete cascade,
  checkout_id    bigint references checkouts(id),  -- para cart_recovery
  step           int not null default 0,
  status         text not null default 'active',   -- active | completed | canceled
  next_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (automation_id, contact_id, checkout_id)
);
create index on automation_enrollments (status, next_run_at);

-- ─────────────────────── Envíos y eventos de email ───────────────────────
create table email_sends (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid references contacts(id),
  campaign_id         uuid references campaigns(id),
  automation_id       uuid references automations(id),
  template            text,
  subject             text,
  provider_message_id text,
  status              text not null default 'queued', -- queued | sent | delivered | bounced | complained | failed
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index on email_sends (contact_id, created_at desc);

-- Lista de supresión: se consulta ANTES de cada envío
create table suppressions (
  email       text primary key,
  reason      text not null,   -- unsubscribe | hard_bounce | complaint | manual
  created_at  timestamptz not null default now()
);
```

**Notas de modelado**

- `events` es append-only y da la vista de "timeline del contacto" del CRM.
- `automation_enrollments` es lo que hace que la recuperación de carrito sea idempotente y con estado (evita reenvíos).
- `suppressions` es la barrera de seguridad legal/deliverability: **toda** función de envío la consulta primero.
- Emails siempre normalizados a **minúsculas** antes de guardar/comparar (o usar `citext`): evita contactos duplicados por mayúsculas.

## 6. Estructura de la app

```
app/
  (rutas públicas existentes...)
  api/
    subscribe/route.ts               # alta desde la sticky bar
    webhooks/shopify/
      checkouts/route.ts             # checkouts/create, checkouts/update
      orders/route.ts                # orders/create (o orders/paid)
    webhooks/resend/route.ts         # eventos ESP → email_sends / suppressions
    cron/
      automations/route.ts           # procesa inscripciones due (cart recovery, welcome)
    e/                               # (opcional, futuro) tracking propio; el MVP usa el de Resend (§12)
      open/route.ts                  # pixel 1x1 de apertura
      click/route.ts                 # redirect con tracking de clic (firmado)
    unsubscribe/route.ts             # baja en 1 clic (List-Unsubscribe)
  admin/                             # CRM (✅ hecho 2026-07-02)
    login/…                          # acceso: Supabase Auth email+contraseña
    (panel)/                         # layout sidebar + guard getClaims + is_admin
      page.tsx                       # dashboard: KPIs, chart de altas, actividad
      contacts/… campaigns/…
      automations/… suppressions/…
components/
  marketing/announcement-bar.tsx     # barra sticky (Fase 1)
lib/
  crm/                               # queries Supabase, segmentación
  email/
    provider.ts                      # abstracción sobre Resend (send…) — permite migrar a SES
    templates/                       # React Email (.tsx): bienvenida, recuperación, recordatorio, confirmación
    tracking.ts                      # firma/inyección de pixel y links (solo si tracking propio)
  shopify/
    admin.ts                         # cliente Admin API (códigos, webhooks, pedidos)
  supabase/
    server.ts                        # cliente service-role (server only)
middleware.ts                        # protege /admin con Supabase Auth (re-verificar en el layout, no solo aquí)
supabase/
  migrations/                        # DDL versionado (§5)
vercel.json                          # crons
```

## 7. Flujos detallados

### 7.1 Captación (sticky bar → bienvenida) — Fase 1

1. `components/marketing/announcement-bar.tsx`: barra sticky superior en estética **dark + `orange-600`**, sin grises (según convenciones del proyecto). Copy del lanzamiento + input email (+ checkbox consentimiento RGPD con link a privacidad). Descartable (cookie), oculta si ya suscrito.
2. Submit → `POST /api/subscribe` con `{ email, first_name?, consent }`.
3. El route handler (server):
   - valida email + consentimiento; consulta `suppressions`.
   - upsert en `contacts` (`status`: `pending` si doble opt-in, si no `subscribed`) guardando `consent_text/at/ip`.
   - genera **código único** en Shopify (§8) y lo guarda en `discount_codes`.
   - registra `events(type='signup')`.
   - envía email de **bienvenida** con el código + **botón "Comprar con -20%"** (link que auto-aplica el código, §8) + "caduca en X días". Incluye link de **baja** (footer + cabeceras List-Unsubscribe) ya desde este primer email (§11).
   - (si doble opt-in: primero email de confirmación; el código se entrega tras confirmar).
   - anti-abuso: rate limit por IP en `/api/subscribe` + campo honeypot en el form.
4. Respuesta al front: estado "revisa tu correo" (+ opcional paso 2 pidiendo nombre).

### 7.2 Recuperación de carrito — Fase 2

Dos capas:

- **Capa A (todos):** Shopify emite `checkouts/create`/`checkouts/update` cuando el cliente llega al checkout y mete su email → guardamos/actualizamos `checkouts` (con `recovery_url`) y creamos `automation_enrollments` para `cart_recovery`. Guardar también `buyer_accepts_marketing` del checkout: condiciona qué se le puede enviar (§11).
- **Capa B (suscriptores conocidos, opcional):** como el carrito vive en la app (Storefront API), atar `cart_token` ↔ `contact_id` para recuperar **antes** del checkout.

Disparo (cron, §10) sobre `automation_enrollments` de `cart_recovery` con `next_run_at <= now()` y `status='active'`:

- paso 0 → email a las ~1h; paso 1 → recordatorio a las ~24h; etc. (configurable en `automations.config`).
- **Supresión de conversión:** el webhook `orders/create` marca el `checkout` como `converted` y cancela la inscripción → **no** se envía a quien ya compró. (imprescindible).
- **Desactivar la automatización nativa de Shopify** de checkout abandonado (Admin → Marketing → Automatizaciones) antes de encender la nuestra, para no enviar emails duplicados.

### 7.3 Campañas / blasts — Fase 3

> **Ampliado en §16 (2026-07-03):** segmentos por facetas (lead/cliente/actividad), programación con quiet hours, secuencias multi-paso y editor de bloques con productos.

- Editor en `/admin/campaigns`: asunto, cuerpo (HTML/plantilla), **segmento** (jsonb → query sobre `contacts`/`events`).
- Enviar/programar → encola en `email_sends`; el cron procesa por **lotes pequeños y re-entrantes** (cada tick coge N pendientes, envía, marca y termina — manda el timeout de la función) usando el **batch API de Resend** (hasta 100 emails/llamada), respetando su rate limit (~2 req/s por defecto) y **quiet hours**.
- Toda dirección se cruza contra `suppressions` antes de enviar.

### 7.4 Métricas — Fase 3

Ver §12.

## 8. Shopify: descuento, webhooks y scopes

**Descuento (config en Shopify Admin o vía API):**

- Tipo **código** (no automático), **20%**, **todos los productos**, **1 uso por cliente**, **fecha de caducidad**, sin importe mínimo (o bajo).

**Códigos — modelo final (✅ implementado 2026-07-02):** un **código compartido por promoción**, gestionado en la tabla `promotions` desde `/admin/promotions` y sincronizado con Shopify:

- **Promoción general** (p.ej. lanzamiento `PAAT20`): `DiscountCodeBasic` con `appliesOncePerCustomer` y `endsAt`. El toggle **`announce`** enciende/apaga la barra de captación del storefront (cache tag `promotions` → efecto inmediato). La bienvenida lleva el código de la promo general activa; si no hay ninguna, sale sin código.
- **Promoción de afiliado**: código propio (p.ej. `MARIA10`), sin límite por cliente, con `affiliate_commission_pct`; las ventas se atribuyen por `orders.discount_code` (webhooks Fase 2) y el panel calcula la comisión.
- **Sync CRM→Shopify** en `lib/shopify/admin.ts` (`discountCodeBasicCreate/Update`, `discountCodeActivate/Deactivate`, `discountCodeDelete`) con `SHOPIFY_ADMIN_API_TOKEN`; sin token, la promo queda marcada "Sin sync" en el panel y se sana al editarla cuando haya token.
- La tabla `discount_codes` (pool por-contacto) y `assign_discount_code()` quedan **en reserva** por si algún día se quieren códigos únicos por suscriptor.

**Pre-aplicar el descuento (mejor conversión), versión headless:** ⚠️ el _discount link_ clásico (`https://{tienda}.myshopify.com/discount/{CODIGO}?redirect=/`) pasa por el **Online Store de Shopify**, no por nuestro storefront — con la tienda headless el redirect no vuelve a paatjumps.com (y choca con la password page si está activa). Mejor bajo nuestro control:

1. El botón del email apunta a `https://paatjumps.com/?code={CODIGO}` (o una landing `/oferta`).
2. El storefront guarda el código (cookie/localStorage) y lo aplica al carrito con `cartDiscountCodesUpdate` (Storefront API) al crearlo/actualizarlo → el descuento **ya se ve en el carrito** y se hereda en `cart.checkoutUrl`.
3. Fallback: el código siempre visible en texto en el email, por si lo quieren pegar a mano en el checkout.

**Webhooks a registrar** (Admin API):
| Webhook | Uso |
|---|---|
| `checkouts/create`, `checkouts/update` | Detectar checkouts abandonados + `recovery_url` |
| `orders/create` (o `orders/paid`) | Conversión (suprimir recuperación) + atribución de ingresos |
| `customers/redact`, `shop/redact`, `customers/data_request` | Cumplimiento RGPD (si el tipo de app lo permite registrarlos; en un custom app de admin puede que no apliquen como webhooks → atender esas solicitudes manualmente) |

- **Verificación HMAC** obligatoria en cada webhook (`X-Shopify-Hmac-Sha256` con el secret del app). Responder 200 rápido; procesar async si hace falta.
- `orders/create` además marca `discount_codes.redeemed = true` cuando el pedido usa un código nuestro (atribución, §12).

**Scopes a añadir al custom app existente** (el mismo que emite el Storefront token):

- `write_discounts`, `read_discounts`
- `read_orders`
- `read_checkouts`
- Acceso a **datos protegidos de cliente** (email/nombre) — habilitar en la config del custom app.
- Genera un **Admin API access token** (además del Storefront token que ya hay).

## 9. Envío de email (Resend + dominio)

- **Remitente:** `Paat Jumps <hola@paatjumps.com>` (dominio Workspace) pero **transporte por Resend**. ⚠️ Nunca marketing por Gmail/Workspace SMTP (límites, sin gestión de rebotes/bajas, reputación del dominio en riesgo).
- **DNS al verificar el dominio en Resend:** DKIM (TXT `resend._domainkey`) + SPF/MX del _return-path_ en el subdominio `send.paatjumps.com`. **No toca el SPF de la raíz** que usa Google Workspace — el correo normal de Workspace no se ve afectado. Añadir **DMARC** en la raíz (`p=none` al inicio, subir a `quarantine`); la alineación DMARC pasa por DKIM. (Cumple las reglas de remitentes masivos de Gmail/Yahoo 2024.)
- **SDK + plantillas:** paquetes `resend` + `@react-email/components`. Las plantillas son componentes React (`lib/email/templates/*.tsx`); el SDK las acepta directamente (prop `react`).
- **Abstracción `lib/email/provider.ts`**: `send({to, subject, react|html, headers})` — todos los flujos pasan por aquí; migrar a SES en el futuro no toca el resto del código.
- **Idempotencia:** usar el header `Idempotency-Key` de Resend en envíos disparados por cron/reintentos — un retry no duplica el email.
- **Tracking:** activar **open & click tracking** de Resend a nivel de dominio; las aperturas/clics llegan por webhook (§12) — no hace falta montar pixel/redirect propios en el MVP.
- **Webhooks de Resend** (`email.sent|delivered|bounced|complained|opened|clicked`) → `POST /api/webhooks/resend`, verificando la **firma (Svix)** → actualiza `email_sends` y alimenta `suppressions` (hard bounce, queja).
- **No usamos Audiences/Broadcasts de Resend:** Supabase es la única fuente de verdad de contactos y segmentos; Resend solo transporta (evita tener dos listas que sincronizar).
- **Cabeceras obligatorias:** `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) apuntando a `/api/unsubscribe`.
- **RGPD:** aceptar el **DPA de Resend** (transferencias fuera del EEE vía SCCs) y reflejarlo como encargado del tratamiento en la política de privacidad.
- **Plan B de coste:** si el volumen crece, migrar a Amazon SES (~0,10 $/1.000) detrás de la misma abstracción.

## 10. Cron / scheduler

- **Con Vercel Pro: Vercel Cron** (`vercel.json`) → golpea `/api/cron/automations`. Proteger con `CRON_SECRET` (header) y verificar en el handler. ✅ **Activo desde 2026-07-03**: cada minuto (`* * * * *`), hoy procesa campañas (§16.3); la Fase 2 le añade los enrollments en el mismo tick.
  - ⚠️ **Hobby plan** limita cron a **1×/día**; recuperación de carrito necesita frecuencia sub-horaria.
- **En Hobby (defecto si no hay Pro): Supabase pg_cron + pg_net** — ya tenemos Supabase; un job cada 10–15 min hace `http_post` a `/api/cron/automations` con el `CRON_SECRET`. Alternativa: **Upstash QStash** (schedules) apuntando al mismo handler.
- El job debe ser **idempotente** (usa `automation_enrollments.next_run_at` + `status`, e `Idempotency-Key` en los envíos, §9) y **re-entrante**: cada tick procesa un lote pequeño y termina antes del timeout de la función (`maxDuration`); lo pendiente cae en el siguiente tick.

## 11. RGPD, legal y deliverability

- **Consentimiento explícito**: checkbox **no premarcado** + link a política de privacidad; guardar `consent_text/at/ip` (§5).
- **Doble opt-in** recomendado: `contacts.status='pending'` → email de confirmación → `subscribed` tras clic. (El código de descuento se puede entregar tras confirmar, o en la bienvenida single opt-in si se decide así — decisión pendiente §2).
- **Baja en 1 clic** funcional desde el **primer email** — la bienvenida ya es marketing, así que `/api/unsubscribe` + cabeceras List-Unsubscribe son **Fase 1, no opcionales** → escribe en `suppressions` y `contacts.status='unsubscribed'`.
- **Recuperación de carrito y consentimiento (LSSI/RGPD):** quien abandona un checkout no es todavía cliente ni suscriptor. Usar el `buyer_accepts_marketing` del checkout: si aceptó marketing (o ya es contacto `subscribed`), serie completa; si no, limitarse a **un único email de cortesía** sobre su carrito (interés legítimo, criterio a validar) o no enviar. Decisión a cerrar en Fase 2.
- **Lista de supresión** consultada **antes de cada envío** (bajas, hard bounces, quejas).
- **Reglas de remitentes masivos (Gmail/Yahoo 2024):** SPF+DKIM+DMARC, baja en 1 clic, tasa de quejas <0,3%.
- **Política de privacidad y aviso legal** actualizados con el tratamiento de marketing.

## 12. Métricas

- **Aperturas y clics (MVP):** los da **Resend** (open/click tracking a nivel de dominio) vía webhooks `email.opened`/`email.clicked` → `email_sends.opened_at/clicked_at` + `events`. ⚠️ _Apple Mail Privacy Protection_ infla aperturas; tratarlas como señal blanda.
- **Tracking propio (opcional, futuro):** pixel `/api/e/open?s={email_send_id}` y redirect `/api/e/click?s={id}&u={url_firmada}` si algún día queremos el dato en primera persona. **Firmar la URL (HMAC)** para evitar _open redirect_.
- **Ingresos atribuidos**: `orders/create` → match a `contact` (por email) y a `discount_code`/`campaign` → panel de ingresos por campaña/automatización.
- **Dashboard `/admin`**: nº suscriptores, altas por fuente, tasa apertura/clic, carritos recuperados, ingresos por código de lanzamiento.

## 13. Variables de entorno

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=                 # sb_secret_… server-only, nunca al cliente

# Shopify Admin API (custom app existente, scopes ampliados)
SHOPIFY_ADMIN_API_TOKEN=             # ⚠️ pendiente: necesario para crear/editar promos desde el panel
SHOPIFY_ADMIN_STORE_DOMAIN=          # ars0a5-xx.myshopify.com
SHOPIFY_ADMIN_API_VERSION=2026-04    # o la estable vigente
SHOPIFY_WEBHOOK_SECRET=              # Fase 2

# Email (Resend; ver §9)
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=               # firma (Svix) de los webhooks de Resend
EMAIL_FROM="Paat Jumps <hola@paatjumps.com>"

# App / seguridad
CRON_SECRET=                         # ✅ configurado (2026-07-03): protege /api/cron/automations
EMAIL_LINK_SIGNING_SECRET=           # firma de los links de baja (y tracking propio futuro §12)
# (la allowlist de admins vive en la tabla admin_users, no en env)
```

## 14. Fases de implementación

### Fase 1 — MVP captación + código de lanzamiento ✅ (2026-07-02)

**Meta:** lanzamiento funcionando end-to-end.

- [x] Migraciones Supabase: `contacts`, `events`, `discount_codes`, `email_sends`, `suppressions`, `promotions`.
- [x] Dominio verificado en **Resend**. _(región eu-west-1; DKIM + MX/SPF en `send.` + DMARC `p=none` vía API de Cloudflare — SPF/MX raíz de Workspace intactos)_
- [x] `lib/email/provider.ts` (Resend) + `lib/email/send.ts` (supresiones + `email_sends` + List-Unsubscribe en todo envío) + plantilla de bienvenida JSX.
- [x] Descuento de lanzamiento en Shopify: `PAAT20` (−20%, once-per-customer, hasta 1-ago) + promo `Lanzamiento` activa y anunciada.
- [x] `lib/shopify/admin.ts` (sync de promociones). _Pendiente pegar `SHOPIFY_ADMIN_API_TOKEN` para crear promos nuevas desde el panel._
- [x] `components/marketing/announcement-bar.tsx` — gobernada por el toggle "Anuncio web" de la promo; consentimiento RGPD, honeypot, descartable.
- [x] `POST /api/subscribe` (validación, consentimiento, rate limit por IP, código de la promo activa, bienvenida).
- [x] Auto-aplicación del código en el storefront: `/?code=X` → cookie + `cartDiscountCodesUpdate` → el descuento llega aplicado al checkout.
- [x] `/api/unsubscribe` (GET página + POST One-Click RFC 8058) con links firmados HMAC.
- [x] `/api/webhooks/resend` (firma Svix verificada a mano) → `email_sends` + `suppressions` + `events`.
- [x] Doble opt-in: **descartado** (decisión 2026-07-02).
- **Aceptación:** ✅ probada end-to-end contra servicios reales — alta → bienvenida con `PAAT20` recibida; webhook `email.opened` firmado actualiza `opened_at` (firma falsa → 401); baja firmada crea la supresión (token inválido → 400). ⚠️ Falta crear la página `/politica-de-privacidad` en Shopify (la barra enlaza a ella).

### Fase 2 — Recuperación de carrito ✅ (2026-07-03, código y webhooks)

- [x] Webhooks `checkouts/create|update` + `orders/create` en `/api/webhooks/shopify` con verificación HMAC (secret = client secret de la app CLI PaatJumpsNext; scopes `read_orders`/`read_checkouts` añadidos vía `shopify app deploy` + `shopify store auth`). _Probado con payloads firmados: carrito → contacto+inscripción; pedido → conversión+cancelación+derivados._
- [x] Campos derivados en `contacts` (`orders_count`, `total_spent`, `last_order_at`, `last_open_at`, `last_click_at`, `tags`) — los mantienen los webhooks de Shopify y Resend (base de los segmentos 3b).
- [x] `cart_recovery` con pasos editables (1 h y +23 h, botón `{{url_carrito}}` → `abandoned_checkout_url`) — **desactivada** hasta revisar el copy.
- [x] Supresión por conversión: `orders/create` marca el checkout `converted`, cancela su inscripción y las `cancel_on_order` (urgencia de bienvenida); el motor además cancela al vuelo si el checkout ya no está `abandoned`.
- [x] Consentimiento (§11, decisión conservadora): sin contacto suscrito solo se inscribe si `buyer_accepts_marketing` (se crea contacto `source='checkout'` con consentimiento documentado); sin consentimiento, no hay email de cortesía.
- [x] Atribución (§16.6, parte 1): `orders.campaign_id` por ventana de clic ≤5 días; por promo enlazada llega con 3d.
- [ ] ⚠️ **Pendiente del dueño antes de encender `cart_recovery`:** desactivar la automatización nativa de checkout abandonado en Shopify (Admin → Marketing → Automatizaciones) y, en el primer checkout real, comprobar que el webhook trae `email` (si llega null → activar Protected Customer Data de la app en dev.shopify.com).
- **Aceptación:** abandonar checkout con email → recuperación a la hora; comprar antes → NO recibirla. _(Verificado con webhooks sintéticos firmados; queda el ensayo con un checkout real.)_

### Fase 3 — CRM + campañas + métricas

- [x] Supabase Auth + allowlist protegiendo `/admin` (middleware + re-verificación en layout; allowlist en tabla `admin_users` vía RLS `is_admin()`, no env var). _(2026-07-02)_
- [x] Dashboard (KPIs, chart de altas 30d, actividad), contactos con timeline `events`, supresiones. _(2026-07-02 — la UI; se llenará con datos de Fases 1–2)_
- [x] Editor de campañas (borradores + segmento). _(2026-07-02 — falta el motor de envío por lotes con rate limit + supresión)_
- [x] Promociones: `/admin/promotions` con sync a Shopify, toggles de activación y de anuncio web, y comisiones de afiliados. _(2026-07-02)_
- [ ] **Campañas 2.0 (§16)** — sustituye a los ítems de envío/métricas que quedaban aquí; en 4 sub-fases:
  - [x] **3a Motor de envío** _(2026-07-03, probado end-to-end contra Resend/Supabase)_: `campaign_recipients` + RPCs (`materialize_campaign` idempotente, `claim_campaign_batch` con skip locked), cron cada minuto, programar con quiet hours (hora de Madrid), enviar ahora, prueba al admin, pausar/reanudar/cancelar, duplicar, `{{nombre}}`, preheader y plantilla de marca.
  - [ ] **3b Segmentos:** campos derivados en `contacts` (pedidos, actividad email) + tags + backfill de pedidos históricos, facetas compiladas a SQL, segmentos guardados con recuento, chips de filtro en `/admin/contacts`.
  - [x] **3c Secuencias** _(2026-07-03 — triggers `signup` y `manual` operativos, probado end-to-end)_: `automation_steps` + editor por pasos con stats, runner en el mismo cron (claim con lease de 15 min + Idempotency-Key por inscripción+paso), inscripción automática en el alta, inscripción manual de suscriptores, re-inscripciones permitidas, secuencias nuevas desde el panel. Serie de bienvenida D3/D6 sembrada (**desactivada** — revisar copy y encender). Quedan para Fase 2: triggers `checkout_abandoned`/`order_placed`/`winback` y la salida por compra.
  - [ ] **3d Contenido y atribución:** editor de bloques + product picker, plantilla maestra, preview, UTM, ingresos por campaña/paso en el panel.
- **Aceptación:** programar una campaña a un segmento y verla salir sola por lotes; un alta nueva recibe la serie de bienvenida completa y deja de recibirla al comprar; el panel muestra aperturas/clics/ingresos por campaña.

## 15. Riesgos y notas

- **Gmail SMTP para marketing = no.** Es el error más común; todo va por Resend con dominio autenticado (§9).
- **Discount link clásico con storefront headless**: `/discount/…` redirige al Online Store de Shopify, no a paatjumps.com (y choca con la password page si está activa) → aplicar el código vía `cartDiscountCodesUpdate` (§8).
- **Emails de recuperación duplicados**: desactivar la automatización nativa de Shopify antes de encender la nuestra (§7.2).
- **Vercel Cron en Hobby** solo 1×/día → recuperación de carrito necesita Pro o alternativa (§10).
- **Datos protegidos de cliente en Shopify**: hay que habilitar el acceso en el custom app para leer email/nombre en webhooks/pedidos (§8).
- **Open redirect** si algún día montamos tracking de clics propio: firmar siempre la URL destino (§12).
- **Idempotencia** en cron y webhooks (Shopify puede reintentar) → claves únicas y chequeo de estado antes de enviar.
- **Aperturas infladas** por Apple MPP → no optimizar solo por open rate.
- **Límites del free tier de Resend**: 3.000 emails/mes **y ~100/día** — la bienvenida y la recuperación aguantan, pero un blast de lanzamiento a toda la lista no cabe en un día → prever plan Pro (20 $/mes, 50k) para la primera campaña. SES (~0,10 $/1.000) queda como plan B detrás de la abstracción. Supabase free tier suele bastar al inicio.

## 16. Campañas 2.0 (diseño ampliado)

> Diseño **2026-07-03**, pendiente de implementación (DDL nuevo va en migraciones futuras; §5 refleja solo lo aplicado). Detalla y reordena la Fase 3 (§14) en sub-fases 3a–3d. Objetivo: que `/admin/campaigns` pase de "borradores de un blast" a la herramienta de marketing de la tienda: **segmentos** (leads vs clientes), **programación**, **secuencias** (drip) y **editor** con productos.

### 16.1 Principios

- **Un solo camino de envío:** todo pasa por `sendCrmEmail()` (supresiones + `email_sends` + List-Unsubscribe). Los blasts no lo puentean.
- **Un solo runner:** el cron de Fase 2 (`/api/cron/automations`) procesa también campañas y secuencias — mismas garantías (idempotente, re-entrante, lotes pequeños dentro del timeout).
- **Secuencias = `automations` generalizadas:** no se inventa un sistema nuevo; se amplían `automations`/`automation_enrollments` (ya diseñadas para cart_recovery) con pasos editables y más triggers.
- **Sin query builder genérico:** segmentación por **facetas cerradas** compiladas a SQL en `lib/crm/segments.ts` — cada faceta responde a una pregunta de negocio real, no a un lenguaje de consultas.

### 16.2 Segmentación (leads, clientes, actividad)

Campos **derivados** en `contacts` (denormalizados; los mantienen los webhooks — barato de filtrar y visible en la lista de contactos):

```sql
alter table contacts
  add column orders_count  int not null default 0,
  add column total_spent   numeric not null default 0,
  add column last_order_at timestamptz,
  add column last_open_at  timestamptz,
  add column last_click_at timestamptz,
  add column tags          text[] not null default '{}';

create table segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  definition  jsonb not null,   -- { include: [{facet, op, value}], exclude: [...] }
  created_at  timestamptz not null default now()
);
```

- `orders_count` / `total_spent` / `last_order_at` ← webhook `orders/create` (Fase 2) + **backfill one-off** de pedidos históricos vía Admin API, para no arrancar a cero.
- `last_open_at` / `last_click_at` ← webhook de Resend (ya existe; añadir el update).
- `tags` ← manual desde el panel (p. ej. `club`, `profe`, `mayorista`).

**Facetas** (se combinan con AND; lista `exclude` opcional, p. ej. "excluir a quien compró esta semana"):

| Faceta            | Valores                                                        | Fuente                       |
| ----------------- | -------------------------------------------------------------- | ---------------------------- |
| Tipo              | lead (0 pedidos) · cliente (≥1) · repetidor (≥2) · VIP (≥ X €) | `orders_count`/`total_spent` |
| Actividad email   | activos (open/clic ≤ 90 d) · dormidos (> 90 d)                 | `last_open_at`               |
| Fuente            | sticky_bar · checkout · import · manual                        | `source`                     |
| Alta              | últimos N días                                                 | `created_at`                 |
| Tag               | cualquiera de […]                                              | `tags`                       |
| Compró con código | p. ej. `PAAT20`                                                | `orders.discount_code`       |

- Los segmentos se **guardan y reutilizan** (`segments`), con recuento en vivo al editar ("ahora mismo: 143 contactos").
- `/admin/contacts` estrena los mismos filtros como **chips** + acciones "Guardar como segmento" y "Crear campaña con este filtro" (el bucle contactos → segmento → campaña).
- ⚠️ Lead vs cliente depende de datos de pedidos → **webhooks de Fase 2 + backfill**. Hasta entonces, todo contacto cuenta como lead.

### 16.3 Motor de envío y programación

> ✅ **Implementado y probado (2026-07-03)** — migración `campaigns_send_engine`, motor en `lib/crm/campaign-engine.ts`, cron `/api/cron/automations` cada minuto (`vercel.json`), panel de envío en la ficha de campaña. De este bloque quedan para más adelante: `body_blocks`/`promotion_id` (3d), `segment_id` (3b) y el guardarraíl de cuota diaria de Resend (3b). v1 envía **secuencial** (~2 emails/s vía `sendCrmEmail`, que re-chequea supresiones por envío); el batch API de Resend queda como optimización cuando el volumen lo pida.

```sql
-- Snapshot de destinatarios por campaña: auditoría RGPD de a quién se envió,
-- envío re-entrante/reanudable y denominador exacto de las métricas.
create table campaign_recipients (
  id            bigint generated always as identity primary key,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  email         text not null,
  status        text not null default 'pending', -- pending | sending | sent | skipped | failed
  email_send_id uuid references email_sends(id),
  created_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index on campaign_recipients (campaign_id, status);

alter table campaigns
  add column preheader    text,
  add column body_blocks  jsonb,                          -- §16.5 (body_html pasa a ser el render)
  add column promotion_id uuid references promotions(id), -- §16.5: botón con código auto-aplicado
  add column segment_id   uuid references segments(id);
  -- status admite además: paused | canceled
```

Ciclo de vida `draft → scheduled → sending → sent` (+ `paused`/`canceled`):

1. **Programar** (datetime en hora de Madrid — conversión TZ-independiente en `lib/crm/schedule.ts`; quiet hours 22:00–09:00 validadas en el server action) o **Enviar ahora** — diálogo de confirmación con el recuento real (`count_campaign_audience`) y recordatorio de la prueba.
2. Al disparar, se **materializa el segmento** en `campaign_recipients` (cruzando `suppressions` también en ese momento) y `status → sending`. El cron del minuto siguiente empieza a enviar.
3. Cada tick del cron **reclama un lote** vía RPC `claim_campaign_batch(campaign_id, n)` (`for update skip locked` — PostgREST no lo expone, de ahí la función; rescata también filas `sending` colgadas >15 min) y envía **uno a uno por `sendCrmEmail`** con ~600 ms de espaciado (rate limit Resend) e `Idempotency-Key = campaign:{id}:recipient:{id}` — un tick repetido tras un crash no duplica emails. 3 fallos seguidos cortan el tick (problema de proveedor, no de destinatario). Lote de 40/tick, cabe en `maxDuration = 60`.
4. Sin filas `pending`/`sending` restantes → `status = sent` + `sent_at`.

- **Prueba:** botón "Enviarme una prueba" (al email del admin) desde el borrador.
- **Pausar/cancelar:** `paused` detiene el claim (reanudable); `canceled` marca los pendientes como `skipped`.
- **Duplicar campaña:** clona contenido + segmento como borrador nuevo (en la práctica, la acción más usada).
- **Guardarraíl de cuota:** si destinatarios > cuota diaria restante de Resend (free: ~100/día), bloquear el envío y sugerir Resend Pro (§15) — mejor que un blast goteando durante días.

### 16.4 Secuencias (drip) sobre `automations`

> ✅ **Implementado y probado (2026-07-03)** — migración `automations_sequences`, runner en `lib/crm/automation-engine.ts` (mismo tick del cron, presupuesto de emails compartido con campañas), editor por pasos en `/admin/automations/[id]`. Operativos los triggers `signup` (el alta inscribe; la serie empieza tras la bienvenida D0 de `/api/subscribe`) y `manual` (botón "Inscribir suscriptores": solo a quien nunca pasó por la secuencia). Los pasos usan `body_html` como las campañas (los bloques llegan en 3d); un paso sin asunto o contenido no participa. Con la Fase 2: triggers de checkout/pedidos y salida por compra.

```sql
create table automation_steps (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  position      int not null,
  delay_minutes int not null default 0,   -- desde el paso anterior
  subject       text,
  body_blocks   jsonb,                    -- mismo editor que campañas (§16.5)
  enabled       boolean not null default true,
  unique (automation_id, position)
);

alter table automations add column trigger text not null default 'signup';
-- signup | checkout_abandoned | order_placed | winback | manual
alter table email_sends add column automation_step_id uuid references automation_steps(id);
```

- **Triggers:** `signup` (bienvenida), `checkout_abandoned` (Fase 2), `order_placed` (post-compra), `winback` (scan diario: clientes con `last_order_at` > N días), `manual` (inscribir un segmento a mano → sirve como drip de lanzamiento o mini-curso).
- **Salidas:** la compra cancela la inscripción si `config.cancel_on_order` (el webhook `orders/create` ya lo hace para cart_recovery); las bajas las corta siempre `sendCrmEmail` (suppressions); último paso → `completed`.
- **Unicidad de inscripciones:** la migración inicial ya usa `unique nulls not distinct (automation_id, contact_id, checkout_id)`, así que el caso `checkout_id null` dedupe bien. Lo que sí habrá que cambiar en 3c es permitir **re-inscripciones** (p. ej. winback repetido tras completar una pasada): sustituirla por un índice parcial único sobre `(automation_id, contact_id) where checkout_id is null and status = 'active'`.
- **Editor** en `/admin/automations/[id]`: pasos ordenados con delay + asunto + bloques, switch por paso, métricas por paso (vía `automation_step_id`). El contenido vive en DB → se edita copy sin deploy; `config` jsonb queda para flags de comportamiento.
- **Series recomendadas de arranque:**
  - _Bienvenida_ (`signup`): D0 código −20% (ya existe) · D3 historia de la marca / cómo elegir tu comba · D6 urgencia ("la promo de lanzamiento termina el 1-ago" — la urgencia sale del `ends_at` de la promo activa, no de un código personal).
  - _Post-compra_ (`order_placed`): D1 gracias + cuidados de la comba (beaded) · D10 petición de reseña · D21 cross-sell (repuestos, segunda comba).
  - _Winback_ (`winback`, 90 d sin comprar): cupón de vuelta con promo dedicada en `/admin/promotions`.
- El runner es el **mismo cron de Fase 2** (enrollments con `next_run_at`); los pasos se leen de `automation_steps` en vez del jsonb.

### 16.5 Contenido: editor de bloques + productos

- **Plantilla maestra** React Email (logo, estética dark/orange del sitio, footer legal + baja) común a campañas y pasos de secuencia.
- El cuerpo deja de ser HTML crudo: `body_blocks` jsonb con un set cerrado — `text` (markdown), `button` (label + url), `image`, `products` (**handles de Shopify → tarjetas con foto/título/precio/link** vía Storefront API, que ya está en la app), `html` como escape hatch.
- **Preview** renderizada server-side (iframe) + envío de prueba.
- **Promo enlazada** (`promotion_id`): el botón apunta a `/?code=X` (auto-aplicación ya montada, §8) → el descuento llega aplicado y la atribución sale por `orders.discount_code`. Aquí es donde promociones y campañas se encuentran: la promo crea el descuento, la campaña se lo cuenta a la lista.
- **UTM automático** en todos los links: `utm_source=crm&utm_medium=email&utm_campaign={slug}`.

### 16.6 Métricas y atribución

- Detalle de campaña con tabs **Contenido | Destinatarios | Métricas**: enviados, entregados, aperturas/clics únicos (los webhooks de Resend ya escriben `opened_at`/`clicked_at`), rebotes, bajas e **ingresos**.
- **Ingresos por campaña** (`orders.campaign_id`, lo fija el webhook): (a) pedido con el código de la promo enlazada, o (b) pedido ≤ 5 días después de un clic del contacto en la campaña — heurística last-click, se documenta como tal.
- Por paso de secuencia: open/clic/ingresos vía `automation_step_id` (¿funciona mejor la reseña en D10 o D14?).
- **Higiene de lista:** segmento automático "dormidos 180 d" → intento de winback y, si no reaccionan, dejar de enviarles (deliverability, §11).

### 16.7 Extras acotados

- **Import CSV** en `/admin/contacts` (`source='import'`; solo listas con consentimiento previo documentado, §11 — el import pide declarar el origen y lo guarda en `consent_text`).
- **A/B de asunto:** pospuesto — con lista pequeña no hay significancia estadística; el motor (`campaign_recipients` + lotes) lo permite añadir después sin migraciones.
- **Centro de preferencias:** descartado por ahora; con una sola lista basta la baja en 1 clic.

### 16.8 Orden de construcción (sub-fases de la Fase 3, §14)

| Sub-fase                  | Qué                                                                                         | Depende de                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3a Motor de envío         | `campaign_recipients` + RPC claim + cron por lotes + programar/prueba/pausar + duplicar     | — (puede empezar ya; comparte runner con Fase 2)                   |
| 3b Segmentos              | campos derivados + tags + backfill pedidos + compilador de facetas + `segments` + chips     | Fase 2 (webhooks) para lead/cliente en vivo; el backfill lo mitiga |
| 3c Secuencias             | `automation_steps` + editor + triggers + salidas por compra + series bienvenida/post-compra | cron de Fase 2 (runner de enrollments)                             |
| 3d Contenido y atribución | bloques + product picker + plantilla maestra + preview + UTM + ingresos por campaña         | 3a                                                                 |

**RLS:** las tablas nuevas (`segments`, `campaign_recipients`, `automation_steps`) llevan la misma única policy `is_admin()`; el motor de envío usa la service role key (server-only), como el resto del backend.

---

_Documento vivo — actualizar a medida que se cierren las decisiones pendientes (§2) y avancen las fases (§14)._
