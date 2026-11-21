import {Pressable, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'
import {useNavigation, useNavigationState} from '@react-navigation/native'

import {getCurrentRoute} from '#/lib/routes/helpers'
import {getHomeNavigationAction} from '#/lib/routes/navigation'
import {type NavigationProp} from '#/lib/routes/types'
import {getLocalizedFeedName} from '#/lib/strings/feed-names'
import {emitSoftReset} from '#/state/events'
import {
  type SavedFeedSourceInfo,
  usePinnedFeedsInfos,
} from '#/state/queries/feed'
import {useSelectedFeed, useSetSelectedFeed} from '#/state/shell/selected-feed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {FilterTimeline_Stroke2_Corner0_Rounded as FilterTimeline} from '#/components/icons/FilterTimeline'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function DesktopFeeds() {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const {data: pinnedFeedInfos, error, isLoading} = usePinnedFeedsInfos()
  const selectedFeed = useSelectedFeed()
  const setSelectedFeed = useSetSelectedFeed()
  const navigation = useNavigation<NavigationProp>()
  const route = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })

  const rowHoverBg =
    t.scheme === 'dark'
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(15, 20, 25, 0.03)'

  if (isLoading) {
    return (
      <View
        style={[
          t.atoms.bg_contrast_25,
          a.rounded_lg,
          a.border,
          t.atoms.border_contrast_low,
          a.p_lg,
          a.gap_sm,
        ]}>
        <View
          style={[
            a.rounded_xs,
            t.atoms.bg_contrast_50,
            {height: 18, width: '45%', marginBottom: 4},
          ]}
        />
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <View
              key={i}
              style={[
                a.rounded_sm,
                t.atoms.bg_contrast_50,
                {
                  height: 16,
                  width: i % 2 === 0 ? '65%' : '80%',
                },
              ]}
            />
          ))}
      </View>
    )
  }

  if (error || !pinnedFeedInfos) {
    return null
  }

  return (
    <View
      style={[
        t.atoms.bg_contrast_25,
        a.rounded_lg,
        a.border,
        t.atoms.border_contrast_low,
        a.overflow_hidden,
      ]}>
      <View style={[a.px_lg, a.pt_md, a.pb_sm]}>
        <Text style={[a.text_xl, a.font_bold, t.atoms.text]}>Your feeds</Text>
      </View>

      <View
        style={[
          web({
            maxHeight: 260,
            overflowY: 'auto',
          }),
        ]}>
        {pinnedFeedInfos.map((feedInfo, index) => {
          const feed = feedInfo.feedDescriptor
          const current =
            route.name === 'Home' &&
            (selectedFeed ? feed === selectedFeed : index === 0)

          return (
            <FeedItem
              key={feedInfo.uri}
              feedInfo={feedInfo}
              current={current}
              rowHoverBg={rowHoverBg}
              onPress={() => {
                ax.metric('desktopFeeds:feed:click', {
                  feedUri: feedInfo.uri,
                  feedDescriptor: feed,
                })
                setSelectedFeed(feed)
                navigation.dispatch(
                  getHomeNavigationAction(navigation.getState(), 'navigate'),
                )
                if (route.name === 'Home' && feed === selectedFeed) {
                  emitSoftReset()
                }
              }}
            />
          )
        })}
      </View>

      <Link
        to="/feeds"
        label={l`More feeds`}
        style={[a.w_full, a.px_lg, a.py_md, a.justify_start]}
        hoverStyle={{backgroundColor: rowHoverBg}}>
        <Text
          style={[
            a.text_md,
            route.name === 'Feeds' ? a.font_bold : a.font_normal,
            {color: t.palette.primary_500},
          ]}
          numberOfLines={1}>
          {l`More feeds`}
        </Text>
      </Link>
    </View>
  )
}

function FeedItem({
  feedInfo,
  current,
  rowHoverBg,
  onPress,
}: {
  feedInfo: SavedFeedSourceInfo
  current: boolean
  rowHoverBg: string
  onPress: () => void
}) {
  const t = useTheme()
  const {t: l, i18n} = useLingui()
  const {
    state: hovered,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()
  const isFollowing = feedInfo.feedDescriptor === 'following'
  const displayName = getLocalizedFeedName(feedInfo, i18n)

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={displayName}
      accessibilityHint={l`Opens ${displayName} feed`}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        a.w_full,
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.px_lg,
        a.py_sm,
        current && {backgroundColor: t.palette.primary_50},
        !current && hovered && {backgroundColor: rowHoverBg},
      ]}>
      {isFollowing ? (
        <View
          style={[
            a.align_center,
            a.justify_center,
            a.rounded_xs,
            {
              width: 22,
              height: 22,
              backgroundColor: t.palette.primary_500,
            },
          ]}>
          <FilterTimeline
            style={{width: 14, height: 14}}
            fill={t.palette.white}
          />
        </View>
      ) : (
        <UserAvatar
          type={feedInfo.type === 'list' ? 'list' : 'algo'}
          size={22}
          avatar={feedInfo.avatar}
          noBorder
        />
      )}
      <Text
        style={[
          a.flex_1,
          a.text_md,
          a.leading_snug,
          current
            ? [t.atoms.text, a.font_bold]
            : hovered
              ? [t.atoms.text, a.font_medium]
              : [t.atoms.text, a.font_medium],
        ]}
        numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  )
}
