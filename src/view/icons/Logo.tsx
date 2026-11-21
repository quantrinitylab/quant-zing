import {forwardRef} from 'react'
import {type TextProps} from 'react-native'
import Svg, {
  Path,
  type PathProps,
  Rect,
  type SvgProps,
} from 'react-native-svg'

import {flatten, useTheme} from '#/alf'

type Props = {
  allowVariants?: boolean
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

function isWhiteColor(value: PathProps['fill']): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return (
    normalized === 'white' ||
    normalized === '#fff' ||
    normalized === '#ffffff' ||
    normalized === 'rgb(255, 255, 255)'
  )
}

export const Logo = forwardRef(function LogoImpl(props: Props, ref) {
  const t = useTheme()
  const {allowVariants: _allowVariants = true, fill, ...rest} = props
  const styles = flatten(props.style)
  // @ts-expect-error numeric width coercion matches upstream Logo contract
  const size = parseInt(rest.width || 32, 10)

  const whiteRequested = isWhiteColor(fill)
  const useDefaultMark = !fill || fill === 'sky'

  let markFill: PathProps['fill']
  let markStroke: string | undefined
  let primaryGlyphFill: string
  let accentSlashFill: string
  let accentSlashOpacity: number

  if (whiteRequested) {
    // Avoid white-on-white when callers pass fill="white" over dark or gradient surfaces
    markFill = 'rgba(255, 255, 255, 0.14)'
    markStroke = 'rgba(255, 255, 255, 0.35)'
    primaryGlyphFill = '#FFFFFF'
    accentSlashFill = '#1D9BF0'
    accentSlashOpacity = 0.95
  } else if (useDefaultMark) {
    markFill = t.scheme === 'dark' ? '#000000' : '#0F1419'
    markStroke = t.scheme === 'dark' ? '#2F3336' : '#272C30'
    primaryGlyphFill = '#FFFFFF'
    accentSlashFill = '#1D9BF0'
    accentSlashOpacity = 1
  } else {
    markFill = fill
    markStroke = undefined
    primaryGlyphFill = '#FFFFFF'
    accentSlashFill = '#1D9BF0'
    accentSlashOpacity = 0.92
  }

  return (
    <Svg
      fill="none"
      // @ts-expect-error ref forwarding matches upstream Logo contract
      ref={ref}
      viewBox="0 0 64 64"
      accessibilityLabel="QuantZing"
      {...rest}
      style={[{width: size, height: size}, styles]}>
      <Rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={markFill}
        stroke={markStroke}
        strokeWidth={markStroke ? 2 : 0}
      />
      <Path
        fill={primaryGlyphFill}
        d="M15 15H49V21L27 42H49V49H15V43L37 22H15Z"
      />
      <Path
        fill={accentSlashFill}
        fillOpacity={accentSlashOpacity}
        d="M23 29.5H46L41 34.5H18Z"
      />
    </Svg>
  )
})
