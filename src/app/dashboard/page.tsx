'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { ContentManager } from '@/components/dashboard/ContentManager'
import { ContentCard } from '@/components/dashboard/ContentCard'
import { AIProcessor } from '@/components/dashboard/AIProcessor'
import { Content, supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [content, setContent] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    limit: 10,
    offset: 0,
    total: 0,
    hasMore: false
  })
  const [filters, setFilters] = useState({
    platform: 'all',
    sortBy: 'newest'
  })

  useEffect(() => {
    fetchContent()
  }, [])

  const fetchContent = async (offset = 0) => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      console.log('Fetching content list...')
      const response = await fetch(`/api/content/list?limit=10&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      console.log('Content list response status:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Content list data:', data)
        console.log('Content array length:', data.content?.length || 0)
        setContent(data.content || [])
        setPagination({
          limit: data.pagination?.limit || 10,
          offset: data.pagination?.offset || 0,
          total: data.total || 0,
          hasMore: data.hasMore || false
        })
      } else {
        console.error('Content list error:', await response.text())
      }
    } catch (err) {
      console.error('Failed to fetch content:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newOffset: number) => {
    fetchContent(newOffset)
  }

  const handleContentUpdate = (newContent: Content[]) => {
    setContent(newContent)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Your Feed</h1>
          <p className="text-gray-600">AI-powered summaries from your favorite creators across all platforms</p>
        </div>

        <ContentManager onContentUpdate={handleContentUpdate} />
        
        {content.length > 0 && (
          <AIProcessor 
            content={content} 
            onProcessingComplete={() => fetchContent(pagination.offset)} 
          />
        )}

        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md p-6">
                <div className="animate-pulse flex gap-4">
                  <div className="w-32 h-48 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No Content Yet</h2>
            <p className="text-gray-600 mb-6">
              Add some creators and fetch their latest content to see your personalized feed here.
            </p>
            <Link
              href="/creators"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Creators
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filter and Sort Controls */}
            <div className="bg-white rounded-xl shadow-md p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  {/* Platform Filter */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Platform:</label>
                    <select
                      value={filters.platform}
                      onChange={(e) => setFilters(prev => ({ ...prev, platform: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="all">All Platforms</option>
                      <option value="tiktok">🎵 TikTok</option>
                      <option value="youtube">📺 YouTube</option>
                      <option value="instagram">📸 Instagram</option>
                    </select>
                  </div>

                  {/* Sort Options */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Sort:</label>
                    <select
                      value={filters.sortBy}
                      onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="most_liked">Most Liked</option>
                      <option value="most_viewed">Most Viewed</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {pagination.total} total, showing {content.length}
                  </span>
                  <button
                    onClick={() => fetchContent(pagination.offset)}
                    className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              {content.map((item) => (
                <ContentCard key={item.id} content={item} />
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination.total > 10 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => handlePageChange(Math.max(0, pagination.offset - 10))}
                  disabled={pagination.offset === 0}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                <span className="text-sm text-gray-600">
                  Page {Math.floor(pagination.offset / 10) + 1} of {Math.ceil(pagination.total / 10)}
                </span>
                
                <button
                  onClick={() => handlePageChange(pagination.offset + 10)}
                  disabled={!pagination.hasMore}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
