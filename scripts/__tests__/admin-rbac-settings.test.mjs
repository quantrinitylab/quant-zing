import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  normalizeRole,
  isStaffRole,
  hasPermission,
  getPermissionsForRole,
  defaultDepartmentForRole,
  ROLE_META,
  handleQuantZingAdmin,
  ensureAdminState,
  loadPlatformSettings,
  savePlatformSettings,
  getRuntimePlatformSettings,
  sanitizeAiSettings,
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_FILENAME,
} from '../quantzing-admin.mjs'

console.log('🧪 Starting QuantZing Department RBAC & Platform Settings Verification Suite...\n')

let passCount = 0
let failCount = 0

function runTest(name, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${name}`)
    passCount++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     ${err.message}`)
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
    console.error(`     ${err.message}`)
    failCount++
  }
}

// ---------------------------------------------------------------------------
// 1. Role Matrix & Specialist Roles Verification
// ---------------------------------------------------------------------------

runTest('Exact 8 staff roles registered with granular permissions', () => {
  const expectedRoles = [
    'super_admin',
    'l2_trust_safety',
    'l1_moderator',
    'verification_ops',
    'support_agent',
    'ai_ops',
    'anti_bot_ops',
    'growth_ops',
  ]

  for (const r of expectedRoles) {
    assert.ok(STAFF_ROLES.has(r), `Staff roles must contain ${r}`)
    assert.ok(ROLE_META[r], `ROLE_META must have metadata for ${r}`)
  }

  // super_admin must have all 6 new permissions
  assert.ok(hasPermission('super_admin', 'ai.read'))
  assert.ok(hasPermission('super_admin', 'ai.manage'))
  assert.ok(hasPermission('super_admin', 'antibot.read'))
  assert.ok(hasPermission('super_admin', 'antibot.manage'))
  assert.ok(hasPermission('super_admin', 'trends.read'))
  assert.ok(hasPermission('super_admin', 'trends.manage'))

  // ai_ops permissions: overview.read, ai.read, ai.manage, audit.read
  assert.deepEqual(getPermissionsForRole('ai_ops').sort(), [
    'ai.manage',
    'ai.read',
    'audit.read',
    'overview.read',
  ].sort())
  assert.equal(defaultDepartmentForRole('ai_ops'), 'AI & Quanty')

  // anti_bot_ops permissions: overview.read, antibot.read, antibot.manage, users.read, users.inspect, reports.read, audit.read
  assert.deepEqual(getPermissionsForRole('anti_bot_ops').sort(), [
    'antibot.manage',
    'antibot.read',
    'audit.read',
    'overview.read',
    'reports.read',
    'users.inspect',
    'users.read',
  ].sort())
  assert.equal(defaultDepartmentForRole('anti_bot_ops'), 'Anti-Bot & Integrity')

  // growth_ops permissions: overview.read, trends.read, trends.manage, posts.read, audit.read
  assert.deepEqual(getPermissionsForRole('growth_ops').sort(), [
    'audit.read',
    'growth_ops' ? 'overview.read' : '',
    'posts.read',
    'trends.manage',
    'trends.read',
  ].filter(Boolean).sort())
  assert.equal(defaultDepartmentForRole('growth_ops'), 'Trends & Reels')

  // Isolation check: l1_moderator must NOT have ai.manage or antibot.manage
  assert.equal(hasPermission('l1_moderator', 'ai.manage'), false)
  assert.equal(hasPermission('l1_moderator', 'antibot.manage'), false)
  assert.equal(hasPermission('l1_moderator', 'trends.manage'), false)
  assert.equal(hasPermission('ai_ops', 'antibot.manage'), false)
  assert.equal(hasPermission('anti_bot_ops', 'ai.manage'), false)
})

// ---------------------------------------------------------------------------
// 2. Persisted Settings File Operations (Atomic .tmp + rename)
// ---------------------------------------------------------------------------

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-platform-settings-test-'))

runTest('loadPlatformSettings & savePlatformSettings with atomic writing', () => {
  const initial = loadPlatformSettings(tempDir)
  assert.equal(initial.ai.provider, 'cloudflare-workers-ai')
  assert.equal(initial.antibot.maxPostsPerMinute, 30)
  assert.equal(initial.trends.reelsFreshnessGravity, 1.35)

  // Mutate and save
  initial.ai.cfAccountId = 'acc_12345'
  initial.ai.cfApiToken = 'secret-cf-token-9988'
  initial.antibot.blockedIps = ['198.51.100.1']
  initial.trends.pinnedTrends = ['#QuantZing', '#SovereignAI']

  savePlatformSettings(tempDir, initial)

  const reloaded = loadPlatformSettings(tempDir)
  assert.equal(reloaded.ai.cfAccountId, 'acc_12345')
  assert.equal(reloaded.ai.cfApiToken, 'secret-cf-token-9988')
  assert.deepEqual(reloaded.antibot.blockedIps, ['198.51.100.1'])
  assert.deepEqual(reloaded.trends.pinnedTrends, ['#QuantZing', '#SovereignAI'])

  const runtimeSettings = getRuntimePlatformSettings(tempDir)
  assert.equal(runtimeSettings.ai.cfAccountId, 'acc_12345')
})

runTest('sanitizeAiSettings masks token and exposes last-4 cleanly', () => {
  const sanitized = sanitizeAiSettings({
    provider: 'cloudflare-workers-ai',
    cfAccountId: 'test-acc',
    cfApiToken: 'cf-secret-token-abcd',
  })
  assert.equal(sanitized.hasCfApiToken, true)
  assert.equal(sanitized.cfApiTokenLast4, 'abcd')
  assert.ok(sanitized.cfApiToken.includes('••••'))
  assert.ok(!sanitized.cfApiToken.includes('secret'))
})

// ---------------------------------------------------------------------------
// 3. HTTP Mock Rig for Endpoints & RBAC Validation
// ---------------------------------------------------------------------------

function createMockReq({method = 'GET', url = '/', headers = {}, body = null}) {
  return {
    method,
    url,
    headers: {
      host: 'ops.quantzing.com',
      ...headers,
    },
    body,
    __test: true,
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) { this.statusCode = c; return this },
    setHeader(k, v) { this.headers[k] = v; return this },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h); return this },
    end(d) {
      if (d) {
        try { this.body = JSON.parse(d) } catch { this.body = d }
      }
      return this
    },
  }
}

function createTestEnv() {
  const db = {
    accounts: {},
    auditLog: [],
    reports: [],
    appeals: [],
    pendingApprovals: [],
    takedowns: {posts: {}, accounts: {}},
    labels: {},
    mutes: {},
  }

  const helpers = {
    getDataDir: () => tempDir,
    getDbPath: () => path.join(tempDir, 'db.sqlite'),
    saveDb: () => {},
    sendJson: (req, res, code, payload) => {
      res.writeHead(code, {'content-type': 'application/json'})
      res.end(JSON.stringify(payload))
    },
    sendXrpcError: (req, res, status, error, message) => {
      res.writeHead(status, {'content-type': 'application/json'})
      res.end(JSON.stringify({error, message}))
    },
    readJsonBody: async (req) => req.body || {},
    getAuthedContext: (req, currentDb) => {
      const authHeader = req.headers?.authorization || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!token) return {error: 'AuthenticationRequired'}
      const account = currentDb.accounts[token]
      if (!account) return {error: 'InvalidToken'}
      return {did: account.did, account, role: account.role}
    },
  }

  // Create accounts with various roles
  db.accounts['tok_super_admin'] = {
    did: 'did:plc:superadmin',
    handle: 'super.quantzing.com',
    role: 'super_admin',
    department: 'Leadership',
    status: 'active',
  }
  db.accounts['tok_l1_mod'] = {
    did: 'did:plc:l1mod',
    handle: 'mod.quantzing.com',
    role: 'l1_moderator',
    department: 'Content Moderation',
    status: 'active',
  }
  db.accounts['tok_ai_ops'] = {
    did: 'did:plc:aiops',
    handle: 'ai.quantzing.com',
    role: 'ai_ops',
    department: 'AI & Quanty',
    status: 'active',
  }
  db.accounts['tok_antibot_ops'] = {
    did: 'did:plc:antibot',
    handle: 'antibot.quantzing.com',
    role: 'anti_bot_ops',
    department: 'Anti-Bot & Integrity',
    status: 'active',
  }
  db.accounts['tok_growth_ops'] = {
    did: 'did:plc:growth',
    handle: 'growth.quantzing.com',
    role: 'growth_ops',
    department: 'Trends & Reels',
    status: 'active',
  }

  return {db, helpers}
}

// ---------------------------------------------------------------------------
// 4. Endpoint RBAC Tests & Token Masking in Audit Log
// ---------------------------------------------------------------------------

await runAsyncTest('L1 Moderator is forbidden (403) from AI settings', async () => {
  const {db, helpers} = createTestEnv()
  const req = createMockReq({
    method: 'GET',
    url: '/ops/api/settings/ai',
    headers: {authorization: 'Bearer tok_l1_mod'},
  })
  const res = createMockRes()

  await handleQuantZingAdmin(req, res, {
    db,
    pathname: '/ops/api/settings/ai',
    searchParams: new URLSearchParams(),
    method: 'GET',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, 'Forbidden')
})

await runAsyncTest('AI Ops can read and update AI settings; token is masked and omitted from audit', async () => {
  const {db, helpers} = createTestEnv()

  // 1. GET /ops/api/settings/ai
  const getReq = createMockReq({
    method: 'GET',
    url: '/ops/api/settings/ai',
    headers: {authorization: 'Bearer tok_ai_ops'},
  })
  const getRes = createMockRes()

  await handleQuantZingAdmin(getReq, getRes, {
    db,
    pathname: '/ops/api/settings/ai',
    searchParams: new URLSearchParams(),
    method: 'GET',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(getRes.statusCode, 200)
  assert.equal(getRes.body.ok, true)
  assert.ok(getRes.body.cfPrimaryModel)

  // 2. PATCH /ops/api/settings/ai
  const patchReq = createMockReq({
    method: 'PATCH',
    url: '/ops/api/settings/ai',
    headers: {authorization: 'Bearer tok_ai_ops'},
    body: {
      provider: 'cloudflare-workers-ai',
      cfAccountId: 'cf_enterprise_account_8899',
      cfApiToken: 'cf_super_secret_token_12345_wxyz',
      cfPrimaryModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      dailyNeuronBudget: 250000,
      enableWebGrounding: true,
      systemPromptAddon: 'QuantZing Enterprise Guardrail Active',
    },
  })
  const patchRes = createMockRes()

  await handleQuantZingAdmin(patchReq, patchRes, {
    db,
    pathname: '/ops/api/settings/ai',
    searchParams: new URLSearchParams(),
    method: 'PATCH',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(patchRes.statusCode, 200)
  assert.equal(patchRes.body.ok, true)
  assert.equal(patchRes.body.cfAccountId, 'cf_enterprise_account_8899')
  assert.equal(patchRes.body.hasCfApiToken, true)
  assert.equal(patchRes.body.cfApiTokenLast4, 'wxyz')
  assert.ok(!patchRes.body.cfApiToken.includes('super_secret'))

  // Verify Audit Log: MUST NOT contain raw secret
  assert.ok(db.auditLog.length > 0)
  const auditEntry = db.auditLog.find(e => e.action === 'settings.ai_update')
  assert.ok(auditEntry, 'Audit log must record settings.ai_update')
  assert.equal(auditEntry.details.hasCfApiToken, true)
  assert.equal(auditEntry.details.cfAccountId, 'cf_enterprise_account_8899')
  assert.equal(JSON.stringify(auditEntry).includes('cf_super_secret_token'), false, 'Audit log MUST omit raw API token')
})

await runAsyncTest('Anti-Bot Ops can update Anti-Bot settings; AI Ops is 403 forbidden', async () => {
  const {db, helpers} = createTestEnv()

  // AI Ops attempting to PATCH Anti-Bot -> 403
  const forbiddenReq = createMockReq({
    method: 'PATCH',
    url: '/ops/api/settings/antibot',
    headers: {authorization: 'Bearer tok_ai_ops'},
    body: {maxPostsPerMinute: 10},
  })
  const forbiddenRes = createMockRes()

  await handleQuantZingAdmin(forbiddenReq, forbiddenRes, {
    db,
    pathname: '/ops/api/settings/antibot',
    searchParams: new URLSearchParams(),
    method: 'PATCH',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(forbiddenRes.statusCode, 403)

  // Anti-Bot Ops updating settings -> 200
  const allowedReq = createMockReq({
    method: 'PATCH',
    url: '/ops/api/settings/antibot',
    headers: {authorization: 'Bearer tok_antibot_ops'},
    body: {
      maxPostsPerMinute: 45,
      maxLikesPerMinute: 200,
      autoShadowThrottle: true,
      requireEmailVerifyForLinks: true,
      blockedIps: ['192.0.2.1', '198.51.100.99'],
      blockedDomains: ['badphish.com', 'botnetwork.org'],
    },
  })
  const allowedRes = createMockRes()

  await handleQuantZingAdmin(allowedReq, allowedRes, {
    db,
    pathname: '/ops/api/settings/antibot',
    searchParams: new URLSearchParams(),
    method: 'PATCH',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(allowedRes.statusCode, 200)
  assert.equal(allowedRes.body.maxPostsPerMinute, 45)
  assert.deepEqual(allowedRes.body.blockedIps, ['192.0.2.1', '198.51.100.99'])
  assert.deepEqual(allowedRes.body.blockedDomains, ['badphish.com', 'botnetwork.org'])
})

await runAsyncTest('Growth Ops can update Trends & Reels curation; L1 Moderator is 403 forbidden', async () => {
  const {db, helpers} = createTestEnv()

  // L1 Moderator attempting to PATCH Trends -> 403
  const forbiddenReq = createMockReq({
    method: 'PATCH',
    url: '/ops/api/settings/trends',
    headers: {authorization: 'Bearer tok_l1_mod'},
    body: {pinnedTrends: ['#Spam']},
  })
  const forbiddenRes = createMockRes()

  await handleQuantZingAdmin(forbiddenReq, forbiddenRes, {
    db,
    pathname: '/ops/api/settings/trends',
    searchParams: new URLSearchParams(),
    method: 'PATCH',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(forbiddenRes.statusCode, 403)

  // Growth Ops updating settings -> 200
  const allowedReq = createMockReq({
    method: 'PATCH',
    url: '/ops/api/settings/trends',
    headers: {authorization: 'Bearer tok_growth_ops'},
    body: {
      pinnedTrends: ['#QuantZing', '#Web3', '#SovereignData'],
      mutedTrends: ['#MalwareBait', '#ScamAirdrop'],
      reelsFreshnessGravity: 1.45,
      reelsDiversityWindow: 4,
    },
  })
  const allowedRes = createMockRes()

  await handleQuantZingAdmin(allowedReq, allowedRes, {
    db,
    pathname: '/ops/api/settings/trends',
    searchParams: new URLSearchParams(),
    method: 'PATCH',
    origin: 'https://ops.quantzing.com',
    helpers,
  })

  assert.equal(allowedRes.statusCode, 200)
  assert.deepEqual(allowedRes.body.pinnedTrends, ['#QuantZing', '#Web3', '#SovereignData'])
  assert.deepEqual(allowedRes.body.mutedTrends, ['#MalwareBait', '#ScamAirdrop'])
  assert.equal(allowedRes.body.reelsFreshnessGravity, 1.45)
  assert.equal(allowedRes.body.reelsDiversityWindow, 4)
})

// Cleanup
try {
  fs.rmSync(tempDir, {recursive: true, force: true})
} catch {}

console.log(`\nResults: ${passCount} PASSED, ${failCount} FAILED`)
if (failCount > 0) {
  process.exit(1)
}
