import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
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
  type QuantyMode,
  type QuantyPostContext,
  type QuantySourceCitation,
  type QuantyTrendItem,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {
  appendQuantyThreadMessage,
  createQuantyThread,
  deleteQuantyThread,
  getActiveQuantySession,
  getQuantyThread,
  listQuantyThreads,
  QUANTY_SLASH_COMMANDS,
  type QuantyBridgeMode,
  type QuantySlashCommandHint,
  type QuantyThreadMessage,
  type QuantyThreadSummary,
  sendQuantyChat,
  setActiveQuantySession,
  subscribeActiveQuantySession,
} from '#/lib/quantos/quantyBridge'
import {type NavigationProp} from '#/lib/routes/types'
import {useGetTrendsQuery} from '#/state/queries/trending/useGetTrendsQuery'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {
  ArrowRotateClockwise_Stroke2_Corner0_Rounded as RefreshIcon,
  ArrowTop_Stroke2_Corner0_Rounded as ArrowUpIcon,
} from '#/components/icons/Arrow'
import {Atom_Stroke2_Corner0_Rounded as AtomIcon} from '#/components/icons/Atom'
import {BulletList_Stroke2_Corner0_Rounded as PollIcon} from '#/components/icons/BulletList'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clipboard_Stroke2_Corner2_Rounded as CopyIcon} from '#/components/icons/Clipboard'
import {Clock_Stroke2_Corner0_Rounded as HistoryIcon} from '#/components/icons/Clock'
import {Envelope_Stroke2_Corner0_Rounded as DmIcon} from '#/components/icons/Envelope'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {Growth_Stroke2_Corner0_Rounded as AnalyticsIcon} from '#/components/icons/Growth'
import {PageText_Stroke2_Corner0_Rounded as ArticleIcon} from '#/components/icons/Page'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {PencilLine_Stroke2_Corner0_Rounded as DraftIcon} from '#/components/icons/Pencil'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {Trending2_Stroke2_Corner2_Rounded as TrendingIcon} from '#/components/icons/Trending'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'
import * as Layout from '#/components/Layout'
import {QuantyActionCard} from '#/components/QuantZing/QuantyActionCard'
import {QuantyMarkdown} from '#/components/QuantZing/QuantyMarkdown'
import {QuantyToolTrace} from '#/components/QuantZing/QuantyToolTrace'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

export interface QuantyRouteParams {
  prompt?: string
  postUri?: string
  postText?: string
  authorHandle?: string
}

interface QuickActionItem {
  id: string
  label: string
  subtitle: string
  template?: string
  autoCommand?: string
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'zing',
    label: 'Post a Zing',
    subtitle: 'Draft and confirm a post',
    template: '/zing ',
  },
  {
    id: 'poll',
    label: 'Create Poll',
    subtitle: 'Launch an interactive poll',
    template: '/poll Question | Option 1 | Option 2',
  },
  {
    id: 'article',
    label: 'Draft Article',
    subtitle: 'Write a long-form piece',
    template: '/article Title | ',
  },
  {
    id: 'analytics',
    label: 'My Analytics',
    subtitle: 'Views and engagement',
    autoCommand: '/analytics',
  },
  {
    id: 'trends',
    label: 'Live Trends',
    subtitle: 'Top topics right now',
    autoCommand: '/trends',
  },
  {
    id: 'dm',
    label: 'Send DM',
    subtitle: 'Message an account',
    template: '/dm @handle ',
  },
]

interface StarterPillItem {
  id: string
  label: string
  prompt: string
  mode: QuantyBridgeMode
  signedInCommand?: string
}

const STARTER_PILLS: StarterPillItem[] = [
  {
    id: 'trending',
    label: "What's trending",
    prompt: "What's trending today on QuantZing? Give me a sharp briefing.",
    mode: 'pulse',
  },
  {
    id: 'draft',
    label: 'Draft a Zing',
    prompt:
      'Draft a sharp, original Zing under 260 characters about what people are talking about today.',
    mode: 'drafter',
  },
  {
    id: 'analyze',
    label: 'My analytics',
    prompt:
      'Analyze my QuantZing account engagement and suggest 3 high-impact improvements.',
    mode: 'ask',
    signedInCommand: '/analytics',
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

function toLegacyQuantyMode(mode: QuantyBridgeMode): QuantyMode {
  if (mode === 'control') return 'ask'
  return mode
}

function GrokThinkingIndicator({
  label,
  mutedColor,
  textColor,
}: {
  label: string
  mutedColor: string
  textColor: string
}) {
  const dot1 = useRef(new Animated.Value(0.25)).current
  const dot2 = useRef(new Animated.Value(0.25)).current
  const dot3 = useRef(new Animated.Value(0.25)).current

  useEffect(() => {
    const makePulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.25,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 360 - delay)),
        ]),
      )

    const a1 = makePulse(dot1, 0)
    const a2 = makePulse(dot2, 160)
    const a3 = makePulse(dot3, 320)
    a1.start()
    a2.start()
    a3.start()
    return () => {
      a1.stop()
      a2.stop()
      a3.stop()
    }
  }, [dot1, dot2, dot3])

  return (
    <View style={[a.gap_xs, a.py_xs]}>
      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
        <SparkleIcon size="xs" fill={textColor} />
        <Text style={[a.text_xs, a.font_semi_bold, {color: textColor}]}>
          Quanty
        </Text>
      </View>
      <View style={[a.flex_row, a.align_center, a.gap_sm, {paddingTop: 2}]}>
        <View style={[a.flex_row, a.align_center, {gap: 5}]}>
          {[dot1, dot2, dot3].map((anim, idx) => (
            <Animated.View
              key={idx}
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                backgroundColor: mutedColor,
                opacity: anim,
              }}
            />
          ))}
        </View>
        <Text style={[a.text_xs, {color: mutedColor}]}>{label}</Text>
      </View>
    </View>
  )
}

export function QuantyScreen() {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const navigation = useNavigation<NavigationProp>()
  const route = useRoute()
  const {currentAccount, hasSession} = useSession()
  const accessJwt = currentAccount?.accessJwt
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

  const initialSession = useMemo(() => getActiveQuantySession(), [])

  const [mode, setMode] = useState<QuantyBridgeMode>(
    routeParams.postText ? 'deepsearch' : 'ask',
  )
  const [thinkActive, setThinkActive] = useState(false)
  const [input, setInput] = useState('')
  const [composerFocused, setComposerFocused] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialSession.threadId,
  )
  const [messages, setMessages] = useState<QuantyThreadMessage[]>(
    () => initialSession.messages,
  )
  const [savedThreads, setSavedThreads] = useState<QuantyThreadSummary[]>([])
  const [showThreadsDrawer, setShowThreadsDrawer] = useState(false)
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

  const inputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null)
  const autoRunKeyRef = useRef<string | null>(null)
  const messagesRef = useRef<QuantyThreadMessage[]>(messages)
  messagesRef.current = messages
  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  activeThreadIdRef.current = activeThreadId
  const isSendingRef = useRef(isSending)
  isSendingRef.current = isSending
  const briefingTrendSigRef = useRef<string>('')

  const composerBg =
    colors.mode === 'dark'
      ? '#16181C'
      : colors.mode === 'dim'
        ? '#1E2732'
        : '#F7F9F9'

  const userBubbleBg =
    colors.mode === 'dark'
      ? '#202327'
      : colors.mode === 'dim'
        ? '#273340'
        : '#EFF3F4'

  const activeToggleBg =
    colors.mode === 'dark'
      ? 'rgba(29, 155, 240, 0.16)'
      : colors.mode === 'dim'
        ? 'rgba(29, 155, 240, 0.20)'
        : 'rgba(29, 155, 240, 0.12)'

  const composerShadow = colors.isLight
    ? '0 4px 20px rgba(15, 20, 25, 0.06)'
    : '0 8px 28px rgba(0, 0, 0, 0.32)'

  // Subscribe to shared session state so Floating Dock & QuantyScreen stay synced
  useEffect(() => {
    return subscribeActiveQuantySession(snap => {
      setActiveThreadId(snap.threadId)
      setMessages(snap.messages)
    })
  }, [])

  // Load server-persisted Quanty threads for signed-in users
  const refreshThreads = useCallback(async () => {
    if (!hasSession || !accessJwt) {
      setSavedThreads([])
      return
    }
    try {
      const list = await listQuantyThreads(accessJwt, 25)
      setSavedThreads(list)
    } catch {
      // Ignore transient errors
    }
  }, [accessJwt, hasSession])

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

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

  const updateSessionMessages = useCallback(
    (
      nextMessages: QuantyThreadMessage[],
      nextThreadId: string | null = activeThreadIdRef.current,
    ) => {
      activeThreadIdRef.current = nextThreadId
      messagesRef.current = nextMessages
      setActiveThreadId(nextThreadId)
      setMessages(nextMessages)
      setActiveQuantySession({
        threadId: nextThreadId,
        messages: nextMessages,
      })
    },
    [],
  )

  const handleSelectThread = useCallback(
    async (summary: QuantyThreadSummary) => {
      if (!accessJwt) return
      setShowThreadsDrawer(false)
      try {
        const detail = await getQuantyThread(summary.id, accessJwt)
        if (detail) {
          setMode(detail.thread.mode || 'ask')
          setThinkActive(false)
          if (detail.thread.postContext) {
            setAttachedPost(detail.thread.postContext)
          }
          updateSessionMessages(detail.messages, detail.thread.id)
        }
      } catch {
        Toast.show('Could not load saved chat.', {type: 'warning'})
      }
    },
    [accessJwt, updateSessionMessages],
  )

  const handleDeleteThread = useCallback(
    async (threadIdToDelete: string) => {
      if (!accessJwt) return
      const ok = await deleteQuantyThread(threadIdToDelete, accessJwt)
      if (ok) {
        setSavedThreads(prev =>
          prev.filter(item => item.id !== threadIdToDelete),
        )
        if (activeThreadIdRef.current === threadIdToDelete) {
          updateSessionMessages([], null)
        }
        Toast.show('Deleted chat', {type: 'info'})
      }
    },
    [accessJwt, updateSessionMessages],
  )

  const handleNewChat = useCallback(() => {
    updateSessionMessages([], null)
    setAttachedPost(null)
    setInput('')
    setShowActionsMenu(false)
    setShowThreadsDrawer(false)
  }, [updateSessionMessages])

  const runQuery = useCallback(
    async (
      promptText: string,
      activeMode: QuantyBridgeMode,
      postCtx?: QuantyPostContext | null,
      options?: {resetThread?: boolean; feedUri?: string},
    ) => {
      const cleanPrompt = stripEmojisAndSymbols(
        promptText.trim() ||
          (activeMode === 'pulse'
            ? "Summarize today's top stories on QuantZing"
            : ''),
      )
      if (!cleanPrompt || isSendingRef.current) return

      const effectiveMode: QuantyBridgeMode = cleanPrompt.startsWith('/')
        ? 'control'
        : activeMode

      const currentThreadId = options?.resetThread
        ? null
        : activeThreadIdRef.current

      const userMsg: QuantyThreadMessage = {
        id: `u_${Date.now()}`,
        threadId: currentThreadId || 'local',
        role: 'user',
        content: cleanPrompt,
        mode: effectiveMode,
        createdAt: new Date().toISOString(),
      }

      const baseHistory = options?.resetThread
        ? []
        : messagesRef.current.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          }))

      const optimisticMessages = options?.resetThread
        ? [userMsg]
        : [...messagesRef.current, userMsg]

      updateSessionMessages(optimisticMessages, currentThreadId)
      setInput('')
      setShowActionsMenu(false)
      setIsSending(true)
      isSendingRef.current = true

      try {
        let ensuredThreadId = currentThreadId
        if (hasSession && accessJwt && !ensuredThreadId) {
          const created = await createQuantyThread(
            {
              title: cleanPrompt.slice(0, 72),
              mode: effectiveMode,
              postContext: postCtx || null,
            },
            accessJwt,
          ).catch(() => null)
          if (created?.id) {
            ensuredThreadId = created.id
          }
        }

        let assistantMsg: QuantyThreadMessage

        try {
          const res = await sendQuantyChat(
            {
              prompt: cleanPrompt,
              mode: effectiveMode,
              postContext: postCtx || null,
              history: baseHistory,
              feedUri: options?.feedUri,
              threadId: ensuredThreadId || undefined,
              allowAutoReadTools: true,
            },
            accessJwt,
          )

          const resolvedThreadId = res.threadId || ensuredThreadId || null

          assistantMsg = {
            id: `a_${Date.now()}`,
            threadId: resolvedThreadId || 'local',
            role: 'assistant',
            content: stripEmojisAndSymbols(res.answer),
            mode: effectiveMode,
            origin: res.origin,
            provider: res.provider,
            model: res.model,
            latencyMs: res.latencyMs,
            citations: res.citations,
            toolTraces: res.toolTraces,
            proposedActions: res.proposedActions,
            suggestedZingDraft: res.suggestedZingDraft
              ? stripEmojisAndSymbols(res.suggestedZingDraft)
              : undefined,
            createdAt: new Date().toISOString(),
          }

          if (hasSession && accessJwt && ensuredThreadId && !res.threadId) {
            await appendQuantyThreadMessage(
              ensuredThreadId,
              {
                role: 'user',
                content: cleanPrompt,
                mode: effectiveMode,
              },
              accessJwt,
            ).catch(() => null)
            await appendQuantyThreadMessage(
              ensuredThreadId,
              {
                role: 'assistant',
                content: assistantMsg.content,
                mode: effectiveMode,
                origin: assistantMsg.origin,
                provider: assistantMsg.provider,
                model: assistantMsg.model,
                latencyMs: assistantMsg.latencyMs,
                citations: assistantMsg.citations,
                toolTraces: assistantMsg.toolTraces,
                proposedActions: assistantMsg.proposedActions,
                suggestedZingDraft: assistantMsg.suggestedZingDraft,
              },
              accessJwt,
            ).catch(() => null)
          }

          const finalMessages = [...optimisticMessages, assistantMsg]
          updateSessionMessages(finalMessages, resolvedThreadId)
          if (hasSession && accessJwt) {
            void refreshThreads()
          }
        } catch {
          const fallbackRes = await askQuanty({
            prompt: cleanPrompt,
            mode: toLegacyQuantyMode(effectiveMode),
            ownerId:
              currentAccount?.did || currentAccount?.handle || undefined,
            postContext: postCtx || undefined,
            history: baseHistory,
            trendingTopics,
            feedUri: options?.feedUri,
          })

          assistantMsg = {
            id: `a_${Date.now()}`,
            threadId: ensuredThreadId || 'local',
            role: 'assistant',
            content: stripEmojisAndSymbols(fallbackRes.answer),
            mode: effectiveMode,
            origin: fallbackRes.origin,
            provider: fallbackRes.provider,
            latencyMs: fallbackRes.latencyMs,
            citations: fallbackRes.citations,
            suggestedZingDraft: fallbackRes.suggestedZingDraft
              ? stripEmojisAndSymbols(fallbackRes.suggestedZingDraft)
              : undefined,
            createdAt: new Date().toISOString(),
          }

          const finalMessages = [...optimisticMessages, assistantMsg]
          updateSessionMessages(finalMessages, ensuredThreadId)
        }
      } catch {
        Toast.show('Quanty could not complete that request. Please try again.', {
          type: 'error',
        })
      } finally {
        setIsSending(false)
        isSendingRef.current = false
      }
    },
    [
      accessJwt,
      currentAccount?.did,
      currentAccount?.handle,
      hasSession,
      refreshThreads,
      trendingTopics,
      updateSessionMessages,
    ],
  )

  const handleSubmitCurrent = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    const targetMode: QuantyBridgeMode = trimmed.startsWith('/')
      ? 'control'
      : mode === 'deepsearch'
        ? 'deepsearch'
        : thinkActive
          ? 'deepsearch'
          : mode
    void runQuery(trimmed, targetMode, attachedPost)
  }, [attachedPost, input, mode, runQuery, thinkActive])

  // Auto-run when opened from ANY Zing card's sparkle button or deep-link prompt
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

    const initialMode: QuantyBridgeMode = routeParams.prompt
      ?.trim()
      .startsWith('/')
      ? 'control'
      : ctx
        ? 'deepsearch'
        : 'ask'
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

  const handleSelectSlashCommand = useCallback(
    (hint: QuantySlashCommandHint) => {
      if (hint.autoRunOnSelect) {
        setMode('control')
        void runQuery(hint.command, 'control', attachedPost)
      } else {
        setMode('control')
        setInput(hint.template)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [attachedPost, runQuery],
  )

  const handleSelectQuickAction = useCallback(
    (action: QuickActionItem) => {
      setShowActionsMenu(false)
      if (action.autoCommand) {
        setMode('control')
        void runQuery(action.autoCommand, 'control', attachedPost)
      } else if (action.template) {
        setMode('control')
        setInput(action.template)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [attachedPost, runQuery],
  )

  // Silent power-user slash command autocomplete when input starts with '/'
  const slashMatches = useMemo<QuantySlashCommandHint[]>(() => {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('/')) return []
    const firstToken = trimmed.split(/\s+/)[0].toLowerCase()
    const hasArguments = trimmed.includes(' ')
    if (hasArguments) return []
    return QUANTY_SLASH_COMMANDS.filter(
      cmd =>
        cmd.command.toLowerCase().startsWith(firstToken) ||
        cmd.title.toLowerCase().includes(firstToken.slice(1)),
    ).slice(0, 6)
  }, [input])

  const handleCopy = useCallback(async (msgId: string, text: string) => {
    try {
      await setStringAsync(stripEmojisAndSymbols(text))
      setCopiedMsgId(msgId)
      Toast.show('Copied to clipboard', {type: 'success'})
      setTimeout(() => {
        setCopiedMsgId(prev => (prev === msgId ? null : prev))
      }, 1800)
    } catch {
      Toast.show('Unable to copy to clipboard', {type: 'warning'})
    }
  }, [])

  const handleSendAsZing = useCallback(
    (msg: QuantyThreadMessage) => {
      const draft = stripEmojisAndSymbols(
        msg.suggestedZingDraft ||
          msg.content
            .replace(/^#{1,3}\s+/gm, '')
            .replace(/\*\*/g, '')
            .trim(),
      ).slice(0, 280)

      if (!hasSession) {
        Toast.show('Sign in to post this Zing.', {type: 'info'})
        requireAuth(() => {
          openComposer({text: draft, logContext: 'Other'})
        })
        return
      }

      openComposer({text: draft, logContext: 'Other'})
    },
    [hasSession, openComposer, requireAuth],
  )

  const handleRetryAssistant = useCallback(
    (assistantIndex: number) => {
      if (isSendingRef.current) return
      for (let i = assistantIndex - 1; i >= 0; i--) {
        const candidate = messagesRef.current[i]
        if (candidate?.role === 'user' && candidate.content.trim()) {
          void runQuery(
            candidate.content,
            candidate.mode || mode,
            attachedPost,
          )
          return
        }
      }
    },
    [attachedPost, mode, runQuery],
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

  const handlePressHandle = useCallback(
    (handle: string) => {
      const clean = handle.replace(/^@/, '').trim()
      if (!clean) return
      navigation.navigate('Profile', {name: clean})
    },
    [navigation],
  )

  const handlePressTag = useCallback(
    (tag: string) => {
      const clean = tag.replace(/^#/, '').trim()
      if (!clean) return
      navigation.navigate('Hashtag', {tag: clean})
    },
    [navigation],
  )

  const focusedContextLines = useMemo(() => {
    if (!attachedPost?.text) return []
    return stripEmojisAndSymbols(attachedPost.text)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }, [attachedPost])

  // Max 4 deduplicated editorial news cards
  const topStories = useMemo(() => {
    const seen = new Set<string>()
    const deduped: LiveNetworkBriefing['stories'] = []
    for (const story of briefing?.stories ?? []) {
      const cleanKey =
        stripEmojisAndSymbols(story.headline || '')
          .trim()
          .toLowerCase() || story.id
      if (seen.has(cleanKey)) continue
      seen.add(cleanKey)
      deduped.push(story)
      if (deduped.length >= 4) break
    }
    return deduped
  }, [briefing])

  const renderQuickActionIcon = (id: string) => {
    switch (id) {
      case 'zing':
        return <DraftIcon size="xs" fill={colors.text} />
      case 'poll':
        return <PollIcon size="xs" fill={colors.text} />
      case 'article':
        return <ArticleIcon size="xs" fill={colors.text} />
      case 'analytics':
        return <AnalyticsIcon size="xs" fill={colors.text} />
      case 'trends':
        return <TrendingIcon size="xs" fill={colors.text} />
      case 'dm':
        return <DmIcon size="xs" fill={colors.text} />
      default:
        return <SparkleIcon size="xs" fill={colors.text} />
    }
  }

  const renderSlashAutocomplete = () => {
    if (slashMatches.length === 0) return null
    return (
      <View
        testID="quantySlashAutocomplete"
        style={[
          a.p_xs,
          a.gap_2xs,
          {
            borderRadius: 16,
            backgroundColor: composerBg,
            borderWidth: 1,
            borderColor: colors.border,
          },
          web({boxShadow: composerShadow}),
        ]}>
        {slashMatches.map(hint => (
          <Pressable
            key={hint.command}
            accessibilityRole="button"
            accessibilityLabel={`${hint.command} ${hint.title}`}
            onPress={() => handleSelectSlashCommand(hint)}
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              a.gap_sm,
              a.px_sm,
              a.py_xs,
              {borderRadius: 10},
              web({cursor: 'pointer'}),
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                {hint.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[a.text_xs, a.flex_1, {color: colors.muted}]}>
                {hint.description}
              </Text>
            </View>
            <Text style={[a.text_2xs, a.font_semi_bold, {color: colors.muted}]}>
              {hint.command}
            </Text>
          </Pressable>
        ))}
      </View>
    )
  }

  const renderActionsPopover = () => {
    if (!showActionsMenu) return null
    return (
      <View
        testID="quantyActionsPopover"
        style={[
          a.p_xs,
          a.gap_2xs,
          {
            borderRadius: 16,
            backgroundColor: composerBg,
            borderWidth: 1,
            borderColor: colors.border,
          },
          web({boxShadow: composerShadow}),
        ]}>
        <View
          style={[
            gtMobile
              ? web({
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: 6,
                } as any)
              : [a.gap_xs],
          ]}>
          {QUICK_ACTIONS.map(action => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => handleSelectQuickAction(action)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.px_sm,
                a.py_sm,
                {
                  borderRadius: 12,
                  backgroundColor: colors.bg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                web({cursor: 'pointer'}),
              ]}>
              <View
                style={[
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    width: 30,
                    height: 30,
                    backgroundColor: composerBg,
                  },
                ]}>
                {renderQuickActionIcon(action.id)}
              </View>
              <View style={[a.flex_1]}>
                <Text
                  numberOfLines={1}
                  style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                  {action.label}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[a.text_2xs, {color: colors.muted}]}>
                  {action.subtitle}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    )
  }

  const renderGrokComposer = (variant: 'home' | 'chat') => {
    const isDeepSearch = mode === 'deepsearch'
    const canSend = !isSending && input.trim().length > 0

    return (
      <View style={[a.w_full, a.gap_xs]}>
        {renderSlashAutocomplete()}
        {variant === 'chat' && renderActionsPopover()}

        <View
          style={[
            {
              borderRadius: 24,
              backgroundColor: composerBg,
              borderWidth: 1,
              borderColor: composerFocused ? colors.accent : colors.border,
              paddingHorizontal: 16,
              paddingTop: variant === 'home' ? 14 : 11,
              paddingBottom: 10,
              gap: variant === 'home' ? 10 : 8,
            },
            web({
              boxShadow: composerFocused
                ? `0 0 0 1px rgba(29, 155, 240, 0.25), ${composerShadow}`
                : composerShadow,
              transition: 'border-color 140ms ease, box-shadow 140ms ease',
            }),
          ]}>
          <TextInput
            ref={inputRef}
            testID={
              variant === 'home' ? 'quantyPromptInput' : 'quantyFollowUpInput'
            }
            value={input}
            onChangeText={val => {
              setInput(val)
              if (val.startsWith('/') && showActionsMenu) {
                setShowActionsMenu(false)
              }
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            placeholder={variant === 'home' ? 'Ask anything' : 'Ask a follow-up'}
            placeholderTextColor={colors.muted}
            multiline={true}
            returnKeyType="send"
            onKeyPress={(e: any) => {
              if (
                IS_WEB &&
                e?.nativeEvent?.key === 'Enter' &&
                !e?.nativeEvent?.shiftKey &&
                !e?.shiftKey
              ) {
                e.preventDefault?.()
                handleSubmitCurrent()
              }
            }}
            onSubmitEditing={() => {
              if (!IS_WEB) {
                handleSubmitCurrent()
              }
            }}
            style={[
              {
                color: colors.text,
                fontSize: variant === 'home' ? 16 : 15,
                lineHeight: 22,
                minHeight: variant === 'home' ? 52 : 36,
                maxHeight: 160,
                paddingTop: 2,
                paddingBottom: 2,
                textAlignVertical: 'top',
              },
              web({outlineStyle: 'none', resize: 'none'} as any),
            ]}
          />

          {/* Bottom Bar Inside Composer Card */}
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              a.gap_xs,
            ]}>
            <View style={[a.flex_row, a.align_center, {gap: 6}]}>
              {/* DeepSearch Toggle */}
              <Pressable
                testID="quantyDeepSearchToggle"
                accessibilityRole="button"
                accessibilityLabel="Toggle DeepSearch"
                accessibilityState={{selected: isDeepSearch}}
                onPress={() => {
                  setThinkActive(false)
                  setMode(prev => (prev === 'deepsearch' ? 'ask' : 'deepsearch'))
                }}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.rounded_full,
                  {
                    gap: 5,
                    height: 32,
                    paddingHorizontal: 11,
                    backgroundColor: isDeepSearch
                      ? activeToggleBg
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: isDeepSearch ? colors.accent : colors.border,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <GlobeIcon
                  size="xs"
                  fill={isDeepSearch ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    a.text_xs,
                    a.font_semi_bold,
                    {color: isDeepSearch ? colors.accent : colors.text},
                  ]}>
                  DeepSearch
                </Text>
              </Pressable>

              {/* Think Toggle */}
              <Pressable
                testID="quantyThinkToggle"
                accessibilityRole="button"
                accessibilityLabel="Toggle Think"
                accessibilityState={{selected: thinkActive}}
                onPress={() => {
                  setThinkActive(prev => {
                    const next = !prev
                    if (next) setMode('ask')
                    return next
                  })
                }}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.rounded_full,
                  {
                    gap: 5,
                    height: 32,
                    paddingHorizontal: 11,
                    backgroundColor: thinkActive
                      ? activeToggleBg
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: thinkActive ? colors.accent : colors.border,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <AtomIcon
                  size="xs"
                  fill={thinkActive ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    a.text_xs,
                    a.font_semi_bold,
                    {color: thinkActive ? colors.accent : colors.text},
                  ]}>
                  Think
                </Text>
              </Pressable>

              {/* Subtle + Actions Popover Button */}
              <Pressable
                testID="quantyActionsToggle"
                accessibilityRole="button"
                accessibilityLabel="Actions"
                accessibilityState={{expanded: showActionsMenu}}
                onPress={() => setShowActionsMenu(prev => !prev)}
                style={[
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    width: 32,
                    height: 32,
                    backgroundColor: showActionsMenu
                      ? activeToggleBg
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: showActionsMenu
                      ? colors.accent
                      : colors.border,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <PlusIcon
                  size="xs"
                  fill={showActionsMenu ? colors.accent : colors.text}
                />
              </Pressable>
            </View>

            {/* Circular Grok Send Button */}
            <Pressable
              testID={
                variant === 'home' ? 'quantySendBtn' : 'quantyFollowUpSendBtn'
              }
              accessibilityRole="button"
              accessibilityLabel="Send prompt to Quanty"
              disabled={!canSend}
              onPress={handleSubmitCurrent}
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 36,
                  height: 36,
                  backgroundColor: colors.ctaBg,
                  opacity: canSend ? 1 : 0.35,
                },
                web({
                  cursor: canSend ? 'pointer' : 'default',
                  transition: 'opacity 140ms ease',
                }),
              ]}>
              <ArrowUpIcon size="sm" fill={colors.ctaText} />
            </Pressable>
          </View>
        </View>

        {variant === 'home' && renderActionsPopover()}
      </View>
    )
  }

  const isEmpty = messages.length === 0

  return (
    <Layout.Screen testID="quantyScreen" style={{backgroundColor: colors.bg}}>
      {/* Minimalist 52px Grok Top Header */}
      <Layout.Header.Outer noBottomBorder={isEmpty}>
        <View style={[a.flex_row, a.align_center, {gap: 2, minWidth: 72}]}>
          {navigation.canGoBack() && <Layout.Header.BackButton />}
          {hasSession && (
            <Pressable
              testID="quantyThreadsDrawerToggle"
              accessibilityRole="button"
              accessibilityLabel="Chat history"
              onPress={() => setShowThreadsDrawer(prev => !prev)}
              hitSlop={8}
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 34,
                  height: 34,
                  backgroundColor: showThreadsDrawer
                    ? userBubbleBg
                    : 'transparent',
                },
                web({cursor: 'pointer'}),
              ]}>
              <HistoryIcon
                size="sm"
                fill={showThreadsDrawer ? colors.text : colors.muted}
              />
            </Pressable>
          )}
        </View>

        {/* Centered Quanty 3 Badge */}
        <View style={[a.flex_1, a.align_center, a.justify_center]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.rounded_full,
              {
                gap: 6,
                paddingHorizontal: 13,
                paddingVertical: 5,
                backgroundColor: composerBg,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <SparkleIcon size="xs" fill={colors.text} />
            <Text
              style={[
                a.text_xs,
                a.font_bold,
                {color: colors.text, letterSpacing: -0.1},
              ]}>
              Quanty 3
            </Text>
          </View>
        </View>

        {/* Right: Clean + New Chat Icon Button */}
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_end,
            {minWidth: 72},
          ]}>
          <Pressable
            testID="quantyNewChatBtn"
            accessibilityRole="button"
            accessibilityLabel="New chat"
            onPress={handleNewChat}
            hitSlop={8}
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {
                width: 34,
                height: 34,
                opacity: isEmpty && !attachedPost && !input ? 0.4 : 1,
              },
              web({cursor: 'pointer'}),
            ]}>
            <PlusIcon size="md" fill={colors.text} />
          </Pressable>
        </View>
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[
          a.px_md,
          {paddingTop: isEmpty ? (gtMobile ? 36 : 20) : 16, paddingBottom: 120},
        ]}>
        <View
          style={[
            a.w_full,
            a.gap_lg,
            {maxWidth: 680, alignSelf: 'center'},
          ]}>
          {/* Server-Persisted Chat History Drawer */}
          {showThreadsDrawer && (
            <View
              testID="quantySavedThreadsList"
              style={[
                a.p_md,
                a.gap_xs,
                {
                  borderRadius: 16,
                  backgroundColor: composerBg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.pb_2xs,
                ]}>
                <Text
                  style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                  Recent chats
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close chat history"
                  onPress={() => setShowThreadsDrawer(false)}
                  hitSlop={8}
                  style={[web({cursor: 'pointer'})]}>
                  <CloseIcon size="xs" fill={colors.muted} />
                </Pressable>
              </View>

              {savedThreads.length === 0 ? (
                <Text style={[a.text_xs, a.py_xs, {color: colors.muted}]}>
                  No saved chats yet.
                </Text>
              ) : (
                savedThreads.slice(0, 10).map(thread => {
                  const isCurrent = thread.id === activeThreadId
                  return (
                    <View
                      key={thread.id}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.justify_between,
                        a.gap_xs,
                        a.px_sm,
                        a.py_xs,
                        {
                          borderRadius: 12,
                          backgroundColor: isCurrent
                            ? userBubbleBg
                            : 'transparent',
                        },
                      ]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={thread.title}
                        onPress={() => void handleSelectThread(thread)}
                        style={[a.flex_1, a.gap_2xs, web({cursor: 'pointer'})]}>
                        <Text
                          numberOfLines={1}
                          style={[
                            a.text_sm,
                            a.font_semi_bold,
                            {color: colors.text},
                          ]}>
                          {stripEmojisAndSymbols(thread.title)}
                        </Text>
                        <Text style={[a.text_2xs, {color: colors.muted}]}>
                          {thread.messageCount}{' '}
                          {thread.messageCount === 1 ? 'message' : 'messages'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat ${thread.title}`}
                        onPress={() => void handleDeleteThread(thread.id)}
                        hitSlop={8}
                        style={[a.p_xs, web({cursor: 'pointer'})]}>
                        <TrashIcon size="xs" fill={colors.muted} />
                      </Pressable>
                    </View>
                  )
                })
              )}
            </View>
          )}

          {/* Attached Zing Context Card */}
          {attachedPost && (
            <View
              testID="quantyFocusedZingCard"
              style={[
                a.p_md,
                a.gap_xs,
                {
                  borderRadius: 16,
                  backgroundColor: composerBg,
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
                      }
                      style={[web({cursor: 'pointer'})]}>
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
                    hitSlop={8}
                    style={[web({cursor: 'pointer'})]}>
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

          {/* Grok Signature Empty / Welcome State */}
          {isEmpty ? (
            <View style={[a.gap_xl]}>
              {/* Centered Brand Mark & Crisp Title */}
              <View style={[a.align_center, a.gap_md, {paddingTop: gtMobile ? 16 : 6}]}>
                <View
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 44,
                      height: 44,
                      backgroundColor: composerBg,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <SparkleIcon size="lg" fill={colors.text} />
                </View>
                <Text
                  style={[
                    a.font_bold,
                    a.text_center,
                    {
                      fontSize: gtMobile ? 30 : 26,
                      lineHeight: gtMobile ? 36 : 32,
                      letterSpacing: -0.5,
                      color: colors.text,
                    },
                  ]}>
                  Ask anything
                </Text>
              </View>

              {/* Grok Signature Elevated Composer Card */}
              <View style={[a.gap_md]}>
                {renderGrokComposer('home')}

                {/* 3 Clean Centered Starter Pills (Fits 360px+ With Zero Clipping) */}
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_center,
                    {
                      flexWrap: 'wrap',
                      gap: 8,
                      paddingVertical: 2,
                    },
                  ]}>
                  {STARTER_PILLS.map(pill => (
                    <Pressable
                      key={pill.id}
                      accessibilityRole="button"
                      accessibilityLabel={pill.label}
                      onPress={() => {
                        if (pill.signedInCommand && hasSession) {
                          setMode('control')
                          void runQuery(
                            pill.signedInCommand,
                            'control',
                            attachedPost,
                          )
                        } else {
                          setMode(pill.mode)
                          void runQuery(pill.prompt, pill.mode, attachedPost)
                        }
                      }}
                      style={[
                        a.rounded_full,
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: composerBg,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                        web({cursor: 'pointer'}),
                      ]}>
                      <Text
                        numberOfLines={1}
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: colors.text},
                        ]}>
                        {pill.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Editorial Today's News Section (Max 4 Deduplicated Cards) */}
              <View
                testID="quantyTodaysNews"
                style={[a.gap_sm, {paddingTop: gtMobile ? 12 : 4}]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.px_2xs,
                  ]}>
                  <Text
                    style={[
                      a.text_sm,
                      a.font_bold,
                      {color: colors.text, letterSpacing: -0.1},
                    ]}>
                    {"Today's News"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh Today's News"
                    onPress={() => void loadBriefing(trendingTopics)}
                    hitSlop={8}
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {width: 28, height: 28},
                      web({cursor: 'pointer'}),
                    ]}>
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
                      {
                        borderRadius: 16,
                        backgroundColor: composerBg,
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
                      gtMobile
                        ? web({
                            display: 'grid',
                            gridTemplateColumns:
                              'minmax(0, 1fr) minmax(0, 1fr)',
                            gap: 10,
                          } as any)
                        : [a.gap_sm],
                    ]}>
                    {topStories.map(story => {
                      const cleanHeadline =
                        stripEmojisAndSymbols(story.headline) ||
                        'Trending Story'
                      const cleanSummary = stripEmojisAndSymbols(story.summary)
                      const countVal = story.postCount || story.zingCount || 0
                      const countLabel =
                        countVal > 0
                          ? `${formatCompact(countVal)} ${countVal === 1 ? 'Zing' : 'Zings'}`
                          : null

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
                            a.gap_xs,
                            {
                              borderRadius: 16,
                              backgroundColor: composerBg,
                              borderWidth: 1,
                              borderColor: colors.border,
                            },
                            web({cursor: 'pointer'}),
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              a.text_sm,
                              a.font_bold,
                              {color: colors.text, lineHeight: 20},
                            ]}>
                            {cleanHeadline}
                          </Text>
                          {cleanSummary ? (
                            <Text
                              numberOfLines={1}
                              style={[
                                a.text_xs,
                                {color: colors.muted, lineHeight: 18},
                              ]}>
                              {cleanSummary}
                            </Text>
                          ) : null}
                          {countLabel ? (
                            <Text
                              style={[
                                a.text_2xs,
                                a.font_semi_bold,
                                {color: colors.muted, paddingTop: 2},
                              ]}>
                              {countLabel}
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
            /* Grok Editorial Conversation View */
            <View style={[a.gap_xl]}>
              <View style={[a.gap_xl]}>
                {messages.map((msg, msgIdx) => {
                  if (msg.role === 'user') {
                    return (
                      <View key={msg.id} style={[a.align_end]}>
                        <View
                          style={[
                            {
                              maxWidth: '80%',
                              paddingHorizontal: 16,
                              paddingVertical: 11,
                              borderRadius: 20,
                              backgroundColor: userBubbleBg,
                            },
                          ]}>
                          <Text
                            style={[
                              a.text_sm,
                              {
                                color: colors.text,
                                fontSize: 15,
                                lineHeight: 22,
                              },
                            ]}>
                            {stripEmojisAndSymbols(msg.content)}
                          </Text>
                        </View>
                      </View>
                    )
                  }

                  const isCopied = copiedMsgId === msg.id

                  return (
                    <View key={msg.id} style={[a.gap_sm]}>
                      {/* Clean Borderless Quanty Header */}
                      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                        <SparkleIcon size="xs" fill={colors.text} />
                        <Text
                          style={[
                            a.text_xs,
                            a.font_semi_bold,
                            {color: colors.text},
                          ]}>
                          Quanty
                        </Text>
                      </View>

                      {/* Whisper-quiet tool trace caption (hidden if no tools ran) */}
                      <QuantyToolTrace traces={msg.toolTraces} />

                      {/* Borderless Editorial Markdown Body */}
                      <View style={{paddingVertical: 2}}>
                        <QuantyMarkdown
                          content={msg.content}
                          citations={msg.citations}
                          onPressCitation={handleOpenCitation}
                          onPressHandle={handlePressHandle}
                          onPressTag={handlePressTag}
                        />
                      </View>

                      {/* Native X/Grok Action Confirmation Cards */}
                      {msg.proposedActions &&
                        msg.proposedActions.length > 0 && (
                          <View style={[a.gap_sm, a.pt_xs]}>
                            {msg.proposedActions.map(actionCard => (
                              <QuantyActionCard
                                key={actionCard.actionId}
                                actionCard={actionCard}
                              />
                            ))}
                          </View>
                        )}

                      {/* Optional Suggested Zing Preview */}
                      {msg.suggestedZingDraft && (
                        <View
                          style={[
                            a.p_md,
                            a.gap_xs,
                            {
                              borderRadius: 16,
                              backgroundColor: composerBg,
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
                                a.font_semi_bold,
                                {color: colors.muted},
                              ]}>
                              Suggested Zing
                            </Text>
                            <Text style={[a.text_2xs, {color: colors.muted}]}>
                              {msg.suggestedZingDraft.length}/280
                            </Text>
                          </View>
                          <Text
                            style={[
                              a.text_sm,
                              {color: colors.text, lineHeight: 21},
                            ]}>
                            {stripEmojisAndSymbols(msg.suggestedZingDraft)}
                          </Text>
                        </View>
                      )}

                      {/* Sources Strip */}
                      {msg.citations && msg.citations.length > 0 && (
                        <View style={[a.gap_xs, a.pt_xs]}>
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.muted},
                            ]}>
                            Sources
                          </Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={[a.flex_row, {gap: 8}]}>
                            {msg.citations.slice(0, 5).map(cite => (
                              <Pressable
                                key={cite.uri}
                                accessibilityRole="button"
                                accessibilityLabel={`Open Zing by @${cite.handle}`}
                                onPress={() => handleOpenCitation(cite)}
                                style={[
                                  a.p_sm,
                                  a.gap_2xs,
                                  {
                                    width: 220,
                                    borderRadius: 14,
                                    backgroundColor: composerBg,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                  },
                                  web({cursor: 'pointer'}),
                                ]}>
                                <View
                                  style={[
                                    a.flex_row,
                                    a.align_center,
                                    a.gap_2xs,
                                  ]}>
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      a.text_xs,
                                      a.font_bold,
                                      a.flex_1,
                                      {color: colors.text},
                                    ]}>
                                    @{cite.handle}
                                  </Text>
                                  {cite.isVerified && (
                                    <VerifiedCheck
                                      size="xs"
                                      fill={colors.accent}
                                    />
                                  )}
                                </View>
                                <Text
                                  numberOfLines={2}
                                  style={[
                                    a.text_2xs,
                                    {color: colors.muted, lineHeight: 16},
                                  ]}>
                                  {stripEmojisAndSymbols(cite.text)}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {/* Minimal Editorial Action Bar: Copy · Post as Zing · Retry */}
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          {gap: 4, paddingTop: 2},
                        ]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Copy response"
                          onPress={() => void handleCopy(msg.id, msg.content)}
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.rounded_full,
                            {
                              gap: 5,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            },
                            web({cursor: 'pointer'}),
                          ]}>
                          {isCopied ? (
                            <CheckIcon size="xs" fill={colors.rezing} />
                          ) : (
                            <CopyIcon size="xs" fill={colors.muted} />
                          )}
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {
                                color: isCopied ? colors.rezing : colors.muted,
                              },
                            ]}>
                            {isCopied ? 'Copied' : 'Copy'}
                          </Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Post as Zing"
                          onPress={() => handleSendAsZing(msg)}
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.rounded_full,
                            {
                              gap: 5,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            },
                            web({cursor: 'pointer'}),
                          ]}>
                          <SendIcon size="xs" fill={colors.muted} />
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.muted},
                            ]}>
                            Post as Zing
                          </Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Retry response"
                          disabled={isSending}
                          onPress={() => handleRetryAssistant(msgIdx)}
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.rounded_full,
                            {
                              gap: 5,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              opacity: isSending ? 0.45 : 1,
                            },
                            web({cursor: 'pointer'}),
                          ]}>
                          <RefreshIcon size="xs" fill={colors.muted} />
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.muted},
                            ]}>
                            Retry
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )
                })}

                {isSending && (
                  <GrokThinkingIndicator
                    label={
                      mode === 'deepsearch'
                        ? 'Searching...'
                        : thinkActive
                          ? 'Thinking deeply...'
                          : 'Thinking...'
                    }
                    mutedColor={colors.muted}
                    textColor={colors.text}
                  />
                )}
              </View>

              {/* Elevated Grok Follow-Up Composer */}
              <View style={{paddingTop: 4}}>
                {renderGrokComposer('chat')}
              </View>
            </View>
          )}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
