'use client'

import { useState, useEffect } from 'react'
import { FavoriteCreator, supabase } from '@/lib/supabase'
import { CreatorCard } from './CreatorCard'
import { AddCreatorForm } from './AddCreatorForm'

export function CreatorsList() {
  const [creators, setCreators] = useState<FavoriteCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch creators on component mount
  useEffect(() => {
    fetchCreators()
  }, [])

  const fetchCreators = async (isRefresh = false) => {
    try {
      // Only show full loading on initial load, not on refresh
      if (!isRefresh) {
        setLoading(true)
      }
      
      // Get the current session to pass the access token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/creators/list', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch creators')
      }

      setCreators(data.creators)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creators')
    } finally {
      if (!isRefresh) {
        setLoading(false)
      }
    }
  }

  const handleAddCreator = async (creatorData: { platform: string; username: string }) => {
    try {
      setActionLoading(true)
      setError('')

      // Get the current session to pass the access token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/creators/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(creatorData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add creator')
      }

      // Add the new creator to the list
      setCreators(prev => [data.creator, ...prev])
    } catch (err) {
      throw err // Re-throw to be handled by AddCreatorForm
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveCreator = async (creatorId: string) => {
    try {
      setActionLoading(true)
      setError('')

      // Get the current session to pass the access token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/creators/remove', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ creatorId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove creator')
      }

      // Remove the creator from the list
      setCreators(prev => prev.filter(c => c.id !== creatorId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove creator')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-md p-6">
            <div className="animate-pulse flex items-start gap-4">
              <div className="w-16 h-16 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AddCreatorForm onAdd={handleAddCreator} loading={actionLoading} />

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {creators.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Creators Added Yet</h3>
          <p className="text-gray-600">
            Use the form above to add your first creator from TikTok, YouTube, or Instagram.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">
              Your Creators ({creators.length})
            </h2>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                fetchCreators(true) // Pass true to indicate this is a refresh
              }}
              disabled={actionLoading}
              className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {actionLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="grid gap-4">
            {creators.map((creator) => (
              <CreatorCard
                key={creator.id}
                creator={creator}
                onRemove={handleRemoveCreator}
                loading={actionLoading}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
