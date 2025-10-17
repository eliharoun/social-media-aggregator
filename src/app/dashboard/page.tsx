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
  const [showFiltersModal, setShowFiltersModal] = useState(false)

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

    // Sort filter - use created_at for content creation time
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

  // Load existing content from database
  const loadExistingContent = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: cachedContent } = await supabase
        .from('content')
        .select(`
          *,
          transcripts (
            id,
            transcript_text,
            language
          ),
          summaries (
            id,
            summary,
            key_points,
            sentiment,
            topics
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50) // Get first 50 items

      if (cachedContent && cachedContent.length > 0) {
        setFeedState(prev => ({
          ...prev,
          allContent: cachedContent,
          displayedContent: cachedContent.slice(0, 10),
          currentPage: 1,
          totalPages: Math.ceil(cachedContent.length / 10)
        }))
      }
    } catch (err) {
      console.error('Failed to load existing content:', err)
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

      // Start queue-based content fetching
      const response = await fetch('/api/content/fetch-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.sessionId && data.jobsQueued > 0) {
          // Load existing content from database while processing happens in background
          await loadExistingContent()
          setFeedState(prev => ({ ...prev, isRefreshing: false }))
        } else {
          // No jobs queued (no creators or all jobs already exist)
          // Load existing content from database
          await loadExistingContent()
          setFeedState(prev => ({ ...prev, isRefreshing: false }))
        }
      } else {
        const errorText = await response.text()
        console.error('Failed to queue content fetching:', response.status, errorText)
        setFeedState(prev => ({ ...prev, isRefreshing: false }))
      }
    } catch (err) {
      console.error('Failed to refresh feed:', err)
      setFeedState(prev => ({ ...prev, isRefreshing: false }))
    }
  }


  const loadNextPage = async () => {
    if (feedState.isLoadingMore || feedState.currentPage >= feedState.totalPages) {
      return
    }

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

  // Calculate hasMore based on whether there's more content to display
  // This accounts for both pagination and filtering
  const hasMore = feedState.currentPage < feedState.totalPages && filteredDisplayedContent.length < filteredAllContent.length

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Processing Status */}
        {(feedState.isRefreshing || isProcessing) && (
          <div className="mb-6">
            {feedState.isRefreshing && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm text-center">
                🔄 Refreshing content from creators...
              </div>
            )}
            {isProcessing && !feedState.isRefreshing && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-700 text-sm text-center">
                📝 Processing summaries for current page...
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
            {/* Mobile-Optimized Filter Bar - Horizontal Scroll */}
            <div className="mb-4">
              {/* Active Filters Display */}
              {(filters.platform !== 'all' || filters.sortBy !== 'newest' || filters.hideRead) && (
                <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Active:</span>
                  {filters.platform !== 'all' && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium whitespace-nowrap">
                      {filters.platform}
                    </span>
                  )}
                  {filters.sortBy !== 'newest' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium whitespace-nowrap">
                      {filters.sortBy === 'most_liked' ? 'Most Liked' : 
                       filters.sortBy === 'most_viewed' ? 'Most Viewed' : 
                       filters.sortBy === 'oldest' ? 'Oldest' : filters.sortBy}
                    </span>
                  )}
                  {filters.hideRead && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap">
                      Hide Read
                    </span>
                  )}
                  <button
                    onClick={() => setFilters({ platform: 'all', sortBy: 'newest', hideRead: false })}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Horizontal Filter Buttons */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {/* Platform Filter Buttons */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {[
                    { 
                      key: 'all', 
                      label: 'All',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      )
                    },
                    { 
                      key: 'tiktok', 
                      label: 'TikTok',
                      icon: (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.43z"/>
                        </svg>
                      )
                    },
                    { 
                      key: 'youtube', 
                      label: 'YouTube',
                      icon: (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      )
                    },
                    { 
                      key: 'instagram', 
                      label: 'Instagram',
                      icon: (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                      )
                    }
                  ].map((platform) => (
                    <button
                      key={platform.key}
                      onClick={() => setFilters(prev => ({ ...prev, platform: platform.key }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                        filters.platform === platform.key
                          ? 'bg-white text-purple-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      title={platform.label}
                    >
                      {platform.icon}
                      <span className="hidden sm:inline">{platform.label}</span>
                    </button>
                  ))}
                </div>

                {/* Sort Filter Buttons */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {[
                    { 
                      value: 'newest', 
                      label: 'New',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )
                    },
                    { 
                      value: 'oldest', 
                      label: 'Old',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5l-9-2 9 18 9-18-9 2zm0 0v8" />
                        </svg>
                      )
                    },
                    { 
                      value: 'most_liked', 
                      label: 'Liked',
                      icon: (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      )
                    },
                    { 
                      value: 'most_viewed', 
                      label: 'Views',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )
                    }
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => setFilters(prev => ({ ...prev, sortBy: sort.value }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                        filters.sortBy === sort.value
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      title={sort.label}
                    >
                      {sort.icon}
                      <span className="hidden sm:inline">{sort.label}</span>
                    </button>
                  ))}
                </div>

                {/* Hide Read Toggle Button */}
                <button
                  onClick={() => setFilters(prev => ({ ...prev, hideRead: !prev.hideRead }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    filters.hideRead
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {filters.hideRead ? '✓ Hide Read' : 'Hide Read'}
                </button>
              </div>

              {/* Content Count */}
              <div className="text-xs text-gray-500 mt-2">
                Showing {filteredDisplayedContent.length} of {filteredAllContent.length} items
                {(filters.platform !== 'all' || filters.hideRead) && (
                  <span className="text-purple-600 ml-1">• Filtered</span>
                )}
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
