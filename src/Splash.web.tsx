/*
 * This is a reimplementation of what exists in our HTML template files
 * already. Once the React tree mounts, this is what gets rendered first, until
 * the app is ready to go.
 */

import {useEffect, useRef, useState} from 'react'
import Svg, {Defs, LinearGradient, Path, Rect, Stop} from 'react-native-svg'

import {atoms as a, flattenToCSS} from '#/alf'

const size = 96

export function Splash({
  isReady,
  children,
}: React.PropsWithChildren<{
  isReady: boolean
}>) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false)
  const splashRef = useRef<HTMLDivElement>(null)

  // hide the static one that's baked into the HTML - gets replaced by our React version below
  useEffect(() => {
    // double rAF ensures that the React version gets painted first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const splash = document.getElementById('splash')
        if (splash) {
          splash.remove()
        }
      })
    })
  }, [])

  // when ready, we fade/scale out
  useEffect(() => {
    if (!isReady) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const node = splashRef.current
    if (!node || reduceMotion) {
      setIsAnimationComplete(true)
      return
    }

    const animation = node.animate(
      [
        {opacity: 1, transform: 'scale(1)'},
        {opacity: 0, transform: 'scale(1.5)'},
      ],
      {
        duration: 300,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards',
      },
    )
    animation.onfinish = () => setIsAnimationComplete(true)

    return () => {
      animation.cancel()
    }
  }, [isReady])

  return (
    <>
      {isReady && children}

      {!isAnimationComplete && (
        <div
          ref={splashRef}
          style={flattenToCSS([
            a.fixed,
            a.inset_0,
            a.flex,
            a.align_center,
            a.justify_center,
            // to compensate for the `top: -50px` below
            {transformOrigin: 'center calc(50% - 50px)'},
          ])}>
          <Svg
            fill="none"
            viewBox="0 0 64 64"
            accessibilityLabel="QuantZing"
            style={[a.relative, {width: size, height: size, top: -50}]}>
            <Defs>
              <LinearGradient
                id="quantzing-splash-bg"
                x1="0"
                y1="0"
                x2="1"
                y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="1" />
                <Stop offset="1" stopColor="#000000" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect
              x="2"
              y="2"
              width="60"
              height="60"
              rx="16"
              fill="url(#quantzing-splash-bg)"
              stroke="#2F3336"
              strokeWidth="2"
            />
            <Path
              fill="#FFFFFF"
              d="M15 15H49V21L27 42H49V49H15V43L37 22H15Z"
            />
            <Path fill="#1D9BF0" d="M23 29.5H46L41 34.5H18Z" />
          </Svg>
        </div>
      )}
    </>
  )
}
