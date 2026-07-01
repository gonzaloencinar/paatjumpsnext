# Plan: Campaña de lanzamiento + CRM/Email marketing propio

> Estado: **documentación / spec**. No implementado todavía.
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
9. [Envío de email (ESP + dominio)](#9-envío-de-email-esp--dominio)
10. [Cron / scheduler](#10-cron--scheduler)
11. [RGPD, legal y deliverability](#11-rgpd-legal-y-deliverability)
12. [Métricas](#12-métricas)
13. [Variables de entorno](#13-variables-de-entorno)
14. [Fases de implementación](#14-fases-de-implementación)
15. [Riesgos y notas](#15-riesgos-y-notas)

---

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Vía | **DIY**: CRM propio dentro de esta app Next.js, no Klaviyo/Mailchimp |
| Base de datos | **Supabase** (ya disponible vía MCP) |
| Auth admin | **Supabase Auth** (login con Google Workspace del dueño) |
| Captación (lanzamiento) | **Barra sticky superior** (announcement bar) |
| Descuento | **Código único por suscriptor**, 20% en todos los productos, gestionado en Shopify |
| Checkout | Sigue siendo el **hosted checkout de Shopify** (`cart.checkoutUrl`); el storefront no cambia su flujo |
| Alcance futuro | Recuperación de carrito, campañas (blasts), segmentos, métricas de aperturas/clics/ingresos |

## 2. Decisiones pendientes

- **Transporte de email (ESP)** — ⚠️ **importante**: NO enviar marketing por Gmail/Workspace SMTP (límite ~2.000/día, sin gestión de bajas/rebotes, reputación de dominio en riesgo). Se envía **desde `hola@paatjumps.com`** (dominio Workspace) pero el *transporte* va por un ESP con API autenticando el dominio por DNS.
  - **Opción recomendada: Amazon SES** — ~0,10 $/1.000 emails, control total, encaja con "CRM propio". Requiere verificar dominio + salir del sandbox.
  - **Alternativa: Resend** — mejor DX (SDK + React Email), gratis hasta 3k/mes, rápido de arrancar.
  - **Alternativa: Postmark** — la mejor deliverability transaccional (algo más caro).
  - 👉 *Recomendación para arrancar rápido la Fase 1: **Resend**; migrar a **SES** cuando el volumen o el coste lo justifiquen. La capa de envío se abstrae (`lib/email/provider.ts`) para poder cambiar sin tocar el resto.*
- **Doble opt-in** sí/no (recomendado sí para calidad de lista; ver §11).
- **Códigos**: 1 discount con N *redeem codes* únicos vs. 1 discount por contacto (ver §8).
- **Scheduler**: Vercel Cron (Pro permite sub-horario) vs. Supabase pg_cron / Upstash QStash (ver §10).

## 3. Arquitectura general

```
                          ┌─────────────────────────────────────────┐
                          │            App Next.js (Vercel)          │
                          │                                          │
  Visitante ── sticky ───►│  /api/subscribe ──► crea contacto        │
     bar (email)          │        │           genera código único   │──► Shopify Admin API
                          │        └────────────► envía bienvenida ──┼──► ESP (SES/Resend) ─► inbox
                          │                                          │
  Shopify ── webhooks ───►│  /api/webhooks/shopify/*                 │
  (checkouts, orders)     │        └──► escribe en Supabase          │
                          │                                          │
  Vercel Cron ──────────► │  /api/cron/automations ──► procesa       │──► ESP (recuperación,
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

**Principio clave:** Supabase es la fuente de verdad del CRM. Shopify solo aporta el **descuento** y el **checkout**, y nos **notifica** (webhooks) de checkouts abandonados y pedidos. El ESP solo **transporta** email.

## 4. Stack técnico

- **Next.js** (App Router, ya en uso) — route handlers para API, webhooks y cron; middleware para proteger `/admin`.
- **Supabase** — Postgres (datos CRM) + Auth (login admin) + opcionalmente Edge Functions / pg_cron.
- **Shopify Admin API** (GraphQL, `2025-01` o versión estable vigente) — generar códigos, leer pedidos/checkouts, registrar webhooks. Sobre el **mismo custom app** que ya emite el Storefront token, ampliando scopes.
- **ESP** (SES/Resend) — envío transaccional y de campañas, con dominio autenticado.
- **Vercel Cron** (o alternativa) — disparador de automatizaciones.

## 5. Modelo de datos (Supabase)

> DDL de referencia (a refinar en implementación). Todas las tablas con RLS activada; el acceso de servidor usa la **service role key** (server-only), el admin lee vía políticas basadas en su usuario autenticado.

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

## 6. Estructura de la app

```
app/
  (rutas públicas existentes...)
  api/
    subscribe/route.ts               # alta desde la sticky bar
    webhooks/shopify/
      checkouts/route.ts             # checkouts/create, checkouts/update
      orders/route.ts                # orders/create (o orders/paid)
    cron/
      automations/route.ts           # procesa inscripciones due (cart recovery, welcome)
    e/
      open/route.ts                  # pixel 1x1 de apertura
      click/route.ts                 # redirect con tracking de clic (firmado)
    unsubscribe/route.ts             # baja en 1 clic (List-Unsubscribe)
  admin/                             # CRM, protegido por middleware
    layout.tsx
    page.tsx                         # dashboard / métricas
    contacts/…
    campaigns/…
    automations/…
components/
  marketing/announcement-bar.tsx     # barra sticky (Fase 1)
lib/
  crm/                               # queries Supabase, segmentación
  email/
    provider.ts                      # abstracción ESP (send, verifyDomain…)
    templates/                       # bienvenida, recuperación, recordatorio
    tracking.ts                      # firma/inyección de pixel y links
  shopify/
    admin.ts                         # cliente Admin API (códigos, webhooks, pedidos)
  supabase/
    server.ts                        # cliente service-role (server only)
middleware.ts                        # protege /admin con Supabase Auth
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
   - envía email de **bienvenida** con el código + **botón "Comprar con -20%"** (discount link, §8) + "caduca en X días".
   - (si doble opt-in: primero email de confirmación; el código se entrega tras confirmar).
4. Respuesta al front: estado "revisa tu correo" (+ opcional paso 2 pidiendo nombre).

### 7.2 Recuperación de carrito — Fase 2
Dos capas:
- **Capa A (todos):** Shopify emite `checkouts/create`/`checkouts/update` cuando el cliente llega al checkout y mete su email → guardamos/actualizamos `checkouts` (con `recovery_url`) y creamos `automation_enrollments` para `cart_recovery`.
- **Capa B (suscriptores conocidos, opcional):** como el carrito vive en la app (Storefront API), atar `cart_token` ↔ `contact_id` para recuperar **antes** del checkout.

Disparo (cron, §10) sobre `automation_enrollments` de `cart_recovery` con `next_run_at <= now()` y `status='active'`:
- paso 0 → email a las ~1h; paso 1 → recordatorio a las ~24h; etc. (configurable en `automations.config`).
- **Supresión de conversión:** el webhook `orders/create` marca el `checkout` como `converted` y cancela la inscripción → **no** se envía a quien ya compró. (imprescindible).

### 7.3 Campañas / blasts — Fase 3
- Editor en `/admin/campaigns`: asunto, cuerpo (HTML/plantilla), **segmento** (jsonb → query sobre `contacts`/`events`).
- Enviar/programar → encola en `email_sends`, el cron procesa por lotes respetando **rate limit del ESP** y **quiet hours**.
- Toda dirección se cruza contra `suppressions` antes de enviar.

### 7.4 Métricas — Fase 3
Ver §12.

## 8. Shopify: descuento, webhooks y scopes

**Descuento (config en Shopify Admin o vía API):**
- Tipo **código** (no automático), **20%**, **todos los productos**, **1 uso por cliente**, **fecha de caducidad**, sin importe mínimo (o bajo).

**Generación de códigos únicos — dos enfoques:**
- **Recomendado:** 1 `DiscountCodeBasic` "LANZAMIENTO" (20%, once-per-customer, expira) + **N redeem codes únicos** con `discountRedeemCodeBulkAdd`. Eficiente y todos comparten la misma regla.
- **Alternativa:** un `discountCodeBasicCreate` por contacto (un objeto discount por código) — más simple de razonar por-contacto pero crea muchos objetos.

**Pre-aplicar el descuento (mejor conversión):** en el email, el botón apunta a un *discount link*:
`https://{tienda}.myshopify.com/discount/{CODIGO}?redirect=/`
Deja el código en cookie y se auto-aplica en el checkout. (Alternativa avanzada: `cartDiscountCodesUpdate` del Storefront API para reflejarlo ya en el carrito headless.)

**Webhooks a registrar** (Admin API):
| Webhook | Uso |
|---|---|
| `checkouts/create`, `checkouts/update` | Detectar checkouts abandonados + `recovery_url` |
| `orders/create` (o `orders/paid`) | Conversión (suprimir recuperación) + atribución de ingresos |
| `customers/redact`, `shop/redact`, `customers/data_request` | Cumplimiento RGPD (buena higiene) |

- **Verificación HMAC** obligatoria en cada webhook (`X-Shopify-Hmac-Sha256` con el secret del app). Responder 200 rápido; procesar async si hace falta.

**Scopes a añadir al custom app existente** (el mismo que emite el Storefront token):
- `write_discounts`, `read_discounts`
- `read_orders`
- `read_checkouts`
- Acceso a **datos protegidos de cliente** (email/nombre) — habilitar en la config del custom app.
- Genera un **Admin API access token** (además del Storefront token que ya hay).

## 9. Envío de email (ESP + dominio)

- **Remitente:** `Paat Jumps <hola@paatjumps.com>` (dominio Workspace) pero **transporte por ESP** (SES/Resend). Ver §2.
- **Autenticación DNS del dominio** (obligatorio, reglas Gmail/Yahoo 2024):
  - **SPF** (incluir el ESP), **DKIM** (claves del ESP), **DMARC** (`p=none` al inicio, subir a `quarantine` luego).
- **Abstracción `lib/email/provider.ts`**: `send({to, subject, html, headers})`, `registerWebhook…` — para cambiar de ESP sin tocar los flujos.
- **Plantillas** (`lib/email/templates/`): bienvenida, recuperación de carrito (x2-3 pasos), recordatorio de caducidad, confirmación (doble opt-in).
- **Cabeceras obligatorias:** `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- **Webhooks del ESP** (entregas/rebotes/quejas): SES→SNS, Resend→webhooks → escriben en `email_sends`/`suppressions`.

## 10. Cron / scheduler

- **Opción por defecto: Vercel Cron** (`vercel.json`) → golpea `/api/cron/automations`. Proteger con `CRON_SECRET` (header) y verificar en el handler.
  - ⚠️ **Hobby plan** limita cron a **1×/día**; recuperación de carrito necesita frecuencia sub-horaria → requiere **Vercel Pro** o alternativa.
- **Alternativas si hace falta más frecuencia/sin Pro:** **Supabase pg_cron** + Edge Function, o **Upstash QStash** (colas/schedules) apuntando al route handler.
- El job de automatizaciones debe ser **idempotente** (usa `automation_enrollments.next_run_at` + `status`) y procesar por lotes con rate limit del ESP.

## 11. RGPD, legal y deliverability

- **Consentimiento explícito**: checkbox **no premarcado** + link a política de privacidad; guardar `consent_text/at/ip` (§5).
- **Doble opt-in** recomendado: `contacts.status='pending'` → email de confirmación → `subscribed` tras clic. (El código de descuento se puede entregar tras confirmar, o en la bienvenida single opt-in si se decide así — decisión pendiente §2).
- **Baja en 1 clic** funcional (`/api/unsubscribe` + cabeceras List-Unsubscribe) → escribe en `suppressions` y `contacts.status='unsubscribed'`.
- **Lista de supresión** consultada **antes de cada envío** (bajas, hard bounces, quejas).
- **Reglas de remitentes masivos (Gmail/Yahoo 2024):** SPF+DKIM+DMARC, baja en 1 clic, tasa de quejas <0,3%.
- **Política de privacidad y aviso legal** actualizados con el tratamiento de marketing.

## 12. Métricas

- **Aperturas**: pixel 1×1 vía `/api/e/open?s={email_send_id}` (firmado) → registra `email_opened`. ⚠️ *Apple Mail Privacy Protection* infla aperturas; tratarlas como señal blanda.
- **Clics**: `/api/e/click?s={id}&u={url_firmada}` registra y hace 302. **Firmar la URL (HMAC)** para evitar *open redirect*.
- **Ingresos atribuidos**: `orders/create` → match a `contact` (por email) y a `discount_code`/`campaign` → panel de ingresos por campaña/automatización.
- **Dashboard `/admin`**: nº suscriptores, altas por fuente, tasa apertura/clic, carritos recuperados, ingresos por código de lanzamiento.

## 13. Variables de entorno

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, nunca al cliente

# Shopify Admin API (custom app existente, scopes ampliados)
SHOPIFY_ADMIN_API_TOKEN=
SHOPIFY_ADMIN_API_VERSION=2025-01
SHOPIFY_WEBHOOK_SECRET=

# ESP (elegir uno; ver §2)
RESEND_API_KEY=                      # opción Resend
# AWS_ACCESS_KEY_ID= / AWS_SECRET_ACCESS_KEY= / AWS_REGION=  # opción SES
EMAIL_FROM="Paat Jumps <hola@paatjumps.com>"

# App / seguridad
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
EMAIL_LINK_SIGNING_SECRET=           # firma de links/pixel de tracking
```

## 14. Fases de implementación

### Fase 1 — MVP captación + código de lanzamiento
**Meta:** lanzamiento funcionando end-to-end.
- [ ] Migraciones Supabase: `contacts`, `events`, `discount_codes`, `email_sends`, `suppressions`.
- [ ] `lib/supabase/server.ts`, `lib/shopify/admin.ts`, `lib/email/provider.ts` (+ ESP elegido y dominio autenticado).
- [ ] Descuento en Shopify + generación de código único (§8).
- [ ] `components/marketing/announcement-bar.tsx` (sticky, dark/orange, consentimiento, descartable).
- [ ] `POST /api/subscribe` (validación, consentimiento, código, email bienvenida).
- [ ] Plantilla de bienvenida + discount link + caducidad.
- [ ] (Opcional) doble opt-in + `/api/unsubscribe`.
- **Aceptación:** dar email en la barra → recibir email con código único → aplicarlo en checkout.

### Fase 2 — Recuperación de carrito
- [ ] Registrar webhooks `checkouts/*` y `orders/*` + verificación HMAC.
- [ ] Tablas `checkouts`, `orders`, `automations`, `automation_enrollments`.
- [ ] `automation: cart_recovery` (pasos/delays configurables).
- [ ] Cron `/api/cron/automations` + supresión por conversión.
- **Aceptación:** abandonar checkout con email → recibir recuperación a la hora; comprar antes → NO recibirla.

### Fase 3 — CRM + campañas + métricas
- [ ] Supabase Auth + `middleware.ts` protegiendo `/admin`.
- [ ] Dashboard, contactos (timeline `events`), segmentos.
- [ ] Editor de campañas + envío por lotes con rate limit + supresión.
- [ ] Tracking aperturas/clics (firmado) + atribución de ingresos.
- **Aceptación:** crear un segmento, enviar una campaña, ver aperturas/clics/ingresos en el panel.

## 15. Riesgos y notas

- **Gmail SMTP para marketing = no.** Es el error más común; usar ESP con dominio autenticado (§2, §9).
- **Vercel Cron en Hobby** solo 1×/día → recuperación de carrito necesita Pro o alternativa (§10).
- **Datos protegidos de cliente en Shopify**: hay que habilitar el acceso en el custom app para leer email/nombre en webhooks/pedidos (§8).
- **Open redirect** en tracking de clics: firmar siempre la URL destino (§12).
- **Idempotencia** en cron y webhooks (Shopify puede reintentar) → claves únicas y chequeo de estado antes de enviar.
- **Aperturas infladas** por Apple MPP → no optimizar solo por open rate.
- **Coste**: SES ~0,10 $/1.000; Resend gratis hasta 3k/mes; Supabase free tier suele bastar al inicio.

---
*Documento vivo — actualizar a medida que se cierren las decisiones pendientes (§2) y avancen las fases (§14).*
