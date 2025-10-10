import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function DELETE(request: NextRequest) {
  try {
    const { creatorId } = await request.json()

    if (!creatorId) {
      return NextResponse.json(
        { error: 'Creator ID is required' },
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

    // Verify the creator belongs to the current user before deleting
    const { data: creator, error: fetchError } = await supabase
      .from('favorite_creators')
      .select('id, username, platform')
      .eq('id', creatorId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !creator) {
      return NextResponse.json(
        { error: 'Creator not found' },
        { status: 404 }
      )
    }

    // Soft delete by setting is_active to false
    const { error: updateError } = await supabase
      .from('favorite_creators')
      .update({ is_active: false })
      .eq('id', creatorId)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to remove creator' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: `@${creator.username} removed from ${creator.platform}`
    })

  } catch (error) {
    console.error('Remove creator error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
