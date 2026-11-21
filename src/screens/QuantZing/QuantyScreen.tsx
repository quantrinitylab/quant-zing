import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import {AtUri} from '@atproto/syntax'
import {useNavigation, useRoute} from '@react-navigation/native'
import {setStringAsync} from 'expo-clipboard'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  askQuanty,
  fetchLiveNetworkBriefing,
  getQuantZingColors,
  type LiveNetworkBriefing,
  type QuantyEngineOrigin,
  type QuantyMode,
  type QuantyPostContext,
  type QuantySourceCitation,
  type QuantyTrendItem,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {useGetTrendsQuery} from '#/state/queries/trending/useGetTrendsQuery'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {ArrowRotateClockwise_Stroke2_Corner0_Rounded as RefreshIcon} from '#/components/icons/Arrow'
import {Clipboard_Stroke2_Corner2_Rounded as CopyIcon} from '#/components/icons/Clipboard'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {PencilLine_Stroke2_Corner0_Rounded as DraftIcon} from '#/components/icons/Pencil'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trending2_Stroke2_Corner2_Rounded as TrendingIcon} from '#/components/icons/Trending'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

export interface QuantyRouteParams {
  prompt?: string
  postUri?: string
  postText?: string
  authorHandle?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode: QuantyMode
  origin?: QuantyEngineOrigin
  provider?: string
  latencyMs?: number
  citations?: QuantySourceCitation[]
  suggestedZingDraft?: string
  createdAt: string
}

const MODE_OPTIONS: Array<{
  id: QuantyMode
  label: string
}> = [
  {
    id: 'ask',
    label: 'Ask',
  },
  {
    id: 'deepsearch',
    label: 'DeepSearch',
  },
  {
    id: 'drafter',
    label: 'Draft Zing',
  },
  {
    id: 'pulse',
    label: 'News',
  },
]

const FOLLOW_UP_CHIPS: Array<{
  label: string
  prompt: string
  mode: QuantyMode
}> = [
  {
    label: 'Draft a reply',
    prompt: 'Draft a sharp reply under 260 characters based on this analysis',
    mode: 'drafter',
  },
  {
    label: 'Counter-arguments',
    prompt: 'Find the strongest counter-arguments and skeptical takes to this',
    mode: 'deepsearch',
  },
  {
    label: 'Summarize in 1 line',
    prompt: 'Summarize this entire analysis in 1 crisp line',
    mode: 'ask',
  },
]

function readWebFallbackParams(): QuantyRouteParams {
  if (!IS_WEB || typeof window === 'undefined') return {}
  try {
    const sp = new URLSearchParams(window.location.search)
    return {
      prompt: sp.get('prompt') || undefined,
      postUri: sp.get('postUri') || undefined,
      postText: sp.get('postText') || undefined,
      authorHandle: sp.get('authorHandle') || undefined,
    }
  } catch {
    return {}
  }
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function renderInlineFormatted(
  line: string,
  textColor: string,
  mutedColor: string,
  accentColor: string,
) {
  const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text
          key={idx}
          style={[a.text_sm, a.font_bold, {color: textColor}]}>
          {part.slice(2, -2)}
        </Text>
      )
    }
    if (
      ((part.startsWith('_') && part.endsWith('_')) ||
        (part.startsWith('*') && part.endsWith('*'))) &&
      part.length > 2
    ) {
      return (
        <Text
          key={idx}
          style={[a.text_xs, {color: mutedColor, fontStyle: 'italic'}]}>
          {part.slice(1, -1)}
        </Text>
      )
    }
    if (part.includes('@') || part.includes('#')) {
      return (
        <Text key={idx} style={[a.text_sm, {color: textColor}]}>
          {part.split(/(@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_]+)/g).map((seg, j) =>
            seg.startsWith('@') || seg.startsWith('#') ? (
              <Text key={j} style={[a.text_sm, {color: accentColor}]}>
                {seg}
              </Text>
            ) : (
              seg
            ),
          )}
        </Text>
      )
    }
    return (
      <Text key={idx} style={[a.text_sm, {color: textColor}]}>
        {part}
      </Text>
    )
  })
}

function FormattedQuantyText({
  content,
  textColor,
  mutedColor,
  accentColor,
  borderColor,
}: {
  content: string
  textColor: string
  mutedColor: string
  accentColor: string
  borderColor: string
}) {
  const sanitized = stripEmojisAndSymbols(content)
  const lines = sanitized.split('\n')
  return (
    <View style={[a.gap_xs]}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trimEnd()
        if (!line.trim()) {
          return <View key={index} style={{height: 4}} />
        }
        if (line.startsWith('### ') || line.startsWith('## ')) {
          const headingText = line.replace(/^#{2,3}\s+/, '')
          return (
            <Text
              key={index}
              style={[
                a.text_md,
                a.font_bold,
                a.leading_snug,
                {color: textColor, marginTop: index === 0 ? 0 : 8},
              ]}>
              {headingText}
            </Text>
          )
        }
        if (line.startsWith('> ')) {
          return (
            <View
              key={index}
              style={[
                a.pl_sm,
                a.py_2xs,
                {borderLeftWidth: 2, borderLeftColor: accentColor},
              ]}>
              <Text style={[a.text_sm, a.leading_snug, {color: textColor}]}>
                {renderInlineFormatted(
                  line.slice(2),
                  textColor,
                  mutedColor,
                  accentColor,
                )}
              </Text>
            </View>
          )
        }
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/)
        if (numberedMatch) {
          return (
            <View
              key={index}
              style={[a.flex_row, a.align_start, a.gap_xs, {paddingLeft: 2}]}>
              <Text
                style={[
                  a.text_sm,
                  a.font_bold,
                  {color: accentColor, minWidth: 18},
                ]}>
                {numberedMatch[1]}.
              </Text>
              <Text
                style={[a.flex_1, a.text_sm, a.leading_snug, {color: textColor}]}>
                {renderInlineFormatted(
                  numberedMatch[2],
                  textColor,
                  mutedColor,
                  accentColor,
                )}
              </Text>
            </View>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <View
              key={index}
              style={[a.flex_row, a.align_start, a.gap_xs, {paddingLeft: 4}]}>
              <Text style={[a.text_sm, a.font_bold, {color: mutedColor}]}>
                {'-'}
              </Text>
              <Text
                style={[a.flex_1, a.text_sm, a.leading_snug, {color: textColor}]}>
                {renderInlineFormatted(
                  line.slice(2),
                  textColor,
                  mutedColor,
                  accentColor,
                )}
              </Text>
            </View>
          )
        }
        if (line === '---') {
          return (
            <View
              key={index}
              style={{height: 1, backgroundColor: borderColor, marginVertical: 4}}
            />
          )
        }
        return (
          <Text
            key={index}
            style={[a.text_sm, a.leading_snug, {color: textColor}]}>
            {renderInlineFormatted(line, textColor, mutedColor, accentColor)}
          </Text>
        )
      })}
    </View>
  )
}

export function QuantyScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const navigation = useNavigation<NavigationProp>()
  const route = useRoute()
  const {currentAccount, hasSession} = useSession()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()
  const {data: trendsData} = useGetTrendsQuery({limit: 8})

  const routeParams = useMemo<QuantyRouteParams>(() => {
    const raw = (route.params ?? {}) as QuantyRouteParams
    if (raw.prompt || raw.postText || raw.postUri || raw.authorHandle) {
      return raw
    }
    return readWebFallbackParams()
  }, [route.params])

  const trendingTopics = useMemo<QuantyTrendItem[]>(() => {
    const list = trendsData?.trends ?? []
    return list.map(item => ({
      topic: item.topic,
      displayName: item.displayName,
      description: item.description,
      link: item.link,
      category: item.category,
      postCount: item.postCount,
      status: item.status,
    }))
  }, [trendsData])

  const [mode, setMode] = useState<QuantyMode>(
    routeParams.postText ? 'deepsearch' : 'ask',
  )
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [attachedPost, setAttachedPost] = useState<QuantyPostContext | null>(
    () =>
      routeParams.postText
        ? {
            uri: routeParams.postUri,
            text: routeParams.postText,
            authorHandle: routeParams.authorHandle,
          }
        : null,
  )

  const [briefing, setBriefing] = useState<LiveNetworkBriefing | null>(null)
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true)

  const autoRunKeyRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages
  const isSendingRef = useRef(isSending)
  isSendingRef.current = isSending
  const briefingTrendSigRef = useRef<string>('')

  const loadBriefing = useCallback(
    async (trendsOverride?: QuantyTrendItem[]) => {
      setIsLoadingBriefing(true)
      try {
        const next = await fetchLiveNetworkBriefing(
          trendsOverride ?? trendingTopics,
        )
        setBriefing(next)
      } catch {
        // Keep previous briefing if refresh fails
      } finally {
        setIsLoadingBriefing(false)
      }
    },
    [trendingTopics],
  )

  useEffect(() => {
    const sig = trendingTopics
      .slice(0, 5)
      .map(item => item.topic)
      .join('|')
    if (briefing && sig === briefingTrendSigRef.current) return
    if (briefing && !sig) return
    briefingTrendSigRef.current = sig
    void loadBriefing(trendingTopics)
  }, [briefing, loadBriefing, trendingTopics])

  const runQuery = useCallback(
    async (
      promptText: string,
      activeMode: QuantyMode,
      postCtx?: QuantyPostContext | null,
      options?: {resetThread?: boolean; feedUri?: string},
    ) => {
      const cleanPrompt = stripEmojisAndSymbols(
        promptText.trim() ||
          (activeMode === 'pulse'
            ? "Summarize today's top breaking stories on QuantZing"
            : ''),
      )
      if (!cleanPrompt || isSendingRef.current) return

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: cleanPrompt,
        mode: activeMode,
        createdAt: new Date().toISOString(),
      }

      const baseHistory = options?.resetThread
        ? []
        : messagesRef.current.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          }))

      if (options?.resetThread) {
        setMessages([userMsg])
      } else {
        setMessages(prev => [...prev, userMsg])
      }
      setInput('')
      setIsSending(true)
      isSendingRef.current = true

      try {
        const res = await askQuanty({
          prompt: cleanPrompt,
          mode: activeMode,
          ownerId: currentAccount?.did || currentAccount?.handle || undefined,
          postContext: postCtx || undefined,
          history: baseHistory,
          trendingTopics,
          feedUri: options?.feedUri,
        })

        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: stripEmojisAndSymbols(res.answer),
          mode: activeMode,
          origin: res.origin,
          provider: res.provider,
          latencyMs: res.latencyMs,
          citations: res.citations,
          suggestedZingDraft: res.suggestedZingDraft
            ? stripEmojisAndSymbols(res.suggestedZingDraft)
            : undefined,
          createdAt: new Date().toISOString(),
        }

        setMessages(prev => [...prev, assistantMsg])
      } catch {
        Toast.show('Quanty could not complete that request. Please try again.', {
          type: 'error',
        })
      } finally {
        setIsSending(false)
        isSendingRef.current = false
      }
    },
    [currentAccount, trendingTopics],
  )

  // Auto-run when opened from ANY Zing card's sparkle button
  useEffect(() => {
    const key = `${routeParams.postUri || ''}|${routeParams.postText || ''}|${routeParams.prompt || ''}`
    if (!routeParams.postText && !routeParams.prompt) return
    if (autoRunKeyRef.current === key) return
    autoRunKeyRef.current = key

    const ctx: QuantyPostContext | null = routeParams.postText
      ? {
          uri: routeParams.postUri,
          text: stripEmojisAndSymbols(routeParams.postText),
          authorHandle: routeParams.authorHandle,
        }
      : null
    setAttachedPost(ctx)

    const initialMode: QuantyMode = ctx ? 'deepsearch' : 'ask'
    setMode(initialMode)

    const autoPrompt =
      routeParams.prompt ||
      (ctx
        ? `Explain, fact-check, and summarize the context behind @${ctx.authorHandle || 'creator'}'s Zing`
        : '')

    if (autoPrompt) {
      void runQuery(autoPrompt, initialMode, ctx, {resetThread: Boolean(ctx)})
    }
  }, [
    routeParams.authorHandle,
    routeParams.postText,
    routeParams.postUri,
    routeParams.prompt,
    runQuery,
  ])

  const handleCopy = useCallback(
    async (text: string, label = 'Copied Quanty response') => {
      try {
        await setStringAsync(stripEmojisAndSymbols(text))
        Toast.show(label, {type: 'success'})
      } catch {
        Toast.show('Unable to copy to clipboard', {type: 'warning'})
      }
    },
    [],
  )

  const handleSendAsZing = useCallback(
    (msg: ChatMessage) => {
      const draft = stripEmojisAndSymbols(
        msg.suggestedZingDraft ||
          msg.content
            .replace(/^#{1,3}\s+/gm, '')
            .replace(/\*\*/g, '')
            .trim(),
      ).slice(0, 280)

      if (!hasSession) {
        Toast.show('Sign in or create a QuantZing account to send this Zing.', {
          type: 'info',
        })
        requireAuth(() => {
          openComposer({text: draft, logContext: 'Other'})
        })
        return
      }

      openComposer({text: draft, logContext: 'Other'})
    },
    [hasSession, openComposer, requireAuth],
  )

  const handleOpenPostUri = useCallback(
    (rawUri?: string, fallbackHandle?: string) => {
      if (!rawUri) return
      try {
        const uri = new AtUri(rawUri)
        navigation.navigate('PostThread', {
          name: fallbackHandle || uri.host,
          rkey: uri.rkey,
        })
      } catch {
        // Ignore malformed URIs
      }
    },
    [navigation],
  )

  const handleOpenCitation = useCallback(
    (citation: QuantySourceCitation) => {
      handleOpenPostUri(citation.uri, citation.handle)
    },
    [handleOpenPostUri],
  )

  const focusedContextLines = useMemo(() => {
    if (!attachedPost?.text) return []
    return stripEmojisAndSymbols(attachedPost.text)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }, [attachedPost])

  const topStories = useMemo(
    () => (briefing?.stories ?? []).slice(0, 5),
    [briefing],
  )

  return (
    <Layout.Screen
      testID="quantyScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <SparkleIcon size="md" fill={colors.text} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Quanty
            </Layout.Header.TitleText>
          </View>
        </Layout.Header.Content>

        {messages.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            onPress={() => {
              setMessages([])
              setAttachedPost(null)
              setInput('')
            }}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_2xs,
              a.px_sm,
              a.py_2xs,
              a.rounded_full,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <PlusIcon size="xs" fill={colors.text} />
            <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
              New chat
            </Text>
          </Pressable>
        ) : (
          <Layout.Header.Slot />
        )}
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_lg, {paddingBottom: 120}]}>
        {/* Attached Zing Context Card */}
        {attachedPost && (
          <View
            testID="quantyFocusedZingCard"
            style={[
              a.p_md,
              a.rounded_lg,
              a.gap_xs,
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
                a.gap_sm,
              ]}>
              <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
                <SparkleIcon size="xs" fill={colors.accent} />
                <Text
                  numberOfLines={1}
                  style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                  {attachedPost.authorHandle
                    ? `@${attachedPost.authorHandle}`
                    : 'Attached Zing'}
                </Text>
              </View>
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                {attachedPost.uri && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open original Zing"
                    onPress={() =>
                      handleOpenPostUri(
                        attachedPost.uri,
                        attachedPost.authorHandle,
                      )
                    }>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: colors.accent},
                      ]}>
                      View Zing
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove Zing context"
                  onPress={() => setAttachedPost(null)}
                  hitSlop={8}>
                  <CloseIcon size="xs" fill={colors.muted} />
                </Pressable>
              </View>
            </View>
            <View style={[a.gap_2xs]}>
              {focusedContextLines.slice(0, 4).map((line, idx) => {
                const isEmbeddedMeta =
                  /^(Quoted\s+@|Link:|Image alt:|Video alt:|Feed:|List:)/i.test(
                    line,
                  )
                return (
                  <Text
                    key={idx}
                    numberOfLines={idx === 0 ? 3 : 2}
                    style={[
                      isEmbeddedMeta ? a.text_xs : a.text_sm,
                      a.leading_snug,
                      isEmbeddedMeta
                        ? {
                            color: colors.muted,
                            paddingLeft: 8,
                            borderLeftWidth: 2,
                            borderLeftColor: colors.border,
                          }
                        : {color: colors.text},
                    ]}>
                    {line}
                  </Text>
                )
              })}
            </View>
          </View>
        )}

        {/* Home State (Spacious Grok-grade minimal layout) */}
        {messages.length === 0 ? (
          <View style={[a.gap_lg, a.pt_lg]}>
            {/* Centered Quanty Brand Mark */}
            <View style={[a.align_center, a.gap_sm, a.py_md]}>
              <View
                style={[
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    width: 48,
                    height: 48,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <SparkleIcon size="lg" fill={colors.text} />
              </View>
              <Text style={[a.text_2xl, a.font_bold, {color: colors.text}]}>
                Quanty
              </Text>
            </View>

            {/* Sleek Rounded Dark Prompt Input Box */}
            <View style={[a.gap_sm]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_sm,
                  a.px_md,
                  a.py_sm,
                  a.rounded_lg,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask anything"
                  placeholderTextColor={colors.muted}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void runQuery(input, mode, attachedPost)}
                  style={[
                    a.flex_1,
                    a.text_md,
                    {
                      color: colors.text,
                      minHeight: 38,
                    },
                    web({outlineStyle: 'none'} as any),
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send prompt to Quanty"
                  disabled={isSending || (!input.trim() && mode !== 'pulse')}
                  onPress={() => void runQuery(input, mode, attachedPost)}
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 36,
                      height: 36,
                      backgroundColor: colors.ctaBg,
                      opacity:
                        isSending || (!input.trim() && mode !== 'pulse')
                          ? 0.4
                          : 1,
                    },
                  ]}>
                  <SendIcon size="xs" fill={colors.ctaText} />
                </Pressable>
              </View>

              {/* 4 Clean Monochrome Mode Pills */}
              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_center,
                  a.gap_xs,
                ]}>
                {MODE_OPTIONS.map(option => {
                  const active = mode === option.id
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      onPress={() => {
                        setMode(option.id)
                        if (option.id === 'pulse' && !input.trim()) {
                          void runQuery(
                            "Summarize today's top breaking stories on QuantZing",
                            'pulse',
                            attachedPost,
                          )
                        }
                      }}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_xs,
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: active ? colors.ctaBg : colors.card,
                          borderWidth: 1,
                          borderColor: active ? colors.ctaBg : colors.border,
                        },
                      ]}>
                      {option.id === 'ask' && (
                        <SparkleIcon
                          size="xs"
                          fill={active ? colors.ctaText : colors.muted}
                        />
                      )}
                      {option.id === 'deepsearch' && (
                        <SearchIcon
                          size="xs"
                          fill={active ? colors.ctaText : colors.muted}
                        />
                      )}
                      {option.id === 'drafter' && (
                        <DraftIcon
                          size="xs"
                          fill={active ? colors.ctaText : colors.muted}
                        />
                      )}
                      {option.id === 'pulse' && (
                        <TrendingIcon
                          size="xs"
                          fill={active ? colors.ctaText : colors.muted}
                        />
                      )}
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: active ? colors.ctaText : colors.text},
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Clean "Today's News" List */}
            <View testID="quantyTodaysNews" style={[a.gap_sm, a.pt_sm]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.px_xs,
                ]}>
                <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                  {"Today's News"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh Today's News"
                  onPress={() => void loadBriefing(trendingTopics)}
                  hitSlop={8}
                  style={[a.p_2xs, a.rounded_full]}>
                  <RefreshIcon size="xs" fill={colors.muted} />
                </Pressable>
              </View>

              {isLoadingBriefing && !briefing ? (
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_sm,
                    a.p_md,
                    a.rounded_lg,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    {"Loading today's news..."}
                  </Text>
                </View>
              ) : (
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
                  {topStories.map((story, idx) => {
                    const cleanHeadline =
                      stripEmojisAndSymbols(story.headline) || 'Trending Story'
                    const cleanSummary = stripEmojisAndSymbols(story.summary)
                    const cleanCategory = story.category
                      ? stripEmojisAndSymbols(story.category)
                      : null
                    const metaLabel = [
                      cleanCategory,
                      story.postCount
                        ? `${formatCompact(story.postCount)} zings`
                        : story.zingCount > 0
                          ? `${formatCompact(story.zingCount)} zings`
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')

                    return (
                      <Pressable
                        key={story.id}
                        accessibilityRole="button"
                        accessibilityLabel={cleanHeadline}
                        onPress={() => {
                          setMode('pulse')
                          void runQuery(story.prompt, 'pulse', null, {
                            feedUri: story.feedUri,
                          })
                        }}
                        style={[
                          a.p_md,
                          a.gap_2xs,
                          idx > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                          },
                          web({cursor: 'pointer'}),
                        ]}>
                        <View
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.justify_between,
                            a.gap_xs,
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              a.text_sm,
                              a.font_bold,
                              a.flex_1,
                              {color: colors.text},
                            ]}>
                            {cleanHeadline}
                          </Text>
                          {metaLabel ? (
                            <Text style={[a.text_2xs, {color: colors.muted}]}>
                              {metaLabel}
                            </Text>
                          ) : null}
                        </View>
                        {cleanSummary ? (
                          <Text
                            numberOfLines={2}
                            style={[
                              a.text_xs,
                              a.leading_snug,
                              {color: colors.muted},
                            ]}>
                            {cleanSummary}
                          </Text>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Chat State (messages.length > 0) */
          <View style={[a.gap_md]}>
            {messages.map((msg, msgIdx) => {
              if (msg.role === 'user') {
                return (
                  <View key={msg.id} style={[a.align_end]}>
                    <View
                      style={[
                        a.px_md,
                        a.py_sm,
                        a.rounded_lg,
                        {
                          maxWidth: '88%',
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text
                        style={[a.text_sm, a.leading_snug, {color: colors.text}]}>
                        {stripEmojisAndSymbols(msg.content)}
                      </Text>
                    </View>
                  </View>
                )
              }

              const isLatestAssistant = msgIdx === messages.length - 1

              return (
                <View
                  key={msg.id}
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
                  <View
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.justify_between,
                      a.gap_xs,
                    ]}>
                    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                      <SparkleIcon size="xs" fill={colors.text} />
                      <Text
                        style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                        Quanty
                      </Text>
                    </View>
                    {typeof msg.latencyMs === 'number' && (
                      <Text style={[a.text_2xs, {color: colors.muted}]}>
                        {msg.latencyMs}ms
                      </Text>
                    )}
                  </View>

                  <FormattedQuantyText
                    content={msg.content}
                    textColor={colors.text}
                    mutedColor={colors.muted}
                    accentColor={colors.accent}
                    borderColor={colors.border}
                  />

                  {/* Suggested Zing Draft Preview Box */}
                  {msg.suggestedZingDraft && (
                    <View
                      style={[
                        a.p_sm,
                        a.rounded_md,
                        a.gap_2xs,
                        {
                          backgroundColor: colors.bg,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                        ]}>
                        <Text
                          style={[
                            a.text_2xs,
                            a.font_bold,
                            {color: colors.muted},
                          ]}>
                          SUGGESTED ZING
                        </Text>
                        <Text style={[a.text_2xs, {color: colors.muted}]}>
                          {msg.suggestedZingDraft.length}/280
                        </Text>
                      </View>
                      <Text
                        style={[a.text_xs, a.leading_snug, {color: colors.text}]}>
                        {stripEmojisAndSymbols(msg.suggestedZingDraft)}
                      </Text>
                    </View>
                  )}

                  {/* Action Row: Copy + Send as Zing */}
                  <View
                    style={[
                      a.flex_row,
                      a.flex_wrap,
                      a.align_center,
                      a.gap_sm,
                      a.pt_xs,
                      {borderTopWidth: 1, borderTopColor: colors.border},
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy response"
                      onPress={() => void handleCopy(msg.content)}
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
                      <CopyIcon size="xs" fill={colors.text} />
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: colors.text},
                        ]}>
                        Copy
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Send as Zing"
                      onPress={() => handleSendAsZing(msg)}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_xs,
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {backgroundColor: colors.ctaBg},
                      ]}>
                      <SendIcon size="xs" fill={colors.ctaText} />
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.ctaText},
                        ]}>
                        Send as Zing
                      </Text>
                    </Pressable>
                  </View>

                  {/* Follow-up Pills */}
                  {isLatestAssistant && !isSending && (
                    <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                      {FOLLOW_UP_CHIPS.map(chip => (
                        <Pressable
                          key={chip.label}
                          accessibilityRole="button"
                          accessibilityLabel={chip.label}
                          onPress={() => {
                            setMode(chip.mode)
                            void runQuery(chip.prompt, chip.mode, attachedPost)
                          }}
                          style={[
                            a.px_sm,
                            a.py_2xs,
                            a.rounded_full,
                            {
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: colors.border,
                            },
                            web({cursor: 'pointer'}),
                          ]}>
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.text},
                            ]}>
                            {chip.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Source Citations List */}
                  {msg.citations && msg.citations.length > 0 && (
                    <View style={[a.gap_xs, a.pt_xs]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: colors.muted},
                        ]}>
                        Sources ({msg.citations.length})
                      </Text>
                      <View style={[a.gap_xs]}>
                        {msg.citations.slice(0, 5).map(cite => (
                          <Pressable
                            key={cite.uri}
                            accessibilityRole="button"
                            accessibilityLabel={`Open Zing by @${cite.handle}`}
                            onPress={() => handleOpenCitation(cite)}
                            style={[
                              a.p_sm,
                              a.rounded_md,
                              a.gap_2xs,
                              {
                                backgroundColor: colors.bg,
                                borderWidth: 1,
                                borderColor: colors.border,
                              },
                              web({cursor: 'pointer'}),
                            ]}>
                            <View
                              style={[
                                a.flex_row,
                                a.align_center,
                                a.justify_between,
                                a.gap_xs,
                              ]}>
                              <View
                                style={[
                                  a.flex_row,
                                  a.align_center,
                                  a.gap_2xs,
                                  a.flex_1,
                                ]}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    a.text_xs,
                                    a.font_bold,
                                    {color: colors.text},
                                  ]}>
                                  {stripEmojisAndSymbols(cite.displayName)} @
                                  {cite.handle}
                                </Text>
                                {cite.isVerified && (
                                  <VerifiedCheck
                                    size="xs"
                                    fill={colors.accent}
                                  />
                                )}
                              </View>
                              <Text style={[a.text_2xs, {color: colors.muted}]}>
                                {formatCompact(cite.likeCount)} likes ·{' '}
                                {formatCompact(cite.repostCount)} rezings
                              </Text>
                            </View>
                            <Text
                              numberOfLines={2}
                              style={[
                                a.text_xs,
                                a.leading_snug,
                                {color: colors.muted},
                              ]}>
                              {stripEmojisAndSymbols(cite.text)}
                            </Text>
                            {cite.externalDomain && (
                              <Text
                                numberOfLines={1}
                                style={[a.text_2xs, {color: colors.accent}]}>
                                {cite.externalDomain}
                              </Text>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )
            })}

            {isSending && (
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_sm,
                  a.p_md,
                  a.rounded_lg,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={[a.text_sm, {color: colors.muted}]}>
                  Thinking...
                </Text>
              </View>
            )}

            {/* Bottom Follow-Up Input Bar */}
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.px_md,
                a.py_sm,
                a.rounded_lg,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask follow-up..."
                placeholderTextColor={colors.muted}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={() => void runQuery(input, mode, attachedPost)}
                style={[
                  a.flex_1,
                  a.text_sm,
                  {
                    color: colors.text,
                    minHeight: 36,
                  },
                  web({outlineStyle: 'none'} as any),
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send follow-up to Quanty"
                disabled={isSending || !input.trim()}
                onPress={() => void runQuery(input, mode, attachedPost)}
                style={[
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    width: 34,
                    height: 34,
                    backgroundColor: colors.ctaBg,
                    opacity: isSending || !input.trim() ? 0.4 : 1,
                  },
                ]}>
                <SendIcon size="xs" fill={colors.ctaText} />
              </Pressable>
            </View>
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
