export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string;
          email: string;
        };
        Insert: {
          created_at?: string;
          email: string;
        };
        Update: {
          created_at?: string;
          email?: string;
        };
        Relationships: [];
      };
      automation_enrollments: {
        Row: {
          automation_id: string | null;
          checkout_id: number | null;
          contact_id: string | null;
          created_at: string;
          id: string;
          next_run_at: string | null;
          status: string;
          step: number;
        };
        Insert: {
          automation_id?: string | null;
          checkout_id?: number | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          next_run_at?: string | null;
          status?: string;
          step?: number;
        };
        Update: {
          automation_id?: string | null;
          checkout_id?: number | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          next_run_at?: string | null;
          status?: string;
          step?: number;
        };
        Relationships: [
          {
            foreignKeyName: "automation_enrollments_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_enrollments_checkout_id_fkey";
            columns: ["checkout_id"];
            isOneToOne: false;
            referencedRelation: "checkouts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_enrollments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_steps: {
        Row: {
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
        Insert: {
          automation_id: string;
          body_html?: string | null;
          created_at?: string;
          delay_minutes?: number;
          enabled?: boolean;
          id?: string;
          position: number;
          preheader?: string | null;
          subject?: string | null;
        };
        Update: {
          automation_id?: string;
          body_html?: string | null;
          created_at?: string;
          delay_minutes?: number;
          enabled?: boolean;
          id?: string;
          position?: number;
          preheader?: string | null;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automation_steps_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
        ];
      };
      automations: {
        Row: {
          config: Json | null;
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          name: string;
          trigger: string;
        };
        Insert: {
          config?: Json | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          name: string;
          trigger?: string;
        };
        Update: {
          config?: Json | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          name?: string;
          trigger?: string;
        };
        Relationships: [];
      };
      blog_posts: {
        Row: {
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
        Insert: {
          author?: string;
          content_md?: string;
          cover_image_url?: string | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          keywords?: string | null;
          published_at?: string | null;
          seo_description?: string | null;
          seo_title?: string | null;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          author?: string;
          content_md?: string;
          cover_image_url?: string | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          keywords?: string | null;
          published_at?: string | null;
          seo_description?: string | null;
          seo_title?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_recipients: {
        Row: {
          campaign_id: string;
          claimed_at: string | null;
          contact_id: string;
          created_at: string;
          email: string;
          email_send_id: string | null;
          first_name: string | null;
          id: number;
          status: string;
        };
        Insert: {
          campaign_id: string;
          claimed_at?: string | null;
          contact_id: string;
          created_at?: string;
          email: string;
          email_send_id?: string | null;
          first_name?: string | null;
          id?: never;
          status?: string;
        };
        Update: {
          campaign_id?: string;
          claimed_at?: string | null;
          contact_id?: string;
          created_at?: string;
          email?: string;
          email_send_id?: string | null;
          first_name?: string | null;
          id?: never;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_email_send_id_fkey";
            columns: ["email_send_id"];
            isOneToOne: false;
            referencedRelation: "email_sends";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
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
        Insert: {
          body_html?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          paused_at?: string | null;
          preheader?: string | null;
          scheduled_at?: string | null;
          segment?: Json | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
        };
        Update: {
          body_html?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          paused_at?: string | null;
          preheader?: string | null;
          scheduled_at?: string | null;
          segment?: Json | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
        };
        Relationships: [];
      };
      checkouts: {
        Row: {
          abandoned_at: string | null;
          buyer_accepts_marketing: boolean | null;
          cart_token: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string | null;
          email: string | null;
          id: number;
          last_event_at: string | null;
          line_items: Json | null;
          origin: string;
          recovery_sent_at: string | null;
          recovery_url: string | null;
          status: string;
          token: string | null;
          total_price: number | null;
        };
        Insert: {
          abandoned_at?: string | null;
          buyer_accepts_marketing?: boolean | null;
          cart_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          email?: string | null;
          id?: number;
          last_event_at?: string | null;
          line_items?: Json | null;
          origin?: string;
          recovery_sent_at?: string | null;
          recovery_url?: string | null;
          status?: string;
          token?: string | null;
          total_price?: number | null;
        };
        Update: {
          abandoned_at?: string | null;
          buyer_accepts_marketing?: boolean | null;
          cart_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          email?: string | null;
          id?: number;
          last_event_at?: string | null;
          line_items?: Json | null;
          origin?: string;
          recovery_sent_at?: string | null;
          recovery_url?: string | null;
          status?: string;
          token?: string | null;
          total_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "checkouts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
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
        Insert: {
          consent?: boolean;
          consent_at?: string | null;
          consent_ip?: string | null;
          consent_text?: string | null;
          created_at?: string;
          email: string;
          first_name?: string | null;
          id?: string;
          last_click_at?: string | null;
          last_open_at?: string | null;
          last_order_at?: string | null;
          orders_count?: number;
          shopify_customer_id?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[];
          total_spent?: number;
          updated_at?: string;
        };
        Update: {
          consent?: boolean;
          consent_at?: string | null;
          consent_ip?: string | null;
          consent_text?: string | null;
          created_at?: string;
          email?: string;
          first_name?: string | null;
          id?: string;
          last_click_at?: string | null;
          last_open_at?: string | null;
          last_order_at?: string | null;
          orders_count?: number;
          shopify_customer_id?: string | null;
          source?: string | null;
          status?: string;
          tags?: string[];
          total_spent?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
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
        Insert: {
          accepts_email_marketing?: boolean | null;
          city?: string | null;
          country?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          email?: string | null;
          first_name?: string | null;
          id: number;
          last_name?: string | null;
          note?: string | null;
          orders_count?: number;
          phone?: string | null;
          province?: string | null;
          province_code?: string | null;
          shopify_created_at?: string | null;
          shopify_updated_at?: string | null;
          synced_at?: string;
          tags?: string[];
          total_spent?: number;
          verified_email?: boolean | null;
          zip?: string | null;
        };
        Update: {
          accepts_email_marketing?: boolean | null;
          city?: string | null;
          country?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: number;
          last_name?: string | null;
          note?: string | null;
          orders_count?: number;
          phone?: string | null;
          province?: string | null;
          province_code?: string | null;
          shopify_created_at?: string | null;
          shopify_updated_at?: string | null;
          synced_at?: string;
          tags?: string[];
          total_spent?: number;
          verified_email?: boolean | null;
          zip?: string | null;
        };
        Relationships: [];
      };
      discount_codes: {
        Row: {
          code: string;
          contact_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          percentage: number;
          redeemed: boolean;
          shopify_discount_id: string | null;
        };
        Insert: {
          code: string;
          contact_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          percentage?: number;
          redeemed?: boolean;
          shopify_discount_id?: string | null;
        };
        Update: {
          code?: string;
          contact_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          percentage?: number;
          redeemed?: boolean;
          shopify_discount_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discount_codes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sends: {
        Row: {
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
        Insert: {
          automation_id?: string | null;
          automation_step_id?: string | null;
          campaign_id?: string | null;
          checkout_id?: number | null;
          clicked_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          template?: string | null;
        };
        Update: {
          automation_id?: string | null;
          automation_step_id?: string | null;
          campaign_id?: string | null;
          checkout_id?: number | null;
          clicked_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          template?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_sends_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sends_automation_step_id_fkey";
            columns: ["automation_step_id"];
            isOneToOne: false;
            referencedRelation: "automation_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sends_checkout_id_fkey";
            columns: ["checkout_id"];
            isOneToOne: false;
            referencedRelation: "checkouts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sends_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sends_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          contact_id: string | null;
          created_at: string;
          id: number;
          payload: Json | null;
          type: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          type: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_entries: {
        Row: {
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
        Insert: {
          amount: number;
          concept: string;
          created_at?: string;
          deleted_at?: string | null;
          entry_date?: string;
          id?: string;
          notes?: string | null;
          partner: string;
          period?: string | null;
          recurring_id?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          concept?: string;
          created_at?: string;
          deleted_at?: string | null;
          entry_date?: string;
          id?: string;
          notes?: string | null;
          partner?: string;
          period?: string | null;
          recurring_id?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_entries_recurring_id_fkey";
            columns: ["recurring_id"];
            isOneToOne: false;
            referencedRelation: "finance_recurring";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_month_irpf: {
        Row: {
          created_at: string;
          irpf_pct: number;
          month: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          irpf_pct: number;
          month: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          irpf_pct?: number;
          month?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finance_recurring: {
        Row: {
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
        Insert: {
          active?: boolean;
          amount: number;
          concept: string;
          created_at?: string;
          day_of_month?: number;
          ends_on?: string | null;
          frequency?: string;
          id?: string;
          notes?: string | null;
          partner: string;
          starts_on?: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          amount?: number;
          concept?: string;
          created_at?: string;
          day_of_month?: number;
          ends_on?: string | null;
          frequency?: string;
          id?: string;
          notes?: string | null;
          partner?: string;
          starts_on?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finance_settings: {
        Row: {
          id: boolean;
          irpf_pct: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          irpf_pct?: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          irpf_pct?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_dni_requests: {
        Row: {
          alerted_at: string | null;
          created_at: string;
          dni: string | null;
          email: string;
          first_sent_at: string | null;
          locale: string;
          order_id: number;
          order_name: string | null;
          reminder_sent_at: string | null;
          submitted_at: string | null;
        };
        Insert: {
          alerted_at?: string | null;
          created_at?: string;
          dni?: string | null;
          email: string;
          first_sent_at?: string | null;
          locale?: string;
          order_id: number;
          order_name?: string | null;
          reminder_sent_at?: string | null;
          submitted_at?: string | null;
        };
        Update: {
          alerted_at?: string | null;
          created_at?: string;
          dni?: string | null;
          email?: string;
          first_sent_at?: string | null;
          locale?: string;
          order_id?: number;
          order_name?: string | null;
          reminder_sent_at?: string | null;
          submitted_at?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
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
        Insert: {
          campaign_id?: string | null;
          cancelled_at?: string | null;
          cart_token?: string | null;
          checkout_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          customer_id?: number | null;
          discount_code?: string | null;
          email?: string | null;
          fbclid?: string | null;
          financial_status?: string | null;
          first_landing_page?: string | null;
          first_referrer?: string | null;
          first_utm_campaign?: string | null;
          first_utm_medium?: string | null;
          first_utm_source?: string | null;
          fulfillment_status?: string | null;
          gclid?: string | null;
          id: number;
          landing_page?: string | null;
          line_items?: Json | null;
          name?: string | null;
          order_number?: number | null;
          processed_at?: string | null;
          referrer?: string | null;
          shipping_city?: string | null;
          shipping_country?: string | null;
          shipping_country_code?: string | null;
          shipping_line_title?: string | null;
          shipping_province?: string | null;
          shipping_zip?: string | null;
          shopify_landing_site?: string | null;
          shopify_referring_site?: string | null;
          source_name?: string | null;
          subtotal_price?: number | null;
          synced_at?: string | null;
          test?: boolean;
          total_discounts?: number | null;
          total_price?: number | null;
          total_refunded?: number;
          total_shipping?: number | null;
          total_tax?: number | null;
          upsell_revenue?: number;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Update: {
          campaign_id?: string | null;
          cancelled_at?: string | null;
          cart_token?: string | null;
          checkout_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          customer_id?: number | null;
          discount_code?: string | null;
          email?: string | null;
          fbclid?: string | null;
          financial_status?: string | null;
          first_landing_page?: string | null;
          first_referrer?: string | null;
          first_utm_campaign?: string | null;
          first_utm_medium?: string | null;
          first_utm_source?: string | null;
          fulfillment_status?: string | null;
          gclid?: string | null;
          id?: number;
          landing_page?: string | null;
          line_items?: Json | null;
          name?: string | null;
          order_number?: number | null;
          processed_at?: string | null;
          referrer?: string | null;
          shipping_city?: string | null;
          shipping_country?: string | null;
          shipping_country_code?: string | null;
          shipping_line_title?: string | null;
          shipping_province?: string | null;
          shipping_zip?: string | null;
          shopify_landing_site?: string | null;
          shopify_referring_site?: string | null;
          source_name?: string | null;
          subtotal_price?: number | null;
          synced_at?: string | null;
          test?: boolean;
          total_discounts?: number | null;
          total_price?: number | null;
          total_refunded?: number;
          total_shipping?: number | null;
          total_tax?: number | null;
          upsell_revenue?: number;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      packlink_shipments: {
        Row: {
          carrier: string | null;
          cost: number | null;
          currency: string | null;
          collection_date: string | null;
          collection_time: string | null;
          custom_reference: string | null;
          estimated_delivery_date: string | null;
          fulfillment_synced_at: string | null;
          home_to_home: boolean | null;
          label_url: string | null;
          order_id: number | null;
          price_base: number | null;
          price_total: number | null;
          provider: string;
          raw: Json;
          reference: string;
          service: string | null;
          service_id: string | null;
          shipment_date: string | null;
          state: string | null;
          synced_at: string;
          tracking: string | null;
          tracking_url: string | null;
        };
        Insert: {
          carrier?: string | null;
          cost?: number | null;
          currency?: string | null;
          collection_date?: string | null;
          collection_time?: string | null;
          custom_reference?: string | null;
          estimated_delivery_date?: string | null;
          fulfillment_synced_at?: string | null;
          home_to_home?: boolean | null;
          label_url?: string | null;
          order_id?: number | null;
          price_base?: number | null;
          price_total?: number | null;
          provider?: string;
          raw: Json;
          reference: string;
          service?: string | null;
          service_id?: string | null;
          shipment_date?: string | null;
          state?: string | null;
          synced_at?: string;
          tracking?: string | null;
          tracking_url?: string | null;
        };
        Update: {
          carrier?: string | null;
          cost?: number | null;
          currency?: string | null;
          collection_date?: string | null;
          collection_time?: string | null;
          custom_reference?: string | null;
          estimated_delivery_date?: string | null;
          fulfillment_synced_at?: string | null;
          home_to_home?: boolean | null;
          label_url?: string | null;
          order_id?: number | null;
          price_base?: number | null;
          price_total?: number | null;
          provider?: string;
          raw?: Json;
          reference?: string;
          service?: string | null;
          service_id?: string | null;
          shipment_date?: string | null;
          state?: string | null;
          synced_at?: string;
          tracking?: string | null;
          tracking_url?: string | null;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
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
        Insert: {
          active?: boolean;
          affiliate_commission_pct?: number | null;
          affiliate_name?: string | null;
          announce?: boolean;
          code: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          name: string;
          percentage?: number;
          shopify_discount_id?: string | null;
          starts_at?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          affiliate_commission_pct?: number | null;
          affiliate_name?: string | null;
          announce?: boolean;
          code?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          name?: string;
          percentage?: number;
          shopify_discount_id?: string | null;
          starts_at?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      short_links: {
        Row: {
          aliases: string[];
          clicks: number;
          created_at: string;
          destination: string;
          id: string;
          last_clicked_at: string | null;
          notes: string | null;
          slug: string;
          updated_at: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
        };
        Insert: {
          aliases?: string[];
          clicks?: number;
          created_at?: string;
          destination?: string;
          id?: string;
          last_clicked_at?: string | null;
          notes?: string | null;
          slug: string;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Update: {
          aliases?: string[];
          clicks?: number;
          created_at?: string;
          destination?: string;
          id?: string;
          last_clicked_at?: string | null;
          notes?: string | null;
          slug?: string;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Relationships: [];
      };
      suppressions: {
        Row: {
          created_at: string;
          email: string;
          reason: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          reason: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          reason?: string;
        };
        Relationships: [];
      };
      sync_state: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_discount_code: {
        Args: { p_contact_id: string };
        Returns: {
          code: string;
          expires_at: string;
        }[];
      };
      claim_campaign_batch: {
        Args: { p_campaign_id: string; p_limit: number };
        Returns: {
          campaign_id: string;
          claimed_at: string | null;
          contact_id: string;
          created_at: string;
          email: string;
          email_send_id: string | null;
          first_name: string | null;
          id: number;
          status: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "campaign_recipients";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_due_enrollments: {
        Args: { p_limit: number };
        Returns: {
          automation_id: string | null;
          checkout_id: number | null;
          contact_id: string | null;
          created_at: string;
          id: string;
          next_run_at: string | null;
          status: string;
          step: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "automation_enrollments";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      count_campaign_audience: { Args: never; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      materialize_campaign: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
      register_link_click: {
        Args: { p_slug: string };
        Returns: {
          destination: string;
          utm_campaign: string;
          utm_content: string;
          utm_medium: string;
          utm_source: string;
          utm_term: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
