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

            {creator.follower_count && (
              <p className="text-gray-500 text-sm">
                {formatNumber(creator.follower_count)} followers
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
