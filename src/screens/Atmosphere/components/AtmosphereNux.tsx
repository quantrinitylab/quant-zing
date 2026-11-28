import {type StyleProp, View, type ViewStyle} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
import {Trans, useLingui} from '@lingui/react/macro'
import {useMutationState} from '@tanstack/react-query'

import {HITSLOP_10} from '#/lib/constants'
import {Nux, saveNuxMutationKey, useNux, useSaveNux} from '#/state/queries/nuxs'
import {type AppNux} from '#/state/queries/nuxs/definitions'
import {AboutAtmosphereDialog} from '#/screens/Atmosphere/components/AboutAtmosphereDialog'
import {EXPLORE_SECTION_PADDING} from '#/screens/Atmosphere/const'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/TimesLarge'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function AtmosphereNux({style}: {style?: StyleProp<ViewStyle>}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const {nux} = useNux(Nux.AtmosphereNux)
  const {mutate: save} = useSaveNux()
  /** Include failed saves so every tab keeps the same optimistic dismissal. */
  const dismissals = useMutationState({
    filters: {mutationKey: saveNuxMutationKey},
    select: mutation => {
      const nux = mutation.state.variables as AppNux | undefined
      return nux?.id === Nux.AtmosphereNux && nux.completed
    },
  })
  const aboutDialogControl = Dialog.useDialogControl()

  if (dismissals.some(Boolean) || nux?.completed) return null

  const dismiss = () => {
    save({
      id: Nux.AtmosphereNux,
      completed: true,
      data: undefined,
    })
    ax.metric('atmosphere:nux:bannerDismissed', {})
  }

  return (
    <View
      style={[a.pb_md, {paddingHorizontal: EXPLORE_SECTION_PADDING}, style]}>
      <View
        style={[
          a.w_full,
          a.relative,
          a.rounded_md,
          a.overflow_hidden,
          {
            height: 180,
            backgroundColor: '#16181C',
            borderColor: '#2F3336',
            borderWidth: 1,
          },
        ]}>
        <LinearGradient
          colors={['#16181C', '#1A222D', '#16181C']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={[a.absolute, a.inset_0]}
        />
        <View
          style={[a.absolute, {right: -16, top: -16, opacity: 0.18}]}
          pointerEvents="none">
          <GlobeIcon width={210} height={210} fill="#1D9BF0" />
        </View>
        <View
          style={[
            a.absolute,
            a.inset_0,
            a.align_start,
            a.justify_end,
            a.p_lg,
            a.gap_xs,
          ]}>
          <Text
            style={[a.text_lg, a.font_bold, {color: '#FFFFFF'}]}
            numberOfLines={2}>
            <Trans>Discover the Atmosphere</Trans>
          </Text>
          <Text
            style={[
              a.text_sm,
              a.leading_snug,
              a.pb_sm,
              {color: '#71767B', maxWidth: 260},
            ]}
            numberOfLines={4}>
            <Trans>
              QuantZing is part of an open ecosystem of hundreds of apps and
              integrations. Your account unlocks them all.
            </Trans>
          </Text>
          <Button
            label={l`Learn more`}
            accessibilityHint={l`Opens a dialog with more information about the Atmosphere`}
            hitSlop={HITSLOP_10}
            testID="atmosphereNuxLearnMore"
            onPress={() => {
              ax.metric('atmosphere:nux:learnMore', {})
              aboutDialogControl.open()
            }}
            color="primary"
            size="small"
            style={[a.px_md, a.py_xs]}>
            <ButtonText>
              <Trans>Learn more</Trans>
            </ButtonText>
          </Button>
        </View>
        <Button
          label={l`Dismiss info banner`}
          accessibilityHint={l`Hides this banner permanently`}
          hitSlop={HITSLOP_10}
          testID="atmosphereNuxDismiss"
          onPress={dismiss}
          color="secondary"
          shape="round"
          size="tiny"
          style={[
            a.absolute,
            a.align_center,
            a.justify_center,
            {top: a.p_md.padding, right: a.p_md.padding},
          ]}>
          <ButtonIcon icon={XIcon} size="sm" />
        </Button>
      </View>
      <AboutAtmosphereDialog control={aboutDialogControl} />
    </View>
  )
}
