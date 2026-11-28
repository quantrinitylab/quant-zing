import {useEffect, useMemo, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {useHaptics} from '#/lib/haptics'
import {
  fetchQuantZingNewsBriefing,
  fetchZingSpaces,
  getQuantZingColors,
  type QuantZingNewsBriefingTopic,
  type QuantZingSpace,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {
  useProfileFollowMutationQueue,
  useProfileQuery,
} from '#/state/queries/profile'
import {useRequireAuth, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {DesktopFeeds} from '#/view/shell/desktop/Feeds'
import {DesktopSearch} from '#/view/shell/desktop/Search'
import {SidebarTrendingTopics} from '#/view/shell/desktop/SidebarTrendingTopics'
import {SidebarWhoToFollow} from '#/view/shell/desktop/SidebarWhoToFollow'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout'
import {InlineLinkText, Link} from '#/components/Link'
import {ProgressGuideList} from '#/components/ProgressGuide/List'
import {Text} from '#/components/Typography'
import {SidebarLiveEventFeedsBanner} from '#/features/liveEvents/components/SidebarLiveEventFeedsBanner'
import {type app} from '#/lexicons'

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

function SidebarRelevantPeople({handle}: {handle: string}) {
  const {data: profile, isLoading} = useProfileQuery({did: handle})
  if (!handle || isLoading || !profile) return null
  return <SidebarRelevantPeopleInner rawProfile={profile} />
}

function SidebarRelevantPeopleInner({
  rawProfile,
}: {
  rawProfile: app.bsky.actor.defs.ProfileViewDetailed
}) {
  const t = useTheme()
  const profile = useProfileShadow(rawProfile)
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    profile,
    'ProfileCard',
  )
  const requireAuth = useRequireAuth()
  const haptics = useHaptics()
  const {currentAccount} = useSession()

  const isMe = currentAccount?.did === profile.did
  const isFollowing = Boolean(profile.viewer?.following)

  const onPressFollow = () => {
    haptics.confirm()
    requireAuth(async () => {
      if (isFollowing) {
        await queueUnfollow()
      } else {
        await queueFollow()
      }
    })
  }

  return (
    <View
      testID="sidebarRelevantPeopleCard"
      style={[
        a.w_full,
        t.atoms.bg_contrast_25,
        a.rounded_lg,
        a.border,
        t.atoms.border_contrast_low,
        a.p_md,
        a.gap_sm,
      ]}>
      <Text
        style={[
          {fontSize: 20, fontWeight: '800', lineHeight: 24},
          t.atoms.text,
        ]}>
        Relevant people
      </Text>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <UserAvatar size={40} avatar={profile.avatar} type="user" />
        <View style={[a.flex_1, a.gap_2xs]}>
          <Text numberOfLines={1} style={[a.text_sm, a.font_bold, t.atoms.text]}>
            {profile.displayName || profile.handle}
          </Text>
          <Text
            numberOfLines={1}
            style={[a.text_xs, t.atoms.text_contrast_medium]}>
            @{profile.handle}
          </Text>
        </View>
        {!isMe && (
          <Button
            size="small"
            color={isFollowing ? 'secondary' : 'primary'}
            label={isFollowing ? 'Following' : 'Follow'}
            accessibilityHint=""
            onPress={onPressFollow}>
            <ButtonText>
              {isFollowing ? 'Following' : 'Follow'}
            </ButtonText>
          </Button>
        )}
      </View>
      {profile.description ? (
        <Text
          numberOfLines={3}
          style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_medium]}>
          {profile.description}
        </Text>
      ) : null}
    </View>
  )
}

export function DesktopRightNav({routeName}: {routeName: string}) {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {hasSession} = useSession()
  const isSearchScreen = routeName === 'Search'
  const isPostThreadScreen = routeName === 'PostThread'
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
  const rowHoverBg =
    t.scheme === 'dark'
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(15, 20, 25, 0.03)'

  return (
    <View
      testID="desktopRightNav"
      style={[
        t.atoms.bg,
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
      <View style={[a.w_full, a.gap_md, {minWidth: 0}]}>
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
              a.border,
              a.overflow_hidden,
              {
                backgroundColor: colors.card,
                borderColor: colors.rezing,
                minWidth: 0,
              },
            ]}>
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.gap_sm,
                {minWidth: 0},
              ]}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  a.text_xs,
                  a.font_bold,
                  {color: colors.rezing, flexShrink: 1, minWidth: 0},
                ]}>
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
            {liveSpaces.map(space => {
              const cleanTitle = stripEmojisAndSymbols(space.title).trim()
              return (
                <Link
                  key={space.slug}
                  to="/spaces"
                  label={`Join ${cleanTitle || space.title}`}
                  style={[
                    a.w_full,
                    a.py_xs,
                    a.px_xs,
                    a.rounded_sm,
                    a.overflow_hidden,
                    {minWidth: 0},
                  ]}
                  hoverStyle={{backgroundColor: rowHoverBg}}>
                  <View
                    style={[
                      a.flex_1,
                      a.w_full,
                      a.gap_2xs,
                      a.overflow_hidden,
                      {flexShrink: 1, minWidth: 0},
                    ]}>
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={[
                        a.text_sm,
                        a.font_bold,
                        a.leading_snug,
                        {color: colors.text, flexShrink: 1, minWidth: 0},
                        web({
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }),
                      ]}>
                      {cleanTitle || space.title}
                    </Text>
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={[
                        a.text_xs,
                        a.leading_snug,
                        {color: colors.muted, flexShrink: 1, minWidth: 0},
                        web({
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }),
                      ]}>
                      @{space.hostHandle} · {space.listenerCount} listeners
                    </Text>
                  </View>
                </Link>
              )
            })}
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
              a.gap_xs,
              a.border,
              t.atoms.border_contrast_low,
              a.overflow_hidden,
              {
                backgroundColor: colors.card,
                minWidth: 0,
              },
            ]}>
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.gap_sm,
                a.pb_2xs,
                {minWidth: 0},
              ]}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  {
                    fontSize: 20,
                    fontWeight: '800',
                    lineHeight: 24,
                    color: colors.text,
                    flexShrink: 1,
                    minWidth: 0,
                  },
                ]}>
                Today's News
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
            {briefingTopics.map(item => {
              const cleanTopic = stripEmojisAndSymbols(item.topic).trim()
              const cleanSummary = stripEmojisAndSymbols(item.summary).trim()
              const formattedCount = item.postCount
                ? item.postCount >= 1000
                  ? `${(item.postCount / 1000).toFixed(1).replace(/\.0$/, '')}K`
                  : String(item.postCount)
                : '1.2K'
              return (
                <Link
                  key={item.id}
                  to={`/search?q=${encodeURIComponent(item.topic)}`}
                  label={cleanTopic || item.topic}
                  style={[
                    a.w_full,
                    a.py_xs,
                    a.px_xs,
                    a.rounded_sm,
                    a.overflow_hidden,
                    {minWidth: 0},
                  ]}
                  hoverStyle={{backgroundColor: rowHoverBg}}>
                  <View
                    style={[
                      a.flex_1,
                      a.w_full,
                      a.gap_2xs,
                      a.overflow_hidden,
                      {flexShrink: 1, minWidth: 0},
                    ]}>
                    <Text
                      numberOfLines={2}
                      ellipsizeMode="tail"
                      style={[
                        a.text_sm,
                        a.font_bold,
                        a.leading_snug,
                        {color: colors.text, flexShrink: 1, minWidth: 0},
                        web({
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }),
                      ]}>
                      {cleanTopic || item.topic}
                    </Text>
                    {cleanSummary ? (
                      <Text
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        style={[
                          a.text_xs,
                          a.leading_snug,
                          {color: colors.muted, flexShrink: 1, minWidth: 0},
                          web({
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }),
                        ]}>
                        {cleanSummary}
                      </Text>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        a.text_xs,
                        a.leading_snug,
                        {
                          color: colors.muted,
                          fontSize: 12,
                          lineHeight: 16,
                          flexShrink: 1,
                          minWidth: 0,
                        },
                        web({
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }),
                      ]}>
                      {`Trending now · News · ${formattedCount} Zings`}
                    </Text>
                  </View>
                </Link>
              )
            })}
          </View>
        )}

        {isPostThreadScreen && !!webqueryParams?.name && (
          <SidebarRelevantPeople handle={webqueryParams.name} />
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
