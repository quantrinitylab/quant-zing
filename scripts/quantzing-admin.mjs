import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ---------------------------------------------------------------------------
// QuantZing Enterprise Employee Ops, Granular RBAC, Trust & Safety & Rate Limiter
// Zero external dependencies (Node built-ins only)
// ---------------------------------------------------------------------------

export const FOUNDER_DID = 'did:plc:quantzingfounder00000000'
export const FOUNDER_HANDLE = 'founder.quantzing.com'
export const FOUNDER_EMAIL = 'founder@quantzing.com'
export const MOD_LABELER_DID = 'did:plc:quantzingmod000000000000'

const MAX_AUDIT_LOG_ENTRIES = 5000
const OPS_SESSION_TTL_SECONDS = 8 * 3600
const STRONG_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_+=@#'

// ---------------------------------------------------------------------------
// 8 Granular Department Roles & Permission Matrix
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS = {
  super_admin: [
    'overview.read',
    'reports.read',
    'reports.claim',
    'reports.takedown',
    'reports.label',
    'reports.enforce',
    'posts.read',
    'posts.moderate',
    'users.read',
    'users.inspect',
    'users.pii_full',
    'users.verify',
    'users.enforce',
    'appeals.read',
    'appeals.resolve',
    'approvals.read',
    'approvals.review',
    'staff.read',
    'staff.manage',
    'audit.read',
    'backups.manage',
    'ai.read',
    'ai.manage',
    'antibot.read',
    'antibot.manage',
    'trends.read',
    'trends.manage',
  ],
  l2_trust_safety: [
    'overview.read',
    'reports.read',
    'reports.claim',
    'reports.takedown',
    'reports.label',
    'reports.enforce',
    'posts.read',
    'posts.moderate',
    'users.read',
    'users.inspect',
    'users.enforce',
    'appeals.read',
    'appeals.resolve',
    'approvals.read',
    'audit.read',
  ],
  l1_moderator: [
    'overview.read',
    'reports.read',
    'reports.claim',
    'reports.takedown',
    'reports.label',
    'posts.read',
    'posts.moderate',
  ],
  verification_ops: [
    'overview.read',
    'users.read',
    'users.inspect',
    'users.verify',
  ],
  support_agent: [
    'overview.read',
    'users.read',
    'users.inspect',
    'appeals.read',
  ],
  ai_ops: [
    'overview.read',
    'ai.read',
    'ai.manage',
    'audit.read',
  ],
  anti_bot_ops: [
    'overview.read',
    'antibot.read',
    'antibot.manage',
    'users.read',
    'users.inspect',
    'reports.read',
    'audit.read',
  ],
  growth_ops: [
    'overview.read',
    'trends.read',
    'trends.manage',
    'posts.read',
    'audit.read',
  ],
}

export const STAFF_ROLES = new Set(Object.keys(ROLE_PERMISSIONS))

const ROLE_DEFAULT_DEPARTMENT = {
  super_admin: 'Leadership',
  l2_trust_safety: 'Trust & Safety',
  l1_moderator: 'Content Moderation',
  verification_ops: 'Verification',
  support_agent: 'Support',
  ai_ops: 'AI & Quanty',
  anti_bot_ops: 'Anti-Bot & Integrity',
  growth_ops: 'Trends & Reels',
  user: '',
}

const ROLE_SORT_ORDER = {
  super_admin: 0,
  l2_trust_safety: 1,
  l1_moderator: 2,
  verification_ops: 3,
  support_agent: 4,
  ai_ops: 5,
  anti_bot_ops: 6,
  growth_ops: 7,
  user: 8,
}

export const ROLE_META = {
  super_admin: {
    id: 'super_admin',
    label: 'Super Admin',
    department: 'Leadership',
    description:
      'Full sovereign platform control, Four-Eyes approval authority, staff lifecycle, PII access, backups, and platform-wide AI/Anti-Bot/Trends settings.',
    permissions: ROLE_PERMISSIONS.super_admin,
  },
  l2_trust_safety: {
    id: 'l2_trust_safety',
    label: 'L2 Trust & Safety',
    department: 'Trust & Safety',
    description:
      'Account enforcement, appeals resolution, escalations, and audit log review. High-profile enforcements require Four-Eyes approval.',
    permissions: ROLE_PERMISSIONS.l2_trust_safety,
  },
  l1_moderator: {
    id: 'l1_moderator',
    label: 'L1 Moderator',
    department: 'Content Moderation',
    description:
      'Shift queue report triage, post takedowns, and content labeling. No account enforcement or user PII access.',
    permissions: ROLE_PERMISSIONS.l1_moderator,
  },
  verification_ops: {
    id: 'verification_ops',
    label: 'Verification Ops',
    department: 'Verification',
    description:
      'Identity review, reason-logged account inspection, and verified badge management.',
    permissions: ROLE_PERMISSIONS.verification_ops,
  },
  support_agent: {
    id: 'support_agent',
    label: 'Support Agent',
    department: 'Support',
    description:
      'Appeals queue triage and reason-logged user account inspection with masked PII.',
    permissions: ROLE_PERMISSIONS.support_agent,
  },
  ai_ops: {
    id: 'ai_ops',
    label: 'AI Ops',
    department: 'AI & Quanty',
    description:
      'Cloudflare Workers AI model routing, Quanty neuron budgeting, grounding, and system prompt curation.',
    permissions: ROLE_PERMISSIONS.ai_ops,
  },
  anti_bot_ops: {
    id: 'anti_bot_ops',
    label: 'Anti-Bot & Integrity',
    department: 'Anti-Bot & Integrity',
    description:
      'Rate-limiting thresholds, IP/domain blocklists, auto-shadow throttle, and link verification enforcement.',
    permissions: ROLE_PERMISSIONS.anti_bot_ops,
  },
  growth_ops: {
    id: 'growth_ops',
    label: 'Trends & Reels Ops',
    department: 'Trends & Reels',
    description:
      'Pinned and muted sovereign trends curation, Reels freshness gravity, and video diversity tuning.',
    permissions: ROLE_PERMISSIONS.growth_ops,
  },
}

const VALID_ROLE_INPUTS = new Map([
  ['super_admin', 'super_admin'],
  ['admin', 'super_admin'],
  ['l2_trust_safety', 'l2_trust_safety'],
  ['moderator', 'l2_trust_safety'],
  ['l1_moderator', 'l1_moderator'],
  ['verification_ops', 'verification_ops'],
  ['support_agent', 'support_agent'],
  ['ai_ops', 'ai_ops'],
  ['ai', 'ai_ops'],
  ['anti_bot_ops', 'anti_bot_ops'],
  ['antibot_ops', 'anti_bot_ops'],
  ['antibot', 'anti_bot_ops'],
  ['growth_ops', 'growth_ops'],
  ['growth', 'growth_ops'],
  ['user', 'user'],
])

export function normalizeRole(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
  return VALID_ROLE_INPUTS.get(key) || 'user'
}

export function isStaffRole(role) {
  return STAFF_ROLES.has(normalizeRole(role))
}

export function defaultDepartmentForRole(role) {
  return ROLE_DEFAULT_DEPARTMENT[normalizeRole(role)] || ''
}

export function getPermissionsForRole(role) {
  const norm = normalizeRole(role)
  return ROLE_PERMISSIONS[norm] ? [...ROLE_PERMISSIONS[norm]] : []
}

export function hasPermission(role, permission) {
  const norm = normalizeRole(role)
  const list = ROLE_PERMISSIONS[norm]
  if (!Array.isArray(list)) return false
  return list.includes(permission)
}

export function isProtectedAccount(account) {
  if (!account || typeof account !== 'object') return false
  return Boolean(
    normalizeRole(account.role) !== 'user' ||
      account.officialAccount === true ||
      account.isOfficial === true ||
      account.staffVerified === true,
  )
}

export function maskEmailForRole(email, role) {
  const norm = normalizeRole(role)
  if (norm === 'super_admin') {
    return String(email || '')
  }
  if (norm === 'l1_moderator' || !isStaffRole(norm)) {
    return '[redacted]'
  }
  const str = String(email || '').trim()
  if (!str) return ''
  const atIdx = str.indexOf('@')
  if (atIdx <= 0) return '[redacted]'
  const local = str.slice(0, atIdx)
  const domain = str.slice(atIdx + 1)
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

// ---------------------------------------------------------------------------
// Host-Based Isolation (Public Consumer App vs Employee Ops Portal)
// ---------------------------------------------------------------------------

function getRequestHostname(req) {
  const trustForwarded = process.env.QUANTZING_TRUST_FORWARDED_HOST === '1'
  const raw = String(
    (trustForwarded ? req?.headers?.['x-forwarded-host'] : '') ||
      req?.headers?.host ||
      '',
  )
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (!raw) return ''
  if (raw.startsWith('[')) {
    const endIdx = raw.indexOf(']')
    return endIdx !== -1 ? raw.slice(1, endIdx) : raw
  }
  return raw.replace(/:\d+$/, '')
}

function isDedicatedOpsHost(hostname) {
  return (
    (hostname.startsWith('ops.') && hostname.length > 4) ||
    (hostname.startsWith('quantzing-ops.') && hostname.length > 14)
  )
}

export function isOpsRequestHost(req) {
  const hostname = getRequestHostname(req)
  if (!hostname) {
    if (process.env.NODE_ENV === 'test' || req?.__test || !req?.headers) {
      return true
    }
    return false
  }
  if (isDedicatedOpsHost(hostname)) return true
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    return true
  }
  const extraRaw = String(process.env.QUANTZING_OPS_HOSTS || '')
  if (extraRaw.trim()) {
    for (const part of extraRaw.split(',')) {
      const cleaned = part
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '')
      if (cleaned && hostname === cleaned) return true
    }
  }
  return false
}

function buildInviteUrl(req, origin, token) {
  const hostname = getRequestHostname(req)
  const baseOrigin = String(origin || '').replace(/\/+$/, '')
  if (isDedicatedOpsHost(hostname)) {
    return `${baseOrigin}/?invite=${encodeURIComponent(token)}`
  }
  return `${baseOrigin}/ops?invite=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Sliding-Window Rate Limiter (Zero Dependencies)
// ---------------------------------------------------------------------------

const rateBuckets = new Map()
let lastRateCleanupMs = 0
const rateLimitStats = {
  totalChecks: 0,
  totalBlocked: 0,
  blockedByBucket: {},
}

export function getClientIp(req) {
  const xff = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  if (xff) return xff
  const realIp = String(req?.headers?.['x-real-ip'] || '').trim()
  if (realIp) return realIp
  return String(req?.socket?.remoteAddress || '127.0.0.1')
}

export function checkRateLimit(bucketKey, maxRequests, windowMs) {
  const now = Date.now()
  const limit = Math.max(1, Number(maxRequests) || 1)
  const windowDuration = Math.max(1000, Number(windowMs) || 60_000)
  const cutoff = now - windowDuration

  rateLimitStats.totalChecks += 1

  // Throttled cleanup (at most once per 60s) so high-IP traffic never thrashes
  if (rateBuckets.size > 5000 && now - lastRateCleanupMs > 60_000) {
    lastRateCleanupMs = now
    const staleCutoff = now - 60 * 60 * 1000
    for (const [k, arr] of rateBuckets.entries()) {
      if (!arr.length || arr[arr.length - 1] < staleCutoff) {
        rateBuckets.delete(k)
      }
    }
  }

  let timestamps = rateBuckets.get(bucketKey)
  if (!timestamps) {
    timestamps = []
    rateBuckets.set(bucketKey, timestamps)
  }

  if (timestamps.length > 0 && timestamps[0] <= cutoff) {
    let firstValid = 0
    while (firstValid < timestamps.length && timestamps[firstValid] <= cutoff) {
      firstValid++
    }
    if (firstValid > 0) {
      timestamps = timestamps.slice(firstValid)
      rateBuckets.set(bucketKey, timestamps)
    }
  }

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0] || now
    const resetAtMs = oldestInWindow + windowDuration
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000))
    rateLimitStats.totalBlocked += 1
    const bucketName = bucketKey.includes(':')
      ? bucketKey.split(':')[0]
      : bucketKey
    rateLimitStats.blockedByBucket[bucketName] =
      (rateLimitStats.blockedByBucket[bucketName] || 0) + 1
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(resetAtMs).toISOString(),
      retryAfterSec,
    }
  }

  timestamps.push(now)
  const remaining = Math.max(0, limit - timestamps.length)
  const resetAtMs = (timestamps[0] || now) + windowDuration
  return {
    allowed: true,
    remaining,
    resetAt: new Date(resetAtMs).toISOString(),
    retryAfterSec: 0,
  }
}

export function getRateLimitStats() {
  return {
    totalChecks: rateLimitStats.totalChecks,
    totalBlocked: rateLimitStats.totalBlocked,
    blockedByBucket: {...rateLimitStats.blockedByBucket},
  }
}

export function enforceRateLimit(
  req,
  res,
  {bucketKey, maxRequests, windowMs, auth = null, sendJson},
) {
  if (
    auth &&
    !auth.error &&
    normalizeRole(auth.account?.role) === 'super_admin'
  ) {
    return false
  }
  const rl = checkRateLimit(bucketKey, maxRequests, windowMs)
  if (!rl.allowed) {
    sendJson(
      req,
      res,
      429,
      {
        error: 'RateLimitExceeded',
        message: 'Too many requests. Please try again later.',
        retryAfterSec: rl.retryAfterSec,
      },
      {
        'retry-after': String(rl.retryAfterSec),
      },
    )
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Admin Handle Configuration & Founder Bootstrap Helpers
// ---------------------------------------------------------------------------

function normalizeAdminHandleRaw(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  if (!cleaned) return ''
  return cleaned.includes('.') ? cleaned : `${cleaned}.quantzing.com`
}

export function getConfiguredAdminHandles() {
  const raw = String(process.env.QUANTZING_ADMIN_HANDLES || '')
  if (!raw.trim()) return new Set()
  const handles = new Set()
  for (const part of raw.split(',')) {
    const norm = normalizeAdminHandleRaw(part)
    if (norm) handles.add(norm)
  }
  return handles
}

export function isConfiguredAdminHandle(handle) {
  const norm = normalizeAdminHandleRaw(handle)
  if (!norm) return false
  return getConfiguredAdminHandles().has(norm)
}

function generateStrongPassword(length = 24) {
  let out = ''
  for (let i = 0; i < length; i++) {
    out +=
      STRONG_PASSWORD_ALPHABET[
        crypto.randomInt(0, STRONG_PASSWORD_ALPHABET.length)
      ]
  }
  return out
}

function safeTokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function hashInviteToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex')
}

// ---------------------------------------------------------------------------
// Persisted Platform Settings Store (quantzing-platform-settings.json)
// ---------------------------------------------------------------------------

export const PLATFORM_SETTINGS_FILENAME = 'quantzing-platform-settings.json'

export const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  ai: Object.freeze({
    provider: 'cloudflare-workers-ai',
    cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',
    cfApiToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '',
    cfPrimaryModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cfFastModel: '@cf/meta/llama-3.1-8b-instruct-fast',
    dailyNeuronBudget: 100000,
    temperature: 0.7,
    maxTokens: 2048,
    enableWebGrounding: false,
    systemPromptAddon: '',
  }),
  antibot: Object.freeze({
    maxPostsPerMinute: 30,
    maxLikesPerMinute: 120,
    maxViewsPerMinutePerIp: 600,
    maxSignupsPerHourPerIp: 10,
    autoShadowThrottle: true,
    requireEmailVerifyForLinks: true,
    blockedIps: Object.freeze([]),
    blockedDomains: Object.freeze([]),
  }),
  trends: Object.freeze({
    pinnedTrends: Object.freeze([]),
    mutedTrends: Object.freeze([]),
    reelsFreshnessGravity: 1.35,
    reelsDiversityWindow: 3,
  }),
})

export function sanitizeAiSettings(ai) {
  const rawToken = String(ai?.cfApiToken || '').trim()
  const hasCfApiToken = Boolean(rawToken)
  const last4 = hasCfApiToken && rawToken.length >= 4 ? rawToken.slice(-4) : (rawToken || '')
  const maskedToken = hasCfApiToken
    ? (rawToken.length > 4 ? `••••••••${rawToken.slice(-4)}` : '••••')
    : ''

  return {
    provider: ai?.provider || DEFAULT_PLATFORM_SETTINGS.ai.provider,
    cfAccountId: ai?.cfAccountId || '',
    hasCfApiToken,
    cfApiToken: maskedToken,
    cfApiTokenMasked: maskedToken,
    cfApiTokenLast4: last4,
    cfPrimaryModel: ai?.cfPrimaryModel || DEFAULT_PLATFORM_SETTINGS.ai.cfPrimaryModel,
    cfFastModel: ai?.cfFastModel || DEFAULT_PLATFORM_SETTINGS.ai.cfFastModel,
    dailyNeuronBudget: Number.isFinite(Number(ai?.dailyNeuronBudget))
      ? Number(ai.dailyNeuronBudget)
      : DEFAULT_PLATFORM_SETTINGS.ai.dailyNeuronBudget,
    temperature: Number.isFinite(Number(ai?.temperature))
      ? Number(ai.temperature)
      : DEFAULT_PLATFORM_SETTINGS.ai.temperature,
    maxTokens: Number.isFinite(Number(ai?.maxTokens))
      ? Number(ai.maxTokens)
      : DEFAULT_PLATFORM_SETTINGS.ai.maxTokens,
    enableWebGrounding: Boolean(ai?.enableWebGrounding),
    systemPromptAddon: String(ai?.systemPromptAddon || ''),
  }
}

export function loadPlatformSettings(dataDir) {
  const settingsPath = path.join(dataDir, PLATFORM_SETTINGS_FILENAME)
  if (!fs.existsSync(settingsPath)) {
    return {
      ai: {...DEFAULT_PLATFORM_SETTINGS.ai},
      antibot: {
        ...DEFAULT_PLATFORM_SETTINGS.antibot,
        blockedIps: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedIps],
        blockedDomains: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedDomains],
      },
      trends: {
        ...DEFAULT_PLATFORM_SETTINGS.trends,
        pinnedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.pinnedTrends],
        mutedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.mutedTrends],
      },
    }
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ai: {
        ...DEFAULT_PLATFORM_SETTINGS.ai,
        ...(parsed?.ai || {}),
      },
      antibot: {
        ...DEFAULT_PLATFORM_SETTINGS.antibot,
        ...(parsed?.antibot || {}),
        blockedIps: Array.isArray(parsed?.antibot?.blockedIps)
          ? [...parsed.antibot.blockedIps]
          : [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedIps],
        blockedDomains: Array.isArray(parsed?.antibot?.blockedDomains)
          ? [...parsed.antibot.blockedDomains]
          : [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedDomains],
      },
      trends: {
        ...DEFAULT_PLATFORM_SETTINGS.trends,
        ...(parsed?.trends || {}),
        pinnedTrends: Array.isArray(parsed?.trends?.pinnedTrends)
          ? [...parsed.trends.pinnedTrends]
          : [...DEFAULT_PLATFORM_SETTINGS.trends.pinnedTrends],
        mutedTrends: Array.isArray(parsed?.trends?.mutedTrends)
          ? [...parsed.trends.mutedTrends]
          : [...DEFAULT_PLATFORM_SETTINGS.trends.mutedTrends],
      },
    }
  } catch {
    return {
      ai: {...DEFAULT_PLATFORM_SETTINGS.ai},
      antibot: {
        ...DEFAULT_PLATFORM_SETTINGS.antibot,
        blockedIps: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedIps],
        blockedDomains: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedDomains],
      },
      trends: {
        ...DEFAULT_PLATFORM_SETTINGS.trends,
        pinnedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.pinnedTrends],
        mutedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.mutedTrends],
      },
    }
  }
}

export function savePlatformSettings(dataDir, settings) {
  fs.mkdirSync(dataDir, {recursive: true})
  const settingsPath = path.join(dataDir, PLATFORM_SETTINGS_FILENAME)
  const tmpPath = `${settingsPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  const serialized = JSON.stringify(settings, null, 2)
  fs.writeFileSync(tmpPath, serialized, {encoding: 'utf8', mode: 0o600})
  try {
    fs.renameSync(tmpPath, settingsPath)
  } catch {
    fs.copyFileSync(tmpPath, settingsPath)
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
  }
  try {
    fs.chmodSync(settingsPath, 0o600)
  } catch {}
  return settings
}

export function getRuntimePlatformSettings(dataDir) {
  const dir =
    dataDir ||
    (typeof process.env.QUANTZING_DATA_DIR === 'string' && process.env.QUANTZING_DATA_DIR.trim()
      ? process.env.QUANTZING_DATA_DIR.trim()
      : path.join(process.cwd(), 'data'))
  return loadPlatformSettings(dir)
}

// ---------------------------------------------------------------------------
// DB Schema Extensions & Founder Admin Bootstrap
// ---------------------------------------------------------------------------

export function ensureAdminState(db, helpers) {
  if (!db || typeof db !== 'object') return false
  let mutated = false

  // Ensure default platform settings file exists
  if (helpers && typeof helpers.getDataDir === 'function') {
    try {
      const dataDir = helpers.getDataDir()
      const settingsPath = path.join(dataDir, PLATFORM_SETTINGS_FILENAME)
      if (!fs.existsSync(settingsPath)) {
        savePlatformSettings(dataDir, {
          ai: {...DEFAULT_PLATFORM_SETTINGS.ai},
          antibot: {
            ...DEFAULT_PLATFORM_SETTINGS.antibot,
            blockedIps: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedIps],
            blockedDomains: [...DEFAULT_PLATFORM_SETTINGS.antibot.blockedDomains],
          },
          trends: {
            ...DEFAULT_PLATFORM_SETTINGS.trends,
            pinnedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.pinnedTrends],
            mutedTrends: [...DEFAULT_PLATFORM_SETTINGS.trends.mutedTrends],
          },
        })
      }
    } catch {}
  }

  if (!Array.isArray(db.reports)) {
    db.reports = []
    mutated = true
  }
  if (!Array.isArray(db.appeals)) {
    db.appeals = []
    mutated = true
  }
  if (!Array.isArray(db.pendingApprovals)) {
    db.pendingApprovals = []
    mutated = true
  }
  if (!Array.isArray(db.staffInvites)) {
    db.staffInvites = []
    mutated = true
  } else {
    for (const inv of db.staffInvites) {
      if (inv && typeof inv === 'object' && inv.token && !inv.tokenHash) {
        const rawTok = String(inv.token)
        inv.tokenHash = hashInviteToken(rawTok)
        inv.invitePreview =
          inv.invitePreview ||
          (rawTok.length >= 10
            ? `${rawTok.slice(0, 6)}...${rawTok.slice(-4)}`
            : '***')
        delete inv.token
        delete inv.inviteUrl
        mutated = true
      }
    }
  }
  if (!db.takedowns || typeof db.takedowns !== 'object') {
    db.takedowns = {posts: {}, accounts: {}}
    mutated = true
  } else {
    if (!db.takedowns.posts || typeof db.takedowns.posts !== 'object') {
      db.takedowns.posts = {}
      mutated = true
    }
    if (!db.takedowns.accounts || typeof db.takedowns.accounts !== 'object') {
      db.takedowns.accounts = {}
      mutated = true
    }
  }
  if (!db.labels || typeof db.labels !== 'object') {
    db.labels = {}
    mutated = true
  }
  if (!db.mutes || typeof db.mutes !== 'object') {
    db.mutes = {}
    mutated = true
  }
  if (!Array.isArray(db.auditLog)) {
    db.auditLog = []
    mutated = true
  } else if (db.auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    db.auditLog = db.auditLog.slice(-MAX_AUDIT_LOG_ENTRIES)
    mutated = true
  }

  db.accounts = db.accounts || {}

  // Ensure Founder Admin Genesis Account exists (NEVER overwrite existing password)
  let founderAcc = db.accounts[FOUNDER_DID]
  const founderNeedsAvatar =
    !founderAcc?.profile?.avatar ||
    !db.blobs?.[helpers.extractBlobCid(founderAcc.profile.avatar) || '']

  let founderAvatarBlob = founderAcc?.profile?.avatar || null
  if (founderNeedsAvatar && helpers.storeLocalBlob && helpers.makeAvatarSvg) {
    const svgBuf = Buffer.from(helpers.makeAvatarSvg('founder'), 'utf8')
    founderAvatarBlob = helpers.storeLocalBlob(
      db,
      FOUNDER_DID,
      svgBuf,
      'image/svg+xml',
    )
    mutated = true
  }

  if (!founderAcc) {
    const createdAt = new Date().toISOString()
    const envPassword =
      typeof process.env.QUANTZING_FOUNDER_PASSWORD === 'string' &&
      process.env.QUANTZING_FOUNDER_PASSWORD.length > 0
        ? process.env.QUANTZING_FOUNDER_PASSWORD
        : null
    const password = envPassword || generateStrongPassword(24)
    const {salt, hash} = helpers.hashPasswordSync
      ? helpers.hashPasswordSync(password)
      : helpers.hashPassword(password)

    if (!envPassword) {
      const dataDir = helpers.getDataDir()
      fs.mkdirSync(dataDir, {recursive: true})
      const credsPath = path.join(dataDir, 'founder-admin.credentials.json')
      const credsPayload = JSON.stringify(
        {
          handle: FOUNDER_HANDLE,
          did: FOUNDER_DID,
          email: FOUNDER_EMAIL,
          password,
          createdAt,
        },
        null,
        2,
      )
      fs.writeFileSync(credsPath, credsPayload, {encoding: 'utf8', mode: 0o600})
      try {
        fs.chmodSync(credsPath, 0o600)
      } catch {}
    }

    founderAcc = {
      did: FOUNDER_DID,
      handle: FOUNDER_HANDLE,
      email: FOUNDER_EMAIL,
      emailConfirmed: true,
      emailAuthFactor: false,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt,
      active: true,
      role: 'super_admin',
      department: 'Leadership',
      tokenVersion: 1,
      offboardedAt: null,
      lastOpsLoginAt: null,
      status: 'active',
      statusReason: '',
      suspendedUntil: null,
      warnings: [],
      verified: true,
      staffVerified: true,
      isOfficial: true,
      officialAccount: true,
      profile: {
        displayName: 'QuantZing Founder',
        description:
          'Founder & sovereign network administrator for QuantZing.',
        avatar: founderAvatarBlob,
        createdAt,
      },
      preferences: helpers.createDefaultPreferences(),
      notificationPreferences: helpers.createDefaultNotificationPreferences(),
    }
    db.accounts[FOUNDER_DID] = founderAcc
    mutated = true
  } else {
    if (founderAcc.role !== 'super_admin') {
      founderAcc.role = 'super_admin'
      mutated = true
    }
    if (founderAcc.department !== 'Leadership') {
      founderAcc.department = 'Leadership'
      mutated = true
    }
    if (!founderAcc.isOfficial) {
      founderAcc.isOfficial = true
      mutated = true
    }
    if (!founderAcc.officialAccount) {
      founderAcc.officialAccount = true
      mutated = true
    }
    if (!founderAcc.staffVerified) {
      founderAcc.staffVerified = true
      mutated = true
    }
    if (founderAvatarBlob && !founderAcc.profile?.avatar) {
      founderAcc.profile = {
        ...(founderAcc.profile || {}),
        avatar: founderAvatarBlob,
      }
      mutated = true
    }
  }

  const founderProfileCol = helpers.getCollectionMap(
    db,
    FOUNDER_DID,
    'app.bsky.actor.profile',
    true,
  )
  if (!founderProfileCol.self || founderNeedsAvatar) {
    const profileValue = {
      $type: 'app.bsky.actor.profile',
      displayName: founderAcc.profile?.displayName || 'QuantZing Founder',
      description:
        founderAcc.profile?.description ||
        'Founder & sovereign network administrator for QuantZing.',
      ...(founderAvatarBlob ? {avatar: founderAvatarBlob} : {}),
      createdAt: founderAcc.createdAt || '2026-01-01T00:00:00.000Z',
    }
    founderProfileCol.self = {
      uri: `at://${FOUNDER_DID}/app.bsky.actor.profile/self`,
      cid: helpers.computeCid(profileValue, 'dag-cbor'),
      rkey: 'self',
      collection: 'app.bsky.actor.profile',
      repo: FOUNDER_DID,
      value: profileValue,
      indexedAt: founderAcc.createdAt || new Date().toISOString(),
    }
    mutated = true
  }

  // Ensure @quantzing.quantzing.com has role: 'super_admin', department: 'Leadership'
  const officialAcc = db.accounts[helpers.QUANTZING_OFFICIAL_DID]
  if (officialAcc) {
    if (officialAcc.role !== 'super_admin') {
      officialAcc.role = 'super_admin'
      mutated = true
    }
    if (officialAcc.department !== 'Leadership') {
      officialAcc.department = 'Leadership'
      mutated = true
    }
    if (!officialAcc.officialAccount) {
      officialAcc.officialAccount = true
      mutated = true
    }
    if (!officialAcc.staffVerified) {
      officialAcc.staffVerified = true
      mutated = true
    }
  }

  const configuredAdminHandles = getConfiguredAdminHandles()

  // Backfill required moderation, RBAC & ops fields on all existing accounts
  for (const acc of Object.values(db.accounts)) {
    if (!acc || typeof acc !== 'object') continue
    const normalizedRole = normalizeRole(acc.role)
    if (acc.role !== normalizedRole) {
      acc.role = normalizedRole
      mutated = true
    }
    if (
      configuredAdminHandles.size > 0 &&
      acc.handle &&
      configuredAdminHandles.has(acc.handle.toLowerCase()) &&
      acc.role !== 'super_admin'
    ) {
      acc.role = 'super_admin'
      mutated = true
    }
    if (
      typeof acc.tokenVersion !== 'number' ||
      !Number.isFinite(acc.tokenVersion) ||
      acc.tokenVersion < 1
    ) {
      acc.tokenVersion = 1
      mutated = true
    }
    if (
      typeof acc.department !== 'string' ||
      (isStaffRole(acc.role) && !acc.department.trim())
    ) {
      acc.department = defaultDepartmentForRole(acc.role)
      mutated = true
    }
    if (acc.offboardedAt === undefined) {
      acc.offboardedAt = null
      mutated = true
    }
    if (acc.lastOpsLoginAt === undefined) {
      acc.lastOpsLoginAt = null
      mutated = true
    }
    if (
      acc.status !== 'active' &&
      acc.status !== 'warned' &&
      acc.status !== 'suspended' &&
      acc.status !== 'banned'
    ) {
      acc.status = 'active'
      mutated = true
    }
    if (typeof acc.statusReason !== 'string') {
      acc.statusReason = ''
      mutated = true
    }
    if (acc.suspendedUntil === undefined) {
      acc.suspendedUntil = null
      mutated = true
    }
    if (!Array.isArray(acc.warnings)) {
      acc.warnings = []
      mutated = true
    }
    if (typeof acc.verified !== 'boolean') {
      acc.verified = Boolean(
        acc.isOfficial ||
          acc.isSystemQuanty ||
          acc.did === helpers.QUANTY_SYSTEM_DID ||
          acc.did === helpers.QUANTZING_OFFICIAL_DID ||
          acc.did === FOUNDER_DID,
      )
      mutated = true
    }
  }

  return mutated
}

// ---------------------------------------------------------------------------
// Enforcement, Moderation & Visibility Helpers
// ---------------------------------------------------------------------------

export function checkAccountEnforcement(db, account, {saveDb = null} = {}) {
  if (!account) return {allowed: true}
  if (account.status === 'suspended' && account.suspendedUntil) {
    const untilMs = Date.parse(account.suspendedUntil)
    if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
      account.status = 'active'
      account.suspendedUntil = null
      account.statusReason = ''
      if (db?.accounts?.[account.did] && db.accounts[account.did] !== account) {
        db.accounts[account.did].status = 'active'
        db.accounts[account.did].suspendedUntil = null
        db.accounts[account.did].statusReason = ''
      }
      if (db?.takedowns?.accounts?.[account.did]) {
        delete db.takedowns.accounts[account.did]
      }
      if (typeof saveDb === 'function') {
        saveDb(db)
      } else if (db && typeof db.upsertAccount === 'function') {
        db.upsertAccount(account)
        if (typeof db.deleteTakedownAccount === 'function') {
          db.deleteTakedownAccount(account.did)
        }
      }
      return {allowed: true}
    }
  }
  if (account.status === 'banned') {
    return {
      allowed: false,
      status: 403,
      error: 'AccountTakedown',
      message: `Account banned: ${account.statusReason || 'Policy violation'}`,
    }
  }
  if (account.status === 'suspended') {
    return {
      allowed: false,
      status: 403,
      error: 'AccountSuspended',
      message: `Account suspended${account.suspendedUntil ? ` until ${account.suspendedUntil}` : ''}${account.statusReason ? `: ${account.statusReason}` : ''}`,
    }
  }
  return {allowed: true}
}

export function isAccountSuspendedOrBanned(account) {
  if (!account) return false
  if (account.status === 'banned') return true
  if (account.status === 'suspended') {
    if (account.suspendedUntil) {
      const untilMs = Date.parse(account.suspendedUntil)
      if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
        return false
      }
    }
    return true
  }
  return false
}

export function isActorMutedByViewer(db, viewerDid, targetDid) {
  if (!viewerDid || !targetDid) return false
  if (db?._store) return db._store.isMuted(viewerDid, targetDid)
  const list = db?.mutes?.[viewerDid]
  return Array.isArray(list) && list.includes(targetDid)
}

export function findViewerBlockUri(db, viewerDid, subjectDid, getCollectionMap) {
  if (!viewerDid || !subjectDid) return undefined
  if (db?._store) return db._store.findBlockUri(viewerDid, subjectDid)
  const blocks = getCollectionMap(db, viewerDid, 'app.bsky.graph.block')
  for (const rec of Object.values(blocks)) {
    if (rec?.value?.subject === subjectDid) {
      return rec.uri
    }
  }
  return undefined
}

export function isPostHiddenForViewer(db, postRec, viewerDid, getCollectionMap) {
  if (!postRec || !postRec.uri) return true
  if (db?._store) {
    if (db._store.isPostTakenDown(postRec.uri)) return true
    const author = db._store.getAccountByDid(postRec.repo)
    if (!author) return true
    if (isAccountSuspendedOrBanned(author)) return true
    if (viewerDid && viewerDid !== postRec.repo) {
      if (db._store.isMuted(viewerDid, postRec.repo)) return true
      if (db._store.findBlockUri(viewerDid, postRec.repo)) return true
      if (db._store.findBlockUri(postRec.repo, viewerDid)) return true
      if (
        typeof db._store.isAuthorInViewerMutedOrBlockedList === 'function' &&
        db._store.isAuthorInViewerMutedOrBlockedList(viewerDid, postRec.repo)
      ) {
        return true
      }
    }
    return false
  }
  if (db?.takedowns?.posts?.[postRec.uri]) return true
  const author = db?.accounts?.[postRec.repo]
  if (!author) return true
  if (isAccountSuspendedOrBanned(author)) return true
  if (viewerDid && viewerDid !== postRec.repo) {
    if (isActorMutedByViewer(db, viewerDid, postRec.repo)) return true
    if (findViewerBlockUri(db, viewerDid, postRec.repo, getCollectionMap)) {
      return true
    }
    if (findViewerBlockUri(db, postRec.repo, viewerDid, getCollectionMap)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Audit Log & Label Helpers
// ---------------------------------------------------------------------------

export function recordAudit(
  db,
  auth,
  action,
  target,
  details = {},
  req = null,
) {
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : []
  const ip = req ? getClientIp(req) : details?.ip || '127.0.0.1'
  const cleanDetails =
    details && typeof details === 'object' ? {...details, ip} : {ip}
  const entry = {
    id: `aud_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    actorDid: auth?.did || 'system',
    actorHandle: auth?.account?.handle || 'system',
    actorRole: auth?.account ? normalizeRole(auth.account.role) : 'system',
    ip,
    action: String(action || ''),
    target: String(target || ''),
    details: cleanDetails,
  }
  db.auditLog.push(entry)
  if (db.auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    db.auditLog = db.auditLog.slice(-MAX_AUDIT_LOG_ENTRIES)
  }
  return entry
}

function addLabel(db, subjectKey, val) {
  const cleanVal = String(val || '').trim()
  if (!subjectKey || !cleanVal) return []
  db.labels = db.labels || {}
  const list = Array.isArray(db.labels[subjectKey]) ? db.labels[subjectKey] : []
  if (!list.some(l => l.val === cleanVal)) {
    list.push({
      val: cleanVal,
      src: MOD_LABELER_DID,
      uri: subjectKey,
      cts: new Date().toISOString(),
    })
  }
  db.labels[subjectKey] = list
  return list
}

function removeLabel(db, subjectKey, val) {
  if (!subjectKey || !db.labels?.[subjectKey]) return []
  const cleanVal = String(val || '').trim()
  if (!cleanVal) {
    delete db.labels[subjectKey]
    return []
  }
  const next = db.labels[subjectKey].filter(l => l.val !== cleanVal)
  if (next.length === 0) {
    delete db.labels[subjectKey]
  } else {
    db.labels[subjectKey] = next
  }
  return next
}

// ---------------------------------------------------------------------------
// Admin View Formatters
// ---------------------------------------------------------------------------

function formatReportView(db, r, origin, helpers) {
  const reporterAcc = r.reporterDid ? db.accounts[r.reporterDid] : null
  const subjectDid =
    r.subjectDid || (r.subjectUri ? helpers.parseAtUri(r.subjectUri)?.repo : null)
  const subjectAcc = subjectDid ? db.accounts[subjectDid] : null
  const postRec = r.subjectUri
    ? helpers.findLocalPostByUri(db, r.subjectUri)
    : null

  return {
    id: r.id,
    createdAt: r.createdAt,
    status: r.status || 'open',
    reasonType: r.reasonType || 'com.atproto.moderation.defs#reasonOther',
    reason: r.reason || '',
    subjectType: r.subjectType || (r.subjectUri ? 'post' : 'account'),
    subjectUri: r.subjectUri || null,
    subjectDid: subjectDid || null,
    claimedByDid: r.claimedByDid || null,
    claimedByHandle: r.claimedByHandle || null,
    claimedAt: r.claimedAt || null,
    pendingApprovalId: r.pendingApprovalId || null,
    resolutionAction: r.resolutionAction || null,
    resolutionNote: r.resolutionNote || null,
    resolvedBy: r.resolvedBy || null,
    resolvedAt: r.resolvedAt || null,
    reporter: reporterAcc
      ? {
          did: reporterAcc.did,
          handle: reporterAcc.handle,
          displayName:
            reporterAcc.profile?.displayName ||
            reporterAcc.handle.split('.')[0],
          avatar:
            helpers.blobUrl(origin, reporterAcc.did, reporterAcc.profile?.avatar) ||
            null,
        }
      : {
          did: r.reporterDid || '',
          handle: 'unknown',
          displayName: 'Unknown',
          avatar: null,
        },
    subjectAccount: subjectAcc
      ? {
          did: subjectAcc.did,
          handle: subjectAcc.handle,
          displayName:
            subjectAcc.profile?.displayName || subjectAcc.handle.split('.')[0],
          avatar:
            helpers.blobUrl(origin, subjectAcc.did, subjectAcc.profile?.avatar) ||
            null,
          role: normalizeRole(subjectAcc.role),
          status: subjectAcc.status || 'active',
          verified: Boolean(subjectAcc.verified),
          isOfficial: Boolean(subjectAcc.isOfficial),
          isProtected: isProtectedAccount(subjectAcc),
        }
      : null,
    subjectPost: postRec
      ? {
          uri: postRec.uri,
          text: String(postRec.value?.text || ''),
          authorHandle: db.accounts[postRec.repo]?.handle || postRec.repo,
          createdAt: postRec.value?.createdAt || postRec.indexedAt || '',
          takenDown: Boolean(db.takedowns?.posts?.[postRec.uri]),
          labels: (db.labels?.[postRec.uri] || []).map(l => l.val),
        }
      : r.subjectUri
        ? {
            uri: r.subjectUri,
            text: '[Post deleted or unavailable]',
            authorHandle: subjectAcc?.handle || subjectDid || 'unknown',
            createdAt: '',
            takenDown: Boolean(db.takedowns?.posts?.[r.subjectUri]),
            labels: (db.labels?.[r.subjectUri] || []).map(l => l.val),
          }
        : null,
  }
}

function formatAppealView(db, a) {
  const acc = db.accounts[a.appellantDid]
  return {
    ...a,
    claimedByDid: a.claimedByDid || null,
    claimedByHandle: a.claimedByHandle || null,
    claimedAt: a.claimedAt || null,
    appellantStatus: acc?.status || 'active',
    appellantDisplayName:
      acc?.profile?.displayName ||
      a.appellantHandle?.split('.')[0] ||
      a.appellantDid,
  }
}

function formatAdminUser(db, acc, origin, followersCount, helpers, viewerRole) {
  return {
    did: acc.did,
    handle: acc.handle,
    displayName: acc.profile?.displayName || acc.handle.split('.')[0],
    email: maskEmailForRole(acc.email || '', viewerRole),
    avatar: helpers.blobUrl(origin, acc.did, acc.profile?.avatar) || null,
    role: normalizeRole(acc.role),
    department: acc.department || '',
    status: acc.status || 'active',
    statusReason: acc.statusReason || '',
    suspendedUntil: acc.suspendedUntil || null,
    verified: Boolean(acc.verified),
    isOfficial: Boolean(acc.isOfficial),
    isProtected: isProtectedAccount(acc),
    warningsCount: Array.isArray(acc.warnings) ? acc.warnings.length : 0,
    postsCount: Object.keys(
      helpers.getCollectionMap(db, acc.did, 'app.bsky.feed.post'),
    ).length,
    followersCount,
    createdAt: acc.createdAt || '',
  }
}

function buildDailySeries(isoDates, days = 14) {
  const counts = new Map()
  const now = new Date()
  const keys = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    )
    const key = d.toISOString().slice(0, 10)
    keys.push(key)
    counts.set(key, 0)
  }
  for (const iso of isoDates) {
    if (!iso || typeof iso !== 'string') continue
    const dayKey = iso.slice(0, 10)
    if (counts.has(dayKey)) {
      counts.set(dayKey, counts.get(dayKey) + 1)
    }
  }
  return keys.map(date => ({date, count: counts.get(date) || 0}))
}

// ---------------------------------------------------------------------------
// RBAC Authentication & Permission Enforcement
// ---------------------------------------------------------------------------

function requirePermission(req, res, db, helpers, perm = null) {
  const auth = helpers.getAuthedContext(req, db, {
    allowedScopes: ['com.atproto.access', 'quantzing.ops'],
  })
  if (auth.error) {
    helpers.sendXrpcError(
      req,
      res,
      auth.status || 401,
      auth.error,
      auth.message || 'Authentication required',
    )
    return null
  }
  const enf = checkAccountEnforcement(db, auth.account, {
    saveDb: helpers.saveDb,
  })
  if (!enf.allowed) {
    helpers.sendXrpcError(req, res, enf.status, enf.error, enf.message)
    return null
  }
  const role = normalizeRole(auth.account.role)
  if (!isStaffRole(role)) {
    helpers.sendXrpcError(
      req,
      res,
      403,
      'Forbidden',
      'Authorized QuantZing staff account required',
    )
    return null
  }
  if (perm && !hasPermission(role, perm)) {
    helpers.sendXrpcError(
      req,
      res,
      403,
      'Forbidden',
      `Insufficient permissions: requires ${perm}`,
    )
    return null
  }
  auth.role = role
  auth.department = auth.account.department || defaultDepartmentForRole(role)
  auth.permissions = getPermissionsForRole(role)
  return auth
}

// ---------------------------------------------------------------------------
// Enforcement & Four-Eyes Dual Approval Primitives
// ---------------------------------------------------------------------------

function applyUserAccountSuspension(db, target, {reason, suspendHours, by}) {
  const hours =
    Number.isFinite(Number(suspendHours)) && Number(suspendHours) > 0
      ? Number(suspendHours)
      : 24
  const now = new Date().toISOString()
  const until = new Date(Date.now() + hours * 3600_000).toISOString()
  target.status = 'suspended'
  target.statusReason = reason || 'Suspended by moderation'
  target.suspendedUntil = until
  db.takedowns.accounts[target.did] = {
    did: target.did,
    status: 'suspended',
    reason: target.statusReason,
    suspendedUntil: until,
    by,
    createdAt: now,
  }
  return until
}

function applyUserAccountBan(db, target, {reason, by}) {
  const now = new Date().toISOString()
  target.status = 'banned'
  target.statusReason = reason || 'Banned by moderation'
  target.suspendedUntil = null
  db.takedowns.accounts[target.did] = {
    did: target.did,
    status: 'banned',
    reason: target.statusReason,
    by,
    createdAt: now,
  }
}

function applyUserAccountWarn(target, {reason, by, generateTid}) {
  const now = new Date().toISOString()
  target.warnings = Array.isArray(target.warnings) ? target.warnings : []
  target.warnings.push({
    id: generateTid(),
    reason: reason || 'Policy warning',
    by,
    createdAt: now,
  })
  if ((target.status || 'active') === 'active') {
    target.status = 'warned'
  }
  target.statusReason = reason || 'Policy warning'
}

function queueFourEyesApproval(
  req,
  res,
  db,
  auth,
  helpers,
  {action, target, reason, suspendHours = null, report = null},
) {
  const now = new Date().toISOString()
  const normalizedHours =
    action === 'suspend'
      ? Number.isFinite(Number(suspendHours)) && Number(suspendHours) > 0
        ? Number(suspendHours)
        : 24
      : null

  db.pendingApprovals = Array.isArray(db.pendingApprovals)
    ? db.pendingApprovals
    : []

  const approval = {
    id: `apr_${helpers.generateTid()}`,
    createdAt: now,
    status: 'pending',
    action,
    targetDid: target.did,
    targetHandle: target.handle,
    targetDisplayName:
      target.profile?.displayName || target.handle.split('.')[0],
    targetVerified: Boolean(target.verified),
    requestedByDid: auth.did,
    requestedByHandle: auth.account.handle,
    requestedByRole: auth.role,
    reason:
      reason ||
      (action === 'ban'
        ? 'High-profile ban request'
        : 'High-profile suspension request'),
    suspendHours: normalizedHours,
    reportId: report ? report.id : null,
    reviewedByDid: null,
    reviewedByHandle: null,
    reviewedAt: null,
    reviewNote: null,
  }

  db.pendingApprovals.push(approval)
  if (report) {
    report.pendingApprovalId = approval.id
  }

  recordAudit(
    db,
    auth,
    'approval.requested',
    approval.id,
    {
      action,
      targetDid: target.did,
      targetHandle: target.handle,
      targetVerified: Boolean(target.verified),
      reason: approval.reason,
      suspendHours: normalizedHours,
      reportId: approval.reportId,
    },
    req,
  )

  helpers.saveDb(db)
  helpers.sendJson(req, res, 202, {
    ok: true,
    pendingApproval: true,
    message:
      'High-profile account action queued for Super-Admin Four-Eyes approval',
    approval,
  })
}

// ---------------------------------------------------------------------------
// Enterprise Employee Ops, Admin & Appeals REST API Router
// Handles /api/quantzing/admin/*, /api/quantzing/ops/*, and /api/quantzing/appeals
// ---------------------------------------------------------------------------

export async function handleQuantZingAdmin(req, res, ctx) {
  const {db, pathname, searchParams, method, origin, helpers} = ctx

  const isAdminRoute =
    pathname === '/api/quantzing/admin' ||
    pathname.startsWith('/api/quantzing/admin/')
  const isOpsRoute =
    pathname === '/api/quantzing/ops' ||
    pathname.startsWith('/api/quantzing/ops/')
  const isAppealsRoute = pathname === '/api/quantzing/appeals'
  const isSettingsRoute =
    pathname === '/ops/api/settings' ||
    pathname.startsWith('/ops/api/settings/')

  if (!isAdminRoute && !isOpsRoute && !isAppealsRoute && !isSettingsRoute) {
    return false
  }

  try {
    // -----------------------------------------------------------------------
    // User-facing POST /api/quantzing/appeals (Allowed on ALL hosts!)
    // -----------------------------------------------------------------------
    if (isAppealsRoute) {
      if (method !== 'POST') {
        helpers.sendXrpcError(
          req,
          res,
          405,
          'MethodNotAllowed',
          'Use POST to submit an appeal',
        )
        return true
      }

      const body = await helpers.readJsonBody(req)
      let appellant = null

      const bearerAuth = helpers.getAuthedContext(req, db)
      if (!bearerAuth.error && bearerAuth.account) {
        appellant = bearerAuth.account
      } else if (body.identifier && typeof body.password === 'string') {
        const candidate = helpers.findLocalAccount(db, String(body.identifier))
        if (
          candidate &&
          (await helpers.verifyPassword(
            body.password,
            candidate.passwordSalt,
            candidate.passwordHash,
          ))
        ) {
          appellant = candidate
        }
      }

      if (!appellant) {
        helpers.sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Valid session token or account credentials are required to submit an appeal',
        )
        return true
      }

      const type = body.type ? String(body.type) : 'account'
      if (type !== 'account' && type !== 'post') {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'Appeal type must be "account" or "post"',
        )
        return true
      }

      const message = String(body.message || '').trim()
      if (!message) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'Appeal message is required',
        )
        return true
      }

      const subjectUri = body.subjectUri ? String(body.subjectUri).trim() : null
      if (type === 'post' && !subjectUri) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'subjectUri is required for post appeals',
        )
        return true
      }

      const appeal = {
        id: `apl_${helpers.generateTid()}`,
        createdAt: new Date().toISOString(),
        appellantDid: appellant.did,
        appellantHandle: appellant.handle,
        type,
        subjectUri,
        message: message.slice(0, 4000),
        status: 'open',
        claimedByDid: null,
        claimedByHandle: null,
        claimedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
      }
      db.appeals.push(appeal)
      helpers.saveDb(db)
      helpers.sendJson(req, res, 201, {ok: true, appeal})
      return true
    }

    // -----------------------------------------------------------------------
    // Host-Based Isolation Guard: /api/quantzing/admin/* & /api/quantzing/ops/*
    // MUST return 404 on public consumer hosts so internal APIs are invisible
    // -----------------------------------------------------------------------
    if (!isOpsRequestHost(req)) {
      helpers.sendXrpcError(req, res, 404, 'NotFound', 'Not found')
      return true
    }

    // -----------------------------------------------------------------------
    // Platform Settings Router: AI, Anti-Bot & Trends
    // Supports /ops/api/settings/*, /api/quantzing/admin/settings/*, /api/quantzing/ops/settings/*
    // -----------------------------------------------------------------------
    let settingsSubpath = null
    if (
      pathname === '/ops/api/settings' ||
      pathname === '/api/quantzing/admin/settings' ||
      pathname === '/api/quantzing/ops/settings'
    ) {
      settingsSubpath = '/'
    } else if (pathname.startsWith('/ops/api/settings/')) {
      settingsSubpath = pathname.slice('/ops/api/settings'.length)
    } else if (pathname.startsWith('/api/quantzing/admin/settings/')) {
      settingsSubpath = pathname.slice('/api/quantzing/admin/settings'.length)
    } else if (pathname.startsWith('/api/quantzing/ops/settings/')) {
      settingsSubpath = pathname.slice('/api/quantzing/ops/settings'.length)
    }

    if (settingsSubpath !== null) {
      const dataDir = helpers.getDataDir()

      // 1. AI & Quanty Settings
      if (settingsSubpath === '/ai') {
        if (method === 'GET') {
          const auth = requirePermission(req, res, db, helpers, 'ai.read')
          if (!auth) return true
          const settings = loadPlatformSettings(dataDir)
          const sanitized = sanitizeAiSettings(settings.ai)
          helpers.sendJson(req, res, 200, {ok: true, settings: sanitized, ...sanitized})
          return true
        }

        if (method === 'PATCH') {
          const auth = requirePermission(req, res, db, helpers, 'ai.manage')
          if (!auth) return true
          const body = await helpers.readJsonBody(req)
          if (!body || typeof body !== 'object') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'Request body must be a JSON object')
            return true
          }

          if (body.provider !== undefined) {
            const validProviders = ['cloudflare-workers-ai', 'omniroute', 'hybrid', 'deterministic']
            if (!validProviders.includes(String(body.provider))) {
              helpers.sendXrpcError(
                req,
                res,
                400,
                'InvalidRequest',
                `provider must be one of: ${validProviders.join(', ')}`,
              )
              return true
            }
          }
          if (body.cfAccountId !== undefined && typeof body.cfAccountId !== 'string') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'cfAccountId must be a string')
            return true
          }
          if (body.cfApiToken !== undefined && typeof body.cfApiToken !== 'string' && body.cfApiToken !== null) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'cfApiToken must be a string or null')
            return true
          }
          if (body.cfPrimaryModel !== undefined && (!body.cfPrimaryModel || typeof body.cfPrimaryModel !== 'string')) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'cfPrimaryModel must be a non-empty string')
            return true
          }
          if (body.cfFastModel !== undefined && (!body.cfFastModel || typeof body.cfFastModel !== 'string')) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'cfFastModel must be a non-empty string')
            return true
          }
          if (body.dailyNeuronBudget !== undefined) {
            const val = Number(body.dailyNeuronBudget)
            if (!Number.isFinite(val) || val < 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'dailyNeuronBudget must be a non-negative number')
              return true
            }
          }
          if (body.temperature !== undefined) {
            const val = Number(body.temperature)
            if (!Number.isFinite(val) || val < 0 || val > 2) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'temperature must be a number between 0 and 2')
              return true
            }
          }
          if (body.maxTokens !== undefined) {
            const val = Number(body.maxTokens)
            if (!Number.isInteger(val) || val < 1 || val > 131072) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'maxTokens must be an integer between 1 and 131072')
              return true
            }
          }
          if (body.enableWebGrounding !== undefined && typeof body.enableWebGrounding !== 'boolean') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'enableWebGrounding must be a boolean')
            return true
          }
          if (body.systemPromptAddon !== undefined && typeof body.systemPromptAddon !== 'string') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'systemPromptAddon must be a string')
            return true
          }

          const settings = loadPlatformSettings(dataDir)
          const ai = settings.ai

          if (body.provider !== undefined) ai.provider = String(body.provider)
          if (body.cfAccountId !== undefined) ai.cfAccountId = String(body.cfAccountId).trim()

          let tokenUpdated = false
          if (body.cfApiToken !== undefined) {
            if (body.cfApiToken === null || body.cfApiToken === '') {
              ai.cfApiToken = ''
              tokenUpdated = true
            } else {
              const str = String(body.cfApiToken).trim()
              if (!str.startsWith('••••') && !str.startsWith('****')) {
                ai.cfApiToken = str
                tokenUpdated = true
              }
            }
          }

          if (body.cfPrimaryModel !== undefined) ai.cfPrimaryModel = String(body.cfPrimaryModel).trim()
          if (body.cfFastModel !== undefined) ai.cfFastModel = String(body.cfFastModel).trim()
          if (body.dailyNeuronBudget !== undefined) ai.dailyNeuronBudget = Number(body.dailyNeuronBudget)
          if (body.temperature !== undefined) ai.temperature = Number(body.temperature)
          if (body.maxTokens !== undefined) ai.maxTokens = Number(body.maxTokens)
          if (body.enableWebGrounding !== undefined) ai.enableWebGrounding = Boolean(body.enableWebGrounding)
          if (body.systemPromptAddon !== undefined) ai.systemPromptAddon = String(body.systemPromptAddon)

          savePlatformSettings(dataDir, settings)

          // Admin Audit Log: NEVER log raw cfApiToken!
          const auditDetails = {
            provider: ai.provider,
            cfAccountId: ai.cfAccountId,
            hasCfApiToken: Boolean(ai.cfApiToken),
            tokenUpdated,
            cfPrimaryModel: ai.cfPrimaryModel,
            cfFastModel: ai.cfFastModel,
            dailyNeuronBudget: ai.dailyNeuronBudget,
            temperature: ai.temperature,
            maxTokens: ai.maxTokens,
            enableWebGrounding: ai.enableWebGrounding,
            updatedKeys: Object.keys(body).filter(k => k !== 'cfApiToken'),
          }

          recordAudit(db, auth, 'settings.ai_update', 'settings/ai', auditDetails, req)
          helpers.saveDb(db)

          const sanitized = sanitizeAiSettings(ai)
          helpers.sendJson(req, res, 200, {ok: true, settings: sanitized, ...sanitized})
          return true
        }

        helpers.sendXrpcError(req, res, 405, 'MethodNotAllowed', 'Use GET or PATCH for /settings/ai')
        return true
      }

      // 2. Anti-Bot & Scale Settings
      if (settingsSubpath === '/antibot') {
        if (method === 'GET') {
          const auth = requirePermission(req, res, db, helpers, 'antibot.read')
          if (!auth) return true
          const settings = loadPlatformSettings(dataDir)
          helpers.sendJson(req, res, 200, {ok: true, settings: settings.antibot, ...settings.antibot})
          return true
        }

        if (method === 'PATCH') {
          const auth = requirePermission(req, res, db, helpers, 'antibot.manage')
          if (!auth) return true
          const body = await helpers.readJsonBody(req)
          if (!body || typeof body !== 'object') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'Request body must be a JSON object')
            return true
          }

          if (body.maxPostsPerMinute !== undefined) {
            const val = Number(body.maxPostsPerMinute)
            if (!Number.isInteger(val) || val <= 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'maxPostsPerMinute must be a positive integer')
              return true
            }
          }
          if (body.maxLikesPerMinute !== undefined) {
            const val = Number(body.maxLikesPerMinute)
            if (!Number.isInteger(val) || val <= 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'maxLikesPerMinute must be a positive integer')
              return true
            }
          }
          if (body.maxViewsPerMinutePerIp !== undefined) {
            const val = Number(body.maxViewsPerMinutePerIp)
            if (!Number.isInteger(val) || val <= 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'maxViewsPerMinutePerIp must be a positive integer')
              return true
            }
          }
          if (body.maxSignupsPerHourPerIp !== undefined) {
            const val = Number(body.maxSignupsPerHourPerIp)
            if (!Number.isInteger(val) || val <= 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'maxSignupsPerHourPerIp must be a positive integer')
              return true
            }
          }
          if (body.autoShadowThrottle !== undefined && typeof body.autoShadowThrottle !== 'boolean') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'autoShadowThrottle must be a boolean')
            return true
          }
          if (body.requireEmailVerifyForLinks !== undefined && typeof body.requireEmailVerifyForLinks !== 'boolean') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'requireEmailVerifyForLinks must be a boolean')
            return true
          }
          if (body.blockedIps !== undefined && !Array.isArray(body.blockedIps)) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'blockedIps must be an array of strings')
            return true
          }
          if (body.blockedDomains !== undefined && !Array.isArray(body.blockedDomains)) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'blockedDomains must be an array of strings')
            return true
          }

          const settings = loadPlatformSettings(dataDir)
          const ab = settings.antibot

          if (body.maxPostsPerMinute !== undefined) ab.maxPostsPerMinute = Number(body.maxPostsPerMinute)
          if (body.maxLikesPerMinute !== undefined) ab.maxLikesPerMinute = Number(body.maxLikesPerMinute)
          if (body.maxViewsPerMinutePerIp !== undefined) ab.maxViewsPerMinutePerIp = Number(body.maxViewsPerMinutePerIp)
          if (body.maxSignupsPerHourPerIp !== undefined) ab.maxSignupsPerHourPerIp = Number(body.maxSignupsPerHourPerIp)
          if (body.autoShadowThrottle !== undefined) ab.autoShadowThrottle = Boolean(body.autoShadowThrottle)
          if (body.requireEmailVerifyForLinks !== undefined) ab.requireEmailVerifyForLinks = Boolean(body.requireEmailVerifyForLinks)
          if (body.blockedIps !== undefined) {
            ab.blockedIps = Array.from(new Set(body.blockedIps.map(ip => String(ip).trim()).filter(Boolean)))
          }
          if (body.blockedDomains !== undefined) {
            ab.blockedDomains = Array.from(new Set(body.blockedDomains.map(d => String(d).trim().toLowerCase()).filter(Boolean)))
          }

          savePlatformSettings(dataDir, settings)

          recordAudit(
            db,
            auth,
            'settings.antibot_update',
            'settings/antibot',
            {
              updatedKeys: Object.keys(body),
              maxPostsPerMinute: ab.maxPostsPerMinute,
              maxLikesPerMinute: ab.maxLikesPerMinute,
              maxViewsPerMinutePerIp: ab.maxViewsPerMinutePerIp,
              maxSignupsPerHourPerIp: ab.maxSignupsPerHourPerIp,
              autoShadowThrottle: ab.autoShadowThrottle,
              requireEmailVerifyForLinks: ab.requireEmailVerifyForLinks,
              blockedIpsCount: ab.blockedIps.length,
              blockedDomainsCount: ab.blockedDomains.length,
            },
            req,
          )
          helpers.saveDb(db)

          helpers.sendJson(req, res, 200, {ok: true, settings: ab, ...ab})
          return true
        }

        helpers.sendXrpcError(req, res, 405, 'MethodNotAllowed', 'Use GET or PATCH for /settings/antibot')
        return true
      }

      // 3. Trends & Reels Settings
      if (settingsSubpath === '/trends') {
        if (method === 'GET') {
          const auth = requirePermission(req, res, db, helpers, 'trends.read')
          if (!auth) return true
          const settings = loadPlatformSettings(dataDir)
          helpers.sendJson(req, res, 200, {ok: true, settings: settings.trends, ...settings.trends})
          return true
        }

        if (method === 'PATCH') {
          const auth = requirePermission(req, res, db, helpers, 'trends.manage')
          if (!auth) return true
          const body = await helpers.readJsonBody(req)
          if (!body || typeof body !== 'object') {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'Request body must be a JSON object')
            return true
          }

          if (body.pinnedTrends !== undefined && !Array.isArray(body.pinnedTrends)) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'pinnedTrends must be an array of strings')
            return true
          }
          if (body.mutedTrends !== undefined && !Array.isArray(body.mutedTrends)) {
            helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'mutedTrends must be an array of strings')
            return true
          }
          if (body.reelsFreshnessGravity !== undefined) {
            const val = Number(body.reelsFreshnessGravity)
            if (!Number.isFinite(val) || val <= 0) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'reelsFreshnessGravity must be a positive number')
              return true
            }
          }
          if (body.reelsDiversityWindow !== undefined) {
            const val = Number(body.reelsDiversityWindow)
            if (!Number.isInteger(val) || val < 1) {
              helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'reelsDiversityWindow must be an integer >= 1')
              return true
            }
          }

          const settings = loadPlatformSettings(dataDir)
          const tr = settings.trends

          if (body.pinnedTrends !== undefined) {
            tr.pinnedTrends = Array.from(new Set(body.pinnedTrends.map(t => String(t).trim()).filter(Boolean)))
          }
          if (body.mutedTrends !== undefined) {
            tr.mutedTrends = Array.from(new Set(body.mutedTrends.map(t => String(t).trim()).filter(Boolean)))
          }
          if (body.reelsFreshnessGravity !== undefined) tr.reelsFreshnessGravity = Number(body.reelsFreshnessGravity)
          if (body.reelsDiversityWindow !== undefined) tr.reelsDiversityWindow = Number(body.reelsDiversityWindow)

          savePlatformSettings(dataDir, settings)

          recordAudit(
            db,
            auth,
            'settings.trends_update',
            'settings/trends',
            {
              updatedKeys: Object.keys(body),
              pinnedTrendsCount: tr.pinnedTrends.length,
              mutedTrendsCount: tr.mutedTrends.length,
              reelsFreshnessGravity: tr.reelsFreshnessGravity,
              reelsDiversityWindow: tr.reelsDiversityWindow,
            },
            req,
          )
          helpers.saveDb(db)

          helpers.sendJson(req, res, 200, {ok: true, settings: tr, ...tr})
          return true
        }

        helpers.sendXrpcError(req, res, 405, 'MethodNotAllowed', 'Use GET or PATCH for /settings/trends')
        return true
      }

      // 4. Combined Settings
      if (settingsSubpath === '/' || settingsSubpath === '') {
        if (method !== 'GET') {
          helpers.sendXrpcError(req, res, 405, 'MethodNotAllowed', 'Use GET for /settings')
          return true
        }
        const auth = requirePermission(req, res, db, helpers, null)
        if (!auth) return true
        const settings = loadPlatformSettings(dataDir)
        helpers.sendJson(req, res, 200, {
          ok: true,
          ai: hasPermission(auth.role, 'ai.read') ? sanitizeAiSettings(settings.ai) : null,
          antibot: hasPermission(auth.role, 'antibot.read') ? settings.antibot : null,
          trends: hasPermission(auth.role, 'trends.read') ? settings.trends : null,
        })
        return true
      }

      helpers.sendXrpcError(req, res, 404, 'NotFound', `Unknown settings endpoint: ${pathname}`)
      return true
    }

    // -----------------------------------------------------------------------
    // OPS-1. POST /api/quantzing/ops/login (Dedicated 8h Staff Session Login)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/ops/login' && method === 'POST') {
      if (
        enforceRateLimit(req, res, {
          bucketKey: `login:${getClientIp(req)}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_LOGIN_MAX) || 40,
          windowMs: 15 * 60 * 1000,
          auth: null,
          sendJson: helpers.sendJson,
        })
      ) {
        return true
      }

      const body = await helpers.readJsonBody(req)
      const identifier = String(body.identifier || '').trim()
      const password = typeof body.password === 'string' ? body.password : ''

      if (!identifier || !password) {
        helpers.sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Invalid identifier or password',
        )
        return true
      }

      const account = helpers.findLocalAccount(db, identifier)
      if (
        !account ||
        !(await helpers.verifyPassword(
          password,
          account.passwordSalt,
          account.passwordHash,
        ))
      ) {
        helpers.sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Invalid identifier or password',
        )
        return true
      }

      const enf = checkAccountEnforcement(db, account, {saveDb: helpers.saveDb})
      if (!enf.allowed) {
        helpers.sendXrpcError(req, res, enf.status, enf.error, enf.message)
        return true
      }

      const role = normalizeRole(account.role)
      if (!isStaffRole(role)) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Authorized QuantZing staff account required',
        )
        return true
      }

      const nowMs = Date.now()
      const nowIso = new Date(nowMs).toISOString()
      const expiresAt = new Date(
        nowMs + OPS_SESSION_TTL_SECONDS * 1000,
      ).toISOString()
      const accessJwt = helpers.signJwt(db, {
        did: account.did,
        scope: 'quantzing.ops',
        ttlSeconds: OPS_SESSION_TTL_SECONDS,
        tv: Number(account.tokenVersion) || 1,
      })

      account.lastOpsLoginAt = nowIso
      const department = account.department || defaultDepartmentForRole(role)
      const cfAccessEmail =
        String(req.headers['cf-access-authenticated-user-email'] || '').trim() ||
        null

      recordAudit(
        db,
        {did: account.did, account},
        'staff.login',
        account.did,
        {
          role,
          department,
          cfAccessEmail,
          expiresAt,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        accessJwt,
        expiresAt,
        staff: {
          did: account.did,
          handle: account.handle,
          displayName:
            account.profile?.displayName || account.handle.split('.')[0],
          email: account.email || '',
          role,
          department,
          permissions: getPermissionsForRole(role),
          cfAccessEmail,
        },
      })
      return true
    }

    // -----------------------------------------------------------------------
    // OPS-2. GET /api/quantzing/ops/invite-info?token=... (Ops-host, unauthed)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/ops/invite-info' && method === 'GET') {
      const token = String(searchParams.get('token') || '').trim()
      if (!token) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Invite not found')
        return true
      }

      const tokenHash = hashInviteToken(token)
      const invite = (db.staffInvites || []).find(inv =>
        inv?.tokenHash
          ? safeTokenEquals(inv.tokenHash, tokenHash)
          : inv?.token
            ? safeTokenEquals(inv.token, token)
            : false,
      )
      if (!invite) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Invite not found')
        return true
      }

      if (invite.status === 'accepted') {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteUsed',
          'This staff invite has already been accepted',
        )
        return true
      }
      if (invite.status === 'revoked') {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteRevoked',
          'This staff invite has been revoked',
        )
        return true
      }
      if (Date.parse(invite.expiresAt) <= Date.now()) {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteExpired',
          'This staff invite has expired',
        )
        return true
      }

      helpers.sendJson(req, res, 200, {
        ok: true,
        invite: {
          email: invite.email,
          role: invite.role,
          department: invite.department,
          expiresAt: invite.expiresAt,
          createdByHandle: invite.createdByHandle,
        },
      })
      return true
    }

    // -----------------------------------------------------------------------
    // OPS-3. POST /api/quantzing/ops/accept-invite (Ops-host, unauthed)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/ops/accept-invite' && method === 'POST') {
      if (
        enforceRateLimit(req, res, {
          bucketKey: `signup:${getClientIp(req)}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_SIGNUP_MAX) || 20,
          windowMs: 15 * 60 * 1000,
          auth: null,
          sendJson: helpers.sendJson,
        })
      ) {
        return true
      }

      const body = await helpers.readJsonBody(req)
      const token = String(body.token || '').trim()
      if (!token) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Invite not found')
        return true
      }

      const tokenHash = hashInviteToken(token)
      const invite = (db.staffInvites || []).find(inv =>
        inv?.tokenHash
          ? safeTokenEquals(inv.tokenHash, tokenHash)
          : inv?.token
            ? safeTokenEquals(inv.token, token)
            : false,
      )
      if (!invite) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Invite not found')
        return true
      }
      if (invite.status === 'accepted') {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteUsed',
          'This staff invite has already been accepted',
        )
        return true
      }
      if (invite.status === 'revoked') {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteRevoked',
          'This staff invite has been revoked',
        )
        return true
      }
      if (Date.parse(invite.expiresAt) <= Date.now()) {
        helpers.sendXrpcError(
          req,
          res,
          410,
          'InviteExpired',
          'This staff invite has expired',
        )
        return true
      }

      const handle = helpers.normalizeHandle(body.handle)
      if (!helpers.isValidHandleFormat(handle)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidHandle',
          'Invalid handle format (use lowercase letters, numbers, and hyphens)',
        )
        return true
      }

      const password = typeof body.password === 'string' ? body.password : ''
      if (password.length < 8) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidPassword',
          'Staff password must be at least 8 characters',
        )
        return true
      }

      const inviteEmailLower = String(invite.email || '').trim().toLowerCase()
      for (const acc of Object.values(db.accounts || {})) {
        if (acc.handle?.toLowerCase() === handle) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'HandleNotAvailable',
            'That handle is already taken on QuantZing',
          )
          return true
        }
        if (
          inviteEmailLower &&
          acc.email &&
          acc.email.toLowerCase() === inviteEmailLower
        ) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'An account with that email already exists',
          )
          return true
        }
      }

      const did = helpers.createPlcDid()
      const {salt, hash} = await helpers.hashPassword(password)
      const nowMs = Date.now()
      const nowIso = new Date(nowMs).toISOString()
      const expiresAt = new Date(
        nowMs + OPS_SESSION_TTL_SECONDS * 1000,
      ).toISOString()
      const role = normalizeRole(invite.role)
      const department = invite.department || defaultDepartmentForRole(role)
      const displayName =
        String(body.displayName || '').trim().slice(0, 64) ||
        handle.split('.')[0]
      const description = `${ROLE_META[role]?.label || role} — QuantZing ${department}`

      const account = {
        did,
        handle,
        email: inviteEmailLower,
        emailConfirmed: true,
        emailAuthFactor: false,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: nowIso,
        active: true,
        role,
        department,
        tokenVersion: 1,
        offboardedAt: null,
        lastOpsLoginAt: nowIso,
        status: 'active',
        statusReason: '',
        suspendedUntil: null,
        warnings: [],
        verified: false,
        profile: {
          displayName,
          description,
          avatar: null,
          banner: null,
          createdAt: nowIso,
        },
        preferences: helpers.createDefaultPreferences(),
        notificationPreferences: helpers.createDefaultNotificationPreferences(),
      }

      db.accounts[did] = account
      if (typeof helpers.putLocalRecord === 'function') {
        helpers.putLocalRecord(db, did, 'app.bsky.actor.profile', 'self', {
          $type: 'app.bsky.actor.profile',
          displayName,
          description,
          createdAt: nowIso,
        })
      }

      invite.status = 'accepted'
      invite.acceptedByDid = did
      invite.acceptedAt = nowIso

      const accessJwt = helpers.signJwt(db, {
        did,
        scope: 'quantzing.ops',
        ttlSeconds: OPS_SESSION_TTL_SECONDS,
        tv: 1,
      })

      recordAudit(
        db,
        {did, account},
        'staff.onboard',
        did,
        {
          inviteId: invite.id,
          handle,
          role,
          department,
          invitedBy: invite.createdByHandle,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 201, {
        ok: true,
        accessJwt,
        expiresAt,
        staff: {
          did,
          handle,
          displayName,
          email: account.email,
          role,
          department,
          permissions: getPermissionsForRole(role),
        },
      })
      return true
    }

    // Unknown /api/quantzing/ops/* route
    if (isOpsRoute) {
      helpers.sendXrpcError(
        req,
        res,
        404,
        'NotFound',
        `Unknown ops endpoint: ${method} ${pathname}`,
      )
      return true
    }

    // -----------------------------------------------------------------------
    // 1. GET /api/quantzing/admin/me
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/me' && method === 'GET') {
      const cfAccessEmail =
        String(req.headers['cf-access-authenticated-user-email'] || '').trim() ||
        null
      const auth = helpers.getAuthedContext(req, db, {
        allowedScopes: ['com.atproto.access', 'quantzing.ops'],
      })
      if (auth.error) {
        if (
          auth.error === 'InvalidToken' &&
          auth.message === 'Session has been revoked'
        ) {
          helpers.sendXrpcError(
            req,
            res,
            401,
            'InvalidToken',
            'Session has been revoked',
          )
          return true
        }
        helpers.sendJson(req, res, 200, {
          ok: true,
          isAdmin: false,
          isStaff: false,
          role: 'guest',
          department: null,
          permissions: [],
          did: null,
          handle: null,
          displayName: null,
          cfAccessEmail,
        })
        return true
      }

      const role = normalizeRole(auth.account.role)
      const isAdmin = role === 'super_admin'
      const isStaff = isStaffRole(role)
      helpers.sendJson(req, res, 200, {
        ok: true,
        isAdmin,
        isStaff,
        role,
        department: auth.account.department || defaultDepartmentForRole(role),
        permissions: getPermissionsForRole(role),
        did: auth.did,
        handle: auth.account.handle,
        displayName:
          auth.account.profile?.displayName ||
          auth.account.handle.split('.')[0],
        cfAccessEmail,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 2. GET /api/quantzing/admin/overview (requires overview.read)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/overview' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'overview.read')
      if (!auth) return true

      let restoredAny = false
      const accounts = Object.values(db.accounts || {})
      let activeUsers = 0
      let verifiedUsers = 0
      let suspendedUsers = 0
      let bannedUsers = 0
      let staffUsers = 0
      const signupDates = []

      for (const acc of accounts) {
        if (acc.status === 'suspended' && acc.suspendedUntil) {
          const untilMs = Date.parse(acc.suspendedUntil)
          if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
            acc.status = 'active'
            acc.suspendedUntil = null
            acc.statusReason = ''
            delete db.takedowns.accounts[acc.did]
            restoredAny = true
          }
        }
        const status = acc.status || 'active'
        if (status === 'suspended') suspendedUsers++
        else if (status === 'banned') bannedUsers++
        else activeUsers++

        if (acc.verified === true) verifiedUsers++
        if (isStaffRole(acc.role)) staffUsers++
        if (acc.createdAt) signupDates.push(acc.createdAt)
      }
      if (restoredAny) helpers.saveDb(db)

      const allPosts = helpers.getAllLocalRecords(db, 'app.bsky.feed.post')
      let totalReplies = 0
      const postDates = []
      for (const p of allPosts) {
        if (p?.value?.reply) totalReplies++
        const dt = p?.value?.createdAt || p?.indexedAt
        if (dt) postDates.push(dt)
      }

      const totalLikes = helpers.getAllLocalRecords(
        db,
        'app.bsky.feed.like',
      ).length
      const totalReposts = helpers.getAllLocalRecords(
        db,
        'app.bsky.feed.repost',
      ).length

      const blobValues = Object.values(db.blobs || {})
      let totalBlobBytes = 0
      for (const b of blobValues) {
        totalBlobBytes += Number(b?.size || 0)
      }

      const convoValues = Object.values(db.convos || {})
      let totalMessages = 0
      for (const c of convoValues) {
        if (Array.isArray(c?.messages)) totalMessages += c.messages.length
      }

      const reports = Array.isArray(db.reports) ? db.reports : []
      const openReports = reports.filter(r => r.status === 'open').length
      const unclaimedReports = reports.filter(
        r => r.status === 'open' && !r.claimedByDid,
      ).length
      const appeals = Array.isArray(db.appeals) ? db.appeals : []
      const openAppeals = appeals.filter(a => a.status === 'open').length
      const approvals = Array.isArray(db.pendingApprovals)
        ? db.pendingApprovals
        : []
      const pendingApprovals = approvals.filter(
        a => a.status === 'pending',
      ).length
      const takenDownPosts = Object.keys(db.takedowns?.posts || {}).length

      let activeLabels = 0
      for (const list of Object.values(db.labels || {})) {
        if (Array.isArray(list)) activeLabels += list.length
      }

      const dbPath = helpers.getDbPath()
      let dbSizeBytes = 0
      try {
        if (fs.existsSync(dbPath)) {
          dbSizeBytes = fs.statSync(dbPath).size
        }
      } catch {}

      helpers.sendJson(req, res, 200, {
        ok: true,
        metrics: {
          totalUsers: accounts.length,
          activeUsers,
          verifiedUsers,
          suspendedUsers,
          bannedUsers,
          staffUsers,
          totalPosts: allPosts.length,
          totalReplies,
          totalLikes,
          totalReposts,
          totalBlobs: blobValues.length,
          totalBlobBytes,
          totalConvos: convoValues.length,
          totalMessages,
          openReports,
          unclaimedReports,
          totalReports: reports.length,
          openAppeals,
          pendingApprovals,
          takenDownPosts,
          activeLabels,
        },
        series: {
          signupsByDay: buildDailySeries(signupDates, 14),
          postsByDay: buildDailySeries(postDates, 14),
        },
        rateLimit: getRateLimitStats(),
        system: {
          uptimeSec: Math.floor(process.uptime()),
          memoryMb:
            Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
          dbSizeBytes,
          nodeVersion: process.version,
          dataDir: helpers.getDataDir(),
        },
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 3. GET /api/quantzing/admin/reports?status=...&claimed=mine|unclaimed|all
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/reports' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'reports.read')
      if (!auth) return true

      const statusFilter = (searchParams.get('status') || 'all').toLowerCase()
      const claimedFilter = (searchParams.get('claimed') || 'all').toLowerCase()

      const reports = (db.reports || [])
        .filter(r => {
          if (statusFilter !== 'all' && r.status !== statusFilter) return false
          if (claimedFilter === 'mine' && r.claimedByDid !== auth.did) {
            return false
          }
          if (claimedFilter === 'unclaimed' && r.claimedByDid) {
            return false
          }
          return true
        })
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .map(r => formatReportView(db, r, origin, helpers))

      helpers.sendJson(req, res, 200, {ok: true, reports})
      return true
    }

    // -----------------------------------------------------------------------
    // 3b. POST /api/quantzing/admin/reports/claim-next (requires reports.claim)
    // -----------------------------------------------------------------------
    if (
      pathname === '/api/quantzing/admin/reports/claim-next' &&
      method === 'POST'
    ) {
      const auth = requirePermission(req, res, db, helpers, 'reports.claim')
      if (!auth) return true

      const candidates = (db.reports || [])
        .filter(r => (r.status || 'open') === 'open' && !r.claimedByDid)
        .slice()
        .sort((a, b) =>
          String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
        )

      const nextReport = candidates[0] || null
      if (!nextReport) {
        helpers.sendJson(req, res, 200, {
          ok: true,
          report: null,
          message: 'No unclaimed open reports',
        })
        return true
      }

      nextReport.claimedByDid = auth.did
      nextReport.claimedByHandle = auth.account.handle
      nextReport.claimedAt = new Date().toISOString()

      recordAudit(
        db,
        auth,
        'report.claim',
        String(nextReport.id),
        {
          mode: 'claim-next',
          subjectUri: nextReport.subjectUri || null,
          subjectDid: nextReport.subjectDid || null,
        },
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        report: formatReportView(db, nextReport, origin, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 3c. POST /api/quantzing/admin/reports/:id/claim (requires reports.claim)
    // -----------------------------------------------------------------------
    const reportClaimMatch = pathname.match(
      /^\/api\/quantzing\/admin\/reports\/([^/]+)\/claim$/,
    )
    if (reportClaimMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'reports.claim')
      if (!auth) return true

      const reportId = decodeURIComponent(reportClaimMatch[1])
      const report = (db.reports || []).find(
        r => String(r.id) === String(reportId),
      )
      if (!report) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Report not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const force = body.force === true

      if (report.claimedByDid && report.claimedByDid !== auth.did) {
        if (!(auth.role === 'super_admin' && force)) {
          helpers.sendXrpcError(
            req,
            res,
            409,
            'AlreadyClaimed',
            `Ticket already claimed by @${report.claimedByHandle || report.claimedByDid}`,
          )
          return true
        }
      }

      const previousOwner = report.claimedByHandle || null
      report.claimedByDid = auth.did
      report.claimedByHandle = auth.account.handle
      report.claimedAt = new Date().toISOString()

      recordAudit(
        db,
        auth,
        'report.claim',
        String(report.id),
        {
          forced: Boolean(
            force && previousOwner && previousOwner !== auth.account.handle,
          ),
          previousOwner:
            previousOwner && previousOwner !== auth.account.handle
              ? previousOwner
              : undefined,
        },
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        report: formatReportView(db, report, origin, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 3d. POST /api/quantzing/admin/reports/:id/release (requires reports.claim)
    // -----------------------------------------------------------------------
    const reportReleaseMatch = pathname.match(
      /^\/api\/quantzing\/admin\/reports\/([^/]+)\/release$/,
    )
    if (reportReleaseMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'reports.claim')
      if (!auth) return true

      const reportId = decodeURIComponent(reportReleaseMatch[1])
      const report = (db.reports || []).find(
        r => String(r.id) === String(reportId),
      )
      if (!report) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Report not found')
        return true
      }

      if (
        report.claimedByDid &&
        report.claimedByDid !== auth.did &&
        auth.role !== 'super_admin'
      ) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Only the ticket assignee or a Super Admin can release this ticket',
        )
        return true
      }

      const previousOwner = report.claimedByHandle || null
      report.claimedByDid = null
      report.claimedByHandle = null
      report.claimedAt = null

      recordAudit(
        db,
        auth,
        'report.release',
        String(report.id),
        {previousOwner: previousOwner || undefined},
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        report: formatReportView(db, report, origin, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 4. POST /api/quantzing/admin/reports/:id/resolve (Action-scoped RBAC + Four-Eyes)
    // -----------------------------------------------------------------------
    const reportResolveMatch = pathname.match(
      /^\/api\/quantzing\/admin\/reports\/([^/]+)\/resolve$/,
    )
    if (reportResolveMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, null)
      if (!auth) return true

      const body = await helpers.readJsonBody(req)
      const action = String(body.action || '').trim()
      const actionPermissionMap = {
        dismiss: 'reports.label',
        label: 'reports.label',
        takedown_post: 'reports.takedown',
        warn_user: 'reports.enforce',
        suspend_user: 'reports.enforce',
        ban_user: 'reports.enforce',
      }

      const requiredPerm = actionPermissionMap[action]
      if (!requiredPerm) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid action "${action}". Expected one of: ${Object.keys(actionPermissionMap).join(', ')}`,
        )
        return true
      }

      if (!hasPermission(auth.role, requiredPerm)) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          `Insufficient permissions for "${action}": requires ${requiredPerm}`,
        )
        return true
      }

      const reportId = decodeURIComponent(reportResolveMatch[1])
      const report = (db.reports || []).find(
        r => String(r.id) === String(reportId),
      )
      if (!report) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Report not found')
        return true
      }

      const note = String(body.note || '').trim()
      const now = new Date().toISOString()
      const targetDid =
        report.subjectDid ||
        (report.subjectUri ? helpers.parseAtUri(report.subjectUri)?.repo : null)
      const targetAcc = targetDid ? db.accounts[targetDid] : null

      if (
        (action === 'suspend_user' || action === 'ban_user') &&
        targetDid === auth.did
      ) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'Cannot suspend or ban your own account',
        )
        return true
      }

      if (
        (action === 'suspend_user' || action === 'ban_user') &&
        targetDid === FOUNDER_DID
      ) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Cannot suspend or ban the sovereign founder admin account',
        )
        return true
      }

      if (
        action === 'warn_user' &&
        auth.role !== 'super_admin' &&
        normalizeRole(targetAcc?.role) === 'super_admin'
      ) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Cannot warn a Super Admin account',
        )
        return true
      }

      if (action === 'dismiss') {
        report.status = 'dismissed'
      } else if (action === 'label') {
        const subjectKey = report.subjectUri || targetDid
        if (!subjectKey) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Report has no labelable subject',
          )
          return true
        }
        const labelVal = String(body.labelVal || 'warn').trim() || 'warn'
        addLabel(db, subjectKey, labelVal)
        report.status = 'resolved'
      } else if (action === 'takedown_post') {
        if (!report.subjectUri) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Report does not reference a post URI',
          )
          return true
        }
        db.takedowns.posts[report.subjectUri] = {
          uri: report.subjectUri,
          reason: note || report.reason || 'Removed by moderation',
          by: auth.account.handle,
          createdAt: now,
        }
        report.status = 'resolved'
      } else if (action === 'warn_user') {
        if (!targetAcc) {
          helpers.sendXrpcError(
            req,
            res,
            404,
            'NotFound',
            'Subject account not found',
          )
          return true
        }
        applyUserAccountWarn(targetAcc, {
          reason: note || report.reason || 'Policy warning',
          by: auth.account.handle,
          generateTid: helpers.generateTid,
        })
        report.status = 'resolved'
      } else if (action === 'suspend_user') {
        if (!targetAcc) {
          helpers.sendXrpcError(
            req,
            res,
            404,
            'NotFound',
            'Subject account not found',
          )
          return true
        }
        // Four-Eyes Dual Approval Rule for protected accounts
        if (auth.role !== 'super_admin' && isProtectedAccount(targetAcc)) {
          queueFourEyesApproval(req, res, db, auth, helpers, {
            action: 'suspend',
            target: targetAcc,
            reason: note || report.reason || 'Suspended by moderation',
            suspendHours: body.suspendHours,
            report,
          })
          return true
        }
        applyUserAccountSuspension(db, targetAcc, {
          reason: note || report.reason || 'Suspended by moderation',
          suspendHours: body.suspendHours,
          by: auth.account.handle,
        })
        report.status = 'resolved'
      } else if (action === 'ban_user') {
        if (!targetAcc) {
          helpers.sendXrpcError(
            req,
            res,
            404,
            'NotFound',
            'Subject account not found',
          )
          return true
        }
        // Four-Eyes Dual Approval Rule for protected accounts
        if (auth.role !== 'super_admin' && isProtectedAccount(targetAcc)) {
          queueFourEyesApproval(req, res, db, auth, helpers, {
            action: 'ban',
            target: targetAcc,
            reason: note || report.reason || 'Banned by moderation',
            report,
          })
          return true
        }
        applyUserAccountBan(db, targetAcc, {
          reason: note || report.reason || 'Banned by moderation',
          by: auth.account.handle,
        })
        report.status = 'resolved'
      }

      report.resolutionAction = action
      report.resolutionNote = note
      report.resolvedBy = auth.account.handle
      report.resolvedByDid = auth.did
      report.resolvedAt = now

      recordAudit(
        db,
        auth,
        'report.resolve',
        String(report.id),
        {
          action,
          note,
          subjectUri: report.subjectUri || null,
          subjectDid: targetDid || null,
          labelVal: body.labelVal || undefined,
          suspendHours: body.suspendHours || undefined,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        report: formatReportView(db, report, origin, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 5. GET /api/quantzing/admin/approvals?status=pending|approved|rejected|all
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/approvals' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'approvals.read')
      if (!auth) return true

      const statusFilter = (searchParams.get('status') || 'all').toLowerCase()
      const approvals = (db.pendingApprovals || [])
        .filter(a => statusFilter === 'all' || a.status === statusFilter)
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )

      helpers.sendJson(req, res, 200, {ok: true, approvals})
      return true
    }

    // -----------------------------------------------------------------------
    // 5b. POST /api/quantzing/admin/approvals/:id/review (Super-Admin ONLY)
    // -----------------------------------------------------------------------
    const approvalReviewMatch = pathname.match(
      /^\/api\/quantzing\/admin\/approvals\/([^/]+)\/review$/,
    )
    if (approvalReviewMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'approvals.review')
      if (!auth) return true

      const approvalId = decodeURIComponent(approvalReviewMatch[1])
      const approval = (db.pendingApprovals || []).find(
        a => String(a.id) === String(approvalId),
      )
      if (!approval) {
        helpers.sendXrpcError(
          req,
          res,
          404,
          'NotFound',
          'Approval request not found',
        )
        return true
      }

      if (approval.status !== 'pending') {
        helpers.sendXrpcError(
          req,
          res,
          409,
          'AlreadyReviewed',
          `Approval request has already been ${approval.status}`,
        )
        return true
      }

      const body = await helpers.readJsonBody(req)
      const decision = String(body.decision || '').trim()
      if (decision !== 'approve' && decision !== 'reject') {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'decision must be "approve" or "reject"',
        )
        return true
      }

      // Enforce strict Four-Eyes invariant
      if (approval.requestedByDid === auth.did) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'FourEyesViolation',
          'Requester cannot approve their own high-risk action',
        )
        return true
      }

      const note = String(body.note || '').trim()
      const now = new Date().toISOString()

      if (decision === 'approve') {
        const target = db.accounts[approval.targetDid]
        if (!target) {
          helpers.sendXrpcError(
            req,
            res,
            404,
            'NotFound',
            'Target account not found',
          )
          return true
        }
        if (target.did === FOUNDER_DID) {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot enforce against the sovereign founder admin account',
          )
          return true
        }

        const actingBy = `${approval.requestedByHandle} (approved by ${auth.account.handle})`
        if (approval.action === 'ban') {
          applyUserAccountBan(db, target, {
            reason: approval.reason,
            by: actingBy,
          })
        } else {
          applyUserAccountSuspension(db, target, {
            reason: approval.reason,
            suspendHours: approval.suspendHours,
            by: actingBy,
          })
        }

        approval.status = 'approved'
        approval.reviewedByDid = auth.did
        approval.reviewedByHandle = auth.account.handle
        approval.reviewedAt = now
        approval.reviewNote = note || null

        if (approval.reportId !== null && approval.reportId !== undefined) {
          const linkedReport = (db.reports || []).find(
            r => String(r.id) === String(approval.reportId),
          )
          if (linkedReport) {
            linkedReport.status = 'resolved'
            linkedReport.resolutionAction =
              approval.action === 'ban' ? 'ban_user' : 'suspend_user'
            linkedReport.resolutionNote = note
              ? `${approval.reason} [Approved by @${auth.account.handle}: ${note}]`
              : approval.reason
            linkedReport.resolvedBy = auth.account.handle
            linkedReport.resolvedByDid = auth.did
            linkedReport.resolvedAt = now
            linkedReport.pendingApprovalId = null
          }
        }

        recordAudit(
          db,
          auth,
          'approval.approve',
          approval.id,
          {
            action: approval.action,
            targetDid: approval.targetDid,
            targetHandle: approval.targetHandle,
            requestedByHandle: approval.requestedByHandle,
            reportId: approval.reportId || null,
            note: note || undefined,
          },
          req,
        )

        helpers.saveDb(db)
        helpers.sendJson(req, res, 200, {
          ok: true,
          approval,
          executed: true,
        })
        return true
      }

      // decision === 'reject'
      approval.status = 'rejected'
      approval.reviewedByDid = auth.did
      approval.reviewedByHandle = auth.account.handle
      approval.reviewedAt = now
      approval.reviewNote = note || null

      if (approval.reportId !== null && approval.reportId !== undefined) {
        const linkedReport = (db.reports || []).find(
          r => String(r.id) === String(approval.reportId),
        )
        if (linkedReport && linkedReport.pendingApprovalId === approval.id) {
          linkedReport.pendingApprovalId = null
        }
      }

      recordAudit(
        db,
        auth,
        'approval.reject',
        approval.id,
        {
          action: approval.action,
          targetDid: approval.targetDid,
          targetHandle: approval.targetHandle,
          requestedByHandle: approval.requestedByHandle,
          reportId: approval.reportId || null,
          note: note || undefined,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        approval,
        executed: false,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 6. GET /api/quantzing/admin/users?q=&filter=all|verified|suspended|banned|staff
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/users' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'users.read')
      if (!auth) return true

      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const filter = (searchParams.get('filter') || 'all').toLowerCase()
      const canSearchRawEmail = hasPermission(auth.role, 'users.pii_full')

      const followersCountByDid = new Map()
      for (const rec of helpers.getAllLocalRecords(db, 'app.bsky.graph.follow')) {
        const sub = rec?.value?.subject
        if (sub) {
          followersCountByDid.set(sub, (followersCountByDid.get(sub) || 0) + 1)
        }
      }

      let restoredAny = false
      const users = []

      for (const acc of Object.values(db.accounts || {})) {
        if (acc.status === 'suspended' && acc.suspendedUntil) {
          const untilMs = Date.parse(acc.suspendedUntil)
          if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
            acc.status = 'active'
            acc.suspendedUntil = null
            acc.statusReason = ''
            delete db.takedowns.accounts[acc.did]
            restoredAny = true
          }
        }

        if (filter === 'verified' && acc.verified !== true) continue
        if (filter === 'suspended' && acc.status !== 'suspended') continue
        if (filter === 'banned' && acc.status !== 'banned') continue
        if (filter === 'staff' && !isStaffRole(acc.role)) continue

        if (q) {
          const handle = String(acc.handle || '').toLowerCase()
          const dn = String(acc.profile?.displayName || '').toLowerCase()
          const did = String(acc.did || '').toLowerCase()
          const email = canSearchRawEmail
            ? String(acc.email || '').toLowerCase()
            : ''
          if (
            !handle.includes(q) &&
            !dn.includes(q) &&
            !did.includes(q) &&
            !(canSearchRawEmail && email.includes(q))
          ) {
            continue
          }
        }

        users.push(
          formatAdminUser(
            db,
            acc,
            origin,
            followersCountByDid.get(acc.did) || 0,
            helpers,
            auth.role,
          ),
        )
      }

      if (restoredAny) helpers.saveDb(db)

      users.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      )

      helpers.sendJson(req, res, 200, {ok: true, users})
      return true
    }

    // -----------------------------------------------------------------------
    // 6b. POST /api/quantzing/admin/users/:did/inspect (Mandatory Reason-Logged)
    // -----------------------------------------------------------------------
    const userInspectMatch = pathname.match(
      /^\/api\/quantzing\/admin\/users\/([^/]+)\/inspect$/,
    )
    if (userInspectMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'users.inspect')
      if (!auth) return true

      const targetRef = decodeURIComponent(userInspectMatch[1])
      const target =
        db.accounts[targetRef] || helpers.findLocalAccount(db, targetRef)
      if (!target) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'User not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const ticketId = String(body.ticketId || '').trim()
      const reason = String(body.reason || '').trim()
      if (ticketId.length < 3 || reason.length < 3) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'Both ticketId and reason (minimum 3 characters each) are required to inspect an account',
        )
        return true
      }

      recordAudit(
        db,
        auth,
        'user.inspect',
        target.did,
        {
          ticketId,
          reason,
          ip: getClientIp(req),
          targetHandle: target.handle,
        },
        req,
      )
      helpers.saveDb(db)

      const recentReportsAgainst = (db.reports || [])
        .filter(r => {
          const subjectDid =
            r.subjectDid ||
            (r.subjectUri ? helpers.parseAtUri(r.subjectUri)?.repo : null)
          return subjectDid === target.did
        })
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .slice(0, 10)
        .map(r => ({
          id: r.id,
          createdAt: r.createdAt,
          status: r.status || 'open',
          reasonType: r.reasonType || 'com.atproto.moderation.defs#reasonOther',
          reason: r.reason || '',
          subjectType: r.subjectType || (r.subjectUri ? 'post' : 'account'),
          subjectUri: r.subjectUri || null,
          resolutionAction: r.resolutionAction || null,
          resolvedBy: r.resolvedBy || null,
          resolvedAt: r.resolvedAt || null,
        }))

      const recentAppeals = (db.appeals || [])
        .filter(a => a.appellantDid === target.did)
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .slice(0, 10)
        .map(a => formatAppealView(db, a))

      const postsCount = Object.keys(
        helpers.getCollectionMap(db, target.did, 'app.bsky.feed.post'),
      ).length
      const followingCount = Object.keys(
        helpers.getCollectionMap(db, target.did, 'app.bsky.graph.follow'),
      ).length
      let followersCount = 0
      for (const rec of helpers.getAllLocalRecords(db, 'app.bsky.graph.follow')) {
        if (rec?.value?.subject === target.did) followersCount++
      }

      helpers.sendJson(req, res, 200, {
        ok: true,
        inspection: {
          did: target.did,
          handle: target.handle,
          displayName:
            target.profile?.displayName || target.handle.split('.')[0],
          email: maskEmailForRole(target.email || '', auth.role),
          role: normalizeRole(target.role),
          department: target.department || '',
          status: target.status || 'active',
          statusReason: target.statusReason || '',
          suspendedUntil: target.suspendedUntil || null,
          verified: Boolean(target.verified),
          createdAt: target.createdAt || '',
          warnings: Array.isArray(target.warnings) ? target.warnings : [],
          recentReportsAgainst,
          recentAppeals,
          postsCount,
          followersCount,
          followingCount,
          dmAccessNote:
            'Private DMs are strictly inaccessible to staff unless explicitly reported.',
        },
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 6c. POST /api/quantzing/admin/users/:did/action (Action-scoped RBAC + Four-Eyes)
    // -----------------------------------------------------------------------
    const userActionMatch = pathname.match(
      /^\/api\/quantzing\/admin\/users\/([^/]+)\/action$/,
    )
    if (userActionMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, null)
      if (!auth) return true

      const body = await helpers.readJsonBody(req)
      const action = String(body.action || '').trim()
      const actionPermissionMap = {
        verify: 'users.verify',
        unverify: 'users.verify',
        warn: 'users.enforce',
        suspend: 'users.enforce',
        ban: 'users.enforce',
        restore: 'users.enforce',
        set_role: 'staff.manage',
      }

      const requiredPerm = actionPermissionMap[action]
      if (!requiredPerm) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid user action "${action}"`,
        )
        return true
      }

      if (!hasPermission(auth.role, requiredPerm)) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          `Insufficient permissions for "${action}": requires ${requiredPerm}`,
        )
        return true
      }

      const targetRef = decodeURIComponent(userActionMatch[1])
      const target =
        db.accounts[targetRef] || helpers.findLocalAccount(db, targetRef)
      if (!target) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'User not found')
        return true
      }

      const reason = String(body.reason || '').trim()

      if (action === 'set_role') {
        const rawNextRole = String(body.role || '')
          .trim()
          .toLowerCase()
        if (!VALID_ROLE_INPUTS.has(rawNextRole)) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'role must be one of: user, l1_moderator, l2_trust_safety, verification_ops, support_agent, ai_ops, anti_bot_ops, growth_ops, super_admin',
          )
          return true
        }
        const nextRole = VALID_ROLE_INPUTS.get(rawNextRole)
        if (target.did === auth.did && nextRole !== 'super_admin') {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Cannot demote your own super_admin role',
          )
          return true
        }
        if (target.did === FOUNDER_DID && nextRole !== 'super_admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot demote the sovereign founder admin account',
          )
          return true
        }
        const previousRole = normalizeRole(target.role)
        target.role = nextRole
        const requestedDept = String(body.department || '').trim()
        target.department = requestedDept || defaultDepartmentForRole(nextRole)
        if (nextRole === 'user' && isStaffRole(previousRole)) {
          target.tokenVersion = (Number(target.tokenVersion) || 1) + 1
          target.offboardedAt = new Date().toISOString()
        }
      } else if (action === 'verify') {
        target.verified = true
        target.staffVerified = true
      } else if (action === 'unverify') {
        target.verified = false
        target.staffVerified = false
      } else if (action === 'warn') {
        if (
          auth.role !== 'super_admin' &&
          normalizeRole(target.role) === 'super_admin'
        ) {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot warn a Super Admin account',
          )
          return true
        }
        applyUserAccountWarn(target, {
          reason: reason || 'Policy warning',
          by: auth.account.handle,
          generateTid: helpers.generateTid,
        })
      } else if (action === 'suspend') {
        if (target.did === auth.did) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Cannot suspend your own account',
          )
          return true
        }
        if (target.did === FOUNDER_DID) {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot suspend the sovereign founder admin account',
          )
          return true
        }
        // Four-Eyes Dual Approval Rule for protected accounts
        if (auth.role !== 'super_admin' && isProtectedAccount(target)) {
          queueFourEyesApproval(req, res, db, auth, helpers, {
            action: 'suspend',
            target,
            reason: reason || 'Suspended by Trust & Safety',
            suspendHours: body.suspendHours,
          })
          return true
        }
        applyUserAccountSuspension(db, target, {
          reason: reason || 'Suspended by administrator',
          suspendHours: body.suspendHours,
          by: auth.account.handle,
        })
      } else if (action === 'ban') {
        if (target.did === auth.did) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Cannot ban your own account',
          )
          return true
        }
        if (target.did === FOUNDER_DID) {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot ban the sovereign founder admin account',
          )
          return true
        }
        // Four-Eyes Dual Approval Rule for protected accounts
        if (auth.role !== 'super_admin' && isProtectedAccount(target)) {
          queueFourEyesApproval(req, res, db, auth, helpers, {
            action: 'ban',
            target,
            reason: reason || 'Banned by Trust & Safety',
          })
          return true
        }
        applyUserAccountBan(db, target, {
          reason: reason || 'Banned by administrator',
          by: auth.account.handle,
        })
      } else if (action === 'restore') {
        target.status = 'active'
        target.statusReason = ''
        target.suspendedUntil = null
        delete db.takedowns.accounts[target.did]
      }

      recordAudit(
        db,
        auth,
        `user.${action}`,
        target.did,
        {
          handle: target.handle,
          reason: reason || undefined,
          suspendHours: body.suspendHours || undefined,
          role: action === 'set_role' ? target.role : undefined,
          department: action === 'set_role' ? target.department : undefined,
        },
        req,
      )

      helpers.saveDb(db)

      let followersCount = 0
      for (const rec of helpers.getAllLocalRecords(db, 'app.bsky.graph.follow')) {
        if (rec?.value?.subject === target.did) followersCount++
      }

      helpers.sendJson(req, res, 200, {
        ok: true,
        user: formatAdminUser(
          db,
          target,
          origin,
          followersCount,
          helpers,
          auth.role,
        ),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 7. GET /api/quantzing/admin/posts (requires posts.read)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/posts' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'posts.read')
      if (!auth) return true

      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const filter = (searchParams.get('filter') || 'all').toLowerCase()

      const allPosts = helpers.getAllLocalRecords(db, 'app.bsky.feed.post')
      const posts = []

      for (const rec of allPosts) {
        const td = db.takedowns?.posts?.[rec.uri]
        const takenDown = Boolean(td)
        const takedownReason = td?.reason || ''
        const labels = (db.labels?.[rec.uri] || []).map(l => l.val)

        if (filter === 'active' && takenDown) continue
        if (filter === 'removed' && !takenDown) continue
        if (filter === 'labeled' && labels.length === 0) continue

        const author = db.accounts[rec.repo]
        const authorHandle = author?.handle || rec.repo
        const authorDisplayName =
          author?.profile?.displayName || authorHandle.split('.')[0]
        const text = String(rec.value?.text || '')

        if (q) {
          const hit =
            text.toLowerCase().includes(q) ||
            authorHandle.toLowerCase().includes(q) ||
            authorDisplayName.toLowerCase().includes(q) ||
            rec.uri.toLowerCase().includes(q)
          if (!hit) continue
        }

        const counts = helpers.countLocalInteractions(db, rec.uri)
        posts.push({
          uri: rec.uri,
          cid: rec.cid,
          text,
          createdAt: rec.value?.createdAt || rec.indexedAt || '',
          authorDid: rec.repo,
          authorHandle,
          authorDisplayName,
          authorVerified: Boolean(author?.verified),
          likeCount: counts.likeCount,
          replyCount: counts.replyCount,
          repostCount: counts.repostCount,
          hasMedia: Boolean(rec.value?.embed),
          takenDown,
          takedownReason,
          labels,
        })
      }

      posts.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      )

      helpers.sendJson(req, res, 200, {ok: true, posts})
      return true
    }

    // -----------------------------------------------------------------------
    // 8. POST /api/quantzing/admin/posts/action (requires posts.moderate)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/posts/action' && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'posts.moderate')
      if (!auth) return true

      const body = await helpers.readJsonBody(req)
      const uri = String(body.uri || '').trim()
      const action = String(body.action || '').trim()
      const reason = String(body.reason || '').trim()
      const labelVal = String(body.labelVal || '').trim()

      if (!uri) {
        helpers.sendXrpcError(req, res, 400, 'InvalidRequest', 'uri is required')
        return true
      }

      const validActions = new Set(['takedown', 'restore', 'label', 'unlabel'])
      if (!validActions.has(action)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid post action "${action}"`,
        )
        return true
      }

      if (action === 'takedown') {
        db.takedowns.posts[uri] = {
          uri,
          reason: reason || 'Removed by moderation',
          by: auth.account.handle,
          createdAt: new Date().toISOString(),
        }
      } else if (action === 'restore') {
        delete db.takedowns.posts[uri]
      } else if (action === 'label') {
        if (!labelVal) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'labelVal is required for label action',
          )
          return true
        }
        addLabel(db, uri, labelVal)
      } else if (action === 'unlabel') {
        removeLabel(db, uri, labelVal)
      }

      recordAudit(
        db,
        auth,
        `post.${action}`,
        uri,
        {
          reason: reason || undefined,
          labelVal: labelVal || undefined,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        uri,
        takenDown: Boolean(db.takedowns.posts[uri]),
        labels: (db.labels?.[uri] || []).map(l => l.val),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 9. GET /api/quantzing/admin/appeals?status=...&claimed=mine|unclaimed|all
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/appeals' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'appeals.read')
      if (!auth) return true

      const statusFilter = (searchParams.get('status') || 'all').toLowerCase()
      const claimedFilter = (searchParams.get('claimed') || 'all').toLowerCase()

      const appeals = (db.appeals || [])
        .filter(a => {
          if (statusFilter !== 'all' && a.status !== statusFilter) return false
          if (claimedFilter === 'mine' && a.claimedByDid !== auth.did) {
            return false
          }
          if (claimedFilter === 'unclaimed' && a.claimedByDid) {
            return false
          }
          return true
        })
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .map(a => formatAppealView(db, a))

      helpers.sendJson(req, res, 200, {ok: true, appeals})
      return true
    }

    // -----------------------------------------------------------------------
    // 9b. POST /api/quantzing/admin/appeals/:id/claim (requires appeals.read)
    // -----------------------------------------------------------------------
    const appealClaimMatch = pathname.match(
      /^\/api\/quantzing\/admin\/appeals\/([^/]+)\/claim$/,
    )
    if (appealClaimMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'appeals.read')
      if (!auth) return true

      const appealId = decodeURIComponent(appealClaimMatch[1])
      const appeal = (db.appeals || []).find(
        a => String(a.id) === String(appealId),
      )
      if (!appeal) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Appeal not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const force = body.force === true

      if (appeal.claimedByDid && appeal.claimedByDid !== auth.did) {
        if (!(auth.role === 'super_admin' && force)) {
          helpers.sendXrpcError(
            req,
            res,
            409,
            'AlreadyClaimed',
            `Ticket already claimed by @${appeal.claimedByHandle || appeal.claimedByDid}`,
          )
          return true
        }
      }

      const previousOwner = appeal.claimedByHandle || null
      appeal.claimedByDid = auth.did
      appeal.claimedByHandle = auth.account.handle
      appeal.claimedAt = new Date().toISOString()

      recordAudit(
        db,
        auth,
        'appeal.claim',
        String(appeal.id),
        {
          forced: Boolean(
            force && previousOwner && previousOwner !== auth.account.handle,
          ),
          previousOwner:
            previousOwner && previousOwner !== auth.account.handle
              ? previousOwner
              : undefined,
        },
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        appeal: formatAppealView(db, appeal),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 9c. POST /api/quantzing/admin/appeals/:id/release (requires appeals.read)
    // -----------------------------------------------------------------------
    const appealReleaseMatch = pathname.match(
      /^\/api\/quantzing\/admin\/appeals\/([^/]+)\/release$/,
    )
    if (appealReleaseMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'appeals.read')
      if (!auth) return true

      const appealId = decodeURIComponent(appealReleaseMatch[1])
      const appeal = (db.appeals || []).find(
        a => String(a.id) === String(appealId),
      )
      if (!appeal) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Appeal not found')
        return true
      }

      if (
        appeal.claimedByDid &&
        appeal.claimedByDid !== auth.did &&
        auth.role !== 'super_admin'
      ) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Only the ticket assignee or a Super Admin can release this ticket',
        )
        return true
      }

      const previousOwner = appeal.claimedByHandle || null
      appeal.claimedByDid = null
      appeal.claimedByHandle = null
      appeal.claimedAt = null

      recordAudit(
        db,
        auth,
        'appeal.release',
        String(appeal.id),
        {previousOwner: previousOwner || undefined},
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        appeal: formatAppealView(db, appeal),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 9d. POST /api/quantzing/admin/appeals/:id/resolve (requires appeals.resolve)
    // -----------------------------------------------------------------------
    const appealResolveMatch = pathname.match(
      /^\/api\/quantzing\/admin\/appeals\/([^/]+)\/resolve$/,
    )
    if (appealResolveMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'appeals.resolve')
      if (!auth) return true

      const appealId = decodeURIComponent(appealResolveMatch[1])
      const appeal = (db.appeals || []).find(
        a => String(a.id) === String(appealId),
      )
      if (!appeal) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Appeal not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const decision = String(body.decision || '').trim()
      if (decision !== 'approve' && decision !== 'reject') {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'decision must be "approve" or "reject"',
        )
        return true
      }

      const note = String(body.note || '').trim()
      const now = new Date().toISOString()

      appeal.status = decision === 'approve' ? 'approved' : 'rejected'
      appeal.resolvedBy = auth.account.handle
      appeal.resolvedByDid = auth.did
      appeal.resolvedAt = now
      appeal.resolutionNote = note

      if (decision === 'approve') {
        if (appeal.type === 'post' && appeal.subjectUri) {
          delete db.takedowns.posts[appeal.subjectUri]
        } else {
          const targetAcc = db.accounts[appeal.appellantDid]
          if (targetAcc) {
            targetAcc.status = 'active'
            targetAcc.statusReason = ''
            targetAcc.suspendedUntil = null
            delete db.takedowns.accounts[targetAcc.did]
          }
        }
      }

      recordAudit(
        db,
        auth,
        `appeal.${decision}`,
        String(appeal.id),
        {
          type: appeal.type,
          appellantDid: appeal.appellantDid,
          subjectUri: appeal.subjectUri || null,
          note: note || undefined,
        },
        req,
      )

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        appeal: formatAppealView(db, appeal),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 10. Staff Team Management, Invite Onboarding & 1-Click Offboard
    // -----------------------------------------------------------------------

    // 10a. GET /api/quantzing/admin/staff (requires staff.read)
    if (pathname === '/api/quantzing/admin/staff' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'staff.read')
      if (!auth) return true

      const reports = Array.isArray(db.reports) ? db.reports : []
      const appeals = Array.isArray(db.appeals) ? db.appeals : []
      const auditEntries = Array.isArray(db.auditLog) ? db.auditLog : []

      const staff = []
      for (const acc of Object.values(db.accounts || {})) {
        const role = normalizeRole(acc.role)
        if (!isStaffRole(role)) continue

        let ticketsResolved = 0
        let openClaimed = 0
        for (const r of reports) {
          if (
            (r.status === 'resolved' || r.status === 'dismissed') &&
            (r.resolvedByDid === acc.did || r.resolvedBy === acc.handle)
          ) {
            ticketsResolved++
          }
          if ((r.status || 'open') === 'open' && r.claimedByDid === acc.did) {
            openClaimed++
          }
        }
        for (const a of appeals) {
          if (
            (a.status === 'approved' || a.status === 'rejected') &&
            (a.resolvedByDid === acc.did || a.resolvedBy === acc.handle)
          ) {
            ticketsResolved++
          }
          if ((a.status || 'open') === 'open' && a.claimedByDid === acc.did) {
            openClaimed++
          }
        }
        let totalAuditActions = 0
        for (const e of auditEntries) {
          if (e.actorDid === acc.did) totalAuditActions++
        }

        staff.push({
          did: acc.did,
          handle: acc.handle,
          displayName: acc.profile?.displayName || acc.handle.split('.')[0],
          email: acc.email || '',
          role,
          department: acc.department || defaultDepartmentForRole(role),
          status: acc.status || 'active',
          lastOpsLoginAt: acc.lastOpsLoginAt || null,
          createdAt: acc.createdAt || '',
          isFounder: acc.did === FOUNDER_DID,
          metrics: {
            ticketsResolved,
            openClaimed,
            totalAuditActions,
          },
        })
      }

      staff.sort((a, b) => {
        const rDiff =
          (ROLE_SORT_ORDER[a.role] ?? 99) - (ROLE_SORT_ORDER[b.role] ?? 99)
        if (rDiff !== 0) return rDiff
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      })

      const nowMs = Date.now()
      const invites = (db.staffInvites || [])
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .map(inv => {
          const isExpired =
            inv.status === 'pending' && Date.parse(inv.expiresAt) <= nowMs
          const invitePreview =
            inv.invitePreview ||
            (inv.token
              ? `${inv.token.slice(0, 6)}...${inv.token.slice(-4)}`
              : '')
          return {
            id: inv.id,
            email: inv.email,
            role: inv.role,
            department: inv.department,
            note: inv.note || '',
            createdByDid: inv.createdByDid,
            createdByHandle: inv.createdByHandle,
            createdAt: inv.createdAt,
            expiresAt: inv.expiresAt,
            status: isExpired ? 'expired' : inv.status,
            acceptedByDid: inv.acceptedByDid || null,
            acceptedAt: inv.acceptedAt || null,
            invitePreview,
          }
        })

      helpers.sendJson(req, res, 200, {
        ok: true,
        staff,
        invites,
        roles: ROLE_META,
      })
      return true
    }

    // 10b. POST /api/quantzing/admin/staff/invite (requires staff.manage)
    if (pathname === '/api/quantzing/admin/staff/invite' && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'staff.manage')
      if (!auth) return true

      const body = await helpers.readJsonBody(req)
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'A valid employee email address is required',
        )
        return true
      }

      const rawRole = String(body.role || '')
        .trim()
        .toLowerCase()
      const normalizedRole = VALID_ROLE_INPUTS.get(rawRole)
      if (!normalizedRole || !STAFF_ROLES.has(normalizedRole)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid staff role "${body.role || ''}". Must be one of: ${[...STAFF_ROLES].join(', ')}`,
        )
        return true
      }

      const department =
        String(body.department || '').trim() ||
        defaultDepartmentForRole(normalizedRole)
      const expiresHours =
        Number.isFinite(Number(body.expiresHours)) &&
        Number(body.expiresHours) > 0
          ? Math.min(720, Number(body.expiresHours))
          : 72
      const note = String(body.note || '')
        .trim()
        .slice(0, 500)

      const token = crypto.randomBytes(16).toString('hex')
      const tokenHash = hashInviteToken(token)
      const invitePreview = `${token.slice(0, 6)}...${token.slice(-4)}`
      const nowMs = Date.now()
      const inviteUrl = buildInviteUrl(req, origin, token)
      const invite = {
        id: `inv_${helpers.generateTid()}`,
        tokenHash,
        invitePreview,
        email,
        role: normalizedRole,
        department,
        note,
        createdByDid: auth.did,
        createdByHandle: auth.account.handle,
        createdAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + expiresHours * 3600_000).toISOString(),
        status: 'pending',
        acceptedByDid: null,
        acceptedAt: null,
      }

      db.staffInvites = Array.isArray(db.staffInvites) ? db.staffInvites : []
      db.staffInvites.push(invite)

      recordAudit(
        db,
        auth,
        'staff.invite',
        invite.id,
        {
          email,
          role: normalizedRole,
          department,
          expiresAt: invite.expiresAt,
        },
        req,
      )
      helpers.saveDb(db)

      helpers.sendJson(req, res, 201, {
        ok: true,
        invite: {
          ...invite,
          token,
          inviteUrl,
          invitePreview,
        },
        token,
        inviteUrl,
      })
      return true
    }

    // 10c. DELETE /api/quantzing/admin/staff/invites/:id (requires staff.manage)
    const inviteDeleteMatch = pathname.match(
      /^\/api\/quantzing\/admin\/staff\/invites\/([^/]+)$/,
    )
    if (inviteDeleteMatch && method === 'DELETE') {
      const auth = requirePermission(req, res, db, helpers, 'staff.manage')
      if (!auth) return true

      const inviteId = decodeURIComponent(inviteDeleteMatch[1])
      const invite = (db.staffInvites || []).find(
        inv => String(inv.id) === String(inviteId),
      )
      if (!invite) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Invite not found')
        return true
      }
      if (invite.status === 'accepted') {
        helpers.sendXrpcError(
          req,
          res,
          409,
          'AlreadyAccepted',
          'Invite has already been accepted',
        )
        return true
      }

      invite.status = 'revoked'
      invite.revokedAt = new Date().toISOString()
      invite.revokedByDid = auth.did
      invite.revokedByHandle = auth.account.handle

      recordAudit(
        db,
        auth,
        'staff.invite_revoke',
        invite.id,
        {
          email: invite.email,
          role: invite.role,
        },
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {ok: true})
      return true
    }

    // 10d. POST /api/quantzing/admin/staff/:did/offboard (1-Click Kill Switch)
    const staffOffboardMatch = pathname.match(
      /^\/api\/quantzing\/admin\/staff\/([^/]+)\/offboard$/,
    )
    if (staffOffboardMatch && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'staff.manage')
      if (!auth) return true

      const targetRef = decodeURIComponent(staffOffboardMatch[1])
      const target =
        db.accounts[targetRef] || helpers.findLocalAccount(db, targetRef)
      if (!target) {
        helpers.sendXrpcError(
          req,
          res,
          404,
          'NotFound',
          'Staff member not found',
        )
        return true
      }

      if (target.did === auth.did) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'Cannot offboard your own account',
        )
        return true
      }

      if (target.did === FOUNDER_DID) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Cannot offboard the sovereign founder admin account',
        )
        return true
      }

      const body = await helpers.readJsonBody(req)
      const previousRole = normalizeRole(target.role)
      const nowIso = new Date().toISOString()

      target.role = 'user'
      target.department = ''
      target.tokenVersion = (Number(target.tokenVersion) || 1) + 1
      target.offboardedAt = nowIso

      let releasedReports = 0
      for (const r of db.reports || []) {
        if (r.claimedByDid === target.did) {
          r.claimedByDid = null
          r.claimedByHandle = null
          r.claimedAt = null
          releasedReports++
        }
      }
      let releasedAppeals = 0
      for (const a of db.appeals || []) {
        if (a.claimedByDid === target.did) {
          a.claimedByDid = null
          a.claimedByHandle = null
          a.claimedAt = null
          releasedAppeals++
        }
      }

      recordAudit(
        db,
        auth,
        'staff.offboard',
        target.did,
        {
          handle: target.handle,
          previousRole,
          newTokenVersion: target.tokenVersion,
          releasedReports,
          releasedAppeals,
          reason: String(body.reason || '').trim() || undefined,
        },
        req,
      )
      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        did: target.did,
        handle: target.handle,
        revokedSessions: true,
        releasedReports,
        releasedAppeals,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 11. GET /api/quantzing/admin/audit?limit=100 (requires audit.read)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/audit' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'audit.read')
      if (!auth) return true

      const limit = Math.min(
        500,
        Math.max(1, Number(searchParams.get('limit') || 100) || 100),
      )
      const actionFilter = (searchParams.get('action') || '')
        .trim()
        .toLowerCase()
      const actorFilter = (searchParams.get('actor') || '')
        .trim()
        .toLowerCase()

      let entries = [...(db.auditLog || [])].reverse()
      if (actionFilter) {
        entries = entries.filter(e =>
          String(e.action || '')
            .toLowerCase()
            .includes(actionFilter),
        )
      }
      if (actorFilter) {
        entries = entries.filter(
          e =>
            String(e.actorHandle || '')
              .toLowerCase()
              .includes(actorFilter) ||
            String(e.actorDid || '')
              .toLowerCase()
              .includes(actorFilter),
        )
      }
      entries = entries.slice(0, limit)

      helpers.sendJson(req, res, 200, {ok: true, entries})
      return true
    }

    // -----------------------------------------------------------------------
    // 12. GET /api/quantzing/admin/backups (requires backups.manage)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/backups' && method === 'GET') {
      const auth = requirePermission(req, res, db, helpers, 'backups.manage')
      if (!auth) return true

      const backupsDir = path.join(helpers.getDataDir(), 'backups')
      if (!fs.existsSync(backupsDir)) {
        helpers.sendJson(req, res, 200, {ok: true, backups: []})
        return true
      }

      const files = fs.readdirSync(backupsDir)
      const backups = []
      for (const filename of files) {
        if (!filename.endsWith('.sqlite') && !filename.endsWith('.json.gz')) continue
        const fullPath = path.join(backupsDir, filename)
        try {
          const stat = fs.statSync(fullPath)
          if (!stat.isFile()) continue
          backups.push({
            filename,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
          })
        } catch {}
      }

      backups.sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )
      helpers.sendJson(req, res, 200, {ok: true, backups})
      return true
    }

    // -----------------------------------------------------------------------
    // 13. POST /api/quantzing/admin/backup (requires backups.manage)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/backup' && method === 'POST') {
      const auth = requirePermission(req, res, db, helpers, 'backups.manage')
      if (!auth) return true

      const backupsDir = path.join(helpers.getDataDir(), 'backups')
      fs.mkdirSync(backupsDir, {recursive: true})

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      let filename
      let stat

      if (helpers.store && typeof helpers.store.backupTo === 'function') {
        filename = `quantzing-db-${ts}.sqlite`
        const targetPath = path.join(backupsDir, filename)
        const snap = helpers.store.backupTo(targetPath)
        stat = {size: snap.sizeBytes, mtime: new Date(snap.createdAt)}
      } else {
        filename = `quantzing-db-${ts}.json.gz`
        const targetPath = path.join(backupsDir, filename)
        const tmpPath = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`

        const snapshotBuf = zlib.gzipSync(
          Buffer.from(JSON.stringify(db, null, 2), 'utf8'),
        )
        fs.writeFileSync(tmpPath, snapshotBuf)
        try {
          fs.renameSync(tmpPath, targetPath)
        } catch {
          fs.copyFileSync(tmpPath, targetPath)
          try {
            fs.unlinkSync(tmpPath)
          } catch {}
        }
        stat = fs.statSync(targetPath)
      }

      const backup = {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      }

      recordAudit(
        db,
        auth,
        'backup.create',
        filename,
        {
          sizeBytes: stat.size,
        },
        req,
      )
      helpers.saveDb(db)

      helpers.sendJson(req, res, 200, {ok: true, backup})
      return true
    }

    // Unknown /api/quantzing/admin/* route — enforce staff auth then 404
    const auth = requirePermission(req, res, db, helpers, null)
    if (!auth) return true
    helpers.sendXrpcError(
      req,
      res,
      404,
      'NotFound',
      `Unknown admin endpoint: ${method} ${pathname}`,
    )
    return true
  } catch (err) {
    if (err?.message === 'PayloadTooLarge') {
      helpers.sendXrpcError(
        req,
        res,
        413,
        'PayloadTooLarge',
        'Request payload too large',
      )
      return true
    }
    if (err?.message === 'InvalidJsonBody') {
      helpers.sendXrpcError(
        req,
        res,
        400,
        'InvalidRequest',
        'Invalid JSON request body',
      )
      return true
    }
    console.error(
      `[QuantZing Admin] Error handling ${method} ${pathname}:`,
      err,
    )
    helpers.sendXrpcError(
      req,
      res,
      500,
      'InternalServerError',
      err?.message || 'Internal QuantZing Admin error',
    )
    return true
  }
}
