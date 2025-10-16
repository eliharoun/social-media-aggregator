import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface CreatorInfo {
  platform_user_id: string
  display_name: string
  avatar_url: string | null
  follower_count: number | null
  channel_id?: string // YouTube-specific field
}

// TikTok API configuration (from existing proof of concept)
const RAPIDAPI_KEYS = [
  process.env.RAPIDAPI_KEY_1!,
  process.env.RAPIDAPI_KEY_2!,
  process.env.RAPIDAPI_KEY_3!,
]

// YouTube API configuration (same RapidAPI account)
const YOUTUBE_RAPIDAPI_KEYS = [
  process.env.YOUTUBE_RAPIDAPI_KEY_1!,
  process.env.YOUTUBE_RAPIDAPI_KEY_2!,
  process.env.YOUTUBE_RAPIDAPI_KEY_3!,
]

async function validateTikTokCreator(username: string): Promise<CreatorInfo> {
  for (let i = 0; i < RAPIDAPI_KEYS.length; i++) {
    try {
      const response = await fetch(
        `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${username}`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEYS[i],
            'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        const userInfo = data.userInfo?.user || data
        
        if (userInfo) {
          return {
            platform_user_id: userInfo.secUid || userInfo.id,
            display_name: userInfo.nickname || userInfo.displayName,
            avatar_url: userInfo.avatarLarger || userInfo.avatarMedium || userInfo.avatar,
            follower_count: userInfo.stats?.followerCount || 
                           userInfo.stats?.followersCount || 
                           userInfo.stats?.fanCount ||
                           userInfo.followerCount ||
                           userInfo.followersCount ||
                           userInfo.fanCount ||
                           null
          }
        }
      }
    } catch (_err) {
      continue
    }
  }
  
  throw new Error('Creator not found or API unavailable')
}

async function validateYouTubeCreator(username: string): Promise<CreatorInfo> {
  for (let i = 0; i < YOUTUBE_RAPIDAPI_KEYS.length; i++) {
    try {
      const response = await fetch(
        `https://youtube138.p.rapidapi.com/channel/details/?id=${encodeURIComponent(username)}&hl=en&gl=US`,
        {
          headers: {
            'x-rapidapi-key': YOUTUBE_RAPIDAPI_KEYS[i],
            'x-rapidapi-host': 'youtube138.p.rapidapi.com'
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        
        if (data.channelId) {
          return {
            platform_user_id: data.channelId,
            display_name: data.title || username,
            avatar_url: data.avatar?.[0]?.url || null,
            follower_count: data.stats?.subscribers || null,
            channel_id: data.channelId // Store for video fetching
          }
        }
      }
    } catch (error) {
      continue
    }
  }
  
  throw new Error('YouTube creator not found or API unavailable')
}

async function validateInstagramCreator(username: string): Promise<CreatorInfo> {
  // Placeholder for Instagram API integration
  // Will be implemented when Instagram API access is available
  return {
    platform_user_id: username,
    display_name: username,
    avatar_url: null,
    follower_count: null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { platform, username } = await request.json()

    if (!platform || !username) {
      return NextResponse.json(
        { error: 'Platform and username are required' },
        { status: 400 }
      )
    }

    if (!['tiktok', 'youtube', 'instagram'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform' },
        { status: 400 }
      )
    }

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

    // Get current user using the provided token
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Validate creator based on platform
    let creatorInfo
    try {
      switch (platform) {
        case 'tiktok':
          creatorInfo = await validateTikTokCreator(username)
          break
        case 'youtube':
          creatorInfo = await validateYouTubeCreator(username)
          break
        case 'instagram':
          creatorInfo = await validateInstagramCreator(username)
          break
        default:
          throw new Error('Unsupported platform')
      }
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to validate ${platform} creator: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      )
    }

    // Check if creator already exists for this user (including inactive ones)
    const { data: existingCreator } = await supabase
      .from('favorite_creators')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('username', username)
      .single()

    if (existingCreator) {
      if (existingCreator.is_active) {
        return NextResponse.json(
          { error: 'Creator already added' },
          { status: 409 }
        )
      } else {
        // Reactivate the existing creator instead of creating a new one
        const { data: reactivatedCreator, error: updateError } = await supabase
          .from('favorite_creators')
          .update({ 
            is_active: true,
            added_at: new Date().toISOString(), // Update the added date
            // Update creator info in case it changed
            platform_user_id: creatorInfo.platform_user_id,
            display_name: creatorInfo.display_name,
            avatar_url: creatorInfo.avatar_url,
            follower_count: creatorInfo.follower_count,
            // YouTube-specific fields
            ...(platform === 'youtube' && creatorInfo.channel_id && {
              channel_id: creatorInfo.channel_id
            })
          })
          .eq('id', existingCreator.id)
          .select()
          .single()

        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to reactivate creator' },
            { status: 500 }
          )
        }

        return NextResponse.json({ creator: reactivatedCreator })
      }
    }

    // Add creator to database
    const { data: newCreator, error: insertError } = await supabase
      .from('favorite_creators')
      .insert({
        user_id: user.id,
        platform,
        username,
        platform_user_id: creatorInfo.platform_user_id,
        display_name: creatorInfo.display_name,
        avatar_url: creatorInfo.avatar_url,
        follower_count: creatorInfo.follower_count,
        // YouTube-specific fields
        ...(platform === 'youtube' && creatorInfo.channel_id && {
          channel_id: creatorInfo.channel_id
        })
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to add creator' },
        { status: 500 }
      )
    }

    return NextResponse.json({ creator: newCreator })

  } catch (error) {
    console.error('Add creator error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
