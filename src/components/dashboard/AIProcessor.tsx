'use client'

import { useState } from 'react'
import { Content, supabase } from '@/lib/supabase'

interface AIProcessorProps {
  content: Content[]
  onProcessingComplete: (offset?: number) => void
}

export function AIProcessor({ content, onProcessingComplete }: AIProcessorProps) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const processAIForContent = async () => {
    if (content.length === 0) {
      setError('No content available for AI processing')
      return
    }

    setProcessing(true)
    setError('')
    setProgress('Starting AI processing...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Step 1: Generate transcripts for TikTok content
      const tiktokContent = content.filter(c => c.platform === 'tiktok')
      
      if (tiktokContent.length > 0) {
        setProgress(`Generating transcripts for ${tiktokContent.length} TikTok videos...`)
        
        const transcriptResponse = await fetch('/api/transcripts/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            contentIds: tiktokContent.map(c => c.id)
          }),
        })

        const transcriptResult = await transcriptResponse.json()
        
        if (transcriptResponse.ok) {
          const transcriptsGenerated = transcriptResult.processed?.filter((p: { has_transcript: boolean }) => p.has_transcript).length || 0
          setProgress(`Generated ${transcriptsGenerated} transcripts`)
        } else {
          console.error('Transcript generation failed:', transcriptResult.error)
        }
      }

      // Step 2: Generate AI summaries for content with transcripts (batch processing)
      setProgress('Generating AI summaries...')
      
      // Get transcripts that were just created or already exist
      const { data: availableTranscripts } = await supabase
        .from('transcripts')
        .select('id, content_id')
        .in('content_id', content.map(c => c.id))

      if (availableTranscripts && availableTranscripts.length > 0) {
        let totalSummariesGenerated = 0
        let batchNumber = 1
        
        // Process transcripts in batches of 3 to stay within timeout limits
        const BATCH_SIZE = 3
        for (let i = 0; i < availableTranscripts.length; i += BATCH_SIZE) {
          const batch = availableTranscripts.slice(i, i + BATCH_SIZE)
          
          setProgress(`Generating AI summaries... Batch ${batchNumber} (${i + 1}-${Math.min(i + BATCH_SIZE, availableTranscripts.length)} of ${availableTranscripts.length})`)
          
          try {
            const summaryResponse = await fetch('/api/summaries/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                transcriptIds: batch.map(t => t.id)
              }),
            })

            const summaryResult = await summaryResponse.json()
            
            if (summaryResponse.ok) {
              const batchSummariesGenerated = summaryResult.processed?.filter((p: { summary_generated: boolean }) => p.summary_generated).length || 0
              totalSummariesGenerated += batchSummariesGenerated
              console.log(`Batch ${batchNumber} completed: ${batchSummariesGenerated} summaries generated`)
            } else {
              console.error(`Batch ${batchNumber} failed:`, summaryResult.error)
            }
          } catch (batchError) {
            console.error(`Batch ${batchNumber} error:`, batchError)
          }
          
          batchNumber++
        }
        
        setProgress(`Complete! Generated ${totalSummariesGenerated} AI summaries using OpenAI`)
      } else {
        setProgress('No transcripts available for summarization')
      }

      // Trigger content refresh
      onProcessingComplete()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const tiktokCount = content.filter(c => c.platform === 'tiktok').length

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">AI Processing</h2>
        <button
          onClick={processAIForContent}
          disabled={processing || content.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Generate AI Summaries
            </>
          )}
        </button>
      </div>

      {progress && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3 text-purple-700 text-sm mb-4">
          {progress}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-600">
        <p className="mb-2">
          <strong>Available Content:</strong> {content.length} items ({tiktokCount} TikTok videos)
        </p>
        <p>
          Click &quot;Generate AI Summaries&quot; to extract transcripts and create AI-powered summaries.
          This will process TikTok videos and generate concise summaries with key points.
        </p>
      </div>
    </div>
  )
}
