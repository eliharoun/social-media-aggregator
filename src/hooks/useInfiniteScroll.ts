'use client'

import { useEffect, useCallback, useRef, useState } from 'react'

interface UseInfiniteScrollOptions {
  threshold?: number
  onLoadMore: () => void
  isLoading: boolean
  hasMore: boolean
  debounceMs?: number
}

export function useInfiniteScroll({
  threshold = 200,
  onLoadMore,
  isLoading,
  hasMore,
  debounceMs = 100
}: UseInfiniteScrollOptions) {
  
  const [isNearTop, setIsNearTop] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollY = useRef(0)
  const hasTriggeredLoad = useRef(false)

  const handleScroll = useCallback(() => {
    if (isLoading || !hasMore) return
    
    const currentScrollY = window.scrollY
    const scrollDirection = currentScrollY < lastScrollY.current ? 'up' : 'down'
    lastScrollY.current = currentScrollY
    
    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Debounce scroll handling for better performance
    debounceRef.current = setTimeout(() => {
      const nearTop = currentScrollY < threshold
      setIsNearTop(nearTop)
      
      // Only trigger load more when scrolling up and near top
      if (nearTop && scrollDirection === 'up' && !hasTriggeredLoad.current) {
        hasTriggeredLoad.current = true
        onLoadMore()
        
        // Reset trigger after a delay to prevent multiple rapid calls
        const timeoutId = setTimeout(() => {
          hasTriggeredLoad.current = false
        }, 1000)
        
        return () => clearTimeout(timeoutId)
      }
    }, debounceMs)
  }, [threshold, onLoadMore, isLoading, hasMore, debounceMs])

  useEffect(() => {
    // Add scroll listener with passive option for better performance
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [handleScroll])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const resetScroll = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    hasTriggeredLoad.current = false
  }, [])

  const scrollToPosition = useCallback((position: number) => {
    window.scrollTo({ top: position, behavior: 'smooth' })
  }, [])

  return {
    isNearTop,
    scrollToTop,
    resetScroll,
    scrollToPosition
  }
}
