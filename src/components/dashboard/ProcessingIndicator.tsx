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
      <div className={`${iconSize} text-red-500 bg-red-50 rounded-full p-1 shadow-sm animate-bounce`} title="Processing failed - Click to retry">
        <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    )
  }

  if (status.isProcessing) {
    return (
      <div className={`${iconSize} text-blue-500 bg-blue-50 rounded-full p-1 shadow-sm animate-pulse`} title="Processing content...">
        <svg className="w-full h-full animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
      <div className={`${iconSize} text-amber-500 bg-amber-50 rounded-full p-1 shadow-sm`} title="Generating AI summary...">
        <svg className="w-full h-full animate-bounce" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.5 3A6.5 6.5 0 0 0 3 9.5c0 1.61.59 3.09 1.56 4.23l.27.31-.09.49c-.28 1.48-.25 2.54.08 3.19.33.65 1.02.95 2.07.95.37 0 .8-.05 1.29-.15l.49-.1.36.28A6.47 6.47 0 0 0 9.5 18.5c3.59 0 6.5-2.91 6.5-6.5S13.09 3 9.5 3z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className={`${iconSize} text-purple-500 bg-purple-50 rounded-full p-1 shadow-sm`} title="Generating transcript...">
      <svg className="w-full h-full animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={2}/>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2"/>
      </svg>
    </div>
  )
}
