import {Text} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-expect-error numeric width coercion matches upstream Logotype contract
  const size = parseInt(rest.width || 96)
  const fontSize = Math.max(15, Math.round(size * 0.21))
  const textColor = typeof fill === 'string' ? fill : pal.text.color

  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize,
        fontWeight: '800',
        letterSpacing: -0.6,
        color: textColor,
        lineHeight: Math.round(fontSize * 1.15),
      }}>
      Quant
      <Text style={{color: '#1D9BF0'}}>Zing</Text>
    </Text>
  )
}
