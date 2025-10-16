'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { QueueProgress } from '@/lib/supabase'

export function useQueueProgress() {
  const [progress, setProgress] = useState<QueueProgress | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkProgress = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setIsActive(false)
        setProgress(null)
        return
      }

      const response = await fetch('/api/queue/progress', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.hasActiveSession && data.progress) {
          setIsActive(true)
          setProgress(data.progress)
          setError(null)
          
          // Check if session should be completed (all jobs done)
          if (data.progress.completedJobs + data.progress.failedJobs >= data.progress.totalJobs) {
            // Session is complete, stop tracking
            setIsActive(false)
            // Keep progress for a moment to show completion
            setTimeout(() => setProgress(null), 3000)
          }
        } else {
          // No active session
          setIsActive(false)
          if (isActive) {
            // Was active, now completed - keep progress briefly
            setTimeout(() => setProgress(null), 2000)
          }
        }
      } else {
        setError('Failed to fetch progress')
        setIsActive(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsActive(false)
    }
  }, [isActive])

  // Poll for progress updates every 2 seconds when active
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(checkProgress, 2000)
    return () => clearInterval(interval)
  }, [isActive, checkProgress])

  // Initial progress check on mount
  useEffect(() => {
    checkProgress()
  }, [checkProgress])

  const startProgressTracking = useCallback(() => {
    setIsActive(true)
    setError(null)
    checkProgress()
  }, [checkProgress])

  const stopProgressTracking = useCallback(() => {
    setIsActive(false)
    setProgress(null)
    setError(null)
  }, [])

  const refreshProgress = useCallback(() => {
    checkProgress()
  }, [checkProgress])

  return {
    progress,
    isActive,
    error,
    startProgressTracking,
    stopProgressTracking,
    refreshProgress
  }
}
