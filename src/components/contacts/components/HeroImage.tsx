import {View} from 'react-native'
import {atoms as a, useTheme} from '#/alf'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {PersonGroup_Stroke2_Corner2_Rounded as PersonGroupIcon} from '#/components/icons/Person'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'

export function ContactsHeroImage() {
  const t = useTheme()

  return (
    <View
      style={[
        a.w_full,
        a.p_2xl,
        a.rounded_xl,
        a.align_center,
        a.justify_center,
        a.relative,
        a.overflow_hidden,
        t.atoms.bg_contrast_25,
        a.border,
        t.atoms.border_contrast_low,
        {minHeight: 180},
      ]}>
      {/* Background decorative glow / cards */}
      <View
        style={[
          a.absolute,
          a.inset_0,
          {
            opacity: 0.12,
            backgroundColor: t.palette.primary_500,
          },
        ]}
      />

      <View style={[a.flex_row, a.align_center, a.gap_xl]}>
        {/* Phone / Contacts Badge */}
        <View
          style={[
            a.p_lg,
            a.rounded_full,
            t.atoms.bg_contrast_50,
            a.border,
            t.atoms.border_contrast_medium,
            a.align_center,
            a.justify_center,
            {width: 72, height: 72},
          ]}>
          <PhoneIcon size="lg" style={t.atoms.text_contrast_high} />
        </View>

        {/* Center Sparkle & Arrow representation */}
        <View style={[a.align_center, a.justify_center, a.gap_xs]}>
          <SparkleIcon size="md" style={{color: t.palette.primary_500}} />
          <VerifiedCheck size="lg" style={{color: t.palette.primary_500}} />
        </View>

        {/* People / Community Badge */}
        <View
          style={[
            a.p_lg,
            a.rounded_full,
            t.atoms.bg_contrast_50,
            a.border,
            t.atoms.border_contrast_medium,
            a.align_center,
            a.justify_center,
            {width: 72, height: 72},
          ]}>
          <PersonGroupIcon size="lg" style={t.atoms.text_contrast_high} />
        </View>
      </View>
    </View>
  )
}
