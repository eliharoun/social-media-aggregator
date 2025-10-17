import { DatabaseQueueManager } from './queueManager'
import { ProcessingJob } from './supabase'
import { summarizationService, ContentMetadata } from './summarizationService'

// TikTok API configuration (reuse existing)
const RAPIDAPI_KEYS = [
  process.env.RAPIDAPI_KEY_1!,
  process.env.RAPIDAPI_KEY_2!,
  process.env.RAPIDAPI_KEY_3!,
]

// YouTube API configuration (same RapidAPI account)
const YOUTUBE_RAPIDAPI_KEYS = [
  process.env.YOUTUBE_RAPIDAPI_KEY_1!,
  process.env.YOUTUBE_RAPIDAPI_KEY_2!,
  process.env.YOUTUBE_RAPIDAPI_KEY_3!,
]


// Supadata AI configuration (multiple keys for redundancy)
const SUPADATA_API_KEYS = [
  process.env.SUPADATA_API_KEY_1!,
  process.env.SUPADATA_API_KEY_2!,
  process.env.SUPADATA_API_KEY_3!,
]

// LLM configuration
const DEFAULT_LLM_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'openai'

interface VideoContent {
  platform_content_id: string
  platform: string
  creator_username: string
  creator_platform: string
  title: string
  caption: string
  hashtags: string[]
  thumbnail_url: string
  content_url: string
  content_type: string
  created_at: string
  stats: {
    views: number
    likes: number
    comments: number
    shares: number
  }
}

interface TranscriptResult {
  transcript: string
  webvtt: string
  has_transcript: boolean
}

interface SummaryResult {
  summary: string
  key_points: string[]
  sentiment: string
  topics: string[]
}

export class JobProcessor {
  private queueManager: DatabaseQueueManager
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any

  constructor(queueManager: DatabaseQueueManager) {
    this.queueManager = queueManager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.supabase = (queueManager as any).supabase
  }

  async processJobWithTimeout(job: ProcessingJob, timeoutMs = 8000): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Job processing timeout')), timeoutMs)
    })

    try {
      await this.queueManager.markJobProcessing(job.id)
      
      await Promise.race([
        this.processJob(job),
        timeoutPromise
      ])

      await this.queueManager.markJobCompleted(job.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.queueManager.markJobFailed(job.id, errorMessage, true)
      throw error
    }
  }

  private async processJob(job: ProcessingJob): Promise<void> {
    switch (job.job_type) {
      case 'content_fetch':
        await this.processContentFetchJob(job)
        break
      case 'transcript':
        await this.processTranscriptJob(job)
        break
      case 'summary':
        await this.processSummaryJob(job)
        break
      default:
        throw new Error(`Unknown job type: ${job.job_type}`)
    }
  }

  private async processContentFetchJob(job: ProcessingJob): Promise<void> {
    const { creator } = job.job_data
    if (!creator) throw new Error('Creator data missing from job')

    // Get user settings for date range and content limits
    const { data: settings } = await this.supabase
      .from('user_settings')
      .select('tiktok_date_range_days, youtube_date_range_days, instagram_date_range_days, max_content_per_creator')
      .eq('user_id', job.user_id)
      .single()

    // Get platform-specific settings
    const dateRangeDays = this.getDateRangeForPlatform(creator.platform, settings)
    const maxContent = Math.min(settings?.max_content_per_creator || 10, 20) // Limit to 20 for performance

    let videos: VideoContent[] = []

    // Fetch videos based on platform
    if (creator.platform === 'tiktok') {
      videos = await this.fetchTikTokVideosWithTimeout(
        creator.username, 
        creator.platform_user_id, 
        maxContent,
        5000 // 5 second timeout
      )
    } else if (creator.platform === 'youtube') {
      videos = await this.fetchYouTubeVideosWithTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (creator as any).channel_id || creator.platform_user_id, // Use channel_id
        creator.username,
        maxContent,
        5000 // 5 second timeout
      )
    } else {
      throw new Error(`Unsupported platform: ${creator.platform}`)
    }

    // Filter videos by date range
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays)
    
    const recentVideos = videos.filter(video => 
      new Date(video.created_at) >= cutoffDate
    )

    console.log(`Filtered ${videos.length} videos to ${recentVideos.length} within ${dateRangeDays} days for ${creator.username}`)

    // Cache videos in database
    const cachedVideos = await this.cacheVideosToDatabase(recentVideos, job.user_id)

    // Queue transcript jobs for new content with priority based on video length
    for (const video of cachedVideos) {
      try {
        // Determine priority based on video length for YouTube videos
        let priority = 3 // Default priority for transcripts
        
        if (video.platform === 'youtube') {
          // For YouTube, longer videos get lower priority (higher number = lower priority)
          // Use title length as heuristic for video length
          const titleLength = video.title?.length || 0
          if (titleLength > 100) {
            priority = 7 // Lower priority for potentially longer videos
          } else if (titleLength > 50) {
            priority = 5 // Medium priority
          } else {
            priority = 3 // Higher priority for shorter videos
          }
        }

        await this.queueManager.addTranscriptJob(
          job.user_id,
          (video as VideoContent & { id: string }).id, // Use database ID from cached content
          video.content_url,
          priority
        )
      } catch {
        // Continue with other videos if one fails to queue
        continue
      }
    }
  }

  private async processTranscriptJob(job: ProcessingJob): Promise<void> {
    const { content_id, content_url } = job.job_data
    if (!content_id || !content_url) throw new Error('Content data missing from job')

    // Generate transcript with timeout
    const transcriptData = await this.generateTranscriptWithTimeout(content_url, 6000) as (TranscriptResult & { jobId?: string })
    
    // Handle async job IDs (Phase 2)
    if (!transcriptData.has_transcript && 'jobId' in transcriptData && transcriptData.jobId) {
      // Store job ID for later polling
      const { error: transcriptError } = await this.supabase
        .from('transcripts')
        .upsert({
          content_id,
          transcript_text: '', // Empty for now
          webvtt_data: '',
          language: 'en',
          supadata_job_id: transcriptData.jobId,
          processing_status: 'pending_async'
        }, {
          onConflict: 'content_id',
          ignoreDuplicates: false
        })

      if (transcriptError) {
        throw new Error(`Failed to store async transcript job: ${transcriptError.message}`)
      }

      // No summary job created yet - will be created when transcript completes
      return
    }

    // Handle immediate transcripts
    if (!transcriptData.has_transcript) {
      throw new Error('No transcript generated for content')
    }

    // Store transcript using UPSERT
    const { data: transcript, error: transcriptError } = await this.supabase
      .from('transcripts')
      .upsert({
        content_id,
        transcript_text: transcriptData.transcript,
        webvtt_data: transcriptData.webvtt,
        language: 'en',
        processing_status: 'completed'
      }, {
        onConflict: 'content_id',
        ignoreDuplicates: false
      })
      .select('*')
      .single()

    if (transcriptError) {
      throw new Error(`Failed to store transcript: ${transcriptError.message}`)
    }

    // Get content metadata for summary job
    const { data: content, error: contentError } = await this.supabase
      .from('content')
      .select('*')
      .eq('id', content_id)
      .single()

    if (contentError || !content) {
      throw new Error('Failed to get content metadata for summary job')
    }

    // Queue summary job with duplicate handling
    try {
      await this.queueManager.addSummaryJob(
        job.user_id,
        content_id,
        transcript.id,
        transcriptData.transcript,
        {
          title: content.title || 'Untitled',
          caption: content.caption || '',
          platform: content.platform,
          creator_username: content.creator_username
        },
        2 // Higher priority for summaries
      )
    } catch (error) {
      // Handle duplicate key constraint violations gracefully
      if (error instanceof Error && error.message.includes('duplicate key value violates unique constraint')) {
        // Silently skip duplicate jobs - this is expected behavior
      } else {
        console.error(`Failed to queue summary job for ${content_id}:`, error)
      }
    }
  }

  private async processSummaryJob(job: ProcessingJob): Promise<void> {
    const { content_id, transcript_text, content_metadata } = job.job_data
    if (!content_id || !transcript_text || !content_metadata) {
      throw new Error('Summary data missing from job')
    }

    // Determine timeout based on transcript length and platform
    let timeout = 8000 // Default 8 seconds
    
    if (content_metadata.platform === 'youtube') {
      // YouTube videos need more time for processing
      const transcriptLength = transcript_text.length
      if (transcriptLength > 10000) {
        timeout = 20000 // 20 seconds for very long transcripts
      } else if (transcriptLength > 5000) {
        timeout = 15000 // 15 seconds for long transcripts
      } else {
        timeout = 12000 // 12 seconds for medium transcripts
      }
    }

    // For very long transcripts, chunk them to avoid timeouts
    let processedTranscript = transcript_text
    if (transcript_text.length > 15000) {
      // Truncate very long transcripts to first 15000 characters
      processedTranscript = transcript_text.substring(0, 15000) + '...'
      console.log(`Truncated long transcript from ${transcript_text.length} to 15000 characters`)
    }

    // Generate AI summary with dynamic timeout
    const summaryData = await this.generateSummaryWithTimeout(processedTranscript, content_metadata, timeout)
    
    // Store summary using UPSERT (already implemented)
    const { error: summaryError } = await this.supabase
      .from('summaries')
      .upsert({
        content_id,
        summary: summaryData.summary,
        key_points: summaryData.key_points || [],
        sentiment: summaryData.sentiment || 'neutral',
        topics: summaryData.topics || [],
        platform: content_metadata.platform
      }, {
        onConflict: 'content_id',
        ignoreDuplicates: false
      })

    if (summaryError) {
      throw new Error(`Failed to store summary: ${summaryError.message}`)
    }
  }

  // Helper method to get date range for specific platform
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getDateRangeForPlatform(platform: string, settings: any): number {
    switch (platform) {
      case 'tiktok':
        return settings?.tiktok_date_range_days || 7
      case 'youtube':
        return settings?.youtube_date_range_days || 7
      case 'instagram':
        return settings?.instagram_date_range_days || 7
      default:
        return 7 // Default to 7 days
    }
  }

  // Helper Methods - Full implementations using existing API logic

  private async fetchTikTokVideosWithTimeout(username: string, secUid: string, count: number, timeoutMs: number): Promise<VideoContent[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TikTok API timeout')), timeoutMs)
    })

    const fetchPromise = this.fetchTikTokVideos(username, secUid, count)

    return Promise.race([fetchPromise, timeoutPromise])
  }

  private async fetchTikTokVideos(username: string, secUid: string, count = 10): Promise<VideoContent[]> {
    for (let i = 0; i < RAPIDAPI_KEYS.length; i++) {
      try {
        const response = await fetch(
          `https://tiktok-api23.p.rapidapi.com/api/user/posts?secUid=${secUid}&count=${count}&cursor=0`,
          {
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEYS[i],
              'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          const itemList = data.data?.itemList || data.itemList || []
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return itemList.map((video: any): VideoContent => ({
            platform_content_id: video.id,
            platform: 'tiktok',
            creator_username: username,
            creator_platform: 'tiktok',
            title: video.desc?.replace(/#[\w]+/g, '').trim() || 'Untitled',
            caption: video.desc || '',
            hashtags: (video.desc?.match(/#[\w]+/g) || []).map((tag: string) => tag.substring(1)),
            thumbnail_url: video.video?.cover || video.video?.originCover || '',
            content_url: `https://www.tiktok.com/@${username}/video/${video.id}`,
            content_type: 'video',
            created_at: new Date(video.createTime * 1000).toISOString(),
            stats: {
              views: video.stats?.playCount || 0,
              likes: video.stats?.diggCount || 0,
              comments: video.stats?.commentCount || 0,
              shares: video.stats?.shareCount || 0
            }
          }))
        }
      } catch {
        continue
      }
    }
    
    throw new Error('Failed to fetch videos from TikTok API')
  }

  // YouTube video fetching methods
  private async fetchYouTubeVideosWithTimeout(channelId: string, username: string, count: number, timeoutMs: number): Promise<VideoContent[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('YouTube API timeout')), timeoutMs)
    })

    const fetchPromise = this.fetchYouTubeVideos(channelId, username, count)

    return Promise.race([fetchPromise, timeoutPromise])
  }

  private async fetchYouTubeVideos(channelId: string, username: string, count = 10): Promise<VideoContent[]> {
    for (let i = 0; i < YOUTUBE_RAPIDAPI_KEYS.length; i++) {
      try {
        const response = await fetch(
          `https://youtube138.p.rapidapi.com/channel/videos/?id=${channelId}&filter=videos_latest&hl=en&gl=US`,
          {
            headers: {
              'x-rapidapi-key': YOUTUBE_RAPIDAPI_KEYS[i],
              'x-rapidapi-host': 'youtube138.p.rapidapi.com'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          const contents = data.contents || []
          
          return contents
            .filter((item: { video?: { lengthSeconds?: number } }) => {
              // Filter out videos longer than 30 minutes (1800 seconds)
              const lengthSeconds = item.video?.lengthSeconds || 0
              return lengthSeconds <= 1800 // 30 minutes limit
            })
            .slice(0, count)
            .map((item: { video: { videoId: string; title?: string; thumbnails?: { url: string }[]; publishedTimeText: string; stats?: { views: number } } }): VideoContent => {
              const video = item.video
              return {
                platform_content_id: video.videoId,
                platform: 'youtube',
                creator_username: username,
                creator_platform: 'youtube',
                title: video.title || 'Untitled',
                caption: video.title || '', // YouTube uses title as caption
                hashtags: this.extractHashtagsFromTitle(video.title || ''),
                thumbnail_url: video.thumbnails?.[video.thumbnails.length - 1]?.url || '',
                content_url: `https://www.youtube.com/watch?v=${video.videoId}`,
                content_type: 'video',
                created_at: this.parseYouTubeDate(video.publishedTimeText),
                stats: {
                  views: video.stats?.views || 0,
                  likes: 0, // Not available in this API response
                  comments: 0, // Not available in this API response  
                  shares: 0 // Not available in this API response
                }
              }
            })
        }
      } catch (error) {
        continue
      }
    }
    
    throw new Error('Failed to fetch YouTube videos')
  }

  private parseYouTubeDate(publishedTimeText: string): string {
    // Parse "13 minutes ago", "3 hours ago", etc. to ISO date
    const now = new Date()
    
    if (publishedTimeText.includes('minute')) {
      const minutes = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - minutes * 60 * 1000).toISOString()
    } else if (publishedTimeText.includes('hour')) {
      const hours = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
    } else if (publishedTimeText.includes('day')) {
      const days = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
    }
    
    // Handle "X weeks ago", "X months ago", etc.
    if (publishedTimeText.includes('week')) {
      const weeks = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString()
    } else if (publishedTimeText.includes('month')) {
      const months = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000).toISOString()
    } else if (publishedTimeText.includes('year')) {
      const years = parseInt(publishedTimeText.match(/\d+/)?.[0] || '0')
      return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000).toISOString()
    }
    
    // Fallback to current time
    return now.toISOString()
  }

  private extractHashtagsFromTitle(title: string): string[] {
    const hashtags = title.match(/#[\w]+/g) || []
    return hashtags.map(tag => tag.substring(1))
  }

  private async generateTranscriptWithTimeout(contentUrl: string, timeoutMs: number): Promise<TranscriptResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Transcript generation timeout')), timeoutMs)
    })

    const transcriptPromise = this.generateTranscript(contentUrl)

    return Promise.race([transcriptPromise, timeoutPromise])
  }

  private async generateTranscript(contentUrl: string): Promise<TranscriptResult> {
    // Use single Supadata API for all platforms (TikTok, YouTube, Instagram)
    return this.generateSupadataTranscript(contentUrl)
  }

  private async generateSupadataTranscript(contentUrl: string): Promise<TranscriptResult> {
    // Use Supadata general transcript API for all platforms (TikTok, YouTube, Instagram)
    // Rate limit: 1 request per second per API key
    
    for (let i = 0; i < SUPADATA_API_KEYS.length; i++) {
      // Add delay between API key attempts to respect rate limits (1 req/sec)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1200)) // 1.2 second delay
      }
      
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries) {
        try {
          const { Supadata } = await import('@supadata/js')
          
          const supadata = new Supadata({
            apiKey: SUPADATA_API_KEYS[i],
          })

          // Use the general transcript method - works for TikTok, YouTube, Instagram
          const transcriptResult = await supadata.transcript({
            url: contentUrl,
            lang: 'en',
            text: true, // Return plain text instead of timestamped chunks
            mode: 'auto' // Let Supadata auto-detect the platform
          })

        // Check if we got a transcript directly or a job ID for async processing
        if ('jobId' in transcriptResult) {
          // Phase 2: Store job ID for later polling
          return {
            transcript: '',
            webvtt: '',
            has_transcript: false,
            jobId: transcriptResult.jobId // Return job ID for storage
          } as TranscriptResult & { jobId: string }
        } else {
          // For smaller files, we get the transcript directly
          const transcript = typeof transcriptResult === 'string' 
            ? transcriptResult 
            : (transcriptResult as unknown as { content?: string; text?: string }).content || 
              (transcriptResult as unknown as { content?: string; text?: string }).text || 
              JSON.stringify(transcriptResult)
            
          return {
            transcript,
            webvtt: '', // Supadata doesn't provide WebVTT format
            has_transcript: !!transcript
          }
        }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          
          // Handle rate limiting with exponential backoff
          if (errorMessage.includes('Limit Exceeded') || errorMessage.includes('rate limit')) {
            retryCount++
            if (retryCount < maxRetries) {
              const backoffDelay = Math.pow(2, retryCount) * 1000 // 2s, 4s, 8s
              console.log(`Rate limited, retrying in ${backoffDelay}ms (attempt ${retryCount}/${maxRetries})`)
              await new Promise(resolve => setTimeout(resolve, backoffDelay))
              continue // Retry with same API key
            }
          }
          
          // For other errors or max retries exceeded, try next API key
          if (errorMessage.includes('Video too large')) {
            throw error // Don't retry for videos that are too large
          }
          break // Move to next API key
        }
      }
    }
    
    throw new Error('Failed to generate transcript from Supadata API - all keys exhausted')
  }

  private convertToWebVTT(captions: { start: number; dur: number; text: string }[]): string {
    let webvtt = 'WEBVTT\n\n'
    
    captions.forEach((caption, index) => {
      const start = this.formatTime(caption.start)
      const end = this.formatTime(caption.start + caption.dur)
      
      webvtt += `${index + 1}\n`
      webvtt += `${start} --> ${end}\n`
      webvtt += `${caption.text}\n\n`
    })
    
    return webvtt
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateSummaryWithTimeout(transcriptText: string, contentMetadata: any, timeoutMs: number): Promise<SummaryResult> {
    // Use shared summarization service
    const isLongForm = contentMetadata.platform === 'youtube' && transcriptText.length > 5000
    
    const metadata: ContentMetadata = {
      creator_username: contentMetadata.creator_username,
      platform: contentMetadata.platform,
      title: contentMetadata.title,
      caption: contentMetadata.caption
    }
    
    return summarizationService.generateSummaryWithTimeout(
      transcriptText,
      metadata,
      timeoutMs,
      { isLongForm }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateSummary(transcriptText: string, contentMetadata: any): Promise<SummaryResult> {
    // Use shared summarization service
    const isLongForm = contentMetadata.platform === 'youtube' && transcriptText.length > 5000
    
    const metadata: ContentMetadata = {
      creator_username: contentMetadata.creator_username,
      platform: contentMetadata.platform,
      title: contentMetadata.title,
      caption: contentMetadata.caption
    }
    
    return summarizationService.generateSummary(transcriptText, metadata, { isLongForm })
  }

  private async cacheVideosToDatabase(videos: VideoContent[], _userId: string): Promise<VideoContent[]> {
    const cachedVideos: VideoContent[] = []
    
    // Process videos in batches to avoid overwhelming the database
    const BATCH_SIZE = 10
    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      const batch = videos.slice(i, i + BATCH_SIZE)
      
      await Promise.all(batch.map(async (video) => {
        try {
          // Check if content already exists
          const { data: existingContent, error: selectError } = await this.supabase
            .from('content')
            .select('id')
            .eq('platform_content_id', video.platform_content_id)
            .eq('platform', video.platform)
            .single()

          if (selectError && selectError.code !== 'PGRST116') {
            throw selectError
          }

          if (!existingContent) {
            // Insert new content
            const { data: newContent, error: insertError } = await this.supabase
              .from('content')
              .insert(video)
              .select('*')
              .single()
            
            if (insertError) {
              throw insertError
            } else {
              cachedVideos.push(newContent)
            }
          } else {
            // Update existing content stats
            const { data: updatedContent, error: updateError } = await this.supabase
              .from('content')
              .update({
                stats: video.stats,
                cached_at: new Date().toISOString()
              })
              .eq('id', existingContent.id)
              .select('*')
              .single()
            
            if (updateError) {
              throw updateError
            } else {
              cachedVideos.push(updatedContent)
            }
          }
        } catch (error) {
          console.error(`Failed to cache video ${video.platform_content_id}:`, error)
          // Continue with other videos
        }
      }))
    }

    return cachedVideos
  }
}
