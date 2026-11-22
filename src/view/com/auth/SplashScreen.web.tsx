import {useCallback, useEffect, useMemo, useState} from 'react'
import {Pressable, ScrollView, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {getQuantZingColors} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {Logo} from '#/view/icons/Logo'
import {
  AppClipOverlay,
  postAppClipMessage,
} from '#/screens/StarterPack/StarterPackLandingScreen'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {Download_Stroke2_Corner0_Rounded as DownloadIcon} from '#/components/icons/Download'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
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
  const {gtTablet} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const {setGuestBrowseAllowed, setShowLoggedOut, clearRequestedAccount} =
    useLoggedOutViewControls()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const [showClipOverlay, setShowClipOverlay] = useState(false)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  const [apkAvailable, setApkAvailable] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const getParams = new URLSearchParams(window.location.search)
    const clip = getParams.get('clip')
    if (clip === 'true') {
      setShowClipOverlay(true)
      postAppClipMessage({action: 'present'})
    }

    const syncInstall = () => {
      setCanInstallPwa(Boolean((window as any).__qzDeferredInstall))
    }
    syncInstall()
    window.addEventListener('qz-install-ready', syncInstall)

    fetch('/api/quantzing/app-release')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.androidApkAvailable) setApkAvailable(true)
      })
      .catch(() => {})

    return () => {
      window.removeEventListener('qz-install-ready', syncInstall)
    }
  }, [])

  const onPressOpenDownload = useCallback(() => {
    clearRequestedAccount()
    setShowLoggedOut(false)
    navigation.navigate('Download')
  }, [clearRequestedAccount, navigation, setShowLoggedOut])

  const onPressInstallDirect = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const deferred = (window as any).__qzDeferredInstall
      if (deferred && typeof deferred.prompt === 'function') {
        try {
          await deferred.prompt()
          const choice = await deferred.userChoice
          if (choice?.outcome === 'accepted') {
            ;(window as any).__qzDeferredInstall = null
            setCanInstallPwa(false)
            return
          }
        } catch {}
      }
    }
    onPressOpenDownload()
  }, [onPressOpenDownload])

  const onPressAndroidDirect = useCallback(() => {
    if (apkAvailable && typeof window !== 'undefined') {
      window.location.href = '/download/quantzing-android.apk'
      return
    }
    onPressOpenDownload()
  }, [apkAvailable, onPressOpenDownload])

  const onPressExplorePublic = useCallback(() => {
    setGuestBrowseAllowed(true)
    clearRequestedAccount()
    setShowLoggedOut(false)
  }, [clearRequestedAccount, setGuestBrowseAllowed, setShowLoggedOut])

  const isDesktopSplit = gtTablet

  return (
    <View
      testID="noSessionView"
      style={[
        a.flex_1,
        {backgroundColor: colors.bg},
        web({minHeight: '100dvh', display: 'flex', flexDirection: 'column'}),
      ]}>
      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: 12,
            zIndex: 100,
          }}
          onPress={onDismiss}>
          <TimesIcon width={24} fill={colors.text} />
        </Pressable>
      )}

      <ScrollView
        style={[a.flex_1]}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
        }}>
        <ErrorBoundary>
          {/* Main X.com Split Hero */}
          <View
            style={[
              a.flex_1,
              isDesktopSplit ? a.flex_row : a.flex_col,
              isDesktopSplit ? a.align_center : a.align_stretch,
              a.justify_center,
              {
                width: '100%',
                maxWidth: 1240,
                alignSelf: 'center',
                paddingHorizontal: isDesktopSplit ? 48 : 24,
                paddingVertical: isDesktopSplit ? 40 : 28,
                gap: isDesktopSplit ? 64 : 28,
              },
            ]}>
            {/* Left Brand Monument (Desktop) / Top Compact Mark (Mobile) */}
            <View
              style={[
                isDesktopSplit
                  ? [a.flex_1, a.align_center, a.justify_center]
                  : [a.align_start],
              ]}>
              <Logo width={isDesktopSplit ? 240 : 48} />
            </View>

            {/* Right Auth & Direct App Download Column */}
            <View
              style={[
                isDesktopSplit ? {flex: 1, maxWidth: 460} : {width: '100%'},
                {gap: 18},
              ]}>
              <View style={{gap: 10}}>
                <Text
                  style={[
                    a.font_bold,
                    {
                      fontSize: isDesktopSplit ? 58 : 38,
                      lineHeight: isDesktopSplit ? 66 : 44,
                      letterSpacing: -1.2,
                      color: colors.text,
                    },
                  ]}>
                  Happening now
                </Text>
                <Text
                  style={[
                    a.font_bold,
                    {
                      fontSize: isDesktopSplit ? 28 : 22,
                      lineHeight: isDesktopSplit ? 34 : 28,
                      color: colors.text,
                    },
                  ]}>
                  Join QuantZing today.
                </Text>
              </View>

              {/* Auth Actions */}
              <View
                testID="signinOrCreateAccount"
                style={{width: '100%', maxWidth: 320, gap: 12, paddingTop: 4}}>
                <Button
                  testID="createAccountButton"
                  onPress={onPressCreateAccount}
                  label={_(msg`Create account`)}
                  accessibilityHint="Opens flow to create a new QuantZing account"
                  size="large"
                  variant="solid"
                  color="primary"
                  style={[
                    a.rounded_full,
                    {height: 44, backgroundColor: colors.ctaBg},
                  ]}>
                  <ButtonText
                    style={[a.font_bold, a.text_md, {color: colors.ctaText}]}>
                    <Trans>Create account</Trans>
                  </ButtonText>
                </Button>

                <Text
                  style={[a.text_xs, {color: colors.muted, lineHeight: 16}]}>
                  By signing up, you agree to the{' '}
                  <InlineLinkText
                    label="Terms of Service"
                    to="/terms"
                    onPress={() => {
                      clearRequestedAccount()
                      setShowLoggedOut(false)
                    }}
                    style={[a.text_xs, {color: '#1D9BF0'}]}>
                    Terms of Service
                  </InlineLinkText>{' '}
                  and{' '}
                  <InlineLinkText
                    label="Privacy Policy"
                    to="/privacy"
                    onPress={() => {
                      clearRequestedAccount()
                      setShowLoggedOut(false)
                    }}
                    style={[a.text_xs, {color: '#1D9BF0'}]}>
                    Privacy Policy
                  </InlineLinkText>
                  .
                </Text>

                {/* Divider */}
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_sm,
                    {paddingVertical: 4},
                  ]}>
                  <View
                    style={[
                      a.flex_1,
                      {height: 1, backgroundColor: colors.border},
                    ]}
                  />
                  <Text style={[a.text_xs, {color: colors.muted}]}>or</Text>
                  <View
                    style={[
                      a.flex_1,
                      {height: 1, backgroundColor: colors.border},
                    ]}
                  />
                </View>

                <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                  Already have an account?
                </Text>

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
                      height: 44,
                      backgroundColor: 'transparent',
                      borderWidth: 1,
                      borderColor: '#536471',
                    },
                  ]}>
                  <ButtonText
                    style={[a.font_bold, a.text_md, {color: '#1D9BF0'}]}>
                    <Trans>Sign in</Trans>
                  </ButtonText>
                </Button>

                {/* Direct App Download Box (No Store Wait Needed!) */}
                <View
                  testID="landingDownloadCard"
                  style={{
                    marginTop: 8,
                    padding: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    gap: 10,
                  }}>
                  <View style={[a.flex_row, a.align_center, a.justify_between]}>
                    <Text
                      style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                      Get the QuantZing App
                    </Text>
                    <Text
                      style={[a.text_xs, a.font_bold, {color: '#1D9BF0'}]}>
                      Direct Install
                    </Text>
                  </View>
                  <Text
                    style={[a.text_xs, {color: colors.muted, lineHeight: 16}]}>
                    Install directly on Android, iPhone, or Desktop right from
                    QuantZing — Play Store &amp; App Store coming soon.
                  </Text>
                  <View style={[a.flex_row, a.gap_xs]}>
                    <Pressable
                      testID="landingInstallAppBtn"
                      onPress={() => void onPressInstallDirect()}
                      accessibilityRole="button"
                      accessibilityLabel="Install QuantZing App"
                      style={({pressed}) => [
                        a.flex_1,
                        a.flex_row,
                        a.align_center,
                        a.justify_center,
                        a.gap_xs,
                        a.rounded_full,
                        {
                          height: 36,
                          paddingHorizontal: 10,
                          backgroundColor: colors.ctaBg,
                          opacity: pressed ? 0.85 : 1,
                        },
                        web({cursor: 'pointer'}),
                      ]}>
                      <PhoneIcon width={14} fill={colors.ctaText} />
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.ctaText},
                        ]}>
                        {canInstallPwa ? 'Install App' : 'Get App'}
                      </Text>
                    </Pressable>

                    <Pressable
                      testID="landingDownloadApkBtn"
                      onPress={onPressAndroidDirect}
                      accessibilityRole="button"
                      accessibilityLabel="Direct Android APK download"
                      style={({pressed}) => [
                        a.flex_1,
                        a.flex_row,
                        a.align_center,
                        a.justify_center,
                        a.gap_xs,
                        a.rounded_full,
                        {
                          height: 36,
                          paddingHorizontal: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.bg,
                          opacity: pressed ? 0.85 : 1,
                        },
                        web({cursor: 'pointer'}),
                      ]}>
                      <DownloadIcon width={14} fill={colors.text} />
                      <Text
                        style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                        {apkAvailable ? 'Android APK' : 'Download Hub'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  testID="explorePublicFeedBtn"
                  onPress={onPressExplorePublic}
                  accessibilityRole="button"
                  accessibilityLabel="Explore public Zings"
                  style={({pressed}) => [
                    {paddingTop: 4, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1},
                    web({cursor: 'pointer'}),
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_semi_bold, {color: colors.muted}]}>
                    Explore public Zings →
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ErrorBoundary>

        <Footer />
      </ScrollView>

      <AppClipOverlay
        visible={showClipOverlay}
        setIsVisible={setShowClipOverlay}
      />
    </View>
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

  const links = [
    {to: '/download', label: 'Download App'},
    {to: '/terms', label: 'Terms of Service'},
    {to: '/privacy', label: 'Privacy Policy'},
    {to: '/community-guidelines', label: 'Community Guidelines'},
    {to: '/copyright', label: 'Copyright'},
    {to: '/help', label: 'Help Center'},
  ]

  return (
    <View
      style={[
        {borderTopColor: colors.border, backgroundColor: colors.bg},
        a.px_xl,
        a.py_md,
        a.border_t,
        a.flex_row,
        a.align_center,
        a.justify_center,
        a.flex_wrap,
        a.gap_lg,
      ]}>
      {links.map(item => (
        <InlineLinkText
          key={item.to}
          label={item.label}
          to={item.to}
          onPress={onPressLegalLink}
          style={[a.text_xs, {color: colors.muted}]}>
          {item.label}
        </InlineLinkText>
      ))}
      <Text style={[a.text_xs, {color: colors.muted}]}>
        © 2026 QuantZing
      </Text>
      <AppLanguageDropdown />
    </View>
  )
}
