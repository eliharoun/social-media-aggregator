'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { ContentCard } from '@/components/dashboard/ContentCard'
import { InfiniteScrollContainer } from '@/components/dashboard/InfiniteScrollContainer'
import { Content, supabase } from '@/lib/supabase'
import { useContentProcessing } from '@/hooks/useContentProcessing'

interface DashboardState {
  allContent: Content[]
  displayedContent: Content[]
  currentPage: number
  totalPages: number
  isRefreshing: boolean
  isLoadingMore: boolean
}

export default function DashboardPage() {
  const [feedState, setFeedState] = useState<DashboardState>({
    allContent: [],
    displayedContent: [],
    currentPage: 1,
    totalPages: 0,
    isRefreshing: false,
    isLoadingMore: false
  })

  const [filters, setFilters] = useState({
    platform: 'all',
    sortBy: 'newest'
  })

  const [userSettings, setUserSettings] = useState<{ auto_expand_summaries: boolean } | null>(null)

  const { processPage, getStatus, resetStatus, isProcessing } = useContentProcessing()

  // Load user settings for auto-expand functionality
  useEffect(() => {
    loadUserSettings()
  }, [])

  const loadUserSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: settings } = await supabase
        .from('user_settings')
        .select('auto_expand_summaries')
        .eq('user_id', session.user.id)
        .single()

      if (settings) {
        setUserSettings(settings)
      }
    } catch (err) {
      // Use default settings if not found
      setUserSettings({ auto_expand_summaries: false })
    }
  }

  useEffect(() => {
    refreshEntireFeed()
  }, [])

  const refreshEntireFeed = async () => {
    setFeedState(prev => ({ ...prev, isRefreshing: true }))
    resetStatus()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Step 1: Fetch all content from all creators
      const response = await fetch('/api/content/fetch-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        
        // Step 2: Update state with complete dataset
        setFeedState(prev => ({
          ...prev,
          allContent: data.allContent || [],
          displayedContent: data.firstPage || [],
          currentPage: 1,
          totalPages: data.totalPages || 0,
          isRefreshing: false
        }))

        // Step 3: Auto-process first page
        if (data.firstPage && data.firstPage.length > 0) {
          const contentIds = data.firstPage
            .filter((item: Content) => item.id) // Filter out items without IDs
            .map((item: Content) => item.id)
          
          if (contentIds.length > 0) {
            processPage(contentIds)
          }
        }
      } else {
        console.error('Failed to fetch content:', await response.text())
        setFeedState(prev => ({ ...prev, isRefreshing: false }))
      }
    } catch (err) {
      console.error('Failed to refresh feed:', err)
      setFeedState(prev => ({ ...prev, isRefreshing: false }))
    }
  }

  const loadNextPage = async () => {
    if (feedState.isLoadingMore || feedState.currentPage >= feedState.totalPages) return

    setFeedState(prev => ({ ...prev, isLoadingMore: true }))

    try {
      // Get next page from cached content
      const startIndex = feedState.currentPage * 10
      const endIndex = startIndex + 10
      const nextPageContent = feedState.allContent.slice(startIndex, endIndex)

      // Update displayed content
      setFeedState(prev => ({
        ...prev,
        displayedContent: [...prev.displayedContent, ...nextPageContent],
        currentPage: prev.currentPage + 1,
        isLoadingMore: false
      }))

      // Auto-process new page
      if (nextPageContent.length > 0) {
        const contentIds = nextPageContent.map(item => item.id)
        processPage(contentIds)
      }

    } catch (err) {
      console.error('Failed to load next page:', err)
      setFeedState(prev => ({ ...prev, isLoadingMore: false }))
    }
  }

  const hasMore = feedState.currentPage < feedState.totalPages

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Your Feed</h1>
          <p className="text-gray-600">AI-powered summaries from your favorite creators across all platforms</p>
        </div>

        {/* Unified Refresh Button */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Content Feed</h2>
            <button
              onClick={refreshEntireFeed}
              disabled={feedState.isRefreshing}
              className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {feedState.isRefreshing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Refreshing Feed...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Feed
                </>
              )}
            </button>
          </div>

          {feedState.isRefreshing && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 text-blue-700 text-sm mb-4">
              🔄 Fetching latest content from all creators and preparing AI summaries...
            </div>
          )}

          {isProcessing && (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3 text-purple-700 text-sm mb-4">
              🤖 Processing transcripts and generating AI summaries for current page...
            </div>
          )}

          <div className="text-sm text-gray-600">
            <p className="mb-2">
              <strong>Total Content:</strong> {feedState.allContent.length} items across all creators
            </p>
            <p>
              Click &quot;Refresh Feed&quot; to fetch the latest content and automatically generate AI summaries. 
              Scroll up to load more pages with automatic processing.
            </p>
          </div>
        </div>

        {feedState.isRefreshing ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-fadeIn" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="flex gap-4">
                  <div className="w-32 h-48 bg-gray-200 rounded-lg animate-shimmer"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-6 bg-gray-200 rounded w-3/4 animate-shimmer"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 animate-shimmer"></div>
                    <div className="h-4 bg-gray-200 rounded animate-shimmer"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3 animate-shimmer"></div>
                    <div className="flex gap-2 mt-4">
                      <div className="h-8 w-20 bg-gray-200 rounded-lg animate-shimmer"></div>
                      <div className="h-8 w-24 bg-gray-200 rounded-lg animate-shimmer"></div>
                      <div className="h-8 w-20 bg-gray-200 rounded-lg animate-shimmer"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : feedState.displayedContent.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No Content Yet</h2>
            <p className="text-gray-600 mb-6">
              Add some creators and refresh your feed to see AI-powered summaries from your favorite creators.
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
                    Showing {feedState.displayedContent.length} of {feedState.allContent.length}
                  </span>
                  {hasMore && (
                    <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                      Scroll up for more
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Infinite Scroll Container */}
            <InfiniteScrollContainer
              onLoadMore={loadNextPage}
              onRefresh={refreshEntireFeed}
              isLoading={feedState.isLoadingMore}
              hasMore={hasMore}
              enablePullToRefresh={true}
            >
              <div className="grid gap-6">
                {feedState.displayedContent.map((item) => (
                  <ContentCard 
                    key={`content-${item.id}`}
                    content={item} 
                    processingStatus={getStatus(item.id)}
                    autoExpandSummary={userSettings?.auto_expand_summaries || false}
                  />
                ))}
              </div>
            </InfiniteScrollContainer>
          </div>
        )}
      </div>
    </Layout>
  )
}
