import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  fetchQuantZingAppRelease,
  getQuantZingApiOrigin,
  getQuantZingColors,
  type QuantZingAppRelease,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Download_Stroke2_Corner0_Rounded as DownloadIcon} from '#/components/icons/Download'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

export function DownloadScreen() {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])

  const [release, setRelease] = useState<QuantZingAppRelease | null>(null)
  const [loadingRelease, setLoadingRelease] = useState(true)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  const [installFeedback, setInstallFeedback] = useState<string | null>(null)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchQuantZingAppRelease()
      .then(data => {
        if (!cancelled) {
          setRelease(data)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoadingRelease(false)
        }
      })

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ua = navigator.userAgent || ''
      setIsIos(/iPad|iPhone|iPod/i.test(ua))

      const syncPrompt = () => {
        setCanInstallPwa(Boolean((window as any).__qzDeferredInstall))
      }
      syncPrompt()
      window.addEventListener('qz-install-ready', syncPrompt)
      return () => {
        cancelled = true
        window.removeEventListener('qz-install-ready', syncPrompt)
      }
    }

    return () => {
      cancelled = true
    }
  }, [])

  const resolveDownloadHref = useCallback((relativeOrFull: string): string | null => {
    const trimmed = String(relativeOrFull || '').trim()
    if (!trimmed || trimmed.startsWith('//')) return null
    try {
      const apiOrigin = getQuantZingApiOrigin()
      const parsed = new URL(trimmed, apiOrigin)
      const expected = new URL(apiOrigin)
      if (parsed.origin !== expected.origin) return null
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
      return parsed.toString()
    } catch {
      return null
    }
  }, [])

  const onDownloadApk = useCallback(() => {
    const apkPath =
      release?.android.downloadUrl || '/download/quantzing-android.apk'
    const href = resolveDownloadHref(apkPath)
    if (!href) {
      setInstallFeedback('Blocked unsafe download URL.')
      return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = href
    } else {
      void Linking.openURL(href)
    }
    setInstallFeedback(
      `Downloading QuantZing Android Native APK${release?.android.sizeLabel ? ` (${release.android.sizeLabel})` : ''} directly from Sovereign servers.`,
    )
  }, [release, resolveDownloadHref])

  const onInstallIosProfile = useCallback(() => {
    const profilePath =
      release?.ios.mobileconfigUrl || '/download/quantzing-ios.mobileconfig'
    const href = resolveDownloadHref(profilePath)
    if (!href) {
      setInstallFeedback('Blocked unsafe profile URL.')
      return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = href
    } else {
      void Linking.openURL(href)
    }
    setInstallFeedback(
      'Downloading QuantZing-iOS.mobileconfig profile. On iPhone or iPad, open Settings > Profile Downloaded > Tap Install.',
    )
  }, [release, resolveDownloadHref])

  const onInstallPwa = useCallback(async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const deferred = (window as any).__qzDeferredInstall
      if (deferred && typeof deferred.prompt === 'function') {
        try {
          await deferred.prompt()
          const choice = await deferred.userChoice
          if (choice?.outcome === 'accepted') {
            setInstallFeedback(
              'QuantZing Web App is installing directly onto your device.',
            )
            ;(window as any).__qzDeferredInstall = null
            setCanInstallPwa(false)
          } else {
            setInstallFeedback(
              'Install prompt dismissed. Tap Install Web App again anytime.',
            )
          }
          return
        } catch {}
      }
    }

    if (isIos) {
      setInstallFeedback(
        'On iPhone or iPad Safari: tap the Share button at the bottom and choose "Add to Home Screen", or use the Direct Profile (.mobileconfig) installer above.',
      )
    } else {
      setInstallFeedback(
        'Open your browser menu (three dots) and choose "Install app" or "Add to Home screen" to install the QuantZing Web App directly.',
      )
    }
  }, [isIos])

  const onBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      ;(navigation as any).navigate('Home')
    }
  }, [navigation])

  const displayVersion = release?.version || '1.140.0'
  const displayDomain =
    release?.domain ||
    (Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.host
      : 'quantzing.quantrinity.in')

  return (
    <Layout.Screen
      testID="downloadScreen"
      style={[{backgroundColor: colors.bg}]}>
      <ScrollView
        style={[a.flex_1, {backgroundColor: colors.bg}]}
        contentContainerStyle={{
          paddingBottom: 64,
          alignItems: 'center',
        }}>
        <View
          style={[
            a.w_full,
            {
              maxWidth: 820,
              paddingHorizontal: gtMobile ? 28 : 16,
              paddingTop: 20,
            },
          ]}>
          {/* Top Bar */}
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              {marginBottom: 24},
            ]}>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({pressed}) => [
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.rounded_full,
                {
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <ArrowLeftIcon width={16} fill={colors.text} />
              <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                Back
              </Text>
            </Pressable>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Logo width={26} />
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                QuantZing v{displayVersion}
              </Text>
            </View>
          </View>

          {/* Hero */}
          <View style={{marginBottom: 24}}>
            <Text
              style={[
                a.font_bold,
                {
                  fontSize: gtMobile ? 38 : 28,
                  lineHeight: gtMobile ? 44 : 34,
                  letterSpacing: -0.8,
                  color: colors.text,
                  marginBottom: 10,
                },
              ]}>
              Download QuantZing for Android, iPhone & Web
            </Text>
            <Text
              style={[
                a.text_md,
                {color: colors.muted, lineHeight: 22, maxWidth: 640},
              ]}>
              Install QuantZing directly from our sovereign release distribution
              on {displayDomain}. Signed Android Native APK, iPhone & iPad
              Direct Profile (.mobileconfig), and Instant Web App (PWA) ready
              now.
            </Text>
          </View>

          {installFeedback && (
            <View
              testID="downloadFeedbackBanner"
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: colors.accentSubtle,
                marginBottom: 20,
              }}>
              <Text
                style={[a.text_sm, a.font_semi_bold, {color: colors.text}]}>
                {installFeedback}
              </Text>
            </View>
          )}

          {/* 3 Flagship Platform Cards */}
          <View style={[a.gap_md, {marginBottom: 24}]}>
            {/* Card 1: Android Native App (Direct APK) */}
            <View
              testID="downloadAndroidCard"
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 18,
                padding: 20,
                gap: 14,
              }}>
              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_xs,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_sm, {flex: 1, minWidth: 200}]}>
                  <View
                    style={{
                      width: 40,
                      flexShrink: 0,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: colors.accentSubtle,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <DownloadIcon width={20} fill={colors.accent} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text
                      style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                      Android Native App (Direct APK)
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Signed Android package · Direct sovereign download
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.rezingSubtle,
                  }}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.rezing}]}>
                    {loadingRelease
                      ? 'VERIFYING APK...'
                      : `APK v${displayVersion}${release?.android.sizeLabel ? ` · ${release.android.sizeLabel}` : ''}`}
                  </Text>
                </View>
              </View>

              <Text style={[a.text_sm, {color: colors.muted, lineHeight: 20}]}>
                Download the native signed QuantZing Android installer (
                {release?.android.sizeLabel || 'Direct APK'}) hosted directly
                on {displayDomain}. Full-screen native layout, Reels, ZingSpaces,
                and Quanty AI without Play Store delays.
              </Text>

              {/* APK Metadata & SHA-256 Verification Box */}
              <View
                style={[
                  a.p_sm,
                  a.rounded_md,
                  a.gap_2xs,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <ShieldIcon width={14} fill={colors.rezing} />
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                    Release Verification · v{displayVersion}{' '}
                    {release?.android.sizeLabel
                      ? `(${release.android.sizeLabel})`
                      : ''}
                  </Text>
                </View>
                <Text
                  selectable
                  style={[
                    {
                      fontSize: 11,
                      color: colors.muted,
                      fontVariant: ['tabular-nums'],
                    },
                  ]}>
                  SHA-256:{' '}
                  {release?.android.sha256 ||
                    'Verified on sovereign release server (/download/quantzing-android.apk)'}
                </Text>
              </View>

              {/* 3-Step Android Install Guide */}
              <View style={[a.gap_xs]}>
                <Text
                  style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                  3-STEP ANDROID INSTALL GUIDE
                </Text>
                {[
                  '1. Tap "Download Android APK" below to save QuantZing-Android.apk.',
                  '2. Open the downloaded APK and allow "Install Unknown Apps" for your browser if prompted.',
                  '3. Tap Install and open QuantZing directly from your Android app drawer.',
                ].map(step => (
                  <View
                    key={step}
                    style={[a.flex_row, a.align_center, a.gap_xs]}>
                    <CheckIcon width={14} fill={colors.rezing} />
                    <Text style={[a.text_xs, {color: colors.text, flex: 1, minWidth: 0}]}>
                      {step}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable
                testID="downloadAndroidApkBtn"
                onPress={onDownloadApk}
                accessibilityRole="button"
                accessibilityLabel="Download QuantZing Android APK"
                style={({pressed}) => [
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.gap_sm,
                  a.rounded_full,
                  {
                    height: 46,
                    backgroundColor: colors.ctaBg,
                    opacity: pressed ? 0.85 : 1,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                {loadingRelease ? (
                  <ActivityIndicator size="small" color={colors.ctaText} />
                ) : (
                  <DownloadIcon width={18} fill={colors.ctaText} />
                )}
                <Text
                  style={[a.text_md, a.font_bold, {color: colors.ctaText}]}>
                  Download Android APK
                  {release?.android.sizeLabel
                    ? ` (${release.android.sizeLabel})`
                    : ''}
                </Text>
              </Pressable>
            </View>

            {/* Card 2: iPhone & iPad Direct Profile (.mobileconfig) */}
            <View
              testID="downloadIosCard"
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 18,
                padding: 20,
                gap: 14,
              }}>
              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_xs,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_sm, {flex: 1, minWidth: 200}]}>
                  <View
                    style={{
                      width: 40,
                      flexShrink: 0,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: colors.accentSubtle,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <PhoneIcon width={20} fill={colors.accent} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text
                      style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                      iPhone & iPad Direct Profile (.mobileconfig)
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      iOS Signed WebClip Configuration Profile · Full-screen
                      standalone
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.accentSubtle,
                  }}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                    iOS DIRECT PROFILE
                  </Text>
                </View>
              </View>

              <Text style={[a.text_sm, {color: colors.muted, lineHeight: 20}]}>
                Install QuantZing on iPhone and iPad with our 1-tap Apple
                Configuration Profile (.mobileconfig). Adds the native QuantZing
                icon directly to your iOS Home Screen with full-screen
                standalone launch.
              </Text>

              {/* iOS Install Steps */}
              <View style={[a.gap_xs]}>
                <Text
                  style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
                  iOS DIRECT PROFILE INSTALL STEPS
                </Text>
                {[
                  '1. Tap "Install Direct Profile (.mobileconfig)" below and tap Allow when iOS prompts to download the configuration profile.',
                  '2. Open iOS Settings > tap "Profile Downloaded" near the top of Settings.',
                  '3. Tap Install in the top-right corner to add the standalone QuantZing app to your iPhone or iPad Home Screen.',
                ].map(step => (
                  <View
                    key={step}
                    style={[a.flex_row, a.align_center, a.gap_xs]}>
                    <CheckIcon width={14} fill={colors.accent} />
                    <Text style={[a.text_xs, {color: colors.text, flex: 1, minWidth: 0}]}>
                      {step}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Honest App Store / TestFlight .ipa Pipeline Note */}
              <View
                style={[
                  a.p_sm,
                  a.rounded_md,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  iOS App Store & TestFlight (.ipa) pipeline status:{' '}
                  {release?.ios.appStoreStatus ||
                    'pending_macos_ipa_submission'}{' '}
                  (native Xcode project configured in /ios; use Direct Profile
                  .mobileconfig or Safari Add to Home Screen today).
                </Text>
              </View>

              <Pressable
                testID="installIosProfileBtn"
                onPress={onInstallIosProfile}
                accessibilityRole="button"
                accessibilityLabel="Install Direct Profile (.mobileconfig) for iPhone and iPad"
                style={({pressed}) => [
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.gap_sm,
                  a.rounded_full,
                  {
                    height: 46,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.85 : 1,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <DownloadIcon width={18} fill="#FFFFFF" />
                <Text style={[a.text_md, a.font_bold, {color: '#FFFFFF'}]}>
                  Install Direct Profile (.mobileconfig)
                </Text>
              </Pressable>
            </View>

            {/* Card 3: Instant Web App (PWA) */}
            <View
              testID="downloadPwaCard"
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 18,
                padding: 20,
                gap: 14,
              }}>
              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_xs,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_sm, {flex: 1, minWidth: 200}]}>
                  <View
                    style={{
                      width: 40,
                      flexShrink: 0,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: colors.rezingSubtle,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <GlobeIcon width={20} fill={colors.rezing} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text
                      style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                      Instant Web App (PWA)
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Chrome, Safari, Edge, Brave · Desktop & Mobile
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.rezingSubtle,
                  }}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.rezing}]}>
                    READY NOW
                  </Text>
                </View>
              </View>

              <Text style={[a.text_sm, {color: colors.muted, lineHeight: 20}]}>
                1-tap Progressive Web App installation via browser
                beforeinstallprompt or Safari "Add to Home Screen". Launches in
                a dedicated app window with automatic live updates.
              </Text>

              <Pressable
                testID="installPwaDirectBtn"
                onPress={() => void onInstallPwa()}
                accessibilityRole="button"
                accessibilityLabel="Install Instant Web App (PWA)"
                style={({pressed}) => [
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.gap_sm,
                  a.rounded_full,
                  {
                    height: 46,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <DownloadIcon width={18} fill={colors.text} />
                <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                  {canInstallPwa
                    ? 'Install Web App Now (1-Tap)'
                    : isIos
                      ? 'Safari Add to Home Screen Guide'
                      : 'Install Instant Web App (PWA)'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Store Roadmap Footer */}
          <View
            style={[
              a.flex_row,
              a.flex_wrap,
              a.align_center,
              a.justify_between,
              a.gap_md,
              {
                padding: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}>
            <View style={{gap: 2, flex: 1}}>
              <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                Sovereign Distribution · com.quantzing.app
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Direct APK, iOS Configuration Profile (.mobileconfig), and PWA
                connect straight to {displayDomain}.
              </Text>
            </View>
            <Text style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
              v{displayVersion} · QuantOS
            </Text>
          </View>
        </View>
      </ScrollView>
    </Layout.Screen>
  )
}
