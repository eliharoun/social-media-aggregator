'use client'

import { useEffect, useState } from 'react'

interface PerformanceMetrics {
  loadTime: number
  renderTime: number
  apiResponseTimes: Record<string, number>
  cacheHitRate: number
}

export function usePerformance() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    apiResponseTimes: {},
    cacheHitRate: 0
  })

  useEffect(() => {
    // Measure initial load time
    if (typeof window !== 'undefined' && window.performance) {
      const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart
      setMetrics(prev => ({ ...prev, loadTime }))
    }
  }, [])

  const trackApiCall = (endpoint: string, startTime: number) => {
    const responseTime = Date.now() - startTime
    setMetrics(prev => ({
      ...prev,
      apiResponseTimes: {
        ...prev.apiResponseTimes,
        [endpoint]: responseTime
      }
    }))
  }

  const trackCacheHit = (hit: boolean) => {
    // Simple cache hit rate tracking
    const currentHits = parseInt(localStorage.getItem('cacheHits') || '0')
    const currentTotal = parseInt(localStorage.getItem('cacheTotal') || '0')
    
    const newHits = hit ? currentHits + 1 : currentHits
    const newTotal = currentTotal + 1
    
    localStorage.setItem('cacheHits', newHits.toString())
    localStorage.setItem('cacheTotal', newTotal.toString())
    
    const hitRate = newTotal > 0 ? (newHits / newTotal) * 100 : 0
    setMetrics(prev => ({ ...prev, cacheHitRate: hitRate }))
  }

  return {
    metrics,
    trackApiCall,
    trackCacheHit
  }
}
