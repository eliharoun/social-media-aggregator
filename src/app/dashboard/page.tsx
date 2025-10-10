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
    sortBy: 'newest',
    hideRead: false
  })

  const [userSettings, setUserSettings] = useState<{ auto_expand_summaries: boolean } | null>(null)
  const [readItems, setReadItems] = useState<string[]>([])
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const { processPage, getStatus, resetStatus, isProcessing } = useContentProcessing()

  // Apply filters to content
  const getFilteredContent = (content: Content[]) => {
    let filtered = [...content]

    // Platform filter
    if (filters.platform !== 'all') {
      filtered = filtered.filter(item => item.platform === filters.platform)
    }

    // Hide read filter - use readItems state from localStorage
    if (filters.hideRead) {
      filtered = filtered.filter(item => !readItems.includes(item.id))
    }

    // Sort filter
    switch (filters.sortBy) {
      case 'newest':
        filtered.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateB - dateA
        })
        break
      case 'oldest':
        filtered.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateA - dateB
        })
        break
      case 'most_liked':
        filtered.sort((a, b) => (b.stats?.likes || 0) - (a.stats?.likes || 0))
        break
      case 'most_viewed':
        filtered.sort((a, b) => (b.stats?.views || 0) - (a.stats?.views || 0))
        break
    }

    return filtered
  }

  // Get filtered content for display
  const filteredDisplayedContent = getFilteredContent(feedState.displayedContent)
  const filteredAllContent = getFilteredContent(feedState.allContent)

  // Load user settings and read items
  useEffect(() => {
    loadUserSettings()
    loadReadItems()

    // Listen for localStorage changes to update readItems when user marks/unmarks items as read
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'readItems') {
        loadReadItems()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    
    // Also listen for custom events from within the same tab
    const handleReadItemsChange = () => {
      loadReadItems()
    }
    
    window.addEventListener('readItemsChanged', handleReadItemsChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('readItemsChanged', handleReadItemsChange)
    }
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

  const loadReadItems = () => {
    if (typeof window !== 'undefined') {
      const items = JSON.parse(localStorage.getItem('readItems') || '[]')
      setReadItems(items)
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
        {/* Subtle Refresh Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={refreshEntireFeed}
            disabled={feedState.isRefreshing}
            className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-full text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
          >
            {feedState.isRefreshing ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Refreshing...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>

        {/* Processing Status */}
        {(feedState.isRefreshing || isProcessing) && (
          <div className="mb-6">
            {feedState.isRefreshing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm text-center">
                🔄 Fetching latest content and preparing AI summaries...
              </div>
            )}
            {isProcessing && !feedState.isRefreshing && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-700 text-sm text-center">
                🤖 Processing AI summaries for current page...
              </div>
            )}
          </div>
        )}

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
            {/* Collapsible Filter Controls */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              {/* Filter Header - Always Visible */}
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    <svg 
                      className={`w-4 h-4 transition-transform ${filtersExpanded ? 'rotate-90' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium">Filters</span>
                  </button>
                  
                  {/* Quick Status Display */}
                  <div className="text-xs text-gray-500">
                    {filteredDisplayedContent.length} of {filteredAllContent.length}
                    {(filters.platform !== 'all' || filters.hideRead) && (
                      <span className="text-purple-600 ml-1">(filtered)</span>
                    )}
                  </div>
                </div>

                {/* Active Filter Indicators */}
                <div className="flex items-center gap-2">
                  {filters.platform !== 'all' && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      {filters.platform}
                    </span>
                  )}
                  {filters.sortBy !== 'newest' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {filters.sortBy === 'most_liked' ? 'Most Liked' : 
                       filters.sortBy === 'most_viewed' ? 'Most Viewed' : 
                       filters.sortBy === 'oldest' ? 'Oldest' : filters.sortBy}
                    </span>
                  )}
                  {filters.hideRead && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      Hide Read
                    </span>
                  )}
                  {hasMore && (
                    <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded-full text-xs">
                      Scroll ↑
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable Filter Controls */}
              {filtersExpanded && (
                <div className="p-3 sm:p-4 animate-slideDown">
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {/* Platform Filter */}
                    <select
                      value={filters.platform}
                      onChange={(e) => setFilters(prev => ({ ...prev, platform: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                    >
                      <option value="all">All Platforms</option>
                      <option value="tiktok">TikTok</option>
                      <option value="youtube">YouTube</option>
                      <option value="instagram">Instagram</option>
                    </select>

                    {/* Sort Options */}
                    <select
                      value={filters.sortBy}
                      onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="most_liked">Most Liked</option>
                      <option value="most_viewed">Most Viewed</option>
                    </select>

                    {/* Hide Read Toggle */}
                    <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={filters.hideRead}
                        onChange={(e) => setFilters(prev => ({ ...prev, hideRead: e.target.checked }))}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-gray-700">Hide Read</span>
                    </label>

                    {/* Clear Filters Button */}
                    {(filters.platform !== 'all' || filters.sortBy !== 'newest' || filters.hideRead) && (
                      <button
                        onClick={() => setFilters({ platform: 'all', sortBy: 'newest', hideRead: false })}
                        className="px-3 py-2 text-xs sm:text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
              )}
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
                {filteredDisplayedContent.map((item) => (
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
