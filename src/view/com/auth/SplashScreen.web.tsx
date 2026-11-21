import {useCallback, useEffect, useMemo, useState} from 'react'
import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {getQuantZingColors} from '#/lib/quantos/client'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {
  AppClipOverlay,
  postAppClipMessage,
} from '#/screens/StarterPack/StarterPackLandingScreen'
import {atoms as a, useTheme} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'

export const SplashScreen = ({
  onDismiss,
  onPressSignin,
  onPressCreateAccount,
}: {
  onDismiss?: () => void
  onPressSignin: () => void
  onPressCreateAccount: () => void
}) => {
  const {_} = useLingui()
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const {isTabletOrMobile: IS_WEB_MOBILE} = useWebMediaQueries()
  const [showClipOverlay, setShowClipOverlay] = useState(false)

  useEffect(() => {
    const getParams = new URLSearchParams(window.location.search)
    const clip = getParams.get('clip')
    if (clip === 'true') {
      setShowClipOverlay(true)
      postAppClipMessage({
        action: 'present',
      })
    }
  }, [])

  return (
    <>
      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            padding: 20,
            zIndex: 100,
          }}
          onPress={onDismiss}>
          <TimesIcon width={24} style={{color: colors.text}} />
        </Pressable>
      )}

      <Layout.Center
        style={[a.h_full, a.flex_1, {backgroundColor: colors.bg}]}
        ignoreTabletLayoutOffset>
        <View
          testID="noSessionView"
          style={[
            a.h_full,
            a.justify_center,
            {paddingBottom: '20vh', backgroundColor: colors.bg},
            IS_WEB_MOBILE && a.pb_5xl,
            a.align_center,
            a.gap_5xl,
            a.flex_1,
          ]}>
          <ErrorBoundary>
            <View style={[a.justify_center, a.align_center]}>
              <Logo width={92} />

              <View style={[a.pb_sm, a.pt_5xl]}>
                <Logotype width={172} fill={colors.text} />
              </View>

              <Text
                style={[
                  a.text_md,
                  a.font_semi_bold,
                  {color: colors.muted},
                ]}>
                Own your signal. Ride the wave.
              </Text>
            </View>

            <View
              testID="signinOrCreateAccount"
              style={[a.w_full, a.px_xl, a.gap_md, a.pb_2xl, {maxWidth: 320}]}>
              <Button
                testID="createAccountButton"
                onPress={onPressCreateAccount}
                label={_(msg`Create new account`)}
                accessibilityHint="Opens flow to create a new QuantZing account"
                size="large"
                variant="solid"
                color="primary"
                style={[a.rounded_full, {backgroundColor: colors.ctaBg}]}>
                <ButtonText style={[a.font_bold, {color: colors.ctaText}]}>
                  <Trans>Create account</Trans>
                </ButtonText>
              </Button>
              <Button
                testID="signInButton"
                onPress={onPressSignin}
                label={_(msg`Sign in`)}
                accessibilityHint="Opens flow to sign in to your existing QuantZing account"
                size="large"
                variant="solid"
                color="secondary"
                style={[
                  a.rounded_full,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <ButtonText style={[a.font_bold, {color: colors.text}]}>
                  <Trans>Sign in</Trans>
                </ButtonText>
              </Button>
            </View>
          </ErrorBoundary>
        </View>
        <Footer />
      </Layout.Center>
      <AppClipOverlay
        visible={showClipOverlay}
        setIsVisible={setShowClipOverlay}
      />
    </>
  )
}

function Footer() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const {setShowLoggedOut, clearRequestedAccount} = useLoggedOutViewControls()

  const onPressLegalLink = useCallback(() => {
    clearRequestedAccount()
    setShowLoggedOut(false)
  }, [clearRequestedAccount, setShowLoggedOut])

  return (
    <View
      style={[
        a.absolute,
        a.inset_0,
        {top: 'auto', borderTopColor: colors.border},
        a.px_xl,
        a.py_lg,
        a.border_t,
        a.flex_row,
        a.align_center,
        a.flex_wrap,
        a.gap_xl,
        a.flex_1,
      ]}>
      <InlineLinkText
        label="Read QuantZing Terms of Service"
        to="/terms"
        onPress={onPressLegalLink}>
        Terms of Service
      </InlineLinkText>
      <InlineLinkText
        label="Read QuantZing Privacy Policy"
        to="/privacy"
        onPress={onPressLegalLink}>
        Privacy Policy
      </InlineLinkText>
      <InlineLinkText
        label="Visit QuantZing Help Center"
        to="/help"
        onPress={onPressLegalLink}>
        Help Center
      </InlineLinkText>

      <View style={a.flex_1} />

      <AppLanguageDropdown />
    </View>
  )
}
