# 🚀 Deployment Guide - Social Media Aggregator

This guide provides comprehensive deployment instructions for the Social Media Aggregator across different platforms and environments.

## Table of Contents
1. [Vercel Deployment (Recommended)](#vercel-deployment-recommended)
2. [Environment Variables Setup](#environment-variables-setup)
3. [Database Configuration](#database-configuration)
4. [Alternative Deployment Options](#alternative-deployment-options)
5. [Production Optimization](#production-optimization)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Troubleshooting](#troubleshooting)

## Vercel Deployment (Recommended)

Vercel is the recommended deployment platform as the application is optimized for Vercel's infrastructure with Next.js 15 and Turbopack.

### Prerequisites

- GitHub/GitLab/Bitbucket account with your repository
- Vercel account (free tier available)
- All required API keys (see Environment Variables section)

### Step-by-Step Deployment

#### 1. Prepare Your Repository

```bash
# Ensure your code is committed and pushed
git add .
git commit -m "Prepare for deployment"
git push origin main
```

#### 2. Deploy via Vercel Dashboard

1. **Sign up/Login** to [vercel.com](https://vercel.com)
2. **Import Project**:
   - Click "New Project"
   - Connect your Git provider (GitHub recommended)
   - Select your `social-media-aggregator` repository
3. **Configure Project**:
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
4. **Deploy**: Click "Deploy" button

#### 3. Deploy via Vercel CLI (Alternative)

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to your Vercel account
vercel login

# Deploy from project root
vercel

# For production deployment
vercel --prod
```

### Post-Deployment Configuration

After successful deployment, you'll need to configure environment variables and domain settings.

## Environment Variables Setup

### Required Environment Variables

Configure these in your Vercel dashboard under **Settings → Environment Variables**:

#### Supabase Configuration
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

#### Social Media APIs
```env
# TikTok API (Multiple keys for redundancy)
RAPIDAPI_KEY_1=your_rapidapi_key_1
RAPIDAPI_KEY_2=your_rapidapi_key_2
RAPIDAPI_KEY_3=your_rapidapi_key_3

# YouTube APIs (Same RapidAPI account)
YOUTUBE_RAPIDAPI_KEY_1=your_rapidapi_key_1
YOUTUBE_RAPIDAPI_KEY_2=your_rapidapi_key_2
YOUTUBE_RAPIDAPI_KEY_3=your_rapidapi_key_3
```

#### AI Services
```env
# OpenAI (Primary AI provider)
OPENAI_API_KEY=sk-your_openai_api_key
DEFAULT_LLM_PROVIDER=openai

# Anthropic (Fallback AI provider)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Supadata AI (YouTube transcript fallback)
SUPADATA_API_KEY_1=your_supadata_api_key_1
SUPADATA_API_KEY_2=your_supadata_api_key_2
SUPADATA_API_KEY_3=your_supadata_api_key_3
```

#### Transcript Services
```env
TRANSCRIPT_API_KEY_1=your_transcript_api_key_1
TRANSCRIPT_API_KEY_2=your_transcript_api_key_2
```

#### Application Configuration
```env
# Your production URL (update after deployment)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Environment Variable Configuration Steps

1. **Access Vercel Dashboard**:
   - Go to your project dashboard
   - Navigate to **Settings → Environment Variables**

2. **Add Variables**:
   - Click "Add New"
   - Enter variable name and value
   - Select environments: Production, Preview, Development
   - Click "Save"

3. **Redeploy** (if needed):
   - Go to **Deployments** tab
   - Click "..." on latest deployment
   - Select "Redeploy"

## Database Configuration

### Supabase Production Setup

#### 1. Configure Authentication

1. **Update Auth Settings**:
   - Go to Supabase Dashboard → Authentication → Settings
   - Add your production URL to **Site URL**: `https://your-app.vercel.app`
   - Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

2. **Email Templates** (Optional):
   - Customize confirmation and recovery email templates
   - Update links to point to your production domain

#### 2. Database Policies

Ensure Row Level Security policies are properly configured:

```sql
-- Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false;

-- Should return no results if RLS is properly configured
```

#### 3. Database Performance

For production, consider these optimizations:

```sql
-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_content_platform_created_at 
ON content(platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorite_creators_user_platform 
ON favorite_creators(user_id, platform, is_active);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_priority 
ON processing_jobs(status, priority, created_at);
```

## Alternative Deployment Options

### Docker Deployment

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 2. Build and Run

```bash
# Build Docker image
docker build -t social-media-aggregator .

# Run container
docker run -p 3000:3000 --env-file .env.local social-media-aggregator
```

### Railway Deployment

1. **Connect Repository**:
   - Sign up at [railway.app](https://railway.app)
   - Connect your GitHub repository
   - Select the `social-media-aggregator` repository

2. **Configure Environment**:
   - Add all environment variables in Railway dashboard
   - Configure custom domain (optional)

3. **Deploy**:
   - Railway automatically builds and deploys
   - Monitor deployment logs for any issues

### Netlify Deployment

1. **Build Configuration**:
   Create `netlify.toml`:
   ```toml
   [build]
     command = "npm run build"
     publish = ".next"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

2. **Deploy**:
   - Connect repository to Netlify
   - Configure environment variables
   - Deploy automatically on push

## Production Optimization

### Performance Configuration

#### 1. Next.js Configuration

Update `next.config.ts` for production:

```typescript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  
  // Image optimization
  images: {
    domains: [
      'your-supabase-project.supabase.co',
      'lh3.googleusercontent.com', // For user avatars
      'p16-sign-sg.tiktokcdn.com', // TikTok thumbnails
      'i.ytimg.com', // YouTube thumbnails
    ],
    formats: ['image/webp', 'image/avif'],
  },
  
  // Enable compression
  compress: true,
  
  // PWA optimization
  headers: async () => [
    {
      source: '/manifest.json',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
}

export default nextConfig
```

#### 2. Bundle Analysis

```bash
# Analyze bundle size
npm install --save-dev @next/bundle-analyzer

# Add to package.json scripts
"analyze": "ANALYZE=true npm run build"

# Run analysis
npm run analyze
```

### Security Configuration

#### 1. Content Security Policy

Add CSP headers in `next.config.ts`:

```typescript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  }
]
```

#### 2. API Rate Limiting

Implement rate limiting for production:

```typescript
// src/lib/rateLimit.ts
import { NextRequest } from 'next/server'

const rateLimitMap = new Map()

export function rateLimit(request: NextRequest, limit = 10, window = 60000) {
  const ip = request.ip || 'anonymous'
  const now = Date.now()
  const windowStart = now - window

  const requestLog = rateLimitMap.get(ip) || []
  const requestsInWindow = requestLog.filter((time: number) => time > windowStart)

  if (requestsInWindow.length >= limit) {
    return false
  }

  requestsInWindow.push(now)
  rateLimitMap.set(ip, requestsInWindow)
  return true
}
```

## Monitoring and Maintenance

### Vercel Analytics

Enable analytics in your Vercel dashboard:

1. **Go to Project Settings**
2. **Navigate to Analytics**
3. **Enable Web Analytics**
4. **Configure Speed Insights** (optional)

### Error Monitoring

#### 1. Sentry Integration (Optional)

```bash
npm install @sentry/nextjs
```

```javascript
// sentry.client.config.js
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
})
```

#### 2. Custom Error Tracking

```typescript
// src/lib/errorTracking.ts
export function trackError(error: Error, context?: any) {
  console.error('Application Error:', error, context)
  
  // Send to your preferred error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Implementation depends on your error tracking service
  }
}
```

### Database Monitoring

#### 1. Supabase Monitoring

- Monitor database performance in Supabase Dashboard
- Set up alerts for high CPU/memory usage
- Monitor API usage and rate limits

#### 2. Queue System Health

Monitor queue processing health:

```sql
-- Check queue health
SELECT 
  job_type,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time
FROM processing_jobs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY job_type, status;
```

### Backup Strategy

#### 1. Database Backups

Supabase automatically handles backups, but for additional safety:

```bash
# Manual backup (requires Supabase CLI)
supabase db dump --db-url "your-connection-string" > backup.sql
```

#### 2. Environment Variables Backup

Keep a secure backup of your environment variables:

```bash
# Create encrypted backup
gpg --symmetric --cipher-algo AES256 .env.production
```

## Custom Domain Configuration

### 1. Add Domain to Vercel

1. **Go to Project Settings**
2. **Navigate to Domains**
3. **Add your custom domain**
4. **Configure DNS records** as instructed

### 2. Update Supabase Configuration

Update your Supabase project settings:

1. **Site URL**: `https://yourdomain.com`
2. **Redirect URLs**: `https://yourdomain.com/auth/callback`

### 3. Update Environment Variables

```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## SSL Certificate

Vercel automatically provides SSL certificates for all domains. For custom domains:

1. **Automatic SSL**: Vercel handles Let's Encrypt certificates
2. **Custom SSL**: Upload your own certificate in domain settings
3. **HSTS**: Enabled automatically for security

## Production Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database schema deployed and tested
- [ ] API keys validated and working
- [ ] Build process completes without errors
- [ ] TypeScript compilation successful
- [ ] ESLint passes without errors

### Post-Deployment

- [ ] Application loads successfully
- [ ] Authentication flow works
- [ ] Creator addition functions properly
- [ ] Content fetching operates correctly
- [ ] AI processing completes successfully
- [ ] Mobile PWA installation works
- [ ] All API endpoints respond correctly
- [ ] Database connections established
- [ ] Queue processing functions properly

### Performance Verification

- [ ] Initial page load < 3 seconds
- [ ] Content refresh < 2 seconds
- [ ] AI processing completes within timeout limits
- [ ] Mobile experience optimized
- [ ] Images load with fallback system
- [ ] Infinite scroll performs smoothly

## Troubleshooting

### Common Deployment Issues

#### 1. Build Failures

**TypeScript Errors:**
```bash
# Check TypeScript compilation
npm run type-check

# Fix common issues
npm run lint --fix
```

**Dependency Issues:**
```bash
# Clear cache and reinstall
rm -rf .next node_modules package-lock.json
npm install
npm run build
```

#### 2. Environment Variable Issues

**Missing Variables:**
- Verify all required variables are set in Vercel dashboard
- Check variable names match exactly (case-sensitive)
- Ensure no trailing spaces in values

**API Key Issues:**
```bash
# Test API keys locally first
curl -H "X-RapidAPI-Key: your_key" \
     -H "X-RapidAPI-Host: tiktok138.p.rapidapi.com" \
     "https://tiktok138.p.rapidapi.com/user/info?username=creator"
```

#### 3. Database Connection Issues

**Supabase Connection:**
- Verify Supabase project URL and keys
- Check if database is paused (free tier limitation)
- Ensure RLS policies allow your operations

**Queue System Issues:**
```sql
-- Check for stuck jobs
SELECT * FROM processing_jobs 
WHERE status = 'processing' 
AND updated_at < NOW() - INTERVAL '10 minutes';

-- Reset stuck jobs
UPDATE processing_jobs 
SET status = 'pending', retry_count = retry_count + 1
WHERE status = 'processing' 
AND updated_at < NOW() - INTERVAL '10 minutes';
```

#### 4. API Integration Issues

**TikTok API:**
- Verify RapidAPI subscription is active
- Check API usage limits
- Test with different creators

**YouTube API:**
- Ensure YouTube138 API is enabled
- Verify channel usernames include @ symbol
- Check video length limits in settings

**AI Services:**
- Verify OpenAI API key and usage limits
- Test Anthropic fallback functionality
- Check LangChain configuration

### Performance Issues

#### 1. Slow Loading

**Diagnosis:**
```bash
# Check bundle size
npm run analyze

# Lighthouse audit
npx lighthouse https://your-app.vercel.app --view
```

**Solutions:**
- Enable image optimization
- Implement code splitting
- Use dynamic imports for heavy components
- Optimize database queries

#### 2. Memory Issues

**Monitor Memory Usage:**
- Check Vercel function logs
- Monitor Supabase database performance
- Optimize queue processing batch sizes

### Rollback Procedures

#### 1. Vercel Rollback

```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]
```

#### 2. Database Rollback

```sql
-- Backup current state
CREATE TABLE backup_content AS SELECT * FROM content;

-- Restore from backup if needed
-- (Implement based on your backup strategy)
```

## Scaling Considerations

### Traffic Scaling

**Vercel Automatic Scaling:**
- Serverless functions scale automatically
- Edge network handles global traffic
- No manual scaling required

**Database Scaling:**
- Monitor Supabase usage metrics
- Upgrade plan if needed
- Implement connection pooling for high traffic

### Cost Optimization

**Vercel Hobby Plan Limits:**
- 100GB bandwidth per month
- 100 serverless function executions per day
- Monitor usage in dashboard

**Supabase Free Tier:**
- 500MB database storage
- 2GB bandwidth per month
- 50,000 monthly active users

## Security Best Practices

### 1. API Key Security

- Never commit API keys to version control
- Use environment variables for all secrets
- Rotate API keys regularly
- Monitor API key usage

### 2. Database Security

- Enable Row Level Security on all tables
- Use service role key only for server-side operations
- Regularly audit database access logs
- Implement proper user permissions

### 3. Application Security

- Keep dependencies updated
- Enable security headers
- Implement proper input validation
- Use HTTPS everywhere

## Maintenance Schedule

### Weekly
- [ ] Monitor error logs
- [ ] Check API usage limits
- [ ] Review performance metrics
- [ ] Verify backup integrity

### Monthly
- [ ] Update dependencies
- [ ] Review security alerts
- [ ] Optimize database performance
- [ ] Analyze user feedback

### Quarterly
- [ ] Security audit
- [ ] Performance optimization review
- [ ] API key rotation
- [ ] Disaster recovery testing

## Support and Resources

### Documentation
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase Production](https://supabase.com/docs/guides/platform/going-to-prod)

### Community
- [Vercel Discord](https://vercel.com/discord)
- [Next.js Discussions](https://github.com/vercel/next.js/discussions)
- [Supabase Discord](https://supabase.com/discord)

### Emergency Contacts
- **Critical Issues**: Check project repository issues
- **Security Issues**: Follow responsible disclosure guidelines
- **Performance Issues**: Monitor Vercel dashboard and logs

---

## Quick Reference

### Essential Commands

```bash
# Local development
npm run dev

# Production build
npm run build
npm start

# Deploy to Vercel
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs
```

### Important URLs

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com
- **Production App**: https://your-app.vercel.app
- **Repository**: https://github.com/eliharoun/social-media-aggregator

---

*For additional help or questions about deployment, please open an issue in the project repository.*
