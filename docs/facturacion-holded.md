# Facturación en Holded — tickets de venta y rectificativas

> Estado: **implementado, probado en vivo y en producción (2026-08-06)**. Backfill
> histórico ejecutado (T260001–T260022). Emisión automática + email activa en el
> cron `shopify-sync`; rectificativas automáticas por webhook `refunds/create`.

Integración de la contabilidad de ventas de la tienda con **Holded** (misma
cuenta donde Gonzalo emite sus facturas freelance F26xxxx): cada pedido pagado
de Shopify genera un **ticket de venta** (sales receipt, factura simplificada
B2C) con su IVA desglosado, y cada devolución de un pedido ya facturado genera
una **rectificativa** (credit note / abono).

---

## 1. Visión funcional

| Evento                                           | Documento en Holded                             | Serie                     | Email al cliente                                |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------- | ----------------------------------------------- |
| Pedido pagado (nuevo, desde 2026-08-06)          | Ticket de venta aprobado + cobro registrado     | "Línea T" (`T[YY]%%%%`)   | Sí (envío de Holded, con PDF; ES/EN según país) |
| Pedido histórico (backfill, jul-2026)            | Ticket de venta aprobado + cobro registrado     | Ídem (T260001–T260022)    | No                                              |
| Devolución (total o parcial) de pedido facturado | Rectificativa aprobada + salida de caja         | "Línea CN" (`CN[YY]%%%%`) | No                                              |
| Devolución de pedido **no** facturado aún        | Nada: el pedido queda `skipped` y no se factura | —                         | —                                               |

- Los tickets se ven en Holded en **Ventas → Tickets** (no en Facturas).
- Los cobros y devoluciones se registran en la cuenta de tesorería **"Shopify"**
  (tipo pasarela, creada por API) para no ensuciar las cuentas bancarias reales
  de cara a la conciliación (Shopify liquida a BBVA en payouts agregados netos
  de comisiones, que no casan 1:1 con los tickets).
- Contactos: se busca por email exacto en Holded y, si no existe, se crea como
  cliente persona física con la dirección de facturación del pedido.
- Qué se factura: pedidos `paid`, no test, no cancelados, sin devoluciones y
  con total > 0. Lo demás queda registrado como `skipped` con el motivo.

## 2. IVA — de dónde sale y cómo se mapea

`orders` en Supabase solo guarda `total_tax` agregado (sin desglose por línea
ni dirección fiscal completa), así que **cada pedido se relee en vivo de la
Admin API de Shopify (GraphQL)** en el momento de facturar:

- Por línea: `taxLines { ratePercentage priceSet }` + `discountAllocations`
  (descuentos de código de pedido asignados a la línea) + `originalTotalSet`.
- Envío: `shippingLine.discountedPriceSet` + sus `taxLines`.
- La tienda opera con `taxesIncluded: true` → el precio sin IVA de cada línea
  es `bruto − descuentos − IVA de la línea`, exactamente los importes que
  Shopify cobró (no se recalcula nada, no hay drift de redondeo).

Mapeo tipo → tax key de Holded (`lib/holded/receipts.ts` → `taxKeyFor`):

| IVA aplicado por Shopify                                                 | Tax key Holded                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 21 / 10 / 7,5 / 5 / 4 / 2 %                                              | `s_iva_21` / `s_iva_10` / `s_iva_75` / `s_iva_5` / `s_iva_4` / `s_iva_2` |
| 0 % con destino Canarias/Ceuta/Melilla (CP 35/38/51/52) o fuera de la UE | `s_iva_export` (exportación)                                             |
| 0 % resto                                                                | `s_iva_0`                                                                |
| Tipo desconocido o línea con varios tipos                                | **error** (revisión manual; mejor fallar que contabilizar mal)           |

**Verificación de totales**: el documento se crea en **borrador**, se relee de
Holded y se comparan `total` y `tax` con lo cobrado en Shopify (tolerancia
±0,02 €). Solo si cuadra se aprueba (lo que asigna número de serie); si no, el
borrador se **elimina** y el pedido queda en `error`. Verificado en vivo:
Holded redondea por línea igual que Shopify, los 22 históricos cuadraron
céntimo a céntimo (769,94 € / 133,54 € IVA).

## 3. Rectificativas (devoluciones)

Disparador principal: webhook **`refunds/create`** de Shopify (tiempo real).
Respaldo: reconciliación en cada tick del cron `shopify-sync` (por si el
webhook se pierde), que busca pedidos facturados con `total_refunded > 0`
cuyas rectificativas creadas no cubren aún lo devuelto.

Ambos caminos convergen en `issueCreditNotesForOrder(orderId)`
(`lib/holded/credit-notes.ts`):

1. Solo actúa si el pedido tiene ticket emitido (`order_invoices.status =
'created'`); si no, no hay nada que rectificar.
2. Relee **todos** los refunds del pedido de la Admin API (`refundLineItems`
   con `subtotalSet`/`totalTaxSet`, `refundShippingLines`, `totalRefundedSet`)
   y emite un abono por cada refund que falte — idempotente por `refund_id`,
   soporta varias devoluciones parciales del mismo pedido.
3. Importes: Shopify no documenta de forma estable si `subtotalSet` incluye el
   IVA en tiendas `taxesIncluded`, así que se prueban ambas interpretaciones y
   se usa la que cuadre con `totalRefundedSet`. Red final: si nada cuadra
   (ajustes manuales del refund) y el pedido tiene un único tipo de IVA, se
   emite el abono como línea única por el importe devuelto. Si tampoco es
   posible → `error` para revisión manual.
4. Mismo ciclo seguro que los tickets: borrador → verificación ±0,02 € →
   aprobar → registrar la salida de dinero en la tesorería "Shopify" con fecha
   del refund. La descripción referencia el ticket original ("Rectificativa
   del ticket T26xxxx — devolución pedido Shopify #1xxx") y las notas llevan
   `shopify_order_id` y `shopify_refund_id`.

No se envía email de la rectificativa (Shopify ya notifica el reembolso al
cliente); activarlo sería añadir la llamada `/credit-notes/{id}/send` análoga
a la de los tickets.

## 4. Arquitectura técnica

```
Shopify ──webhook refunds/create──► /api/webhooks/shopify ─► issueCreditNotesForOrder
   │                                                              ▲
   └──Admin GraphQL (relectura en vivo: taxLines, refunds…)       │ respaldo
                                                                  │
Vercel Cron */10 ─► /api/cron/shopify-sync ─► syncShopifyOrders/Customers
                                            ├─► invoiceNewOrders()          (tickets + email)
                                            └─► reconcileRefundCreditNotes() (abonos)

Backfill histórico (manual): GET /api/admin/holded-backfill?dry=1|limit=N
                             (Bearer CRON_SECRET; dry = vista previa sin tocar Holded)
```

Ficheros:

| Fichero                                  | Qué hace                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/holded/client.ts`                   | Cliente API v2 de Holded (`https://api.holded.com/api/v2`, `Authorization: Bearer HOLDED_API_KEY`, 100 req/min). Respuestas numéricas en formato español ("29,82") → `parseEsNumber`                    |
| `lib/holded/receipts.ts`                 | Relectura del pedido en Shopify, mapeo fiscal, contacto, tesorería, ciclo borrador→verificar→aprobar→cobrar→email; `invoiceNewOrders()` (cron), `backfillOldOrders()` / `previewOldOrders()` (backfill) |
| `lib/holded/credit-notes.ts`             | Ídem para rectificativas: `issueCreditNotesForOrder()`, `reconcileRefundCreditNotes()`                                                                                                                  |
| `app/api/admin/holded-backfill/route.ts` | Endpoint del backfill histórico                                                                                                                                                                         |
| `app/api/cron/shopify-sync/route.ts`     | Cron: sync + tickets nuevos + reconciliación de abonos                                                                                                                                                  |
| `app/api/webhooks/shopify/route.ts`      | Dispatcher de topics; `refunds/create` → abono                                                                                                                                                          |
| `shopify.app.toml`                       | Declaración del webhook (deploy con `shopify app deploy --allow-updates --no-build`)                                                                                                                    |

### Estado en Supabase (idempotencia)

- **`order_invoices`** — una fila por pedido: `order_id` (PK), `holded_id`,
  `document_number`, `status` (`pending`→`created` | `skipped` | `error`),
  `error`, `total`, `tax`, `emailed_at`, `attempts` (máx. 3 reintentos).
- **`order_credit_notes`** — una fila por refund: `refund_id` (PK, id legacy
  del refund de Shopify), `order_id`, mismo ciclo de estados.

La fila se reclama (`pending`) **antes** de tocar Holded: webhook, cron y
backfill pueden solaparse sin duplicar documentos. Ambas tablas con RLS
`is_admin()`; los flujos de servidor escriben con el cliente service-role.

### Separación backfill / automático

`HOLDED_AUTO_SINCE = "2026-08-06"` (`lib/holded/receipts.ts`): el cron solo
factura pedidos con `processed_at >=` esa fecha (con email); los anteriores
son del backfill (sin email). Así un redeploy nunca puede reenviar emails de
pedidos viejos.

## 5. Env vars

| Variable                 | Dónde                      | Uso                                      |
| ------------------------ | -------------------------- | ---------------------------------------- |
| `HOLDED_API_KEY`         | Vercel prod + `.env.local` | API v2 de Holded                         |
| `SHOPIFY_ADMIN_*`        | ya existían                | relectura de pedidos/refunds             |
| `CRON_SECRET`            | ya existía                 | auth del cron y del endpoint de backfill |
| `SHOPIFY_WEBHOOK_SECRET` | ya existía                 | HMAC del webhook `refunds/create`        |

## 6. Operativa y resolución de problemas

- **Ver errores**: `select * from order_invoices where status in
('error','skipped')` (ídem `order_credit_notes`). `error` guarda el motivo;
  tras 3 intentos fallidos se deja de reintentar.
- **Reintentar un error**: corregir la causa y poner `status='pending',
attempts=0` en la fila; el siguiente tick del cron (o el backfill si es
  histórico) lo recoge.
- **Re-ejecutar el backfill** (p. ej. tras añadir pedidos antiguos):
  `curl -H "Authorization: Bearer $CRON_SECRET"
"https://www.paatjumps.com/api/admin/holded-backfill?dry=1"` para previsualizar
  y sin `dry` para emitir.
- **Un pedido facturado y luego devuelto** genera rectificativa, no se borra
  el ticket. Un pedido devuelto **antes** de facturar queda `skipped` para
  siempre (decisión: no facturar ventas ya anuladas).
- **Documento a medias** (fila con `holded_id` pero sin `created`): el flujo
  no reintenta para no duplicar — revisar ese id en Holded a mano.

## 7. Limitaciones conocidas

- Rectificativa **sin email** al cliente (ver §3).
- Un refund con líneas a **varios tipos de IVA** cuyo desglose no cuadre con
  `totalRefundedSet` cae a `error` manual (imposible hoy: catálogo 100 % al
  21 %).
- No hay UI en /admin para esta tabla; la operativa es por SQL/Holded. (Idea
  futura: columna "Ticket" en /admin/orders enlazando al PDF.)
- Cambios de importes en Shopify posteriores a la facturación que **no** sean
  refunds (ediciones de pedido) no se detectan.
