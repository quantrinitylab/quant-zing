import {QUANTZING_SERVICE} from '#/lib/constants'
import {IS_WEB} from '#/env'

export type AdminRole = 'admin' | 'moderator' | 'user' | 'guest'

export interface AdminMeResponse {
  ok: boolean
  isAdmin: boolean
  isStaff: boolean
  role: AdminRole
  did: string | null
  handle: string | null
}

export interface AdminDailyPoint {
  date: string
  count: number
}

export interface AdminOverviewMetrics {
  totalUsers: number
  activeUsers: number
  verifiedUsers: number
  suspendedUsers: number
  bannedUsers: number
  staffUsers: number
  totalPosts: number
  totalReplies: number
  totalLikes: number
  totalReposts: number
  totalBlobs: number
  totalBlobBytes: number
  totalConvos: number
  totalMessages: number
  openReports: number
  totalReports: number
  openAppeals: number
  takenDownPosts: number
  activeLabels: number
}

export interface AdminOverviewResponse {
  ok: boolean
  metrics: AdminOverviewMetrics
  series: {
    signupsByDay: AdminDailyPoint[]
    postsByDay: AdminDailyPoint[]
  }
  rateLimit: {
    totalChecks: number
    totalBlocked: number
    blockedByBucket: Record<string, number>
  }
  system: {
    uptimeSec: number
    memoryMb: number
    dbSizeBytes: number
    nodeVersion: string
    dataDir: string
  }
}

export type ReportStatusFilter = 'open' | 'resolved' | 'dismissed' | 'all'

export type ReportResolveAction =
  | 'dismiss'
  | 'label'
  | 'takedown_post'
  | 'warn_user'
  | 'suspend_user'
  | 'ban_user'

export interface AdminReportSubject {
  $type?: string
  uri?: string
  cid?: string
  did?: string
}

export interface AdminReportItem {
  id: string
  status: 'open' | 'resolved' | 'dismissed' | string
  reasonType: string
  reason?: string | null
  createdAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  resolvedByHandle?: string | null
  resolutionAction?: string | null
  resolutionNote?: string | null
  reporterDid?: string | null
  reporterHandle?: string | null
  reporterDisplayName?: string | null
  reporter?: {
    did?: string
    handle?: string
    displayName?: string
    avatar?: string | null
  } | null
  subjectType?: 'post' | 'account' | string
  subject?: AdminReportSubject | null
  subjectUri?: string | null
  subjectDid?: string | null
  subjectHandle?: string | null
  subjectDisplayName?: string | null
  subjectText?: string | null
  subjectPost?: {
    uri?: string
    text?: string
    authorDid?: string
    authorHandle?: string
    authorDisplayName?: string
    createdAt?: string
    takenDown?: boolean
    labels?: Array<string | {val?: string}>
  } | null
  subjectAccount?: {
    did?: string
    handle?: string
    displayName?: string
    avatar?: string | null
    status?: string
    verified?: boolean
  } | null
  targetDid?: string | null
  targetHandle?: string | null
  targetDisplayName?: string | null
  post?: {
    uri?: string
    text?: string
    authorDid?: string
    authorHandle?: string
    authorDisplayName?: string
    createdAt?: string
    takenDown?: boolean
    labels?: Array<string | {val?: string}>
  } | null
  account?: {
    did?: string
    handle?: string
    displayName?: string
    status?: string
    verified?: boolean
    warningsCount?: number
  } | null
}

export interface ResolveReportBody {
  action: ReportResolveAction
  note?: string
  labelVal?: string
  suspendHours?: number
}

export type UserFilter = 'all' | 'verified' | 'suspended' | 'banned' | 'staff'

export type UserModerationAction =
  | 'verify'
  | 'unverify'
  | 'warn'
  | 'suspend'
  | 'ban'
  | 'restore'
  | 'set_role'

export interface AdminUserItem {
  did: string
  handle: string
  displayName?: string | null
  email?: string | null
  role: 'admin' | 'moderator' | 'user' | string
  status: 'active' | 'suspended' | 'banned' | 'deactivated' | string
  verified?: boolean
  isVerified?: boolean
  suspendedUntil?: string | null
  moderationReason?: string | null
  warningsCount?: number
  warnings?: Array<{reason?: string; at?: string; by?: string}> | number
  postsCount?: number
  followersCount?: number
  followingCount?: number
  createdAt?: string | null
}

export interface UserActionBody {
  action: UserModerationAction
  reason?: string
  suspendHours?: number
  role?: 'user' | 'moderator' | 'admin'
}

export type PostFilter = 'all' | 'active' | 'removed' | 'labeled'
export type PostModerationAction = 'takedown' | 'restore' | 'label' | 'unlabel'

export interface AdminPostItem {
  uri: string
  cid?: string
  rkey?: string
  authorDid: string
  authorHandle: string
  authorDisplayName?: string | null
  authorVerified?: boolean
  text: string
  createdAt?: string | null
  indexedAt?: string | null
  likeCount?: number
  repostCount?: number
  replyCount?: number
  takenDown?: boolean
  removed?: boolean
  takedownReason?: string | null
  labels?: Array<string | {val?: string; src?: string; cts?: string}>
}

export interface PostActionBody {
  uri: string
  action: PostModerationAction
  reason?: string
  labelVal?: string
}

export type AppealStatusFilter = 'open' | 'approved' | 'rejected' | 'all'

export interface AdminAppealItem {
  id: string
  status: 'open' | 'approved' | 'rejected' | string
  type?: 'account' | 'post' | string
  subjectType?: 'account' | 'post' | string
  appellantDid?: string | null
  appellantHandle?: string | null
  appellantDisplayName?: string | null
  did?: string | null
  handle?: string | null
  targetUri?: string | null
  subjectUri?: string | null
  message?: string | null
  reason?: string | null
  createdAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  resolvedByHandle?: string | null
  resolutionNote?: string | null
  decision?: string | null
}

export interface ResolveAppealBody {
  decision: 'approve' | 'reject'
  note?: string
}

export interface AdminAuditEntry {
  id?: string
  at?: string
  createdAt?: string
  timestamp?: string
  actorDid?: string | null
  actorHandle?: string | null
  action: string
  target?: string | null
  targetDid?: string | null
  targetUri?: string | null
  targetHandle?: string | null
  details?: string | Record<string, unknown> | null
  note?: string | null
  reason?: string | null
}

export interface AdminBackupItem {
  filename: string
  sizeBytes: number
  createdAt: string
}

export class AdminApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

export function getAdminApiBaseUrl(): string {
  if (IS_WEB && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return QUANTZING_SERVICE
}

async function adminRequest<T>(
  path: string,
  accessJwt?: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const baseUrl = getAdminApiBaseUrl().replace(/\/+$/, '')
  const url = `${baseUrl}${path}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (accessJwt) {
    headers.Authorization = `Bearer ${accessJwt}`
  }
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    })

    const rawText = await res.text().catch(() => '')
    let parsed: Record<string, unknown> | null = null
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }

    if (!res.ok) {
      const msg =
        (typeof parsed?.message === 'string' && parsed.message) ||
        (typeof parsed?.error === 'string' && parsed.error) ||
        `Request failed with status ${res.status}`
      throw new AdminApiError(msg, res.status)
    }

    if (!parsed) {
      throw new AdminApiError('Invalid JSON response from Admin API', res.status)
    }

    return parsed as unknown as T
  } catch (err) {
    if (err instanceof AdminApiError) {
      throw err
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AdminApiError('Admin API request timed out', 408)
    }
    throw new AdminApiError(
      err instanceof Error ? err.message : 'Network error reaching Admin API',
      0,
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchAdminMe(
  accessJwt?: string,
): Promise<AdminMeResponse> {
  if (!accessJwt) {
    return {
      ok: true,
      isAdmin: false,
      isStaff: false,
      role: 'guest',
      did: null,
      handle: null,
    }
  }
  try {
    const data = await adminRequest<AdminMeResponse>(
      '/api/quantzing/admin/me',
      accessJwt,
      {method: 'GET'},
      8000,
    )
    return {
      ok: Boolean(data.ok),
      isAdmin: Boolean(data.isAdmin),
      isStaff: Boolean(data.isStaff),
      role: data.role || 'guest',
      did: data.did ?? null,
      handle: data.handle ?? null,
    }
  } catch {
    return {
      ok: false,
      isAdmin: false,
      isStaff: false,
      role: 'guest',
      did: null,
      handle: null,
    }
  }
}

export function fetchAdminOverview(
  accessJwt: string,
): Promise<AdminOverviewResponse> {
  return adminRequest<AdminOverviewResponse>(
    '/api/quantzing/admin/overview',
    accessJwt,
    {method: 'GET'},
  )
}

export function fetchAdminReports(
  accessJwt: string,
  status: ReportStatusFilter = 'open',
): Promise<{ok: boolean; reports: AdminReportItem[]}> {
  const qs = `status=${encodeURIComponent(status)}`
  return adminRequest<{ok: boolean; reports: AdminReportItem[]}>(
    `/api/quantzing/admin/reports?${qs}`,
    accessJwt,
    {method: 'GET'},
  )
}

export function resolveAdminReport(
  accessJwt: string,
  reportId: string,
  body: ResolveReportBody,
): Promise<{ok: boolean; report?: AdminReportItem}> {
  return adminRequest<{ok: boolean; report?: AdminReportItem}>(
    `/api/quantzing/admin/reports/${encodeURIComponent(reportId)}/resolve`,
    accessJwt,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export function fetchAdminUsers(
  accessJwt: string,
  opts: {q?: string; filter?: UserFilter} = {},
): Promise<{ok: boolean; users: AdminUserItem[]}> {
  const params = new URLSearchParams()
  if (opts.q?.trim()) {
    params.set('q', opts.q.trim())
  }
  params.set('filter', opts.filter || 'all')
  return adminRequest<{ok: boolean; users: AdminUserItem[]}>(
    `/api/quantzing/admin/users?${params.toString()}`,
    accessJwt,
    {method: 'GET'},
  )
}

export function performAdminUserAction(
  accessJwt: string,
  did: string,
  body: UserActionBody,
): Promise<{ok: boolean; user?: AdminUserItem}> {
  return adminRequest<{ok: boolean; user?: AdminUserItem}>(
    `/api/quantzing/admin/users/${encodeURIComponent(did)}/action`,
    accessJwt,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export function fetchAdminPosts(
  accessJwt: string,
  opts: {q?: string; filter?: PostFilter} = {},
): Promise<{ok: boolean; posts: AdminPostItem[]}> {
  const params = new URLSearchParams()
  if (opts.q?.trim()) {
    params.set('q', opts.q.trim())
  }
  params.set('filter', opts.filter || 'all')
  return adminRequest<{ok: boolean; posts: AdminPostItem[]}>(
    `/api/quantzing/admin/posts?${params.toString()}`,
    accessJwt,
    {method: 'GET'},
  )
}

export function performAdminPostAction(
  accessJwt: string,
  body: PostActionBody,
): Promise<{ok: boolean; post?: AdminPostItem}> {
  return adminRequest<{ok: boolean; post?: AdminPostItem}>(
    '/api/quantzing/admin/posts/action',
    accessJwt,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export function fetchAdminAppeals(
  accessJwt: string,
  status: AppealStatusFilter = 'open',
): Promise<{ok: boolean; appeals: AdminAppealItem[]}> {
  const qs = `status=${encodeURIComponent(status)}`
  return adminRequest<{ok: boolean; appeals: AdminAppealItem[]}>(
    `/api/quantzing/admin/appeals?${qs}`,
    accessJwt,
    {method: 'GET'},
  )
}

export function resolveAdminAppeal(
  accessJwt: string,
  appealId: string,
  body: ResolveAppealBody,
): Promise<{ok: boolean; appeal?: AdminAppealItem}> {
  return adminRequest<{ok: boolean; appeal?: AdminAppealItem}>(
    `/api/quantzing/admin/appeals/${encodeURIComponent(appealId)}/resolve`,
    accessJwt,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export function fetchAdminAudit(
  accessJwt: string,
  limit = 100,
): Promise<{ok: boolean; entries: AdminAuditEntry[]}> {
  const qs = `limit=${encodeURIComponent(String(limit))}`
  return adminRequest<{ok: boolean; entries: AdminAuditEntry[]}>(
    `/api/quantzing/admin/audit?${qs}`,
    accessJwt,
    {method: 'GET'},
  )
}

export function fetchAdminBackups(
  accessJwt: string,
): Promise<{ok: boolean; backups: AdminBackupItem[]}> {
  return adminRequest<{ok: boolean; backups: AdminBackupItem[]}>(
    '/api/quantzing/admin/backups',
    accessJwt,
    {method: 'GET'},
  )
}

export function createAdminBackup(
  accessJwt: string,
): Promise<{ok: boolean; backup: AdminBackupItem}> {
  return adminRequest<{ok: boolean; backup: AdminBackupItem}>(
    '/api/quantzing/admin/backup',
    accessJwt,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    25000,
  )
}
