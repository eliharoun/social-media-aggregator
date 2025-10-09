import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database
export interface User {
  id: string
  email: string
  created_at: string
  updated_at: string
}

export interface FavoriteCreator {
  id: string
  user_id: string
  platform: 'tiktok' | 'youtube' | 'instagram'
  username: string
  platform_user_id?: string
  display_name?: string
  avatar_url?: string
  follower_count?: number
  added_at: string
  is_active: boolean
}

export interface Content {
  id: string
  platform_content_id: string
  platform: 'tiktok' | 'youtube' | 'instagram'
  creator_username: string
  creator_platform: string
  title?: string
  caption?: string
  hashtags?: string[]
  thumbnail_url?: string
  content_url: string
  content_type: 'video' | 'image' | 'reel' | 'short'
  created_at?: string
  stats?: {
    views: number
    likes: number
    comments: number
    shares: number
  }
  cached_at: string
}

export interface Transcript {
  id: string
  content_id: string
  transcript_text: string
  webvtt_data?: string
  language: string
  created_at: string
}

export interface Summary {
  id: string
  content_id: string
  summary: string
  key_points?: string[]
  sentiment?: string
  topics?: string[]
  platform: string
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  tiktok_date_range_days: number
  youtube_date_range_days: number
  instagram_date_range_days: number
  max_content_per_creator: number
  auto_refresh_enabled: boolean
  refresh_interval_hours: number
  enabled_platforms: string[]
  created_at: string
  updated_at: string
}
