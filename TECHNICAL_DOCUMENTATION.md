# Social Media Aggregator - Complete Technical Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [API Documentation](#api-documentation)
6. [Component Architecture](#component-architecture)
7. [Features Documentation](#features-documentation)
8. [Application Flow](#application-flow)
9. [File Structure Reference](#file-structure-reference)
10. [Setup and Installation](#setup-and-installation)
11. [Deployment](#deployment)

## Project Overview

### Purpose and Description
The Social Media Aggregator is an AI-powered Progressive Web Application (PWA) that aggregates content from multiple social media platforms (TikTok, YouTube, Instagram) and provides intelligent summarization and transcription services. The application allows users to follow their favorite creators, automatically fetch their latest content, and receive AI-generated summaries and transcripts for efficient content consumption.

### Key Features
- **Multi-Platform Content Aggregation**: Currently supports TikTok with YouTube and Instagram infrastructure ready
- **AI-Powered Summarization**: Uses OpenAI GPT-4o-mini and Anthropic Claude for intelligent content analysis
- **Automatic Transcription**: Converts video content to searchable text
- **Progressive Web App**: Installable on mobile and desktop devices
- **Real-time Processing**: Live AI processing with visual feedback
- **User Management**: Complete authentication and profile management
- **Advanced Filtering**: Sort, filter, and organize content efficiently

## Technology Stack

### Frontend
- **Framework**: Next.js 15.5.4 with App Router
- **Language**: TypeScript 5.0
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 4.0
- **State Management**: Zustand 5.0.8
- **Image Optimization**: Next.js Image component

### Backend
- **Runtime**: Node.js with Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **Real-time**: Supabase Realtime

### AI Services
- **LLM Framework**: LangChain 0.3.35
- **Primary AI**: OpenAI GPT-4o-mini (@langchain/openai 0.6.14)
- **Secondary AI**: Anthropic Claude Haiku (@langchain/anthropic 0.3.30)
- **Fallback Strategy**: Automatic provider switching on failure

### External APIs
- **TikTok**: RapidAPI TikTok API (multiple keys for redundancy)
- **Transcription**: Multiple transcript API services
- **YouTube**: Infrastructure ready (API integration pending)
- **Instagram**: Infrastructure ready (API integration pending)

### Development Tools
- **Linting**: ESLint 9 with Next.js config
- **Build Tool**: Turbopack (Next.js 15 feature)
- **Package Manager**: npm
- **Version Control**: Git

### Deployment
- **Platform**: Vercel (optimized for Hobby plan)
- **CDN**: Vercel Edge Network
- **Analytics**: Vercel Analytics (optional)
- **Monitoring**: Built-in error tracking

## Architecture

### Architecture Pattern
The application follows a **Modern Full-Stack Architecture** with the following characteristics:

- **Frontend**: React-based SPA with SSR capabilities
- **Backend**: Serverless API routes with edge computing
- **Database**: Cloud-native PostgreSQL with real-time capabilities
- **Authentication**: JWT-based with refresh tokens
- **State Management**: Client-side state with server synchronization
- **Caching**: Multi-layer caching (browser, CDN, database)

### System Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        PWA[Progressive Web App]
        Mobile[Mobile Browser]
        Desktop[Desktop Browser]
    end
    
    subgraph "Frontend Layer"
        NextJS[Next.js 15 App Router]
        React[React 19 Components]
        TailwindCSS[Tailwind CSS]
        Zustand[Zustand State]
    end
    
    subgraph "API Layer"
        APIRoutes[Next.js API Routes]
        Auth[Authentication Middleware]
        RateLimit[Rate Limiting]
    end
    
    subgraph "External Services"
        TikTokAPI[TikTok RapidAPI]
        OpenAI[OpenAI GPT-4o-mini]
        Anthropic[Anthropic Claude]
        TranscriptAPI[Transcript Services]
    end
    
    subgraph "Database Layer"
        Supabase[Supabase PostgreSQL]
        RLS[Row Level Security]
        Realtime[Real-time Subscriptions]
    end
    
    subgraph "Infrastructure"
        Vercel[Vercel Edge Network]
        CDN[Global CDN]
        EdgeFunctions[Edge Functions]
    end
    
    PWA --> NextJS
    Mobile --> NextJS
    Desktop --> NextJS
    
    NextJS --> APIRoutes
    React --> Zustand
    
    APIRoutes --> Auth
    APIRoutes --> TikTokAPI
    APIRoutes --> OpenAI
    APIRoutes --> Anthropic
    APIRoutes --> TranscriptAPI
    
    Auth --> Supabase
    APIRoutes --> Supabase
    Supabase --> RLS
    Supabase --> Realtime
    
    NextJS --> Vercel
    Vercel --> CDN
    Vercel --> EdgeFunctions
```

### Data Flow Architecture

```mermaid
sequenceDiagram
    participant User
    participant PWA
    participant API
    participant External
    participant DB
    participant AI
    
    User->>PWA: Add Creator
    PWA->>API: POST /api/creators/add
    API->>External: Validate Creator (TikTok API)
    External-->>API: Creator Info
    API->>DB: Store Creator
    DB-->>API: Success
    API-->>PWA: Creator Added
    
    User->>PWA: Refresh Content
    PWA->>API: POST /api/content/fetch-all
    API->>External: Fetch Latest Videos
    External-->>API: Video Data
    API->>DB: Cache Content
    API->>AI: Generate Transcripts
    AI-->>API: Transcript Data
    API->>DB: Store Transcripts
    API->>AI: Generate Summaries
    AI-->>API: Summary Data
    API->>DB: Store Summaries
    API-->>PWA: Processed Content
    PWA-->>User: Updated Feed
```

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ user_profiles : has
    users ||--o{ user_settings : has
    users ||--o{ favorite_creators : follows
    users ||--o{ user_content_interactions : interacts
    
    favorite_creators ||--o{ content : creates
    content ||--o{ transcripts : has
    content ||--o{ summaries : has
    content ||--o{ user_content_interactions : tracked_by
    
    users {
        uuid id PK
        string email
        timestamp created_at
        jsonb raw_user_meta_data
    }
    
    user_profiles {
        uuid id PK
        uuid user_id FK
        string display_name
        string avatar_url
        text bio
        timestamp created_at
        timestamp updated_at
    }
    
    user_settings {
        uuid id PK
        uuid user_id FK
        integer tiktok_date_range_days
        integer youtube_date_range_days
        integer instagram_date_range_days
        integer max_content_per_creator
        boolean auto_refresh_enabled
        integer refresh_interval_hours
        text[] enabled_platforms
        boolean auto_expand_summaries
        timestamp created_at
        timestamp updated_at
    }
    
    favorite_creators {
        uuid id PK
        uuid user_id FK
        text platform
        text username
        text platform_user_id
        text display_name
        text avatar_url
        integer follower_count
        timestamp added_at
        boolean is_active
    }
    
    content {
        uuid id PK
        text platform_content_id
        text platform
        text creator_username
        text creator_platform
        text title
        text caption
        text[] hashtags
        text thumbnail_url
        text content_url
        text content_type
        timestamp created_at
        jsonb stats
        timestamp cached_at
    }
    
    transcripts {
        uuid id PK
        uuid content_id FK
        text transcript_text
        text webvtt_data
        text language
        timestamp created_at
    }
    
    summaries {
        uuid id PK
        uuid content_id FK
        text summary
        text[] key_points
        text sentiment
        text[] topics
        text platform
        timestamp created_at
    }
    
    user_content_interactions {
        uuid id PK
        uuid user_id FK
        uuid content_id FK
        boolean is_read
        boolean is_saved
        timestamp read_at
        timestamp saved_at
        timestamp created_at
        timestamp updated_at
    }
```

### Table Descriptions

#### Core Tables

**users** (Supabase Auth)
- Managed by Supabase authentication system
- Contains basic user authentication data
- Links to all user-specific tables

**user_profiles**
- Extended user information for display purposes
- Stores display names, avatars, and bio information
- Automatically created on user signup

**user_settings**
- User preferences and configuration
- Controls content fetching behavior, date ranges, and UI preferences
- Default values applied on account creation

**favorite_creators**
- Tracks which creators a user follows
- Supports multiple platforms (TikTok, YouTube, Instagram)
- Includes creator metadata and follower counts
- Soft delete with `is_active` flag

#### Content Tables

**content**
- Central table for all aggregated social media content
- Platform-agnostic design supports multiple social media platforms
- Stores metadata, statistics, and links to original content
- Unique constraint on platform + platform_content_id

**transcripts**
- AI-generated transcripts from video content
- Supports multiple languages and formats (WebVTT)
- One-to-one relationship with content

**summaries**
- AI-generated summaries with key points and sentiment analysis
- Includes topic extraction and categorization
- One-to-one relationship with content

**user_content_interactions**
- Tracks user interactions with content (read/saved status)
- Enables personalized filtering and recommendations
- Timestamps for analytics and user behavior tracking

### Row Level Security (RLS)

All tables implement comprehensive Row Level Security policies:

- **Users can only access their own data**
- **Content is filtered by followed creators**
- **Transcripts and summaries inherit content access permissions**
- **Automatic policy enforcement at database level**

### Duplicate Prevention and Unique Constraints

The database schema implements several unique constraints to prevent duplicates:

**Tables with UNIQUE Constraints:**

1. **user_settings**
   - `UNIQUE(user_id)` - Each user can have only ONE settings record
   - Automatically created via trigger on user signup

2. **user_profiles**
   - `UNIQUE(user_id)` - Each user can have only ONE profile record
   - Automatically created via trigger on user signup

3. **favorite_creators**
   - `UNIQUE(user_id, platform, username)` - Prevents duplicate creator follows
   - A user cannot follow the same creator on the same platform twice
   - Example: User cannot add "@creator123" on TikTok multiple times

4. **content**
   - `UNIQUE(platform, platform_content_id)` - Prevents duplicate content entries
   - Same content from a platform cannot be stored multiple times
   - Example: TikTok video with ID "7123456789" can only exist once

5. **user_content_interactions**
   - `UNIQUE(user_id, content_id)` - One interaction record per user per content
   - Prevents duplicate read/saved status entries
   - Updates existing record instead of creating duplicates

6. **transcripts**
   - `UNIQUE(content_id)` - Ensures one transcript per content item
   - Prevents duplicate processing and data inconsistency
   - Built into table definition for clean schema

7. **summaries**
   - `UNIQUE(content_id)` - Ensures one summary per content item
   - Prevents UI confusion and duplicate AI processing
   - Built into table definition for clean schema

8. **users** (Supabase Auth)
   - Email uniqueness enforced by Supabase Auth system
   - No additional database constraints needed

### Database Functions and Triggers

**Automatic User Setup**
```sql
-- Creates user settings and profile on signup
CREATE FUNCTION handle_new_user() RETURNS TRIGGER
CREATE FUNCTION handle_new_user_profile() RETURNS TRIGGER
```

**Timestamp Management**
```sql
-- Updates updated_at timestamps automatically
CREATE FUNCTION handle_updated_at() RETURNS TRIGGER
```

## API Documentation

### Authentication

All API endpoints require authentication via Bearer token:

```http
Authorization: Bearer <supabase_access_token>
```

### Content Management APIs

#### GET /api/content/list

Retrieves paginated content from followed creators.

**Query Parameters:**
- `platform` (optional): Filter by platform (`tiktok`, `youtube`, `instagram`)
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "content": [
    {
      "id": "uuid",
      "platform_content_id": "string",
      "platform": "tiktok",
      "creator_username": "string",
      "title": "string",
      "caption": "string",
      "hashtags": ["string"],
      "thumbnail_url": "string",
      "content_url": "string",
      "content_type": "video",
      "created_at": "timestamp",
      "stats": {
        "views": 1000,
        "likes": 100,
        "comments": 50,
        "shares": 25
      },
      "transcripts": [
        {
          "id": "uuid",
          "transcript_text": "string",
          "language": "en"
        }
      ],
      "summaries": [
        {
          "id": "uuid",
          "summary": "string",
          "key_points": ["string"],
          "sentiment": "positive",
          "topics": ["string"]
        }
      ]
    }
  ],
  "grouped": {
    "tiktok": [],
    "youtube": [],
    "instagram": []
  },
  "total": 100,
  "hasMore": true,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "nextOffset": 20
  }
}
```

#### POST /api/content/fetch-all

Fetches latest content from all followed creators and processes with AI.

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "allContent": [],
  "firstPage": [],
  "totalCount": 50,
  "totalPages": 5,
  "cacheStats": {
    "inserted": 10,
    "updated": 5
  },
  "errors": [],
  "processingTime": 5000
}
```

#### POST /api/content/process-page

Processes a batch of content for AI transcription and summarization.

**Request Body:**
```json
{
  "contentIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "results": [
    {
      "content_id": "uuid",
      "hasTranscript": true,
      "hasSummary": true,
      "error": null
    }
  ],
  "processingTime": 8000
}
```

#### GET /api/content/fetch-chunk

Retrieves a specific chunk of content for infinite scrolling.

**Query Parameters:**
- `page` (required): Page number (0-based)
- `limit` (optional): Items per page (default: 10)
- `platform` (optional): Platform filter

**Response:**
```json
{
  "content": [],
  "hasMore": true,
  "nextPage": 2,
  "total": 100
}
```

#### POST /api/content/ensure-summaries

Ensures all content has AI summaries, processing missing ones.

**Request Body:**
```json
{
  "contentIds": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "processed": 5,
  "skipped": 2,
  "errors": []
}
```

### Creator Management APIs

#### GET /api/creators/list

Lists all creators followed by the authenticated user.

**Response:**
```json
{
  "creators": [
    {
      "id": "uuid",
      "platform": "tiktok",
      "username": "creator_username",
      "platform_user_id": "string",
      "display_name": "Creator Name",
      "avatar_url": "string",
      "follower_count": 1000000,
      "added_at": "timestamp",
      "is_active": true
    }
  ]
}
```

#### POST /api/creators/add

Adds a new creator to follow.

**Request Body:**
```json
{
  "platform": "tiktok",
  "username": "creator_username"
}
```

**Response:**
```json
{
  "creator": {
    "id": "uuid",
    "platform": "tiktok",
    "username": "creator_username",
    "platform_user_id": "string",
    "display_name": "Creator Name",
    "avatar_url": "string",
    "follower_count": 1000000,
    "added_at": "timestamp",
    "is_active": true
  }
}
```

**Error Responses:**
- `400`: Invalid platform or username
- `409`: Creator already added
- `404`: Creator not found on platform

#### DELETE /api/creators/remove

Removes a creator from following list (soft delete).

**Request Body:**
```json
{
  "creatorId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Creator removed successfully"
}
```

### AI Processing APIs

#### POST /api/transcripts/generate

Generates transcripts for video content.

**Request Body:**
```json
{
  "contentId": "uuid",
  "contentUrl": "string",
  "language": "en"
}
```

**Response:**
```json
{
  "transcript": {
    "id": "uuid",
    "content_id": "uuid",
    "transcript_text": "string",
    "webvtt_data": "string",
    "language": "en",
    "created_at": "timestamp"
  }
}
```

#### POST /api/summaries/create

Creates AI-powered summaries for content.

**Request Body:**
```json
{
  "contentId": "uuid",
  "transcriptText": "string",
  "contentMetadata": {
    "title": "string",
    "caption": "string",
    "platform": "tiktok"
  }
}
```

**Response:**
```json
{
  "summary": {
    "id": "uuid",
    "content_id": "uuid",
    "summary": "string",
    "key_points": ["string"],
    "sentiment": "positive",
    "topics": ["string"],
    "platform": "tiktok",
    "created_at": "timestamp"
  }
}
```

### Error Handling

All APIs follow consistent error response format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate resource)
- `429`: Rate Limited
- `500`: Internal Server Error

## Component Architecture

### Component Hierarchy

```
App Layout (layout.tsx)
├── AuthProvider
    ├── Navigation
    ├── Header
    └── Page Content
        ├── Dashboard
        │   ├── InfiniteScrollContainer
        │   ├── ContentCard[]
        │   └── ProcessingIndicator
        ├── Creators
        │   ├── CreatorsList
        │   ├── CreatorCard[]
        │   └── AddCreatorForm
        ├── Account
        │   ├── LoginForm
        │   ├── SignupForm
        │   └── ProfileSettings
        └── Settings
            └── UserPreferences
```

### Core Components

#### Layout Components

**Layout (`src/components/layout/Layout.tsx`)**
- Main application wrapper
- Handles responsive design and navigation
- Manages global state and authentication context

**Header (`src/components/layout/Header.tsx`)**
- Application branding and user menu
- Responsive navigation toggle
- Real-time user status display

**Navigation (`src/components/layout/Navigation.tsx`)**
- Bottom navigation for mobile
- Sidebar navigation for desktop
- Active route highlighting

#### Authentication Components

**AuthProvider (`src/components/auth/AuthProvider.tsx`)**
- Supabase authentication context provider
- Session management and token refresh
- Protected route handling

**LoginForm (`src/components/auth/LoginForm.tsx`)**
- Email/password authentication
- Social login integration (ready)
- Form validation and error handling

**SignupForm (`src/components/auth/SignupForm.tsx`)**
- User registration with email verification
- Profile setup during registration
- Terms and privacy policy acceptance

#### Dashboard Components

**ContentCard (`src/components/dashboard/ContentCard.tsx`)**
- Individual content item display
- AI summary expansion/collapse
- Transcript modal integration
- User interaction tracking (read/saved)
- Social sharing functionality

**InfiniteScrollContainer (`src/components/dashboard/InfiniteScrollContainer.tsx`)**
- Virtualized infinite scrolling
- Performance optimization for large lists
- Loading states and error handling
- Pull-to-refresh functionality

**ProcessingIndicator (`src/components/dashboard/ProcessingIndicator.tsx`)**
- Real-time AI processing status
- Visual feedback for transcript/summary generation
- Error state display
- Progress animations

#### Creator Management Components

**CreatorsList (`src/components/creators/CreatorsList.tsx`)**
- Grid/list view of followed creators
- Search and filter functionality
- Bulk operations (remove multiple)
- Creator statistics display

**CreatorCard (`src/components/creators/CreatorCard.tsx`)**
- Individual creator information
- Platform-specific styling and icons
- Follow/unfollow actions
- Creator content preview

**AddCreatorForm (`src/components/creators/AddCreatorForm.tsx`)**
- Multi-platform creator addition
- Real-time validation
- Creator search and suggestions
- Duplicate detection

#### UI Components

**Modal (`src/components/ui/Modal.tsx`)**
- Reusable modal component
- Accessibility features (focus trap, ESC key)
- Mobile-responsive design
- Animation and transitions

### Custom Hooks

#### useContentProcessing (`src/hooks/useContentProcessing.ts`)

Manages AI processing state for content items.

**Features:**
- Batch processing of content
- Real-time status updates
- Error handling and retry logic
- Processing queue management

**Usage:**
```typescript
const { processPage, getStatus, isProcessing } = useContentProcessing()

// Process a batch of content
await processPage(['content-id-1', 'content-id-2'])

// Get processing status for specific content
const status = getStatus('content-id-1')
// Returns: { hasTranscript: boolean, hasSummary: boolean, isProcessing: boolean, error?: string }
```

#### useInfiniteScroll (`src/hooks/useInfiniteScroll.ts`)

Handles infinite scrolling functionality with performance optimization.

**Features:**
- Intersection Observer API
- Debounced loading
- Error boundary integration
- Memory management

#### usePerformance (`src/hooks/usePerformance.ts`)

Monitors application performance and user experience metrics.

**Features:**
- Page load timing
- API response monitoring
- User interaction tracking
- Performance budgets

### State Management

The application uses **Zustand** for client-side state management with the following stores:

**Auth Store**
- User session management
- Authentication state
- Profile information

**Content Store**
- Content cache management
- Filter and sort preferences
- Read/saved status tracking

**UI Store**
- Modal states
- Loading indicators
- Error messages
- Theme preferences

## Features Documentation

### 1. Multi-Platform Content Aggregation

**Feature Description:**
Aggregates content from multiple social media platforms into a unified feed.

**User-Facing Functionality:**
- Add creators from TikTok (active), YouTube and Instagram (infrastructure ready)
- Automatic content fetching from followed creators
- Unified feed with platform-specific styling
- Real-time content updates

**Technical Implementation:**
- Platform-specific API integrations with fallback mechanisms
- Unified data model for cross-platform content
- Batch processing for efficient API usage
- Rate limiting and error handling

**Related Files:**
- `src/app/api/creators/add/route.ts` - Creator validation and addition
- `src/app/api/content/fetch-all/route.ts` - Content aggregation
- `src/components/creators/AddCreatorForm.tsx` - Creator addition UI

**Data Models:**
- `favorite_creators` table - Creator following relationships
- `content` table - Unified content storage

### 2. AI-Powered Content Summarization

**Feature Description:**
Generates intelligent summaries of video content using advanced AI models.

**User-Facing Functionality:**
- Automatic summary generation for all content
- Key points extraction and topic identification
- Sentiment analysis (positive/negative/neutral)
- Expandable summary cards with rich formatting

**Technical Implementation:**
- LangChain integration with OpenAI GPT-4o-mini and Anthropic Claude
- Automatic fallback between AI providers
- Batch processing for cost optimization
- Caching to prevent duplicate processing

**Related Files:**
- `src/app/api/summaries/create/route.ts` - AI summary generation
- `src/components/dashboard/ContentCard.tsx` - Summary display
- `src/hooks/useContentProcessing.ts` - Processing state management

**Data Models:**
- `summaries` table - AI-generated summaries with metadata

### 3. Automatic Video Transcription

**Feature Description:**
Converts video content to searchable text transcripts.

**User-Facing Functionality:**
- Automatic transcript generation for video content
- Full-text search within transcripts
- Multiple language support
- WebVTT format support for accessibility

**Technical Implementation:**
- Multiple transcript API services with redundancy
- Language detection and processing
- WebVTT format generation for video players
- Error handling and retry mechanisms

**Related Files:**
- `src/app/api/transcripts/generate/route.ts` - Transcript generation
- `src/components/dashboard/ContentCard.tsx` - Transcript modal

**Data Models:**
- `transcripts` table - Video transcripts with language metadata

### 4. Progressive Web App (PWA)

**Feature Description:**
Installable web application with native app-like experience.

**User-Facing Functionality:**
- Install on mobile and desktop devices
- Offline content caching
- Push notifications (infrastructure ready)
- Native app appearance and behavior

**Technical Implementation:**
- Service worker for offline functionality
- Web App Manifest for installation
- Responsive design with mobile-first approach
- Touch-friendly interface elements

**Related Files:**
- `public/manifest.json` - PWA configuration
- `src/app/layout.tsx` - PWA metadata and viewport settings

### 5. Advanced Content Filtering

**Feature Description:**
Sophisticated filtering and sorting options for content organization.

**User-Facing Functionality:**
- Filter by platform, date range, and creator
- Sort by engagement, date, or relevance
- Hide read content option
- Save content for later viewing

**Technical Implementation:**
- Client-side filtering with server-side optimization
- Local storage for user preferences
- Real-time filter application
- Performance optimization for large datasets

**Related Files:**
- `src/app/dashboard/page.tsx` - Filter UI implementation
- `src/app/api/content/list/route.ts` - Server-side filtering

**Data Models:**
- `user_settings` table - User filter preferences
- `user_content_interactions` table - Read/saved status

### 6. Real-Time Processing Indicators

**Feature Description:**
Visual feedback for AI processing operations with real-time updates.

**User-Facing Functionality:**
- Live processing status indicators
- Progress animations during AI operations
- Error state display with retry options
- Batch processing feedback

**Technical Implementation:**
- WebSocket connections for real-time updates
- State management for processing status
- Optimistic UI updates
- Error boundary integration

**Related Files:**
- `src/components/dashboard/ProcessingIndicator.tsx` - Visual indicators
- `src/hooks/useContentProcessing.ts` - Processing state management

### 7. User Account Management

**Feature Description:**
Complete user authentication and profile management system.

**User-Facing Functionality:**
- Email/password authentication
- Profile customization (display name, avatar, bio)
- Account settings and preferences
- Secure password management

**Technical Implementation:**
- Supabase Auth integration
- JWT token management with refresh
- Row Level Security for data protection
- Profile image upload and optimization

**Related Files:**
- `src/components/auth/` - Authentication components
- `src/app/account/page.tsx` - Account management UI

**Data Models:**
- `users` table (Supabase Auth)
- `user_profiles` table - Extended user information
- `user_settings` table - User preferences

## Application Flow

### 1. User Onboarding Flow

```mermaid
flowchart TD
    A[User visits app] --> B{Authenticated?}
    B -->|No| C[Show login/signup]
    B -->|Yes| D[Load dashboard]
    
    C --> E[User signs up]
    E --> F[Email verification]
    F --> G[Create user profile]
    G --> H[Set default settings]
    H --> I[Show onboarding]
    I --> J[Add first creators]
    J --> D
    
    D --> K[Fetch user's content]
    K --> L[Display content feed]
```

**Step-by-Step Process:**
1. **Initial Visit**: Check authentication status
2. **Authentication**: Login or signup with email verification
3. **Profile Setup**: Create user profile with display preferences
4. **Default Settings**: Apply default content preferences
5. **Onboarding**: Guide user through adding first creators
6. **Content Loading**: Fetch and display personalized content feed

**Frontend-to-Backend Flow:**
- Authentication handled by Supabase Auth
- Profile creation triggers database functions
- Settings initialization via API calls
- Content fetching through authenticated API endpoints

**Database Operations:**
- User record creation in `auth.users`
- Automatic profile and settings creation via triggers
- Creator addition through `favorite_creators` table
- Content fetching with RLS policy enforcement

### 2. Content Aggregation Workflow

```mermaid
flowchart TD
    A[User clicks refresh] --> B[Get followed creators]
    B --> C[Fetch latest content from APIs]
    C --> D[Cache content in database]
    D --> E[Generate transcripts]
    E --> F[Create AI summaries]
    F --> G[Update processing status]
    G --> H[Display updated feed]
    
    I[Background scheduler] --> J[Auto-refresh enabled?]
    J -->|Yes| C
    J -->|No| K[Wait for next cycle]
    K --> I
```

**Step-by-Step Process:**
1. **Trigger**: User manual refresh or automatic scheduler
2. **Creator Lookup**: Fetch user's followed creators from database
3. **API Calls**: Parallel requests to platform APIs (TikTok, etc.)
4. **Content Caching**: Store/update content in database with deduplication
5. **AI Processing**: Generate transcripts and summaries in background
6. **Status Updates**: Real-time processing status via WebSocket
7. **Feed Update**: Display new content with processing indicators

**External Service Integrations:**
- TikTok RapidAPI for content fetching
- Transcript services for video-to-text conversion
- OpenAI/Anthropic for content summarization
- Error handling and fallback mechanisms

**Error Handling:**
- API rate limiting with exponential backoff
- Service fallback for transcript and AI services
- Partial success handling (some content processed)
- User notification for critical failures

### 3. AI Processing Pipeline

```mermaid
flowchart TD
    A[New content detected] --> B[Extract video URL]
    B --> C[Generate transcript]
    C --> D{Transcript successful?}
    D -->|Yes| E[Create AI summary]
    D -->|No| F[Mark transcript failed]
    
    E --> G{Summary successful?}
    G -->|Yes| H[Store complete processing]
    G -->|No| I[Retry with fallback AI]
    
    I --> J{Fallback successful?}
    J -->|Yes| H
    J -->|No| K[Mark summary failed]
    
    F --> L[Update processing status]
    K --> L
    H --> L
    L --> M[Notify frontend]
```

**Step-by-Step Process:**
1. **Content Detection**: New video content identified
2. **URL Extraction**: Extract processable video URL
3. **Transcript Generation**: Convert video to text using transcript APIs
4. **Transcript Validation**: Verify transcript quality and completeness
5. **AI Summarization**: Generate summary using primary AI provider (OpenAI)
6. **Fallback Processing**: Use secondary AI provider (Anthropic) if primary fails
7. **Data Storage**: Store transcripts and summaries in database
8. **Status Update**: Update processing status and notify frontend

**AI Provider Strategy:**
- Primary: OpenAI GPT-4o-mini for cost-effectiveness
- Secondary: Anthropic Claude Haiku for reliability
- Automatic fallback on API failures or rate limits
- Quality validation for AI-generated content

**Performance Optimization:**
- Batch processing for multiple content items
- Parallel processing where possible
- Caching to prevent duplicate processing
- Resource usage monitoring and throttling

### 4. User Interaction Flow

```mermaid
flowchart TD
    A[User views content] --> B[Mark as read automatically]
    B --> C[User expands summary]
    C --> D[Load AI summary data]
    D --> E[Display formatted summary]
    
    F[User clicks transcript] --> G[Open transcript modal]
    G --> H[Display full transcript]
    
    I[User saves content] --> J[Update local storage]
    J --> K[Sync with database]
    
    L[User shares content] --> M{Native share available?}
    M -->|Yes| N[Use native share API]
    M -->|No| O[Copy to clipboard]
```

**Step-by-Step Process:**
1. **Content Viewing**: Automatic read status tracking
2. **Summary Interaction**: Expand/collapse AI summaries with animations
3. **Transcript Access**: Modal display with full transcript text
4. **Content Management**: Save/unsave functionality with local storage
5. **Social Sharing**: Native share API with clipboard fallback

**User Experience Features:**
- Optimistic UI updates for immediate feedback
- Local storage for offline read/saved status
- Progressive enhancement for native features
- Accessibility support for screen readers

## File Structure Reference

### Directory Tree with Descriptions

```
social-media-aggregator/
├── 📁 public/                          # Static assets and PWA files
│   ├── 📄 manifest.json               # PWA manifest configuration
│   ├── 🖼️ icon.svg                    # App icon (SVG format)
│   ├── 🖼️ file.svg                    # File type icons
│   ├── 🖼️ globe.svg                   # Globe icon
│   ├── 🖼️ next.svg                    # Next.js logo
│   ├── 🖼️ vercel.svg                  # Vercel logo
│   └── 🖼️ window.svg                  # Window icon
├── 📁 src/                             # Source code directory
│   ├── 📄 middleware.ts                # Next.js middleware for auth
│   ├── 📁 app/                         # Next.js App Router directory
│   │   ├── 📄 favicon.ico              # App favicon
│   │   ├── 📄 globals.css              # Global CSS styles
│   │   ├── 📄 layout.tsx               # Root layout component
│   │   ├── 📄 page.tsx                 # Home page component
│   │   ├── 📁 account/                 # Account management pages
│   │   │   └── 📄 page.tsx             # Account settings page
│   │   ├── 📁 creators/                # Creator management pages
│   │   │   └── 📄 page.tsx             # Creators list page
│   │   ├── 📁 dashboard/               # Main dashboard pages
│   │   │   └── 📄 page.tsx             # Content feed page
│   │   ├── 📁 settings/                # App settings pages
│   │   │   └── 📄 page.tsx             # User preferences page
│   │   └── 📁 api/                     # API routes directory
│   │       ├── 📁 content/             # Content-related APIs
│   │       │   ├── 📁 ensure-summaries/
│   │       │   │   └── 📄 route.ts     # Ensure AI summaries exist
│   │       │   ├── 📁 fetch-all/
│   │       │   │   └── 📄 route.ts     # Fetch all creator content
│   │       │   ├── 📁 fetch-chunk/
│   │       │   │   └── 📄 route.ts     # Paginated content fetching
│   │       │   ├── 📁 list/
│   │       │   │   └── 📄 route.ts     # List user's content
│   │       │   └── 📁 process-page/
│   │       │       └── 📄 route.ts     # Process content batch
│   │       ├── 📁 creators/            # Creator management APIs
│   │       │   ├── 📁 add/
│   │       │   │   └── 📄 route.ts     # Add new creator
│   │       │   ├── 📁 list/
│   │       │   │   └── 📄 route.ts     # List followed creators
│   │       │   └── 📁 remove/
│   │       │       └── 📄 route.ts     # Remove creator
│   │       ├── 📁 summaries/           # AI summary APIs
│   │       │   └── 📁 create/
│   │       │       └── 📄 route.ts     # Generate AI summaries
│   │       └── 📁 transcripts/         # Transcript APIs
│   │           └── 📁 generate/
│   │               └── 📄 route.ts     # Generate transcripts
│   ├── 📁 components/                  # React components
│   │   ├── 📁 auth/                    # Authentication components
│   │   │   ├── 📄 AuthProvider.tsx     # Auth context provider
│   │   │   ├── 📄 LoginForm.tsx        # Login form component
│   │   │   └── 📄 SignupForm.tsx       # Registration form
│   │   ├── 📁 creators/                # Creator management components
│   │   │   ├── 📄 AddCreatorForm.tsx   # Add creator form
│   │   │   ├── 📄 CreatorCard.tsx      # Individual creator display
│   │   │   └── 📄 CreatorsList.tsx     # Creators grid/list
│   │   ├── 📁 dashboard/               # Dashboard components
│   │   │   ├── 📄 ContentCard.tsx      # Content item display
│   │   │   ├── 📄 InfiniteScrollContainer.tsx # Infinite scroll
│   │   │   └── 📄 ProcessingIndicator.tsx # AI processing status
│   │   ├── 📁 layout/                  # Layout components
│   │   │   ├── 📄 Header.tsx           # App header
│   │   │   ├── 📄 Layout.tsx           # Main layout wrapper
│   │   │   └── 📄 Navigation.tsx       # Navigation menu
│   │   └── 📁 ui/                      # Reusable UI components
│   │       └── 📄 Modal.tsx            # Modal component
│   ├── 📁 hooks/                       # Custom React hooks
│   │   ├── 📄 useContentProcessing.ts  # AI processing state
│   │   ├── 📄 useInfiniteScroll.ts     # Infinite scroll logic
│   │   └── 📄 usePerformance.ts        # Performance monitoring
│   └── 📁 lib/                         # Utility libraries
│       └── 📄 supabase.ts              # Supabase client config
├── 📁 img/                             # Documentation images
│   ├── 🖼️ add_creators.jpeg           # Creator addition screenshot
│   ├── 🖼️ feed.jpeg                   # Content feed screenshot
│   ├── 🖼️ summary.jpeg                # AI summary screenshot
│   └── 🖼️ transcript.jpeg             # Transcript view screenshot
├── 📄 .gitignore                       # Git ignore rules
├── 📄 database-reset.sql               # Database reset script
├── 📄 database-setup.sql               # Database initialization
├── 📄 eslint.config.mjs                # ESLint configuration
├── 📄 LICENSE                          # MIT license file
├── 📄 next.config.js                   # Next.js configuration (JS)
├── 📄 next.config.ts                   # Next.js configuration (TS)
├── 📄 package-lock.json                # NPM lock file
├── 📄 package.json                     # NPM dependencies
├── 📄 postcss.config.mjs               # PostCSS configuration
├── 📄 README.md                        # Project documentation
├── 📄 tsconfig.json                    # TypeScript configuration
└── 📄 TECHNICAL_DOCUMENTATION.md       # This documentation file
```

### Key File Purposes

#### Configuration Files

**package.json**
- Project dependencies and scripts
- Defines Next.js, React, TypeScript, and AI library versions
- Build and development scripts

**tsconfig.json**
- TypeScript compiler configuration
- Path aliases and module resolution
- Strict type checking settings

**next.config.ts**
- Next.js framework configuration
- Turbopack build optimization
- Environment variable handling

**eslint.config.mjs**
- Code linting rules and standards
- Next.js specific linting configuration
- TypeScript integration

#### Database Files

**database-setup.sql**
- Complete database schema creation
- Row Level Security policies
- Triggers and functions for automation
- Indexes for performance optimization

**database-reset.sql**
- Database cleanup and reset procedures
- Development environment reset

#### Core Application Files

**src/app/layout.tsx**
- Root application layout
- PWA metadata and configuration
- Global providers and context

**src/middleware.ts**
- Authentication middleware
- Route protection logic
- Request/response processing

**src/lib/supabase.ts**
- Supabase client configuration
- Database connection management
- Type definitions for database tables

### Inter-File Dependencies Map

```mermaid
graph TD
    subgraph "Configuration Layer"
        A[package.json] --> B[tsconfig.json]
        B --> C[next.config.ts]
        C --> D[eslint.config.mjs]
    end
    
    subgraph "Database Layer"
        E[database-setup.sql] --> F[supabase.ts]
        F --> G[API Routes]
    end
    
    subgraph "Application Layer"
        H[layout.tsx] --> I[AuthProvider.tsx]
        I --> J[Page Components]
        J --> K[UI Components]
        K --> L[Custom Hooks]
    end
    
    subgraph "API Layer"
        G --> M[Content APIs]
        G --> N[Creator APIs]
        G --> O[AI Processing APIs]
    end
    
    A --> H
    F --> I
    L --> K
    M --> J
    N --> J
    O --> J
```

**Critical Dependencies:**
- All components depend on `AuthProvider` for authentication
- API routes require `supabase.ts` for database access
- UI components use custom hooks for state management
- Processing indicators depend on `useContentProcessing` hook

## Setup and Installation

### Prerequisites

Before setting up the project, ensure you have:

- **Node.js 18+** (LTS recommended)
- **npm** or **yarn** package manager
- **Git** for version control
- **Supabase account** for database and authentication
- **API Keys** for external services

### Required API Keys

1. **Supabase Configuration**
   - Project URL and anon key (free tier available)
   - Service role key for server-side operations

2. **TikTok API Access**
   - RapidAPI subscription for TikTok API
   - Multiple keys recommended for redundancy

3. **AI Services**
   - OpenAI API key (GPT-4o-mini recommended)
   - Anthropic API key (Claude Haiku for fallback)

4. **Transcript Services**
   - Multiple transcript API keys for redundancy

### Installation Steps

#### 1. Clone Repository

```bash
git clone https://github.com/eliharoun/social-media-aggregator.git
cd social-media-aggregator
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Environment Configuration

Create `.env.local` file in project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# TikTok API (Multiple keys for redundancy)
RAPIDAPI_KEY_1=your_rapidapi_key_1
RAPIDAPI_KEY_2=your_rapidapi_key_2
RAPIDAPI_KEY_3=your_rapidapi_key_3

# Transcript Services
TRANSCRIPT_API_KEY_1=your_transcript_api_key_1
TRANSCRIPT_API_KEY_2=your_transcript_api_key_2

# AI Services
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
DEFAULT_LLM_PROVIDER=openai
```

#### 4. Database Setup

1. **Create Supabase Project**
   - Sign up at [supabase.com](https://supabase.com)
   - Create new project
   - Note project URL and API keys

2. **Run Database Setup**
   - Open Supabase SQL Editor
   - Copy and execute `database-setup.sql`
   - Verify tables and policies are created

3. **Configure Authentication**
   - Enable email authentication in Supabase Auth settings
   - Configure email templates (optional)
   - Set up redirect URLs for production

#### 5. Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Verification Steps

1. **Authentication Test**
   - Create test account
   - Verify email confirmation
   - Test login/logout functionality

2. **Creator Addition**
   - Add a TikTok creator
   - Verify creator validation works
   - Check database entries

3. **Content Fetching**
   - Refresh content feed
   - Verify API calls succeed
   - Check content caching

4. **AI Processing**
   - Trigger transcript generation
   - Test summary creation
   - Verify fallback mechanisms

### Troubleshooting

**Common Issues:**

1. **Supabase Connection Errors**
   - Verify environment variables
   - Check project URL format
   - Ensure API keys are correct

2. **TikTok API Failures**
   - Verify RapidAPI subscription
   - Check API key validity
   - Test with different creators

3. **AI Processing Errors**
   - Verify OpenAI/Anthropic API keys
   - Check API usage limits
   - Test fallback providers

4. **Build Errors**
   - Clear `.next` directory
   - Reinstall dependencies
   - Check TypeScript errors

## Deployment

### Vercel Deployment (Recommended)

The application is optimized for Vercel's platform with the following benefits:
- Automatic deployments from Git
- Edge function support
- Built-in analytics
- Optimized for Next.js

#### Deployment Steps

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy Application**
```bash
vercel --prod
```

4. **Configure Environment Variables**
   - Add all environment variables in Vercel dashboard
   - Ensure production API keys are used
   - Set up domain configuration

#### Production Configuration

**Environment Variables Setup:**
- Copy all variables from `.env.local`
- Use production API keys and URLs
- Configure Supabase for production domain

**Domain Configuration:**
- Set up custom domain (optional)
- Configure SSL certificates
- Update Supabase auth redirect URLs

**Performance Optimization:**
- Enable Vercel Analytics
- Configure caching headers
- Set up monitoring and alerts

### Alternative Deployment Options

#### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

#### Self-Hosted Deployment

1. **Build Application**
```bash
npm run build
```

2. **Start Production Server**
```bash
npm start
```

3. **Configure Reverse Proxy**
   - Nginx or Apache configuration
   - SSL certificate setup
   - Load balancing (if needed)

### Monitoring and Maintenance

**Performance Monitoring:**
- Vercel Analytics for user metrics
- API response time monitoring
- Error tracking and alerting

**Database Maintenance:**
- Regular backup procedures
- Performance optimization
- Index maintenance

**Security Updates:**
- Regular dependency updates
- Security patch monitoring
- API key rotation procedures

---

## Conclusion

This Social Media Aggregator represents a modern, scalable approach to content aggregation with AI-powered enhancements. The architecture supports future platform additions, the database design ensures data integrity and security, and the component structure promotes maintainability and reusability.

The application successfully demonstrates:
- **Modern Web Technologies**: Next.js 15, React 19, TypeScript
- **AI Integration**: LangChain with multiple AI providers
- **Progressive Web App**: Mobile-first design with PWA capabilities
- **Scalable Architecture**: Serverless functions with edge computing
- **Security Best Practices**: Row Level Security and JWT authentication

For questions, issues, or contributions, please refer to the project repository and documentation.
