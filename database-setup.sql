-- Social Media Aggregator Database Setup
-- Run this script in your Supabase SQL editor

-- Favorite Creators table (multi-platform support)
CREATE TABLE IF NOT EXISTS public.favorite_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  username TEXT NOT NULL,
  platform_user_id TEXT, -- Platform-specific user ID
  display_name TEXT,
  avatar_url TEXT,
  follower_count INTEGER,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, platform, username)
);

-- Content table (renamed from Videos for multi-platform support)
CREATE TABLE IF NOT EXISTS public.content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_content_id TEXT NOT NULL, -- Platform-specific content ID
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  creator_username TEXT NOT NULL,
  creator_platform TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  hashtags TEXT[],
  thumbnail_url TEXT,
  content_url TEXT NOT NULL,
  content_type TEXT DEFAULT 'video' CHECK (content_type IN ('video', 'image', 'reel', 'short')),
  created_at TIMESTAMP WITH TIME ZONE,
  stats JSONB,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, platform_content_id)
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.content(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  webvtt_data TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Summaries table
CREATE TABLE IF NOT EXISTS public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.content(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points TEXT[],
  sentiment TEXT,
  topics TEXT[],
  platform TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tiktok_date_range_days INTEGER DEFAULT 7,
  youtube_date_range_days INTEGER DEFAULT 7,
  instagram_date_range_days INTEGER DEFAULT 7,
  max_content_per_creator INTEGER DEFAULT 10,
  auto_refresh_enabled BOOLEAN DEFAULT TRUE,
  refresh_interval_hours INTEGER DEFAULT 6,
  enabled_platforms TEXT[] DEFAULT ARRAY['tiktok'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security Policies

-- Favorite creators policies
CREATE POLICY "Users can view own creators" ON public.favorite_creators
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own creators" ON public.favorite_creators
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own creators" ON public.favorite_creators
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own creators" ON public.favorite_creators
  FOR DELETE USING (auth.uid() = user_id);

-- Content policies (users can only see content from their followed creators)
CREATE POLICY "Users can view content from followed creators" ON public.content
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.favorite_creators fc
      WHERE fc.user_id = auth.uid()
      AND fc.platform = content.platform
      AND fc.username = content.creator_username
      AND fc.is_active = true
    )
  );

-- Transcripts policies
CREATE POLICY "Users can view transcripts of accessible content" ON public.transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.content c
      JOIN public.favorite_creators fc ON fc.platform = c.platform AND fc.username = c.creator_username
      WHERE c.id = transcripts.content_id
      AND fc.user_id = auth.uid()
      AND fc.is_active = true
    )
  );

-- Summaries policies
CREATE POLICY "Users can view summaries of accessible content" ON public.summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.content c
      JOIN public.favorite_creators fc ON fc.platform = c.platform AND fc.username = c.creator_username
      WHERE c.id = summaries.content_id
      AND fc.user_id = auth.uid()
      AND fc.is_active = true
    )
  );

-- User settings policies
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable RLS on all tables
ALTER TABLE public.favorite_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorite_creators_user_platform ON public.favorite_creators(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_content_platform_creator ON public.content(platform, creator_username);
CREATE INDEX IF NOT EXISTS idx_content_created_at ON public.content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_content_id ON public.transcripts(content_id);
CREATE INDEX IF NOT EXISTS idx_summaries_content_id ON public.summaries(content_id);

-- Function to automatically create user settings when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user settings on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
