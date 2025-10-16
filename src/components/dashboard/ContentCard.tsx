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
  const [thumbnailError, setThumbnailError] = useState(false)
  const [creatorData, setCreatorData] = useState<{ avatar_url?: string; display_name?: string } | null>(null)

  useEffect(() => {
    fetchSummary()
    fetchTranscript()
    loadUserPreferences()
    fetchCreatorData()
  }, [content.id])

  const fetchCreatorData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: creator } = await supabase
        .from('favorite_creators')
        .select('avatar_url, display_name')
        .eq('username', content.creator_username)
        .eq('platform', content.platform)
        .maybeSingle()

      if (creator) {
        setCreatorData(creator)
      }
    } catch (err) {
      // Silently fail
    }
  }

  // Auto-expand summary when it becomes available (if enabled)
  useEffect(() => {
    if (autoExpandSummary && summary && processingStatus?.hasSummary) {
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

      const { data: summaryData, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('content_id', content.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.log('Summary fetch error:', error)
        return
      }

      if (summaryData) {
        setSummary(summaryData)
      }
    } catch (err) {
      console.log('Summary fetch exception:', err)
    }
  }

  const fetchTranscript = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Simplified query - just get any transcript for this content
      const { data: transcriptData, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('content_id', content.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.log('Transcript fetch error:', error)
        return
      }

      if (transcriptData) {
        setTranscript(transcriptData)
      }
    } catch (err) {
      // Silently fail to avoid resource errors
    }
  }

  const loadUserPreferences = () => {
    const readItems = JSON.parse(localStorage.getItem('readItems') || '[]')
    const savedItems = JSON.parse(localStorage.getItem('savedItems') || '[]')
    
    setIsRead(readItems.includes(content.id))
    setIsSaved(savedItems.includes(content.id))
  }

  const toggleRead = () => {
    const readItems = JSON.parse(localStorage.getItem('readItems') || '[]')
    const updatedItems = isRead 
      ? readItems.filter((id: string) => id !== content.id)
      : [...readItems, content.id]
    
    localStorage.setItem('readItems', JSON.stringify(updatedItems))
    setIsRead(!isRead)
    
    // Dispatch custom event to notify dashboard of read status change
    window.dispatchEvent(new CustomEvent('readItemsChanged'))
  }

  const toggleSaved = () => {
    const savedItems = JSON.parse(localStorage.getItem('savedItems') || '[]')
    const updatedItems = isSaved 
      ? savedItems.filter((id: string) => id !== content.id)
      : [...savedItems, content.id]
    
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
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`)
      alert('Content copied to clipboard!')
    }
  }

  const shareTranscript = async () => {
    if (!transcript) return

    // Create the full text content with transcript and URL
    const fullContent = `${content.title || 'Untitled'}
By @${content.creator_username} on ${config.name}

--- TRANSCRIPT ---
${transcript.transcript_text}

--- ORIGINAL POST ---
${content.content_url}`

    // Try native share first, but always include the full content
    if (navigator.share) {
      try {
        // Some platforms don't handle the text field well, so put everything in text
        await navigator.share({
          title: `Transcript: ${content.title || 'Content'} by @${content.creator_username}`,
          text: fullContent
        })
      } catch (error) {
        // If native share fails, fall back to clipboard
        await navigator.clipboard.writeText(fullContent)
        alert('Transcript and post link copied to clipboard!')
      }
    } else {
      // Clipboard fallback
      await navigator.clipboard.writeText(fullContent)
      alert('Transcript and post link copied to clipboard!')
    }
  }

  const platformConfig = {
    tiktok: { 
      name: 'TikTok', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.43z"/>
        </svg>
      ),
      textColor: 'text-pink-600',
      bgColor: 'bg-pink-50'
    },
    youtube: { 
      name: 'YouTube', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      textColor: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    instagram: { 
      name: 'Instagram', 
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
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
      {/* Responsive Layout */}
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-base sm:text-lg font-semibold text-gray-800 truncate">
              @{content.creator_username}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${config.bgColor} ${config.textColor}`}>
              {config.icon} <span className="hidden sm:inline ml-1">{config.name}</span>
            </span>
          </div>
          
          {/* Processing Status Indicator - Hide when summary is available */}
          {processingStatus && !summary && (
            <div className="flex-shrink-0">
              <ProcessingIndicator 
                status={processingStatus} 
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Content Layout */}
        <div className="flex gap-3 mb-4">
          {/* Thumbnail with Fallback System */}
          <div className="flex-shrink-0">
            <div className="relative w-20 h-28 sm:w-32 sm:h-48 rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
              {content.thumbnail_url && !thumbnailError ? (
                <Image
                  src={content.thumbnail_url}
                  alt={content.title || 'Content thumbnail'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 80px, 128px"
                  onError={() => setThumbnailError(true)}
                />
              ) : (
                // Fallback thumbnail
                <div className="w-full h-full flex flex-col items-center justify-center p-2">
                  {/* Try creator avatar first, then platform logo */}
                  {creatorData?.avatar_url ? (
                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden mb-2">
                      <Image
                        src={creatorData.avatar_url}
                        alt={`${content.creator_username} avatar`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 48px, 64px"
                        onError={() => setCreatorData(prev => prev ? { ...prev, avatar_url: undefined } : null)}
                      />
                    </div>
                  ) : (
                    // Platform logo fallback
                    <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-2 ${config.bgColor}`}>
                      <div className={`text-2xl sm:text-3xl ${config.textColor}`}>
                        {config.icon}
                      </div>
                    </div>
                  )}
                  
                  {/* Creator name */}
                  <div className="text-center">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-600 truncate max-w-full">
                      @{content.creator_username}
                    </p>
                    <p className={`text-[9px] sm:text-xs ${config.textColor} font-medium`}>
                      {config.name}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 line-clamp-2">
              {content.title || 'Untitled'}
            </h3>

            {/* Date and Platform */}
            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 mb-2">
              <span>{content.created_at ? formatDate(content.created_at) : 'Unknown'}</span>
              <span className="sm:hidden">•</span>
              <span className={`sm:hidden px-1.5 py-0.5 rounded text-xs ${config.textColor} ${config.bgColor}`}>
                {config.name}
              </span>
            </div>

            {/* Stats */}
            {content.stats && (
              <div className="flex gap-3 sm:gap-6 text-xs sm:text-sm text-gray-600 mb-3">
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{formatNumber(content.stats.views)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>{formatNumber(content.stats.likes)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>{formatNumber(content.stats.comments)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Caption */}
        {content.caption && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2 sm:line-clamp-3">
            {content.caption}
          </p>
        )}

        {/* Hashtags */}
        {content.hashtags && content.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-2 mb-4">
            {content.hashtags.slice(0, 3).map((tag, idx) => (
              <span key={idx} className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                #{tag}
              </span>
            ))}
            {content.hashtags.length > 3 && (
              <span className="text-xs text-gray-500">
                +{content.hashtags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Primary Actions */}
          <div className="flex gap-2 flex-1">
            <a
              href={content.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 sm:gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">Original</span>
              <span className="sm:hidden">View</span>
            </a>
            
            {summary ? (
              <button
                onClick={() => setShowSummary(!showSummary)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 sm:gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="hidden sm:inline">{showSummary ? 'Hide' : 'Show'} Summary</span>
                <span className="sm:hidden">Summary</span>
              </button>
            ) : (
              <button
                disabled
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 sm:gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>Summary</span>
              </button>
            )}
          </div>

          {/* Secondary Actions */}
          <div className="flex gap-2 justify-center sm:justify-start">
            {transcript && (
              <button
                onClick={() => setShowTranscriptModal(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 sm:py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcript
              </button>
            )}
            
            <button
              onClick={toggleRead}
              className={`inline-flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                isRead 
                  ? 'bg-green-50 text-green-700 hover:bg-green-100' 
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">{isRead ? 'Read' : 'Mark Read'}</span>
              <span className="sm:hidden">Read</span>
            </button>

            <button
              onClick={toggleSaved}
              className={`inline-flex items-center gap-1 px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                isSaved 
                  ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' 
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
              <span className="sm:hidden">Save</span>
            </button>

            <button
              onClick={shareContent}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            >
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>
      </div>

      {/* AI Summary Section */}
      {showSummary && summary && (
        <div className="border-t border-gray-100 p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-blue-50 animate-slideDown">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="text-base sm:text-lg font-semibold text-purple-800">AI Summary</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              summary.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
              summary.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {summary.sentiment}
            </span>
          </div>

          <div className="mb-4">
            <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
              {summary.summary}
            </p>
          </div>

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
                onClick={shareTranscript}
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
