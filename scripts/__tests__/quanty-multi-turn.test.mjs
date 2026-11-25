import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createQuantyBridge, callCloudflareWorkersAi, clearPlatformSettingsCache } from '../quantzing-quanty.mjs'

console.log('🧪 Starting Quanty Multi-Turn Reasoning & Tool Verification Suite...\n')

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

// 1. Instantiation
let bridge
runTest('createQuantyBridge returns valid object & 21 tools', () => {
  bridge = createQuantyBridge({
    computeSovereignTrends: async () => [{ topic: '#QuantOS', displayName: 'QuantOS', postCount: 42 }],
    searchLocalPosts: async () => []
  })
  assert.ok(bridge, 'Bridge instance created')
  assert.equal(typeof bridge.handleQuantyHttpRequest, 'function', 'handleQuantyHttpRequest is exposed')
  assert.equal(typeof bridge.executeTool, 'function', 'executeTool is exposed')
  assert.ok(Array.isArray(bridge.tools), 'tools array is exposed')
  assert.equal(bridge.tools.length, 21, 'Exposes exact 21 Sovereign tools')
})

// Mock HTTP Helpers with proper Node Readable stream
function createMockReq(body) {
  const payload = Buffer.from(JSON.stringify(body))
  const stream = Readable.from([payload])
  stream.method = 'POST'
  stream.url = '/api/quantzing/quanty/chat'
  stream.headers = { 'content-type': 'application/json' }
  stream.body = body
  return stream
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
    }
  }
}

// 2. Deterministic Safe Math
await runAsyncTest('Deterministic Math: 25 * 40 + 150', async () => {
  const req = createMockReq({ prompt: 'Calculate 25 * 40 + 150' })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled by Quanty')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-math')
  assert.ok(typeof res.body.thoughtMs === 'number', 'thoughtMs is returned')
  assert.ok(res.body.answer.includes('1150') || res.body.answer.includes('1,150'), 'Math evaluates correctly')
})

await runAsyncTest('Deterministic Math: Calculate 42 * 10 -> 420', async () => {
  const req = createMockReq({ prompt: 'Calculate 42 * 10' })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled by Quanty')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-math')
  assert.ok(typeof res.body.thoughtMs === 'number', 'thoughtMs is returned')
  assert.ok(res.body.answer.includes('420'), 'Math evaluates to 420')
})

await runAsyncTest('Deterministic Math: 15% of 2400 -> 360', async () => {
  const req = createMockReq({ prompt: '15% of 2400' })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled by Quanty')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-math')
  assert.ok(typeof res.body.thoughtMs === 'number', 'thoughtMs is returned')
  assert.ok(res.body.answer.includes('360'), 'Math evaluates to 360')
})

// 3. Coding assistance
await runAsyncTest('Coding: Generate debounce function', async () => {
  const req = createMockReq({ prompt: 'write a typescript debounce function' })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-coding')
  assert.ok(res.body.answer.includes('function debounce') || res.body.answer.includes('clearTimeout'), 'Returns debounce implementation')
})

// 4. Multi-turn Follow-Up: Shorten
await runAsyncTest('Multi-Turn Follow-Up: make it shorter', async () => {
  const req = createMockReq({
    prompt: 'make it shorter',
    history: [
      { role: 'user', content: 'What is WebRTC?' },
      { role: 'assistant', content: 'WebRTC (Web Real-Time Communication) is an open-source technology that enables real-time audio, video, and data communication between web browsers and mobile devices without requiring plugins or third-party software.' }
    ]
  })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-followup')
  assert.ok(res.body.answer.length < 250, 'Followup shortened successfully')
  assert.ok(res.body.suggestedZingDraft, 'Provides zing draft')
})

// 5. Multi-turn Follow-Up: Rewrite tone
await runAsyncTest('Multi-Turn Follow-Up: rewrite more professional', async () => {
  const req = createMockReq({
    prompt: 'rewrite this more professional',
    history: [
      { role: 'user', content: 'Write a tweet' },
      { role: 'assistant', content: 'Hey guys, our update is super lit check it out now!' }
    ]
  })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.origin, 'quanty-followup')
  assert.ok(res.body.answer.length > 0, 'Followup rewritten successfully')
})

// 6. Identity & Greeting
await runAsyncTest('Conversational: Who are you', async () => {
  const req = createMockReq({ prompt: 'who are you' })
  const res = createMockRes()
  const handled = await bridge.handleQuantyHttpRequest(req, res, '/api/quantzing/quanty/chat')
  assert.ok(handled, 'Request was handled')
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.answer.toLowerCase().includes('quanty'), 'Identifies as Quanty')
})

// 7. Tool Execution Test (21 tools)
await runAsyncTest('Tool Execution: trending_topics', async () => {
  const toolResult = await bridge.executeTool('trending_topics', { limit: 5 })
  assert.ok(toolResult, 'Tool executed')
  assert.equal(toolResult.httpStatus, 200, 'HTTP status is 200')
  assert.ok(toolResult.body?.ok, 'Tool body ok is true')
})

// 8. Cloudflare Workers AI Inference & Graceful Fallback
await runAsyncTest('Cloudflare Workers AI: Invocation & Model Selection via callCloudflareWorkersAi', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = ''
  let capturedHeaders = {}
  let capturedBody = null

  globalThis.fetch = async (url, options = {}) => {
    capturedUrl = String(url)
    capturedHeaders = options.headers || {}
    capturedBody = JSON.parse(options.body || '{}')
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: { response: 'Cloudflare response from llama' },
        success: true,
      }),
    }
  }

  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test_acc_123'
    process.env.CLOUDFLARE_API_TOKEN = 'test_tok_456'

    // Test fast mode (ask -> @cf/meta/llama-3.1-8b-instruct-fast)
    const fastRes = await callCloudflareWorkersAi({
      prompt: 'Summarize quantum mechanics',
      mode: 'ask',
    })
    assert.equal(fastRes.ok, true)
    assert.equal(fastRes.origin, 'cloudflare-workers-ai')
    assert.equal(fastRes.content, 'Cloudflare response from llama')
    assert.ok(capturedUrl.includes('test_acc_123/ai/run/@cf/meta/llama-3.1-8b-instruct-fast'))
    assert.equal(capturedHeaders.Authorization, 'Bearer test_tok_456')
    assert.ok(typeof fastRes.thoughtMs === 'number', 'thoughtMs returned')

    // Test think / deepsearch mode (-> @cf/meta/llama-3.3-70b-instruct-fp8-fast)
    const thinkRes = await callCloudflareWorkersAi({
      prompt: 'Deep dive into decentralized systems',
      mode: 'deepsearch',
    })
    assert.equal(thinkRes.ok, true)
    assert.ok(capturedUrl.includes('test_acc_123/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast'))

    // Test dynamic reading from platform-settings.json with 5s cache TTL
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantzing-test-'))
    const customSettingsPath = path.join(tmpDir, 'quantzing-platform-settings.json')
    fs.writeFileSync(
      customSettingsPath,
      JSON.stringify({
        ai: {
          cloudflareAccountId: 'dynamic_cf_acc_999',
          cloudflareApiToken: 'dynamic_cf_token_888',
          quantyCfModel: '@cf/custom/llama-pro',
          quantyCfFastModel: '@cf/custom/llama-flash',
        },
      }),
    )
    clearPlatformSettingsCache()

    const dynamicRes = await callCloudflareWorkersAi({
      prompt: 'Testing dynamic config',
      mode: 'think',
      dataDir: tmpDir,
    })
    assert.equal(dynamicRes.ok, true)
    assert.ok(capturedUrl.includes('dynamic_cf_acc_999/ai/run/@cf/custom/llama-pro'))
    assert.equal(capturedHeaders.Authorization, 'Bearer dynamic_cf_token_888')

    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true })
    clearPlatformSettingsCache()
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  }
})

await runAsyncTest('Cloudflare Workers AI: callQuantOsReasoning invokes CF and falls back gracefully on failure', async () => {
  const originalFetch = globalThis.fetch
  let fetchAttempts = 0

  // Mock fetch to fail for Cloudflare (status 500)
  globalThis.fetch = async (url) => {
    fetchAttempts++
    if (String(url).includes('api.cloudflare.com')) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ errors: [{ message: 'Cloudflare capacity exceeded' }] }),
      }
    }
    // Any fallback call returns 404/failure as well
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    }
  }

  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test_acc_fail'
    process.env.CLOUDFLARE_API_TOKEN = 'test_tok_fail'

    // When bridge's callQuantOsReasoning is called, it should try Cloudflare, fail, and gracefully fall back to {ok: false} without throwing
    const result = await bridge.callQuantOsReasoning({
      prompt: 'Hello AI world',
      mode: 'ask',
    })
    assert.ok(fetchAttempts >= 1, 'Attempted fetch')
    assert.equal(result.ok, false, 'Gracefully returned fallback when all tiers fail')
    assert.equal(result.origin, 'live-network')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  }
})

await runAsyncTest('Cloudflare Workers AI: callQuantOsReasoning returns cloudflare-workers-ai on success', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url) => {
    if (String(url).includes('api.cloudflare.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: { response: 'Workers AI reasoning response' },
          success: true,
        }),
      }
    }
    return { ok: false, status: 500, json: async () => ({}) }
  }

  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test_acc_ok'
    process.env.CLOUDFLARE_API_TOKEN = 'test_tok_ok'

    const result = await bridge.callQuantOsReasoning({
      prompt: 'Explain zero knowledge proofs',
      mode: 'ask',
    })
    assert.equal(result.ok, true)
    assert.equal(result.origin, 'cloudflare-workers-ai')
    assert.equal(result.content, 'Workers AI reasoning response')
    assert.ok(typeof result.thoughtMs === 'number', 'thoughtMs is present')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  }
})

console.log(`\n========================================`)
console.log(`🏁 Test Summary: ${passCount} passed, ${failCount} failed`)
console.log(`========================================\n`)

if (failCount > 0) process.exit(1)
