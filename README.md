# 🎬 Social Media Aggregator

[![Next.js](https://img.shields.io/badge/Next.js-15.5.4-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-green?style=flat-square&logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> An AI-powered social media content aggregation platform that transforms how you consume content from your favorite creators across TikTok, YouTube, and Instagram.

## 🌐 Live Demo

**Try it now**: [https://social-media-aggregator-phi.vercel.app/](https://social-media-aggregator-phi.vercel.app/)

*Install as a mobile app directly from your browser!*

## 🌟 Features

- 🤖 **AI-Powered Summaries** - Intelligent content analysis using OpenAI and Anthropic
- 📱 **Mobile-First PWA** - Install as a native app on any device
- 🎯 **Multi-Platform Support** - TikTok and YouTube (active), Instagram (infrastructure ready)
- 🔍 **Advanced Filtering** - Mobile-optimized horizontal scrollable filters with platform-specific sorting
- 📝 **Unified Transcript System** - Supadata AI for all platforms with async processing support
- 🎨 **Modern UI** - Clean, responsive design with enhanced mobile UX
- 🔒 **Privacy-Focused** - Secure data storage with Row Level Security
- ⚡ **Performance Optimized** - 3x faster AI processing with parallel job execution
- 🚀 **Database-Based Queue System** - Scalable background processing eliminating timeout issues
- 📊 **Real-Time Progress Tracking** - Visual feedback with phase-based progress indicators
- 🖼️ **Intelligent Thumbnail Fallback** - Handles expired URLs with creator avatars and platform logos
- 🎬 **YouTube Integration** - Full support for long-form content with dynamic timeout handling
- 📱 **Enhanced Mobile Experience** - Touch-optimized infinite scroll and pull-to-refresh

## 📱 Progressive Web App

Install as a native mobile app:

| Platform | Installation |
|----------|-------------|
| **iOS** | Safari → Share → "Add to Home Screen" |
| **Android** | Chrome → Menu → "Install App" |
| **Desktop** | Chrome/Edge → Install icon in address bar |

## 📸 Screenshots

<div align="center">

<table>
<tr>
<td align="center" width="25%">
<h4>⭐ Add Creators</h4>
<img src="img/add_creators.jpeg" alt="Add Creators" width="200">
<br><em>Easy creator management - add your favorite TikTok creators</em>
</td>
<td align="center" width="25%">
<h4>📱 Content Feed</h4>
<img src="img/feed.jpeg" alt="Content Feed" width="200">
<br><em>AI-powered content feed with intelligent summaries and filtering</em>
</td>
<td align="center" width="25%">
<h4>🤖 AI Summary</h4>
<img src="img/summary.jpeg" alt="AI Summary" width="200">
<br><em>Comprehensive AI-generated summaries with key points and sentiment analysis</em>
</td>
<td align="center" width="25%">
<h4>📝 Full Transcripts</h4>
<img src="img/transcript.jpeg" alt="Transcript View" width="200">
<br><em>Complete video transcripts with searchable text</em>
</td>
</tr>
</table>

</div>

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- API keys (TikTok RapidAPI, OpenAI/Anthropic)

### Installation

```bash
# Clone the repository
git clone https://github.com/eliharoun/social-media-aggregator.git
cd social-media-aggregator

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Set up database
# Run database-setup.sql in your Supabase SQL editor

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## 🔧 Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# TikTok API (Multiple keys for redundancy)
RAPIDAPI_KEY_1=your_rapidapi_key_1
RAPIDAPI_KEY_2=your_rapidapi_key_2
RAPIDAPI_KEY_3=your_rapidapi_key_3

# YouTube APIs (Same RapidAPI account as TikTok)
YOUTUBE_RAPIDAPI_KEY_1=your_rapidapi_key_1
YOUTUBE_RAPIDAPI_KEY_2=your_rapidapi_key_2
YOUTUBE_RAPIDAPI_KEY_3=your_rapidapi_key_3

# Transcript Services
TRANSCRIPT_API_KEY_1=your_transcript_api_key_1
TRANSCRIPT_API_KEY_2=your_transcript_api_key_2

# AI Services
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
DEFAULT_LLM_PROVIDER=openai

# Supadata AI (YouTube transcript fallback - Multiple keys for redundancy)
SUPADATA_API_KEY_1=your_supadata_api_key_1
SUPADATA_API_KEY_2=your_supadata_api_key_2
SUPADATA_API_KEY_3=your_supadata_api_key_3

# Queue Processing (Required for background workers)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🏗 Architecture

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions) with Database-Based Queue System
- **AI**: LangChain, OpenAI GPT-4o-mini, Anthropic Claude
- **Queue Processing**: Custom database queue with parallel job processing
- **Deployment**: Vercel (optimized for Hobby plan)

### Database Schema

```sql
-- Core Tables
├── users (Supabase Auth)
├── user_profiles (display names, bios)
├── user_settings (app preferences)
├── favorite_creators (followed creators)
├── content (aggregated posts/videos)
├── transcripts (video-to-text)
├── summaries (AI-generated summaries)
├── user_content_interactions (read/saved status)
└── Queue System Tables
    ├── processing_sessions (session tracking)
    └── processing_jobs (background job queue)
```

## 📖 Usage Guide

### 1. Add Creators
Navigate to the **Creators** tab and add your favorite creators:
- **TikTok**: Add by username (e.g., `@creator123`)
- **YouTube**: Add by channel username with @ symbol (e.g., `@channelname`)

### 2. Refresh Content
Go to the **Dashboard** and click the refresh button to fetch the latest content from all platforms.

### 3. AI Processing
The app automatically processes content with:
- **Unified Transcript API**: Single Supadata API for all platforms (TikTok, YouTube, Instagram)
- **Async Processing**: Large videos processed in background with user-initiated completion
- **Rate Limiting**: 1 request/second with exponential backoff protection
- **Intelligent Summaries**: Key points, sentiment analysis, and topic extraction
- **Parallel Processing**: 3x faster AI operations

### 4. Organize Content
Use the mobile-optimized horizontal scrollable filters to:
- Filter by platform (TikTok, YouTube)
- Sort by date or engagement
- Hide already-read content
- Platform-specific sorting options

### 5. Manage Account
In the **Account** tab:
- Update your profile information
- Configure platform-specific settings
- Change your password
- Sign out or delete account

## 🎯 Key Components

### Dashboard Features
- **Infinite Scroll**: Seamless content browsing
- **Collapsible Filters**: Space-efficient filtering controls
- **Real-Time Processing**: Live AI summary generation
- **Mobile-Optimized**: Touch-friendly interface

### Content Cards
- **Smart Thumbnails**: Optimized image loading
- **Processing Indicators**: Visual feedback for AI processing
- **Action Buttons**: Read, save, share functionality
- **Expandable Summaries**: Toggle detailed AI analysis

### Account Management
- **Profile Editing**: Display name, bio, email updates
- **Security**: Password management and secure authentication
- **Data Control**: Cache clearing and account deletion
- **Collapsible Interface**: Mobile-friendly card design

## 🔄 API Integration

### Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **TikTok** | ✅ Active | Content fetching, AI transcripts, intelligent summaries |
| **YouTube** | ✅ Active | Channel validation, long-form content, 4-tier transcript system |
| **Instagram** | 🔄 Coming Soon | Infrastructure ready |

### AI Providers

- **OpenAI GPT-4o-mini**: Primary summarization model
- **Anthropic Claude Haiku**: Alternative model for redundancy
- **Automatic Fallback**: Switches providers if one fails

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### Environment Setup
1. Configure environment variables in Vercel dashboard
2. Set up custom domain (optional)
3. Enable Vercel Analytics for monitoring

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** following the existing patterns
4. **Test thoroughly** on mobile and desktop
5. **Submit a pull request**

### Development Guidelines

- Follow the existing TypeScript patterns
- Use Tailwind CSS for styling
- Ensure mobile-first responsive design
- Add proper error handling
- Include loading states for better UX

### Adding New Platforms

The architecture supports easy platform addition:

1. Add platform to database schema
2. Create API integration in `/api` routes
3. Update UI components with platform-specific logic
4. Add platform icons and branding

## 📊 Performance

### Metrics
- ⚡ **Initial Load**: < 2 seconds
- 🔄 **Feed Refresh**: < 1 second (cached)
- 🤖 **AI Processing**: 3x faster with parallel processing
- 🚀 **Queue Processing**: Eliminates Vercel 10-second timeout limitations

### Major Optimizations
- **Database-Based Queue System**: Asynchronous background processing
- **Parallel AI Operations**: 8 summary jobs processed simultaneously
- **Smart caching strategies**: Multi-layer caching (browser, CDN, database)
- **Intelligent thumbnail fallback**: Handles expired TikTok URLs
- **Progressive loading**: Optimized infinite scroll with performance monitoring
- **Bundle size optimization**: Turbopack build system
- **Vercel Edge Functions**: Global edge computing

## 🐛 Known Issues

- TikTok API rate limits may cause temporary delays
- AI processing requires stable internet connection
- Some older mobile browsers may have limited PWA support

## 📝 Changelog

### v0.2.0 (Current)
- ✅ **YouTube Integration** - Full support for YouTube creators with channel validation
- ✅ **4-Tier Transcript System** - Native captions + Supadata AI with 3 fallback keys
- ✅ **Dynamic Timeout Handling** - Intelligent scaling for long-form content (12-20 seconds)
- ✅ **Mobile UX Enhancements** - Horizontal scrollable filters and enhanced infinite scroll
- ✅ **Transcript Sharing** - Complete transcript sharing with post links
- ✅ **Platform-Specific Features** - Subscribers vs followers, @ symbol handling

### v0.1.0
- ✅ TikTok content aggregation
- ✅ AI-powered summarization with fallback providers
- ✅ Mobile-first PWA design
- ✅ Account management system
- ✅ Advanced filtering and sorting
- ✅ Database-based queue system for scalable processing
- ✅ Real-time progress tracking with visual indicators
- ✅ Parallel AI processing (3x performance improvement)
- ✅ Intelligent thumbnail fallback system
- ✅ Enhanced error handling and retry logic

## 🔮 Roadmap

- [ ] Instagram integration
- [ ] Advanced search functionality
- [ ] Content analytics dashboard
- [ ] Social sharing features
- [ ] Offline content caching
- [ ] Multi-language support
- [ ] Content recommendation engine
- [ ] Advanced transcript search

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Supabase](https://supabase.com/) - Backend as a Service
- [OpenAI](https://openai.com/) - AI summarization
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework
- [Vercel](https://vercel.com/) - Deployment platform

## 📞 Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/eliharoun/social-media-aggregator/issues)
---

<div align="center">

**⭐ Star this repo if you find it useful!**

</div>
