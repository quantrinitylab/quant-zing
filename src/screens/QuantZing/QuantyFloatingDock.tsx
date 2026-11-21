import {useCallback, useMemo, useState} from 'react'
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
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {SquareArrowTopRight_Stroke2_Corner0_Rounded as ExpandIcon} from '#/components/icons/SquareArrowTopRight'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/Times'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

interface QuickMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const STARTER_PROMPTS = [
  'What is trending on QuantZing right now?',
  "Summarize today's top stories",
  'Draft a sharp Zing about AI',
]

export function QuantyFloatingDock({routeName}: {routeName?: string}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {leftNavMinimal} = useLayoutBreakpoints()
  const navigation = useNavigation()
  const {hasSession, currentAccount} = useSession()
  const navRouteName = useNavigationState(state =>
    state ? getCurrentRoute(state).name : '',
  )

  const [isOpen, setIsOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<QuickMessage[]>([])

  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
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

      const userMsg: QuickMessage = {
        id: `qu_${Date.now()}`,
        role: 'user',
        content: text,
      }
      setMessages(prev => [...prev, userMsg])
      setPrompt('')
      setIsLoading(true)

      try {
        const res = await askQuanty({
          prompt: text,
          mode: 'ask',
          ownerId: currentAccount?.did || currentAccount?.handle || undefined,
          history: messages.slice(-4).map(m => ({
            role: m.role,
            content: m.content,
          })),
        })
        setMessages(prev => [
          ...prev,
          {
            id: `qa_${Date.now()}`,
            role: 'assistant',
            content: stripEmojisAndSymbols(res.answer),
          },
        ])
      } catch {
        setMessages(prev => [
          ...prev,
          {
            id: `qe_${Date.now()}`,
            role: 'assistant',
            content: 'Unable to reach Quanty right now.',
          },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [currentAccount, isLoading, messages, prompt],
  )

  if (!IS_WEB || !gtMobile || isOnQuantyRoute || (!hasSession && leftNavMinimal)) {
    return null
  }

  const isDark = t.scheme === 'dark'
  const pillBg = isDark
    ? hovered
      ? '#1D1F23'
      : '#16181C'
    : hovered
      ? colors.card
      : colors.bg
  const pillBorder = isDark ? '#2F3336' : colors.border
  const dockShadow = isDark
    ? '0 4px 18px rgba(255, 255, 255, 0.08), 0 2px 10px rgba(0, 0, 0, 0.9)'
    : '0 8px 24px rgba(15, 20, 25, 0.14)'

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
          width: 350,
          height: 430,
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
        </View>

        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand Quanty"
            onPress={() => handleOpenFullQuanty(prompt)}
            hitSlop={8}
            style={[a.p_2xs, a.rounded_full]}>
            <ExpandIcon size="xs" fill={colors.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Quanty"
            onPress={() => setIsOpen(false)}
            hitSlop={8}
            style={[a.p_2xs, a.rounded_full]}>
            <CloseIcon size="xs" fill={colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* Drawer Thread */}
      <ScrollView
        style={[a.flex_1]}
        contentContainerStyle={[a.p_md, a.gap_sm]}>
        {messages.length === 0 ? (
          <View style={[a.gap_sm, a.py_sm]}>
            <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
              Quanty
            </Text>
            <View style={[a.gap_xs, a.pt_2xs]}>
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
                  ]}>
                  <Text style={[a.text_xs, {color: colors.text}]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map(msg => (
            <View
              key={msg.id}
              style={[
                a.p_sm,
                a.rounded_md,
                {
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'stretch',
                  maxWidth: msg.role === 'user' ? '85%' : '100%',
                  backgroundColor:
                    msg.role === 'user' ? colors.surface : colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[a.text_xs, a.leading_snug, {color: colors.text}]}>
                {stripEmojisAndSymbols(msg.content)}
              </Text>
            </View>
          ))
        )}

        {isLoading && (
          <View style={[a.flex_row, a.align_center, a.gap_xs, a.py_xs]}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={[a.text_xs, {color: colors.muted}]}>
              Thinking...
            </Text>
          </View>
        )}
      </ScrollView>

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
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask Quanty"
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
          ]}>
          <SendIcon size="xs" fill={colors.ctaText} />
        </Pressable>
      </View>
    </View>
  )
}
