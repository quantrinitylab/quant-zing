import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'
import {AtUri} from '@atproto/syntax'
import {CommonActions, useNavigation} from '@react-navigation/native'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {
  checkQuantOsStatus,
  getQuantZingColors,
  type QuantOsStatus,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {
  type FeedDescriptor,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Bubble_Stroke2_Corner2_Rounded as ReplyIcon} from '#/components/icons/Bubble'
import {CircleCheck_Stroke2_Corner0_Rounded as CheckCircleIcon} from '#/components/icons/CircleCheck'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {Heart2_Filled_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import {Repost_Stroke2_Corner2_Rounded as RezingIcon} from '#/components/icons/Repost'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

interface AnalyzedZing {
  uri: string
  authorHandle: string
  authorDisplayName: string
  text: string
  likes: number
  rezings: number
  replies: number
  quotes: number
  totalEngagement: number
  estimatedImpressions: number
  indexedAt: string
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function CreatorStudioScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const navigation = useNavigation<NavigationProp>()
  const {hasSession, currentAccount} = useSession()

  const [scope, setScope] = useState<'mine' | 'discover'>(
    hasSession && currentAccount?.did ? 'mine' : 'discover',
  )
  const [quantOsStatus, setQuantOsStatus] = useState<QuantOsStatus | null>(null)

  const effectiveScope: 'mine' | 'discover' =
    hasSession && currentAccount?.did && scope === 'mine' ? 'mine' : 'discover'

  const feedDescriptor: FeedDescriptor =
    effectiveScope === 'mine' && currentAccount?.did
      ? `author|${currentAccount.did}|posts_with_replies`
      : `feedgen|${DISCOVER_FEED_URI}`

  const {data: profile} = useProfileQuery({
    did: hasSession ? currentAccount?.did : undefined,
  })

  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
  } = usePostFeedQuery(
    feedDescriptor,
    effectiveScope === 'discover' ? {feedCacheKey: 'discover'} : undefined,
  )

  useEffect(() => {
    let active = true
    void checkQuantOsStatus().then(next => {
      if (active) setQuantOsStatus(next)
    })
    return () => {
      active = false
    }
  }, [])

  const analyzedZings = useMemo<AnalyzedZing[]>(() => {
    const pages = feedData?.pages ?? []
    const seen = new Set<string>()
    const list: AnalyzedZing[] = []

    for (const page of pages) {
      for (const slice of page.slices) {
        for (const item of slice.items) {
          const post = item.post
          if (seen.has(post.uri)) continue
          seen.add(post.uri)

          const likes = Number(post.likeCount ?? 0)
          const rezings = Number(post.repostCount ?? 0)
          const replies = Number(post.replyCount ?? 0)
          const quotes = Number(post.quoteCount ?? 0)
          const totalEngagement = likes + rezings + replies + quotes
          const estimatedImpressions = Math.max(
            45,
            Math.round(likes * 18 + rezings * 65 + replies * 32 + quotes * 50),
          )

          list.push({
            uri: post.uri,
            authorHandle: post.author.handle,
            authorDisplayName: post.author.displayName || post.author.handle,
            text: (item.record?.text || '').trim() || '[Media Zing]',
            likes,
            rezings,
            replies,
            quotes,
            totalEngagement,
            estimatedImpressions,
            indexedAt: post.indexedAt,
          })
        }
      }
    }

    return list.sort((aZing, bZing) => bZing.totalEngagement - aZing.totalEngagement)
  }, [feedData])

  const summary = useMemo(() => {
    const totalLikes = analyzedZings.reduce((s, z) => s + z.likes, 0)
    const totalRezings = analyzedZings.reduce((s, z) => s + z.rezings, 0)
    const totalReplies = analyzedZings.reduce((s, z) => s + z.replies, 0)
    const totalImpressions = analyzedZings.reduce(
      (s, z) => s + z.estimatedImpressions,
      0,
    )
    const totalEngagements = analyzedZings.reduce(
      (s, z) => s + z.totalEngagement,
      0,
    )
    const engagementRate =
      totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0

    return {
      zingCount: analyzedZings.length,
      totalLikes,
      totalRezings,
      totalReplies,
      totalImpressions,
      totalEngagements,
      engagementRate,
    }
  }, [analyzedZings])

  const topChartZings = useMemo(
    () => analyzedZings.slice(0, 8),
    [analyzedZings],
  )
  const maxBarEngagement = useMemo(
    () => Math.max(1, ...topChartZings.map(z => z.totalEngagement)),
    [topChartZings],
  )

  const handleOpenZing = useCallback(
    (zing: AnalyzedZing) => {
      try {
        const uri = new AtUri(zing.uri)
        navigation.navigate('PostThread', {
          name: zing.authorHandle || uri.host,
          rkey: uri.rkey,
        })
      } catch {
        // Ignore malformed URI
      }
    },
    [navigation],
  )

  const handleOpenPro = useCallback(() => {
    try {
      navigation.dispatch(CommonActions.navigate({name: 'QuantZingPro'}))
    } catch {
      // Ignore if route not yet registered
    }
  }, [navigation])

  const followersCount = Number(profile?.followersCount ?? 0)
  const followersGoal = 500
  const followersPct = Math.min(
    100,
    Math.round((followersCount / followersGoal) * 100),
  )

  const impressionsGoal = 50_000
  const impressionsPct = Math.min(
    100,
    Math.round((summary.totalImpressions / impressionsGoal) * 100),
  )

  const payOnline = Boolean(quantOsStatus?.pay.online)

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
            Audience analytics & creator revenue share
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh analytics"
          onPress={() => void refetch()}
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
          <Text style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
            {isRefetching ? 'Syncing...' : 'Refresh'}
          </Text>
        </Pressable>
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {/* Scope Switcher & Source Indicator */}
        <View
          style={[
            a.flex_row,
            a.flex_wrap,
            a.align_center,
            a.justify_between,
            a.gap_sm,
          ]}>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            {hasSession && currentAccount?.did && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setScope('mine')}
                style={[
                  a.px_md,
                  a.py_xs,
                  a.rounded_full,
                  {
                    backgroundColor:
                      effectiveScope === 'mine' ? colors.ctaBg : colors.card,
                    borderWidth: 1,
                    borderColor:
                      effectiveScope === 'mine' ? colors.ctaBg : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    a.text_xs,
                    a.font_bold,
                    {
                      color:
                        effectiveScope === 'mine'
                          ? colors.ctaText
                          : colors.text,
                    },
                  ]}>
                  @{currentAccount.handle}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setScope('discover')}
              style={[
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor:
                    effectiveScope === 'discover' ? colors.ctaBg : colors.card,
                  borderWidth: 1,
                  borderColor:
                    effectiveScope === 'discover'
                      ? colors.ctaBg
                      : colors.border,
                },
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {
                    color:
                      effectiveScope === 'discover'
                        ? colors.ctaText
                        : colors.text,
                  },
                ]}>
                Discover Pulse
              </Text>
            </Pressable>
          </View>

          <Text style={[a.text_xs, {color: colors.muted}]}>
            {effectiveScope === 'mine'
              ? `Metrics from your ${summary.zingCount} recent Zings`
              : `Analysis across ${summary.zingCount} top Discover Zings`}
          </Text>
        </View>

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
              Loading engagement metrics...
            </Text>
          </View>
        ) : (
          <>
            {/* 4 KPI Metric Cards */}
            <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
              {[
                {
                  label: 'Est. Impressions',
                  value: formatCompact(summary.totalImpressions),
                  sub: `${summary.zingCount} zings tracked`,
                  color: colors.accent,
                  icon: <EyeIcon size="sm" fill={colors.accent} />,
                },
                {
                  label: 'Total Likes',
                  value: formatCompact(summary.totalLikes),
                  sub: 'Verified reactions',
                  color: colors.like,
                  icon: <HeartIcon size="sm" fill={colors.like} />,
                },
                {
                  label: 'Total Rezings',
                  value: formatCompact(summary.totalRezings),
                  sub: 'Organic amplification',
                  color: colors.rezing,
                  icon: <RezingIcon size="sm" fill={colors.rezing} />,
                },
                {
                  label: 'Engagement Rate',
                  value: `${summary.engagementRate.toFixed(2)}%`,
                  sub: `${formatCompact(summary.totalReplies)} replies`,
                  color: colors.accent,
                  icon: <ReplyIcon size="sm" fill={colors.accent} />,
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

            {/* Live Engagement Distribution Chart */}
            {topChartZings.length > 0 && (
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
                  style={[a.flex_row, a.align_center, a.justify_between]}>
                  <View>
                    <Text
                      style={[a.text_md, a.font_bold, {color: colors.text}]}>
                      Engagement Velocity (Top {topChartZings.length} Zings)
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Tap any bar to open the Zing thread
                    </Text>
                  </View>
                  <Text
                    style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                    Peak: {formatCompact(maxBarEngagement)}
                  </Text>
                </View>

                <View
                  style={[
                    a.flex_row,
                    a.align_end,
                    a.gap_xs,
                    {height: 120, paddingTop: 12},
                  ]}>
                  {topChartZings.map((zing, idx) => {
                    const barHeightPx = Math.max(
                      16,
                      Math.round(
                        (zing.totalEngagement / maxBarEngagement) * 86,
                      ),
                    )
                    return (
                      <Pressable
                        key={zing.uri}
                        accessibilityRole="button"
                        accessibilityLabel={`Open #${idx + 1} zing by @${zing.authorHandle}`}
                        onPress={() => handleOpenZing(zing)}
                        style={[
                          a.flex_1,
                          a.align_center,
                          a.justify_end,
                          a.gap_2xs,
                        ]}>
                        <Text style={[{fontSize: 10, color: colors.muted}]}>
                          {formatCompact(zing.totalEngagement)}
                        </Text>
                        <View
                          style={{
                            width: '100%',
                            height: barHeightPx,
                            borderRadius: 6,
                            backgroundColor:
                              idx === 0 ? colors.accent : colors.surface,
                            borderWidth: 1,
                            borderColor:
                              idx === 0 ? colors.accent : colors.border,
                          }}
                        />
                        <Text style={[{fontSize: 10, color: colors.muted}]}>
                          #{idx + 1}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {/* 70/30 Creator Monetization Eligibility Card */}
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
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
                  <ShieldIcon size="md" fill={colors.rezing} />
                  <View style={[a.flex_1]}>
                    <Text
                      style={[a.text_md, a.font_bold, {color: colors.text}]}>
                      70/30 Creator Revenue Share
                    </Text>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Earn 70% of ad revenue on eligible Zings and Articles
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {
                      backgroundColor: payOnline
                        ? colors.rezingSubtle
                        : colors.surface,
                      borderWidth: 1,
                      borderColor: payOnline ? colors.rezing : colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      {fontSize: 11, fontWeight: '700'},
                      {color: payOnline ? colors.rezing : colors.muted},
                    ]}>
                    {payOnline ? 'Payouts Ready' : '70/30 Split'}
                  </Text>
                </View>
              </View>

              {/* Progress Bars */}
              <View style={[a.gap_sm]}>
                <View style={[a.gap_2xs]}>
                  <View style={[a.flex_row, a.justify_between]}>
                    <Text style={[a.text_xs, {color: colors.text}]}>
                      Verified Followers
                    </Text>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.text},
                      ]}>
                      {followersCount.toLocaleString()} /{' '}
                      {followersGoal.toLocaleString()} ({followersPct}%)
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.surface,
                      overflow: 'hidden',
                    }}>
                    <View
                      style={{
                        width: `${followersPct}%`,
                        height: '100%',
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>
                </View>

                <View style={[a.gap_2xs]}>
                  <View style={[a.flex_row, a.justify_between]}>
                    <Text style={[a.text_xs, {color: colors.text}]}>
                      30-Day Impressions Threshold
                    </Text>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.text},
                      ]}>
                      {formatCompact(summary.totalImpressions)} /{' '}
                      {formatCompact(impressionsGoal)} ({impressionsPct}%)
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.surface,
                      overflow: 'hidden',
                    }}>
                    <View
                      style={{
                        width: `${impressionsPct}%`,
                        height: '100%',
                        backgroundColor: colors.rezing,
                      }}
                    />
                  </View>
                </View>

                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_between,
                    a.pt_xs,
                  ]}>
                  <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                    <CheckCircleIcon
                      size="xs"
                      fill={payOnline ? colors.rezing : colors.muted}
                    />
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      Verify with QuantZing Pro to enable 70/30 payouts
                    </Text>
                  </View>
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
                      style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                      Verify with Pro
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Top Performing Zings Table */}
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
                <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                  Top Performing Zings
                </Text>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Ranked by engagement · click any row to inspect thread
                </Text>
              </View>

              {analyzedZings.length === 0 ? (
                <View style={[a.p_lg, a.align_center]}>
                  <Text style={[a.text_sm, {color: colors.muted}]}>
                    No Zings found in this feed yet. Publish a Zing or switch to
                    Discover Pulse.
                  </Text>
                </View>
              ) : (
                analyzedZings.slice(0, 12).map((zing, idx) => (
                  <Pressable
                    key={zing.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Open Zing by @${zing.authorHandle}`}
                    onPress={() => handleOpenZing(zing)}
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
                          a.flex_1,
                          {color: colors.accent},
                        ]}>
                        #{idx + 1} · {zing.authorDisplayName} @
                        {zing.authorHandle}
                      </Text>
                      <Text style={[a.text_xs, {color: colors.muted}]}>
                        ~{formatCompact(zing.estimatedImpressions)} views
                      </Text>
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[
                        a.text_sm,
                        a.leading_snug,
                        {color: colors.text},
                      ]}>
                      {zing.text}
                    </Text>
                    <View
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_md,
                        a.pt_2xs,
                      ]}>
                      <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                        <HeartIcon size="xs" fill={colors.like} />
                        <Text style={[a.text_xs, {color: colors.muted}]}>
                          {formatCompact(zing.likes)}
                        </Text>
                      </View>
                      <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                        <RezingIcon size="xs" fill={colors.rezing} />
                        <Text style={[a.text_xs, {color: colors.muted}]}>
                          {formatCompact(zing.rezings)}
                        </Text>
                      </View>
                      <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                        <ReplyIcon size="xs" fill={colors.accent} />
                        <Text style={[a.text_xs, {color: colors.muted}]}>
                          {formatCompact(zing.replies)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
