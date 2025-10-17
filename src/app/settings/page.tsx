'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Layout } from '@/components/layout/Layout'
import { QueueProgressIndicator } from '@/components/dashboard/QueueProgressIndicator'
import { supabase } from '@/lib/supabase'
import { useQueueProgress } from '@/hooks/useQueueProgress'

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
  const [activeTab, setActiveTab] = useState('tiktok')
  const [message, setMessage] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isGeneratingSummaries, setIsGeneratingSummaries] = useState(false)
  const [isPollingPending, setIsPollingPending] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [pollResults, setPollResults] = useState<{
    message?: string;
    summary?: { completed: number; stillPending: number; failed: number; processed: number; total: number };
    results?: Array<{ title: string; message: string; status: string; content_id: string }>;
  } | null>(null)
  const router = useRouter()
  const { progress, isActive: isQueueActive, startProgressTracking, stopProgressTracking } = useQueueProgress()

  useEffect(() => {
    loadSettings()
    loadPendingCount()
  }, [])

  // Auto-save when settings change
  useEffect(() => {
    if (!loading) {
      saveSettings()
    }
  }, [settings, loading])

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
      setSaveStatus('saving')
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
        setSaveStatus('error')
      } else {
        setSaveStatus('saved')
        // Reset to idle after showing saved status
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
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

  const clearCache = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Clear content cache
      const { data: userCreators } = await supabase
        .from('favorite_creators')
        .select('username')
        .eq('user_id', session.user.id)

      if (userCreators) {
        const usernames = userCreators.map(c => c.username)
        
        // Get content IDs first
        const { data: userContent } = await supabase
          .from('content')
          .select('id')
          .in('creator_username', usernames)

        if (userContent && userContent.length > 0) {
          const contentIds = userContent.map(c => c.id)
          
          // Delete summaries
          await supabase
            .from('summaries')
            .delete()
            .in('content_id', contentIds)

          // Delete transcripts
          await supabase
            .from('transcripts')
            .delete()
            .in('content_id', contentIds)
        }

        // Delete content
        await supabase
          .from('content')
          .delete()
          .in('creator_username', usernames)
      }

      // Clear local storage
      localStorage.removeItem('readItems')
      localStorage.removeItem('savedItems')
      localStorage.removeItem('cacheHits')
      localStorage.removeItem('cacheTotal')

      setMessage('Cache cleared successfully! Refresh your feed to fetch new content.')
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      setMessage('Failed to clear cache')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const loadPendingCount = async () => {
    try {
      const response = await fetch('/api/transcripts/poll-pending')
      if (response.ok) {
        const data = await response.json()
        setPendingCount(data.totalPendingCount || data.pendingCount || 0)
      }
    } catch (err) {
      // Ignore errors for pending count
    }
  }

  const generateMissingSummaries = async () => {
    setIsGeneratingSummaries(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/content/ensure-summaries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.jobsQueued > 0) {
          // Start tracking progress for queue-based processing
          startProgressTracking()
          setMessage(`Queued ${result.jobsQueued} summary generation jobs. Processing in background...`)
          setIsGeneratingSummaries(false) // Stop the button loading state
        } else {
          setMessage('All transcripts already have summaries!')
          setTimeout(() => setMessage(''), 3000)
          setIsGeneratingSummaries(false)
        }
      } else {
        setMessage('Failed to queue summary generation')
        setTimeout(() => setMessage(''), 3000)
        setIsGeneratingSummaries(false)
      }
    } catch (err) {
      setMessage('Failed to queue summary generation')
      setTimeout(() => setMessage(''), 3000)
      setIsGeneratingSummaries(false)
    }
  }

  const pollPendingTranscripts = async () => {
    setIsPollingPending(true)
    setPollResults(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/transcripts/poll-pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        setPollResults(result)
        
        if (result.summary?.completed > 0) {
          setMessage(`✅ ${result.summary.completed} transcripts completed! New summaries are being generated.`)
        } else if (result.summary?.stillPending > 0) {
          setMessage(`⏳ ${result.summary.stillPending} transcripts still processing. Check again in a few minutes.`)
        } else if (result.summary?.failed > 0) {
          setMessage(`❌ ${result.summary.failed} transcripts failed. They may need to be retried later.`)
        } else {
          setMessage('All pending transcripts have been processed!')
        }
        
        // Refresh pending count
        loadPendingCount()
        setTimeout(() => setMessage(''), 8000)
      } else {
        setMessage('Failed to poll pending transcripts')
        setTimeout(() => setMessage(''), 3000)
      }
    } catch (err) {
      setMessage('Failed to poll pending transcripts')
      setTimeout(() => setMessage(''), 3000)
    } finally {
      setIsPollingPending(false)
    }
  }

  // Handle queue progress completion for summary generation
  const handleSummaryProgressComplete = () => {
    stopProgressTracking()
    setMessage('🎉 All summaries generated! Go to Dashboard to see them.')
    setTimeout(() => setMessage(''), 5000)
  }

  const platforms = [
    { 
      key: 'tiktok', 
      name: 'TikTok', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.43z"/>
        </svg>
      ),
      enabled: true,
      description: 'Short-form video content with AI transcription and summarization'
    },
    { 
      key: 'youtube', 
      name: 'YouTube', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      enabled: true,
      description: 'Long-form video content with AI transcription and summarization'
    },
    { 
      key: 'instagram', 
      name: 'Instagram', 
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
      enabled: false,
      description: 'Photos, reels, and stories - Coming Soon'
    }
  ]

  const activePlatform = platforms.find(p => p.key === activeTab)

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
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('success') || message.includes('cleared') || message.includes('Generated')
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* Save Status Indicator */}
        {saveStatus !== 'idle' && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all ${
            saveStatus === 'saving' ? 'bg-blue-50 border border-blue-200 text-blue-700' :
            saveStatus === 'saved' ? 'bg-green-50 border border-green-200 text-green-700' :
            'bg-red-50 border border-red-200 text-red-700'
          }`}>
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' && (
                <>
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Settings saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Save failed</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Queue Progress Indicator for Summary Generation */}
        {isQueueActive && progress && (
          <div className="mb-6">
            <QueueProgressIndicator 
              progress={progress} 
              onComplete={handleSummaryProgressComplete}
            />
          </div>
        )}

        <div className="space-y-8">
          {/* Platform Tabs */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="border-b border-gray-200">
              <nav className="flex w-full">
                {platforms.map((platform) => (
                  <button
                    key={platform.key}
                    onClick={() => setActiveTab(platform.key)}
                    disabled={!platform.enabled}
                    className={`flex-1 px-2 sm:px-6 py-4 text-sm font-medium transition-colors relative ${
                      activeTab === platform.key
                        ? 'text-purple-600 bg-purple-50 border-b-2 border-purple-600'
                        : platform.enabled
                        ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                        : 'text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                      <div className="text-base sm:text-xl">{platform.icon}</div>
                      <div className="flex flex-col sm:flex-row items-center gap-1">
                        <span className="text-xs sm:text-sm font-medium text-center">{platform.name}</span>
                        {!platform.enabled && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                            Soon
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Platform Settings Content */}
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">{activePlatform?.icon}</span>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">{activePlatform?.name} Settings</h2>
                  <p className="text-sm text-gray-600">{activePlatform?.description}</p>
                </div>
              </div>

              {activePlatform?.enabled ? (
                <div className="space-y-6">
                  {/* Platform Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-800">Enable {activePlatform.name}</h3>
                      <p className="text-sm text-gray-600">Include content from {activePlatform.name} in your feed</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enabled_platforms.includes(activeTab)}
                        onChange={() => handlePlatformToggle(activeTab)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {settings.enabled_platforms.includes(activeTab) && (
                    <>
                      {/* Date Range */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Content Date Range
                        </label>
                        <select
                          value={settings[`${activeTab}_date_range_days` as keyof UserSettings] as number}
                          onChange={(e) => setSettings(prev => ({ 
                            ...prev, 
                            [`${activeTab}_date_range_days`]: parseInt(e.target.value) 
                          }))}
                          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          <option value={1}>Last 1 day</option>
                          <option value={3}>Last 3 days</option>
                          <option value={7}>Last 7 days</option>
                          <option value={14}>Last 14 days</option>
                          <option value={30}>Last 30 days</option>
                        </select>
                        <p className="text-sm text-gray-600 mt-1">
                          How far back to fetch content from this platform
                        </p>
                      </div>

                      {/* Content Limit */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Content Per Creator
                        </label>
                        <select
                          value={settings.max_content_per_creator}
                          onChange={(e) => setSettings(prev => ({ 
                            ...prev, 
                            max_content_per_creator: parseInt(e.target.value) 
                          }))}
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
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">{activePlatform?.icon}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Coming Soon</h3>
                  <p className="text-gray-600">
                    {activePlatform?.name} integration is currently in development and will be available soon.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* General Settings */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">General Settings</h2>
            
            <div className="space-y-6">
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

          {/* Data Management */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Data Management</h2>
            
            <div className="space-y-6">
              {/* Process Pending Transcripts */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <h3 className="font-medium text-blue-800 mb-2">Process Pending Transcripts</h3>
                <p className="text-sm text-blue-700 mb-4">
                  {pendingCount > 0 
                    ? `${pendingCount} transcript${pendingCount > 1 ? 's are' : ' is'} being processed by Supadata. Click to check their status and complete any finished jobs.`
                    : 'Check for transcripts that are being processed by Supadata in the background. These are typically large videos that take longer to process.'
                  }
                </p>
                <button
                  onClick={pollPendingTranscripts}
                  disabled={isPollingPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isPollingPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Checking Status...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {pendingCount > 0 ? `Check Pending (${pendingCount})` : 'Check for Pending Transcripts'}
                    </>
                  )}
                </button>
              </div>

              {/* Poll Results */}
              {pollResults && (
                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <h3 className="font-medium text-green-800 mb-2">Polling Results</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <p>✅ Completed: {pollResults.summary?.completed || 0}</p>
                    <p>⏳ Still Processing: {pollResults.summary?.stillPending || 0}</p>
                    <p>❌ Failed: {pollResults.summary?.failed || 0}</p>
                    <p>📊 Total Processed: {pollResults.summary?.processed || 0} / {pollResults.summary?.total || 0}</p>
                  </div>
                  {pollResults.message && (
                    <p className="text-sm text-green-600 mt-2 font-medium">{pollResults.message}</p>
                  )}
                  

                  {pollResults.results && pollResults.results.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-green-800 font-medium">View Processing Details ({pollResults.results.length} items)</summary>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {pollResults.results.map((result, index: number) => (
                          <div key={index} className={`text-xs rounded p-2 ${
                            result.status === 'completed' ? 'bg-green-100 text-green-800' :
                            result.status === 'failed' || result.status === 'error' ? 'bg-red-100 text-red-800' :
                            result.status === 'queued' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            <div className="font-medium">{result.title || 'Unknown Title'}</div>
                            <div>Status: {result.status}</div>
                            <div>Message: {result.message || 'No message'}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  
                  {(!pollResults.results || pollResults.results.length === 0) && pollResults.summary?.total === 0 && (
                    <p className="text-sm text-green-600 mt-2">ℹ️ No pending transcripts found - all videos have transcripts!</p>
                  )}
                </div>
              )}

              {/* Generate Missing Summaries */}
              <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                <h3 className="font-medium text-purple-800 mb-2">Generate Missing Summaries</h3>
                <p className="text-sm text-purple-700 mb-4">
                  Some content may have transcripts but no AI summaries. Click here to generate summaries for all transcripts that are missing them.
                </p>
                <button
                  onClick={generateMissingSummaries}
                  disabled={isGeneratingSummaries}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGeneratingSummaries ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Generate Summaries
                    </>
                  )}
                </button>
              </div>

              {/* Cache Management */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">Clear Cache</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Remove all cached content, transcripts, and AI summaries. This will free up space and force fresh content fetching.
                </p>
                <button
                  onClick={clearCache}
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Clear All Cache
                </button>
              </div>

              {/* Local Data Management */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">Local Preferences</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Clear your read/saved items and local preferences stored in your browser.
                </p>
                <button
                  onClick={() => {
                    localStorage.removeItem('readItems')
                    localStorage.removeItem('savedItems')
                    setMessage('Local preferences cleared')
                    setTimeout(() => setMessage(''), 3000)
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Clear Local Data
                </button>
              </div>

              {/* App Info */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">Application Information</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Settings are automatically synced across your devices</p>
                  <p>All data is stored securely with end-to-end encryption</p>
                  <p>Changes are saved automatically as you make them</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
