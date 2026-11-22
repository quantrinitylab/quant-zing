import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, Linking, Pressable, View} from 'react-native'

import {
  cancelProSubscription,
  confirmProCheckout,
  createProCheckout,
  fetchProPlans,
  fetchProSubscription,
  getQuantZingColors,
  type ProCheckoutResponse,
  type ProPlan,
  type ProSubscription,
} from '#/lib/quantos/client'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {VerifiedCheck} from '#/components/icons/VerifiedCheck'
import {Zap_Stroke2_Corner0_Rounded as ZapIcon} from '#/components/icons/Zap'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const DEFAULT_PLANS: ProPlan[] = [
  {
    id: 'free',
    name: 'QuantZing Free',
    priceInr: 0,
    priceUsd: 0,
    billingCycle: 'forever',
    badge: 'STANDARD',
    features: [
      'Real-time Zings, Rezings, Polls & Feeds',
      'Direct Messages & Bookmarks',
      'Articles Reader & ZingSpaces Listener',
      'Standard Quanty AI Queries',
    ],
  },
  {
    id: 'pro_monthly',
    name: 'QuantZing Pro Monthly',
    priceInr: 649,
    priceUsd: 8,
    billingCycle: 'monthly',
    badge: 'VERIFIED PRO',
    features: [
      'Verified Checkmark Badge on Profile & Zings',
      'Long Zings & Full Articles Studio Publishing',
      'Priority Quanty AI & DeepSearch Access',
      '70/30 Creator Ad Revenue Share Eligibility',
      'Host Live & Scheduled ZingSpaces Stages',
    ],
  },
  {
    id: 'pro_annual',
    name: 'QuantZing Pro Annual',
    priceInr: 6490,
    priceUsd: 80,
    billingCycle: 'annual',
    badge: 'MOST POPULAR · SAVE 16%',
    features: [
      'Verified Checkmark Badge on Profile & Zings',
      'Long Zings & Full Articles Studio Publishing',
      'Priority Quanty AI & DeepSearch Access',
      '70/30 Creator Ad Revenue Share Eligibility',
      'Host Live & Scheduled ZingSpaces Stages',
      '2 Months Free vs Monthly Billing',
    ],
  },
  {
    id: 'creator_studio',
    name: 'Creator Studio Max',
    priceInr: 1299,
    priceUsd: 16,
    billingCycle: 'monthly',
    badge: 'MAX SIGNAL',
    features: [
      'Verified Checkmark Badge + Creator Priority',
      'Zero Feed Ads & Maximum Quanty Throughput',
      'Full 30-Day & 90-Day Creator Studio Analytics',
      '70/30 Creator Ad Revenue Share & Fast Payouts',
      'Unlimited Articles Studio & ZingSpaces Hosting',
    ],
  },
]

function formatDateShort(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function QuantZingProScreen() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {hasSession, currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const accessJwt = currentAccount?.accessJwt

  const [plans, setPlans] = useState<ProPlan[]>(DEFAULT_PLANS)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [subscription, setSubscription] = useState<ProSubscription | null>(
    null,
  )
  const [loadingSubscription, setLoadingSubscription] = useState(false)
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'INR'>('USD')
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [checkoutResult, setCheckoutResult] =
    useState<ProCheckoutResponse | null>(null)

  const handledReturnParamsRef = useRef(false)

  const loadPlansAndSubscription = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const fetchedPlans = await fetchProPlans()
      if (fetchedPlans.length > 0) {
        setPlans(fetchedPlans)
      }
    } catch {
      // Keep fallback plans catalog if offline
    } finally {
      setLoadingPlans(false)
    }

    if (hasSession && accessJwt) {
      setLoadingSubscription(true)
      try {
        const sub = await fetchProSubscription(accessJwt)
        setSubscription(sub)
      } catch {
        // Ignore if unauthenticated
      } finally {
        setLoadingSubscription(false)
      }
    } else {
      setSubscription(null)
    }
  }, [accessJwt, hasSession])

  useEffect(() => {
    void loadPlansAndSubscription()
  }, [loadPlansAndSubscription])

  // Auto-handle ?checkout=complete&plan=...&orderId=... return URL on mount
  useEffect(() => {
    if (handledReturnParamsRef.current) return
    if (!IS_WEB || typeof window === 'undefined') return
    if (!hasSession || !accessJwt) return

    try {
      const params = new URLSearchParams(window.location.search)
      const checkoutFlag = params.get('checkout')
      const planParam = params.get('plan') || undefined
      const orderIdParam = params.get('orderId') || undefined

      if (checkoutFlag === 'complete' || orderIdParam) {
        handledReturnParamsRef.current = true
        setIsConfirming(true)
        confirmProCheckout(
          {
            orderId: orderIdParam || subscription?.orderId || `ord_${Date.now()}`,
            planId: planParam,
          },
          accessJwt,
        )
          .then(confirmedSub => {
            setSubscription(confirmedSub)
            Toast.show('QuantZing Pro subscription activated', {
              type: 'success',
            })
            if (window.history?.replaceState) {
              window.history.replaceState({}, '', window.location.pathname)
            }
          })
          .catch((err: any) => {
            Toast.show(
              err?.message || 'Unable to confirm Pro checkout return',
              {type: 'warning'},
            )
          })
          .finally(() => {
            setIsConfirming(false)
          })
      }
    } catch {
      // Ignore URL parse error
    }
  }, [accessJwt, hasSession, subscription?.orderId])

  const handleCheckout = useCallback(
    (planId: string) => {
      if (loadingPlanId || planId === 'free') return
      requireAuth(async () => {
        if (!accessJwt) return
        setLoadingPlanId(planId)
        setCheckoutResult(null)
        try {
          const returnUrl =
            IS_WEB && typeof window !== 'undefined'
              ? `${window.location.origin}/pro?checkout=complete&plan=${encodeURIComponent(planId)}`
              : undefined
          const res = await createProCheckout({planId, returnUrl}, accessJwt)
          setCheckoutResult(res)

          if (res.status === 'active') {
            const sub = await fetchProSubscription(accessJwt)
            setSubscription(sub)
            Toast.show(res.message || 'QuantZing Pro activated', {
              type: 'success',
            })
          } else if (res.checkoutUrl) {
            Toast.show('Redirecting to checkout session...', {type: 'info'})
            void Linking.openURL(res.checkoutUrl)
          } else {
            Toast.show(res.message || 'Order created — confirm to activate', {
              type: 'info',
            })
          }
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to start Pro checkout', {
            type: 'warning',
          })
        } finally {
          setLoadingPlanId(null)
        }
      })
    },
    [accessJwt, loadingPlanId, requireAuth],
  )

  const handleConfirmOrder = useCallback(
    (orderId: string, planId?: string) => {
      requireAuth(async () => {
        if (!accessJwt || isConfirming) return
        setIsConfirming(true)
        try {
          const confirmed = await confirmProCheckout(
            {orderId, planId},
            accessJwt,
          )
          setSubscription(confirmed)
          setCheckoutResult(null)
          Toast.show('QuantZing Pro subscription confirmed & active', {
            type: 'success',
          })
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to confirm order', {
            type: 'warning',
          })
        } finally {
          setIsConfirming(false)
        }
      })
    },
    [accessJwt, isConfirming, requireAuth],
  )

  const handleCancelSubscription = useCallback(() => {
    requireAuth(async () => {
      if (!accessJwt || isCancelling) return
      setIsCancelling(true)
      try {
        const updated = await cancelProSubscription(accessJwt)
        setSubscription(updated)
        Toast.show('QuantZing Pro subscription cancelled', {type: 'info'})
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to cancel subscription', {
          type: 'warning',
        })
      } finally {
        setIsCancelling(false)
      }
    })
  }, [accessJwt, isCancelling, requireAuth])

  const activePlanId =
    subscription?.status === 'active' ? subscription.planId : 'free'

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
            Verified badge, priority Quanty, Articles Studio & 70/30 creator
            revenue share
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
              {color: colors.muted, maxWidth: 460},
            ]}>
            Unlock your Verified Checkmark on Sovereign PDS, priority Quanty AI
            throughput, and 70/30 creator revenue share. Cancel or switch plans
            anytime.
          </Text>

          {/* Currency Display Toggle (USD / INR) */}
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
                {id: 'USD', label: 'USD ($)'},
                {id: 'INR', label: 'INR (₹)'},
              ] as const
            ).map(option => {
              const active = currencyMode === option.id
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => setCurrencyMode(option.id)}
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

        {/* Active / Current Subscription Status Card */}
        {hasSession && (
          <View
            testID="proCurrentSubscriptionCard"
            style={[
              a.p_md,
              a.rounded_lg,
              a.gap_sm,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor:
                  subscription?.status === 'active' &&
                  subscription.planId !== 'free'
                    ? colors.rezing
                    : colors.border,
              },
            ]}>
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_xs,
              ]}>
              <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                <VerifiedCheck
                  size="sm"
                  fill={
                    subscription?.verifiedBadge ? colors.accent : colors.muted
                  }
                />
                <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                  Account Entitlements (@{currentAccount?.handle})
                </Text>
              </View>

              {loadingSubscription || isConfirming ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <View
                  style={[
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor:
                        subscription?.status === 'active' &&
                        subscription.planId !== 'free'
                          ? colors.rezingSubtle
                          : colors.surface,
                    },
                  ]}>
                  <Text
                    style={[
                      {
                        fontSize: 11,
                        fontWeight: '700',
                        color:
                          subscription?.status === 'active' &&
                          subscription.planId !== 'free'
                            ? colors.rezing
                            : colors.muted,
                      },
                    ]}>
                    {(subscription?.status || 'free').toUpperCase()} ·{' '}
                    {(subscription?.planId || 'free').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[a.text_xs, {color: colors.muted}]}>
              {subscription?.verifiedBadge
                ? 'Verified Checkmark is active on your Sovereign PDS profile.'
                : 'Currently on QuantZing Free tier. Select a Pro plan below to activate your Verified Checkmark and creator tools.'}
              {subscription?.expiresAt
                ? ` · Renews/Expires ${formatDateShort(subscription.expiresAt)}`
                : ''}
            </Text>

            {subscription?.status === 'active' &&
              subscription.planId !== 'free' && (
                <View style={[a.flex_row, a.align_center, a.gap_sm, a.pt_2xs]}>
                  <Pressable
                    testID="cancelProSubscriptionBtn"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel Pro Subscription"
                    disabled={isCancelling}
                    onPress={handleCancelSubscription}
                    style={[
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.danger,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.dangerText},
                      ]}>
                      {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                    </Text>
                  </Pressable>
                </View>
              )}
          </View>
        )}

        {/* Checkout Feedback / Pending Confirmation Banner */}
        {checkoutResult && (
          <View
            testID="proCheckoutResultBanner"
            style={[
              a.p_md,
              a.rounded_lg,
              a.gap_sm,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor:
                  checkoutResult.status === 'active'
                    ? colors.rezing
                    : colors.accent,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldIcon
                size="sm"
                fill={
                  checkoutResult.status === 'active'
                    ? colors.rezing
                    : colors.accent
                }
              />
              <Text style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                {checkoutResult.status === 'active'
                  ? 'Subscription Activated'
                  : 'Order Pending Confirmation'}
              </Text>
            </View>
            <Text style={[a.text_xs, a.leading_snug, {color: colors.muted}]}>
              {checkoutResult.message}
              {checkoutResult.orderId
                ? ` (Order ID: ${checkoutResult.orderId})`
                : ''}
            </Text>

            {checkoutResult.status === 'pending' && checkoutResult.orderId && (
              <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
                <Pressable
                  testID="confirmProOrderBtn"
                  accessibilityRole="button"
                  disabled={isConfirming}
                  onPress={() =>
                    handleConfirmOrder(
                      checkoutResult.orderId!,
                      checkoutResult.planId,
                    )
                  }
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    {isConfirming
                      ? 'Confirming...'
                      : 'Confirm & Activate Subscription'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Plan Catalog Cards */}
        {loadingPlans && plans.length === 0 ? (
          <View style={[a.p_xl, a.align_center, a.gap_xs]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[a.text_xs, {color: colors.muted}]}>
              Loading QuantZing Pro plans...
            </Text>
          </View>
        ) : (
          <View style={[a.gap_md]}>
            {plans.map(plan => {
              const isCurrent = activePlanId === plan.id
              const isLoading = loadingPlanId === plan.id
              const isHighlighted =
                plan.id === 'pro_annual' || plan.id === 'pro_monthly'
              const priceLabel =
                plan.priceUsd === 0 && plan.priceInr === 0
                  ? 'Free'
                  : currencyMode === 'INR'
                    ? `₹${plan.priceInr}`
                    : `$${plan.priceUsd}`

              return (
                <View
                  key={plan.id}
                  testID={`proPlanCard-${plan.id}`}
                  style={[
                    a.p_lg,
                    a.rounded_lg,
                    a.gap_md,
                    {
                      backgroundColor: colors.card,
                      borderWidth: isCurrent || isHighlighted ? 2 : 1,
                      borderColor: isCurrent
                        ? colors.rezing
                        : isHighlighted
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
                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.gap_xs,
                        ]}>
                        <Text
                          style={[
                            a.text_xl,
                            a.font_bold,
                            {color: colors.text},
                          ]}>
                          {plan.name}
                        </Text>
                        {plan.badge && (
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
                              {plan.badge}
                            </Text>
                          </View>
                        )}
                        {isCurrent && (
                          <View
                            style={[
                              a.px_sm,
                              {
                                paddingVertical: 2,
                                borderRadius: 999,
                                backgroundColor: colors.rezingSubtle,
                              },
                            ]}>
                            <Text
                              style={[
                                {
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color: colors.rezing,
                                },
                              ]}>
                              CURRENT PLAN
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        Billing cycle: {plan.billingCycle}
                      </Text>
                    </View>

                    <View style={[a.align_end]}>
                      <Text
                        style={[a.text_2xl, a.font_bold, {color: colors.text}]}>
                        {priceLabel}
                      </Text>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        {plan.billingCycle === 'annual'
                          ? '/ year'
                          : plan.billingCycle === 'monthly'
                            ? '/ month'
                            : 'always'}
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
                      {plan.id === 'free'
                        ? 'Included with every sovereign @handle.quantzing.com account'
                        : 'Includes Verified Checkmark + Creator Studio Revenue Share'}
                    </Text>
                  </View>

                  <View style={[a.gap_xs]}>
                    {plan.features.map(featureLabel => (
                      <View
                        key={featureLabel}
                        style={[a.flex_row, a.align_center, a.gap_sm]}>
                        <CheckIcon size="xs" fill={colors.rezing} />
                        <Text style={[a.text_sm, {color: colors.text}]}>
                          {featureLabel}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {plan.id !== 'free' && (
                    <Pressable
                      testID={`subscribeProBtn-${plan.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isCurrent
                          ? `Current plan ${plan.name}`
                          : `Subscribe to ${plan.name}`
                      }
                      disabled={Boolean(loadingPlanId) || isCurrent}
                      onPress={() => handleCheckout(plan.id)}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.justify_center,
                        a.gap_xs,
                        a.py_sm,
                        a.rounded_full,
                        {
                          backgroundColor: isCurrent
                            ? colors.surface
                            : isHighlighted
                              ? colors.ctaBg
                              : colors.surface,
                          borderWidth: 1,
                          borderColor: isCurrent
                            ? colors.rezing
                            : isHighlighted
                              ? colors.ctaBg
                              : colors.border,
                          opacity:
                            loadingPlanId && !isLoading ? 0.55 : 1,
                        },
                      ]}>
                      {isLoading ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            isHighlighted ? colors.ctaText : colors.text
                          }
                        />
                      ) : (
                        <Text
                          style={[
                            a.text_sm,
                            a.font_bold,
                            {
                              color: isCurrent
                                ? colors.rezing
                                : isHighlighted
                                  ? colors.ctaText
                                  : colors.text,
                            },
                          ]}>
                          {isCurrent
                            ? `Active Plan (${plan.name})`
                            : `Subscribe to ${plan.name}`}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
