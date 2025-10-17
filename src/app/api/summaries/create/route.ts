import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { summarizationService, ContentMetadata, SummarizationService } from '@/lib/summarizationService'

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

    const processed: Array<{ content_id: string; summary_generated?: boolean; already_exists?: boolean }> = []
    const errors: Array<{ content_id: string; error: string }> = []

    // Process transcripts sequentially to avoid timeout issues
    for (const transcript of transcripts) {
      if (Date.now() - startTime > 8000) {
        break
      }

      try {
        const metadata: ContentMetadata = {
          creator_username: transcript.content.creator_username,
          platform: transcript.content.platform,
          title: transcript.content.title || 'Untitled',
          caption: transcript.content.caption || ''
        }

        // Use shared summarization service with extended fields for API route
        const summaryData = await summarizationService.generateSummary(
          transcript.transcript_text,
          metadata,
          { includeExtendedFields: true }
        )

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
      llm_provider: SummarizationService.getProvider()
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
