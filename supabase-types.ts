export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      course_videos: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          order: number | null
          video_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          order?: number | null
          video_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          order?: number | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_videos_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      courses: {
        Row: {
          author_id: string | null
          course_difficulty: number
          created_at: string
          description: string | null
          detailLevel: string
          id: string
          title: string | null
        }
        Insert: {
          author_id?: string | null
          course_difficulty?: number
          created_at?: string
          description?: string | null
          detailLevel?: string
          id?: string
          title?: string | null
        }
        Update: {
          author_id?: string | null
          course_difficulty?: number
          created_at?: string
          description?: string | null
          detailLevel?: string
          id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          id: string
          quiz: Json | null
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          quiz?: Json | null
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          quiz?: Json | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      summaries: {
        Row: {
          created_at: string
          id: string
          summary_text: string | null
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          summary_text?: string | null
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          summary_text?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summaries_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      user_progress: {
        Row: {
          created_at: string
          id: string
          progress: boolean | null
          quiz_completed: boolean | null
          user_id: string | null
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          progress?: boolean | null
          quiz_completed?: boolean | null
          user_id?: string | null
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          progress?: boolean | null
          quiz_completed?: boolean | null
          user_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["video_id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          channel_title: string | null
          created_at: string
          description: string | null
          duration: string | null
          published_at: string | null
          tags: Json | null
          thumbnail_url: string | null
          title: string | null
          video_id: string
          youtube_id: string
        }
        Insert: {
          channel_title?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          published_at?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          video_id: string
          youtube_id?: string
        }
        Update: {
          channel_title?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          published_at?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          video_id?: string
          youtube_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      filtered_course_details: {
        Args: {
          course_id: string
        }
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          video_duration: string
          video_summary: string
          quiz_id: string
          quiz: Json
          youtube_id: string
          course_difficulty: number
          detaillevel: string
        }[]
      }
      get_course_data: {
        Args: {
          course_id: string
        }
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          video_summary: string
          quiz_id: number
          question_text: string
          correct_answer: string
        }[]
      }
      get_course_details: {
        Args: {
          course_id: string
        }
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          video_duration: string
          video_summary: string
          quiz_id: string
          quiz: Json
          youtube_id: string
          course_difficulty: number
          detaillevel: string
        }[]
      }
      get_course_info: {
        Args: {
          course_id: string
        }
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          video_summary: string
          quiz_id: number
          question_text: string
          correct_answer: string
        }[]
      }
      get_courses_with_first_video: {
        Args: Record<PropertyKey, never>
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          thumbnail_url: string
        }[]
      }
      get_courses_with_first_video_and_duration: {
        Args: Record<PropertyKey, never>
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          thumbnail_url: string
          total_duration: string
          total_videos: number
          created_at: string
          course_difficulty: number
          detaillevel: string
        }[]
      }
      get_user_courses_with_first_video_and_duration: {
        Args: {
          user_id: string
        }
        Returns: {
          course_id: string
          course_title: string
          course_description: string
          video_id: string
          video_title: string
          thumbnail_url: string
          total_duration: string
          total_videos: number
          created_at: string
          course_difficulty: number
          detaillevel: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
