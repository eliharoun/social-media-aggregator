import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface VideoContent {
  platform_content_id: string
  platform: string
  creator_username: string
  creator_platform: string
  title: string
  caption: string
  hashtags: string[]
  thumbnail_url: string
  content_url: string
  content_type: string
  created_at: string
  stats: {
    views: number
    likes: number
    comments: number
    shares: number
  }
}

interface Creator {
  id: string
  username: string
  platform: string
  platform_user_id: string
}

interface ProcessingError {
  creator?: string
  platform?: string
  content_id?: string
  error: string
}

// TikTok API configuration
const RAPIDAPI_KEYS = [
  process.env.RAPIDAPI_KEY_1!,
  process.env.RAPIDAPI_KEY_2!,
  process.env.RAPIDAPI_KEY_3!,
]

async function fetchTikTokVideos(username: string, secUid: string, count = 10): Promise<VideoContent[]> {
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
        return itemList.map((video: any): VideoContent => ({
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
    } catch {
      continue
    }
  }
  
  throw new Error('Failed to fetch videos from TikTok API')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllCreatorContent(supabase: any, userId: string): Promise<{ allContent: VideoContent[], errors: ProcessingError[] }> {
  // Get all active creators for the user
  const { data: creators, error: creatorsError } = await supabase
    .from('favorite_creators')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (creatorsError || !creators) {
    throw new Error('Failed to fetch creators')
  }

  // Get user settings for date ranges and limits
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  const allContent: VideoContent[] = []
  const errors: ProcessingError[] = []

  // Process all creators in parallel for better performance
  const creatorPromises = creators.map(async (creator: Creator) => {
    try {
      if (creator.platform === 'tiktok' && creator.platform_user_id) {
        const dateRangeDays = settings?.tiktok_date_range_days || 7
        const maxContent = Math.min(settings?.max_content_per_creator || 10, 20) // Allow up to 20 for better feed

        const videos = await fetchTikTokVideos(creator.username, creator.platform_user_id, maxContent)
        
        // Filter by date range
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays)
        
        const recentVideos = videos.filter((video: VideoContent) => 
          new Date(video.created_at) >= cutoffDate
        )

        return recentVideos
      }
      return []
    } catch (error) {
      errors.push({
        creator: creator.username,
        platform: creator.platform,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return []
    }
  })

  // Wait for all creators to be processed
  const creatorResults = await Promise.all(creatorPromises)
  
  // Flatten and combine all content
  creatorResults.forEach(videos => {
    allContent.push(...videos)
  })

  return { allContent, errors }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cacheContentBatch(supabase: any, content: VideoContent[]): Promise<{ insertedCount: number, updatedCount: number, errors: ProcessingError[] }> {
  const insertedCount = { value: 0 }
  const updatedCount = { value: 0 }
  const errors: ProcessingError[] = []

  // Process content in batches to avoid overwhelming the database
  const BATCH_SIZE = 10
  for (let i = 0; i < content.length; i += BATCH_SIZE) {
    const batch = content.slice(i, i + BATCH_SIZE)
    
    await Promise.all(batch.map(async (video) => {
      try {
        // Check if content already exists
        const { data: existingContent, error: selectError } = await supabase
          .from('content')
          .select('id')
          .eq('platform_content_id', video.platform_content_id)
          .eq('platform', video.platform)
          .single()

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError
        }

        if (!existingContent) {
          // Insert new content
          const { error: insertError } = await supabase
            .from('content')
            .insert(video)
          
          if (insertError) {
            throw insertError
          } else {
            insertedCount.value++
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
            throw updateError
          } else {
            updatedCount.value++
          }
        }
      } catch (error) {
        errors.push({
          content_id: video.platform_content_id,
          error: error instanceof Error ? error.message : 'Database error'
        })
      }
    }))
  }

  return { insertedCount: insertedCount.value, updatedCount: updatedCount.value, errors }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const authorization = request.headers.get('authorization')
    const token = authorization?.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch content from all creators
    const { allContent, errors: fetchErrors } = await fetchAllCreatorContent(supabase, user.id)
    
    if (allContent.length === 0) {
      return NextResponse.json({
        allContent: [],
        firstPage: [],
        totalCount: 0,
        totalPages: 0,
        errors: fetchErrors,
        processingTime: Date.now() - startTime
      })
    }

    // Cache content in database first
    const { insertedCount, updatedCount, errors: cacheErrors } = await cacheContentBatch(supabase, allContent)
    
    // Now fetch the cached content with database IDs, applying user settings for filtering
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const { data: followedCreators } = await supabase
      .from('favorite_creators')
      .select('username')
      .eq('user_id', currentUser!.id)
      .eq('is_active', true)

    const usernames = followedCreators?.map(c => c.username) || []
    
    // Get user settings to apply date range filtering to cached content
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', currentUser!.id)
      .single()

    // Apply date range filter based on current settings
    const dateRangeDays = userSettings?.tiktok_date_range_days || 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays)

    const { data: cachedContent } = await supabase
      .from('content')
      .select('*')
      .in('creator_username', usernames)
      .gte('created_at', cutoffDate.toISOString()) // Apply date range filter
      .order('created_at', { ascending: false })

    if (!cachedContent) {
      return NextResponse.json({ error: 'Failed to fetch cached content' }, { status: 500 })
    }

    // Apply max content per creator limit
    const maxContentPerCreator = userSettings?.max_content_per_creator || 10
    const filteredContent = []
    const creatorCounts = new Map()

    for (const item of cachedContent) {
      const currentCount = creatorCounts.get(item.creator_username) || 0
      if (currentCount < maxContentPerCreator) {
        filteredContent.push(item)
        creatorCounts.set(item.creator_username, currentCount + 1)
      }
    }

    // Get first page for immediate display
    const firstPage = filteredContent.slice(0, 10)
    const totalPages = Math.ceil(filteredContent.length / 10)

    return NextResponse.json({
      allContent: filteredContent,
      firstPage,
      totalCount: filteredContent.length,
      totalPages,
      cacheStats: {
        inserted: insertedCount,
        updated: updatedCount
      },
      errors: [...fetchErrors, ...cacheErrors],
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('Fetch all content error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
