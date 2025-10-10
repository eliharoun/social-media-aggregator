'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ProcessingStatus {
  hasTranscript: boolean
  hasSummary: boolean
  isProcessing: boolean
  error?: string
}

export function useContentProcessing() {
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map())
  const [isProcessing, setIsProcessing] = useState(false)

  const updateStatus = useCallback((contentId: string, status: ProcessingStatus) => {
    setProcessingStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(contentId, status)
      return newMap
    })
  }, [])

  const processPage = useCallback(async (contentIds: string[]) => {
    if (contentIds.length === 0) return

    setIsProcessing(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Set all items to processing state
      contentIds.forEach(id => {
        updateStatus(id, {
          hasTranscript: false,
          hasSummary: false,
          isProcessing: true
        })
      })

      // Call the processing API
      const response = await fetch('/api/content/process-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ contentIds }),
      })

      const result = await response.json()

      if (response.ok && result.results) {
        // Update status based on processing results
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.results.forEach((item: any) => {
          updateStatus(item.content_id, {
            hasTranscript: item.hasTranscript,
            hasSummary: item.hasSummary,
            isProcessing: false,
            error: item.error
          })
        })
      } else {
        // Mark all as failed
        contentIds.forEach(id => {
          updateStatus(id, {
            hasTranscript: false,
            hasSummary: false,
            isProcessing: false,
            error: result.error || 'Processing failed'
          })
        })
      }

    } catch (error) {
      // Mark all as failed
      contentIds.forEach(id => {
        updateStatus(id, {
          hasTranscript: false,
          hasSummary: false,
          isProcessing: false,
          error: error instanceof Error ? error.message : 'Network error'
        })
      })
    } finally {
      setIsProcessing(false)
    }
  }, [updateStatus])

  const getStatus = useCallback((contentId: string): ProcessingStatus => {
    return processingStatus.get(contentId) || {
      hasTranscript: false,
      hasSummary: false,
      isProcessing: false
    }
  }, [processingStatus])

  const resetStatus = useCallback(() => {
    setProcessingStatus(new Map())
    setIsProcessing(false)
  }, [])

  return {
    processPage,
    getStatus,
    resetStatus,
    isProcessing,
    processingStatus
  }
}
