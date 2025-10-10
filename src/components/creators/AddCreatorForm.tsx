'use client'

import { useState } from 'react'

interface AddCreatorFormProps {
  onAdd: (creator: { platform: string; username: string }) => Promise<void>
  loading: boolean
}

export function AddCreatorForm({ onAdd, loading }: AddCreatorFormProps) {
  const [platform, setPlatform] = useState<'tiktok' | 'youtube' | 'instagram'>('tiktok')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')

  const platforms = [
    { 
      id: 'tiktok', 
      name: 'TikTok', 
      icon: '🎵',
      placeholder: '@username',
      color: 'bg-pink-500',
      enabled: true
    },
    { 
      id: 'youtube', 
      name: 'YouTube', 
      icon: '📺',
      placeholder: '@channelname or channel URL',
      color: 'bg-red-500',
      enabled: false,
      comingSoon: true
    },
    { 
      id: 'instagram', 
      name: 'Instagram', 
      icon: '📸',
      placeholder: '@username',
      color: 'bg-purple-500',
      enabled: false,
      comingSoon: true
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('Please enter a username')
      return
    }

    // Clean username (remove @ if present)
    const cleanUsername = username.replace('@', '').trim()

    if (cleanUsername.length < 2) {
      setError('Username must be at least 2 characters')
      return
    }

    try {
      await onAdd({ platform, username: cleanUsername })
      setUsername('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add creator')
    }
  }

  const selectedPlatform = platforms.find(p => p.id === platform)

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Add New Creator</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Platform Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select Platform
          </label>
          <div className="grid grid-cols-3 gap-3">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.enabled && setPlatform(p.id as 'tiktok' | 'youtube' | 'instagram')}
                disabled={!p.enabled}
                className={`p-4 rounded-lg border-2 transition-all relative ${
                  platform === p.id && p.enabled
                    ? `border-pink-500 bg-pink-50 ${p.color} text-white`
                    : p.enabled
                    ? 'border-gray-200 hover:border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <div className={`font-medium ${
                    platform === p.id && p.enabled 
                      ? 'text-white' 
                      : p.enabled 
                      ? 'text-gray-800'
                      : 'text-gray-500'
                  }`}>
                    {p.name}
                  </div>
                  {p.comingSoon && (
                    <div className="text-xs text-gray-400 mt-1">
                      Coming Soon
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Username Input */}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
            {selectedPlatform?.name} Username
          </label>
          <div className="relative">
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={selectedPlatform?.placeholder}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-pink-500 focus:outline-none transition-colors"
              disabled={loading}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <span className="text-2xl">{selectedPlatform?.icon}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username.trim()}
          className="w-full py-3 px-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Adding Creator...' : `Add ${selectedPlatform?.name} Creator`}
        </button>
      </form>
    </div>
  )
}
