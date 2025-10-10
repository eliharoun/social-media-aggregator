import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { PromptTemplate } from '@langchain/core/prompts'

// LLM configuration
const DEFAULT_LLM_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'openai'

function createLLMInstance() {
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

const SUMMARIZATION_PROMPT = PromptTemplate.fromTemplate(`
You are an AI assistant that creates concise summaries of social media content. 

Content Details:
- Creator: @{creator}
- Platform: {platform}
- Title: {title}
- Caption: {caption}

Transcript:
{transcript}

Please provide a JSON response with:
1. A brief 2-3 sentence summary
2. 3-5 key points as an array
3. Overall sentiment
4. 2-3 main topics as an array

Response format:
{{
  "summary": "Brief summary here",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "sentiment": "positive",
  "topics": ["topic1", "topic2"]
}}
`)

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

    const { transcriptIds } = await request.json()
    if (!transcriptIds || !Array.isArray(transcriptIds)) {
      return NextResponse.json({ error: 'Transcript IDs required' }, { status: 400 })
    }

    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('*, content(*)')
      .in('id', transcriptIds)

    if (!transcripts) {
      return NextResponse.json({ error: 'No transcripts found' }, { status: 404 })
    }

    const llm = createLLMInstance()
    const processed: Array<{ content_id: string; summary_generated?: boolean; already_exists?: boolean }> = []
    const errors: Array<{ content_id: string; error: string }> = []

    // Process transcripts sequentially to avoid timeout issues
    for (const transcript of transcripts) {
      if (Date.now() - startTime > 8000) {
        break
      }

      try {
        const { data: existingSummary } = await supabase
          .from('summaries')
          .select('id')
          .eq('content_id', transcript.content.id)
          .single()

        if (existingSummary) {
          processed.push({ content_id: transcript.content.id, already_exists: true })
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
        } catch (parseError) {
          summaryData = {
            summary: (response.content as string).substring(0, 500),
            key_points: [],
            sentiment: 'neutral',
            topics: []
          }
        }

        const { error: insertError } = await supabase
          .from('summaries')
          .insert({
            content_id: transcript.content.id,
            summary: summaryData.summary,
            key_points: summaryData.key_points || [],
            sentiment: summaryData.sentiment || 'neutral',
            topics: summaryData.topics || [],
            platform: transcript.content.platform
          })

        if (insertError) {
          console.error(`Error inserting summary:`, insertError)
          errors.push({ content_id: transcript.content.id, error: insertError.message })
        } else {
          processed.push({ content_id: transcript.content.id, summary_generated: true })
        }

      } catch (error) {
        console.error(`Error processing transcript:`, error)
        errors.push({
          content_id: transcript.content.id,
          error: error instanceof Error ? error.message : 'Processing failed'
        })
      }
    }

    return NextResponse.json({
      processed,
      errors,
      processingTime: Date.now() - startTime,
      llm_provider: DEFAULT_LLM_PROVIDER
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
