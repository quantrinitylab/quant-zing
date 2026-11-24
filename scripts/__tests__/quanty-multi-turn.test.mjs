import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createQuantyBridge } from '../quantzing-quanty.mjs'

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
  assert.ok(res.body.answer.includes('1150') || res.body.answer.includes('1,150'), 'Math evaluates correctly')
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

console.log(`\n========================================`)
console.log(`🏁 Test Summary: ${passCount} passed, ${failCount} failed`)
console.log(`========================================\n`)

if (failCount > 0) process.exit(1)
