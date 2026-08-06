// Formas "legacy" de las filas (snake_case, timestamps ISO, null en vez de
// undefined) que los componentes del admin siguen consumiendo: los page.tsx
// y libs adaptan los docs de Convex (camelCase, ms epoch) a esta forma.
// Copiadas 1:1 de los Row de lib/supabase/types.ts al retirar Supabase.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Rows = {
  contacts: {
    consent: boolean;
    consent_at: string | null;
    consent_ip: string | null;
    consent_text: string | null;
    created_at: string;
    email: string;
    first_name: string | null;
    id: string;
    last_click_at: string | null;
    last_open_at: string | null;
    last_order_at: string | null;
    orders_count: number;
    shopify_customer_id: string | null;
    source: string | null;
    status: string;
    tags: string[];
    total_spent: number;
    updated_at: string;
  };
  customers: {
    accepts_email_marketing: boolean | null;
    city: string | null;
    country: string | null;
    country_code: string | null;
    created_at: string;
    currency: string | null;
    email: string | null;
    first_name: string | null;
    id: number;
    last_name: string | null;
    note: string | null;
    orders_count: number;
    phone: string | null;
    province: string | null;
    province_code: string | null;
    shopify_created_at: string | null;
    shopify_updated_at: string | null;
    synced_at: string;
    tags: string[];
    total_spent: number;
    verified_email: boolean | null;
    zip: string | null;
  };
  campaigns: {
    body_html: string | null;
    created_at: string;
    id: string;
    name: string;
    paused_at: string | null;
    preheader: string | null;
    scheduled_at: string | null;
    segment: Json | null;
    sent_at: string | null;
    status: string;
    subject: string | null;
  };
  automations: {
    config: Json | null;
    created_at: string;
    enabled: boolean;
    id: string;
    key: string;
    name: string;
    trigger: string;
  };
  automation_steps: {
    automation_id: string;
    body_html: string | null;
    created_at: string;
    delay_minutes: number;
    enabled: boolean;
    id: string;
    position: number;
    preheader: string | null;
    subject: string | null;
  };
  suppressions: {
    created_at: string;
    email: string;
    reason: string;
  };
  email_sends: {
    automation_id: string | null;
    automation_step_id: string | null;
    campaign_id: string | null;
    checkout_id: number | null;
    clicked_at: string | null;
    contact_id: string | null;
    created_at: string;
    id: string;
    opened_at: string | null;
    provider_message_id: string | null;
    sent_at: string | null;
    status: string;
    subject: string | null;
    template: string | null;
  };
  discount_codes: {
    code: string;
    contact_id: string | null;
    created_at: string;
    expires_at: string | null;
    id: string;
    percentage: number;
    redeemed: boolean;
    shopify_discount_id: string | null;
  };
  orders: {
    campaign_id: string | null;
    cancelled_at: string | null;
    cart_token: string | null;
    checkout_token: string | null;
    contact_id: string | null;
    created_at: string;
    currency: string | null;
    customer_id: number | null;
    discount_code: string | null;
    email: string | null;
    fbclid: string | null;
    financial_status: string | null;
    first_landing_page: string | null;
    first_referrer: string | null;
    first_utm_campaign: string | null;
    first_utm_medium: string | null;
    first_utm_source: string | null;
    fulfillment_status: string | null;
    gclid: string | null;
    id: number;
    landing_page: string | null;
    line_items: Json | null;
    name: string | null;
    order_number: number | null;
    processed_at: string | null;
    referrer: string | null;
    shipping_city: string | null;
    shipping_country: string | null;
    shipping_country_code: string | null;
    shipping_line_title: string | null;
    shipping_province: string | null;
    shipping_zip: string | null;
    shopify_landing_site: string | null;
    shopify_referring_site: string | null;
    source_name: string | null;
    subtotal_price: number | null;
    synced_at: string | null;
    test: boolean;
    total_discounts: number | null;
    total_price: number | null;
    total_refunded: number;
    total_shipping: number | null;
    total_tax: number | null;
    upsell_revenue: number;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_medium: string | null;
    utm_source: string | null;
    utm_term: string | null;
  };
  events: {
    contact_id: string | null;
    created_at: string;
    id: number;
    payload: Json | null;
    type: string;
  };
  blog_posts: {
    author: string;
    content_md: string;
    cover_image_url: string | null;
    created_at: string;
    excerpt: string | null;
    id: string;
    keywords: string | null;
    published_at: string | null;
    seo_description: string | null;
    seo_title: string | null;
    slug: string;
    status: string;
    title: string;
    updated_at: string;
  };
  promotions: {
    active: boolean;
    affiliate_commission_pct: number | null;
    affiliate_name: string | null;
    announce: boolean;
    code: string;
    created_at: string;
    ends_at: string | null;
    id: string;
    name: string;
    percentage: number;
    shopify_discount_id: string | null;
    starts_at: string;
    type: string;
    updated_at: string;
  };
  finance_entries: {
    amount: number;
    concept: string;
    created_at: string;
    deleted_at: string | null;
    entry_date: string;
    id: string;
    notes: string | null;
    partner: string;
    period: string | null;
    recurring_id: string | null;
    type: string;
    updated_at: string;
  };
  finance_recurring: {
    active: boolean;
    amount: number;
    concept: string;
    created_at: string;
    day_of_month: number;
    ends_on: string | null;
    frequency: string;
    id: string;
    notes: string | null;
    partner: string;
    starts_on: string;
    type: string;
    updated_at: string;
  };
};

/** Mismo contrato que el Tables<> del types.ts generado por Supabase. */
export type Tables<T extends keyof Rows> = Rows[T];
