import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { DatabaseQueueManager } from '@/lib/queueManager'

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

    // Find transcripts that don't have summaries using a more reliable approach
    // First get all transcript content_ids
    const { data: allTranscripts } = await supabase
      .from('transcripts')
      .select(`
        id,
        content_id,
        transcript_text,
        content!inner (
          id,
          title,
          caption,
          platform,
          creator_username
        )
      `)
      .limit(100) // Get more transcripts to check

    if (!allTranscripts || allTranscripts.length === 0) {
      return NextResponse.json({
        message: 'No transcripts found',
        processed: 0,
        processingTime: Date.now() - startTime
      })
    }

    // Get all existing summary content_ids
    const { data: existingSummaries } = await supabase
      .from('summaries')
      .select('content_id')

    const existingSummaryContentIds = new Set(
      existingSummaries?.map(s => s.content_id) || []
    )

    // Filter transcripts that don't have summaries
    const transcriptsWithoutSummaries = allTranscripts.filter(
      transcript => !existingSummaryContentIds.has(transcript.content_id)
    )

    if (!transcriptsWithoutSummaries || transcriptsWithoutSummaries.length === 0) {
      return NextResponse.json({
        message: 'All transcripts already have summaries',
        processed: 0,
        processingTime: Date.now() - startTime
      })
    }

    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token
    )

    // Create a processing session for summary generation
    const sessionId = await queueManager.createProcessingSession(user.id, transcriptsWithoutSummaries.length)

    // First, clean up any failed jobs for these content_ids to avoid duplicate constraint violations
    const contentIds = transcriptsWithoutSummaries.map(t => t.content_id)
    
    if (contentIds.length > 0) {
      await supabase
        .from('processing_jobs')
        .delete()
        .eq('user_id', user.id)
        .eq('job_type', 'summary')
        .in('job_data->>content_id', contentIds)
        .in('status', ['failed', 'pending']) // Remove failed and pending jobs
    }

    // Queue summary jobs for all transcripts without summaries
    let queuedJobs = 0
    const errors = []

    for (const transcript of transcriptsWithoutSummaries) {
      try {
        const content = Array.isArray(transcript.content) 
          ? transcript.content[0] 
          : transcript.content

        await queueManager.addSummaryJob(
          user.id,
          transcript.content_id,
          transcript.id,
          transcript.transcript_text,
          {
            title: content.title || 'Untitled',
            caption: content.caption || '',
            platform: content.platform,
            creator_username: content.creator_username
          },
          1 // High priority for manual summary generation
        )
        queuedJobs++
      } catch (error) {
        console.error(`Failed to queue summary job for transcript ${transcript.id}:`, error)
        errors.push({
          transcript_id: transcript.id,
          content_id: transcript.content_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Update session with actual job count
    if (queuedJobs !== transcriptsWithoutSummaries.length) {
      await supabase
        .from('processing_sessions')
        .update({ total_jobs: queuedJobs })
        .eq('id', sessionId)
    }

    // Trigger background processing
    if (queuedJobs > 0) {
      fetch(`${request.nextUrl.origin}/api/queue/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => console.error('Failed to trigger background processing:', err))
    }

    return NextResponse.json({
      message: queuedJobs > 0 
        ? `Queued ${queuedJobs} summary generation jobs. Processing in background...`
        : 'No summaries could be queued',
      sessionId,
      transcriptsFound: transcriptsWithoutSummaries.length,
      jobsQueued: queuedJobs,
      errors: errors.length > 0 ? errors : undefined,
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('Ensure summaries error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
