import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization')
    const token = authorization?.replace('Bearer ', '')
    
    console.log('Auth header present:', !!authorization)
    console.log('Token present:', !!token)
    
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
    
    console.log('Auth debug:', { 
      hasUser: !!user, 
      userId: user?.id, 
      userEmail: user?.email,
      authError: authError?.message 
    })
    
    if (authError || !user) {
      console.log('Authentication failed:', authError?.message || 'No user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's favorite creators
    const { data: creators, error: fetchError } = await supabase
      .from('favorite_creators')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('added_at', { ascending: false })

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch creators' },
        { status: 500 }
      )
    }

    // Group creators by platform for better organization
    const groupedCreators = {
      tiktok: creators?.filter(c => c.platform === 'tiktok') || [],
      youtube: creators?.filter(c => c.platform === 'youtube') || [],
      instagram: creators?.filter(c => c.platform === 'instagram') || [],
    }

    return NextResponse.json({ 
      creators: creators || [],
      grouped: groupedCreators,
      total: creators?.length || 0
    })

  } catch (error) {
    console.error('List creators error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
