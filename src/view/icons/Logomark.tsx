import {type ComponentProps} from 'react'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'
import {Logo} from '#/view/icons/Logo'

export function Logomark({
  fill,
  style,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  const size = parseInt(`${rest.width || 32}`, 10)

  return (
    <Logo
      {...rest}
      width={size}
      fill={fill || pal.text.color}
      style={style as ComponentProps<typeof Logo>['style']}
    />
  )
}
