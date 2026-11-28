import {useCallback} from 'react'
import {View} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

// import {urls} from '#/lib/constants'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {useNuxDialogContext} from '#/components/dialogs/nuxs'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'
import {VerifierCheck} from '#/components/icons/VerifierCheck'
import {Link} from '#/components/Link'
import {Span, Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'

export function InitialVerificationAnnouncement() {
  const t = useTheme()
  const {_} = useLingui()
  const ax = useAnalytics()
  const {gtMobile} = useBreakpoints()
  const nuxDialogs = useNuxDialogContext()
  const control = Dialog.useDialogControl()

  Dialog.useAutoOpen(control)

  const onClose = useCallback(() => {
    nuxDialogs.dismissActiveNux()
  }, [nuxDialogs])

  return (
    <Dialog.Outer control={control} onClose={onClose}>
      <Dialog.Handle />

      <Dialog.ScrollableInner
        label={_(msg`Announcing verification on QuantZing`)}
        style={[
          a.w_full,
          gtMobile && web({width: 'auto', maxWidth: 400, minWidth: 200}),
        ]}>
        <View style={[a.align_start, a.gap_xl]}>
          <View
            style={[
              a.pl_sm,
              a.pr_md,
              a.py_sm,
              a.rounded_full,
              a.flex_row,
              a.align_center,
              a.gap_xs,
              {
                backgroundColor: t.palette.primary_25,
              },
            ]}>
            <SparkleIcon fill={t.palette.primary_700} size="sm" />
            <Text
              style={[
                a.font_semi_bold,
                {
                  color: t.palette.primary_700,
                },
              ]}>
              <Trans>New Feature</Trans>
            </Text>
          </View>

          <View
            style={[
              a.w_full,
              a.rounded_md,
              a.overflow_hidden,
              a.align_center,
              a.justify_center,
              {
                aspectRatio: 353 / 140,
                backgroundColor: '#16181C',
                borderColor: '#2F3336',
                borderWidth: 1,
              },
            ]}>
            <LinearGradient
              colors={['#16181C', '#1A232E', '#16181C']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={[a.absolute, a.inset_0]}
            />
            <View
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 56,
                  height: 56,
                  backgroundColor: 'rgba(29, 155, 240, 0.12)',
                  borderColor: 'rgba(29, 155, 240, 0.3)',
                  borderWidth: 1,
                },
              ]}>
              <VerifiedCheck width={28} height={28} fill="#1D9BF0" />
            </View>
          </View>

          <View style={[a.gap_xs]}>
            <Text style={[a.text_2xl, a.font_semi_bold, a.leading_snug]}>
              <Trans>A new form of verification</Trans>
            </Text>
            <Text style={[a.leading_snug, a.text_md]}>
              <Trans>
                We’re introducing a new layer of verification on QuantZing — an
                easy-to-see checkmark.
              </Trans>
            </Text>
          </View>

          <View
            style={[
              a.w_full,
              a.rounded_md,
              a.overflow_hidden,
              a.align_center,
              a.justify_center,
              {
                aspectRatio: 353 / 140,
                backgroundColor: '#16181C',
                borderColor: '#2F3336',
                borderWidth: 1,
              },
            ]}>
            <LinearGradient
              colors={['#16181C', '#1D242D', '#16181C']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={[a.absolute, a.inset_0]}
            />
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.px_lg,
                a.py_md,
                a.rounded_full,
                {
                  backgroundColor: '#202327',
                  borderColor: '#2F3336',
                  borderWidth: 1,
                },
              ]}>
              <Text style={[a.font_bold, a.text_md, {color: '#FFFFFF'}]}>
                QuantZing
              </Text>
              <VerifiedCheck width={18} height={18} fill="#1D9BF0" />
            </View>
          </View>

          <View style={[a.gap_sm]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <VerifierCheck width={14} />
              <Text style={[a.text_lg, a.font_semi_bold, a.leading_snug]}>
                <Trans>Who can verify?</Trans>
              </Text>
            </View>
            <View style={[a.gap_sm]}>
              <Text style={[a.leading_snug, a.text_md]}>
                <Trans>
                  QuantZing will proactively verify notable and authentic
                  accounts.
                </Trans>
              </Text>
              <Text style={[a.leading_snug, a.text_md]}>
                <Trans>
                  Trust emerges from relationships, communities, and shared
                  context, so we’re also enabling{' '}
                  <Span style={[a.font_semi_bold]}>trusted verifiers</Span>:
                  organizations that can directly issue verification.
                </Trans>
              </Text>
              <Text style={[a.leading_snug, a.text_md]}>
                <Trans>
                  When you tap on a check, you’ll see which organizations have
                  granted verification.
                </Trans>
              </Text>
            </View>
          </View>

          <View style={[a.w_full, a.gap_md]}>
            <Link
              overridePresentation
              to="https://quantzing.com"
              label={_(msg`Read blog post`)}
              size="small"
              variant="solid"
              color="primary"
              style={[a.justify_center, a.w_full]}
              onPress={() => {
                ax.metric('verification:learn-more', {
                  location: 'initialAnnouncementeNux',
                })
              }}>
              <ButtonText>
                <Trans>Read blog post</Trans>
              </ButtonText>
            </Link>
            {IS_NATIVE && (
              <Button
                label={_(msg`Close`)}
                size="small"
                variant="solid"
                color="secondary"
                style={[a.justify_center, a.w_full]}
                onPress={() => {
                  control.close()
                }}>
                <ButtonText>
                  <Trans>Close</Trans>
                </ButtonText>
              </Button>
            )}
          </View>
        </View>

        <Dialog.Close />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}
