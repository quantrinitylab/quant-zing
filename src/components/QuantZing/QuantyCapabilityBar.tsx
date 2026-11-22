import {useMemo, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'

import {type QuantyPostContext} from '#/lib/quantos/client'
import {
  getQuantyThemeColors,
  QUANTY_SLASH_COMMANDS,
  type QuantyManifestResponse,
  type QuantySlashCommandHint,
} from '#/lib/quantos/quantyBridge'
import {atoms as a, useTheme, web} from '#/alf'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon,
} from '#/components/icons/Chevron'
import {Wrench_Stroke2_Corner2_Rounded as ToolIcon} from '#/components/icons/Wrench'
import {Text} from '#/components/Typography'

export interface QuantyCapabilityBarProps {
  manifest: QuantyManifestResponse | null
  attachedPost?: QuantyPostContext | null
  onSelectCommand: (hint: QuantySlashCommandHint) => void
  onQuickPrompt?: (prompt: string) => void
  compact?: boolean
}

const FEATURED_COMMANDS = [
  '/trends',
  '/analytics',
  '/zing',
  '/dm',
  '/article',
  '/poll',
  '/space',
  '/search',
  '/bookmarks',
]

export function QuantyCapabilityBar({
  manifest,
  attachedPost,
  onSelectCommand,
  onQuickPrompt,
  compact = false,
}: QuantyCapabilityBarProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantyThemeColors(t.name), [t.name])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const engineStatus = useMemo(() => {
    if (manifest?.quantos?.ai?.online) {
      return {label: 'QuantAI Live', dot: colors.rezing}
    }
    if (manifest?.quantos?.router?.online) {
      return {label: 'QuantRouter Live', dot: colors.rezing}
    }
    return {label: 'Live Sovereign Network', dot: colors.accent}
  }, [colors.accent, colors.rezing, manifest])

  const toolCount = manifest?.tools?.length || 21
  const creditsBalance = manifest?.quantos?.pay?.online
    ? manifest.quantos.pay.balanceCredits
    : undefined

  const commandHints = useMemo<QuantySlashCommandHint[]>(() => {
    if (!manifest?.tools || manifest.tools.length === 0) {
      return QUANTY_SLASH_COMMANDS
    }
    const existingByCmd = new Map(
      QUANTY_SLASH_COMMANDS.map(item => [item.command, item]),
    )
    return manifest.tools.map(tool => {
      const preset = existingByCmd.get(tool.slashCommand)
      if (preset) {
        return {
          ...preset,
          title: tool.title,
          description: tool.description,
          category: tool.category,
          requiresAuth: tool.requiresAuth,
        }
      }
      return {
        command: tool.slashCommand,
        template:
          tool.category === 'read'
            ? tool.slashCommand
            : `${tool.slashCommand} `,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        requiresAuth: tool.requiresAuth,
        autoRunOnSelect: tool.category === 'read',
      }
    })
  }, [manifest])

  const readCommands = useMemo(
    () => commandHints.filter(c => c.category === 'read'),
    [commandHints],
  )
  const writeCommands = useMemo(
    () => commandHints.filter(c => c.category !== 'read'),
    [commandHints],
  )

  const featuredHints = useMemo(() => {
    const byCmd = new Map(commandHints.map(c => [c.command, c]))
    return FEATURED_COMMANDS.map(cmd => byCmd.get(cmd)).filter(
      (x): x is QuantySlashCommandHint => Boolean(x),
    )
  }, [commandHints])

  return (
    <View style={[a.gap_xs]}>
      {/* Main Capability Status Bar */}
      <View
        testID="quantyCapabilityBar"
        style={[
          a.flex_row,
          a.flex_wrap,
          a.align_center,
          a.justify_between,
          a.gap_xs,
          a.px_sm,
          a.py_xs,
          a.rounded_lg,
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          },
        ]}>
        {/* Live Engine Origin Pill */}
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 99,
              backgroundColor: engineStatus.dot,
            }}
          />
          <Text style={[a.text_xs, a.font_bold, {color: colors.text}]}>
            {engineStatus.label}
          </Text>
          {typeof creditsBalance === 'number' && (
            <View
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
                style={[a.text_2xs, a.font_semi_bold, {color: colors.text}]}>
                {creditsBalance} Credits
              </Text>
            </View>
          )}
        </View>

        {/* Interactive Tools Drawer Button */}
        <Pressable
          testID="quantyToolsDrawerBtn"
          accessibilityRole="button"
          accessibilityLabel={`${toolCount} Tools Ready`}
          onPress={() => setDrawerOpen(prev => !prev)}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_2xs,
            a.px_sm,
            a.py_2xs,
            a.rounded_full,
            {
              backgroundColor: drawerOpen ? colors.ctaBg : colors.surface,
              borderWidth: 1,
              borderColor: drawerOpen ? colors.ctaBg : colors.border,
            },
            web({cursor: 'pointer'}),
          ]}>
          <ToolIcon
            size="xs"
            fill={drawerOpen ? colors.ctaText : colors.accent}
          />
          <Text
            style={[
              a.text_2xs,
              a.font_bold,
              {color: drawerOpen ? colors.ctaText : colors.text},
            ]}>
            {toolCount} Tools Ready
          </Text>
          {drawerOpen ? (
            <ChevronDownIcon size="xs" fill={colors.ctaText} />
          ) : (
            <ChevronRightIcon size="xs" fill={colors.muted} />
          )}
        </Pressable>
      </View>

      {/* Expandable 21-Tool Slash Command Drawer */}
      {drawerOpen && (
        <View
          testID="quantyToolsDrawer"
          style={[
            a.p_md,
            a.rounded_lg,
            a.gap_sm,
            {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          <View style={[a.gap_2xs]}>
            <Text style={[a.text_2xs, a.font_bold, {color: colors.muted}]}>
              LIVE READ TOOLS ({readCommands.length})
            </Text>
            <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
              {readCommands.map(hint => (
                <Pressable
                  key={hint.command}
                  accessibilityRole="button"
                  accessibilityLabel={`${hint.command} ${hint.title}`}
                  onPress={() => {
                    setDrawerOpen(false)
                    onSelectCommand(hint)
                  }}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_2xs,
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor: colors.bg,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text
                    style={[
                      a.text_2xs,
                      a.font_bold,
                      {color: colors.accent},
                    ]}>
                    {hint.command}
                  </Text>
                  <Text style={[a.text_2xs, {color: colors.text}]}>
                    {hint.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View
            style={[
              a.gap_2xs,
              a.pt_xs,
              {borderTopWidth: 1, borderTopColor: colors.border},
            ]}>
            <Text style={[a.text_2xs, a.font_bold, {color: colors.muted}]}>
              ACTION TOOLS WITH CONFIRMATION GATE ({writeCommands.length})
            </Text>
            <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
              {writeCommands.map(hint => {
                const isDestructive = hint.category === 'destructive'
                return (
                  <Pressable
                    key={hint.command}
                    accessibilityRole="button"
                    accessibilityLabel={`${hint.command} ${hint.title}`}
                    onPress={() => {
                      setDrawerOpen(false)
                      onSelectCommand(hint)
                    }}
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_2xs,
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.bg,
                        borderWidth: 1,
                        borderColor: isDestructive
                          ? colors.danger
                          : colors.border,
                      },
                      web({cursor: 'pointer'}),
                    ]}>
                    <Text
                      style={[
                        a.text_2xs,
                        a.font_bold,
                        {
                          color: isDestructive
                            ? colors.danger
                            : colors.rezing,
                        },
                      ]}>
                      {hint.command}
                    </Text>
                    <Text style={[a.text_2xs, {color: colors.text}]}>
                      {hint.title}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      )}

      {/* Horizontal Context-Aware Quick-Action Strip */}
      {!compact && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[a.flex_row, a.align_center, a.gap_xs]}>
          {attachedPost ? (
            <>
              {onQuickPrompt && (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Analyze attached thread"
                    onPress={() =>
                      onQuickPrompt(
                        'Summarize the main claim, replies, and counter-arguments on this Zing',
                      )
                    }
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
                        a.text_2xs,
                        a.font_semi_bold,
                        {color: colors.text},
                      ]}>
                      Analyze Thread
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Bookmark attached Zing"
                    onPress={() => onQuickPrompt('/bookmark')}
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
                        a.text_2xs,
                        a.font_semi_bold,
                        {color: colors.text},
                      ]}>
                      Bookmark Zing
                    </Text>
                  </Pressable>
                  {attachedPost.authorHandle && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Follow @${attachedPost.authorHandle}`}
                      onPress={() =>
                        onQuickPrompt(`/follow @${attachedPost.authorHandle}`)
                      }
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
                          a.text_2xs,
                          a.font_semi_bold,
                          {color: colors.text},
                        ]}>
                        Follow @{attachedPost.authorHandle}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Draft reply to attached Zing"
                onPress={() =>
                  onSelectCommand({
                    command: '/reply',
                    template: '/reply ',
                    title: 'Reply to Zing',
                    description: 'Reply to this Zing',
                    category: 'write',
                    requiresAuth: true,
                    autoRunOnSelect: false,
                  })
                }
                style={[
                  a.px_sm,
                  a.py_2xs,
                  a.rounded_full,
                  {
                    backgroundColor: colors.accentSubtle,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <Text
                  style={[a.text_2xs, a.font_bold, {color: colors.accent}]}>
                  /reply
                </Text>
              </Pressable>
            </>
          ) : (
            featuredHints.map(hint => (
              <Pressable
                key={hint.command}
                accessibilityRole="button"
                accessibilityLabel={hint.command}
                onPress={() => onSelectCommand(hint)}
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
                    a.text_2xs,
                    a.font_semi_bold,
                    {color: colors.text},
                  ]}>
                  {hint.command}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}
