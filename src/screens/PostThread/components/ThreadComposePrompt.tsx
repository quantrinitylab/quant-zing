import {useMemo, useState} from 'react'
import {Pressable, type StyleProp, TextInput, View, type ViewStyle} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
import {Trans, useLingui} from '@lingui/react/macro'

import {PressableScale} from '#/lib/custom-animations/PressableScale'
import {useHaptics} from '#/lib/haptics'
import {useHideBottomBarBorderForScreen} from '#/lib/hooks/useHideBottomBarBorder'
import {getQuantZingColors} from '#/lib/quantos/client'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, ios, native, useBreakpoints, useTheme, web} from '#/alf'
import {transparentifyColor} from '#/alf/util/colorGeneration'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {Text} from '#/components/Typography'

export function ThreadComposePrompt({
  onPressCompose,
  style,
}: {
  onPressCompose: (initialText?: string) => void
  style?: StyleProp<ViewStyle>
}) {
  const {currentAccount} = useSession()
  const {data: profile} = useProfileQuery({did: currentAccount?.did})
  const {t: l} = useLingui()
  const {gtMobile} = useBreakpoints()
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const haptics = useHaptics()
  const [inlineReplyText, setInlineReplyText] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const {
    state: hovered,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()
  const {
    state: pressed,
    onIn: onPressIn,
    onOut: onPressOut,
  } = useInteractionState()

  useHideBottomBarBorderForScreen()

  return (
    <View
      style={[
        a.px_sm,
        gtMobile
          ? [a.py_xs, a.border_t, t.atoms.border_contrast_low, t.atoms.bg]
          : [a.pb_2xs],
        style,
      ]}>
      {!gtMobile && (
        <LinearGradient
          key={t.name} // android does not update when you change the colors. sigh.
          start={[0.5, 0]}
          end={[0.5, 1]}
          colors={[
            transparentifyColor(t.atoms.bg.backgroundColor, 0),
            t.atoms.bg.backgroundColor,
          ]}
          locations={[0.15, 0.4]}
          style={[a.absolute, a.inset_0]}
        />
      )}
      {gtMobile ? (
        <View
          style={[
            a.flex_row,
            a.align_start,
            a.py_sm,
            a.px_md,
            a.gap_sm,
            a.rounded_xl,
            t.atoms.bg_contrast_25,
            a.border,
            isFocused
              ? {borderColor: '#1D9BF0'}
              : t.atoms.border_contrast_low,
          ]}>
          <UserAvatar
            size={36}
            avatar={profile?.avatar}
            type={profile?.associated?.labeler ? 'labeler' : 'user'}
          />
          <View style={[a.flex_1, a.gap_xs]}>
            <TextInput
              value={inlineReplyText}
              onChangeText={setInlineReplyText}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={l`Post your reply`}
              placeholderTextColor={t.palette.contrast_500}
              multiline
              accessibilityLabel={l`Post your reply`}
              accessibilityHint=""
              style={[
                a.flex_1,
                a.text_md,
                t.atoms.text,
                {minHeight: isFocused || inlineReplyText ? 52 : 34, padding: 0},
                web({outlineStyle: 'none'}),
              ]}
            />
            {(isFocused || inlineReplyText.trim().length > 0) && (
              <View style={[a.flex_row, a.justify_end, a.align_center, a.pt_xs]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={l`Reply`}
                  accessibilityHint=""
                  disabled={!inlineReplyText.trim()}
                  onPress={() => {
                    haptics.tap()
                    const txt = inlineReplyText.trim()
                    setInlineReplyText('')
                    setIsFocused(false)
                    onPressCompose(txt)
                  }}
                  style={[
                    a.rounded_full,
                    a.align_center,
                    a.justify_center,
                    {
                      backgroundColor: inlineReplyText.trim()
                        ? '#1D9BF0'
                        : colors.ctaBg,
                      height: 32,
                      paddingHorizontal: 16,
                      opacity: inlineReplyText.trim() ? 1 : 0.5,
                    },
                    web({cursor: inlineReplyText.trim() ? 'pointer' : 'default'}),
                  ]}>
                  <Text
                    style={[
                      a.font_bold,
                      {
                        color: inlineReplyText.trim() ? '#FFFFFF' : colors.ctaText,
                        fontSize: 14,
                        lineHeight: 18,
                      },
                    ]}>
                    <Trans>Reply</Trans>
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          {!isFocused && !inlineReplyText && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={l`Reply`}
              accessibilityHint=""
              onPress={() => {
                haptics.tap()
                onPressCompose()
              }}
              style={[
                a.rounded_full,
                a.align_center,
                a.justify_center,
                {
                  backgroundColor: colors.ctaBg,
                  height: 32,
                  paddingHorizontal: 16,
                  opacity: 0.8,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text
                style={[
                  a.font_bold,
                  {
                    color: colors.ctaText,
                    fontSize: 14,
                    lineHeight: 18,
                  },
                ]}>
                <Trans>Reply</Trans>
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={l`Compose reply`}
          accessibilityHint={l`Opens composer`}
          onPress={() => {
            onPressCompose()
            haptics.tap()
          }}
          onLongPress={ios(() => {
            onPressCompose()
            haptics.longPress()
          })}
          onHoverIn={onHoverIn}
          onHoverOut={onHoverOut}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          targetScale={0.98}
          style={[
            a.flex_row,
            a.align_center,
            a.justify_between,
            a.p_sm,
            a.gap_sm,
            a.rounded_full,
            t.atoms.bg_contrast_25,
            native([a.border, t.atoms.border_contrast_low]),
            a.transition_color,
          ]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_md,
              a.flex_1,
              {minWidth: 0},
            ]}>
            <UserAvatar
              size={28}
              avatar={profile?.avatar}
              type={profile?.associated?.labeler ? 'labeler' : 'user'}
            />
            <Text
              numberOfLines={1}
              style={[a.text_md, a.flex_1, t.atoms.text_contrast_medium]}>
              <Trans>Post your reply</Trans>
            </Text>
          </View>
          <View
            style={[
              a.rounded_full,
              a.align_center,
              a.justify_center,
              {
                backgroundColor: colors.ctaBg,
                height: 34,
                paddingHorizontal: 16,
                opacity: hovered || pressed ? 0.9 : 0.8,
              },
            ]}>
            <Text
              style={[
                a.font_bold,
                {
                  color: colors.ctaText,
                  fontSize: 14,
                  lineHeight: 18,
                },
              ]}>
              <Trans>Reply</Trans>
            </Text>
          </View>
        </PressableScale>
      )}
    </View>
  )
}
