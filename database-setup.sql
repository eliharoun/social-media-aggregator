-- Social Media Aggregator Database Setup (Complete)
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
  channel_id TEXT, -- YouTube channel ID for API calls
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

-- Transcripts table (with unique constraint to prevent duplicates)
CREATE TABLE IF NOT EXISTS public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.content(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  webvtt_data TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  supadata_job_id TEXT, -- For async job tracking
  processing_status TEXT DEFAULT 'completed' CHECK (processing_status IN ('completed', 'pending_async', 'failed')),
  UNIQUE(content_id) -- Ensures one transcript per content item
);

-- Summaries table (with unique constraint to prevent duplicates)
CREATE TABLE IF NOT EXISTS public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.content(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points TEXT[],
  sentiment TEXT,
  topics TEXT[],
  platform TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(content_id) -- Ensures one summary per content item
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
  enabled_platforms TEXT[] DEFAULT ARRAY['tiktok', 'youtube', 'instagram'],
  auto_expand_summaries BOOLEAN DEFAULT FALSE,
  youtube_max_video_length_minutes INTEGER DEFAULT 30, -- Maximum YouTube video length to process
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Profiles table to store additional user information
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Content Interactions table to track read/saved status
CREATE TABLE IF NOT EXISTS public.user_content_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES public.content(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  is_saved BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  saved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, content_id)
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

-- Allow inserting content for followed creators
CREATE POLICY "Users can insert content for followed creators" ON public.content
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.favorite_creators fc
      WHERE fc.user_id = auth.uid()
      AND fc.platform = content.platform
      AND fc.username = content.creator_username
      AND fc.is_active = true
    )
  );

-- Allow updating content for followed creators
CREATE POLICY "Users can update content for followed creators" ON public.content
  FOR UPDATE USING (
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

CREATE POLICY "Users can insert transcripts for accessible content" ON public.transcripts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content c
      JOIN public.favorite_creators fc ON fc.platform = c.platform AND fc.username = c.creator_username
      WHERE c.id = transcripts.content_id
      AND fc.user_id = auth.uid()
      AND fc.is_active = true
    )
  );

CREATE POLICY "Users can update transcripts for accessible content" ON public.transcripts
  FOR UPDATE USING (
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

CREATE POLICY "Users can insert summaries for accessible content" ON public.summaries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content c
      JOIN public.favorite_creators fc ON fc.platform = c.platform AND fc.username = c.creator_username
      WHERE c.id = summaries.content_id
      AND fc.user_id = auth.uid()
      AND fc.is_active = true
    )
  );

CREATE POLICY "Users can update summaries for accessible content" ON public.summaries
  FOR UPDATE USING (
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

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile" ON public.user_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- User content interactions policies
CREATE POLICY "Users can view own interactions" ON public.user_content_interactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions" ON public.user_content_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interactions" ON public.user_content_interactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own interactions" ON public.user_content_interactions
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on all tables
ALTER TABLE public.favorite_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_content_interactions ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorite_creators_user_platform ON public.favorite_creators(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_content_platform_creator ON public.content(platform, creator_username);
CREATE INDEX IF NOT EXISTS idx_content_created_at ON public.content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_content_id ON public.transcripts(content_id);
CREATE INDEX IF NOT EXISTS idx_summaries_content_id ON public.summaries(content_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_content_interactions_user_content ON public.user_content_interactions(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_user_content_interactions_user_read ON public.user_content_interactions(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_content_interactions_user_saved ON public.user_content_interactions(user_id, is_saved);

-- Function to automatically create user settings when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically create user profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create user settings on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Trigger to update updated_at on user_settings
CREATE TRIGGER handle_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to update updated_at on user_profiles
CREATE TRIGGER handle_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to update updated_at on user_content_interactions
CREATE TRIGGER handle_user_content_interactions_updated_at
  BEFORE UPDATE ON public.user_content_interactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Database function for getting pending jobs with proper retry_count comparison
CREATE OR REPLACE FUNCTION get_pending_jobs(job_type_param TEXT, batch_size_param INTEGER)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  job_type TEXT,
  job_data JSONB,
  status TEXT,
  priority INTEGER,
  retry_count INTEGER,
  max_retries INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pj.id,
    pj.user_id,
    pj.job_type,
    pj.job_data,
    pj.status,
    pj.priority,
    pj.retry_count,
    pj.max_retries,
    pj.error_message,
    pj.created_at,
    pj.started_at,
    pj.completed_at
  FROM processing_jobs pj
  WHERE pj.job_type = job_type_param
    AND pj.status = 'pending'
    AND pj.retry_count < pj.max_retries
  ORDER BY pj.priority ASC, pj.created_at DESC
  LIMIT batch_size_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Unique constraints for transcripts and summaries are now built into the table definitions above
-- Alternative constraints (commented out - use if multi-language or multi-provider support needed):
-- For multi-language transcript support, replace the UNIQUE(content_id) constraint with:
-- UNIQUE(content_id, language)

-- For multi-AI provider summary tracking, add ai_provider column and use:
-- UNIQUE(content_id, ai_provider)

-- Processing Jobs Queue Table
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('content_fetch', 'transcript', 'summary')),
  job_data JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 5, -- 1 = highest priority, 10 = lowest
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create unique index for preventing duplicate jobs (supports JSON expressions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_job_per_content 
ON public.processing_jobs(job_type, user_id, (job_data->>'content_id'))
WHERE job_data->>'content_id' IS NOT NULL;

-- Create unique index for content_fetch jobs (use creator username and platform)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_content_fetch_job 
ON public.processing_jobs(job_type, user_id, (job_data->'creator'->>'username'), (job_data->'creator'->>'platform'))
WHERE job_type = 'content_fetch';

-- Processing Sessions Table (tracks overall progress for user refresh operations)
CREATE TABLE IF NOT EXISTS public.processing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('content_refresh')),
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_summary TEXT[]
);

-- Efficient indexes for job processing
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON public.processing_jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user ON public.processing_jobs(user_id, job_type, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_retry ON public.processing_jobs(status, retry_count, max_retries);
CREATE INDEX IF NOT EXISTS idx_processing_sessions_user ON public.processing_sessions(user_id, status, started_at);

-- Row Level Security for processing jobs
CREATE POLICY "Users can view own processing jobs" ON public.processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processing jobs" ON public.processing_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own processing jobs" ON public.processing_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own processing sessions" ON public.processing_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processing sessions" ON public.processing_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own processing sessions" ON public.processing_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable RLS on queue tables
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_sessions ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
