import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { DatabaseQueueManager } from '@/lib/queueManager'

export async function GET(request: NextRequest) {
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

    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token
    )

    // Get user's active session
    const activeSession = await queueManager.getUserActiveSession(user.id)
    
    if (!activeSession) {
      return NextResponse.json({ 
        hasActiveSession: false,
        progress: null,
        message: 'No active processing session found'
      })
    }

    // Get progress for active session
    const progress = await queueManager.getSessionProgress(activeSession.id)

    // Check if session should be completed
    if (progress && progress.completedJobs + progress.failedJobs >= progress.totalJobs && progress.totalJobs > 0) {
      console.log('Completing session:', activeSession.id)
      // Mark session as completed
      await queueManager.completeSession(activeSession.id, progress.errors)
      
      return NextResponse.json({
        hasActiveSession: false,
        progress: {
          ...progress,
          currentPhase: 'completed' as const
        },
        session: {
          ...activeSession,
          status: 'completed'
        },
        message: 'Processing session completed'
      })
    }

    // SPECIAL CASE: If progress shows completed phase but session is still active
    // This happens when jobs exist but aren't being tracked properly
    if (progress && progress.currentPhase === 'completed' && activeSession.status === 'active') {
      console.log('Fixing stuck completed session:', activeSession.id)
      // Mark session as completed
      await queueManager.completeSession(activeSession.id, progress.errors || ['Session was stuck in completed phase'])
      
      return NextResponse.json({
        hasActiveSession: false,
        progress: {
          ...progress,
          currentPhase: 'completed' as const
        },
        session: {
          ...activeSession,
          status: 'completed'
        },
        message: 'Fixed stuck completed session'
      })
    }

    // If session has 0 total jobs, complete it immediately
    if (activeSession.total_jobs === 0) {
      console.log('Completing empty session:', activeSession.id)
      await queueManager.completeSession(activeSession.id, ['No jobs to process'])
      
      return NextResponse.json({
        hasActiveSession: false,
        progress: null,
        message: 'Empty session completed'
      })
    }

    // If no progress data but session exists, it might be a stale session
    if (!progress && activeSession) {
      // Check if there are any jobs for this session (any status)
      const { data: sessionJobs } = await supabase
        .from('processing_jobs')
        .select('id, status')
        .eq('job_data->>session_id', activeSession.id)
        .limit(10)

      console.log('Session jobs check:', {
        sessionId: activeSession.id,
        jobsFound: sessionJobs?.length || 0,
        jobs: sessionJobs
      })

      // If no jobs found for this session, complete it
      if (!sessionJobs?.length) {
        console.log('Completing session with no jobs:', activeSession.id)
        await queueManager.completeSession(activeSession.id, ['No jobs found for session'])
        
        return NextResponse.json({
          hasActiveSession: false,
          progress: null,
          message: 'Session with no jobs completed'
        })
      }

      // If session is old (>2 minutes) and has no pending jobs, complete it
      const sessionAge = Date.now() - new Date(activeSession.started_at).getTime()
      const hasPendingJobs = sessionJobs.some(job => job.status === 'pending')
      
      if (sessionAge > 2 * 60 * 1000 && !hasPendingJobs) {
        console.log('Completing stale session:', activeSession.id)
        await queueManager.completeSession(activeSession.id, ['Session timed out'])
        
        return NextResponse.json({
          hasActiveSession: false,
          progress: null,
          message: 'Stale session completed'
        })
      }
    }

    return NextResponse.json({
      hasActiveSession: true,
      progress,
      session: activeSession,
      message: 'Processing in progress'
    })

  } catch (error) {
    console.error('Progress tracking error:', error)
    return NextResponse.json({ 
      error: 'Failed to get progress', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

// POST endpoint to manually trigger progress updates (for testing)
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

    const { action, sessionId } = await request.json()

    const queueManager = new DatabaseQueueManager(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token
    )

    switch (action) {
      case 'complete_session':
        if (!sessionId) {
          return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
        }
        
        await queueManager.completeSession(sessionId, [])
        return NextResponse.json({ message: 'Session completed successfully' })

      case 'get_job_counts':
        // Get detailed job counts for debugging
        const contentJobs = await queueManager.getNextJobs('content_fetch', 1000)
        const transcriptJobs = await queueManager.getNextJobs('transcript', 1000)
        const summaryJobs = await queueManager.getNextJobs('summary', 1000)

        return NextResponse.json({
          jobCounts: {
            content_fetch: contentJobs.length,
            transcript: transcriptJobs.length,
            summary: summaryJobs.length,
            total: contentJobs.length + transcriptJobs.length + summaryJobs.length
          },
          userActiveSession: await queueManager.getUserActiveSession(user.id)
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Progress action error:', error)
    return NextResponse.json({ 
      error: 'Failed to process action', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
