'use client'

import { useState, useRef, useEffect } from 'react'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

interface InfiniteScrollContainerProps {
  onLoadMore: () => void
  onRefresh?: () => void
  isLoading: boolean
  hasMore: boolean
  children: React.ReactNode
  loadingComponent?: React.ReactNode
  enablePullToRefresh?: boolean
}

export function InfiniteScrollContainer({
  onLoadMore,
  onRefresh,
  isLoading,
  hasMore,
  children,
  loadingComponent,
  enablePullToRefresh = true
}: InfiniteScrollContainerProps) {
  
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const { isNearBottom, scrollToTop } = useInfiniteScroll({
    threshold: 200,
    onLoadMore,
    isLoading,
    hasMore,
    debounceMs: 150
  })

  const [showScrollIndicator, setShowScrollIndicator] = useState(false)

  // Show scroll indicator when user is near bottom and there's more content
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollPercentage = (scrollY + windowHeight) / documentHeight
      
      // Show indicator when user has scrolled 70% down and there's more content
      setShowScrollIndicator(scrollPercentage > 0.7 && hasMore && !isLoading)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, isLoading])

  // Pull-to-refresh functionality for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enablePullToRefresh || window.scrollY > 0) return
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enablePullToRefresh || window.scrollY > 0 || !onRefresh) return
    
    const currentY = e.touches[0].clientY
    const distance = currentY - touchStartY.current
    
    if (distance > 0 && distance < 150) {
      setPullDistance(distance)
      setIsPulling(true)
      e.preventDefault()
    }
  }

  const handleTouchEnd = () => {
    if (!enablePullToRefresh || !isPulling || !onRefresh) return
    
    if (pullDistance > 80) {
      onRefresh()
    }
    
    setIsPulling(false)
    setPullDistance(0)
  }

  // Enhanced loading component with better animations
  const defaultLoadingComponent = (
    <div className="flex flex-col items-center justify-center py-8 bg-white rounded-xl shadow-md border-2 border-dashed border-gray-200">
      <div className="relative mb-4">
        {/* Animated loading rings */}
        <div className="w-12 h-12 relative">
          <div className="absolute inset-0 border-4 border-purple-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute inset-2 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Loading more content...</h3>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          <span>Fetching</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <span>Transcribing</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          <span>Summarizing</span>
        </div>
      </div>
    </div>
  )

  // Pull-to-refresh indicator
  const pullToRefreshIndicator = isPulling && (
    <div 
      className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-purple-500 to-transparent transition-all duration-300"
      style={{ 
        height: `${Math.min(pullDistance, 100)}px`,
        opacity: pullDistance / 100 
      }}
    >
      <div className="flex items-center justify-center h-full">
        <div className={`text-white transition-transform duration-300 ${pullDistance > 80 ? 'scale-110' : 'scale-100'}`}>
          {pullDistance > 80 ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7m0 0l-7 7m7-7v18" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div 
      ref={containerRef}
      className="space-y-6 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullToRefreshIndicator}
      
      {/* Main content */}
      <div className="transition-all duration-300">
        {children}
      </div>
      
      {/* Show loading indicator at bottom when loading more */}
      {isLoading && hasMore && (
        <div className="mt-6 animate-fadeIn">
          {loadingComponent || defaultLoadingComponent}
        </div>
      )}
      
      {/* End of content indicator */}
      {!hasMore && (
        <div className="text-center py-8 animate-fadeIn">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-600 rounded-full text-sm shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            You&apos;ve reached the end of your feed
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Refresh your feed to check for new content
          </p>
        </div>
      )}
      
      {/* Enhanced Scroll Indicator for Loading More Content */}
      {showScrollIndicator && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 animate-pulse">
            <div className="flex flex-col items-center">
              <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7m0 0l-7 7m7-7v18" />
              </svg>
              <div className="w-1 h-4 bg-white/30 rounded-full mt-1">
                <div className="w-1 h-2 bg-white rounded-full animate-ping"></div>
              </div>
            </div>
            <div className="text-sm font-medium">
              <div>Scroll up for more</div>
            </div>
          </div>
        </div>
      )}

      {/* Scroll to top button - positioned above bottom nav */}
      {typeof window !== 'undefined' && window.scrollY > 400 && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-full shadow-lg transition-all duration-300 flex items-center justify-center hover:scale-110"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}

      {/* Bottom Load More Indicator - appears at very bottom */}
      {hasMore && !isLoading && isNearBottom && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-white border-2 border-purple-200 text-purple-700 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm font-medium">Keep scrolling...</span>
          </div>
        </div>
      )}
    </div>
  )
}
