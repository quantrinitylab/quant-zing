import {useEffect, useMemo, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  fetchQuantZingNewsBriefing,
  fetchZingSpaces,
  getQuantZingColors,
  type QuantZingNewsBriefingTopic,
  type QuantZingSpace,
} from '#/lib/quantos/client'
import {useSession} from '#/state/session'
import {DesktopFeeds} from '#/view/shell/desktop/Feeds'
import {DesktopSearch} from '#/view/shell/desktop/Search'
import {SidebarTrendingTopics} from '#/view/shell/desktop/SidebarTrendingTopics'
import {SidebarWhoToFollow} from '#/view/shell/desktop/SidebarWhoToFollow'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout'
import {InlineLinkText, Link} from '#/components/Link'
import {ProgressGuideList} from '#/components/ProgressGuide/List'
import {Text} from '#/components/Typography'
import {SidebarLiveEventFeedsBanner} from '#/features/liveEvents/components/SidebarLiveEventFeedsBanner'

function useWebQueryParams() {
  const navigation = useNavigation()
  const [params, setParams] = useState<Record<string, string>>({})

  useEffect(() => {
    return navigation.addListener('state', e => {
      try {
        const {state} = e.data
        const lastRoute = state.routes[state.routes.length - 1]
        setParams(lastRoute.params)
      } catch (err) {}
    })
  }, [navigation, setParams])

  return params
}

export function DesktopRightNav({routeName}: {routeName: string}) {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {hasSession} = useSession()
  const isSearchScreen = routeName === 'Search'
  const isMessagesRelatedScreen = routeName.startsWith('Messages')
  const webqueryParams = useWebQueryParams()
  const searchQuery = webqueryParams?.q
  const showExploreScreenDuplicatedContent =
    !isSearchScreen || (isSearchScreen && !!searchQuery)
  const {rightNavVisible, centerColumnOffset, leftNavMinimal} =
    useLayoutBreakpoints()

  const [liveSpaces, setLiveSpaces] = useState<QuantZingSpace[]>([])
  const [briefingTopics, setBriefingTopics] = useState<
    QuantZingNewsBriefingTopic[]
  >([])

  useEffect(() => {
    if (!rightNavVisible || isMessagesRelatedScreen) return
    let cancelled = false
    fetchZingSpaces('live')
      .then(list => {
        if (!cancelled) {
          setLiveSpaces(list.slice(0, 2))
        }
      })
      .catch(() => {})

    fetchQuantZingNewsBriefing(3)
      .then(res => {
        if (!cancelled && Array.isArray(res?.topics)) {
          setBriefingTopics(res.topics.slice(0, 3))
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isMessagesRelatedScreen, rightNavVisible, routeName])

  if (!rightNavVisible || isMessagesRelatedScreen) {
    return null
  }

  const cardWidth = centerColumnOffset ? 250 : 300
  const showLoggedOutBottomBar = !hasSession && leftNavMinimal

  return (
    <View
      testID="desktopRightNav"
      style={[
        web({
          position: 'fixed',
          top: 0,
          bottom: showLoggedOutBottomBar ? 64 : 0,
          zIndex: 10,
          left: '50%',
          transform: [
            {
              translateX: 300 + (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0),
            },
            ...a.scrollbar_offset.transform,
          ],
          width: cardWidth + 32,
          paddingTop: 12,
          paddingLeft: 24,
          paddingRight: 8,
          paddingBottom: showLoggedOutBottomBar ? 16 : 84,
          boxSizing: 'border-box',
          overflowY: 'auto',
          scrollbarWidth: 'none',
        }),
      ]}>
      <View style={[a.w_full, a.gap_md]}>
        {!isSearchScreen && <DesktopSearch />}

        {showExploreScreenDuplicatedContent && <SidebarLiveEventFeedsBanner />}

        {/* Live ZingSpaces Banner if any room is live */}
        {liveSpaces.length > 0 && (
          <View
            testID="sidebarLiveZingSpacesCard"
            style={[
              a.w_full,
              a.rounded_lg,
              a.p_md,
              a.gap_xs,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.rezing,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.justify_between]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.rezing}]}>
                LIVE ZINGSPACES ({liveSpaces.length})
              </Text>
              <Link to="/spaces" label="Open ZingSpaces">
                <Text
                  style={[
                    a.text_xs,
                    a.font_semi_bold,
                    {color: colors.accent},
                  ]}>
                  Join
                </Text>
              </Link>
            </View>
            {liveSpaces.map(space => (
              <Link
                key={space.slug}
                to="/spaces"
                label={`Join ${space.title}`}
                style={[a.py_2xs]}>
                <View style={[a.gap_2xs]}>
                  <Text
                    numberOfLines={1}
                    style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                    {space.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[a.text_xs, {color: colors.muted}]}>
                    @{space.hostHandle} · {space.listenerCount} listeners
                  </Text>
                </View>
              </Link>
            ))}
          </View>
        )}

        {showExploreScreenDuplicatedContent && <SidebarTrendingTopics />}

        {/* Live Network News Briefing Card */}
        {showExploreScreenDuplicatedContent && briefingTopics.length > 0 && (
          <View
            testID="sidebarNewsBriefingCard"
            style={[
              a.w_full,
              a.rounded_lg,
              a.p_md,
              a.gap_sm,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.justify_between]}>
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                Network Briefing
              </Text>
              <Link to="/quanty" label="Open Quanty News">
                <Text
                  style={[
                    a.text_xs,
                    a.font_semi_bold,
                    {color: colors.accent},
                  ]}>
                  Quanty
                </Text>
              </Link>
            </View>
            {briefingTopics.map(item => (
              <Link
                key={item.id}
                to={`/search?q=${encodeURIComponent(item.topic)}`}
                label={item.topic}
                style={[a.py_2xs]}>
                <View style={[a.gap_2xs]}>
                  <Text
                    numberOfLines={1}
                    style={[a.text_sm, a.font_bold, {color: colors.text}]}>
                    {item.topic}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[a.text_xs, {color: colors.muted}]}>
                    {item.summary}
                  </Text>
                </View>
              </Link>
            ))}
          </View>
        )}

        <SidebarWhoToFollow />

        {hasSession && (
          <>
            <DesktopFeeds />
            <ProgressGuideList />
          </>
        )}

        <Text
          style={[
            a.w_full,
            a.px_xs,
            a.text_xs,
            a.leading_snug,
            {color: colors.muted},
          ]}>
          <InlineLinkText
            to="/help"
            style={[a.text_xs, {color: colors.muted}]}
            label="Feedback">
            Feedback
          </InlineLinkText>
          <Text style={[a.text_xs, {color: colors.muted}]}>{' · '}</Text>
          <InlineLinkText
            to="/privacy"
            style={[a.text_xs, {color: colors.muted}]}
            label="Privacy">
            Privacy
          </InlineLinkText>
          <Text style={[a.text_xs, {color: colors.muted}]}>{' · '}</Text>
          <InlineLinkText
            to="/terms"
            style={[a.text_xs, {color: colors.muted}]}
            label="Terms">
            Terms
          </InlineLinkText>
          <Text style={[a.text_xs, {color: colors.muted}]}>{' · '}</Text>
          <InlineLinkText
            label="Help"
            to="/help"
            style={[a.text_xs, {color: colors.muted}]}>
            Help
          </InlineLinkText>
          <Text style={[a.text_xs, {color: colors.muted}]}>
            {' · © QuantZing'}
          </Text>
        </Text>

        {!hasSession && leftNavMinimal && (
          <View style={[a.w_full, {height: 32}]}>
            <AppLanguageDropdown />
          </View>
        )}
      </View>
    </View>
  )
}
