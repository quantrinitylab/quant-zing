import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import tls from 'node:tls'
import {fileURLToPath} from 'node:url'
import zlib from 'node:zlib'

function createUpstreamHttpsAgent() {
  if (typeof tls.getCACertificates === 'function') {
    const bundled = tls.getCACertificates('bundled')
    const system = tls.getCACertificates('system')
    return new https.Agent({
      ca: [...bundled, ...system],
      keepAlive: true,
    })
  }
  return new https.Agent({keepAlive: true})
}

const UPSTREAM_HTTPS_AGENT = createUpstreamHttpsAgent()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_APPVIEW_ORIGIN = 'https://public.api.bsky.app'
const DISCOVER_FEED_URI =
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'
const QUANTZING_DID = 'did:web:quantzing.com'
const QUANTZING_DOMAIN = '.quantzing.com'
const QUANTZING_ALT_DOMAIN = '.quantzing.in'
const UPSTREAM_TIMEOUT_MS = 15000
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
const MAX_BLOB_BODY_BYTES = 25 * 1024 * 1024

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
    version: 1,
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    accounts: {},
    records: {},
    bookmarks: {},
    blobs: {},
    revokedTokens: [],
  }
}

let cachedDb = null
let cachedDbPath = null

function loadDb() {
  const dbPath = getDbPath()
  if (cachedDb && cachedDbPath === dbPath) {
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
        revokedTokens: Array.isArray(parsed.revokedTokens)
          ? parsed.revokedTokens
          : [],
      }
      cachedDbPath = dbPath
      return cachedDb
    } catch (err) {
      console.error('[QuantZing PDS] Failed to parse db.json, initializing fresh store:', err)
    }
  }
  cachedDb = createEmptyDb()
  cachedDbPath = dbPath
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
    // Windows fallback if destination is briefly locked
    fs.copyFileSync(tmpPath, dbPath)
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
  }
  cachedDb = db
  cachedDbPath = dbPath
}

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

/**
 * Generates a valid PLC DID: `did:plc:` + 24 base32 lowercase chars (`[a-z2-7]`),
 * passing `@atproto/syntax` `isDidString` 100%.
 */
function createPlcDid() {
  const bytes = crypto.randomBytes(15) // 120 bits -> exactly 24 base32 chars
  return `did:plc:${base32Encode(bytes, BASE32_RFC4648)}`
}

/**
 * Generates a valid CIDv1 string (`bafyrei...` for dag-cbor records or `bafkrei...` for raw blobs)
 * passing `@atproto/lex` CID validation 100%.
 */
function computeCid(input, codec = 'dag-cbor') {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf8')
  const digest = crypto.createHash('sha256').update(buf).digest()
  const codecByte = codec === 'raw' ? 0x55 : 0x71 // raw=0x55, dag-cbor=0x71
  const cidBytes = Buffer.concat([
    Buffer.from([0x01, codecByte, 0x12, 0x20]), // v1, codec, sha2-256, 32-byte len
    digest,
  ])
  return `b${base32Encode(cidBytes, BASE32_RFC4648)}`
}

/**
 * Generates a valid 13-character ATProto TID (base32-sortable).
 */
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

function signJwt(db, {did, scope, ttlSeconds}) {
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
  return {
    accessJwt: signJwt(db, {
      did,
      scope: 'com.atproto.access',
      ttlSeconds: 30 * 24 * 60 * 60, // 30 days
    }),
    refreshJwt: signJwt(db, {
      did,
      scope: 'com.atproto.refresh',
      ttlSeconds: 90 * 24 * 60 * 60, // 90 days
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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function getServerOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
    .split(',')[0]
    .trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3008')
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
      'content-type,authorization,atproto-proxy,atproto-accept-labelers,x-atproto-device-id,x-atproto-session-id,accept-language',
    'access-control-expose-headers': 'content-type,x-quantzing-pds',
    'x-quantzing-pds': 'sovereign-hybrid',
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

function getAuthedContext(req, db, {expectedScope = null} = {}) {
  const token = extractBearerToken(req)
  if (!token) return {error: 'AuthenticationRequired', status: 401}
  const verified = verifyJwt(db, token, expectedScope)
  if (!verified) {
    return {error: 'InvalidToken', status: 401}
  }
  if (verified.expired) {
    return {error: 'ExpiredToken', status: 400}
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
  const withAltDomain = lower.includes('.') ? lower : `${lower}${QUANTZING_ALT_DOMAIN}`
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
    createdAt: value.createdAt || account.profile?.createdAt || account.createdAt,
  }
}

function putLocalRecord(db, did, collection, rkey, recordValue) {
  const key = rkey || generateTid()
  const value = {
    $type: collection,
    ...recordValue,
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
  if (collection === 'app.bsky.actor.profile' && key === 'self' && db.accounts[did]) {
    syncProfileFromRecord(db.accounts[did], value)
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
// Local View Hydrators & Remote View Decorators
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

function buildLocalProfileView(db, account, viewerDid, origin, detailed = false) {
  const profile = account.profile || {}
  const avatar = blobUrl(origin, account.did, profile.avatar)
  const banner = blobUrl(origin, account.did, profile.banner)
  const followingUri = findViewerFollowUri(db, viewerDid, account.did)
  const followedByUri = findViewerFollowUri(db, account.did, viewerDid)

  const viewer = {
    muted: false,
    blockedBy: false,
    ...(followingUri ? {following: followingUri} : {}),
    ...(followedByUri ? {followedBy: followedByUri} : {}),
  }

  const base = {
    did: account.did,
    handle: account.handle,
    displayName: profile.displayName || account.handle.split('.')[0],
    ...(avatar ? {avatar} : {}),
    ...(profile.pronouns ? {pronouns: profile.pronouns} : {}),
    associated: {
      chat: {allowIncoming: 'all'},
    },
    viewer,
    labels: [],
    createdAt: account.createdAt,
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
    ...(profile.description ? {description: profile.description} : {}),
    ...(profile.website ? {website: profile.website} : {}),
    ...(profile.pinnedPost ? {pinnedPost: profile.pinnedPost} : {}),
    followersCount,
    followsCount,
    postsCount,
    indexedAt: account.createdAt,
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
    const parsed = parseAtUri(embed.record.uri)
    if (parsed && db.accounts[parsed.repo]) {
      const targetRec =
        db.records?.[parsed.repo]?.[parsed.collection]?.[parsed.rkey]
      if (targetRec) {
        const targetAuthor = db.accounts[parsed.repo]
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
            labels: [],
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
    const media = hydrateEmbedView(db, authorDid, embed.media, viewerDid, origin, depth + 1)
    const record = hydrateEmbedView(
      db,
      authorDid,
      embed.record,
      viewerDid,
      origin,
      depth + 1,
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
    indexedAt: postRec.indexedAt || postRec.value?.createdAt || new Date().toISOString(),
    viewer: {
      ...(likeUri ? {like: likeUri} : {}),
      ...(repostUri ? {repost: repostUri} : {}),
      bookmarked,
      threadMuted: false,
      embeddingDisabled: false,
    },
    labels: [],
  }
}

function decorateProfileView(db, profile, viewerDid) {
  if (!profile || typeof profile !== 'object' || !profile.did) return profile
  const followUri = findViewerFollowUri(db, viewerDid, profile.did)
  const viewer = {
    muted: false,
    blockedBy: false,
    ...(profile.viewer || {}),
    ...(followUri ? {following: followUri} : {}),
  }
  let followersCount = profile.followersCount
  if (typeof followersCount === 'number' && followUri && !profile.viewer?.following) {
    followersCount += 1
  }
  return {
    ...profile,
    ...(followersCount !== undefined ? {followersCount} : {}),
    viewer,
  }
}

function decoratePostView(db, post, viewerDid) {
  if (!post || typeof post !== 'object' || !post.uri) return post
  const localCounts = countLocalInteractions(db, post.uri)
  const likeUri = findViewerReactionUri(
    db,
    viewerDid,
    'app.bsky.feed.like',
    post.uri,
  )
  const repostUri = findViewerReactionUri(
    db,
    viewerDid,
    'app.bsky.feed.repost',
    post.uri,
  )
  const bookmarked = isBookmarkedByViewer(db, viewerDid, post.uri)

  const viewer = {
    threadMuted: false,
    embeddingDisabled: false,
    ...(post.viewer || {}),
    ...(likeUri ? {like: likeUri} : {}),
    ...(repostUri ? {repost: repostUri} : {}),
    ...(bookmarked ? {bookmarked: true} : {}),
  }

  return {
    ...post,
    author: decorateProfileView(db, post.author, viewerDid),
    likeCount: (post.likeCount || 0) + localCounts.likeCount,
    repostCount: (post.repostCount || 0) + localCounts.repostCount,
    replyCount: (post.replyCount || 0) + localCounts.replyCount,
    quoteCount: (post.quoteCount || 0) + localCounts.quoteCount,
    bookmarkCount: (post.bookmarkCount || 0) + localCounts.bookmarkCount,
    viewer,
  }
}

function decorateFeedItems(db, items, viewerDid) {
  if (!Array.isArray(items)) return []
  return items.map(item => {
    if (!item || typeof item !== 'object') return item
    const next = {...item}
    if (next.post) {
      next.post = decoratePostView(db, next.post, viewerDid)
    }
    if (next.reply) {
      next.reply = {
        ...next.reply,
        ...(next.reply.root?.uri
          ? {root: decoratePostView(db, next.reply.root, viewerDid)}
          : {}),
        ...(next.reply.parent?.uri
          ? {parent: decoratePostView(db, next.reply.parent, viewerDid)}
          : {}),
      }
    }
    return next
  })
}

function decorateThreadNode(db, node, viewerDid) {
  if (!node || typeof node !== 'object') return node
  const next = {...node}
  if (next.post) {
    next.post = decoratePostView(db, next.post, viewerDid)
  }
  if (next.parent) {
    next.parent = decorateThreadNode(db, next.parent, viewerDid)
  }
  if (Array.isArray(next.replies)) {
    next.replies = next.replies.map(r => decorateThreadNode(db, r, viewerDid))
  }
  return next
}

function getLocalFeedItems(db, viewerDid, origin, {authorDid = null, includeReplies = false} = {}) {
  const posts = authorDid
    ? Object.values(getCollectionMap(db, authorDid, 'app.bsky.feed.post'))
    : getAllLocalRecords(db, 'app.bsky.feed.post')

  const items = []
  for (const postRec of posts) {
    if (!includeReplies && postRec.value?.reply) continue
    const postView = buildLocalPostView(db, postRec, viewerDid, origin)
    if (!postView) continue
    items.push({
      post: postView,
      _sortTime: Date.parse(postRec.value?.createdAt || postRec.indexedAt || 0) || 0,
    })
  }

  items.sort((a, b) => b._sortTime - a._sortTime)
  return items.map(({_sortTime, ...rest}) => rest)
}

// ---------------------------------------------------------------------------
// Upstream Public AppView Proxy helpers (strips Authorization header!)
// ---------------------------------------------------------------------------

function upstreamGet(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      urlString,
      {
        method: 'GET',
        agent: UPSTREAM_HTTPS_AGENT,
        timeout: UPSTREAM_TIMEOUT_MS,
        headers: {
          'accept-encoding': 'gzip, deflate',
          ...headers,
        },
      },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const rawBuf = Buffer.concat(chunks)
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase()
          let body = rawBuf
          try {
            if (encoding === 'gzip') {
              body = zlib.gunzipSync(rawBuf)
            } else if (encoding === 'deflate') {
              body = zlib.inflateSync(rawBuf)
            } else if (encoding === 'br') {
              body = zlib.brotliDecompressSync(rawBuf)
            }
          } catch {
            body = rawBuf
          }
          const status = res.statusCode || 502
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: res.headers,
            body,
          })
        })
        res.on('error', reject)
      },
    )
    req.on('timeout', () => {
      req.destroy(new Error('ETIMEDOUT'))
    })
    req.on('error', reject)
    req.end()
  })
}

async function fetchPublicAppViewJson(nsid, searchParams, reqHeaders = {}) {
  const qs =
    searchParams instanceof URLSearchParams
      ? searchParams.toString()
      : String(searchParams || '').replace(/^\?/, '')
  const url = `${PUBLIC_APPVIEW_ORIGIN}/xrpc/${nsid}${qs ? `?${qs}` : ''}`
  const headers = {
    accept: 'application/json',
  }
  if (reqHeaders['accept-language']) {
    headers['accept-language'] = String(reqHeaders['accept-language'])
  }
  if (reqHeaders['atproto-accept-labelers']) {
    headers['atproto-accept-labelers'] = String(reqHeaders['atproto-accept-labelers'])
  }

  const upstreamRes = await upstreamGet(url, headers)
  const text = upstreamRes.body.toString('utf8')
  let data = null
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {raw: text}
  }
  return {
    ok: upstreamRes.ok,
    status: upstreamRes.status,
    data,
    contentType: upstreamRes.headers['content-type'],
  }
}

async function proxyPublicAppView(req, res, nsid, searchParams) {
  try {
    const qs = searchParams.toString()
    const url = `${PUBLIC_APPVIEW_ORIGIN}/xrpc/${nsid}${qs ? `?${qs}` : ''}`
    const headers = {}
    if (req.headers.accept) headers.accept = String(req.headers.accept)
    if (req.headers['accept-language']) {
      headers['accept-language'] = String(req.headers['accept-language'])
    }
    if (req.headers['atproto-accept-labelers']) {
      headers['atproto-accept-labelers'] = String(
        req.headers['atproto-accept-labelers'],
      )
    }
    // Deliberately strip authorization, cookie, host, atproto-proxy so public AppView never rejects local QuantZing JWTs

    const upstreamRes = await upstreamGet(url, headers)
    const buf = upstreamRes.body
    const contentType =
      upstreamRes.headers['content-type'] || 'application/json; charset=utf-8'
    res.writeHead(
      upstreamRes.status,
      corsHeaders(req, {
        'content-type': contentType,
        'content-length': buf.length,
        'cache-control': 'no-store',
      }),
    )
    res.end(buf)
  } catch (err) {
    sendXrpcError(
      req,
      res,
      502,
      'UpstreamUnavailable',
      `Public AppView proxy error for ${nsid}: ${err?.message || 'network failure'}`,
    )
  }
}

async function hydrateMixedPosts(db, uris, viewerDid, origin, reqHeaders) {
  const localMap = new Map()
  const remoteUris = []

  for (const uri of uris) {
    const parsed = parseAtUri(uri)
    if (parsed && db.accounts[parsed.repo]) {
      const rec = db.records?.[parsed.repo]?.[parsed.collection]?.[parsed.rkey]
      if (rec) {
        const view = buildLocalPostView(db, rec, viewerDid, origin)
        if (view) localMap.set(uri, view)
      }
    } else if (uri) {
      remoteUris.push(uri)
    }
  }

  const remoteMap = new Map()
  if (remoteUris.length > 0) {
    // public.api.bsky.app allows up to 25 URIs per getPosts call
    for (let i = 0; i < remoteUris.length; i += 25) {
      const batch = remoteUris.slice(i, i + 25)
      const params = new URLSearchParams()
      for (const u of batch) params.append('uris', u)
      try {
        const upstream = await fetchPublicAppViewJson(
          'app.bsky.feed.getPosts',
          params,
          reqHeaders,
        )
        if (upstream.ok && Array.isArray(upstream.data?.posts)) {
          for (const p of upstream.data.posts) {
            remoteMap.set(p.uri, decoratePostView(db, p, viewerDid))
          }
        }
      } catch {}
    }
  }

  const posts = []
  for (const uri of uris) {
    const post = localMap.get(uri) || remoteMap.get(uri)
    if (post) posts.push(post)
  }
  return posts
}

// ---------------------------------------------------------------------------
// Route predicate & main handler
// ---------------------------------------------------------------------------

export function isQuantZingPdsRoute(urlPath) {
  const pathname = String(urlPath || '/').split('?')[0]
  return (
    pathname.startsWith('/xrpc/') ||
    pathname.startsWith('/blob/') ||
    pathname === '/api/quantzing/config' ||
    pathname === '/api/quantzing/geolocation' ||
    pathname === '/api/quantzing/config' ||
    pathname === '/api/quantzing/geolocation' ||
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
  // Sovereign QuantZing Config, Geolocation & DID Document
  // -------------------------------------------------------------------------

  if (pathname === '/api/quantzing/config' || pathname === '/api/quantzing/config') {
    sendJson(req, res, 200, {
      ok: true,
      app: 'QuantZing',
      domain: 'quantzing.com',
      did: QUANTZING_DID,
      pds: origin,
      appView: PUBLIC_APPVIEW_ORIGIN,
      mode: 'sovereign-hybrid',
      features: {
        localPds: true,
        publicAppViewProxy: true,
        blobStorage: true,
        bookmarks: true,
      },
    })
    return true
  }

  if (pathname === '/api/quantzing/geolocation' || pathname === '/api/quantzing/geolocation') {
    sendJson(req, res, 200, {
      countryCode: 'IN',
      regionCode: 'DL',
      city: 'New Delhi',
      isAgeRestrictedGeo: false,
      isAgeBlockedGeo: false,
    })
    return true
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
  // Local Blob serving: GET /blob/:did/:cid or GET /blob/:cid
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

  // -------------------------------------------------------------------------
  // XRPC Router (/xrpc/<nsid>)
  // -------------------------------------------------------------------------

  if (!pathname.startsWith('/xrpc/')) {
    return false
  }

  const nsid = pathname.slice('/xrpc/'.length)

  try {
    // -----------------------------------------------------------------------
    // 1. Server & Session endpoints (com.atproto.server.*)
    // -----------------------------------------------------------------------

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

    if (nsid === 'com.atproto.temp.checkHandleAvailability' && method === 'GET') {
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
      const body = await readJsonBody(req)
      const handle = normalizeHandle(body.handle)
      const email = body.email ? String(body.email).trim().toLowerCase() : undefined
      const password = typeof body.password === 'string' ? body.password : ''

      if (!isValidHandleFormat(handle)) {
        sendXrpcError(req, res, 400, 'InvalidHandle', 'Invalid handle format')
        return true
      }
      if (!password || password.length < 1) {
        sendXrpcError(req, res, 400, 'InvalidPassword', 'Password is required')
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
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
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Invalid refresh token')
        return true
      }
      const {account} = auth
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

    if (nsid === 'com.atproto.server.deleteSession' && method === 'POST') {
      const token = extractBearerToken(req)
      if (token) {
        const verified = verifyJwt(db, token)
        if (verified?.payload?.jti) {
          db.revokedTokens.push(verified.payload.jti)
          if (db.revokedTokens.length > 500) {
            db.revokedTokens = db.revokedTokens.slice(-500)
          }
          saveDb(db)
        }
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'com.atproto.server.checkAccountStatus' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const userCols = db.records[auth.did] || {}
      let indexedRecords = 0
      for (const col of Object.values(userCols)) {
        indexedRecords += Object.keys(col || {}).length
      }
      const userBlobs = Object.values(db.blobs).filter(b => b.did === auth.did).length
      sendJson(req, res, 200, {
        activated: true,
        validDid: true,
        repoCommit: computeCid({did: auth.did, indexedRecords}, 'dag-cbor'),
        repoRev: generateTid(),
        repoBlocks: Math.max(1, indexedRecords),
        indexedRecords,
        privateStateValues: (auth.account.preferences || []).length,
        expectedBlobs: userBlobs,
        importedBlobs: userBlobs,
      })
      return true
    }

    if (nsid === 'com.atproto.server.getServiceAuth' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      sendJson(req, res, 200, {
        token: signJwt(db, {
          did: auth.did,
          scope: 'com.atproto.access',
          ttlSeconds: 300,
        }),
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 2. Identity endpoints (com.atproto.identity.*)
    // -----------------------------------------------------------------------

    if (nsid === 'com.atproto.identity.resolveHandle' && method === 'GET') {
      const handleParam = searchParams.get('handle') || ''
      const local = findLocalAccount(db, handleParam)
      if (local) {
        sendJson(req, res, 200, {did: local.did})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    // -----------------------------------------------------------------------
    // 3. Repository & Blob endpoints (com.atproto.repo.*, com.atproto.sync.*)
    // -----------------------------------------------------------------------

    if (nsid === 'com.atproto.repo.createRecord' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      if (!collection || !body.record || typeof body.record !== 'object') {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'collection and record are required')
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      const rkey = String(body.rkey || '')
      if (!collection || !rkey || !body.record || typeof body.record !== 'object') {
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      const collection = String(body.collection || '')
      const rkey = String(body.rkey || '')
      if (!collection || !rkey) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'collection and rkey are required')
        return true
      }
      deleteLocalRecord(db, auth.did, collection, rkey)
      saveDb(db)
      const rev = generateTid()
      sendJson(req, res, 200, {
        commit: {
          cid: computeCid({deleted: `${auth.did}/${collection}/${rkey}`, rev}, 'dag-cbor'),
          rev,
        },
      })
      return true
    }

    if (nsid === 'com.atproto.repo.applyWrites' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
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
      if (localAcc) {
        const rec = db.records?.[localAcc.did]?.[collection]?.[rkey]
        if (!rec) {
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
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'com.atproto.repo.listRecords' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const collection = searchParams.get('collection') || ''
      const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))
      const reverse = searchParams.get('reverse') === 'true'
      const localAcc = findLocalAccount(db, repo)
      if (localAcc) {
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
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'com.atproto.repo.describeRepo' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const localAcc = findLocalAccount(db, repo)
      if (localAcc) {
        sendJson(req, res, 200, {
          handle: localAcc.handle,
          did: localAcc.did,
          didDoc: buildDidDoc(localAcc, origin),
          collections: Object.keys(db.records[localAcc.did] || {}),
          handleIsCorrect: true,
        })
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'com.atproto.repo.uploadBlob' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const data = await readRawBody(req, MAX_BLOB_BODY_BYTES)
      const mimeType = String(
        req.headers['content-type'] || 'application/octet-stream',
      )
        .split(';')[0]
        .trim()
      const cid = computeCid(data, 'raw')
      ensureStorageDirs()
      fs.writeFileSync(path.join(getBlobsDir(), cid), data)
      db.blobs[cid] = {
        cid,
        mimeType,
        size: data.length,
        did: auth.did,
      }
      saveDb(db)
      sendJson(req, res, 200, {
        blob: {
          $type: 'blob',
          ref: {$link: cid},
          mimeType,
          size: data.length,
        },
      })
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
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    // -----------------------------------------------------------------------
    // 4. Actor Preferences & Profiles (app.bsky.actor.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.actor.getPreferences' && method === 'GET') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      if (
        !Array.isArray(auth.account.preferences) ||
        auth.account.preferences.length === 0
      ) {
        auth.account.preferences = createDefaultPreferences()
        saveDb(db)
      }
      sendJson(req, res, 200, {preferences: auth.account.preferences})
      return true
    }

    if (nsid === 'app.bsky.actor.putPreferences' && method === 'POST') {
      const auth = getAuthedContext(req, db)
      if (auth.error) {
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      if (!Array.isArray(body.preferences)) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'preferences array is required')
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
      if (localAcc) {
        sendJson(
          req,
          res,
          200,
          buildLocalProfileView(db, localAcc, viewerDid, origin, true),
        )
        return true
      }
      const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
      if (!upstream.ok) {
        sendJson(req, res, upstream.status, upstream.data)
        return true
      }
      sendJson(req, res, 200, decorateProfileView(db, upstream.data, viewerDid))
      return true
    }

    if (nsid === 'app.bsky.actor.getProfiles' && method === 'GET') {
      const actors = searchParams.getAll('actors')
      const viewerDid = getOptionalViewerDid(req, db)
      const localProfiles = new Map()
      const remoteActors = []

      for (const actor of actors) {
        const localAcc = findLocalAccount(db, actor)
        if (localAcc) {
          localProfiles.set(
            actor,
            buildLocalProfileView(db, localAcc, viewerDid, origin, true),
          )
        } else if (actor) {
          remoteActors.push(actor)
        }
      }

      const remoteProfiles = new Map()
      if (remoteActors.length > 0) {
        const params = new URLSearchParams()
        for (const a of remoteActors) params.append('actors', a)
        const upstream = await fetchPublicAppViewJson(nsid, params, req.headers)
        if (upstream.ok && Array.isArray(upstream.data?.profiles)) {
          for (const p of upstream.data.profiles) {
            const decorated = decorateProfileView(db, p, viewerDid)
            remoteProfiles.set(p.did, decorated)
            remoteProfiles.set(p.handle, decorated)
          }
        }
      }

      const profiles = []
      for (const actor of actors) {
        const p = localProfiles.get(actor) || remoteProfiles.get(actor)
        if (p) profiles.push(p)
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
      const viewerDid = getOptionalViewerDid(req, db)
      const localMatches = []
      if (q) {
        for (const acc of Object.values(db.accounts)) {
          const dn = String(acc.profile?.displayName || '').toLowerCase()
          if (acc.handle.toLowerCase().includes(q) || dn.includes(q)) {
            localMatches.push(
              buildLocalProfileView(db, acc, viewerDid, origin, false),
            )
          }
        }
      }
      try {
        const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
        const remoteActors =
          upstream.ok && Array.isArray(upstream.data?.actors)
            ? upstream.data.actors.map(a => decorateProfileView(db, a, viewerDid))
            : []
        sendJson(req, res, 200, {
          ...(upstream.data?.cursor ? {cursor: upstream.data.cursor} : {}),
          actors: [...localMatches, ...remoteActors],
        })
      } catch {
        sendJson(req, res, 200, {actors: localMatches})
      }
      return true
    }

    // -----------------------------------------------------------------------
    // 5. Feeds, Posts & Threads (app.bsky.feed.*, getPostThreadV2)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.feed.getTimeline' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, db)
      const cursor = searchParams.get('cursor')
      const limit = searchParams.get('limit') || '30'

      const localItems = !cursor
        ? getLocalFeedItems(db, viewerDid, origin, {includeReplies: false})
        : []

      let remoteFeed = []
      let remoteCursor
      try {
        const params = new URLSearchParams()
        params.set('feed', DISCOVER_FEED_URI)
        params.set('limit', limit)
        if (cursor) params.set('cursor', cursor)
        const upstream = await fetchPublicAppViewJson(
          'app.bsky.feed.getFeed',
          params,
          req.headers,
        )
        if (upstream.ok && Array.isArray(upstream.data?.feed)) {
          remoteFeed = decorateFeedItems(db, upstream.data.feed, viewerDid)
          remoteCursor = upstream.data.cursor
        }
      } catch {}

      sendJson(req, res, 200, {
        ...(remoteCursor ? {cursor: remoteCursor} : {}),
        feed: [...localItems, ...remoteFeed],
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getFeed' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, db)
      const feedUri = searchParams.get('feed') || ''
      const cursor = searchParams.get('cursor')
      const isDiscover = feedUri === DISCOVER_FEED_URI

      const localItems =
        isDiscover && !cursor
          ? getLocalFeedItems(db, viewerDid, origin, {includeReplies: false})
          : []

      try {
        const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
        if (!upstream.ok) {
          if (localItems.length > 0) {
            sendJson(req, res, 200, {feed: localItems})
            return true
          }
          sendJson(req, res, upstream.status, upstream.data)
          return true
        }
        const remoteFeed = decorateFeedItems(
          db,
          upstream.data?.feed || [],
          viewerDid,
        )
        sendJson(req, res, 200, {
          ...(upstream.data?.cursor ? {cursor: upstream.data.cursor} : {}),
          feed: [...localItems, ...remoteFeed],
        })
      } catch {
        sendJson(req, res, 200, {feed: localItems})
      }
      return true
    }

    if (nsid === 'app.bsky.feed.getAuthorFeed' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const filter = searchParams.get('filter') || 'posts_with_replies'
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)

      if (localAcc) {
        const posts = Object.values(
          getCollectionMap(db, localAcc.did, 'app.bsky.feed.post'),
        )
        const feedEntries = []

        for (const postRec of posts) {
          if (filter === 'posts_no_replies' && postRec.value?.reply) continue
          if (filter === 'posts_with_media' && !postRec.value?.embed) continue
          if (
            filter === 'posts_with_video' &&
            postRec.value?.embed?.$type !== 'app.bsky.embed.video'
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

        // Also include local reposts when not filtered strictly to media/video
        if (filter !== 'posts_with_media' && filter !== 'posts_with_video') {
          const reposts = Object.values(
            getCollectionMap(db, localAcc.did, 'app.bsky.feed.repost'),
          )
          const repostUris = reposts
            .map(r => r?.value?.subject?.uri)
            .filter(Boolean)
          if (repostUris.length > 0) {
            const hydrated = await hydrateMixedPosts(
              db,
              repostUris,
              viewerDid,
              origin,
              req.headers,
            )
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
        sendJson(req, res, 200, {
          feed: feedEntries.map(({_sortTime, ...rest}) => rest),
        })
        return true
      }

      const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
      if (!upstream.ok) {
        sendJson(req, res, upstream.status, upstream.data)
        return true
      }
      sendJson(req, res, 200, {
        ...upstream.data,
        feed: decorateFeedItems(db, upstream.data?.feed || [], viewerDid),
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getActorLikes' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (localAcc) {
        const likes = Object.values(
          getCollectionMap(db, localAcc.did, 'app.bsky.feed.like'),
        ).sort((a, b) =>
          String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
        )
        const uris = likes.map(l => l?.value?.subject?.uri).filter(Boolean)
        const posts = await hydrateMixedPosts(db, uris, viewerDid, origin, req.headers)
        sendJson(req, res, 200, {feed: posts.map(post => ({post}))})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.feed.getPosts' && method === 'GET') {
      const uris = searchParams.getAll('uris')
      const viewerDid = getOptionalViewerDid(req, db)
      const posts = await hydrateMixedPosts(db, uris, viewerDid, origin, req.headers)
      sendJson(req, res, 200, {posts})
      return true
    }

    if (nsid === 'app.bsky.feed.getPostThread' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const parsed = parseAtUri(uri)

      // Local replies targeting this URI (works for both local and remote parent posts)
      const localReplies = getAllLocalRecords(db, 'app.bsky.feed.post')
        .filter(r => r?.value?.reply?.parent?.uri === uri)
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

      if (parsed && db.accounts[parsed.repo]) {
        const postRec = db.records?.[parsed.repo]?.[parsed.collection]?.[parsed.rkey]
        if (!postRec) {
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
          const [parentPost] = await hydrateMixedPosts(
            db,
            [parentUri],
            viewerDid,
            origin,
            req.headers,
          )
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

      const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
      if (!upstream.ok) {
        sendJson(req, res, upstream.status, upstream.data)
        return true
      }
      const thread = decorateThreadNode(db, upstream.data?.thread, viewerDid)
      if (thread && localReplies.length > 0) {
        thread.replies = [...localReplies, ...(thread.replies || [])]
      }
      sendJson(req, res, 200, {...upstream.data, thread})
      return true
    }

    if (nsid === 'app.bsky.unspecced.getPostThreadV2' && method === 'GET') {
      const anchor = searchParams.get('anchor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const parsed = parseAtUri(anchor)

      const localReplies = getAllLocalRecords(db, 'app.bsky.feed.post')
        .filter(r => r?.value?.reply?.parent?.uri === anchor)
        .sort((a, b) =>
          String(a.indexedAt || '').localeCompare(String(b.indexedAt || '')),
        )
        .map(r => buildLocalPostView(db, r, viewerDid, origin))
        .filter(Boolean)

      if (parsed && db.accounts[parsed.repo]) {
        const postRec = db.records?.[parsed.repo]?.[parsed.collection]?.[parsed.rkey]
        if (!postRec) {
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
          const [parentPost] = await hydrateMixedPosts(
            db,
            [parentUri],
            viewerDid,
            origin,
            req.headers,
          )
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

      const upstream = await fetchPublicAppViewJson(nsid, searchParams, req.headers)
      if (!upstream.ok) {
        sendJson(req, res, upstream.status, upstream.data)
        return true
      }
      const thread = Array.isArray(upstream.data?.thread)
        ? upstream.data.thread.map(item => {
            if (item?.value?.post) {
              return {
                ...item,
                value: {
                  ...item.value,
                  post: decoratePostView(db, item.value.post, viewerDid),
                },
              }
            }
            return item
          })
        : []
      for (const replyPost of localReplies) {
        thread.push({
          uri: replyPost.uri,
          depth: 1,
          value: {
            $type: 'app.bsky.unspecced.defs#threadItemPost',
            post: replyPost,
            moreParents: false,
            moreReplies: 0,
            opThread: false,
            hiddenByThreadgate: false,
            mutedByViewer: false,
          },
        })
      }
      sendJson(req, res, 200, {...upstream.data, thread})
      return true
    }

    if (nsid === 'app.bsky.feed.getLikes' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const parsed = parseAtUri(uri)
      if (parsed && db.accounts[parsed.repo]) {
        const likes = getAllLocalRecords(db, 'app.bsky.feed.like')
          .filter(r => r?.value?.subject?.uri === uri)
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
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.feed.getRepostedBy' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const parsed = parseAtUri(uri)
      if (parsed && db.accounts[parsed.repo]) {
        const repostedBy = getAllLocalRecords(db, 'app.bsky.feed.repost')
          .filter(r => r?.value?.subject?.uri === uri)
          .map(r => {
            const acc = db.accounts[r.repo]
            return acc ? buildLocalProfileView(db, acc, viewerDid, origin, false) : null
          })
          .filter(Boolean)
        sendJson(req, res, 200, {uri, repostedBy})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.feed.getQuotes' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const parsed = parseAtUri(uri)
      if (parsed && db.accounts[parsed.repo]) {
        const posts = getAllLocalRecords(db, 'app.bsky.feed.post')
          .filter(
            r =>
              r?.value?.embed?.record?.uri === uri ||
              r?.value?.embed?.record?.record?.uri === uri,
          )
          .map(r => buildLocalPostView(db, r, viewerDid, origin))
          .filter(Boolean)
        sendJson(req, res, 200, {uri, posts})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const body = await readJsonBody(req)
      if (!body.uri || !body.cid) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'uri and cid are required')
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
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
        sendXrpcError(req, res, auth.status, auth.error, 'Authentication required')
        return true
      }
      const list = db.bookmarks[auth.did] || []
      const uris = list.map(b => b.uri)
      const hydrated = await hydrateMixedPosts(
        db,
        uris,
        auth.did,
        origin,
        req.headers,
      )
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
      if (localAcc) {
        const subject = buildLocalProfileView(db, localAcc, viewerDid, origin, false)
        const followRecs = Object.values(
          getCollectionMap(db, localAcc.did, 'app.bsky.graph.follow'),
        )
        const subjectDids = followRecs.map(r => r?.value?.subject).filter(Boolean)
        const follows = []
        const remoteDids = []
        for (const did of subjectDids) {
          if (db.accounts[did]) {
            follows.push(
              buildLocalProfileView(db, db.accounts[did], viewerDid, origin, false),
            )
          } else {
            remoteDids.push(did)
          }
        }
        if (remoteDids.length > 0) {
          const params = new URLSearchParams()
          for (const d of remoteDids.slice(0, 25)) params.append('actors', d)
          try {
            const upstream = await fetchPublicAppViewJson(
              'app.bsky.actor.getProfiles',
              params,
              req.headers,
            )
            if (upstream.ok && Array.isArray(upstream.data?.profiles)) {
              for (const p of upstream.data.profiles) {
                follows.push(decorateProfileView(db, p, viewerDid))
              }
            }
          } catch {}
        }
        sendJson(req, res, 200, {subject, follows})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.graph.getFollowers' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, db)
      const localAcc = findLocalAccount(db, actor)
      if (localAcc) {
        const subject = buildLocalProfileView(db, localAcc, viewerDid, origin, false)
        const followers = getAllLocalRecords(db, 'app.bsky.graph.follow')
          .filter(r => r?.value?.subject === localAcc.did)
          .map(r => {
            const acc = db.accounts[r.repo]
            return acc ? buildLocalProfileView(db, acc, viewerDid, origin, false) : null
          })
          .filter(Boolean)
        sendJson(req, res, 200, {subject, followers})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.graph.getLists' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      if (findLocalAccount(db, actor)) {
        sendJson(req, res, 200, {lists: []})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.graph.getMutes' && method === 'GET') {
      sendJson(req, res, 200, {mutes: []})
      return true
    }

    if (nsid === 'app.bsky.graph.getBlocks' && method === 'GET') {
      sendJson(req, res, 200, {blocks: []})
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

    if (nsid === 'app.bsky.graph.getSuggestedFollowsByActor' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      if (findLocalAccount(db, actor)) {
        try {
          const params = new URLSearchParams({limit: '10'})
          const upstream = await fetchPublicAppViewJson(
            'app.bsky.actor.getSuggestions',
            params,
            req.headers,
          )
          const viewerDid = getOptionalViewerDid(req, db)
          const suggestions =
            upstream.ok && Array.isArray(upstream.data?.actors)
              ? upstream.data.actors.map(a => decorateProfileView(db, a, viewerDid))
              : []
          sendJson(req, res, 200, {suggestions, isFallback: true})
        } catch {
          sendJson(req, res, 200, {suggestions: [], isFallback: true})
        }
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    if (nsid === 'app.bsky.graph.getRelationships' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const others = searchParams.getAll('others')
      const localAcc = findLocalAccount(db, actor)
      if (localAcc) {
        const relationships = others.map(otherDid => {
          const following = findViewerFollowUri(db, localAcc.did, otherDid)
          const followedBy = findViewerFollowUri(db, otherDid, localAcc.did)
          return {
            $type: 'app.bsky.graph.defs#relationship',
            did: otherDid,
            ...(following ? {following} : {}),
            ...(followedBy ? {followedBy} : {}),
          }
        })
        sendJson(req, res, 200, {actor: localAcc.did, relationships})
        return true
      }
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    // -----------------------------------------------------------------------
    // 8. Notifications (app.bsky.notification.*)
    // -----------------------------------------------------------------------

    if (
      (nsid === 'app.bsky.notification.listNotifications' ||
        nsid === 'app.bsky.notification.getGroupedNotifications') &&
      method === 'GET'
    ) {
      sendJson(req, res, 200, {notifications: [], priority: false})
      return true
    }

    if (nsid === 'app.bsky.notification.getUnreadCount' && method === 'GET') {
      sendJson(req, res, 200, {count: 0})
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
      (nsid === 'app.bsky.notification.updateSeen' ||
        nsid === 'app.bsky.notification.registerPush' ||
        nsid === 'app.bsky.notification.unregisterPush') &&
      method === 'POST'
    ) {
      sendEmpty(req, res, 200)
      return true
    }

    // -----------------------------------------------------------------------
    // 9. Age Assurance & Unspecced Config (prevent auth-blocker popups locally)
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

    if (nsid === 'app.bsky.unspecced.getAgeAssuranceState' && method === 'GET') {
      sendJson(req, res, 200, {status: 'assured'})
      return true
    }

    if (nsid === 'app.bsky.unspecced.getConfig' && method === 'GET') {
      sendJson(req, res, 200, {checkEmailConfirmed: false})
      return true
    }

    // -----------------------------------------------------------------------
    // 10. Chat endpoints (chat.bsky.*) -> safe empty responses locally
    // -----------------------------------------------------------------------

    if (nsid.startsWith('chat.bsky.')) {
      if (nsid === 'chat.bsky.convo.getUnreadCounts') {
        sendJson(req, res, 200, {
          unreadRequestConvos: 0,
          unreadAcceptedConvos: 0,
        })
        return true
      }
      if (nsid === 'chat.bsky.convo.getLog') {
        sendJson(req, res, 200, {logs: []})
        return true
      }
      if (nsid === 'chat.bsky.convo.listConvoRequests') {
        sendJson(req, res, 200, {requests: []})
        return true
      }
      if (nsid === 'chat.bsky.convo.getConvoAvailability') {
        sendJson(req, res, 200, {canChat: false})
        return true
      }
      sendJson(req, res, 200, {convos: [], messages: []})
      return true
    }

    // -----------------------------------------------------------------------
    // 11. Catch-all GET /xrpc/* -> transparent Public AppView proxy
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.feed.searchPosts' && method === 'GET') {
      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const limit = Math.min(Number(searchParams.get('limit') || 25) || 25, 50)
      const viewerDid = getOptionalViewerDid(req, db)
      const localMatches = []
      if (q) {
        const terms = q.split(/\s+/).filter(Boolean)
        for (const [did, collections] of Object.entries(db.records || {})) {
          const postsMap = collections?.['app.bsky.feed.post'] || {}
          for (const rec of Object.values(postsMap)) {
            const txt = String(rec?.value?.text || '').toLowerCase()
            const handle = String(db.accounts?.[did]?.handle || '').toLowerCase()
            if (terms.some(t => txt.includes(t) || handle.includes(t.replace(/^from:/, '')))) {
              const view = buildLocalPostView(db, rec, viewerDid, origin)
              if (view) localMatches.push(view)
            }
          }
        }
      }
      sendJson(req, res, 200, {posts: localMatches.slice(0, limit)})
      return true
    }

    if (method === 'GET') {
      await proxyPublicAppView(req, res, nsid, searchParams)
      return true
    }

    // Safe 200 fallback for non-destructive mute/unmute/telemetry POSTs
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
      `Endpoint ${method} /xrpc/${nsid} is not implemented on QuantZing PDS`,
    )
    return true
  } catch (err) {
    if (err?.message === 'PayloadTooLarge') {
      sendXrpcError(req, res, 413, 'PayloadTooLarge', 'Request payload too large')
      return true
    }
    if (err?.message === 'InvalidJsonBody') {
      sendXrpcError(req, res, 400, 'InvalidRequest', 'Invalid JSON request body')
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
