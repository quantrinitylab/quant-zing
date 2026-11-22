import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  checkAccountEnforcement,
  enforceRateLimit,
  ensureAdminState,
  findViewerBlockUri,
  getClientIp,
  handleQuantZingAdmin,
  isAccountSuspendedOrBanned,
  isActorMutedByViewer,
  isConfiguredAdminHandle,
  isPostHiddenForViewer,
} from './quantzing-admin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// 100% Sovereign QuantZing Constants (ZERO external Bluesky network calls)
// ---------------------------------------------------------------------------

const QUANTZING_DID = 'did:web:quantzing.com'
const QUANTZING_DOMAIN = '.quantzing.com'
const QUANTZING_ALT_DOMAIN = '.quantzing.in'

// RFC 4648 base32 strictly-valid 24-char PLC DIDs ([a-z2-7]{24})
const QUANTZING_OFFICIAL_DID = 'did:plc:quantzingofficialaaaaaaa'
const QUANTY_SYSTEM_DID = 'did:plc:quantyaiofficialaaaaaaaa'
const QUANTRINITY_DID = 'did:plc:quantrinitylabaaaaaaaaaa'
const QUANTZING_NEWS_DID = 'did:plc:quantzingnewsdesk2222222'
const QUANT_BUILDERS_DID = 'did:plc:quantbuildershq222222222'

const QUANTY_SYSTEM_HANDLE = 'quanty.quantzing.com'
const DISCOVER_FEED_URI = `at://${QUANTZING_OFFICIAL_DID}/app.bsky.feed.generator/whats-hot`
const LEGACY_DISCOVER_FEED_URI =
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'
const GENESIS_VERSION = 2

const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
const MAX_BLOB_BODY_BYTES = 100 * 1024 * 1024
const MAX_VIDEO_TOTAL_BYTES = 300 * 1024 * 1024
const VIDEO_UPLOAD_PART_BYTES = 5 * 1024 * 1024
const VIDEO_AUTH_SCOPES = [
  'com.atproto.access',
  'com.atproto.serviceAuth',
  'quantzing.ops',
]
const activeVideoUploads = new Map()

function pruneExpiredVideoUploads() {
  const now = Date.now()
  for (const [jobId, job] of activeVideoUploads.entries()) {
    const expMs = Date.parse(job.expiresAt || 0)
    if (expMs && now - expMs > 5 * 60_000) {
      job.parts?.clear()
      activeVideoUploads.delete(jobId)
    }
  }
}

function isVideoEmbed(embed) {
  if (!embed || typeof embed !== 'object') return false
  if (embed.$type === 'app.bsky.embed.video') return true
  if (
    embed.$type === 'app.bsky.embed.recordWithMedia' &&
    embed.media?.$type === 'app.bsky.embed.video'
  ) {
    return true
  }
  return false
}

// RFC 4648 base32 lowercase (used for CIDv1 multibase 'b' and did:plc)
const BASE32_RFC4648 = 'abcdefghijklmnopqrstuvwxyz234567'
// ATProto TID base32-sortable alphabet
const BASE32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz'

let lastTidTimestamp = 0n
const tidClockId = BigInt(crypto.randomInt(0, 1024))

// ---------------------------------------------------------------------------
// Data paths & durable atomic JSON store
// ---------------------------------------------------------------------------

function getDataDir() {
  return (
    process.env.QUANTZING_DATA_DIR ||
    path.resolve(__dirname, '..', '.quantzing-data')
  )
}

function getDbPath() {
  return path.join(getDataDir(), 'db.json')
}

function getBlobsDir() {
  return path.join(getDataDir(), 'blobs')
}

function ensureStorageDirs() {
  fs.mkdirSync(getDataDir(), {recursive: true})
  fs.mkdirSync(getBlobsDir(), {recursive: true})
}

function createEmptyDb() {
  return {
    version: 2,
    genesisVersion: 0,
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    accounts: {},
    records: {},
    bookmarks: {},
    blobs: {},
    convos: {},
    revokedTokens: [],
    reports: [],
    appeals: [],
    takedowns: {posts: {}, accounts: {}},
    labels: {},
    mutes: {},
    auditLog: [],
    pendingApprovals: [],
    staffInvites: [],
  }
}

let cachedDb = null
let cachedDbPath = null

// ---------------------------------------------------------------------------
// Crypto & ATProto identifier primitives (zero external dependencies)
// ---------------------------------------------------------------------------

function base32Encode(buffer, alphabet = BASE32_RFC4648) {
  let bits = 0
  let value = 0
  let out = ''
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31]
  }
  return out
}

function createPlcDid() {
  const bytes = crypto.randomBytes(15) // 120 bits -> exactly 24 base32 chars
  return `did:plc:${base32Encode(bytes, BASE32_RFC4648)}`
}

function computeCid(input, codec = 'dag-cbor') {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(
        typeof input === 'string' ? input : JSON.stringify(input),
        'utf8',
      )
  const digest = crypto.createHash('sha256').update(buf).digest()
  const codecByte = codec === 'raw' ? 0x55 : 0x71
  const cidBytes = Buffer.concat([
    Buffer.from([0x01, codecByte, 0x12, 0x20]),
    digest,
  ])
  return `b${base32Encode(cidBytes, BASE32_RFC4648)}`
}

function generateTid() {
  let nowUs = BigInt(Date.now()) * 1000n
  if (nowUs <= lastTidTimestamp) {
    nowUs = lastTidTimestamp + 1n
  }
  lastTidTimestamp = nowUs
  let val = (nowUs << 10n) | tidClockId
  let out = ''
  for (let i = 0; i < 13; i++) {
    out = BASE32_SORTABLE[Number(val & 31n)] + out
    val >>= 5n
  }
  return out
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')
  return buf.toString('base64url')
}

function base64UrlDecodeJson(segment) {
  const raw = Buffer.from(segment, 'base64url').toString('utf8')
  return JSON.parse(raw)
}

function signJwt(db, {did, scope, ttlSeconds, tv}) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({alg: 'HS256', typ: 'at+jwt'}))
  const payload = base64UrlEncode(
    JSON.stringify({
      scope,
      sub: did,
      aud: QUANTZING_DID,
      iat: now,
      exp: now + ttlSeconds,
      jti: crypto.randomBytes(12).toString('hex'),
      tv: Number(tv) || 1,
    }),
  )
  const signingInput = `${header}.${payload}`
  const sig = crypto
    .createHmac('sha256', db.jwtSecret)
    .update(signingInput)
    .digest('base64url')
  return `${signingInput}.${sig}`
}

function mintTokens(db, did) {
  const tv = Number(db.accounts?.[did]?.tokenVersion) || 1
  return {
    accessJwt: signJwt(db, {
      did,
      scope: 'com.atproto.access',
      ttlSeconds: 30 * 24 * 60 * 60,
      tv,
    }),
    refreshJwt: signJwt(db, {
      did,
      scope: 'com.atproto.refresh',
      ttlSeconds: 90 * 24 * 60 * 60,
      tv,
    }),
  }
}

function verifyJwt(db, token, expectedScope = null) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const expectedSig = crypto
    .createHmac('sha256', db.jwtSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  const a = Buffer.from(sigB64, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null
  }

  let payload
  try {
    payload = base64UrlDecodeJson(payloadB64)
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload || typeof payload.sub !== 'string') return null
  if (typeof payload.exp === 'number' && payload.exp <= now) {
    return {expired: true, payload}
  }
  if (payload.jti && db.revokedTokens.includes(payload.jti)) {
    return null
  }
  if (expectedScope && payload.scope !== expectedScope) {
    return null
  }
  const account = db.accounts[payload.sub]
  if (!account) return null
  return {expired: false, payload, account}
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return {salt, hash}
}

function verifyPassword(password, salt, expectedHash) {
  if (salt === 'system' || expectedHash === 'system') return false
  const computed = crypto.scryptSync(String(password), salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  return (
    computed.length === expected.length &&
    crypto.timingSafeEqual(computed, expected)
  )
}

function normalizeHandle(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  if (!cleaned) return ''
  return cleaned.includes('.') ? cleaned : `${cleaned}${QUANTZING_DOMAIN}`
}

function isValidHandleFormat(handle) {
  if (!handle || handle.length > 253) return false
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
    handle,
  )
}

function parseAtUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('at://')) return null
  const rest = uri.slice('at://'.length)
  const parts = rest.split('/')
  if (parts.length < 3) return null
  return {
    repo: parts[0],
    collection: parts[1],
    rkey: parts.slice(2).join('/'),
  }
}

function resolveAtUri(db, uri) {
  const parsed = parseAtUri(uri)
  if (!parsed) return null
  const account = findLocalAccount(db, parsed.repo)
  if (!account) return null
  return {
    did: account.did,
    handle: account.handle,
    repo: account.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
    canonicalUri: `at://${account.did}/${parsed.collection}/${parsed.rkey}`,
    account,
  }
}

// ---------------------------------------------------------------------------
// Sovereign Blob Avatar Generator + Genesis Network Seeder
// ---------------------------------------------------------------------------

function storeLocalBlob(db, did, buffer, mimeType) {
  ensureStorageDirs()
  const cid = computeCid(buffer, 'raw')
  const blobPath = path.join(getBlobsDir(), cid)
  if (!fs.existsSync(blobPath)) {
    fs.writeFileSync(blobPath, buffer)
  }
  db.blobs[cid] = {
    cid,
    mimeType,
    size: buffer.length,
    did,
  }
  return {
    $type: 'blob',
    ref: {$link: cid},
    mimeType,
    size: buffer.length,
  }
}

function makeAvatarSvg(variant) {
  if (variant === 'founder') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#000000"/>
  <rect x="10" y="10" width="236" height="236" rx="52" fill="#16181C" stroke="#1D9BF0" stroke-width="6"/>
  <path d="M68 78H188L104 178H188" fill="none" stroke="#EFF3F4" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="188" cy="78" r="14" fill="#1D9BF0"/>
  <circle cx="68" cy="178" r="10" fill="#00BA7C"/>
</svg>`
  }
  if (variant === 'quantzing') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#000000"/>
  <rect x="10" y="10" width="236" height="236" rx="52" fill="#0B0D10" stroke="#2F3336" stroke-width="6"/>
  <path d="M68 74H188L104 182H188" fill="none" stroke="#EFF3F4" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="186" cy="74" r="13" fill="#1D9BF0"/>
</svg>`
  }
  if (variant === 'quanty') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#000000"/>
  <circle cx="128" cy="128" r="112" fill="#0A131C" stroke="#1D9BF0" stroke-width="6"/>
  <path d="M128 48L147 109L208 128L147 147L128 208L109 147L48 128L109 109Z" fill="#1D9BF0"/>
  <circle cx="128" cy="128" r="18" fill="#EFF3F4"/>
</svg>`
  }
  if (variant === 'quantrinity') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#080A0D"/>
  <polygon points="128,36 212,184 44,184" fill="none" stroke="#EFF3F4" stroke-width="16" stroke-linejoin="round"/>
  <circle cx="128" cy="136" r="22" fill="#1D9BF0"/>
</svg>`
  }
  if (variant === 'news') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#0D1117"/>
  <rect x="48" y="64" width="160" height="24" rx="12" fill="#1D9BF0"/>
  <rect x="48" y="112" width="128" height="22" rx="11" fill="#EFF3F4"/>
  <rect x="48" y="160" width="96" height="22" rx="11" fill="#71767B"/>
</svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#0A0C10"/>
  <path d="M84 86L46 128L84 170M172 86L210 128L172 170M144 68L112 188" fill="none" stroke="#EFF3F4" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="196" cy="60" r="12" fill="#00BA7C"/>
</svg>`
}

function buildFacetsForText(db, text) {
  const facets = []
  const str = String(text || '')
  const encoder = new TextEncoder()

  const byteIndexAt = charIdx => encoder.encode(str.slice(0, charIdx)).length

  // Hashtags (#Tag)
  const tagRe = /(^|\s)(#[A-Za-z][A-Za-z0-9_]{1,40})/g
  let m
  while ((m = tagRe.exec(str)) !== null) {
    const startChar = m.index + m[1].length
    const endChar = startChar + m[2].length
    facets.push({
      index: {
        byteStart: byteIndexAt(startChar),
        byteEnd: byteIndexAt(endChar),
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#tag',
          tag: m[2].slice(1),
        },
      ],
    })
  }

  // Mentions (@handle or @quanty)
  const mentionRe = /(^|\s)(@[a-zA-Z0-9.-]+)/g
  while ((m = mentionRe.exec(str)) !== null) {
    const rawMention = m[2].slice(1).toLowerCase()
    const acc = findLocalAccount(db, rawMention)
    if (!acc) continue
    const startChar = m.index + m[1].length
    const endChar = startChar + m[2].length
    facets.push({
      index: {
        byteStart: byteIndexAt(startChar),
        byteEnd: byteIndexAt(endChar),
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#mention',
          did: acc.did,
        },
      ],
    })
  }

  return facets.length > 0 ? facets : undefined
}

const OFFICIAL_GENESIS_ACCOUNTS = [
  {
    did: QUANTZING_OFFICIAL_DID,
    handle: 'quantzing.quantzing.com',
    email: 'official@quantzing.com',
    displayName: 'QuantZing',
    description:
      'Official QuantZing network account. Real-time Zings, sovereign handles, ZingSpaces, and built-in Quanty intelligence.',
    avatarVariant: 'quantzing',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    did: QUANTY_SYSTEM_DID,
    handle: QUANTY_SYSTEM_HANDLE,
    email: 'quanty@quantzing.com',
    displayName: 'Quanty',
    description:
      'Official AI on QuantZing. Mention @quanty in any Zing or reply to fact-check, summarize, or ask anything.',
    avatarVariant: 'quanty',
    isSystemQuanty: true,
    createdAt: '2026-01-01T00:01:00.000Z',
  },
  {
    did: QUANTRINITY_DID,
    handle: 'quantrinity.quantzing.com',
    email: 'lab@quantrinity.in',
    displayName: 'Quantrinity Lab',
    description:
      'Building the sovereign QuantOS stack: QuantZing, QuantMail, QuantAI, QuantChat, QuantDrive & independent cloud infrastructure.',
    avatarVariant: 'quantrinity',
    createdAt: '2026-01-01T00:02:00.000Z',
  },
  {
    did: QUANTZING_NEWS_DID,
    handle: 'news.quantzing.com',
    email: 'news@quantzing.com',
    displayName: 'QuantZing News',
    description:
      'Live high-signal updates across frontier AI, global markets, startups, science, and India technology.',
    avatarVariant: 'news',
    createdAt: '2026-01-01T00:03:00.000Z',
  },
  {
    did: QUANT_BUILDERS_DID,
    handle: 'builders.quantzing.com',
    email: 'builders@quantzing.com',
    displayName: 'Quant Builders',
    description:
      'Founders, systems engineers, and independent developers shipping real software in public on QuantZing.',
    avatarVariant: 'builders',
    createdAt: '2026-01-01T00:04:00.000Z',
  },
]

const SOVEREIGN_FEED_GENERATORS = [
  {
    rkey: 'whats-hot',
    displayName: 'For you',
    description:
      'Real-time Zings across the entire QuantZing network — zero external third-party feeds.',
    category: 'Home',
    tags: [],
  },
  {
    rkey: 'quanty-ai',
    displayName: 'Quanty & AI',
    description:
      'Frontier AI releases, @quanty thread breakdowns, agents, inference, and open-weights research.',
    category: 'AI',
    tags: ['ai', 'quantyai', 'quanty', 'llm', 'agents', 'inference'],
  },
  {
    rkey: 'builders',
    displayName: 'Builders & Tech',
    description:
      'Systems engineering, startups, QuantOS architecture, and founders shipping in public.',
    category: 'Technology',
    tags: ['quantos', 'startups', 'opensource', 'typescript', 'cloudinfra', 'builders'],
  },
  {
    rkey: 'india-global',
    displayName: 'India & Global',
    description:
      'Breaking tech, policy, markets, and startup momentum from India and around the world.',
    category: 'News',
    tags: ['indiatech', 'markets', 'news', 'quantrinity', 'global'],
  },
  {
    rkey: 'thevids',
    displayName: 'Videos',
    description: 'Native video Zings and clips published on QuantZing.',
    category: 'Media',
    tags: ['video'],
  },
]

function ensureSovereignGenesis(db) {
  if (!db || typeof db !== 'object') return false
  let mutated = false
  db.accounts = db.accounts || {}
  db.records = db.records || {}
  db.bookmarks = db.bookmarks || {}
  db.blobs = db.blobs || {}
  db.convos = db.convos || {}

  // Remove legacy invalid-base32 Quanty DID if present from older local builds
  const legacyQuantyDid = 'did:plc:quantyaiofficial00000000'
  if (db.accounts[legacyQuantyDid]) {
    delete db.accounts[legacyQuantyDid]
    delete db.records[legacyQuantyDid]
    mutated = true
  }

  // Ensure all 5 official sovereign QuantZing genesis accounts + SVG avatars exist
  for (const spec of OFFICIAL_GENESIS_ACCOUNTS) {
    let acc = db.accounts[spec.did]
    const needsAvatar =
      !acc?.profile?.avatar ||
      !db.blobs[extractBlobCid(acc.profile.avatar) || '']

    let avatarBlob = acc?.profile?.avatar || null
    if (needsAvatar) {
      const svgBuf = Buffer.from(makeAvatarSvg(spec.avatarVariant), 'utf8')
      avatarBlob = storeLocalBlob(db, spec.did, svgBuf, 'image/svg+xml')
      mutated = true
    }

    if (!acc) {
      acc = {
        did: spec.did,
        handle: spec.handle,
        email: spec.email,
        emailConfirmed: true,
        passwordSalt: 'system',
        passwordHash: 'system',
        createdAt: spec.createdAt,
        active: true,
        role: spec.did === QUANTZING_OFFICIAL_DID ? 'super_admin' : 'user',
        department: spec.did === QUANTZING_OFFICIAL_DID ? 'Leadership' : '',
        tokenVersion: 1,
        offboardedAt: null,
        lastOpsLoginAt: null,
        status: 'active',
        statusReason: '',
        suspendedUntil: null,
        warnings: [],
        verified: true,
        isOfficial: true,
        isSystemQuanty: Boolean(spec.isSystemQuanty),
        profile: {
          displayName: spec.displayName,
          description: spec.description,
          avatar: avatarBlob,
          createdAt: spec.createdAt,
        },
        preferences: createDefaultPreferences(),
        notificationPreferences: createDefaultNotificationPreferences(),
      }
      db.accounts[spec.did] = acc
      mutated = true
    } else {
      if (typeof acc.verified !== 'boolean') {
        acc.verified = true
        mutated = true
      }
      acc.isOfficial = true
      if (spec.isSystemQuanty) acc.isSystemQuanty = true
      if (avatarBlob && !acc.profile?.avatar) {
        acc.profile = {...(acc.profile || {}), avatar: avatarBlob}
        mutated = true
      }
    }

    const profileCol = getCollectionMap(
      db,
      spec.did,
      'app.bsky.actor.profile',
      true,
    )
    if (!profileCol.self || needsAvatar) {
      const profileValue = {
        $type: 'app.bsky.actor.profile',
        displayName: acc.profile?.displayName || spec.displayName,
        description: acc.profile?.description || spec.description,
        ...(avatarBlob ? {avatar: avatarBlob} : {}),
        createdAt: spec.createdAt,
      }
      profileCol.self = {
        uri: `at://${spec.did}/app.bsky.actor.profile/self`,
        cid: computeCid(profileValue, 'dag-cbor'),
        rkey: 'self',
        collection: 'app.bsky.actor.profile',
        repo: spec.did,
        value: profileValue,
        indexedAt: spec.createdAt,
      }
      mutated = true
    }
  }

  // Seed sovereign genesis Zings once so the brand-new QuantZing network launches alive
  if ((db.genesisVersion || 0) < GENESIS_VERSION) {
    const now = Date.now()
    const genesisPosts = [
      {
        rkey: '3mquantzing001',
        did: QUANTZING_OFFICIAL_DID,
        minutesAgo: 8,
        text: 'Welcome to QuantZing. Real-time conversations, sovereign @handle.quantzing.com identity, built-in Quanty AI, and live ZingSpaces — running 100% on our own independent network. Post your first Zing or tag @quanty in any thread. #QuantZing #OpenWeb',
      },
      {
        rkey: '3mquantzing002',
        did: QUANTY_SYSTEM_DID,
        minutesAgo: 18,
        text: 'Quanty is live directly inside QuantZing. Mention @quanty in any Zing or reply to summarize a thread, verify claims, or draft a sharper Zing without leaving your timeline. #QuantyAI #AI',
      },
      {
        rkey: '3mquantzing003',
        did: QUANTRINITY_DID,
        minutesAgo: 34,
        text: 'QuantZing is now running on dedicated sovereign infrastructure under quantzing.quantrinity.in alongside QuantMail, QuantAI, and QuantChat. Zero third-party feed lock-in, full protocol ownership from day one. #QuantOS #Quantrinity #CloudInfra',
      },
      {
        rkey: '3mquantzing004',
        did: QUANTZING_NEWS_DID,
        minutesAgo: 52,
        text: 'India Tech Pulse: Independent Indian cloud and AI engineering teams are rapidly shifting toward sovereign ARM64 infrastructure, open-weight inference routers, and native mobile-first platforms. #IndiaTech #AI #Startups',
      },
      {
        rkey: '3mquantzing005',
        did: QUANT_BUILDERS_DID,
        minutesAgo: 78,
        text: 'Shipping tip for founders building real-time social apps: own your identity server, own your feed graph, and keep the interface razor-fast on pure OLED black. What are you building this week? #Builders #Startups #OpenSource',
      },
      {
        rkey: '3mquantzing006',
        did: QUANTZING_NEWS_DID,
        minutesAgo: 110,
        text: 'Global Markets & AI Infrastructure: Compute efficiency, multi-provider AI routing, and sub-100ms edge delivery are driving the next wave of consumer software launches across Asia, Europe, and the US. #Markets #AI #CloudInfra',
      },
      {
        rkey: '3mquantzing007',
        did: QUANTZING_OFFICIAL_DID,
        minutesAgo: 145,
        text: 'ZingSpaces live audio rooms, long-form Articles, Creator Studio analytics, and direct messages are all built right into QuantZing. Tap Sign up to claim your sovereign handle before launch fills up. #ZingSpaces #QuantZing',
      },
      {
        rkey: '3mquantzing008',
        did: QUANT_BUILDERS_DID,
        minutesAgo: 180,
        text: '@quanty give a quick breakdown of why owning your own sovereign PDS and AppView matters for a modern social platform. #QuantOS #QuantyAI',
      },
    ]

    let lastBuilderPost = null
    for (const item of genesisPosts) {
      const col = getCollectionMap(db, item.did, 'app.bsky.feed.post', true)
      if (!col[item.rkey]) {
        const createdAt = new Date(now - item.minutesAgo * 60_000).toISOString()
        const facets = buildFacetsForText(db, item.text)
        const value = {
          $type: 'app.bsky.feed.post',
          text: item.text,
          createdAt,
          langs: ['en'],
          ...(facets ? {facets} : {}),
        }
        const entry = {
          uri: `at://${item.did}/app.bsky.feed.post/${item.rkey}`,
          cid: computeCid(value, 'dag-cbor'),
          rkey: item.rkey,
          collection: 'app.bsky.feed.post',
          repo: item.did,
          value,
          indexedAt: createdAt,
        }
        col[item.rkey] = entry
        if (item.rkey === '3mquantzing008') lastBuilderPost = entry
        mutated = true
      }
    }

    // Seed an authentic @quanty in-thread reply on the builder question
    if (lastBuilderPost) {
      const qCol = getCollectionMap(
        db,
        QUANTY_SYSTEM_DID,
        'app.bsky.feed.post',
        true,
      )
      if (!qCol['3mquantzing009']) {
        const replyAt = new Date(now - 178 * 60_000).toISOString()
        const replyText =
          '@builders.quantzing.com Owning the PDS + AppView means zero third-party rate limits, full data sovereignty for every handle and Zing, instant custom ranking, and native AI integration across threads.'
        const facets = buildFacetsForText(db, replyText)
        const replyValue = {
          $type: 'app.bsky.feed.post',
          text: replyText,
          createdAt: replyAt,
          langs: ['en'],
          ...(facets ? {facets} : {}),
          reply: {
            root: {uri: lastBuilderPost.uri, cid: lastBuilderPost.cid},
            parent: {uri: lastBuilderPost.uri, cid: lastBuilderPost.cid},
          },
        }
        qCol['3mquantzing009'] = {
          uri: `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/3mquantzing009`,
          cid: computeCid(replyValue, 'dag-cbor'),
          rkey: '3mquantzing009',
          collection: 'app.bsky.feed.post',
          repo: QUANTY_SYSTEM_DID,
          value: replyValue,
          indexedAt: replyAt,
        }
        mutated = true
      }
    }

    // Seed cross-follows among official ecosystem accounts so profiles have real graph edges
    const followPairs = [
      [QUANTZING_OFFICIAL_DID, QUANTY_SYSTEM_DID],
      [QUANTZING_OFFICIAL_DID, QUANTRINITY_DID],
      [QUANTZING_OFFICIAL_DID, QUANTZING_NEWS_DID],
      [QUANTZING_OFFICIAL_DID, QUANT_BUILDERS_DID],
      [QUANTRINITY_DID, QUANTZING_OFFICIAL_DID],
      [QUANTRINITY_DID, QUANTY_SYSTEM_DID],
      [QUANT_BUILDERS_DID, QUANTZING_OFFICIAL_DID],
      [QUANT_BUILDERS_DID, QUANTY_SYSTEM_DID],
      [QUANTZING_NEWS_DID, QUANTZING_OFFICIAL_DID],
    ]
    for (const [src, dst] of followPairs) {
      const fCol = getCollectionMap(db, src, 'app.bsky.graph.follow', true)
      const exists = Object.values(fCol).some(r => r?.value?.subject === dst)
      if (!exists) {
        const rkey = generateTid()
        const createdAt = new Date(now - 200 * 60_000).toISOString()
        const value = {
          $type: 'app.bsky.graph.follow',
          subject: dst,
          createdAt,
        }
        fCol[rkey] = {
          uri: `at://${src}/app.bsky.graph.follow/${rkey}`,
          cid: computeCid(value, 'dag-cbor'),
          rkey,
          collection: 'app.bsky.graph.follow',
          repo: src,
          value,
          indexedAt: createdAt,
        }
        mutated = true
      }
    }

    // Migrate any user savedFeeds referencing legacy Bluesky Discover URI to Sovereign QuantZing Discover URI
    for (const acc of Object.values(db.accounts)) {
      if (!Array.isArray(acc.preferences)) continue
      for (const pref of acc.preferences) {
        if (Array.isArray(pref.items)) {
          for (const it of pref.items) {
            if (it?.value === LEGACY_DISCOVER_FEED_URI) {
              it.value = DISCOVER_FEED_URI
              mutated = true
            }
          }
        }
        if (Array.isArray(pref.pinned)) {
          pref.pinned = pref.pinned.map(v =>
            v === LEGACY_DISCOVER_FEED_URI ? DISCOVER_FEED_URI : v,
          )
        }
        if (Array.isArray(pref.saved)) {
          pref.saved = pref.saved.map(v =>
            v === LEGACY_DISCOVER_FEED_URI ? DISCOVER_FEED_URI : v,
          )
        }
      }
    }

    db.genesisVersion = GENESIS_VERSION
    mutated = true
  }

  if (ensureAdminState(db, getAdminHelpers())) {
    mutated = true
  }

  return mutated
}

function getAdminHelpers() {
  return {
    getDataDir,
    getDbPath,
    saveDb,
    sendJson,
    sendEmpty,
    sendXrpcError,
    readJsonBody,
    getAuthedContext,
    signJwt,
    mintTokens,
    createPlcDid,
    findLocalAccount,
    findLocalPostByUri,
    verifyPassword,
    hashPassword,
    normalizeHandle,
    isValidHandleFormat,
    parseAtUri,
    generateTid,
    computeCid,
    storeLocalBlob,
    makeAvatarSvg,
    extractBlobCid,
    blobUrl,
    getCollectionMap,
    getAllLocalRecords,
    putLocalRecord,
    countLocalInteractions,
    createDefaultPreferences,
    createDefaultNotificationPreferences,
    QUANTZING_OFFICIAL_DID,
    QUANTY_SYSTEM_DID,
  }
}

function loadDb() {
  const dbPath = getDbPath()
  if (cachedDb && cachedDbPath === dbPath) {
    if (ensureSovereignGenesis(cachedDb)) {
      saveDb(cachedDb)
    }
    return cachedDb
  }
  ensureStorageDirs()
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf8')
      const parsed = JSON.parse(raw)
      cachedDb = {
        ...createEmptyDb(),
        ...parsed,
        accounts: parsed.accounts || {},
        records: parsed.records || {},
        bookmarks: parsed.bookmarks || {},
        blobs: parsed.blobs || {},
        convos: parsed.convos || {},
        revokedTokens: Array.isArray(parsed.revokedTokens)
          ? parsed.revokedTokens
          : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        appeals: Array.isArray(parsed.appeals) ? parsed.appeals : [],
        takedowns: {
          posts: parsed.takedowns?.posts || {},
          accounts: parsed.takedowns?.accounts || {},
        },
        labels:
          parsed.labels && typeof parsed.labels === 'object'
            ? parsed.labels
            : {},
        mutes:
          parsed.mutes && typeof parsed.mutes === 'object' ? parsed.mutes : {},
        auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
        pendingApprovals: Array.isArray(parsed.pendingApprovals)
          ? parsed.pendingApprovals
          : [],
        staffInvites: Array.isArray(parsed.staffInvites)
          ? parsed.staffInvites
          : [],
      }
      cachedDbPath = dbPath
      if (ensureSovereignGenesis(cachedDb)) {
        saveDb(cachedDb)
      }
      return cachedDb
    } catch (err) {
      console.error(
        '[QuantZing PDS] Failed to parse db.json, initializing fresh sovereign store:',
        err,
      )
    }
  }
  cachedDb = createEmptyDb()
  cachedDbPath = dbPath
  ensureSovereignGenesis(cachedDb)
  saveDb(cachedDb)
  return cachedDb
}

function saveDb(db) {
  ensureStorageDirs()
  const dbPath = getDbPath()
  const tmpPath = `${dbPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  const payload = JSON.stringify(db, null, 2)
  fs.writeFileSync(tmpPath, payload, 'utf8')
  try {
    fs.renameSync(tmpPath, dbPath)
  } catch {
    fs.copyFileSync(tmpPath, dbPath)
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
  }
  cachedDb = db
  cachedDbPath = dbPath
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function getServerOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
    .split(',')[0]
    .trim()
  const host = String(
    req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3008',
  )
    .split(',')[0]
    .trim()
  return `${proto}://${host}`
}

function corsHeaders(req, extra = {}) {
  return {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      req.headers['access-control-request-headers'] ||
      'content-type,authorization,atproto-proxy,atproto-accept-labelers,x-atproto-device-id,x-atproto-session-id,accept-language,x-bsky-topics',
    'access-control-expose-headers': 'content-type,x-quantzing-pds,retry-after',
    'x-quantzing-pds': 'sovereign-pure',
    ...extra,
  }
}

function sendJson(req, res, statusCode, body, extraHeaders = {}) {
  if (res.headersSent) return
  const payload = JSON.stringify(body)
  res.writeHead(
    statusCode,
    corsHeaders(req, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
      ...extraHeaders,
    }),
  )
  res.end(payload)
}

function sendEmpty(req, res, statusCode = 200) {
  if (res.headersSent) return
  res.writeHead(
    statusCode,
    corsHeaders(req, {
      'cache-control': 'no-store',
    }),
  )
  res.end()
}

function sendXrpcError(req, res, statusCode, error, message) {
  sendJson(req, res, statusCode, {error, message})
}

function readRawBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', chunk => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('PayloadTooLarge'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const buf = await readRawBody(req, MAX_JSON_BODY_BYTES)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new Error('InvalidJsonBody')
  }
}

function extractBearerToken(req) {
  const auth = String(req.headers.authorization || '')
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function getAuthedContext(
  req,
  db,
  {expectedScope = null, allowedScopes = null} = {},
) {
  const token = extractBearerToken(req)
  if (!token) {
    return {
      error: 'AuthenticationRequired',
      status: 401,
      message: 'Authentication required',
    }
  }
  const verified = verifyJwt(db, token, expectedScope)
  if (!verified) {
    return {
      error: 'InvalidToken',
      status: 401,
      message: 'Invalid token',
    }
  }
  if (verified.expired) {
    return {
      error: 'ExpiredToken',
      status: 400,
      message: 'Token has expired',
    }
  }
  const tokenTv = Number(verified.payload.tv) || 1
  const accountTv = Number(verified.account.tokenVersion) || 1
  if (tokenTv !== accountTv) {
    return {
      error: 'InvalidToken',
      status: 401,
      message: 'Session has been revoked',
    }
  }
  if (Array.isArray(allowedScopes) && allowedScopes.length > 0) {
    if (!allowedScopes.includes(verified.payload.scope)) {
      return {
        error: 'InvalidToken',
        status: 401,
        message: 'Invalid token scope',
      }
    }
  } else if (!expectedScope) {
    if (
      verified.payload.scope !== 'com.atproto.access' &&
      verified.payload.scope !== 'quantzing.ops'
    ) {
      return {
        error: 'InvalidToken',
        status: 401,
        message: 'Invalid token scope',
      }
    }
  }
  return {
    token,
    payload: verified.payload,
    account: verified.account,
    did: verified.account.did,
  }
}

function getOptionalViewerDid(req, db) {
  const token = extractBearerToken(req)
  if (!token) return null
  const verified = verifyJwt(db, token)
  if (!verified || verified.expired) return null
  const tokenTv = Number(verified.payload.tv) || 1
  const accountTv = Number(verified.account.tokenVersion) || 1
  if (tokenTv !== accountTv) return null
  if (
    verified.payload.scope !== 'com.atproto.access' &&
    verified.payload.scope !== 'quantzing.ops'
  ) {
    return null
  }
  return verified.account.did
}

// ---------------------------------------------------------------------------
// Account, Record & Preference helpers
// ---------------------------------------------------------------------------

function buildDidDoc(account, origin) {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: account.did,
    alsoKnownAs: [`at://${account.handle}`],
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: origin,
      },
    ],
  }
}

function createDefaultPreferences() {
  return [
    {
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [
        {
          id: generateTid(),
          type: 'timeline',
          value: 'following',
          pinned: true,
        },
        {
          id: generateTid(),
          type: 'feed',
          value: DISCOVER_FEED_URI,
          pinned: true,
        },
      ],
    },
    {
      $type: 'app.bsky.actor.defs#savedFeedsPref',
      pinned: [DISCOVER_FEED_URI],
      saved: [DISCOVER_FEED_URI],
    },
    {
      $type: 'app.bsky.actor.defs#personalDetailsPref',
      birthDate: '1998-01-01T00:00:00.000Z',
    },
  ]
}

function createDefaultNotificationPreferences() {
  return {
    chat: {include: 'all', push: true},
    follow: {include: 'all', list: true, push: true},
    like: {include: 'all', list: true, push: true},
    likeViaRepost: {include: 'all', list: true, push: true},
    mention: {include: 'all', list: true, push: true},
    quote: {include: 'all', list: true, push: true},
    reply: {include: 'all', list: true, push: true},
    repost: {include: 'all', list: true, push: true},
    repostViaRepost: {include: 'all', list: true, push: true},
    starterpackJoined: {list: true, push: true},
    subscribedPost: {list: true, push: true},
    unverified: {list: true, push: true},
    verified: {list: true, push: true},
  }
}

function findLocalAccount(db, identifierOrDid) {
  if (!identifierOrDid) return null
  const raw = String(identifierOrDid).trim()
  if (db.accounts[raw]) return db.accounts[raw]
  const lower = raw.toLowerCase().replace(/^@/, '')
  const withDomain = lower.includes('.') ? lower : `${lower}${QUANTZING_DOMAIN}`
  const withAltDomain = lower.includes('.')
    ? lower
    : `${lower}${QUANTZING_ALT_DOMAIN}`
  for (const account of Object.values(db.accounts)) {
    const h = account.handle.toLowerCase()
    if (
      h === lower ||
      h === withDomain ||
      h === withAltDomain ||
      (account.email && account.email.toLowerCase() === lower)
    ) {
      return account
    }
  }
  return null
}

function getCollectionMap(db, did, collection, create = false) {
  if (!db.records[did]) {
    if (!create) return {}
    db.records[did] = {}
  }
  if (!db.records[did][collection]) {
    if (!create) return {}
    db.records[did][collection] = {}
  }
  return db.records[did][collection]
}

function getAllLocalRecords(db, collection) {
  const list = []
  for (const [did, collections] of Object.entries(db.records)) {
    const col = collections?.[collection]
    if (!col) continue
    for (const rec of Object.values(col)) {
      list.push({...rec, repo: rec.repo || did})
    }
  }
  return list
}

function syncProfileFromRecord(account, value) {
  if (!value || typeof value !== 'object') return
  account.profile = {
    ...(account.profile || {}),
    displayName:
      value.displayName !== undefined
        ? value.displayName
        : account.profile?.displayName,
    description:
      value.description !== undefined
        ? value.description
        : account.profile?.description,
    avatar: value.avatar !== undefined ? value.avatar : account.profile?.avatar,
    banner: value.banner !== undefined ? value.banner : account.profile?.banner,
    pronouns:
      value.pronouns !== undefined ? value.pronouns : account.profile?.pronouns,
    website:
      value.website !== undefined ? value.website : account.profile?.website,
    pinnedPost:
      value.pinnedPost !== undefined
        ? value.pinnedPost
        : account.profile?.pinnedPost,
    createdAt:
      value.createdAt || account.profile?.createdAt || account.createdAt,
  }
}

function synthesizeQuantyReplyText(db, rawText, parentText, authorHandle) {
  const cleaned = String(rawText || '')
    .replace(/@quanty(?:\.quantzing\.(?:com|in))?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const handlePrefix = authorHandle
    ? `@${String(authorHandle).replace(/^@/, '')} `
    : ''
  const parentSnippet = String(parentText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110)

  if (
    parentSnippet &&
    (!cleaned ||
      /^(explain|fact[- ]?check|summarize|context|is this true|verify)/i.test(
        cleaned,
      ))
  ) {
    return `${handlePrefix}Context on "${parentSnippet}${parentSnippet.length >= 110 ? '...' : ''}": Core claim is live on QuantZing; verify primary linked sources and check replies in this thread for full context.`.slice(
      0,
      280,
    )
  }

  if (/trending|breaking|news|happening|today/i.test(cleaned)) {
    const trends = computeSovereignTrends(db, null, '', 3)
    const topNames = trends.map(t => t.displayName).join(', ')
    return `${handlePrefix}Top momentum on QuantZing right now: ${topNames || '#QuantZing, #AI, #IndiaTech'}. Open Quanty from the sidebar for the full multi-story briefing.`.slice(
      0,
      280,
    )
  }

  const topic = cleaned.replace(/\?+$/, '').slice(0, 115) || 'your Zing'
  if (parentSnippet) {
    return `${handlePrefix}On "${topic}" (re: "${parentSnippet.slice(0, 65)}..."): Key signal is separating primary data from commentary — cross-check cited sources and counter-arguments in thread.`.slice(
      0,
      280,
    )
  }
  return `${handlePrefix}Regarding "${topic}": High-signal discussion on QuantZing points to fast execution, open benchmarks, and sovereign ownership as the key differentiators. Tap Quanty for deeper analysis.`.slice(
    0,
    280,
  )
}

function findLocalPostByUri(db, uri) {
  if (!uri) return null
  const resolved = resolveAtUri(db, uri)
  if (!resolved || resolved.collection !== 'app.bsky.feed.post') return null
  return (
    db.records?.[resolved.did]?.['app.bsky.feed.post']?.[resolved.rkey] || null
  )
}

function putLocalRecord(db, did, collection, rkey, recordValue) {
  const key = rkey || generateTid()
  const value = {
    $type: collection,
    ...recordValue,
  }
  if (
    collection === 'app.bsky.feed.post' &&
    typeof value.text === 'string' &&
    (!Array.isArray(value.facets) || value.facets.length === 0)
  ) {
    const autoFacets = buildFacetsForText(db, value.text)
    if (autoFacets) value.facets = autoFacets
  }
  const uri = `at://${did}/${collection}/${key}`
  const cid = computeCid(value, 'dag-cbor')
  const indexedAt = new Date().toISOString()
  const col = getCollectionMap(db, did, collection, true)
  const entry = {
    uri,
    cid,
    rkey: key,
    collection,
    repo: did,
    value,
    indexedAt,
  }
  col[key] = entry
  if (
    collection === 'app.bsky.actor.profile' &&
    key === 'self' &&
    db.accounts[did]
  ) {
    syncProfileFromRecord(db.accounts[did], value)
  }

  // Automatic @quanty in-thread reply whenever any user tags @quanty in a Zing or reply
  if (
    collection === 'app.bsky.feed.post' &&
    did !== QUANTY_SYSTEM_DID &&
    typeof value.text === 'string' &&
    /(?:^|\s)@quanty(?:\.quantzing\.(?:com|in))?\b/i.test(value.text)
  ) {
    ensureSovereignGenesis(db)
    const authorAcc = db.accounts[did]
    const parentUri = value.reply?.parent?.uri
    const parentRec = parentUri ? findLocalPostByUri(db, parentUri) : null
    const parentText = parentRec?.value?.text || ''
    const replyText = synthesizeQuantyReplyText(
      db,
      value.text,
      parentText,
      authorAcc?.handle,
    )
    const rootRef = value.reply?.root?.uri
      ? value.reply.root
      : {uri: entry.uri, cid: entry.cid}
    const parentRef = {uri: entry.uri, cid: entry.cid}
    const replyRkey = generateTid()
    const replyCreatedAt = new Date(Date.now() + 1).toISOString()
    const facets = buildFacetsForText(db, replyText)
    const replyValue = {
      $type: 'app.bsky.feed.post',
      text: replyText,
      createdAt: replyCreatedAt,
      langs: ['en'],
      ...(facets ? {facets} : {}),
      reply: {
        root: rootRef,
        parent: parentRef,
      },
    }
    const qCol = getCollectionMap(
      db,
      QUANTY_SYSTEM_DID,
      'app.bsky.feed.post',
      true,
    )
    qCol[replyRkey] = {
      uri: `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/${replyRkey}`,
      cid: computeCid(replyValue, 'dag-cbor'),
      rkey: replyRkey,
      collection: 'app.bsky.feed.post',
      repo: QUANTY_SYSTEM_DID,
      value: replyValue,
      indexedAt: replyCreatedAt,
    }
  }

  return entry
}

function deleteLocalRecord(db, did, collection, rkey) {
  const col = db.records?.[did]?.[collection]
  if (col && col[rkey]) {
    delete col[rkey]
    return true
  }
  return false
}

function extractBlobCid(blobRef) {
  if (!blobRef || typeof blobRef !== 'object') return null
  if (typeof blobRef.ref?.$link === 'string') return blobRef.ref.$link
  if (typeof blobRef.cid === 'string') return blobRef.cid
  return null
}

function blobUrl(origin, did, blobRef) {
  const cid = extractBlobCid(blobRef)
  if (!cid) return undefined
  return `${origin}/blob/${encodeURIComponent(did)}/${encodeURIComponent(cid)}`
}

// ---------------------------------------------------------------------------
// 100% Sovereign Local View Hydrators
// ---------------------------------------------------------------------------

function findViewerFollowUri(db, viewerDid, subjectDid) {
  if (!viewerDid || !subjectDid) return undefined
  const follows = getCollectionMap(db, viewerDid, 'app.bsky.graph.follow')
  for (const rec of Object.values(follows)) {
    if (rec?.value?.subject === subjectDid) {
      return rec.uri
    }
  }
  return undefined
}

function findViewerReactionUri(db, viewerDid, collection, subjectUri) {
  if (!viewerDid || !subjectUri) return undefined
  const map = getCollectionMap(db, viewerDid, collection)
  for (const rec of Object.values(map)) {
    if (rec?.value?.subject?.uri === subjectUri) {
      return rec.uri
    }
  }
  return undefined
}

function isBookmarkedByViewer(db, viewerDid, postUri) {
  if (!viewerDid || !postUri) return false
  const list = db.bookmarks?.[viewerDid] || []
  return list.some(b => b.uri === postUri)
}

function countLocalInteractions(db, postUri) {
  let likeCount = 0
  let repostCount = 0
  let replyCount = 0
  let quoteCount = 0
  let bookmarkCount = 0

  for (const collections of Object.values(db.records)) {
    const likes = collections?.['app.bsky.feed.like']
    if (likes) {
      for (const rec of Object.values(likes)) {
        if (rec?.value?.subject?.uri === postUri) likeCount++
      }
    }
    const reposts = collections?.['app.bsky.feed.repost']
    if (reposts) {
      for (const rec of Object.values(reposts)) {
        if (rec?.value?.subject?.uri === postUri) repostCount++
      }
    }
    const posts = collections?.['app.bsky.feed.post']
    if (posts) {
      for (const rec of Object.values(posts)) {
        if (rec?.value?.reply?.parent?.uri === postUri) replyCount++
        const emb = rec?.value?.embed
        if (
          emb?.record?.uri === postUri ||
          emb?.record?.record?.uri === postUri
        ) {
          quoteCount++
        }
      }
    }
  }

  for (const list of Object.values(db.bookmarks || {})) {
    if (Array.isArray(list) && list.some(b => b.uri === postUri)) {
      bookmarkCount++
    }
  }

  return {likeCount, repostCount, replyCount, quoteCount, bookmarkCount}
}

function buildLocalProfileView(
  db,
  account,
  viewerDid,
  origin,
  detailed = false,
) {
  const profile = account.profile || {}
  const avatar = blobUrl(origin, account.did, profile.avatar)
  const banner = blobUrl(origin, account.did, profile.banner)
  const followingUri = findViewerFollowUri(db, viewerDid, account.did)
  const followedByUri = findViewerFollowUri(db, account.did, viewerDid)
  const muted = isActorMutedByViewer(db, viewerDid, account.did)
  const blockingUri = findViewerBlockUri(
    db,
    viewerDid,
    account.did,
    getCollectionMap,
  )
  const blockedByUri = findViewerBlockUri(
    db,
    account.did,
    viewerDid,
    getCollectionMap,
  )

  const viewer = {
    muted,
    blockedBy: Boolean(blockedByUri),
    ...(blockingUri ? {blocking: blockingUri} : {}),
    ...(followingUri ? {following: followingUri} : {}),
    ...(followedByUri ? {followedBy: followedByUri} : {}),
  }

  const isVerified =
    typeof account.verified === 'boolean'
      ? account.verified
      : Boolean(
          account.isOfficial ||
            account.isSystemQuanty ||
            account.did === QUANTY_SYSTEM_DID ||
            account.did === QUANTZING_OFFICIAL_DID,
        )

  const base = {
    did: account.did,
    handle: account.handle,
    displayName: profile.displayName || account.handle.split('.')[0],
    ...(avatar ? {avatar} : {}),
    ...(profile.description ? {description: profile.description} : {}),
    ...(profile.pronouns ? {pronouns: profile.pronouns} : {}),
    ...(isVerified
      ? {
          verification: {
            verifiedStatus: 'valid',
            trustedVerifierStatus:
              account.did === QUANTZING_OFFICIAL_DID ? 'valid' : 'none',
            verifications: [],
          },
        }
      : {}),
    associated: {
      chat: {allowIncoming: 'all'},
    },
    viewer,
    labels: Array.isArray(db.labels?.[account.did])
      ? db.labels[account.did]
      : [],
    createdAt: account.createdAt,
    indexedAt: account.createdAt,
  }

  if (!detailed) {
    return base
  }

  const postsCount = Object.keys(
    getCollectionMap(db, account.did, 'app.bsky.feed.post'),
  ).length
  const followsCount = Object.keys(
    getCollectionMap(db, account.did, 'app.bsky.graph.follow'),
  ).length
  let followersCount = 0
  for (const rec of getAllLocalRecords(db, 'app.bsky.graph.follow')) {
    if (rec?.value?.subject === account.did) followersCount++
  }

  return {
    ...base,
    ...(banner ? {banner} : {}),
    ...(profile.website ? {website: profile.website} : {}),
    ...(profile.pinnedPost ? {pinnedPost: profile.pinnedPost} : {}),
    followersCount,
    followsCount,
    postsCount,
  }
}

function hydrateEmbedView(db, authorDid, embed, viewerDid, origin, depth = 0) {
  if (!embed || typeof embed !== 'object') return undefined
  const type = embed.$type

  if (type === 'app.bsky.embed.images' && Array.isArray(embed.images)) {
    return {
      $type: 'app.bsky.embed.images#view',
      images: embed.images
        .map(img => {
          const url = blobUrl(origin, authorDid, img.image)
          if (!url) return null
          return {
            thumb: url,
            fullsize: url,
            alt: img.alt || '',
            ...(img.aspectRatio ? {aspectRatio: img.aspectRatio} : {}),
          }
        })
        .filter(Boolean),
    }
  }

  if (type === 'app.bsky.embed.video' && embed.video) {
    const cid = extractBlobCid(embed.video)
    const playlist = blobUrl(origin, authorDid, embed.video)
    if (cid && playlist) {
      return {
        $type: 'app.bsky.embed.video#view',
        cid,
        playlist,
        ...(embed.alt ? {alt: embed.alt} : {}),
        ...(embed.aspectRatio ? {aspectRatio: embed.aspectRatio} : {}),
        ...(embed.presentation ? {presentation: embed.presentation} : {}),
      }
    }
  }

  if (type === 'app.bsky.embed.external' && embed.external) {
    const thumb = blobUrl(origin, authorDid, embed.external.thumb)
    return {
      $type: 'app.bsky.embed.external#view',
      external: {
        uri: embed.external.uri,
        title: embed.external.title || '',
        description: embed.external.description || '',
        ...(thumb ? {thumb} : {}),
      },
    }
  }

  if (type === 'app.bsky.embed.record' && embed.record?.uri && depth < 1) {
    const resolved = resolveAtUri(db, embed.record.uri)
    if (resolved) {
      const targetRec =
        db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
      if (
        targetRec &&
        !isPostHiddenForViewer(db, targetRec, viewerDid, getCollectionMap)
      ) {
        const targetAuthor = resolved.account
        const counts = countLocalInteractions(db, targetRec.uri)
        return {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.embed.record#viewRecord',
            uri: targetRec.uri,
            cid: targetRec.cid,
            author: buildLocalProfileView(
              db,
              targetAuthor,
              viewerDid,
              origin,
              false,
            ),
            value: targetRec.value,
            labels: Array.isArray(db.labels?.[targetRec.uri])
              ? db.labels[targetRec.uri]
              : [],
            likeCount: counts.likeCount,
            replyCount: counts.replyCount,
            repostCount: counts.repostCount,
            quoteCount: counts.quoteCount,
            indexedAt: targetRec.indexedAt,
          },
        }
      }
    }
    return {
      $type: 'app.bsky.embed.record#view',
      record: {
        $type: 'app.bsky.embed.record#viewNotFound',
        uri: embed.record.uri,
        notFound: true,
      },
    }
  }

  if (type === 'app.bsky.embed.recordWithMedia' && depth < 1) {
    const media = hydrateEmbedView(
      db,
      authorDid,
      embed.media,
      viewerDid,
      origin,
      depth + 1,
    )
    const record = hydrateEmbedView(
      db,
      authorDid,
      embed.record,
      viewerDid,
      origin,
      depth,
    )
    if (media && record) {
      return {
        $type: 'app.bsky.embed.recordWithMedia#view',
        media,
        record,
      }
    }
  }

  return undefined
}

function buildLocalPostView(db, postRec, viewerDid, origin) {
  const author = db.accounts[postRec.repo]
  if (!author) return null
  const counts = countLocalInteractions(db, postRec.uri)
  const likeUri = findViewerReactionUri(
    db,
    viewerDid,
    'app.bsky.feed.like',
    postRec.uri,
  )
  const repostUri = findViewerReactionUri(
    db,
    viewerDid,
    'app.bsky.feed.repost',
    postRec.uri,
  )
  const bookmarked = isBookmarkedByViewer(db, viewerDid, postRec.uri)
  const embedView = hydrateEmbedView(
    db,
    postRec.repo,
    postRec.value?.embed,
    viewerDid,
    origin,
  )

  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: postRec.uri,
    cid: postRec.cid,
    author: buildLocalProfileView(db, author, viewerDid, origin, false),
    record: postRec.value,
    ...(embedView ? {embed: embedView} : {}),
    bookmarkCount: counts.bookmarkCount,
    replyCount: counts.replyCount,
    repostCount: counts.repostCount,
    likeCount: counts.likeCount,
    quoteCount: counts.quoteCount,
    indexedAt:
      postRec.indexedAt || postRec.value?.createdAt || new Date().toISOString(),
    viewer: {
      ...(likeUri ? {like: likeUri} : {}),
      ...(repostUri ? {repost: repostUri} : {}),
      bookmarked,
      threadMuted: false,
      embeddingDisabled: false,
    },
    labels: Array.isArray(db.labels?.[postRec.uri])
      ? db.labels[postRec.uri]
      : [],
  }
}

function hydrateLocalPosts(db, uris, viewerDid, origin) {
  const posts = []
  for (const uri of uris) {
    const resolved = resolveAtUri(db, uri)
    if (!resolved) continue
    const rec =
      db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
    if (!rec) continue
    if (isPostHiddenForViewer(db, rec, viewerDid, getCollectionMap)) continue
    const view = buildLocalPostView(db, rec, viewerDid, origin)
    if (view) posts.push(view)
  }
  return posts
}

function getLocalFeedItems(
  db,
  viewerDid,
  origin,
  {authorDid = null, includeReplies = false, filterTags = null, onlyVideo = false} = {},
) {
  const posts = authorDid
    ? Object.values(getCollectionMap(db, authorDid, 'app.bsky.feed.post'))
    : getAllLocalRecords(db, 'app.bsky.feed.post')

  const items = []
  for (const postRec of posts) {
    if (isPostHiddenForViewer(db, postRec, viewerDid, getCollectionMap)) continue
    if (!includeReplies && postRec.value?.reply) continue
    if (onlyVideo && !isVideoEmbed(postRec.value?.embed)) {
      continue
    }
    if (Array.isArray(filterTags) && filterTags.length > 0) {
      const lower = String(postRec.value?.text || '').toLowerCase()
      const hit = filterTags.some(
        tag => lower.includes(`#${tag}`) || lower.includes(tag),
      )
      if (!hit) continue
    }
    const postView = buildLocalPostView(db, postRec, viewerDid, origin)
    if (!postView) continue
    items.push({
      post: postView,
      _sortTime:
        Date.parse(postRec.value?.createdAt || postRec.indexedAt || 0) || 0,
    })
  }

  items.sort((a, b) => b._sortTime - a._sortTime)
  return items.map(({_sortTime, ...rest}) => rest)
}

function paginateItems(items, cursor, limit) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 30))
  const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
  const slice = items.slice(offset, offset + lim)
  const nextOffset = offset + slice.length
  return {
    items: slice,
    cursor: nextOffset < items.length ? String(nextOffset) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Sovereign Feed Generators, Dynamic Trends & Who-to-Follow
// ---------------------------------------------------------------------------

function buildFeedGeneratorView(db, spec, viewerDid, origin) {
  const creatorAcc = db.accounts[QUANTZING_OFFICIAL_DID]
  const uri = `at://${QUANTZING_OFFICIAL_DID}/app.bsky.feed.generator/${spec.rkey}`
  const avatar = creatorAcc
    ? blobUrl(origin, creatorAcc.did, creatorAcc.profile?.avatar)
    : undefined
  return {
    $type: 'app.bsky.feed.defs#generatorView',
    uri,
    cid: computeCid({uri, name: spec.displayName}, 'dag-cbor'),
    did: QUANTZING_DID,
    creator: creatorAcc
      ? buildLocalProfileView(db, creatorAcc, viewerDid, origin, false)
      : {
          did: QUANTZING_OFFICIAL_DID,
          handle: 'quantzing.quantzing.com',
          displayName: 'QuantZing',
        },
    displayName: spec.displayName,
    description: spec.description,
    ...(avatar ? {avatar} : {}),
    likeCount: 0,
    acceptsInteractions: false,
    labels: [],
    viewer: {},
    indexedAt: '2026-01-01T00:00:00.000Z',
  }
}

function computeSovereignTrends(db, viewerDid, origin, limit = 10) {
  const allPosts = getAllLocalRecords(db, 'app.bsky.feed.post')
  const buckets = new Map()

  const categoryForTag = tag => {
    const t = tag.toLowerCase()
    if (/ai|quanty|llm|agent|model/.test(t)) return 'AI & Tech'
    if (/india|delhi|bengaluru|mumbai/.test(t)) return 'India'
    if (/market|finance|crypto|stock|economy/.test(t)) return 'Markets'
    if (/startup|builder|founder|opensource|cloud|quantos|quantrinity/.test(t))
      return 'Technology'
    return 'QuantZing'
  }

  for (const rec of allPosts) {
    if (isPostHiddenForViewer(db, rec, viewerDid, getCollectionMap)) continue
    const text = String(rec.value?.text || '')
    const matches = text.match(/#[A-Za-z][A-Za-z0-9_]{1,40}/g) || []
    const createdAt = rec.value?.createdAt || rec.indexedAt || new Date().toISOString()
    for (const rawTag of matches) {
      const key = rawTag.toLowerCase()
      const existing = buckets.get(key) || {
        topic: rawTag.slice(1),
        displayName: rawTag,
        count: 0,
        latestAt: createdAt,
        snippet: text.slice(0, 140),
        actorDids: new Set(),
      }
      existing.count += 1
      if (createdAt > existing.latestAt) {
        existing.latestAt = createdAt
        existing.snippet = text.slice(0, 140)
      }
      existing.actorDids.add(rec.repo)
      buckets.set(key, existing)
    }
  }

  const sorted = [...buckets.values()].sort(
    (a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt),
  )

  return sorted.slice(0, Math.min(25, Math.max(1, limit))).map((entry, idx) => {
    const actors = [...entry.actorDids]
      .slice(0, 3)
      .map(did => db.accounts[did])
      .filter(Boolean)
      .map(acc => buildLocalProfileView(db, acc, viewerDid, origin, false))
    return {
      $type: 'app.bsky.unspecced.defs#trendView',
      topic: entry.topic,
      displayName: entry.displayName,
      description: entry.snippet,
      link: `/search?q=${encodeURIComponent(entry.displayName)}`,
      startedAt: entry.latestAt,
      postCount: entry.count,
      ...(idx < 2 ? {status: 'hot'} : {}),
      category: categoryForTag(entry.topic),
      actors,
    }
  })
}

function getSuggestedQuantZingActors(db, viewerDid, origin, limit = 10) {
  const candidates = []
  for (const acc of Object.values(db.accounts)) {
    if (!acc || acc.active === false) continue
    if (isAccountSuspendedOrBanned(acc)) continue
    if (viewerDid && acc.did === viewerDid) continue
    if (
      viewerDid &&
      (isActorMutedByViewer(db, viewerDid, acc.did) ||
        findViewerBlockUri(db, viewerDid, acc.did, getCollectionMap) ||
        findViewerBlockUri(db, acc.did, viewerDid, getCollectionMap))
    ) {
      continue
    }
    const alreadyFollowing = viewerDid
      ? Boolean(findViewerFollowUri(db, viewerDid, acc.did))
      : false
    const postsCount = Object.keys(
      getCollectionMap(db, acc.did, 'app.bsky.feed.post'),
    ).length
    const priority =
      acc.did === QUANTY_SYSTEM_DID
        ? 100
        : acc.did === QUANTZING_OFFICIAL_DID
          ? 95
          : acc.did === QUANTRINITY_DID
            ? 90
            : acc.did === QUANTZING_NEWS_DID
              ? 85
              : acc.did === QUANT_BUILDERS_DID
                ? 80
                : 50 + postsCount
    candidates.push({
      acc,
      alreadyFollowing,
      priority,
    })
  }

  // Prefer accounts not yet followed by viewer, then rank by priority
  candidates.sort(
    (a, b) =>
      Number(a.alreadyFollowing) - Number(b.alreadyFollowing) ||
      b.priority - a.priority,
  )

  return candidates
    .slice(0, Math.min(50, Math.max(1, limit)))
    .map(c => buildLocalProfileView(db, c.acc, viewerDid, origin, false))
}

// ---------------------------------------------------------------------------
// Real Sovereign Notifications Engine
// ---------------------------------------------------------------------------

function buildLocalNotifications(db, viewerDid, origin, limit = 40) {
  const viewerAcc = db.accounts[viewerDid]
  if (!viewerAcc) return []
  const seenAt = viewerAcc.notificationsSeenAt || '1970-01-01T00:00:00.000Z'
  const notifications = []

  const isActorHidden = authorAcc =>
    !authorAcc ||
    isAccountSuspendedOrBanned(authorAcc) ||
    isActorMutedByViewer(db, viewerDid, authorAcc.did) ||
    Boolean(findViewerBlockUri(db, viewerDid, authorAcc.did, getCollectionMap)) ||
    Boolean(findViewerBlockUri(db, authorAcc.did, viewerDid, getCollectionMap))

  // 1. Followers
  for (const rec of getAllLocalRecords(db, 'app.bsky.graph.follow')) {
    if (rec.repo === viewerDid || rec.value?.subject !== viewerDid) continue
    const authorAcc = db.accounts[rec.repo]
    if (isActorHidden(authorAcc)) continue
    const indexedAt = rec.indexedAt || rec.value?.createdAt || new Date().toISOString()
    notifications.push({
      uri: rec.uri,
      cid: rec.cid,
      author: buildLocalProfileView(db, authorAcc, viewerDid, origin, false),
      reason: 'follow',
      record: rec.value,
      isRead: indexedAt <= seenAt,
      indexedAt,
      labels: [],
    })
  }

  // 2. Likes & Reposts on viewer's posts
  const viewerPostUris = new Set(
    Object.values(getCollectionMap(db, viewerDid, 'app.bsky.feed.post')).map(
      p => p.uri,
    ),
  )

  for (const rec of getAllLocalRecords(db, 'app.bsky.feed.like')) {
    const subjectUri = rec.value?.subject?.uri
    if (rec.repo === viewerDid || !viewerPostUris.has(subjectUri)) continue
    const authorAcc = db.accounts[rec.repo]
    if (isActorHidden(authorAcc)) continue
    const indexedAt = rec.indexedAt || rec.value?.createdAt || new Date().toISOString()
    notifications.push({
      uri: rec.uri,
      cid: rec.cid,
      author: buildLocalProfileView(db, authorAcc, viewerDid, origin, false),
      reason: 'like',
      reasonSubject: subjectUri,
      record: rec.value,
      isRead: indexedAt <= seenAt,
      indexedAt,
      labels: [],
    })
  }

  for (const rec of getAllLocalRecords(db, 'app.bsky.feed.repost')) {
    const subjectUri = rec.value?.subject?.uri
    if (rec.repo === viewerDid || !viewerPostUris.has(subjectUri)) continue
    const authorAcc = db.accounts[rec.repo]
    if (isActorHidden(authorAcc)) continue
    const indexedAt = rec.indexedAt || rec.value?.createdAt || new Date().toISOString()
    notifications.push({
      uri: rec.uri,
      cid: rec.cid,
      author: buildLocalProfileView(db, authorAcc, viewerDid, origin, false),
      reason: 'repost',
      reasonSubject: subjectUri,
      record: rec.value,
      isRead: indexedAt <= seenAt,
      indexedAt,
      labels: [],
    })
  }

  // 3. Replies, Quotes & Mentions targeting viewer
  const handleNeedle = `@${viewerAcc.handle.toLowerCase()}`
  const shortNeedle = `@${viewerAcc.handle.split('.')[0].toLowerCase()}`
  for (const rec of getAllLocalRecords(db, 'app.bsky.feed.post')) {
    if (rec.repo === viewerDid) continue
    if (isPostHiddenForViewer(db, rec, viewerDid, getCollectionMap)) continue
    const authorAcc = db.accounts[rec.repo]
    if (!authorAcc) continue
    const parentUri = rec.value?.reply?.parent?.uri
    const isReplyToViewer = parentUri && viewerPostUris.has(parentUri)
    const quotedUri =
      rec.value?.embed?.$type === 'app.bsky.embed.record'
        ? rec.value?.embed?.record?.uri
        : rec.value?.embed?.$type === 'app.bsky.embed.recordWithMedia'
          ? rec.value?.embed?.record?.record?.uri
          : null
    const isQuoteOfViewer = quotedUri && viewerPostUris.has(quotedUri)
    const textLower = String(rec.value?.text || '').toLowerCase()
    const isMention =
      textLower.includes(handleNeedle) ||
      new RegExp(`(?:^|\\s)${shortNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
        textLower,
      )
    if (!isReplyToViewer && !isQuoteOfViewer && !isMention) continue
    const indexedAt = rec.indexedAt || rec.value?.createdAt || new Date().toISOString()
    const reason = isReplyToViewer
      ? 'reply'
      : isQuoteOfViewer
        ? 'quote'
        : 'mention'
    const reasonSubject = isReplyToViewer
      ? parentUri
      : isQuoteOfViewer
        ? quotedUri
        : undefined
    notifications.push({
      uri: rec.uri,
      cid: rec.cid,
      author: buildLocalProfileView(db, authorAcc, viewerDid, origin, false),
      reason,
      ...(reasonSubject ? {reasonSubject} : {}),
      record: rec.value,
      isRead: indexedAt <= seenAt,
      indexedAt,
      labels: [],
    })
  }

  notifications.sort((a, b) =>
    String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
  )
  return notifications.slice(0, limit)
}

function buildGroupedNotifications(
  db,
  viewerDid,
  origin,
  feed = 'all',
  limit = 30,
) {
  const viewerAcc = db.accounts[viewerDid]
  if (!viewerAcc) {
    return {groups: [], relatedViews: [], seenAt: new Date().toISOString()}
  }
  const seenAt = viewerAcc.notificationsSeenAt || '1970-01-01T00:00:00.000Z'
  const raw = buildLocalNotifications(db, viewerDid, origin, 100)

  const followingSet = new Set(
    Object.values(getCollectionMap(db, viewerDid, 'app.bsky.graph.follow'))
      .map(r => r.value?.subject)
      .filter(Boolean),
  )

  const filtered = raw.filter(n => {
    if (feed === 'people-i-follow') return followingSet.has(n.author?.did)
    if (feed === 'conversations')
      return n.reason === 'reply' || n.reason === 'quote' || n.reason === 'mention'
    if (feed === 'followers') return n.reason === 'follow'
    if (feed === 'activity') return n.reason === 'like' || n.reason === 'repost'
    return true
  })

  const profileViews = new Map()
  const postViews = new Map()

  const registerProfile = did => {
    if (!did || profileViews.has(did)) return
    const acc = db.accounts[did]
    if (!acc) return
    profileViews.set(did, {
      $type: 'app.bsky.actor.defs#profileViewBasic',
      ...buildLocalProfileView(db, acc, viewerDid, origin, false),
    })
  }

  const registerPost = uri => {
    if (!uri || postViews.has(uri)) return
    const resolved = resolveAtUri(db, uri)
    if (!resolved) return
    const rec =
      db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
    if (!rec) return
    const pv = buildLocalPostView(db, rec, viewerDid, origin)
    if (pv) postViews.set(uri, pv)
  }

  const groups = []
  const likeBuckets = new Map()
  const repostBuckets = new Map()
  let followBucket = null

  for (const n of filtered) {
    const actorDid = n.author?.did
    if (!actorDid) continue
    registerProfile(actorDid)

    if (n.reason === 'follow') {
      if (!followBucket) {
        followBucket = {
          $type: 'app.bsky.notification.getGroupedNotifications#group',
          id: `follow:${n.indexedAt}`,
          kind: {
            $type: 'app.bsky.notification.getGroupedNotifications#followGroup',
            items: [],
          },
          count: 0,
          isRead: n.isRead,
          indexedAt: n.indexedAt,
        }
        groups.push(followBucket)
      }
      if (!followBucket.kind.items.some(i => i.actor === actorDid)) {
        followBucket.kind.items.push({
          $type: 'app.bsky.notification.getGroupedNotifications#followItem',
          actor: actorDid,
        })
        followBucket.count = followBucket.kind.items.length
        if (!n.isRead) followBucket.isRead = false
      }
      continue
    }

    if (n.reason === 'like' && n.reasonSubject) {
      registerPost(n.reasonSubject)
      if (!postViews.has(n.reasonSubject)) continue
      let bucket = likeBuckets.get(n.reasonSubject)
      if (!bucket) {
        bucket = {
          $type: 'app.bsky.notification.getGroupedNotifications#group',
          id: `like:${n.reasonSubject}`,
          kind: {
            $type: 'app.bsky.notification.getGroupedNotifications#likeGroup',
            post: n.reasonSubject,
            items: [],
          },
          count: 0,
          isRead: n.isRead,
          indexedAt: n.indexedAt,
        }
        likeBuckets.set(n.reasonSubject, bucket)
        groups.push(bucket)
      }
      if (!bucket.kind.items.some(i => i.actor === actorDid)) {
        bucket.kind.items.push({
          $type: 'app.bsky.notification.getGroupedNotifications#likeItem',
          actor: actorDid,
        })
        bucket.count = bucket.kind.items.length
        if (!n.isRead) bucket.isRead = false
      }
      continue
    }

    if (n.reason === 'repost' && n.reasonSubject) {
      registerPost(n.reasonSubject)
      if (!postViews.has(n.reasonSubject)) continue
      let bucket = repostBuckets.get(n.reasonSubject)
      if (!bucket) {
        bucket = {
          $type: 'app.bsky.notification.getGroupedNotifications#group',
          id: `repost:${n.reasonSubject}`,
          kind: {
            $type: 'app.bsky.notification.getGroupedNotifications#repostGroup',
            post: n.reasonSubject,
            items: [],
          },
          count: 0,
          isRead: n.isRead,
          indexedAt: n.indexedAt,
        }
        repostBuckets.set(n.reasonSubject, bucket)
        groups.push(bucket)
      }
      if (!bucket.kind.items.some(i => i.actor === actorDid)) {
        bucket.kind.items.push({
          $type: 'app.bsky.notification.getGroupedNotifications#repostItem',
          actor: actorDid,
        })
        bucket.count = bucket.kind.items.length
        if (!n.isRead) bucket.isRead = false
      }
      continue
    }

    if (n.reason === 'reply' && n.reasonSubject) {
      registerPost(n.uri)
      registerPost(n.reasonSubject)
      if (!postViews.has(n.uri)) continue
      groups.push({
        $type: 'app.bsky.notification.getGroupedNotifications#group',
        id: `reply:${n.uri}`,
        kind: {
          $type: 'app.bsky.notification.getGroupedNotifications#replyNotification',
          post: n.uri,
          parent: n.reasonSubject,
        },
        count: 1,
        isRead: n.isRead,
        indexedAt: n.indexedAt,
      })
      continue
    }

    if (n.reason === 'quote' && n.reasonSubject) {
      registerPost(n.uri)
      registerPost(n.reasonSubject)
      if (!postViews.has(n.uri)) continue
      groups.push({
        $type: 'app.bsky.notification.getGroupedNotifications#group',
        id: `quote:${n.uri}`,
        kind: {
          $type: 'app.bsky.notification.getGroupedNotifications#quoteNotification',
          post: n.uri,
          parent: n.reasonSubject,
        },
        count: 1,
        isRead: n.isRead,
        indexedAt: n.indexedAt,
      })
      continue
    }

    if (n.reason === 'mention') {
      registerPost(n.uri)
      if (!postViews.has(n.uri)) continue
      groups.push({
        $type: 'app.bsky.notification.getGroupedNotifications#group',
        id: `mention:${n.uri}`,
        kind: {
          $type: 'app.bsky.notification.getGroupedNotifications#mentionNotification',
          post: n.uri,
        },
        count: 1,
        isRead: n.isRead,
        indexedAt: n.indexedAt,
      })
    }
  }

  groups.sort((a, b) =>
    String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
  )

  return {
    groups: groups.slice(0, limit),
    seenAt,
    relatedViews: [...profileViews.values(), ...postViews.values()],
  }
}

// ---------------------------------------------------------------------------
// Sovereign Link Metadata Extractor (replaces cardyb.bsky.app)
// ---------------------------------------------------------------------------

function isPrivateOrBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  )
}

function fetchLinkMetaSafe(rawUrl, redirectsLeft = 3) {
  return new Promise(resolve => {
    let parsed
    try {
      parsed = new URL(rawUrl)
    } catch {
      resolve({error: 'Invalid URL', title: '', description: '', image: ''})
      return
    }
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      isPrivateOrBlockedHost(parsed.hostname)
    ) {
      resolve({
        error: '',
        likely_type: 'html',
        url: rawUrl,
        title: parsed.hostname || rawUrl,
        description: '',
        image: '',
      })
      return
    }
    const client = parsed.protocol === 'https:' ? https : http
    const req = client.get(
      parsed,
      {
        timeout: 4000,
        headers: {
          'user-agent': 'QuantZingLinkPreview/1.0 (+https://quantzing.com)',
          accept: 'text/html,application/xhtml+xml',
        },
      },
      res => {
        const status = res.statusCode || 200
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume()
          try {
            const nextUrl = new URL(res.headers.location, parsed).toString()
            fetchLinkMetaSafe(nextUrl, redirectsLeft - 1).then(resolve)
            return
          } catch {}
        }
        let html = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          html += chunk
          if (html.length > 65536) {
            res.destroy()
          }
        })
        const done = () => {
          const titleMatch =
            html.match(
              /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
            ) || html.match(/<title[^>]*>([^<]+)<\/title>/i)
          const descMatch =
            html.match(
              /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
            ) ||
            html.match(
              /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
            )
          const imgMatch = html.match(
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          )
          const rawTitle = (titleMatch?.[1] || parsed.hostname).trim()
          const cleanTitle = /^30[1278]\s+/i.test(rawTitle)
            ? parsed.hostname
            : rawTitle
          resolve({
            error: '',
            likely_type: 'html',
            url: rawUrl,
            title: cleanTitle.slice(0, 200),
            description: (descMatch?.[1] || '').trim().slice(0, 400),
            image: imgMatch?.[1]?.trim() || '',
          })
        }
        res.on('end', done)
        res.on('close', done)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({
        error: '',
        likely_type: 'html',
        url: rawUrl,
        title: parsed.hostname,
        description: '',
        image: '',
      })
    })
    req.on('error', () => {
      resolve({
        error: '',
        likely_type: 'html',
        url: rawUrl,
        title: parsed.hostname,
        description: '',
        image: '',
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Sovereign Direct Messages (chat.bsky.convo.*)
// ---------------------------------------------------------------------------

function buildConvoView(db, convo, viewerDid, origin) {
  const members = (convo.members || [])
    .map(did => db.accounts[did])
    .filter(Boolean)
    .map(acc => ({
      ...buildLocalProfileView(db, acc, viewerDid, origin, false),
      chatDisabled: false,
    }))
  const messages = Array.isArray(convo.messages) ? convo.messages : []
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined
  const readRev = convo.readBy?.[viewerDid] || ''
  const unreadCount = messages.filter(
    m => m.sender?.did !== viewerDid && m.rev > readRev,
  ).length
  return {
    $type: 'chat.bsky.convo.defs#convoView',
    id: convo.id,
    rev: convo.rev || '1',
    kind: {$type: 'chat.bsky.convo.defs#directConvo'},
    members,
    ...(lastMsg ? {lastMessage: lastMsg} : {}),
    muted: Boolean(convo.mutedBy?.[viewerDid]),
    status: 'accepted',
    unreadCount,
  }
}

// ---------------------------------------------------------------------------
// Route predicate & main Sovereign XRPC handler
// ---------------------------------------------------------------------------

export function isQuantZingPdsRoute(urlPath) {
  const pathname = String(urlPath || '/').split('?')[0]
  return (
    pathname.startsWith('/xrpc/') ||
    pathname.startsWith('/blob/') ||
    pathname.startsWith('/api/quantzing/') ||
    pathname === '/.well-known/did.json'
  )
}

export async function handleQuantZingPds(req, res) {
  const rawUrl = req.url || '/'
  if (!isQuantZingPdsRoute(rawUrl)) {
    return false
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req, {'cache-control': 'no-store'}))
    res.end()
    return true
  }

  const origin = getServerOrigin(req)
  let parsedUrl
  try {
    parsedUrl = new URL(rawUrl, origin)
  } catch {
    sendXrpcError(req, res, 400, 'InvalidRequest', 'Malformed request URL')
    return true
  }

  const {pathname, searchParams} = parsedUrl
  const method = (req.method || 'GET').toUpperCase()
  const db = loadDb()

  // -------------------------------------------------------------------------
  // Sovereign QuantZing Config, Geolocation, Link Meta, Quanty Mention & DID
  // -------------------------------------------------------------------------

  if (pathname === '/api/quantzing/config') {
    sendJson(req, res, 200, {
      ok: true,
      app: 'QuantZing',
      domain: 'quantzing.quantrinity.in',
      primaryDomain: 'quantzing.com',
      did: QUANTZING_DID,
      pds: origin,
      appView: origin,
      mode: 'sovereign-pure',
      blueskyUpstream: false,
      features: {
        localPds: true,
        sovereignAppView: true,
        publicAppViewProxy: false,
        blobStorage: true,
        bookmarks: true,
        quantyMentions: true,
        directMessages: true,
      },
    })
    return true
  }

  if (pathname === '/api/quantzing/geolocation') {
    sendJson(req, res, 200, {
      countryCode: 'IN',
      regionCode: 'DL',
      city: 'New Delhi',
      isAgeRestrictedGeo: false,
      isAgeBlockedGeo: false,
    })
    return true
  }

  if (pathname === '/api/quantzing/link-meta' && method === 'GET') {
    const target = searchParams.get('url') || ''
    const meta = await fetchLinkMetaSafe(target)
    sendJson(req, res, 200, meta)
    return true
  }

  if (pathname === '/api/quantzing/link-favicon' && method === 'GET') {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#16181C"/><circle cx="16" cy="16" r="9" fill="none" stroke="#1D9BF0" stroke-width="2"/><path d="M7 16h18M16 7a13 13 0 0 1 0 18M16 7a13 13 0 0 0 0 18" fill="none" stroke="#1D9BF0" stroke-width="1.5"/></svg>',
      'utf8',
    )
    res.writeHead(
      200,
      corsHeaders(req, {
        'content-type': 'image/svg+xml',
        'content-length': svg.length,
        'cache-control': 'public, max-age=86400',
      }),
    )
    res.end(svg)
    return true
  }

  if (pathname.startsWith('/api/quantzing/gifs')) {
    sendJson(req, res, 200, {results: [], next: ''})
    return true
  }

  if (pathname.startsWith('/api/quantzing/events')) {
    sendJson(req, res, 200, {status: 200, ok: true, features: {}})
    return true
  }

  if (pathname === '/api/quantzing/live-events/config') {
    sendJson(req, res, 200, {feeds: []})
    return true
  }

  if (pathname === '/api/quantzing/app-config/config') {
    sendJson(req, res, 200, {liveNow: {allow: [], exceptions: []}})
    return true
  }

  if (pathname === '/api/quantzing/quanty-mention' && method === 'POST') {
    const body = await readJsonBody(req)
    const text = String(body.text || '')
    const parentText = String(body.parentText || '')
    const authorHandle = String(body.authorHandle || 'member.quantzing.com')
    ensureSovereignGenesis(db)
    const replyText = synthesizeQuantyReplyText(
      db,
      text,
      parentText,
      authorHandle,
    )
    const replyRkey = generateTid()
    const createdAt = new Date().toISOString()
    const facets = buildFacetsForText(db, replyText)
    const replyValue = {
      $type: 'app.bsky.feed.post',
      text: replyText,
      createdAt,
      langs: ['en'],
      ...(facets ? {facets} : {}),
      ...(body.postUri && body.postCid
        ? {
            reply: {
              root:
                body.rootUri && body.rootCid
                  ? {uri: String(body.rootUri), cid: String(body.rootCid)}
                  : {uri: String(body.postUri), cid: String(body.postCid)},
              parent: {uri: String(body.postUri), cid: String(body.postCid)},
            },
          }
        : {}),
    }
    const qCol = getCollectionMap(
      db,
      QUANTY_SYSTEM_DID,
      'app.bsky.feed.post',
      true,
    )
    const replyUri = `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/${replyRkey}`
    const replyCid = computeCid(replyValue, 'dag-cbor')
    qCol[replyRkey] = {
      uri: replyUri,
      cid: replyCid,
      rkey: replyRkey,
      collection: 'app.bsky.feed.post',
      repo: QUANTY_SYSTEM_DID,
      value: replyValue,
      indexedAt: createdAt,
    }
    saveDb(db)
    sendJson(req, res, 200, {
      ok: true,
      author: QUANTY_SYSTEM_HANDLE,
      did: QUANTY_SYSTEM_DID,
      replyUri,
      replyCid,
      replyText,
    })
    return true
  }

  if (
    pathname === '/api/quantzing/appeals' ||
    pathname === '/api/quantzing/admin' ||
    pathname.startsWith('/api/quantzing/admin/') ||
    pathname === '/api/quantzing/ops' ||
    pathname.startsWith('/api/quantzing/ops/')
  ) {
    return await handleQuantZingAdmin(req, res, {
      db,
      pathname,
      searchParams,
      method,
      origin,
      helpers: getAdminHelpers(),
    })
  }

  if (pathname === '/.well-known/did.json') {
    sendJson(req, res, 200, {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: QUANTZING_DID,
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: origin,
        },
      ],
    })
    return true
  }

  // -------------------------------------------------------------------------
  // Sovereign Blob serving: GET /blob/:did/:cid or GET /blob/:cid
  // -------------------------------------------------------------------------

  if (pathname.startsWith('/blob/')) {
    const segments = pathname.slice('/blob/'.length).split('/').filter(Boolean)
    const cid = decodeURIComponent(segments[segments.length - 1] || '')
    if (!cid || cid.includes('..') || cid.includes('/') || cid.includes('\\')) {
      sendXrpcError(req, res, 400, 'InvalidRequest', 'Invalid blob CID')
      return true
    }
    const blobFile = path.join(getBlobsDir(), cid)
    if (!fs.existsSync(blobFile)) {
      sendXrpcError(req, res, 404, 'BlobNotFound', 'Blob not found')
      return true
    }
    const meta = db.blobs[cid]
    const stat = fs.statSync(blobFile)
    const total = stat.size
    const contentType = meta?.mimeType || 'application/octet-stream'
    const rangeHeader = String(req.headers.range || '')

    if (rangeHeader.startsWith('bytes=')) {
      const [startStr, endStr] = rangeHeader.slice(6).split('-')
      const start = startStr ? Math.max(0, parseInt(startStr, 10) || 0) : 0
      const end = endStr
        ? Math.min(total - 1, parseInt(endStr, 10) || total - 1)
        : total - 1
      if (start >= total || end < start) {
        res.writeHead(
          416,
          corsHeaders(req, {'content-range': `bytes */${total}`}),
        )
        res.end()
        return true
      }
      const chunkLen = end - start + 1
      res.writeHead(
        206,
        corsHeaders(req, {
          'content-type': contentType,
          'content-length': chunkLen,
          'content-range': `bytes ${start}-${end}/${total}`,
          'accept-ranges': 'bytes',
          'cache-control': 'public, max-age=31536000, immutable',
        }),
      )
      fs.createReadStream(blobFile, {start, end}).pipe(res)
      return true
    }

    res.writeHead(
      200,
      corsHeaders(req, {
        'content-type': contentType,
        'content-length': total,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=31536000, immutable',
      }),
    )
    fs.createReadStream(blobFile).pipe(res)
    return true
  }

  // -------------------------------------------------------------------------
  // Sovereign XRPC Router (/xrpc/<nsid>)
  // -------------------------------------------------------------------------

  if (!pathname.startsWith('/xrpc/')) {
    return false
  }

  const nsid = pathname.slice('/xrpc/'.length)

  try {
    if (nsid === '_health' && method === 'GET') {
      sendJson(req, res, 200, {
        version: '1.0.0',
        service: 'quant-zing',
        mode: 'sovereign-pure',
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 1. Server, Identity & Session (com.atproto.server.*, com.atproto.identity.*)
    // -----------------------------------------------------------------------

    if (nsid === 'com.atproto.identity.resolveHandle' && method === 'GET') {
      const handle = searchParams.get('handle') || ''
      const acc = findLocalAccount(db, handle)
      if (!acc) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Unable to resolve handle: ${handle}`,
        )
        return true
      }
      sendJson(req, res, 200, {did: acc.did})
      return true
    }

    if (nsid === 'com.atproto.server.describeServer' && method === 'GET') {
      sendJson(req, res, 200, {
        did: QUANTZING_DID,
        availableUserDomains: [QUANTZING_DOMAIN, QUANTZING_ALT_DOMAIN],
        inviteCodeRequired: false,
        phoneVerificationRequired: false,
        links: {
          privacyPolicy: `${origin}/privacy`,
          termsOfService: `${origin}/terms`,
        },
        contact: {
          email: 'support@quantzing.com',
        },
      })
      return true
    }

    if (
      nsid === 'com.atproto.temp.checkHandleAvailability' &&
      method === 'GET'
    ) {
      const handle = normalizeHandle(searchParams.get('handle') || '')
      const existing = findLocalAccount(db, handle)
      if (!existing) {
        sendJson(req, res, 200, {
          handle,
          result: {
            $type: 'com.atproto.temp.checkHandleAvailability#resultAvailable',
          },
        })
      } else {
        const base = handle.split('.')[0]
        sendJson(req, res, 200, {
          handle,
          result: {
            $type: 'com.atproto.temp.checkHandleAvailability#resultUnavailable',
            suggestions: [
              {handle: `${base}1${QUANTZING_DOMAIN}`, method: 'suffix'},
              {handle: `${base}zing${QUANTZING_DOMAIN}`, method: 'suffix'},
            ],
          },
        })
      }
      return true
    }

    if (nsid === 'com.atproto.server.createAccount' && method === 'POST') {
      const optAuth = getAuthedContext(req, db)
      if (
        enforceRateLimit(req, res, {
          bucketKey: `signup:${getClientIp(req)}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_SIGNUP_MAX) || 20,
          windowMs: 15 * 60 * 1000,
          auth: optAuth,
          sendJson,
        })
      ) {
        return true
      }

      const body = await readJsonBody(req)
      const handle = normalizeHandle(body.handle)
      const email = body.email
        ? String(body.email).trim().toLowerCase()
        : undefined
      const password = typeof body.password === 'string' ? body.password : ''

      if (!isValidHandleFormat(handle)) {
        sendXrpcError(req, res, 400, 'InvalidHandle', 'Invalid handle format')
        return true
      }
      if (!password || password.length < 1) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidPassword',
          'Password is required',
        )
        return true
      }

      for (const acc of Object.values(db.accounts)) {
        if (acc.handle.toLowerCase() === handle) {
          sendXrpcError(
            req,
            res,
            400,
            'HandleNotAvailable',
            'That handle is already taken on QuantZing',
          )
          return true
        }
        if (email && acc.email && acc.email.toLowerCase() === email) {
          sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'An account with that email already exists',
          )
          return true
        }
      }

      const did = createPlcDid()
      const {salt, hash} = hashPassword(password)
      const createdAt = new Date().toISOString()
      const displayName = handle.split('.')[0]

      const account = {
        did,
        handle,
        email,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt,
        active: true,
        role: isConfiguredAdminHandle(handle) ? 'super_admin' : 'user',
        department: isConfiguredAdminHandle(handle) ? 'Leadership' : '',
        tokenVersion: 1,
        offboardedAt: null,
        lastOpsLoginAt: null,
        status: 'active',
        statusReason: '',
        suspendedUntil: null,
        warnings: [],
        verified: false,
        emailConfirmed: true,
        emailAuthFactor: false,
        profile: {
          displayName,
          description: '',
          avatar: null,
          banner: null,
          createdAt,
        },
        preferences: createDefaultPreferences(),
        notificationPreferences: createDefaultNotificationPreferences(),
      }

      db.accounts[did] = account
      putLocalRecord(db, did, 'app.bsky.actor.profile', 'self', {
        $type: 'app.bsky.actor.profile',
        displayName,
        description: '',
        createdAt,
      })

      const tokens = mintTokens(db, did)
      saveDb(db)

      sendJson(req, res, 200, {
        ...tokens,
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        active: true,
      })
      return true
    }

    if (nsid === 'com.atproto.server.createSession' && method === 'POST') {
      const optAuth = getAuthedContext(req, db)
      if (
        enforceRateLimit(req, res, {
          bucketKey: `login:${getClientIp(req)}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_LOGIN_MAX) || 40,
          windowMs: 15 * 60 * 1000,
          auth: optAuth,
          sendJson,
        })
      ) {
        return true
      }

      const body = await readJsonBody(req)
      const identifier = String(body.identifier || '').trim()
      const password = typeof body.password === 'string' ? body.password : ''

      if (!identifier || !password) {
        sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Invalid identifier or password',
        )
        return true
      }

      const account = findLocalAccount(db, identifier)
      if (
        !account ||
        !verifyPassword(password, account.passwordSalt, account.passwordHash)
      ) {
        sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Invalid identifier or password',
        )
        return true
      }

      const enforcement = checkAccountEnforcement(db, account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }

      const tokens = mintTokens(db, account.did)
      sendJson(req, res, 200, {
        ...tokens,
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        email: account.email,
        emailConfirmed: true,
        emailAuthFactor: false,
        active: true,
      })
      return true
    }

    if (nsid === 'com.atproto.server.getSession' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          auth.message || 'Authentication required',
        )
        return true
      }
      const {account} = auth
      sendJson(req, res, 200, {
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        email: account.email,
        emailConfirmed: true,
        emailAuthFactor: false,
        active: true,
      })
      return true
    }

    if (nsid === 'com.atproto.server.refreshSession' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        expectedScope: 'com.atproto.refresh',
      })
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          auth.message || 'Invalid refresh token',
        )
        return true
      }
      const {account} = auth
      const enforcement = checkAccountEnforcement(db, account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      const tokens = mintTokens(db, account.did)
      sendJson(req, res, 200, {
        ...tokens,
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        active: true,
      })
      return true
    }

    if (nsid === 'com.atproto.server.deleteSession' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: [
          'com.atproto.access',
          'com.atproto.refresh',
          'quantzing.ops',
        ],
      })
      if (auth.payload?.jti) {
        db.revokedTokens.push(auth.payload.jti)
        if (db.revokedTokens.length > 500) {
          db.revokedTokens = db.revokedTokens.slice(-500)
        }
        saveDb(db)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'com.atproto.server.checkAccountStatus' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          auth.message || 'Authentication required',
        )
        return true
      }
      sendJson(req, res, 200, {
        activated: true,
        validDid: true,
        repoCommit: computeCid({did: auth.did}, 'dag-cbor'),
        repoRev: generateTid(),
        repoBlocks: 1,
        indexedRecords: Object.values(db.records[auth.did] || {}).reduce(
          (sum, c) => sum + Object.keys(c || {}).length,
          0,
        ),
        privateStateValues: 0,
        expectedBlobs: 0,
        importedBlobs: 0,
      })
      return true
    }

    if (nsid === 'com.atproto.server.getServiceAuth' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          auth.message || 'Authentication required',
        )
        return true
      }
      const requestedExp = Number(searchParams.get('exp'))
      const nowSec = Math.floor(Date.now() / 1000)
      const ttlSeconds =
        Number.isFinite(requestedExp) && requestedExp > nowSec
          ? Math.max(60, Math.min(1800, Math.floor(requestedExp - nowSec)))
          : 300
      const token = signJwt(db, {
        did: auth.did,
        scope: 'com.atproto.serviceAuth',
        ttlSeconds,
        tv: Number(auth.account?.tokenVersion) || 1,
      })
      sendJson(req, res, 200, {token})
      return true
    }

    // -----------------------------------------------------------------------
    // 2. Repository & Blobs (com.atproto.repo.*, com.atproto.sync.*)
    // -----------------------------------------------------------------------

    if (nsid === 'com.atproto.repo.createRecord' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      if (
        enforceRateLimit(req, res, {
          bucketKey: `write:${auth.did}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_WRITE_MAX) || 60,
          windowMs: 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      if (!collection || !body.record || typeof body.record !== 'object') {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'collection and record are required',
        )
        return true
      }
      const entry = putLocalRecord(
        db,
        auth.did,
        collection,
        body.rkey ? String(body.rkey) : undefined,
        body.record,
      )
      saveDb(db)
      sendJson(req, res, 200, {
        uri: entry.uri,
        cid: entry.cid,
        commit: {cid: entry.cid, rev: generateTid()},
        validationStatus: 'valid',
      })
      return true
    }

    if (nsid === 'com.atproto.repo.putRecord' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      const rkey = String(body.rkey || '')
      if (
        !collection ||
        !rkey ||
        !body.record ||
        typeof body.record !== 'object'
      ) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'collection, rkey, and record are required',
        )
        return true
      }
      const entry = putLocalRecord(db, auth.did, collection, rkey, body.record)
      saveDb(db)
      sendJson(req, res, 200, {
        uri: entry.uri,
        cid: entry.cid,
        commit: {cid: entry.cid, rev: generateTid()},
        validationStatus: 'valid',
      })
      return true
    }

    if (nsid === 'com.atproto.repo.deleteRecord' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      const rkey = String(body.rkey || '')
      if (!collection || !rkey) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'collection and rkey are required',
        )
        return true
      }
      deleteLocalRecord(db, auth.did, collection, rkey)
      saveDb(db)
      const rev = generateTid()
      sendJson(req, res, 200, {
        commit: {
          cid: computeCid(
            {deleted: `${auth.did}/${collection}/${rkey}`, rev},
            'dag-cbor',
          ),
          rev,
        },
      })
      return true
    }

    if (nsid === 'com.atproto.repo.applyWrites' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      if (
        enforceRateLimit(req, res, {
          bucketKey: `write:${auth.did}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_WRITE_MAX) || 60,
          windowMs: 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }
      const body = await readJsonBody(req)
      const writes = Array.isArray(body.writes) ? body.writes : []
      const results = []
      let lastCid = computeCid({did: auth.did, ts: Date.now()}, 'dag-cbor')

      for (const write of writes) {
        const type = write?.$type
        const collection = String(write?.collection || '')
        if (!collection) continue

        if (type === 'com.atproto.repo.applyWrites#create') {
          const entry = putLocalRecord(
            db,
            auth.did,
            collection,
            write.rkey ? String(write.rkey) : undefined,
            write.value || {},
          )
          lastCid = entry.cid
          results.push({
            $type: 'com.atproto.repo.applyWrites#createResult',
            uri: entry.uri,
            cid: entry.cid,
            validationStatus: 'valid',
          })
        } else if (type === 'com.atproto.repo.applyWrites#update') {
          const entry = putLocalRecord(
            db,
            auth.did,
            collection,
            String(write.rkey || generateTid()),
            write.value || {},
          )
          lastCid = entry.cid
          results.push({
            $type: 'com.atproto.repo.applyWrites#updateResult',
            uri: entry.uri,
            cid: entry.cid,
            validationStatus: 'valid',
          })
        } else if (type === 'com.atproto.repo.applyWrites#delete') {
          deleteLocalRecord(db, auth.did, collection, String(write.rkey || ''))
          results.push({
            $type: 'com.atproto.repo.applyWrites#deleteResult',
          })
        }
      }

      saveDb(db)
      sendJson(req, res, 200, {
        commit: {cid: lastCid, rev: generateTid()},
        results,
      })
      return true
    }

    if (nsid === 'com.atproto.repo.getRecord' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const collection = searchParams.get('collection') || ''
      const rkey = searchParams.get('rkey') || ''
      const localAcc = findLocalAccount(db, repo)
      if (!localAcc) {
        sendXrpcError(
          req,
          res,
          400,
          'RecordNotFound',
          `Account not found on QuantZing: ${repo}`,
        )
        return true
      }
      const rec = db.records?.[localAcc.did]?.[collection]?.[rkey]
      if (!rec) {
        if (collection === 'chat.bsky.actor.declaration' && rkey === 'self') {
          const decl = putLocalRecord(
            db,
            localAcc.did,
            'chat.bsky.actor.declaration',
            'self',
            {allowIncoming: 'all'},
          )
          saveDb(db)
          sendJson(req, res, 200, {
            uri: decl.uri,
            cid: decl.cid,
            value: decl.value,
          })
          return true
        }
        if (
          collection === 'app.bsky.notification.declaration' &&
          rkey === 'self'
        ) {
          const decl = putLocalRecord(
            db,
            localAcc.did,
            'app.bsky.notification.declaration',
            'self',
            {allowSubscriptions: 'followers'},
          )
          saveDb(db)
          sendJson(req, res, 200, {
            uri: decl.uri,
            cid: decl.cid,
            value: decl.value,
          })
          return true
        }
        if (
          collection === 'app.bsky.actor.contentVisibilityDeclaration' &&
          rkey === 'self'
        ) {
          const decl = putLocalRecord(
            db,
            localAcc.did,
            'app.bsky.actor.contentVisibilityDeclaration',
            'self',
            {},
          )
          saveDb(db)
          sendJson(req, res, 200, {
            uri: decl.uri,
            cid: decl.cid,
            value: decl.value,
          })
          return true
        }
        sendXrpcError(
          req,
          res,
          400,
          'RecordNotFound',
          `Could not locate record: at://${localAcc.did}/${collection}/${rkey}`,
        )
        return true
      }
      sendJson(req, res, 200, {
        uri: rec.uri,
        cid: rec.cid,
        value: rec.value,
      })
      return true
    }

    if (nsid === 'com.atproto.repo.listRecords' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const collection = searchParams.get('collection') || ''
      const limit = Math.min(
        100,
        Math.max(1, Number(searchParams.get('limit') || 50)),
      )
      const reverse = searchParams.get('reverse') === 'true'
      const localAcc = findLocalAccount(db, repo)
      if (!localAcc) {
        sendJson(req, res, 200, {records: []})
        return true
      }
      const col = getCollectionMap(db, localAcc.did, collection)
      const records = Object.values(col)
        .sort((a, b) =>
          reverse
            ? a.rkey.localeCompare(b.rkey)
            : b.rkey.localeCompare(a.rkey),
        )
        .slice(0, limit)
        .map(r => ({uri: r.uri, cid: r.cid, value: r.value}))
      sendJson(req, res, 200, {records})
      return true
    }

    if (nsid === 'com.atproto.repo.describeRepo' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const localAcc = findLocalAccount(db, repo)
      if (!localAcc) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Could not find QuantZing repo: ${repo}`,
        )
        return true
      }
      sendJson(req, res, 200, {
        handle: localAcc.handle,
        did: localAcc.did,
        didDoc: buildDidDoc(localAcc, origin),
        collections: Object.keys(db.records[localAcc.did] || {}),
        handleIsCorrect: true,
      })
      return true
    }

    if (nsid === 'com.atproto.repo.uploadBlob' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      if (
        enforceRateLimit(req, res, {
          bucketKey: `upload:${auth.did}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_UPLOAD_MAX) || 30,
          windowMs: 5 * 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }
      const data = await readRawBody(req, MAX_BLOB_BODY_BYTES)
      const mimeType = String(
        req.headers['content-type'] || 'application/octet-stream',
      )
        .split(';')[0]
        .trim()
      const blob = storeLocalBlob(db, auth.did, data, mimeType)
      saveDb(db)
      sendJson(req, res, 200, {blob})
      return true
    }

    if (nsid === 'com.atproto.sync.getBlob' && method === 'GET') {
      const cid = searchParams.get('cid') || ''
      if (cid && !cid.includes('..') && !cid.includes('/')) {
        const blobFile = path.join(getBlobsDir(), cid)
        if (fs.existsSync(blobFile)) {
          const meta = db.blobs[cid]
          const data = fs.readFileSync(blobFile)
          res.writeHead(
            200,
            corsHeaders(req, {
              'content-type': meta?.mimeType || 'application/octet-stream',
              'content-length': data.length,
              'cache-control': 'public, max-age=31536000, immutable',
            }),
          )
          res.end(data)
          return true
        }
      }
      sendXrpcError(req, res, 404, 'BlobNotFound', 'Blob not found on QuantZing')
      return true
    }

    // -----------------------------------------------------------------------
    // 3. Actor Preferences, Profiles & Search (app.bsky.actor.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.actor.getPreferences' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      if (
        !Array.isArray(auth.account.preferences) ||
        auth.account.preferences.length === 0
      ) {
        auth.account.preferences = createDefaultPreferences()
        saveDb(db)
      } else if (
        !auth.account.preferences.some(
          p => p?.$type === 'app.bsky.actor.defs#personalDetailsPref',
        )
      ) {
        auth.account.preferences.push({
          $type: 'app.bsky.actor.defs#personalDetailsPref',
          birthDate: '1998-01-01T00:00:00.000Z',
        })
        saveDb(db)
      }
      sendJson(req, res, 200, {preferences: auth.account.preferences})
      return true
    }

    if (nsid === 'app.bsky.actor.putPreferences' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      if (!Array.isArray(body.preferences)) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'preferences array is required',
        )
        return true
      }
      auth.account.preferences = body.preferences
      saveDb(db)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.actor.getProfile' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          `Profile not found on QuantZing: ${actor}`,
        )
        return true
      }
      sendJson(
        req,
        res,
        200,
        buildLocalProfileView(db, localAcc, viewerDid, origin, true),
      )
      return true
    }

    if (nsid === 'app.bsky.actor.getProfiles' && method === 'GET') {
      const actors = searchParams.getAll('actors')
      const viewerDid = getOptionalViewerDid(req, db)
      const profiles = []
      for (const actor of actors) {
        const localAcc = findLocalAccount(db, actor)
        if (localAcc) {
          profiles.push(
            buildLocalProfileView(db, localAcc, viewerDid, origin, true),
          )
        }
      }
      sendJson(req, res, 200, {profiles})
      return true
    }

    if (
      (nsid === 'app.bsky.actor.searchActors' ||
        nsid === 'app.bsky.actor.searchActorsTypeahead') &&
      method === 'GET'
    ) {
      const q = (searchParams.get('q') || searchParams.get('term') || '')
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
      const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 25)))
      const viewerDid = getOptionalViewerDid(req, db)
      const matches = []
      for (const acc of Object.values(db.accounts)) {
        if (isAccountSuspendedOrBanned(acc)) continue
        const dn = String(acc.profile?.displayName || '').toLowerCase()
        const desc = String(acc.profile?.description || '').toLowerCase()
        if (
          !q ||
          acc.handle.toLowerCase().includes(q) ||
          dn.includes(q) ||
          desc.includes(q)
        ) {
          matches.push(buildLocalProfileView(db, acc, viewerDid, origin, false))
        }
      }
      sendJson(req, res, 200, {actors: matches.slice(0, limit)})
      return true
    }

    if (nsid === 'app.bsky.actor.getSuggestions' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 20)
      const viewerDid = getOptionalViewerDid(req, db)
      sendJson(req, res, 200, {
        actors: getSuggestedQuantZingActors(db, viewerDid, origin, limit),
        recIdStr: 'quantzing-suggestions-v1',
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 4. Sovereign Trends & Unspecced Suggestions (app.bsky.unspecced.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.unspecced.getTrends' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 10)
      const viewerDid = getOptionalViewerDid(req, db)
      sendJson(req, res, 200, {
        trends: computeSovereignTrends(db, viewerDid, origin, limit),
        recIdStr: 'quantzing-trends-v1',
      })
      return true
    }

    if (nsid === 'app.bsky.unspecced.getTrendingTopics' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 10)
      const viewerDid = getOptionalViewerDid(req, db)
      const trends = computeSovereignTrends(db, viewerDid, origin, limit)
      const topics = trends.map(t => ({
        topic: t.topic,
        displayName: t.displayName,
        description: t.description,
        link: t.link,
      }))
      sendJson(req, res, 200, {topics, suggested: topics.slice(0, 5)})
      return true
    }

    if (
      (nsid === 'app.bsky.unspecced.getSuggestedUsers' ||
        nsid === 'app.bsky.unspecced.getSuggestedUsersForDiscover' ||
        nsid === 'app.bsky.unspecced.getSuggestedUsersForExplore' ||
        nsid === 'app.bsky.unspecced.getSuggestedUsersForSeeMore' ||
        nsid === 'app.bsky.unspecced.getSuggestedOnboardingUsers') &&
      method === 'GET'
    ) {
      const limit = Number(searchParams.get('limit') || 10)
      const viewerDid = getOptionalViewerDid(req, db)
      sendJson(req, res, 200, {
        actors: getSuggestedQuantZingActors(db, viewerDid, origin, limit),
        recIdStr: 'quantzing-discover-v1',
      })
      return true
    }

    if (
      (nsid === 'app.bsky.unspecced.getPopularFeedGenerators' ||
        nsid === 'app.bsky.unspecced.getSuggestedFeeds' ||
        nsid === 'app.bsky.feed.getSuggestedFeeds') &&
      method === 'GET'
    ) {
      const viewerDid = getOptionalViewerDid(req, db)
      const query = (searchParams.get('query') || '').trim().toLowerCase()
      const feeds = SOVEREIGN_FEED_GENERATORS.filter(
        f =>
          !query ||
          f.displayName.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query),
      ).map(f => buildFeedGeneratorView(db, f, viewerDid, origin))
      sendJson(req, res, 200, {feeds})
      return true
    }

    if (
      (nsid === 'app.bsky.unspecced.getSuggestedStarterPacks' ||
        nsid === 'app.bsky.unspecced.getOnboardingSuggestedStarterPacks') &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {starterPacks: []})
      return true
    }

    // -----------------------------------------------------------------------
    // 5. Feeds, Posts & Threads (app.bsky.feed.*, getPostThreadV2)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.feed.getFeedGenerator' && method === 'GET') {
      const feedUri = searchParams.get('feed') || DISCOVER_FEED_URI
      const parsed = parseAtUri(feedUri)
      const spec =
        SOVEREIGN_FEED_GENERATORS.find(f => f.rkey === parsed?.rkey) ||
        SOVEREIGN_FEED_GENERATORS[0]
      const viewerDid = getOptionalViewerDid(req, db)
      sendJson(req, res, 200, {
        view: buildFeedGeneratorView(db, spec, viewerDid, origin),
        isOnline: true,
        isValid: true,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getFeedGenerators' && method === 'GET') {
      const uris = searchParams.getAll('feeds')
      const viewerDid = getOptionalViewerDid(req, db)
      const feeds = []
      const seen = new Set()
      for (const uri of uris) {
        const parsed = parseAtUri(uri)
        const spec =
          SOVEREIGN_FEED_GENERATORS.find(f => f.rkey === parsed?.rkey) ||
          (uri === LEGACY_DISCOVER_FEED_URI
            ? SOVEREIGN_FEED_GENERATORS[0]
            : null)
        if (spec && !seen.has(spec.rkey)) {
          seen.add(spec.rkey)
          feeds.push(buildFeedGeneratorView(db, spec, viewerDid, origin))
        }
      }
      sendJson(req, res, 200, {feeds})
      return true
    }

    if (nsid === 'app.bsky.feed.getActorFeeds' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const acc = findLocalAccount(db, actor)
      const feeds =
        acc?.did === QUANTZING_OFFICIAL_DID
          ? SOVEREIGN_FEED_GENERATORS.map(f =>
              buildFeedGeneratorView(db, f, viewerDid, origin),
            )
          : []
      sendJson(req, res, 200, {feeds})
      return true
    }

    if (nsid === 'app.bsky.feed.getTimeline' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, db)
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '30'

      const allItems = getLocalFeedItems(db, viewerDid, origin, {
        includeReplies: false,
      })

      // If viewer follows specific accounts, surface followed accounts + own posts first,
      // falling back to full QuantZing network feed if timeline would otherwise be empty.
      let items = allItems
      if (viewerDid) {
        const followedDids = new Set(
          Object.values(
            getCollectionMap(db, viewerDid, 'app.bsky.graph.follow'),
          )
            .map(r => r?.value?.subject)
            .filter(Boolean),
        )
        followedDids.add(viewerDid)
        if (followedDids.size > 1) {
          const followingOnly = allItems.filter(it =>
            followedDids.has(it.post?.author?.did),
          )
          if (followingOnly.length > 0) {
            items = followingOnly
          }
        }
      }

      const page = paginateItems(items, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getFeed' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, db)
      const feedUri = searchParams.get('feed') || ''
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '30'
      const parsed = parseAtUri(feedUri)
      const spec = SOVEREIGN_FEED_GENERATORS.find(f => f.rkey === parsed?.rkey)

      let items = getLocalFeedItems(db, viewerDid, origin, {
        includeReplies: false,
        filterTags: spec?.tags?.length ? spec.tags : null,
        onlyVideo: spec?.rkey === 'thevids',
      })
      // If a topical feed has 0 matches yet, return sovereign network feed so tab is never dead
      if (items.length === 0 && spec?.rkey !== 'thevids') {
        items = getLocalFeedItems(db, viewerDid, origin, {includeReplies: false})
      }

      const page = paginateItems(items, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getAuthorFeed' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const filter = searchParams.get('filter') || 'posts_with_replies'
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '30'
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)

      if (!localAcc || isAccountSuspendedOrBanned(localAcc)) {
        sendJson(req, res, 200, {feed: []})
        return true
      }

      const posts = Object.values(
        getCollectionMap(db, localAcc.did, 'app.bsky.feed.post'),
      )
      const feedEntries = []

      for (const postRec of posts) {
        if (isPostHiddenForViewer(db, postRec, viewerDid, getCollectionMap)) {
          continue
        }
        if (filter === 'posts_no_replies' && postRec.value?.reply) continue
        if (filter === 'posts_with_media' && !postRec.value?.embed) continue
        if (
          filter === 'posts_with_video' &&
          !isVideoEmbed(postRec.value?.embed)
        ) {
          continue
        }
        const postView = buildLocalPostView(db, postRec, viewerDid, origin)
        if (!postView) continue
        feedEntries.push({
          post: postView,
          _sortTime:
            Date.parse(postRec.value?.createdAt || postRec.indexedAt || 0) || 0,
        })
      }

      if (filter !== 'posts_with_media' && filter !== 'posts_with_video') {
        const reposts = Object.values(
          getCollectionMap(db, localAcc.did, 'app.bsky.feed.repost'),
        )
        const repostUris = reposts
          .map(r => r?.value?.subject?.uri)
          .filter(Boolean)
        if (repostUris.length > 0) {
          const hydrated = hydrateLocalPosts(db, repostUris, viewerDid, origin)
          const byUri = new Map(hydrated.map(p => [p.uri, p]))
          const reposterBasic = buildLocalProfileView(
            db,
            localAcc,
            viewerDid,
            origin,
            false,
          )
          for (const rep of reposts) {
            const target = byUri.get(rep?.value?.subject?.uri)
            if (!target) continue
            feedEntries.push({
              post: target,
              reason: {
                $type: 'app.bsky.feed.defs#reasonRepost',
                by: reposterBasic,
                uri: rep.uri,
                cid: rep.cid,
                indexedAt: rep.indexedAt,
              },
              _sortTime:
                Date.parse(rep.value?.createdAt || rep.indexedAt || 0) || 0,
            })
          }
        }
      }

      feedEntries.sort((a, b) => b._sortTime - a._sortTime)

      // Hoist pinned post to top when includePins=true
      const includePins = searchParams.get('includePins') === 'true'
      const pinnedUri = localAcc.profile?.pinnedPost?.uri
      let finalEntries = feedEntries.map(({_sortTime, ...rest}) => rest)
      if (
        includePins &&
        pinnedUri &&
        !cursor &&
        filter !== 'posts_with_media' &&
        filter !== 'posts_with_video'
      ) {
        const pinnedRec = findLocalPostByUri(db, pinnedUri)
        if (
          pinnedRec &&
          pinnedRec.repo === localAcc.did &&
          !isPostHiddenForViewer(db, pinnedRec, viewerDid, getCollectionMap)
        ) {
          const pinnedView = buildLocalPostView(db, pinnedRec, viewerDid, origin)
          if (pinnedView) {
            finalEntries = [
              {
                post: pinnedView,
                reason: {$type: 'app.bsky.feed.defs#reasonPin'},
              },
              ...finalEntries.filter(
                e => !(e.post?.uri === pinnedView.uri && !e.reason),
              ),
            ]
          }
        }
      }

      const page = paginateItems(finalEntries, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getActorLikes' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendJson(req, res, 200, {feed: []})
        return true
      }
      const likes = Object.values(
        getCollectionMap(db, localAcc.did, 'app.bsky.feed.like'),
      ).sort((a, b) =>
        String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
      )
      const uris = likes.map(l => l?.value?.subject?.uri).filter(Boolean)
      const posts = hydrateLocalPosts(db, uris, viewerDid, origin)
      sendJson(req, res, 200, {feed: posts.map(post => ({post}))})
      return true
    }

    if (nsid === 'app.bsky.feed.getPosts' && method === 'GET') {
      const uris = searchParams.getAll('uris')
      const viewerDid = getOptionalViewerDid(req, db)
      const posts = hydrateLocalPosts(db, uris, viewerDid, origin)
      sendJson(req, res, 200, {posts})
      return true
    }

    if (nsid === 'app.bsky.feed.getPostThread' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const resolved = resolveAtUri(db, uri)
      const canonicalUri = resolved?.canonicalUri || uri

      const localReplies = getAllLocalRecords(db, 'app.bsky.feed.post')
        .filter(
          r =>
            (r?.value?.reply?.parent?.uri === canonicalUri ||
              r?.value?.reply?.parent?.uri === uri) &&
            !isPostHiddenForViewer(db, r, viewerDid, getCollectionMap),
        )
        .sort((a, b) =>
          String(a.indexedAt || '').localeCompare(String(b.indexedAt || '')),
        )
        .map(r => buildLocalPostView(db, r, viewerDid, origin))
        .filter(Boolean)
        .map(post => ({
          $type: 'app.bsky.feed.defs#threadViewPost',
          post,
          replies: [],
        }))

      if (!resolved) {
        sendJson(req, res, 200, {
          thread: {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri,
            notFound: true,
          },
        })
        return true
      }

      const postRec =
        db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
      if (
        !postRec ||
        isPostHiddenForViewer(db, postRec, viewerDid, getCollectionMap)
      ) {
        sendJson(req, res, 200, {
          thread: {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri,
            notFound: true,
          },
        })
        return true
      }
      const postView = buildLocalPostView(db, postRec, viewerDid, origin)
      let parentNode
      const parentUri = postRec.value?.reply?.parent?.uri
      if (parentUri) {
        const [parentPost] = hydrateLocalPosts(db, [parentUri], viewerDid, origin)
        if (parentPost) {
          parentNode = {
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: parentPost,
          }
        }
      }
      sendJson(req, res, 200, {
        thread: {
          $type: 'app.bsky.feed.defs#threadViewPost',
          post: postView,
          ...(parentNode ? {parent: parentNode} : {}),
          replies: localReplies,
        },
      })
      return true
    }

    if (nsid === 'app.bsky.unspecced.getPostThreadV2' && method === 'GET') {
      const anchor = searchParams.get('anchor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const resolved = resolveAtUri(db, anchor)
      const canonicalAnchor = resolved?.canonicalUri || anchor

      const localReplies = getAllLocalRecords(db, 'app.bsky.feed.post')
        .filter(
          r =>
            (r?.value?.reply?.parent?.uri === canonicalAnchor ||
              r?.value?.reply?.parent?.uri === anchor) &&
            !isPostHiddenForViewer(db, r, viewerDid, getCollectionMap),
        )
        .sort((a, b) =>
          String(a.indexedAt || '').localeCompare(String(b.indexedAt || '')),
        )
        .map(r => buildLocalPostView(db, r, viewerDid, origin))
        .filter(Boolean)

      const postRec = resolved
        ? db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
        : null

      if (
        !postRec ||
        isPostHiddenForViewer(db, postRec, viewerDid, getCollectionMap)
      ) {
        sendJson(req, res, 200, {
          thread: [
            {
              uri: anchor,
              depth: 0,
              value: {$type: 'app.bsky.unspecced.defs#threadItemNotFound'},
            },
          ],
          hasOtherReplies: false,
        })
        return true
      }

      const postView = buildLocalPostView(db, postRec, viewerDid, origin)
      const items = []
      const parentUri = postRec.value?.reply?.parent?.uri
      if (parentUri) {
        const [parentPost] = hydrateLocalPosts(db, [parentUri], viewerDid, origin)
        if (parentPost) {
          items.push({
            uri: parentPost.uri,
            depth: -1,
            value: {
              $type: 'app.bsky.unspecced.defs#threadItemPost',
              post: parentPost,
              moreParents: false,
              moreReplies: 0,
              opThread: false,
              hiddenByThreadgate: false,
              mutedByViewer: false,
            },
          })
        }
      }
      items.push({
        uri: postView.uri,
        depth: 0,
        value: {
          $type: 'app.bsky.unspecced.defs#threadItemPost',
          post: postView,
          moreParents: false,
          moreReplies: 0,
          opThread: true,
          hiddenByThreadgate: false,
          mutedByViewer: false,
        },
      })
      for (const replyPost of localReplies) {
        items.push({
          uri: replyPost.uri,
          depth: 1,
          value: {
            $type: 'app.bsky.unspecced.defs#threadItemPost',
            post: replyPost,
            moreParents: false,
            moreReplies: 0,
            opThread: replyPost.author.did === postView.author.did,
            hiddenByThreadgate: false,
            mutedByViewer: false,
          },
        })
      }
      sendJson(req, res, 200, {thread: items, hasOtherReplies: false})
      return true
    }

    if (
      nsid === 'app.bsky.unspecced.getPostThreadOtherV2' &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {thread: []})
      return true
    }

    if (nsid === 'app.bsky.feed.getLikes' && method === 'GET') {
      const rawUri = searchParams.get('uri') || ''
      const uri = resolveAtUri(db, rawUri)?.canonicalUri || rawUri
      const viewerDid = getOptionalViewerDid(req, db)
      const likes = getAllLocalRecords(db, 'app.bsky.feed.like')
        .filter(
          r =>
            r?.value?.subject?.uri === uri ||
            r?.value?.subject?.uri === rawUri,
        )
        .map(r => {
          const acc = db.accounts[r.repo]
          if (!acc) return null
          return {
            actor: buildLocalProfileView(db, acc, viewerDid, origin, false),
            createdAt: r.value?.createdAt || r.indexedAt,
            indexedAt: r.indexedAt,
          }
        })
        .filter(Boolean)
      sendJson(req, res, 200, {uri, likes})
      return true
    }

    if (nsid === 'app.bsky.feed.getRepostedBy' && method === 'GET') {
      const rawUri = searchParams.get('uri') || ''
      const uri = resolveAtUri(db, rawUri)?.canonicalUri || rawUri
      const viewerDid = getOptionalViewerDid(req, db)
      const repostedBy = getAllLocalRecords(db, 'app.bsky.feed.repost')
        .filter(
          r =>
            r?.value?.subject?.uri === uri ||
            r?.value?.subject?.uri === rawUri,
        )
        .map(r => {
          const acc = db.accounts[r.repo]
          return acc
            ? buildLocalProfileView(db, acc, viewerDid, origin, false)
            : null
        })
        .filter(Boolean)
      sendJson(req, res, 200, {uri, repostedBy})
      return true
    }

    if (nsid === 'app.bsky.feed.getQuotes' && method === 'GET') {
      const rawUri = searchParams.get('uri') || ''
      const uri = resolveAtUri(db, rawUri)?.canonicalUri || rawUri
      const viewerDid = getOptionalViewerDid(req, db)
      const posts = getAllLocalRecords(db, 'app.bsky.feed.post')
        .filter(
          r =>
            (r?.value?.embed?.record?.uri === uri ||
              r?.value?.embed?.record?.uri === rawUri ||
              r?.value?.embed?.record?.record?.uri === uri ||
              r?.value?.embed?.record?.record?.uri === rawUri) &&
            !isPostHiddenForViewer(db, r, viewerDid, getCollectionMap),
        )
        .map(r => buildLocalPostView(db, r, viewerDid, origin))
        .filter(Boolean)
      sendJson(req, res, 200, {uri, posts})
      return true
    }

    if (nsid === 'app.bsky.feed.searchPosts' && method === 'GET') {
      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const authorFilter = (searchParams.get('author') || '').trim()
      const authorAcc = authorFilter ? findLocalAccount(db, authorFilter) : null
      const tagFilters = searchParams
        .getAll('tag')
        .map(t => String(t || '').trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
      const limit = Math.min(Number(searchParams.get('limit') || 25) || 25, 50)
      const viewerDid = getOptionalViewerDid(req, db)
      const matches = []
      const terms = q.split(/\s+/).filter(Boolean)
      for (const rec of getAllLocalRecords(db, 'app.bsky.feed.post')) {
        if (isPostHiddenForViewer(db, rec, viewerDid, getCollectionMap)) {
          continue
        }
        if (authorFilter && (!authorAcc || rec.repo !== authorAcc.did)) {
          continue
        }
        const txt = String(rec?.value?.text || '').toLowerCase()
        if (
          tagFilters.length > 0 &&
          !tagFilters.every(
            tag => txt.includes(`#${tag}`) || txt.includes(tag),
          )
        ) {
          continue
        }
        const acc = db.accounts[rec.repo]
        const handle = String(acc?.handle || '').toLowerCase()
        const displayName = String(acc?.profile?.displayName || '').toLowerCase()
        const hit =
          terms.length === 0 ||
          terms.every(t => {
            if (t.startsWith('from:')) {
              return handle.includes(t.slice(5).replace(/^@/, ''))
            }
            const bare = t.replace(/^#/, '')
            return (
              txt.includes(t) ||
              txt.includes(bare) ||
              handle.includes(bare) ||
              displayName.includes(bare)
            )
          })
        if (hit) {
          const view = buildLocalPostView(db, rec, viewerDid, origin)
          if (view) matches.push(view)
        }
      }
      matches.sort((a, b) =>
        String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
      )
      sendJson(req, res, 200, {posts: matches.slice(0, limit)})
      return true
    }

    if (nsid === 'app.bsky.feed.sendInteractions' && method === 'POST') {
      sendJson(req, res, 200, {})
      return true
    }

    // -----------------------------------------------------------------------
    // 6. Bookmarks (app.bsky.bookmark.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.bookmark.createBookmark' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      if (!body.uri || !body.cid) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'uri and cid are required',
        )
        return true
      }
      const list = db.bookmarks[auth.did] || []
      const filtered = list.filter(b => b.uri !== body.uri)
      filtered.unshift({
        uri: String(body.uri),
        cid: String(body.cid),
        createdAt: new Date().toISOString(),
      })
      db.bookmarks[auth.did] = filtered
      saveDb(db)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.bookmark.deleteBookmark' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      if (!body.uri) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'uri is required')
        return true
      }
      const list = db.bookmarks[auth.did] || []
      db.bookmarks[auth.did] = list.filter(b => b.uri !== body.uri)
      saveDb(db)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.bookmark.getBookmarks' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const list = db.bookmarks[auth.did] || []
      const uris = list.map(b => b.uri)
      const hydrated = hydrateLocalPosts(db, uris, auth.did, origin)
      const byUri = new Map(hydrated.map(p => [p.uri, p]))
      const bookmarks = list.map(b => {
        const post = byUri.get(b.uri)
        return {
          subject: {uri: b.uri, cid: b.cid},
          createdAt: b.createdAt,
          item: post || {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri: b.uri,
            notFound: true,
          },
        }
      })
      sendJson(req, res, 200, {bookmarks})
      return true
    }

    // -----------------------------------------------------------------------
    // 7. Social Graph endpoints (app.bsky.graph.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.graph.getFollows' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendJson(req, res, 200, {follows: []})
        return true
      }
      const subject = buildLocalProfileView(
        db,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      const followRecs = Object.values(
        getCollectionMap(db, localAcc.did, 'app.bsky.graph.follow'),
      )
      const follows = followRecs
        .map(r => db.accounts[r?.value?.subject])
        .filter(Boolean)
        .map(acc => buildLocalProfileView(db, acc, viewerDid, origin, false))
      sendJson(req, res, 200, {subject, follows})
      return true
    }

    if (nsid === 'app.bsky.graph.getFollowers' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendJson(req, res, 200, {followers: []})
        return true
      }
      const subject = buildLocalProfileView(
        db,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      const followers = getAllLocalRecords(db, 'app.bsky.graph.follow')
        .filter(r => r?.value?.subject === localAcc.did)
        .map(r => {
          const acc = db.accounts[r.repo]
          return acc
            ? buildLocalProfileView(db, acc, viewerDid, origin, false)
            : null
        })
        .filter(Boolean)
      sendJson(req, res, 200, {subject, followers})
      return true
    }

    if (nsid === 'app.bsky.graph.getKnownFollowers' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendJson(req, res, 200, {followers: []})
        return true
      }
      const subject = buildLocalProfileView(
        db,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      sendJson(req, res, 200, {subject, followers: []})
      return true
    }

    if (
      nsid === 'app.bsky.graph.getSuggestedFollowsByActor' &&
      method === 'GET'
    ) {
      const viewerDid = getOptionalViewerDid(req, db)
      const suggestions = getSuggestedQuantZingActors(db, viewerDid, origin, 10)
      sendJson(req, res, 200, {suggestions, isFallback: false})
      return true
    }

    if (nsid === 'app.bsky.graph.getRelationships' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const others = searchParams.getAll('others')
      const localAcc = findLocalAccount(db, actor)
      const relationships = others.map(otherDid => {
        const following = localAcc
          ? findViewerFollowUri(db, localAcc.did, otherDid)
          : undefined
        const followedBy = localAcc
          ? findViewerFollowUri(db, otherDid, localAcc.did)
          : undefined
        const blocking = localAcc
          ? findViewerBlockUri(db, localAcc.did, otherDid, getCollectionMap)
          : undefined
        const blockedBy = localAcc
          ? findViewerBlockUri(db, otherDid, localAcc.did, getCollectionMap)
          : undefined
        return {
          $type: 'app.bsky.graph.defs#relationship',
          did: otherDid,
          ...(following ? {following} : {}),
          ...(followedBy ? {followedBy} : {}),
          ...(blocking ? {blocking} : {}),
          ...(blockedBy ? {blockedBy} : {}),
        }
      })
      sendJson(req, res, 200, {
        actor: localAcc?.did || actor,
        relationships,
      })
      return true
    }

    const buildListView = (listRec, viewerDid) => {
      if (!listRec) return null
      const creatorAcc = db.accounts[listRec.repo]
      if (!creatorAcc) return null
      const itemsMap = getCollectionMap(
        db,
        listRec.repo,
        'app.bsky.graph.listitem',
      )
      const listItemCount = Object.values(itemsMap).filter(
        it => it?.value?.list === listRec.uri,
      ).length
      const avatar = blobUrl(origin, listRec.repo, listRec.value?.avatar)
      return {
        $type: 'app.bsky.graph.defs#listView',
        uri: listRec.uri,
        cid: listRec.cid,
        creator: buildLocalProfileView(db, creatorAcc, viewerDid, origin, false),
        name: String(listRec.value?.name || 'Untitled List'),
        purpose:
          listRec.value?.purpose || 'app.bsky.graph.defs#curatelist',
        description: String(listRec.value?.description || ''),
        ...(avatar ? {avatar} : {}),
        listItemCount,
        labels: [],
        viewer: {muted: false},
        indexedAt: listRec.indexedAt,
      }
    }

    if (nsid === 'app.bsky.graph.getLists' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (!localAcc) {
        sendJson(req, res, 200, {lists: []})
        return true
      }
      const listRecs = Object.values(
        getCollectionMap(db, localAcc.did, 'app.bsky.graph.list'),
      ).sort((a, b) =>
        String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
      )
      const lists = listRecs
        .map(r => buildListView(r, viewerDid))
        .filter(Boolean)
      sendJson(req, res, 200, {lists})
      return true
    }

    if (nsid === 'app.bsky.graph.getList' && method === 'GET') {
      const listUri = searchParams.get('list') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const resolved = resolveAtUri(db, listUri)
      const listRec = resolved
        ? db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
        : null
      if (!listRec) {
        sendXrpcError(req, res, 404, 'NotFound', 'List not found')
        return true
      }
      const listView = buildListView(listRec, viewerDid)
      const itemRecs = Object.values(
        getCollectionMap(db, listRec.repo, 'app.bsky.graph.listitem'),
      ).filter(it => it?.value?.list === listRec.uri)
      const items = itemRecs
        .map(it => {
          const subAcc = findLocalAccount(db, it?.value?.subject)
          if (!subAcc) return null
          return {
            uri: it.uri,
            subject: buildLocalProfileView(db, subAcc, viewerDid, origin, false),
          }
        })
        .filter(Boolean)
      sendJson(req, res, 200, {list: listView, items})
      return true
    }

    if (nsid === 'app.bsky.graph.getListsWithMembership' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const targetActor = searchParams.get('actor') || ''
      const targetAcc = findLocalAccount(db, targetActor)
      const listRecs = Object.values(
        getCollectionMap(db, auth.did, 'app.bsky.graph.list'),
      )
      const itemRecs = Object.values(
        getCollectionMap(db, auth.did, 'app.bsky.graph.listitem'),
      )
      const listsWithMembership = listRecs
        .map(lr => {
          const list = buildListView(lr, auth.did)
          if (!list) return null
          const matchItem = targetAcc
            ? itemRecs.find(
                it =>
                  it?.value?.list === lr.uri &&
                  it?.value?.subject === targetAcc.did,
              )
            : null
          return {
            list,
            ...(matchItem
              ? {
                  listItem: {
                    uri: matchItem.uri,
                    subject: buildLocalProfileView(
                      db,
                      targetAcc,
                      auth.did,
                      origin,
                      false,
                    ),
                  },
                }
              : {}),
          }
        })
        .filter(Boolean)
      sendJson(req, res, 200, {listsWithMembership})
      return true
    }

    if (nsid === 'app.bsky.feed.getListFeed' && method === 'GET') {
      const listUri = searchParams.get('list') || ''
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '30'
      const viewerDid = getOptionalViewerDid(req, db)
      const resolved = resolveAtUri(db, listUri)
      const listRec = resolved
        ? db.records?.[resolved.did]?.[resolved.collection]?.[resolved.rkey]
        : null
      if (!listRec) {
        sendJson(req, res, 200, {feed: []})
        return true
      }
      const memberDids = new Set(
        Object.values(
          getCollectionMap(db, listRec.repo, 'app.bsky.graph.listitem'),
        )
          .filter(it => it?.value?.list === listRec.uri)
          .map(it => it?.value?.subject)
          .filter(Boolean),
      )
      const items = getLocalFeedItems(db, viewerDid, origin, {
        includeReplies: false,
      }).filter(it => memberDids.has(it.post?.author?.did))
      const page = paginateItems(items, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (
      (nsid === 'app.bsky.graph.getMutedLists' ||
        nsid === 'app.bsky.graph.getListBlocks') &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {lists: []})
      return true
    }

    // -----------------------------------------------------------------------
    // 7B. Sovereign Server Drafts (app.bsky.draft.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.draft.getDrafts' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const rawDrafts = Array.isArray(db.drafts?.[auth.did])
        ? db.drafts[auth.did]
        : []
      const drafts = [...rawDrafts]
        .sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(
            String(a.updatedAt || a.createdAt || ''),
          ),
        )
        .map(d => ({
          $type: 'app.bsky.draft.defs#draftView',
          id: d.id,
          draft: d.draft,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }))
      sendJson(req, res, 200, {drafts})
      return true
    }

    if (nsid === 'app.bsky.draft.createDraft' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      db.drafts = db.drafts && typeof db.drafts === 'object' ? db.drafts : {}
      db.drafts[auth.did] = Array.isArray(db.drafts[auth.did])
        ? db.drafts[auth.did]
        : []
      if (db.drafts[auth.did].length >= 100) {
        sendXrpcError(req, res, 400, 'DraftLimitReached', 'Maximum of 100 drafts reached')
        return true
      }
      const id = generateTid()
      const now = new Date().toISOString()
      db.drafts[auth.did].unshift({
        id,
        draft: body.draft || {posts: []},
        createdAt: now,
        updatedAt: now,
      })
      saveDb(db)
      sendJson(req, res, 200, {id})
      return true
    }

    if (nsid === 'app.bsky.draft.updateDraft' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const draftWithId = body.draft || {}
      const id = String(draftWithId.id || '')
      db.drafts = db.drafts && typeof db.drafts === 'object' ? db.drafts : {}
      const list = Array.isArray(db.drafts[auth.did]) ? db.drafts[auth.did] : []
      const existing = list.find(d => d.id === id)
      if (!existing) {
        sendXrpcError(req, res, 404, 'NotFound', 'Draft not found')
        return true
      }
      existing.draft = draftWithId.draft || existing.draft
      existing.updatedAt = new Date().toISOString()
      saveDb(db)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.draft.deleteDraft' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const id = String(body.id || '')
      if (Array.isArray(db.drafts?.[auth.did])) {
        db.drafts[auth.did] = db.drafts[auth.did].filter(d => d.id !== id)
        saveDb(db)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (
      (nsid === 'app.bsky.graph.getStarterPacks' ||
        nsid === 'app.bsky.graph.getActorStarterPacks' ||
        nsid === 'app.bsky.graph.searchStarterPacks') &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {starterPacks: []})
      return true
    }

    if (nsid === 'app.bsky.graph.getMutes' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '50'
      const mutedDids = Array.isArray(db.mutes?.[auth.did])
        ? db.mutes[auth.did]
        : []
      const profiles = mutedDids
        .map(did => db.accounts[did])
        .filter(Boolean)
        .map(acc => buildLocalProfileView(db, acc, auth.did, origin, false))
      const page = paginateItems(profiles, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        mutes: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getBlocks' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '50'
      const blockRecs = Object.values(
        getCollectionMap(db, auth.did, 'app.bsky.graph.block'),
      ).sort((a, b) =>
        String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
      )
      const seen = new Set()
      const profiles = []
      for (const rec of blockRecs) {
        const subjectDid = rec?.value?.subject
        if (!subjectDid || seen.has(subjectDid)) continue
        seen.add(subjectDid)
        const acc = db.accounts[subjectDid]
        if (acc) {
          profiles.push(buildLocalProfileView(db, acc, auth.did, origin, false))
        }
      }
      const page = paginateItems(profiles, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        blocks: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.muteActor' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      const rawActor = String(body.actor || '').trim()
      const targetAcc = findLocalAccount(db, rawActor)
      const targetDid =
        targetAcc?.did || (rawActor.startsWith('did:') ? rawActor : null)
      if (!targetDid) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'actor DID or handle is required',
        )
        return true
      }
      db.mutes = db.mutes || {}
      const list = Array.isArray(db.mutes[auth.did]) ? db.mutes[auth.did] : []
      if (!list.includes(targetDid)) {
        list.push(targetDid)
        db.mutes[auth.did] = list
        saveDb(db)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.unmuteActor' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      const body = await readJsonBody(req)
      const rawActor = String(body.actor || '').trim()
      const targetAcc = findLocalAccount(db, rawActor)
      const targetDid =
        targetAcc?.did || (rawActor.startsWith('did:') ? rawActor : null)
      if (!targetDid) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'actor DID or handle is required',
        )
        return true
      }
      db.mutes = db.mutes || {}
      if (Array.isArray(db.mutes[auth.did])) {
        const next = db.mutes[auth.did].filter(d => d !== targetDid)
        if (next.length !== db.mutes[auth.did].length) {
          db.mutes[auth.did] = next
          saveDb(db)
        }
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'com.atproto.moderation.createReport' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          'Authentication required',
        )
        return true
      }
      if (
        enforceRateLimit(req, res, {
          bucketKey: `report:${auth.did}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_REPORT_MAX) || 20,
          windowMs: 15 * 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }
      const body = await readJsonBody(req)
      const rawSubject = body.subject
      if (
        !rawSubject ||
        typeof rawSubject !== 'object' ||
        (!rawSubject.uri && !rawSubject.did)
      ) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'subject with uri or did is required',
        )
        return true
      }

      const reasonType = String(
        body.reasonType || 'com.atproto.moderation.defs#reasonOther',
      )
      const reason =
        typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : ''
      const createdAt = new Date().toISOString()

      let subjectType = 'account'
      let subjectUri = null
      let subjectDid = null
      let subjectCid = null
      let responseSubject

      if (rawSubject.uri) {
        subjectType = 'post'
        const resolvedSub = resolveAtUri(db, String(rawSubject.uri))
        subjectUri = resolvedSub?.canonicalUri || String(rawSubject.uri)
        subjectCid = rawSubject.cid
          ? String(rawSubject.cid)
          : findLocalPostByUri(db, subjectUri)?.cid || null
        subjectDid =
          resolvedSub?.did ||
          parseAtUri(subjectUri)?.repo ||
          (rawSubject.did ? String(rawSubject.did) : null)
        responseSubject = {
          $type: rawSubject.$type || 'com.atproto.repo.strongRef',
          uri: subjectUri,
          ...(subjectCid ? {cid: subjectCid} : {}),
        }
      } else {
        subjectType = 'account'
        subjectDid = String(rawSubject.did)
        responseSubject = {
          $type: rawSubject.$type || 'com.atproto.admin.defs#repoRef',
          did: subjectDid,
        }
      }

      db.reports = Array.isArray(db.reports) ? db.reports : []
      const id =
        db.reports.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1
      db.reports.push({
        id,
        createdAt,
        reporterDid: auth.did,
        reasonType,
        reason,
        subjectType,
        subjectUri,
        subjectDid,
        subjectCid,
        status: 'open',
        claimedByDid: null,
        claimedByHandle: null,
        claimedAt: null,
      })
      saveDb(db)

      sendJson(req, res, 200, {
        id,
        reasonType,
        reason,
        subject: responseSubject,
        reportedBy: auth.did,
        createdAt,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 8. Labelers (app.bsky.labeler.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.labeler.getServices' && method === 'GET') {
      const dids = searchParams.getAll('dids')
      const detailed = searchParams.get('detailed') === 'true'
      const creatorAcc = db.accounts[QUANTZING_OFFICIAL_DID]
      const viewerDid = getOptionalViewerDid(req, db)
      const views = (dids.length > 0 ? dids : [QUANTZING_OFFICIAL_DID]).map(
        did => ({
          $type: detailed
            ? 'app.bsky.labeler.defs#labelerViewDetailed'
            : 'app.bsky.labeler.defs#labelerView',
          uri: `at://${did}/app.bsky.labeler.service/self`,
          cid: computeCid({labeler: did}, 'dag-cbor'),
          creator: creatorAcc
            ? buildLocalProfileView(db, creatorAcc, viewerDid, origin, false)
            : {
                did: QUANTZING_OFFICIAL_DID,
                handle: 'quantzing.quantzing.com',
                displayName: 'QuantZing Moderation',
              },
          likeCount: 0,
          indexedAt: '2026-01-01T00:00:00.000Z',
          labels: [],
          ...(detailed
            ? {
                policies: {
                  labelValues: [],
                  labelValueDefinitions: [],
                },
              }
            : {}),
        }),
      )
      sendJson(req, res, 200, {views})
      return true
    }

    // -----------------------------------------------------------------------
    // 9. Sovereign Notifications (app.bsky.notification.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.notification.listNotifications' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendJson(req, res, 200, {notifications: [], priority: false})
        return true
      }
      const limit = Math.min(50, Number(searchParams.get('limit') || 30))
      const notifications = buildLocalNotifications(db, auth.did, origin, limit)
      sendJson(req, res, 200, {
        notifications,
        priority: false,
        seenAt: auth.account.notificationsSeenAt || new Date().toISOString(),
      })
      return true
    }

    if (
      nsid === 'app.bsky.notification.getGroupedNotifications' &&
      method === 'GET'
    ) {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendJson(req, res, 200, {
          groups: [],
          relatedViews: [],
          seenAt: new Date().toISOString(),
        })
        return true
      }
      const feed = searchParams.get('feed') || 'all'
      const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 30)))
      const payload = buildGroupedNotifications(db, auth.did, origin, feed, limit)
      sendJson(req, res, 200, payload)
      return true
    }

    if (nsid === 'app.bsky.notification.getUnreadCount' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendJson(req, res, 200, {count: 0})
        return true
      }
      const notifications = buildLocalNotifications(db, auth.did, origin, 50)
      const count = notifications.filter(n => !n.isRead).length
      sendJson(req, res, 200, {count})
      return true
    }

    if (nsid === 'app.bsky.notification.updateSeen' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.account) {
        const body = await readJsonBody(req)
        const nowFloor = new Date(Date.now() + 500).toISOString()
        const reqSeen = typeof body.seenAt === 'string' ? body.seenAt : nowFloor
        auth.account.notificationsSeenAt =
          reqSeen > nowFloor ? reqSeen : nowFloor
        saveDb(db)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.notification.getPreferences' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      const prefs =
        auth.account?.notificationPreferences ||
        createDefaultNotificationPreferences()
      sendJson(req, res, 200, {preferences: prefs})
      return true
    }

    if (
      (nsid === 'app.bsky.notification.putPreferences' ||
        nsid === 'app.bsky.notification.putPreferencesV2') &&
      method === 'POST'
    ) {
      const auth = getAuthedContext(req, db)
      const body = await readJsonBody(req)
      if (auth.account) {
        auth.account.notificationPreferences = {
          ...(auth.account.notificationPreferences ||
            createDefaultNotificationPreferences()),
          ...body,
        }
        saveDb(db)
      }
      if (nsid === 'app.bsky.notification.putPreferencesV2') {
        sendJson(req, res, 200, {
          preferences:
            auth.account?.notificationPreferences ||
            createDefaultNotificationPreferences(),
        })
      } else {
        sendEmpty(req, res, 200)
      }
      return true
    }

    if (
      nsid === 'app.bsky.notification.listActivitySubscriptions' &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {subscriptions: []})
      return true
    }

    if (
      (nsid === 'app.bsky.notification.registerPush' ||
        nsid === 'app.bsky.notification.unregisterPush') &&
      method === 'POST'
    ) {
      sendEmpty(req, res, 200)
      return true
    }

    // -----------------------------------------------------------------------
    // 10. Age Assurance & Config (app.bsky.ageassurance.*, unspecced.getConfig)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.ageassurance.getState' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, db)
      const acc = viewerDid ? db.accounts[viewerDid] : null
      sendJson(req, res, 200, {
        state: {
          status: 'assured',
          access: 'full',
        },
        metadata: {
          accountCreatedAt: acc?.createdAt || new Date().toISOString(),
        },
      })
      return true
    }

    if (nsid === 'app.bsky.ageassurance.getConfig' && method === 'GET') {
      sendJson(req, res, 200, {regions: []})
      return true
    }

    if (
      nsid === 'app.bsky.unspecced.getAgeAssuranceState' &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {status: 'assured'})
      return true
    }

    if (nsid === 'app.bsky.unspecced.getConfig' && method === 'GET') {
      sendJson(req, res, 200, {
        checkEmailConfirmed: false,
        topicsEnabled: true,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 11. Sovereign Direct Messages (chat.bsky.convo.*)
    // -----------------------------------------------------------------------

    if (nsid.startsWith('chat.bsky.')) {
      const auth = getAuthedContext(req, db)
      const viewerDid = auth.did || null
      db.convos = db.convos || {}

      if (nsid === 'chat.bsky.convo.listConvos' && method === 'GET') {
        const statusFilter = searchParams.get('status')
        const convos =
          viewerDid && statusFilter !== 'request'
            ? Object.values(db.convos)
                .filter(c => c.members?.includes(viewerDid))
                .map(c => buildConvoView(db, c, viewerDid, origin))
            : []
        sendJson(req, res, 200, {convos})
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvoForMembers' && method === 'GET') {
        const rawMembers = searchParams.getAll('members')
        const members = [
          ...new Set([viewerDid, ...rawMembers].filter(Boolean)),
        ].sort()
        const key = members.join('|')
        let convo = Object.values(db.convos).find(
          c => [...(c.members || [])].sort().join('|') === key,
        )
        if (!convo) {
          const id = generateTid()
          convo = {
            id,
            rev: generateTid(),
            members,
            messages: [],
            readBy: {},
            mutedBy: {},
          }
          db.convos[id] = convo
          saveDb(db)
        }
        sendJson(req, res, 200, {
          convo: buildConvoView(db, convo, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvo' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = db.convos[convoId]
        if (!convo) {
          sendXrpcError(req, res, 404, 'NotFound', 'Conversation not found')
          return true
        }
        sendJson(req, res, 200, {
          convo: buildConvoView(db, convo, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvoMembers' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = db.convos[convoId]
        if (!convo) {
          sendJson(req, res, 200, {members: []})
          return true
        }
        const members = (convo.members || [])
          .map(did => db.accounts[did])
          .filter(Boolean)
          .map(acc => buildLocalProfileView(db, acc, viewerDid, origin, false))
        sendJson(req, res, 200, {members})
        return true
      }

      if (nsid === 'chat.bsky.convo.getMessages' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = db.convos[convoId]
        const messages = convo ? [...(convo.messages || [])].reverse() : []
        sendJson(req, res, 200, {messages})
        return true
      }

      if (nsid === 'chat.bsky.convo.sendMessage' && method === 'POST') {
        if (auth.error) {
          sendXrpcError(
            req,
            res,
            auth.status,
            auth.error,
            'Authentication required',
          )
          return true
        }
        const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
        if (!enforcement.allowed) {
          sendXrpcError(
            req,
            res,
            enforcement.status,
            enforcement.error,
            enforcement.message,
          )
          return true
        }
        const body = await readJsonBody(req)
        const convo = db.convos[body.convoId]
        if (!convo) {
          sendXrpcError(req, res, 404, 'NotFound', 'Conversation not found')
          return true
        }
        const rev = generateTid()
        const msg = {
          $type: 'chat.bsky.convo.defs#messageView',
          id: generateTid(),
          rev,
          text: String(body.message?.text || ''),
          sender: {did: auth.did},
          sentAt: new Date().toISOString(),
        }
        convo.messages = convo.messages || []
        convo.messages.push(msg)
        convo.rev = rev
        convo.readBy = convo.readBy || {}
        convo.readBy[auth.did] = rev
        saveDb(db)
        sendJson(req, res, 200, msg)
        return true
      }

      if (nsid === 'chat.bsky.convo.updateRead' && method === 'POST') {
        const body = await readJsonBody(req)
        const convo = db.convos[body.convoId]
        if (convo && viewerDid) {
          convo.readBy = convo.readBy || {}
          convo.readBy[viewerDid] = convo.rev || generateTid()
          saveDb(db)
          sendJson(req, res, 200, {
            convo: buildConvoView(db, convo, viewerDid, origin),
          })
          return true
        }
        sendJson(req, res, 200, {})
        return true
      }

      if (nsid === 'chat.bsky.convo.getUnreadCounts' && method === 'GET') {
        let unreadAcceptedConvos = 0
        if (viewerDid) {
          for (const c of Object.values(db.convos)) {
            if (!c.members?.includes(viewerDid)) continue
            const v = buildConvoView(db, c, viewerDid, origin)
            if (v.unreadCount > 0) unreadAcceptedConvos++
          }
        }
        sendJson(req, res, 200, {
          unreadRequestConvos: 0,
          unreadAcceptedConvos,
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getLog' && method === 'GET') {
        sendJson(req, res, 200, {logs: []})
        return true
      }

      if (nsid === 'chat.bsky.convo.listConvoRequests' && method === 'GET') {
        sendJson(req, res, 200, {requests: []})
        return true
      }

      if (
        nsid === 'chat.bsky.convo.getConvoAvailability' &&
        method === 'GET'
      ) {
        const rawMembers = searchParams.getAll('members')
        const canChat = rawMembers.every(m => Boolean(findLocalAccount(db, m)))
        let existingConvo
        if (canChat && viewerDid) {
          const allMembers = [...new Set([viewerDid, ...rawMembers])].sort()
          const key = allMembers.join('|')
          const found = Object.values(db.convos).find(
            c => [...(c.members || [])].sort().join('|') === key,
          )
          if (found) {
            existingConvo = buildConvoView(db, found, viewerDid, origin)
          }
        }
        sendJson(req, res, 200, {
          canChat,
          ...(existingConvo ? {convo: existingConvo} : {}),
        })
        return true
      }

      sendJson(req, res, 200, {convos: [], messages: []})
      return true
    }

    if (nsid === 'com.atproto.identity.updateHandle' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const nextHandle = normalizeHandle(body.handle)
      if (!isValidHandleFormat(nextHandle)) {
        sendXrpcError(req, res, 400, 'InvalidHandle', 'Invalid handle format')
        return true
      }
      const taken = Object.values(db.accounts).find(
        a => a.did !== auth.did && a.handle.toLowerCase() === nextHandle,
      )
      if (taken) {
        sendXrpcError(req, res, 400, 'HandleNotAvailable', 'That handle is already taken')
        return true
      }
      auth.account.handle = nextHandle
      saveDb(db)
      sendEmpty(req, res, 200)
      return true
    }

    // -----------------------------------------------------------------------
    // 11B. Sovereign Video Upload & Streaming (app.bsky.video.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.video.getUploadLimits' && method === 'GET') {
      sendJson(req, res, 200, {
        canUpload: true,
        remainingDailyVideos: 100,
        remainingDailyBytes: 500 * 1024 * 1024,
      })
      return true
    }

    if (nsid === 'app.bsky.video.startUpload' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const enforcement = checkAccountEnforcement(db, auth.account, {saveDb})
      if (!enforcement.allowed) {
        sendXrpcError(
          req,
          res,
          enforcement.status,
          enforcement.error,
          enforcement.message,
        )
        return true
      }
      if (
        enforceRateLimit(req, res, {
          bucketKey: `upload:${auth.did}`,
          maxRequests: Number(process.env.QUANTZING_RATE_LIMIT_UPLOAD_MAX) || 30,
          windowMs: 5 * 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }
      pruneExpiredVideoUploads()
      const body = await readJsonBody(req)
      const sizeBytes = Math.max(1, Number(body.sizeBytes || 1))
      if (sizeBytes > MAX_VIDEO_TOTAL_BYTES) {
        sendXrpcError(
          req,
          res,
          400,
          'VideoTooLarge',
          'Video exceeds maximum supported size of 300 MB',
        )
        return true
      }
      const mimeType = String(body.mimeType || 'video/mp4')
      const partSizeBytes = VIDEO_UPLOAD_PART_BYTES
      const partCount = Math.max(1, Math.ceil(sizeBytes / partSizeBytes))
      const jobId = `qzvid_${generateTid()}`
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
      activeVideoUploads.set(jobId, {
        jobId,
        did: auth.did,
        sizeBytes,
        mimeType,
        name: String(body.name || `${jobId}.mp4`),
        partSizeBytes,
        partCount,
        expiresAt,
        state: 'created',
        parts: new Map(),
        jobStatus: null,
      })
      sendJson(req, res, 200, {jobId, partSizeBytes, partCount, expiresAt})
      return true
    }

    if (nsid === 'app.bsky.video.uploadPart' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const jobId = searchParams.get('jobId') || ''
      const partNumber = Math.max(1, Number(searchParams.get('partNumber') || 1))
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did) {
        sendXrpcError(req, res, 404, 'NotFound', 'Video upload session not found')
        return true
      }
      const chunk = await readRawBody(req, MAX_BLOB_BODY_BYTES)
      job.parts.set(partNumber, chunk)
      sendJson(req, res, 200, {partNumber, sizeBytes: chunk.length})
      return true
    }

    if (nsid === 'app.bsky.video.finishUpload' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const jobId = String(body.jobId || '')
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did) {
        sendXrpcError(req, res, 404, 'NotFound', 'Video upload session not found')
        return true
      }
      if (job.state === 'completed' && job.jobStatus) {
        sendJson(req, res, 200, {
          completedJobId: jobId,
          jobStatus: job.jobStatus,
        })
        return true
      }
      const ordered = [...job.parts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, buf]) => buf)
      const fullBuf = Buffer.concat(ordered)
      if (fullBuf.length === 0) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'No video data received')
        return true
      }
      if (fullBuf.length > MAX_VIDEO_TOTAL_BYTES) {
        sendXrpcError(
          req,
          res,
          400,
          'VideoTooLarge',
          'Video exceeds maximum supported size of 300 MB',
        )
        return true
      }
      const blob = storeLocalBlob(db, auth.did, fullBuf, job.mimeType)
      saveDb(db)
      job.parts.clear()
      job.state = 'completed'
      job.jobStatus = {
        jobId,
        did: auth.did,
        state: 'JOB_STATE_COMPLETED',
        progress: 100,
        blob,
      }
      sendJson(req, res, 200, {
        completedJobId: jobId,
        jobStatus: job.jobStatus,
      })
      return true
    }

    if (nsid === 'app.bsky.video.getUploadStatus' && method === 'GET') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const jobId = searchParams.get('jobId') || ''
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did) {
        sendXrpcError(req, res, 404, 'NotFound', 'Video upload session not found')
        return true
      }
      sendJson(req, res, 200, {
        jobId: job.jobId,
        partSizeBytes: job.partSizeBytes,
        partCount: job.partCount,
        receivedParts: [...job.parts.keys()].sort((a, b) => a - b),
        expiresAt: job.expiresAt,
        state: job.state,
        ...(job.state === 'completed'
          ? {completedJobId: job.jobId, jobStatus: job.jobStatus}
          : {}),
      })
      return true
    }

    if (nsid === 'app.bsky.video.getJobStatus' && method === 'GET') {
      const jobId = searchParams.get('jobId') || ''
      const job = activeVideoUploads.get(jobId)
      if (!job || !job.jobStatus) {
        sendXrpcError(req, res, 404, 'NotFound', 'Video job not found')
        return true
      }
      sendJson(req, res, 200, {jobStatus: job.jobStatus})
      return true
    }

    if (nsid === 'app.bsky.video.abortUpload' && method === 'POST') {
      const auth = getAuthedContext(req, db, {
        allowedScopes: VIDEO_AUTH_SCOPES,
      })
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const jobId = String(body.jobId || '')
      const job = activeVideoUploads.get(jobId)
      if (job && job.did === auth.did) {
        job.parts.clear()
        job.state = 'aborted'
      }
      sendJson(req, res, 200, {state: 'aborted'})
      return true
    }

    // -----------------------------------------------------------------------
    // 12. Sovereign Safe Catch-All (ZERO external Bluesky proxy!)
    // -----------------------------------------------------------------------

    if (method === 'GET') {
      sendJson(req, res, 200, {
        feed: [],
        feeds: [],
        actors: [],
        posts: [],
        lists: [],
        items: [],
        views: [],
        records: [],
        trends: [],
        topics: [],
        starterPacks: [],
        notifications: [],
      })
      return true
    }

    if (
      method === 'POST' &&
      (nsid.startsWith('app.bsky.graph.mute') ||
        nsid.startsWith('app.bsky.graph.unmute'))
    ) {
      sendEmpty(req, res, 200)
      return true
    }

    sendXrpcError(
      req,
      res,
      501,
      'MethodNotImplemented',
      `Endpoint ${method} /xrpc/${nsid} is not implemented on QuantZing Sovereign PDS`,
    )
    return true
  } catch (err) {
    if (err?.message === 'PayloadTooLarge') {
      sendXrpcError(
        req,
        res,
        413,
        'PayloadTooLarge',
        'Request payload too large',
      )
      return true
    }
    if (err?.message === 'InvalidJsonBody') {
      sendXrpcError(
        req,
        res,
        400,
        'InvalidRequest',
        'Invalid JSON request body',
      )
      return true
    }
    console.error(`[QuantZing PDS] Error handling ${method} ${pathname}:`, err)
    sendXrpcError(
      req,
      res,
      500,
      'InternalServerError',
      err?.message || 'Internal QuantZing PDS error',
    )
    return true
  }
}
