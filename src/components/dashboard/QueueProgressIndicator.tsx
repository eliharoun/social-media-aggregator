'use client'

import { useEffect } from 'react'
import { QueueProgress } from '@/lib/supabase'

interface QueueProgressIndicatorProps {
  progress: QueueProgress
  onComplete?: () => void
}

export function QueueProgressIndicator({ progress, onComplete }: QueueProgressIndicatorProps) {
  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'fetching':
        return (
          <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        )
      case 'transcribing':
        return (
          <svg className="w-5 h-5 text-yellow-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )
      case 'summarizing':
        return (
          <svg className="w-5 h-5 text-purple-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
    }
  }

  const getPhaseText = (phase: string) => {
    switch (phase) {
      case 'fetching': return 'Fetching content from creators...'
      case 'transcribing': return 'Generating transcripts...'
      case 'summarizing': return 'Creating AI summaries...'
      case 'completed': return 'Processing complete!'
      default: return 'Processing...'
    }
  }

  const getPhaseDescription = (phase: string) => {
    switch (phase) {
      case 'fetching': return 'Getting latest videos from TikTok'
      case 'transcribing': return 'Converting videos to searchable text'
      case 'summarizing': return 'Generating intelligent summaries with AI'
      case 'completed': return 'All content processed and ready!'
      default: return 'Working on your content...'
    }
  }

  const progressPercentage = progress.totalJobs > 0 
    ? Math.round((progress.completedJobs / progress.totalJobs) * 100)
    : 0

  // Auto-complete when all jobs are done
  useEffect(() => {
    if (progress.currentPhase === 'completed' && onComplete) {
      setTimeout(onComplete, 1500) // Small delay for user to see completion
    }
  }, [progress.currentPhase, onComplete])

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 sm:p-6 shadow-lg animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-shrink-0">
          {getPhaseIcon(progress.currentPhase)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-gray-800">
            {getPhaseText(progress.currentPhase)}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600">
            {getPhaseDescription(progress.currentPhase)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl sm:text-2xl font-bold text-purple-600">{progressPercentage}%</div>
          <div className="text-xs text-gray-500">
            {progress.completedJobs}/{progress.totalJobs}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-700 ease-out relative"
          style={{ width: `${progressPercentage}%` }}
        >
          {/* Animated shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
        </div>
      </div>

      {/* Phase Indicators */}
      <div className="flex justify-between items-center text-xs sm:text-sm">
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            progress.currentPhase === 'fetching' ? 'bg-blue-500 animate-pulse' : 
            ['transcribing', 'summarizing', 'completed'].includes(progress.currentPhase) ? 'bg-green-500' : 'bg-gray-300'
          }`}></div>
          <span className={progress.currentPhase === 'fetching' ? 'text-blue-600 font-medium' : 'text-gray-500'}>
            Fetch
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            progress.currentPhase === 'transcribing' ? 'bg-yellow-500 animate-pulse' : 
            ['summarizing', 'completed'].includes(progress.currentPhase) ? 'bg-green-500' : 'bg-gray-300'
          }`}></div>
          <span className={progress.currentPhase === 'transcribing' ? 'text-yellow-600 font-medium' : 'text-gray-500'}>
            Transcribe
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            progress.currentPhase === 'summarizing' ? 'bg-purple-500 animate-pulse' : 
            progress.currentPhase === 'completed' ? 'bg-green-500' : 'bg-gray-300'
          }`}></div>
          <span className={progress.currentPhase === 'summarizing' ? 'text-purple-600 font-medium' : 'text-gray-500'}>
            Summarize
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            progress.currentPhase === 'completed' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}></div>
          <span className={progress.currentPhase === 'completed' ? 'text-green-600 font-medium' : 'text-gray-500'}>
            Complete
          </span>
        </div>
      </div>

      {/* Error Display */}
      {progress.failedJobs > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                {progress.failedJobs} job{progress.failedJobs > 1 ? 's' : ''} failed, will retry automatically
              </p>
              <p className="text-xs text-yellow-700">
                Some content may take longer to process due to API limitations
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Completion Message */}
      {progress.currentPhase === 'completed' && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-green-800">
              🎉 All content processed! Your feed is ready with AI summaries.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
