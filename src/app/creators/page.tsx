'use client'

import { Layout } from '@/components/layout/Layout'
import { CreatorsList } from '@/components/creators/CreatorsList'

export default function CreatorsPage() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <CreatorsList />
      </div>
    </Layout>
  )
}
