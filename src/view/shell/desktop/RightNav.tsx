import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {FEEDBACK_FORM_URL} from '#/lib/constants'
import {useSession} from '#/state/session'
import {DesktopFeeds} from '#/view/shell/desktop/Feeds'
import {DesktopSearch} from '#/view/shell/desktop/Search'
import {SidebarTrendingTopics} from '#/view/shell/desktop/SidebarTrendingTopics'
import {SidebarWhoToFollow} from '#/view/shell/desktop/SidebarWhoToFollow'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
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
  const {hasSession, currentAccount} = useSession()
  const isSearchScreen = routeName === 'Search'
  const isMessagesRelatedScreen = routeName.startsWith('Messages')
  const webqueryParams = useWebQueryParams()
  const searchQuery = webqueryParams?.q
  const showExploreScreenDuplicatedContent =
    !isSearchScreen || (isSearchScreen && !!searchQuery)
  const {rightNavVisible, centerColumnOffset, leftNavMinimal} =
    useLayoutBreakpoints()

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
        {showExploreScreenDuplicatedContent && <SidebarTrendingTopics />}
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
            t.atoms.text_contrast_low,
          ]}>
          {hasSession && (
            <>
              <InlineLinkText
                to={FEEDBACK_FORM_URL({
                  email: currentAccount?.email,
                  handle: currentAccount?.handle,
                })}
                style={[a.text_xs, t.atoms.text_contrast_medium]}
                label="Feedback">
                Feedback
              </InlineLinkText>
              <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
                {' · '}
              </Text>
            </>
          )}
          <InlineLinkText
            to="/privacy"
            style={[a.text_xs, t.atoms.text_contrast_medium]}
            label="Privacy">
            Privacy
          </InlineLinkText>
          <Text style={[a.text_xs, t.atoms.text_contrast_low]}>{' · '}</Text>
          <InlineLinkText
            to="/terms"
            style={[a.text_xs, t.atoms.text_contrast_medium]}
            label="Terms">
            Terms
          </InlineLinkText>
          <Text style={[a.text_xs, t.atoms.text_contrast_low]}>{' · '}</Text>
          <InlineLinkText
            label="Help"
            to="/help"
            style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Help
          </InlineLinkText>
          <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
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
