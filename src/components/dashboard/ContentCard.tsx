'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Content, supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { ProcessingStatus } from '@/hooks/useContentProcessing'
import { ProcessingIndicator } from './ProcessingIndicator'

interface Summary {
  id: string
  summary: string
  key_points: string[]
  sentiment: string
  topics: string[]
}

interface Transcript {
  id: string
  transcript_text: string
  webvtt_data?: string
  language: string
}

interface ContentCardProps {
  content: Content
  processingStatus?: ProcessingStatus
  autoExpandSummary?: boolean
}

export function ContentCard({ content, processingStatus, autoExpandSummary = false }: ContentCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [showSummary, setShowSummary] = useState(autoExpandSummary)
  const [showTranscriptModal, setShowTranscriptModal] = useState(false)
  const [isRead, setIsRead] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    fetchSummary()
    fetchTranscript()
    loadUserPreferences()
  }, [content.id])

  // Auto-expand summary when it becomes available (if enabled)
  useEffect(() => {
    if (autoExpandSummary && summary && processingStatus?.hasSummary) {
      // Add a small delay for smooth animation
      setTimeout(() => {
        setShowSummary(true)
      }, 300)
    }
  }, [summary, processingStatus?.hasSummary, autoExpandSummary])

  // Refresh summary and transcript when processing status changes
  useEffect(() => {
    if (processingStatus?.hasSummary && !summary) {
      fetchSummary()
    }
    if (processingStatus?.hasTranscript && !transcript) {
      fetchTranscript()
    }
  }, [processingStatus?.hasSummary, processingStatus?.hasTranscript, summary, transcript])

  const fetchSummary = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: summaryData } = await supabase
        .from('summaries')
        .select('*')
        .eq('content_id', content.id)
        .single()

      if (summaryData) {
        setSummary(summaryData)
      }
    } catch (err) {
      // Summary doesn't exist yet
    }
  }

  const fetchTranscript = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: transcriptData } = await supabase
        .from('transcripts')
        .select('*')
        .eq('content_id', content.id)
        .single()

      if (transcriptData) {
        setTranscript(transcriptData)
      }
    } catch (err) {
      // Transcript doesn't exist yet
    }
  }

  const loadUserPreferences = () => {
    // Load from localStorage for now (could be moved to database later)
    const readItems = JSON.parse(localStorage.getItem('readItems') || '[]')
    const savedItems = JSON.parse(localStorage.getItem('savedItems') || '[]')
    
    setIsRead(readItems.includes(content.id))
    setIsSaved(savedItems.includes(content.id))
  }

  const toggleRead = () => {
    const readItems = JSON.parse(localStorage.getItem('readItems') || '[]')
    let updatedItems
    
    if (isRead) {
      updatedItems = readItems.filter((id: string) => id !== content.id)
    } else {
      updatedItems = [...readItems, content.id]
    }
    
    localStorage.setItem('readItems', JSON.stringify(updatedItems))
    setIsRead(!isRead)
  }

  const toggleSaved = () => {
    const savedItems = JSON.parse(localStorage.getItem('savedItems') || '[]')
    let updatedItems
    
    if (isSaved) {
      updatedItems = savedItems.filter((id: string) => id !== content.id)
    } else {
      updatedItems = [...savedItems, content.id]
    }
    
    localStorage.setItem('savedItems', JSON.stringify(updatedItems))
    setIsSaved(!isSaved)
  }

  const shareContent = async () => {
    const shareData = {
      title: `${content.title || 'Content'} by @${content.creator_username}`,
      text: summary?.summary || content.caption || 'Check out this content!',
      url: content.content_url
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        // User cancelled or error occurred
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`)
      alert('Content copied to clipboard!')
    }
  }

  const platformConfig = {
    tiktok: { 
      name: 'TikTok', 
      icon: '🎵', 
      color: 'bg-pink-500',
      textColor: 'text-pink-600',
      bgColor: 'bg-pink-50'
    },
    youtube: { 
      name: 'YouTube', 
      icon: '📺', 
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    instagram: { 
      name: 'Instagram', 
      icon: '📸', 
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
  }

  const config = platformConfig[content.platform]

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 48) return 'Yesterday'
    return date.toLocaleDateString()
  }

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      <div className="flex gap-4 p-6">
        {/* Thumbnail */}
        {content.thumbnail_url && (
          <div className="flex-shrink-0">
            <div className="relative w-32 h-48 rounded-lg overflow-hidden">
              <Image
                src={content.thumbnail_url}
                alt={content.title || 'Content thumbnail'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 128px, 128px"
              />
            </div>
          </div>
        )}

        {/* Content Info */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-semibold text-gray-800">
              @{content.creator_username}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
              {config.icon} {config.name}
            </span>
            <span className="text-sm text-gray-500">
              • {content.created_at ? formatDate(content.created_at) : 'Unknown date'}
            </span>
            
            {/* Processing Status Indicator */}
            {processingStatus && (
              <div className="ml-auto">
                <ProcessingIndicator 
                  status={processingStatus} 
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-800 mb-2 line-clamp-2">
            {content.title || 'Untitled'}
          </h3>

          {/* Caption */}
          {content.caption && (
            <p className="text-gray-600 mb-3 line-clamp-3">
              {content.caption}
            </p>
          )}

          {/* Hashtags */}
          {content.hashtags && content.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {content.hashtags.slice(0, 5).map((tag, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                  #{tag}
                </span>
              ))}
              {content.hashtags.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{content.hashtags.length - 5} more
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          {content.stats && (
            <div className="flex gap-6 mb-4 text-gray-600 text-sm">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{formatNumber(content.stats.views)}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>{formatNumber(content.stats.likes)}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{formatNumber(content.stats.comments)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <a
              href={content.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Original
            </a>
            
            {/* AI Summary Button */}
            {summary ? (
              <button
                onClick={() => setShowSummary(!showSummary)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {showSummary ? 'Hide' : 'Show'} Summary
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                No Summary
              </button>
            )}

            {/* Transcript Button */}
            {transcript ? (
              <button
                onClick={() => setShowTranscriptModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcript
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                No Transcript
              </button>
            )}

            {/* Mark as Read */}
            <button
              onClick={toggleRead}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isRead 
                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {isRead ? 'Read' : 'Mark Read'}
            </button>

            {/* Save for Later */}
            <button
              onClick={toggleSaved}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSaved 
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {isSaved ? 'Saved' : 'Save'}
            </button>

            {/* Share */}
            <button
              onClick={shareContent}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>
      </div>

      {/* AI Summary Section */}
      {showSummary && summary && (
        <div className="border-t border-gray-100 p-6 bg-gradient-to-r from-purple-50 to-blue-50 animate-slideDown">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="text-lg font-semibold text-purple-800">AI Summary</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              summary.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
              summary.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {summary.sentiment}
            </span>
          </div>

          {/* Summary Text */}
          <div className="mb-4">
            <p className="text-gray-700 leading-relaxed">
              {summary.summary}
            </p>
          </div>

          {/* Key Points */}
          {summary.key_points && summary.key_points.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-gray-800 mb-2">Key Points:</h5>
              <ul className="space-y-1">
                {summary.key_points.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-purple-500 mt-1">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Topics */}
          {summary.topics && summary.topics.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold text-gray-800 mb-2">Topics:</h5>
              <div className="flex flex-wrap gap-2">
                {summary.topics.map((topic, idx) => (
                  <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transcript Modal */}
      <Modal
        isOpen={showTranscriptModal}
        onClose={() => setShowTranscriptModal(false)}
        title={`Transcript - @${content.creator_username}`}
      >
        {transcript ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                {config.icon} {config.name}
              </span>
              <span>•</span>
              <span>Language: {transcript.language.toUpperCase()}</span>
              <span>•</span>
              <span>{content.created_at ? formatDate(content.created_at) : 'Unknown date'}</span>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-2">{content.title || 'Untitled'}</h4>
              {content.caption && (
                <p className="text-gray-600 text-sm mb-3">{content.caption}</p>
              )}
            </div>

            <div className="prose prose-sm max-w-none">
              <h5 className="text-sm font-semibold text-gray-800 mb-3">Full Transcript:</h5>
              <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {transcript.transcript_text}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={shareContent}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                Share Transcript
              </button>
              
              <a
                href={content.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Original
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-600">No transcript available for this content.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
