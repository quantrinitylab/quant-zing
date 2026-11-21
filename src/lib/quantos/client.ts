import {PUBLIC_BSKY_SERVICE} from '#/lib/constants'
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

export type QuantyEngineOrigin = 'quant-ai' | 'quant-router' | 'live-network'

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

export interface QuantZingColorPalette {
  bg: string
  card: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  accentSubtle: string
  ctaBg: string
  ctaText: string
  like: string
  rezing: string
  rezingSubtle: string
  danger: string
}

/**
 * X.com-grade True Dark / Light palette for QuantZing screens.
 * Strictly zero orange/amber tokens anywhere.
 */
export function getQuantZingColors(isDark: boolean): QuantZingColorPalette {
  if (isDark) {
    return {
      bg: '#000000',
      card: '#16181C',
      surface: '#202327',
      border: '#2F3336',
      text: '#E7E9EA',
      muted: '#71767B',
      accent: '#1D9BF0',
      accentSubtle: 'rgba(29, 155, 240, 0.14)',
      ctaBg: '#EFF3F4',
      ctaText: '#0F1419',
      like: '#F91880',
      rezing: '#00BA7C',
      rezingSubtle: 'rgba(0, 186, 124, 0.14)',
      danger: '#F4212E',
    }
  }
  return {
    bg: '#FFFFFF',
    card: '#F7F9F9',
    surface: '#EFF3F4',
    border: '#EFF3F4',
    text: '#0F1419',
    muted: '#536471',
    accent: '#1D9BF0',
    accentSubtle: 'rgba(29, 155, 240, 0.12)',
    ctaBg: '#0F1419',
    ctaText: '#FFFFFF',
    like: '#F91880',
    rezing: '#00BA7C',
    rezingSubtle: 'rgba(0, 186, 124, 0.12)',
    danger: '#F4212E',
  }
}

/**
 * Strips stray emojis, dingbats, geometric box symbols, and variation selectors
 * from scraped feed headlines, snippets, and generated summaries while
 * preserving normal punctuation and line breaks.
 */
export function stripEmojisAndSymbols(text: string): string {
  if (!text) return ''
  return text
    .replace(/[0-9#*]\uFE0F?\u20E3/g, '')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{203C}\u{2049}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

export function getQuantOsBaseUrls() {
  if (IS_WEB) {
    return {
      ai: '/api/quant-ai',
      router: '/api/quant-router',
      pay: '/api/quant-pay',
    }
  }
  return {
    ai: 'http://127.0.0.1:4240',
    router: 'http://127.0.0.1:4003',
    pay: 'http://127.0.0.1:4002',
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

const PUBLIC_DISCOVER_FEED_URI =
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'

export function trendLinkToFeedUri(link?: string): string | undefined {
  if (!link) return undefined
  const match = link.match(/^\/profile\/([^/]+)\/feed\/([^/?#]+)/i)
  if (!match) return undefined
  return `at://${match[1]}/app.bsky.feed.generator/${match[2]}`
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

  const handle = p.author?.handle || 'member.quantzing.com'
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
  candidateFeeds.push(PUBLIC_DISCOVER_FEED_URI)

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

export async function fetchLiveNetworkBriefing(
  providedTrends?: QuantyTrendItem[],
): Promise<LiveNetworkBriefing> {
  let trends =
    providedTrends && providedTrends.length > 0 ? providedTrends.slice(0, 6) : []

  const needsPublicHydration =
    trends.length === 0 || !trends.some(t => Boolean(t.link || t.description))
  if (needsPublicHydration) {
    const publicTrends = await fetchPublicTrends(6)
    if (publicTrends.length > 0) {
      trends = publicTrends
    }
  }

  const seedTopics: QuantyTrendItem[] =
    trends.length > 0
      ? trends
      : [
          {topic: 'AI', displayName: 'AI & Frontier Tech', category: 'Technology'},
          {topic: 'breaking news', displayName: 'World News', category: 'News'},
          {topic: 'open source', displayName: 'Open Source & Engineering', category: 'Tech'},
          {topic: 'markets economy', displayName: 'Markets & Economy', category: 'Business'},
        ]

  const activeTopics = seedTopics.slice(0, 5)
  const searchResults = await Promise.all(
    activeTopics.map(async t => {
      const feedUri = trendLinkToFeedUri(t.link)
      if (feedUri) {
        const feedZings = await fetchFeedZings(feedUri, 4)
        if (feedZings.length > 0) return feedZings
      }
      return searchLiveZings(t.displayName || t.topic, 3, 'top')
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
        : `Trending discussion around ${headline}.`)

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
    overview:
      stories.length > 0
        ? `Tracking ${stories.length} active stories right now.`
        : 'Scanning current stories.',
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
  const ownerId = req.ownerId || 'quantzing-guest'

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
    searchQuery = resolvedTrends[0].displayName || resolvedTrends[0].topic
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
        const fallbackDraft = synthesizeDraftFromContext(
          req.prompt,
          req.postContext,
          citations,
          resolvedTrends,
        )
        return {
          answer: content,
          origin: 'quant-ai',
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
          model: 'quant/auto',
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
        const fallbackDraft = synthesizeDraftFromContext(
          req.prompt,
          req.postContext,
          citations,
          resolvedTrends,
        )
        return {
          answer: content,
          origin: 'quant-router',
          provider: res.headers.get('x-quant-provider') || undefined,
          billingMode: res.headers.get('x-quant-billing-mode') || undefined,
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

  // 3. Smooth live network synthesis fallback
  const local = buildLocalGroundedResponse(enrichedReq, citations, searchQuery)
  return {
    answer: local.answer,
    origin: 'live-network',
    citations,
    suggestedZingDraft: local.suggestedZingDraft,
    latencyMs: Date.now() - started,
  }
}

const PLAN_PRICING: Record<
  QuantZingPlanId,
  {label: string; monthlyMinor: number; annualMinor: number; credits: number}
> = {
  'zing-basic': {
    label: 'Zing Basic',
    monthlyMinor: 300,
    annualMinor: 3000,
    credits: 500,
  },
  'zing-pro': {
    label: 'Zing Pro',
    monthlyMinor: 800,
    annualMinor: 8000,
    credits: 2000,
  },
  'zing-pro-plus': {
    label: 'Zing Pro+',
    monthlyMinor: 1600,
    annualMinor: 16000,
    credits: 6000,
  },
}

export async function createQuantZingProCheckout(
  req: QuantZingCheckoutRequest,
): Promise<QuantZingCheckoutResult> {
  const urls = getQuantOsBaseUrls()
  const plan = PLAN_PRICING[req.planId]
  const cycle = req.billingCycle || 'monthly'
  const amountMinor =
    cycle === 'annual' ? plan.annualMinor : plan.monthlyMinor
  const ownerId = (req.emailOrHandle || 'quantzing-member').trim()
  const returnUrl =
    IS_WEB && typeof window !== 'undefined'
      ? `${window.location.origin}/pro?checkout=complete&plan=${req.planId}`
      : 'https://quantzing.com/pro'

  try {
    const res = await fetchWithTimeout(
      `${urls.pay}/v1/checkout/session`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          ownerId,
          amountMinor,
          currency: 'USD',
          credits: plan.credits,
          idempotencyKey: `qz_${req.planId}_${cycle}_${Date.now()}`,
          returnUrl,
          description: `QuantZing ${plan.label} (${cycle})`,
          metadata: {
            product: 'quant-zing',
            planId: req.planId,
            billingCycle: cycle,
          },
        }),
      },
      4500,
    )

    const payload = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null

    if (payload?.offline || res.status === 503) {
      return {
        ok: false,
        offline: true,
        planId: req.planId,
        message:
          'Checkout is temporarily unavailable. Please try again in a moment.',
      }
    }

    const errObj = payload?.error as Record<string, unknown> | undefined
    if (!res.ok) {
      const code = typeof errObj?.code === 'string' ? errObj.code : ''
      if (code === 'PROVIDER_NOT_CONFIGURED') {
        return {
          ok: false,
          unconfigured: true,
          planId: req.planId,
          message:
            'Checkout is currently in preview mode. Billing will open soon.',
        }
      }
      return {
        ok: false,
        planId: req.planId,
        message:
          (typeof errObj?.message === 'string' && errObj.message) ||
          'Unable to start checkout right now. Please try again.',
      }
    }

    const session = payload?.session as Record<string, unknown> | undefined
    return {
      ok: true,
      planId: req.planId,
      sessionId: typeof session?.id === 'string' ? session.id : undefined,
      checkoutUrl:
        typeof session?.checkoutUrl === 'string'
          ? session.checkoutUrl
          : typeof session?.url === 'string'
            ? session.url
            : undefined,
      message: `Checkout session ready for ${plan.label}.`,
    }
  } catch {
    return {
      ok: false,
      offline: true,
      planId: req.planId,
      message:
        'Checkout is temporarily unavailable. Please try again in a moment.',
    }
  }
}
