'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Content, supabase } from '@/lib/supabase'

interface Summary {
  id: string
  summary: string
  key_points: string[]
  sentiment: string
  topics: string[]
}

interface ContentCardProps {
  content: Content
}

export function ContentCard({ content }: ContentCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    fetchSummary()
  }, [content.id])

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
          <div className="flex gap-3">
            <a
              href={content.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Original
            </a>
            
            {/* AI Summary Button */}
            {summary ? (
              <button
                onClick={() => setShowSummary(!showSummary)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {showSummary ? 'Hide' : 'Show'} AI Summary
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                No Summary Yet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary Section */}
      {showSummary && summary && (
        <div className="border-t border-gray-100 p-6 bg-gradient-to-r from-purple-50 to-blue-50">
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
    </div>
  )
}
