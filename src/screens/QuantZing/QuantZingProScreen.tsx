import {useCallback, useMemo, useState} from 'react'
import {ActivityIndicator, Linking, Pressable, View} from 'react-native'

import {
  createQuantZingProCheckout,
  getQuantZingColors,
  type QuantZingCheckoutResult,
  type QuantZingPlanId,
} from '#/lib/quantos/client'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'
import {Zap_Stroke2_Corner0_Rounded as ZapIcon} from '#/components/icons/Zap'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface PlanTier {
  id: QuantZingPlanId
  name: string
  tagline: string
  monthlyUsd: number
  annualMonthlyUsd: number
  annualTotalUsd: number
  highlightNote: string
  badge?: string
  highlighted?: boolean
  features: Array<{label: string; included: boolean}>
}

const PLAN_TIERS: PlanTier[] = [
  {
    id: 'zing-basic',
    name: 'Zing Basic',
    tagline: 'Essential creator tools and longer edits on QuantZing.',
    monthlyUsd: 3,
    annualMonthlyUsd: 2.5,
    annualTotalUsd: 30,
    highlightNote: 'Edit Zings, longer posts & standard Quanty access',
    features: [
      {label: 'Edit Zing (30 min window)', included: true},
      {label: 'Long Zings (up to 4,000 chars)', included: true},
      {label: 'Priority Quanty access', included: true},
      {label: 'Verified Checkmark', included: false},
      {label: '4K Video Uploads & Articles Studio', included: false},
      {label: 'Ad Revenue Sharing (70/30)', included: false},
      {label: 'Zero Feed Ads', included: false},
    ],
  },
  {
    id: 'zing-pro',
    name: 'Zing Pro',
    tagline: 'Verified badge, creator revenue share & 4K video.',
    monthlyUsd: 8,
    annualMonthlyUsd: 6.67,
    annualTotalUsd: 80,
    highlightNote: 'Verified checkmark, 4K video & 70/30 creator revenue share',
    badge: 'MOST POPULAR',
    highlighted: true,
    features: [
      {label: 'Verified Checkmark', included: true},
      {label: 'Long Zings (up to 10,000 chars)', included: true},
      {label: 'Edit Zing (30 min window)', included: true},
      {label: 'Priority Quanty access', included: true},
      {label: '4K Video Uploads & Articles Studio', included: true},
      {label: 'Ad Revenue Sharing (70/30)', included: true},
      {label: 'Zero Feed Ads', included: false},
    ],
  },
  {
    id: 'zing-pro-plus',
    name: 'Zing Pro+',
    tagline: 'Zero feed ads, maximum Quanty priority & full creator suite.',
    monthlyUsd: 16,
    annualMonthlyUsd: 13.33,
    annualTotalUsd: 160,
    highlightNote: 'Zero feed ads + highest priority across all QuantZing tools',
    badge: 'MAX SIGNAL',
    features: [
      {label: 'Verified Checkmark', included: true},
      {label: 'Long Zings (up to 10,000 chars)', included: true},
      {label: 'Edit Zing (30 min window)', included: true},
      {label: 'Priority Quanty access', included: true},
      {label: '4K Video Uploads & Articles Studio', included: true},
      {label: 'Ad Revenue Sharing (70/30)', included: true},
      {label: 'Zero Feed Ads', included: true},
    ],
  },
]

export function QuantZingProScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const {currentAccount} = useSession()

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    'annual',
  )
  const [loadingPlan, setLoadingPlan] = useState<QuantZingPlanId | null>(null)
  const [checkoutResult, setCheckoutResult] =
    useState<QuantZingCheckoutResult | null>(null)

  const handleCheckout = useCallback(
    async (planId: QuantZingPlanId) => {
      if (loadingPlan) return
      setLoadingPlan(planId)
      setCheckoutResult(null)
      try {
        const res = await createQuantZingProCheckout({
          planId,
          emailOrHandle:
            currentAccount?.email ||
            currentAccount?.handle ||
            currentAccount?.did ||
            undefined,
          billingCycle,
        })
        setCheckoutResult(res)
        if (res.ok && res.checkoutUrl) {
          Toast.show('Checkout session ready', {type: 'success'})
          void Linking.openURL(res.checkoutUrl)
        } else if (res.ok) {
          Toast.show(res.message, {type: 'success'})
        } else {
          Toast.show(res.message, {type: 'info'})
        }
      } finally {
        setLoadingPlan(null)
      }
    },
    [billingCycle, currentAccount, loadingPlan],
  )

  return (
    <Layout.Screen
      testID="quantZingProScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <VerifiedCheck size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              QuantZing Pro
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Verified badge, priority Quanty, 4K video & 70/30 creator revenue share
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_lg, {paddingBottom: 96}]}>
        {/* Hero Header */}
        <View style={[a.align_center, a.gap_sm, a.pt_sm]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.px_md,
              a.py_2xs,
              a.rounded_full,
              {backgroundColor: colors.accentSubtle},
            ]}>
            <SparkleIcon size="xs" fill={colors.accent} />
            <Text style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
              QUANTZING PRO
            </Text>
          </View>

          <Text
            style={[
              a.text_2xl,
              a.font_bold,
              a.text_center,
              {color: colors.text},
            ]}>
            Upgrade to QuantZing Pro
          </Text>
          <Text
            style={[
              a.text_sm,
              a.text_center,
              {color: colors.muted, maxWidth: 440},
            ]}>
            Verified badge, priority Quanty, 4K video & 70/30 creator revenue
            share. Cancel or switch plans anytime.
          </Text>

          {/* Monthly / Annual Billing Toggle */}
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.p_2xs,
              a.rounded_full,
              a.mt_xs,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            {(
              [
                {id: 'annual', label: 'Annual (Save 16%)'},
                {id: 'monthly', label: 'Monthly'},
              ] as const
            ).map(option => {
              const active = billingCycle === option.id
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => setBillingCycle(option.id)}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: active ? colors.ctaBg : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {color: active ? colors.ctaText : colors.muted},
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Checkout Feedback Banner */}
        {checkoutResult && (
          <View
            style={[
              a.p_md,
              a.rounded_lg,
              a.gap_xs,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: checkoutResult.ok
                  ? colors.rezing
                  : colors.accent,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldIcon
                size="sm"
                fill={checkoutResult.ok ? colors.rezing : colors.accent}
              />
              <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                {checkoutResult.ok
                  ? 'Checkout Ready'
                  : 'Subscription Update'}
              </Text>
            </View>
            <Text style={[a.text_xs, a.leading_snug, {color: colors.muted}]}>
              {checkoutResult.message}
            </Text>
          </View>
        )}

        {/* 3-Tier Cards */}
        <View style={[a.gap_md]}>
          {PLAN_TIERS.map(tier => {
            const isLoading = loadingPlan === tier.id
            const displayPrice =
              billingCycle === 'annual'
                ? tier.annualMonthlyUsd
                : tier.monthlyUsd
            return (
              <View
                key={tier.id}
                style={[
                  a.p_lg,
                  a.rounded_lg,
                  a.gap_md,
                  {
                    backgroundColor: colors.card,
                    borderWidth: tier.highlighted ? 2 : 1,
                    borderColor: tier.highlighted
                      ? colors.accent
                      : colors.border,
                  },
                ]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_start,
                    a.justify_between,
                    a.gap_sm,
                  ]}>
                  <View style={[a.flex_1, a.gap_2xs]}>
                    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                      <Text
                        style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                        {tier.name}
                      </Text>
                      {tier.badge && (
                        <View
                          style={[
                            a.px_sm,
                            {
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: colors.accentSubtle,
                            },
                          ]}>
                          <Text
                            style={[
                              {
                                fontSize: 10,
                                fontWeight: '700',
                                color: colors.accent,
                              },
                            ]}>
                            {tier.badge}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      {tier.tagline}
                    </Text>
                  </View>

                  <View style={[a.align_end]}>
                    <Text
                      style={[a.text_2xl, a.font_bold, {color: colors.text}]}>
                      ${displayPrice.toFixed(displayPrice % 1 === 0 ? 0 : 2)}
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      {billingCycle === 'annual'
                        ? `/ mo · $${tier.annualTotalUsd}/yr`
                        : '/ month'}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_sm,
                    a.py_xs,
                    a.rounded_md,
                    {backgroundColor: colors.surface},
                  ]}>
                  <ZapIcon size="xs" fill={colors.accent} />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: colors.text},
                    ]}>
                    {tier.highlightNote}
                  </Text>
                </View>

                <View style={[a.gap_xs]}>
                  {tier.features.map(feat => (
                    <View
                      key={feat.label}
                      style={[a.flex_row, a.align_center, a.gap_sm]}>
                      <CheckIcon
                        size="xs"
                        fill={feat.included ? colors.rezing : colors.border}
                      />
                      <Text
                        style={[
                          a.text_sm,
                          {
                            color: feat.included ? colors.text : colors.muted,
                            textDecorationLine: feat.included
                              ? 'none'
                              : 'line-through',
                          },
                        ]}>
                        {feat.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Subscribe to ${tier.name}`}
                  disabled={Boolean(loadingPlan)}
                  onPress={() => void handleCheckout(tier.id)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_center,
                    a.gap_xs,
                    a.py_sm,
                    a.rounded_full,
                    {
                      backgroundColor: tier.highlighted
                        ? colors.ctaBg
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: tier.highlighted
                        ? colors.ctaBg
                        : colors.border,
                      opacity: loadingPlan && !isLoading ? 0.55 : 1,
                    },
                  ]}>
                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={tier.highlighted ? colors.ctaText : colors.text}
                    />
                  ) : (
                    <Text
                      style={[
                        a.text_sm,
                        a.font_bold,
                        {
                          color: tier.highlighted
                            ? colors.ctaText
                            : colors.text,
                        },
                      ]}>
                      Subscribe to {tier.name}
                    </Text>
                  )}
                </Pressable>
              </View>
            )
          })}
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
