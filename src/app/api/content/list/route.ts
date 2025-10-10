import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // First get the usernames of followed creators
    const { data: followedCreators } = await supabase
      .from('favorite_creators')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!followedCreators || followedCreators.length === 0) {
      return NextResponse.json({
        content: [],
        grouped: { tiktok: [], youtube: [], instagram: [] },
        total: 0,
        hasMore: false,
        pagination: { limit, offset, nextOffset: null }
      })
    }

    const usernames = followedCreators.map(c => c.username)

    // Build query to get content from followed creators
    let query = supabase
      .from('content')
      .select(`
        *,
        transcripts (
          id,
          transcript_text,
          language
        ),
        summaries (
          id,
          summary,
          key_points,
          sentiment,
          topics
        )
      `)
      .in('creator_username', usernames)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by platform if specified
    if (platform && ['tiktok', 'youtube', 'instagram'].includes(platform)) {
      query = query.eq('platform', platform)
    }

    const { data: content, error: contentError } = await query

    if (contentError) {
      return NextResponse.json(
        { error: 'Failed to fetch content' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('content')
      .select('id', { count: 'exact', head: true })
      .in('creator_username', usernames)

    if (platform && ['tiktok', 'youtube', 'instagram'].includes(platform)) {
      countQuery = countQuery.eq('platform', platform)
    }

    const { count } = await countQuery

    // Group content by platform for better organization
    const groupedContent = {
      tiktok: content?.filter(c => c.platform === 'tiktok') || [],
      youtube: content?.filter(c => c.platform === 'youtube') || [],
      instagram: content?.filter(c => c.platform === 'instagram') || [],
    }

    return NextResponse.json({
      content: content || [],
      grouped: groupedContent,
      total: count || 0,
      hasMore: (offset + limit) < (count || 0),
      pagination: {
        limit,
        offset,
        nextOffset: (offset + limit) < (count || 0) ? offset + limit : null
      }
    }, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=3600', // Cache for 5 minutes
      },
    })

  } catch (error) {
    console.error('Content list error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
