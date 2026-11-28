import {View} from 'react-native'
import {Image as ExpoImage} from 'expo-image'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {VerifiedCheck} from '#/components/icons/brands/VerifiedCheck'
import {Live_Stroke2_Corner0_Rounded as Live} from '#/components/icons/Live'
import {Sparkle_Stroke2_Corner0_Rounded as Sparkle} from '#/components/icons/Sparkle'
import {Trending2_Stroke2_Corner2_Rounded as Trending} from '#/components/icons/Trending'
import {Text} from '#/components/Typography'

export type ValuePropositionPagerProps = {
  step: 0 | 1 | 2
  /**
   * Only the native pager changes pages itself (by swiping); the web pager
   * is driven entirely by the step prop.
   */
  setStep: (step: 0 | 1 | 2) => void
  avatarUri?: string
}

export function useValuePropText(step: 0 | 1 | 2) {
  const {_} = useLingui()

  return [
    {
      title: _(msg`Free your feed`),
      description: _(
        msg`No more doomscrolling junk-filled algorithms. Find feeds that work for you, not against you.`,
      ),
      alt: _(
        msg`A collection of popular feeds you can find on QuantZing, including News, Markets, Tech, and Science`,
      ),
    },
    {
      title: _(msg`Find your people`),
      description: _(
        msg`Ditch the trolls and clickbait. Find real people and conversations that matter to you.`,
      ),
      alt: _(
        msg`Your profile picture surrounded by concentric circles of other users' profile pictures`,
      ),
    },
    {
      title: _(msg`Forget the noise`),
      description: _(
        msg`No ads, no invasive tracking, no engagement traps. QuantZing respects your time and attention.`,
      ),
      alt: _(
        msg`An illustration of several QuantZing Zings alongside Rezing, like, and comment icons`,
      ),
    },
  ][step]
}

export function Dot({active}: {active: boolean}) {
  const t = useTheme()

  return (
    <View
      style={[
        a.rounded_full,
        {width: 8, height: 8},
        active
          ? {backgroundColor: t.palette.primary_500}
          : t.atoms.bg_contrast_50,
      ]}
    />
  )
}

export function FeatureCard({
  page,
  avatarUri,
}: {
  page: 0 | 1 | 2
  avatarUri?: string
}) {
  if (page === 0) {
    return (
      <View style={[a.w_full, a.align_center, a.justify_center, {height: 260}]}>
        <View
          style={[
            a.w_full,
            a.rounded_xl,
            a.p_xl,
            a.justify_between,
            {
              maxWidth: 320,
              height: 240,
              backgroundColor: '#16181C',
              borderWidth: 1,
              borderColor: '#2F3336',
            },
          ]}>
          <View style={[a.flex_row, a.justify_between, a.align_center]}>
            <View
              style={[
                a.rounded_full,
                a.align_center,
                a.justify_center,
                {
                  width: 44,
                  height: 44,
                  backgroundColor: 'rgba(29, 155, 240, 0.12)',
                },
              ]}>
              <Sparkle size="lg" style={{color: '#1D9BF0'}} />
            </View>
            <View
              style={[
                a.rounded_full,
                a.px_md,
                a.py_xs,
                {backgroundColor: 'rgba(255, 255, 255, 0.08)'},
              ]}>
              <Text style={[a.font_semi_bold, a.text_xs, {color: '#1D9BF0'}]}>
                Algorithm Freedom
              </Text>
            </View>
          </View>

          <View style={[a.gap_sm]}>
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.rounded_lg,
                a.p_sm,
                {backgroundColor: 'rgba(255, 255, 255, 0.04)'},
              ]}>
              <Trending size="sm" style={{color: '#1D9BF0'}} />
              <Text style={[a.font_medium, a.text_sm, {color: '#FFFFFF'}]}>
                Real-time Market Alpha
              </Text>
            </View>
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.rounded_lg,
                a.p_sm,
                {backgroundColor: 'rgba(255, 255, 255, 0.04)'},
              ]}>
              <Live size="sm" style={{color: '#00BA7C'}} />
              <Text style={[a.font_medium, a.text_sm, {color: '#FFFFFF'}]}>
                Live Breaking Insights
              </Text>
            </View>
          </View>

          <Text style={[a.text_xs, {color: '#71767B'}]}>
            Customizable feeds. No hidden bias.
          </Text>
        </View>
      </View>
    )
  }

  if (page === 1) {
    return (
      <View style={[a.w_full, a.align_center, a.justify_center, {height: 260}]}>
        <View
          style={[
            a.w_full,
            a.rounded_xl,
            a.p_xl,
            a.align_center,
            a.justify_center,
            {
              maxWidth: 320,
              height: 240,
              backgroundColor: '#16181C',
              borderWidth: 1,
              borderColor: '#2F3336',
            },
          ]}>
          <View
            style={[
              a.rounded_full,
              a.align_center,
              a.justify_center,
              {
                width: 150,
                height: 150,
                borderWidth: 1,
                borderColor: 'rgba(29, 155, 240, 0.2)',
                position: 'relative',
              },
            ]}>
            <View
              style={[
                a.rounded_full,
                a.align_center,
                a.justify_center,
                {
                  width: 96,
                  height: 96,
                  borderWidth: 1,
                  borderColor: 'rgba(29, 155, 240, 0.35)',
                },
              ]}>
              {avatarUri ? (
                <ExpoImage
                  source={avatarUri}
                  style={[a.rounded_full, {width: 52, height: 52}]}
                  alt="Your avatar"
                />
              ) : (
                <View
                  style={[
                    a.rounded_full,
                    a.align_center,
                    a.justify_center,
                    {width: 52, height: 52, backgroundColor: '#1D9BF0'},
                  ]}>
                  <Logo width={26} fill="#FFFFFF" />
                </View>
              )}
            </View>

            <View
              style={[
                a.absolute,
                a.rounded_full,
                {
                  top: 8,
                  right: 14,
                  backgroundColor: '#16181C',
                  padding: 2,
                },
              ]}>
              <VerifiedCheck size="md" style={{color: '#1D9BF0'}} />
            </View>
            <View
              style={[
                a.absolute,
                a.rounded_full,
                {
                  bottom: 12,
                  left: 10,
                  backgroundColor: '#16181C',
                  padding: 2,
                },
              ]}>
              <VerifiedCheck size="sm" style={{color: '#1D9BF0'}} />
            </View>
          </View>

          <Text style={[a.text_xs, a.mt_md, {color: '#71767B'}]}>
            Follow high-signal quants and creators
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[a.w_full, a.align_center, a.justify_center, {height: 260}]}>
      <View
        style={[
          a.w_full,
          a.rounded_xl,
          a.p_xl,
          a.justify_between,
          {
            maxWidth: 320,
            height: 240,
            backgroundColor: '#16181C',
            borderWidth: 1,
            borderColor: '#2F3336',
          },
        ]}>
        <View style={[a.flex_row, a.justify_between, a.align_center]}>
          <Logo width={36} fill="#FFFFFF" />
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.rounded_full,
              a.px_md,
              a.py_xs,
              {backgroundColor: 'rgba(29, 155, 240, 0.12)'},
            ]}>
            <VerifiedCheck size="xs" style={{color: '#1D9BF0'}} />
            <Text style={[a.font_semi_bold, a.text_xs, {color: '#1D9BF0'}]}>
              Pure Stream
            </Text>
          </View>
        </View>

        <View style={[a.gap_sm]}>
          <View style={[a.flex_row, a.justify_between, a.align_center]}>
            <Text style={[a.text_sm, {color: '#E7E9EA'}]}>Ads & Tracking</Text>
            <Text style={[a.font_bold, a.text_sm, {color: '#F4212E'}]}>
              Zero
            </Text>
          </View>
          <View style={[a.flex_row, a.justify_between, a.align_center]}>
            <Text style={[a.text_sm, {color: '#E7E9EA'}]}>Algorithm Traps</Text>
            <Text style={[a.font_bold, a.text_sm, {color: '#F4212E'}]}>
              None
            </Text>
          </View>
          <View style={[a.flex_row, a.justify_between, a.align_center]}>
            <Text style={[a.text_sm, {color: '#E7E9EA'}]}>Your Attention</Text>
            <Text style={[a.font_bold, a.text_sm, {color: '#00BA7C'}]}>
              Protected
            </Text>
          </View>
        </View>

        <Text style={[a.text_xs, {color: '#71767B'}]}>
          Built for speed, focus, and transparency
        </Text>
      </View>
    </View>
  )
}
