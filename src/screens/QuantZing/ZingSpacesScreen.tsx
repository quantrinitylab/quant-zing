import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, Pressable, TextInput, View} from 'react-native'
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
import {atoms as a, useTheme, web} from '#/alf'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Mute_Stroke2_Corner0_Rounded as MuteIcon} from '#/components/icons/Mute'
import {PaperPlane_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/PaperPlane'
import {RaisingHand4Finger_Stroke2_Corner2_Rounded as HandIcon} from '#/components/icons/RaisingHand'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/SpeakerVolumeFull'
import {StreamingLive_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/StreamingLive'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const SUGGESTED_TOPICS = [
  'AI & Agents',
  'Technology',
  'Markets',
  'Build in Public',
  'Design',
  'Breaking News',
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

  // Creator form state
  const [title, setTitle] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'AI & Agents',
  ])
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
        setActiveSpaceSlug(prev => {
          if (prev && fetched.some(s => s.slug === prev)) {
            return prev
          }
          const firstLive = fetched.find(s => s.status === 'live')
          return firstLive ? firstLive.slug : null
        })
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to load ZingSpaces right now', {
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
    () =>
      activeSpace?.participants.find(p => p.did === viewerDid) || null,
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
      .filter(
        p => (p.role === 'host' || p.role === 'speaker') && !p.muted,
      )
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
          await sendSpaceSignal(activeSpaceSlug, payload, accessJwt).catch(() => {})
        },
        onStateChange: state => {
          setAudioState(state)
        },
      },
    })
    meshRef.current = mesh
    void mesh.start()

    let eventSource: EventSource | null = null
    let pollSeq = 0
    let pollTimer: ReturnType<typeof setInterval> | null = null

    if (IS_WEB && typeof EventSource !== 'undefined') {
      try {
        const sseUrl = getSpaceEventsUrl(activeSpaceSlug, {
          clientId: clientIdRef.current,
          accessJwt: accessJwt || undefined,
        })
        eventSource = new EventSource(sseUrl)
        eventSource.addEventListener('space_update', (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data)
            const room = parsed?.space || parsed
            if (room && typeof room.slug === 'string') {
              upsertSpaceInState(room as QuantZingSpace)
            }
          } catch {}
        })
        eventSource.addEventListener('space_peers', (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data)
            if (Array.isArray(parsed?.peers)) {
              mesh.handlePeersSnapshot(parsed.peers)
            }
          } catch {}
        })
        eventSource.addEventListener('peer_joined', (ev: MessageEvent) => {
          try {
            const peer = JSON.parse(ev.data)
            if (peer && peer.clientId) {
              mesh.handlePeerJoined(peer)
            }
          } catch {}
        })
        eventSource.addEventListener('peer_left', (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data)
            if (data?.clientId) {
              mesh.handlePeerLeft(data.clientId)
            }
          } catch {}
        })
        eventSource.addEventListener('space_signal', (ev: MessageEvent) => {
          try {
            const signal = JSON.parse(ev.data)
            if (signal) {
              void mesh.handleSignal(signal)
            }
          } catch {}
        })
        eventSource.onmessage = (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data)
            const room = parsed?.space || parsed
            if (room && typeof room.slug === 'string') {
              upsertSpaceInState(room as QuantZingSpace)
            }
          } catch {}
        }
      } catch {
        eventSource = null
      }
    }

    if (!eventSource) {
      pollTimer = setInterval(async () => {
        try {
          const res = await pollSpaceSignals(
            activeSpaceSlug,
            clientIdRef.current,
            pollSeq,
            accessJwt,
          )
          if (res?.ok && Array.isArray(res.signals)) {
            pollSeq = res.nextSeq || pollSeq
            for (const sig of res.signals) {
              void mesh.handleSignal(sig as any)
            }
          }
        } catch {}
      }, 2000)
    }

    let cancelled = false
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
  }, [accessJwt, activeSpace, audioState.muted, isViewerHost, isViewerServerMuted])

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
          if (created.status === 'live') {
            setActiveSpaceSlug(created.slug)
            Toast.show('ZingSpace is now live on Sovereign PDS', {
              type: 'success',
            })
          } else {
            Toast.show('ZingSpace scheduled on Sovereign PDS', {
              type: 'success',
            })
          }
        } catch (err: any) {
          Toast.show(err?.message || 'Failed to create ZingSpace', {
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
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to end ZingSpace', {
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
          } catch (err: any) {
            Toast.show(err?.message || 'Unable to start ZingSpace', {
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
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to update room membership', {
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
        Toast.show(
          nextRaised ? 'Hand raised for host' : 'Hand lowered',
          {type: 'info'},
        )
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to update hand status', {
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
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to change participant role', {
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
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to delete ZingSpace', {
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
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to send reaction', {
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

  return (
    <Layout.Screen
      testID="zingSpacesScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <LiveIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              ZingSpaces
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Live rooms, real-time speaker stages, and community discussions
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {/* Active Live Interactive Space Room */}
        {activeSpace && (
          <View
            testID="activeZingSpaceRoom"
            style={[
              a.p_lg,
              a.rounded_lg,
              a.gap_md,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.accent,
              },
            ]}>
            {/* Top Status Row */}
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_xs,
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
                          ? colors.rezingSubtle
                          : colors.accentSubtle,
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
                          : colors.accent,
                    }}
                  />
                  <Text
                    style={[
                      {
                        fontSize: 11,
                        fontWeight: '700',
                        color:
                          activeSpace.status === 'live'
                            ? colors.rezing
                            : colors.accent,
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
                    {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: audioState.supported ? colors.rezing : colors.muted,
                    }}
                  />
                  <Text style={[{fontSize: 11, color: colors.muted}]}>
                    {audioState.supported
                      ? `WebRTC Voice Live · ${audioState.connectedPeers + 1} connected`
                      : 'Stage Sync · Web Voice on Browser'}
                  </Text>
                </View>

                <View
                  style={[
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text style={[{fontSize: 11, color: colors.text}]}>
                    {activeSpace.speakerCount} speakers ·{' '}
                    {activeSpace.listenerCount} listeners
                  </Text>
                </View>
              </View>

              {isViewerHost && activeSpace.status === 'live' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="End Space"
                  disabled={actionBusy}
                  onPress={handleEndSpace}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.danger},
                  ]}>
                  <Text style={[a.text_xs, a.font_bold, {color: '#FFFFFF'}]}>
                    End Space
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    viewerParticipant ? 'Leave Space' : 'Join Space'
                  }
                  disabled={actionBusy}
                  onPress={handleJoinLeaveActiveSpace}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: viewerParticipant
                        ? colors.surface
                        : colors.ctaBg,
                      borderWidth: 1,
                      borderColor: viewerParticipant
                        ? colors.border
                        : colors.ctaBg,
                    },
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {
                        color: viewerParticipant
                          ? colors.text
                          : colors.ctaText,
                      },
                    ]}>
                    {viewerParticipant ? 'Leave Space' : 'Join Space'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={[a.gap_2xs]}>
              <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                {activeSpace.title}
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Hosted by @{activeSpace.hostHandle} ·{' '}
                {activeSpace.topic || 'General Discussion'}
              </Text>
            </View>

            {/* Tap-to-hear Autoplay Blocked Banner */}
            {audioState.audioBlocked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tap to hear live audio"
                onPress={handleResumeAudio}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.px_md,
                  a.py_xs,
                  a.rounded_sm,
                  {
                    backgroundColor: colors.accentSubtle,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <SpeakerIcon size="xs" fill={colors.accent} />
                  <Text style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                    Audio paused by browser policy. Tap to Hear Live Audio.
                  </Text>
                </View>
                <Text style={[a.text_2xs, a.font_bold, {color: colors.accent}]}>
                  UNMUTE STAGE
                </Text>
              </Pressable>
            )}

            {/* Persisted Participant Stage Grid */}
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.gap_md,
                a.py_md,
                {
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              {activeSpace.participants.map(participant => {
                const initials = (
                  participant.displayName ||
                  participant.handle ||
                  'QZ'
                )
                  .slice(0, 2)
                  .toUpperCase()
                const isSpeakerOrHost =
                  participant.role === 'host' || participant.role === 'speaker'
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
                    style={[a.align_center, a.gap_2xs, {width: 104}]}>
                    <View
                      style={[
                        a.align_center,
                        a.justify_center,
                        a.rounded_full,
                        {
                          width: 56,
                          height: 56,
                          backgroundColor: isSpeakerOrHost
                            ? colors.accentSubtle
                            : colors.surface,
                          borderWidth: isSpeaking ? 3 : 2,
                          borderColor: isSpeaking
                            ? colors.rezing
                            : participant.handRaised
                              ? colors.accent
                              : isSpeakerOrHost
                                ? colors.rezing
                                : colors.border,
                        },
                        web(
                          isSpeaking
                            ? ({
                                boxShadow: `0 0 12px ${colors.rezing}88`,
                              } as any)
                            : {},
                        ),
                      ]}>
                      <Text
                        style={[
                          a.text_sm,
                          a.font_bold,
                          {
                            color: isSpeakerOrHost
                              ? colors.accent
                              : colors.text,
                          },
                        ]}>
                        {initials}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                      @{participant.handle}
                    </Text>
                    <Text
                      style={[
                        {fontSize: 11},
                        {
                          color: isSpeaking
                            ? colors.rezing
                            : participant.handRaised
                              ? colors.accent
                              : isSpeakerOrHost
                                ? colors.rezing
                                : colors.muted,
                          fontWeight: isSpeaking ? '700' : '400',
                        },
                      ]}>
                      {participant.role.toUpperCase()}
                      {isSpeaking
                        ? ' · SPEAKING'
                        : participant.muted
                          ? ' · MUTED'
                          : participant.handRaised
                            ? ' · HAND UP'
                            : ''}
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
                              {fontSize: 10, fontWeight: '700', color: colors.accent},
                            ]}>
                            {participant.role === 'listener'
                              ? 'Make Speaker'
                              : 'To Listener'}
                          </Text>
                        </Pressable>
                        {participant.role === 'speaker' && !participant.muted && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Mute speaker"
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
                                {fontSize: 10, fontWeight: '700', color: colors.muted},
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

            {/* Recent Persisted Reactions Stream */}
            {activeSpace.recentReactions.length > 0 && (
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Live Reactions:
                </Text>
                {activeSpace.recentReactions.slice(-8).map(r => (
                  <View
                    key={r.id}
                    style={[
                      a.px_xs,
                      {
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: colors.accentSubtle,
                      },
                    ]}>
                    <Text
                      style={[
                        {fontSize: 10, fontWeight: '700', color: colors.accent},
                      ]}>
                      {REACTION_LABEL_MAP[r.kind] || r.kind.toUpperCase()} · @
                      {r.handle}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Live Stage Controls */}
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                {canViewerSpeak && (
                  <Pressable
                    testID="zingSpaceMicToggleBtn"
                    accessibilityRole="button"
                    accessibilityLabel={
                      audioState.muted ? 'Unmute microphone' : 'Mute microphone'
                    }
                    onPress={handleToggleMic}
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_xs,
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {
                        backgroundColor: audioState.muted
                          ? colors.surface
                          : colors.rezing,
                        borderWidth: 1,
                        borderColor: audioState.muted
                          ? colors.border
                          : colors.rezing,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    {audioState.muted ? (
                      <MuteIcon size="xs" fill={colors.text} />
                    ) : (
                      <SpeakerIcon size="xs" fill="#000000" />
                    )}
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: audioState.muted ? colors.text : '#000000'},
                      ]}>
                      {audioState.muted ? 'Unmute Mic' : 'Mute Mic'}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  testID="zingSpaceRaiseHandBtn"
                  accessibilityRole="button"
                  accessibilityLabel={
                    viewerHandRaised ? 'Lower Hand' : 'Raise Hand'
                  }
                  disabled={actionBusy}
                  onPress={handleToggleHand}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: viewerHandRaised
                        ? colors.accentSubtle
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: viewerHandRaised
                        ? colors.accent
                        : colors.border,
                    },
                  ]}>
                  <HandIcon
                    size="xs"
                    fill={viewerHandRaised ? colors.accent : colors.text}
                  />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: viewerHandRaised ? colors.accent : colors.text},
                    ]}>
                    {viewerHandRaised ? 'Hand Raised' : 'Raise Hand'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share Space as Zing"
                  onPress={() => handleShareSpace(activeSpace)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_sm,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <ShareIcon size="xs" fill={colors.accent} />
                  <Text style={[a.text_xs, {color: colors.text}]}>Share</Text>
                </Pressable>
              </View>

              {/* Clean Text Pill Reactions Bar (ZERO Emojis) */}
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                {REACTIONS.map(reaction => (
                  <Pressable
                    key={reaction.kind}
                    testID={`zingSpaceReact-${reaction.kind}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${reaction.label} reaction`}
                    onPress={() => handleTriggerReaction(reaction.kind)}
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        {fontSize: 11, fontWeight: '700', color: colors.text},
                      ]}>
                      {reaction.symbol}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Start a ZingSpace Creator Card */}
        <View
          style={[
            a.p_md,
            a.rounded_lg,
            a.gap_md,
            {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          <View style={[a.flex_row, a.align_center, a.justify_between]}>
            <View>
              <Text style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                Start a ZingSpace
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Launch or schedule a real-time room persisted on Sovereign PDS
              </Text>
            </View>
            <View
              style={[
                a.px_sm,
                a.py_2xs,
                a.rounded_full,
                {backgroundColor: colors.accentSubtle},
              ]}>
              <Text
                style={[{fontSize: 11, fontWeight: '700', color: colors.accent}]}>
                Live Stage
              </Text>
            </View>
          </View>

          <TextInput
            testID="zingSpaceTitleInput"
            value={title}
            onChangeText={setTitle}
            placeholder="What do you want to talk about?"
            placeholderTextColor={colors.muted}
            style={[
              a.text_md,
              a.px_md,
              a.py_sm,
              a.rounded_md,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              },
              web({outlineStyle: 'none'} as any),
            ]}
          />

          {/* Topic Tags */}
          <View style={[a.gap_xs]}>
            <Text style={[a.text_xs, a.font_semi_bold, {color: colors.muted}]}>
              TOPICS (UP TO 3)
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
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: selected
                          ? colors.accentSubtle
                          : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: selected ? colors.accent : colors.text},
                      ]}>
                      {topic}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Schedule Offset Selector */}
          <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
            <Text style={[a.text_xs, {color: colors.muted}]}>
              Schedule window:
            </Text>
            {SCHEDULE_PRESETS.map(preset => {
              const active = scheduleOffsetMin === preset.offsetMinutes
              return (
                <Pressable
                  key={preset.label}
                  accessibilityRole="button"
                  onPress={() => setScheduleOffsetMin(preset.offsetMinutes)}
                  style={[
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor: active
                        ? colors.accentSubtle
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: active ? colors.accent : colors.text},
                    ]}>
                    {preset.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Launch Buttons */}
          <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_sm]}>
            <Pressable
              testID="startZingSpaceLiveBtn"
              accessibilityRole="button"
              accessibilityLabel="Start ZingSpace live now"
              disabled={isCreating}
              onPress={() => handleCreateSpace('live')}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg, opacity: isCreating ? 0.6 : 1},
              ]}>
              {isCreating ? (
                <ActivityIndicator size="small" color={colors.ctaText} />
              ) : (
                <LiveIcon size="xs" fill={colors.ctaText} />
              )}
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Start ZingSpace Live
              </Text>
            </Pressable>

            <Pressable
              testID="scheduleZingSpaceBtn"
              accessibilityRole="button"
              accessibilityLabel="Schedule ZingSpace for later"
              disabled={isCreating}
              onPress={() => handleCreateSpace('scheduled')}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_md,
                a.py_sm,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <ClockIcon size="xs" fill={colors.text} />
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Schedule ({SCHEDULE_PRESETS.find(p => p.offsetMinutes === scheduleOffsetMin)?.label})
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Network ZingSpaces Directory */}
        <View style={[a.gap_sm]}>
          <View
            style={[
              a.flex_row,
              a.flex_wrap,
              a.align_center,
              a.justify_between,
              a.gap_xs,
            ]}>
            <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
              Sovereign Network ZingSpaces ({spaces.length})
            </Text>

            <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
              {(['all', 'live', 'scheduled', 'ended'] as const).map(tab => {
                const active = statusFilter === tab
                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="button"
                    onPress={() => setStatusFilter(tab)}
                    style={[
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: active
                          ? colors.accentSubtle
                          : colors.card,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        {
                          fontSize: 11,
                          fontWeight: active ? '700' : '600',
                          color: active ? colors.accent : colors.muted,
                        },
                      ]}>
                      {tab.toUpperCase()}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {loadingSpaces ? (
            <View
              style={[
                a.p_lg,
                a.rounded_lg,
                a.align_center,
                a.gap_xs,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Syncing ZingSpaces from Sovereign PDS...
              </Text>
            </View>
          ) : spaces.length === 0 ? (
            <View
              style={[
                a.p_lg,
                a.rounded_lg,
                a.align_center,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                No {statusFilter === 'all' ? '' : statusFilter} ZingSpaces
                found. Launch the first live room above!
              </Text>
            </View>
          ) : (
            spaces.map(space => {
              const isHost = Boolean(viewerDid && space.hostDid === viewerDid)
              const isActive = activeSpaceSlug === space.slug

              return (
                <View
                  key={space.slug}
                  style={[
                    a.p_md,
                    a.rounded_lg,
                    a.gap_xs,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent : colors.border,
                    },
                  ]}>
                  <View
                    style={[a.flex_row, a.align_center, a.justify_between]}>
                    <Text
                      style={[
                        {fontSize: 11, fontWeight: '700'},
                        {
                          color:
                            space.status === 'live'
                              ? colors.rezing
                              : space.status === 'scheduled'
                                ? colors.accent
                                : colors.muted,
                        },
                      ]}>
                      {space.status.toUpperCase()} · {space.topic || 'General'}
                      {space.scheduledFor && space.status === 'scheduled'
                        ? ` · ${formatScheduledTime(space.scheduledFor)}`
                        : ''}
                    </Text>
                    {isHost && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete ZingSpace"
                        onPress={() => handleDeleteSpace(space.slug)}
                        hitSlop={8}>
                        <TrashIcon size="xs" fill={colors.muted} />
                      </Pressable>
                    )}
                  </View>

                  <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                    {space.title}
                  </Text>

                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    Host: @{space.hostHandle} · {space.speakerCount} speakers ·{' '}
                    {space.listenerCount} listeners
                  </Text>

                  <View
                    style={[a.flex_row, a.align_center, a.gap_xs, a.pt_2xs]}>
                    {!isActive && space.status !== 'ended' && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleJoinOrOpenSpace(space)}
                        style={[
                          a.px_md,
                          a.py_2xs,
                          a.rounded_full,
                          {backgroundColor: colors.ctaBg},
                        ]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_bold,
                            {color: colors.ctaText},
                          ]}>
                          {space.status === 'scheduled'
                            ? isHost
                              ? 'Go Live'
                              : 'View Stage'
                            : 'Join Room'}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleShareSpace(space)}
                      style={[
                        a.px_md,
                        a.py_2xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[a.text_xs, {color: colors.accent}]}>
                        Invite via Zing
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* Live #spaces & #live Community Feed Posts */}
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
            <View>
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                Community Announcements (#spaces & #live)
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Public Zings tagged with #spaces and #live across the network
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadLiveDiscovery()}>
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                Refresh
              </Text>
            </Pressable>
          </View>

          {loadingDiscovery ? (
            <View style={[a.p_lg, a.align_center, a.gap_xs]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Loading community announcements...
              </Text>
            </View>
          ) : discoveryPosts.length === 0 ? (
            <View style={[a.p_lg, a.align_center]}>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                No #spaces announcements right now. Start your own room above!
              </Text>
            </View>
          ) : (
            discoveryPosts.map((post, idx) => (
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
                <View
                  style={[a.flex_row, a.align_center, a.justify_between]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      a.text_xs,
                      a.font_bold,
                      a.flex_1,
                      {color: colors.accent},
                    ]}>
                    {stripEmojisAndSymbols(post.displayName)} @{post.handle}
                  </Text>
                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    {post.likeCount} likes · {post.repostCount} rezings
                  </Text>
                </View>
                <Text
                  numberOfLines={2}
                  style={[a.text_sm, a.leading_snug, {color: colors.text}]}>
                  {stripEmojisAndSymbols(post.text)}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
