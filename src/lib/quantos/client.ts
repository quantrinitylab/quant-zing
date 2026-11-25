import {
  DISCOVER_FEED_URI,
  PUBLIC_BSKY_SERVICE,
  QUANTZING_SERVICE,
} from '#/lib/constants'
import {IS_WEB} from '#/env'

export type QuantyMode = 'ask' | 'deepsearch' | 'drafter' | 'pulse'

export interface QuantyHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface QuantyPostContext {
  uri?: string
  text: string
  authorHandle?: string
  authorDisplayName?: string
  likeCount?: number
  repostCount?: number
  replyCount?: number
}

export interface QuantyTrendItem {
  topic: string
  displayName?: string
  description?: string
  link?: string
  category?: string
  postCount?: number
  status?: string
}

export interface QuantySourceCitation {
  uri: string
  handle: string
  displayName: string
  text: string
  likeCount: number
  repostCount: number
  replyCount: number
  indexedAt?: string
  externalUrl?: string
  externalDomain?: string
  externalTitle?: string
  isVerified?: boolean
}

export type QuantyEngineOrigin =
  | 'cloudflare-workers-ai'
  | 'quant-ai'
  | 'quant-router'
  | 'anthropic'
  | 'deepseek'
  | 'quanty-knowledge'
  | 'quanty-math'
  | 'quanty-coding'
  | 'quanty-followup'
  | 'quanty-translation'
  | 'live-network'

export interface QuantyAskRequest {
  prompt: string
  mode: QuantyMode
  ownerId?: string
  postContext?: QuantyPostContext
  history?: QuantyHistoryMessage[]
  trendingTopics?: QuantyTrendItem[]
  feedUri?: string
}

export interface QuantyAskResponse {
  answer: string
  origin: QuantyEngineOrigin
  provider?: string
  billingMode?: string
  citations: QuantySourceCitation[]
  suggestedZingDraft?: string
  latencyMs: number
}

export interface QuantOsServiceHealth {
  online: boolean
  service: 'quant-router' | 'quant-ai' | 'quant-pay'
  version?: string
  latencyMs?: number
  detail?: string
}

export interface QuantOsStatus {
  checkedAt: string
  router: QuantOsServiceHealth
  ai: QuantOsServiceHealth
  pay: QuantOsServiceHealth
  modeLabel: 'QuantAI Live' | 'QuantRouter Live' | 'Live Network'
}

export interface LiveNetworkBriefingStory {
  id: string
  headline: string
  description?: string
  category?: string
  postCount?: number
  status?: string
  feedUri?: string
  topZing?: QuantySourceCitation
  zingCount: number
  totalEngagement: number
  summary: string
  prompt: string
}

export interface LiveNetworkBriefing {
  generatedAt: string
  headline: string
  overview: string
  stories: LiveNetworkBriefingStory[]
  topZings: QuantySourceCitation[]
}

export type QuantZingPlanId = 'zing-basic' | 'zing-pro' | 'zing-pro-plus'

export interface QuantZingCheckoutRequest {
  planId: QuantZingPlanId
  emailOrHandle?: string
  billingCycle?: 'monthly' | 'annual'
}

export interface QuantZingCheckoutResult {
  ok: boolean
  offline?: boolean
  unconfigured?: boolean
  sessionId?: string
  checkoutUrl?: string
  message: string
  planId: QuantZingPlanId
}

export type QuantZingThemeName = 'light' | 'dim' | 'dark'

export interface QuantZingColorPalette {
  mode: QuantZingThemeName
  isLight: boolean
  bg: string
  card: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  accentText: string
  accentSubtle: string
  ctaBg: string
  ctaText: string
  like: string
  rezing: string
  rezingText: string
  rezingSubtle: string
  danger: string
  dangerText: string
}

/**
 * X.com-grade Light / Dim / Dark palette for QuantZing screens.
 * Backwards-compatible with boolean callers (true = dark, false = light)
 * and accepts 'light' | 'dim' | 'dark' directly from useTheme().name.
 * Strictly zero orange/amber tokens anywhere.
 */
export function getQuantZingColors(
  themeInput: boolean | QuantZingThemeName,
): QuantZingColorPalette {
  const mode: QuantZingThemeName =
    typeof themeInput === 'boolean'
      ? themeInput
        ? 'dark'
        : 'light'
      : themeInput

  if (mode === 'dim') {
    return {
      mode: 'dim',
      isLight: false,
      bg: '#15202B',
      card: '#192734',
      surface: '#1E2732',
      border: '#38444D',
      text: '#F7F9F9',
      muted: '#8B98A5',
      accent: '#1D9BF0',
      accentText: '#4DB5F7',
      accentSubtle: 'rgba(29, 155, 240, 0.16)',
      ctaBg: '#EFF3F4',
      ctaText: '#0F1419',
      like: '#F91880',
      rezing: '#00BA7C',
      rezingText: '#00D18B',
      rezingSubtle: 'rgba(0, 186, 124, 0.16)',
      danger: '#F4212E',
      dangerText: '#FF5A65',
    }
  }

  if (mode === 'dark') {
    return {
      mode: 'dark',
      isLight: false,
      bg: '#000000',
      card: '#16181C',
      surface: '#202327',
      border: '#2F3336',
      text: '#E7E9EA',
      muted: '#8B98A5',
      accent: '#1D9BF0',
      accentText: '#4DB5F7',
      accentSubtle: 'rgba(29, 155, 240, 0.14)',
      ctaBg: '#EFF3F4',
      ctaText: '#0F1419',
      like: '#F91880',
      rezing: '#00BA7C',
      rezingText: '#00D18B',
      rezingSubtle: 'rgba(0, 186, 124, 0.14)',
      danger: '#F4212E',
      dangerText: '#FF5A65',
    }
  }

  return {
    mode: 'light',
    isLight: true,
    bg: '#FFFFFF',
    card: '#F7F9F9',
    surface: '#EFF3F4',
    border: '#CFD9DE',
    text: '#0F1419',
    muted: '#536471',
    accent: '#1D9BF0',
    accentText: '#0F6CB2',
    accentSubtle: 'rgba(29, 155, 240, 0.12)',
    ctaBg: '#0F1419',
    ctaText: '#FFFFFF',
    like: '#F91880',
    rezing: '#00875A',
    rezingText: '#006B47',
    rezingSubtle: 'rgba(0, 135, 90, 0.12)',
    danger: '#DC1E29',
    dangerText: '#C41620',
  }
}

function stripEmojiCharsOnly(text: string): string {
  return text
    .replace(/[0-9#*]\uFE0F?\u20E3/g, '')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{203C}\u{2049}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
}

/**
 * Strips stray emojis, dingbats, geometric box symbols, and variation selectors
 * from scraped feed headlines, snippets, and generated summaries while
 * preserving normal punctuation, line breaks, and whitespace inside fenced code blocks.
 */
export function stripEmojisAndSymbols(text: string): string {
  if (!text) return ''
  const raw = String(text)
  if (!raw.includes('```')) {
    return stripEmojiCharsOnly(raw)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim()
  }
  const parts = raw.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, idx) => {
      const cleaned = stripEmojiCharsOnly(part)
      if (idx % 2 === 1) {
        return cleaned
      }
      return cleaned
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
    })
    .join('')
    .trim()
}

export function getQuantZingApiOrigin(): string {
  if (IS_WEB && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return QUANTZING_SERVICE.replace(/\/+$/, '')
}

export function getQuantOsBaseUrls() {
  if (IS_WEB) {
    return {
      ai: '/api/quant-ai',
      router: '/api/quant-router',
      pay: '/api/quant-pay',
    }
  }
  const base = QUANTZING_SERVICE.replace(/\/+$/, '')
  return {
    ai: `${base}/api/quant-ai`,
    router: `${base}/api/quant-router`,
    pay: `${base}/api/quant-pay`,
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 1500,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function probeService(
  service: 'quant-router' | 'quant-ai' | 'quant-pay',
  url: string,
): Promise<QuantOsServiceHealth> {
  const started = Date.now()
  try {
    const res = await fetchWithTimeout(
      `${url}/health`,
      {method: 'GET', headers: {accept: 'application/json'}},
      1500,
    )
    const latencyMs = Date.now() - started
    if (!res.ok) {
      return {
        online: false,
        service,
        latencyMs,
        detail: `HTTP ${res.status}`,
      }
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const statusOk =
      data?.status === 'ok' || data?.ok === true || res.status === 200
    return {
      online: Boolean(statusOk && !data?.offline),
      service,
      version: typeof data?.version === 'string' ? data.version : undefined,
      latencyMs,
    }
  } catch {
    return {
      online: false,
      service,
      latencyMs: Date.now() - started,
      detail: 'offline',
    }
  }
}

export async function checkQuantOsStatus(): Promise<QuantOsStatus> {
  const urls = getQuantOsBaseUrls()
  const [router, ai, pay] = await Promise.all([
    probeService('quant-router', urls.router),
    probeService('quant-ai', urls.ai),
    probeService('quant-pay', urls.pay),
  ])

  let modeLabel: QuantOsStatus['modeLabel'] = 'Live Network'
  if (ai.online) {
    modeLabel = 'QuantAI Live'
  } else if (router.online) {
    modeLabel = 'QuantRouter Live'
  }

  return {
    checkedAt: new Date().toISOString(),
    router,
    ai,
    pay,
    modeLabel,
  }
}

interface RawSearchPostEmbed {
  $type?: string
  external?: {
    uri?: string
    title?: string
    description?: string
  }
  media?: {
    external?: {
      uri?: string
      title?: string
      description?: string
    }
  }
}

interface RawSearchPostsResponse {
  posts?: Array<{
    uri?: string
    indexedAt?: string
    likeCount?: number
    repostCount?: number
    replyCount?: number
    author?: {
      handle?: string
      displayName?: string
      verification?: {
        verifiedStatus?: string
      }
    }
    record?: {
      text?: string
    }
    embed?: RawSearchPostEmbed
  }>
}

interface RawTrendsResponse {
  trends?: Array<{
    topic?: string
    displayName?: string
    description?: string
    link?: string
    category?: string
    postCount?: number
    status?: string
  }>
}

interface RawFeedResponse {
  feed?: Array<{
    post?: NonNullable<RawSearchPostsResponse['posts']>[number]
  }>
}

interface RawThreadNode {
  post?: NonNullable<RawSearchPostsResponse['posts']>[number]
  parent?: RawThreadNode
  replies?: RawThreadNode[]
}

interface RawPostThreadResponse {
  thread?: RawThreadNode
}

export function trendLinkToFeedUri(link?: string): string | undefined {
  if (!link) return undefined
  const match = link.match(/^\/profile\/([^/]+)\/feed\/([^/?#]+)/i)
  if (!match) return undefined
  return `at://${match[1]}/app.bsky.feed.generator/${match[2]}`
}

export function trendLinkToSearchQuery(link?: string): string | undefined {
  if (!link) return undefined
  const match = link.match(/^\/search\?(.+)/i)
  if (!match) return undefined
  try {
    const params = new URLSearchParams(match[1])
    const q = params.get('q')?.trim()
    return q || undefined
  } catch {
    return undefined
  }
}

function extractDomainFromUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined
  try {
    const parsed = new URL(rawUrl)
    return parsed.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return undefined
  }
}

function mapRawPostToCitation(
  p: NonNullable<RawSearchPostsResponse['posts']>[number],
): QuantySourceCitation | null {
  if (typeof p.uri !== 'string' || typeof p.record?.text !== 'string') {
    return null
  }
  const ext = p.embed?.external || p.embed?.media?.external
  const inlineUrl = p.record.text.match(/https?:\/\/[^\s)]+/i)?.[0]
  const externalUrl = ext?.uri || inlineUrl
  const externalDomain = extractDomainFromUrl(externalUrl)
  const textClean = stripEmojisAndSymbols(p.record.text)
  const titleClean = ext?.title ? stripEmojisAndSymbols(ext.title) : undefined
  const combinedText = textClean || (titleClean ? titleClean : '')
  if (!combinedText) return null

  const handle = p.author?.handle?.trim() || 'unknown'
  const cleanDisplayName = stripEmojisAndSymbols(p.author?.displayName || '')

  return {
    uri: p.uri,
    handle,
    displayName: cleanDisplayName || handle,
    text: combinedText,
    likeCount: Number(p.likeCount || 0),
    repostCount: Number(p.repostCount || 0),
    replyCount: Number(p.replyCount || 0),
    indexedAt: p.indexedAt,
    externalUrl,
    externalDomain,
    externalTitle: titleClean,
    isVerified: p.author?.verification?.verifiedStatus === 'valid',
  }
}

/**
 * Searches real live Zings via same-origin AppView proxy (web) or Public AppView (native).
 */
export async function searchLiveZings(
  query: string,
  limit = 6,
  sort: 'top' | 'latest' = 'top',
): Promise<QuantySourceCitation[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const searchOrigin =
      IS_WEB && typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : PUBLIC_BSKY_SERVICE
    const endpoint = `${searchOrigin}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
      trimmed,
    )}&limit=${encodeURIComponent(String(limit))}&sort=${sort}`
    const res = await fetchWithTimeout(
      endpoint,
      {method: 'GET', headers: {accept: 'application/json'}},
      5000,
    )
    if (!res.ok) return []
    const payload = (await res.json()) as RawSearchPostsResponse
    const posts = Array.isArray(payload.posts) ? payload.posts : []
    return posts
      .map(mapRawPostToCitation)
      .filter((c): c is QuantySourceCitation => Boolean(c))
  } catch {
    return []
  }
}

async function searchLiveZingsDual(
  query: string,
  limit = 8,
): Promise<QuantySourceCitation[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const perBucket = Math.max(4, Math.ceil(limit * 0.75))
  const [topResults, latestResults] = await Promise.all([
    searchLiveZings(trimmed, perBucket, 'top'),
    searchLiveZings(trimmed, perBucket, 'latest'),
  ])

  const seen = new Set<string>()
  const merged: QuantySourceCitation[] = []

  for (const item of [...topResults, ...latestResults]) {
    if (seen.has(item.uri)) continue
    seen.add(item.uri)
    merged.push(item)
    if (merged.length >= limit) break
  }

  return merged
}

export async function fetchPublicTrends(
  limit = 8,
): Promise<QuantyTrendItem[]> {
  try {
    const endpoint = `${PUBLIC_BSKY_SERVICE}/xrpc/app.bsky.unspecced.getTrends?limit=${encodeURIComponent(
      String(limit),
    )}`
    const res = await fetchWithTimeout(
      endpoint,
      {method: 'GET', headers: {accept: 'application/json'}},
      4500,
    )
    if (!res.ok) return []
    const payload = (await res.json()) as RawTrendsResponse
    const trends = Array.isArray(payload.trends) ? payload.trends : []
    return trends
      .filter(t => typeof t.topic === 'string' && t.topic.trim().length > 0)
      .map(t => {
        const cleanTopic = stripEmojisAndSymbols(t.topic as string) || (t.topic as string).trim()
        const cleanDisplay = stripEmojisAndSymbols(t.displayName || '') || cleanTopic
        const cleanDesc = t.description ? stripEmojisAndSymbols(t.description) : undefined
        const cleanCategory = t.category ? stripEmojisAndSymbols(t.category) : undefined
        return {
          topic: cleanTopic,
          displayName: cleanDisplay,
          description: cleanDesc || undefined,
          link: t.link?.trim() || undefined,
          category: cleanCategory || undefined,
          postCount: t.postCount,
          status: t.status,
        }
      })
      .slice(0, limit)
  } catch {
    return []
  }
}

async function fetchFeedZings(
  feedUri: string,
  limit = 8,
): Promise<QuantySourceCitation[]> {
  if (!feedUri) return []
  try {
    const endpoint = `${PUBLIC_BSKY_SERVICE}/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(
      feedUri,
    )}&limit=${encodeURIComponent(String(limit))}`
    const res = await fetchWithTimeout(
      endpoint,
      {method: 'GET', headers: {accept: 'application/json'}},
      5000,
    )
    if (!res.ok) return []
    const payload = (await res.json()) as RawFeedResponse
    const items = Array.isArray(payload.feed) ? payload.feed : []
    const seen = new Set<string>()
    const mapped: QuantySourceCitation[] = []
    for (const entry of items) {
      if (!entry?.post) continue
      const cite = mapRawPostToCitation(entry.post)
      if (!cite || seen.has(cite.uri)) continue
      seen.add(cite.uri)
      mapped.push(cite)
      if (mapped.length >= limit) break
    }
    return mapped
  } catch {
    return []
  }
}

async function fetchAuthorRecentZings(
  actor: string,
  limit = 5,
  excludeUri?: string,
): Promise<QuantySourceCitation[]> {
  if (!actor) return []
  try {
    const endpoint = `${PUBLIC_BSKY_SERVICE}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
      actor,
    )}&limit=${encodeURIComponent(String(limit + 2))}`
    const res = await fetchWithTimeout(
      endpoint,
      {method: 'GET', headers: {accept: 'application/json'}},
      4500,
    )
    if (!res.ok) return []
    const payload = (await res.json()) as RawFeedResponse
    const items = Array.isArray(payload.feed) ? payload.feed : []
    const seen = new Set<string>()
    const mapped: QuantySourceCitation[] = []
    for (const entry of items) {
      if (!entry?.post) continue
      const cite = mapRawPostToCitation(entry.post)
      if (!cite || cite.uri === excludeUri || seen.has(cite.uri)) continue
      seen.add(cite.uri)
      mapped.push(cite)
      if (mapped.length >= limit) break
    }
    return mapped
  } catch {
    return []
  }
}

async function fetchPostThreadAndQuotes(
  postUri: string,
  authorHandle?: string,
): Promise<QuantySourceCitation[]> {
  if (!postUri) return []
  const collected: QuantySourceCitation[] = []
  const seen = new Set<string>([postUri])

  const pushUnique = (cite: QuantySourceCitation | null) => {
    if (!cite || seen.has(cite.uri)) return
    seen.add(cite.uri)
    collected.push(cite)
  }

  const [threadRes, quotesRes] = await Promise.all([
    fetchWithTimeout(
      `${PUBLIC_BSKY_SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
        postUri,
      )}&depth=3&parentHeight=2`,
      {method: 'GET', headers: {accept: 'application/json'}},
      4500,
    ).catch(() => null),
    fetchWithTimeout(
      `${PUBLIC_BSKY_SERVICE}/xrpc/app.bsky.feed.getQuotes?uri=${encodeURIComponent(
        postUri,
      )}&limit=6`,
      {method: 'GET', headers: {accept: 'application/json'}},
      4500,
    ).catch(() => null),
  ])

  if (threadRes?.ok) {
    const data = (await threadRes.json().catch(() => null)) as
      | RawPostThreadResponse
      | null
    const root = data?.thread
    if (root?.parent?.post) {
      pushUnique(mapRawPostToCitation(root.parent.post))
    }
    const replies = Array.isArray(root?.replies) ? root.replies : []
    for (const replyNode of replies.slice(0, 6)) {
      if (replyNode?.post) {
        pushUnique(mapRawPostToCitation(replyNode.post))
      }
    }
  }

  if (quotesRes?.ok) {
    const data = (await quotesRes.json().catch(() => null)) as
      | RawSearchPostsResponse
      | null
    const quotes = Array.isArray(data?.posts) ? data.posts : []
    for (const q of quotes.slice(0, 6)) {
      pushUnique(mapRawPostToCitation(q))
    }
  }

  if (collected.length < 3 && authorHandle) {
    const authorRecent = await fetchAuthorRecentZings(authorHandle, 4, postUri)
    for (const item of authorRecent) {
      pushUnique(item)
    }
  }

  return collected.slice(0, 8)
}

async function fetchPublicFallbackZings(
  query: string,
  trends: QuantyTrendItem[],
  limit = 8,
): Promise<QuantySourceCitation[]> {
  const queryTerms = extractSearchKeywords(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2)

  const matchedTrend = trends.find(t => {
    const hay = `${t.displayName || ''} ${t.description || ''} ${t.category || ''}`.toLowerCase()
    return (
      queryTerms.length > 0 &&
      queryTerms.some(term => hay.includes(term)) &&
      Boolean(trendLinkToFeedUri(t.link))
    )
  })

  const candidateFeeds: string[] = []
  const matchedFeedUri = matchedTrend ? trendLinkToFeedUri(matchedTrend.link) : undefined
  if (matchedFeedUri) candidateFeeds.push(matchedFeedUri)
  if (!matchedFeedUri && trends.length > 0) {
    const topTrendUri = trendLinkToFeedUri(trends[0].link)
    if (topTrendUri) candidateFeeds.push(topTrendUri)
  }
  candidateFeeds.push(DISCOVER_FEED_URI)

  const batches = await Promise.all(
    candidateFeeds.map((uri, idx) =>
      fetchFeedZings(uri, idx === candidateFeeds.length - 1 ? 25 : 8),
    ),
  )

  const seen = new Set<string>()
  const pool: QuantySourceCitation[] = []
  for (const batch of batches) {
    for (const item of batch) {
      if (seen.has(item.uri)) continue
      seen.add(item.uri)
      pool.push(item)
    }
  }

  if (queryTerms.length === 0) {
    return pool.slice(0, limit)
  }

  const scored = pool.map(item => {
    const hay = `${item.text} ${item.handle} ${item.externalTitle || ''}`.toLowerCase()
    let hits = 0
    for (const term of queryTerms) {
      if (hay.includes(term)) hits += 1
    }
    const engagementBoost = Math.log10(Math.max(10, item.likeCount + item.repostCount * 2))
    return {item, score: hits * 10 + engagementBoost, hits}
  })

  scored.sort((a, b) => b.score - a.score)
  const matchedOnly = scored.filter(s => s.hits > 0).map(s => s.item)
  if (matchedOnly.length >= 3) {
    return matchedOnly.slice(0, limit)
  }
  return scored.slice(0, limit).map(s => s.item)
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'what',
  'about',
  'into',
  'have',
  'your',
  'will',
  'just',
  'like',
  'more',
  'when',
  'they',
  'them',
  'were',
  'been',
  'than',
  'then',
  'some',
  'could',
  'would',
  'should',
  'there',
  'their',
  'which',
  'where',
  'these',
  'those',
  'being',
  'other',
  'after',
  'first',
  'still',
  'because',
  'before',
  'through',
  'really',
  'people',
  'think',
  'going',
  'right',
  'here',
  'only',
  'also',
  'very',
  'much',
  'most',
  'make',
  'made',
  'over',
  'back',
  'even',
  'does',
  'dont',
  'cant',
  'wont',
  'youre',
  'thats',
  'heres',
  'explain',
  'summarize',
  'summary',
  'fact',
  'check',
  'factcheck',
  'draft',
  'write',
  'zing',
  'zings',
  'rezing',
  'quantzing',
  'post',
  'posts',
  'thread',
  'quanty',
  'please',
  'tell',
  'give',
  'happening',
  'today',
  'live',
  'analyze',
  'context',
  'behind',
  'quoted',
  'link',
  'image',
  'images',
  'video',
  'attached',
  'media',
  'items',
  'sharp',
  'reply',
  'find',
  'counter',
  'arguments',
  'line',
  'viral',
  'claim',
  'breaking',
  'high',
  'engagement',
  'conversations',
  'top',
  'bsky',
  'social',
  'http',
  'https',
  'www',
  'com',
  'org',
  'net',
])

const ALLOWED_SHORT_ACRONYMS = new Set([
  'AI',
  'ML',
  'US',
  'UK',
  'EU',
  'UN',
  'F1',
  'EV',
  'VR',
  'AR',
  'OS',
  'IP',
  'UI',
  'UX',
  'NY',
  'LA',
  'SF',
  'DC',
  'G7',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
])

interface ParsedZingContext {
  primaryText: string
  quotedAuthor?: string
  quotedText?: string
  links: Array<{title?: string; description?: string; uri?: string; domain?: string}>
  mediaAlts: string[]
  isShortReactionOnly: boolean
  substanceText: string
}

function stripNonAlphanumeric(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[a-zA-Z0-9._-]+/g, ' ')
    .replace(/[^a-zA-Z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFocusedZingContext(rawText: string): ParsedZingContext {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const primaryLines: string[] = []
  let quotedAuthor: string | undefined
  let quotedText: string | undefined
  const links: ParsedZingContext['links'] = []
  const mediaAlts: string[] = []

  for (const line of lines) {
    const quoteMatch = line.match(/^Quoted\s+@([a-zA-Z0-9._-]+):\s*"?(.*?)"?$/i)
    if (quoteMatch) {
      quotedAuthor = quoteMatch[1]
      quotedText = stripEmojisAndSymbols(quoteMatch[2] || '')
      continue
    }
    const quoteOnlyMatch = line.match(/^Quoted\s+(?:Zing|Post)\s+by\s+@([a-zA-Z0-9._-]+)$/i)
    if (quoteOnlyMatch) {
      quotedAuthor = quoteOnlyMatch[1]
      continue
    }
    if (/^Link:\s*/i.test(line)) {
      const body = line.replace(/^Link:\s*/i, '').trim()
      const uriMatch = body.match(/\((https?:\/\/[^\s)]+)\)\s*$/)
      const uri = uriMatch?.[1] || body.match(/https?:\/\/\S+/)?.[0]
      const withoutUri = uriMatch
        ? body.slice(0, uriMatch.index).trim()
        : body.replace(/https?:\/\/\S+/g, '').trim()
      const titleMatch = withoutUri.match(/^"([^"]+)"(?:\s*—\s*(.*))?$/)
      const title = stripEmojisAndSymbols(titleMatch?.[1] || withoutUri || '') || undefined
      const description = titleMatch?.[2]
        ? stripEmojisAndSymbols(titleMatch[2]) || undefined
        : undefined
      links.push({
        title,
        description,
        uri,
        domain: extractDomainFromUrl(uri),
      })
      continue
    }
    if (/^(Image|Video)\s+alt:\s*/i.test(line)) {
      const alt = stripEmojisAndSymbols(line.replace(/^(Image|Video)\s+alt:\s*/i, ''))
      if (alt) mediaAlts.push(alt)
      continue
    }
    if (/^\[Attached\s+/i.test(line)) {
      continue
    }
    primaryLines.push(stripEmojisAndSymbols(line))
  }

  const primaryText = primaryLines.filter(Boolean).join(' ').trim()

  const inlineUrls =
    `${primaryText} ${quotedText || ''}`.match(/https?:\/\/[^\s)]+/g) || []
  for (const uri of inlineUrls) {
    if (!links.some(l => l.uri === uri)) {
      links.push({uri, domain: extractDomainFromUrl(uri)})
    }
  }

  const primaryAlpha = stripNonAlphanumeric(primaryText)
  const isShortReactionOnly = primaryText.length > 0 && primaryAlpha.length < 4

  const substanceParts = [
    !isShortReactionOnly ? primaryText : '',
    quotedText || '',
    ...links.map(l => `${l.title || ''} ${l.description || ''}`.trim()),
    ...mediaAlts,
  ].filter(Boolean)

  return {
    primaryText,
    quotedAuthor,
    quotedText,
    links,
    mediaAlts,
    isShortReactionOnly,
    substanceText: substanceParts.join(' — ').trim(),
  }
}

export function extractSearchKeywords(input: string): string {
  const normalized = input
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/at:\/\/\S+/g, ' ')
    .replace(/^(Quoted\s+@[a-zA-Z0-9._-]+:|Link:|Image alt:|Video alt:|Feed:|List:)/gim, ' ')
    .replace(/\[Attached[^\]]*\]/gi, ' ')
    .replace(/@[a-zA-Z0-9._-]+/g, ' ')

  const hashtags = (normalized.match(/#[a-zA-Z0-9_]{2,}/g) || []).slice(0, 2)

  const rawTokens = normalized
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, '').trim())
    .filter(Boolean)

  const scored: Array<{token: string; score: number}> = []
  const seen = new Set<string>(hashtags.map(h => h.toLowerCase()))

  for (const token of rawTokens) {
    const low = token.toLowerCase()
    if (seen.has(low) || seen.has(`#${low}`)) continue
    if (/^\d+$/.test(token)) continue
    if (STOP_WORDS.has(low)) continue

    const isAllowedAcronym = ALLOWED_SHORT_ACRONYMS.has(token.toUpperCase())
    if (token.length < 3 && !isAllowedAcronym) continue

    let score = Math.min(token.length, 10)
    if (isAllowedAcronym) score += 12
    else if (/^[A-Z]{2,5}$/.test(token)) score += 10
    else if (/^[A-Z][a-z]{2,}/.test(token)) score += 6

    seen.add(low)
    scored.push({token, score})
  }

  scored.sort((a, b) => b.score - a.score)

  const picked = [...hashtags, ...scored.map(s => s.token)].slice(0, 4)
  return picked.join(' ').trim()
}

function extractRecurringThemes(
  citations: QuantySourceCitation[],
  seedText = '',
): string[] {
  const counts = new Map<string, {display: string; count: number}>()
  const allTexts = [seedText, ...citations.map(c => c.text)].filter(Boolean)

  for (const text of allTexts) {
    const clean = text
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/@[a-zA-Z0-9._-]+/g, ' ')
      .replace(/[^a-zA-Z0-9#\s]/g, ' ')
    const tokens = clean.split(/\s+/).filter(Boolean)
    const seenInPost = new Set<string>()
    for (const raw of tokens) {
      const low = raw.toLowerCase()
      if (seenInPost.has(low)) continue
      if (STOP_WORDS.has(low.replace(/^#/, ''))) continue
      const isAcronym = ALLOWED_SHORT_ACRONYMS.has(raw.toUpperCase())
      if (raw.length < 4 && !raw.startsWith('#') && !isAcronym) continue
      if (/^\d+$/.test(raw)) continue
      seenInPost.add(low)
      const existing = counts.get(low)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(low, {display: raw, count: 1})
      }
    }
  }

  return Array.from(counts.values())
    .filter(item => item.count >= 2 || item.display.startsWith('#'))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(item => item.display)
}

function scoreSentiment(texts: string[]): {
  label: string
  positive: number
  critical: number
  neutral: number
} {
  const positiveWords = [
    'great',
    'love',
    'launch',
    'awesome',
    'win',
    'shipped',
    'amazing',
    'fast',
    'bullish',
    'exciting',
    'milestone',
    'breakthrough',
    'clean',
    'solid',
    'growth',
    'smart',
    'impressive',
    'helpful',
    'progress',
  ]
  const criticalWords = [
    'broken',
    'fail',
    'crash',
    'scam',
    'false',
    'fake',
    'issue',
    'concern',
    'risk',
    'delay',
    'down',
    'warning',
    'bug',
    'problem',
    'lawsuit',
    'wrong',
    'lie',
    'misleading',
    'terrible',
    'crisis',
  ]
  let positive = 0
  let critical = 0
  let neutral = 0
  for (const t of texts) {
    const low = t.toLowerCase()
    const posHits = positiveWords.filter(w => low.includes(w)).length
    const negHits = criticalWords.filter(w => low.includes(w)).length
    if (posHits > negHits) positive += 1
    else if (negHits > posHits) critical += 1
    else neutral += 1
  }
  let label = 'Balanced'
  if (positive > critical + 1) label = 'Constructive'
  else if (critical > positive + 1) label = 'Skeptical'
  else if (positive > 0 && critical > 0) label = 'Active Debate'
  return {label, positive, critical, neutral}
}

function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatRelativeAge(iso?: string): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return ''
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function buildSystemPrompt(
  req: QuantyAskRequest,
  citations: QuantySourceCitation[] = [],
): string {
  const modeDirectives: Record<QuantyMode, string> = {
    ask: 'You are Quanty, the AI assistant built into QuantZing. Give crisp, direct, well-structured answers with ### Summary, ### Key Perspectives, ### Context & Verification, and ### Suggested Zing (under 275 chars). Never use emojis.',
    deepsearch:
      'You are Quanty in DeepSearch mode on QuantZing. Break down verifiable claims, separate primary commentary from quoted Zings, links, and media, highlight corroborating or conflicting voices, and note missing evidence clearly. End with ### Suggested Zing (under 275 chars). Never use emojis.',
    drafter:
      'You are Quanty in Draft Zing mode on QuantZing. Start with a punchy, ready-to-publish Zing under 275 characters under ### Suggested Zing, followed by a tight 3-part thread outline. Zero cliches and zero emojis.',
    pulse:
      'You are Quanty in News mode on QuantZing. Synthesize today’s top stories and live conversations into a fast-reading briefing with key developments, leading voices, and ### Suggested Zing (under 275 chars). Never use emojis.',
  }

  const parts = [modeDirectives[req.mode]]

  if (req.postContext?.text) {
    parts.push(
      `Focused Zing (@${req.postContext.authorHandle || 'creator'}):\n${stripEmojisAndSymbols(req.postContext.text)}`,
    )
  }

  if (req.trendingTopics && req.trendingTopics.length > 0) {
    const trendList = req.trendingTopics
      .slice(0, 8)
      .map(
        t =>
          `${t.displayName || t.topic}${t.category ? ` [${t.category}]` : ''}${
            t.postCount ? ` (${t.postCount} zings)` : ''
          }`,
      )
      .join('; ')
    parts.push(`Trending Stories: ${trendList}`)
  }

  if (citations.length > 0) {
    const citeLines = citations.slice(0, 6).map((c, idx) => {
      const domain = c.externalDomain ? ` [link: ${c.externalDomain}]` : ''
      const snippet = c.text.replace(/\s+/g, ' ').slice(0, 200)
      return `${idx + 1}. @${c.handle} (${c.likeCount} likes, ${c.repostCount} rezings${domain}): "${snippet}"`
    })
    parts.push(`Recent Zings Retrieved:\n${citeLines.join('\n')}`)
  }

  return parts.join('\n\n')
}

function extractChatContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  const directChoices = obj.choices
  if (Array.isArray(directChoices) && directChoices.length > 0) {
    const msg = (directChoices[0] as Record<string, unknown>)?.message as
      | Record<string, unknown>
      | undefined
    if (typeof msg?.content === 'string' && msg.content.trim().length > 0) {
      return stripEmojisAndSymbols(msg.content)
    }
  }

  const candidates = obj.candidates
  if (Array.isArray(candidates) && candidates.length > 0) {
    const first = candidates[0] as Record<string, unknown>
    const content = first?.content as Record<string, unknown> | undefined
    const parts = content?.parts
    if (Array.isArray(parts)) {
      const joined = parts
        .map(p =>
          typeof (p as Record<string, unknown>)?.text === 'string'
            ? ((p as Record<string, unknown>).text as string)
            : '',
        )
        .join('')
        .trim()
      if (joined) return stripEmojisAndSymbols(joined)
    }
  }

  const completion = obj.completion as Record<string, unknown> | undefined
  if (
    completion &&
    Array.isArray(completion.choices) &&
    completion.choices.length > 0
  ) {
    const msg = (completion.choices[0] as Record<string, unknown>)?.message as
      | Record<string, unknown>
      | undefined
    if (typeof msg?.content === 'string' && msg.content.trim().length > 0) {
      return stripEmojisAndSymbols(msg.content)
    }
  }
  if (typeof obj.content === 'string' && obj.content.trim().length > 0) {
    return stripEmojisAndSymbols(obj.content)
  }
  if (typeof obj.reply === 'string' && obj.reply.trim().length > 0) {
    return stripEmojisAndSymbols(obj.reply)
  }
  return null
}

function extractSuggestedDraftFromLlmAnswer(
  answer: string,
  fallbackDraft?: string,
): string | undefined {
  const sectionMatch = answer.match(
    /###?\s*(?:Suggested Zing|Ready-to-Post Zing Draft)\s*\n+([\s\S]*?)(?:\n###?\s|$)/i,
  )
  if (sectionMatch?.[1]) {
    const cleaned = stripEmojisAndSymbols(
      sectionMatch[1]
        .replace(/^>\s*/gm, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\*\*/g, ''),
    )
    if (cleaned.length >= 20) {
      return cleaned.slice(0, 278)
    }
  }
  return fallbackDraft
}

function synthesizeDraftFromContext(
  prompt: string,
  postContext?: QuantyPostContext,
  citations: QuantySourceCitation[] = [],
  trendingTopics: QuantyTrendItem[] = [],
): string {
  const topTag =
    citations
      .flatMap(c => c.text.match(/#[a-zA-Z0-9_]+/g) || [])
      .find(Boolean) || ''

  if (postContext?.text) {
    const parsed = parseFocusedZingContext(postContext.text)
    const author = postContext.authorHandle
      ? `@${postContext.authorHandle}`
      : 'this Zing'
    const isReplyAsk = /\b(reply|respond|response)\b/i.test(prompt)
    const isCounterAsk = /\b(counter|debate|critique|other side)\b/i.test(prompt)

    const coreSubject = stripEmojisAndSymbols(
      parsed.quotedText ||
        parsed.links[0]?.title ||
        parsed.mediaAlts[0] ||
        parsed.primaryText,
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)

    const topVoice = citations[0] ? `@${citations[0].handle}` : undefined
    const domain =
      parsed.links[0]?.domain ||
      citations.find(c => c.externalDomain)?.externalDomain

    if (isReplyAsk) {
      const replyText = domain
        ? `Interesting take from ${author} on "${coreSubject}". Worth checking the primary reporting on ${domain} before jumping to conclusions — what detail stands out most to you?`
        : `Good point ${author} — looking at the broader conversation around "${coreSubject}", the key question is what holds up once primary data drops. Curious how others read this.`
      return stripEmojisAndSymbols(replyText).slice(0, 275)
    }

    if (isCounterAsk) {
      const counterText = `Worth stress-testing ${author}'s point on "${coreSubject}". ${
        topVoice
          ? `Reactions across QuantZing (including ${topVoice}) point to real pushback on the underlying assumptions.`
          : 'Always separate viral framing from primary evidence.'
      } Where do you land?`
      return stripEmojisAndSymbols(counterText).slice(0, 275)
    }

    const citedSummary = parsed.quotedAuthor
      ? `Context check on ${author} quoting @${parsed.quotedAuthor}: "${coreSubject}${coreSubject.length >= 120 ? '...' : ''}"`
      : `Quick take on ${author}: "${coreSubject}${coreSubject.length >= 120 ? '...' : ''}"`
    const tail =
      citations.length > 0
        ? ` — ${citations.length} related Zings are actively unpacking this${
            domain ? ` (${domain})` : ''
          }.`
        : ' — worth watching how this develops.'
    return stripEmojisAndSymbols(
      `${citedSummary}${tail}${topTag ? ` ${topTag}` : ''}`,
    ).slice(0, 275)
  }

  const cleanTopic = stripEmojisAndSymbols(
    prompt
      .replace(
        /^(draft|write|create|compose|summarize|explain|analyze|fact-?check)\s+(a\s+)?(sharp\s+|high-engagement\s+)?(zing|post|thread|briefing|summary)?\s*(about|on|for)?\s*/i,
        '',
      )
      .replace(/\?+$/g, ''),
  )

  if (
    trendingTopics.length > 0 &&
    /breaking|happening|news|today|trending|right now/i.test(prompt)
  ) {
    const topThree = trendingTopics
      .slice(0, 3)
      .map(t => stripEmojisAndSymbols(t.displayName || t.topic))
      .filter(Boolean)
      .join(' · ')
    return stripEmojisAndSymbols(
      `What is moving today: ${topThree}. ${
        citations[0]
          ? `High engagement around @${citations[0].handle}'s take (${formatCompactCount(citations[0].likeCount)} likes).`
          : 'Conversations are accelerating fast.'
      } Which story matters most today?`,
    ).slice(0, 275)
  }

  const focus = cleanTopic.slice(0, 90) || 'what is moving the conversation today'
  const topCite = citations[0]
  if (topCite) {
    const excerpt = stripEmojisAndSymbols(topCite.text)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 95)
    return stripEmojisAndSymbols(
      `Watching ${focus}: @${topCite.handle} (${formatCompactCount(topCite.likeCount)} likes) notes "${excerpt}${topCite.text.length > 95 ? '...' : ''}". What is your read?${
        topTag ? ` ${topTag}` : ''
      }`,
    ).slice(0, 275)
  }

  return stripEmojisAndSymbols(
    `Following ${focus} closely today — the gap between headlines and what builders are actually shipping is widening fast. What signal stands out to you?${
      topTag ? ` ${topTag}` : ''
    }`,
  ).slice(0, 275)
}

function buildLocalGroundedResponse(
  req: QuantyAskRequest,
  citations: QuantySourceCitation[],
  searchQueryUsed: string,
): {answer: string; suggestedZingDraft?: string} {
  const {prompt, mode, postContext, trendingTopics = []} = req
  const totalLikes = citations.reduce((acc, c) => acc + c.likeCount, 0)
  const totalRezings = citations.reduce((acc, c) => acc + c.repostCount, 0)
  const totalReplies = citations.reduce((acc, c) => acc + c.replyCount, 0)
  const uniqueAuthors = new Set(citations.map(c => c.handle)).size
  const verifiedVoices = citations.filter(c => c.isVerified).length

  const parsedZing = postContext?.text
    ? parseFocusedZingContext(postContext.text)
    : null

  const sentiment = scoreSentiment([
    ...(parsedZing?.substanceText ? [parsedZing.substanceText] : []),
    ...citations.map(c => c.text),
  ])

  const themes = extractRecurringThemes(
    citations,
    parsedZing?.substanceText || prompt,
  )

  const citedDomains = Array.from(
    new Set(
      [
        ...(parsedZing ? (parsedZing.links.map(l => l.domain).filter(Boolean) as string[]) : []),
        ...(citations.map(c => c.externalDomain).filter(Boolean) as string[]),
      ].filter(Boolean),
    ),
  )

  const debateRatio =
    totalLikes > 0 ? totalReplies / Math.max(1, totalLikes) : 0
  const consensusSignal =
    citations.length === 0
      ? 'Early or low-volume discussion with few cross-references so far'
      : debateRatio >= 0.35
        ? `High debate ratio (${Math.round(debateRatio * 100)}% replies to likes) with active pushback`
        : sentiment.positive > sentiment.critical + 1
          ? 'Broadly supportive consensus across scanned accounts'
          : sentiment.critical > sentiment.positive + 1
            ? 'Skeptical tone with multiple voices questioning the framing'
            : 'Mixed analytical discussion across multiple viewpoints'

  const draft = synthesizeDraftFromContext(
    prompt,
    postContext,
    citations,
    trendingTopics,
  )

  // Fast 1-line summary follow-up support
  if (/\b(1 line|one line|single line|one sentence)\b/i.test(prompt)) {
    const core = parsedZing
      ? parsedZing.quotedText ||
        parsedZing.links[0]?.title ||
        parsedZing.mediaAlts[0] ||
        parsedZing.primaryText
      : citations[0]?.text || prompt
    const cleanCore = stripEmojisAndSymbols(core)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 170)
    const oneLiner = parsedZing
      ? `@${postContext?.authorHandle || 'creator'} is reacting to "${cleanCore}${core.length > 170 ? '...' : ''}" — sentiment is ${sentiment.label.toLowerCase()} across ${citations.length} related Zings.`
      : `Current take on "${searchQueryUsed || prompt.trim()}": ${cleanCore}${core.length > 170 ? '...' : ''} (${sentiment.label}, ${formatCompactCount(totalLikes)} likes across ${citations.length} Zings).`

    const lines = [
      '### One-Line Summary',
      oneLiner,
      '',
      '### Suggested Zing',
      draft,
    ]
    return {answer: stripEmojisAndSymbols(lines.join('\n')), suggestedZingDraft: draft}
  }

  // Counter-arguments follow-up support
  if (
    /\b(counter-?argument|counterpoint|devil|critique|pushback)\b/i.test(prompt)
  ) {
    const focusLabel = parsedZing
      ? `@${postContext?.authorHandle || 'creator'}'s Zing`
      : `"${searchQueryUsed || prompt.trim()}"`
    const criticalCites = citations.filter(c => {
      const low = c.text.toLowerCase()
      return /\b(but|however|actually|wrong|false|risk|issue|not|miss|skeptic|concern|problem|disagree)\b/.test(
        low,
      )
    })
    const displayCites =
      criticalCites.length > 0 ? criticalCites.slice(0, 3) : citations.slice(0, 3)

    const lines: string[] = [
      `### Counter-Arguments — ${focusLabel}`,
      `- **Primary framing**: ${
        parsedZing?.quotedText
          ? `Quotes @${parsedZing.quotedAuthor || 'creator'}: "${parsedZing.quotedText.slice(0, 160)}${parsedZing.quotedText.length > 160 ? '...' : ''}"`
          : parsedZing?.primaryText
            ? `"${parsedZing.primaryText.slice(0, 160)}"`
            : `Topic query "${searchQueryUsed || prompt.trim()}"`
      }`,
      `- **Debate temperature**: ${consensusSignal}`,
      '',
      '### Key Pushback & Evidence Gaps',
      `- **Evidence check**: ${
        citedDomains.length > 0
          ? `External sources cited (${citedDomains.slice(0, 4).join(', ')}) — verify methodology, publication date, and full context beyond excerpts.`
          : 'No primary data or external reporting linked directly — claims without primary links carry higher framing risk.'
      }`,
      '- **Framing risk**: Fast-moving reactions amplify strong excerpts; review the source thread and opposing perspectives before treating the takeaway as settled.',
    ]

    if (displayCites.length > 0) {
      lines.push('', '### Contrasting Perspectives')
      for (const c of displayCites) {
        const snippet = c.text.replace(/\s+/g, ' ').slice(0, 165)
        lines.push(
          `- **@${c.handle}** _(${formatCompactCount(c.likeCount)} likes · ${formatCompactCount(c.replyCount)} replies)_: "${snippet}${c.text.length > 165 ? '...' : ''}"`,
        )
      }
    }

    lines.push('', '### Suggested Zing', draft)
    return {answer: stripEmojisAndSymbols(lines.join('\n')), suggestedZingDraft: draft}
  }

  // Draft Zing mode
  if (mode === 'drafter') {
    const topicClean =
      parsedZing?.quotedText?.slice(0, 72) ||
      parsedZing?.links[0]?.title?.slice(0, 72) ||
      prompt
        .replace(
          /^(draft|write|create|compose)\s+(a\s+)?(sharp\s+|high-engagement\s+)?(zing|post|thread|reply)\s*(about|on|to)?\s*/i,
          '',
        )
        .trim() ||
      'your topic'

    const lines: string[] = [
      '### Suggested Zing',
      draft,
      '',
      `### 3-Part Thread Outline — ${topicClean.slice(0, 68)}`,
      `1. **Hook (<220 chars)**: Open with a sharp contrast or concrete detail on ${topicClean.slice(0, 52)} so readers stop scrolling.`,
      `2. **Context & Proof**: Anchor with real discussion${
        citations[0]
          ? ` — e.g. @${citations[0].handle} (${formatCompactCount(citations[0].likeCount)} likes)${
              citedDomains[0] ? ` and reporting from ${citedDomains[0]}` : ''
            }`
          : citedDomains[0]
            ? ` — link directly to ${citedDomains[0]}`
            : ' — attach a chart, Quote Zing, or primary source link'
      }.`,
      '3. **Closer**: End with a direct question to invite replies and Quote Zings.',
    ]

    if (citations.length > 0) {
      lines.push(
        '',
        '### Audience Signal',
        `- **Activity**: ${citations.length} recent Zings (${formatCompactCount(totalLikes)} likes · ${formatCompactCount(totalRezings)} rezings · ${formatCompactCount(totalReplies)} replies).`,
        `- **Dominant tone**: **${sentiment.label}**${themes.length > 0 ? ` · Recurring terms: ${themes.join(', ')}` : ''}.`,
      )
    }

    return {answer: stripEmojisAndSymbols(lines.join('\n')), suggestedZingDraft: draft}
  }

  // News / Pulse mode
  if (mode === 'pulse') {
    const lines: string[] = ["### Today's Briefing"]
    if (trendingTopics.length > 0) {
      const topHeadline = trendingTopics
        .slice(0, 3)
        .map(t => t.displayName || t.topic)
        .join(', ')
      lines.push(
        `Attention across QuantZing is centered on **${topHeadline}**${
          citations.length > 0
            ? `, drawing **${formatCompactCount(totalLikes)}** likes and **${formatCompactCount(totalRezings)}** rezings across ${citations.length} leading Zings.`
            : '.'
        }`,
        '',
        '### Top Stories Right Now',
      )
      trendingTopics.slice(0, 6).forEach((t, idx) => {
        const name = stripEmojisAndSymbols(t.displayName || t.topic)
        const meta = [
          t.category || null,
          t.postCount ? `${formatCompactCount(t.postCount)} zings` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        lines.push(`${idx + 1}. **${name}**${meta ? ` — ${meta}` : ''}`)
      })
    } else {
      lines.push(
        `Reviewed **${citations.length}** recent Zings for "${searchQueryUsed || prompt.trim()}" (**${formatCompactCount(totalLikes)}** likes · **${formatCompactCount(totalRezings)}** rezings). Overall tone: **${sentiment.label}**.`,
      )
    }

    if (citations.length > 0) {
      lines.push('', '### Key Perspectives')
      citations.slice(0, 4).forEach(c => {
        const snippet = c.text.replace(/\s+/g, ' ').slice(0, 165)
        const age = formatRelativeAge(c.indexedAt)
        lines.push(
          `- **@${c.handle}** _(${formatCompactCount(c.likeCount)} likes · ${formatCompactCount(c.repostCount)} rezings${age ? ` · ${age}` : ''})_: "${snippet}${c.text.length > 165 ? '...' : ''}"`,
        )
      })
    }

    lines.push(
      '',
      '### Context & Verification',
      `- **Source breadth**: ${uniqueAuthors} accounts${verifiedVoices > 0 ? ` (${verifiedVoices} verified)` : ''} · Tone: **${sentiment.label}**.`,
      `- **External domains**: ${
        citedDomains.length > 0
          ? citedDomains.slice(0, 5).join(', ')
          : 'Mostly direct commentary without external links'
      }.`,
      `- **Consensus**: ${consensusSignal}.`,
      '',
      '### Suggested Zing',
      draft,
    )
    return {answer: stripEmojisAndSymbols(lines.join('\n')), suggestedZingDraft: draft}
  }

  // Focused Zing analysis OR DeepSearch OR Ask mode
  const targetText = parsedZing?.substanceText || postContext?.text || prompt
  const numbers = targetText.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []
  const mentions = (postContext?.text || prompt).match(/@[a-zA-Z0-9._-]+/g) || []
  const tags = (postContext?.text || prompt).match(/#[a-zA-Z0-9_]+/g) || []

  const lines: string[] = ['### Summary']

  if (parsedZing && postContext) {
    const authorLabel = `@${postContext.authorHandle || 'creator'}`
    if (
      parsedZing.isShortReactionOnly &&
      (parsedZing.quotedText ||
        parsedZing.links.length > 0 ||
        parsedZing.mediaAlts.length > 0)
    ) {
      lines.push(
        `**${authorLabel}** shared a brief reaction amplifying embedded context rather than standalone commentary:`,
      )
    } else if (parsedZing.primaryText) {
      lines.push(
        `**${authorLabel}** writes: "${parsedZing.primaryText.slice(0, 220)}${parsedZing.primaryText.length > 220 ? '...' : ''}"`,
      )
    }
    if (parsedZing.quotedText) {
      lines.push(
        `- **Quoted Zing (@${parsedZing.quotedAuthor || 'source'})**: "${parsedZing.quotedText.slice(0, 240)}${parsedZing.quotedText.length > 240 ? '...' : ''}"`,
      )
    }
    for (const link of parsedZing.links.slice(0, 2)) {
      if (link.title || link.domain) {
        lines.push(
          `- **Linked Source${link.domain ? ` (${link.domain})` : ''}**: ${
            link.title ? `"${link.title}"` : link.uri
          }${link.description ? ` — ${link.description.slice(0, 140)}` : ''}`,
        )
      }
    }
    if (parsedZing.mediaAlts.length > 0) {
      lines.push(
        `- **Media Context**: ${parsedZing.mediaAlts.join(' | ').slice(0, 220)}`,
      )
    }
  } else {
    lines.push(
      citations.length > 0
        ? `Across **${citations.length} recent Zings** from **${uniqueAuthors} accounts** on **${searchQueryUsed || prompt.trim()}**, engagement stands at **${formatCompactCount(totalLikes)}** likes, **${formatCompactCount(totalRezings)}** rezings, and **${formatCompactCount(totalReplies)}** replies.`
        : `Checked recent QuantZing conversations for **${searchQueryUsed || prompt.trim()}**.`,
    )
  }

  if (themes.length > 0 || citations.length > 0) {
    lines.push(
      `- **Momentum & Themes**: ${
        citations.length > 0
          ? `${formatCompactCount(totalLikes)} likes · ${formatCompactCount(totalRezings)} rezings · Top voice **@${citations[0].handle}**`
          : 'Low current volume on exact keywords'
      }${themes.length > 0 ? ` · Key themes: **${themes.join(', ')}**` : ''}.`,
    )
  }

  lines.push('', '### Key Perspectives')
  if (citations.length > 0) {
    const byLikes = [...citations].sort((a, b) => b.likeCount - a.likeCount)
    const selected: QuantySourceCitation[] = []
    for (const item of byLikes) {
      if (selected.length >= 3) break
      selected.push(item)
    }
    const freshest = citations.find(
      c => !selected.some(s => s.uri === c.uri) && c.indexedAt,
    )
    if (freshest) selected.push(freshest)

    selected.forEach(c => {
      const snippet = c.text.replace(/\s+/g, ' ').slice(0, 175)
      const age = formatRelativeAge(c.indexedAt)
      const domainTag = c.externalDomain ? ` · ${c.externalDomain}` : ''
      lines.push(
        `- **@${c.handle}** _(${formatCompactCount(c.likeCount)} likes · ${formatCompactCount(c.repostCount)} rezings${age ? ` · ${age}` : ''}${domainTag})_: "${snippet}${c.text.length > 175 ? '...' : ''}"`,
      )
    })
  } else {
    lines.push(
      `- No closely matching public Zings found for "${searchQueryUsed || prompt.trim()}" right now. Try broadening your question or asking about a trending story.`,
    )
  }

  lines.push('', '### Context & Verification')
  lines.push(
    `- **External sources**: ${
      citedDomains.length > 0
        ? citedDomains.slice(0, 5).join(', ')
        : 'None linked directly — check primary reporting before treating claims as confirmed'
    }.`,
  )
  lines.push(
    `- **Figures referenced**: ${
      numbers.length > 0
        ? `${numbers.slice(0, 6).join(', ')} — confirm exact timeframe and primary dataset`
        : 'Qualitative commentary (no specific numerical metrics asserted)'
    }.`,
  )
  lines.push(
    `- **Source diversity**: ${uniqueAuthors} unique account(s)${
      verifiedVoices > 0 ? ` (${verifiedVoices} verified)` : ''
    } · Sentiment: **${sentiment.label}**.`,
  )
  lines.push(`- **Consensus**: ${consensusSignal}.`)
  if (tags.length > 0 || mentions.length > 0) {
    lines.push(
      `- **Referenced handles & tags**: ${Array.from(new Set([...mentions, ...tags])).slice(0, 6).join(' ')}`,
    )
  }

  lines.push('', '### Suggested Zing', draft)

  return {
    answer: stripEmojisAndSymbols(lines.join('\n')),
    suggestedZingDraft: draft,
  }
}

function extractRoutingMeta(
  data: unknown,
  res: Response,
): {provider?: string; billingMode?: string} {
  const obj =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : undefined
  const routing =
    obj?.routing && typeof obj.routing === 'object'
      ? (obj.routing as Record<string, unknown>)
      : undefined

  const provider =
    (typeof routing?.provider === 'string' && routing.provider.trim()) ||
    (typeof obj?.provider === 'string' && obj.provider.trim()) ||
    res.headers.get('x-quant-provider') ||
    undefined

  const billingMode =
    (typeof routing?.billingMode === 'string' && routing.billingMode.trim()) ||
    (typeof obj?.billingMode === 'string' && obj.billingMode.trim()) ||
    res.headers.get('x-quant-billing-mode') ||
    undefined

  return {provider, billingMode}
}

export async function fetchLiveNetworkBriefing(
  providedTrends?: QuantyTrendItem[],
): Promise<LiveNetworkBriefing> {
  // 1. Primary path: real Sovereign PDS News Briefing endpoint
  try {
    const serverBriefing = await fetchQuantZingNewsBriefing(8)
    if (serverBriefing.ok && serverBriefing.topics.length > 0) {
      const allTopZings: QuantySourceCitation[] = []
      const seenUris = new Set<string>()
      const stories: LiveNetworkBriefingStory[] = serverBriefing.topics.map(
        (topic, idx) => {
          const mappedSamples: QuantySourceCitation[] = (
            topic.samplePosts || []
          ).map(sp => {
            const cleanText = stripEmojisAndSymbols(sp.text || '')
            const cite: QuantySourceCitation = {
              uri: sp.uri,
              handle: sp.authorHandle,
              displayName: sp.authorHandle,
              text: cleanText,
              likeCount: Number(sp.likeCount || 0),
              repostCount: 0,
              replyCount: 0,
            }
            if (!seenUris.has(cite.uri)) {
              seenUris.add(cite.uri)
              allTopZings.push(cite)
            }
            return cite
          })
          const topZing = mappedSamples[0]
          const totalEngagement = mappedSamples.reduce(
            (sum, z) => sum + z.likeCount,
            0,
          )
          const headline =
            stripEmojisAndSymbols(topic.topic) || topic.topic || 'Topic'
          const summary = stripEmojisAndSymbols(topic.summary || '')
          return {
            id: topic.id || `${headline}_${idx}`,
            headline,
            description: summary || undefined,
            postCount: Number(topic.postCount || mappedSamples.length),
            topZing,
            zingCount: Number(topic.postCount || mappedSamples.length),
            totalEngagement,
            summary,
            prompt: `Explain what is happening with "${headline}" — key developments, leading voices, and context`,
          }
        },
      )

      const topHeadlines = stories
        .slice(0, 3)
        .map(s => s.headline)
        .join(' · ')

      return {
        generatedAt: serverBriefing.generatedAt || new Date().toISOString(),
        headline: topHeadlines || "Today's News",
        overview: `Tracking ${stories.length} active stories from real QuantZing activity.`,
        stories,
        topZings: allTopZings
          .sort((a, b) => b.likeCount - a.likeCount)
          .slice(0, 5),
      }
    }
  } catch {
    // Fall through cleanly to real public trends (never hardcoded fake topics)
  }

  // 2. Fallback: real Sovereign PDS public trends ONLY (zero hardcoded seed topics)
  let trends =
    providedTrends && providedTrends.length > 0 ? providedTrends.slice(0, 6) : []

  if (trends.length === 0) {
    trends = await fetchPublicTrends(6)
  }

  if (trends.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      headline: "Today's News",
      overview: 'No trending topics on the network yet.',
      stories: [],
      topZings: [],
    }
  }

  const activeTopics = trends.slice(0, 5)
  const searchResults = await Promise.all(
    activeTopics.map(async t => {
      const feedUri = trendLinkToFeedUri(t.link)
      if (feedUri) {
        const feedZings = await fetchFeedZings(feedUri, 4)
        if (feedZings.length > 0) return feedZings
      }
      const query = trendLinkToSearchQuery(t.link) || t.displayName || t.topic
      return searchLiveZings(query, 3, 'top')
    }),
  )

  const allTopZings: QuantySourceCitation[] = []
  const seenUris = new Set<string>()

  const stories: LiveNetworkBriefingStory[] = activeTopics.map((trend, idx) => {
    const zings = searchResults[idx] || []
    for (const z of zings) {
      if (!seenUris.has(z.uri)) {
        seenUris.add(z.uri)
        allTopZings.push(z)
      }
    }
    const topZing = zings[0]
    const totalEngagement = zings.reduce(
      (sum, z) => sum + z.likeCount + z.repostCount + z.replyCount,
      0,
    )
    const headline =
      stripEmojisAndSymbols(trend.displayName || trend.topic) || trend.topic
    const cleanDescription = trend.description
      ? stripEmojisAndSymbols(trend.description)
      : undefined
    const feedUri = trendLinkToFeedUri(trend.link)
    const topSnippet = topZing
      ? stripEmojisAndSymbols(topZing.text).replace(/\s+/g, ' ').slice(0, 120)
      : ''
    const summary =
      cleanDescription ||
      (topSnippet
        ? `${topSnippet}${topZing && topZing.text.length > 120 ? '...' : ''}`
        : '')

    return {
      id: `${trend.topic}_${idx}`,
      headline,
      description: cleanDescription,
      category: trend.category ? stripEmojisAndSymbols(trend.category) : undefined,
      postCount: trend.postCount,
      status: trend.status,
      feedUri,
      topZing,
      zingCount: zings.length,
      totalEngagement,
      summary,
      prompt: `Explain what is happening with "${headline}" — key developments, leading voices, and context`,
    }
  })

  const topHeadlines = stories
    .slice(0, 3)
    .map(s => s.headline)
    .join(' · ')

  return {
    generatedAt: new Date().toISOString(),
    headline: topHeadlines || "Today's News",
    overview: `Tracking ${stories.length} active stories right now.`,
    stories,
    topZings: allTopZings
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 5),
  }
}

export async function askQuanty(
  req: QuantyAskRequest,
): Promise<QuantyAskResponse> {
  const started = Date.now()
  const urls = getQuantOsBaseUrls()
  const ownerId = req.ownerId?.trim() || 'anonymous'
  const routerModel =
    req.mode === 'deepsearch' || req.mode === 'pulse'
      ? 'quant/auto-pro'
      : 'quant/auto-fast'

  let searchQuery = ''
  if (req.postContext?.text) {
    const parsed = parseFocusedZingContext(req.postContext.text)
    searchQuery = extractSearchKeywords(
      parsed.substanceText || req.postContext.text,
    )
    if (!searchQuery && parsed.quotedAuthor) {
      searchQuery = `from:${parsed.quotedAuthor}`
    } else if (!searchQuery && req.postContext.authorHandle) {
      searchQuery = `from:${req.postContext.authorHandle}`
    }
  } else if (
    req.mode === 'pulse' &&
    req.trendingTopics &&
    req.trendingTopics.length > 0
  ) {
    searchQuery =
      req.trendingTopics[0].displayName || req.trendingTopics[0].topic
  } else {
    searchQuery = extractSearchKeywords(req.prompt)
  }

  let resolvedTrends = req.trendingTopics || []
  if (
    resolvedTrends.length === 0 ||
    !resolvedTrends.some(t => Boolean(t.link))
  ) {
    const publicTrends = await fetchPublicTrends(6)
    if (publicTrends.length > 0) {
      resolvedTrends = publicTrends
    }
  }
  if (!searchQuery && resolvedTrends.length > 0) {
    searchQuery =
      trendLinkToSearchQuery(resolvedTrends[0].link) ||
      resolvedTrends[0].displayName ||
      resolvedTrends[0].topic
  }

  const enrichedReq: QuantyAskRequest = {
    ...req,
    trendingTopics: resolvedTrends,
  }

  const citationsPromise = (async (): Promise<QuantySourceCitation[]> => {
    const seen = new Set<string>(
      req.postContext?.uri ? [req.postContext.uri] : [],
    )
    const collected: QuantySourceCitation[] = []
    const pushAll = (items: QuantySourceCitation[]) => {
      for (const item of items) {
        if (seen.has(item.uri)) continue
        seen.add(item.uri)
        collected.push(item)
        if (collected.length >= 8) break
      }
    }

    const parallelTasks: Array<Promise<QuantySourceCitation[]>> = []

    if (req.feedUri) {
      parallelTasks.push(fetchFeedZings(req.feedUri, 8))
    }

    if (req.postContext?.uri) {
      parallelTasks.push(
        fetchPostThreadAndQuotes(
          req.postContext.uri,
          req.postContext.authorHandle,
        ),
      )
    }

    if (searchQuery) {
      parallelTasks.push(
        searchLiveZingsDual(searchQuery, 8).then(async results => {
          if (results.length > 0) return results
          const shorter = searchQuery.split(/\s+/).slice(0, 2).join(' ')
          if (shorter && shorter !== searchQuery) {
            return searchLiveZingsDual(shorter, 6)
          }
          return []
        }),
      )
    }

    const results = await Promise.all(parallelTasks)
    for (const batch of results) {
      pushAll(batch)
    }

    if (collected.length < 4) {
      const fallbackZings = await fetchPublicFallbackZings(
        searchQuery || req.prompt,
        resolvedTrends,
        8,
      )
      pushAll(fallbackZings)
    }

    return collected.slice(0, 8)
  })()

  const recentHistory = (req.history || []).slice(-6)
  const temperature = req.mode === 'drafter' ? 0.7 : 0.3

  const citations = await citationsPromise
  const systemPrompt = buildSystemPrompt(enrichedReq, citations)
  const messages = [
    {role: 'system' as const, content: systemPrompt},
    ...recentHistory,
    {role: 'user' as const, content: req.prompt},
  ]

  // 1. Try QuantAI (:4240) /v1/agent/reason
  try {
    const res = await fetchWithTimeout(
      `${urls.ai}/v1/agent/reason`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-quant-owner-id': ownerId,
        },
        body: JSON.stringify({
          ownerId,
          model: routerModel,
          messages,
          includeMemoryContext: true,
          includeSkillContext: true,
        }),
      },
      4500,
    )
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const content = extractChatContent(data)
      if (content) {
        const meta = extractRoutingMeta(data, res)
        const fallbackDraft = synthesizeDraftFromContext(
          req.prompt,
          req.postContext,
          citations,
          resolvedTrends,
        )
        return {
          answer: content,
          origin: 'quant-ai',
          provider: meta.provider,
          billingMode: meta.billingMode,
          citations,
          suggestedZingDraft: extractSuggestedDraftFromLlmAnswer(
            content,
            fallbackDraft,
          ),
          latencyMs: Date.now() - started,
        }
      }
    }
  } catch {
    // Fall through cleanly to QuantRouter
  }

  // 2. Try QuantRouter (:4003) OpenAI-compatible completions endpoint
  try {
    const res = await fetchWithTimeout(
      `${urls.router}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-quant-owner-id': ownerId,
        },
        body: JSON.stringify({
          model: routerModel,
          ownerId,
          messages,
          temperature,
          max_tokens: 850,
        }),
      },
      4500,
    )
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const content = extractChatContent(data)
      if (content) {
        const meta = extractRoutingMeta(data, res)
        const fallbackDraft = synthesizeDraftFromContext(
          req.prompt,
          req.postContext,
          citations,
          resolvedTrends,
        )
        return {
          answer: content,
          origin: 'quant-router',
          provider: meta.provider,
          billingMode: meta.billingMode,
          citations,
          suggestedZingDraft: extractSuggestedDraftFromLlmAnswer(
            content,
            fallbackDraft,
          ),
          latencyMs: Date.now() - started,
        }
      }
    }
  } catch {
    // Fall through cleanly to live network synthesis
  }

  // 3. Live network synthesis fallback (explicitly tagged as 'live-network')
  const local = buildLocalGroundedResponse(enrichedReq, citations, searchQuery)
  return {
    answer: local.answer,
    origin: 'live-network',
    citations,
    suggestedZingDraft: local.suggestedZingDraft,
    latencyMs: Date.now() - started,
  }
}

// ============================================================================
// Sovereign PDS REST API Clients (100% Real Persistence per CONTRACT.md)
// ============================================================================

function assertSafePathSegment(value: string, label: string): string {
  const trimmed = String(value || '').trim()
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    /[\\/\x00-\x1f]/.test(trimmed) ||
    /%2f|%5c/i.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}`)
  }
  return trimmed
}

async function quantzingApiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    accessJwt?: string
    body?: unknown
    timeoutMs?: number
  } = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Invalid API path')
  }
  const origin = getQuantZingApiOrigin()
  const headers: Record<string, string> = {
    accept: 'application/json',
  }
  if (options.accessJwt) {
    const cleanJwt = options.accessJwt.trim()
    if (cleanJwt && !/[\r\n\s]/.test(cleanJwt)) {
      headers.authorization = `Bearer ${cleanJwt}`
    }
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  const res = await fetchWithTimeout(
    `${origin}${path}`,
    {
      method: options.method || 'GET',
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    },
    options.timeoutMs ?? 8000,
  )
  const payload = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!res.ok) {
    const errMessage =
      (typeof payload?.message === 'string' && payload.message) ||
      (typeof payload?.error === 'string' && payload.error) ||
      (typeof (payload?.error as Record<string, unknown> | undefined)
        ?.message === 'string' &&
        String((payload?.error as Record<string, unknown>).message)) ||
      `Request failed (HTTP ${res.status})`
    throw new Error(errMessage)
  }
  return payload as T
}

export function buildQuantZingBlobUrl(did: string, cid: string): string {
  const origin = getQuantZingApiOrigin()
  return `${origin}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`
}

// --- A. Articles (/api/quantzing/articles) ---

export interface QuantZingArticleRecord {
  id: string
  uri: string
  authorDid: string
  authorHandle: string
  authorDisplayName: string
  authorAvatar?: string
  title: string
  subtitle: string
  body: string
  tags: string[]
  coverUrl?: string
  status: 'draft' | 'published'
  readTimeMinutes: number
  viewsCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export async function fetchQuantZingArticles(params?: {
  actor?: string
  author?: string
  status?: 'all' | 'published' | 'draft'
  limit?: number
  accessJwt?: string
}): Promise<QuantZingArticleRecord[]> {
  const qs = new URLSearchParams()
  if (params?.actor) qs.set('actor', params.actor)
  if (params?.author) qs.set('author', params.author)
  if (params?.status) qs.set('status', params.status)
  if (params?.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const data = await quantzingApiFetch<{
    ok: boolean
    articles?: QuantZingArticleRecord[]
  }>(`/api/quantzing/articles${suffix}`, {
    method: 'GET',
    accessJwt: params?.accessJwt,
  })
  return Array.isArray(data?.articles) ? data.articles : []
}

export const fetchArticles = fetchQuantZingArticles

export async function fetchQuantZingArticle(
  id: string,
  accessJwt?: string,
): Promise<QuantZingArticleRecord | null> {
  const data = await quantzingApiFetch<{
    ok: boolean
    article?: QuantZingArticleRecord
  }>(`/api/quantzing/articles/${encodeURIComponent(id)}`, {
    method: 'GET',
    accessJwt,
  })
  return data?.article ?? null
}

export async function saveQuantZingArticle(
  payload: {
    id?: string
    title: string
    subtitle?: string
    body: string
    tags?: string[]
    coverUrl?: string
    status?: 'draft' | 'published'
    shareToFeed?: boolean
  },
  accessJwt: string,
): Promise<{ok: boolean; article: QuantZingArticleRecord; postUri?: string}> {
  if (payload.id && !payload.shareToFeed) {
    return quantzingApiFetch<{
      ok: boolean
      article: QuantZingArticleRecord
      postUri?: string
    }>(`/api/quantzing/articles/${encodeURIComponent(payload.id)}`, {
      method: 'PUT',
      accessJwt,
      body: payload,
    })
  }
  return quantzingApiFetch<{
    ok: boolean
    article: QuantZingArticleRecord
    postUri?: string
  }>('/api/quantzing/articles', {
    method: 'POST',
    accessJwt,
    body: payload,
  })
}

export async function deleteQuantZingArticle(
  id: string,
  accessJwt: string,
): Promise<{ok: boolean; deleted: boolean}> {
  return quantzingApiFetch<{ok: boolean; deleted: boolean}>(
    `/api/quantzing/articles/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      accessJwt,
    },
  )
}

// --- B. Creator Studio (/api/quantzing/creator/*) ---

export interface CreatorAnalyticsTotals {
  postsCount: number
  followersCount: number
  followingCount: number
  impressions: number
  likes: number
  rezings: number
  replies: number
  quotes: number
  bookmarks: number
  engagementRate: number
}

export interface CreatorAnalyticsDailyPoint {
  date: string
  impressions: number
  engagements: number
  posts: number
}

export interface CreatorAnalyticsTopPost {
  uri: string
  cid: string
  text: string
  createdAt: string
  viewCount: number
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  bookmarkCount: number
  engagementRate: number
}

export interface CreatorAnalyticsResponse {
  ok: boolean
  windowDays: number
  totals: CreatorAnalyticsTotals
  daily: CreatorAnalyticsDailyPoint[]
  topPosts: CreatorAnalyticsTopPost[]
}

export interface CreatorMonetizationStatus {
  ok?: boolean
  enrolled: boolean
  status: 'not_enrolled' | 'pending_eligibility' | 'eligible' | 'active'
  enrolledAt?: string
  payoutMethod?: string
  eligibility: {
    followersCount: number
    followersRequired: number
    postsCount: number
    postsRequired: number
    impressions30d: number
    impressionsRequired: number
    isPro: boolean
  }
  wallet: {
    online: boolean
    balanceCredits: number
    currency: string
  }
}

export async function fetchCreatorAnalytics(
  windowDays: number,
  accessJwt: string,
): Promise<CreatorAnalyticsResponse> {
  return quantzingApiFetch<CreatorAnalyticsResponse>(
    `/api/quantzing/creator/analytics?windowDays=${encodeURIComponent(
      String(windowDays),
    )}`,
    {method: 'GET', accessJwt},
  )
}

export async function fetchCreatorMonetization(
  accessJwt: string,
): Promise<CreatorMonetizationStatus> {
  return quantzingApiFetch<CreatorMonetizationStatus>(
    '/api/quantzing/creator/monetization',
    {method: 'GET', accessJwt},
  )
}

export async function enrollCreatorMonetization(
  accessJwt: string,
  payoutMethod?: string,
): Promise<{ok: boolean; monetization: CreatorMonetizationStatus}> {
  return quantzingApiFetch<{
    ok: boolean
    monetization: CreatorMonetizationStatus
  }>('/api/quantzing/creator/monetization/enroll', {
    method: 'POST',
    accessJwt,
    body: payoutMethod ? {payoutMethod} : {},
  })
}

// --- C. ZingSpaces (/api/quantzing/spaces*) ---

export type QuantZingSpaceReactionKind =
  | 'applause'
  | 'fire'
  | 'insight'
  | 'heart'
  | 'wave'

export interface QuantZingSpaceParticipant {
  did: string
  handle: string
  displayName: string
  avatar?: string
  role: 'host' | 'speaker' | 'listener'
  handRaised: boolean
  muted?: boolean
  joinedAt: string
}

export interface QuantZingSpaceReaction {
  id: string
  did: string
  handle: string
  kind: QuantZingSpaceReactionKind
  createdAt: string
}

export interface QuantZingSpace {
  id: string
  slug: string
  title: string
  topic: string
  hostDid: string
  hostHandle: string
  hostDisplayName: string
  hostAvatar?: string
  status: 'live' | 'scheduled' | 'ended'
  startedAt: string
  scheduledFor?: string
  endedAt?: string
  audioMode: 'text_stage_ready' | 'webrtc_signaling'
  listenerCount: number
  speakerCount: number
  participants: QuantZingSpaceParticipant[]
  recentReactions: QuantZingSpaceReaction[]
}

export async function fetchZingSpaces(
  status: 'all' | 'live' | 'scheduled' | 'ended' = 'all',
  accessJwt?: string,
): Promise<QuantZingSpace[]> {
  const data = await quantzingApiFetch<{
    ok: boolean
    spaces?: QuantZingSpace[]
  }>(`/api/quantzing/spaces?status=${encodeURIComponent(status)}`, {
    method: 'GET',
    accessJwt,
  })
  return Array.isArray(data?.spaces) ? data.spaces : []
}

export async function fetchZingSpace(
  slug: string,
  accessJwt?: string,
): Promise<QuantZingSpace | null> {
  const data = await quantzingApiFetch<{
    ok: boolean
    space?: QuantZingSpace
  }>(`/api/quantzing/spaces/${encodeURIComponent(slug)}`, {
    method: 'GET',
    accessJwt,
  })
  return data?.space ?? null
}

export async function createZingSpace(
  payload: {
    title: string
    topic?: string
    status?: 'live' | 'scheduled'
    scheduledFor?: string
  },
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    '/api/quantzing/spaces',
    {
      method: 'POST',
      accessJwt,
      body: payload,
    },
  )
  return data.space
}

export async function updateZingSpace(
  slug: string,
  payload: {
    title?: string
    topic?: string
    status?: 'live' | 'ended'
    promoteDid?: string
    demoteDid?: string
  },
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      accessJwt,
      body: payload,
    },
  )
  return data.space
}

export async function deleteZingSpace(
  slug: string,
  accessJwt: string,
): Promise<{ok: boolean; deleted: boolean}> {
  return quantzingApiFetch<{ok: boolean; deleted: boolean}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}`,
    {
      method: 'DELETE',
      accessJwt,
    },
  )
}

export async function joinZingSpace(
  slug: string,
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}/join`,
    {
      method: 'POST',
      accessJwt,
      body: {},
    },
  )
  return data.space
}

export async function leaveZingSpace(
  slug: string,
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}/leave`,
    {
      method: 'POST',
      accessJwt,
      body: {},
    },
  )
  return data.space
}

export async function setSpaceHand(
  slug: string,
  raised: boolean,
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}/hand`,
    {
      method: 'POST',
      accessJwt,
      body: {raised},
    },
  )
  return data.space
}

export async function sendSpaceReaction(
  slug: string,
  kind: QuantZingSpaceReactionKind,
  accessJwt: string,
): Promise<QuantZingSpace> {
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(slug)}/react`,
    {
      method: 'POST',
      accessJwt,
      body: {kind},
    },
  )
  return data.space
}

export interface SpaceLiveKitTokenResponse {
  ok: boolean
  livekitEnabled: boolean
  wsUrl: string
  roomName: string
  token: string
  role: 'host' | 'speaker' | 'listener'
  canSpeak: boolean
}

export async function fetchSpaceLiveKitToken(
  slug: string,
  accessJwt: string,
): Promise<SpaceLiveKitTokenResponse | null> {
  try {
    const safeSlug = assertSafePathSegment(slug, 'space slug')
    const data = await quantzingApiFetch<SpaceLiveKitTokenResponse>(
      `/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/livekit-token`,
      {
        method: 'GET',
        accessJwt,
      },
    )
    return data?.ok && data.token ? data : null
  } catch {
    return null
  }
}

export async function requestSpaceEventsTicket(
  slug: string,
  clientId: string,
  accessJwt: string,
): Promise<string | null> {
  try {
    const safeSlug = assertSafePathSegment(slug, 'space slug')
    const data = await quantzingApiFetch<{ok: boolean; ticket?: string}>(
      `/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/events-ticket`,
      {
        method: 'POST',
        accessJwt,
        body: {clientId},
      },
    )
    return data?.ok && typeof data.ticket === 'string' ? data.ticket : null
  } catch {
    return null
  }
}

export function getSpaceEventsUrl(
  slug: string,
  opts?: {clientId?: string; ticket?: string},
): string {
  const safeSlug = assertSafePathSegment(slug, 'space slug')
  const origin = getQuantZingApiOrigin()
  const qs = new URLSearchParams()
  if (opts?.clientId) qs.set('clientId', opts.clientId)
  if (opts?.ticket) qs.set('ticket', opts.ticket)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return `${origin}/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/events${suffix}`
}

export async function setSpaceMute(
  slug: string,
  muted: boolean,
  accessJwt: string,
  targetDid?: string,
): Promise<QuantZingSpace> {
  const safeSlug = assertSafePathSegment(slug, 'space slug')
  const data = await quantzingApiFetch<{ok: boolean; space: QuantZingSpace}>(
    `/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/mute`,
    {
      method: 'POST',
      accessJwt,
      body: {muted, targetDid},
    },
  )
  return data.space
}

export async function sendSpaceSignal(
  slug: string,
  payload: Record<string, unknown>,
  accessJwt: string,
): Promise<{ok: boolean; messageId?: string}> {
  const safeSlug = assertSafePathSegment(slug, 'space slug')
  return await quantzingApiFetch<{ok: boolean; messageId?: string}>(
    `/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/signal`,
    {
      method: 'POST',
      accessJwt,
      body: payload,
    },
  )
}

export async function pollSpaceSignals(
  slug: string,
  clientId: string,
  afterSeq: number,
  accessJwt?: string,
): Promise<{ok: boolean; signals: Array<Record<string, unknown>>; nextSeq: number}> {
  const safeSlug = assertSafePathSegment(slug, 'space slug')
  const qs = new URLSearchParams({clientId, afterSeq: String(afterSeq)})
  return await quantzingApiFetch<{
    ok: boolean
    signals: Array<Record<string, unknown>>
    nextSeq: number
  }>(`/api/quantzing/spaces/${encodeURIComponent(safeSlug)}/signal?${qs.toString()}`, {
    method: 'GET',
    accessJwt,
  })
}

// --- D. QuantZing Pro (/api/quantzing/pro/*) ---

export type ProPlanId =
  | 'free'
  | 'pro_monthly'
  | 'pro_annual'
  | 'creator_studio'

export interface ProPlan {
  id: ProPlanId | string
  name: string
  priceInr: number
  priceUsd: number
  billingCycle: string
  features: string[]
  badge?: string
}

export interface ProSubscription {
  planId: string
  status: 'free' | 'pending' | 'active' | 'cancelled'
  activatedAt?: string
  expiresAt?: string
  verifiedBadge: boolean
  orderId?: string
}

export interface ProCheckoutResponse {
  ok: boolean
  orderId?: string
  planId: string
  status: 'pending' | 'active'
  checkoutUrl?: string
  quantPayOnline: boolean
  message: string
}

export async function fetchProPlans(): Promise<ProPlan[]> {
  const data = await quantzingApiFetch<{ok: boolean; plans?: ProPlan[]}>(
    '/api/quantzing/pro/plans',
    {method: 'GET'},
  )
  return Array.isArray(data?.plans) ? data.plans : []
}

export async function fetchProSubscription(
  accessJwt: string,
): Promise<ProSubscription> {
  const data = await quantzingApiFetch<{
    ok: boolean
    subscription: ProSubscription
  }>('/api/quantzing/pro/subscription', {
    method: 'GET',
    accessJwt,
  })
  return data.subscription
}

export async function createProCheckout(
  payload: {planId: string; returnUrl?: string},
  accessJwt: string,
): Promise<ProCheckoutResponse> {
  return quantzingApiFetch<ProCheckoutResponse>('/api/quantzing/pro/checkout', {
    method: 'POST',
    accessJwt,
    body: payload,
  })
}

export async function confirmProCheckout(
  payload: {orderId: string; planId?: string},
  accessJwt: string,
): Promise<ProSubscription> {
  const data = await quantzingApiFetch<{
    ok: boolean
    subscription: ProSubscription
  }>('/api/quantzing/pro/confirm', {
    method: 'POST',
    accessJwt,
    body: payload,
  })
  return data.subscription
}

export async function cancelProSubscription(
  accessJwt: string,
): Promise<ProSubscription> {
  const data = await quantzingApiFetch<{
    ok: boolean
    subscription: ProSubscription
  }>('/api/quantzing/pro/cancel', {
    method: 'POST',
    accessJwt,
    body: {},
  })
  return data.subscription
}

// --- E. Interactive Polls (/api/quantzing/polls*) ---

export interface QuantZingPollOptionView {
  id: string
  text: string
  votesCount: number
  percent: number
}

export interface QuantZingPollView {
  $type?: 'com.quantzing.embed.poll#view'
  uri: string
  question?: string
  options: QuantZingPollOptionView[]
  totalVotes: number
  expiresAt: string
  isExpired: boolean
  viewerVoteOptionId: string | null
}

export async function voteQuantZingPoll(
  postUri: string,
  optionId: string,
  accessJwt: string,
): Promise<QuantZingPollView> {
  const data = await quantzingApiFetch<{ok: boolean; poll: QuantZingPollView}>(
    '/api/quantzing/polls/vote',
    {
      method: 'POST',
      accessJwt,
      body: {postUri, optionId},
    },
  )
  return data.poll
}

export async function fetchQuantZingPoll(
  postUri: string,
  accessJwt?: string,
): Promise<QuantZingPollView | null> {
  const data = await quantzingApiFetch<{
    ok: boolean
    poll?: QuantZingPollView
  }>(`/api/quantzing/polls?uri=${encodeURIComponent(postUri)}`, {
    method: 'GET',
    accessJwt,
  })
  return data?.poll ?? null
}

export interface CreateQuantZingPollEmbedInput {
  question?: string
  options: Array<{id: string; text: string}>
  durationHours: number
  expiresAt: string
}

export async function createQuantZingPostRecord(
  payload: {
    repo: string
    text: string
    facets?: unknown[]
    langs?: string[]
    poll?: CreateQuantZingPollEmbedInput
  },
  accessJwt: string,
): Promise<{uri: string; cid: string}> {
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: payload.text,
    createdAt: new Date().toISOString(),
  }
  if (Array.isArray(payload.facets) && payload.facets.length > 0) {
    record.facets = payload.facets
  }
  if (Array.isArray(payload.langs) && payload.langs.length > 0) {
    record.langs = payload.langs
  }
  if (payload.poll && payload.poll.options.length >= 2) {
    record.embed = {
      $type: 'com.quantzing.embed.poll',
      question: payload.poll.question || payload.text || undefined,
      options: payload.poll.options,
      durationHours: payload.poll.durationHours,
      expiresAt: payload.poll.expiresAt,
    }
  }
  return quantzingApiFetch<{uri: string; cid: string}>(
    '/xrpc/com.atproto.repo.createRecord',
    {
      method: 'POST',
      accessJwt,
      body: {
        repo: payload.repo,
        collection: 'app.bsky.feed.post',
        record,
      },
    },
  )
}

// --- F. Support Tickets, News Briefing & App Release ---

export interface SupportTicket {
  id: string
  category: string
  subject: string
  message?: string
  status: string
  createdAt: string
}

export async function submitSupportTicket(
  payload: {
    category: string
    subject: string
    message: string
    email?: string
  },
  accessJwt?: string,
): Promise<SupportTicket> {
  const data = await quantzingApiFetch<{ok: boolean; ticket: SupportTicket}>(
    '/api/quantzing/support/tickets',
    {
      method: 'POST',
      accessJwt,
      body: payload,
    },
  )
  return data.ticket
}

export async function fetchSupportTickets(
  accessJwt: string,
): Promise<SupportTicket[]> {
  const data = await quantzingApiFetch<{
    ok: boolean
    tickets?: SupportTicket[]
  }>('/api/quantzing/support/tickets', {
    method: 'GET',
    accessJwt,
  })
  return Array.isArray(data?.tickets) ? data.tickets : []
}

export interface QuantZingNewsBriefingSamplePost {
  uri: string
  authorHandle: string
  text: string
  viewCount: number
  likeCount: number
}

export interface QuantZingNewsBriefingTopic {
  id: string
  topic: string
  summary: string
  postCount: number
  samplePosts: QuantZingNewsBriefingSamplePost[]
}

export interface QuantZingNewsBriefingResponse {
  ok: boolean
  generatedAt: string
  topics: QuantZingNewsBriefingTopic[]
}

export async function fetchQuantZingNewsBriefing(
  limit = 8,
): Promise<QuantZingNewsBriefingResponse> {
  return quantzingApiFetch<QuantZingNewsBriefingResponse>(
    `/api/quantzing/news/briefing?limit=${encodeURIComponent(String(limit))}`,
    {method: 'GET', timeoutMs: 5000},
  )
}

export interface QuantZingAppRelease {
  ok: boolean
  version: string
  domain: string
  pwaReady: boolean
  android: {
    available: boolean
    sizeBytes: number
    sizeLabel: string
    sha256: string | null
    downloadUrl: string
    updatedAt: string | null
  }
  ios: {
    mobileconfigUrl: string
    pwaSupported: boolean
    appStoreStatus: string
  }
}

function formatApkSize(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export async function fetchQuantZingAppRelease(): Promise<QuantZingAppRelease> {
  const raw = await quantzingApiFetch<Record<string, any>>(
    '/api/quantzing/app-release',
    {method: 'GET', timeoutMs: 5000},
  )

  const androidRaw =
    raw?.android && typeof raw.android === 'object' ? raw.android : {}
  const iosRaw = raw?.ios && typeof raw.ios === 'object' ? raw.ios : {}

  const sizeBytes = Number(
    androidRaw.sizeBytes ?? raw?.sizeBytes ?? raw?.androidApkSizeBytes ?? 0,
  )
  const sizeLabel =
    (typeof androidRaw.sizeLabel === 'string' && androidRaw.sizeLabel) ||
    (typeof raw?.sizeLabel === 'string' && raw.sizeLabel) ||
    (typeof raw?.androidApkSizeLabel === 'string' && raw.androidApkSizeLabel) ||
    formatApkSize(sizeBytes)

  const available = Boolean(
    androidRaw.available ?? raw?.available ?? raw?.androidApkAvailable ?? false,
  )
  const downloadUrl =
    (typeof androidRaw.downloadUrl === 'string' && androidRaw.downloadUrl) ||
    (typeof raw?.downloadUrl === 'string' && raw.downloadUrl) ||
    (typeof raw?.androidApkUrl === 'string' && raw.androidApkUrl) ||
    '/download/quantzing-android.apk'
  const sha256 =
    (typeof androidRaw.sha256 === 'string' && androidRaw.sha256) ||
    (typeof raw?.sha256 === 'string' && raw.sha256) ||
    (typeof raw?.androidApkSha256 === 'string' && raw.androidApkSha256) ||
    null
  const updatedAt =
    (typeof androidRaw.updatedAt === 'string' && androidRaw.updatedAt) ||
    (typeof raw?.updatedAt === 'string' && raw.updatedAt) ||
    (typeof raw?.androidApkUpdatedAt === 'string' && raw.androidApkUpdatedAt) ||
    null

  let fallbackHost = ''
  try {
    fallbackHost = new URL(getQuantZingApiOrigin()).host
  } catch {
    fallbackHost = ''
  }

  return {
    ok: Boolean(raw?.ok ?? true),
    version: typeof raw?.version === 'string' ? raw.version : '',
    domain:
      (typeof raw?.domain === 'string' && raw.domain) || fallbackHost || '',
    pwaReady: Boolean(raw?.pwaReady ?? true),
    android: {
      available,
      sizeBytes,
      sizeLabel,
      sha256,
      downloadUrl,
      updatedAt,
    },
    ios: {
      mobileconfigUrl:
        (typeof iosRaw.mobileconfigUrl === 'string' &&
          iosRaw.mobileconfigUrl) ||
        '/download/quantzing-ios.mobileconfig',
      pwaSupported: Boolean(iosRaw.pwaSupported ?? true),
      appStoreStatus:
        (typeof iosRaw.appStoreStatus === 'string' && iosRaw.appStoreStatus) ||
        'pending_macos_ipa_submission',
    },
  }
}
