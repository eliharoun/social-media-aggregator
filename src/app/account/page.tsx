'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Layout } from '@/components/layout/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/auth/AuthProvider'

export default function AccountPage() {
  const [message, setMessage] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [profileData, setProfileData] = useState({
    email: '',
    displayName: '',
    bio: ''
  })
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  })
  const [expandedSections, setExpandedSections] = useState({
    profile: false,
    password: false,
    account: true
  })
  const router = useRouter()
  const { user, signOut } = useAuth()

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  useEffect(() => {
    if (user) {
      loadUserProfile()
    }
  }, [user])

  const loadUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load profile from database
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      setProfileData({
        email: user?.email || '',
        displayName: profile?.display_name || '',
        bio: profile?.bio || ''
      })
    } catch (err) {
      // Profile doesn't exist yet, use defaults
      setProfileData({
        email: user?.email || '',
        displayName: '',
        bio: ''
      })
    }
  }

  const updateProfile = async () => {
    if (!profileData.email.trim()) {
      setMessage('Email is required')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    setIsUpdatingProfile(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Update auth user email
      const { error: authError } = await supabase.auth.updateUser({
        email: profileData.email
      })

      if (authError) {
        setMessage(`Failed to update email: ${authError.message}`)
        setTimeout(() => setMessage(''), 5000)
        return
      }

      // Update profile in database
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: session.user.id,
          display_name: profileData.displayName,
          bio: profileData.bio,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (profileError) {
        setMessage(`Failed to update profile: ${profileError.message}`)
      } else {
        setMessage('Profile updated successfully! Check your email if you changed your email address.')
      }
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      setMessage('Failed to update profile')
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const updatePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setMessage('Please fill in all password fields')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage('New passwords do not match')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    if (passwordData.newPassword.length < 6) {
      setMessage('Password must be at least 6 characters long')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    setIsUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (error) {
        setMessage(`Failed to update password: ${error.message}`)
      } else {
        setMessage('Password updated successfully!')
        setPasswordData({
          newPassword: '',
          confirmPassword: ''
        })
      }
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      setMessage('Failed to update password')
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const deleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Delete user data
      await supabase.from('user_settings').delete().eq('user_id', session.user.id)
      await supabase.from('favorite_creators').delete().eq('user_id', session.user.id)
      await supabase.from('user_profiles').delete().eq('user_id', session.user.id)
      await supabase.from('user_content_interactions').delete().eq('user_id', session.user.id)
      
      // Sign out and delete auth user
      await supabase.auth.signOut()
      
      // Redirect to home page
      router.push('/')
    } catch (err) {
      setMessage('Failed to delete account')
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('success') || message.includes('updated')
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Settings */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Profile Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
              <button
                onClick={() => toggleSection('profile')}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${expandedSections.profile ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-sm sm:text-base font-medium text-gray-800">Profile</h2>
              </button>
            </div>

            {/* Expandable Profile Content */}
            {expandedSections.profile && (
              <div className="p-6 animate-slideDown">
                <div className="space-y-6">
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter your email address"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      You&apos;ll receive a confirmation email if you change your email address
                    </p>
                  </div>

                  {/* Display Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter your display name"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      This name will be used in the interface (optional)
                    </p>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bio (Optional)
                    </label>
                    <textarea
                      value={profileData.bio}
                      onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Tell us about yourself"
                      rows={3}
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      A short description about yourself (optional)
                    </p>
                  </div>

                  {/* Update Profile Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={updateProfile}
                      disabled={isUpdatingProfile}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isUpdatingProfile ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Update Profile
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Password Settings */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Password Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
              <button
                onClick={() => toggleSection('password')}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${expandedSections.password ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-sm sm:text-base font-medium text-gray-800">Password</h2>
              </button>
            </div>

            {/* Expandable Password Content */}
            {expandedSections.password && (
              <div className="p-6 animate-slideDown">
                <div className="space-y-6">
                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter your new password"
                    />
                    <p className="text-sm text-gray-600 mt-1">
                      Password must be at least 6 characters long
                    </p>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Confirm your new password"
                    />
                  </div>

                  {/* Update Password Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={updatePassword}
                      disabled={isUpdatingPassword}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isUpdatingPassword ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Update Password
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Management */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Account Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
              <button
                onClick={() => toggleSection('account')}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${expandedSections.account ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h2 className="text-sm sm:text-base font-medium text-gray-800">Account</h2>
              </button>
            </div>

            {/* Expandable Account Content */}
            {expandedSections.account && (
              <div className="p-6 animate-slideDown">
                <div className="space-y-6">
                  {/* Sign Out */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-800 mb-2">Sign Out</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Sign out of your account. Your settings and data will be preserved.
                    </p>
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600">
                        Signed in as: <span className="font-medium">{user?.email}</span>
                      </div>
                      <button
                        onClick={signOut}
                        className="w-full px-4 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>

                  {/* Account Deletion */}
                  <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                    <h3 className="font-medium text-red-800 mb-2">Delete Account</h3>
                    <p className="text-sm text-red-700 mb-4">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      onClick={deleteAccount}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Account
                        </>
                      )}
                    </button>
                  </div>

                  {/* Account Info */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-800 mb-2">Account Information</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Account created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</p>
                      <p>Last sign in: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Unknown'}</p>
                      <p>All data is stored securely with end-to-end encryption</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
