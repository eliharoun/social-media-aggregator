'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Layout } from '@/components/layout/Layout'
import { ContentManager } from '@/components/dashboard/ContentManager'
import { ContentCard } from '@/components/dashboard/ContentCard'
import { Content, supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [content, setContent] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchContent()
  }, [])

  const fetchContent = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      console.log('Fetching content list...')
      const response = await fetch('/api/content/list', {
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
      } else {
        console.error('Content list error:', await response.text())
      }
    } catch (err) {
      console.error('Failed to fetch content:', err)
    } finally {
      setLoading(false)
    }
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">
                Latest Content ({content.length})
              </h2>
              <button
                onClick={fetchContent}
                className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Feed
              </button>
            </div>

            <div className="grid gap-6">
              {content.map((item) => (
                <ContentCard key={item.id} content={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
