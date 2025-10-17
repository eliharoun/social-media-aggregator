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

    // Step 1: Get pending async transcripts
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
      .limit(5) // Process max 5 async jobs

    // Step 2: Get content with failed, empty, or no transcript records
    const { data: contentWithoutTranscripts } = await supabase
      .from('content')
      .select(`
        id,
        title,
        creator_username,
        platform,
        content_url,
        transcripts!left (
          id,
          transcript_text,
          processing_status
        )
      `)
      .or('transcripts.id.is.null,transcripts.processing_status.eq.failed,transcripts.transcript_text.eq.,transcripts.transcript_text.is.null')
      .limit(5) // Process max 5 missing/failed transcripts

    const totalToProcess = (pendingTranscripts?.length || 0) + (contentWithoutTranscripts?.length || 0)

    if (totalToProcess === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending transcripts or missing transcripts found',
        processed: 0,
        processingTime: Date.now() - startTime
      })
    }

    const results = []
    let successCount = 0
    let failedCount = 0
    
    // Process pending async transcripts first
    if (pendingTranscripts && pendingTranscripts.length > 0) {
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
    }
    
    // Process content without transcript records
    if (contentWithoutTranscripts && contentWithoutTranscripts.length > 0 && Date.now() - startTime < 90000) {
      for (const content of contentWithoutTranscripts) {
        try {
          // Add delay between requests to respect rate limits (1 req/sec)
          if (results.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1200)) // 1.2 second delay
          }

          // Try to generate transcript for this content
          let transcriptResult = null
          for (let i = 0; i < SUPADATA_API_KEYS.length; i++) {
            try {
              const { Supadata } = await import('@supadata/js')
              
              const supadata = new Supadata({
                apiKey: SUPADATA_API_KEYS[i],
              })

              transcriptResult = await supadata.transcript({
                url: content.content_url,
                lang: 'en',
                text: true,
                mode: 'auto'
              })
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

          if (!transcriptResult) {
            throw new Error('All Supadata API keys exhausted')
          }

          // Handle async job response
          if ('jobId' in transcriptResult) {
            // Store job ID for async processing using UPSERT
            const { error: upsertError } = await supabase
              .from('transcripts')
              .upsert({
                content_id: content.id,
                transcript_text: '',
                webvtt_data: '',
                language: 'en',
                supadata_job_id: transcriptResult.jobId,
                processing_status: 'pending_async'
              }, {
                onConflict: 'content_id',
                ignoreDuplicates: false
              })

            if (upsertError) {
              throw new Error(`Failed to store async transcript job: ${upsertError.message}`)
            }

            results.push({
              content_id: content.id,
              title: content.title,
              status: 'queued',
              message: 'Transcript job queued for async processing'
            })
          } else {
            // Direct transcript response
            const transcriptText = typeof transcriptResult === 'string' 
              ? transcriptResult 
              : (transcriptResult as { content?: string; text?: string }).content || 
                (transcriptResult as { content?: string; text?: string }).text || 
                JSON.stringify(transcriptResult)

            // Store completed transcript using UPSERT
            const { error: upsertError } = await supabase
              .from('transcripts')
              .upsert({
                content_id: content.id,
                transcript_text: transcriptText,
                webvtt_data: '',
                language: 'en',
                processing_status: 'completed'
              }, {
                onConflict: 'content_id',
                ignoreDuplicates: false
              })

            if (upsertError) {
              throw new Error(`Failed to store transcript: ${upsertError.message}`)
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
                  transcriptIds: [], // Will be filled by the API
                  directSummary: {
                    content_id: content.id,
                    transcript_text: transcriptText,
                    content_metadata: {
                      title: content.title || 'Untitled',
                      caption: content.title || '',
                      platform: content.platform,
                      creator_username: content.creator_username
                    }
                  }
                })
              })

              if (!response.ok) {
                console.error('Failed to create summary for new transcript')
              }
            } catch (summaryError) {
              console.error('Error creating summary:', summaryError)
            }

            results.push({
              content_id: content.id,
              title: content.title,
              status: 'completed',
              message: 'Transcript generated and completed successfully'
            })
            successCount++
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          
          results.push({
            content_id: content.id,
            title: content.title,
            status: 'error',
            message: errorMessage
          })
          failedCount++
        }

        // Break early if approaching timeout
        if (Date.now() - startTime > 100000) { // 100 seconds
          break
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} total items`,
      results,
      summary: {
        total: totalToProcess,
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

    // Get count of async pending transcripts
    const { count: pendingAsyncCount } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('processing_status', 'pending_async')
      .not('supadata_job_id', 'is', null)

    // Get count of content with failed, empty, or no transcript records
    const { data: contentWithoutTranscripts } = await supabase
      .from('content')
      .select(`
        id,
        title,
        creator_username,
        platform,
        transcripts!left (
          id,
          transcript_text,
          processing_status
        )
      `)
      .or('transcripts.id.is.null,transcripts.processing_status.eq.failed,transcripts.transcript_text.eq.,transcripts.transcript_text.is.null')
      .limit(50) // Sample to avoid timeout

    const missingOrFailedTranscriptCount = contentWithoutTranscripts?.length || 0

    return NextResponse.json({
      message: 'Poll Pending Transcripts API',
      pendingAsyncCount: pendingAsyncCount || 0,
      missingTranscriptCount: missingOrFailedTranscriptCount,
      totalPendingCount: (pendingAsyncCount || 0) + missingOrFailedTranscriptCount,
      usage: 'POST to poll all pending transcript jobs and find missing/failed transcripts'
    })
  } catch (error) {
    return NextResponse.json({
      message: 'Poll Pending Transcripts API',
      error: 'Could not get pending count'
    })
  }
}
