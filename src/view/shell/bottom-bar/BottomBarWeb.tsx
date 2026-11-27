import {useCallback} from 'react'
import {useWindowDimensions, View} from 'react-native'
import Animated from 'react-native-reanimated'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigationState} from '@react-navigation/native'

import {useHideBottomBarBorder} from '#/lib/hooks/useHideBottomBarBorder'
import {useMinimalShellFooterTransform} from '#/lib/hooks/useMinimalShellTransform'
import {getCurrentRoute, isTab} from '#/lib/routes/helpers'
import {useHasOpenDialog} from '#/state/dialogs'
import {useHomeBadge} from '#/state/home-badge'
import {useUnreadMessageCount} from '#/state/queries/messages/list-conversations'
import {useUnreadNotifications} from '#/state/queries/notifications/unread'
import {useSession} from '#/state/session'
import {useIsDrawerOpen} from '#/state/shell'
import {useComposerState} from '#/state/shell/composer'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useShellLayout} from '#/state/shell/shell-layout'
import {useCloseAllActiveElements} from '#/state/util'
import {Link} from '#/view/com/util/Link'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {
  Bell_Filled_Corner0_Rounded as BellFilled,
  Bell_Stroke2_Corner0_Rounded as Bell,
} from '#/components/icons/Bell'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilled,
  HomeOpen_Stoke2_Corner0_Rounded as Home,
} from '#/components/icons/HomeOpen'
import {
  MagnifyingGlass_Filled_Stroke2_Corner0_Rounded as MagnifyingGlassFilled,
  MagnifyingGlass_Stroke2_Corner0_Rounded as MagnifyingGlass,
} from '#/components/icons/MagnifyingGlass'
import {
  Message_Stroke2_Corner0_Rounded as Message,
  Message_Stroke2_Corner0_Rounded_Filled as MessageFilled,
} from '#/components/icons/Message'
import {Sparkle_Stroke2_Corner0_Rounded as Sparkle} from '#/components/icons/Sparkle'
import {useLightbox} from '#/components/Lightbox/state'
import {Text} from '#/components/Typography'
import {useAgeAssurance} from '#/ageAssurance'
import {useAnalytics} from '#/analytics'
import {isFollowingV2HomeDotEnabled} from '#/features/followingV2/eligibility'
import {styles} from './BottomBarStyles'

type NavItemValue =
  | 'home'
  | 'search'
  | 'quanty'
  | 'chat'
  | 'notifications'

export function BottomBarWeb() {
  const {_} = useLingui()
  const {hasSession} = useSession()
  const hasOpenDialog = useHasOpenDialog()
  const composerOpen = Boolean(useComposerState())
  const lightboxOpen = Boolean(useLightbox().activeLightbox)
  const drawerOpen = useIsDrawerOpen()
  const currentRouteName = useNavigationState(state =>
    state ? getCurrentRoute(state).name : 'Home',
  )
  const isMessagesConversation = currentRouteName === 'MessagesConversation'
  const hideBarForOverlay =
    hasOpenDialog ||
    composerOpen ||
    lightboxOpen ||
    drawerOpen ||
    isMessagesConversation
  const {width: windowWidth} = useWindowDimensions()
  const isCompactLoggedOut = windowWidth < 380
  const t = useTheme()
  const footerMinimalShellTransform = useMinimalShellFooterTransform()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const closeAllActiveElements = useCloseAllActiveElements()
  const {footerHeight} = useShellLayout()
  const hideBorder = useHideBottomBarBorder()
  const iconWidth = 24

  const unreadMessageCount = useUnreadMessageCount()
  const notificationCountStr = useUnreadNotifications()
  const hasHomeBadge = useHomeBadge()
  const ax = useAnalytics()
  const aa = useAgeAssurance()

  const showSignIn = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'none'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const showCreateAccount = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'new'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  return (
    <>
      {!hideBarForOverlay && (
        <Animated.View
          role="navigation"
          style={[
            styles.bottomBar,
            styles.bottomBarWeb,
            a.overflow_hidden,
            t.atoms.bg,
            {zIndex: 30, width: '100%', maxWidth: '100%'},
            hideBorder && hasSession
              ? {borderColor: t.atoms.bg.backgroundColor}
              : t.atoms.border_contrast_low,
            footerMinimalShellTransform,
          ]}
          onLayout={event => footerHeight.set(event.nativeEvent.layout.height)}>
          {hasSession ? (
            <>
              <NavItem
                testID="bottomBarHomeBtn"
                routeName="Home"
                label="Home"
                href="/"
                navItem="home"
                hasNew={hasHomeBadge && isFollowingV2HomeDotEnabled(ax)}>
                {({isActive}) => {
                  const Icon = isActive ? HomeFilled : Home
                  return (
                    <Icon
                      aria-hidden={true}
                      width={iconWidth + 1}
                      style={[styles.ctrlIcon, t.atoms.text, styles.homeIcon]}
                    />
                  )
                }}
              </NavItem>
              <NavItem
                testID="bottomBarSearchBtn"
                routeName="Search"
                label="Search"
                href="/search"
                navItem="search">
                {({isActive}) => {
                  const Icon = isActive ? MagnifyingGlassFilled : MagnifyingGlass
                  return (
                    <Icon
                      aria-hidden={true}
                      width={iconWidth + 2}
                      style={[styles.ctrlIcon, t.atoms.text, styles.searchIcon]}
                    />
                  )
                }}
              </NavItem>
              <NavItem
                testID="bottomBarQuantyBtn"
                routeName="Quanty"
                label="Quanty"
                href="/quanty"
                navItem="quanty">
                {({isActive}) => (
                  <Sparkle
                    aria-hidden={true}
                    width={iconWidth}
                    style={[
                      styles.ctrlIcon,
                      isActive ? {color: '#1D9BF0'} : t.atoms.text,
                    ]}
                  />
                )}
              </NavItem>
              <NavItem
                testID="bottomBarNotificationsBtn"
                routeName="Notifications"
                label="Notifications"
                href="/notifications"
                navItem="notifications"
                notificationCount={notificationCountStr}>
                {({isActive}) => {
                  const Icon = isActive ? BellFilled : Bell
                  return (
                    <Icon
                      aria-hidden={true}
                      width={iconWidth}
                      style={[styles.ctrlIcon, t.atoms.text, styles.bellIcon]}
                    />
                  )
                }}
              </NavItem>
              <NavItem
                testID="bottomBarMessagesBtn"
                routeName="Messages"
                label="Chat"
                href="/messages"
                navItem="chat"
                notificationCount={
                  aa.flags.chatDisabled
                    ? undefined
                    : unreadMessageCount.numUnread
                }
                hasNew={
                  aa.flags.chatDisabled ? false : unreadMessageCount.hasNew
                }>
                {({isActive}) => {
                  const Icon = isActive ? MessageFilled : Message
                  return (
                    <Icon
                      aria-hidden={true}
                      width={iconWidth - 1}
                      style={[
                        styles.ctrlIcon,
                        t.atoms.text,
                        styles.messagesIcon,
                      ]}
                    />
                  )
                }}
              </NavItem>
            </>
          ) : (
            <View
              style={[
                a.w_full,
                a.flex_row,
                a.align_center,
                a.justify_between,
                {
                  gap: isCompactLoggedOut ? 6 : 8,
                  paddingVertical: 8,
                  paddingHorizontal: isCompactLoggedOut ? 8 : 12,
                },
              ]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  {gap: isCompactLoggedOut ? 6 : 8, flexShrink: 1, minWidth: 0},
                ]}>
                <Logo allowVariants={false} width={26} />
                {!isCompactLoggedOut && (
                  <View style={{paddingTop: 2}}>
                    <Logotype width={74} fill={t.atoms.text.color} />
                  </View>
                )}
                <Link
                  href="/quanty"
                  navigationAction="navigate"
                  aria-role="link"
                  aria-label="Open Quanty"
                  accessible={true}
                  onBeforePress={() =>
                    ax.metric('nav:click', {
                      item: 'quanty',
                      surface: 'bottomBar',
                    })
                  }
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_center,
                    a.rounded_full,
                    {
                      width: 32,
                      height: 32,
                      backgroundColor: t.palette.contrast_25,
                      borderWidth: 1,
                      borderColor: t.palette.contrast_100,
                    },
                  ]}>
                  <Sparkle
                    aria-hidden={true}
                    width={16}
                    style={t.atoms.text}
                  />
                </Link>
              </View>

              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  {gap: 6, flexShrink: 0},
                ]}>
                <Button
                  onPress={showCreateAccount}
                  label={_(msg`Create account`)}
                  size="small"
                  variant="solid"
                  color="primary"
                  style={
                    isCompactLoggedOut ? {paddingHorizontal: 10} : undefined
                  }>
                  <ButtonText numberOfLines={1}>
                    <Trans>Create account</Trans>
                  </ButtonText>
                </Button>
                <Button
                  onPress={showSignIn}
                  label={_(msg`Sign in`)}
                  size="small"
                  variant="solid"
                  color="secondary"
                  style={
                    isCompactLoggedOut ? {paddingHorizontal: 10} : undefined
                  }>
                  <ButtonText numberOfLines={1}>
                    <Trans>Sign in</Trans>
                  </ButtonText>
                </Button>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </>
  )
}

const NavItem: React.FC<{
  children: (props: {isActive: boolean}) => React.ReactNode
  href: string
  routeName: string
  label: string
  navItem: NavItemValue
  testID?: string
  hasNew?: boolean
  notificationCount?: string
  onLongPress?: () => void
}> = ({
  children,
  href,
  routeName,
  label,
  navItem,
  testID,
  hasNew,
  notificationCount,
  onLongPress,
}) => {
  const t = useTheme()
  const {_} = useLingui()
  const ax = useAnalytics()
  const currentRoute = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })

  const onBeforePress = useCallback(() => {
    ax.metric('nav:click', {item: navItem, surface: 'bottomBar'})
  }, [ax, navItem])

  const isActive = isTab(currentRoute.name, routeName)

  return (
    <Link
      testID={testID}
      href={href}
      style={[styles.ctrl, a.pb_lg, {minWidth: 0}]}
      navigationAction="navigate"
      aria-role="link"
      aria-label={label}
      accessible={true}
      onBeforePress={onBeforePress}
      onLongPress={onLongPress}>
      {children({isActive})}
      {notificationCount ? (
        <View
          style={[
            styles.notificationCount,
            styles.notificationCountWeb,
            {backgroundColor: t.palette.primary_500},
          ]}
          aria-label={_(
            msg`${plural(notificationCount, {
              one: '# unread item',
              other: '# unread items',
            })}`,
          )}>
          <Text style={styles.notificationCountLabel}>{notificationCount}</Text>
        </View>
      ) : hasNew ? (
        <View
          style={[styles.hasNewBadge, {backgroundColor: t.palette.primary_500}]}
        />
      ) : null}
    </Link>
  )
}
