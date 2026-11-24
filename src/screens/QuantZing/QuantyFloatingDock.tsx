import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import {
  CommonActions,
  useNavigation,
  useNavigationState,
} from '@react-navigation/native'

import {
  askQuanty,
  getQuantZingColors,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {
  appendQuantyThreadMessage,
  createQuantyThread,
  getActiveQuantySession,
  QUANTY_SLASH_COMMANDS,
  type QuantySlashCommandHint,
  type QuantyThreadMessage,
  sendQuantyChat,
  setActiveQuantySession,
  subscribeActiveQuantySession,
} from '#/lib/quantos/quantyBridge'
import {getCurrentRoute} from '#/lib/routes/helpers'
import {useSession} from '#/state/session'
import {
  atoms as a,
  useBreakpoints,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {ArrowTop_Stroke2_Corner0_Rounded as ArrowUpIcon} from '#/components/icons/Arrow'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {SquareArrowTopRight_Stroke2_Corner0_Rounded as ExpandIcon} from '#/components/icons/SquareArrowTopRight'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {QuantyActionCard} from '#/components/QuantZing/QuantyActionCard'
import {QuantyMarkdown} from '#/components/QuantZing/QuantyMarkdown'
import {QuantyToolTrace} from '#/components/QuantZing/QuantyToolTrace'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const STARTER_PROMPTS = [
  "What's trending today?",
  'Draft a sharp Zing',
  "Summarize today's news",
]

function DockThinkingDots({color}: {color: string}) {
  const dot1 = useRef(new Animated.Value(0.3)).current
  const dot2 = useRef(new Animated.Value(0.3)).current
  const dot3 = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.3,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 360 - delay)),
        ]),
      )

    const a1 = pulse(dot1, 0)
    const a2 = pulse(dot2, 160)
    const a3 = pulse(dot3, 320)
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
    <View style={[a.flex_row, a.align_center, {gap: 4}]}>
      {[dot1, dot2, dot3].map((anim, idx) => (
        <Animated.View
          key={idx}
          style={{
            width: 5,
            height: 5,
            borderRadius: 99,
            backgroundColor: color,
            opacity: anim,
          }}
        />
      ))}
    </View>
  )
}

export function QuantyFloatingDock({routeName}: {routeName?: string}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {leftNavMinimal} = useLayoutBreakpoints()
  const navigation = useNavigation()
  const {hasSession, currentAccount} = useSession()
  const accessJwt = currentAccount?.accessJwt
  const navRouteName = useNavigationState(state =>
    state ? getCurrentRoute(state).name : '',
  )

  const initialSession = useMemo(() => getActiveQuantySession(), [])

  const [isOpen, setIsOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialSession.threadId,
  )
  const [messages, setMessages] = useState<QuantyThreadMessage[]>(
    () => initialSession.messages,
  )

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null)
  const messagesRef = useRef<QuantyThreadMessage[]>(messages)
  messagesRef.current = messages
  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  activeThreadIdRef.current = activeThreadId

  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])

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

  // Sync with shared session state so conversations carry seamlessly to/from /quanty
  useEffect(() => {
    return subscribeActiveQuantySession(snap => {
      setActiveThreadId(snap.threadId)
      setMessages(snap.messages)
    })
  }, [])

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({animated: true})
      })
    }
  }, [isOpen, messages.length, isLoading])

  const updateSharedMessages = useCallback(
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

  const activeRoute = routeName || navRouteName
  const isOnQuantyRoute =
    activeRoute === 'Quanty' ||
    (IS_WEB &&
      typeof window !== 'undefined' &&
      window.location.pathname.toLowerCase().startsWith('/quanty'))

  const handleOpenFullQuanty = useCallback(
    (carryPrompt?: string) => {
      setIsOpen(false)
      const params = carryPrompt?.trim()
        ? {prompt: carryPrompt.trim()}
        : undefined
      try {
        navigation.dispatch(
          CommonActions.navigate({
            name: 'Quanty',
            params,
          }),
        )
      } catch {
        if (IS_WEB && typeof window !== 'undefined') {
          const query = carryPrompt?.trim()
            ? `?prompt=${encodeURIComponent(carryPrompt.trim())}`
            : ''
          window.location.assign(`/quanty${query}`)
        }
      }
    },
    [navigation],
  )

  const handleQuickSend = useCallback(
    async (overridePrompt?: string) => {
      const text = stripEmojisAndSymbols((overridePrompt ?? prompt).trim())
      if (!text || isLoading) return

      const inferredMode = text.startsWith('/') ? 'control' : 'ask'
      const currentThreadId = activeThreadIdRef.current

      const userMsg: QuantyThreadMessage = {
        id: `qu_${Date.now()}`,
        threadId: currentThreadId || 'local',
        role: 'user',
        content: text,
        mode: inferredMode,
        createdAt: new Date().toISOString(),
      }

      const historySnapshot = messagesRef.current.slice(-4).map(m => ({
        role: m.role,
        content: m.content,
      }))

      const optimistic = [...messagesRef.current, userMsg]
      updateSharedMessages(optimistic, currentThreadId)
      setPrompt('')
      setIsLoading(true)

      try {
        let ensuredThreadId = currentThreadId
        if (hasSession && accessJwt && !ensuredThreadId) {
          const created = await createQuantyThread(
            {
              title: text.slice(0, 72),
              mode: inferredMode,
            },
            accessJwt,
          ).catch(() => null)
          if (created?.id) {
            ensuredThreadId = created.id
          }
        }

        try {
          const res = await sendQuantyChat(
            {
              prompt: text,
              mode: inferredMode,
              history: historySnapshot,
              threadId: ensuredThreadId || undefined,
              allowAutoReadTools: true,
            },
            accessJwt,
          )

          const resolvedThreadId = res.threadId || ensuredThreadId || null
          const assistantMsg: QuantyThreadMessage = {
            id: `qa_${Date.now()}`,
            threadId: resolvedThreadId || 'local',
            role: 'assistant',
            content: stripEmojisAndSymbols(res.answer),
            mode: inferredMode,
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
                content: text,
                mode: inferredMode,
              },
              accessJwt,
            ).catch(() => null)
            await appendQuantyThreadMessage(
              ensuredThreadId,
              {
                role: 'assistant',
                content: assistantMsg.content,
                mode: inferredMode,
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

          updateSharedMessages([...optimistic, assistantMsg], resolvedThreadId)
        } catch {
          const fallback = await askQuanty({
            prompt: text,
            mode: 'ask',
            ownerId:
              currentAccount?.did || currentAccount?.handle || undefined,
            history: historySnapshot,
          })
          const assistantMsg: QuantyThreadMessage = {
            id: `qa_${Date.now()}`,
            threadId: ensuredThreadId || 'local',
            role: 'assistant',
            content: stripEmojisAndSymbols(fallback.answer),
            mode: inferredMode,
            origin: fallback.origin,
            provider: fallback.provider,
            latencyMs: fallback.latencyMs,
            citations: fallback.citations,
            createdAt: new Date().toISOString(),
          }
          updateSharedMessages([...optimistic, assistantMsg], ensuredThreadId)
        }
      } catch {
        const errMsg: QuantyThreadMessage = {
          id: `qe_${Date.now()}`,
          threadId: currentThreadId || 'local',
          role: 'assistant',
          content: 'Unable to reach Quanty right now.',
          mode: inferredMode,
          createdAt: new Date().toISOString(),
        }
        updateSharedMessages([...optimistic, errMsg], currentThreadId)
      } finally {
        setIsLoading(false)
      }
    },
    [
      accessJwt,
      currentAccount?.did,
      currentAccount?.handle,
      hasSession,
      isLoading,
      prompt,
      updateSharedMessages,
    ],
  )

  const slashSuggestions = useMemo<QuantySlashCommandHint[]>(() => {
    const trimmed = prompt.trimStart()
    if (!trimmed.startsWith('/') || trimmed.includes(' ')) return []
    const token = trimmed.toLowerCase()
    return QUANTY_SLASH_COMMANDS.filter(c =>
      c.command.toLowerCase().startsWith(token),
    ).slice(0, 4)
  }, [prompt])

  if (
    !IS_WEB ||
    !gtMobile ||
    isOnQuantyRoute ||
    (!hasSession && leftNavMinimal)
  ) {
    return null
  }

  const isLight = colors.isLight
  const pillBg = hovered ? userBubbleBg : composerBg
  const dockShadow = isLight
    ? '0 10px 32px rgba(15, 20, 25, 0.14)'
    : '0 8px 32px rgba(0, 0, 0, 0.72)'

  if (!isOpen) {
    return (
      <View
        pointerEvents="box-none"
        style={[
          web({
            position: 'fixed',
            right: 20,
            bottom: 18,
            zIndex: 40,
          }),
        ]}>
        <Pressable
          testID="quantyFloatingDockPill"
          accessibilityRole="button"
          accessibilityLabel="Open Quanty"
          onPress={() => setIsOpen(true)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.rounded_full,
            {
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: pillBg,
              borderWidth: 1,
              borderColor: colors.border,
            },
            web({
              boxShadow: dockShadow,
              cursor: 'pointer',
              transition: 'background-color 140ms ease',
            }),
          ]}>
          <SparkleIcon size="sm" fill={colors.text} />
          <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
            Quanty
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View
      testID="quantyFloatingDockDrawer"
      style={[
        a.overflow_hidden,
        {
          width: 380,
          height: 520,
          borderRadius: 20,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        web({
          position: 'fixed',
          right: 20,
          bottom: 18,
          zIndex: 50,
          boxShadow: dockShadow,
        }),
      ]}>
      {/* Minimal Grok Floating Header */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_md,
          {
            height: 48,
            backgroundColor: colors.bg,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <SparkleIcon size="sm" fill={colors.text} />
          <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
            Quanty
          </Text>
        </View>

        <View style={[a.flex_row, a.align_center, {gap: 4}]}>
          {messages.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              onPress={() => updateSharedMessages([], null)}
              hitSlop={8}
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {width: 30, height: 30},
                web({cursor: 'pointer'}),
              ]}>
              <PlusIcon size="xs" fill={colors.muted} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand Quanty"
            onPress={() => handleOpenFullQuanty(prompt)}
            hitSlop={8}
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {width: 30, height: 30},
              web({cursor: 'pointer'}),
            ]}>
            <ExpandIcon size="xs" fill={colors.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Quanty"
            onPress={() => setIsOpen(false)}
            hitSlop={8}
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {width: 30, height: 30},
              web({cursor: 'pointer'}),
            ]}>
            <CloseIcon size="xs" fill={colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* Conversation Body */}
      <ScrollView
        ref={scrollRef}
        style={[a.flex_1]}
        contentContainerStyle={[
          a.p_md,
          a.gap_md,
          messages.length === 0 && {
            flexGrow: 1,
            justifyContent: 'center',
          },
        ]}>
        {messages.length === 0 ? (
          <View style={[a.align_center, a.gap_md, a.py_md]}>
            <View
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 40,
                  height: 40,
                  backgroundColor: composerBg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <SparkleIcon size="md" fill={colors.text} />
            </View>
            <Text
              style={[
                a.text_lg,
                a.font_bold,
                {color: colors.text, letterSpacing: -0.3},
              ]}>
              Ask anything
            </Text>
            <View style={[a.w_full, a.gap_xs, a.pt_xs]}>
              {STARTER_PROMPTS.map((q, idx) => (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityLabel={q}
                  onPress={() => void handleQuickSend(q)}
                  style={[
                    a.px_md,
                    a.rounded_full,
                    a.align_center,
                    {
                      paddingVertical: 9,
                      backgroundColor: composerBg,
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
                    {q}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map(msg => {
            if (msg.role === 'user') {
              return (
                <View key={msg.id} style={[a.align_end]}>
                  <View
                    style={[
                      {
                        maxWidth: '82%',
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 18,
                        backgroundColor: userBubbleBg,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        {color: colors.text, lineHeight: 19},
                      ]}>
                      {stripEmojisAndSymbols(msg.content)}
                    </Text>
                  </View>
                </View>
              )
            }

            return (
              <View key={msg.id} style={[a.gap_xs]}>
                <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
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

                <QuantyToolTrace compact traces={msg.toolTraces} />

                <QuantyMarkdown compact content={msg.content} />

                {msg.proposedActions && msg.proposedActions.length > 0 && (
                  <View style={[a.gap_xs, a.pt_2xs]}>
                    {msg.proposedActions.map(card => (
                      <QuantyActionCard
                        key={card.actionId}
                        compact
                        actionCard={card}
                      />
                    ))}
                  </View>
                )}
              </View>
            )
          })
        )}

        {isLoading && (
          <View style={[a.gap_xs, a.py_2xs]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <SparkleIcon size="xs" fill={colors.text} />
              <DockThinkingDots color={colors.muted} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Silent Power-User Slash Autocomplete */}
      {slashSuggestions.length > 0 && (
        <View
          style={[
            a.mx_sm,
            a.mb_xs,
            a.p_xs,
            a.gap_2xs,
            {
              borderRadius: 14,
              backgroundColor: composerBg,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          {slashSuggestions.map(hint => (
            <Pressable
              key={hint.command}
              accessibilityRole="button"
              accessibilityLabel={`${hint.command} ${hint.title}`}
              onPress={() => {
                if (hint.autoRunOnSelect) {
                  void handleQuickSend(hint.command)
                } else {
                  setPrompt(hint.template)
                }
              }}
              style={[
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.px_sm,
                a.py_xs,
                {borderRadius: 10},
                web({cursor: 'pointer'}),
              ]}>
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                {hint.title}
              </Text>
              <Text style={[a.text_2xs, {color: colors.muted}]}>
                {hint.command}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Clean Grok Composer Card */}
      <View style={[a.px_sm, a.pb_sm, a.pt_2xs]}>
        <View
          style={[
            a.flex_row,
            a.align_end,
            a.gap_xs,
            {
              paddingLeft: 14,
              paddingRight: 8,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: composerBg,
              borderWidth: 1,
              borderColor: inputFocused ? colors.accent : colors.border,
            },
          ]}>
          <TextInput
            testID="quantyFloatingDockInput"
            value={prompt}
            onChangeText={setPrompt}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask anything"
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
                void handleQuickSend()
              }
            }}
            onSubmitEditing={() => {
              if (!IS_WEB) {
                void handleQuickSend()
              }
            }}
            style={[
              a.flex_1,
              a.text_sm,
              {
                color: colors.text,
                minHeight: 32,
                maxHeight: 96,
                paddingTop: 5,
                paddingBottom: 5,
                lineHeight: 20,
              },
              web({outlineStyle: 'none', resize: 'none'} as any),
            ]}
          />
          <Pressable
            testID="quantyFloatingDockSendBtn"
            accessibilityRole="button"
            accessibilityLabel="Send prompt"
            disabled={isLoading || !prompt.trim()}
            onPress={() => void handleQuickSend()}
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {
                width: 32,
                height: 32,
                backgroundColor: colors.ctaBg,
                opacity: isLoading || !prompt.trim() ? 0.35 : 1,
              },
              web({cursor: 'pointer'}),
            ]}>
            <ArrowUpIcon size="xs" fill={colors.ctaText} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}
