import {useMemo} from 'react'
import {Pressable, View} from 'react-native'
import {Image} from 'expo-image'
import {moderateProfile} from '@bsky/sdk/moderation'
import {RichText as RichTextApi} from '@bsky/sdk/richtext'
import {Trans, useLingui} from '@lingui/react/macro'

import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {
  useTrendingSettings,
  useTrendingSettingsApi,
} from '#/state/preferences/trending'
import {
  DEFAULT_FETCH_LIMIT,
  DEFAULT_LIMIT,
  useGetTrendsQuery,
} from '#/state/queries/trending/useGetTrendsQuery'
import {useTrendingConfig} from '#/state/service-config'
import {LoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {formatCount} from '#/view/com/util/numeric/format'
import {atoms as a, useGutters, useTheme, type ViewStyleProp} from '#/alf'
import {AvatarStack} from '#/components/AvatarStack'
import {Trending3_Stroke2_Corner1_Rounded as TrendingIcon} from '#/components/icons/Trending'
import {Link} from '#/components/Link'
import * as Prompt from '#/components/Prompt'
import {RichText} from '#/components/RichText'
import {SubtleHover} from '#/components/SubtleHover'
import {
  getTrendingTopicFeedUri,
  TrendingTopicsPrompt,
  useTrendingTopicSeen,
} from '#/components/TrendingTopics'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {type app} from '#/lexicons'
import * as ModuleHeader from '../components/ModuleHeader'

const IMAGE_SIZE = 56

export function ExploreTrendingTopics({
  categoryFilter,
}: {
  categoryFilter?: string | null
} = {}) {
  const {enabled} = useTrendingConfig()
  const {trendingDisabled} = useTrendingSettings()
  return enabled && !trendingDisabled ? (
    <Inner categoryFilter={categoryFilter} />
  ) : null
}

function Inner({categoryFilter}: {categoryFilter?: string | null}) {
  const ax = useAnalytics()
  const {t: l} = useLingui()

  const topicCount = ax.features.getValue(
    ax.features.TrendingExploreTopicsCountValue,
    DEFAULT_LIMIT,
  )

  const trendingPrompt = Prompt.usePromptControl()
  const {setTrendingDisabled} = useTrendingSettingsApi()
  const {
    data: trending,
    error,
    isLoading,
    isRefetching,
  } = useGetTrendsQuery({
    fetchLimit: Math.min(topicCount * 2, DEFAULT_FETCH_LIMIT),
    limit: topicCount,
  })

  const filteredTrends = useMemo(() => {
    if (!trending?.trends) return []
    if (
      !categoryFilter ||
      categoryFilter === 'for-you' ||
      categoryFilter === 'trending' ||
      categoryFilter === 'all'
    ) {
      return trending.trends
    }
    const matched = trending.trends.filter(trend => {
      if (categoryFilter === 'sports') {
        return trend.category === 'sports'
      }
      if (categoryFilter === 'entertainment') {
        return (
          trend.category === 'pop-culture' || trend.category === 'video-games'
        )
      }
      if (categoryFilter === 'news') {
        return trend.category === 'news' || trend.category === 'politics'
      }
      return true
    })
    return matched.length > 0 ? matched : trending.trends
  }, [trending?.trends, categoryFilter])

  const noTopics = !isLoading && !error && !filteredTrends.length
  const showLoading = isLoading || isRefetching

  if (!showLoading && (error || !trending?.trends || noTopics)) return null

  return (
    <>
      <View style={[a.pb_md]}>
        <ModuleHeader.Container bottomBorder>
          <ModuleHeader.Icon icon={TrendingIcon} size="md" />
          <ModuleHeader.TitleText>
            <Trans>Trending</Trans>
          </ModuleHeader.TitleText>
          <ModuleHeader.EllipsisButton
            label={l`Trending options`}
            onPress={() => trendingPrompt.open()}
          />
        </ModuleHeader.Container>
        {showLoading
          ? Array.from({length: topicCount}).map((__, i) => (
              <TrendingTopicRowSkeleton key={i} />
            ))
          : filteredTrends.map((trend, index) => {
              const rank = index + 1
              return (
                <TrendRow
                  key={trend.link}
                  trend={trend}
                  rank={rank}
                  recId={trending?.recId}
                  onPress={() => {
                    ax.metric('trendingTopic:click', {
                      context: 'explore',
                      feedUri: getTrendingTopicFeedUri(trend),
                      rank,
                      recId: trending?.recId,
                    })
                  }}
                />
              )
            })}
      </View>

      <TrendingTopicsPrompt
        control={trendingPrompt}
        onConfirm={() => {
          ax.metric('trendingTopics:hide', {context: 'explore:trending'})
          setTrendingDisabled(true)
        }}
      />
    </>
  )
}

export function TrendRow({
  trend,
  rank,
  recId,
  children,
  onPress,
}: ViewStyleProp & {
  trend: app.bsky.unspecced.defs.TrendView
  rank: number
  recId?: string
  children?: React.ReactNode
  onPress?: () => void
}) {
  const t = useTheme()
  const {t: l, i18n} = useLingui()
  const gutters = useGutters([0, 'base'])

  const actors = useModerateTrendingActors(trend.actors)
  const formattedPostCount = formatCount(i18n, trend.postCount)
  useTrendingTopicSeen('explore', getTrendingTopicFeedUri(trend), rank, recId)

  const description = useMemo(() => {
    if (!trend.description) return
    const rt = new RichTextApi({text: trend.description})
    rt.detectFacetsWithoutResolution()
    return rt
  }, [trend.description])

  const categoryName = useCategoryDisplayName(trend.category)
  const metaLabel = categoryName
    ? `${rank} · Trending · ${categoryName}`
    : `${rank} · Trending`
  const topicLabel = trend.displayName.startsWith('#')
    ? trend.displayName
    : trend.topic?.startsWith('#')
      ? trend.topic
      : trend.displayName

  let imageUrl = null // TODO Image URL goes here when available. -dsb

  return (
    <Link
      testID={trend.link}
      label={l`Browse topic ${trend.displayName}`}
      accessibilityHint=""
      to={trend.link}
      onPress={onPress}
      style={[a.border_b, t.atoms.border_contrast_low]}
      PressableComponent={Pressable}>
      {({hovered, pressed}) => (
        <>
          <SubtleHover hover={hovered || pressed} native />
          <View style={[gutters, a.w_full, a.flex_row, a.py_md, a.gap_sm]}>
            <View style={[a.flex_1, a.gap_2xs]}>
              <Text
                style={[
                  a.text_xs,
                  t.atoms.text_contrast_medium,
                  a.leading_snug,
                ]}
                numberOfLines={1}>
                {metaLabel}
              </Text>
              <Text
                style={[a.text_md, a.font_bold, a.leading_snug]}
                numberOfLines={2}>
                {topicLabel}
              </Text>
              {description ? (
                <RichText
                  value={description}
                  disableLinks
                  style={[a.text_sm, t.atoms.text_contrast_medium]}
                  numberOfLines={2}
                />
              ) : null}
              <View style={[a.mt_2xs, a.flex_row, a.gap_sm, a.align_center]}>
                {actors.length > 0 ? (
                  <AvatarStack size={20} profiles={actors} />
                ) : null}
                <Text
                  style={[a.text_xs, t.atoms.text_contrast_medium]}
                  numberOfLines={1}>
                  {formattedPostCount}{' '}
                  {trend.postCount === 1 ? 'Zing' : 'Zings'}
                </Text>
              </View>
            </View>
            {imageUrl ? (
              <Image
                source={{
                  uri: imageUrl,
                }}
                alt={trend.topic}
                style={[
                  a.flex_0,
                  a.rounded_md,
                  t.atoms.bg_contrast_25,
                  {
                    width: IMAGE_SIZE,
                    height: IMAGE_SIZE,
                  },
                ]}
                contentFit="cover"
                accessible={true}
                accessibilityIgnoresInvertColors
                useAppleWebpCodec
              />
            ) : null}
          </View>
          {children}
        </>
      )}
    </Link>
  )
}

// Unused atm, but leaving here so we don't lose localization. -dsb
export function useCategoryDisplayName(
  category: app.bsky.unspecced.defs.TrendView['category'],
) {
  const {t: l} = useLingui()

  switch (category) {
    case 'sports':
      return l`Sports`
    case 'politics':
      return l`Politics`
    case 'video-games':
      return l`Video Games`
    case 'pop-culture':
      return l`Entertainment`
    case 'news':
      return l`News`
    case 'other':
    default:
      return null
  }
}

export function TrendingTopicRowSkeleton() {
  const t = useTheme()
  const gutters = useGutters([0, 'base'])

  return (
    <View
      style={[
        gutters,
        a.w_full,
        a.py_md,
        a.gap_xs,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <LoadingPlaceholder width={110} height={12} />
      <LoadingPlaceholder width={180} height={18} />
      <View style={[a.flex_row, a.gap_sm, a.align_center, a.pt_2xs]}>
        <LoadingPlaceholder width={70} height={12} />
      </View>
    </View>
  )
}

function useModerateTrendingActors(
  actors: app.bsky.unspecced.defs.TrendView['actors'],
) {
  const moderationOpts = useModerationOpts()

  return useMemo(() => {
    if (!moderationOpts) return []

    return actors
      .filter(actor => {
        const decision = moderateProfile(actor, moderationOpts)
        return !decision.ui('avatar').filter && !decision.ui('avatar').blur
      })
      .slice(0, 3)
  }, [actors, moderationOpts])
}
