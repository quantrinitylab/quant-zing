import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import {AtUri} from '@atproto/syntax'
import {useNavigation} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  createZingSpace,
  deleteZingSpace,
  fetchZingSpace,
  fetchZingSpaces,
  getQuantZingColors,
  getSpaceEventsUrl,
  joinZingSpace,
  leaveZingSpace,
  pollSpaceSignals,
  type QuantySourceCitation,
  type QuantZingSpace,
  type QuantZingSpaceReactionKind,
  requestSpaceEventsTicket,
  searchLiveZings,
  sendSpaceReaction,
  sendSpaceSignal,
  setSpaceHand,
  setSpaceMute,
  stripEmojisAndSymbols,
  updateZingSpace,
} from '#/lib/quantos/client'
import {
  isWebRtcAudioSupported,
  type SpaceAudioState,
  ZingSpaceAudioMesh,
} from '#/lib/quantos/spaceAudioWebRtc'
import {type NavigationProp} from '#/lib/routes/types'
import {useRequireAuth, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Celebrate_Stroke2_Corner0_Rounded as CelebrateIcon} from '#/components/icons/Celebrate'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Flame_Stroke2_Corner1_Rounded as FlameIcon} from '#/components/icons/Flame'
import {Heart2_Filled_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import {Mute_Stroke2_Corner0_Rounded as MuteIcon} from '#/components/icons/Mute'
import {PaperPlane_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/PaperPlane'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {RaisingHand4Finger_Stroke2_Corner2_Rounded as HandIcon} from '#/components/icons/RaisingHand'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/SpeakerVolumeFull'
import {StreamingLive_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/StreamingLive'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const SUGGESTED_TOPICS = [
  'AI & Agents',
  'Technology',
  'Politics',
  'Soccer',
  'Art',
  'Movies & TV',
  'Markets',
  'Music',
  'Gaming',
  'Build in Public',
]

const SCHEDULE_PRESETS: Array<{label: string; offsetMinutes: number}> = [
  {label: '+30m', offsetMinutes: 30},
  {label: '+1h', offsetMinutes: 60},
  {label: '+3h', offsetMinutes: 180},
  {label: '+24h', offsetMinutes: 1440},
]

const REACTIONS: Array<{
  kind: QuantZingSpaceReactionKind
  symbol: string
  label: string
}> = [
  {kind: 'applause', symbol: 'APPLAUSE', label: 'Applause'},
  {kind: 'fire', symbol: 'FIRE', label: 'Fire'},
  {kind: 'insight', symbol: 'INSIGHT', label: 'Insight'},
  {kind: 'heart', symbol: 'HEART', label: 'Heart'},
  {kind: 'wave', symbol: 'WAVE', label: 'Wave'},
]

const REACTION_LABEL_MAP: Record<QuantZingSpaceReactionKind, string> = {
  applause: 'APPLAUSE',
  fire: 'FIRE',
  insight: 'INSIGHT',
  heart: 'HEART',
  wave: 'WAVE',
}

function getErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatScheduledTime(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ZingSpacesScreen() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const navigation = useNavigation<NavigationProp>()
  const {hasSession, currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()

  const accessJwt = currentAccount?.accessJwt
  const viewerDid = currentAccount?.did

  // Creator modal state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createMode, setCreateMode] = useState<'live' | 'scheduled'>('live')
  const [recordSpace, setRecordSpace] = useState(false)
  const [showReactionsTray, setShowReactionsTray] = useState(false)
  const [title, setTitle] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Technology'])
  const [scheduleOffsetMin, setScheduleOffsetMin] = useState<number>(60)
  const [isCreating, setIsCreating] = useState(false)

  // Persisted spaces from Sovereign PDS
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'live' | 'scheduled' | 'ended'
  >('all')
  const [spaces, setSpaces] = useState<QuantZingSpace[]>([])
  const [loadingSpaces, setLoadingSpaces] = useState(true)
  const [activeSpaceSlug, setActiveSpaceSlug] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  const clientIdRef = useRef<string>(
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `cl_${globalThis.crypto.randomUUID()}`
      : `cl_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
  )
  const meshRef = useRef<ZingSpaceAudioMesh | null>(null)
  const [audioState, setAudioState] = useState<SpaceAudioState>({
    supported: isWebRtcAudioSupported(),
    connectedPeers: 0,
    micActive: false,
    muted: true,
    audioBlocked: false,
    micError: null,
    speakingLevels: {},
  })

  // Live #spaces / #live feed post discovery
  const [discoveryPosts, setDiscoveryPosts] = useState<QuantySourceCitation[]>(
    [],
  )
  const [loadingDiscovery, setLoadingDiscovery] = useState(true)

  const upsertSpaceInState = useCallback((updated: QuantZingSpace) => {
    if (!updated?.slug) return
    setSpaces(prev => {
      const idx = prev.findIndex(
        s => s.slug === updated.slug || s.id === updated.id,
      )
      if (idx === -1) {
        return [updated, ...prev]
      }
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  const loadSpacesList = useCallback(
    async (filter: 'all' | 'live' | 'scheduled' | 'ended' = statusFilter) => {
      setLoadingSpaces(true)
      try {
        const fetched = await fetchZingSpaces(filter, accessJwt)
        setSpaces(fetched)
        setActiveSpaceSlug(prev =>
          prev && fetched.some(s => s.slug === prev) ? prev : null,
        )
      } catch (err: unknown) {
        Toast.show(getErrMsg(err, 'Unable to load ZingSpaces right now'), {
          type: 'warning',
        })
      } finally {
        setLoadingSpaces(false)
      }
    },
    [accessJwt, statusFilter],
  )

  useEffect(() => {
    void loadSpacesList(statusFilter)
  }, [loadSpacesList, statusFilter])

  const activeSpace = useMemo(
    () => spaces.find(s => s.slug === activeSpaceSlug) || null,
    [activeSpaceSlug, spaces],
  )

  const viewerParticipant = useMemo(
    () => activeSpace?.participants.find(p => p.did === viewerDid) || null,
    [activeSpace, viewerDid],
  )
  const isViewerHost = Boolean(
    activeSpace && viewerDid && activeSpace.hostDid === viewerDid,
  )
  const canViewerSpeak = Boolean(
    isViewerHost || viewerParticipant?.role === 'speaker',
  )
  const isViewerServerMuted = Boolean(viewerParticipant?.muted)
  const viewerHandRaised = Boolean(viewerParticipant?.handRaised)
  const canViewerSpeakRef = useRef(canViewerSpeak)
  canViewerSpeakRef.current = canViewerSpeak

  // Sync canSpeak permission to WebRTC audio mesh without recreating the mesh
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.setCanSpeak(canViewerSpeak)
    }
  }, [canViewerSpeak])

  // Enforce host-muted state locally on speaker microphone
  useEffect(() => {
    if (meshRef.current && isViewerServerMuted) {
      void meshRef.current.setMuted(true)
    }
  }, [isViewerServerMuted])

  // Enforce server-authoritative remote audio playback allowlist (only unmuted hosts/speakers)
  useEffect(() => {
    if (!meshRef.current || !activeSpace) return
    const allowed = activeSpace.participants
      .filter(p => (p.role === 'host' || p.role === 'speaker') && !p.muted)
      .map(p => p.did)
    meshRef.current.setAllowedAudioDids(allowed)
  }, [activeSpace])

  // Real server startedAt elapsed timer
  useEffect(() => {
    if (!activeSpace || activeSpace.status !== 'live') {
      setElapsedSec(0)
      return
    }
    const computeFromServerStart = () => {
      const startedMs = new Date(activeSpace.startedAt).getTime()
      if (!Number.isFinite(startedMs)) {
        setElapsedSec(0)
        return
      }
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)))
    }
    computeFromServerStart()
    const timer = setInterval(computeFromServerStart, 1000)
    return () => clearInterval(timer)
  }, [activeSpace])

  // Real-time SSE stream on web + polling fallback + WebRTC Audio Mesh for active space
  useEffect(() => {
    if (!activeSpaceSlug) {
      if (meshRef.current) {
        meshRef.current.destroy()
        meshRef.current = null
      }
      return
    }

    const mesh = new ZingSpaceAudioMesh({
      slug: activeSpaceSlug,
      myDid: viewerDid || `guest_${clientIdRef.current}`,
      myClientId: clientIdRef.current,
      canSpeak: canViewerSpeakRef.current,
      callbacks: {
        sendSignal: async payload => {
          if (!accessJwt) return
          await sendSpaceSignal(activeSpaceSlug, payload, accessJwt).catch(
            () => {},
          )
        },
        onStateChange: state => {
          setAudioState(state)
        },
      },
    })
    meshRef.current = mesh
    void mesh.start()

    let cancelled = false
    let eventSource: EventSource | null = null
    let pollSeq = 0
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const startPollingFallback = () => {
      if (pollTimer || cancelled) return
      pollTimer = setInterval(() => {
        void (async () => {
          try {
            const res = await pollSpaceSignals(
              activeSpaceSlug,
              clientIdRef.current,
              pollSeq,
              accessJwt,
            )
            if (!cancelled && res?.ok && Array.isArray(res.signals)) {
              pollSeq = res.nextSeq || pollSeq
              for (const sig of res.signals) {
                void mesh.handleSignal(
                  sig as unknown as Parameters<
                    ZingSpaceAudioMesh['handleSignal']
                  >[0],
                )
              }
            }
          } catch {}
        })()
      }, 2000)
    }

    const connectSse = async () => {
      if (!IS_WEB || typeof EventSource === 'undefined') {
        startPollingFallback()
        return
      }
      try {
        const ticket = accessJwt
          ? await requestSpaceEventsTicket(
              activeSpaceSlug,
              clientIdRef.current,
              accessJwt,
            )
          : null
        if (cancelled) return
        const sseUrl = getSpaceEventsUrl(activeSpaceSlug, {
          clientId: clientIdRef.current,
          ticket: ticket || undefined,
        })
        eventSource = new EventSource(sseUrl)
        eventSource.addEventListener('space_update', (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as {
              space?: QuantZingSpace
            } & Partial<QuantZingSpace>
            const room = parsed?.space || parsed
            if (room && typeof room.slug === 'string') {
              upsertSpaceInState(room as QuantZingSpace)
            }
          } catch {}
        })
        eventSource.addEventListener('space_peers', (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as {
              peers?: Parameters<ZingSpaceAudioMesh['handlePeersSnapshot']>[0]
            }
            if (Array.isArray(parsed?.peers)) {
              mesh.handlePeersSnapshot(parsed.peers)
            }
          } catch {}
        })
        eventSource.addEventListener('peer_joined', (ev: MessageEvent) => {
          try {
            const peer = JSON.parse(String(ev.data)) as Parameters<
              ZingSpaceAudioMesh['handlePeerJoined']
            >[0]
            if (peer && peer.clientId) {
              mesh.handlePeerJoined(peer)
            }
          } catch {}
        })
        eventSource.addEventListener('peer_left', (ev: MessageEvent) => {
          try {
            const data = JSON.parse(String(ev.data)) as {clientId?: string}
            if (data?.clientId) {
              mesh.handlePeerLeft(data.clientId)
            }
          } catch {}
        })
        eventSource.addEventListener('space_signal', (ev: MessageEvent) => {
          try {
            const signal = JSON.parse(String(ev.data)) as Parameters<
              ZingSpaceAudioMesh['handleSignal']
            >[0]
            if (signal) {
              void mesh.handleSignal(signal)
            }
          } catch {}
        })
        eventSource.onmessage = (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as {
              space?: QuantZingSpace
            } & Partial<QuantZingSpace>
            const room = parsed?.space || parsed
            if (room && typeof room.slug === 'string') {
              upsertSpaceInState(room as QuantZingSpace)
            }
          } catch {}
        }
      } catch {
        eventSource = null
        startPollingFallback()
      }
    }

    void connectSse()

    const pollInterval = setInterval(() => {
      fetchZingSpace(activeSpaceSlug, accessJwt)
        .then(fresh => {
          if (!cancelled && fresh) {
            upsertSpaceInState(fresh)
          }
        })
        .catch(() => {})
    }, 5000)

    return () => {
      cancelled = true
      if (eventSource) {
        try {
          eventSource.close()
        } catch {}
      }
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      clearInterval(pollInterval)
      mesh.destroy()
      if (meshRef.current === mesh) {
        meshRef.current = null
      }
    }
  }, [accessJwt, activeSpaceSlug, upsertSpaceInState, viewerDid])

  const handleToggleMic = useCallback(async () => {
    if (!meshRef.current || !activeSpace) return
    if (isViewerServerMuted && !isViewerHost) {
      Toast.show('You have been muted by the Space host', {type: 'warning'})
      await meshRef.current.setMuted(true)
      return
    }
    const nextMuted = !audioState.muted
    await meshRef.current.setMuted(nextMuted)
    if (accessJwt) {
      void setSpaceMute(activeSpace.slug, nextMuted, accessJwt).catch(() => {})
    }
  }, [
    accessJwt,
    activeSpace,
    audioState.muted,
    isViewerHost,
    isViewerServerMuted,
  ])

  const handleResumeAudio = useCallback(async () => {
    if (meshRef.current) {
      await meshRef.current.unlockAudio()
    }
  }, [])

  const loadLiveDiscovery = useCallback(async () => {
    setLoadingDiscovery(true)
    try {
      const [primary, secondary] = await Promise.all([
        searchLiveZings('#spaces', 5, 'latest'),
        searchLiveZings('#live', 5, 'latest'),
      ])
      const seen = new Set<string>()
      const merged: QuantySourceCitation[] = []
      for (const item of [...primary, ...secondary]) {
        if (!seen.has(item.uri)) {
          seen.add(item.uri)
          merged.push(item)
        }
      }
      setDiscoveryPosts(merged.slice(0, 8))
    } finally {
      setLoadingDiscovery(false)
    }
  }, [])

  useEffect(() => {
    void loadLiveDiscovery()
  }, [loadLiveDiscovery])

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics(prev => {
      if (prev.includes(topic)) {
        return prev.length > 1 ? prev.filter(tItem => tItem !== topic) : prev
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), topic]
      }
      return [...prev, topic]
    })
  }, [])

  const handleCreateSpace = useCallback(
    (status: 'live' | 'scheduled') => {
      const cleanTitle = title.trim()
      if (!cleanTitle) {
        Toast.show('Give your ZingSpace a title first', {type: 'warning'})
        return
      }
      requireAuth(async () => {
        if (!accessJwt || isCreating) return
        setIsCreating(true)
        try {
          const scheduledFor =
            status === 'scheduled'
              ? new Date(
                  Date.now() + scheduleOffsetMin * 60 * 1000,
                ).toISOString()
              : undefined
          const created = await createZingSpace(
            {
              title: cleanTitle,
              topic: selectedTopics.join(' · '),
              status,
              scheduledFor,
            },
            accessJwt,
          )
          upsertSpaceInState(created)
          setTitle('')
          setShowCreateForm(false)
          if (created.status === 'live') {
            setActiveSpaceSlug(created.slug)
            Toast.show('ZingSpace is now live', {
              type: 'success',
            })
          } else {
            Toast.show('ZingSpace scheduled', {
              type: 'success',
            })
          }
        } catch (err: unknown) {
          Toast.show(getErrMsg(err, 'Failed to create ZingSpace'), {
            type: 'warning',
          })
        } finally {
          setIsCreating(false)
        }
      })
    },
    [
      accessJwt,
      isCreating,
      requireAuth,
      scheduleOffsetMin,
      selectedTopics,
      title,
      upsertSpaceInState,
    ],
  )

  const handleEndSpace = useCallback(() => {
    if (!activeSpace) return
    requireAuth(async () => {
      if (!accessJwt || actionBusy) return
      setActionBusy(true)
      try {
        const updated = await updateZingSpace(
          activeSpace.slug,
          {status: 'ended'},
          accessJwt,
        )
        upsertSpaceInState(updated)
        setActiveSpaceSlug(null)
        Toast.show('ZingSpace ended', {type: 'info'})
      } catch (err: unknown) {
        Toast.show(getErrMsg(err, 'Unable to end ZingSpace'), {
          type: 'warning',
        })
      } finally {
        setActionBusy(false)
      }
    })
  }, [accessJwt, actionBusy, activeSpace, requireAuth, upsertSpaceInState])

  const handleJoinOrOpenSpace = useCallback(
    (space: QuantZingSpace) => {
      const isHost = Boolean(viewerDid && space.hostDid === viewerDid)
      if (space.status === 'scheduled' && isHost) {
        requireAuth(async () => {
          if (!accessJwt) return
          try {
            const liveSpace = await updateZingSpace(
              space.slug,
              {status: 'live'},
              accessJwt,
            )
            upsertSpaceInState(liveSpace)
            setActiveSpaceSlug(liveSpace.slug)
            Toast.show('ZingSpace is now live', {type: 'success'})
          } catch (err: unknown) {
            Toast.show(getErrMsg(err, 'Unable to start ZingSpace'), {
              type: 'warning',
            })
          }
        })
        return
      }

      setActiveSpaceSlug(space.slug)
      if (hasSession && accessJwt && space.status === 'live') {
        const alreadyParticipant = space.participants.some(
          p => p.did === viewerDid,
        )
        if (!alreadyParticipant) {
          joinZingSpace(space.slug, accessJwt)
            .then(updated => {
              upsertSpaceInState(updated)
            })
            .catch(() => {})
        }
      }
    },
    [accessJwt, hasSession, requireAuth, upsertSpaceInState, viewerDid],
  )

  const handleJoinLeaveActiveSpace = useCallback(() => {
    if (!activeSpace) return
    requireAuth(async () => {
      if (!accessJwt || actionBusy) return
      const isInRoom = activeSpace.participants.some(p => p.did === viewerDid)
      setActionBusy(true)
      try {
        if (isInRoom && activeSpace.hostDid !== viewerDid) {
          const updated = await leaveZingSpace(activeSpace.slug, accessJwt)
          upsertSpaceInState(updated)
          setActiveSpaceSlug(null)
          Toast.show('Left ZingSpace', {type: 'info'})
        } else {
          const updated = await joinZingSpace(activeSpace.slug, accessJwt)
          upsertSpaceInState(updated)
          Toast.show('Joined ZingSpace stage', {type: 'success'})
        }
      } catch (err: unknown) {
        Toast.show(getErrMsg(err, 'Unable to update room membership'), {
          type: 'warning',
        })
      } finally {
        setActionBusy(false)
      }
    })
  }, [
    accessJwt,
    actionBusy,
    activeSpace,
    requireAuth,
    upsertSpaceInState,
    viewerDid,
  ])

  const handleToggleHand = useCallback(() => {
    if (!activeSpace) return
    requireAuth(async () => {
      if (!accessJwt || actionBusy) return
      const me = activeSpace.participants.find(p => p.did === viewerDid)
      const nextRaised = !(me?.handRaised ?? false)
      setActionBusy(true)
      try {
        if (!me) {
          await joinZingSpace(activeSpace.slug, accessJwt)
        }
        const updated = await setSpaceHand(
          activeSpace.slug,
          nextRaised,
          accessJwt,
        )
        upsertSpaceInState(updated)
        Toast.show(nextRaised ? 'Hand raised for host' : 'Hand lowered', {
          type: 'info',
        })
      } catch (err: unknown) {
        Toast.show(getErrMsg(err, 'Unable to update hand status'), {
          type: 'warning',
        })
      } finally {
        setActionBusy(false)
      }
    })
  }, [
    accessJwt,
    actionBusy,
    activeSpace,
    requireAuth,
    upsertSpaceInState,
    viewerDid,
  ])

  const handlePromoteOrDemote = useCallback(
    (targetDid: string, currentRole: 'host' | 'speaker' | 'listener') => {
      if (!activeSpace || currentRole === 'host') return
      requireAuth(async () => {
        if (!accessJwt) return
        try {
          const updated = await updateZingSpace(
            activeSpace.slug,
            currentRole === 'listener'
              ? {promoteDid: targetDid}
              : {demoteDid: targetDid},
            accessJwt,
          )
          upsertSpaceInState(updated)
          Toast.show(
            currentRole === 'listener'
              ? 'Promoted participant to Speaker'
              : 'Moved participant to Listener',
            {type: 'success'},
          )
        } catch (err: unknown) {
          Toast.show(getErrMsg(err, 'Unable to change participant role'), {
            type: 'warning',
          })
        }
      })
    },
    [accessJwt, activeSpace, requireAuth, upsertSpaceInState],
  )

  const handleDeleteSpace = useCallback(
    (slug: string) => {
      requireAuth(async () => {
        if (!accessJwt) return
        try {
          await deleteZingSpace(slug, accessJwt)
          if (activeSpaceSlug === slug) {
            setActiveSpaceSlug(null)
          }
          setSpaces(prev => prev.filter(s => s.slug !== slug))
          Toast.show('ZingSpace deleted', {type: 'info'})
        } catch (err: unknown) {
          Toast.show(getErrMsg(err, 'Unable to delete ZingSpace'), {
            type: 'warning',
          })
        }
      })
    },
    [accessJwt, activeSpaceSlug, requireAuth],
  )

  const handleShareSpace = useCallback(
    (space: QuantZingSpace) => {
      const topicTags = (space.topic || '')
        .split(/[·,]+/)
        .map(tItem => tItem.trim().replace(/[^a-zA-Z0-9]/g, ''))
        .filter(Boolean)
        .map(tag => `#${tag}`)
        .join(' ')
      openComposer({
        text: `Live ZingSpace on QuantZing: "${space.title}" hosted by @${space.hostHandle}. Join the room! #spaces #live ${topicTags}`
          .trim()
          .slice(0, 295),
        logContext: 'Other',
      })
    },
    [openComposer],
  )

  const handleTriggerReaction = useCallback(
    (kind: QuantZingSpaceReactionKind) => {
      if (!activeSpace) return
      requireAuth(async () => {
        if (!accessJwt) return
        try {
          const updated = await sendSpaceReaction(
            activeSpace.slug,
            kind,
            accessJwt,
          )
          upsertSpaceInState(updated)
        } catch (err: unknown) {
          Toast.show(getErrMsg(err, 'Unable to send reaction'), {
            type: 'warning',
          })
        }
      })
    },
    [accessJwt, activeSpace, requireAuth, upsertSpaceInState],
  )

  const handleOpenPost = useCallback(
    (post: QuantySourceCitation) => {
      try {
        const uri = new AtUri(post.uri)
        navigation.navigate('PostThread', {
          name: post.handle || uri.host,
          rkey: uri.rkey,
        })
      } catch {
        // Ignore malformed URI
      }
    },
    [navigation],
  )

  const stageSpeakers = useMemo(
    () =>
      activeSpace
        ? activeSpace.participants.filter(
            p => p.role === 'host' || p.role === 'speaker',
          )
        : [],
    [activeSpace],
  )
  const stageListeners = useMemo(
    () =>
      activeSpace
        ? activeSpace.participants.filter(p => p.role === 'listener')
        : [],
    [activeSpace],
  )
  const raisedHandRequests = useMemo(
    () =>
      activeSpace
        ? activeSpace.participants.filter(
            p => p.role === 'listener' && p.handRaised,
          )
        : [],
    [activeSpace],
  )

  return (
    <Layout.Screen
      testID="zingSpacesScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        {activeSpace ? (
          <Layout.Header.Slot>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Spaces"
              accessibilityHint=""
              onPress={() => setActiveSpaceSlug(null)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_sm,
                a.py_xs,
                a.rounded_full,
                {backgroundColor: colors.surface},
                web({cursor: 'pointer'}),
              ]}>
              <CloseIcon size="xs" fill={colors.text} />
              <Text style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                Spaces
              </Text>
            </Pressable>
          </Layout.Header.Slot>
        ) : (
          <Layout.Header.BackButton />
        )}
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <LiveIcon size="md" fill="#794BC4" />
            <Layout.Header.TitleText style={{color: colors.text}}>
              {activeSpace ? 'Space' : 'Spaces'}
            </Layout.Header.TitleText>
          </View>
          {!activeSpace && (
            <Layout.Header.SubtitleText>
              Live audio conversations on QuantZing
            </Layout.Header.SubtitleText>
          )}
        </Layout.Header.Content>
        <Layout.Header.Slot>
          {!activeSpace && (
            <Pressable
              testID="toggleStartSpaceFormBtn"
              accessibilityRole="button"
              accessibilityLabel="Start a Space"
              accessibilityHint=""
              onPress={() => {
                setCreateMode('live')
                setShowCreateForm(true)
              }}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_2xs,
                a.px_md,
                a.rounded_full,
                {
                  height: 34,
                  backgroundColor: '#794BC4',
                },
                web({cursor: 'pointer'}),
              ]}>
              <PlusIcon size="xs" fill="#FFFFFF" />
              <Text style={[a.text_xs, a.font_bold, {color: '#FFFFFF'}]}>
                Start
              </Text>
            </Pressable>
          )}
        </Layout.Header.Slot>
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_lg, {paddingBottom: 112}]}>
        {/* Focused X-Style Live Space Stage View */}
        {activeSpace ? (
          <View
            testID="activeZingSpaceRoom"
            style={[
              a.p_lg,
              a.gap_lg,
              {
                borderRadius: 24,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: 'rgba(121, 75, 196, 0.55)',
              },
              IS_WEB
                ? {
                    backgroundImage:
                      'linear-gradient(180deg, rgba(121, 75, 196, 0.16) 0%, rgba(22, 24, 28, 0.98) 38%)',
                  }
                : {},
            ]}>
            {/* Top Status & Leave Bar */}
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_2xs,
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor:
                        activeSpace.status === 'live'
                          ? 'rgba(0, 186, 124, 0.16)'
                          : 'rgba(121, 75, 196, 0.2)',
                    },
                  ]}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor:
                        activeSpace.status === 'live'
                          ? colors.rezing
                          : '#A78BFA',
                    }}
                  />
                  <Text
                    style={[
                      {
                        fontSize: 11,
                        fontWeight: '800',
                        letterSpacing: 0.4,
                        color:
                          activeSpace.status === 'live'
                            ? colors.rezing
                            : '#A78BFA',
                      },
                    ]}>
                    {activeSpace.status === 'live'
                      ? `LIVE · ${formatElapsed(elapsedSec)}`
                      : activeSpace.status.toUpperCase()}
                  </Text>
                </View>

                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_2xs,
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {backgroundColor: colors.surface},
                  ]}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: audioState.supported
                        ? colors.rezing
                        : colors.muted,
                    }}
                  />
                  <Text style={[{fontSize: 11, color: colors.muted}]}>
                    {audioState.supported ? 'Audio Ready' : 'Stage View'}
                  </Text>
                </View>
              </View>

              {isViewerHost && activeSpace.status === 'live' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="End Space"
                  accessibilityHint=""
                  disabled={actionBusy}
                  onPress={handleEndSpace}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.danger},
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text style={[a.text_xs, a.font_bold, {color: '#FFFFFF'}]}>
                    End
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    viewerParticipant ? 'Leave quietly' : 'Join Space'
                  }
                  accessibilityHint=""
                  disabled={actionBusy}
                  onPress={handleJoinLeaveActiveSpace}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: viewerParticipant
                        ? 'rgba(244, 33, 46, 0.14)'
                        : '#EFF3F4',
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {
                        color: viewerParticipant ? '#F4212E' : '#0F1419',
                      },
                    ]}>
                    {viewerParticipant ? 'Leave quietly' : 'Join Space'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Space Title & Topic Chips */}
            <View style={[a.gap_xs]}>
              <Text
                style={[
                  {
                    fontSize: 22,
                    fontWeight: '800',
                    lineHeight: 28,
                    color: colors.text,
                  },
                ]}>
                {activeSpace.title}
              </Text>
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                {(activeSpace.topic || 'General')
                  .split('·')
                  .map(part => part.trim())
                  .filter(Boolean)
                  .map(tag => (
                    <View
                      key={tag}
                      style={[
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {backgroundColor: 'rgba(121, 75, 196, 0.2)'},
                      ]}>
                      <Text
                        style={[
                          {fontSize: 11, fontWeight: '700', color: '#C4B5FD'},
                        ]}>
                        {tag}
                      </Text>
                    </View>
                  ))}
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  {activeSpace.speakerCount} speaking ·{' '}
                  {activeSpace.listenerCount} listening
                </Text>
              </View>
            </View>

            {/* Tap-to-hear Autoplay Blocked Banner */}
            {audioState.audioBlocked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tap to hear live audio"
                accessibilityHint=""
                onPress={handleResumeAudio}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.px_md,
                  a.py_sm,
                  a.rounded_md,
                  {
                    backgroundColor: colors.accentSubtle,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <SpeakerIcon size="xs" fill={colors.accent} />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: colors.accent},
                    ]}>
                    Tap to enable live stage audio
                  </Text>
                </View>
                <Text style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                  Turn On
                </Text>
              </Pressable>
            )}

            {/* Speakers Stage Grid */}
            <View
              style={[
                a.gap_md,
                {
                  paddingVertical: 16,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <View style={[a.flex_row, a.flex_wrap, {gap: 18}]}>
                {stageSpeakers.map(participant => {
                  const initials = (
                    participant.displayName ||
                    participant.handle ||
                    'QZ'
                  )
                    .slice(0, 2)
                    .toUpperCase()
                  const canManageRole =
                    isViewerHost && participant.role !== 'host'
                  const isSpeaking = Boolean(
                    audioState.speakingLevels[participant.did] &&
                    audioState.speakingLevels[participant.did] > 0.035 &&
                    !participant.muted,
                  )

                  return (
                    <View
                      key={participant.did}
                      style={[a.align_center, a.gap_xs, {width: 86}]}>
                      <View style={{position: 'relative'}}>
                        <View
                          style={[
                            a.align_center,
                            a.justify_center,
                            a.rounded_full,
                            {
                              width: 70,
                              height: 70,
                              borderWidth: isSpeaking ? 3 : 2,
                              borderColor: isSpeaking
                                ? colors.rezing
                                : '#794BC4',
                            },
                            web(
                              isSpeaking
                                ? {
                                    boxShadow: `0 0 16px ${colors.rezing}88`,
                                  }
                                : {},
                            ),
                          ]}>
                          {participant.avatar ? (
                            <UserAvatar
                              type="user"
                              size={62}
                              avatar={participant.avatar}
                            />
                          ) : (
                            <View
                              style={[
                                a.align_center,
                                a.justify_center,
                                a.rounded_full,
                                {
                                  width: 62,
                                  height: 62,
                                  backgroundColor: 'rgba(121, 75, 196, 0.22)',
                                },
                              ]}>
                              <Text
                                style={[
                                  a.text_md,
                                  a.font_bold,
                                  {color: '#C4B5FD'},
                                ]}>
                                {initials}
                              </Text>
                            </View>
                          )}
                        </View>
                        {participant.muted && (
                          <View
                            style={{
                              position: 'absolute',
                              right: 0,
                              bottom: 0,
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: '#16181C',
                              borderWidth: 1,
                              borderColor: colors.border,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            <MuteIcon width={12} fill={colors.danger} />
                          </View>
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          {
                            fontSize: 12,
                            fontWeight: '700',
                            color: colors.text,
                            textAlign: 'center',
                            width: '100%',
                          },
                        ]}>
                        {participant.displayName || `@${participant.handle}`}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          {
                            fontSize: 11,
                            textAlign: 'center',
                            color: isSpeaking ? colors.rezing : '#A78BFA',
                            fontWeight: '600',
                          },
                        ]}>
                        {isSpeaking
                          ? 'Speaking'
                          : participant.role === 'host'
                            ? 'Host'
                            : 'Speaker'}
                      </Text>
                      {canManageRole && (
                        <View style={[a.flex_row, a.gap_2xs]}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              handlePromoteOrDemote(
                                participant.did,
                                participant.role,
                              )
                            }
                            style={[
                              a.px_xs,
                              {
                                paddingVertical: 2,
                                borderRadius: 999,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.border,
                              },
                            ]}>
                            <Text
                              style={[
                                {
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color: colors.muted,
                                },
                              ]}>
                              Move
                            </Text>
                          </Pressable>
                          {!participant.muted && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Mute speaker"
                              accessibilityHint=""
                              onPress={() =>
                                accessJwt &&
                                void setSpaceMute(
                                  activeSpace.slug,
                                  true,
                                  accessJwt,
                                  participant.did,
                                )
                              }
                              style={[
                                a.px_xs,
                                {
                                  paddingVertical: 2,
                                  borderRadius: 999,
                                  backgroundColor: colors.surface,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                },
                              ]}>
                              <Text
                                style={[
                                  {
                                    fontSize: 10,
                                    fontWeight: '700',
                                    color: colors.danger,
                                  },
                                ]}>
                                Mute
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>

              {/* Host Speaker Requests Row */}
              {isViewerHost && raisedHandRequests.length > 0 && (
                <View style={[a.gap_xs, a.pt_sm]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                    Speaker Requests ({raisedHandRequests.length})
                  </Text>
                  <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                    {raisedHandRequests.map(reqUser => (
                      <Pressable
                        key={reqUser.did}
                        accessibilityRole="button"
                        onPress={() =>
                          handlePromoteOrDemote(reqUser.did, reqUser.role)
                        }
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.gap_xs,
                          a.px_sm,
                          a.py_2xs,
                          a.rounded_full,
                          {
                            backgroundColor: colors.accentSubtle,
                            borderWidth: 1,
                            borderColor: colors.accent,
                          },
                        ]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_bold,
                            {color: colors.accent},
                          ]}>
                          Approve @{reqUser.handle}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Listeners Row */}
              {stageListeners.length > 0 && (
                <View style={[a.gap_xs, a.pt_sm]}>
                  <Text style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                    Listeners ({stageListeners.length})
                  </Text>
                  <View style={[a.flex_row, a.flex_wrap, {gap: 12}]}>
                    {stageListeners.map(listener => (
                      <Pressable
                        accessibilityRole="button"
                        key={listener.did}
                        disabled={!isViewerHost}
                        onPress={() =>
                          isViewerHost &&
                          handlePromoteOrDemote(listener.did, listener.role)
                        }
                        style={[a.align_center, {width: 62, gap: 4}]}>
                        <UserAvatar
                          type="user"
                          size={42}
                          avatar={listener.avatar}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            {
                              fontSize: 10,
                              color: listener.handRaised
                                ? colors.accent
                                : colors.muted,
                              fontWeight: listener.handRaised ? '700' : '500',
                            },
                          ]}>
                          @{listener.handle}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Recent Reactions Pill Stream */}
            {activeSpace.recentReactions.length > 0 && (
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                {activeSpace.recentReactions.slice(-5).map(r => (
                  <View
                    key={r.id}
                    style={[
                      a.px_xs,
                      {
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: 'rgba(121, 75, 196, 0.16)',
                      },
                    ]}>
                    <Text
                      style={[
                        {fontSize: 10, fontWeight: '700', color: '#C4B5FD'},
                      ]}>
                      {REACTION_LABEL_MAP[r.kind] || r.kind.toUpperCase()} · @
                      {r.handle}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Popover Reaction Tray */}
            {showReactionsTray && (
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  {justifyContent: 'space-around'},
                  a.p_sm,
                  a.rounded_full,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                {REACTIONS.map(reaction => {
                  const renderReactionIcon = () => {
                    switch (reaction.kind) {
                      case 'applause':
                        return <CelebrateIcon size="sm" fill={colors.text} />
                      case 'fire':
                        return <FlameIcon size="sm" fill="#F91880" />
                      case 'heart':
                        return <HeartIcon size="sm" fill="#F91880" />
                      case 'insight':
                        return <SparkleIcon size="sm" fill="#1D9BF0" />
                      case 'wave':
                      default:
                        return <HandIcon size="sm" fill={colors.text} />
                    }
                  }
                  return (
                    <Pressable
                      key={reaction.kind}
                      testID={`zingSpaceReact-${reaction.kind}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Send ${reaction.label} reaction`}
                      accessibilityHint=""
                      onPress={() => {
                        handleTriggerReaction(reaction.kind)
                        setShowReactionsTray(false)
                      }}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_2xs,
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        web({cursor: 'pointer'}),
                      ]}>
                      {renderReactionIcon()}
                      <Text
                        style={[
                          {fontSize: 11, fontWeight: '700', color: colors.text},
                        ]}>
                        {reaction.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}

            {/* Clean X-Style Bottom Audio Dock */}
            <View
              style={[
                a.flex_row,
                a.align_center,
                {justifyContent: 'space-around'},
                a.pt_xs,
              ]}>
              {canViewerSpeak ? (
                <View style={[a.align_center, {gap: 4}]}>
                  <Pressable
                    testID="zingSpaceMicToggleBtn"
                    accessibilityRole="button"
                    accessibilityLabel={
                      audioState.muted ? 'Unmute microphone' : 'Mute microphone'
                    }
                    accessibilityHint=""
                    onPress={handleToggleMic}
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 52,
                        height: 52,
                        backgroundColor: audioState.muted
                          ? colors.surface
                          : colors.rezing,
                        borderWidth: 2,
                        borderColor: audioState.muted
                          ? colors.border
                          : colors.rezing,
                      },
                      web(
                        !audioState.muted
                          ? {
                              boxShadow: `0 0 16px ${colors.rezing}88`,
                              cursor: 'pointer',
                            }
                          : {cursor: 'pointer'},
                      ),
                    ]}>
                    {audioState.muted ? (
                      <MuteIcon size="md" fill={colors.danger} />
                    ) : (
                      <SpeakerIcon size="md" fill="#000000" />
                    )}
                  </Pressable>
                  <Text
                    style={[
                      {fontSize: 11, fontWeight: '700'},
                      {color: audioState.muted ? colors.muted : colors.rezing},
                    ]}>
                    {audioState.muted ? 'Mic is off' : 'Mic is on'}
                  </Text>
                </View>
              ) : (
                <View style={[a.align_center, {gap: 4}]}>
                  <Pressable
                    testID="zingSpaceRaiseHandBtn"
                    accessibilityRole="button"
                    accessibilityLabel={
                      viewerHandRaised ? 'Lower Hand' : 'Request to speak'
                    }
                    accessibilityHint=""
                    disabled={actionBusy}
                    onPress={handleToggleHand}
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 52,
                        height: 52,
                        backgroundColor: viewerHandRaised
                          ? colors.accentSubtle
                          : colors.surface,
                        borderWidth: 2,
                        borderColor: viewerHandRaised
                          ? colors.accent
                          : colors.border,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    <HandIcon
                      size="md"
                      fill={viewerHandRaised ? colors.accent : colors.text}
                    />
                  </Pressable>
                  <Text
                    style={[
                      {
                        fontSize: 11,
                        fontWeight: '700',
                        color: viewerHandRaised ? colors.accent : colors.muted,
                      },
                    ]}>
                    {viewerHandRaised ? 'Requested' : 'Request'}
                  </Text>
                </View>
              )}

              {canViewerSpeak && (
                <View style={[a.align_center, {gap: 4}]}>
                  <Pressable
                    testID="zingSpaceRaiseHandBtn"
                    accessibilityRole="button"
                    accessibilityLabel={
                      viewerHandRaised ? 'Lower Hand' : 'Raise Hand'
                    }
                    accessibilityHint=""
                    disabled={actionBusy}
                    onPress={handleToggleHand}
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 44,
                        height: 44,
                        backgroundColor: viewerHandRaised
                          ? colors.accentSubtle
                          : colors.surface,
                        borderWidth: 1,
                        borderColor: viewerHandRaised
                          ? colors.accent
                          : colors.border,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    <HandIcon
                      size="sm"
                      fill={viewerHandRaised ? colors.accent : colors.text}
                    />
                  </Pressable>
                  <Text style={[{fontSize: 11, color: colors.muted}]}>
                    Hand
                  </Text>
                </View>
              )}

              <View style={[a.align_center, {gap: 4}]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="React in Space"
                  accessibilityHint=""
                  onPress={() => setShowReactionsTray(prev => !prev)}
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 44,
                      height: 44,
                      backgroundColor: showReactionsTray
                        ? 'rgba(121, 75, 196, 0.25)'
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: showReactionsTray
                        ? '#794BC4'
                        : colors.border,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <HeartIcon size="sm" fill="#F91880" />
                </Pressable>
                <Text style={[{fontSize: 11, color: colors.muted}]}>React</Text>
              </View>

              <View style={[a.align_center, {gap: 4}]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share Space"
                  accessibilityHint=""
                  onPress={() => handleShareSpace(activeSpace)}
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 44,
                      height: 44,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <ShareIcon size="sm" fill={colors.accent} />
                </Pressable>
                <Text style={[{fontSize: 11, color: colors.muted}]}>Share</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* X-Style Filter Pill Bar */}
            <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
              {(
                [
                  {id: 'all', label: 'Happening Now'},
                  {id: 'live', label: 'Live'},
                  {id: 'scheduled', label: 'Upcoming'},
                  {id: 'ended', label: 'Ended'},
                ] as const
              ).map(tab => {
                const active = statusFilter === tab.id
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="button"
                    onPress={() => setStatusFilter(tab.id)}
                    style={[
                      a.px_md,
                      a.rounded_full,
                      a.justify_center,
                      {
                        height: 34,
                        backgroundColor: active ? '#EFF3F4' : colors.card,
                        borderWidth: 1,
                        borderColor: active ? '#EFF3F4' : colors.border,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    <Text
                      style={[
                        {
                          fontSize: 13,
                          fontWeight: '700',
                          color: active ? '#0F1419' : colors.muted,
                        },
                      ]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Spaces Cards Discovery */}
            <View style={[a.gap_md]}>
              {loadingSpaces ? (
                <View
                  style={[
                    a.p_2xl,
                    a.rounded_lg,
                    a.align_center,
                    a.gap_sm,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <ActivityIndicator size="small" color="#794BC4" />
                  <Text style={[a.text_sm, {color: colors.muted}]}>
                    Loading Spaces...
                  </Text>
                </View>
              ) : spaces.length === 0 ? (
                <View
                  style={[
                    a.p_2xl,
                    a.rounded_lg,
                    a.align_center,
                    a.gap_md,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <LiveIcon size="lg" fill="#794BC4" />
                  <View style={[a.align_center, a.gap_2xs]}>
                    <Text
                      style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                      No Spaces right now
                    </Text>
                    <Text
                      style={[
                        a.text_sm,
                        a.text_center,
                        {color: colors.muted, maxWidth: 320},
                      ]}>
                      Start a live audio room on Politics, Technology, Sports,
                      or anything on your mind.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCreateMode('live')
                      setShowCreateForm(true)
                    }}
                    style={[
                      a.px_xl,
                      a.rounded_full,
                      a.justify_center,
                      {height: 40, backgroundColor: '#794BC4'},
                      web({cursor: 'pointer'}),
                    ]}>
                    <Text style={[a.text_sm, a.font_bold, {color: '#FFFFFF'}]}>
                      Create your Space
                    </Text>
                  </Pressable>
                </View>
              ) : (
                spaces.map(space => {
                  const isHost = Boolean(
                    viewerDid && space.hostDid === viewerDid,
                  )
                  const isLive = space.status === 'live'
                  const isEnded = space.status === 'ended'
                  const stackParticipants =
                    space.participants && space.participants.length > 0
                      ? space.participants.slice(0, 3)
                      : [
                          {
                            did: space.hostDid,
                            handle: space.hostHandle,
                            displayName: space.hostDisplayName,
                            avatar: space.hostAvatar,
                          },
                        ]

                  return (
                    <Pressable
                      key={space.slug}
                      accessibilityRole="button"
                      onPress={() => handleJoinOrOpenSpace(space)}
                      style={[
                        a.p_lg,
                        a.gap_md,
                        {
                          borderRadius: 20,
                          backgroundColor: isEnded ? colors.card : '#6D3EC2',
                          borderWidth: 1,
                          borderColor: isEnded ? colors.border : '#8B5CF6',
                        },
                        IS_WEB && !isEnded
                          ? ({
                              cursor: 'pointer',
                              backgroundImage: isLive
                                ? 'linear-gradient(135deg, #794BC4 0%, #5B33A6 100%)'
                                : 'linear-gradient(135deg, #6B3EB8 0%, #4C288A 100%)',
                              boxShadow: '0 6px 22px rgba(121, 75, 196, 0.25)',
                            } as unknown as ViewStyle)
                          : {},
                      ]}>
                      {/* Header: Status + Topics + Delete */}
                      <View
                        style={[a.flex_row, a.align_center, a.justify_between]}>
                        <View
                          style={[
                            a.flex_row,
                            a.flex_wrap,
                            a.align_center,
                            {gap: 6},
                          ]}>
                          <View
                            style={[
                              a.flex_row,
                              a.align_center,
                              a.rounded_full,
                              {
                                gap: 5,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                backgroundColor: isEnded
                                  ? colors.surface
                                  : 'rgba(0, 0, 0, 0.28)',
                              },
                            ]}>
                            {isLive && (
                              <View
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: '#00BA7C',
                                }}
                              />
                            )}
                            <Text
                              style={[
                                {
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: isEnded ? colors.muted : '#FFFFFF',
                                  letterSpacing: 0.4,
                                },
                              ]}>
                              {isLive
                                ? 'LIVE'
                                : space.status === 'scheduled' &&
                                    space.scheduledFor
                                  ? formatScheduledTime(space.scheduledFor)
                                  : space.status.toUpperCase()}
                            </Text>
                          </View>

                          {(space.topic || 'General')
                            .split('·')
                            .slice(0, 2)
                            .map(tag => tag.trim())
                            .filter(Boolean)
                            .map(tag => (
                              <View
                                key={tag}
                                style={[
                                  a.px_sm,
                                  a.rounded_full,
                                  {
                                    paddingVertical: 3,
                                    backgroundColor: isEnded
                                      ? colors.surface
                                      : 'rgba(255, 255, 255, 0.16)',
                                  },
                                ]}>
                                <Text
                                  style={[
                                    {
                                      fontSize: 11,
                                      fontWeight: '600',
                                      color: isEnded ? colors.muted : '#FFFFFF',
                                    },
                                  ]}>
                                  {tag}
                                </Text>
                              </View>
                            ))}
                        </View>

                        {isHost && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Delete Space"
                            accessibilityHint=""
                            onPress={() => handleDeleteSpace(space.slug)}
                            hitSlop={8}>
                            <TrashIcon
                              size="xs"
                              fill={isEnded ? colors.muted : '#E9D5FF'}
                            />
                          </Pressable>
                        )}
                      </View>

                      {/* Title */}
                      <Text
                        style={[
                          {
                            fontSize: 19,
                            fontWeight: '800',
                            color: isEnded ? colors.text : '#FFFFFF',
                            lineHeight: 24,
                          },
                        ]}>
                        {space.title}
                      </Text>

                      {/* Overlapping Listener Avatars */}
                      <View style={[a.flex_row, a.align_center, {gap: 10}]}>
                        <View style={[a.flex_row, a.align_center]}>
                          {stackParticipants.map((p, idx) => (
                            <View
                              key={p.did || idx}
                              style={[
                                a.rounded_full,
                                {
                                  width: 28,
                                  height: 28,
                                  marginLeft: idx === 0 ? 0 : -8,
                                  borderWidth: 2,
                                  borderColor: isEnded
                                    ? colors.card
                                    : '#794BC4',
                                  overflow: 'hidden',
                                  backgroundColor: isEnded
                                    ? colors.surface
                                    : 'rgba(255, 255, 255, 0.25)',
                                },
                              ]}>
                              {p.avatar ? (
                                <UserAvatar
                                  type="user"
                                  size={24}
                                  avatar={p.avatar}
                                />
                              ) : (
                                <View
                                  style={[
                                    a.align_center,
                                    a.justify_center,
                                    a.w_full,
                                    a.h_full,
                                  ]}>
                                  <Text
                                    style={[
                                      {
                                        fontSize: 9,
                                        fontWeight: '700',
                                        color: isEnded
                                          ? colors.text
                                          : '#FFFFFF',
                                      },
                                    ]}>
                                    {(p.displayName || p.handle || 'QZ')
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                        <Text
                          style={[
                            {
                              fontSize: 13,
                              fontWeight: '600',
                              color: isEnded
                                ? colors.muted
                                : 'rgba(255,255,255,0.9)',
                            },
                          ]}>
                          {isLive
                            ? `${Math.max(1, space.listenerCount + space.speakerCount)} listening`
                            : `${space.speakerCount} speakers · ${space.listenerCount} listeners`}
                        </Text>
                      </View>

                      {/* Host Footer */}
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                          a.px_sm,
                          a.py_xs,
                          {
                            borderRadius: 12,
                            backgroundColor: isEnded
                              ? colors.surface
                              : 'rgba(0, 0, 0, 0.22)',
                          },
                        ]}>
                        <View
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.gap_xs,
                            {flex: 1, minWidth: 0},
                          ]}>
                          <UserAvatar
                            type="user"
                            size={24}
                            avatar={space.hostAvatar}
                          />
                          <Text
                            numberOfLines={1}
                            style={[
                              {
                                fontSize: 13,
                                fontWeight: '700',
                                color: isEnded ? colors.text : '#FFFFFF',
                                maxWidth: 160,
                              },
                            ]}>
                            {space.hostDisplayName || `@${space.hostHandle}`}
                          </Text>
                          <View
                            style={[
                              a.px_xs,
                              a.rounded_full,
                              {
                                paddingVertical: 1,
                                backgroundColor: isEnded
                                  ? colors.border
                                  : 'rgba(255, 255, 255, 0.2)',
                              },
                            ]}>
                            <Text
                              style={[
                                {
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color: isEnded ? colors.muted : '#FFFFFF',
                                },
                              ]}>
                              Host
                            </Text>
                          </View>
                        </View>

                        <View style={[a.flex_row, a.align_center, {gap: 6}]}>
                          {!isEnded && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => handleJoinOrOpenSpace(space)}
                              style={[
                                a.px_md,
                                a.py_xs,
                                a.rounded_full,
                                {backgroundColor: '#FFFFFF'},
                                web({cursor: 'pointer'}),
                              ]}>
                              <Text
                                style={[
                                  a.text_xs,
                                  a.font_bold,
                                  {color: '#0F1419'},
                                ]}>
                                {isLive
                                  ? 'Listen live'
                                  : isHost
                                    ? 'Go Live'
                                    : 'Set reminder'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  )
                })
              )}
            </View>

            {/* Compact Community Spaces Zings (only when present) */}
            {!loadingDiscovery && discoveryPosts.length > 0 && (
              <View
                style={[
                  a.rounded_lg,
                  a.overflow_hidden,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.p_md,
                    {borderBottomWidth: 1, borderBottomColor: colors.border},
                  ]}>
                  <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                    Shared Spaces
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadLiveDiscovery()}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: colors.accent},
                      ]}>
                      Refresh
                    </Text>
                  </Pressable>
                </View>
                {discoveryPosts.map((post, idx) => (
                  <Pressable
                    key={post.uri}
                    accessibilityRole="button"
                    onPress={() => handleOpenPost(post)}
                    style={[
                      a.p_md,
                      a.gap_xs,
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      },
                    ]}>
                    <Text
                      numberOfLines={1}
                      style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                      {stripEmojisAndSymbols(post.displayName)} @{post.handle}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[a.text_sm, a.leading_snug, {color: colors.text}]}>
                      {stripEmojisAndSymbols(post.text)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </Layout.Content>

      {/* Dedicated X-Style Create Space Modal */}
      <Modal
        visible={showCreateForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateForm(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}>
          <View
            style={[
              a.p_lg,
              a.gap_lg,
              {
                width: '100%',
                maxWidth: 480,
                borderRadius: 24,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.justify_between]}>
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                <LiveIcon size="md" fill="#794BC4" />
                <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                  Create your Space
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close creator modal"
                accessibilityHint=""
                onPress={() => setShowCreateForm(false)}
                style={[
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    width: 34,
                    height: 34,
                    backgroundColor: colors.surface,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <CloseIcon size="xs" fill={colors.text} />
              </Pressable>
            </View>

            <TextInput
              accessibilityLabel="Space title"
              accessibilityHint=""
              testID="zingSpaceTitleInput"
              value={title}
              onChangeText={setTitle}
              placeholder="What do you want to talk about?"
              placeholderTextColor={colors.muted}
              style={[
                {
                  fontSize: 18,
                  fontWeight: '600',
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                web({outlineStyle: 'none'}),
              ]}
            />

            {/* Topics Selection */}
            <View style={[a.gap_sm]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                ADD TOPICS (UP TO 3)
              </Text>
              <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                {SUGGESTED_TOPICS.map(topic => {
                  const selected = selectedTopics.includes(topic)
                  return (
                    <Pressable
                      key={topic}
                      accessibilityRole="button"
                      onPress={() => toggleTopic(topic)}
                      style={[
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: selected
                            ? 'rgba(121, 75, 196, 0.25)'
                            : colors.surface,
                          borderWidth: 1,
                          borderColor: selected ? '#794BC4' : colors.border,
                        },
                        web({cursor: 'pointer'}),
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: selected ? '#C4B5FD' : colors.text},
                        ]}>
                        {topic}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Start Now vs Schedule */}
            <View style={[a.gap_sm]}>
              <View
                style={[
                  a.flex_row,
                  a.p_2xs,
                  a.rounded_full,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                {(
                  [
                    {id: 'live', label: 'Start now'},
                    {id: 'scheduled', label: 'Schedule for later'},
                  ] as const
                ).map(mode => {
                  const active = createMode === mode.id
                  return (
                    <Pressable
                      key={mode.id}
                      accessibilityRole="button"
                      onPress={() => setCreateMode(mode.id)}
                      style={[
                        a.flex_1,
                        a.align_center,
                        a.justify_center,
                        a.rounded_full,
                        {
                          height: 34,
                          backgroundColor: active ? '#794BC4' : 'transparent',
                        },
                        web({cursor: 'pointer'}),
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: active ? '#FFFFFF' : colors.muted},
                        ]}>
                        {mode.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {createMode === 'scheduled' && (
                <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                  {SCHEDULE_PRESETS.map(preset => {
                    const active = scheduleOffsetMin === preset.offsetMinutes
                    return (
                      <Pressable
                        key={preset.label}
                        accessibilityRole="button"
                        onPress={() =>
                          setScheduleOffsetMin(preset.offsetMinutes)
                        }
                        style={[
                          a.px_md,
                          a.py_xs,
                          a.rounded_full,
                          {
                            backgroundColor: active
                              ? colors.accentSubtle
                              : colors.surface,
                            borderWidth: 1,
                            borderColor: active ? colors.accent : colors.border,
                          },
                          web({cursor: 'pointer'}),
                        ]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_bold,
                            {color: active ? colors.accent : colors.text},
                          ]}>
                          In {preset.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>

            {/* Record Space Toggle */}
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.px_sm,
                a.py_xs,
              ]}>
              <View style={{flex: 1}}>
                <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                  Record Space
                </Text>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Save replay for listeners after Space ends
                </Text>
              </View>
              <Switch
                value={recordSpace}
                onValueChange={setRecordSpace}
                trackColor={{false: colors.border, true: '#794BC4'}}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Launch / Schedule CTA */}
            <Pressable
              testID={
                createMode === 'live'
                  ? 'startZingSpaceLiveBtn'
                  : 'scheduleZingSpaceBtn'
              }
              accessibilityRole="button"
              accessibilityLabel={
                createMode === 'live' ? 'Start your Space' : 'Schedule Space'
              }
              accessibilityHint=""
              disabled={isCreating}
              onPress={() => handleCreateSpace(createMode)}
              style={[
                a.flex_row,
                a.align_center,
                a.justify_center,
                a.gap_xs,
                a.rounded_full,
                {
                  height: 46,
                  backgroundColor: '#794BC4',
                  opacity: isCreating ? 0.6 : 1,
                },
                web({cursor: 'pointer'}),
              ]}>
              {isCreating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : createMode === 'live' ? (
                <LiveIcon size="sm" fill="#FFFFFF" />
              ) : (
                <ClockIcon size="sm" fill="#FFFFFF" />
              )}
              <Text style={[a.text_md, a.font_bold, {color: '#FFFFFF'}]}>
                {createMode === 'live'
                  ? 'Start your Space'
                  : `Schedule (${SCHEDULE_PRESETS.find(p => p.offsetMinutes === scheduleOffsetMin)?.label})`}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Layout.Screen>
  )
}
