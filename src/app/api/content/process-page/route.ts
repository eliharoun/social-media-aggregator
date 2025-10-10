import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { PromptTemplate } from '@langchain/core/prompts'

interface ProcessingResult {
  content_id: string
  hasTranscript: boolean
  hasSummary: boolean
  isProcessing: boolean
  error?: string
}

interface TranscriptResult {
  content_id: string
  transcript_id?: string
  has_transcript: boolean
  error?: string
}

interface SummaryResult {
  content_id: string
  summary_id?: string
  summary_generated: boolean
  error?: string
}

// Transcript API configuration
const TRANSCRIPT_API_KEYS = [
  process.env.TRANSCRIPT_API_KEY_1!,
  process.env.TRANSCRIPT_API_KEY_2!,
]

// LLM configuration
const DEFAULT_LLM_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'openai'

function createLLMInstance() {
  if (DEFAULT_LLM_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
      temperature: 0.3,
    })
  } else {
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini',
      temperature: 0.3,
    })
  }
}

const SUMMARIZATION_PROMPT = PromptTemplate.fromTemplate(`
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

3. **Key Information & References**: Identify any:
   - Names of people, products, companies, or brands mentioned
   - Book titles, studies, or sources cited
   - Specific tools, resources, or links referenced
   - Important dates, numbers, or statistics
   - Calls-to-action or next steps suggested


4. **Topics/Categories**: List 2-4 main topics or themes that best categorize this content

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "key_information": {{
    "references": ["string"],
    "statistics": ["string"],
    "people_mentioned": ["string"],
    "resources": ["string"]
  }},
  "topics": ["string"],
  "content_type": "string"
}}

If any section has no relevant information, use an empty array [] or null.
`)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTranscriptFromAPI(videoUrls: string[], retryCount = 0): Promise<any[]> {
  const currentApiKey = TRANSCRIPT_API_KEYS[retryCount % TRANSCRIPT_API_KEYS.length]
  
  try {
    const response = await fetch(
      'https://scriptadmin.tokbackup.com/v1/tiktok/fetchMultipleTikTokData?get_transcript=true&ip=54.240.198.36',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey,
        },
        body: JSON.stringify({ videoUrls }),
      }
    )

    if (response.ok) {
      const data = await response.json()
      
      if (data.data && data.data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.data.map((video: any) => {
          let transcript = ''
          if (video.subtitles) {
            transcript = video.subtitles
              .split('\n')
              .filter((line: string) => line && !line.includes('-->') && !line.startsWith('WEBVTT') && !line.match(/^\d{2}:\d{2}:\d{2}/))
              .join(' ')
              .trim()
          }
          
          return {
            video_url: video.oVideoURL,
            video_id: video.id,
            transcript: transcript,
            subtitles_webvtt: video.subtitles,
            has_transcript: !!transcript
          }
        })
      }
    }
    
    throw new Error('No transcript data returned')
  } catch (error) {
    if (retryCount < TRANSCRIPT_API_KEYS.length - 1) {
      return getTranscriptFromAPI(videoUrls, retryCount + 1)
    }
    throw error
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parallelTranscriptGeneration(supabase: any, contentIds: string[]): Promise<TranscriptResult[]> {
  // Get content info for transcript generation
  const { data: contentItems } = await supabase
    .from('content')
    .select('*')
    .in('id', contentIds)
    .eq('platform', 'tiktok') // Only TikTok supports transcripts

  if (!contentItems || contentItems.length === 0) {
    return []
  }

  const results: TranscriptResult[] = []
  
  // Process in batches of 3 to stay within timeout
  const BATCH_SIZE = 3
  for (let i = 0; i < contentItems.length; i += BATCH_SIZE) {
    const batch = contentItems.slice(i, i + BATCH_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoUrls = batch.map((item: any) => item.content_url)

    try {
      const transcriptResults = await getTranscriptFromAPI(videoUrls)
      
      for (let j = 0; j < transcriptResults.length; j++) {
        const result = transcriptResults[j]
        const contentItem = batch[j]
        
        if (result.has_transcript) {
          // Check if transcript already exists
          const { data: existingTranscript } = await supabase
            .from('transcripts')
            .select('id')
            .eq('content_id', contentItem.id)
            .single()

          if (!existingTranscript) {
            // Insert new transcript
            const { data: newTranscript, error: insertError } = await supabase
              .from('transcripts')
              .insert({
                content_id: contentItem.id,
                transcript_text: result.transcript,
                webvtt_data: result.subtitles_webvtt,
                language: 'en'
              })
              .select('id')
              .single()

            if (insertError) {
              results.push({
                content_id: contentItem.id,
                has_transcript: false,
                error: insertError.message
              })
            } else {
              results.push({
                content_id: contentItem.id,
                transcript_id: newTranscript.id,
                has_transcript: true
              })
            }
          } else {
            results.push({
              content_id: contentItem.id,
              transcript_id: existingTranscript.id,
              has_transcript: true
            })
          }
        } else {
          results.push({
            content_id: contentItem.id,
            has_transcript: false
          })
        }
      }
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batch.forEach((item: any) => {
        results.push({
          content_id: item.id,
          has_transcript: false,
          error: error instanceof Error ? error.message : 'Transcript API failed'
        })
      })
    }
  }

  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parallelSummaryGeneration(supabase: any, transcriptIds: string[]): Promise<SummaryResult[]> {
  if (transcriptIds.length === 0) {
    return []
  }

  const { data: transcripts } = await supabase
    .from('transcripts')
    .select('*, content(*)')
    .in('id', transcriptIds)

  if (!transcripts || transcripts.length === 0) {
    return []
  }

  const llm = createLLMInstance()
  const results: SummaryResult[] = []

  // Process transcripts sequentially to avoid overwhelming the LLM API
  for (const transcript of transcripts) {
    try {
      // Check if summary already exists
      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('id')
        .eq('content_id', transcript.content.id)
        .single()

      if (existingSummary) {
        results.push({
          content_id: transcript.content.id,
          summary_id: existingSummary.id,
          summary_generated: false // Already exists
        })
        continue
      }

      const prompt = await SUMMARIZATION_PROMPT.format({
        creator: transcript.content.creator_username,
        platform: transcript.content.platform,
        title: transcript.content.title || 'Untitled',
        caption: transcript.content.caption || '',
        transcript: transcript.transcript_text
      })

      const response = await llm.invoke(prompt)
      
      let summaryData
      try {
        summaryData = JSON.parse(response.content as string)
      } catch {
        summaryData = {
          summary: (response.content as string).substring(0, 500),
          key_points: [],
          sentiment: 'neutral',
          topics: []
        }
      }

      const { data: newSummary, error: insertError } = await supabase
        .from('summaries')
        .insert({
          content_id: transcript.content.id,
          summary: summaryData.summary,
          key_points: summaryData.key_points || [],
          sentiment: summaryData.sentiment || 'neutral',
          topics: summaryData.topics || [],
          platform: transcript.content.platform
        })
        .select('id')
        .single()

      if (insertError) {
        results.push({
          content_id: transcript.content.id,
          summary_generated: false,
          error: insertError.message
        })
      } else {
        results.push({
          content_id: transcript.content.id,
          summary_id: newSummary.id,
          summary_generated: true
        })
      }

    } catch (error) {
      results.push({
        content_id: transcript.content.id,
        summary_generated: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      })
    }
  }

  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processPageContent(supabase: any, contentIds: string[]): Promise<ProcessingResult[]> {
  const startTime = Date.now()
  const results: ProcessingResult[] = []

  // Step 1: Generate transcripts in parallel
  const transcriptResults = await parallelTranscriptGeneration(supabase, contentIds)
  
  // Step 2: Generate summaries for successful transcripts
  const transcriptIds = transcriptResults
    .filter(r => r.has_transcript && r.transcript_id)
    .map(r => r.transcript_id!)

  let summaryResults: SummaryResult[] = []
  if (transcriptIds.length > 0 && Date.now() - startTime < 7000) {
    summaryResults = await parallelSummaryGeneration(supabase, transcriptIds)
  }

  // Combine results
  contentIds.forEach(contentId => {
    const transcriptResult = transcriptResults.find(r => r.content_id === contentId)
    const summaryResult = summaryResults.find(r => r.content_id === contentId)

    results.push({
      content_id: contentId,
      hasTranscript: transcriptResult?.has_transcript || false,
      hasSummary: summaryResult?.summary_generated || false,
      isProcessing: false,
      error: transcriptResult?.error || summaryResult?.error
    })
  })

  return results
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const authorization = request.headers.get('authorization')
    const token = authorization?.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { contentIds } = await request.json()
    
    if (!contentIds || !Array.isArray(contentIds)) {
      return NextResponse.json({ error: 'Content IDs required' }, { status: 400 })
    }

    // Get user's creators to validate content ownership
    const { data: userCreators } = await supabase
      .from('favorite_creators')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const userCreatorNames = userCreators?.map(c => c.username) || []
    
    // Validate that content belongs to user's creators
    const { data: userContent } = await supabase
      .from('content')
      .select('id, creator_username')
      .in('id', contentIds)
      .in('creator_username', userCreatorNames)

    const validContentIds = userContent?.map(c => c.id) || []
    
    if (validContentIds.length === 0) {
      return NextResponse.json({ error: 'No valid content found' }, { status: 404 })
    }

    // Process the page content
    const results = await processPageContent(supabase, validContentIds)

    return NextResponse.json({
      results,
      processingTime: Date.now() - startTime,
      llm_provider: DEFAULT_LLM_PROVIDER
    })

  } catch (error) {
    console.error('Process page error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
