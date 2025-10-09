'use client'

import { Layout } from '@/components/layout/Layout'

export default function CreatorsPage() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Manage Creators</h1>
          <p className="text-gray-600">Add and manage your favorite creators across all platforms</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Multi-Platform Creator Management</h2>
          <p className="text-gray-600 mb-6">
            This feature will be implemented in Phase 2. You&apos;ll be able to add and remove your favorite creators from TikTok, YouTube, and Instagram here.
          </p>
        </div>
      </div>
    </Layout>
  )
}
