import {useCallback, useEffect, useMemo, useState} from 'react'
import {Platform, Pressable, ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {getQuantZingColors} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Download_Stroke2_Corner0_Rounded as DownloadIcon} from '#/components/icons/Download'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type ReleaseMeta = {
  version: string
  pwaReady: boolean
  androidApkAvailable: boolean
  androidApkUrl: string
  androidApkSizeBytes: number
  androidApkSha256: string | null
  androidApkUpdatedAt: string | null
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function DownloadScreen() {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const [release, setRelease] = useState<ReleaseMeta | null>(null)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  const [installFeedback, setInstallFeedback] = useState<string | null>(null)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const ua = navigator.userAgent || ''
    setIsIos(/iPad|iPhone|iPod/i.test(ua))

    const syncPrompt = () => {
      setCanInstallPwa(Boolean((window as any).__qzDeferredInstall))
    }
    syncPrompt()
    window.addEventListener('qz-install-ready', syncPrompt)

    fetch('/api/quantzing/app-release')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && data.ok) setRelease(data)
      })
      .catch(() => {})

    return () => {
      window.removeEventListener('qz-install-ready', syncPrompt)
    }
  }, [])

  const onInstallPwa = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const deferred = (window as any).__qzDeferredInstall
    if (deferred && typeof deferred.prompt === 'function') {
      try {
        await deferred.prompt()
        const choice = await deferred.userChoice
        if (choice?.outcome === 'accepted') {
          setInstallFeedback(
            'QuantZing is installing directly onto your device.',
          )
          ;(window as any).__qzDeferredInstall = null
          setCanInstallPwa(false)
        } else {
          setInstallFeedback(
            'Install dismissed. You can tap Install App again anytime.',
          )
        }
        return
      } catch {}
    }
    if (isIos) {
      setInstallFeedback(
        'On iPhone/iPad Safari: tap the Share icon at the bottom, then choose "Add to Home Screen" to install QuantZing.',
      )
    } else {
      setInstallFeedback(
        'Open your browser menu (three dots) and choose "Install app" or "Add to Home screen" to install QuantZing directly.',
      )
    }
  }, [isIos])

  const onDownloadApk = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    if (release?.androidApkAvailable) {
      window.location.href = release.androidApkUrl || '/download/quantzing-android.apk'
      setInstallFeedback(
        'Downloading QuantZing-Android.apk directly from QuantZing servers.',
      )
    } else {
      setInstallFeedback(
        'Direct Android APK package is being signed for release. Tap "Install QuantZing App" above for immediate standalone installation right now.',
      )
    }
  }, [release])

  const onBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      ;(navigation as any).navigate('Home')
    }
  }, [navigation])

  return (
    <Layout.Screen style={[{backgroundColor: colors.bg}]}>
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
              maxWidth: 760,
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
              {marginBottom: 28},
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
                QuantZing
              </Text>
            </View>
          </View>

          {/* Hero */}
          <View style={{marginBottom: 28}}>
            <Text
              style={[
                a.font_bold,
                {
                  fontSize: gtMobile ? 40 : 30,
                  lineHeight: gtMobile ? 46 : 36,
                  letterSpacing: -0.8,
                  color: colors.text,
                  marginBottom: 10,
                },
              ]}>
              Get the QuantZing App
            </Text>
            <Text
              style={[
                a.text_md,
                {color: colors.muted, lineHeight: 22, maxWidth: 580},
              ]}>
              Install QuantZing directly from our sovereign servers — no Play
              Store or App Store wait required. Full-screen vertical Reels,
              real-time Zings, encrypted DMs, and Quanty AI in a standalone
              native-feel app.
            </Text>
          </View>

          {installFeedback && (
            <View
              testID="downloadFeedbackBanner"
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#1D9BF0',
                backgroundColor: 'rgba(29, 155, 240, 0.12)',
                marginBottom: 20,
              }}>
              <Text style={[a.text_sm, a.font_semi_bold, {color: colors.text}]}>
                {installFeedback}
              </Text>
            </View>
          )}

          {/* Primary Cards Grid */}
          <View
            style={[
              gtMobile ? a.flex_row : a.flex_col,
              a.gap_md,
              {marginBottom: 20},
            ]}>
            {/* Card 1: Instant App Install (Android / iOS / Desktop PWA) */}
            <View
              style={[
                a.flex_1,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 18,
                  padding: 20,
                  gap: 14,
                },
              ]}>
              <View style={[a.flex_row, a.align_center, a.justify_between]}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'rgba(29, 155, 240, 0.14)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <PhoneIcon width={22} fill="#1D9BF0" />
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: 'rgba(0, 186, 124, 0.16)',
                  }}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: '#00BA7C'}]}>
                    READY NOW
                  </Text>
                </View>
              </View>

              <View style={{gap: 6}}>
                <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                  Install QuantZing App
                </Text>
                <Text style={[a.text_sm, {color: colors.muted, lineHeight: 20}]}>
                  Direct 1-tap install on Android Chrome, iPhone Safari,
                  Windows, and macOS. Runs full-screen from your Home Screen
                  with automatic live updates.
                </Text>
              </View>

              <Pressable
                testID="installPwaDirectBtn"
                onPress={() => void onInstallPwa()}
                accessibilityRole="button"
                accessibilityLabel="Install QuantZing App directly"
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
                <DownloadIcon width={18} fill={colors.ctaText} />
                <Text style={[a.text_md, a.font_bold, {color: colors.ctaText}]}>
                  {canInstallPwa
                    ? 'Install Now (1-Tap)'
                    : isIos
                      ? 'Install on iPhone / iPad'
                      : 'Install App Directly'}
                </Text>
              </Pressable>
            </View>

            {/* Card 2: Direct Android APK */}
            <View
              style={[
                a.flex_1,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 18,
                  padding: 20,
                  gap: 14,
                },
              ]}>
              <View style={[a.flex_row, a.align_center, a.justify_between]}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'rgba(239, 243, 244, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <DownloadIcon width={22} fill={colors.text} />
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: release?.androidApkAvailable
                      ? 'rgba(0, 186, 124, 0.16)'
                      : 'rgba(29, 155, 240, 0.14)',
                  }}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {
                        color: release?.androidApkAvailable
                          ? '#00BA7C'
                          : '#1D9BF0',
                      },
                    ]}>
                    {release?.androidApkAvailable
                      ? `APK v${release.version}`
                      : 'DIRECT ANDROID APK'}
                  </Text>
                </View>
              </View>

              <View style={{gap: 6}}>
                <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                  Android Direct APK
                </Text>
                <Text style={[a.text_sm, {color: colors.muted, lineHeight: 20}]}>
                  {release?.androidApkAvailable
                    ? `Verified direct Android installer (${formatBytes(release.androidApkSizeBytes)}). Download and tap to install without Play Store.`
                    : 'Direct signed Android APK hosted straight on quantzing.quantrinity.in. While the Play Store listing is pending, use Install App or direct APK once published.'}
                </Text>
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
                    borderWidth: 1,
                    borderColor: '#1D9BF0',
                    backgroundColor: release?.androidApkAvailable
                      ? '#1D9BF0'
                      : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <DownloadIcon
                  width={18}
                  fill={release?.androidApkAvailable ? '#FFFFFF' : '#1D9BF0'}
                />
                <Text
                  style={[
                    a.text_md,
                    a.font_bold,
                    {
                      color: release?.androidApkAvailable
                        ? '#FFFFFF'
                        : '#1D9BF0',
                    },
                  ]}>
                  {release?.androidApkAvailable
                    ? 'Download Android APK'
                    : 'Check APK Release'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Step-by-Step Direct Install Guide */}
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 18,
              padding: 20,
              gap: 14,
              marginBottom: 20,
            }}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <GlobeIcon width={18} fill="#1D9BF0" />
              <Text style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                How to install in 10 seconds
              </Text>
            </View>

            <View style={{gap: 10}}>
              {[
                {
                  platform: 'Android (Chrome / Brave / Edge)',
                  steps:
                    'Tap "Install App Directly" above — or open browser menu (3 dots) -> "Install app" -> Confirm. QuantZing appears on your Home Screen like a native Play Store app.',
                },
                {
                  platform: 'iPhone & iPad (Safari)',
                  steps:
                    'Open quantzing.quantrinity.in in Safari -> tap the Share button -> scroll down and tap "Add to Home Screen" -> tap "Add". Opens full-screen without Safari bars.',
                },
                {
                  platform: 'Desktop (Windows / macOS / Linux)',
                  steps:
                    'Click the Install icon inside your Chrome/Edge address bar (or tap "Install App Directly" above) to run QuantZing as a dedicated desktop app window.',
                },
              ].map(item => (
                <View
                  key={item.platform}
                  style={[
                    a.flex_row,
                    a.align_start,
                    a.gap_sm,
                    {
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    },
                  ]}>
                  <View style={{paddingTop: 2}}>
                    <CheckIcon width={16} fill="#00BA7C" />
                  </View>
                  <View style={[a.flex_1, {gap: 4}]}>
                    <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                      {item.platform}
                    </Text>
                    <Text
                      style={[a.text_xs, {color: colors.muted, lineHeight: 18}]}>
                      {item.steps}
                    </Text>
                  </View>
                </View>
              ))}
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
              },
            ]}>
            <View style={{gap: 2}}>
              <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                Google Play & Apple App Store
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Store submissions for com.quantzing.app are in preparation.
                Direct install gives you the exact same sovereign network today.
              </Text>
            </View>
            <Text style={[a.text_xs, a.font_bold, {color: '#1D9BF0'}]}>
              v{release?.version || '1.139.0'} · QuantOS
            </Text>
          </View>
        </View>
      </ScrollView>
    </Layout.Screen>
  )
}
