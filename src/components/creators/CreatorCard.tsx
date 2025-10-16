'use client'

import Image from 'next/image'
import { FavoriteCreator } from '@/lib/supabase'

interface CreatorCardProps {
  creator: FavoriteCreator
  onRemove: (id: string) => Promise<void>
  loading: boolean
}

export function CreatorCard({ creator, onRemove, loading }: CreatorCardProps) {
  const platformConfig = {
    tiktok: { 
      name: 'TikTok', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.43z"/>
        </svg>
      ),
      color: 'bg-pink-500',
      textColor: 'text-pink-600',
      bgColor: 'bg-pink-50'
    },
    youtube: { 
      name: 'YouTube', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    instagram: { 
      name: 'Instagram', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
  }

  const config = platformConfig[creator.platform]

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const handleRemove = async () => {
    if (window.confirm(`Remove @${creator.username} from ${config.name}?`)) {
      await onRemove(creator.id)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {creator.avatar_url ? (
              <div className="relative w-16 h-16">
                <Image
                  src={creator.avatar_url}
                  alt={creator.display_name || creator.username}
                  width={64}
                  height={64}
                  className="rounded-full object-cover"
                  onError={() => {
                    // Fallback to icon if image fails to load
                  }}
                />
              </div>
            ) : (
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${config.bgColor}`}>
                {config.icon}
              </div>
            )}
          </div>

          {/* Creator Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-800 truncate">
                {creator.display_name || `@${creator.username}`}
              </h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                {config.name}
              </span>
            </div>
            
            {creator.display_name && (
              <p className="text-gray-600 text-sm mb-2">@{creator.username}</p>
            )}

            {/* Show subscriber count for YouTube, follower count for others */}
            {creator.follower_count && creator.follower_count > 0 && (
              <p className="text-gray-500 text-sm">
                {creator.platform === 'youtube' 
                  ? `${formatNumber(creator.follower_count)} subscribers`
                  : `${formatNumber(creator.follower_count)} followers`
                }
              </p>
            )}

            <p className="text-gray-400 text-xs mt-2">
              Added {new Date(creator.added_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Remove Button */}
        <button
          onClick={handleRemove}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Remove creator"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
