import assert from 'node:assert/strict'

console.log('🧪 Starting WebRTC Voice Mesh Unit Test Suite (Zero SSR Side Effects & Lifecycle)...\n')

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

// Dynamically import spaceAudioWebRtc
const mod = await import('../../src/lib/quantos/spaceAudioWebRtc.ts')
const { isWebRtcAudioSupported, ZingSpaceAudioMesh } = mod

// 1. SSR / Node.js Environment Safety
runTest('isWebRtcAudioSupported returns false in Node/SSR environment', () => {
  assert.equal(isWebRtcAudioSupported(), false, 'Node environment correctly reports false')
})

runTest('ZingSpaceAudioMesh instantiates safely with default state when unsupported', () => {
  const mesh = new ZingSpaceAudioMesh({
    slug: 'test-space',
    myDid: 'did:plc:testuser123',
    myClientId: 'client-abc-123',
    canSpeak: false,
    callbacks: {
      sendSignal: async () => {},
      onStateChange: () => {}
    }
  })
  
  const state = mesh.getState()
  assert.equal(state.supported, false, 'State marks supported as false')
  assert.equal(state.connectedPeers, 0, 'Zero connected peers')
  assert.equal(state.micActive, false, 'Mic is inactive')
  assert.equal(state.muted, true, 'Starts muted')
  assert.equal(state.audioBlocked, false, 'Not blocked')
  assert.equal(state.micError, null, 'No mic error')
  assert.deepEqual(state.speakingLevels, {}, 'Empty speaking levels')
})

await runAsyncTest('ZingSpaceAudioMesh.start() and destroy() are graceful no-ops when unsupported', async () => {
  let stateEmissions = 0
  const mesh = new ZingSpaceAudioMesh({
    slug: 'test-space',
    myDid: 'did:plc:testuser123',
    myClientId: 'client-abc-123',
    canSpeak: false,
    callbacks: {
      sendSignal: async () => {},
      onStateChange: () => { stateEmissions++ }
    }
  })

  await mesh.start()
  assert.equal(stateEmissions, 1, 'Emits state once on start')
  
  // Peer actions should not throw
  mesh.handlePeersSnapshot([])
  mesh.handlePeerJoined({ did: 'did:plc:peer1', clientId: 'client-peer1' })
  mesh.handlePeerLeft('client-peer1')
  await mesh.handleSignal({ slug: 'test-space', signalType: 'peer-leave', fromClientId: 'client-peer1' })
  
  mesh.destroy()
  assert.equal(mesh.getState().connectedPeers, 0, 'Clean state after destroy')
})

await runAsyncTest('ZingSpaceAudioMesh.enableMicrophone fails gracefully without crashing on unsupported runtime', async () => {
  const mesh = new ZingSpaceAudioMesh({
    slug: 'test-space',
    myDid: 'did:plc:testuser123',
    myClientId: 'client-abc-123',
    canSpeak: true,
    callbacks: {
      sendSignal: async () => {},
      onStateChange: () => {}
    }
  })

  const granted = await mesh.enableMicrophone()
  assert.equal(granted, false, 'Microphone cannot be granted on unsupported runtime')
  assert.ok(mesh.getState().micError?.includes('not supported'), 'Sets appropriate micError')
  mesh.destroy()
})

runTest('ZingSpaceAudioMesh.setCanSpeak cleanly updates permission status', () => {
  const mesh = new ZingSpaceAudioMesh({
    slug: 'test-space',
    myDid: 'did:plc:testuser123',
    myClientId: 'client-abc-123',
    canSpeak: false,
    callbacks: {
      sendSignal: async () => {},
      onStateChange: () => {}
    }
  })

  mesh.setCanSpeak(true)
  assert.equal(mesh.getState().muted, true, 'Speaker still muted by default')
  mesh.setCanSpeak(false)
  assert.equal(mesh.getState().muted, true, 'Listener remains muted')
  mesh.destroy()
})

console.log(`\n========================================`)
console.log(`🏁 Test Summary: ${passCount} passed, ${failCount} failed`)
console.log(`========================================\n`)

if (failCount > 0) process.exit(1)
