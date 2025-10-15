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

        // Use UPSERT to handle unique constraint gracefully
        const { error: upsertError } = await supabase
          .from('summaries')
          .upsert({
            content_id: transcript.content.id,
            summary: summaryData.summary,
            key_points: summaryData.key_points || [],
            sentiment: summaryData.sentiment || 'neutral',
            topics: summaryData.topics || [],
            platform: transcript.content.platform
          }, {
            onConflict: 'content_id',
            ignoreDuplicates: false // Update existing record
          })

        if (upsertError) {
          console.error(`Error upserting summary:`, upsertError)
          errors.push({ content_id: transcript.content.id, error: upsertError.message })
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
