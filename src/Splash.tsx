import {forwardRef, useCallback, useEffect, useState} from 'react'
import {
  AccessibilityInfo,
  Image as RNImage,
  useColorScheme,
  View,
} from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import Svg, {Path, Rect, type SvgProps} from 'react-native-svg'
import {scheduleOnRN} from 'react-native-worklets'
import {Image} from 'expo-image'
import * as SplashScreen from 'expo-splash-screen'

import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useBreakpoints} from '#/alf'
// @ts-expect-error
import splashImagePointer from '../assets/splash/splash.png'
// @ts-expect-error
import darkSplashImagePointer from '../assets/splash/splash-dark.png'

const splashImageUri = RNImage.resolveAssetSource(splashImagePointer)!.uri
const darkSplashImageUri = RNImage.resolveAssetSource(
  darkSplashImagePointer,
)!.uri

export const Logo = forwardRef(function LogoImpl(props: SvgProps, ref) {
  const width = 1000
  const height = 1000
  const badgeFill = props.fill || '#000000'
  return (
    <Svg
      fill="none"
      // @ts-expect-error it's fiiiiine
      ref={ref}
      viewBox="0 0 64 64"
      accessibilityLabel="QuantZing"
      style={[{width, height}, props.style]}>
      <Rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={badgeFill}
        stroke="#2F3336"
        strokeWidth={2}
      />
      <Path
        fill="#FFFFFF"
        d="M15 15H49V21L27 42H49V49H15V43L37 22H15Z"
      />
      <Path fill="#1D9BF0" d="M23 29.5H46L41 34.5H18Z" />
    </Svg>
  )
})

type Props = {
  isReady: boolean
}

export function Splash(props: React.PropsWithChildren<Props>) {
  'use no memo'
  const insets = useSafeAreaInsets()
  const {gtMobile} = useBreakpoints()
  const intro = useSharedValue(0)
  const outroLogo = useSharedValue(0)
  const outroApp = useSharedValue(0)
  const outroSplashOpacity = useSharedValue(0)
  const [isAnimationComplete, setIsAnimationComplete] = useState(false)
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [isLayoutReady, setIsLayoutReady] = useState(false)
  const [reduceMotion, setReduceMotion] = useState<boolean | undefined>(false)
  const isReady =
    props.isReady &&
    isImageLoaded &&
    isLayoutReady &&
    reduceMotion !== undefined

  const colorScheme = useColorScheme()
  const isDarkMode = colorScheme === 'dark'

  const logoAnimation = useAnimatedStyle(() => {
    const introScale = interpolate(intro.get(), [0, 1], [0.8, 1], 'clamp')
    const outroScale =
      reduceMotion === true
        ? 1
        : interpolate(outroLogo.get(), [0, 0.08, 1], [1, 0.8, 500], 'clamp')

    const introOpacity = interpolate(intro.get(), [0, 1], [0, 1], 'clamp')
    const outroOpacity = interpolate(
      outroSplashOpacity.get(),
      [0, 0.1, 0.2, 1],
      [1, 1, 0, 0],
      'clamp',
    )

    return {
      opacity: introOpacity * outroOpacity,
      transform: [
        {translateY: -(insets.top / 2)},
        {scale: 0.1 * outroScale * introScale},
      ],
    }
  })
  const bottomLogoAnimation = useAnimatedStyle(() => {
    return {
      opacity: interpolate(intro.get(), [0, 1], [0, 1], 'clamp'),
    }
  })

  const splashAnimation = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        outroSplashOpacity.get(),
        [0, 0.1, 0.2, 1],
        [1, 1, 0, 0],
        'clamp',
      ),
    }
  })

  /**
   * Keep the app opaque so iOS blur/glass effects can initialize while the
   * splash hides it. No scale on tablet layouts, where it leaves the top of
   * the sidebar blurred by its scroll edge effect after launch.
   */
  const appAnimation = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: gtMobile
            ? 1
            : interpolate(outroApp.get(), [0, 1], [1.1, 1], 'clamp'),
        },
      ],
    }
  })

  const onFinish = useCallback(() => setIsAnimationComplete(true), [])
  const onLayout = useCallback(() => setIsLayoutReady(true), [])
  const onLoadEnd = useCallback(() => setIsImageLoaded(true), [])

  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setIsImageLoaded(true)
      setIsLayoutReady(true)
      setReduceMotion(prev => prev ?? false)
    }, 250)
    return () => clearTimeout(fallbackTimer)
  }, [])

  useEffect(() => {
    if (isReady) {
      const failsafeTimer = setTimeout(() => {
        outroApp.set(1)
        outroSplashOpacity.set(1)
        outroLogo.set(1)
        onFinish()
      }, 600)

      const startOutro = () => {
        intro.set(
          withTiming(
            1,
            {duration: 120, easing: Easing.out(Easing.cubic)},
            () => {
              'worklet'
              // set these values to check animation at specific point
              outroLogo.set(
                withTiming(
                  1,
                  {duration: 240, easing: Easing.in(Easing.cubic)},
                  () => {
                    scheduleOnRN(onFinish)
                  },
                ),
              )
              outroApp.set(
                withTiming(1, {
                  duration: 240,
                  easing: Easing.inOut(Easing.cubic),
                }),
              )
              outroSplashOpacity.set(
                withTiming(1, {
                  duration: 240,
                  easing: Easing.in(Easing.cubic),
                }),
              )
            },
          ),
        )
      }

      SplashScreen.hideAsync()
        .then(startOutro)
        .catch(() => {
          startOutro()
        })

      return () => clearTimeout(failsafeTimer)
    }
  }, [onFinish, intro, outroLogo, outroApp, outroSplashOpacity, isReady])

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false))
  }, [])

  const logoBg = isDarkMode ? '#000000' : '#0F1419'

  return (
    <View style={{flex: 1}} onLayout={onLayout}>
      {isReady && (
        <Animated.View style={[{flex: 1}, appAnimation]}>
          {props.children}
        </Animated.View>
      )}

      {!isAnimationComplete && (
        <Animated.View
          style={[
            a.absolute,
            a.inset_0,
            // The splash PNGs contain partially transparent pixels.
            {backgroundColor: isDarkMode ? '#000000' : '#FFFFFF'},
            splashAnimation,
          ]}>
          <Image
            accessibilityIgnoresInvertColors
            onLoadEnd={onLoadEnd}
            source={{uri: isDarkMode ? darkSplashImageUri : splashImageUri}}
            style={[a.absolute, a.inset_0]}
          />

          <Animated.View
            style={[
              bottomLogoAnimation,
              {
                position: 'absolute',
                bottom: insets.bottom + 40,
                left: 0,
                right: 0,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
              },
            ]}>
            <Logotype fill="#fff" width={90} />
          </Animated.View>
        </Animated.View>
      )}

      {isReady && !isAnimationComplete && (
        <Animated.View
          style={[
            a.absolute,
            a.inset_0,
            logoAnimation,
            {
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}>
          <Logo fill={logoBg} />
        </Animated.View>
      )}
    </View>
  )
}
