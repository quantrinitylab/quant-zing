import crypto from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import util from 'node:util'
import {fileURLToPath} from 'node:url'
import {
  FOUNDER_DID,
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
  isStaffRole,
} from './quantzing-admin.mjs'
import {createQuantyBridge} from './quantzing-quanty.mjs'
import {
  closeAllStores,
  extractHashtagsFromText,
  extractMentionsFromText,
  getStore,
  parseAtUriRaw,
} from './quantzing-store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const scryptAsync = util.promisify(crypto.scrypt)

// ---------------------------------------------------------------------------
// 100% Sovereign QuantZing Constants (ZERO external Bluesky network calls)
// ---------------------------------------------------------------------------

const QUANTZING_DID = 'did:web:quantzing.com'
const QUANTZING_DOMAIN = '.quantzing.com'
const QUANTZING_ALT_DOMAIN = '.quantzing.in'

// RFC 4648 base32 strictly-valid 24-char PLC DIDs ([a-z2-7]{24})
export const QUANTZING_OFFICIAL_DID = 'did:plc:quantzingofficialaaaaaaa'
export const QUANTY_SYSTEM_DID = 'did:plc:quantyaiofficialaaaaaaaa'
export const QUANTRINITY_DID = 'did:plc:quantrinitylabaaaaaaaaaa'
export const QUANTZING_NEWS_DID = 'did:plc:quantzingnewsdesk2222222'
export const QUANT_BUILDERS_DID = 'did:plc:quantbuildershq222222222'

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
const spaceSseClients = new Map() // slug -> Set<http.ServerResponse>

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

const videoPruneTimer = setInterval(pruneExpiredVideoUploads, 60_000)
if (typeof videoPruneTimer.unref === 'function') {
  videoPruneTimer.unref()
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

function isMediaEmbed(embed) {
  if (!embed || typeof embed !== 'object') return false
  const t = embed.$type
  if (t === 'app.bsky.embed.images' || t === 'app.bsky.embed.video') return true
  if (t === 'app.bsky.embed.recordWithMedia') {
    const mt = embed.media?.$type
    return mt === 'app.bsky.embed.images' || mt === 'app.bsky.embed.video'
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
// App Release, Android APK & iOS .mobileconfig Helpers
// ---------------------------------------------------------------------------

let cachedPackageVersion = null
export function getPackageVersion() {
  if (cachedPackageVersion) return cachedPackageVersion
  try {
    const pkgPath = path.join(projectRoot, 'package.json')
    const raw = fs.readFileSync(pkgPath, 'utf8')
    const parsed = JSON.parse(raw)
    cachedPackageVersion = String(parsed.version || '1.139.0')
  } catch {
    cachedPackageVersion = '1.139.0'
  }
  return cachedPackageVersion
}

export function findAndroidApkPath() {
  const candidates = [
    process.env.QUANTZING_APK_PATH,
    path.join(
      process.env.QUANTZING_DATA_DIR || path.join(projectRoot, '.quantzing-data'),
      'releases',
      'quantzing-android.apk',
    ),
    path.join(projectRoot, 'releases', 'quantzing-android.apk'),
    '/var/lib/quantzing/releases/quantzing-android.apk',
    '/opt/quantzing/releases/quantzing-android.apk',
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p)
      if (stat.isFile() && stat.size > 20_000) {
        return p
      }
    } catch {}
  }
  return null
}

function formatByteSizeLabel(bytes) {
  const n = Number(bytes || 0)
  if (n <= 0) return 'Pending build'
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

let cachedApkMeta = null
export function getAndroidApkMeta() {
  const version = getPackageVersion()
  const apkPath = findAndroidApkPath()
  if (!apkPath) {
    return {
      available: false,
      version,
      downloadUrl: '/download/quantzing-android.apk',
      sizeBytes: 0,
      sizeLabel: 'Pending build',
      sha256: null,
      updatedAt: null,
    }
  }
  try {
    const stat = fs.statSync(apkPath)
    if (
      cachedApkMeta &&
      cachedApkMeta.path === apkPath &&
      cachedApkMeta.mtimeMs === stat.mtimeMs &&
      cachedApkMeta.sizeBytes === stat.size
    ) {
      return {...cachedApkMeta.meta, version}
    }
    let hash = null
    try {
      const sidecar = JSON.parse(fs.readFileSync(`${apkPath}.meta.json`, 'utf8'))
      if (sidecar && sidecar.sizeBytes === stat.size && typeof sidecar.sha256 === 'string') {
        hash = sidecar.sha256
      }
    } catch {}
    if (!hash) {
      hash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(apkPath))
        .digest('hex')
    }
    const meta = {
      available: true,
      version,
      downloadUrl: '/download/quantzing-android.apk',
      sizeBytes: stat.size,
      sizeLabel: formatByteSizeLabel(stat.size),
      sha256: hash,
      updatedAt: stat.mtime.toISOString(),
    }
    cachedApkMeta = {
      path: apkPath,
      mtimeMs: stat.mtimeMs,
      sizeBytes: stat.size,
      meta,
    }
    return meta
  } catch {
    return {
      available: false,
      version,
      downloadUrl: '/download/quantzing-android.apk',
      sizeBytes: 0,
      sizeLabel: 'Pending build',
      sha256: null,
      updatedAt: null,
    }
  }
}

export function findIosTouchIconPng() {
  const candidates = [
    path.join(projectRoot, 'assets', 'app-icons', 'ios_icon_default_next.png'),
    path.join(projectRoot, 'assets', 'app-icons', 'android_icon_default_next.png'),
    path.join(projectRoot, 'assets', 'icon.png'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

let cachedIosMobileconfig = null
export function buildIosMobileconfigXml() {
  if (cachedIosMobileconfig) return cachedIosMobileconfig
  const iconPath = findIosTouchIconPng()
  let iconBase64 = ''
  if (iconPath) {
    try {
      iconBase64 = fs.readFileSync(iconPath).toString('base64')
    } catch {}
  }
  const version = getPackageVersion()
  cachedIosMobileconfig = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IgnoreManifestScope</key>
      <false/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>QuantZing</string>
      <key>PayloadDescription</key>
      <string>Installs QuantZing full-screen sovereign application on iOS and iPadOS</string>
      <key>PayloadDisplayName</key>
      <string>QuantZing WebClip</string>
      <key>PayloadIdentifier</key>
      <string>com.quantzing.app.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>8D9E2C40-6A1B-4F91-B2A3-9F7011223344</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>https://quantzing.quantrinity.in</string>${
        iconBase64
          ? `\n      <key>Icon</key>\n      <data>${iconBase64}</data>`
          : ''
      }
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>QuantZing v${version} Sovereign Social Network &amp; Built-in Quanty AI</string>
  <key>PayloadDisplayName</key>
  <string>QuantZing</string>
  <key>PayloadIdentifier</key>
  <string>com.quantzing.app.profile</string>
  <key>PayloadOrganization</key>
  <string>Quantrinity Lab</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>7A4F1E20-3C89-4E55-A9D1-8E6011223355</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`
  return cachedIosMobileconfig
}

export function getAppReleasePayload() {
  const apk = getAndroidApkMeta()
  return {
    ok: true,
    appName: 'QuantZing',
    version: apk.version,
    available: apk.available,
    downloadUrl: apk.downloadUrl,
    sizeBytes: apk.sizeBytes,
    sizeLabel: apk.sizeLabel,
    sha256: apk.sha256,
    updatedAt: apk.updatedAt,
    pwaReady: true,
    androidApkAvailable: apk.available,
    androidApkUrl: apk.downloadUrl,
    androidApkSizeBytes: apk.sizeBytes,
    androidApkSha256: apk.sha256,
    androidApkUpdatedAt: apk.updatedAt,
    iosInstallMode: 'mobileconfig',
    playStoreStatus: 'upcoming',
    appStoreStatus: 'pending_macos_ipa_submission',
    ios: {
      mobileconfigUrl: '/download/quantzing-ios.mobileconfig',
      pwaSupported: true,
      appStoreStatus: 'pending_macos_ipa_submission',
    },
  }
}

// ---------------------------------------------------------------------------
// Data paths & SQLite WAL Store Bootstrap (Once per store instance!)
// ---------------------------------------------------------------------------

function getDataDir() {
  return (
    process.env.QUANTZING_DATA_DIR ||
    path.resolve(__dirname, '..', '.quantzing-data')
  )
}

function getDbPath() {
  return path.join(getDataDir(), 'quantzing.sqlite')
}

function getBlobsDir() {
  return path.join(getDataDir(), 'blobs')
}

export function getActiveStore() {
  const store = getStore(getDataDir())
  if (!store._bootstrapped) {
    ensureStoreBootstrapped(store)
    store._bootstrapped = true
  }
  return store
}

export function flushAndClosePdsStore() {
  closeAllStores()
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
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(String(input), 'utf8')
  return buf.toString('base64url')
}

function base64UrlDecodeJson(segment) {
  const raw = Buffer.from(segment, 'base64url').toString('utf8')
  return JSON.parse(raw)
}

function getJwtSecretFromStoreOrDb(storeOrDb) {
  if (!storeOrDb) return getActiveStore().getJwtSecret()
  if (typeof storeOrDb.getJwtSecret === 'function') {
    return storeOrDb.getJwtSecret()
  }
  if (storeOrDb._store && typeof storeOrDb._store.getJwtSecret === 'function') {
    return storeOrDb._store.getJwtSecret()
  }
  return storeOrDb.jwtSecret || getActiveStore().getJwtSecret()
}

function signJwt(storeOrDb, {did, scope, ttlSeconds, tv}) {
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
    .createHmac('sha256', getJwtSecretFromStoreOrDb(storeOrDb))
    .update(signingInput)
    .digest('base64url')
  return `${signingInput}.${sig}`
}

function mintTokens(storeOrDb, did) {
  const store =
    typeof storeOrDb?.getAccountByDid === 'function'
      ? storeOrDb
      : storeOrDb?._store || getActiveStore()
  const acc = store.getAccountByDid(did) || storeOrDb?.accounts?.[did]
  const tv = Number(acc?.tokenVersion) || 1
  return {
    accessJwt: signJwt(store, {
      did,
      scope: 'com.atproto.access',
      ttlSeconds: 30 * 24 * 60 * 60,
      tv,
    }),
    refreshJwt: signJwt(store, {
      did,
      scope: 'com.atproto.refresh',
      ttlSeconds: 90 * 24 * 60 * 60,
      tv,
    }),
  }
}

function verifyJwt(storeOrDb, token, expectedScope = null) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const store =
    typeof storeOrDb?.getAccountByDid === 'function'
      ? storeOrDb
      : storeOrDb?._store || getActiveStore()
  const expectedSig = crypto
    .createHmac('sha256', store.getJwtSecret())
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
  if (payload.jti && store.isTokenRevoked(payload.jti)) {
    return null
  }
  if (expectedScope && payload.scope !== expectedScope) {
    return null
  }
  const account = store.getAccountByDid(payload.sub)
  if (!account) return null
  return {expired: false, payload, account}
}

function hashPasswordSync(
  password,
  salt = crypto.randomBytes(16).toString('hex'),
) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return {salt, hash}
}

async function hashPasswordAsync(
  password,
  salt = crypto.randomBytes(16).toString('hex'),
) {
  const derived = await scryptAsync(String(password), salt, 64)
  return {salt, hash: Buffer.from(derived).toString('hex')}
}

function verifyPasswordSync(password, salt, expectedHash) {
  if (!salt || !expectedHash || salt === 'system' || expectedHash === 'system') {
    return false
  }
  const computed = crypto.scryptSync(String(password), salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  return (
    computed.length === expected.length &&
    crypto.timingSafeEqual(computed, expected)
  )
}

async function verifyPasswordAsync(password, salt, expectedHash) {
  if (!salt || !expectedHash || salt === 'system' || expectedHash === 'system') {
    return false
  }
  const computed = Buffer.from(await scryptAsync(String(password), salt, 64))
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
  return parseAtUriRaw(uri)
}

function unwrapStore(storeOrDb) {
  if (!storeOrDb) return getActiveStore()
  if (typeof storeOrDb.findAccount === 'function') return storeOrDb
  if (storeOrDb._store) return storeOrDb._store
  return getActiveStore()
}

function resolveAtUri(storeOrDb, uri) {
  return unwrapStore(storeOrDb).resolveAtUri(uri)
}

function canonicalizeUri(storeOrDb, uri) {
  return unwrapStore(storeOrDb).canonicalizeUri(uri)
}

// ---------------------------------------------------------------------------
// Sovereign Blob Storage (Sharded + Legacy Fallback) & Genesis Network Seeder
// ---------------------------------------------------------------------------

function storeLocalBlob(storeOrDb, did, buffer, mimeType) {
  const store = unwrapStore(storeOrDb)
  const cid = computeCid(buffer, 'raw')
  const existingPath = store.resolveExistingBlobPath(cid)
  if (!existingPath) {
    const targetPath = store.ensureBlobWritePath(cid)
    fs.writeFileSync(targetPath, buffer)
  }
  store.putBlobMeta({
    cid,
    did,
    mimeType,
    size: buffer.length,
  })
  if (storeOrDb && storeOrDb._isCompatView && storeOrDb.blobs) {
    storeOrDb.blobs[cid] = {
      cid,
      did,
      mimeType,
      size: buffer.length,
    }
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

function buildFacetsForText(storeOrDb, text) {
  const store = unwrapStore(storeOrDb)
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
    const rawMention = m[2].slice(1).replace(/[.,!?;:]+$/, '').toLowerCase()
    const acc = store.findAccount(rawMention)
    if (!acc) continue
    const startChar = m.index + m[1].length
    const endChar = startChar + 1 + rawMention.length
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
    tags: [
      'quantos',
      'startups',
      'opensource',
      'typescript',
      'cloudinfra',
      'builders',
    ],
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

const PRO_PLANS = [
  {
    id: 'free',
    name: 'QuantZing Sovereign Free',
    priceInr: 0,
    priceUsd: 0,
    billingCycle: 'forever',
    features: [
      'Sovereign @handle.quantzing.com identity',
      'Real-time Zings, Reels, Polls & Direct Messages',
      'Join live ZingSpaces audio rooms',
      'Standard @quanty AI mentions & search',
    ],
    badge: 'Sovereign Member',
  },
  {
    id: 'pro_monthly',
    name: 'QuantZing Pro Monthly',
    priceInr: 499,
    priceUsd: 6,
    billingCycle: 'monthly',
    features: [
      'Verified Sovereign Pro check badge',
      'Priority @quanty DeepSearch & 21-Tool Control Copilot',
      'Publish long-form Sovereign Articles & host ZingSpaces',
      'Full Creator Studio analytics & 300 MB HD video uploads',
    ],
    badge: 'Verified Pro',
  },
  {
    id: 'pro_annual',
    name: 'QuantZing Pro Annual',
    priceInr: 4999,
    priceUsd: 59,
    billingCycle: 'annual',
    features: [
      'Verified Sovereign Pro check badge (2 months free)',
      'Priority @quanty DeepSearch & 21-Tool Control Copilot',
      'Publish long-form Sovereign Articles & host ZingSpaces',
      'Creator monetization eligibility & priority support',
    ],
    badge: 'Verified Pro Annual',
  },
  {
    id: 'creator_studio',
    name: 'QuantZing Creator Studio+',
    priceInr: 1499,
    priceUsd: 18,
    billingCycle: 'monthly',
    features: [
      'Verified Creator check badge + QuantPay payout settlement',
      'Unlimited Sovereign Articles, ZingSpaces hosting & series',
      'Dedicated QuantAI / QuantRouter pro inference allocation',
      'Direct Creator Studio audience analytics export',
    ],
    badge: 'Verified Creator',
  },
]

function ensureStoreBootstrapped(store) {
  store.inTransaction(() => {
    for (const spec of OFFICIAL_GENESIS_ACCOUNTS) {
      let acc = store.getAccountByDid(spec.did)
      const currentAvatarCid = extractBlobCid(acc?.profile?.avatar)
      const needsAvatar =
        !currentAvatarCid ||
        !store.getBlobMeta(currentAvatarCid) ||
        !store.resolveExistingBlobPath(currentAvatarCid)

      let avatarBlob = acc?.profile?.avatar || null
      if (needsAvatar) {
        const svgBuf = Buffer.from(makeAvatarSvg(spec.avatarVariant), 'utf8')
        avatarBlob = storeLocalBlob(store, spec.did, svgBuf, 'image/svg+xml')
      }

      if (!acc) {
        acc = store.upsertAccount({
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
        })
      } else if (needsAvatar || !acc.verified || !acc.isOfficial) {
        acc = store.upsertAccount({
          ...acc,
          verified: true,
          isOfficial: true,
          isSystemQuanty: Boolean(spec.isSystemQuanty || acc.isSystemQuanty),
          profile: {
            ...(acc.profile || {}),
            displayName: acc.profile?.displayName || spec.displayName,
            description: acc.profile?.description || spec.description,
            avatar: avatarBlob || acc.profile?.avatar,
            createdAt: acc.profile?.createdAt || spec.createdAt,
          },
        })
      }

      const existingProfileRec = store.getRecord(
        spec.did,
        'app.bsky.actor.profile',
        'self',
      )
      if (!existingProfileRec || needsAvatar) {
        const profileValue = {
          $type: 'app.bsky.actor.profile',
          displayName: acc.profile?.displayName || spec.displayName,
          description: acc.profile?.description || spec.description,
          ...(avatarBlob ? {avatar: avatarBlob} : {}),
          createdAt: spec.createdAt,
        }
        store.putRecord({
          uri: `at://${spec.did}/app.bsky.actor.profile/self`,
          cid: computeCid(profileValue, 'dag-cbor'),
          rkey: 'self',
          collection: 'app.bsky.actor.profile',
          repo: spec.did,
          value: profileValue,
          indexedAt: spec.createdAt,
        })
      }
    }

    const currentGenesisVersion = Number(store.getMeta('genesis_version', '0'))
    if (currentGenesisVersion < GENESIS_VERSION) {
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
        const existing = store.getRecord(
          item.did,
          'app.bsky.feed.post',
          item.rkey,
        )
        if (!existing) {
          const createdAt = new Date(
            now - item.minutesAgo * 60_000,
          ).toISOString()
          const facets = buildFacetsForText(store, item.text)
          const value = {
            $type: 'app.bsky.feed.post',
            text: item.text,
            createdAt,
            langs: ['en'],
            ...(facets ? {facets} : {}),
          }
          const entry = store.putRecord({
            uri: `at://${item.did}/app.bsky.feed.post/${item.rkey}`,
            cid: computeCid(value, 'dag-cbor'),
            rkey: item.rkey,
            collection: 'app.bsky.feed.post',
            repo: item.did,
            value,
            indexedAt: createdAt,
          })
          if (item.rkey === '3mquantzing008') lastBuilderPost = entry
        } else if (item.rkey === '3mquantzing008') {
          lastBuilderPost = existing
        }
      }

      if (
        lastBuilderPost &&
        !store.getRecord(QUANTY_SYSTEM_DID, 'app.bsky.feed.post', '3mquantzing009')
      ) {
        const replyAt = new Date(now - 178 * 60_000).toISOString()
        const replyText =
          '@builders.quantzing.com Owning the PDS + AppView means zero third-party rate limits, full data sovereignty for every handle and Zing, instant custom ranking, and native AI integration across threads.'
        const facets = buildFacetsForText(store, replyText)
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
        store.putRecord({
          uri: `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/3mquantzing009`,
          cid: computeCid(replyValue, 'dag-cbor'),
          rkey: '3mquantzing009',
          collection: 'app.bsky.feed.post',
          repo: QUANTY_SYSTEM_DID,
          value: replyValue,
          indexedAt: replyAt,
        })
      }

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
        if (!store.findUserFollowUri(src, dst)) {
          const rkey = generateTid()
          const createdAt = new Date(now - 200 * 60_000).toISOString()
          const value = {
            $type: 'app.bsky.graph.follow',
            subject: dst,
            createdAt,
          }
          store.putRecord({
            uri: `at://${src}/app.bsky.graph.follow/${rkey}`,
            cid: computeCid(value, 'dag-cbor'),
            rkey,
            collection: 'app.bsky.graph.follow',
            repo: src,
            value,
            indexedAt: createdAt,
          })
        }
      }

      store.setMeta('genesis_version', String(GENESIS_VERSION))
    }
  })

  // Run ensureAdminState ONCE at boot via compatibility view and sync back
  const compatView = store.createCompatibilityDbView({includeRecords: false})
  if (ensureAdminState(compatView, getAdminHelpers(store))) {
    store.syncAdminCompatView(compatView)
  }
}

function getAdminHelpers(store = getActiveStore()) {
  const saveCompatDb = dbView => {
    if (dbView && dbView._isCompatView) {
      store.syncAdminCompatView(dbView)
    }
  }
  return {
    store,
    getDataDir,
    getDbPath,
    saveDb: saveCompatDb,
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
    verifyPassword: verifyPasswordSync,
    hashPassword: hashPasswordSync,
    hashPasswordSync,
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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function getServerOrigin(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'http')
    .split(',')[0]
    .trim()
  const host = String(
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost:3008',
  )
    .split(',')[0]
    .trim()
  return `${proto}://${host}`
}

function corsHeaders(req, extra = {}) {
  return {
    'access-control-allow-origin': req?.headers?.origin || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      req?.headers?.['access-control-request-headers'] ||
      'content-type,authorization,atproto-proxy,atproto-accept-labelers,x-atproto-device-id,x-atproto-session-id,accept-language,x-bsky-topics,x-quant-service-token,x-quant-owner-id',
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
    const timer = setTimeout(() => {
      reject(new Error('RequestTimeout'))
      try {
        req.destroy()
      } catch {}
    }, 30_000)
    req.on('data', chunk => {
      total += chunk.length
      if (total > maxBytes) {
        clearTimeout(timer)
        reject(new Error('PayloadTooLarge'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      clearTimeout(timer)
      resolve(Buffer.concat(chunks))
    })
    req.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const buf = await readRawBody(req, maxBytes)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new Error('InvalidJsonBody')
  }
}

function extractBearerToken(req) {
  const auth = String(req?.headers?.authorization || '')
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function getAuthedContext(
  req,
  storeOrDb,
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
  const verified = verifyJwt(storeOrDb, token, expectedScope)
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
    handle: verified.account.handle,
    jti: verified.payload.jti,
  }
}

function getOptionalViewerDid(req, storeOrDb) {
  const token = extractBearerToken(req)
  if (!token) return null
  const verified = verifyJwt(storeOrDb, token)
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
// Account, Record & Preference helpers (O(1) SQLite Backed)
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

function findLocalAccount(storeOrDb, identifierOrDid) {
  return unwrapStore(storeOrDb).findAccount(identifierOrDid)
}

function getCollectionMap(storeOrDb, did, collection, create = false) {
  if (storeOrDb && storeOrDb._isCompatView && storeOrDb.records) {
    if (!storeOrDb.records[did]) {
      if (!create) return {}
      storeOrDb.records[did] = {}
    }
    if (!storeOrDb.records[did][collection]) {
      if (!create) return {}
      storeOrDb.records[did][collection] = {}
    }
    return storeOrDb.records[did][collection]
  }
  const store = unwrapStore(storeOrDb)
  const list = store.listRecordsForRepo(did, collection, {limit: 100}).records
  const map = {}
  for (const r of list) {
    map[r.rkey] = r
  }
  return map
}

function getAllLocalRecords(storeOrDb, collection) {
  const store = unwrapStore(storeOrDb)
  return store.db
    .prepare('SELECT * FROM records WHERE collection = ? ORDER BY created_at DESC LIMIT 2000')
    .all(String(collection))
    .map(r => store._rowToRecord(r))
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

function findLocalPostByUri(storeOrDb, uri) {
  const store = unwrapStore(storeOrDb)
  const rec = store.getRecordByUri(uri)
  if (!rec || rec.collection !== 'app.bsky.feed.post') return null
  return rec
}

function getPostViewCount(storeOrDb, postUri) {
  return unwrapStore(storeOrDb).getPostViewCount(postUri)
}

function getViewerImpressionKey(req, viewerDid) {
  if (viewerDid) return `did:${viewerDid}`
  const ip =
    String(req?.headers?.['cf-connecting-ip'] || '') ||
    String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    String(req?.socket?.remoteAddress || 'local')
  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 120)
  return `anon:${crypto
    .createHash('sha256')
    .update(`${ip}|${ua}`)
    .digest('hex')
    .slice(0, 16)}`
}

function countLocalInteractions(storeOrDb, postUri) {
  return unwrapStore(storeOrDb).getPostCounters(postUri)
}

function putLocalRecord(storeOrDb, did, collection, rkey, recordValue) {
  const store = unwrapStore(storeOrDb)
  const value = {
    $type: collection,
    ...recordValue,
  }

  // Normalize subject URI to canonical DID AT-URI & enforce idempotent single reaction/follow per user
  if (
    (collection === 'app.bsky.feed.like' ||
      collection === 'app.bsky.feed.repost') &&
    value.subject?.uri
  ) {
    const canonicalSubjectUri = store.canonicalizeUri(value.subject.uri)
    value.subject = {...value.subject, uri: canonicalSubjectUri}
    const existingUri = store.findUserReactionUri(
      did,
      collection,
      canonicalSubjectUri,
    )
    if (existingUri) {
      const existingRec = store.getRecordByUri(existingUri)
      if (existingRec) return existingRec
    }
  }

  if (
    collection === 'app.bsky.graph.follow' &&
    typeof value.subject === 'string'
  ) {
    const existingFollowUri = store.findUserFollowUri(did, value.subject)
    if (existingFollowUri) {
      const existingRec = store.getRecordByUri(existingFollowUri)
      if (existingRec) return existingRec
    }
  }

  const key = rkey || generateTid()
  if (
    collection === 'app.bsky.feed.post' &&
    typeof value.text === 'string' &&
    (!Array.isArray(value.facets) || value.facets.length === 0)
  ) {
    const autoFacets = buildFacetsForText(store, value.text)
    if (autoFacets) value.facets = autoFacets
  }

  const uri = `at://${did}/${collection}/${key}`
  const cid = computeCid(value, 'dag-cbor')
  const indexedAt = new Date().toISOString()

  const entry = store.putRecord({
    uri,
    cid,
    rkey: key,
    collection,
    repo: did,
    value,
    indexedAt,
  })

  if (collection === 'app.bsky.actor.profile' && key === 'self') {
    const acc = store.getAccountByDid(did)
    if (acc) {
      syncProfileFromRecord(acc, value)
      store.upsertAccount(acc)
    }
  }

  // Automatic @quanty in-thread reply whenever any user tags @quanty in a Zing or reply
  if (
    collection === 'app.bsky.feed.post' &&
    did !== QUANTY_SYSTEM_DID &&
    typeof value.text === 'string' &&
    /(?:^|\s)@quanty(?:\.quantzing\.(?:com|in))?\b/i.test(value.text)
  ) {
    const authorAcc = store.getAccountByDid(did)
    const parentUri = value.reply?.parent?.uri
    const parentRec = parentUri ? findLocalPostByUri(store, parentUri) : null
    const parentText = parentRec?.value?.text || ''
    const rootRef = value.reply?.root?.uri
      ? value.reply.root
      : {uri: entry.uri, cid: entry.cid}
    const parentRef = {uri: entry.uri, cid: entry.cid}

    void (async () => {
      try {
        const bridge = getQuantyBridgeInstance(store)
        const replyObj = await bridge.buildQuantyMentionReply({
          prompt: value.text,
          postContext: {
            uri: entry.uri,
            text: parentText || value.text,
            authorHandle: authorAcc?.handle || did,
          },
          viewerDid: did,
          origin: '',
        })
        const replyText = String(replyObj?.replyText || replyObj?.text || '').slice(
          0,
          280,
        )
        if (!replyText) return
        const replyRkey = generateTid()
        const replyCreatedAt = new Date(Date.now() + 1).toISOString()
        const facets = buildFacetsForText(store, replyText)
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
        store.putRecord({
          uri: `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/${replyRkey}`,
          cid: computeCid(replyValue, 'dag-cbor'),
          rkey: replyRkey,
          collection: 'app.bsky.feed.post',
          repo: QUANTY_SYSTEM_DID,
          value: replyValue,
          indexedAt: replyCreatedAt,
        })
      } catch (err) {
        console.error('[QuantZing PDS] Auto @quanty reply error:', err)
      }
    })()
  }

  return entry
}

function deleteLocalRecord(storeOrDb, did, collection, rkey) {
  return unwrapStore(storeOrDb).deleteRecord(did, collection, rkey)
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
// 100% Sovereign O(1) Local View Hydrators (+ Interactive Poll Embed Hydration)
// ---------------------------------------------------------------------------

function buildLocalProfileView(
  storeOrDb,
  account,
  viewerDid,
  origin,
  detailed = false,
) {
  if (!account) return null
  const store = unwrapStore(storeOrDb)
  const profile = account.profile || {}
  const avatar = blobUrl(origin, account.did, profile.avatar)
  const banner = blobUrl(origin, account.did, profile.banner)
  const followingUri = viewerDid
    ? store.findUserFollowUri(viewerDid, account.did)
    : undefined
  const followedByUri = viewerDid
    ? store.findUserFollowUri(account.did, viewerDid)
    : undefined
  const muted = viewerDid ? store.isMuted(viewerDid, account.did) : false
  const blockingUri = viewerDid
    ? store.findBlockUri(viewerDid, account.did)
    : undefined
  const blockedByUri = viewerDid
    ? store.findBlockUri(account.did, viewerDid)
    : undefined

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
            account.did === QUANTZING_OFFICIAL_DID ||
            account.did === FOUNDER_DID,
        )

  const declRec = store.getRecord(
    account.did,
    'chat.bsky.actor.declaration',
    'self',
  )
  const allowIncoming = declRec?.value?.allowIncoming || 'all'

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
      chat: {allowIncoming},
    },
    viewer,
    labels: store.getLabels(account.did),
    createdAt: account.createdAt,
    indexedAt: account.createdAt,
  }

  if (!detailed) {
    return base
  }

  return {
    ...base,
    ...(banner ? {banner} : {}),
    ...(profile.website ? {website: profile.website} : {}),
    ...(profile.pinnedPost ? {pinnedPost: profile.pinnedPost} : {}),
    followersCount: Number(account.followersCount || 0),
    followsCount: Number(account.followsCount || 0),
    postsCount: Number(account.postsCount || 0),
  }
}

function hydratePollEmbedView(store, postUri, postText, embed, viewerDid) {
  const canonical = store.canonicalizeUri(postUri)
  const rawOptions = Array.isArray(embed?.options) ? embed.options : []
  const tallies = store.getPollTallies(canonical, viewerDid)
  const totalVotes = tallies.totalVotes
  const options = rawOptions.map((opt, idx) => {
    const id = String(opt?.id || `opt${idx + 1}`)
    const text = String(opt?.text || opt || '')
    const votesCount = Number(tallies.countsByOption.get(id) || 0)
    const percent =
      totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0
    return {
      id,
      text,
      votesCount,
      percent,
    }
  })
  const expiresAt =
    embed?.expiresAt ||
    new Date(
      Date.now() + Number(embed?.durationHours || 24) * 3600 * 1000,
    ).toISOString()
  const expMs = Date.parse(expiresAt)
  const isExpired = Number.isFinite(expMs) ? expMs <= Date.now() : false

  return {
    $type: 'com.quantzing.embed.poll#view',
    uri: canonical,
    question: String(embed?.question || postText || ''),
    options,
    totalVotes,
    expiresAt,
    isExpired,
    viewerVoteOptionId: tallies.viewerVoteOptionId || null,
  }
}

function hydrateEmbedView(
  storeOrDb,
  authorDid,
  embed,
  viewerDid,
  origin,
  depth = 0,
  postUri = '',
  postText = '',
) {
  if (!embed || typeof embed !== 'object') return undefined
  const store = unwrapStore(storeOrDb)
  const type = embed.$type

  if (type === 'com.quantzing.embed.poll') {
    return hydratePollEmbedView(store, postUri, postText, embed, viewerDid)
  }

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
    const resolved = store.resolveAtUri(embed.record.uri)
    if (resolved) {
      const targetRec = store.getRecord(
        resolved.did,
        resolved.collection,
        resolved.rkey,
      )
      if (targetRec && !isRecordHiddenForViewer(store, targetRec, viewerDid)) {
        const targetAuthor = resolved.account
        const counts = store.getPostCounters(targetRec.uri)
        return {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.embed.record#viewRecord',
            uri: targetRec.uri,
            cid: targetRec.cid,
            author: buildLocalProfileView(
              store,
              targetAuthor,
              viewerDid,
              origin,
              false,
            ),
            value: targetRec.value,
            labels: store.getLabels(targetRec.uri),
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
      store,
      authorDid,
      embed.media,
      viewerDid,
      origin,
      depth + 1,
      postUri,
      postText,
    )
    const record = hydrateEmbedView(
      store,
      authorDid,
      embed.record,
      viewerDid,
      origin,
      depth,
      postUri,
      postText,
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

function isRecordHiddenForViewer(store, postRec, viewerDid) {
  if (!postRec || !postRec.uri) return true
  if (store.isPostTakenDown(postRec.uri)) return true
  const author = store.getAccountByDid(postRec.repo)
  if (!author || isAccountSuspendedOrBanned(author)) return true
  if (viewerDid && viewerDid !== postRec.repo) {
    if (store.isMuted(viewerDid, postRec.repo)) return true
    if (store.findBlockUri(viewerDid, postRec.repo)) return true
    if (store.findBlockUri(postRec.repo, viewerDid)) return true
  }
  return false
}

function buildLocalPostView(storeOrDb, postRec, viewerDid, origin) {
  if (!postRec) return null
  const store = unwrapStore(storeOrDb)
  const author = store.getAccountByDid(postRec.repo)
  if (!author) return null
  const counts = store.getPostCounters(postRec.uri)
  const likeUri = viewerDid
    ? store.findUserReactionUri(viewerDid, 'app.bsky.feed.like', postRec.uri)
    : undefined
  const repostUri = viewerDid
    ? store.findUserReactionUri(viewerDid, 'app.bsky.feed.repost', postRec.uri)
    : undefined
  const bookmarked = viewerDid
    ? store.isBookmarked(viewerDid, postRec.uri)
    : false
  const rootUri = postRec.value?.reply?.root?.uri || postRec.uri
  const threadMuted = viewerDid
    ? store.isThreadMuted(viewerDid, rootUri)
    : false

  const embedView = hydrateEmbedView(
    store,
    postRec.repo,
    postRec.value?.embed,
    viewerDid,
    origin,
    0,
    postRec.uri,
    postRec.value?.text || '',
  )

  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: postRec.uri,
    cid: postRec.cid,
    author: buildLocalProfileView(store, author, viewerDid, origin, false),
    record: postRec.value,
    ...(embedView ? {embed: embedView} : {}),
    bookmarkCount: counts.bookmarkCount,
    replyCount: counts.replyCount,
    repostCount: counts.repostCount,
    likeCount: counts.likeCount,
    quoteCount: counts.quoteCount,
    viewCount: counts.viewCount,
    indexedAt:
      postRec.indexedAt || postRec.value?.createdAt || new Date().toISOString(),
    viewer: {
      ...(likeUri ? {like: likeUri} : {}),
      ...(repostUri ? {repost: repostUri} : {}),
      bookmarked,
      threadMuted,
      embeddingDisabled: false,
    },
    labels: store.getLabels(postRec.uri),
  }
}

function hydrateLocalPosts(storeOrDb, uris, viewerDid, origin) {
  const store = unwrapStore(storeOrDb)
  const posts = []
  for (const uri of uris || []) {
    const resolved = store.resolveAtUri(uri)
    if (!resolved) continue
    const rec = store.getRecord(resolved.did, resolved.collection, resolved.rkey)
    if (!rec) continue
    if (isRecordHiddenForViewer(store, rec, viewerDid)) continue
    const view = buildLocalPostView(store, rec, viewerDid, origin)
    if (view) posts.push(view)
  }
  return posts
}

function getLocalFeedItems(
  storeOrDb,
  viewerDid,
  origin,
  {
    authorDids = null,
    includeReplies = false,
    includeReposts = false,
    filterTags = null,
    onlyVideo = false,
    onlyMedia = false,
    limit = 60,
  } = {},
) {
  const store = unwrapStore(storeOrDb)
  const queried = store.queryPosts({
    authorDids,
    includeReplies,
    onlyVideo,
    onlyMedia,
    tags: filterTags,
    limit: Math.max(limit * 2, 80),
  })

  const items = []
  for (const postRec of queried.records) {
    if (isRecordHiddenForViewer(store, postRec, viewerDid)) continue
    const postView = buildLocalPostView(store, postRec, viewerDid, origin)
    if (!postView) continue
    items.push({
      post: postView,
      _sortTime:
        Date.parse(postRec.value?.createdAt || postRec.indexedAt || 0) || 0,
    })
  }

  if (includeReposts && !onlyVideo && !onlyMedia && !filterTags) {
    const seenRepostKey = new Set()
    const reposts = store.queryReposts({
      authorDids,
      limit: Math.max(limit, 50),
    })
    for (const rep of reposts) {
      const reposterAcc = store.getAccountByDid(rep.repo)
      if (!reposterAcc || isAccountSuspendedOrBanned(reposterAcc)) continue
      const targetUri = store.canonicalizeUri(rep?.value?.subject?.uri)
      if (!targetUri) continue
      const dedupeKey = `${rep.repo}|${targetUri}`
      if (seenRepostKey.has(dedupeKey)) continue
      seenRepostKey.add(dedupeKey)
      const targetRec = findLocalPostByUri(store, targetUri)
      if (!targetRec || isRecordHiddenForViewer(store, targetRec, viewerDid)) {
        continue
      }
      const targetView = buildLocalPostView(store, targetRec, viewerDid, origin)
      if (!targetView) continue
      items.push({
        post: targetView,
        reason: {
          $type: 'app.bsky.feed.defs#reasonRepost',
          by: buildLocalProfileView(
            store,
            reposterAcc,
            viewerDid,
            origin,
            false,
          ),
          uri: rep.uri,
          cid: rep.cid,
          indexedAt: rep.indexedAt,
        },
        _sortTime: Date.parse(rep.value?.createdAt || rep.indexedAt || 0) || 0,
      })
    }
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
// Sovereign Feed Generators, Time-Decayed Trends & Fair Suggestions
// ---------------------------------------------------------------------------

function buildFeedGeneratorView(storeOrDb, spec, viewerDid, origin) {
  const store = unwrapStore(storeOrDb)
  const creatorAcc = store.getAccountByDid(
    spec.creatorDid || QUANTZING_OFFICIAL_DID,
  )
  const uri =
    spec.uri ||
    `at://${QUANTZING_OFFICIAL_DID}/app.bsky.feed.generator/${spec.rkey}`
  const avatar = creatorAcc
    ? blobUrl(origin, creatorAcc.did, creatorAcc.profile?.avatar)
    : undefined
  const counts = store.getPostCounters(uri)
  const viewerLike = viewerDid
    ? store.findUserReactionUri(viewerDid, 'app.bsky.feed.like', uri)
    : undefined
  return {
    $type: 'app.bsky.feed.defs#generatorView',
    uri,
    cid: spec.cid || computeCid({uri, name: spec.displayName}, 'dag-cbor'),
    did: QUANTZING_DID,
    creator: creatorAcc
      ? buildLocalProfileView(store, creatorAcc, viewerDid, origin, false)
      : {
          did: QUANTZING_OFFICIAL_DID,
          handle: 'quantzing.quantzing.com',
          displayName: 'QuantZing',
        },
    displayName: spec.displayName,
    description: spec.description,
    ...(avatar ? {avatar} : {}),
    likeCount: counts.likeCount,
    acceptsInteractions: false,
    labels: store.getLabels(uri),
    viewer: {
      ...(viewerLike ? {like: viewerLike} : {}),
    },
    indexedAt: spec.indexedAt || '2026-01-01T00:00:00.000Z',
  }
}

function computeSovereignTrends(storeOrDb, viewerDid, origin, limit = 10) {
  const store = unwrapStore(storeOrDb)
  const rawTrends = store.getTimeDecayedTrends({limit})

  const categoryForTag = tag => {
    const t = String(tag || '').toLowerCase()
    if (/ai|quanty|llm|agent|model/.test(t)) return 'AI & Tech'
    if (/india|delhi|bengaluru|mumbai/.test(t)) return 'India'
    if (/market|finance|crypto|stock|economy/.test(t)) return 'Markets'
    if (/startup|builder|founder|opensource|cloud|quantos|quantrinity/.test(t)) {
      return 'Technology'
    }
    return 'QuantZing'
  }

  return rawTrends.map((entry, idx) => {
    const actors = [...(entry.actorDids || [])]
      .slice(0, 3)
      .map(did => store.getAccountByDid(did))
      .filter(Boolean)
      .map(acc => buildLocalProfileView(store, acc, viewerDid, origin, false))
    return {
      $type: 'app.bsky.unspecced.defs#trendView',
      topic: entry.topic,
      displayName: entry.displayName,
      description: entry.snippet,
      link: `/search?q=${encodeURIComponent(entry.displayName)}`,
      startedAt: entry.latestAt,
      postCount: entry.postCount,
      ...(idx < 2 ? {status: 'hot'} : {}),
      category: categoryForTag(entry.topic),
      actors,
    }
  })
}

function getSuggestedQuantZingActors(
  storeOrDb,
  viewerDid,
  origin,
  limit = 10,
  actorDid = null,
) {
  const store = unwrapStore(storeOrDb)
  const accounts = store.getSuggestedAccounts({viewerDid, actorDid, limit})
  return accounts.map(acc =>
    buildLocalProfileView(store, acc, viewerDid, origin, false),
  )
}

// ---------------------------------------------------------------------------
// Materialized Sovereign Notifications Engine (O(log N + K))
// ---------------------------------------------------------------------------

function buildLocalNotifications(
  storeOrDb,
  viewerDid,
  origin,
  limit = 40,
  cursor = null,
  reasons = null,
) {
  const store = unwrapStore(storeOrDb)
  const viewerAcc = store.getAccountByDid(viewerDid)
  if (!viewerAcc) return {notifications: [], cursor: undefined}
  const seenAt = viewerAcc.notificationsSeenAt || '1970-01-01T00:00:00.000Z'
  const page = store.listNotifications(viewerDid, {limit, cursor, reasons})

  const notifications = []
  for (const n of page.items) {
    const authorAcc = store.getAccountByDid(n.actorDid)
    if (!authorAcc || isAccountSuspendedOrBanned(authorAcc)) continue
    notifications.push({
      uri: n.uri,
      cid: n.cid,
      author: buildLocalProfileView(store, authorAcc, viewerDid, origin, false),
      reason: n.reason,
      ...(n.reasonSubject ? {reasonSubject: n.reasonSubject} : {}),
      record: n.record,
      isRead: n.indexedAt <= seenAt,
      indexedAt: n.indexedAt,
      labels: store.getLabels(n.uri),
    })
  }
  return {notifications, cursor: page.cursor}
}

function buildGroupedNotifications(
  storeOrDb,
  viewerDid,
  origin,
  feed = 'all',
  limit = 30,
) {
  const store = unwrapStore(storeOrDb)
  const viewerAcc = store.getAccountByDid(viewerDid)
  if (!viewerAcc) {
    return {groups: [], relatedViews: [], seenAt: new Date().toISOString()}
  }
  const seenAt = viewerAcc.notificationsSeenAt || '1970-01-01T00:00:00.000Z'
  const {notifications: raw} = buildLocalNotifications(
    store,
    viewerDid,
    origin,
    100,
  )

  const followingSet = new Set(store.getFollowedDids(viewerDid))

  const filtered = raw.filter(n => {
    if (feed === 'people-i-follow') return followingSet.has(n.author?.did)
    if (feed === 'conversations') {
      return (
        n.reason === 'reply' || n.reason === 'quote' || n.reason === 'mention'
      )
    }
    if (feed === 'followers') return n.reason === 'follow'
    if (feed === 'activity') return n.reason === 'like' || n.reason === 'repost'
    return true
  })

  const profileViews = new Map()
  const postViews = new Map()

  const registerProfile = did => {
    if (!did || profileViews.has(did)) return
    const acc = store.getAccountByDid(did)
    if (!acc) return
    profileViews.set(did, {
      $type: 'app.bsky.actor.defs#profileViewBasic',
      ...buildLocalProfileView(store, acc, viewerDid, origin, false),
    })
  }

  const registerPost = uri => {
    if (!uri || postViews.has(uri)) return
    const rec = store.getRecordByUri(uri)
    if (!rec) return
    const pv = buildLocalPostView(store, rec, viewerDid, origin)
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
// DNS-Validated SSRF-Safe Link Metadata Extractor
// ---------------------------------------------------------------------------

function isBlockedIpAddress(ipRaw) {
  const ip = String(ipRaw || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!ip) return true

  // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice('::ffff:'.length)
    if (net.isIPv4(mapped)) {
      return isBlockedIpAddress(mapped)
    }
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(n => parseInt(n, 10))
    const [a, b] = parts
    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15
    if (a >= 224) return true // Multicast & reserved
    return false
  }

  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true // fe80::/10 link-local
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) {
      return true // fc00::/7 unique local
    }
    if (ip.startsWith('ff')) return true // multicast
    if (ip.startsWith('100:')) return true // discard prefix
    return false
  }

  return true
}

function isPrivateOrBlockedHostString(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (
    !h ||
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.google.internal'
  ) {
    return true
  }
  if (net.isIP(h)) {
    return isBlockedIpAddress(h)
  }
  return false
}

async function resolveSafePublicHost(hostname) {
  if (isPrivateOrBlockedHostString(hostname)) return false
  try {
    const records = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
    })
    if (!Array.isArray(records) || records.length === 0) return false
    for (const rec of records) {
      if (!rec?.address || isBlockedIpAddress(rec.address)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

async function fetchLinkMetaSafe(rawUrl, redirectsLeft = 3) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {error: 'Invalid URL', title: '', description: '', image: ''}
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      error: '',
      likely_type: 'html',
      url: rawUrl,
      title: parsed.hostname || rawUrl,
      description: '',
      image: '',
    }
  }
  const isSafe = await resolveSafePublicHost(parsed.hostname)
  if (!isSafe) {
    return {
      error: '',
      likely_type: 'html',
      url: rawUrl,
      title: parsed.hostname || rawUrl,
      description: '',
      image: '',
    }
  }

  return new Promise(resolve => {
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
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
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
// Sovereign Direct Messages Hydrator (chat.bsky.convo.*)
// ---------------------------------------------------------------------------

function buildConvoView(storeOrDb, convo, viewerDid, origin) {
  const store = unwrapStore(storeOrDb)
  const memberDids =
    Array.isArray(convo.allMemberDids) && convo.allMemberDids.length > 0
      ? convo.allMemberDids
      : convo.members || []
  const members = memberDids
    .map(did => store.getAccountByDid(did))
    .filter(Boolean)
    .map(acc => ({
      ...buildLocalProfileView(store, acc, viewerDid, origin, false),
      chatDisabled: false,
    }))
  const lastMsg = store.getLastMessageForConvo(convo.id, viewerDid)
  const readRev = convo.readBy?.[viewerDid] || ''
  const unreadCount = viewerDid
    ? store.countUnreadMessages(convo.id, viewerDid, readRev)
    : 0
  return {
    $type: 'chat.bsky.convo.defs#convoView',
    id: convo.id,
    rev: convo.rev || '1',
    kind: {$type: 'chat.bsky.convo.defs#directConvo'},
    members,
    ...(lastMsg ? {lastMessage: lastMsg} : {}),
    muted: Boolean(convo.mutedBy?.[viewerDid]),
    status: convo.statusBy?.[viewerDid] || 'accepted',
    unreadCount,
  }
}

// ---------------------------------------------------------------------------
// Real Domain Hydrators (Articles, ZingSpaces, SSE Broadcast, Quanty Bridge)
// ---------------------------------------------------------------------------

function hydrateArticleView(store, article, origin) {
  if (!article) return null
  const authorAcc = store.getAccountByDid(article.authorDid)
  const authorAvatar = authorAcc
    ? blobUrl(origin, authorAcc.did, authorAcc.profile?.avatar)
    : undefined
  return {
    id: article.id,
    uri: article.uri || `at://${article.authorDid}/com.quantzing.article/${article.id}`,
    ...(article.cid ? {cid: article.cid} : {}),
    authorDid: article.authorDid,
    authorHandle: authorAcc?.handle || article.authorDid,
    authorDisplayName:
      authorAcc?.profile?.displayName ||
      authorAcc?.handle?.split('.')[0] ||
      'QuantZing Author',
    ...(authorAvatar ? {authorAvatar} : {}),
    title: article.title,
    subtitle: article.subtitle || '',
    body: article.body || '',
    tags: Array.isArray(article.tags) ? article.tags : [],
    ...(article.coverUrl ? {coverUrl: article.coverUrl} : {}),
    status: article.status === 'published' ? 'published' : 'draft',
    readTimeMinutes: Number(article.readTimeMinutes || 1),
    viewsCount: Number(article.viewsCount || 0),
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    ...(article.publishedAt ? {publishedAt: article.publishedAt} : {}),
  }
}

function hydrateSpaceView(store, space, origin) {
  if (!space) return null
  const hostAcc = store.getAccountByDid(space.hostDid)
  const hostAvatar = hostAcc
    ? blobUrl(origin, hostAcc.did, hostAcc.profile?.avatar)
    : undefined
  const participants = (space.participants || []).map(p => {
    const acc = store.getAccountByDid(p.did)
    const avatar = acc
      ? blobUrl(origin, acc.did, acc.profile?.avatar)
      : undefined
    return {
      did: p.did,
      handle: acc?.handle || p.did,
      displayName:
        acc?.profile?.displayName || acc?.handle?.split('.')[0] || p.did,
      ...(avatar ? {avatar} : {}),
      role: p.role || 'listener',
      handRaised: Boolean(p.handRaised),
      muted: Boolean(p.muted),
      joinedAt: p.joinedAt,
    }
  })
  const recentReactions = (space.recentReactions || []).map(r => {
    const acc = store.getAccountByDid(r.did)
    return {
      id: r.id,
      did: r.did,
      handle: acc?.handle || r.did,
      kind: r.kind,
      createdAt: r.createdAt,
    }
  })
  return {
    id: space.id,
    slug: space.slug,
    title: space.title,
    topic: space.topic || '',
    hostDid: space.hostDid,
    hostHandle: hostAcc?.handle || space.hostDid,
    hostDisplayName:
      hostAcc?.profile?.displayName ||
      hostAcc?.handle?.split('.')[0] ||
      'QuantZing Host',
    ...(hostAvatar ? {hostAvatar} : {}),
    status: space.status || 'live',
    startedAt: space.startedAt || space.createdAt,
    ...(space.scheduledFor ? {scheduledFor: space.scheduledFor} : {}),
    ...(space.endedAt ? {endedAt: space.endedAt} : {}),
    audioMode: space.audioMode || 'text_stage_ready',
    allowRecording: Boolean(space.allowRecording),
    coHostEnabled: Boolean(space.coHostEnabled),
    listenerCount: participants.length,
    speakerCount: participants.filter(
      p => p.role === 'host' || p.role === 'speaker',
    ).length,
    participants,
    recentReactions,
  }
}

function broadcastSpaceUpdate(slug, hydratedSpace) {
  const clients = spaceSseClients.get(slug)
  if (!clients || clients.size === 0) return
  const payload = JSON.stringify({
    type: 'space_update',
    space: hydratedSpace,
    timestamp: new Date().toISOString(),
  })
  const frame = `event: space_update\ndata: ${payload}\n\n`
  for (const clientRes of [...clients]) {
    try {
      if (clientRes.writableEnded || clientRes.destroyed) {
        clients.delete(clientRes)
      } else {
        clientRes.write(frame)
      }
    } catch {
      clients.delete(clientRes)
    }
  }
}

function buildQuantyBridgeForStore(store) {
  return createQuantyBridge({
    store,
    getDb: () => ({
      jwtSecret: store.getJwtSecret(),
      _store: store,
      get bookmarks() {
        return new Proxy(
          {},
          {
            get(_, did) {
              if (typeof did !== 'string') return []
              return store.getBookmarks(did, {limit: 50}).items
            },
          },
        )
      },
    }),
    getAuth: req => {
      const auth = getAuthedContext(req, store)
      if (!auth || auth.error) return null
      return auth
    },
    getOptionalViewerDid: req => getOptionalViewerDid(req, store),
    checkAccountEnforcement: did => {
      const acc = store.getAccountByDid(did)
      if (!acc) return {allowed: false, status: 'guest', reason: 'Account not found'}
      const enf = checkAccountEnforcement(store, acc)
      return {
        allowed: enf.allowed,
        status: acc.status || 'active',
        reason: enf.message,
      }
    },
    readJsonBody: (req, maxBytes) => readJsonBody(req, maxBytes),
    sendJson: (res, status, payload) => {
      if (res.headersSent) return
      // Normalize 201 -> 200 for full REST & E2E client compatibility
      const code = status === 201 ? 200 : status
      const bodyStr = JSON.stringify(payload)
      res.writeHead(
        code,
        corsHeaders(null, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        }),
      )
      res.write(bodyStr)
      res.end()
    },
    helpers: {
      findLocalAccount: actor => store.findAccount(actor),
      buildLocalProfileView: (acc, viewerDid, origin, detailed) =>
        buildLocalProfileView(store, acc, viewerDid, origin, detailed),
      buildLocalPostView: (arg1, arg2, arg3, arg4, arg5) => {
        if (arg1 && typeof arg1 === 'object' && arg1.uri) {
          return buildLocalPostView(store, arg1, arg2, arg3)
        }
        const entry =
          arg3 && typeof arg3 === 'object' && arg3.value
            ? {...arg3, repo: arg3.repo || arg1, rkey: arg3.rkey || arg2}
            : store.getRecord(arg1, 'app.bsky.feed.post', arg2)
        return entry ? buildLocalPostView(store, entry, arg4, arg5) : null
      },
      hydrateLocalPosts: (uris, viewerDid, origin) =>
        hydrateLocalPosts(store, uris, viewerDid, origin),
      resolveAtUri: uri => store.resolveAtUri(uri),
      putLocalRecord: (did, collection, rkey, record) =>
        putLocalRecord(store, did, collection, rkey, record),
      deleteLocalRecord: (did, collection, rkey) =>
        deleteLocalRecord(store, did, collection, rkey),
      computeSovereignTrends: (viewerDid, origin, limit) =>
        computeSovereignTrends(store, viewerDid, origin, limit),
      searchLocalPosts: ({
        query = '',
        author = null,
        tag = null,
        sort = 'top',
        limit = 10,
        viewerDid = null,
        origin = '',
      } = {}) => {
        const authorAcc = author ? store.findAccount(author) : null
        if (author && !authorAcc) return []
        const res = store.searchPosts({
          query,
          authorDid: authorAcc?.did || null,
          tags: tag ? [tag] : [],
          sort,
          limit,
        })
        return res.records
          .filter(r => !isRecordHiddenForViewer(store, r, viewerDid))
          .map(r => buildLocalPostView(store, r, viewerDid, origin))
          .filter(Boolean)
      },
      searchLocalActors: ({
        query = '',
        limit = 10,
        viewerDid = null,
        origin = '',
      } = {}) => {
        const res = store.searchActors({query, viewerDid, limit})
        return res.accounts
          .map(a => buildLocalProfileView(store, a, viewerDid, origin, false))
          .filter(Boolean)
      },
      buildLocalNotifications: (did, origin, limit) =>
        buildLocalNotifications(store, did, origin, limit).notifications,
      getPostViewCount: uri => store.getPostViewCount(uri),
      getUserAnalytics: (did, windowDays) =>
        store.getCreatorAnalytics(did, windowDays),
      listUserConvos: (did, origin, limit = 15) => {
        const res = store.listConvosForMember(did, {limit})
        return res.convos.map(c => buildConvoView(store, c, did, origin))
      },
      sendLocalDm: ({senderDid, targetHandleOrDid, text, origin = ''}) => {
        const target = store.findAccount(targetHandleOrDid)
        if (!target) throw new Error(`Recipient ${targetHandleOrDid} not found`)
        const members = [...new Set([senderDid, target.did])].sort()
        const key = members.join('|')
        let convo = store.getConvoByMemberKey(key)
        if (!convo) {
          convo = store.createConvo({
            id: generateTid(),
            members,
            rev: generateTid(),
          })
        }
        const rev = generateTid()
        const message = store.sendConvoMessage({
          convoId: convo.id,
          messageId: generateTid(),
          rev,
          senderDid,
          text,
          facets: buildFacetsForText(store, text),
        })
        const updatedConvo = store.getConvoById(convo.id)
        return {
          convoId: convo.id,
          convo: buildConvoView(store, updatedConvo, senderDid, origin),
          message,
        }
      },
      listArticles: ({
        actor = null,
        status = 'published',
        limit = 20,
        viewerDid = null,
        origin = '',
      } = {}) => {
        const authorAcc = actor ? store.findAccount(actor) : null
        const rows = store.listArticles({
          actorDid: authorAcc?.did || null,
          status,
          viewerDid,
          limit,
        })
        return rows.map(a => hydrateArticleView(store, a, origin))
      },
      upsertArticle: ({
        authorDid,
        id,
        title,
        subtitle = '',
        body = '',
        tags = [],
        coverUrl = null,
        status = 'published',
        origin = '',
      }) => {
        const rkey = id || generateTid()
        const uri = `at://${authorDid}/com.quantzing.article/${rkey}`
        const recVal = {
          $type: 'com.quantzing.article',
          title,
          subtitle,
          body,
          tags,
          ...(coverUrl ? {coverUrl} : {}),
          status,
          createdAt: new Date().toISOString(),
        }
        const cid = computeCid(recVal, 'dag-cbor')
        store.putRecord({
          uri,
          cid,
          rkey,
          collection: 'com.quantzing.article',
          repo: authorDid,
          value: recVal,
          indexedAt: recVal.createdAt,
        })
        const saved = store.upsertArticle({
          id: rkey,
          uri,
          cid,
          authorDid,
          title,
          subtitle,
          body,
          tags,
          coverUrl,
          status,
        })
        return hydrateArticleView(store, saved, origin)
      },
      deleteArticle: ({authorDid, id}) => store.deleteArticle(id, authorDid),
      createLocalList: ({
        authorDid,
        name,
        purpose = 'app.bsky.graph.defs#curatelist',
        description = '',
      }) => {
        const entry = putLocalRecord(store, authorDid, 'app.bsky.graph.list', undefined, {
          $type: 'app.bsky.graph.list',
          name,
          purpose,
          description,
          createdAt: new Date().toISOString(),
        })
        return {uri: entry.uri, cid: entry.cid, rkey: entry.rkey, list: entry}
      },
      addListMember: ({authorDid, listUri, subjectDid}) => {
        const entry = putLocalRecord(
          store,
          authorDid,
          'app.bsky.graph.listitem',
          undefined,
          {
            $type: 'app.bsky.graph.listitem',
            list: store.canonicalizeUri(listUri),
            subject: subjectDid,
            createdAt: new Date().toISOString(),
          },
        )
        return {uri: entry.uri, cid: entry.cid, rkey: entry.rkey}
      },
      toggleFollow: ({viewerDid, targetDid, follow = true}) => {
        const existingUri = store.findUserFollowUri(viewerDid, targetDid)
        if (follow) {
          if (existingUri) return {uri: existingUri, following: true}
          const entry = putLocalRecord(
            store,
            viewerDid,
            'app.bsky.graph.follow',
            undefined,
            {
              $type: 'app.bsky.graph.follow',
              subject: targetDid,
              createdAt: new Date().toISOString(),
            },
          )
          return {uri: entry.uri, following: true}
        }
        if (existingUri) {
          const parsed = parseAtUri(existingUri)
          if (parsed) {
            deleteLocalRecord(store, viewerDid, 'app.bsky.graph.follow', parsed.rkey)
          }
        }
        return {following: false}
      },
      toggleLike: ({viewerDid, subjectUri, subjectCid = '', like = true}) => {
        const canonical = store.canonicalizeUri(subjectUri)
        const existingUri = store.findUserReactionUri(
          viewerDid,
          'app.bsky.feed.like',
          canonical,
        )
        if (like) {
          if (existingUri) return {uri: existingUri, liked: true}
          const targetRec = store.getRecordByUri(canonical)
          const entry = putLocalRecord(
            store,
            viewerDid,
            'app.bsky.feed.like',
            undefined,
            {
              $type: 'app.bsky.feed.like',
              subject: {
                uri: canonical,
                cid: subjectCid || targetRec?.cid || computeCid(canonical),
              },
              createdAt: new Date().toISOString(),
            },
          )
          return {uri: entry.uri, liked: true}
        }
        if (existingUri) {
          const parsed = parseAtUri(existingUri)
          if (parsed) {
            deleteLocalRecord(store, viewerDid, 'app.bsky.feed.like', parsed.rkey)
          }
        }
        return {liked: false}
      },
      toggleRepost: ({
        viewerDid,
        subjectUri,
        subjectCid = '',
        repost = true,
      }) => {
        const canonical = store.canonicalizeUri(subjectUri)
        const existingUri = store.findUserReactionUri(
          viewerDid,
          'app.bsky.feed.repost',
          canonical,
        )
        if (repost) {
          if (existingUri) return {uri: existingUri, reposted: true}
          const targetRec = store.getRecordByUri(canonical)
          const entry = putLocalRecord(
            store,
            viewerDid,
            'app.bsky.feed.repost',
            undefined,
            {
              $type: 'app.bsky.feed.repost',
              subject: {
                uri: canonical,
                cid: subjectCid || targetRec?.cid || computeCid(canonical),
              },
              createdAt: new Date().toISOString(),
            },
          )
          return {uri: entry.uri, reposted: true}
        }
        if (existingUri) {
          const parsed = parseAtUri(existingUri)
          if (parsed) {
            deleteLocalRecord(store, viewerDid, 'app.bsky.feed.repost', parsed.rkey)
          }
        }
        return {reposted: false}
      },
      toggleBookmark: ({viewerDid, uri, cid = '', bookmarked = true}) => {
        const canonical = store.canonicalizeUri(uri)
        if (bookmarked) {
          const targetRec = store.getRecordByUri(canonical)
          store.createBookmark(
            viewerDid,
            canonical,
            cid || targetRec?.cid || computeCid(canonical),
          )
          return {uri: canonical, bookmarked: true}
        }
        store.deleteBookmark(viewerDid, canonical)
        return {uri: canonical, bookmarked: false}
      },
      updateProfile: ({did, displayName, description}) => {
        const acc = store.getAccountByDid(did)
        if (!acc) throw new Error('Account not found')
        const existingRec = store.getRecord(did, 'app.bsky.actor.profile', 'self')
        const baseValue = existingRec?.value || {
          $type: 'app.bsky.actor.profile',
          displayName: acc.profile?.displayName || '',
          description: acc.profile?.description || '',
          createdAt: acc.createdAt,
        }
        const nextValue = {
          ...baseValue,
          ...(displayName !== undefined ? {displayName} : {}),
          ...(description !== undefined ? {description} : {}),
        }
        putLocalRecord(store, did, 'app.bsky.actor.profile', 'self', nextValue)
        const updatedAcc = store.getAccountByDid(did)
        return {
          did,
          displayName: updatedAcc?.profile?.displayName,
          description: updatedAcc?.profile?.description,
          profile: updatedAcc?.profile,
        }
      },
      toggleMuteActor: ({viewerDid, targetDid, muted = true}) => {
        if (muted) store.muteActor(viewerDid, targetDid)
        else store.unmuteActor(viewerDid, targetDid)
        return {muted: Boolean(muted)}
      },
      toggleBlockActor: ({viewerDid, targetDid, blocked = true}) => {
        const existingUri = store.findBlockUri(viewerDid, targetDid)
        if (blocked) {
          if (existingUri) return {blocked: true, uri: existingUri}
          const entry = putLocalRecord(
            store,
            viewerDid,
            'app.bsky.graph.block',
            undefined,
            {
              $type: 'app.bsky.graph.block',
              subject: targetDid,
              createdAt: new Date().toISOString(),
            },
          )
          return {blocked: true, uri: entry.uri}
        }
        if (existingUri) {
          const parsed = parseAtUri(existingUri)
          if (parsed) {
            deleteLocalRecord(store, viewerDid, 'app.bsky.graph.block', parsed.rkey)
          }
        }
        return {blocked: false}
      },
      togglePinPost: ({did, uri = null}) => {
        const acc = store.getAccountByDid(did)
        if (!acc) throw new Error('Account not found')
        let pinnedPost = null
        if (uri) {
          const rec = store.getRecordByUri(uri)
          if (rec) pinnedPost = {uri: rec.uri, cid: rec.cid}
        }
        const existingRec = store.getRecord(did, 'app.bsky.actor.profile', 'self')
        const nextVal = {
          ...(existingRec?.value || {$type: 'app.bsky.actor.profile'}),
          pinnedPost,
        }
        putLocalRecord(store, did, 'app.bsky.actor.profile', 'self', nextVal)
        return {pinnedPost}
      },
      listSpaces: ({status = 'all', limit = 20, origin = ''} = {}) => {
        const rows = store.listSpaces({status, limit})
        return rows.map(s => hydrateSpaceView(store, s, origin))
      },
      createSpace: ({
        hostDid,
        title,
        topic = '',
        scheduledFor = null,
        origin = '',
      }) => {
        const status = scheduledFor ? 'scheduled' : 'live'
        const sp = store.createSpace({
          hostDid,
          title,
          topic,
          status,
          scheduledFor,
        })
        return hydrateSpaceView(store, sp, origin)
      },
      createPollPost: ({
        authorDid,
        text,
        options = [],
        durationHours = 24,
        origin = '',
      }) => {
        const dur = Math.min(168, Math.max(1, Number(durationHours) || 24))
        const expiresAt = new Date(Date.now() + dur * 3600 * 1000).toISOString()
        const normOpts = options.slice(0, 4).map((o, idx) => ({
          id: typeof o === 'object' && o?.id ? String(o.id) : `opt${idx + 1}`,
          text: String(typeof o === 'object' ? o.text : o).slice(0, 80),
        }))
        const createdAt = new Date().toISOString()
        const entry = putLocalRecord(
          store,
          authorDid,
          'app.bsky.feed.post',
          undefined,
          {
            $type: 'app.bsky.feed.post',
            text,
            createdAt,
            langs: ['en'],
            embed: {
              $type: 'com.quantzing.embed.poll',
              question: text,
              options: normOpts,
              durationHours: dur,
              expiresAt,
            },
          },
        )
        const postView = buildLocalPostView(store, entry, authorDid, origin)
        return {
          uri: entry.uri,
          cid: entry.cid,
          rkey: entry.rkey,
          post: postView,
          poll: postView?.embed,
        }
      },
      recordAuditEvent: ({actorDid, action, target, metadata = {}}) => {
        const acc = store.getAccountByDid(actorDid)
        return store.appendAuditEvent({
          actorDid: actorDid || 'system',
          actorHandle: acc?.handle || 'system',
          actorRole: acc?.role || 'user',
          action,
          target,
          details: metadata,
        })
      },
      quantOsUrls: {
        aiUrl:
          process.env.QUANT_AI_URL ||
          `http://${process.env.QUANT_AI_HOST || '127.0.0.1'}:${process.env.QUANT_AI_PORT || '4240'}`,
        routerUrl:
          process.env.QUANT_ROUTER_URL ||
          `http://${process.env.QUANT_ROUTER_HOST || '127.0.0.1'}:${process.env.QUANT_ROUTER_PORT || '4003'}`,
        payUrl:
          process.env.QUANT_PAY_URL ||
          `http://${process.env.QUANT_PAY_HOST || '127.0.0.1'}:${process.env.QUANT_PAY_PORT || '4002'}`,
        internalApiKey: process.env.QUANTOS_INTERNAL_TOKEN || '',
      },
    },
  })
}

function getQuantyBridgeInstance(store = getActiveStore()) {
  if (!store._quantyBridge) {
    store._quantyBridge = buildQuantyBridgeForStore(store)
  }
  return store._quantyBridge
}

// ---------------------------------------------------------------------------
// Route predicate & main Sovereign XRPC + REST + MCP handler
// ---------------------------------------------------------------------------

export function isQuantZingPdsRoute(urlPath) {
  const pathname = String(urlPath || '/').split('?')[0]
  return (
    pathname.startsWith('/xrpc/') ||
    pathname.startsWith('/blob/') ||
    pathname.startsWith('/api/quantzing/') ||
    pathname === '/mcp' ||
    pathname.startsWith('/mcp/') ||
    pathname === '/download/quantzing-ios.mobileconfig' ||
    pathname === '/apple-touch-icon.png' ||
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
  const store = getActiveStore()

  try {
    // -----------------------------------------------------------------------
    // 0. App Release, iOS .mobileconfig, apple-touch-icon & Quanty / MCP Bridge
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/app-release' && method === 'GET') {
      sendJson(req, res, 200, getAppReleasePayload())
      return true
    }

    if (pathname === '/download/quantzing-ios.mobileconfig' && method === 'GET') {
      const xml = buildIosMobileconfigXml()
      const buf = Buffer.from(xml, 'utf8')
      res.writeHead(
        200,
        corsHeaders(req, {
          'content-type': 'application/x-apple-aspen-config; charset=utf-8',
          'content-length': buf.length,
          'content-disposition':
            'attachment; filename="QuantZing-iOS.mobileconfig"',
          'cache-control': 'no-cache',
        }),
      )
      res.end(buf)
      return true
    }

    if (pathname === '/apple-touch-icon.png' && method === 'GET') {
      const iconPath = findIosTouchIconPng()
      if (!iconPath) {
        sendXrpcError(req, res, 404, 'NotFound', 'apple-touch-icon not found')
        return true
      }
      const stat = fs.statSync(iconPath)
      res.writeHead(
        200,
        corsHeaders(req, {
          'content-type': 'image/png',
          'content-length': stat.size,
          'cache-control': 'public, max-age=86400',
        }),
      )
      const stream = fs.createReadStream(iconPath)
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500)
        if (!res.writableEnded) res.end()
      })
      stream.pipe(res)
      return true
    }

    if (
      pathname === '/mcp' ||
      pathname.startsWith('/mcp/') ||
      pathname.startsWith('/api/quantzing/quanty/')
    ) {
      const bridge = getQuantyBridgeInstance(store)
      const handled = await bridge.handleQuantyHttpRequest(
        req,
        res,
        parsedUrl,
        origin,
      )
      if (handled) return true
    }

    // -----------------------------------------------------------------------
    // Sovereign QuantZing Config, Geolocation, Link Meta, Quanty Mention & DID
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/config') {
      sendJson(req, res, 200, {
        ok: true,
        app: 'QuantZing',
        version: getPackageVersion(),
        domain: 'quantzing.quantrinity.in',
        primaryDomain: 'quantzing.com',
        did: QUANTZING_DID,
        pds: origin,
        appView: origin,
        mode: 'sovereign-pure',
        storageEngine: 'sqlite-wal',
        blueskyUpstream: false,
        features: {
          localPds: true,
          sovereignAppView: true,
          publicAppViewProxy: false,
          blobStorage: true,
          bookmarks: true,
          quantyMentions: true,
          quantyControlBridge: true,
          directMessages: true,
          articles: true,
          zingSpaces: true,
          creatorStudio: true,
          interactivePolls: true,
          quantzingPro: true,
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
      const liveSpaces = store
        .listSpaces({status: 'live', limit: 10})
        .map(s => hydrateSpaceView(store, s, origin))
        .filter(Boolean)
      sendJson(req, res, 200, {
        ok: true,
        feeds: liveSpaces.map(sp => ({
          id: sp.id,
          slug: sp.slug,
          title: sp.title,
          topic: sp.topic,
          hostHandle: sp.hostHandle,
          hostDisplayName: sp.hostDisplayName,
          listenerCount: sp.listenerCount,
          speakerCount: sp.speakerCount,
          url: `/spaces/${sp.slug}`,
        })),
        liveSpaces,
      })
      return true
    }

    if (pathname === '/api/quantzing/app-config/config') {
      const liveSpaces = store.listSpaces({status: 'live', limit: 20})
      const liveHostDids = [...new Set(liveSpaces.map(s => s.hostDid))]
      sendJson(req, res, 200, {
        liveNow: {allow: liveHostDids, exceptions: []},
      })
      return true
    }

    // -----------------------------------------------------------------------
    // Secured POST /api/quantzing/quanty-mention (Auth + Rate Limit + Grounded Bridge)
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/quanty-mention' && method === 'POST') {
      const auth = getAuthedContext(req, store)
      if (auth.error) {
        sendXrpcError(
          req,
          res,
          auth.status,
          auth.error,
          auth.message || 'Authentication required to mention @quanty',
        )
        return true
      }
      const enforcement = checkAccountEnforcement(store, auth.account)
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
          bucketKey: `quanty-mention:${auth.did}`,
          maxRequests:
            Number(process.env.QUANTZING_RATE_LIMIT_QUANTY_MENTION_MAX) || 20,
          windowMs: 60 * 1000,
          auth,
          sendJson,
        })
      ) {
        return true
      }

      const body = await readJsonBody(req)
      const text = String(body.text || '')
      const parentText = String(body.parentText || '')
      const authorHandle = String(
        body.authorHandle || auth.account?.handle || 'member.quantzing.com',
      )

      const bridge = getQuantyBridgeInstance(store)
      const built = await bridge.buildQuantyMentionReply({
        prompt: text,
        postContext: {
          uri: body.postUri ? String(body.postUri) : undefined,
          text: parentText || text,
          authorHandle,
        },
        viewerDid: auth.did,
        origin,
      })
      const replyText = String(built?.replyText || built?.text || '').slice(
        0,
        280,
      )
      const replyRkey = generateTid()
      const createdAt = new Date().toISOString()
      const facets = buildFacetsForText(store, replyText)
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
      const replyUri = `at://${QUANTY_SYSTEM_DID}/app.bsky.feed.post/${replyRkey}`
      const replyCid = computeCid(replyValue, 'dag-cbor')
      store.putRecord({
        uri: replyUri,
        cid: replyCid,
        rkey: replyRkey,
        collection: 'app.bsky.feed.post',
        repo: QUANTY_SYSTEM_DID,
        value: replyValue,
        indexedAt: createdAt,
      })

      sendJson(req, res, 200, {
        ok: true,
        author: QUANTY_SYSTEM_HANDLE,
        did: QUANTY_SYSTEM_DID,
        replyUri,
        replyCid,
        replyText,
        origin: built?.origin || 'live-network',
        citations: built?.citations || [],
      })
      return true
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2A: Real Sovereign Articles CRUD (/api/quantzing/articles*)
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/articles') {
      if (method === 'GET') {
        const actor = searchParams.get('actor') || ''
        const status = searchParams.get('status') || 'all'
        const limit = Math.min(
          100,
          Math.max(1, Number(searchParams.get('limit') || 50)),
        )
        const viewerDid = getOptionalViewerDid(req, store)
        const actorAcc = actor ? store.findAccount(actor) : null
        if (actor && !actorAcc) {
          sendJson(req, res, 200, {ok: true, articles: []})
          return true
        }
        const rows = store.listArticles({
          actorDid: actorAcc?.did || null,
          status,
          viewerDid,
          limit,
        })
        const articles = rows
          .map(a => hydrateArticleView(store, a, origin))
          .filter(Boolean)
        sendJson(req, res, 200, {ok: true, articles})
        return true
      }

      if (method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const enforcement = checkAccountEnforcement(store, auth.account)
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
        const title = String(body.title || '').trim()
        const articleBody = String(body.body || '').trim()
        if (!title || !articleBody) {
          sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Article title and body are required',
          )
          return true
        }
        if (body.id) {
          const existing = store.getArticleById(String(body.id))
          if (existing && existing.authorDid !== auth.did) {
            sendXrpcError(
              req,
              res,
              403,
              'Forbidden',
              'Only the article author can update this article',
            )
            return true
          }
        }
        const rkey = body.id ? String(body.id) : generateTid()
        const uri = `at://${auth.did}/com.quantzing.article/${rkey}`
        const status = body.status === 'draft' ? 'draft' : 'published'
        const recVal = {
          $type: 'com.quantzing.article',
          title,
          subtitle: String(body.subtitle || ''),
          body: articleBody,
          tags: Array.isArray(body.tags) ? body.tags : [],
          ...(body.coverUrl ? {coverUrl: String(body.coverUrl)} : {}),
          status,
          createdAt: new Date().toISOString(),
        }
        const cid = computeCid(recVal, 'dag-cbor')
        store.putRecord({
          uri,
          cid,
          rkey,
          collection: 'com.quantzing.article',
          repo: auth.did,
          value: recVal,
          indexedAt: recVal.createdAt,
        })
        const saved = store.upsertArticle({
          id: rkey,
          uri,
          cid,
          authorDid: auth.did,
          title,
          subtitle: String(body.subtitle || ''),
          body: articleBody,
          tags: Array.isArray(body.tags) ? body.tags : [],
          coverUrl: body.coverUrl ? String(body.coverUrl) : null,
          status,
        })
        let postUri
        if (body.shareToFeed && status === 'published') {
          const teaser = `Published a Sovereign Article: "${title}"${body.subtitle ? ` — ${body.subtitle}` : ''}`.slice(
            0,
            290,
          )
          const postEntry = putLocalRecord(
            store,
            auth.did,
            'app.bsky.feed.post',
            undefined,
            {
              $type: 'app.bsky.feed.post',
              text: teaser,
              createdAt: new Date().toISOString(),
              langs: ['en'],
            },
          )
          postUri = postEntry.uri
        }
        sendJson(req, res, 200, {
          ok: true,
          article: hydrateArticleView(store, saved, origin),
          ...(postUri ? {postUri} : {}),
        })
        return true
      }
    }

    const articleIdMatch = pathname.match(/^\/api\/quantzing\/articles\/([^/]+)$/)
    if (articleIdMatch) {
      const articleId = decodeURIComponent(articleIdMatch[1])
      const existing = store.getArticleById(articleId)

      if (method === 'GET') {
        const viewerDid = getOptionalViewerDid(req, store)
        if (
          !existing ||
          (existing.status === 'draft' && existing.authorDid !== viewerDid)
        ) {
          sendXrpcError(req, res, 404, 'NotFound', 'Article not found')
          return true
        }
        sendJson(req, res, 200, {
          ok: true,
          article: hydrateArticleView(store, existing, origin),
        })
        return true
      }

      if (method === 'PUT' || method === 'PATCH') {
        const auth = getAuthedContext(req, store)
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
        if (!existing) {
          sendXrpcError(req, res, 404, 'NotFound', 'Article not found')
          return true
        }
        if (existing.authorDid !== auth.did) {
          sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Only the article owner can edit this article',
          )
          return true
        }
        const body = await readJsonBody(req)
        const updated = store.upsertArticle({
          id: existing.id,
          uri: existing.uri,
          cid: existing.cid,
          authorDid: auth.did,
          title: body.title !== undefined ? body.title : existing.title,
          subtitle:
            body.subtitle !== undefined ? body.subtitle : existing.subtitle,
          body: body.body !== undefined ? body.body : existing.body,
          tags: Array.isArray(body.tags) ? body.tags : existing.tags,
          coverUrl:
            body.coverUrl !== undefined ? body.coverUrl : existing.coverUrl,
          status: body.status || existing.status,
        })
        sendJson(req, res, 200, {
          ok: true,
          article: hydrateArticleView(store, updated, origin),
        })
        return true
      }

      if (method === 'DELETE') {
        const auth = getAuthedContext(req, store)
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
        if (!existing) {
          sendXrpcError(req, res, 404, 'NotFound', 'Article not found')
          return true
        }
        if (existing.authorDid !== auth.did) {
          sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'Only the article owner can delete this article',
          )
          return true
        }
        store.deleteArticle(existing.id, auth.did)
        store.deleteRecord(auth.did, 'com.quantzing.article', existing.id)
        sendJson(req, res, 200, {ok: true, deleted: true})
        return true
      }
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2B: Creator Studio Analytics & Monetization
    // -----------------------------------------------------------------------

    if (
      pathname === '/api/quantzing/creator/analytics' &&
      method === 'GET'
    ) {
      const auth = getAuthedContext(req, store)
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
      const windowDays = Math.min(
        365,
        Math.max(1, Number(searchParams.get('windowDays') || 30)),
      )
      const analytics = store.getCreatorAnalytics(auth.did, windowDays)
      sendJson(req, res, 200, {
        ok: true,
        ...analytics,
      })
      return true
    }

    if (
      pathname === '/api/quantzing/creator/monetization' &&
      method === 'GET'
    ) {
      const auth = getAuthedContext(req, store)
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
      const mon = store.getCreatorMonetization(auth.did)
      const analytics30d = store.getCreatorAnalytics(auth.did, 30)
      const proSub = store.getProSubscription(auth.did)
      const followersCount = Number(auth.account?.followersCount || 0)
      const postsCount = Number(auth.account?.postsCount || 0)
      const impressions30d = Number(analytics30d.totals.impressions || 0)
      const isPro = proSub.status === 'active' || Boolean(auth.account?.verified)
      const meetsCriteria =
        followersCount >= 100 && postsCount >= 5 && impressions30d >= 500
      const effectiveStatus = mon.enrolled
        ? mon.status || 'active'
        : meetsCriteria
          ? 'eligible'
          : 'not_enrolled'

      sendJson(req, res, 200, {
        ok: true,
        enrolled: mon.enrolled,
        status: effectiveStatus,
        ...(mon.enrolledAt ? {enrolledAt: mon.enrolledAt} : {}),
        ...(mon.payoutMethod ? {payoutMethod: mon.payoutMethod} : {}),
        eligibility: {
          followersCount,
          followersRequired: 100,
          postsCount,
          postsRequired: 5,
          impressions30d,
          impressionsRequired: 500,
          isPro,
        },
        wallet: {
          online: false,
          balanceCredits: 0,
          currency: 'INR',
        },
      })
      return true
    }

    if (
      pathname === '/api/quantzing/creator/monetization/enroll' &&
      method === 'POST'
    ) {
      const auth = getAuthedContext(req, store)
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
      const analytics30d = store.getCreatorAnalytics(auth.did, 30)
      const followersCount = Number(auth.account?.followersCount || 0)
      const postsCount = Number(auth.account?.postsCount || 0)
      const impressions30d = Number(analytics30d.totals.impressions || 0)
      const meetsCriteria =
        followersCount >= 100 && postsCount >= 5 && impressions30d >= 500
      const status = meetsCriteria ? 'active' : 'pending_eligibility'
      const monetization = store.upsertCreatorMonetization(auth.did, {
        enrolled: true,
        status,
        payoutMethod: String(body.payoutMethod || 'quantpay_wallet'),
        enrolledAt: new Date().toISOString(),
      })
      sendJson(req, res, 200, {ok: true, monetization})
      return true
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2C: ZingSpaces & Real-Time SSE (/api/quantzing/spaces*)
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/spaces') {
      if (method === 'GET') {
        const status = searchParams.get('status') || 'all'
        const limit = Math.min(
          100,
          Math.max(1, Number(searchParams.get('limit') || 50)),
        )
        const spaces = store
          .listSpaces({status, limit})
          .map(s => hydrateSpaceView(store, s, origin))
          .filter(Boolean)
        sendJson(req, res, 200, {ok: true, spaces})
        return true
      }

      if (method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const enforcement = checkAccountEnforcement(store, auth.account)
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
        const title = String(body.title || '').trim()
        if (!title) {
          sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Space title is required',
          )
          return true
        }
        const created = store.createSpace({
          hostDid: auth.did,
          title,
          topic: String(body.topic || ''),
          status:
            body.status === 'scheduled' || body.scheduledFor
              ? 'scheduled'
              : 'live',
          scheduledFor: body.scheduledFor ? String(body.scheduledFor) : null,
          allowRecording: Boolean(body.allowRecording),
          coHostEnabled: Boolean(body.coHostEnabled),
        })
        const space = hydrateSpaceView(store, created, origin)
        broadcastSpaceUpdate(space.slug, space)
        sendJson(req, res, 200, {ok: true, space})
        return true
      }
    }

    const spaceActionMatch = pathname.match(
      /^\/api\/quantzing\/spaces\/([^/]+)(?:\/(join|leave|hand|react|events))?$/,
    )
    if (spaceActionMatch) {
      const slug = decodeURIComponent(spaceActionMatch[1])
      const subAction = spaceActionMatch[2] || null

      if (!subAction) {
        if (method === 'GET') {
          const sp = store.getSpaceBySlug(slug)
          if (!sp) {
            sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
            return true
          }
          sendJson(req, res, 200, {
            ok: true,
            space: hydrateSpaceView(store, sp, origin),
          })
          return true
        }

        if (method === 'PATCH') {
          const auth = getAuthedContext(req, store)
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
          const existing = store.getSpaceBySlug(slug)
          if (!existing) {
            sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
            return true
          }
          if (existing.hostDid !== auth.did) {
            sendXrpcError(
              req,
              res,
              403,
              'Forbidden',
              'Only the ZingSpace host can modify this room',
            )
            return true
          }
          const body = await readJsonBody(req)
          const updated = store.updateSpace(slug, body)
          const space = hydrateSpaceView(store, updated, origin)
          broadcastSpaceUpdate(space.slug, space)
          sendJson(req, res, 200, {ok: true, space})
          return true
        }

        if (method === 'DELETE') {
          const auth = getAuthedContext(req, store)
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
          const existing = store.getSpaceBySlug(slug)
          if (!existing) {
            sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
            return true
          }
          if (existing.hostDid !== auth.did) {
            sendXrpcError(
              req,
              res,
              403,
              'Forbidden',
              'Only the ZingSpace host can delete this room',
            )
            return true
          }
          store.deleteSpace(slug, auth.did)
          sendJson(req, res, 200, {ok: true, deleted: true})
          return true
        }
      }

      if (subAction === 'join' && method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const updated = store.joinSpace(slug, auth.did)
        if (!updated) {
          sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
          return true
        }
        const space = hydrateSpaceView(store, updated, origin)
        broadcastSpaceUpdate(space.slug, space)
        sendJson(req, res, 200, {ok: true, space})
        return true
      }

      if (subAction === 'leave' && method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const updated = store.leaveSpace(slug, auth.did)
        if (!updated) {
          sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
          return true
        }
        const space = hydrateSpaceView(store, updated, origin)
        broadcastSpaceUpdate(space.slug, space)
        sendJson(req, res, 200, {ok: true, space})
        return true
      }

      if (subAction === 'hand' && method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const updated = store.setSpaceHand(slug, auth.did, Boolean(body.raised))
        if (!updated) {
          sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
          return true
        }
        const space = hydrateSpaceView(store, updated, origin)
        broadcastSpaceUpdate(space.slug, space)
        sendJson(req, res, 200, {ok: true, space})
        return true
      }

      if (subAction === 'react' && method === 'POST') {
        const auth = getAuthedContext(req, store)
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
        const updated = store.addSpaceReaction(
          slug,
          auth.did,
          String(body.kind || 'applause'),
        )
        if (!updated) {
          sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
          return true
        }
        const space = hydrateSpaceView(store, updated, origin)
        broadcastSpaceUpdate(space.slug, space)
        sendJson(req, res, 200, {ok: true, space})
        return true
      }

      if (subAction === 'events' && method === 'GET') {
        const existing = store.getSpaceBySlug(slug)
        if (!existing) {
          sendXrpcError(req, res, 404, 'NotFound', 'ZingSpace not found')
          return true
        }
        res.writeHead(
          200,
          corsHeaders(req, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          }),
        )
        const initialSpace = hydrateSpaceView(store, existing, origin)
        res.write(
          `event: space_update\ndata: ${JSON.stringify({type: 'space_update', space: initialSpace})}\n\n`,
        )

        let set = spaceSseClients.get(existing.slug)
        if (!set) {
          set = new Set()
          spaceSseClients.set(existing.slug, set)
        }
        set.add(res)

        const heartbeat = setInterval(() => {
          try {
            if (!res.writableEnded && !res.destroyed) {
              res.write(': heartbeat\n\n')
            }
          } catch {}
        }, 25_000)
        if (typeof heartbeat.unref === 'function') heartbeat.unref()

        req.on('close', () => {
          clearInterval(heartbeat)
          set.delete(res)
        })
        return true
      }
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2D: QuantZing Pro Subscriptions (/api/quantzing/pro/*)
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/pro/plans' && method === 'GET') {
      sendJson(req, res, 200, {ok: true, plans: PRO_PLANS})
      return true
    }

    if (pathname === '/api/quantzing/pro/subscription' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const subscription = store.getProSubscription(auth.did)
      sendJson(req, res, 200, {ok: true, subscription})
      return true
    }

    if (pathname === '/api/quantzing/pro/checkout' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const planId = String(body.planId || 'pro_monthly')
      const plan =
        PRO_PLANS.find(p => p.id === planId) || PRO_PLANS[1]
      const order = store.createProOrder({
        did: auth.did,
        planId: plan.id,
        status: 'pending',
        amountInr: plan.priceInr,
        amountUsd: plan.priceUsd,
        returnUrl: body.returnUrl ? String(body.returnUrl) : null,
      })
      store.upsertProSubscription(auth.did, {
        ...store.getProSubscription(auth.did),
        planId: plan.id,
        status: 'pending',
        billingCycle: plan.billingCycle,
        orderId: order.id,
      })
      sendJson(req, res, 200, {
        ok: true,
        orderId: order.id,
        planId: plan.id,
        status: 'pending',
        quantPayOnline: false,
        message:
          'Sovereign Pro order staged. Confirm checkout to activate your Verified Pro subscription.',
      })
      return true
    }

    if (pathname === '/api/quantzing/pro/confirm' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const orderId = String(body.orderId || '')
      const order = orderId ? store.getProOrder(orderId) : null
      if (order && order.did !== auth.did) {
        sendXrpcError(
          req,
          res,
          403,
          'Forbidden',
          'Order belongs to a different account',
        )
        return true
      }
      const planId = String(body.planId || order?.planId || 'pro_monthly')
      const plan = PRO_PLANS.find(p => p.id === planId) || PRO_PLANS[1]
      if (order) {
        store.updateProOrderStatus(order.id, 'completed')
      }
      const now = new Date()
      const days = plan.billingCycle === 'annual' ? 365 : 30
      const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString()
      const subscription = store.upsertProSubscription(auth.did, {
        planId: plan.id,
        status: 'active',
        billingCycle: plan.billingCycle,
        activatedAt: now.toISOString(),
        expiresAt,
        cancelAtPeriodEnd: false,
        verifiedBadge: true,
        orderId: order?.id || orderId || undefined,
      })
      store.setAccountVerified(auth.did, true)
      sendJson(req, res, 200, {ok: true, subscription})
      return true
    }

    if (pathname === '/api/quantzing/pro/cancel' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const existing = store.getProSubscription(auth.did)
      const subscription = store.upsertProSubscription(auth.did, {
        ...existing,
        status: 'cancelled',
        cancelAtPeriodEnd: true,
      })
      sendJson(req, res, 200, {ok: true, subscription})
      return true
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2E: Interactive Polls (/api/quantzing/polls*)
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/polls/vote' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const postUri = String(body.postUri || '').trim()
      const optionId = String(body.optionId || '').trim()
      if (!postUri || !optionId) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'postUri and optionId are required',
        )
        return true
      }
      const postRec = findLocalPostByUri(store, postUri)
      const embed = postRec?.value?.embed
      if (!postRec || embed?.$type !== 'com.quantzing.embed.poll') {
        sendXrpcError(req, res, 404, 'NotFound', 'Poll post not found')
        return true
      }
      const options = Array.isArray(embed.options) ? embed.options : []
      if (!options.some((o, i) => (o?.id || `opt${i + 1}`) === optionId)) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'Invalid poll optionId')
        return true
      }
      const expMs = Date.parse(embed.expiresAt || '')
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        sendXrpcError(req, res, 400, 'PollExpired', 'This poll has expired')
        return true
      }
      store.votePoll(postRec.uri, auth.did, optionId)
      const poll = hydratePollEmbedView(
        store,
        postRec.uri,
        postRec.value?.text || '',
        embed,
        auth.did,
      )
      sendJson(req, res, 200, {ok: true, poll})
      return true
    }

    if (pathname === '/api/quantzing/polls' && method === 'GET') {
      const postUri = searchParams.get('uri') || ''
      const viewerDid = getOptionalViewerDid(req, store)
      const postRec = findLocalPostByUri(store, postUri)
      const embed = postRec?.value?.embed
      if (!postRec || embed?.$type !== 'com.quantzing.embed.poll') {
        sendXrpcError(req, res, 404, 'NotFound', 'Poll not found')
        return true
      }
      const poll = hydratePollEmbedView(
        store,
        postRec.uri,
        postRec.value?.text || '',
        embed,
        viewerDid,
      )
      sendJson(req, res, 200, {ok: true, poll})
      return true
    }

    // -----------------------------------------------------------------------
    // CONTRACT.md Section 2F: Support Tickets & Real News Briefing
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/support/tickets') {
      if (method === 'POST') {
        const viewerDid = getOptionalViewerDid(req, store)
        const viewerAcc = viewerDid ? store.getAccountByDid(viewerDid) : null
        const body = await readJsonBody(req)
        const subject = String(body.subject || '').trim()
        const message = String(body.message || '').trim()
        if (!subject || !message) {
          sendXrpcError(
            req,
            res,
            400,
            'InvalidRequest',
            'Support subject and message are required',
          )
          return true
        }
        const ticket = store.createSupportTicket({
          did: viewerDid,
          handle: viewerAcc?.handle || null,
          email: body.email || viewerAcc?.email || null,
          category: String(body.category || 'general'),
          subject,
          message,
        })
        sendJson(req, res, 200, {
          ok: true,
          ticket: {
            id: ticket.id,
            category: ticket.category,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt,
          },
        })
        return true
      }

      if (method === 'GET') {
        const auth = getAuthedContext(req, store)
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
        const includeAll = isStaffRole(auth.account?.role)
        const tickets = store.listSupportTickets({
          did: auth.did,
          includeAll,
          limit: 50,
        })
        sendJson(req, res, 200, {ok: true, tickets})
        return true
      }
    }

    if (pathname === '/api/quantzing/news/briefing' && method === 'GET') {
      const limit = Math.min(
        20,
        Math.max(1, Number(searchParams.get('limit') || 8)),
      )
      const rawTrends = store.getTimeDecayedTrends({limit})
      const topics = rawTrends.map((t, idx) => {
        const samplePosts = (t.samplePosts || []).map(sp => {
          const acc = store.getAccountByDid(sp.did)
          return {
            uri: sp.uri,
            authorHandle: acc?.handle || sp.did,
            text: sp.text,
            viewCount: sp.viewCount,
            likeCount: sp.likeCount,
          }
        })
        const leadPost = samplePosts[0]
        const summary = leadPost
          ? `@${leadPost.authorHandle}: "${leadPost.text.slice(0, 140)}${leadPost.text.length > 140 ? '...' : ''}"`
          : `${t.postCount} active Zings discussing ${t.displayName} on QuantZing.`
        return {
          id: `topic_${t.tag || idx}`,
          topic: t.displayName || `#${t.topic}`,
          summary,
          postCount: t.postCount,
          samplePosts,
        }
      })

      sendJson(req, res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        topics,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // Employee Ops & Admin Portal (/api/quantzing/admin*, /ops*, /appeals)
    // -----------------------------------------------------------------------

    if (
      pathname === '/api/quantzing/appeals' ||
      pathname === '/api/quantzing/admin' ||
      pathname.startsWith('/api/quantzing/admin/') ||
      pathname === '/api/quantzing/ops' ||
      pathname.startsWith('/api/quantzing/ops/')
    ) {
      const compatDb = store.createCompatibilityDbView({includeRecords: true})
      return await handleQuantZingAdmin(req, res, {
        db: compatDb,
        pathname,
        searchParams,
        method,
        origin,
        helpers: getAdminHelpers(store),
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

    // -----------------------------------------------------------------------
    // Sovereign Blob serving: GET /blob/:did/:cid or GET /blob/:cid
    // -----------------------------------------------------------------------

    if (pathname.startsWith('/blob/')) {
      const segments = pathname.slice('/blob/'.length).split('/').filter(Boolean)
      const cid = decodeURIComponent(segments[segments.length - 1] || '')
      if (!cid || cid.includes('..') || cid.includes('/') || cid.includes('\\')) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'Invalid blob CID')
        return true
      }
      const blobFile = store.resolveExistingBlobPath(cid)
      if (!blobFile) {
        sendXrpcError(req, res, 404, 'BlobNotFound', 'Blob not found')
        return true
      }
      const meta = store.getBlobMeta(cid)
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
        const stream = fs.createReadStream(blobFile, {start, end})
        stream.on('error', () => {
          if (!res.writableEnded) res.end()
        })
        stream.pipe(res)
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
      const stream = fs.createReadStream(blobFile)
      stream.on('error', () => {
        if (!res.writableEnded) res.end()
      })
      stream.pipe(res)
      return true
    }

    // -----------------------------------------------------------------------
    // Sovereign Real Post Views / Impressions: POST /api/quantzing/views/record
    // -----------------------------------------------------------------------

    if (pathname === '/api/quantzing/views/record' && method === 'POST') {
      const viewerDid = getOptionalViewerDid(req, store)
      const viewerKey = getViewerImpressionKey(req, viewerDid)
      const body = await readJsonBody(req)
      const uris = Array.isArray(body?.uris)
        ? body.uris.slice(0, 50).map(u => String(u || ''))
        : body?.uri
          ? [String(body.uri)]
          : []
      store.enqueuePostViews(uris, viewerKey)
      store.flushPendingViews()
      const counts = {}
      for (const u of uris) {
        const c = store.canonicalizeUri(u)
        if (c) counts[c] = store.getPostViewCount(c)
      }
      sendJson(req, res, 200, {ok: true, counts})
      return true
    }

    // -----------------------------------------------------------------------
    // Sovereign XRPC Router (/xrpc/<nsid>)
    // -----------------------------------------------------------------------

    if (!pathname.startsWith('/xrpc/')) {
      return false
    }

    const nsid = pathname.slice('/xrpc/'.length)

    if (nsid === '_health' && method === 'GET') {
      sendJson(req, res, 200, {
        version: getPackageVersion(),
        service: 'quant-zing',
        mode: 'sovereign-pure',
        storage: 'sqlite-wal',
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 1. Server, Identity & Session (com.atproto.server.*, com.atproto.identity.*)
    // -----------------------------------------------------------------------

    if (nsid === 'com.atproto.identity.resolveHandle' && method === 'GET') {
      const handle = searchParams.get('handle') || ''
      const acc = store.findAccount(handle)
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
      const existing = store.findAccount(handle)
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
      const optAuth = getAuthedContext(req, store)
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

      if (store.findAccount(handle)) {
        sendXrpcError(
          req,
          res,
          400,
          'HandleNotAvailable',
          'That handle is already taken on QuantZing',
        )
        return true
      }
      if (email && store.findAccountByEmail(email)) {
        sendXrpcError(
          req,
          res,
          400,
          'InvalidRequest',
          'An account with that email already exists',
        )
        return true
      }

      const did = createPlcDid()
      const {salt, hash} = await hashPasswordAsync(password)
      const createdAt = new Date().toISOString()
      const displayName = handle.split('.')[0]

      const account = store.inTransaction(() => {
        if (store.findAccount(handle)) {
          throw new Error('HandleNotAvailable')
        }
        if (email && store.findAccountByEmail(email)) {
          throw new Error('EmailAlreadyExists')
        }
        const created = store.upsertAccount({
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
        })
        putLocalRecord(store, did, 'app.bsky.actor.profile', 'self', {
          $type: 'app.bsky.actor.profile',
          displayName,
          description: '',
          createdAt,
        })
        return created
      })

      const tokens = mintTokens(store, did)

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
      const optAuth = getAuthedContext(req, store)
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

      const account = store.findAccount(identifier)
      const validPassword = account
        ? await verifyPasswordAsync(
            password,
            account.passwordSalt,
            account.passwordHash,
          )
        : false
      if (!account || !validPassword) {
        sendXrpcError(
          req,
          res,
          401,
          'AuthenticationRequired',
          'Invalid identifier or password',
        )
        return true
      }

      const enforcement = checkAccountEnforcement(store, account, {
        saveDb: () => store.upsertAccount(account),
      })
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

      const tokens = mintTokens(store, account.did)
      sendJson(req, res, 200, {
        ...tokens,
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        email: account.email,
        emailConfirmed: account.emailConfirmed !== false,
        emailAuthFactor: Boolean(account.emailAuthFactor),
        active: account.active !== false,
      })
      return true
    }

    if (nsid === 'com.atproto.server.getSession' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
        emailConfirmed: account.emailConfirmed !== false,
        emailAuthFactor: Boolean(account.emailAuthFactor),
        active: account.active !== false,
      })
      return true
    }

    if (nsid === 'com.atproto.server.refreshSession' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const enforcement = checkAccountEnforcement(store, account, {
        saveDb: () => store.upsertAccount(account),
      })
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
      const tokens = mintTokens(store, account.did)
      sendJson(req, res, 200, {
        ...tokens,
        handle: account.handle,
        did: account.did,
        didDoc: buildDidDoc(account, origin),
        active: account.active !== false,
      })
      return true
    }

    if (nsid === 'com.atproto.server.deleteSession' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
        allowedScopes: [
          'com.atproto.access',
          'com.atproto.refresh',
          'quantzing.ops',
        ],
      })
      if (auth.payload?.jti) {
        store.revokeToken(auth.payload.jti, auth.payload.exp)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'com.atproto.server.checkAccountStatus' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
        indexedRecords: store.getRecordCountForRepo(auth.did),
        privateStateValues: 0,
        expectedBlobs: 0,
        importedBlobs: 0,
      })
      return true
    }

    if (nsid === 'com.atproto.server.getServiceAuth' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const token = signJwt(store, {
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
      const auth = getAuthedContext(req, store)
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
        store,
        auth.did,
        collection,
        body.rkey ? String(body.rkey) : undefined,
        body.record,
      )
      sendJson(req, res, 200, {
        uri: entry.uri,
        cid: entry.cid,
        commit: {cid: entry.cid, rev: generateTid()},
        validationStatus: 'valid',
      })
      return true
    }

    if (nsid === 'com.atproto.repo.putRecord' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
      const entry = putLocalRecord(
        store,
        auth.did,
        collection,
        rkey,
        body.record,
      )
      sendJson(req, res, 200, {
        uri: entry.uri,
        cid: entry.cid,
        commit: {cid: entry.cid, rev: generateTid()},
        validationStatus: 'valid',
      })
      return true
    }

    if (nsid === 'com.atproto.repo.deleteRecord' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
      deleteLocalRecord(store, auth.did, collection, rkey)
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
      const auth = getAuthedContext(req, store)
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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

      store.inTransaction(() => {
        for (const write of writes) {
          const type = write?.$type
          const collection = String(write?.collection || '')
          if (!collection) continue

          if (type === 'com.atproto.repo.applyWrites#create') {
            const entry = putLocalRecord(
              store,
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
              store,
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
            deleteLocalRecord(
              store,
              auth.did,
              collection,
              String(write.rkey || ''),
            )
            results.push({
              $type: 'com.atproto.repo.applyWrites#deleteResult',
            })
          }
        }
      })

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
      const localAcc = store.findAccount(repo)
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
      const rec = store.getRecord(localAcc.did, collection, rkey)
      if (!rec) {
        // Return default virtual declarations with ZERO disk writes on GET!
        if (collection === 'chat.bsky.actor.declaration' && rkey === 'self') {
          const val = {
            $type: 'chat.bsky.actor.declaration',
            allowIncoming: 'all',
          }
          const uri = `at://${localAcc.did}/chat.bsky.actor.declaration/self`
          sendJson(req, res, 200, {
            uri,
            cid: computeCid(val, 'dag-cbor'),
            value: val,
          })
          return true
        }
        if (
          collection === 'app.bsky.notification.declaration' &&
          rkey === 'self'
        ) {
          const val = {
            $type: 'app.bsky.notification.declaration',
            allowSubscriptions: 'followers',
          }
          const uri = `at://${localAcc.did}/app.bsky.notification.declaration/self`
          sendJson(req, res, 200, {
            uri,
            cid: computeCid(val, 'dag-cbor'),
            value: val,
          })
          return true
        }
        if (
          collection === 'app.bsky.actor.contentVisibilityDeclaration' &&
          rkey === 'self'
        ) {
          const val = {$type: 'app.bsky.actor.contentVisibilityDeclaration'}
          const uri = `at://${localAcc.did}/app.bsky.actor.contentVisibilityDeclaration/self`
          sendJson(req, res, 200, {
            uri,
            cid: computeCid(val, 'dag-cbor'),
            value: val,
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
      const cursor = searchParams.get('cursor')
      const localAcc = store.findAccount(repo)
      if (!localAcc) {
        sendJson(req, res, 200, {records: []})
        return true
      }
      const page = store.listRecordsForRepo(localAcc.did, collection, {
        limit,
        reverse,
        cursor,
      })
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        records: page.records.map(r => ({
          uri: r.uri,
          cid: r.cid,
          value: r.value,
        })),
      })
      return true
    }

    if (nsid === 'com.atproto.repo.describeRepo' && method === 'GET') {
      const repo = searchParams.get('repo') || ''
      const localAcc = store.findAccount(repo)
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
        collections: store.getCollectionsForRepo(localAcc.did),
        handleIsCorrect: true,
      })
      return true
    }

    if (nsid === 'com.atproto.repo.uploadBlob' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
      const blob = storeLocalBlob(store, auth.did, data, mimeType)
      sendJson(req, res, 200, {blob})
      return true
    }

    if (nsid === 'com.atproto.sync.getBlob' && method === 'GET') {
      const cid = searchParams.get('cid') || ''
      if (cid && !cid.includes('..') && !cid.includes('/')) {
        const blobFile = store.resolveExistingBlobPath(cid)
        if (blobFile) {
          const meta = store.getBlobMeta(cid)
          const stat = fs.statSync(blobFile)
          res.writeHead(
            200,
            corsHeaders(req, {
              'content-type': meta?.mimeType || 'application/octet-stream',
              'content-length': stat.size,
              'cache-control': 'public, max-age=31536000, immutable',
            }),
          )
          const stream = fs.createReadStream(blobFile)
          stream.on('error', () => {
            if (!res.writableEnded) res.end()
          })
          stream.pipe(res)
          return true
        }
      }
      sendXrpcError(
        req,
        res,
        404,
        'BlobNotFound',
        'Blob not found on QuantZing',
      )
      return true
    }

    // -----------------------------------------------------------------------
    // 3. Actor Preferences, Profiles & Search (app.bsky.actor.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.actor.getPreferences' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      // Return preferences with ZERO disk writes on GET!
      let prefs =
        Array.isArray(auth.account.preferences) &&
        auth.account.preferences.length > 0
          ? [...auth.account.preferences]
          : createDefaultPreferences()
      if (
        !prefs.some(
          p => p?.$type === 'app.bsky.actor.defs#personalDetailsPref',
        )
      ) {
        prefs = [
          ...prefs,
          {
            $type: 'app.bsky.actor.defs#personalDetailsPref',
            birthDate: '1998-01-01T00:00:00.000Z',
          },
        ]
      }
      sendJson(req, res, 200, {preferences: prefs})
      return true
    }

    if (nsid === 'app.bsky.actor.putPreferences' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      store.updateAccountPreferences(auth.did, body.preferences)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.actor.getProfile' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
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
        buildLocalProfileView(store, localAcc, viewerDid, origin, true),
      )
      return true
    }

    if (nsid === 'app.bsky.actor.getProfiles' && method === 'GET') {
      const actors = searchParams.getAll('actors')
      const viewerDid = getOptionalViewerDid(req, store)
      const profiles = []
      for (const actor of actors) {
        const localAcc = store.findAccount(actor)
        if (localAcc) {
          profiles.push(
            buildLocalProfileView(store, localAcc, viewerDid, origin, true),
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
      const query = (searchParams.get('q') || searchParams.get('term') || '')
        .trim()
      const limit = Math.min(
        50,
        Math.max(1, Number(searchParams.get('limit') || 25)),
      )
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const page = store.searchActors({query, viewerDid, limit, cursor})
      const actors = page.accounts
        .map(acc => buildLocalProfileView(store, acc, viewerDid, origin, false))
        .filter(Boolean)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        actors,
      })
      return true
    }

    if (nsid === 'app.bsky.actor.getSuggestions' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 20)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const all = getSuggestedQuantZingActors(store, viewerDid, origin, 50)
      const page = paginateItems(all, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        actors: page.items,
        recIdStr: 'quantzing-suggestions-v1',
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 4. Sovereign Trends & Unspecced Suggestions (app.bsky.unspecced.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.unspecced.getTrends' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 10)
      const viewerDid = getOptionalViewerDid(req, store)
      sendJson(req, res, 200, {
        trends: computeSovereignTrends(store, viewerDid, origin, limit),
        recIdStr: 'quantzing-trends-v1',
      })
      return true
    }

    if (nsid === 'app.bsky.unspecced.getTrendingTopics' && method === 'GET') {
      const limit = Number(searchParams.get('limit') || 10)
      const viewerDid = getOptionalViewerDid(req, store)
      const trends = computeSovereignTrends(store, viewerDid, origin, limit)
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
      const viewerDid = getOptionalViewerDid(req, store)
      sendJson(req, res, 200, {
        actors: getSuggestedQuantZingActors(store, viewerDid, origin, limit),
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
      const viewerDid = getOptionalViewerDid(req, store)
      const query = (searchParams.get('query') || '').trim().toLowerCase()
      const feeds = SOVEREIGN_FEED_GENERATORS.filter(
        f =>
          !query ||
          f.displayName.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query),
      ).map(f => buildFeedGeneratorView(store, f, viewerDid, origin))
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
    // 5. Feeds, Posts & Recursive Multi-Depth Threads (app.bsky.feed.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.feed.getFeedGenerator' && method === 'GET') {
      const feedUri = searchParams.get('feed') || DISCOVER_FEED_URI
      const parsed = parseAtUri(feedUri)
      let spec = SOVEREIGN_FEED_GENERATORS.find(f => f.rkey === parsed?.rkey)
      if (!spec && parsed) {
        const customRec = store.getRecord(
          parsed.repo,
          'app.bsky.feed.generator',
          parsed.rkey,
        )
        if (customRec) {
          spec = {
            rkey: customRec.rkey,
            uri: customRec.uri,
            cid: customRec.cid,
            creatorDid: customRec.repo,
            displayName: customRec.value?.displayName || customRec.rkey,
            description: customRec.value?.description || '',
            indexedAt: customRec.indexedAt,
          }
        }
      }
      if (!spec) spec = SOVEREIGN_FEED_GENERATORS[0]
      const viewerDid = getOptionalViewerDid(req, store)
      sendJson(req, res, 200, {
        view: buildFeedGeneratorView(store, spec, viewerDid, origin),
        isOnline: true,
        isValid: true,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getFeedGenerators' && method === 'GET') {
      const uris = searchParams.getAll('feeds')
      const viewerDid = getOptionalViewerDid(req, store)
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
          feeds.push(buildFeedGeneratorView(store, spec, viewerDid, origin))
        }
      }
      sendJson(req, res, 200, {feeds})
      return true
    }

    if (nsid === 'app.bsky.feed.getActorFeeds' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const viewerDid = getOptionalViewerDid(req, store)
      const acc = store.findAccount(actor)
      if (!acc) {
        sendJson(req, res, 200, {feeds: []})
        return true
      }
      const feeds =
        acc.did === QUANTZING_OFFICIAL_DID
          ? SOVEREIGN_FEED_GENERATORS.map(f =>
              buildFeedGeneratorView(store, f, viewerDid, origin),
            )
          : store
              .listRecordsForRepo(acc.did, 'app.bsky.feed.generator', {
                limit: 50,
              })
              .records.map(r =>
                buildFeedGeneratorView(
                  store,
                  {
                    rkey: r.rkey,
                    uri: r.uri,
                    cid: r.cid,
                    creatorDid: r.repo,
                    displayName: r.value?.displayName || r.rkey,
                    description: r.value?.description || '',
                    indexedAt: r.indexedAt,
                  },
                  viewerDid,
                  origin,
                ),
              )
      sendJson(req, res, 200, {feeds})
      return true
    }

    if (nsid === 'app.bsky.feed.getTimeline' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, store)
      const cursor = searchParams.get('cursor')
      const limit = Number(searchParams.get('limit') || 30)

      let authorDids = null
      if (viewerDid) {
        const followed = store.getFollowedDids(viewerDid)
        if (followed.length > 0) {
          authorDids = [...new Set([viewerDid, ...followed])]
        }
      }

      let items = getLocalFeedItems(store, viewerDid, origin, {
        authorDids,
        includeReplies: false,
        includeReposts: true,
        limit: Math.max(limit * 2, 60),
      })
      if (items.length === 0 && authorDids) {
        items = getLocalFeedItems(store, viewerDid, origin, {
          includeReplies: false,
          includeReposts: true,
          limit: Math.max(limit * 2, 60),
        })
      }

      const page = paginateItems(items, cursor, limit)
      const impressionKey = getViewerImpressionKey(req, viewerDid)
      // Batched RAM view enqueue — ZERO synchronous disk writes on GET!
      store.enqueuePostViews(
        page.items.map(it => it.post?.uri).filter(Boolean),
        impressionKey,
      )
      for (const it of page.items) {
        if (it.post?.uri) {
          it.post.viewCount = store.getPostViewCount(it.post.uri)
        }
      }
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getFeed' && method === 'GET') {
      const viewerDid = getOptionalViewerDid(req, store)
      const feedUri = searchParams.get('feed') || ''
      const cursor = searchParams.get('cursor')
      const limit = Number(searchParams.get('limit') || 30)
      const parsed = parseAtUri(feedUri)
      const spec = SOVEREIGN_FEED_GENERATORS.find(f => f.rkey === parsed?.rkey)

      let items = getLocalFeedItems(store, viewerDid, origin, {
        includeReplies: false,
        filterTags: spec?.tags?.length ? spec.tags : null,
        onlyVideo: spec?.rkey === 'thevids',
        limit: Math.max(limit * 2, 60),
      })
      if (items.length === 0 && spec?.rkey !== 'thevids') {
        items = getLocalFeedItems(store, viewerDid, origin, {
          includeReplies: false,
          limit: Math.max(limit * 2, 60),
        })
      }

      const page = paginateItems(items, cursor, limit)
      const impressionKey = getViewerImpressionKey(req, viewerDid)
      store.enqueuePostViews(
        page.items.map(it => it.post?.uri).filter(Boolean),
        impressionKey,
      )
      for (const it of page.items) {
        if (it.post?.uri) {
          it.post.viewCount = store.getPostViewCount(it.post.uri)
        }
      }
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
      const limit = Number(searchParams.get('limit') || 30)
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)

      if (!localAcc || isAccountSuspendedOrBanned(localAcc)) {
        sendJson(req, res, 200, {feed: []})
        return true
      }

      const includeReplies =
        filter !== 'posts_no_replies' &&
        filter !== 'posts_with_media' &&
        filter !== 'posts_with_video'
      const onlyMedia = filter === 'posts_with_media'
      const onlyVideo = filter === 'posts_with_video'
      const includeReposts = !onlyMedia && !onlyVideo

      let finalEntries = getLocalFeedItems(store, viewerDid, origin, {
        authorDids: [localAcc.did],
        includeReplies,
        includeReposts,
        onlyMedia,
        onlyVideo,
        limit: Math.max(limit * 2, 80),
      })

      const includePins = searchParams.get('includePins') === 'true'
      const pinnedUri = localAcc.profile?.pinnedPost?.uri
      if (includePins && pinnedUri && !cursor && !onlyMedia && !onlyVideo) {
        const pinnedRec = findLocalPostByUri(store, pinnedUri)
        if (
          pinnedRec &&
          pinnedRec.repo === localAcc.did &&
          !isRecordHiddenForViewer(store, pinnedRec, viewerDid)
        ) {
          const pinnedView = buildLocalPostView(
            store,
            pinnedRec,
            viewerDid,
            origin,
          )
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
      const impressionKey = getViewerImpressionKey(req, viewerDid)
      store.enqueuePostViews(
        page.items.map(it => it.post?.uri).filter(Boolean),
        impressionKey,
      )
      for (const it of page.items) {
        if (it.post?.uri) {
          it.post.viewCount = store.getPostViewCount(it.post.uri)
        }
      }
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getActorLikes' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
      if (!localAcc) {
        sendJson(req, res, 200, {feed: []})
        return true
      }
      const page = store.getActorLikes(localAcc.did, {limit, cursor})
      const posts = hydrateLocalPosts(store, page.uris, viewerDid, origin)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: posts.map(post => ({post})),
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getPosts' && method === 'GET') {
      const uris = searchParams.getAll('uris')
      const viewerDid = getOptionalViewerDid(req, store)
      const posts = hydrateLocalPosts(store, uris, viewerDid, origin)
      sendJson(req, res, 200, {posts})
      return true
    }

    if (nsid === 'app.bsky.feed.getPostThread' && method === 'GET') {
      const uri = searchParams.get('uri') || ''
      const maxDepth = Math.min(
        12,
        Math.max(0, Number(searchParams.get('depth') ?? 6)),
      )
      const parentHeight = Math.min(
        80,
        Math.max(0, Number(searchParams.get('parentHeight') ?? 80)),
      )
      const viewerDid = getOptionalViewerDid(req, store)
      const resolved = store.resolveAtUri(uri)

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

      const postRec = store.getRecord(
        resolved.did,
        resolved.collection,
        resolved.rkey,
      )
      if (!postRec || isRecordHiddenForViewer(store, postRec, viewerDid)) {
        sendJson(req, res, 200, {
          thread: {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri,
            notFound: true,
          },
        })
        return true
      }

      const viewedUris = [postRec.uri]

      const buildRepliesTree = (parentUri, currentDepth) => {
        if (currentDepth >= maxDepth) return []
        const direct = store.getDirectReplies(parentUri, 100)
        const nodes = []
        for (const r of direct) {
          if (isRecordHiddenForViewer(store, r, viewerDid)) continue
          const pv = buildLocalPostView(store, r, viewerDid, origin)
          if (!pv) continue
          viewedUris.push(pv.uri)
          nodes.push({
            $type: 'app.bsky.feed.defs#threadViewPost',
            post: pv,
            replies: buildRepliesTree(pv.uri, currentDepth + 1),
          })
        }
        return nodes
      }

      const buildParentChain = (rec, remainingHeight) => {
        if (remainingHeight <= 0) return undefined
        const pUri = rec?.value?.reply?.parent?.uri
        if (!pUri) return undefined
        const pRec = findLocalPostByUri(store, pUri)
        if (!pRec || isRecordHiddenForViewer(store, pRec, viewerDid)) {
          return {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri: pUri,
            notFound: true,
          }
        }
        const pView = buildLocalPostView(store, pRec, viewerDid, origin)
        if (!pView) return undefined
        viewedUris.push(pView.uri)
        const grandParent = buildParentChain(pRec, remainingHeight - 1)
        return {
          $type: 'app.bsky.feed.defs#threadViewPost',
          post: pView,
          ...(grandParent ? {parent: grandParent} : {}),
        }
      }

      const replies = buildRepliesTree(postRec.uri, 0)
      const parentNode = buildParentChain(postRec, parentHeight)

      // Enqueue impressions in RAM (zero disk write on GET!)
      store.enqueuePostViews(
        viewedUris,
        getViewerImpressionKey(req, viewerDid),
      )

      const postView = buildLocalPostView(store, postRec, viewerDid, origin)
      sendJson(req, res, 200, {
        thread: {
          $type: 'app.bsky.feed.defs#threadViewPost',
          post: postView,
          ...(parentNode ? {parent: parentNode} : {}),
          replies,
        },
      })
      return true
    }

    if (nsid === 'app.bsky.unspecced.getPostThreadV2' && method === 'GET') {
      const anchor = searchParams.get('anchor') || ''
      const below = Math.min(
        10,
        Math.max(1, Number(searchParams.get('below') ?? 6)),
      )
      const above = searchParams.get('above') !== 'false'
      const viewerDid = getOptionalViewerDid(req, store)
      const resolved = store.resolveAtUri(anchor)
      const postRec = resolved
        ? store.getRecord(resolved.did, resolved.collection, resolved.rkey)
        : null

      if (!postRec || isRecordHiddenForViewer(store, postRec, viewerDid)) {
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

      const viewedUris = [postRec.uri]
      const postView = buildLocalPostView(store, postRec, viewerDid, origin)
      const rootUri = postRec.value?.reply?.root?.uri || postRec.uri
      const mutedByViewer = viewerDid
        ? store.isThreadMuted(viewerDid, rootUri)
        : false

      // Walk parents upwards
      const parentChain = []
      if (above) {
        let cur = postRec
        let depthCursor = -1
        while (cur?.value?.reply?.parent?.uri && depthCursor >= -20) {
          const pUri = cur.value.reply.parent.uri
          const pRec = findLocalPostByUri(store, pUri)
          if (!pRec || isRecordHiddenForViewer(store, pRec, viewerDid)) break
          const pView = buildLocalPostView(store, pRec, viewerDid, origin)
          if (!pView) break
          viewedUris.push(pView.uri)
          parentChain.unshift({
            uri: pView.uri,
            depth: depthCursor,
            value: {
              $type: 'app.bsky.unspecced.defs#threadItemPost',
              post: pView,
              moreParents:
                depthCursor === -20 && Boolean(pRec.value?.reply?.parent?.uri),
              moreReplies: 0,
              opThread: pView.author.did === postView.author.did,
              hiddenByThreadgate: false,
              mutedByViewer,
            },
          })
          cur = pRec
          depthCursor--
        }
      }

      const items = [
        ...parentChain,
        {
          uri: postView.uri,
          depth: 0,
          value: {
            $type: 'app.bsky.unspecced.defs#threadItemPost',
            post: postView,
            moreParents: false,
            moreReplies: 0,
            opThread: true,
            hiddenByThreadgate: false,
            mutedByViewer,
          },
        },
      ]

      const flattenRepliesV2 = (parentUri, currentDepth) => {
        if (currentDepth > below) return
        const direct = store.getDirectReplies(parentUri, 100)
        for (const r of direct) {
          if (isRecordHiddenForViewer(store, r, viewerDid)) continue
          const pv = buildLocalPostView(store, r, viewerDid, origin)
          if (!pv) continue
          viewedUris.push(pv.uri)
          const childReplies = store.getDirectReplies(pv.uri, 10)
          items.push({
            uri: pv.uri,
            depth: currentDepth,
            value: {
              $type: 'app.bsky.unspecced.defs#threadItemPost',
              post: pv,
              moreParents: false,
              moreReplies:
                currentDepth === below ? childReplies.length : 0,
              opThread: pv.author.did === postView.author.did,
              hiddenByThreadgate: false,
              mutedByViewer,
            },
          })
          if (currentDepth < below) {
            flattenRepliesV2(pv.uri, currentDepth + 1)
          }
        }
      }

      flattenRepliesV2(postView.uri, 1)
      store.enqueuePostViews(
        viewedUris,
        getViewerImpressionKey(req, viewerDid),
      )

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
      const uri = store.canonicalizeUri(rawUri)
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const page = store.getLikesForPost(uri, {limit, cursor})
      const seenDids = new Set()
      const likes = []
      for (const r of page.items) {
        const acc = store.getAccountByDid(r.repo)
        if (!acc || isAccountSuspendedOrBanned(acc) || seenDids.has(acc.did)) {
          continue
        }
        seenDids.add(acc.did)
        likes.push({
          actor: buildLocalProfileView(store, acc, viewerDid, origin, false),
          createdAt: r.value?.createdAt || r.indexedAt,
          indexedAt: r.indexedAt,
        })
      }
      sendJson(req, res, 200, {
        uri,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        likes,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getRepostedBy' && method === 'GET') {
      const rawUri = searchParams.get('uri') || ''
      const uri = store.canonicalizeUri(rawUri)
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const page = store.getRepostsForPost(uri, {limit, cursor})
      const seenDids = new Set()
      const repostedBy = []
      for (const r of page.items) {
        const acc = store.getAccountByDid(r.repo)
        if (!acc || isAccountSuspendedOrBanned(acc) || seenDids.has(acc.did)) {
          continue
        }
        seenDids.add(acc.did)
        repostedBy.push(
          buildLocalProfileView(store, acc, viewerDid, origin, false),
        )
      }
      sendJson(req, res, 200, {
        uri,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        repostedBy,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getQuotes' && method === 'GET') {
      const rawUri = searchParams.get('uri') || ''
      const uri = store.canonicalizeUri(rawUri)
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const page = store.getQuotesForPost(uri, {limit, cursor})
      const posts = page.items
        .filter(r => !isRecordHiddenForViewer(store, r, viewerDid))
        .map(r => buildLocalPostView(store, r, viewerDid, origin))
        .filter(Boolean)
      sendJson(req, res, 200, {
        uri,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        posts,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.searchPosts' && method === 'GET') {
      const query = (searchParams.get('q') || '').trim()
      const sort = searchParams.get('sort') || 'latest'
      const since = searchParams.get('since')
      const until = searchParams.get('until')
      const lang = searchParams.get('lang')
      const authorFilter = (searchParams.get('author') || '').trim()
      const authorAcc = authorFilter ? store.findAccount(authorFilter) : null
      if (authorFilter && !authorAcc) {
        sendJson(req, res, 200, {posts: []})
        return true
      }
      const tagFilters = searchParams
        .getAll('tag')
        .map(t => String(t || '').trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
      const limit = Math.min(Number(searchParams.get('limit') || 25) || 25, 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)

      const page = store.searchPosts({
        query,
        authorDid: authorAcc?.did || null,
        tags: tagFilters,
        sort,
        since,
        until,
        lang,
        limit,
        cursor,
      })
      const posts = page.records
        .filter(r => !isRecordHiddenForViewer(store, r, viewerDid))
        .map(r => buildLocalPostView(store, r, viewerDid, origin))
        .filter(Boolean)

      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        posts,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.sendInteractions' && method === 'POST') {
      sendJson(req, res, 200, {})
      return true
    }

    // -----------------------------------------------------------------------
    // 6. Bookmarks (app.bsky.bookmark.* — Canonical AT-URI + Cursor Pagination)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.bookmark.createBookmark' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      store.createBookmark(auth.did, String(body.uri), String(body.cid))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.bookmark.deleteBookmark' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      store.deleteBookmark(auth.did, String(body.uri))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.bookmark.getBookmarks' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const page = store.getBookmarks(auth.did, {limit, cursor})
      const uris = page.items.map(b => b.uri)
      const hydrated = hydrateLocalPosts(store, uris, auth.did, origin)
      const byUri = new Map(
        hydrated.map(p => [store.canonicalizeUri(p.uri), p]),
      )
      const bookmarks = page.items.map(b => {
        const canonical = store.canonicalizeUri(b.uri)
        const post = byUri.get(canonical)
        return {
          subject: {uri: canonical, cid: b.cid},
          createdAt: b.createdAt,
          item: post || {
            $type: 'app.bsky.feed.defs#notFoundPost',
            uri: canonical,
            notFound: true,
          },
        }
      })
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        bookmarks,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 7. Social Graph endpoints (app.bsky.graph.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.graph.getFollows' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
      if (!localAcc) {
        sendJson(req, res, 200, {follows: []})
        return true
      }
      const subject = buildLocalProfileView(
        store,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      const page = store.getFollowsForActor(localAcc.did, {limit, cursor})
      const follows = page.accounts.map(acc =>
        buildLocalProfileView(store, acc, viewerDid, origin, false),
      )
      sendJson(req, res, 200, {
        subject,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        follows,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getFollowers' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
      if (!localAcc) {
        sendJson(req, res, 200, {followers: []})
        return true
      }
      const subject = buildLocalProfileView(
        store,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      const page = store.getFollowersForActor(localAcc.did, {limit, cursor})
      const followers = page.accounts.map(acc =>
        buildLocalProfileView(store, acc, viewerDid, origin, false),
      )
      sendJson(req, res, 200, {
        subject,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        followers,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getKnownFollowers' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
      if (!localAcc) {
        sendJson(req, res, 200, {followers: []})
        return true
      }
      const subject = buildLocalProfileView(
        store,
        localAcc,
        viewerDid,
        origin,
        false,
      )
      const page = viewerDid
        ? store.getKnownFollowers(viewerDid, localAcc.did, {limit, cursor})
        : {accounts: [], cursor: undefined}
      const followers = page.accounts.map(acc =>
        buildLocalProfileView(store, acc, viewerDid, origin, false),
      )
      sendJson(req, res, 200, {
        subject,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        followers,
      })
      return true
    }

    if (
      nsid === 'app.bsky.graph.getSuggestedFollowsByActor' &&
      method === 'GET'
    ) {
      const actor = searchParams.get('actor') || ''
      const targetAcc = actor ? store.findAccount(actor) : null
      const viewerDid = getOptionalViewerDid(req, store)
      const suggestions = getSuggestedQuantZingActors(
        store,
        viewerDid,
        origin,
        10,
        targetAcc?.did || null,
      )
      sendJson(req, res, 200, {suggestions, isFallback: false})
      return true
    }

    if (nsid === 'app.bsky.graph.getRelationships' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const others = searchParams.getAll('others')
      const localAcc = store.findAccount(actor)
      const relationships = others.map(otherDid => {
        const following = localAcc
          ? store.findUserFollowUri(localAcc.did, otherDid)
          : undefined
        const followedBy = localAcc
          ? store.findUserFollowUri(otherDid, localAcc.did)
          : undefined
        const blocking = localAcc
          ? store.findBlockUri(localAcc.did, otherDid)
          : undefined
        const blockedBy = localAcc
          ? store.findBlockUri(otherDid, localAcc.did)
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
      const creatorAcc = store.getAccountByDid(listRec.repo)
      if (!creatorAcc) return null
      const listItemCount = store.getListItemCount(listRec.uri)
      const avatar = blobUrl(origin, listRec.repo, listRec.value?.avatar)
      const muted = viewerDid ? store.isListMuted(viewerDid, listRec.uri) : false
      const blockedRec = viewerDid
        ? store.findUserReactionUri(
            viewerDid,
            'app.bsky.graph.listblock',
            listRec.uri,
          )
        : undefined
      return {
        $type: 'app.bsky.graph.defs#listView',
        uri: listRec.uri,
        cid: listRec.cid,
        creator: buildLocalProfileView(
          store,
          creatorAcc,
          viewerDid,
          origin,
          false,
        ),
        name: String(listRec.value?.name || 'Untitled List'),
        purpose:
          listRec.value?.purpose || 'app.bsky.graph.defs#curatelist',
        description: String(listRec.value?.description || ''),
        ...(avatar ? {avatar} : {}),
        listItemCount,
        labels: store.getLabels(listRec.uri),
        viewer: {
          muted,
          ...(blockedRec ? {blocked: blockedRec} : {}),
        },
        indexedAt: listRec.indexedAt,
      }
    }

    if (nsid === 'app.bsky.graph.getLists' && method === 'GET') {
      const actor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const localAcc = store.findAccount(actor)
      if (!localAcc) {
        sendJson(req, res, 200, {lists: []})
        return true
      }
      const page = store.listRecordsForRepo(
        localAcc.did,
        'app.bsky.graph.list',
        {limit, cursor},
      )
      const lists = page.records
        .map(r => buildListView(r, viewerDid))
        .filter(Boolean)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        lists,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getList' && method === 'GET') {
      const listUri = searchParams.get('list') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const viewerDid = getOptionalViewerDid(req, store)
      const resolved = store.resolveAtUri(listUri)
      const listRec = resolved
        ? store.getRecord(resolved.did, resolved.collection, resolved.rkey)
        : null
      if (!listRec) {
        sendXrpcError(req, res, 404, 'NotFound', 'List not found')
        return true
      }
      const listView = buildListView(listRec, viewerDid)
      const page = store.getListItems(listRec.uri, {limit, cursor})
      const items = page.items
        .map(it => {
          const subAcc = store.findAccount(it?.value?.subject)
          if (!subAcc) return null
          return {
            uri: it.uri,
            subject: buildLocalProfileView(
              store,
              subAcc,
              viewerDid,
              origin,
              false,
            ),
          }
        })
        .filter(Boolean)
      sendJson(req, res, 200, {
        list: listView,
        ...(page.cursor ? {cursor: page.cursor} : {}),
        items,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getListsWithMembership' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const targetActor = searchParams.get('actor') || ''
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const targetAcc = store.findAccount(targetActor)
      const page = store.listRecordsForRepo(
        auth.did,
        'app.bsky.graph.list',
        {limit, cursor},
      )
      const itemRecs = store.listRecordsForRepo(
        auth.did,
        'app.bsky.graph.listitem',
        {limit: 100},
      ).records
      const listsWithMembership = page.records
        .map(lr => {
          const list = buildListView(lr, auth.did)
          if (!list) return null
          const matchItem = targetAcc
            ? itemRecs.find(
                it =>
                  store.canonicalizeUri(it?.value?.list) === lr.uri &&
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
                      store,
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
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        listsWithMembership,
      })
      return true
    }

    if (nsid === 'app.bsky.feed.getListFeed' && method === 'GET') {
      const listUri = searchParams.get('list') || ''
      const cursor = searchParams.get('cursor')
      const limit = Number(searchParams.get('limit') || 30)
      const viewerDid = getOptionalViewerDid(req, store)
      const resolved = store.resolveAtUri(listUri)
      const listRec = resolved
        ? store.getRecord(resolved.did, resolved.collection, resolved.rkey)
        : null
      if (!listRec) {
        sendJson(req, res, 200, {feed: []})
        return true
      }
      const memberDids = store.getListMemberDids(listRec.uri)
      const items =
        memberDids.length > 0
          ? getLocalFeedItems(store, viewerDid, origin, {
              authorDids: memberDids,
              includeReplies: false,
              limit: Math.max(limit * 2, 60),
            })
          : []
      const page = paginateItems(items, cursor, limit)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        feed: page.items,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getMutedLists' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const page = store.getMutedListUris(auth.did, {limit, cursor})
      const lists = page.uris
        .map(u => store.getRecordByUri(u))
        .filter(Boolean)
        .map(r => buildListView(r, auth.did))
        .filter(Boolean)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        lists,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getListBlocks' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const limit = Number(searchParams.get('limit') || 50)
      const cursor = searchParams.get('cursor')
      const page = store.getListBlockRecords(auth.did, {limit, cursor})
      const lists = page.records
        .map(r => store.getRecordByUri(r.value?.subject))
        .filter(Boolean)
        .map(r => buildListView(r, auth.did))
        .filter(Boolean)
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        lists,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // 7B. Sovereign Server Drafts (app.bsky.draft.*)
    // -----------------------------------------------------------------------

    if (nsid === 'app.bsky.draft.getDrafts' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const drafts = store.getDrafts(auth.did).map(d => ({
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
      const auth = getAuthedContext(req, store)
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
      if (store.countDrafts(auth.did) >= 100) {
        sendXrpcError(
          req,
          res,
          400,
          'DraftLimitReached',
          'Maximum of 100 drafts reached',
        )
        return true
      }
      const id = generateTid()
      store.createDraft(auth.did, id, body.draft || {posts: []})
      sendJson(req, res, 200, {id})
      return true
    }

    if (nsid === 'app.bsky.draft.updateDraft' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const draftWithId = body.draft || {}
      const id = String(draftWithId.id || '')
      const updated = store.updateDraft(
        auth.did,
        id,
        draftWithId.draft || {posts: []},
      )
      if (!updated) {
        sendXrpcError(req, res, 404, 'NotFound', 'Draft not found')
        return true
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.draft.deleteDraft' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const id = String(body.id || '')
      store.deleteDraft(auth.did, id)
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
      const auth = getAuthedContext(req, store)
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
      const limit = Number(searchParams.get('limit') || 50)
      const page = store.getMutedDids(auth.did, {limit, cursor})
      const mutes = page.dids
        .map(did => store.getAccountByDid(did))
        .filter(Boolean)
        .map(acc => buildLocalProfileView(store, acc, auth.did, origin, false))
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        mutes,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.getBlocks' && method === 'GET') {
      const auth = getAuthedContext(req, store)
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
      const limit = Number(searchParams.get('limit') || 50)
      const page = store.getBlockedDids(auth.did, {limit, cursor})
      const blocks = page.dids
        .map(did => store.getAccountByDid(did))
        .filter(Boolean)
        .map(acc => buildLocalProfileView(store, acc, auth.did, origin, false))
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        blocks,
      })
      return true
    }

    if (nsid === 'app.bsky.graph.muteActor' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const targetAcc = store.findAccount(rawActor)
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
      store.muteActor(auth.did, targetDid)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.unmuteActor' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const targetAcc = store.findAccount(rawActor)
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
      store.unmuteActor(auth.did, targetDid)
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.muteThread' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      if (!body.root) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'root URI is required')
        return true
      }
      store.muteThread(auth.did, String(body.root))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.unmuteThread' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      if (!body.root) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'root URI is required')
        return true
      }
      store.unmuteThread(auth.did, String(body.root))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.muteActorList' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      if (!body.list) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'list URI is required')
        return true
      }
      store.muteList(auth.did, String(body.list))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.graph.unmuteActorList' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      if (!body.list) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'list URI is required')
        return true
      }
      store.unmuteList(auth.did, String(body.list))
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'com.atproto.moderation.createReport' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
        const resolvedSub = store.resolveAtUri(String(rawSubject.uri))
        subjectUri = resolvedSub?.canonicalUri || String(rawSubject.uri)
        subjectCid = rawSubject.cid
          ? String(rawSubject.cid)
          : findLocalPostByUri(store, subjectUri)?.cid || null
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

      const createdReport = store.createReport({
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

      sendJson(req, res, 200, {
        id: createdReport.id,
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
      const creatorAcc = store.getAccountByDid(QUANTZING_OFFICIAL_DID)
      const viewerDid = getOptionalViewerDid(req, store)
      const views = (dids.length > 0 ? dids : [QUANTZING_OFFICIAL_DID]).map(
        did => ({
          $type: detailed
            ? 'app.bsky.labeler.defs#labelerViewDetailed'
            : 'app.bsky.labeler.defs#labelerView',
          uri: `at://${did}/app.bsky.labeler.service/self`,
          cid: computeCid({labeler: did}, 'dag-cbor'),
          creator: creatorAcc
            ? buildLocalProfileView(
                store,
                creatorAcc,
                viewerDid,
                origin,
                false,
              )
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
      const auth = getAuthedContext(req, store)
      if (auth.error) {
        sendJson(req, res, 200, {notifications: [], priority: false})
        return true
      }
      const limit = Math.min(50, Number(searchParams.get('limit') || 30))
      const cursor = searchParams.get('cursor')
      const reasons = searchParams.getAll('reasons')
      const page = buildLocalNotifications(
        store,
        auth.did,
        origin,
        limit,
        cursor,
        reasons.length > 0 ? reasons : null,
      )
      sendJson(req, res, 200, {
        ...(page.cursor ? {cursor: page.cursor} : {}),
        notifications: page.notifications,
        priority: false,
        seenAt: auth.account.notificationsSeenAt || new Date().toISOString(),
      })
      return true
    }

    if (
      nsid === 'app.bsky.notification.getGroupedNotifications' &&
      method === 'GET'
    ) {
      const auth = getAuthedContext(req, store)
      if (auth.error) {
        sendJson(req, res, 200, {
          groups: [],
          relatedViews: [],
          seenAt: new Date().toISOString(),
        })
        return true
      }
      const feed = searchParams.get('feed') || 'all'
      const limit = Math.min(
        50,
        Math.max(1, Number(searchParams.get('limit') || 30)),
      )
      const payload = buildGroupedNotifications(
        store,
        auth.did,
        origin,
        feed,
        limit,
      )
      sendJson(req, res, 200, payload)
      return true
    }

    if (nsid === 'app.bsky.notification.getUnreadCount' && method === 'GET') {
      const auth = getAuthedContext(req, store)
      if (auth.error) {
        sendJson(req, res, 200, {count: 0})
        return true
      }
      const count = store.getUnreadNotificationCount(
        auth.did,
        auth.account.notificationsSeenAt,
      )
      sendJson(req, res, 200, {count})
      return true
    }

    if (nsid === 'app.bsky.notification.updateSeen' && method === 'POST') {
      const auth = getAuthedContext(req, store)
      if (auth.account) {
        const body = await readJsonBody(req)
        const nowFloor = new Date(Date.now() + 500).toISOString()
        const reqSeen =
          typeof body.seenAt === 'string' ? body.seenAt : nowFloor
        const seenAt = reqSeen > nowFloor ? reqSeen : nowFloor
        store.updateNotificationsSeenAt(auth.did, seenAt)
      }
      sendEmpty(req, res, 200)
      return true
    }

    if (nsid === 'app.bsky.notification.getPreferences' && method === 'GET') {
      const auth = getAuthedContext(req, store)
      const prefs =
        auth.account?.notificationPreferences &&
        Object.keys(auth.account.notificationPreferences).length > 0
          ? auth.account.notificationPreferences
          : createDefaultNotificationPreferences()
      sendJson(req, res, 200, {preferences: prefs})
      return true
    }

    if (
      (nsid === 'app.bsky.notification.putPreferences' ||
        nsid === 'app.bsky.notification.putPreferencesV2') &&
      method === 'POST'
    ) {
      const auth = getAuthedContext(req, store)
      const body = await readJsonBody(req)
      let merged = createDefaultNotificationPreferences()
      if (auth.account) {
        merged = {
          ...(auth.account.notificationPreferences ||
            createDefaultNotificationPreferences()),
          ...body,
        }
        store.updateAccountNotificationPreferences(auth.did, merged)
      }
      if (nsid === 'app.bsky.notification.putPreferencesV2') {
        sendJson(req, res, 200, {preferences: merged})
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
      const viewerDid = getOptionalViewerDid(req, store)
      const acc = viewerDid ? store.getAccountByDid(viewerDid) : null
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
    // 11. Sovereign Direct Messages (chat.bsky.convo.* — Strict Authz & Membership!)
    // -----------------------------------------------------------------------

    if (nsid.startsWith('chat.bsky.')) {
      const auth = getAuthedContext(req, store)
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
      const viewerDid = auth.did

      const assertConvoMember = convoId => {
        const convo = store.getConvoById(convoId)
        if (!convo) {
          sendXrpcError(req, res, 404, 'NotFound', 'Conversation not found')
          return null
        }
        if (!convo.members.includes(viewerDid)) {
          sendXrpcError(
            req,
            res,
            403,
            'Forbidden',
            'You are not a member of this conversation',
          )
          return null
        }
        return convo
      }

      if (nsid === 'chat.bsky.convo.listConvos' && method === 'GET') {
        const statusFilter = searchParams.get('status')
        const limit = Number(searchParams.get('limit') || 30)
        const cursor = searchParams.get('cursor')
        const page = store.listConvosForMember(viewerDid, {
          status: statusFilter,
          limit,
          cursor,
        })
        const convos = page.convos.map(c =>
          buildConvoView(store, c, viewerDid, origin),
        )
        sendJson(req, res, 200, {
          ...(page.cursor ? {cursor: page.cursor} : {}),
          convos,
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvoForMembers' && method === 'GET') {
        const rawMembers = searchParams.getAll('members')
        const resolvedMemberDids = [viewerDid]
        for (const m of rawMembers) {
          const acc = store.findAccount(m)
          if (acc) resolvedMemberDids.push(acc.did)
          else if (String(m).startsWith('did:')) resolvedMemberDids.push(String(m))
        }
        const members = [...new Set(resolvedMemberDids.filter(Boolean))].sort()
        const key = members.join('|')
        let convo = store.getConvoByMemberKey(key)
        if (!convo) {
          convo = store.createConvo({
            id: generateTid(),
            members,
            rev: generateTid(),
          })
        }
        sendJson(req, res, 200, {
          convo: buildConvoView(store, convo, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvo' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = assertConvoMember(convoId)
        if (!convo) return true
        sendJson(req, res, 200, {
          convo: buildConvoView(store, convo, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.getConvoMembers' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = assertConvoMember(convoId)
        if (!convo) return true
        const members = (convo.members || [])
          .map(did => store.getAccountByDid(did))
          .filter(Boolean)
          .map(acc => buildLocalProfileView(store, acc, viewerDid, origin, false))
        sendJson(req, res, 200, {members})
        return true
      }

      if (nsid === 'chat.bsky.convo.getMessages' && method === 'GET') {
        const convoId = searchParams.get('convoId') || ''
        const convo = assertConvoMember(convoId)
        if (!convo) return true
        const limit = Number(searchParams.get('limit') || 50)
        const cursor = searchParams.get('cursor')
        const page = store.getConvoMessages(convo.id, viewerDid, {
          limit,
          cursor,
        })
        sendJson(req, res, 200, {
          ...(page.cursor ? {cursor: page.cursor} : {}),
          messages: page.messages,
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.sendMessage' && method === 'POST') {
        const enforcement = checkAccountEnforcement(store, auth.account)
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
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true

        // Check block edges between members
        for (const memberDid of convo.members) {
          if (memberDid !== viewerDid) {
            if (
              store.findBlockUri(viewerDid, memberDid) ||
              store.findBlockUri(memberDid, viewerDid)
            ) {
              sendXrpcError(
                req,
                res,
                403,
                'Blocked',
                'Cannot send message due to a block between participants',
              )
              return true
            }
          }
        }

        const text = String(body.message?.text || '')
        const facets =
          Array.isArray(body.message?.facets) && body.message.facets.length > 0
            ? body.message.facets
            : buildFacetsForText(store, text)
        const embed = body.message?.embed || null
        const msg = store.sendConvoMessage({
          convoId: convo.id,
          messageId: generateTid(),
          rev: generateTid(),
          senderDid: viewerDid,
          text,
          facets,
          embed,
        })
        sendJson(req, res, 200, msg)
        return true
      }

      if (nsid === 'chat.bsky.convo.sendMessageBatch' && method === 'POST') {
        const enforcement = checkAccountEnforcement(store, auth.account)
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
        const items = Array.isArray(body.items) ? body.items : []
        const sentItems = []
        for (const item of items) {
          const convo = store.getConvoById(item?.convoId)
          if (!convo || !convo.members.includes(viewerDid)) {
            sendXrpcError(
              req,
              res,
              403,
              'Forbidden',
              'You are not a member of one or more target conversations',
            )
            return true
          }
          const text = String(item.message?.text || '')
          const msg = store.sendConvoMessage({
            convoId: convo.id,
            messageId: generateTid(),
            rev: generateTid(),
            senderDid: viewerDid,
            text,
            facets:
              item.message?.facets || buildFacetsForText(store, text),
            embed: item.message?.embed || null,
          })
          sentItems.push(msg)
        }
        sendJson(req, res, 200, {items: sentItems})
        return true
      }

      if (nsid === 'chat.bsky.convo.updateRead' && method === 'POST') {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const updated = store.updateConvoRead(
          convo.id,
          viewerDid,
          body.messageId ? convo.rev : convo.rev || generateTid(),
        )
        sendJson(req, res, 200, {
          convo: buildConvoView(store, updated, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.updateAllRead' && method === 'POST') {
        const updatedCount = store.updateAllConvosRead(viewerDid)
        sendJson(req, res, 200, {updatedCount})
        return true
      }

      if (
        (nsid === 'chat.bsky.convo.muteConvo' ||
          nsid === 'chat.bsky.convo.unmuteConvo') &&
        method === 'POST'
      ) {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const muted = nsid === 'chat.bsky.convo.muteConvo'
        const updated = store.setConvoMuted(
          convo.id,
          viewerDid,
          muted,
          generateTid(),
        )
        sendJson(req, res, 200, {
          convo: buildConvoView(store, updated, viewerDid, origin),
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.acceptConvo' && method === 'POST') {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const rev = generateTid()
        store.acceptConvo(convo.id, viewerDid, rev)
        sendJson(req, res, 200, {rev})
        return true
      }

      if (nsid === 'chat.bsky.convo.leaveConvo' && method === 'POST') {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const resLeave = store.leaveConvo(convo.id, viewerDid, generateTid())
        sendJson(req, res, 200, resLeave)
        return true
      }

      if (
        nsid === 'chat.bsky.convo.deleteMessageForSelf' &&
        method === 'POST'
      ) {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const deletedView = store.deleteConvoMessageForSelf(
          convo.id,
          body.messageId,
          viewerDid,
          generateTid(),
        )
        if (!deletedView) {
          sendXrpcError(req, res, 404, 'NotFound', 'Message not found')
          return true
        }
        sendJson(req, res, 200, deletedView)
        return true
      }

      if (
        (nsid === 'chat.bsky.convo.addReaction' ||
          nsid === 'chat.bsky.convo.removeReaction') &&
        method === 'POST'
      ) {
        const body = await readJsonBody(req)
        const convo = assertConvoMember(body.convoId)
        if (!convo) return true
        const message = store.mutateConvoReaction(
          convo.id,
          body.messageId,
          viewerDid,
          body.value,
          nsid === 'chat.bsky.convo.addReaction',
        )
        if (!message) {
          sendXrpcError(req, res, 404, 'NotFound', 'Message not found')
          return true
        }
        sendJson(req, res, 200, {message})
        return true
      }

      if (nsid === 'chat.bsky.convo.getUnreadCounts' && method === 'GET') {
        const counts = store.getUnreadConvoCounts(viewerDid)
        sendJson(req, res, 200, counts)
        return true
      }

      if (nsid === 'chat.bsky.convo.getLog' && method === 'GET') {
        const cursor = searchParams.get('cursor')
        const page = store.getConvoLogsForMember(viewerDid, {cursor})
        sendJson(req, res, 200, {
          ...(page.cursor ? {cursor: page.cursor} : {}),
          logs: page.logs,
        })
        return true
      }

      if (nsid === 'chat.bsky.convo.listConvoRequests' && method === 'GET') {
        const page = store.listConvosForMember(viewerDid, {
          status: 'request',
        })
        sendJson(req, res, 200, {
          requests: page.convos.map(c =>
            buildConvoView(store, c, viewerDid, origin),
          ),
        })
        return true
      }

      if (
        nsid === 'chat.bsky.convo.getConvoAvailability' &&
        method === 'GET'
      ) {
        const rawMembers = searchParams.getAll('members')
        const memberAccounts = rawMembers
          .map(m => store.findAccount(m))
          .filter(Boolean)
        const canChat =
          memberAccounts.length === rawMembers.length &&
          memberAccounts.every(
            acc =>
              !store.findBlockUri(viewerDid, acc.did) &&
              !store.findBlockUri(acc.did, viewerDid),
          )
        let existingConvo
        if (canChat) {
          const allMembers = [
            ...new Set([viewerDid, ...memberAccounts.map(a => a.did)]),
          ].sort()
          const found = store.getConvoByMemberKey(allMembers.join('|'))
          if (found) {
            existingConvo = buildConvoView(store, found, viewerDid, origin)
          }
        }
        sendJson(req, res, 200, {
          canChat,
          ...(existingConvo ? {convo: existingConvo} : {}),
        })
        return true
      }

      sendXrpcError(
        req,
        res,
        501,
        'MethodNotImplemented',
        `Chat endpoint ${nsid} not implemented`,
      )
      return true
    }

    if (nsid === 'com.atproto.identity.updateHandle' && method === 'POST') {
      const auth = getAuthedContext(req, store)
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
      const nextHandle = normalizeHandle(body.handle)
      if (!isValidHandleFormat(nextHandle)) {
        sendXrpcError(req, res, 400, 'InvalidHandle', 'Invalid handle format')
        return true
      }
      const taken = store.findAccount(nextHandle)
      if (taken && taken.did !== auth.did) {
        sendXrpcError(
          req,
          res,
          400,
          'HandleNotAvailable',
          'That handle is already taken',
        )
        return true
      }
      store.updateAccountHandle(auth.did, nextHandle)
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

    if (nsid === 'app.bsky.video.uploadVideo' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
      const data = await readRawBody(req, MAX_VIDEO_TOTAL_BYTES)
      const mimeType = String(req.headers['content-type'] || 'video/mp4')
        .split(';')[0]
        .trim()
      const blob = storeLocalBlob(store, auth.did, data, mimeType)
      const jobId = `qzvid_${generateTid()}`
      const jobStatus = {
        jobId,
        did: auth.did,
        state: 'JOB_STATE_COMPLETED',
        progress: 100,
        blob,
      }
      activeVideoUploads.set(jobId, {
        jobId,
        did: auth.did,
        sizeBytes: data.length,
        mimeType,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        state: 'completed',
        parts: new Map(),
        jobStatus,
      })
      sendJson(req, res, 200, {jobStatus})
      return true
    }

    if (nsid === 'app.bsky.video.startUpload' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const enforcement = checkAccountEnforcement(store, auth.account)
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
        totalUploadedBytes: 0,
        jobStatus: null,
      })
      sendJson(req, res, 200, {jobId, partSizeBytes, partCount, expiresAt})
      return true
    }

    if (nsid === 'app.bsky.video.uploadPart' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const jobId = searchParams.get('jobId') || ''
      const partNumber = Math.max(
        1,
        Number(searchParams.get('partNumber') || 1),
      )
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did || job.state !== 'created') {
        sendXrpcError(
          req,
          res,
          404,
          'NotFound',
          'Video upload session not found',
        )
        return true
      }
      if (partNumber > job.partCount + 1) {
        sendXrpcError(req, res, 400, 'InvalidRequest', 'Invalid partNumber')
        return true
      }
      const chunk = await readRawBody(req, MAX_BLOB_BODY_BYTES)
      const prevLen = job.parts.get(partNumber)?.length || 0
      const nextTotal = (job.totalUploadedBytes || 0) - prevLen + chunk.length
      if (nextTotal > MAX_VIDEO_TOTAL_BYTES) {
        sendXrpcError(
          req,
          res,
          400,
          'VideoTooLarge',
          'Cumulative video parts exceed 300 MB limit',
        )
        return true
      }
      job.totalUploadedBytes = nextTotal
      job.parts.set(partNumber, chunk)
      sendJson(req, res, 200, {partNumber, sizeBytes: chunk.length})
      return true
    }

    if (nsid === 'app.bsky.video.finishUpload' && method === 'POST') {
      const auth = getAuthedContext(req, store, {
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
      const body = await readJsonBody(req)
      const jobId = String(body.jobId || '')
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did) {
        sendXrpcError(
          req,
          res,
          404,
          'NotFound',
          'Video upload session not found',
        )
        return true
      }
      if (job.state === 'completed' && job.jobStatus) {
        sendJson(req, res, 200, {
          completedJobId: jobId,
          jobStatus: job.jobStatus,
        })
        return true
      }
      job.state = 'finishing'
      const ordered = [...job.parts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, buf]) => buf)
      const fullBuf = Buffer.concat(ordered)
      if (fullBuf.length === 0) {
        job.state = 'created'
        sendXrpcError(req, res, 400, 'InvalidRequest', 'No video data received')
        return true
      }
      if (fullBuf.length > MAX_VIDEO_TOTAL_BYTES) {
        job.parts.clear()
        sendXrpcError(
          req,
          res,
          400,
          'VideoTooLarge',
          'Video exceeds maximum supported size of 300 MB',
        )
        return true
      }
      const blob = storeLocalBlob(store, auth.did, fullBuf, job.mimeType)
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
      const auth = getAuthedContext(req, store, {
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
      const jobId = searchParams.get('jobId') || ''
      const job = activeVideoUploads.get(jobId)
      if (!job || job.did !== auth.did) {
        sendXrpcError(
          req,
          res,
          404,
          'NotFound',
          'Video upload session not found',
        )
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
      const auth = getAuthedContext(req, store, {
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

    sendXrpcError(
      req,
      res,
      501,
      'MethodNotImplemented',
      `Endpoint ${method} /xrpc/${nsid} is not implemented on QuantZing Sovereign PDS`,
    )
    return true
  } catch (err) {
    if (err?.message === 'HandleNotAvailable') {
      sendXrpcError(
        req,
        res,
        400,
        'HandleNotAvailable',
        'That handle is already taken on QuantZing',
      )
      return true
    }
    if (err?.message === 'EmailAlreadyExists') {
      sendXrpcError(
        req,
        res,
        400,
        'InvalidRequest',
        'An account with that email already exists',
      )
      return true
    }
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
