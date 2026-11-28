import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {
  Dot,
  FeatureCard,
  useValuePropText,
  type ValuePropositionPagerProps,
} from './ValuePropositionPager.shared'

export function ValuePropositionPager({
  step,
  avatarUri,
}: ValuePropositionPagerProps) {
  const t = useTheme()
  const {title, description} = useValuePropText(step)

  return (
    <View>
      <FeatureCard page={step} avatarUri={avatarUri} />

      <View style={[a.mt_4xl, a.gap_2xl, a.align_center]}>
        <View style={[a.flex_row, a.gap_sm]}>
          <Dot active={step === 0} />
          <Dot active={step === 1} />
          <Dot active={step === 2} />
        </View>

        <View style={[a.gap_sm]}>
          <Text style={[a.font_bold, a.text_3xl, a.text_center]}>{title}</Text>
          <Text
            style={[
              t.atoms.text_contrast_medium,
              a.text_md,
              a.leading_snug,
              a.text_center,
            ]}>
            {description}
          </Text>
        </View>
      </View>
    </View>
  )
}
