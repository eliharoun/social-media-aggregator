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

    // Get user settings to check enabled platforms
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('enabled_platforms')
      .eq('user_id', user.id)
      .single()

    const enabledPlatforms = userSettings?.enabled_platforms || ['tiktok', 'youtube', 'instagram']

    // Get all active creators for the user, filtered by enabled platforms
    const { data: creators, error: creatorsError } = await supabase
      .from('favorite_creators')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('platform', enabledPlatforms)

    if (creatorsError || !creators || creators.length === 0) {
      return NextResponse.json({
        message: enabledPlatforms.length === 0 
          ? 'No platforms enabled in settings'
          : 'No active creators found for enabled platforms',
        sessionId: null,
        jobsQueued: 0,
        estimatedTime: 0,
        processingTime: Date.now() - startTime,
        enabledPlatforms
      })
    }


    // Create queue manager
    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token
    )

    // Check if user already has an active session
    const existingSession = await queueManager.getUserActiveSession(user.id)
    if (existingSession) {
      return NextResponse.json({
        message: 'Processing already in progress',
        sessionId: existingSession.id,
        jobsQueued: existingSession.total_jobs,
        estimatedTime: Math.max(0, existingSession.total_jobs * 3), // 3 seconds per job estimate
        processingTime: Date.now() - startTime
      })
    }

    // Create new processing session
    const sessionId = await queueManager.createProcessingSession(user.id, creators.length)

    // Queue content fetch jobs for all creators with duplicate handling
    const jobPromises = creators.map(async (creator, index) => {
      try {
        // Newer creators get higher priority (lower number = higher priority)
        const priority = Math.max(1, 10 - index)
        
        return await queueManager.addContentFetchJob(user.id, sessionId, creator, priority)
      } catch (error) {
        // Handle duplicate key constraint violations gracefully
        if (error instanceof Error && error.message.includes('duplicate key value violates unique constraint')) {
          console.log(`Job already exists for creator ${creator.username}, skipping...`)
          return null // Skip this creator
        }
        throw error // Re-throw other errors
      }
    })

    const jobResults = await Promise.allSettled(jobPromises)
    const successfulJobs = jobResults.filter(result => 
      result.status === 'fulfilled' && result.value !== null
    ).length

    // Update session with actual job count (in case some were skipped due to duplicates)
    if (successfulJobs !== creators.length) {
      await queueManager.updateSessionProgress(sessionId, 0, 0) // Reset counters
      // Update total_jobs in session
      await supabase
        .from('processing_sessions')
        .update({ total_jobs: successfulJobs })
        .eq('id', sessionId)
    }

    // Trigger background processing (fire and forget)
    fetch(`${request.nextUrl.origin}/api/queue/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error('Failed to trigger background processing:', err))

    return NextResponse.json({
      message: successfulJobs > 0 ? 'Content fetching queued successfully' : 'All jobs already exist, no new processing needed',
      sessionId,
      jobsQueued: successfulJobs, // Return actual successful jobs, not total creators
      estimatedTime: successfulJobs * 3, // 3 seconds per successful job
      processingTime: Date.now() - startTime,
      queuedCreators: creators.map(c => ({ username: c.username, platform: c.platform })),
      skippedJobs: creators.length - successfulJobs
    })

  } catch (error) {
    console.error('Fetch all content error:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
