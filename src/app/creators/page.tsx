'use client'

import { Layout } from '@/components/layout/Layout'
import { CreatorsList } from '@/components/creators/CreatorsList'

export default function CreatorsPage() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Manage Creators</h1>
          <p className="text-gray-600">Add and manage your favorite creators across all platforms</p>
        </div>

        <CreatorsList />
      </div>
    </Layout>
  )
}
