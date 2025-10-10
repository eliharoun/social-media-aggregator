import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// TikTok API configuration (from existing proof of concept)
const RAPIDAPI_KEYS = [
  process.env.RAPIDAPI_KEY_1!,
  process.env.RAPIDAPI_KEY_2!,
  process.env.RAPIDAPI_KEY_3!,
]

async function fetchTikTokVideos(username: string, secUid: string, count = 10) {
  for (let i = 0; i < RAPIDAPI_KEYS.length; i++) {
    try {
      const response = await fetch(
        `https://tiktok-api23.p.rapidapi.com/api/user/posts?secUid=${secUid}&count=${count}&cursor=0`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEYS[i],
            'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        const itemList = data.data?.itemList || data.itemList || []
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return itemList.map((video: any) => ({
          platform_content_id: video.id,
          platform: 'tiktok',
          creator_username: username,
          creator_platform: 'tiktok',
          title: video.desc?.replace(/#[\w]+/g, '').trim() || 'Untitled',
          caption: video.desc || '',
          hashtags: (video.desc?.match(/#[\w]+/g) || []).map((tag: string) => tag.substring(1)),
          thumbnail_url: video.video?.cover || video.video?.originCover || '',
          content_url: `https://www.tiktok.com/@${username}/video/${video.id}`,
          content_type: 'video',
          created_at: new Date(video.createTime * 1000).toISOString(),
          stats: {
            views: video.stats?.playCount || 0,
            likes: video.stats?.diggCount || 0,
            comments: video.stats?.commentCount || 0,
            shares: video.stats?.shareCount || 0
          }
        }))
      }
    } catch (err) {
      console.log(`TikTok API key ${i + 1} failed, trying next...`)
      continue
    }
  }
  
  throw new Error('Failed to fetch videos from TikTok API')
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

    const { creatorIds } = await request.json()
    
    if (!creatorIds || !Array.isArray(creatorIds)) {
      return NextResponse.json(
        { error: 'Creator IDs array is required' },
        { status: 400 }
      )
    }

    // Get creators info for the provided IDs
    const { data: creators, error: creatorsError } = await supabase
      .from('favorite_creators')
      .select('*')
      .in('id', creatorIds)
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (creatorsError || !creators) {
      return NextResponse.json(
        { error: 'Failed to fetch creators' },
        { status: 500 }
      )
    }

    const processed = []
    const errors = []

    // Process creators in chunks, respecting Vercel timeout
    for (const creator of creators) {
      // Check if we're approaching timeout
      if (Date.now() - startTime > 8000) {
        console.log('Approaching timeout, stopping processing')
        break
      }

      try {
        if (creator.platform === 'tiktok' && creator.platform_user_id) {
          // Get date range from user settings
          const { data: settings } = await supabase
            .from('user_settings')
            .select('tiktok_date_range_days, max_content_per_creator')
            .eq('user_id', user.id)
            .single()

          const dateRangeDays = settings?.tiktok_date_range_days || 7
          const maxContent = Math.min(settings?.max_content_per_creator || 10, 10) // Limit to 10 for performance

          const videos = await fetchTikTokVideos(creator.username, creator.platform_user_id, maxContent)
          
          // Filter by date range
          const cutoffDate = new Date()
          cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays)
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const recentVideos = videos.filter((video: any) => 
            new Date(video.created_at) >= cutoffDate
          )

          // Cache videos in database
          let insertedCount = 0
          let updatedCount = 0
          
          for (const video of recentVideos) {
            try {
              // Check if video already exists
              const { data: existingContent, error: selectError } = await supabase
                .from('content')
                .select('id')
                .eq('platform_content_id', video.platform_content_id)
                .eq('platform', 'tiktok')
                .single()

              if (selectError && selectError.code !== 'PGRST116') {
                console.error('Error checking existing content:', selectError)
                continue
              }

              if (!existingContent) {
                // Insert new content
                const { error: insertError } = await supabase
                  .from('content')
                  .insert(video)
                
                if (insertError) {
                  console.error('Error inserting content:', insertError, 'Video:', video)
                } else {
                  insertedCount++
                  console.log('Inserted video:', video.platform_content_id)
                }
              } else {
                // Update existing content stats
                const { error: updateError } = await supabase
                  .from('content')
                  .update({
                    stats: video.stats,
                    cached_at: new Date().toISOString()
                  })
                  .eq('id', existingContent.id)
                
                if (updateError) {
                  console.error('Error updating content:', updateError)
                } else {
                  updatedCount++
                  console.log('Updated video:', video.platform_content_id)
                }
              }
            } catch (dbError) {
              console.error('Database operation error:', dbError)
            }
          }

          console.log(`Database operations for ${creator.username}: ${insertedCount} inserted, ${updatedCount} updated`)

          processed.push({
            creator: creator.username,
            platform: creator.platform,
            videosFound: recentVideos.length,
            videosProcessed: recentVideos.length
          })
        }
      } catch (error) {
        errors.push({
          creator: creator.username,
          platform: creator.platform,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      processed,
      errors,
      hasMore: processed.length < creators.length,
      processingTime: Date.now() - startTime
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

  } catch (error) {
    console.error('Content fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
