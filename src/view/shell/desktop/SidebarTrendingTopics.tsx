import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {
  useTrendingSettings,
  useTrendingSettingsApi,
} from '#/state/preferences/trending'
import {useGetTrendsQuery} from '#/state/queries/trending/useGetTrendsQuery'
import {useTrendingConfig} from '#/state/service-config'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {DotGrid3x1_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {Link} from '#/components/Link'
import * as Prompt from '#/components/Prompt'
import {
  getTrendingTopicFeedUri,
  TrendingTopicLink,
  TrendingTopicsPrompt,
} from '#/components/TrendingTopics'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

const SIDEBAR_TRENDS_LIMIT = 4

export function SidebarTrendingTopics() {
  const {enabled} = useTrendingConfig()
  const {trendingDisabled} = useTrendingSettings()
  return !enabled ? null : trendingDisabled ? null : <Inner />
}

function Inner() {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()

  const trendingPrompt = Prompt.usePromptControl()
  const {setTrendingDisabled} = useTrendingSettingsApi()
  const {
    data: trending,
    error,
    isLoading,
  } = useGetTrendsQuery({
    limit: SIDEBAR_TRENDS_LIMIT,
    refetchOnWindowFocus: true,
  })
  const noTopics = !isLoading && !error && !trending?.trends?.length

  const onConfirmHide = () => {
    ax.metric('trendingTopics:hide', {context: 'sidebar'})
    setTrendingDisabled(true)
  }

  const rowHoverBg =
    t.scheme === 'dark'
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(15, 20, 25, 0.03)'

  return error || noTopics ? null : (
    <>
      <View
        testID="sidebarTrendingTopicsCard"
        style={[
          a.w_full,
          t.atoms.bg_contrast_25,
          a.rounded_lg,
          a.border,
          t.atoms.border_contrast_low,
          a.overflow_hidden,
        ]}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_between,
            a.px_lg,
            a.pt_md,
            a.pb_xs,
          ]}>
          <Text style={[a.flex_1, a.text_xl, a.font_bold, t.atoms.text]}>
            What&apos;s happening
          </Text>
          <Button
            variant="ghost"
            size="tiny"
            color="secondary"
            shape="round"
            label={l`Trending options`}
            onPress={() => trendingPrompt.open()}
            style={[a.bg_transparent]}>
            <ButtonIcon icon={EllipsisIcon} size="xs" />
          </Button>
        </View>

        <View style={[a.w_full]}>
          {isLoading ? (
            Array(SIDEBAR_TRENDS_LIMIT)
              .fill(0)
              .map((_n, i) => (
                <View key={i} style={[a.px_lg, a.py_xs, a.gap_xs]}>
                  <View
                    style={[
                      a.rounded_xs,
                      t.atoms.bg_contrast_50,
                      {height: 11, width: 72},
                    ]}
                  />
                  <View
                    style={[
                      a.rounded_xs,
                      t.atoms.bg_contrast_50,
                      {height: 15, width: i % 2 === 0 ? 140 : 170},
                    ]}
                  />
                </View>
              ))
          ) : !trending?.trends ? null : (
            <>
              {trending.trends
                .slice(0, SIDEBAR_TRENDS_LIMIT)
                .map((topic, i) => {
                  const rank = i + 1
                  return (
                    <TrendingTopicLink
                      key={topic.link}
                      topic={topic}
                      metricContext="sidebar"
                      rank={rank}
                      recId={trending.recId}
                      style={[a.w_full, a.px_lg, a.py_xs, a.justify_start]}
                      hoverStyle={{backgroundColor: rowHoverBg}}
                      onPress={() => {
                        ax.metric('trendingTopic:click', {
                          context: 'sidebar',
                          feedUri: getTrendingTopicFeedUri(topic),
                          rank,
                          recId: trending.recId,
                        })
                      }}>
                      <View style={[a.flex_1, a.gap_2xs]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.leading_snug,
                            t.atoms.text_contrast_low,
                          ]}>
                          {rank} · Trending
                        </Text>
                        <Text
                          style={[
                            a.text_md,
                            a.font_bold,
                            a.leading_snug,
                            t.atoms.text,
                          ]}
                          numberOfLines={1}>
                          {topic.displayName ?? topic.topic}
                        </Text>
                      </View>
                    </TrendingTopicLink>
                  )
                })}
            </>
          )}
        </View>

        <Link
          label={l`See more trending topics`}
          to="/search"
          style={[a.w_full, a.px_lg, a.py_sm, a.justify_start]}
          hoverStyle={{backgroundColor: rowHoverBg}}>
          <Text
            style={[
              a.text_md,
              a.font_normal,
              {color: t.palette.primary_500},
            ]}
            numberOfLines={1}>
            <Trans>See more</Trans>
          </Text>
        </Link>
      </View>
      <TrendingTopicsPrompt
        control={trendingPrompt}
        onConfirm={onConfirmHide}
      />
    </>
  )
}
