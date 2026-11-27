import {type JSX, useCallback} from 'react'
import {type GestureResponderEvent, View} from 'react-native'
import Animated from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {plural} from '@lingui/core/macro'
import {Trans, useLingui} from '@lingui/react/macro'
import {type BottomTabBarProps} from '@react-navigation/bottom-tabs'
import {StackActions, useNavigationState} from '@react-navigation/native'

import {PressableScale} from '#/lib/custom-animations/PressableScale'
import {useHaptics} from '#/lib/haptics'
import {useDedupe} from '#/lib/hooks/useDedupe'
import {useHideBottomBarBorder} from '#/lib/hooks/useHideBottomBarBorder'
import {useMinimalShellFooterTransform} from '#/lib/hooks/useMinimalShellTransform'
import {useNavigationTabState} from '#/lib/hooks/useNavigationTabState'
import {clamp} from '#/lib/numbers'
import {getCurrentRoute, getTabState, TabState} from '#/lib/routes/helpers'
import {getCommonNavigationAction} from '#/lib/routes/navigation'
import {type SharedNavTab, TAB_TO_NAV_ITEM} from '#/lib/routes/tab-to-nav-item'
import {emitSoftReset} from '#/state/events'
import {useHomeBadge} from '#/state/home-badge'
import {useUnreadMessageCount} from '#/state/queries/messages/list-conversations'
import {useUpdateAllRead} from '#/state/queries/messages/update-all-read'
import {useUnreadNotifications} from '#/state/queries/notifications/unread'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useShellLayout} from '#/state/shell/shell-layout'
import {useCloseAllActiveElements} from '#/state/util'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {GlassView} from '#/components/GlassView'
import {
  Bell_Filled_Corner0_Rounded as BellFilled,
  Bell_Stroke2_Corner0_Rounded as Bell,
} from '#/components/icons/Bell'
import {CircleCheck_Stroke2_Corner0_Rounded as CircleCheckIcon} from '#/components/icons/CircleCheck'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilled,
  HomeOpen_Stoke2_Corner0_Rounded as Home,
} from '#/components/icons/HomeOpen'
import {Inbox_Stroke2_Corner2_Rounded as InboxIcon} from '#/components/icons/Inbox'
import {
  MagnifyingGlass_Filled_Stroke2_Corner0_Rounded as MagnifyingGlassFilled,
  MagnifyingGlass_Stroke2_Corner0_Rounded as MagnifyingGlass,
} from '#/components/icons/MagnifyingGlass'
import {
  Message_Stroke2_Corner0_Rounded as Message,
  Message_Stroke2_Corner0_Rounded_Filled as MessageFilled,
} from '#/components/icons/Message'
import {Sparkle_Stroke2_Corner0_Rounded as Sparkle} from '#/components/icons/Sparkle'
import * as Menu from '#/components/Menu'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAgeAssurance} from '#/ageAssurance'
import {useAnalytics} from '#/analytics'
import {isFollowingV2HomeDotEnabled} from '#/features/followingV2/eligibility'
import {styles} from './BottomBarStyles'

export function BottomBar({navigation}: BottomTabBarProps) {
  const {hasSession} = useSession()
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const safeAreaInsets = useSafeAreaInsets()
  const {footerHeight} = useShellLayout()
  const {isAtHome, isAtSearch, isAtNotifications, isAtMessages} =
    useNavigationTabState()
  const currentRouteName = useNavigationState(state =>
    state ? getCurrentRoute(state).name : 'Home',
  )
  const isAtQuanty = currentRouteName === 'Quanty'
  const isAtCommonRoute = isAtQuanty
  const isHomeActive = isAtHome && !isAtCommonRoute
  const isSearchActive = isAtSearch && !isAtCommonRoute
  const isNotificationsActive = isAtNotifications && !isAtCommonRoute
  const isMessagesActive = isAtMessages && !isAtCommonRoute
  const numUnreadNotifications = useUnreadNotifications()
  const numUnreadMessages = useUnreadMessageCount()
  const hasHomeBadge = useHomeBadge()
  const aa = useAgeAssurance()
  const footerMinimalShellTransform = useMinimalShellFooterTransform()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const closeAllActiveElements = useCloseAllActiveElements()
  const dedupe = useDedupe()
  const messagesMenuControl = Menu.useMenuControl()
  const haptics = useHaptics()
  const hideBorder = useHideBottomBarBorder()
  const iconWidth = 24

  const frostedGlassBg =
    t.name === 'dim'
      ? 'rgba(21, 32, 43, 0.82)'
      : t.name === 'dark' || t.scheme === 'dark'
        ? 'rgba(0, 0, 0, 0.78)'
        : 'rgba(255, 255, 255, 0.85)'

  const frostedBorderColor =
    t.name === 'dim'
      ? '#38444D'
      : t.name === 'dark' || t.scheme === 'dark'
        ? '#2F3336'
        : t.atoms.border_contrast_low.borderColor || '#EFF3F4'

  const showSignIn = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'none'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const showCreateAccount = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'new'})
    // setShowLoggedOut(true)
  }, [requestSwitchToAccount, closeAllActiveElements])

  const onPressTab = useCallback(
    (tab: SharedNavTab) => {
      ax.metric('nav:click', {
        item: TAB_TO_NAV_ITEM[tab],
        surface: 'bottomBar',
      })
      const state = navigation.getState()
      const tabState = getTabState(state, tab)
      if (tabState === TabState.InsideAtRoot) {
        emitSoftReset()
      } else if (tabState === TabState.Inside) {
        // find the correct navigator in which to pop-to-top
        const target = state.routes.find(route => route.name === `${tab}Tab`)
          ?.state?.key
        dedupe(() => {
          if (target) {
            // if we found it, trigger pop-to-top
            navigation.dispatch({
              ...StackActions.popToTop(),
              target,
            })
          } else {
            // fallback: reset navigation
            navigation.reset({
              index: 0,
              routes: [{name: `${tab}Tab`}],
            })
          }
        })
      } else {
        dedupe(() => navigation.navigate(`${tab}Tab`))
      }
    },
    [navigation, dedupe, ax],
  )
  const onPressHome = useCallback(() => onPressTab('Home'), [onPressTab])
  const onPressSearch = useCallback(() => onPressTab('Search'), [onPressTab])
  const onPressQuanty = useCallback(() => {
    ax.metric('nav:click', {
      item: 'quanty',
      surface: 'bottomBar',
    })
    if (isAtQuanty) {
      emitSoftReset()
      return
    }
    dedupe(() =>
      navigation.dispatch(
        getCommonNavigationAction(
          {name: 'Quanty', params: undefined},
          navigation.getState(),
        ),
      ),
    )
  }, [ax, dedupe, isAtQuanty, navigation])
  const onPressNotifications = useCallback(
    () => onPressTab('Notifications'),
    [onPressTab],
  )
  const onPressMessages = useCallback(() => {
    onPressTab('Messages')
  }, [onPressTab])

  const onLongPressMessages = useCallback(() => {
    if (aa.flags.chatDisabled) return
    haptics.longPress()
    messagesMenuControl.open()
  }, [aa.flags.chatDisabled, messagesMenuControl, haptics])

  return (
    <>
      <MessagesTabMenu control={messagesMenuControl} />
      <Animated.View
        style={[
          styles.bottomBar,
          {
            backgroundColor: frostedGlassBg,
            borderTopColor: hideBorder ? 'transparent' : frostedBorderColor,
          },
          web({
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }),
          {paddingBottom: clamp(safeAreaInsets.bottom, 15, 60)},
          footerMinimalShellTransform,
        ]}
        onLayout={e => {
          footerHeight.set(e.nativeEvent.layout.height)
        }}>
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          tintColor={frostedGlassBg}
          style={[a.absolute, a.inset_0]}
          fallbackStyle={{backgroundColor: frostedGlassBg}}
        />
        {hasSession ? (
          <>
            <Btn
              testID="bottomBarHomeBtn"
              icon={
                isHomeActive ? (
                  <HomeFilled
                    width={iconWidth + 1}
                    style={[styles.ctrlIcon, t.atoms.text, styles.homeIcon]}
                  />
                ) : (
                  <Home
                    width={iconWidth + 1}
                    style={[styles.ctrlIcon, t.atoms.text, styles.homeIcon]}
                  />
                )
              }
              hasNew={hasHomeBadge && isFollowingV2HomeDotEnabled(ax)}
              onPress={onPressHome}
              accessibilityRole="tab"
              accessibilityLabel={l`Home`}
              accessibilityHint=""
            />
            <Btn
              testID="bottomBarSearchBtn"
              icon={
                isSearchActive ? (
                  <MagnifyingGlassFilled
                    width={iconWidth + 2}
                    style={[styles.ctrlIcon, t.atoms.text, styles.searchIcon]}
                  />
                ) : (
                  <MagnifyingGlass
                    width={iconWidth + 2}
                    style={[styles.ctrlIcon, t.atoms.text, styles.searchIcon]}
                  />
                )
              }
              onPress={onPressSearch}
              accessibilityRole="search"
              accessibilityLabel={l`Explore`}
              accessibilityHint=""
            />
            <Btn
              testID="bottomBarQuantyBtn"
              icon={
                <Sparkle
                  width={iconWidth}
                  style={[
                    styles.ctrlIcon,
                    isAtQuanty ? {color: '#1D9BF0'} : t.atoms.text,
                  ]}
                />
              }
              onPress={onPressQuanty}
              accessibilityRole="tab"
              accessibilityLabel={l`Quanty`}
              accessibilityHint=""
            />
            <Btn
              testID="bottomBarNotificationsBtn"
              icon={
                isNotificationsActive ? (
                  <BellFilled
                    width={iconWidth}
                    style={[styles.ctrlIcon, t.atoms.text, styles.bellIcon]}
                  />
                ) : (
                  <Bell
                    width={iconWidth}
                    style={[styles.ctrlIcon, t.atoms.text, styles.bellIcon]}
                  />
                )
              }
              onPress={onPressNotifications}
              notificationCount={numUnreadNotifications}
              accessible={true}
              accessibilityRole="tab"
              accessibilityLabel={l`Notifications`}
              accessibilityHint={
                numUnreadNotifications === ''
                  ? ''
                  : l({
                      message: plural(numUnreadNotifications ?? 0, {
                        one: '# unread item',
                        other: '# unread items',
                      }),
                    })
              }
            />
            <Btn
              testID="bottomBarMessagesBtn"
              icon={
                isMessagesActive ? (
                  <MessageFilled
                    width={iconWidth - 1}
                    style={[styles.ctrlIcon, t.atoms.text, styles.feedsIcon]}
                  />
                ) : (
                  <Message
                    width={iconWidth - 1}
                    style={[styles.ctrlIcon, t.atoms.text, styles.feedsIcon]}
                  />
                )
              }
              onPress={onPressMessages}
              onLongPress={onLongPressMessages}
              notificationCount={
                aa.flags.chatDisabled ? undefined : numUnreadMessages.numUnread
              }
              hasNew={aa.flags.chatDisabled ? false : numUnreadMessages.hasNew}
              accessible={true}
              accessibilityRole="tab"
              accessibilityLabel={l`Chat`}
              accessibilityHint={
                !aa.flags.chatDisabled && numUnreadMessages.count > 0
                  ? numUnreadMessages.numUnread?.includes('+')
                    ? l({
                        message: `${numUnreadMessages.numUnread} unread items`,
                        comment:
                          'Accessibility hint for the bottom bar chat icon when the number of unread messages exceeds the cap, with the + symbol already included – for example, 99+ unread items',
                      })
                    : l({
                        message: plural(numUnreadMessages.numUnread ?? 0, {
                          one: '# unread item',
                          other: '# unread items',
                        }),
                      })
                  : ''
              }
            />
          </>
        ) : (
          <>
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 14,
                paddingBottom: 2,
                paddingLeft: 14,
                paddingRight: 6,
                gap: 8,
              }}>
              <View
                style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Logo allowVariants={false} width={28} />
                <View style={{paddingTop: 4}}>
                  <Logotype width={80} fill={t.atoms.text.color} />
                </View>
              </View>

              <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
                <Button
                  onPress={showCreateAccount}
                  label={l`Create account`}
                  size="small"
                  color="primary">
                  <ButtonText>
                    <Trans>Create account</Trans>
                  </ButtonText>
                </Button>
                <Button
                  onPress={showSignIn}
                  label={l`Sign in`}
                  size="small"
                  color="secondary">
                  <ButtonText>
                    <Trans>Sign in</Trans>
                  </ButtonText>
                </Button>
              </View>
            </View>
          </>
        )}
      </Animated.View>
    </>
  )
}

interface BtnProps extends Pick<
  React.ComponentProps<typeof PressableScale>,
  | 'accessible'
  | 'accessibilityRole'
  | 'accessibilityHint'
  | 'accessibilityLabel'
> {
  testID?: string
  icon: JSX.Element
  notificationCount?: string
  hasNew?: boolean
  onPress?: (event: GestureResponderEvent) => void
  onLongPress?: (event: GestureResponderEvent) => void
}

function Btn({
  testID,
  icon,
  hasNew,
  notificationCount,
  onPress,
  onLongPress,
  accessible,
  accessibilityHint,
  accessibilityLabel,
}: BtnProps) {
  const t = useTheme()

  return (
    <PressableScale
      testID={testID}
      style={[styles.ctrl, a.flex_1, {minWidth: 0}]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      targetScale={0.8}
      accessibilityLargeContentTitle={accessibilityLabel}
      accessibilityShowsLargeContentViewer>
      {icon}
      {notificationCount ? (
        <View
          style={[
            styles.notificationCount,
            a.rounded_full,
            {backgroundColor: t.palette.primary_500},
          ]}>
          <Text
            style={styles.notificationCountLabel}
            maxFontSizeMultiplier={1.5}>
            {notificationCount}
          </Text>
        </View>
      ) : hasNew ? (
        <View
          style={[styles.hasNewBadge, {backgroundColor: t.palette.primary_500}]}
        />
      ) : null}
    </PressableScale>
  )
}

function MessagesTabMenu({control}: {control: Menu.MenuControlProps}) {
  const {t: l} = useLingui()

  const {mutate: markAllChatsRead} = useUpdateAllRead('accepted', {
    onMutate: () => {
      Toast.show(l`Marked all chats as read`, {type: 'success'})
    },
    onError: () => {
      Toast.show(l`Failed to mark all chats as read`, {type: 'error'})
    },
  })

  const {mutate: markAllRequestsRead} = useUpdateAllRead('request', {
    onMutate: () => {
      Toast.show(l`Marked all requests as read`, {type: 'success'})
    },
    onError: () => {
      Toast.show(l`Failed to mark all requests as read`, {type: 'error'})
    },
  })

  return (
    <Menu.Root control={control}>
      <Menu.Outer showCancel>
        <Menu.Group>
          <Menu.Item
            label={l`Mark all chats as read`}
            onPress={() => markAllChatsRead()}>
            <Menu.ItemIcon icon={CircleCheckIcon} />
            <Menu.ItemText>
              <Trans>Mark all chats as read</Trans>
            </Menu.ItemText>
          </Menu.Item>
          <Menu.Item
            label={l`Mark all requests as read`}
            onPress={() => markAllRequestsRead()}>
            <Menu.ItemIcon icon={InboxIcon} />
            <Menu.ItemText>
              <Trans>Mark all requests as read</Trans>
            </Menu.ItemText>
          </Menu.Item>
        </Menu.Group>
      </Menu.Outer>
    </Menu.Root>
  )
}
