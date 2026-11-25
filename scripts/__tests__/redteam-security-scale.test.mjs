import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  antiBotShield,
  clearTrendsCache,
  computeSovereignTrends,
  getCachedPlatformSettings,
  getSpaceSseTickets,
  handleQuantZingPds,
  invalidatePlatformSettingsCache,
  pruneSpaceSseTickets,
  rankReelsItems,
  signJwt,
  spaceSseTickets,
} from '../quantzing-pds.mjs'
import { getStore, closeAllStores } from '../quantzing-store.mjs'
import { savePlatformSettings } from '../quantzing-admin.mjs'

console.log('🧪 Starting Red-Team Security, Anti-Bot & Billion-Scale Systems Test Suite...\n')

let passCount = 0
let failCount = 0

function runTest(name, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${name}`)
    passCount++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     ${err.stack || err.message}`)
    failCount++
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn()
    console.log(`  ✅ PASS: ${name}`)
    passCount++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     ${err.stack || err.message}`)
    failCount++
  }
}

// ---------------------------------------------------------------------------
// Test Environment & HTTP Helpers
// ---------------------------------------------------------------------------

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantzing-redteam-'))
process.env.QUANTZING_DATA_DIR = tempDir

function createMockReq({
  method = 'GET',
  url = '/',
  headers = {},
  body = null,
  ip = '127.0.0.1',
}) {
  const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0)
  const stream = Readable.from([payload])
  stream.method = method
  stream.url = url
  stream.headers = {
    host: 'quantzing.com',
    'content-type': 'application/json',
    'x-forwarded-for': ip,
    ...headers,
  }
  stream.socket = { remoteAddress: ip }
  return stream
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    chunks: [],
    writableEnded: false,
    writeHead(code, headers = {}) {
      res.statusCode = code
      Object.assign(res.headers, headers)
      return res
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v
      return res
    },
    write(chunk) {
      res.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      return true
    },
    end(chunk) {
      if (chunk) {
        res.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      }
      res.writableEnded = true
      const full = Buffer.concat(res.chunks).toString('utf8')
      try {
        res.body = JSON.parse(full)
      } catch {
        res.body = full
      }
      return res
    },
  }
  return res
}

const store = getStore(tempDir)

// Bootstrap test user
const aliceAcc = store.upsertAccount({
  did: 'did:plc:alicesecuritytest123456',
  handle: 'alice.quantzing.com',
  email: 'alice@quantzing.com',
  passwordHash: 'dummy-hash',
  passwordSalt: 'dummy-salt',
  status: 'active',
  role: 'user',
})
const aliceToken = signJwt(store, {
  did: aliceAcc.did,
  scope: 'com.atproto.access',
  ttlSeconds: 3600,
  tv: 1,
})

// Bootstrap test space
const testSpace = store.createSpace({
  hostDid: aliceAcc.did,
  title: 'Red-Team War Room',
  topic: 'Security Auditing',
  status: 'live',
})

// ---------------------------------------------------------------------------
// 1. Fix /api/quantzing/trends Live Timeout Bug (<50ms, Cached, Pinned & Muted)
// ---------------------------------------------------------------------------

await runAsyncTest('1.1 GET /api/quantzing/trends responds in <50ms with 200 and cached trends', async () => {
  // Pre-warm active store & trends cache
  await handleQuantZingPds(
    createMockReq({ method: 'GET', url: '/api/quantzing/trends?limit=10' }),
    createMockRes(),
  )

  const req = createMockReq({ method: 'GET', url: '/api/quantzing/trends?limit=10' })
  const res = createMockRes()

  const start = performance.now()
  const handled = await handleQuantZingPds(req, res)
  const elapsed = performance.now() - start

  assert.equal(handled, true, 'Handler must handle /api/quantzing/trends')
  assert.equal(res.statusCode, 200, 'HTTP status must be 200')
  assert.equal(res.body.ok, true, 'Body ok must be true')
  assert.ok(Array.isArray(res.body.trends), 'Trends must be an array')
  assert.ok(elapsed < 50, `Trends handler must respond in <50ms (took ${elapsed.toFixed(2)}ms)`)
})

await runAsyncTest('1.2 Unhandled /api/quantzing/* route returns 404 immediately (never hangs past 90s)', async () => {
  const req = createMockReq({ method: 'GET', url: '/api/quantzing/unknown-security-probe' })
  const res = createMockRes()

  const start = performance.now()
  const handled = await handleQuantZingPds(req, res)
  const elapsed = performance.now() - start

  assert.equal(handled, true, 'Handler must intercept and resolve unknown /api/quantzing/ route')
  assert.equal(res.statusCode, 404, 'Must return 404 NotFound')
  assert.equal(res.body.error, 'NotFound')
  assert.ok(elapsed < 20, `Must respond immediately (took ${elapsed.toFixed(2)}ms)`)
})

runTest('1.3 computeSovereignTrends respects pinnedTrends and mutedTrends from platform settings', () => {
  savePlatformSettings(tempDir, {
    trends: {
      pinnedTrends: ['#QuantZing2026', '#SovereignWeb'],
      mutedTrends: ['#SpamAirdrop', '#CryptoScam'],
      reelsFreshnessGravity: 1.35,
      reelsDiversityWindow: 3,
    },
  })
  invalidatePlatformSettingsCache()
  clearTrendsCache()

  const trends = computeSovereignTrends(store, null, 'https://quantzing.com', 10)
  assert.ok(Array.isArray(trends), 'Must return array of trends')
  assert.ok(trends.length >= 2, 'Must have at least 2 trends')

  // Pinned trends must be at the very top with status: 'pinned'
  const first = trends[0]
  const second = trends[1]
  assert.equal(first.topic, '#QuantZing2026')
  assert.equal(first.status, 'pinned')
  assert.equal(first.pinned, true)

  assert.equal(second.topic, '#SovereignWeb')
  assert.equal(second.status, 'pinned')
  assert.equal(second.pinned, true)

  // Muted trends must NOT exist in the output
  const topics = trends.map(t => t.topic.toLowerCase())
  assert.ok(!topics.includes('#spamairdrop'), 'Muted trend #SpamAirdrop must be excluded')
  assert.ok(!topics.includes('#cryptoscam'), 'Muted trend #CryptoScam must be excluded')
})

// ---------------------------------------------------------------------------
// 2. Fix Security Audit C-1 (Short-Lived Room-Scoped SSE Tickets)
// ---------------------------------------------------------------------------

let mintedTicket = null

await runAsyncTest('2.1 POST /api/quantzing/spaces/:slug/events-ticket mints 30s single-use room-bound ticket', async () => {
  // 1. Unauthenticated request must fail 401
  const unauthReq = createMockReq({
    method: 'POST',
    url: `/api/quantzing/spaces/${testSpace.slug}/events-ticket`,
  })
  const unauthRes = createMockRes()
  await handleQuantZingPds(unauthReq, unauthRes)
  assert.equal(unauthRes.statusCode, 401, 'Unauthenticated request must return 401')

  // 2. Authenticated request mints ticket
  const authReq = createMockReq({
    method: 'POST',
    url: `/api/quantzing/spaces/${testSpace.slug}/events-ticket`,
    headers: { authorization: `Bearer ${aliceToken}` },
    body: { clientId: 'client_desktop_alpha' },
  })
  const authRes = createMockRes()
  await handleQuantZingPds(authReq, authRes)

  assert.equal(authRes.statusCode, 200, 'Must return 200')
  assert.equal(authRes.body.ok, true)
  assert.ok(typeof authRes.body.ticket === 'string' && authRes.body.ticket.length > 20, 'Opaque ticket minted')
  assert.equal(authRes.body.slug, testSpace.slug)
  assert.equal(authRes.body.clientId, 'client_desktop_alpha')
  assert.equal(authRes.body.expiresInSec, 30)

  mintedTicket = authRes.body.ticket
})

await runAsyncTest('2.2 SSE Ticket is single-use: consumed on first use, rejected on reuse', async () => {
  assert.ok(mintedTicket, 'Minted ticket must exist')

  // First use: Connects to SSE
  const sseReq1 = createMockReq({
    method: 'GET',
    url: `/api/quantzing/spaces/${testSpace.slug}/events?ticket=${mintedTicket}`,
  })
  const sseRes1 = createMockRes()
  await handleQuantZingPds(sseReq1, sseRes1)

  assert.equal(sseRes1.statusCode, 200, 'First connection must succeed')
  assert.equal(sseRes1.headers['content-type'], 'text/event-stream; charset=utf-8')

  // Second use: Replay attack with same ticket must be rejected 401 InvalidTicket
  const sseReq2 = createMockReq({
    method: 'GET',
    url: `/api/quantzing/spaces/${testSpace.slug}/events?ticket=${mintedTicket}`,
  })
  const sseRes2 = createMockRes()
  await handleQuantZingPds(sseReq2, sseRes2)

  assert.equal(sseRes2.statusCode, 401, 'Reusing ticket must return 401')
  assert.equal(sseRes2.body.error, 'InvalidTicket')
})

await runAsyncTest('2.3 SSE Ticket is room-bound: using ticket in a different room is rejected 403', async () => {
  // Mint a ticket for room alpha
  const mintReq = createMockReq({
    method: 'POST',
    url: `/api/quantzing/spaces/${testSpace.slug}/events-ticket`,
    headers: { authorization: `Bearer ${aliceToken}` },
  })
  const mintRes = createMockRes()
  await handleQuantZingPds(mintReq, mintRes)
  const roomAlphaTicket = mintRes.body.ticket

  // Create room beta
  const roomBeta = store.createSpace({
    hostDid: aliceAcc.did,
    title: 'Room Beta',
    topic: 'Testing',
    status: 'live',
  })

  // Try to use roomAlphaTicket in roomBeta
  const sseReq = createMockReq({
    method: 'GET',
    url: `/api/quantzing/spaces/${roomBeta.slug}/events?ticket=${roomAlphaTicket}`,
  })
  const sseRes = createMockRes()
  await handleQuantZingPds(sseReq, sseRes)

  assert.equal(sseRes.statusCode, 403, 'Cross-room ticket use must return 403 Forbidden')
  assert.equal(sseRes.body.error, 'Forbidden')
})

await runAsyncTest('2.4 SSE Ticket expires after 30 seconds', async () => {
  // Mint ticket
  const mintReq = createMockReq({
    method: 'POST',
    url: `/api/quantzing/spaces/${testSpace.slug}/events-ticket`,
    headers: { authorization: `Bearer ${aliceToken}` },
  })
  const mintRes = createMockRes()
  await handleQuantZingPds(mintReq, mintRes)
  const ticket = mintRes.body.ticket

  // Manually age the ticket past 30s
  const record = spaceSseTickets.get(ticket)
  record.expiresAt = Date.now() - 5000

  // Attempt connection
  const sseReq = createMockReq({
    method: 'GET',
    url: `/api/quantzing/spaces/${testSpace.slug}/events?ticket=${ticket}`,
  })
  const sseRes = createMockRes()
  await handleQuantZingPds(sseReq, sseRes)

  assert.equal(sseRes.statusCode, 401, 'Expired ticket must return 401')
  assert.equal(sseRes.body.error, 'ExpiredTicket')
})

await runAsyncTest('2.5 Backwards-compatible fallback: valid Bearer JWT connects without ticket', async () => {
  const req = createMockReq({
    method: 'GET',
    url: `/api/quantzing/spaces/${testSpace.slug}/events`,
    headers: { authorization: `Bearer ${aliceToken}` },
  })
  const res = createMockRes()
  await handleQuantZingPds(req, res)

  assert.equal(res.statusCode, 200, 'Bearer token fallback must connect')
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
})

// ---------------------------------------------------------------------------
// 3. Red-Team Anti-Bot & Blocked IP Defense
// ---------------------------------------------------------------------------

await runAsyncTest('3.1 Blocked IP is rejected with 403 on any request', async () => {
  savePlatformSettings(tempDir, {
    antibot: {
      blockedIps: ['198.51.100.99', '203.0.113.50'],
      maxViewsPerMinutePerIp: 600,
    },
  })
  invalidatePlatformSettingsCache()

  const blockedReq = createMockReq({
    method: 'GET',
    url: '/api/quantzing/config',
    ip: '198.51.100.99',
  })
  const blockedRes = createMockRes()
  await handleQuantZingPds(blockedReq, blockedRes)

  assert.equal(blockedRes.statusCode, 403, 'Blocked IP must receive 403 Forbidden')
  assert.equal(blockedRes.body.error, 'Forbidden')

  // Clean IP allowed
  const cleanReq = createMockReq({
    method: 'GET',
    url: '/api/quantzing/config',
    ip: '198.51.100.100',
  })
  const cleanRes = createMockRes()
  await handleQuantZingPds(cleanReq, cleanRes)

  assert.equal(cleanRes.statusCode, 200, 'Non-blocked IP must receive 200 OK')
})

await runAsyncTest('3.2 GET /api/quantzing/antibot/stats exposes live shield metrics', async () => {
  const req = createMockReq({ method: 'GET', url: '/api/quantzing/antibot/stats', ip: '127.0.0.1' })
  const res = createMockRes()
  await handleQuantZingPds(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.ok(res.body.stats.totalBlockedIps >= 1, 'Metrics must record blocked IP count')
  assert.ok(Array.isArray(res.body.stats.recentViolations))
})

// ---------------------------------------------------------------------------
// 4. View-Inflation Bot Loop Defense (Deduplication & Velocity Shield)
// ---------------------------------------------------------------------------

await runAsyncTest('4.1 View-inflation bot loop is deduplicated within 10-minute window', async () => {
  const postUri = `at://${aliceAcc.did}/app.bsky.feed.post/post_anti_inflate`
  const botIp = '198.51.100.111'
  const botViewerKey = 'anon:bot_fingerprint_xyz'

  antiBotShield.reset()

  // First view: Accepted
  const req1 = createMockReq({
    method: 'POST',
    url: '/api/quantzing/views/record',
    ip: botIp,
    headers: { 'user-agent': 'BotNet/1.0' },
    body: { uri: postUri },
  })
  const res1 = createMockRes()
  await handleQuantZingPds(req1, res1)

  assert.equal(res1.statusCode, 200)
  assert.equal(res1.body.deduplicated, 0, 'First view must not be deduplicated')

  // Run 20 rapid view attempts in a loop with same viewerKey and post
  let totalDeduplicated = 0
  for (let i = 0; i < 20; i++) {
    const loopReq = createMockReq({
      method: 'POST',
      url: '/api/quantzing/views/record',
      ip: botIp,
      headers: { 'user-agent': 'BotNet/1.0' },
      body: { uri: postUri },
    })
    const loopRes = createMockRes()
    await handleQuantZingPds(loopReq, loopRes)
    if (loopRes.statusCode === 200) {
      totalDeduplicated += (loopRes.body.deduplicated || 0)
    }
  }

  assert.ok(totalDeduplicated >= 20, 'All 20 looped bot views must be deduplicated')
  assert.ok(antiBotShield.stats.deduplicatedViews >= 20, 'Shield stats must track deduplicated views')
})

await runAsyncTest('4.2 Rapid view burst anomaly triggers 429 RateLimitExceeded', async () => {
  const burstIp = '198.51.100.222'
  let got429 = false

  for (let i = 0; i < 75; i++) {
    const burstReq = createMockReq({
      method: 'POST',
      url: '/api/quantzing/views/record',
      ip: burstIp,
      body: { uri: `at://${aliceAcc.did}/app.bsky.feed.post/post_${i}` },
    })
    const burstRes = createMockRes()
    await handleQuantZingPds(burstReq, burstRes)
    if (burstRes.statusCode === 429) {
      got429 = true
      assert.equal(burstRes.body.error, 'RateLimitExceeded')
      break
    }
  }

  assert.ok(got429, 'Burst exceeding velocity ceiling must trigger 429')
  assert.ok(antiBotShield.stats.totalAnomaliesDetected >= 1, 'Anomaly must be tracked in shield stats')
})

// ---------------------------------------------------------------------------
// 5. Billion-Scale Coalesced Write-Behind Buffer (quantzing-store.mjs)
// ---------------------------------------------------------------------------

runTest('5.1 Coalesced write-behind buffer enqueues views with instant RAM overlay and zero disk lock', () => {
  const testUri = `at://${aliceAcc.did}/app.bsky.feed.post/write_behind_test`
  
  // Clean store state
  store.flushPendingViews()
  const initialCount = store.getPostViewCount(testUri)

  // Enqueue 3 unique views
  store.recordViews([testUri], 'viewer_alpha')
  store.recordViews([testUri], 'viewer_beta')
  store.recordViews([testUri], 'viewer_gamma')

  // Instant in-memory RAM overlay reflection without waiting for disk flush!
  assert.equal(store.getPostViewCount(testUri), initialCount + 3, 'RAM view count updates instantly')

  // Flush write-behind batch into SQLite WAL
  const flushedCount = store.flushPendingViews()
  assert.equal(flushedCount, 3, 'Flushed exactly 3 unique views in single WAL batch')

  // Post-flush count in SQLite WAL matches
  assert.equal(store.getPostViewCount(testUri), initialCount + 3, 'Persisted count matches')
})

runTest('5.2 Auto-flush triggers at 500 views threshold & clean shutdown flushes pending views', () => {
  const testUri = `at://${aliceAcc.did}/app.bsky.feed.post/batch_threshold_test`
  store.flushPendingViews()

  // Enqueue exactly 500 distinct views to test threshold auto-flush
  for (let i = 0; i < 500; i++) {
    store.enqueuePostViews([testUri], `viewer_batch_${i}`)
  }

  // At 500, auto-flush must have fired, so SQLite holds exactly 500 views
  const rawRow = store.db.prepare('SELECT view_count FROM post_counters WHERE uri = ?').get(testUri)
  assert.equal(Number(rawRow?.view_count || 0), 500, 'Batch threshold auto-flushed to SQLite')

  // Enqueue 10 more
  for (let i = 500; i < 510; i++) {
    store.enqueuePostViews([testUri], `viewer_batch_${i}`)
  }

  // Clean flush
  const finalFlushed = store.flushPendingViews()
  assert.equal(finalFlushed, 10, 'Clean flush handles remaining views')
})

// ---------------------------------------------------------------------------
// 6. Reels Multi-Signal Ranking Algorithm (Velocity, Time-Decay & Diversity)
// ---------------------------------------------------------------------------

runTest('6.1 Reels ranking combines velocity, time-decay and creator-diversity back-to-back penalty', () => {
  const now = Date.now()
  const oneHourAgo = new Date(now - 3600 * 1000).toISOString()
  const twoHoursAgo = new Date(now - 7200 * 1000).toISOString()
  const fourDaysAgo = new Date(now - 4 * 86400 * 1000).toISOString()

  const items = [
    {
      post: {
        uri: 'at://did:plc:creatorA/app.bsky.feed.post/v1',
        author: { did: 'did:plc:creatorA', handle: 'creatorA' },
        likeCount: 200,
        repostCount: 50,
        replyCount: 20,
        viewCount: 1000,
        record: { createdAt: oneHourAgo },
      },
    },
    {
      post: {
        uri: 'at://did:plc:creatorA/app.bsky.feed.post/v2',
        author: { did: 'did:plc:creatorA', handle: 'creatorA' },
        likeCount: 150,
        repostCount: 30,
        replyCount: 10,
        viewCount: 600,
        record: { createdAt: oneHourAgo },
      },
    },
    {
      post: {
        uri: 'at://did:plc:creatorB/app.bsky.feed.post/v3',
        author: { did: 'did:plc:creatorB', handle: 'creatorB' },
        likeCount: 140,
        repostCount: 25,
        replyCount: 10,
        viewCount: 500,
        record: { createdAt: oneHourAgo },
      },
    },
    {
      post: {
        uri: 'at://did:plc:creatorC/app.bsky.feed.post/v4',
        author: { did: 'did:plc:creatorC', handle: 'creatorC' },
        likeCount: 50,
        repostCount: 5,
        replyCount: 2,
        viewCount: 100,
        record: { createdAt: twoHoursAgo },
      },
    },
    {
      post: {
        uri: 'at://did:plc:creatorD/app.bsky.feed.post/v5',
        author: { did: 'did:plc:creatorD', handle: 'creatorD' },
        likeCount: 500,
        repostCount: 100,
        replyCount: 50,
        viewCount: 3000,
        record: { createdAt: fourDaysAgo }, // Very stale
      },
    },
  ]

  const ranked = rankReelsItems(items, {
    trends: {
      reelsFreshnessGravity: 1.35,
      reelsDiversityWindow: 3,
    },
  }, store)

  assert.equal(ranked.length, items.length)

  // 1. Highest scoring fresh video from creatorA is #1
  assert.equal(ranked[0].post.uri, 'at://did:plc:creatorA/app.bsky.feed.post/v1')

  // 2. Creator diversity penalty prevents creatorA from appearing back-to-back at #2!
  // Instead, creatorB's video v3 must be chosen at #2!
  assert.equal(ranked[1].post.author.did, 'did:plc:creatorB', 'Creator B must be selected at #2 to prevent back-to-back duplicate creator')
  assert.equal(ranked[1].post.uri, 'at://did:plc:creatorB/app.bsky.feed.post/v3')

  // 3. CreatorA's second video v2 is chosen at #3
  assert.equal(ranked[2].post.author.did, 'did:plc:creatorA')
  assert.equal(ranked[2].post.uri, 'at://did:plc:creatorA/app.bsky.feed.post/v2')

  // 4. Stale 4-day-old video v5 is demoted by time-decay gravity despite massive likes
  assert.equal(ranked[ranked.length - 1].post.uri, 'at://did:plc:creatorD/app.bsky.feed.post/v5', 'Stale video heavily demoted by exponential time decay')
})

// ---------------------------------------------------------------------------
// Teardown & Results
// ---------------------------------------------------------------------------

closeAllStores()
try {
  fs.rmSync(tempDir, { recursive: true, force: true })
} catch {}

console.log('\n==================================================')
console.log(`Results: ${passCount} Passed, ${failCount} Failed`)
console.log('==================================================')

if (failCount > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
