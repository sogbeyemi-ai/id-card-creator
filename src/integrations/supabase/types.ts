export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      download_logs: {
        Row: {
          downloaded_at: string
          id: string
          ip_address: string | null
          staff_entry_id: string
        }
        Insert: {
          downloaded_at?: string
          id?: string
          ip_address?: string | null
          staff_entry_id: string
        }
        Update: {
          downloaded_at?: string
          id?: string
          ip_address?: string | null
          staff_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_logs_staff_entry_id_fkey"
            columns: ["staff_entry_id"]
            isOneToOne: false
            referencedRelation: "staff_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          created_at: string
          department: string | null
          email: string | null
          employment_type: string
          full_name: string
          hire_date: string | null
          id: string
          phone: string | null
          role: string | null
          status: string
          updated_at: string
          verified_staff_id: string | null
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: string
          full_name: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          verified_staff_id?: string | null
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          verified_staff_id?: string | null
        }
        Relationships: []
      }
      payroll_clients: {
        Row: {
          created_at: string
          currency: string
          default_column_mapping: Json
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_column_mapping?: Json
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_column_mapping?: Json
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_cycles: {
        Row: {
          client_id: string
          column_mapping: Json
          created_at: string
          created_by: string | null
          id: string
          period_end: string | null
          period_label: string
          period_start: string | null
          source_file_url: string | null
          status: string
          template_id: string | null
          total_generated: number
          total_rows: number
          updated_at: string
          zip_url: string | null
        }
        Insert: {
          client_id: string
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string | null
          period_label: string
          period_start?: string | null
          source_file_url?: string | null
          status?: string
          template_id?: string | null
          total_generated?: number
          total_rows?: number
          updated_at?: string
          zip_url?: string | null
        }
        Update: {
          client_id?: string
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          source_file_url?: string | null
          status?: string
          template_id?: string | null
          total_generated?: number
          total_rows?: number
          updated_at?: string
          zip_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_cycles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "payroll_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_cycles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "payroll_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          created_at: string
          employee_id: string
          gross_pay: number
          id: string
          net_pay: number
          run_id: string
          snapshot: Json
          total_allowances: number
          total_deductions: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          gross_pay?: number
          id?: string
          net_pay?: number
          run_id: string
          snapshot?: Json
          total_allowances?: number
          total_deductions?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          gross_pay?: number
          id?: string
          net_pay?: number
          run_id?: string
          snapshot?: Json
          total_allowances?: number
          total_deductions?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rows: {
        Row: {
          created_at: string
          cycle_id: string
          data: Json
          error_message: string | null
          id: string
          pdf_url: string | null
          staff_email: string | null
          staff_id_number: string | null
          staff_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          data?: Json
          error_message?: string | null
          id?: string
          pdf_url?: string | null
          staff_email?: string | null
          staff_id_number?: string | null
          staff_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          data?: Json
          error_message?: string | null
          id?: string
          pdf_url?: string | null
          staff_email?: string | null
          staff_id_number?: string | null
          staff_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rows_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "payroll_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          id: string
          period_end: string
          period_label: string
          period_start: string
          status: string
          total_gross: number
          total_net: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          period_end: string
          period_label: string
          period_start: string
          status?: string
          total_gross?: number
          total_net?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          status?: string
          total_gross?: number
          total_net?: number
        }
        Relationships: []
      }
      payroll_templates: {
        Row: {
          background_url: string
          client_id: string
          created_at: string
          field_layout: Json
          height: number
          id: string
          is_active: boolean
          name: string
          preview_url: string | null
          updated_at: string
          width: number
        }
        Insert: {
          background_url: string
          client_id: string
          created_at?: string
          field_layout?: Json
          height?: number
          id?: string
          is_active?: boolean
          name?: string
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Update: {
          background_url?: string
          client_id?: string
          created_at?: string
          field_layout?: Json
          height?: number
          id?: string
          is_active?: boolean
          name?: string
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "payroll_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      salary_structures: {
        Row: {
          base_salary: number
          created_at: string
          effective_from: string
          employee_id: string
          housing_allowance: number
          id: string
          other_allowance: number
          pension_rate: number
          tax_rate: number
          transport_allowance: number
        }
        Insert: {
          base_salary?: number
          created_at?: string
          effective_from?: string
          employee_id: string
          housing_allowance?: number
          id?: string
          other_allowance?: number
          pension_rate?: number
          tax_rate?: number
          transport_allowance?: number
        }
        Update: {
          base_salary?: number
          created_at?: string
          effective_from?: string
          employee_id?: string
          housing_allowance?: number
          id?: string
          other_allowance?: number
          pension_rate?: number
          tax_rate?: number
          transport_allowance?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_entries: {
        Row: {
          company: Database["public"]["Enums"]["company_template"]
          created_at: string
          deleted_at: string | null
          department: string
          download_count: number
          download_locked: boolean
          downloaded_at: string | null
          full_name: string
          id: string
          id_card_url: string | null
          photo_url: string
          role: string
          state: string | null
          updated_at: string
        }
        Insert: {
          company: Database["public"]["Enums"]["company_template"]
          created_at?: string
          deleted_at?: string | null
          department: string
          download_count?: number
          download_locked?: boolean
          downloaded_at?: string | null
          full_name: string
          id?: string
          id_card_url?: string | null
          photo_url: string
          role: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          company?: Database["public"]["Enums"]["company_template"]
          created_at?: string
          deleted_at?: string | null
          department?: string
          download_count?: number
          download_locked?: boolean
          downloaded_at?: string | null
          full_name?: string
          id?: string
          id_card_url?: string | null
          photo_url?: string
          role?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      verified_staff: {
        Row: {
          batch_id: string | null
          company: string | null
          created_at: string
          department: string | null
          full_name: string
          id: string
          role: string
          state: string | null
        }
        Insert: {
          batch_id?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          full_name: string
          id?: string
          role: string
          state?: string | null
        }
        Update: {
          batch_id?: string | null
          company?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          id?: string
          role?: string
          state?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      company_template: "SOTI" | "OPAY" | "Blue Ridge"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "super_admin"],
      company_template: ["SOTI", "OPAY", "Blue Ridge"],
    },
  },
} as const
