import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { PromptTemplate } from '@langchain/core/prompts'

// LLM configuration
const DEFAULT_LLM_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'openai'

export interface SummaryResult {
  summary: string
  key_points: string[]
  sentiment: string
  topics: string[]
  key_information?: {
    references: string[]
    statistics: string[]
    people_mentioned: string[]
    resources: string[]
  }
  content_type?: string
}

export interface ContentMetadata {
  creator_username: string
  platform: string
  title: string
  caption: string
}

export class SummarizationService {
  private llm: ChatOpenAI | ChatAnthropic

  constructor() {
    this.llm = this.createLLMInstance()
  }

  private createLLMInstance() {
    if (DEFAULT_LLM_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return new ChatAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-haiku-20240307', // Cost-optimized model
        temperature: 0.3,
      })
    } else {
      return new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini', // Cost-optimized model
        temperature: 0.3,
      })
    }
  }

  async generateSummary(
    transcriptText: string, 
    contentMetadata: ContentMetadata,
    options: { 
      isLongForm?: boolean,
      includeExtendedFields?: boolean 
    } = {}
  ): Promise<SummaryResult> {
    const { isLongForm = false, includeExtendedFields = false } = options
    
    // Choose prompt based on content type and requirements
    const promptTemplate = this.getPromptTemplate(isLongForm, includeExtendedFields)
    
    const prompt = await promptTemplate.format({
      creator: contentMetadata.creator_username,
      platform: contentMetadata.platform,
      title: contentMetadata.title,
      caption: contentMetadata.caption,
      transcript: transcriptText
    })

    const response = await this.llm.invoke(prompt)
    
    let summaryData: SummaryResult
    try {
      summaryData = JSON.parse(response.content as string)
    } catch {
      // Fallback if JSON parsing fails
      summaryData = {
        summary: (response.content as string).substring(0, 500),
        key_points: [],
        sentiment: 'neutral',
        topics: []
      }
    }

    return summaryData
  }

  async generateSummaryWithTimeout(
    transcriptText: string, 
    contentMetadata: ContentMetadata, 
    timeoutMs: number,
    options: { 
      isLongForm?: boolean,
      includeExtendedFields?: boolean 
    } = {}
  ): Promise<SummaryResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Summary generation timeout')), timeoutMs)
    })

    const summaryPromise = this.generateSummary(transcriptText, contentMetadata, options)

    return Promise.race([summaryPromise, timeoutPromise])
  }

  private getPromptTemplate(isLongForm: boolean, includeExtendedFields: boolean): PromptTemplate {
    if (isLongForm) {
      return this.getLongFormPrompt()
    } else if (includeExtendedFields) {
      return this.getExtendedPrompt()
    } else {
      return this.getStandardPrompt()
    }
  }

  private getStandardPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are an expert content analyst specializing in social media video transcripts. Your goal is to extract maximum value from transcripts so users can quickly understand the content without watching the video.

## Content Metadata
- Creator: @{creator}
- Platform: {platform}
- Title: {title}
- Caption: {caption}

## Transcript
{transcript}

## Instructions
Analyze the transcript and provide a comprehensive yet concise summary that captures:

1. **Summary**: A clear 2-4 sentence overview that captures the main message and purpose of the content. Focus on what the creator wants the audience to know or do. Write in first person as if the creator is speaking directly to the viewer - NO phrases like "The creator shares," "In this video," or "The speaker discusses." Get straight to the point with natural, conversational language. Avoid AI-sounding filler phrases like "delve into," "it's worth noting," "importantly," or "essentially."

2. **Key Points**: Extract 3-7 of the most important takeaways, insights, or arguments. Prioritize:
   - Actionable advice or recommendations
   - Notable facts, statistics, or data mentioned
   - Core arguments or claims
   - Important examples or case studies
   - Controversial or unique perspectives

3. **Topics/Categories**: List 2-4 main topics or themes that best categorize this content

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "sentiment": "positive|negative|neutral",
  "topics": ["string"]
}}

If any section has no relevant information, use an empty array [] or "neutral" for sentiment.
`)
  }

  private getExtendedPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are an expert content analyst specializing in social media video transcripts. Your goal is to extract maximum value from transcripts so users can quickly understand the content without watching the video.

## Content Metadata
- Creator: @{creator}
- Platform: {platform}
- Title: {title}
- Caption: {caption}

## Transcript
{transcript}

## Instructions
Analyze the transcript and provide a comprehensive yet concise summary that captures:

1. **Summary**: A clear 2-4 sentence overview that captures the main message and purpose of the content. Focus on what the creator wants the audience to know or do. Write in first person as if the creator is speaking directly to the viewer - NO phrases like "The creator shares," "In this video," or "The speaker discusses." Get straight to the point with natural, conversational language. Avoid AI-sounding filler phrases like "delve into," "it's worth noting," "importantly," or "essentially."

2. **Key Points**: Extract 3-7 of the most important takeaways, insights, or arguments. Prioritize:
   - Actionable advice or recommendations
   - Notable facts, statistics, or data mentioned
   - Core arguments or claims
   - Important examples or case studies
   - Controversial or unique perspectives

3. **Key Information & References**: Identify any:
   - Names of people, products, companies, or brands mentioned
   - Book titles, studies, or sources cited
   - Specific tools, resources, or links referenced
   - Important dates, numbers, or statistics
   - Calls-to-action or next steps suggested

4. **Topics/Categories**: List 2-4 main topics or themes that best categorize this content

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "key_information": {{
    "references": ["string"],
    "statistics": ["string"],
    "people_mentioned": ["string"],
    "resources": ["string"]
  }},
  "topics": ["string"],
  "content_type": "string"
}}

If any section has no relevant information, use an empty array [] or null.
`)
  }

  private getLongFormPrompt(): PromptTemplate {
    return PromptTemplate.fromTemplate(`
You are an expert content analyst specializing in long-form educational and informational video content. Your goal is to create comprehensive summaries that capture the depth and structure of detailed content.

## Content Metadata
- Creator: @{creator}
- Platform: {platform} (Long-form content)
- Title: {title}
- Caption: {caption}

## Transcript
{transcript}

## Instructions
Analyze this long-form transcript and provide a structured summary optimized for educational/informational content:

1. **Summary**: A comprehensive 4-6 sentence overview that captures the main thesis, key arguments, and conclusions. Focus on the educational value and main learning objectives. Write in first person as if the creator is speaking directly to the viewer - NO phrases like "The creator shares," "In this video," or "The speaker discusses." Get straight to the point with natural, conversational language. Avoid AI-sounding filler phrases like "delve into," "it's worth noting," "importantly," or "essentially."

2. **Key Points**: Extract 5-10 of the most important insights, organized by importance. Prioritize:
   - Main concepts and definitions
   - Step-by-step processes or methodologies
   - Important data, research findings, or statistics
   - Practical applications and examples
   - Conclusions and recommendations
   - Common misconceptions addressed

3. **Topics/Categories**: List 3-5 main topics or themes, including subtopics where relevant

## Output Format
Respond ONLY with valid JSON. No markdown formatting, no code blocks, just raw JSON in this exact structure:

{{
  "summary": "string",
  "key_points": ["string"],
  "sentiment": "positive|negative|neutral",
  "topics": ["string"]
}}

If any section has no relevant information, use an empty array [] or "neutral" for sentiment.
`)
  }

  static getProvider(): string {
    return DEFAULT_LLM_PROVIDER
  }
}

// Export singleton instance for convenience
export const summarizationService = new SummarizationService()
