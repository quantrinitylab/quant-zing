import {View, type ViewProps} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useTheme} from '#/alf'

export function LogomarkWithType({
  fill,
  style,
  width,
  height: _height,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const t = useTheme()
  const totalWidth = parseInt(`${width || 136}`, 10)
  const logoSize = Math.max(20, Math.round(totalWidth * 0.24))
  const typeWidth = Math.max(72, Math.round(totalWidth * 0.72))

  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        style as ViewProps['style'],
      ]}>
      <Logo {...rest} width={logoSize} fill={fill || t.atoms.text.color} />
      <Logotype width={typeWidth} fill={t.atoms.text.color} />
    </View>
  )
}
