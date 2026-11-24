import {useMemo} from 'react'
import {View} from 'react-native'
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {webLinks} from '#/lib/constants'
import {useHaptics} from '#/lib/haptics'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'

export function NativeSplashScreen({
  onPressSignin,
  onPressCreateAccount,
}: {
  onPressSignin: () => void
  onPressCreateAccount: () => void
}) {
  const t = useTheme()
  const {gtPhone} = useBreakpoints()
  const {_} = useLingui()
  const haptics = useHaptics()

  const palette = useMemo(() => {
    if (t.name === 'dark') {
      return {
        bg: '#000000',
        text: '#E7E9EA',
        muted: '#71767B',
        border: '#2F3336',
        ctaBg: '#EFF3F4',
        ctaText: '#0F1419',
        outlineBorder: '#536471',
      }
    }
    if (t.name === 'dim') {
      return {
        bg: '#15202B',
        text: '#F7F9F9',
        muted: '#8B98A5',
        border: '#38444D',
        ctaBg: '#EFF3F4',
        ctaText: '#0F1419',
        outlineBorder: '#536471',
      }
    }
    return {
      bg: '#FFFFFF',
      text: '#0F1419',
      muted: '#536471',
      border: '#EFF3F4',
      ctaBg: '#0F1419',
      ctaText: '#FFFFFF',
      outlineBorder: '#CFD9DE',
    }
  }, [t.name])

  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(90)}
      style={[a.flex_1, {backgroundColor: palette.bg}]}>
      <View
        style={[
          a.flex_1,
          a.w_full,
          a.self_center,
          a.justify_between,
          a.px_2xl,
          gtPhone && {maxWidth: 460},
        ]}>
        <View style={[a.flex_1, a.justify_center, {gap: 24, paddingTop: 24}]}>
          <Logo width={68} />

          <View style={{gap: 10}}>
            <Text
              style={[
                a.font_bold,
                {
                  fontSize: gtPhone ? 48 : 38,
                  lineHeight: gtPhone ? 54 : 44,
                  letterSpacing: -1.1,
                  color: palette.text,
                },
              ]}>
              <Trans>Happening now.</Trans>
            </Text>
            <Text
              style={[
                a.font_bold,
                {
                  fontSize: gtPhone ? 26 : 22,
                  lineHeight: gtPhone ? 32 : 28,
                  color: palette.text,
                },
              ]}>
              <Trans>Join QuantZing today.</Trans>
            </Text>
          </View>
        </View>

        <View
          testID="signinOrCreateAccount"
          style={[a.w_full, a.gap_md, a.pb_xl]}>
          <Button
            testID="createAccountButton"
            onPress={() => {
              onPressCreateAccount()
              haptics.tap()
            }}
            label={_(msg`Create account`)}
            accessibilityHint={_(
              msg`Opens flow to create a new QuantZing account`,
            )}
            size="large"
            variant="solid"
            color="primary"
            style={[
              a.rounded_full,
              {
                height: 48,
                backgroundColor: palette.ctaBg,
              },
            ]}>
            <ButtonText
              style={[a.font_bold, a.text_md, {color: palette.ctaText}]}>
              <Trans>Create account</Trans>
            </ButtonText>
          </Button>

          <Text style={[a.text_xs, {color: palette.muted, lineHeight: 17}]}>
            <Trans>
              By signing up, you agree to the{' '}
              <InlineLinkText
                label={_(msg`Terms of Service`)}
                to={webLinks.tos}
                style={[a.text_xs, {color: '#1D9BF0'}]}>
                Terms of Service
              </InlineLinkText>{' '}
              and{' '}
              <InlineLinkText
                label={_(msg`Privacy Policy`)}
                to={webLinks.privacy}
                style={[a.text_xs, {color: '#1D9BF0'}]}>
                Privacy Policy
              </InlineLinkText>
              .
            </Trans>
          </Text>

          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_sm,
              {paddingVertical: 2},
            ]}>
            <View
              style={[a.flex_1, {height: 1, backgroundColor: palette.border}]}
            />
            <Text style={[a.text_xs, {color: palette.muted}]}>
              <Trans>or</Trans>
            </Text>
            <View
              style={[a.flex_1, {height: 1, backgroundColor: palette.border}]}
            />
          </View>

          <Text style={[a.text_sm, a.font_bold, {color: palette.text}]}>
            <Trans>Already have an account?</Trans>
          </Text>

          <Button
            testID="signInButton"
            onPress={() => {
              onPressSignin()
              haptics.tap()
            }}
            label={_(msg`Sign in`)}
            accessibilityHint={_(
              msg`Opens flow to sign in to your existing QuantZing account`,
            )}
            size="large"
            variant="solid"
            color="secondary"
            style={[
              a.rounded_full,
              {
                height: 48,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: palette.outlineBorder,
              },
            ]}>
            <ButtonText style={[a.font_bold, a.text_md, {color: '#1D9BF0'}]}>
              <Trans>Sign in</Trans>
            </ButtonText>
          </Button>
        </View>
      </View>
    </Animated.View>
  )
}
