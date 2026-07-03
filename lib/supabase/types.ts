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
      automations: {
        Row: {
          config: Json | null;
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          name: string;
        };
        Insert: {
          config?: Json | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          name: string;
        };
        Update: {
          config?: Json | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          name?: string;
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
          id: number;
          last_event_at?: string | null;
          line_items?: Json | null;
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
          shopify_customer_id: string | null;
          source: string | null;
          status: string;
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
          shopify_customer_id?: string | null;
          source?: string | null;
          status?: string;
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
          shopify_customer_id?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
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
          campaign_id: string | null;
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
          campaign_id?: string | null;
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
          campaign_id?: string | null;
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
      orders: {
        Row: {
          campaign_id: string | null;
          cart_token: string | null;
          checkout_token: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string | null;
          discount_code: string | null;
          email: string | null;
          id: number;
          total_price: number | null;
        };
        Insert: {
          campaign_id?: string | null;
          cart_token?: string | null;
          checkout_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          discount_code?: string | null;
          email?: string | null;
          id: number;
          total_price?: number | null;
        };
        Update: {
          campaign_id?: string | null;
          cart_token?: string | null;
          checkout_token?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string | null;
          discount_code?: string | null;
          email?: string | null;
          id?: number;
          total_price?: number | null;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_discount_code: {
        Args: { p_contact_id: string };
        Returns: { code: string; expires_at: string | null }[];
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
      count_campaign_audience: { Args: never; Returns: number };
      is_admin: { Args: never; Returns: boolean };
      materialize_campaign: {
        Args: { p_campaign_id: string };
        Returns: number;
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
