import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Pressable, TextInput, View} from 'react-native'
import {AtUri} from '@atproto/syntax'
import {useNavigation} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  getQuantZingColors,
  type QuantySourceCitation,
  searchLiveZings,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Mute_Stroke2_Corner0_Rounded as MuteIcon} from '#/components/icons/Mute'
import {PaperPlane_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/PaperPlane'
import {RaisingHand4Finger_Stroke2_Corner2_Rounded as HandIcon} from '#/components/icons/RaisingHand'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as SpeakerIcon} from '#/components/icons/Speaker'
import {StreamingLive_Stroke2_Corner0_Rounded as LiveIcon} from '#/components/icons/StreamingLive'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const STORAGE_KEY = 'quantzing_spaces_v1'

interface SavedZingSpace {
  id: string
  roomSlug: string
  title: string
  topics: string[]
  hostHandle: string
  allowRecording: boolean
  coHostEnabled: boolean
  status: 'live' | 'scheduled' | 'ended'
  createdAt: string
}

const SUGGESTED_TOPICS = [
  'AI & Agents',
  'Technology',
  'Markets',
  'Build in Public',
  'Design',
  'Breaking News',
]

const REACTIONS = [
  {id: 'clap', symbol: 'CLAP', label: 'Clap'},
  {id: '100', symbol: '100', label: '100'},
  {id: 'zing', symbol: 'ZING', label: 'Zing'},
  {id: 'heart', symbol: 'LOVE', label: 'Love'},
  {id: 'rocket', symbol: 'BOOST', label: 'Boost'},
]

function loadSpaces(): SavedZingSpace[] {
  if (!IS_WEB || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedZingSpace[]) : []
  } catch {
    return []
  }
}

function persistSpaces(spaces: SavedZingSpace[]) {
  if (!IS_WEB || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces))
  } catch {
    // Ignore storage errors
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ZingSpacesScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const {openComposer} = useOpenComposer()

  const hostHandle = currentAccount?.handle || 'host.quantzing.com'

  // Creator form state
  const [title, setTitle] = useState('')
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'AI & Agents',
  ])
  const [allowRecording, setAllowRecording] = useState(true)
  const [coHostEnabled, setCoHostEnabled] = useState(true)

  // Spaces persistence + active live room
  const [spaces, setSpaces] = useState<SavedZingSpace[]>(() => loadSpaces())
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [micMuted, setMicMuted] = useState(false)
  const [handRaised, setHandRaised] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [recentReactions, setRecentReactions] = useState<
    Array<{id: string; symbol: string}>
  >([])

  // Live #spaces / #live discovery
  const [discoveryPosts, setDiscoveryPosts] = useState<QuantySourceCitation[]>(
    [],
  )
  const [loadingDiscovery, setLoadingDiscovery] = useState(true)

  useEffect(() => {
    persistSpaces(spaces)
  }, [spaces])

  const activeSpace = useMemo(
    () => spaces.find(s => s.id === activeSpaceId) || null,
    [activeSpaceId, spaces],
  )

  useEffect(() => {
    if (!activeSpace) {
      setElapsedSec(0)
      return
    }
    const timer = setInterval(() => {
      setElapsedSec(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [activeSpace])

  const loadLiveDiscovery = useCallback(async () => {
    setLoadingDiscovery(true)
    try {
      const primary = await searchLiveZings('#spaces', 5, 'latest')
      const secondary = await searchLiveZings('#live', 5, 'latest')
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

  const createSpace = useCallback(
    (status: 'live' | 'scheduled') => {
      const cleanTitle = title.trim()
      if (!cleanTitle) {
        Toast.show('Give your ZingSpace a title first', {type: 'warning'})
        return
      }
      const slug = `zs-${Date.now().toString(36)}`
      const record: SavedZingSpace = {
        id: slug,
        roomSlug: slug,
        title: cleanTitle,
        topics: selectedTopics,
        hostHandle,
        allowRecording,
        coHostEnabled,
        status,
        createdAt: new Date().toISOString(),
      }
      setSpaces(prev => [record, ...prev])
      setTitle('')
      if (status === 'live') {
        setActiveSpaceId(record.id)
        setMicMuted(false)
        setHandRaised(false)
        setElapsedSec(0)
        Toast.show('ZingSpace is now live', {
          type: 'success',
        })
      } else {
        Toast.show('ZingSpace scheduled', {type: 'success'})
      }
    },
    [allowRecording, coHostEnabled, hostHandle, selectedTopics, title],
  )

  const handleEndSpace = useCallback(() => {
    if (!activeSpace) return
    setSpaces(prev =>
      prev.map(s => (s.id === activeSpace.id ? {...s, status: 'ended'} : s)),
    )
    setActiveSpaceId(null)
    Toast.show('ZingSpace ended', {type: 'info'})
  }, [activeSpace])

  const handleJoinOrGoLive = useCallback((space: SavedZingSpace) => {
    setSpaces(prev =>
      prev.map(s => (s.id === space.id ? {...s, status: 'live'} : s)),
    )
    setActiveSpaceId(space.id)
    setMicMuted(false)
    setElapsedSec(0)
  }, [])

  const handleDeleteSpace = useCallback(
    (id: string) => {
      if (activeSpaceId === id) setActiveSpaceId(null)
      setSpaces(prev => prev.filter(s => s.id !== id))
    },
    [activeSpaceId],
  )

  const handleShareSpace = useCallback(
    (space: SavedZingSpace) => {
      const tags = space.topics
        .map(tag => `#${tag.replace(/[^a-zA-Z0-9]/g, '')}`)
        .join(' ')
      openComposer({
        text: `Live audio room on QuantZing: "${space.title}" hosted by @${space.hostHandle}. Join the ZingSpace! #spaces #live ${tags}`.slice(
          0,
          295,
        ),
        logContext: 'Other',
      })
    },
    [openComposer],
  )

  const handleTriggerReaction = useCallback((symbol: string) => {
    const id = `r_${Date.now()}_${Math.random()}`
    setRecentReactions(prev => [...prev.slice(-7), {id, symbol}])
  }, [])

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

  const hostInitials = hostHandle.slice(0, 2).toUpperCase()

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
            Live audio rooms and community conversations
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
              <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_2xs,
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {backgroundColor: colors.rezingSubtle},
                  ]}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.rezing,
                    }}
                  />
                  <Text
                    style={[
                      {fontSize: 11, fontWeight: '700', color: colors.rezing},
                    ]}>
                    LIVE · {formatElapsed(elapsedSec)}
                  </Text>
                </View>
                {activeSpace.allowRecording && (
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
                    <Text style={[{fontSize: 11, color: colors.muted}]}>
                      REC ON
                    </Text>
                  </View>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="End Space"
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
            </View>

            <View style={[a.gap_2xs]}>
              <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                {activeSpace.title}
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Live Audio Room · {activeSpace.topics.join(' · ')}
              </Text>
            </View>

            {/* Speaker / Listener Stage Grid */}
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
              {/* Host Stage Avatar */}
              <View style={[a.align_center, a.gap_xs, {width: 96}]}>
                <View
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 60,
                      height: 60,
                      backgroundColor: colors.accentSubtle,
                      borderWidth: 2,
                      borderColor: micMuted ? colors.border : colors.rezing,
                    },
                  ]}>
                  <Text
                    style={[a.text_md, a.font_bold, {color: colors.accent}]}>
                    {hostInitials}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                  @{activeSpace.hostHandle}
                </Text>
                <Text
                  style={[
                    {fontSize: 11},
                    {color: micMuted ? colors.muted : colors.rezing},
                  ]}>
                  {micMuted ? 'Host · Muted' : 'Host · Speaking'}
                </Text>
              </View>

              {/* Co-Host Slot */}
              {activeSpace.coHostEnabled && (
                <View style={[a.align_center, a.gap_xs, {width: 96}]}>
                  <View
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 60,
                        height: 60,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: colors.border,
                      },
                    ]}>
                    <Text
                      style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                      CO-HOST
                    </Text>
                  </View>
                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    Open Slot
                  </Text>
                  <Text style={[{fontSize: 11, color: colors.accent}]}>
                    Invite via Zing
                  </Text>
                </View>
              )}

              {/* Listener Queue / Hand-Raised Indicator */}
              <View style={[a.align_center, a.gap_xs, {width: 96}]}>
                <View
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 60,
                      height: 60,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: handRaised ? colors.accent : colors.border,
                    },
                  ]}>
                  <HandIcon
                    size="md"
                    fill={handRaised ? colors.accent : colors.muted}
                  />
                </View>
                <Text style={[a.text_xs, {color: colors.text}]}>
                  Listeners
                </Text>
                <Text style={[{fontSize: 11, color: colors.muted}]}>
                  {handRaised ? 'Hand raised' : 'Room open'}
                </Text>
              </View>
            </View>

            {/* Recent Reactions Stream */}
            {recentReactions.length > 0 && (
              <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Reactions:
                </Text>
                {recentReactions.map(r => (
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
                      {r.symbol}
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
              <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={micMuted ? 'Unmute mic' : 'Mute mic'}
                  onPress={() => setMicMuted(prev => !prev)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: micMuted
                        ? colors.surface
                        : colors.ctaBg,
                      borderWidth: 1,
                      borderColor: micMuted ? colors.border : colors.ctaBg,
                    },
                  ]}>
                  {micMuted ? (
                    <MuteIcon size="xs" fill={colors.text} />
                  ) : (
                    <SpeakerIcon size="xs" fill={colors.ctaText} />
                  )}
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {color: micMuted ? colors.text : colors.ctaText},
                    ]}>
                    {micMuted ? 'Unmute' : 'Mic Live'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Raise Hand"
                  onPress={() => setHandRaised(prev => !prev)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: handRaised
                        ? colors.accentSubtle
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: handRaised ? colors.accent : colors.border,
                    },
                  ]}>
                  <HandIcon
                    size="xs"
                    fill={handRaised ? colors.accent : colors.text}
                  />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: handRaised ? colors.accent : colors.text},
                    ]}>
                    {handRaised ? 'Hand Raised' : 'Raise Hand'}
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
                    key={reaction.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${reaction.label} reaction`}
                    onPress={() => handleTriggerReaction(reaction.symbol)}
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
                Host real-time audio conversations with your audience
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
                Live Audio
              </Text>
            </View>
          </View>

          <TextInput
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

          {/* Toggles: Allow Recording & Co-Host Mode */}
          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{checked: allowRecording}}
              onPress={() => setAllowRecording(prev => !prev)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: allowRecording ? colors.rezing : colors.border,
                },
              ]}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: allowRecording
                    ? colors.rezing
                    : colors.muted,
                }}
              />
              <Text style={[a.text_xs, {color: colors.text}]}>
                Allow Recording: {allowRecording ? 'On' : 'Off'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{checked: coHostEnabled}}
              onPress={() => setCoHostEnabled(prev => !prev)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: coHostEnabled ? colors.accent : colors.border,
                },
              ]}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: coHostEnabled
                    ? colors.accent
                    : colors.muted,
                }}
              />
              <Text style={[a.text_xs, {color: colors.text}]}>
                Co-Host Mode: {coHostEnabled ? 'On' : 'Off'}
              </Text>
            </Pressable>
          </View>

          {/* Launch Buttons */}
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start ZingSpace live now"
              onPress={() => createSpace('live')}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <LiveIcon size="xs" fill={colors.ctaText} />
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Start ZingSpace Live
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schedule ZingSpace for later"
              onPress={() => createSpace('scheduled')}
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
                Schedule
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Your Persisted & Scheduled ZingSpaces */}
        {spaces.length > 0 && (
          <View style={[a.gap_sm]}>
            <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
              Your ZingSpaces ({spaces.length})
            </Text>
            {spaces.map(space => (
              <View
                key={space.id}
                style={[
                  a.p_md,
                  a.rounded_lg,
                  a.gap_xs,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor:
                      activeSpaceId === space.id
                        ? colors.accent
                        : colors.border,
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
                    {space.status.toUpperCase()} · {space.topics.join(' · ')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete ZingSpace"
                    onPress={() => handleDeleteSpace(space.id)}
                    hitSlop={8}>
                    <TrashIcon size="xs" fill={colors.muted} />
                  </Pressable>
                </View>

                <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                  {space.title}
                </Text>

                <View style={[a.flex_row, a.align_center, a.gap_xs, a.pt_2xs]}>
                  {activeSpaceId !== space.id && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleJoinOrGoLive(space)}
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
                          ? 'Go Live'
                          : 'Reopen Room'}
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
            ))}
          </View>
        )}

        {/* Live #spaces & #live Discovery */}
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
                Live Rooms (#spaces & #live)
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Real-time public broadcasts and community rooms
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
                Loading live rooms...
              </Text>
            </View>
          ) : discoveryPosts.length === 0 ? (
            <View style={[a.p_lg, a.align_center]}>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                No live #spaces announcements right now. Start your own above!
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
