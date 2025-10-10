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

export async function POST(request: NextRequest) {
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

    // Find unique content that has transcripts but no summaries
    // Get all transcripts without summaries, ordered by content_id and created_at
    const { data: transcriptsWithoutSummaries } = await supabase
      .from('transcripts')
      .select(`
        id,
        content_id,
        transcript_text,
        created_at,
        content (
          id,
          creator_username,
          platform,
          title,
          caption
        )
      `)
      .not('content_id', 'in', `(
        SELECT content_id FROM summaries
      )`)
      .order('content_id')
      .order('created_at', { ascending: false })

    if (!transcriptsWithoutSummaries || transcriptsWithoutSummaries.length === 0) {
      return NextResponse.json({ 
        message: 'All transcripts already have summaries',
        processed: 0 
      })
    }

    // Remove duplicates by content_id (keep only the most recent transcript per content)
    const uniqueTranscripts = transcriptsWithoutSummaries.reduce((acc, transcript) => {
      const existing = acc.find(t => t.content_id === transcript.content_id)
      if (!existing) {
        acc.push(transcript)
      }
      return acc
    }, [] as typeof transcriptsWithoutSummaries)

    // Process only 10 transcripts at a time to avoid timeout
    const transcriptsToProcess = uniqueTranscripts.slice(0, 10)

    const llm = createLLMInstance()
    const results = []

    // Process each unique transcript that needs a summary
    for (const transcript of transcriptsToProcess) {
      try {
        const content = Array.isArray(transcript.content) 
          ? transcript.content[0] 
          : transcript.content
        const prompt = await SUMMARIZATION_PROMPT.format({
          creator: content.creator_username,
          platform: content.platform,
          title: content.title || 'Untitled',
          caption: content.caption || '',
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

        const { error: insertError } = await supabase
          .from('summaries')
          .insert({
            content_id: transcript.content_id,
            summary: summaryData.summary,
            key_points: summaryData.key_points || [],
            sentiment: summaryData.sentiment || 'neutral',
            topics: summaryData.topics || [],
            platform: content.platform
          })

        if (insertError) {
          results.push({
            content_id: transcript.content_id,
            success: false,
            error: insertError.message
          })
        } else {
          results.push({
            content_id: transcript.content_id,
            success: true
          })
        }

      } catch (error) {
        results.push({
          content_id: transcript.content_id,
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed'
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const remaining = Math.max(0, uniqueTranscripts.length - 10)

    return NextResponse.json({
      message: `Generated ${successCount} summaries${remaining > 0 ? `, ${remaining} remaining` : ''}`,
      processed: successCount,
      total: uniqueTranscripts.length,
      remaining: remaining,
      results
    })

  } catch (error) {
    console.error('Ensure summaries error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
