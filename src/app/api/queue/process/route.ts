import { NextRequest, NextResponse } from 'next/server'
import { DatabaseQueueManager } from '@/lib/queueManager'
import { JobProcessor } from '@/lib/jobProcessor'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const PROCESSING_TIMEOUT = 8000 // 8 seconds to stay within Vercel limits
  
  try {
    // Create queue manager (use service role for background processing)
    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for background processing
    )

    const jobProcessor = new JobProcessor(queueManager)
    const processedJobs = []
    const errors = []

    // Process jobs in priority order with optimized batch sizes and parallel processing
    const jobTypeConfigs = [
      { type: 'content_fetch', batchSize: 3, parallel: false }, // Keep sequential for external API calls
      { type: 'transcript', batchSize: 5, parallel: true },     // Moderate parallelization
      { type: 'summary', batchSize: 8, parallel: true }        // High parallelization for AI calls
    ]
    
    for (const config of jobTypeConfigs) {
      if (Date.now() - startTime > PROCESSING_TIMEOUT - 1000) break // Leave 1s buffer

      const jobs = await queueManager.getNextJobs(config.type, config.batchSize)
      
      if (jobs.length === 0) continue

      if (config.parallel) {
        // Process jobs in parallel for better performance
        const jobPromises = jobs.map(async (job) => {
          try {
            await jobProcessor.processJobWithTimeout(job, 6000) // 6s timeout per job for parallel processing
            return { 
              jobId: job.id, 
              jobType: job.job_type, 
              status: 'completed',
              userId: job.user_id
            }
          } catch (error) {
            return { 
              jobId: job.id, 
              jobType: job.job_type, 
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              userId: job.user_id
            }
          }
        })

        // Wait for all jobs in batch to complete
        const results = await Promise.allSettled(jobPromises)
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value.status === 'completed') {
              processedJobs.push(result.value)
            } else {
              errors.push(result.value)
            }
          } else {
            errors.push({
              jobId: 'unknown',
              jobType: config.type,
              status: 'failed',
              error: result.reason?.message || 'Promise rejected',
              userId: 'unknown'
            })
          }
        })
      } else {
        // Process jobs sequentially for external API calls (content_fetch)
        for (const job of jobs) {
          if (Date.now() - startTime > PROCESSING_TIMEOUT - 1000) break

          try {
            await jobProcessor.processJobWithTimeout(job, 5000) // 5s timeout per job
            processedJobs.push({ 
              jobId: job.id, 
              jobType: job.job_type, 
              status: 'completed',
              userId: job.user_id
            })
          } catch (error) {
            errors.push({ 
              jobId: job.id, 
              jobType: job.job_type, 
              error: error instanceof Error ? error.message : 'Unknown error',
              userId: job.user_id
            })
          }
        }
      }
    }

    // Update session progress for all affected users
    const userSessions = new Map()
    
    // Collect unique user sessions from processed jobs
    for (const job of processedJobs) {
      if (!userSessions.has(job.userId)) {
        try {
          const activeSession = await queueManager.getUserActiveSession(job.userId)
          if (activeSession) {
            userSessions.set(job.userId, activeSession.id)
          }
        } catch (error) {
          console.error(`Failed to get session for user ${job.userId}:`, error)
        }
      }
    }

    // Update progress for each session
    for (const [userId, sessionId] of userSessions) {
      try {
        // Count completed and failed jobs for this session
        const completedCount = processedJobs.filter(j => j.userId === userId).length
        const failedCount = errors.filter(e => e.userId === userId).length
        
        await queueManager.updateSessionProgress(sessionId, completedCount, failedCount)
      } catch (error) {
        console.error(`Failed to update session progress for user ${userId}:`, error)
      }
    }

    // Check if there are still pending jobs and trigger another processing cycle
    const stillPendingJobs = await Promise.all([
      queueManager.getNextJobs('content_fetch', 1),
      queueManager.getNextJobs('transcript', 1), 
      queueManager.getNextJobs('summary', 1)
    ])
    
    const totalPendingJobs = stillPendingJobs.reduce((sum, jobs) => sum + jobs.length, 0)
    
    // If there are still pending jobs and we processed some jobs successfully, trigger another cycle
    if (totalPendingJobs > 0 && processedJobs.length > 0) {
      console.log(`Still ${totalPendingJobs} pending jobs, triggering another processing cycle`)
      
      // Trigger another processing cycle after a short delay (fire and forget)
      setTimeout(() => {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        fetch(`${baseUrl}/api/queue/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error('Failed to trigger next processing cycle:', err))
      }, 2000) // 2 second delay between cycles to avoid overwhelming
    }

    return NextResponse.json({
      processed: processedJobs.length,
      errors: errors.length,
      processingTime: Date.now() - startTime,
      details: { 
        processedJobs: processedJobs.map(j => ({ jobId: j.jobId, jobType: j.jobType, status: j.status })), 
        errors: errors.map(e => ({ jobId: e.jobId, jobType: e.jobType, error: e.error }))
      },
      affectedUsers: userSessions.size,
      pendingJobsRemaining: totalPendingJobs,
      willTriggerNextCycle: totalPendingJobs > 0 && processedJobs.length > 0
    })

  } catch (error) {
    console.error('Queue processing error:', error)
    return NextResponse.json(
      { error: 'Queue processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint for manual testing and health checks
export async function GET() {
  try {
    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get queue statistics
    const contentJobs = await queueManager.getNextJobs('content_fetch', 100)
    const transcriptJobs = await queueManager.getNextJobs('transcript', 100)
    const summaryJobs = await queueManager.getNextJobs('summary', 100)

    return NextResponse.json({
      queueStatus: {
        contentFetch: {
          pending: contentJobs.length,
          nextJob: contentJobs[0] || null
        },
        transcript: {
          pending: transcriptJobs.length,
          nextJob: transcriptJobs[0] || null
        },
        summary: {
          pending: summaryJobs.length,
          nextJob: summaryJobs[0] || null
        }
      },
      totalPendingJobs: contentJobs.length + transcriptJobs.length + summaryJobs.length
    })

  } catch (error) {
    console.error('Queue status error:', error)
    return NextResponse.json(
      { error: 'Failed to get queue status' },
      { status: 500 }
    )
  }
}
