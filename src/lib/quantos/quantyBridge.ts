import {QUANTZING_SERVICE} from '#/lib/constants'
import {
  getQuantZingColors,
  type QuantyEngineOrigin,
  type QuantyHistoryMessage,
  type QuantyPostContext,
  type QuantySourceCitation,
  type QuantZingColorPalette,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {IS_WEB} from '#/env'

export type QuantyBridgeMode =
  | 'ask'
  | 'deepsearch'
  | 'drafter'
  | 'pulse'
  | 'control'

export type QuantyThemeName = 'light' | 'dim' | 'dark'

export interface QuantyToolDescriptor {
  name: string
  title: string
  description: string
  category: 'read' | 'write' | 'destructive'
  requiresAuth: boolean
  approvalRequired: boolean
  slashCommand: string
  editableFields?: string[]
  estimatedCredits: number
  inputSchema: Record<string, unknown>
}

export interface QuantyViewerInfo {
  authenticated: boolean
  did: string | null
  handle: string | null
  displayName: string | null
  verified: boolean
  accountStatus: 'active' | 'warned' | 'suspended' | 'banned' | 'guest'
}

export interface QuantyManifestQuantOsStatus {
  ai: {
    online: boolean
    baseUrl: string
    latencyMs?: number
    discoveredTools?: number
  }
  router: {
    online: boolean
    baseUrl: string
    latencyMs?: number
    models?: string[]
  }
  pay: {
    online: boolean
    baseUrl: string
    latencyMs?: number
    balanceCredits?: number
  }
}

export interface QuantyManifestResponse {
  ok: boolean
  service: string
  protocolVersion: string
  version: string
  viewer: QuantyViewerInfo
  quantos: QuantyManifestQuantOsStatus
  tools: QuantyToolDescriptor[]
}

export interface QuantyToolTraceItem {
  toolName: string
  title: string
  status: 'ok' | 'error' | 'auth_required'
  latencyMs: number
  summary: string
  itemCount?: number
}

export interface QuantyNavigationHint {
  screen:
    | 'PostThread'
    | 'Profile'
    | 'MessagesConversation'
    | 'MessagesInbox'
    | 'Articles'
    | 'ZingSpaces'
    | 'ProfileList'
    | 'Lists'
    | 'Notifications'
    | 'Bookmarks'
    | 'Home'
  params: Record<string, unknown>
  label: string
}

export interface QuantyActionCardPayload {
  actionId: string
  toolName: string
  category: 'write' | 'destructive'
  title: string
  summary: string
  arguments: Record<string, unknown>
  args?: Record<string, unknown>
  resolvedTarget?: Record<string, unknown>
  editableFields?: string[]
  expiresAt: string
  confirmationToken: string
  requiresAuth?: boolean
}

export interface QuantyExecuteRequest {
  toolName: string
  arguments: Record<string, unknown>
  mode?: 'preview' | 'execute'
  confirmed?: boolean
  actionId?: string
  confirmationToken?: string
  expiresAt?: string
}

export interface QuantyExecuteResponse {
  ok: boolean
  httpStatus: number
  status?: 'EXECUTED' | 'PENDING_CONFIRMATION'
  actionId?: string
  toolName?: string
  category?: 'read' | 'write' | 'destructive'
  executedAt?: string
  latencyMs?: number
  summary?: string
  data?: unknown
  navigationHint?: QuantyNavigationHint
  invalidateKeys?: string[]
  actionCard?: QuantyActionCardPayload
  error?: string
  message?: string
}

export interface QuantyChatRequest {
  prompt: string
  mode: QuantyBridgeMode
  postContext?: QuantyPostContext | null
  history?: QuantyHistoryMessage[]
  feedUri?: string
  threadId?: string
  allowAutoReadTools?: boolean
}

export interface QuantyChatResponse {
  ok: boolean
  answer: string
  origin: QuantyEngineOrigin
  provider?: string
  billingMode?: string
  model?: string
  latencyMs: number
  citations: QuantySourceCitation[]
  suggestedZingDraft?: string
  toolTraces: QuantyToolTraceItem[]
  proposedActions: QuantyActionCardPayload[]
  threadId?: string
  quantosMeta?: {
    creditsBalance?: number
    memoryRecalled?: number
  }
}

export interface QuantyThreadSummary {
  id: string
  did: string
  title: string
  mode: QuantyBridgeMode
  postContext?: QuantyPostContext | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface QuantyThreadMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  mode: QuantyBridgeMode
  origin?: QuantyEngineOrigin
  provider?: string
  model?: string
  latencyMs?: number
  citations?: QuantySourceCitation[]
  toolTraces?: QuantyToolTraceItem[]
  proposedActions?: QuantyActionCardPayload[]
  suggestedZingDraft?: string
  createdAt: string
}

export interface QuantyThreadDetail {
  thread: QuantyThreadSummary
  messages: QuantyThreadMessage[]
}

export interface QuantySlashCommandHint {
  command: string
  template: string
  title: string
  description: string
  category: 'read' | 'write' | 'destructive'
  requiresAuth: boolean
  autoRunOnSelect: boolean
}

/**
 * Built-in instant slash-command catalog (synced with the 21-tool server manifest).
 */
export const QUANTY_SLASH_COMMANDS: QuantySlashCommandHint[] = [
  {
    command: '/trends',
    template: '/trends',
    title: 'Live Trends',
    description: 'Fetch top trending topics on Sovereign QuantZing',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: true,
  },
  {
    command: '/search',
    template: '/search ',
    title: 'Search Zings',
    description: 'Search live Zings by keyword or hashtag',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: false,
  },
  {
    command: '/people',
    template: '/people ',
    title: 'Search People',
    description: 'Find Sovereign QuantZing accounts',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: false,
  },
  {
    command: '/profile',
    template: '/profile @',
    title: 'Inspect Profile',
    description: 'View profile metrics and recent Zings',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: false,
  },
  {
    command: '/thread',
    template: '/thread ',
    title: 'Inspect Thread',
    description: 'Read a Zing thread and replies',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: false,
  },
  {
    command: '/analytics',
    template: '/analytics',
    title: 'My Analytics',
    description: 'Real viewCount impressions and creator engagement',
    category: 'read',
    requiresAuth: true,
    autoRunOnSelect: true,
  },
  {
    command: '/notifications',
    template: '/notifications',
    title: 'Notifications',
    description: 'Check mentions, replies, and unread activity',
    category: 'read',
    requiresAuth: true,
    autoRunOnSelect: true,
  },
  {
    command: '/bookmarks',
    template: '/bookmarks',
    title: 'Saved Bookmarks',
    description: 'List your saved Zings',
    category: 'read',
    requiresAuth: true,
    autoRunOnSelect: true,
  },
  {
    command: '/dms',
    template: '/dms',
    title: 'Direct Messages',
    description: 'List recent DM conversations',
    category: 'read',
    requiresAuth: true,
    autoRunOnSelect: true,
  },
  {
    command: '/lists',
    template: '/lists',
    title: 'Curated Lists',
    description: 'View Sovereign lists',
    category: 'read',
    requiresAuth: false,
    autoRunOnSelect: true,
  },
  {
    command: '/zing',
    template: '/zing ',
    title: 'Publish Zing',
    description: 'Draft and confirm a new Sovereign Zing',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/reply',
    template: '/reply ',
    title: 'Reply to Zing',
    description: 'Reply to the attached Zing with confirmation',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/dm',
    template: '/dm @handle ',
    title: 'Send DM',
    description: 'Send a Direct Message with confirmation',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/article',
    template: '/article Title | ',
    title: 'Publish Article',
    description: 'Publish a long-form Sovereign Article',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/poll',
    template: '/poll Question | Option 1 | Option 2',
    title: 'Create Poll',
    description: 'Launch an interactive poll Zing',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/space',
    template: '/space Title | Topic',
    title: 'Host ZingSpace',
    description: 'Create a live or scheduled ZingSpace',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/list',
    template: '/list List Name | Description',
    title: 'Create List',
    description: 'Create a new curated list',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/follow',
    template: '/follow @',
    title: 'Follow Account',
    description: 'Follow a Sovereign QuantZing handle',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/bookmark',
    template: '/bookmark',
    title: 'Bookmark Zing',
    description: 'Save the attached Zing to bookmarks',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/bio',
    template: '/bio ',
    title: 'Update Bio',
    description: 'Update your display name or bio description',
    category: 'write',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/mute',
    template: '/mute @',
    title: 'Mute Account',
    description: 'Mute an account (confirmation required)',
    category: 'destructive',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
  {
    command: '/block',
    template: '/block @',
    title: 'Block Account',
    description: 'Block an account (confirmation required)',
    category: 'destructive',
    requiresAuth: true,
    autoRunOnSelect: false,
  },
]

/**
 * Light / Dim / Dark theme palette strictly adhering to QuantZing standards.
 * Zero orange/amber tokens. Crisp #CFD9DE borders in Light and #15202B navy-slate in Dim.
 */
export function getQuantyThemeColors(
  themeName: QuantyThemeName | string,
): QuantZingColorPalette {
  const normalized: QuantyThemeName =
    themeName === 'dim' || themeName === 'dark' ? themeName : 'light'
  return getQuantZingColors(normalized)
}

/**
 * Resolves the live QuantZing Sovereign Bridge base URL.
 * Uses current origin on Web and QUANTZING_SERVICE on Native (NEVER 127.0.0.1 on Native).
 */
export function getQuantyBridgeBaseUrl(): string {
  if (IS_WEB && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return QUANTZING_SERVICE.replace(/\/+$/, '')
}

function buildAuthHeaders(accessJwt?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (accessJwt && accessJwt.trim()) {
    headers.Authorization = `Bearer ${accessJwt.trim()}`
  }
  return headers
}

async function fetchBridgeJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs = 12000,
): Promise<{ok: boolean; status: number; data: T | null}> {
  const baseUrl = getQuantyBridgeBaseUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => null)) as T | null
    return {ok: res.ok, status: res.status, data}
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchQuantyManifest(
  accessJwt?: string,
): Promise<QuantyManifestResponse> {
  const res = await fetchBridgeJson<QuantyManifestResponse>(
    '/api/quantzing/quanty/manifest',
    {
      method: 'GET',
      headers: buildAuthHeaders(accessJwt),
    },
    6000,
  )
  if (!res.ok || !res.data) {
    throw new Error(`Manifest request failed (${res.status})`)
  }
  return res.data
}

export async function sendQuantyChat(
  params: QuantyChatRequest,
  accessJwt?: string,
): Promise<QuantyChatResponse> {
  const res = await fetchBridgeJson<QuantyChatResponse>(
    '/api/quantzing/quanty/chat',
    {
      method: 'POST',
      headers: buildAuthHeaders(accessJwt),
      body: JSON.stringify({
        ...params,
        prompt: stripEmojisAndSymbols(params.prompt),
      }),
    },
    14000,
  )
  if (!res.ok || !res.data || !res.data.ok) {
    const errMsg =
      (res.data as unknown as {message?: string})?.message ||
      `Quanty chat failed (${res.status})`
    throw new Error(errMsg)
  }
  return res.data
}

export async function executeQuantyTool(
  params: QuantyExecuteRequest,
  accessJwt?: string,
): Promise<QuantyExecuteResponse> {
  const res = await fetchBridgeJson<Omit<QuantyExecuteResponse, 'httpStatus'>>(
    '/api/quantzing/quanty/execute',
    {
      method: 'POST',
      headers: buildAuthHeaders(accessJwt),
      body: JSON.stringify(params),
    },
    12000,
  )
  const payload = res.data || {
    ok: false,
    error: 'NetworkError',
    message: `Tool execution failed (${res.status})`,
  }
  return {
    ...payload,
    httpStatus: res.status,
  }
}

export async function listQuantyThreads(
  accessJwt: string,
  limit = 30,
): Promise<QuantyThreadSummary[]> {
  if (!accessJwt) return []
  const res = await fetchBridgeJson<{
    ok: boolean
    threads?: QuantyThreadSummary[]
  }>(
    `/api/quantzing/quanty/threads?limit=${encodeURIComponent(String(limit))}`,
    {
      method: 'GET',
      headers: buildAuthHeaders(accessJwt),
    },
    6000,
  )
  if (!res.ok || !res.data?.ok) return []
  return Array.isArray(res.data.threads) ? res.data.threads : []
}

export async function getQuantyThread(
  id: string,
  accessJwt: string,
): Promise<QuantyThreadDetail | null> {
  if (!accessJwt || !id) return null
  const res = await fetchBridgeJson<{
    ok: boolean
    thread?: QuantyThreadSummary
    messages?: QuantyThreadMessage[]
  }>(
    `/api/quantzing/quanty/threads/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: buildAuthHeaders(accessJwt),
    },
    6000,
  )
  if (!res.ok || !res.data?.ok || !res.data.thread) return null
  return {
    thread: res.data.thread,
    messages: Array.isArray(res.data.messages) ? res.data.messages : [],
  }
}

export async function createQuantyThread(
  params: {
    title?: string
    mode?: QuantyBridgeMode
    postContext?: QuantyPostContext | null
  },
  accessJwt: string,
): Promise<QuantyThreadSummary | null> {
  if (!accessJwt) return null
  const res = await fetchBridgeJson<{
    ok: boolean
    thread?: QuantyThreadSummary
  }>(
    '/api/quantzing/quanty/threads',
    {
      method: 'POST',
      headers: buildAuthHeaders(accessJwt),
      body: JSON.stringify(params),
    },
    6000,
  )
  if (!res.ok || !res.data?.ok || !res.data.thread) return null
  return res.data.thread
}

export async function appendQuantyThreadMessage(
  id: string,
  msg: Omit<QuantyThreadMessage, 'id' | 'threadId' | 'createdAt'>,
  accessJwt: string,
): Promise<{
  message: QuantyThreadMessage
  thread: QuantyThreadSummary
} | null> {
  if (!accessJwt || !id) return null
  const res = await fetchBridgeJson<{
    ok: boolean
    message?: QuantyThreadMessage
    thread?: QuantyThreadSummary
  }>(
    `/api/quantzing/quanty/threads/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      headers: buildAuthHeaders(accessJwt),
      body: JSON.stringify(msg),
    },
    6000,
  )
  if (!res.ok || !res.data?.ok || !res.data.message || !res.data.thread) {
    return null
  }
  return {message: res.data.message, thread: res.data.thread}
}

export async function deleteQuantyThread(
  id: string,
  accessJwt: string,
): Promise<boolean> {
  if (!accessJwt || !id) return false
  const res = await fetchBridgeJson<{ok: boolean; deleted?: boolean}>(
    `/api/quantzing/quanty/threads/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: buildAuthHeaders(accessJwt),
    },
    6000,
  )
  return Boolean(res.ok && res.data?.ok && res.data?.deleted)
}

export function formatOriginLabel(origin?: QuantyEngineOrigin): string {
  if (origin === 'quant-ai') return 'QuantAI'
  if (origin === 'quant-router') return 'QuantRouter'
  return 'Live Sovereign Network'
}

export interface ActiveQuantySessionSnapshot {
  threadId: string | null
  messages: QuantyThreadMessage[]
  updatedAt: number
}

let activeQuantySession: ActiveQuantySessionSnapshot = {
  threadId: null,
  messages: [],
  updatedAt: 0,
}

const sessionListeners = new Set<(snap: ActiveQuantySessionSnapshot) => void>()

export function getActiveQuantySession(): ActiveQuantySessionSnapshot {
  return activeQuantySession
}

export function setActiveQuantySession(
  partial: Partial<Omit<ActiveQuantySessionSnapshot, 'updatedAt'>>,
): ActiveQuantySessionSnapshot {
  activeQuantySession = {
    threadId:
      partial.threadId !== undefined
        ? partial.threadId
        : activeQuantySession.threadId,
    messages:
      partial.messages !== undefined
        ? partial.messages
        : activeQuantySession.messages,
    updatedAt: Date.now(),
  }
  for (const listener of sessionListeners) {
    try {
      listener(activeQuantySession)
    } catch {
      // Ignore subscriber errors
    }
  }
  return activeQuantySession
}

export function subscribeActiveQuantySession(
  listener: (snap: ActiveQuantySessionSnapshot) => void,
): () => void {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

export type {QuantyEngineOrigin} from '#/lib/quantos/client'

export interface QuantyDockOpenRequest {
  prompt?: string
  postContext?: {uri?: string; text?: string; authorHandle?: string} | null
  triggerId: number
}

let quantyDockTriggerCounter = 1
const dockOpenListeners = new Set<(req: QuantyDockOpenRequest) => void>()

export function requestOpenQuantyDock(
  req: Omit<QuantyDockOpenRequest, 'triggerId'>,
): void {
  const fullReq: QuantyDockOpenRequest = {
    ...req,
    triggerId: quantyDockTriggerCounter++,
  }
  for (const listener of dockOpenListeners) {
    try {
      listener(fullReq)
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeQuantyDockOpenRequests(
  listener: (req: QuantyDockOpenRequest) => void,
): () => void {
  dockOpenListeners.add(listener)
  return () => {
    dockOpenListeners.delete(listener)
  }
}
