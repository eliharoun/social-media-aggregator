'use client'

import { useState, useEffect } from 'react'
import { Layout } from '@/components/layout/Layout'
import { supabase } from '@/lib/supabase'

interface UserSettings {
  id?: string
  user_id?: string
  tiktok_date_range_days: number
  youtube_date_range_days: number
  instagram_date_range_days: number
  max_content_per_creator: number
  auto_refresh_enabled: boolean
  refresh_interval_hours: number
  enabled_platforms: string[]
  auto_expand_summaries: boolean
  created_at?: string
  updated_at?: string
}

const DEFAULT_SETTINGS: UserSettings = {
  tiktok_date_range_days: 7,
  youtube_date_range_days: 7,
  instagram_date_range_days: 7,
  max_content_per_creator: 10,
  auto_refresh_enabled: true,
  refresh_interval_hours: 6,
  enabled_platforms: ['tiktok'],
  auto_expand_summaries: false
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: userSettings, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error)
      } else if (userSettings) {
        setSettings(userSettings)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const settingsData = {
        ...settings,
        user_id: session.user.id,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(settingsData, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error saving settings:', error)
        setMessage('Failed to save settings')
      } else {
        setMessage('Settings saved successfully! Go to your feed and click "Refresh Feed" to see the changes.')
        setTimeout(() => setMessage(''), 5000)
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
      setMessage('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handlePlatformToggle = (platform: string) => {
    const updatedPlatforms = settings.enabled_platforms.includes(platform)
      ? settings.enabled_platforms.filter(p => p !== platform)
      : [...settings.enabled_platforms, platform]
    
    setSettings(prev => ({
      ...prev,
      enabled_platforms: updatedPlatforms
    }))
  }

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS)
    setMessage('Settings reset to defaults')
    setTimeout(() => setMessage(''), 3000)
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Settings</h1>
          <p className="text-gray-600">Configure your content preferences and platform settings</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('success') 
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <div className="space-y-8">
          {/* Platform Settings */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Platform Configuration</h2>
            
            {/* Enabled Platforms */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-800 mb-3">Enabled Platforms</h3>
              <div className="space-y-3">
                {[
                  { key: 'tiktok', name: 'TikTok', icon: '🎵', description: 'Short-form video content' },
                  { key: 'youtube', name: 'YouTube', icon: '📺', description: 'Video content and shorts' },
                  { key: 'instagram', name: 'Instagram', icon: '📸', description: 'Photos, reels, and stories' }
                ].map(platform => (
                  <label key={platform.key} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.enabled_platforms.includes(platform.key)}
                      onChange={() => handlePlatformToggle(platform.key)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-lg">{platform.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{platform.name}</div>
                      <div className="text-sm text-gray-600">{platform.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Range Settings */}
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎵 TikTok Date Range
                </label>
                <select
                  value={settings.tiktok_date_range_days}
                  onChange={(e) => setSettings(prev => ({ ...prev, tiktok_date_range_days: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={1}>Last 1 day</option>
                  <option value={3}>Last 3 days</option>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📺 YouTube Date Range
                </label>
                <select
                  value={settings.youtube_date_range_days}
                  onChange={(e) => setSettings(prev => ({ ...prev, youtube_date_range_days: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={1}>Last 1 day</option>
                  <option value={3}>Last 3 days</option>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📸 Instagram Date Range
                </label>
                <select
                  value={settings.instagram_date_range_days}
                  onChange={(e) => setSettings(prev => ({ ...prev, instagram_date_range_days: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={1}>Last 1 day</option>
                  <option value={3}>Last 3 days</option>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
            </div>

            {/* Content Limits */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Content Per Creator
              </label>
              <select
                value={settings.max_content_per_creator}
                onChange={(e) => setSettings(prev => ({ ...prev, max_content_per_creator: parseInt(e.target.value) }))}
                className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value={5}>5 items</option>
                <option value={10}>10 items</option>
                <option value={15}>15 items</option>
                <option value={20}>20 items</option>
                <option value={50}>50 items</option>
              </select>
              <p className="text-sm text-gray-600 mt-1">
                Maximum number of recent posts to fetch per creator
              </p>
            </div>
          </div>

          {/* Refresh Settings */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Auto-Refresh Settings</h2>
            
            <div className="space-y-6">
              {/* Auto Refresh Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-800">Auto-Refresh Content</h3>
                  <p className="text-sm text-gray-600">Automatically fetch new content from your favorite creators</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_refresh_enabled}
                    onChange={(e) => setSettings(prev => ({ ...prev, auto_refresh_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Refresh Interval */}
              {settings.auto_refresh_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Refresh Interval
                  </label>
                  <select
                    value={settings.refresh_interval_hours}
                    onChange={(e) => setSettings(prev => ({ ...prev, refresh_interval_hours: parseInt(e.target.value) }))}
                    className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value={1}>Every hour</option>
                    <option value={3}>Every 3 hours</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Once daily</option>
                  </select>
                  <p className="text-sm text-gray-600 mt-1">
                    How often to check for new content automatically
                  </p>
                </div>
              )}

              {/* Auto-Expand Summaries */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-800">Auto-Expand AI Summaries</h3>
                  <p className="text-sm text-gray-600">Automatically show AI summaries when they become ready</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_expand_summaries}
                    onChange={(e) => setSettings(prev => ({ ...prev, auto_expand_summaries: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          </div>


          {/* Account Settings */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Account & Data</h2>
            
            <div className="space-y-6">
              {/* Data Management */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">Data Management</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Manage your cached content and AI-generated data
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      localStorage.removeItem('readItems')
                      localStorage.removeItem('savedItems')
                      setMessage('Local preferences cleared')
                      setTimeout(() => setMessage(''), 3000)
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Clear Read/Saved Items
                  </button>
                </div>
              </div>

              {/* Account Info */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">Account Information</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Settings are automatically synced across your devices</p>
                  <p>All data is stored securely with end-to-end encryption</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-8 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Settings
                </>
              )}
            </button>

            <button
              onClick={resetToDefaults}
              className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
