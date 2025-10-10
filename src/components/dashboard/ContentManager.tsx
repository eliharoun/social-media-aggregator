'use client'

import { useState, useEffect } from 'react'
import { FavoriteCreator, Content, supabase } from '@/lib/supabase'

interface ContentManagerProps {
  onContentUpdate: (content: Content[]) => void
}

export function ContentManager({ onContentUpdate }: ContentManagerProps) {
  const [creators, setCreators] = useState<FavoriteCreator[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCreators()
  }, [])

  const fetchCreators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/creators/list', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
      const data = await response.json()

      if (response.ok) {
        setCreators(data.creators || [])
      }
    } catch (err) {
      console.error('Failed to fetch creators:', err)
    }
  }

  const fetchContentForAllCreators = async () => {
    if (creators.length === 0) {
      setError('No creators added yet. Add some creators first!')
      return
    }

    setProcessing(true)
    setError('')
    setProgress('Starting content fetch...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Process creators in chunks of 3-5 to respect Vercel timeout
      const CHUNK_SIZE = 3
      const chunks = []
      for (let i = 0; i < creators.length; i += CHUNK_SIZE) {
        chunks.push(creators.slice(i, i + CHUNK_SIZE))
      }

      const allProcessed: Array<{creator: string, platform: string, videosProcessed: number}> = []
      const allErrors: Array<{creator: string, platform: string, error: string}> = []

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        setProgress(`Processing chunk ${i + 1}/${chunks.length} (${chunk.map(c => c.username).join(', ')})`)

        try {
          const response = await fetch('/api/content/fetch-chunk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              creatorIds: chunk.map(c => c.id)
            }),
          })

          const result = await response.json()

          if (response.ok) {
            allProcessed.push(...result.processed)
            allErrors.push(...result.errors)
          } else {
            allErrors.push({
              creator: 'chunk',
              platform: 'multiple',
              error: result.error || 'Failed to process chunk'
            })
          }
        } catch (err) {
          allErrors.push({
            creator: 'chunk',
            platform: 'multiple',
            error: err instanceof Error ? err.message : 'Network error'
          })
        }

        // Small delay between chunks to prevent overwhelming the API
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Fetch updated content list
      setProgress('Fetching updated content...')
      const contentResponse = await fetch('/api/content/list', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (contentResponse.ok) {
        const contentData = await contentResponse.json()
        console.log('Content fetched:', contentData.content?.length || 0, 'items')
        onContentUpdate(contentData.content || [])
      } else {
        console.error('Failed to fetch content list:', await contentResponse.text())
      }

      // Show results
      const totalVideos = allProcessed.reduce((sum, p) => sum + p.videosProcessed, 0)
      setProgress(`Complete! Processed ${totalVideos} videos from ${allProcessed.length} creators`)

      if (allErrors.length > 0) {
        setError(`Some errors occurred: ${allErrors.map(e => `${e.creator}: ${e.error}`).join('; ')}`)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch content')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Content Aggregation</h2>
        <button
          onClick={fetchContentForAllCreators}
          disabled={processing || creators.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Fetch Latest Content
            </>
          )}
        </button>
      </div>

      {progress && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 text-blue-700 text-sm mb-4">
          {progress}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-600">
        <p className="mb-2">
          <strong>Creators:</strong> {creators.length} added
        </p>
        <p>
          Click &quot;Fetch Latest Content&quot; to get the latest videos from your followed creators.
          This will fetch content from TikTok and cache it for fast access.
        </p>
      </div>
    </div>
  )
}
