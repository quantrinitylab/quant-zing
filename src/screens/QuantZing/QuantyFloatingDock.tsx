import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
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
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
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
  'What is trending on QuantZing right now?',
  "Summarize today's top stories",
  'Draft a sharp Zing about AI',
]

const QUICK_SLASH_CHIPS = ['/trends', '/zing ', '/analytics', '/search ']

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
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialSession.threadId,
  )
  const [messages, setMessages] = useState<QuantyThreadMessage[]>(
    () => initialSession.messages,
  )

  const messagesRef = useRef<QuantyThreadMessage[]>(messages)
  messagesRef.current = messages
  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  activeThreadIdRef.current = activeThreadId

  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])

  // Sync with shared session state so conversations carry seamlessly to/from /quanty
  useEffect(() => {
    return subscribeActiveQuantySession(snap => {
      setActiveThreadId(snap.threadId)
      setMessages(snap.messages)
    })
  }, [])

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
  const pillBg = hovered ? colors.surface : colors.card
  const pillBorder = colors.border
  const dockShadow = isLight
    ? '0 8px 24px rgba(15, 20, 25, 0.14)'
    : '0 4px 18px rgba(0, 0, 0, 0.72)'

  if (!isOpen) {
    return (
      <View
        pointerEvents="box-none"
        style={[
          web({
            position: 'fixed',
            right: 20,
            bottom: 16,
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
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: pillBg,
              borderWidth: 1,
              borderColor: pillBorder,
            },
            web({
              boxShadow: dockShadow,
              cursor: 'pointer',
              transition: 'background-color 140ms ease, transform 140ms ease',
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
        a.rounded_lg,
        a.overflow_hidden,
        {
          width: 370,
          height: 480,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        web({
          position: 'fixed',
          right: 20,
          bottom: 16,
          zIndex: 50,
          boxShadow: dockShadow,
        }),
      ]}>
      {/* Drawer Header */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_md,
          a.py_sm,
          {
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <SparkleIcon size="sm" fill={colors.text} />
          <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
            Quanty
          </Text>
          <View
            style={[
              a.px_xs,
              {
                paddingVertical: 1,
                borderRadius: 999,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <Text
              style={[a.text_2xs, a.font_semi_bold, {color: colors.muted}]}>
              21 Tools
            </Text>
          </View>
        </View>

        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          {messages.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear Quanty dock chat"
              onPress={() => updateSharedMessages([], null)}
              hitSlop={8}
              style={[a.p_2xs, a.rounded_full, web({cursor: 'pointer'})]}>
              <PlusIcon size="xs" fill={colors.muted} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand Quanty"
            onPress={() => handleOpenFullQuanty(prompt)}
            hitSlop={8}
            style={[a.p_2xs, a.rounded_full, web({cursor: 'pointer'})]}>
            <ExpandIcon size="xs" fill={colors.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Quanty"
            onPress={() => setIsOpen(false)}
            hitSlop={8}
            style={[a.p_2xs, a.rounded_full, web({cursor: 'pointer'})]}>
            <CloseIcon size="xs" fill={colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* Quick Slash Chips Strip */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_2xs,
          a.px_sm,
          a.py_2xs,
          {
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
        ]}>
        {QUICK_SLASH_CHIPS.map(cmd => (
          <Pressable
            key={cmd}
            accessibilityRole="button"
            accessibilityLabel={cmd.trim()}
            onPress={() => {
              if (cmd.endsWith(' ')) {
                setPrompt(cmd)
              } else {
                void handleQuickSend(cmd)
              }
            }}
            style={[
              a.px_xs,
              {
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              },
              web({cursor: 'pointer'}),
            ]}>
            <Text style={[a.text_2xs, a.font_semi_bold, {color: colors.text}]}>
              {cmd.trim()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Drawer Thread */}
      <ScrollView
        style={[a.flex_1]}
        contentContainerStyle={[a.p_md, a.gap_sm]}>
        {messages.length === 0 ? (
          <View style={[a.gap_sm, a.py_xs]}>
            <Text style={[a.text_xs, {color: colors.muted}]}>
              Ask a question or run a live Sovereign slash command:
            </Text>
            <View style={[a.gap_xs]}>
              {STARTER_PROMPTS.map((q, idx) => (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityLabel={q}
                  onPress={() => void handleQuickSend(q)}
                  style={[
                    a.px_sm,
                    a.py_xs,
                    a.rounded_md,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text style={[a.text_xs, {color: colors.text}]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map(msg => {
            if (msg.role === 'user') {
              return (
                <View
                  key={msg.id}
                  style={[
                    a.p_sm,
                    a.rounded_md,
                    {
                      alignSelf: 'flex-end',
                      maxWidth: '85%',
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text
                    style={[a.text_xs, a.leading_snug, {color: colors.text}]}>
                    {stripEmojisAndSymbols(msg.content)}
                  </Text>
                </View>
              )
            }

            return (
              <View
                key={msg.id}
                style={[
                  a.p_sm,
                  a.rounded_md,
                  a.gap_xs,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <QuantyToolTrace
                  compact
                  traces={msg.toolTraces}
                  origin={msg.origin}
                  latencyMs={msg.latencyMs}
                />

                <QuantyMarkdown compact content={msg.content} />

                {msg.proposedActions && msg.proposedActions.length > 0 && (
                  <View style={[a.gap_xs]}>
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
          <View style={[a.flex_row, a.align_center, a.gap_xs, a.py_xs]}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={[a.text_xs, {color: colors.muted}]}>
              Running tools...
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Compact Slash Autocomplete */}
      {slashSuggestions.length > 0 && (
        <View
          style={[
            a.p_xs,
            a.gap_2xs,
            {
              backgroundColor: colors.card,
              borderTopWidth: 1,
              borderTopColor: colors.border,
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
                a.py_2xs,
                a.rounded_sm,
                {
                  backgroundColor: colors.bg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text style={[a.text_2xs, a.font_bold, {color: colors.accent}]}>
                {hint.command}
              </Text>
              <Text style={[a.text_2xs, {color: colors.text}]}>
                {hint.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Drawer Input */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_xs,
          a.p_sm,
          {
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          },
        ]}>
        <TextInput
          testID="quantyFloatingDockInput"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask Quanty or type /zing, /trends..."
          placeholderTextColor={colors.muted}
          returnKeyType="send"
          onSubmitEditing={() => void handleQuickSend()}
          style={[
            a.flex_1,
            a.text_xs,
            a.px_sm,
            a.py_xs,
            a.rounded_full,
            {
              backgroundColor: colors.surface,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              minHeight: 34,
            },
            web({outlineStyle: 'none'} as any),
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
              width: 34,
              height: 34,
              backgroundColor: colors.ctaBg,
              opacity: isLoading || !prompt.trim() ? 0.45 : 1,
            },
            web({cursor: 'pointer'}),
          ]}>
          <SendIcon size="xs" fill={colors.ctaText} />
        </Pressable>
      </View>
    </View>
  )
}
