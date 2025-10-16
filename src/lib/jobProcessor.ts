import { DatabaseQueueManager } from './queueManager'
import { ProcessingJob } from './supabase'
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { PromptTemplate } from '@langchain/core/prompts'

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

// Transcript API configuration (reuse existing)
const TRANSCRIPT_API_KEYS = [
  process.env.TRANSCRIPT_API_KEY_1!,
  process.env.TRANSCRIPT_API_KEY_2!,
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

    let videos: VideoContent[] = []

    // Fetch videos based on platform
    if (creator.platform === 'tiktok') {
      videos = await this.fetchTikTokVideosWithTimeout(
        creator.username, 
        creator.platform_user_id, 
        10, // max content per creator
        5000 // 5 second timeout
      )
    } else if (creator.platform === 'youtube') {
      videos = await this.fetchYouTubeVideosWithTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (creator as any).channel_id || creator.platform_user_id, // Use channel_id
        creator.username,
        10, // max content per creator
        5000 // 5 second timeout
      )
    } else {
      throw new Error(`Unsupported platform: ${creator.platform}`)
    }

    // Cache videos in database
    const cachedVideos = await this.cacheVideosToDatabase(videos, job.user_id)

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
          video.id, // Use database ID from cached content
          video.content_url,
          priority
        )
      } catch (error) {
        // Continue with other videos if one fails to queue
        console.error(`Failed to queue transcript job for ${video.id}:`, error)
      }
    }
  }

  private async processTranscriptJob(job: ProcessingJob): Promise<void> {
    const { content_id, content_url } = job.job_data
    if (!content_id || !content_url) throw new Error('Content data missing from job')

    // Generate transcript with timeout
    const transcriptData = await this.generateTranscriptWithTimeout(content_url, 6000)
    
    if (!transcriptData.has_transcript) {
      throw new Error('No transcript generated for content')
    }

    // Store transcript using UPSERT (already implemented)
    const { data: transcript, error: transcriptError } = await this.supabase
      .from('transcripts')
      .upsert({
        content_id,
        transcript_text: transcriptData.transcript,
        webvtt_data: transcriptData.webvtt,
        language: 'en'
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
    // Check if it's a YouTube URL
    if (contentUrl.includes('youtube.com/watch')) {
      return this.generateYouTubeTranscript(contentUrl)
    }
    
    // Existing TikTok transcript logic
    for (let i = 0; i < TRANSCRIPT_API_KEYS.length; i++) {
      try {
        const response = await fetch(
          'https://scriptadmin.tokbackup.com/v1/tiktok/fetchMultipleTikTokData?get_transcript=true&ip=54.240.198.36',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': TRANSCRIPT_API_KEYS[i],
            },
            body: JSON.stringify({ videoUrls: [contentUrl] }),
          }
        )

        if (response.ok) {
          const data = await response.json()
          
          if (data.data && data.data.length > 0) {
            const video = data.data[0]
            
            // Extract transcript from WebVTT format
            let transcript = ''
            if (video.subtitles) {
              transcript = video.subtitles
                .split('\n')
                .filter((line: string) => line && !line.includes('-->') && !line.startsWith('WEBVTT') && !line.match(/^\d{2}:\d{2}:\d{2}/))
                .join(' ')
                .trim()
            }
            
            return {
              transcript,
              webvtt: video.subtitles || '',
              has_transcript: !!transcript
            }
          }
        }
      } catch {
        continue
      }
    }
    
    throw new Error('Failed to generate transcript from all APIs')
  }

  private async generateYouTubeTranscript(contentUrl: string): Promise<TranscriptResult> {
    try {
      // Extract video ID from URL
      const videoId = contentUrl.match(/[?&]v=([^&]+)/)?.[1]
      if (!videoId) throw new Error('Invalid YouTube URL')

      // Try primary method: youtube-captions-scraper
      try {
        const { getSubtitles } = await import('youtube-captions-scraper')
        
        const captions = await getSubtitles({
          videoID: videoId,
          lang: 'en'
        })

        if (captions && captions.length > 0) {
          const transcript = captions.map(caption => caption.text).join(' ')
          const webvtt = this.convertToWebVTT(captions)
          
          return {
            transcript,
            webvtt,
            has_transcript: !!transcript
          }
        }
      } catch (primaryError) {
        console.log('Primary transcript method failed, trying fallback:', primaryError)
      }

      // Fallback method: NoteGPT API
      try {
        const transcript = await this.fetchYouTubeTranscriptFallback(videoId)
        
        return {
          transcript,
          webvtt: '', // NoteGPT doesn't provide WebVTT format
          has_transcript: !!transcript
        }
      } catch (fallbackError) {
        console.log('Fallback transcript method failed:', fallbackError)
      }
      
      return {
        transcript: '',
        webvtt: '',
        has_transcript: false
      }
    } catch (error) {
      throw new Error(`Failed to get YouTube transcript: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async fetchYouTubeTranscriptFallback(videoId: string): Promise<string> {
    // Cycle through multiple Supadata API keys for better reliability
    for (let i = 0; i < SUPADATA_API_KEYS.length; i++) {
      try {
        // Use Supadata AI for YouTube transcript generation
        const { Supadata } = await import('@supadata/js')
        
        const supadata = new Supadata({
          apiKey: SUPADATA_API_KEYS[i],
        })

        const transcriptResult = await supadata.youtube.transcript({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          lang: 'en'
        })

        // Check if we got a transcript directly or a job ID for async processing
        if ('jobId' in transcriptResult) {
          // For large files, we get a job ID and need to poll for results
          // For now, we'll skip async processing to keep it simple
          throw new Error('Video too large for synchronous processing')
        } else {
          // For smaller files, we get the transcript directly
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = transcriptResult as any
          
          if (result.content && Array.isArray(result.content) && result.content.length > 0) {
            // Convert transcript content to plain text
            const transcriptText = result.content
              .map((chunk: { text: string }) => chunk.text)
              .join(' ')
            return transcriptText
          } else {
            throw new Error('No transcript content returned from Supadata')
          }
        }
      } catch (error) {
        console.log(`Supadata API key ${i + 1} failed:`, error instanceof Error ? error.message : 'Unknown error')
        // Continue to next API key
        continue
      }
    }
    
    throw new Error('All Supadata API keys failed')
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
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Summary generation timeout')), timeoutMs)
    })

    const summaryPromise = this.generateSummary(transcriptText, contentMetadata)

    return Promise.race([summaryPromise, timeoutPromise])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateSummary(transcriptText: string, contentMetadata: any): Promise<SummaryResult> {
    const llm = this.createLLMInstance()
    
    // Choose prompt based on platform and content length
    const isLongForm = contentMetadata.platform === 'youtube' && transcriptText.length > 5000
    const promptTemplate = isLongForm ? this.getLongFormPrompt() : this.getStandardPrompt()
    
    const prompt = await promptTemplate.format({
      creator: contentMetadata.creator_username,
      platform: contentMetadata.platform,
      title: contentMetadata.title,
      caption: contentMetadata.caption,
      transcript: transcriptText
    })

    const response = await llm.invoke(prompt)
    
    let summaryData: SummaryResult
    try {
      summaryData = JSON.parse(response.content as string)
    } catch {
      // Fallback if JSON parsing fails
      summaryData = {
        summary: (response.content as string).substring(0, 500),
        key_points: [],
        sentiment: 'neutral',
        topics: []
      }
    }

    return summaryData
  }

  private getStandardPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are an expert content analyst specializing in social media video transcripts. Your goal is to extract maximum value from transcripts so users can quickly understand the content without watching the video.

## Content Metadata
- Creator: @{creator}
- Platform: {platform}
- Title: {title}
- Caption: {caption}

## Transcript
{transcript}

## Instructions
Analyze the transcript and provide a comprehensive yet concise summary that captures:

1. **Summary**: A clear 2-4 sentence overview that captures the main message and purpose of the content. Focus on what the creator wants the audience to know or do.

2. **Key Points**: Extract 3-7 of the most important takeaways, insights, or arguments. Prioritize:
   - Actionable advice or recommendations
   - Notable facts, statistics, or data mentioned
   - Core arguments or claims
   - Important examples or case studies
   - Controversial or unique perspectives

3. **Topics/Categories**: List 2-4 main topics or themes that best categorize this content

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "sentiment": "positive|negative|neutral",
  "topics": ["string"]
}}

If any section has no relevant information, use an empty array [] or "neutral" for sentiment.
`)
  }

  private getLongFormPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are an expert content analyst specializing in long-form educational and informational video content. Your goal is to create comprehensive summaries that capture the depth and structure of detailed content.

## Content Metadata
- Creator: @{creator}
- Platform: {platform} (Long-form content)
- Title: {title}
- Caption: {caption}

## Transcript
{transcript}

## Instructions
Analyze this long-form transcript and provide a structured summary optimized for educational/informational content:

1. **Summary**: A comprehensive 4-6 sentence overview that captures the main thesis, key arguments, and conclusions. Focus on the educational value and main learning objectives.

2. **Key Points**: Extract 5-10 of the most important insights, organized by importance. Prioritize:
   - Main concepts and definitions
   - Step-by-step processes or methodologies
   - Important data, research findings, or statistics
   - Practical applications and examples
   - Conclusions and recommendations
   - Common misconceptions addressed

3. **Topics/Categories**: List 3-5 main topics or themes, including subtopics where relevant

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "sentiment": "positive|negative|neutral",
  "topics": ["string"]
}}

If any section has no relevant information, use an empty array [] or "neutral" for sentiment.
`)
  }

  private createLLMInstance() {
    if (DEFAULT_LLM_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return new ChatAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-haiku-20240307', // Cost-optimized model
        temperature: 0.3,
      })
    } else {
      return new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini', // Cost-optimized model
        temperature: 0.3,
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async cacheVideosToDatabase(videos: VideoContent[], userId: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedVideos: any[] = []
    
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
