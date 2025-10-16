import { createServerClient } from '@supabase/ssr'
import { ProcessingJob, ProcessingSession, QueueProgress, FavoriteCreator } from './supabase'

interface ContentMetadata {
  title: string
  caption: string
  platform: string
  creator_username: string
}

export class DatabaseQueueManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string, authToken?: string) {
    this.supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      global: authToken ? {
        headers: { Authorization: `Bearer ${authToken}` },
      } : {},
    })
  }

  // Session Management
  async createProcessingSession(userId: string, totalJobs: number): Promise<string> {
    const { data, error } = await this.supabase
      .from('processing_sessions')
      .insert({
        user_id: userId,
        session_type: 'content_refresh',
        total_jobs: totalJobs,
        status: 'active'
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create session: ${error.message}`)
    return data.id
  }

  async updateSessionProgress(sessionId: string, completedJobs: number, failedJobs: number): Promise<void> {
    const { error } = await this.supabase
      .from('processing_sessions')
      .update({
        completed_jobs: completedJobs,
        failed_jobs: failedJobs,
        status: completedJobs + failedJobs >= 0 ? 'active' : 'completed'
      })
      .eq('id', sessionId)

    if (error) throw new Error(`Failed to update session: ${error.message}`)
  }

  async completeSession(sessionId: string, errorSummary?: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('processing_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_summary: errorSummary || []
      })
      .eq('id', sessionId)

    if (error) throw new Error(`Failed to complete session: ${error.message}`)
  }

  // Job Management
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async addContentFetchJob(userId: string, sessionId: string, creator: any, priority = 5): Promise<string> {
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .insert({
        user_id: userId,
        job_type: 'content_fetch',
        job_data: { creator, session_id: sessionId },
        status: 'pending',
        priority
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to add content fetch job: ${error.message}`)
    return data.id
  }

  async addTranscriptJob(userId: string, contentId: string, contentUrl: string, priority = 5): Promise<string> {
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .insert({
        user_id: userId,
        job_type: 'transcript',
        job_data: { content_id: contentId, content_url: contentUrl },
        status: 'pending',
        priority
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to add transcript job: ${error.message}`)
    return data.id
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async addSummaryJob(userId: string, contentId: string, transcriptId: string, transcriptText: string, contentMetadata: any, priority = 5): Promise<string> {
    const { data, error } = await this.supabase
      .from('processing_jobs')
      .insert({
        user_id: userId,
        job_type: 'summary',
        job_data: { 
          content_id: contentId, 
          transcript_id: transcriptId, 
          transcript_text: transcriptText,
          content_metadata: contentMetadata
        },
        status: 'pending',
        priority
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to add summary job: ${error.message}`)
    return data.id
  }

  // Job Processing
  async getNextJobs(jobType: string, batchSize = 5): Promise<ProcessingJob[]> {
    // Use a raw SQL query to properly compare retry_count with max_retries column
    const { data, error } = await this.supabase
      .rpc('get_pending_jobs', {
        job_type_param: jobType,
        batch_size_param: batchSize
      })

    if (error) {
      // Fallback to simpler query without retry_count comparison
      console.warn('RPC call failed, using fallback query:', error.message)
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('processing_jobs')
        .select('*')
        .eq('job_type', jobType)
        .eq('status', 'pending')
        .order('priority', { ascending: true }) // Lower number = higher priority
        .order('created_at', { ascending: false }) // Newer content first
        .limit(batchSize)

      if (fallbackError) throw new Error(`Failed to get next jobs: ${fallbackError.message}`)
      
      // Filter out jobs that have exceeded retry limit in JavaScript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filteredData = (fallbackData || []).filter((job: any) => job.retry_count < job.max_retries)
      return filteredData
    }

    return data || []
  }

  async markJobProcessing(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId)

    if (error) throw new Error(`Failed to mark job processing: ${error.message}`)
  }

  async markJobCompleted(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    if (error) throw new Error(`Failed to mark job completed: ${error.message}`)
  }

  async markJobFailed(jobId: string, errorMessage: string, shouldRetry = true): Promise<void> {
    const { data: job } = await this.supabase
      .from('processing_jobs')
      .select('retry_count, max_retries')
      .eq('id', jobId)
      .single()

    const newRetryCount = (job?.retry_count || 0) + 1
    const shouldRetryJob = shouldRetry && newRetryCount < (job?.max_retries || 3)

    const { error } = await this.supabase
      .from('processing_jobs')
      .update({
        status: shouldRetryJob ? 'pending' : 'failed',
        retry_count: newRetryCount,
        error_message: errorMessage,
        completed_at: shouldRetryJob ? null : new Date().toISOString()
      })
      .eq('id', jobId)

    if (error) throw new Error(`Failed to mark job failed: ${error.message}`)
  }

  // Progress Tracking
  async getSessionProgress(sessionId: string): Promise<QueueProgress | null> {
    const { data: session, error } = await this.supabase
      .from('processing_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (error || !session) return null

    // Get current phase based on job types in progress
    const { data: activeJobs } = await this.supabase
      .from('processing_jobs')
      .select('job_type')
      .eq('status', 'processing')
      .eq('job_data->>session_id', sessionId)

    let currentPhase: 'fetching' | 'transcribing' | 'summarizing' | 'completed' = 'completed'
    if (activeJobs && activeJobs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (activeJobs.some((j: any) => j.job_type === 'content_fetch')) currentPhase = 'fetching'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else if (activeJobs.some((j: any) => j.job_type === 'transcript')) currentPhase = 'transcribing'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else if (activeJobs.some((j: any) => j.job_type === 'summary')) currentPhase = 'summarizing'
    }

    return {
      sessionId: session.id,
      totalJobs: session.total_jobs,
      completedJobs: session.completed_jobs,
      failedJobs: session.failed_jobs,
      currentPhase,
      errors: session.error_summary || []
    }
  }

  async getUserActiveSession(userId: string): Promise<ProcessingSession | null> {
    const { data, error } = await this.supabase
      .from('processing_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Failed to get active session: ${error.message}`)
    return data
  }
}
