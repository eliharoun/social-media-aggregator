'use client'

import { ProcessingStatus } from '@/hooks/useContentProcessing'

interface ProcessingIndicatorProps {
  status: ProcessingStatus
  size?: 'sm' | 'md' | 'lg'
}

export function ProcessingIndicator({ status, size = 'sm' }: ProcessingIndicatorProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  const iconSize = sizeClasses[size]

  if (status.error) {
    return (
      <div className={`${iconSize} text-red-500 bg-red-50 rounded-full p-1 shadow-sm`} title="Processing failed">
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    )
  }

  if (status.isProcessing) {
    return (
      <div className={`${iconSize} text-blue-500 bg-blue-50 rounded-full p-1 shadow-sm`} title="Processing content...">
        <svg className="w-full h-full animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    )
  }

  if (status.hasTranscript && status.hasSummary) {
    // Hide the indicator once processing is complete
    return null
  }

  if (status.hasTranscript) {
    return (
      <div className={`${iconSize} text-yellow-500 bg-yellow-50 rounded-full p-1 shadow-sm`} title="Generating AI summary...">
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
    )
  }

  return (
    <div className={`${iconSize} text-gray-400 bg-gray-50 rounded-full p-1 shadow-sm`} title="Transcribing...">
      <svg className="w-full h-full animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  )
}
