import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ---------------------------------------------------------------------------
// QuantZing Sovereign Admin, Trust & Safety, Moderation & Rate Limiter Module
// Zero external dependencies (Node built-ins only)
// ---------------------------------------------------------------------------

export const FOUNDER_DID = 'did:plc:quantzingfounder00000000'
export const FOUNDER_HANDLE = 'founder.quantzing.com'
export const FOUNDER_EMAIL = 'founder@quantzing.com'
export const MOD_LABELER_DID = 'did:plc:quantzingmod000000000000'

const MAX_AUDIT_LOG_ENTRIES = 5000
const STRONG_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_+=@#'

// ---------------------------------------------------------------------------
// Sliding-Window Rate Limiter (Zero Dependencies)
// ---------------------------------------------------------------------------

const rateBuckets = new Map()
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

  // Opportunistic cleanup so long-running servers don't leak memory
  if (rateBuckets.size > 5000) {
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

  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift()
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
  if (auth && !auth.error && auth.account?.role === 'admin') {
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

// ---------------------------------------------------------------------------
// DB Schema Extensions & Founder Admin Bootstrap
// ---------------------------------------------------------------------------

export function ensureAdminState(db, helpers) {
  if (!db || typeof db !== 'object') return false
  let mutated = false

  if (!Array.isArray(db.reports)) {
    db.reports = []
    mutated = true
  }
  if (!Array.isArray(db.appeals)) {
    db.appeals = []
    mutated = true
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
    const {salt, hash} = helpers.hashPassword(password)

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
      role: 'admin',
      status: 'active',
      statusReason: '',
      suspendedUntil: null,
      warnings: [],
      verified: true,
      isOfficial: true,
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
    if (founderAcc.role !== 'admin') {
      founderAcc.role = 'admin'
      mutated = true
    }
    if (!founderAcc.isOfficial) {
      founderAcc.isOfficial = true
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

  // Ensure @quantzing.quantzing.com has role: 'admin'
  const officialAcc = db.accounts[helpers.QUANTZING_OFFICIAL_DID]
  if (officialAcc && officialAcc.role !== 'admin') {
    officialAcc.role = 'admin'
    mutated = true
  }

  const configuredAdminHandles = getConfiguredAdminHandles()

  // Backfill required moderation/admin fields on all existing accounts
  for (const acc of Object.values(db.accounts)) {
    if (!acc || typeof acc !== 'object') continue
    if (
      acc.role !== 'admin' &&
      acc.role !== 'moderator' &&
      acc.role !== 'user'
    ) {
      acc.role = 'user'
      mutated = true
    }
    if (
      configuredAdminHandles.size > 0 &&
      acc.handle &&
      configuredAdminHandles.has(acc.handle.toLowerCase()) &&
      acc.role !== 'admin'
    ) {
      acc.role = 'admin'
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
      if (db?.takedowns?.accounts?.[account.did]) {
        delete db.takedowns.accounts[account.did]
      }
      if (typeof saveDb === 'function') {
        saveDb(db)
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
  const list = db?.mutes?.[viewerDid]
  return Array.isArray(list) && list.includes(targetDid)
}

export function findViewerBlockUri(db, viewerDid, subjectDid, getCollectionMap) {
  if (!viewerDid || !subjectDid) return undefined
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

export function recordAudit(db, auth, action, target, details = {}) {
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : []
  const entry = {
    id: `aud_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    actorDid: auth?.did || 'system',
    actorHandle: auth?.account?.handle || 'system',
    action: String(action || ''),
    target: String(target || ''),
    details: details && typeof details === 'object' ? details : {},
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
          status: subjectAcc.status || 'active',
          verified: Boolean(subjectAcc.verified),
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

function formatAdminUser(db, acc, origin, followersCount, helpers) {
  return {
    did: acc.did,
    handle: acc.handle,
    displayName: acc.profile?.displayName || acc.handle.split('.')[0],
    email: acc.email || '',
    avatar: helpers.blobUrl(origin, acc.did, acc.profile?.avatar) || null,
    role: acc.role || 'user',
    status: acc.status || 'active',
    statusReason: acc.statusReason || '',
    suspendedUntil: acc.suspendedUntil || null,
    verified: Boolean(acc.verified),
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

function requireStaffAuth(req, res, db, helpers, {requireAdmin = false} = {}) {
  const auth = helpers.getAuthedContext(req, db)
  if (auth.error) {
    helpers.sendXrpcError(
      req,
      res,
      401,
      auth.error,
      'Authentication required',
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
  const role = auth.account.role || 'user'
  if (requireAdmin) {
    if (role !== 'admin') {
      helpers.sendXrpcError(
        req,
        res,
        403,
        'Forbidden',
        'Admin role required',
      )
      return null
    }
  } else if (role !== 'admin' && role !== 'moderator') {
    helpers.sendXrpcError(
      req,
      res,
      403,
      'Forbidden',
      'Admin or moderator role required',
    )
    return null
  }
  return auth
}

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

// ---------------------------------------------------------------------------
// Sovereign Admin & Appeals REST API Router
// Handles /api/quantzing/admin/* and /api/quantzing/appeals
// ---------------------------------------------------------------------------

export async function handleQuantZingAdmin(req, res, ctx) {
  const {db, pathname, searchParams, method, origin, helpers} = ctx

  const isAdminRoute =
    pathname === '/api/quantzing/admin' ||
    pathname.startsWith('/api/quantzing/admin/')
  const isAppealsRoute = pathname === '/api/quantzing/appeals'

  if (!isAdminRoute && !isAppealsRoute) {
    return false
  }

  try {
    // -----------------------------------------------------------------------
    // 9. POST /api/quantzing/appeals (User-facing; Bearer JWT OR credentials)
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
          helpers.verifyPassword(
            body.password,
            candidate.passwordSalt,
            candidate.passwordHash,
          )
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
    // 1. GET /api/quantzing/admin/me (Always 200; never leaks data if guest)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/me' && method === 'GET') {
      const auth = helpers.getAuthedContext(req, db)
      if (auth.error || !auth.account) {
        helpers.sendJson(req, res, 200, {
          ok: true,
          isAdmin: false,
          isStaff: false,
          role: 'guest',
          did: null,
          handle: null,
        })
        return true
      }
      const role = auth.account.role || 'user'
      const isAdmin = role === 'admin'
      const isStaff = role === 'admin' || role === 'moderator'
      helpers.sendJson(req, res, 200, {
        ok: true,
        isAdmin,
        isStaff,
        role,
        did: auth.did,
        handle: auth.account.handle,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 2. GET /api/quantzing/admin/overview
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/overview' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
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
        if (acc.role === 'admin' || acc.role === 'moderator') staffUsers++
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
      const appeals = Array.isArray(db.appeals) ? db.appeals : []
      const openAppeals = appeals.filter(a => a.status === 'open').length
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
          totalReports: reports.length,
          openAppeals,
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
    // 3. GET /api/quantzing/admin/reports?status=open|resolved|dismissed|all
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/reports' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const statusFilter = (searchParams.get('status') || 'all').toLowerCase()
      const reports = (db.reports || [])
        .filter(r => statusFilter === 'all' || r.status === statusFilter)
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .map(r => formatReportView(db, r, origin, helpers))

      helpers.sendJson(req, res, 200, {ok: true, reports})
      return true
    }

    // -----------------------------------------------------------------------
    // 4. POST /api/quantzing/admin/reports/:id/resolve
    // -----------------------------------------------------------------------
    const reportResolveMatch = pathname.match(
      /^\/api\/quantzing\/admin\/reports\/([^/]+)\/resolve$/,
    )
    if (reportResolveMatch && method === 'POST') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const reportId = decodeURIComponent(reportResolveMatch[1])
      const report = (db.reports || []).find(
        r => String(r.id) === String(reportId),
      )
      if (!report) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'Report not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const action = String(body.action || '').trim()
      const validActions = new Set([
        'dismiss',
        'label',
        'takedown_post',
        'warn_user',
        'suspend_user',
        'ban_user',
      ])
      if (!validActions.has(action)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid action "${action}". Expected one of: ${[...validActions].join(', ')}`,
        )
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
        (action === 'warn_user' ||
          action === 'suspend_user' ||
          action === 'ban_user') &&
        auth.account.role === 'moderator' &&
        targetAcc?.role === 'admin'
      ) {
        helpers.sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Moderators cannot take enforcement actions against admins',
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

      recordAudit(db, auth, 'report.resolve', String(report.id), {
        action,
        note,
        subjectUri: report.subjectUri || null,
        subjectDid: targetDid || null,
        labelVal: body.labelVal || undefined,
        suspendHours: body.suspendHours || undefined,
      })

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {
        ok: true,
        report: formatReportView(db, report, origin, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 5. GET /api/quantzing/admin/users?q=&filter=all|verified|suspended|banned|staff
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/users' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const filter = (searchParams.get('filter') || 'all').toLowerCase()

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
        if (
          filter === 'staff' &&
          acc.role !== 'admin' &&
          acc.role !== 'moderator'
        ) {
          continue
        }

        if (q) {
          const handle = String(acc.handle || '').toLowerCase()
          const dn = String(acc.profile?.displayName || '').toLowerCase()
          const email = String(acc.email || '').toLowerCase()
          const did = String(acc.did || '').toLowerCase()
          if (
            !handle.includes(q) &&
            !dn.includes(q) &&
            !email.includes(q) &&
            !did.includes(q)
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
    // 6. POST /api/quantzing/admin/users/:did/action
    // -----------------------------------------------------------------------
    const userActionMatch = pathname.match(
      /^\/api\/quantzing\/admin\/users\/([^/]+)\/action$/,
    )
    if (userActionMatch && method === 'POST') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const targetRef = decodeURIComponent(userActionMatch[1])
      const target =
        db.accounts[targetRef] || helpers.findLocalAccount(db, targetRef)
      if (!target) {
        helpers.sendXrpcError(req, res, 404, 'NotFound', 'User not found')
        return true
      }

      const body = await helpers.readJsonBody(req)
      const action = String(body.action || '').trim()
      const validActions = new Set([
        'verify',
        'unverify',
        'warn',
        'suspend',
        'ban',
        'restore',
        'set_role',
      ])
      if (!validActions.has(action)) {
        helpers.sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Invalid user action "${action}"`,
        )
        return true
      }

      const reason = String(body.reason || '').trim()

      if (action === 'set_role') {
        if (auth.account.role !== 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Admin role required to change user roles',
          )
          return true
        }
        const nextRole = String(body.role || '').trim()
        if (
          nextRole !== 'user' &&
          nextRole !== 'moderator' &&
          nextRole !== 'admin'
        ) {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'role must be "user", "moderator", or "admin"',
          )
          return true
        }
        if (target.did === auth.did && nextRole !== 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Cannot demote your own admin role',
          )
          return true
        }
        if (target.did === FOUNDER_DID && nextRole !== 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Cannot demote the sovereign founder admin account',
          )
          return true
        }
        target.role = nextRole
      } else if (action === 'verify') {
        target.verified = true
      } else if (action === 'unverify') {
        target.verified = false
      } else if (action === 'warn') {
        if (auth.account.role === 'moderator' && target.role === 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Moderators cannot warn admins',
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
        if (auth.account.role === 'moderator' && target.role === 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Moderators cannot suspend admins',
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
        if (auth.account.role === 'moderator' && target.role === 'admin') {
          helpers.sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Moderators cannot ban admins',
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

      recordAudit(db, auth, `user.${action}`, target.did, {
        handle: target.handle,
        reason: reason || undefined,
        suspendHours: body.suspendHours || undefined,
        role: action === 'set_role' ? target.role : undefined,
      })

      helpers.saveDb(db)

      let followersCount = 0
      for (const rec of helpers.getAllLocalRecords(db, 'app.bsky.graph.follow')) {
        if (rec?.value?.subject === target.did) followersCount++
      }

      helpers.sendJson(req, res, 200, {
        ok: true,
        user: formatAdminUser(db, target, origin, followersCount, helpers),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 7. GET /api/quantzing/admin/posts?q=&filter=all|active|removed|labeled
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/posts' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
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
    // 8. POST /api/quantzing/admin/posts/action
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/posts/action' && method === 'POST') {
      const auth = requireStaffAuth(req, res, db, helpers)
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

      recordAudit(db, auth, `post.${action}`, uri, {
        reason: reason || undefined,
        labelVal: labelVal || undefined,
      })

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
    // 10. GET /api/quantzing/admin/appeals?status=open|approved|rejected|all
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/appeals' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const statusFilter = (searchParams.get('status') || 'all').toLowerCase()
      const appeals = (db.appeals || [])
        .filter(a => statusFilter === 'all' || a.status === statusFilter)
        .slice()
        .sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .map(a => {
          const acc = db.accounts[a.appellantDid]
          return {
            ...a,
            appellantStatus: acc?.status || 'active',
            appellantDisplayName:
              acc?.profile?.displayName ||
              a.appellantHandle?.split('.')[0] ||
              a.appellantDid,
          }
        })

      helpers.sendJson(req, res, 200, {ok: true, appeals})
      return true
    }

    // -----------------------------------------------------------------------
    // 11. POST /api/quantzing/admin/appeals/:id/resolve
    // -----------------------------------------------------------------------
    const appealResolveMatch = pathname.match(
      /^\/api\/quantzing\/admin\/appeals\/([^/]+)\/resolve$/,
    )
    if (appealResolveMatch && method === 'POST') {
      const auth = requireStaffAuth(req, res, db, helpers)
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

      recordAudit(db, auth, `appeal.${decision}`, String(appeal.id), {
        type: appeal.type,
        appellantDid: appeal.appellantDid,
        subjectUri: appeal.subjectUri || null,
        note: note || undefined,
      })

      helpers.saveDb(db)
      helpers.sendJson(req, res, 200, {ok: true, appeal})
      return true
    }

    // -----------------------------------------------------------------------
    // 12. GET /api/quantzing/admin/audit?limit=100
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/audit' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const limit = Math.min(
        500,
        Math.max(1, Number(searchParams.get('limit') || 100) || 100),
      )
      const entries = [...(db.auditLog || [])].reverse().slice(0, limit)
      helpers.sendJson(req, res, 200, {ok: true, entries})
      return true
    }

    // -----------------------------------------------------------------------
    // 13. GET /api/quantzing/admin/backups
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/backups' && method === 'GET') {
      const auth = requireStaffAuth(req, res, db, helpers)
      if (!auth) return true

      const backupsDir = path.join(helpers.getDataDir(), 'backups')
      if (!fs.existsSync(backupsDir)) {
        helpers.sendJson(req, res, 200, {ok: true, backups: []})
        return true
      }

      const files = fs.readdirSync(backupsDir)
      const backups = []
      for (const filename of files) {
        if (!filename.endsWith('.json.gz')) continue
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
    // 14. POST /api/quantzing/admin/backup (Admin role strictly required)
    // -----------------------------------------------------------------------
    if (pathname === '/api/quantzing/admin/backup' && method === 'POST') {
      const auth = requireStaffAuth(req, res, db, helpers, {requireAdmin: true})
      if (!auth) return true

      const backupsDir = path.join(helpers.getDataDir(), 'backups')
      fs.mkdirSync(backupsDir, {recursive: true})

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `quantzing-db-${ts}.json.gz`
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

      const stat = fs.statSync(targetPath)
      const backup = {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      }

      recordAudit(db, auth, 'backup.create', filename, {
        sizeBytes: stat.size,
      })
      helpers.saveDb(db)

      helpers.sendJson(req, res, 200, {ok: true, backup})
      return true
    }

    // Unknown /api/quantzing/admin/* route — enforce auth then 404
    const auth = requireStaffAuth(req, res, db, helpers)
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
