import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convenciones de la migración desde Supabase (Postgres):
// - timestamptz -> ms epoch (v.number()); date -> "YYYY-MM-DD"; period/month -> "YYYY-MM"
// - ids uuid legacy -> legacyId (solo para trazabilidad del volcado); las referencias
//   entre tablas usan v.id(...) remapeado durante el import
// - ids bigint de Shopify (orders, customers, checkouts) -> campo *Id numérico propio;
//   los checkouts sintéticos pre-checkout conservan sus ids negativos

const contactStatus = v.union(
  v.literal("pending"),
  v.literal("subscribed"),
  v.literal("unsubscribed"),
  v.literal("bounced"),
  v.literal("complained"),
);

const checkoutStatus = v.union(
  v.literal("abandoned"),
  v.literal("recovered"),
  v.literal("converted"),
  v.literal("reached_checkout"),
);

const campaignStatus = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("paused"),
  v.literal("canceled"),
);

const emailSendStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
);

const recipientStatus = v.union(
  v.literal("pending"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("skipped"),
  v.literal("failed"),
);

const enrollmentStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("canceled"),
);

const automationTrigger = v.union(
  v.literal("signup"),
  v.literal("checkout_abandoned"),
  v.literal("order_placed"),
  v.literal("winback"),
  v.literal("manual"),
);

const financeType = v.union(v.literal("income"), v.literal("expense"));
const financePartner = v.union(v.literal("gonzalo"), v.literal("patri"));
const financeFrequency = v.union(
  v.literal("monthly"),
  v.literal("bimonthly"),
  v.literal("quarterly"),
  v.literal("semiannual"),
  v.literal("yearly"),
);

export default defineSchema({
  // ── CRM ────────────────────────────────────────────────────────────────
  contacts: defineTable({
    legacyId: v.optional(v.string()),
    email: v.string(), // siempre lowercase
    firstName: v.optional(v.string()),
    status: contactStatus,
    source: v.optional(v.string()),
    consent: v.boolean(),
    consentText: v.optional(v.string()),
    consentAt: v.optional(v.number()),
    consentIp: v.optional(v.string()),
    shopifyCustomerId: v.optional(v.string()),
    ordersCount: v.number(),
    totalSpent: v.number(),
    lastOrderAt: v.optional(v.number()),
    lastOpenAt: v.optional(v.number()),
    lastClickAt: v.optional(v.number()),
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_legacy_id", ["legacyId"]),

  events: defineTable({
    contactId: v.optional(v.id("contacts")),
    type: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_contact_and_created_at", ["contactId", "createdAt"])
    .index("by_type_and_created_at", ["type", "createdAt"]),

  checkouts: defineTable({
    checkoutId: v.number(), // id bigint legacy; negativo = checkout sintético pre-checkout
    token: v.optional(v.string()),
    cartToken: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    email: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalPrice: v.optional(v.number()),
    lineItems: v.optional(v.any()),
    recoveryUrl: v.optional(v.string()),
    buyerAcceptsMarketing: v.optional(v.boolean()),
    status: checkoutStatus,
    origin: v.union(v.literal("shopify"), v.literal("storefront")),
    abandonedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    recoverySentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_checkout_id", ["checkoutId"])
    .index("by_token", ["token"])
    .index("by_cart_token", ["cartToken"])
    .index("by_contact", ["contactId"])
    .index("by_status_and_abandoned_at", ["status", "abandonedAt"]),

  campaigns: defineTable({
    legacyId: v.optional(v.string()),
    name: v.string(),
    subject: v.optional(v.string()),
    preheader: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    segment: v.optional(v.any()),
    status: campaignStatus,
    scheduledAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_legacy_id", ["legacyId"]),

  campaign_recipients: defineTable({
    campaignId: v.id("campaigns"),
    contactId: v.id("contacts"),
    email: v.string(),
    firstName: v.optional(v.string()),
    status: recipientStatus,
    claimedAt: v.optional(v.number()),
    emailSendId: v.optional(v.id("email_sends")),
    createdAt: v.number(),
  })
    .index("by_campaign_and_status", ["campaignId", "status"])
    .index("by_campaign_and_contact", ["campaignId", "contactId"]),

  discount_codes: defineTable({
    legacyId: v.optional(v.string()),
    code: v.string(),
    contactId: v.optional(v.id("contacts")), // undefined = disponible en el pool
    shopifyDiscountId: v.optional(v.string()),
    percentage: v.number(),
    expiresAt: v.optional(v.number()),
    redeemed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_contact_and_created_at", ["contactId", "createdAt"]),

  automations: defineTable({
    legacyId: v.optional(v.string()),
    key: v.string(),
    name: v.string(),
    enabled: v.boolean(),
    trigger: automationTrigger,
    config: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_legacy_id", ["legacyId"]),

  automation_steps: defineTable({
    legacyId: v.optional(v.string()),
    automationId: v.id("automations"),
    position: v.number(),
    delayMinutes: v.number(),
    subject: v.optional(v.string()),
    preheader: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_automation_and_position", ["automationId", "position"])
    .index("by_legacy_id", ["legacyId"]),

  automation_enrollments: defineTable({
    automationId: v.id("automations"),
    contactId: v.id("contacts"),
    checkoutId: v.optional(v.id("checkouts")),
    step: v.number(),
    status: enrollmentStatus,
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status_and_next_run_at", ["status", "nextRunAt"])
    .index("by_contact", ["contactId"])
    .index("by_checkout", ["checkoutId"])
    .index("by_automation_and_contact", ["automationId", "contactId"]),

  email_sends: defineTable({
    legacyId: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    campaignId: v.optional(v.id("campaigns")),
    automationId: v.optional(v.id("automations")),
    automationStepId: v.optional(v.id("automation_steps")),
    checkoutId: v.optional(v.id("checkouts")),
    template: v.optional(v.string()),
    subject: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    status: emailSendStatus,
    sentAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_contact_and_created_at", ["contactId", "createdAt"])
    .index("by_campaign", ["campaignId"])
    .index("by_automation", ["automationId"])
    .index("by_provider_message_id", ["providerMessageId"])
    .index("by_checkout", ["checkoutId"])
    .index("by_legacy_id", ["legacyId"]),

  suppressions: defineTable({
    email: v.string(),
    reason: v.union(
      v.literal("unsubscribe"),
      v.literal("hard_bounce"),
      v.literal("complaint"),
      v.literal("manual"),
    ),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  admin_users: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  promotions: defineTable({
    legacyId: v.optional(v.string()),
    type: v.union(v.literal("general"), v.literal("affiliate")),
    name: v.string(),
    code: v.string(), // siempre uppercase
    percentage: v.number(),
    affiliateName: v.optional(v.string()),
    affiliateCommissionPct: v.optional(v.number()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    active: v.boolean(),
    announce: v.boolean(),
    shopifyDiscountId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_type_and_active_and_announce", ["type", "active", "announce"]),

  // ── Tienda (sync Shopify) ──────────────────────────────────────────────
  orders: defineTable({
    orderId: v.number(), // id de Shopify
    contactId: v.optional(v.id("contacts")),
    email: v.optional(v.string()),
    checkoutToken: v.optional(v.string()),
    cartToken: v.optional(v.string()),
    name: v.optional(v.string()),
    orderNumber: v.optional(v.number()),
    customerId: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    financialStatus: v.optional(v.string()),
    fulfillmentStatus: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    test: v.boolean(),
    currency: v.optional(v.string()),
    totalPrice: v.optional(v.number()),
    subtotalPrice: v.optional(v.number()),
    totalTax: v.optional(v.number()),
    totalDiscounts: v.optional(v.number()),
    totalShipping: v.optional(v.number()),
    totalRefunded: v.number(),
    upsellRevenue: v.number(),
    discountCode: v.optional(v.string()),
    campaignId: v.optional(v.id("campaigns")),
    lineItems: v.optional(v.any()),
    shippingCountry: v.optional(v.string()),
    shippingCountryCode: v.optional(v.string()),
    shippingProvince: v.optional(v.string()),
    shippingCity: v.optional(v.string()),
    shippingZip: v.optional(v.string()),
    shippingLineTitle: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    utmTerm: v.optional(v.string()),
    utmContent: v.optional(v.string()),
    landingPage: v.optional(v.string()),
    referrer: v.optional(v.string()),
    firstUtmSource: v.optional(v.string()),
    firstUtmMedium: v.optional(v.string()),
    firstUtmCampaign: v.optional(v.string()),
    firstLandingPage: v.optional(v.string()),
    firstReferrer: v.optional(v.string()),
    gclid: v.optional(v.string()),
    fbclid: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    shopifyLandingSite: v.optional(v.string()),
    shopifyReferringSite: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_order_id", ["orderId"])
    .index("by_email", ["email"])
    .index("by_customer_id", ["customerId"])
    .index("by_created_at", ["createdAt"])
    .index("by_campaign", ["campaignId"])
    .index("by_contact", ["contactId"])
    .index("by_checkout_token", ["checkoutToken"])
    .index("by_cart_token", ["cartToken"])
    .index("by_name", ["name"])
    // Atribución de ventas por código promocional (/admin/promotions)
    .index("by_discount_code", ["discountCode"]),

  customers: defineTable({
    customerId: v.number(), // id de Shopify
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    provinceCode: v.optional(v.string()),
    country: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    zip: v.optional(v.string()),
    ordersCount: v.number(),
    totalSpent: v.number(),
    currency: v.optional(v.string()),
    acceptsEmailMarketing: v.optional(v.boolean()),
    verifiedEmail: v.optional(v.boolean()),
    tags: v.array(v.string()),
    note: v.optional(v.string()),
    shopifyCreatedAt: v.optional(v.number()),
    shopifyUpdatedAt: v.optional(v.number()),
    syncedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_customer_id", ["customerId"])
    .index("by_email", ["email"])
    .index("by_total_spent", ["totalSpent"]),

  sync_state: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ── Envíos (Packlink / Genei) ──────────────────────────────────────────
  packlink_shipments: defineTable({
    reference: v.string(), // PK legacy
    provider: v.union(v.literal("packlink"), v.literal("genei")),
    customReference: v.optional(v.string()),
    state: v.optional(v.string()),
    carrier: v.optional(v.string()),
    service: v.optional(v.string()),
    serviceId: v.optional(v.string()),
    cost: v.optional(v.number()),
    currency: v.optional(v.string()),
    priceBase: v.optional(v.number()),
    priceTotal: v.optional(v.number()),
    shipmentDate: v.optional(v.number()),
    collectionDate: v.optional(v.string()), // YYYY-MM-DD
    collectionTime: v.optional(v.string()),
    estimatedDeliveryDate: v.optional(v.string()), // YYYY-MM-DD
    homeToHome: v.optional(v.boolean()),
    orderId: v.optional(v.number()),
    tracking: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelStorageId: v.optional(v.id("_storage")), // PDF etiqueta Genei (antes raw.etiqueta base64)
    fulfillmentSyncedAt: v.optional(v.number()),
    raw: v.any(),
    syncedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_order_id", ["orderId"])
    .index("by_collection_date", ["collectionDate"])
    .index("by_custom_reference", ["customReference"]),

  order_dni_requests: defineTable({
    orderId: v.number(),
    orderName: v.optional(v.string()),
    email: v.string(),
    locale: v.union(v.literal("es"), v.literal("en")),
    dni: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    firstSentAt: v.optional(v.number()),
    reminderSentAt: v.optional(v.number()),
    alertedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_order_id", ["orderId"]),

  // ── Facturación (Holded) ───────────────────────────────────────────────
  order_invoices: defineTable({
    orderId: v.number(),
    orderName: v.optional(v.string()),
    holdedId: v.optional(v.string()),
    documentNumber: v.optional(v.string()),
    status: v.string(),
    error: v.optional(v.string()),
    total: v.optional(v.number()),
    tax: v.optional(v.number()),
    emailedAt: v.optional(v.number()),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order_id", ["orderId"])
    .index("by_status", ["status"]),

  order_credit_notes: defineTable({
    refundId: v.string(),
    orderId: v.number(),
    holdedId: v.optional(v.string()),
    documentNumber: v.optional(v.string()),
    status: v.string(),
    error: v.optional(v.string()),
    total: v.optional(v.number()),
    tax: v.optional(v.number()),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_refund_id", ["refundId"])
    .index("by_order_id", ["orderId"]),

  // ── Finanzas socios ────────────────────────────────────────────────────
  finance_recurring: defineTable({
    legacyId: v.optional(v.string()),
    type: financeType,
    concept: v.string(),
    amount: v.number(),
    partner: financePartner,
    frequency: financeFrequency,
    dayOfMonth: v.number(),
    startsOn: v.string(), // YYYY-MM-DD
    endsOn: v.optional(v.string()),
    active: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_legacy_id", ["legacyId"]),

  finance_entries: defineTable({
    legacyId: v.optional(v.string()),
    type: financeType,
    concept: v.string(),
    amount: v.number(),
    partner: financePartner,
    entryDate: v.string(), // YYYY-MM-DD
    notes: v.optional(v.string()),
    recurringId: v.optional(v.id("finance_recurring")),
    period: v.optional(v.string()), // YYYY-MM
    deletedAt: v.optional(v.number()), // tombstone
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entry_date", ["entryDate"])
    .index("by_recurring_and_period", ["recurringId", "period"]),

  finance_settings: defineTable({
    irpfPct: v.number(),
    updatedAt: v.number(),
  }),

  finance_month_irpf: defineTable({
    month: v.string(), // YYYY-MM
    irpfPct: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_month", ["month"]),

  // ── Blog CMS ───────────────────────────────────────────────────────────
  blog_posts: defineTable({
    legacyId: v.optional(v.string()),
    slug: v.string(),
    title: v.string(),
    excerpt: v.optional(v.string()),
    contentMd: v.string(),
    coverImageUrl: v.optional(v.string()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    keywords: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    author: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_published_at", ["status", "publishedAt"]),

  // ── Acortador /l/<slug> ────────────────────────────────────────────────
  short_links: defineTable({
    legacyId: v.optional(v.string()),
    slug: v.string(),
    aliases: v.array(v.string()),
    destination: v.string(),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    utmTerm: v.optional(v.string()),
    utmContent: v.optional(v.string()),
    notes: v.optional(v.string()),
    clicks: v.number(),
    lastClickedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),
});
