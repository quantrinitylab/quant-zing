import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {AtUri} from '@atproto/syntax'
import {CommonActions, useNavigation} from '@react-navigation/native'

import {
  type CreatorAnalyticsResponse,
  type CreatorAnalyticsTopPost,
  type CreatorMonetizationStatus,
  enrollCreatorMonetization,
  fetchCreatorAnalytics,
  fetchCreatorMonetization,
  getQuantZingColors,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Bookmark_Stroke2_Corner0_Rounded as BookmarkIcon} from '#/components/icons/Bookmark'
import {Bubble_Stroke2_Corner2_Rounded as ReplyIcon} from '#/components/icons/Bubble'
import {CircleCheck_Stroke2_Corner0_Rounded as CheckCircleIcon} from '#/components/icons/CircleCheck'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {Heart2_Filled_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import {Repost_Stroke2_Corner2_Rounded as RezingIcon} from '#/components/icons/Repost'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

const WINDOW_OPTIONS = [
  {days: 7, label: '7 Days'},
  {days: 30, label: '30 Days'},
  {days: 90, label: '90 Days'},
] as const

function formatCompact(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toLocaleString()
}

function formatShortDate(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return isoDate
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
  } catch {
    return isoDate
  }
}

function getMonetizationStatusLabel(
  status?: CreatorMonetizationStatus['status'],
): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'eligible':
      return 'Eligible to Enroll'
    case 'pending_eligibility':
      return 'Pending Eligibility'
    default:
      return 'Not Enrolled'
  }
}

export function CreatorStudioScreen() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const navigation = useNavigation<NavigationProp>()
  const {hasSession, currentAccount} = useSession()
  const requireAuth = useRequireAuth()

  const accessJwt = currentAccount?.accessJwt

  const [windowDays, setWindowDays] = useState<number>(30)
  const [chartMetric, setChartMetric] = useState<'impressions' | 'engagements'>(
    'impressions',
  )
  const [analytics, setAnalytics] = useState<CreatorAnalyticsResponse | null>(
    null,
  )
  const [monetization, setMonetization] =
    useState<CreatorMonetizationStatus | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadStudioData = useCallback(
    async (silent = false) => {
      if (!hasSession || !accessJwt) {
        setAnalytics(null)
        setMonetization(null)
        setErrorMessage(null)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      if (silent) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setErrorMessage(null)

      try {
        const [analyticsRes, monetizationRes] = await Promise.all([
          fetchCreatorAnalytics(windowDays, accessJwt),
          fetchCreatorMonetization(accessJwt),
        ])
        setAnalytics(analyticsRes)
        setMonetization(monetizationRes)
      } catch (err: any) {
        setErrorMessage(
          err?.message || 'Unable to load creator analytics right now.',
        )
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [accessJwt, hasSession, windowDays],
  )

  useEffect(() => {
    void loadStudioData(false)
  }, [loadStudioData])

  const handleOpenPost = useCallback(
    (post: CreatorAnalyticsTopPost) => {
      try {
        const uri = new AtUri(post.uri)
        navigation.navigate('PostThread', {
          name: currentAccount?.handle || uri.host,
          rkey: uri.rkey,
        })
      } catch {
        // Ignore malformed URI
      }
    },
    [currentAccount?.handle, navigation],
  )

  const handleOpenPro = useCallback(() => {
    try {
      navigation.dispatch(CommonActions.navigate({name: 'QuantZingPro'}))
    } catch {
      // Ignore if route unavailable
    }
  }, [navigation])

  const handleEnroll = useCallback(() => {
    requireAuth(async () => {
      if (!accessJwt || isEnrolling) return
      setIsEnrolling(true)
      try {
        const res = await enrollCreatorMonetization(accessJwt, 'quantpay_wallet')
        if (res?.monetization) {
          setMonetization(res.monetization)
        } else {
          const refreshed = await fetchCreatorMonetization(accessJwt)
          setMonetization(refreshed)
        }
        Toast.show('Creator monetization status updated', {type: 'success'})
      } catch (err: any) {
        Toast.show(
          err?.message || 'Could not complete creator enrollment right now',
          {type: 'error'},
        )
      } finally {
        setIsEnrolling(false)
      }
    })
  }, [accessJwt, isEnrolling, requireAuth])

  const totals = analytics?.totals
  const dailySeries = useMemo(() => {
    const raw = analytics?.daily ?? []
    // Render up to the most recent 30 bars so daily trends stay readable
    return raw.slice(-30)
  }, [analytics?.daily])

  const maxDailyValue = useMemo(() => {
    if (dailySeries.length === 0) return 0
    return Math.max(
      0,
      ...dailySeries.map(d =>
        chartMetric === 'impressions' ? d.impressions : d.engagements,
      ),
    )
  }, [chartMetric, dailySeries])

  const totalEngagements = useMemo(() => {
    if (!totals) return 0
    return (
      totals.likes +
      totals.rezings +
      totals.replies +
      totals.quotes +
      totals.bookmarks
    )
  }, [totals])

  const elig = monetization?.eligibility
  const followersPct = elig
    ? Math.min(
        100,
        Math.round(
          (elig.followersCount / Math.max(1, elig.followersRequired)) * 100,
        ),
      )
    : 0
  const postsPct = elig
    ? Math.min(
        100,
        Math.round((elig.postsCount / Math.max(1, elig.postsRequired)) * 100),
      )
    : 0
  const impressions30dPct = elig
    ? Math.min(
        100,
        Math.round(
          (elig.impressions30d / Math.max(1, elig.impressionsRequired)) * 100,
        ),
      )
    : 0

  const meetsAllThresholds = Boolean(
    elig &&
      elig.isPro &&
      elig.followersCount >= elig.followersRequired &&
      elig.postsCount >= elig.postsRequired &&
      elig.impressions30d >= elig.impressionsRequired,
  )

  return (
    <Layout.Screen
      testID="creatorStudioScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <GrowthIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Creator Studio
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Real impressions, audience analytics & creator revenue share
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        {hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh creator analytics"
            onPress={() => void loadStudioData(true)}
            style={[
              a.px_sm,
              a.py_xs,
              a.rounded_full,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <Text
              style={[a.text_xs, a.font_semi_bold, {color: colors.accentText}]}>
              {isRefreshing ? 'Syncing...' : 'Refresh'}
            </Text>
          </Pressable>
        ) : (
          <Layout.Header.Slot />
        )}
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {!hasSession || !accessJwt ? (
          <View
            style={[
              a.p_xl,
              a.rounded_lg,
              a.align_center,
              a.gap_md,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <GrowthIcon size="xl" fill={colors.accent} />
            <Text
              style={[
                a.text_xl,
                a.font_bold,
                a.text_center,
                {color: colors.text},
              ]}>
              Sign in to view your Creator Studio
            </Text>
            <Text
              style={[
                a.text_sm,
                a.text_center,
                {color: colors.muted, maxWidth: 380, lineHeight: 20},
              ]}>
              Inspect real persisted Zing impressions, daily performance charts,
              top Zings, and your QuantPay creator monetization eligibility.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in to Creator Studio"
              onPress={() => requireAuth(() => {})}
              style={[
                a.px_xl,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text style={[a.text_sm, a.font_bold, {color: colors.ctaText}]}>
                Sign In
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Account & Time Window Controls */}
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                {WINDOW_OPTIONS.map(opt => {
                  const active = windowDays === opt.days
                  return (
                    <Pressable
                      key={opt.days}
                      accessibilityRole="button"
                      onPress={() => setWindowDays(opt.days)}
                      style={[
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: active ? colors.ctaBg : colors.card,
                          borderWidth: 1,
                          borderColor: active ? colors.ctaBg : colors.border,
                        },
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: active ? colors.ctaText : colors.text},
                        ]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                @{currentAccount?.handle} · Verified server analytics
              </Text>
            </View>

            {errorMessage && (
              <View
                style={[
                  a.p_md,
                  a.rounded_lg,
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.danger,
                  },
                ]}>
                <Text style={[a.text_sm, a.flex_1, {color: colors.dangerText}]}>
                  {errorMessage}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadStudioData(false)}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            )}

            {isLoading ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_sm,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[a.text_sm, {color: colors.muted}]}>
                  Loading verified analytics from QuantZing...
                </Text>
              </View>
            ) : (
              <>
                {/* 4 Real KPI Metric Cards */}
                <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
                  {[
                    {
                      label: 'Impressions',
                      value: formatCompact(totals?.impressions ?? 0),
                      sub: `${totals?.postsCount ?? 0} Zings in ${windowDays}d`,
                      icon: <EyeIcon size="sm" fill={colors.accent} />,
                    },
                    {
                      label: 'Engagement Rate',
                      value: `${Number(totals?.engagementRate ?? 0).toFixed(2)}%`,
                      sub: `${formatCompact(totalEngagements)} total engagements`,
                      icon: <GrowthIcon size="sm" fill={colors.rezing} />,
                    },
                    {
                      label: 'Likes & Rezings',
                      value: formatCompact(totals?.likes ?? 0),
                      sub: `${formatCompact(totals?.rezings ?? 0)} rezings · ${formatCompact(totals?.replies ?? 0)} replies`,
                      icon: <HeartIcon size="sm" fill={colors.like} />,
                    },
                    {
                      label: 'Followers',
                      value: formatCompact(totals?.followersCount ?? 0),
                      sub: `${formatCompact(totals?.followingCount ?? 0)} following · ${formatCompact(totals?.bookmarks ?? 0)} bookmarks`,
                      icon: <BookmarkIcon size="sm" fill={colors.accent} />,
                    },
                  ].map(metric => (
                    <View
                      key={metric.label}
                      style={[
                        a.p_md,
                        a.rounded_lg,
                        a.gap_xs,
                        {
                          flexGrow: 1,
                          flexBasis: '46%',
                          minWidth: 150,
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                          a.gap_xs,
                        ]}>
                        <Text style={[a.text_xs, {color: colors.muted}]}>
                          {metric.label}
                        </Text>
                        {metric.icon}
                      </View>
                      <Text
                        style={[a.text_2xl, a.font_bold, {color: colors.text}]}>
                        {metric.value}
                      </Text>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        {metric.sub}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Real User-Scoped Daily Bar Chart */}
                <View
                  style={[
                    a.p_md,
                    a.rounded_lg,
                    a.gap_md,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View
                    style={[
                      a.flex_row,
                      a.flex_wrap,
                      a.align_center,
                      a.justify_between,
                      a.gap_sm,
                    ]}>
                    <View>
                      <Text
                        style={[a.text_md, a.font_bold, {color: colors.text}]}>
                        Daily Performance ({dailySeries.length}d)
                      </Text>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        Peak day: {formatCompact(maxDailyValue)}{' '}
                        {chartMetric === 'impressions'
                          ? 'views'
                          : 'engagements'}
                      </Text>
                    </View>
                    <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                      {(
                        [
                          {id: 'impressions', label: 'Impressions'},
                          {id: 'engagements', label: 'Engagements'},
                        ] as const
                      ).map(opt => {
                        const active = chartMetric === opt.id
                        return (
                          <Pressable
                            key={opt.id}
                            accessibilityRole="button"
                            onPress={() => setChartMetric(opt.id)}
                            style={[
                              a.px_sm,
                              a.py_2xs,
                              a.rounded_full,
                              {
                                backgroundColor: active
                                  ? colors.accentSubtle
                                  : colors.surface,
                                borderWidth: 1,
                                borderColor: active
                                  ? colors.accent
                                  : colors.border,
                              },
                            ]}>
                            <Text
                              style={[
                                {fontSize: 11, fontWeight: '700'},
                                {
                                  color: active
                                    ? colors.accentText
                                    : colors.text,
                                },
                              ]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>

                  {dailySeries.length === 0 ? (
                    <View style={[a.py_lg, a.align_center]}>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        No daily activity recorded in this window yet.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View
                        style={[
                          a.flex_row,
                          a.align_end,
                          {
                            height: 116,
                            gap: dailySeries.length > 14 ? 3 : 6,
                            paddingTop: 10,
                          },
                        ]}>
                        {dailySeries.map(day => {
                          const val =
                            chartMetric === 'impressions'
                              ? day.impressions
                              : day.engagements
                          const barHeight =
                            maxDailyValue > 0 && val > 0
                              ? Math.max(
                                  10,
                                  Math.round((val / maxDailyValue) * 92),
                                )
                              : 4
                          const isPeak = val > 0 && val === maxDailyValue
                          return (
                            <View
                              key={day.date}
                              accessibilityLabel={`${day.date}: ${val} ${chartMetric}`}
                              style={[
                                a.flex_1,
                                a.align_center,
                                a.justify_end,
                                {height: '100%'},
                              ]}>
                              <View
                                style={{
                                  width: '100%',
                                  height: barHeight,
                                  borderRadius: 4,
                                  backgroundColor:
                                    val === 0
                                      ? colors.surface
                                      : isPeak
                                        ? colors.accent
                                        : colors.accentSubtle,
                                  borderWidth: 1,
                                  borderColor:
                                    val === 0 ? colors.border : colors.accent,
                                }}
                              />
                            </View>
                          )
                        })}
                      </View>
                      <View style={[a.flex_row, a.justify_between]}>
                        <Text style={[{fontSize: 11, color: colors.muted}]}>
                          {formatShortDate(dailySeries[0].date)}
                        </Text>
                        <Text style={[{fontSize: 11, color: colors.muted}]}>
                          {formatShortDate(
                            dailySeries[Math.floor(dailySeries.length / 2)]
                              .date,
                          )}
                        </Text>
                        <Text style={[{fontSize: 11, color: colors.muted}]}>
                          {formatShortDate(
                            dailySeries[dailySeries.length - 1].date,
                          )}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Honest Creator Monetization Eligibility & QuantPay Wallet Card */}
                {monetization && elig && (
                  <View
                    style={[
                      a.p_md,
                      a.rounded_lg,
                      a.gap_md,
                      {
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_sm,
                      ]}>
                      <View
                        style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
                        <ShieldIcon size="md" fill={colors.rezing} />
                        <View style={[a.flex_1]}>
                          <Text
                            style={[
                              a.text_md,
                              a.font_bold,
                              {color: colors.text},
                            ]}>
                            70/30 Creator Revenue Share
                          </Text>
                          <Text style={[a.text_xs, {color: colors.muted}]}>
                            Real eligibility tracked strictly from your own
                            account activity
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          a.px_sm,
                          a.py_2xs,
                          a.rounded_full,
                          {
                            backgroundColor:
                              monetization.status === 'active' ||
                              monetization.status === 'eligible'
                                ? colors.rezingSubtle
                                : colors.surface,
                            borderWidth: 1,
                            borderColor:
                              monetization.status === 'active' ||
                              monetization.status === 'eligible'
                                ? colors.rezing
                                : colors.border,
                          },
                        ]}>
                        <Text
                          style={[
                            {fontSize: 11, fontWeight: '700'},
                            {
                              color:
                                monetization.status === 'active' ||
                                monetization.status === 'eligible'
                                  ? colors.rezingText
                                  : colors.muted,
                            },
                          ]}>
                          {getMonetizationStatusLabel(monetization.status)}
                        </Text>
                      </View>
                    </View>

                    {/* QuantPay Wallet Balance Box */}
                    <View
                      style={[
                        a.p_sm,
                        a.rounded_md,
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_sm,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <View style={[a.gap_2xs]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_semi_bold,
                            {color: colors.muted},
                          ]}>
                          QuantPay Creator Wallet
                        </Text>
                        <Text
                          style={[
                            a.text_lg,
                            a.font_bold,
                            {color: colors.text},
                          ]}>
                          {monetization.wallet.online
                            ? `${monetization.wallet.balanceCredits.toLocaleString()} ${monetization.wallet.currency || 'Credits'}`
                            : 'Wallet Offline'}
                        </Text>
                      </View>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {
                            color: monetization.wallet.online
                              ? colors.rezingText
                              : colors.muted,
                          },
                        ]}>
                        {monetization.wallet.online
                          ? 'QuantPay Connected'
                          : 'QuantPay Service Unreachable'}
                      </Text>
                    </View>

                    {/* Real Eligibility Progress Bars */}
                    <View style={[a.gap_sm]}>
                      {[
                        {
                          label: 'Followers',
                          current: elig.followersCount,
                          required: elig.followersRequired,
                          pct: followersPct,
                          fill: colors.accent,
                        },
                        {
                          label: 'Published Zings',
                          current: elig.postsCount,
                          required: elig.postsRequired,
                          pct: postsPct,
                          fill: colors.accent,
                        },
                        {
                          label: '30-Day Real Impressions (Your Account)',
                          current: elig.impressions30d,
                          required: elig.impressionsRequired,
                          pct: impressions30dPct,
                          fill: colors.rezing,
                        },
                      ].map(row => (
                        <View key={row.label} style={[a.gap_2xs]}>
                          <View style={[a.flex_row, a.justify_between]}>
                            <Text style={[a.text_xs, {color: colors.text}]}>
                              {row.label}
                            </Text>
                            <Text
                              style={[
                                a.text_xs,
                                a.font_bold,
                                {color: colors.text},
                              ]}>
                              {formatCompact(row.current)} /{' '}
                              {formatCompact(row.required)} ({row.pct}%)
                            </Text>
                          </View>
                          <View
                            style={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: colors.border,
                              overflow: 'hidden',
                            }}>
                            <View
                              style={{
                                width: `${row.pct}%`,
                                height: '100%',
                                backgroundColor: row.fill,
                              }}
                            />
                          </View>
                        </View>
                      ))}

                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.justify_between,
                          a.gap_sm,
                          a.pt_xs,
                        ]}>
                        <View
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.gap_xs,
                            a.flex_1,
                          ]}>
                          <CheckCircleIcon
                            size="xs"
                            fill={elig.isPro ? colors.rezing : colors.muted}
                          />
                          <Text style={[a.text_xs, {color: colors.muted}]}>
                            {monetization.enrolled
                              ? `Enrolled${monetization.enrolledAt ? ` on ${formatShortDate(monetization.enrolledAt)}` : ''}${monetization.payoutMethod ? ` · ${monetization.payoutMethod}` : ''}`
                              : elig.isPro
                                ? meetsAllThresholds
                                  ? 'All eligibility requirements met — ready to enroll.'
                                  : 'QuantZing Pro active. Reach all thresholds above to enroll.'
                                : 'Active QuantZing Pro subscription required for creator payouts.'}
                          </Text>
                        </View>

                        {!elig.isPro ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={handleOpenPro}
                            style={[
                              a.px_md,
                              a.py_xs,
                              a.rounded_full,
                              {backgroundColor: colors.ctaBg},
                            ]}>
                            <Text
                              style={[
                                a.text_xs,
                                a.font_bold,
                                {color: colors.ctaText},
                              ]}>
                              Upgrade to Pro
                            </Text>
                          </Pressable>
                        ) : !monetization.enrolled ? (
                          <Pressable
                            accessibilityRole="button"
                            disabled={isEnrolling}
                            onPress={handleEnroll}
                            style={[
                              a.px_md,
                              a.py_xs,
                              a.rounded_full,
                              {
                                backgroundColor: meetsAllThresholds
                                  ? colors.ctaBg
                                  : colors.surface,
                                borderWidth: 1,
                                borderColor: meetsAllThresholds
                                  ? colors.ctaBg
                                  : colors.border,
                                opacity: isEnrolling ? 0.6 : 1,
                              },
                            ]}>
                            <Text
                              style={[
                                a.text_xs,
                                a.font_bold,
                                {
                                  color: meetsAllThresholds
                                    ? colors.ctaText
                                    : colors.text,
                                },
                              ]}>
                              {isEnrolling
                                ? 'Enrolling...'
                                : 'Enroll in Revenue Share'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                )}

                {/* Real Top Performing Zings Table */}
                <View
                  style={[
                    a.rounded_lg,
                    a.overflow_hidden,
                    {
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View
                    style={[
                      a.p_md,
                      {borderBottomWidth: 1, borderBottomColor: colors.border},
                    ]}>
                    <Text
                      style={[a.text_md, a.font_bold, {color: colors.text}]}>
                      Top Performing Zings
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Real view counts and engagement rates · tap any row to
                      open thread
                    </Text>
                  </View>

                  {!analytics?.topPosts || analytics.topPosts.length === 0 ? (
                    <View style={[a.p_lg, a.align_center]}>
                      <Text style={[a.text_sm, {color: colors.muted}]}>
                        No Zings recorded in the last {windowDays} days yet.
                      </Text>
                    </View>
                  ) : (
                    analytics.topPosts.slice(0, 15).map((post, idx) => (
                      <Pressable
                        key={post.uri}
                        accessibilityRole="button"
                        accessibilityLabel={`Open top Zing #${idx + 1}`}
                        onPress={() => handleOpenPost(post)}
                        style={[
                          a.p_md,
                          a.gap_xs,
                          idx > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: colors.border,
                          },
                        ]}>
                        <View
                          style={[
                            a.flex_row,
                            a.align_center,
                            a.justify_between,
                            a.gap_xs,
                          ]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              a.text_xs,
                              a.font_bold,
                              {color: colors.accentText},
                            ]}>
                            #{idx + 1} · {formatShortDate(post.createdAt)}
                          </Text>
                          <Text style={[a.text_xs, {color: colors.muted}]}>
                            {formatCompact(post.viewCount)} views ·{' '}
                            {Number(post.engagementRate || 0).toFixed(1)}% ER
                          </Text>
                        </View>
                        <Text
                          numberOfLines={2}
                          style={[
                            a.text_sm,
                            a.leading_snug,
                            {color: colors.text},
                          ]}>
                          {post.text?.trim() || '[Media Zing]'}
                        </Text>
                        <View
                          style={[
                            a.flex_row,
                            a.flex_wrap,
                            a.align_center,
                            a.gap_md,
                            a.pt_2xs,
                          ]}>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <EyeIcon size="xs" fill={colors.accent} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {formatCompact(post.viewCount)}
                            </Text>
                          </View>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <HeartIcon size="xs" fill={colors.like} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {formatCompact(post.likeCount)}
                            </Text>
                          </View>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <RezingIcon size="xs" fill={colors.rezing} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {formatCompact(post.repostCount)}
                            </Text>
                          </View>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <ReplyIcon size="xs" fill={colors.accent} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {formatCompact(post.replyCount)}
                            </Text>
                          </View>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <BookmarkIcon size="xs" fill={colors.muted} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {formatCompact(post.bookmarkCount)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
