/**
 * Zero-dependency WebRTC Mesh Voice Audio controller for ZingSpaces.
 *
 * Uses W3C Perfect Negotiation (glare-free polite/impolite peers), role-aware
 * microphone lifecycle (recvonly transceivers for listeners with zero unwanted
 * mic permission prompts), hidden <audio> playback with autoplay-unlock support,
 * and real Web Audio API AnalyserNode RMS speaking-level metering.
 *
 * All browser globals are accessed through guarded runtime feature detection
 * and minimal local structural interfaces so this module compiles strictly and
 * safely no-ops on React Native iOS/Android as well as SSR/Node environments.
 */

export type SpaceSignalType =
  | 'peer-ready'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'peer-leave'

export interface SpaceSignalEnvelope {
  seq?: number
  slug: string
  fromDid: string
  fromHandle?: string
  fromClientId: string
  toDid?: string
  toClientId?: string
  signalType: SpaceSignalType
  sdp?: {type: 'offer' | 'answer'; sdp: string}
  candidate?: Record<string, unknown>
  createdAt?: string
}

export interface SpacePeerInfo {
  did: string
  handle?: string
  clientId: string
}

export interface SpaceAudioState {
  supported: boolean
  connectedPeers: number
  micActive: boolean
  muted: boolean
  audioBlocked: boolean
  micError: string | null
  speakingLevels: Record<string, number>
}

export interface SpaceAudioCallbacks {
  sendSignal: (
    payload: Omit<
      SpaceSignalEnvelope,
      'fromDid' | 'fromHandle' | 'seq' | 'createdAt'
    >,
  ) => Promise<void>
  onStateChange: (state: SpaceAudioState) => void
}

export interface ZingSpaceAudioMeshOptions {
  slug: string
  myDid: string
  myClientId: string
  canSpeak: boolean
  callbacks: SpaceAudioCallbacks
}

// ---------------------------------------------------------------------------
// Minimal local structural interfaces (zero DOM-lib reliance for iOS/Android)
// ---------------------------------------------------------------------------

interface MinimalMediaStreamTrack {
  id: string
  kind: string
  enabled: boolean
  readyState?: string
  stop(): void
  onended?: (() => void) | null
}

interface MinimalMediaStream {
  id: string
  getTracks(): MinimalMediaStreamTrack[]
  getAudioTracks(): MinimalMediaStreamTrack[]
}

interface MinimalMediaStreamConstructor {
  new (tracks?: MinimalMediaStreamTrack[]): MinimalMediaStream
}

interface MinimalSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp?: string
}

interface MinimalIceCandidateInit {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
  [key: string]: unknown
}

interface MinimalIceCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
  toJSON?: () => Record<string, unknown>
}

interface MinimalRTCRtpSender {
  track: MinimalMediaStreamTrack | null
  replaceTrack(track: MinimalMediaStreamTrack | null): Promise<void>
  setStreams?(...streams: MinimalMediaStream[]): void
}

interface MinimalRTCRtpReceiver {
  track: MinimalMediaStreamTrack | null
}

type MinimalTransceiverDirection =
  | 'sendrecv'
  | 'sendonly'
  | 'recvonly'
  | 'inactive'
  | 'stopped'

interface MinimalRTCRtpTransceiver {
  mid: string | null
  direction: MinimalTransceiverDirection
  sender: MinimalRTCRtpSender
  receiver: MinimalRTCRtpReceiver
}

type MinimalSignalingState =
  | 'stable'
  | 'have-local-offer'
  | 'have-remote-offer'
  | 'have-local-pranswer'
  | 'have-remote-pranswer'
  | 'closed'

type MinimalConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

type MinimalIceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed'

interface MinimalRTCTrackEvent {
  track: MinimalMediaStreamTrack
  streams: ReadonlyArray<MinimalMediaStream>
}

interface MinimalRTCPeerConnectionIceEvent {
  candidate: MinimalIceCandidate | null
}

interface MinimalRTCPeerConnection {
  signalingState: MinimalSignalingState
  connectionState?: MinimalConnectionState
  iceConnectionState: MinimalIceConnectionState
  localDescription: MinimalSessionDescriptionInit | null
  remoteDescription: MinimalSessionDescriptionInit | null

  onnegotiationneeded: (() => void) | null
  onicecandidate: ((event: MinimalRTCPeerConnectionIceEvent) => void) | null
  ontrack: ((event: MinimalRTCTrackEvent) => void) | null
  onconnectionstatechange: (() => void) | null
  oniceconnectionstatechange: (() => void) | null

  addTrack(
    track: MinimalMediaStreamTrack,
    ...streams: MinimalMediaStream[]
  ): MinimalRTCRtpSender
  removeTrack(sender: MinimalRTCRtpSender): void
  addTransceiver(
    trackOrKind: string | MinimalMediaStreamTrack,
    init?: {direction?: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive'},
  ): MinimalRTCRtpTransceiver
  getTransceivers?(): MinimalRTCRtpTransceiver[]
  getSenders(): MinimalRTCRtpSender[]

  createOffer(options?: {
    iceRestart?: boolean
  }): Promise<MinimalSessionDescriptionInit>
  createAnswer(): Promise<MinimalSessionDescriptionInit>
  setLocalDescription(description?: MinimalSessionDescriptionInit): Promise<void>
  setRemoteDescription(description: MinimalSessionDescriptionInit): Promise<void>
  addIceCandidate(candidate: MinimalIceCandidateInit | null): Promise<void>
  close(): void
}

interface MinimalRTCPeerConnectionConstructor {
  new (config?: {
    iceServers?: Array<{urls: string | string[]}>
  }): MinimalRTCPeerConnection
}

interface MinimalAnalyserNode {
  fftSize: number
  smoothingTimeConstant: number
  frequencyBinCount: number
  getByteTimeDomainData(array: Uint8Array): void
  disconnect(): void
}

interface MinimalMediaStreamAudioSourceNode {
  connect(destination: MinimalAnalyserNode): void
  disconnect(): void
}

interface MinimalAudioContext {
  state: 'suspended' | 'running' | 'closed'
  resume(): Promise<void>
  close(): Promise<void>
  createMediaStreamSource(
    stream: MinimalMediaStream,
  ): MinimalMediaStreamAudioSourceNode
  createAnalyser(): MinimalAnalyserNode
}

interface MinimalAudioContextConstructor {
  new (): MinimalAudioContext
}

interface MinimalAudioElement {
  autoplay: boolean
  playsInline: boolean
  muted: boolean
  srcObject: MinimalMediaStream | null
  style: {display: string}
  parentNode: {removeChild(child: MinimalAudioElement): void} | null
  setAttribute(name: string, value: string): void
  play(): Promise<void>
  pause(): void
  remove?(): void
}

interface MinimalDocument {
  body?: {
    appendChild(node: MinimalAudioElement): void
  } | null
  createElement(tagName: 'audio'): MinimalAudioElement
}

interface WebRtcGlobalScope {
  window?: unknown
  document?: MinimalDocument
  navigator?: {
    mediaDevices?: {
      getUserMedia?: (constraints: {
        audio:
          | boolean
          | {
              echoCancellation?: boolean
              noiseSuppression?: boolean
              autoGainControl?: boolean
            }
        video: boolean
      }) => Promise<MinimalMediaStream>
    }
  }
  MediaStream?: MinimalMediaStreamConstructor
  RTCPeerConnection?: MinimalRTCPeerConnectionConstructor
  AudioContext?: MinimalAudioContextConstructor
  webkitAudioContext?: MinimalAudioContextConstructor
}

interface AnalyserBinding {
  source: MinimalMediaStreamAudioSourceNode
  analyser: MinimalAnalyserNode
  buffer: Uint8Array
}

interface PeerEntry {
  did: string
  handle?: string
  clientId: string
  pc: MinimalRTCPeerConnection
  isPolite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  needsRenegotiation: boolean
  pendingCandidates: MinimalIceCandidateInit[]
  signalQueue: Promise<void>
  audioSender: MinimalRTCRtpSender | null
  remoteStream: MinimalMediaStream | null
  audioEl: MinimalAudioElement | null
  analyser: AnalyserBinding | null
  lastIceRestartAt: number
  closed: boolean
}

const ICE_SERVERS: Array<{urls: string}> = [
  {urls: 'stun:stun.l.google.com:19302'},
  {urls: 'stun:stun1.l.google.com:19302'},
]

const ANALYSER_FFT_SIZE = 256
const LEVEL_SAMPLE_INTERVAL_MS = 100
const LEVEL_NOISE_FLOOR = 0.03
const LEVEL_CHANGE_THRESHOLD = 0.04
const MAX_PENDING_CANDIDATES = 200
const ICE_RESTART_COOLDOWN_MS = 5000

function getGlobalScope(): WebRtcGlobalScope {
  return globalThis as unknown as WebRtcGlobalScope
}

function serializeIceCandidate(
  candidate: MinimalIceCandidate,
): Record<string, unknown> {
  if (typeof candidate.toJSON === 'function') {
    return candidate.toJSON()
  }
  const out: Record<string, unknown> = {}
  if (typeof candidate.candidate === 'string') {
    out.candidate = candidate.candidate
  }
  if (candidate.sdpMid !== undefined) {
    out.sdpMid = candidate.sdpMid
  }
  if (candidate.sdpMLineIndex !== undefined) {
    out.sdpMLineIndex = candidate.sdpMLineIndex
  }
  if (candidate.usernameFragment !== undefined) {
    out.usernameFragment = candidate.usernameFragment
  }
  return out
}

function formatMicError(err: unknown): string {
  if (err && typeof err === 'object') {
    const maybeErr = err as {name?: unknown; message?: unknown}
    const name = typeof maybeErr.name === 'string' ? maybeErr.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Microphone permission was denied.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone device was found.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Microphone is currently in use by another application.'
    }
    if (name === 'OverconstrainedError') {
      return 'Requested microphone settings are not supported on this device.'
    }
    if (typeof maybeErr.message === 'string' && maybeErr.message.trim()) {
      return maybeErr.message.trim()
    }
  }
  return 'Unable to access microphone.'
}

function computeAnalyserLevel(binding: AnalyserBinding): number {
  binding.analyser.getByteTimeDomainData(binding.buffer)
  let sumSquares = 0
  const len = binding.buffer.length
  if (len === 0) {
    return 0
  }
  for (let i = 0; i < len; i += 1) {
    const centered = (binding.buffer[i] - 128) / 128
    sumSquares += centered * centered
  }
  const rms = Math.sqrt(sumSquares / len)
  const scaled = Math.min(1, rms * 3.5)
  if (scaled < LEVEL_NOISE_FLOOR) {
    return 0
  }
  return Math.round(scaled * 100) / 100
}

function haveSpeakingLevelsMeaningfullyChanged(
  prev: Record<string, number>,
  next: Record<string, number>,
): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) {
    return true
  }
  for (let i = 0; i < nextKeys.length; i += 1) {
    const key = nextKeys[i]
    const prevVal = prev[key]
    const nextVal = next[key]
    if (prevVal === undefined) {
      return true
    }
    if ((prevVal === 0) !== (nextVal === 0)) {
      return true
    }
    if (Math.abs(prevVal - nextVal) >= LEVEL_CHANGE_THRESHOLD) {
      return true
    }
  }
  return false
}

/**
 * Returns true when running in a browser environment that exposes
 * `window` and `RTCPeerConnection`. Safely returns false on React Native
 * iOS/Android and SSR/Node runtimes.
 */
export function isWebRtcAudioSupported(): boolean {
  const g = getGlobalScope()
  return (
    typeof g.window !== 'undefined' &&
    typeof g.RTCPeerConnection !== 'undefined'
  )
}

export class ZingSpaceAudioMesh {
  private readonly slug: string
  private readonly myDid: string
  private readonly myClientId: string
  private readonly callbacks: SpaceAudioCallbacks
  private readonly supported: boolean

  private canSpeak: boolean
  private started = false
  private destroyed = false

  private localStream: MinimalMediaStream | null = null
  private localAnalyser: AnalyserBinding | null = null
  private micAcquirePromise: Promise<boolean> | null = null

  private audioContext: MinimalAudioContext | null = null
  private levelTimer: ReturnType<typeof setInterval> | null = null

  private peers = new Map<string, PeerEntry>()

  private connectedPeers = 0
  private micActive = false
  private muted = true
  private audioBlocked = false
  private micError: string | null = null
  private speakingLevels: Record<string, number> = {}

  constructor(options: ZingSpaceAudioMeshOptions) {
    this.slug = options.slug
    this.myDid = options.myDid
    this.myClientId = options.myClientId
    this.canSpeak = options.canSpeak
    this.callbacks = options.callbacks
    this.supported = isWebRtcAudioSupported()
  }

  public getState(): SpaceAudioState {
    return {
      supported: this.supported,
      connectedPeers: this.connectedPeers,
      micActive: this.micActive,
      muted: this.muted,
      audioBlocked: this.audioBlocked,
      micError: this.micError,
      speakingLevels: {...this.speakingLevels},
    }
  }

  /**
   * Activates the WebRTC audio mesh, begins speaking-level metering,
   * and announces readiness to existing Space peers.
   * Listeners attach recvonly audio transceivers with zero mic permission prompts.
   */
  public async start(): Promise<void> {
    if (this.destroyed) {
      return
    }
    if (!this.supported) {
      this.emitState()
      return
    }
    if (this.started) {
      return
    }
    this.started = true
    this.startLevelMeter()
    this.emitState()

    await this.emitSignal({
      slug: this.slug,
      fromClientId: this.myClientId,
      signalType: 'peer-ready',
    })
  }

  /**
   * Acquires the user's microphone on explicit user gesture, attaches or
   * replaces the local audio track across all peers (renegotiating via
   * Perfect Negotiation), and starts local speaking-level metering.
   */
  public async enableMicrophone(): Promise<boolean> {
    if (this.destroyed) {
      return false
    }
    if (!this.supported) {
      this.micError = 'WebRTC voice audio is not supported in this browser.'
      this.emitState()
      return false
    }
    if (!this.canSpeak) {
      this.micError = 'Only hosts and speakers can enable the microphone.'
      this.emitState()
      return false
    }

    const existingTrack = this.getLiveLocalAudioTrack()
    if (existingTrack && this.localStream) {
      const tracks = this.localStream.getAudioTracks()
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].enabled = true
      }
      this.micActive = true
      this.muted = false
      this.micError = null
      this.attachLocalAnalyser(this.localStream)
      await this.attachLocalTrackToAllPeers(existingTrack, this.localStream)
      await this.resumeAudioContextBestEffort()
      this.emitState()
      return true
    }

    if (this.micAcquirePromise) {
      return this.micAcquirePromise
    }

    this.micAcquirePromise = this.acquireMicrophoneInternal()
    try {
      return await this.micAcquirePromise
    } finally {
      this.micAcquirePromise = null
    }
  }

  /**
   * Toggles microphone mute state. Unmuting when a speaker does not yet have
   * an active local stream acquires the microphone automatically.
   */
  public async setMuted(muted: boolean): Promise<void> {
    if (this.destroyed) {
      return
    }
    if (!muted) {
      if (!this.canSpeak) {
        if (!this.muted) {
          this.muted = true
          this.emitState()
        }
        return
      }
      const liveTrack = this.getLiveLocalAudioTrack()
      if (!liveTrack || !this.localStream) {
        await this.enableMicrophone()
        return
      }
      const tracks = this.localStream.getAudioTracks()
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].enabled = true
      }
      this.micActive = true
      this.muted = false
      this.micError = null
      await this.resumeAudioContextBestEffort()
      this.emitState()
      return
    }

    if (this.localStream) {
      const tracks = this.localStream.getAudioTracks()
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].enabled = false
      }
    }
    this.muted = true
    if (this.speakingLevels[this.myDid] !== undefined) {
      const nextLevels = {...this.speakingLevels}
      delete nextLevels[this.myDid]
      this.speakingLevels = nextLevels
    }
    this.emitState()
  }

  /**
   * Updates whether this user is permitted to speak. When demoted to listener,
   * immediately stops all local microphone tracks, removes audio senders from
   * all peer connections, and resets micActive/muted state.
   */
  public setCanSpeak(canSpeak: boolean): void {
    if (this.destroyed) {
      return
    }
    const prevCanSpeak = this.canSpeak
    this.canSpeak = canSpeak

    if (!canSpeak) {
      const hadMic = this.localStream !== null || this.micActive || !this.muted
      this.stopLocalStream()
      this.removeLocalTrackFromAllPeers()
      this.micActive = false
      this.muted = true
      this.micError = null
      if (this.speakingLevels[this.myDid] !== undefined) {
        const nextLevels = {...this.speakingLevels}
        delete nextLevels[this.myDid]
        this.speakingLevels = nextLevels
      }
      if (hadMic || prevCanSpeak !== canSpeak) {
        this.emitState()
      }
      return
    }

    if (
      prevCanSpeak !== canSpeak &&
      this.micError === 'Only hosts and speakers can enable the microphone.'
    ) {
      this.micError = null
      this.emitState()
    }
  }

  /**
   * Reconciles the mesh against an authoritative list of active Space peers.
   */
  public handlePeersSnapshot(peers: SpacePeerInfo[]): void {
    if (this.destroyed || !this.supported || !this.started) {
      return
    }
    const activeIds = new Set<string>()
    for (let i = 0; i < peers.length; i += 1) {
      const peer = peers[i]
      if (!peer || !peer.clientId || peer.clientId === this.myClientId) {
        continue
      }
      activeIds.add(peer.clientId)
      this.ensurePeerConnection(peer, false)
    }

    const existingIds = Array.from(this.peers.keys())
    for (let i = 0; i < existingIds.length; i += 1) {
      const id = existingIds[i]
      if (!activeIds.has(id)) {
        this.removePeer(id)
      }
    }
  }

  /**
   * Connects to a newly joined Space peer.
   */
  public handlePeerJoined(peer: SpacePeerInfo): void {
    if (this.destroyed || !this.supported || !this.started) {
      return
    }
    if (!peer || !peer.clientId || peer.clientId === this.myClientId) {
      return
    }
    this.ensurePeerConnection(peer, false)
  }

  /**
   * Tears down the connection, remote <audio> element, and analyser for a peer
   * that left the Space.
   */
  public handlePeerLeft(clientId: string): void {
    if (this.destroyed || !clientId || clientId === this.myClientId) {
      return
    }
    this.removePeer(clientId)
  }

  /**
   * Processes an incoming WebRTC signaling envelope from the Space signaling channel.
   */
  public handleSignal(envelope: SpaceSignalEnvelope): Promise<void> {
    if (this.destroyed || !this.supported || !this.started) {
      return Promise.resolve()
    }
    if (!envelope || !envelope.fromClientId) {
      return Promise.resolve()
    }
    if (envelope.slug && envelope.slug !== this.slug) {
      return Promise.resolve()
    }
    if (envelope.fromClientId === this.myClientId) {
      return Promise.resolve()
    }
    if (envelope.toClientId && envelope.toClientId !== this.myClientId) {
      return Promise.resolve()
    }
    if (
      !envelope.toClientId &&
      envelope.toDid &&
      envelope.toDid !== this.myDid
    ) {
      return Promise.resolve()
    }

    if (envelope.signalType === 'peer-leave') {
      this.removePeer(envelope.fromClientId)
      return Promise.resolve()
    }

    const peerInfo: SpacePeerInfo = {
      did: envelope.fromDid,
      handle: envelope.fromHandle,
      clientId: envelope.fromClientId,
    }

    if (envelope.signalType === 'peer-ready') {
      const existing = this.peers.get(peerInfo.clientId)
      if (existing) {
        existing.did = peerInfo.did || existing.did
        if (peerInfo.handle) {
          existing.handle = peerInfo.handle
        }
        const connState = existing.pc.connectionState
        if (connState === 'failed' || connState === 'closed') {
          this.removePeer(peerInfo.clientId)
          this.ensurePeerConnection(peerInfo, false)
        } else if (
          !this.isPeerConnected(existing.pc) &&
          existing.pc.signalingState === 'stable' &&
          !existing.pc.remoteDescription &&
          !existing.makingOffer
        ) {
          void this.negotiatePeer(existing)
        }
      } else {
        this.ensurePeerConnection(peerInfo, false)
      }
      return Promise.resolve()
    }

    const deferTransceiver =
      envelope.signalType === 'offer' ||
      envelope.signalType === 'ice-candidate'
    const peer = this.ensurePeerConnection(peerInfo, deferTransceiver)
    if (!peer) {
      return Promise.resolve()
    }

    peer.signalQueue = peer.signalQueue
      .then(() => this.processSignalForPeer(peer, envelope))
      .catch(() => {
        // Guarded inside processSignalForPeer; prevent unhandled rejections.
      })

    return peer.signalQueue
  }

  /**
   * Resumes the Web Audio AudioContext and retries playback on all attached
   * remote <audio> elements after a user gesture, clearing `audioBlocked`.
   */
  public async unlockAudio(): Promise<void> {
    if (this.destroyed || !this.supported) {
      return
    }
    await this.resumeAudioContextBestEffort()

    let stillBlocked = false
    const entries = Array.from(this.peers.values())
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (!entry.audioEl || entry.closed) {
        continue
      }
      try {
        await entry.audioEl.play()
      } catch {
        stillBlocked = true
      }
    }

    if (this.audioBlocked !== stillBlocked) {
      this.audioBlocked = stillBlocked
      this.emitState()
    }
  }

  /**
   * Stops all local media tracks, closes all peer connections, removes created
   * <audio> DOM elements, clears metering timers, closes AudioContext, and
   * emits a best-effort 'peer-leave' signal.
   */
  public destroy(): void {
    if (this.destroyed) {
      return
    }
    const wasStarted = this.started
    this.destroyed = true
    this.started = false

    if (this.levelTimer !== null) {
      clearInterval(this.levelTimer)
      this.levelTimer = null
    }

    this.stopLocalStream()

    const entries = Array.from(this.peers.values())
    for (let i = 0; i < entries.length; i += 1) {
      this.cleanupPeerEntry(entries[i])
    }
    this.peers.clear()

    if (this.audioContext) {
      const ctx = this.audioContext
      this.audioContext = null
      if (ctx.state !== 'closed') {
        try {
          void ctx.close().catch(() => {
            // Best-effort AudioContext cleanup.
          })
        } catch {
          // Ignore synchronous AudioContext close errors.
        }
      }
    }

    this.connectedPeers = 0
    this.micActive = false
    this.muted = true
    this.audioBlocked = false
    this.micError = null
    this.speakingLevels = {}

    try {
      this.emitState()
    } catch {
      // Ignore state listener errors during teardown.
    }

    if (wasStarted) {
      void this.emitSignal({
        slug: this.slug,
        fromClientId: this.myClientId,
        signalType: 'peer-leave',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Microphone acquisition & track management
  // -------------------------------------------------------------------------

  private async acquireMicrophoneInternal(): Promise<boolean> {
    const g = getGlobalScope()
    const getUserMedia = g.navigator?.mediaDevices?.getUserMedia
    if (typeof getUserMedia !== 'function') {
      this.micError = 'Microphone access is unavailable in this browser.'
      this.emitState()
      return false
    }

    let stream: MinimalMediaStream
    try {
      stream = await getUserMedia.call(g.navigator?.mediaDevices, {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch (err) {
      if (!this.destroyed) {
        this.micError = formatMicError(err)
        this.micActive = false
        this.muted = true
        this.emitState()
      }
      return false
    }

    // Abort cleanly if destroyed or demoted while permission prompt was open.
    if (this.destroyed || !this.canSpeak) {
      this.stopTracksOnStream(stream)
      return false
    }

    const audioTracks = stream.getAudioTracks()
    const primaryTrack = audioTracks[0] ?? null
    if (!primaryTrack) {
      this.stopTracksOnStream(stream)
      this.micError = 'No audio track was returned by the microphone.'
      this.micActive = false
      this.muted = true
      this.emitState()
      return false
    }

    for (let i = 0; i < audioTracks.length; i += 1) {
      audioTracks[i].enabled = true
    }

    primaryTrack.onended = () => {
      if (this.destroyed || this.localStream !== stream) {
        return
      }
      this.detachLocalAnalyser()
      this.localStream = null
      this.micActive = false
      this.muted = true
      this.removeLocalTrackFromAllPeers()
      if (this.speakingLevels[this.myDid] !== undefined) {
        const nextLevels = {...this.speakingLevels}
        delete nextLevels[this.myDid]
        this.speakingLevels = nextLevels
      }
      this.emitState()
    }

    this.localStream = stream
    this.micActive = true
    this.muted = false
    this.micError = null

    await this.resumeAudioContextBestEffort()
    this.attachLocalAnalyser(stream)
    await this.attachLocalTrackToAllPeers(primaryTrack, stream)
    this.emitState()
    return true
  }

  private getLiveLocalAudioTrack(): MinimalMediaStreamTrack | null {
    if (!this.localStream) {
      return null
    }
    const tracks = this.localStream.getAudioTracks()
    for (let i = 0; i < tracks.length; i += 1) {
      if (tracks[i].readyState !== 'ended') {
        return tracks[i]
      }
    }
    return null
  }

  private stopTracksOnStream(stream: MinimalMediaStream): void {
    const tracks = stream.getTracks()
    for (let i = 0; i < tracks.length; i += 1) {
      try {
        tracks[i].onended = null
        tracks[i].stop()
      } catch {
        // Ignore already-stopped tracks.
      }
    }
  }

  private stopLocalStream(): void {
    this.detachLocalAnalyser()
    if (!this.localStream) {
      return
    }
    const stream = this.localStream
    this.localStream = null
    this.stopTracksOnStream(stream)
  }

  private async attachLocalTrackToAllPeers(
    track: MinimalMediaStreamTrack,
    stream: MinimalMediaStream,
  ): Promise<void> {
    const entries = Array.from(this.peers.values())
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (entry.closed) {
        continue
      }
      await this.attachLocalTrackToPeer(entry, track, stream, true)
    }
  }

  private findAudioTransceiver(
    pc: MinimalRTCPeerConnection,
  ): MinimalRTCRtpTransceiver | null {
    if (typeof pc.getTransceivers !== 'function') {
      return null
    }
    const transceivers = pc.getTransceivers()
    for (let i = 0; i < transceivers.length; i += 1) {
      const t = transceivers[i]
      if (t.direction === 'stopped') {
        continue
      }
      if (
        t.receiver.track?.kind === 'audio' ||
        t.sender.track?.kind === 'audio'
      ) {
        return t
      }
    }
    return null
  }

  private async attachLocalTrackToPeer(
    peer: PeerEntry,
    track: MinimalMediaStreamTrack,
    stream: MinimalMediaStream,
    allowTriggerNegotiation: boolean,
  ): Promise<void> {
    if (peer.closed || this.destroyed) {
      return
    }
    const pc = peer.pc
    try {
      const transceiver = this.findAudioTransceiver(pc)
      if (transceiver) {
        const prevDirection = transceiver.direction
        await transceiver.sender.replaceTrack(track)
        if (typeof transceiver.sender.setStreams === 'function') {
          try {
            transceiver.sender.setStreams(stream)
          } catch {
            // Optional Unified Plan helper; receiver falls back to track wrapper.
          }
        }
        peer.audioSender = transceiver.sender
        if (prevDirection !== 'sendrecv') {
          transceiver.direction = 'sendrecv'
          if (allowTriggerNegotiation) {
            void this.negotiatePeer(peer)
          }
        }
        return
      }

      if (peer.audioSender) {
        await peer.audioSender.replaceTrack(track)
        return
      }

      peer.audioSender = pc.addTrack(track, stream)
    } catch {
      // Ignore transient track-attach failures on closing peer connections.
    }
  }

  private removeLocalTrackFromAllPeers(): void {
    const entries = Array.from(this.peers.values())
    for (let i = 0; i < entries.length; i += 1) {
      const peer = entries[i]
      if (peer.closed) {
        continue
      }
      const pc = peer.pc
      try {
        const senders = pc.getSenders()
        for (let j = 0; j < senders.length; j += 1) {
          const sender = senders[j]
          if (
            sender === peer.audioSender ||
            sender.track?.kind === 'audio'
          ) {
            try {
              pc.removeTrack(sender)
            } catch {
              // Ignore if sender was already detached.
            }
          }
        }
        peer.audioSender = null

        const transceiver = this.findAudioTransceiver(pc)
        if (
          transceiver &&
          transceiver.direction !== 'recvonly' &&
          transceiver.direction !== 'stopped'
        ) {
          transceiver.direction = 'recvonly'
        }
      } catch {
        // Ignore cleanup errors on closing connections.
      }
    }
  }

  // -------------------------------------------------------------------------
  // PeerConnection lifecycle & Perfect Negotiation
  // -------------------------------------------------------------------------

  private ensurePeerConnection(
    peerInfo: SpacePeerInfo,
    deferTransceiver: boolean,
  ): PeerEntry | null {
    const existing = this.peers.get(peerInfo.clientId)
    if (existing) {
      existing.did = peerInfo.did || existing.did
      if (peerInfo.handle) {
        existing.handle = peerInfo.handle
      }
      return existing
    }

    const g = getGlobalScope()
    const RTCPeerConnectionCtor = g.RTCPeerConnection
    if (typeof RTCPeerConnectionCtor !== 'function') {
      return null
    }

    const pc = new RTCPeerConnectionCtor({iceServers: ICE_SERVERS})
    const isPolite = this.myClientId < peerInfo.clientId

    const entry: PeerEntry = {
      did: peerInfo.did,
      handle: peerInfo.handle,
      clientId: peerInfo.clientId,
      pc,
      isPolite,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      needsRenegotiation: false,
      pendingCandidates: [],
      signalQueue: Promise.resolve(),
      audioSender: null,
      remoteStream: null,
      audioEl: null,
      analyser: null,
      lastIceRestartAt: 0,
      closed: false,
    }

    this.peers.set(peerInfo.clientId, entry)

    pc.onnegotiationneeded = () => {
      if (entry.closed || this.destroyed) {
        return
      }
      void this.negotiatePeer(entry)
    }

    pc.onicecandidate = event => {
      if (entry.closed || this.destroyed || !event.candidate) {
        return
      }
      void this.emitSignal({
        slug: this.slug,
        fromClientId: this.myClientId,
        toDid: entry.did,
        toClientId: entry.clientId,
        signalType: 'ice-candidate',
        candidate: serializeIceCandidate(event.candidate),
      })
    }

    pc.ontrack = event => {
      if (entry.closed || this.destroyed) {
        return
      }
      this.handleRemoteTrack(entry, event)
    }

    pc.onconnectionstatechange = () => {
      if (entry.closed || this.destroyed) {
        return
      }
      this.handlePeerConnectionStateChange(entry)
    }

    pc.oniceconnectionstatechange = () => {
      if (entry.closed || this.destroyed) {
        return
      }
      this.handlePeerConnectionStateChange(entry)
    }

    if (!deferTransceiver) {
      const liveTrack = this.getLiveLocalAudioTrack()
      if (liveTrack && this.localStream) {
        try {
          entry.audioSender = pc.addTrack(liveTrack, this.localStream)
        } catch {
          // Fallback to recvonly transceiver if adding track failed.
          this.addRecvOnlyTransceiver(pc)
        }
      } else {
        this.addRecvOnlyTransceiver(pc)
      }
    }

    return entry
  }

  private addRecvOnlyTransceiver(pc: MinimalRTCPeerConnection): void {
    try {
      pc.addTransceiver('audio', {direction: 'recvonly'})
    } catch {
      // Ignore if environment does not support addTransceiver.
    }
  }

  private async negotiatePeer(
    peer: PeerEntry,
    options?: {iceRestart?: boolean},
  ): Promise<void> {
    if (peer.closed || this.destroyed) {
      return
    }
    const pc = peer.pc
    if (peer.makingOffer || pc.signalingState !== 'stable') {
      peer.needsRenegotiation = true
      return
    }

    peer.makingOffer = true
    peer.needsRenegotiation = false
    try {
      const offer = await pc.createOffer(options)
      if (peer.closed || this.destroyed || pc.signalingState !== 'stable') {
        return
      }
      await pc.setLocalDescription(offer)
      const localDesc = pc.localDescription
      if (
        localDesc &&
        localDesc.sdp &&
        (localDesc.type === 'offer' || localDesc.type === 'answer')
      ) {
        await this.emitSignal({
          slug: this.slug,
          fromClientId: this.myClientId,
          toDid: peer.did,
          toClientId: peer.clientId,
          signalType: 'offer',
          sdp: {type: localDesc.type, sdp: localDesc.sdp},
        })
      }
    } catch {
      // Transient glare/state errors are recovered automatically by Perfect Negotiation.
    } finally {
      peer.makingOffer = false
      if (
        peer.needsRenegotiation &&
        !peer.closed &&
        !this.destroyed &&
        pc.signalingState === 'stable'
      ) {
        peer.needsRenegotiation = false
        void this.negotiatePeer(peer)
      }
    }
  }

  private async processSignalForPeer(
    peer: PeerEntry,
    envelope: SpaceSignalEnvelope,
  ): Promise<void> {
    if (peer.closed || this.destroyed) {
      return
    }
    const pc = peer.pc

    if (
      envelope.signalType === 'offer' ||
      envelope.signalType === 'answer'
    ) {
      const sdp = envelope.sdp
      if (!sdp || !sdp.sdp || (sdp.type !== 'offer' && sdp.type !== 'answer')) {
        return
      }

      const isOffer = sdp.type === 'offer'
      const readyForOffer =
        !peer.makingOffer &&
        (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending)
      const offerCollision = isOffer && !readyForOffer

      peer.ignoreOffer = !peer.isPolite && offerCollision
      if (peer.ignoreOffer) {
        return
      }

      try {
        if (isOffer && pc.signalingState !== 'stable') {
          await pc.setLocalDescription({type: 'rollback'})
        }

        peer.isSettingRemoteAnswerPending = sdp.type === 'answer'
        try {
          await pc.setRemoteDescription({type: sdp.type, sdp: sdp.sdp})
        } finally {
          peer.isSettingRemoteAnswerPending = false
        }

        await this.flushPendingCandidates(peer)

        if (isOffer) {
          const liveTrack = this.getLiveLocalAudioTrack()
          if (liveTrack && this.localStream) {
            await this.attachLocalTrackToPeer(
              peer,
              liveTrack,
              this.localStream,
              false,
            )
          }
          if (peer.closed || this.destroyed) {
            return
          }
          const answer = await pc.createAnswer()
          if (peer.closed || this.destroyed) {
            return
          }
          await pc.setLocalDescription(answer)
          const localDesc = pc.localDescription
          if (localDesc && localDesc.sdp && localDesc.type === 'answer') {
            await this.emitSignal({
              slug: this.slug,
              fromClientId: this.myClientId,
              toDid: peer.did,
              toClientId: peer.clientId,
              signalType: 'answer',
              sdp: {type: 'answer', sdp: localDesc.sdp},
            })
          }
        }
      } catch {
        // Guard against race conditions if the peer closes mid-handshake.
      }

      if (
        peer.needsRenegotiation &&
        !peer.closed &&
        !this.destroyed &&
        pc.signalingState === 'stable'
      ) {
        peer.needsRenegotiation = false
        void this.negotiatePeer(peer)
      }
      return
    }

    if (envelope.signalType === 'ice-candidate') {
      const candidate = envelope.candidate
      if (!candidate || typeof candidate !== 'object') {
        return
      }
      const candidateInit = candidate as MinimalIceCandidateInit
      if (!pc.remoteDescription) {
        if (peer.pendingCandidates.length < MAX_PENDING_CANDIDATES) {
          peer.pendingCandidates.push(candidateInit)
        }
        return
      }
      try {
        await pc.addIceCandidate(candidateInit)
      } catch {
        // Ignore stale candidates from rolled-back/ignored offers.
      }
    }
  }

  private async flushPendingCandidates(peer: PeerEntry): Promise<void> {
    if (peer.closed || this.destroyed || !peer.pc.remoteDescription) {
      return
    }
    if (peer.pendingCandidates.length === 0) {
      return
    }
    const buffered = peer.pendingCandidates.splice(
      0,
      peer.pendingCandidates.length,
    )
    for (let i = 0; i < buffered.length; i += 1) {
      if (peer.closed || this.destroyed) {
        return
      }
      try {
        await peer.pc.addIceCandidate(buffered[i])
      } catch {
        // Ignore individual invalid/stale candidates during flush.
      }
    }
  }

  private isPeerConnected(pc: MinimalRTCPeerConnection): boolean {
    const connState = pc.connectionState
    if (connState === 'connected') {
      return true
    }
    if (
      connState === 'failed' ||
      connState === 'closed' ||
      connState === 'disconnected'
    ) {
      return false
    }
    return (
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    )
  }

  private handlePeerConnectionStateChange(peer: PeerEntry): void {
    const pc = peer.pc
    const connState = pc.connectionState
    const iceState = pc.iceConnectionState

    if (connState === 'closed') {
      this.removePeer(peer.clientId)
      return
    }

    if (
      (connState === 'failed' || iceState === 'failed') &&
      !peer.isPolite &&
      !peer.makingOffer
    ) {
      const now = Date.now()
      if (now - peer.lastIceRestartAt >= ICE_RESTART_COOLDOWN_MS) {
        peer.lastIceRestartAt = now
        void this.negotiatePeer(peer, {iceRestart: true})
      }
    }

    this.recomputeConnectedPeers()
  }

  private recomputeConnectedPeers(): void {
    let count = 0
    this.peers.forEach(entry => {
      if (!entry.closed && this.isPeerConnected(entry.pc)) {
        count += 1
      }
    })
    if (count !== this.connectedPeers) {
      this.connectedPeers = count
      this.emitState()
    }
  }

  private removePeer(clientId: string): void {
    const entry = this.peers.get(clientId)
    if (!entry) {
      return
    }
    this.peers.delete(clientId)
    const removedDid = entry.did
    this.cleanupPeerEntry(entry)

    let changed = false
    let nextConnected = 0
    this.peers.forEach(p => {
      if (!p.closed && this.isPeerConnected(p.pc)) {
        nextConnected += 1
      }
    })
    if (nextConnected !== this.connectedPeers) {
      this.connectedPeers = nextConnected
      changed = true
    }

    if (
      removedDid &&
      removedDid !== this.myDid &&
      this.speakingLevels[removedDid] !== undefined
    ) {
      let stillHasDid = false
      this.peers.forEach(p => {
        if (p.did === removedDid) {
          stillHasDid = true
        }
      })
      if (!stillHasDid) {
        const nextLevels = {...this.speakingLevels}
        delete nextLevels[removedDid]
        this.speakingLevels = nextLevels
        changed = true
      }
    }

    if (changed) {
      this.emitState()
    }
  }

  private cleanupPeerEntry(entry: PeerEntry): void {
    entry.closed = true
    entry.pendingCandidates.length = 0
    entry.audioSender = null
    entry.remoteStream = null

    if (entry.analyser) {
      this.disconnectAnalyserBinding(entry.analyser)
      entry.analyser = null
    }

    if (entry.audioEl) {
      const el = entry.audioEl
      entry.audioEl = null
      try {
        el.pause()
      } catch {
        // Ignore pause errors during cleanup.
      }
      try {
        el.srcObject = null
      } catch {
        // Ignore srcObject reset errors.
      }
      try {
        if (typeof el.remove === 'function') {
          el.remove()
        } else if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      } catch {
        // Ignore DOM removal errors.
      }
    }

    const pc = entry.pc
    pc.onnegotiationneeded = null
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.oniceconnectionstatechange = null
    try {
      pc.close()
    } catch {
      // Ignore already-closed peer connections.
    }
  }

  // -------------------------------------------------------------------------
  // Remote audio playback & Web Audio API speaking-level analysers
  // -------------------------------------------------------------------------

  private handleRemoteTrack(
    peer: PeerEntry,
    event: MinimalRTCTrackEvent,
  ): void {
    if (!event.track || event.track.kind !== 'audio') {
      return
    }

    const g = getGlobalScope()
    let stream: MinimalMediaStream | null =
      event.streams && event.streams.length > 0 ? event.streams[0] : null
    if (!stream && typeof g.MediaStream === 'function') {
      try {
        stream = new g.MediaStream([event.track])
      } catch {
        stream = null
      }
    }
    if (!stream) {
      return
    }

    peer.remoteStream = stream
    this.attachRemoteAudioElement(peer, stream)
    this.attachRemoteAnalyser(peer, stream)
  }

  private attachRemoteAudioElement(
    peer: PeerEntry,
    stream: MinimalMediaStream,
  ): void {
    const g = getGlobalScope()
    const doc = g.document
    if (!doc || typeof doc.createElement !== 'function') {
      return
    }

    let audioEl = peer.audioEl
    if (!audioEl) {
      audioEl = doc.createElement('audio')
      audioEl.autoplay = true
      audioEl.playsInline = true
      audioEl.setAttribute('autoplay', '')
      audioEl.setAttribute('playsinline', '')
      audioEl.setAttribute('data-quantzing-space-peer', peer.clientId)
      audioEl.style.display = 'none'
      if (doc.body && typeof doc.body.appendChild === 'function') {
        doc.body.appendChild(audioEl)
      }
      peer.audioEl = audioEl
    }

    audioEl.srcObject = stream

    try {
      const playPromise = audioEl.play()
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          if (!this.destroyed && !peer.closed && !this.audioBlocked) {
            this.audioBlocked = true
            this.emitState()
          }
        })
      }
    } catch {
      if (!this.destroyed && !peer.closed && !this.audioBlocked) {
        this.audioBlocked = true
        this.emitState()
      }
    }
  }

  private ensureAudioContext(): MinimalAudioContext | null {
    if (this.destroyed) {
      return null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return this.audioContext
    }
    const g = getGlobalScope()
    const AudioContextCtor = g.AudioContext ?? g.webkitAudioContext
    if (typeof AudioContextCtor !== 'function') {
      return null
    }
    try {
      this.audioContext = new AudioContextCtor()
      return this.audioContext
    } catch {
      return null
    }
  }

  private async resumeAudioContextBestEffort(): Promise<void> {
    const ctx = this.ensureAudioContext()
    if (!ctx || ctx.state !== 'suspended') {
      return
    }
    try {
      await ctx.resume()
    } catch {
      // Autoplay policies may keep AudioContext suspended until a user gesture.
    }
  }

  private createAnalyserBinding(
    stream: MinimalMediaStream,
  ): AnalyserBinding | null {
    const ctx = this.ensureAudioContext()
    if (!ctx) {
      return null
    }
    try {
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      return {
        source,
        analyser,
        buffer: new Uint8Array(analyser.fftSize),
      }
    } catch {
      return null
    }
  }

  private disconnectAnalyserBinding(binding: AnalyserBinding): void {
    try {
      binding.source.disconnect()
    } catch {
      // Ignore disconnect errors on torn-down audio nodes.
    }
    try {
      binding.analyser.disconnect()
    } catch {
      // Ignore disconnect errors on torn-down audio nodes.
    }
  }

  private attachLocalAnalyser(stream: MinimalMediaStream): void {
    this.detachLocalAnalyser()
    this.localAnalyser = this.createAnalyserBinding(stream)
  }

  private detachLocalAnalyser(): void {
    if (!this.localAnalyser) {
      return
    }
    this.disconnectAnalyserBinding(this.localAnalyser)
    this.localAnalyser = null
  }

  private attachRemoteAnalyser(
    peer: PeerEntry,
    stream: MinimalMediaStream,
  ): void {
    if (peer.analyser) {
      this.disconnectAnalyserBinding(peer.analyser)
      peer.analyser = null
    }
    peer.analyser = this.createAnalyserBinding(stream)
  }

  private startLevelMeter(): void {
    if (this.levelTimer !== null) {
      return
    }
    this.levelTimer = setInterval(() => {
      this.sampleSpeakingLevels()
    }, LEVEL_SAMPLE_INTERVAL_MS)
  }

  private sampleSpeakingLevels(): void {
    if (this.destroyed || !this.started) {
      return
    }

    const nextLevels: Record<string, number> = {}

    if (this.micActive && !this.muted && this.localAnalyser) {
      const localLevel = computeAnalyserLevel(this.localAnalyser)
      if (localLevel > 0) {
        nextLevels[this.myDid] = localLevel
      }
    }

    this.peers.forEach(entry => {
      if (entry.closed || !entry.analyser || !entry.did) {
        return
      }
      const level = computeAnalyserLevel(entry.analyser)
      if (level > 0) {
        const existing = nextLevels[entry.did] ?? 0
        if (level > existing) {
          nextLevels[entry.did] = level
        }
      }
    })

    if (haveSpeakingLevelsMeaningfullyChanged(this.speakingLevels, nextLevels)) {
      this.speakingLevels = nextLevels
      this.emitState()
    }
  }

  // -------------------------------------------------------------------------
  // Signaling & state emission helpers
  // -------------------------------------------------------------------------

  private async emitSignal(
    payload: Omit<
      SpaceSignalEnvelope,
      'fromDid' | 'fromHandle' | 'seq' | 'createdAt'
    >,
  ): Promise<void> {
    try {
      await this.callbacks.sendSignal(payload)
    } catch {
      // Signaling transport errors are handled by caller/SSE reconnect loop.
    }
  }

  private emitState(): void {
    this.callbacks.onStateChange(this.getState())
  }
}
