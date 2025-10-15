import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Transcript API configuration
const TRANSCRIPT_API_KEYS = [
  process.env.TRANSCRIPT_API_KEY_1!,
  process.env.TRANSCRIPT_API_KEY_2!,
]

async function getTranscriptFromAPI(videoUrls: string[], retryCount = 0) {
  const currentApiKey = TRANSCRIPT_API_KEYS[retryCount % TRANSCRIPT_API_KEYS.length]
  
  try {
    const response = await fetch(
      'https://scriptadmin.tokbackup.com/v1/tiktok/fetchMultipleTikTokData?get_transcript=true&ip=54.240.198.36',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey,
        },
        body: JSON.stringify({ videoUrls }),
      }
    )

    if (response.ok) {
      const data = await response.json()
      
      if (data.data && data.data.length > 0) {
        return data.data.map((video: {
          oVideoURL: string;
          id: string;
          subtitles?: string;
        }) => {
          // Extract transcript from WebVTT format
          let transcript = ''
          if (video.subtitles) {
            transcript = video.subtitles
              .split('\n')
              .filter((line: string) => line && !line.includes('-->') && !line.startsWith('WEBVTT') && !line.match(/^\d{2}:\d{2}:\d{2}/))
              .join(' ')
              .trim()
          }
          
          return {
            video_url: video.oVideoURL,
            video_id: video.id,
            transcript: transcript,
            subtitles_webvtt: video.subtitles,
            has_transcript: !!transcript
          }
        })
      }
    }
    
    throw new Error('No transcript data returned')
  } catch (error) {
    if (retryCount < TRANSCRIPT_API_KEYS.length - 1) {
      return getTranscriptFromAPI(videoUrls, retryCount + 1)
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization')
    const token = authorization?.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json(
        { error: 'No authorization token provided' },
        { status: 401 }
      )
    }

    // Create Supabase client with the access token
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {
            // No-op for API routes
          },
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { contentIds } = await request.json()
    
    if (!contentIds || !Array.isArray(contentIds)) {
      return NextResponse.json(
        { error: 'Content IDs array is required' },
        { status: 400 }
      )
    }

    // Get content info for the provided IDs
    const { data: contentItems, error: contentError } = await supabase
      .from('content')
      .select('*')
      .in('id', contentIds)
      .eq('platform', 'tiktok') // Only TikTok supports transcripts for now

    if (contentError || !contentItems) {
      return NextResponse.json(
        { error: 'Failed to fetch content' },
        { status: 500 }
      )
    }

    const processed = []
    const errors = []

    // Process content in small batches to respect timeout
    const BATCH_SIZE = 3
    for (let i = 0; i < contentItems.length; i += BATCH_SIZE) {
      // Check timeout
      if (Date.now() - startTime > 8000) {
        break
      }

      const batch = contentItems.slice(i, i + BATCH_SIZE)
      const videoUrls = batch.map(item => item.content_url)

      try {
        const transcriptResults = await getTranscriptFromAPI(videoUrls)
        
        // Save transcripts to database
        for (let j = 0; j < transcriptResults.length; j++) {
          const result = transcriptResults[j]
          const contentItem = batch[j]
          
          if (result.has_transcript) {
            // Use UPSERT to handle unique constraint gracefully
            const { error: upsertError } = await supabase
              .from('transcripts')
              .upsert({
                content_id: contentItem.id,
                transcript_text: result.transcript,
                webvtt_data: result.subtitles_webvtt,
                language: 'en'
              }, {
                onConflict: 'content_id',
                ignoreDuplicates: false // Update existing record
              })

            if (upsertError) {
              console.error('Error upserting transcript:', upsertError)
              errors.push({
                content_id: contentItem.id,
                error: upsertError.message
              })
            } else {
              processed.push({
                content_id: contentItem.id,
                creator: contentItem.creator_username,
                has_transcript: true
              })
            }
          } else {
            processed.push({
              content_id: contentItem.id,
              creator: contentItem.creator_username,
              has_transcript: false
            })
          }
        }
      } catch (error) {
        batch.forEach(item => {
          errors.push({
            content_id: item.id,
            creator: item.creator_username,
            error: error instanceof Error ? error.message : 'Transcript API failed'
          })
        })
      }
    }

    return NextResponse.json({
      processed,
      errors,
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('Transcript generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
