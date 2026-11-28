import {useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import PagerView from 'react-native-pager-view'
import {type PagerViewOnPageSelectedEvent} from 'react-native-pager-view'

import {atoms as a, tokens, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {
  Dot,
  FeatureCard,
  useValuePropText,
  type ValuePropositionPagerProps,
} from './ValuePropositionPager.shared'

export function ValuePropositionPager({
  step,
  setStep,
  avatarUri,
}: ValuePropositionPagerProps) {
  const [activePage, setActivePage] = useState(step)
  const ref = useRef<PagerView>(null)

  if (step !== activePage) {
    setActivePage(step)
  }

  /*
   * In an effect rather than inline above: driving the pager is a side effect,
   * and reading a ref during render is a Rules of React violation. `initialPage`
   * already covers the first render, so the mount run is a no-op.
   */
  useEffect(() => {
    ref.current?.setPage(step)
  }, [step])

  return (
    <View style={[a.h_full, {marginHorizontal: tokens.space.xl * -1}]}>
      <PagerView
        ref={ref}
        style={[a.flex_1]}
        initialPage={step}
        onPageSelected={(evt: PagerViewOnPageSelectedEvent) => {
          const page = evt.nativeEvent.position as 0 | 1 | 2
          if (step !== page) {
            setActivePage(page)
            setStep(page)
          }
        }}>
        {([0, 1, 2] as const).map(page => (
          <Page key={page} page={page} avatarUri={avatarUri} />
        ))}
      </PagerView>
    </View>
  )
}

function Page({page, avatarUri}: {page: 0 | 1 | 2; avatarUri?: string}) {
  const t = useTheme()
  const {title, description} = useValuePropText(page)

  return (
    <View key={page}>
      <FeatureCard page={page} avatarUri={avatarUri} />

      <View style={[a.mt_4xl, a.gap_2xl, a.px_xl, a.align_center]}>
        <View style={[a.flex_row, a.gap_sm]}>
          <Dot active={page === 0} />
          <Dot active={page === 1} />
          <Dot active={page === 2} />
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
