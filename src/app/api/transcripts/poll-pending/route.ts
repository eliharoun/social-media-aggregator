import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Supadata AI configuration (multiple keys for redundancy)
const SUPADATA_API_KEYS = [
  process.env.SUPADATA_API_KEY_1!,
  process.env.SUPADATA_API_KEY_2!,
  process.env.SUPADATA_API_KEY_3!,
]

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

    // Get all pending async transcripts
    const { data: pendingTranscripts } = await supabase
      .from('transcripts')
      .select(`
        id,
        content_id,
        supadata_job_id,
        created_at,
        content!inner (
          id,
          title,
          creator_username,
          platform
        )
      `)
      .eq('processing_status', 'pending_async')
      .not('supadata_job_id', 'is', null)
      .limit(10) // Process max 10 jobs to stay under timeout

    if (!pendingTranscripts || pendingTranscripts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending transcripts found',
        processed: 0,
        processingTime: Date.now() - startTime
      })
    }

    const results = []
    let successCount = 0
    let failedCount = 0
    
    // Process each pending transcript with rate limiting
    for (const transcript of pendingTranscripts) {
      try {
        // Add delay between requests to respect rate limits (1 req/sec)
        if (results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1200)) // 1.2 second delay
        }

        // Try each Supadata API key
        let jobStatus = null
        for (let i = 0; i < SUPADATA_API_KEYS.length; i++) {
          try {
            const { Supadata } = await import('@supadata/js')
            
            const supadata = new Supadata({
              apiKey: SUPADATA_API_KEYS[i],
            })

            jobStatus = await supadata.transcript.getJobStatus(transcript.supadata_job_id)
            break // Success, don't try other keys
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            if (errorMessage.includes('Limit Exceeded')) {
              // Rate limited, try next key
              continue
            }
            throw error // Other errors, propagate
          }
        }

        if (!jobStatus) {
          throw new Error('All Supadata API keys exhausted')
        }

        const content = Array.isArray(transcript.content) ? transcript.content[0] : transcript.content

        if (jobStatus.status === 'completed' && jobStatus.result) {
          // Job completed successfully - update transcript
          const transcriptText = typeof jobStatus.result === 'string' 
            ? jobStatus.result 
            : (jobStatus.result as { content?: string; text?: string }).content || 
              (jobStatus.result as { content?: string; text?: string }).text || 
              JSON.stringify(jobStatus.result)

          const { error: updateError } = await supabase
            .from('transcripts')
            .update({
              transcript_text: transcriptText,
              processing_status: 'completed'
            })
            .eq('id', transcript.id)

          if (updateError) {
            throw new Error(`Failed to update transcript: ${updateError.message}`)
          }

          // Queue summary job
          try {
            const response = await fetch(`${request.nextUrl.origin}/api/summaries/create`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                content_id: transcript.content_id,
                transcript_text: transcriptText,
                content_metadata: {
                  title: content.title || 'Untitled',
                  caption: content.title || '',
                  platform: content.platform,
                  creator_username: content.creator_username
                }
              })
            })

            if (!response.ok) {
              console.error('Failed to create summary for completed transcript')
            }
          } catch (summaryError) {
            console.error('Error creating summary:', summaryError)
          }

          results.push({
            content_id: transcript.content_id,
            title: content.title,
            status: 'completed',
            message: 'Transcript completed successfully'
          })
          successCount++

        } else if (jobStatus.status === 'failed') {
          // Job failed - mark as failed
          await supabase
            .from('transcripts')
            .update({
              processing_status: 'failed'
            })
            .eq('id', transcript.id)

          results.push({
            content_id: transcript.content_id,
            title: content.title,
            status: 'failed',
            message: jobStatus.error || 'Job failed'
          })
          failedCount++

        } else {
          // Job still processing (queued or active)
          results.push({
            content_id: transcript.content_id,
            title: content.title,
            status: jobStatus.status,
            message: `Job is ${jobStatus.status}`
          })
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const content = Array.isArray(transcript.content) ? transcript.content[0] : transcript.content
        
        results.push({
          content_id: transcript.content_id,
          title: content.title,
          status: 'error',
          message: errorMessage
        })
        failedCount++
      }

      // Break early if approaching timeout (keep under 120 seconds)
      if (Date.now() - startTime > 100000) { // 100 seconds
        break
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} pending transcripts`,
      results,
      summary: {
        total: pendingTranscripts.length,
        processed: results.length,
        completed: successCount,
        failed: failedCount,
        stillPending: results.filter(r => r.status === 'queued' || r.status === 'active').length
      },
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('Poll pending transcripts error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
      }
    )

    // Get count of pending transcripts (no auth needed for count)
    const { count } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'pending_async')
      .not('supadata_job_id', 'is', null)

    return NextResponse.json({
      message: 'Poll Pending Transcripts API',
      pendingCount: count || 0,
      usage: 'POST to poll all pending transcript jobs'
    })
  } catch (error) {
    return NextResponse.json({
      message: 'Poll Pending Transcripts API',
      error: 'Could not get pending count'
    })
  }
}
