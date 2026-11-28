import {useCallback, useMemo, useState} from 'react'
import {
  type GestureResponderEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {PlatformInfo} from '@bsky.app/expo-bluesky-swiss-army'
import {plural} from '@lingui/core/macro'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation, useNavigationState} from '@react-navigation/native'

import {UNREAD_NOTIFICATION_CAP} from '#/lib/constants'
import {useAccountSwitcher} from '#/lib/hooks/useAccountSwitcher'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  getCurrentRoute,
  getTabState,
  isCurrentProfileRoute,
  isTab,
  TabState,
} from '#/lib/routes/helpers'
import {makeProfileLink} from '#/lib/routes/links'
import {type SidebarTab} from '#/lib/routes/tab-to-nav-item'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {isInvalidHandle, sanitizeHandle} from '#/lib/strings/handles'
import {isBrowserNonStandaloneWeb} from '#/platform/detection'
import {emitSoftReset} from '#/state/events'
import {useHomeBadge} from '#/state/home-badge'
import {useFetchHandle} from '#/state/queries/handle'
import {useUnreadMessageCount} from '#/state/queries/messages/list-conversations'
import {useModerationInboxUnreadCountQuery} from '#/state/queries/moderation-inbox'
import {useUnreadNotifications} from '#/state/queries/notifications/unread'
import {useProfilesQuery} from '#/state/queries/profile'
import {
  type SessionAccount,
  useRequireAuth,
  useSession,
  useSessionApi,
} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useCloseAllActiveElements} from '#/state/util'
import {LoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {PressableWithHover} from '#/view/com/util/PressableWithHover'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {Logo} from '#/view/icons/Logo'
import {NavSignupCard} from '#/view/shell/NavSignupCard'
import {
  atoms as a,
  native,
  tokens,
  useBreakpoints,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {BetaTag} from '#/components/BetaTag'
import {Button, ButtonText} from '#/components/Button'
import {type DialogControlProps} from '#/components/Dialog'
import {ArrowBoxLeft_Stroke2_Corner0_Rounded as LeaveIcon} from '#/components/icons/Arrow'
import {
  Bell_Filled_Corner0_Rounded as BellFilledIcon,
  Bell_Stroke2_Corner0_Rounded as BellIcon,
} from '#/components/icons/Bell'
import {
  Bookmark_Filled_Corner0_Rounded as BookmarkFilledIcon,
  Bookmark_Stroke2_Corner0_Rounded as BookmarkIcon,
} from '#/components/icons/Bookmark'
import {
  BulletList_Filled_Corner0_Rounded as ListFilledIcon,
  BulletList_Stroke2_Corner0_Rounded as ListIcon,
} from '#/components/icons/BulletList'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {DotGrid3x1_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {Download_Stroke2_Corner0_Rounded as DownloadIcon} from '#/components/icons/Download'
import {EditBig_Stroke2_Corner2_Rounded as EditBigIcon} from '#/components/icons/EditBig'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilledIcon,
  HomeOpen_Stroke2_Corner0_Rounded as HomeIcon,
} from '#/components/icons/Home'
import {
  MagnifyingGlass_Filled_Stroke2_Corner0_Rounded as MagnifyingGlassFilledIcon,
  MagnifyingGlass_Stroke2_Corner0_Rounded as MagnifyingGlassIcon,
} from '#/components/icons/MagnifyingGlass'
import {
  Message_Stroke2_Corner0_Rounded as MessageIcon,
  Message_Stroke2_Corner0_Rounded_Filled as MessageFilledIcon,
} from '#/components/icons/Message'
import {Newspaper_Stroke2_Corner2_Rounded as NewspaperIcon} from '#/components/icons/Newspaper'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {
  SettingsGear2_Filled_Corner0_Rounded as SettingsFilledIcon,
  SettingsGear2_Stroke2_Corner0_Rounded as SettingsIcon,
} from '#/components/icons/Settings'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {StreamingLive_Stroke2_Corner0_Rounded as StreamingLiveIcon} from '#/components/icons/StreamingLive'
import {
  UserCircle_Filled_Corner0_Rounded as UserCircleFilledIcon,
  UserCircle_Stroke2_Corner0_Rounded as UserCircleIcon,
} from '#/components/icons/UserCircle'
import {Verified_Stroke2_Corner2_Rounded as VerifiedIcon} from '#/components/icons/Verified'
import {
  CENTER_COLUMN_OFFSET,
  CENTER_COLUMN_WIDTH,
} from '#/components/Layout/const'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {useAgeAssurance} from '#/ageAssurance'
import {useAnalytics} from '#/analytics'
import {type Events} from '#/analytics/metrics/types'
import {IS_IOS, IS_NATIVE, IS_WEB} from '#/env'
import {isFollowingV2HomeDotEnabled} from '#/features/followingV2/eligibility'
import {useActorStatus} from '#/features/liveNow'
import {type app} from '#/lexicons'
import {router} from '#/routes'
import {getComposeButtonLayout} from './composeButtonLayout'

const LARGE_ELEMENT_SIZE = 44
const NAV_ICON_WIDTH = 26
const NAV_ITEM_TO_TAB: Partial<
  Record<Events['nav:click']['item'], SidebarTab>
> = {
  home: 'Home',
  search: 'Search',
  chat: 'Messages',
  notifications: 'Notifications',
  profile: 'MyProfile',
  atmosphere: 'Atmosphere',
  feeds: 'Feeds',
  lists: 'Lists',
  saved: 'Bookmarks',
  settings: 'Settings',
}

export const LEFT_NAV_STANDARD_WIDTH = 240
export const LEFT_NAV_MINIMAL_WIDTH = 80

function BrandLogoHeader({
  minimal,
  onNavigateTab,
}: {
  minimal: boolean
  onNavigateTab?: (tab: SidebarTab) => void
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const navigationState = useNavigationState(state => state)
  const currentRouteInfo = getCurrentRoute(navigationState)
  const isHome = isTab(currentRouteInfo.name, 'Home')

  const onPress = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      e.preventDefault?.()
      if (onNavigateTab) {
        onNavigateTab('Home')
        return
      }
      if (isHome) {
        emitSoftReset()
      } else {
        const [screen, params] = router.matchPath('/')
        // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
        navigation.navigate(screen, params, {pop: true})
      }
    },
    [isHome, navigation, onNavigateTab],
  )

  return (
    <View
      style={[
        a.pb_xs,
        minimal ? a.align_center : [a.align_start, {paddingLeft: 4}],
      ]}>
      <PressableWithHover
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          a.transition_color,
          {width: 48, height: 48},
        ]}
        hoverStyle={t.atoms.bg_contrast_25}
        // @ts-expect-error the function signature differs on web -prf
        onPress={onPress}
        href="/"
        dataSet={{noUnderline: 1}}
        role="link"
        accessibilityLabel="QuantZing Home"
        accessibilityHint="">
        <Logo allowVariants={false} width={32} />
      </PressableWithHover>
    </View>
  )
}

function ProfileCard({minimal}: {minimal: boolean}) {
  const {currentAccount, accounts} = useSession()
  const {logoutEveryAccount} = useSessionApi()
  const {isLoading, data} = useProfilesQuery({
    handles: accounts.map(acc => acc.did),
  })
  const profiles = data?.profiles
  const signOutPromptControl = Prompt.usePromptControl()
  const {t: l} = useLingui()
  const t = useTheme()

  const profile = profiles?.find(p => p.did === currentAccount!.did)
  const otherAccounts = accounts
    .filter(acc => acc.did !== currentAccount!.did)
    .map(account => ({
      account,
      profile: profiles?.find(p => p.did === account.did),
    }))

  const {isActive: live} = useActorStatus(profile)

  return (
    <View style={[a.pt_sm, !minimal && [a.w_full, a.align_start]]}>
      {!isLoading && profile ? (
        <Menu.Root>
          <Menu.Trigger label={l`Switch accounts`}>
            {({props, state, control}) => {
              const active = state.hovered || state.focused || control.isOpen
              return (
                <Button
                  label={props.accessibilityLabel}
                  {...props}
                  style={[
                    a.w_full,
                    a.transition_color,
                    active ? t.atoms.bg_contrast_25 : a.transition_delay_50ms,
                    a.rounded_full,
                    a.justify_between,
                    a.align_center,
                    a.flex_row,
                    {gap: 10, paddingVertical: 8},
                    !minimal && [a.px_sm],
                  ]}>
                  <View
                    style={[
                      !PlatformInfo.getIsReducedMotionEnabled() && [
                        a.transition_transform,
                        {transitionDuration: '200ms'},
                      ],
                      a.relative,
                      a.z_10,
                    ]}>
                    <UserAvatar
                      avatar={profile.avatar}
                      size={LARGE_ELEMENT_SIZE}
                      type={profile?.associated?.labeler ? 'labeler' : 'user'}
                      live={live}
                    />
                  </View>
                  {!minimal && (
                    <>
                      <View style={[a.flex_1]}>
                        <Text
                          emoji
                          style={[a.font_bold, a.text_sm, a.leading_snug]}
                          numberOfLines={1}>
                          {sanitizeDisplayName(
                            profile.displayName || profile.handle,
                          )}
                        </Text>
                        <Text
                          style={[
                            a.text_xs,
                            a.leading_snug,
                            t.atoms.text_contrast_medium,
                          ]}
                          numberOfLines={1}>
                          {sanitizeHandle(profile.handle, '@')}
                        </Text>
                      </View>
                      <EllipsisIcon
                        aria-hidden={true}
                        style={[t.atoms.text_contrast_medium]}
                        size="sm"
                      />
                    </>
                  )}
                </Button>
              )
            }}
          </Menu.Trigger>
          <SwitchMenuItems
            accounts={otherAccounts}
            signOutPromptControl={signOutPromptControl}
          />
        </Menu.Root>
      ) : (
        <LoadingPlaceholder
          width={LARGE_ELEMENT_SIZE}
          height={LARGE_ELEMENT_SIZE}
          style={[a.rounded_full, !minimal && a.ml_sm]}
        />
      )}
      <Prompt.Basic
        control={signOutPromptControl}
        title={l`Sign out?`}
        description={l`You will be signed out of all your accounts.`}
        onConfirm={() => logoutEveryAccount('Settings')}
        confirmButtonCta={l`Sign out`}
        cancelButtonCta={l`Cancel`}
        confirmButtonColor="negative"
      />
    </View>
  )
}

function SwitchMenuItems({
  accounts,
  signOutPromptControl,
}: {
  accounts:
    | {
        account: SessionAccount
        profile?: app.bsky.actor.defs.ProfileViewDetailed
      }[]
    | undefined
  signOutPromptControl: DialogControlProps
}) {
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const {onPressSwitchAccount, pendingDid} = useAccountSwitcher()
  const navigation = useNavigation<NavigationProp>()
  const {control} = Menu.useMenuContext()
  const currentRouteInfo = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })
  const profileLink = currentAccount ? makeProfileLink(currentAccount) : '/'
  const isCurrent = isCurrentProfileRoute({
    routeName: currentRouteInfo.name,
    profileName:
      currentRouteInfo.name === 'Profile'
        ? (currentRouteInfo.params as CommonNavigatorParams['Profile']).name
        : undefined,
    currentHandle: currentAccount?.handle,
  })
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const closeEverything = useCloseAllActiveElements()

  const onAddAnotherAccount = () => {
    setShowLoggedOut(true)
    closeEverything()
  }

  const onProfilePress = (e: GestureResponderEvent) => {
    if (IS_WEB) {
      const mouseEvent = e as unknown as React.MouseEvent<
        HTMLAnchorElement,
        MouseEvent
      >
      if (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.altKey) {
        return
      }
      mouseEvent.preventDefault()
    }

    const onNavigate = () => {
      if (isCurrent) {
        emitSoftReset()
      } else {
        const [screen, params] = router.matchPath(profileLink)
        // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
        navigation.navigate(screen, params, {pop: true})
      }
    }

    if (IS_IOS) {
      onNavigate()
    } else if (IS_NATIVE) {
      control.close()
      onNavigate()
    } else {
      control.close(onNavigate)
    }
  }

  return (
    <Menu.Outer>
      {accounts && accounts.length > 0 && (
        <>
          <Menu.LabelText>
            <Trans>Switch account</Trans>
          </Menu.LabelText>
          <Menu.Group>
            {/* Native groups require Menu.Item as a direct child. */}
            {accounts.map(({account, profile}) => (
              <Menu.Item
                key={account.did}
                disabled={!!pendingDid}
                style={[a.gap_sm, {minWidth: 150}]}
                label={l`Switch to ${sanitizeHandle(
                  profile?.handle ?? account.handle,
                  '@',
                )}`}
                onPress={() =>
                  void onPressSwitchAccount(account, 'SwitchAccount')
                }>
                <SwitchMenuItemAvatar profile={profile} />
                <Menu.ItemText>
                  {sanitizeHandle(profile?.handle ?? account.handle, '@')}
                </Menu.ItemText>
              </Menu.Item>
            ))}
          </Menu.Group>
          <Menu.Divider />
        </>
      )}
      <Menu.Group>
        <Menu.Item
          label={l`Go to profile`}
          onPress={onProfilePress}
          // @ts-expect-error href is web-only -prf
          href={profileLink}>
          <Menu.ItemIcon icon={UserCircleIcon} />
          <Menu.ItemText>
            <Trans>Go to profile</Trans>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item label={l`Add another account`} onPress={onAddAnotherAccount}>
          <Menu.ItemIcon icon={PlusIcon} />
          <Menu.ItemText>
            <Trans>Add another account</Trans>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item label={l`Sign out`} onPress={signOutPromptControl.open}>
          <Menu.ItemIcon icon={LeaveIcon} />
          <Menu.ItemText>
            <Trans>Sign out</Trans>
          </Menu.ItemText>
        </Menu.Item>
      </Menu.Group>
    </Menu.Outer>
  )
}

function SwitchMenuItemAvatar({
  profile,
}: {
  profile: app.bsky.actor.defs.ProfileViewDetailed | undefined
}) {
  const {isActive: live} = useActorStatus(profile)

  return (
    <View>
      <UserAvatar
        avatar={profile?.avatar}
        size={20}
        type={profile?.associated?.labeler ? 'labeler' : 'user'}
        live={live}
        hideLiveBadge
      />
    </View>
  )
}

interface NavItemProps {
  beta?: boolean
  tag?: string
  count?: string
  exactMatch?: boolean
  hasNew?: boolean
  href: string
  icons: {
    inactive: React.ComponentType<SVGIconProps>
    active: React.ComponentType<SVGIconProps>
  }
  label: string
  minimal: boolean
  navItem: Events['nav:click']['item']
  onNavigateTab?: (tab: SidebarTab) => void
  testID?: string
}
function NavItem({
  beta,
  tag,
  count,
  exactMatch = false,
  hasNew,
  href,
  icons,
  label,
  minimal,
  navItem,
  onNavigateTab,
  testID,
}: NavItemProps) {
  const t = useTheme()
  const {t: l} = useLingui()
  const accessibilityLabel = tag
    ? `${label}, ${tag}`
    : beta
      ? `${label}, Beta`
      : label
  const ax = useAnalytics()
  const {currentAccount} = useSession()

  const [pathName] = useMemo(() => router.matchPath(href), [href])
  const navigationState = useNavigationState(state => state)
  const currentRouteInfo = getCurrentRoute(navigationState)
  const tab = NAV_ITEM_TO_TAB[navItem]
  const isCurrent =
    navItem === 'profile'
      ? isCurrentProfileRoute({
          routeName: currentRouteInfo.name,
          profileName:
            currentRouteInfo.name === 'Profile'
              ? (currentRouteInfo.params as CommonNavigatorParams['Profile'])
                  .name
              : undefined,
          currentHandle: currentAccount?.handle,
        })
      : isTab(currentRouteInfo.name, pathName)
  const isSelected =
    IS_NATIVE && tab
      ? getTabState(navigationState, tab) !== TabState.Outside
      : isCurrent
  const isRelated = exactMatch
    ? false
    : currentRouteInfo.name.startsWith(pathName)
  const navigation = useNavigation<NavigationProp>()
  const onPressWrapped = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      ax.metric('nav:click', {item: navItem, surface: 'leftNav'})
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      e.preventDefault?.()
      if (tab && onNavigateTab) {
        onNavigateTab(tab)
        return
      }
      if (isCurrent) {
        emitSoftReset()
      } else {
        const [screen, params] = router.matchPath(href)
        // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
        navigation.navigate(screen, params, {pop: true})
      }
    },
    [navigation, href, isCurrent, ax, navItem, onNavigateTab, tab],
  )

  const Icon =
    isSelected || (!IS_NATIVE && isRelated) ? icons.active : icons.inactive

  return (
    <PressableWithHover
      testID={testID}
      style={[
        a.flex_row,
        a.align_center,
        a.rounded_full,
        a.gap_md,
        a.outline_inset_1,
        a.transition_color,
        minimal
          ? {padding: 10}
          : {
              paddingVertical: 8,
              paddingHorizontal: 14,
              alignSelf: 'flex-start',
            },
      ]}
      hoverStyle={t.atoms.bg_contrast_25}
      // @ts-expect-error the function signature differs on web -prf
      onPress={onPressWrapped}
      href={href}
      dataSet={{noUnderline: 1}}
      role="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={IS_NATIVE ? {selected: isSelected} : undefined}
      accessibilityHint="">
      <View
        style={[
          a.align_center,
          a.justify_center,
          {
            width: 26,
            height: 26,
          },
          a.z_10,
        ]}>
        <Icon
          aria-hidden={true}
          width={NAV_ICON_WIDTH}
          style={
            navItem === 'quanty' && isSelected
              ? {color: '#1D9BF0'}
              : t.atoms.text
          }
        />
        {typeof count === 'string' && count ? (
          <View
            style={[
              a.absolute,
              a.inset_0,
              {right: -20}, // more breathing room
            ]}>
            <Text
              accessibilityLabel={l`${plural(count, {
                one: '# unread item',
                other: '# unread items',
              })}`}
              accessibilityHint=""
              accessible={true}
              numberOfLines={1}
              style={[
                a.absolute,
                a.text_xs,
                a.font_semi_bold,
                a.rounded_full,
                a.text_center,
                a.leading_tight,
                a.z_20,
                {
                  top: '-10%',
                  left: count.length === 1 ? 12 : 8,
                  backgroundColor: '#1D9BF0',
                  color: t.palette.white,
                  lineHeight: a.text_sm.fontSize,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  minWidth: 16,
                },
              ]}>
              {count}
            </Text>
          </View>
        ) : hasNew || (minimal && tag) ? (
          <View
            style={[
              a.absolute,
              a.rounded_full,
              a.z_20,
              {
                backgroundColor: '#1D9BF0',
                width: 7,
                height: 7,
                right: -2,
                top: -3,
              },
            ]}
          />
        ) : null}
      </View>
      {!minimal && (
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text
            numberOfLines={1}
            style={[
              {fontSize: 19, lineHeight: 24},
              isSelected ? a.font_bold : a.font_normal,
            ]}>
            {label}
          </Text>
          {tag && (
            <View
              style={[
                a.rounded_full,
                {
                  backgroundColor: 'rgba(29, 155, 240, 0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(29, 155, 240, 0.35)',
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                },
              ]}>
              <Text
                style={[
                  a.font_bold,
                  {
                    color: '#1D9BF0',
                    fontSize: 10,
                    lineHeight: 14,
                    letterSpacing: 0.4,
                  },
                ]}>
                {tag}
              </Text>
            </View>
          )}
          {beta && <BetaTag />}
        </View>
      )}
    </PressableWithHover>
  )
}

function ComposeBtn({minimal}: {minimal: boolean}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const {getState} = useNavigation()
  const {openComposer} = useOpenComposer()
  const [isFetchingHandle, setIsFetchingHandle] = useState(false)
  const fetchHandle = useFetchHandle()

  const getProfileHandle = async () => {
    const routes = getState()?.routes
    const currentRoute = routes?.[routes?.length - 1]

    if (currentRoute?.name === 'Profile') {
      let handle: string | undefined = (
        currentRoute.params as CommonNavigatorParams['Profile']
      ).name

      if (handle.startsWith('did:')) {
        try {
          setIsFetchingHandle(true)
          handle = await fetchHandle(handle)
        } catch (e) {
          handle = undefined
        }
        setIsFetchingHandle(false)
      }

      if (
        !handle ||
        handle === currentAccount?.handle ||
        isInvalidHandle(handle)
      )
        return undefined

      return handle
    }

    return undefined
  }

  const onPressCompose = () => {
    requireAuth(async () => {
      openComposer({mention: await getProfileHandle(), logContext: 'Fab'})
    })
  }

  const layout = getComposeButtonLayout({minimal, isNative: IS_NATIVE})
  const isLight = t.name === 'light'
  const pillBg = isLight ? '#0F1419' : '#EFF3F4'
  const pillHoverBg = isLight ? '#272C30' : '#D7DBDC'
  const pillTextColor = isLight ? '#FFFFFF' : '#0F1419'

  return (
    <View style={layout.container}>
      <Button
        disabled={isFetchingHandle}
        label="Zing"
        onPress={onPressCompose}
        size="large"
        color="primary"
        hoverStyle={{backgroundColor: pillHoverBg}}
        style={[
          layout.button,
          minimal && {paddingHorizontal: 0, paddingVertical: 0},
          {backgroundColor: pillBg},
        ]}>
        {minimal ? (
          <EditBigIcon
            width={22}
            fill={pillTextColor}
            style={{color: pillTextColor}}
          />
        ) : (
          <ButtonText
            style={[
              a.font_bold,
              {
                color: pillTextColor,
                fontSize: 17,
                lineHeight: 20,
              },
            ]}>
            Zing
          </ButtonText>
        )}
      </Button>
    </View>
  )
}

const MORE_ROUTE_NAMES = [
  'Lists',
  'CreatorStudio',
  'QuantZingPro',
  'Settings',
  'Download',
] as const

function MoreMenuItems({
  hasSession,
  numUnreadModerationInbox,
  onNavigateTab,
}: {
  hasSession: boolean
  numUnreadModerationInbox?: string
  onNavigateTab?: (tab: SidebarTab) => void
}) {
  const t = useTheme()
  const ax = useAnalytics()
  const navigation = useNavigation<NavigationProp>()
  const {control} = Menu.useMenuContext()
  const currentRouteInfo = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })
  const showGetApp = IS_WEB && isBrowserNonStandaloneWeb()

  const navigateFromMenu = useCallback(
    (
      e: GestureResponderEvent,
      href: string,
      navItem: Events['nav:click']['item'],
    ) => {
      ax.metric('nav:click', {item: navItem, surface: 'leftNav'})
      if (IS_WEB) {
        const mouseEvent = e as unknown as React.MouseEvent<
          HTMLAnchorElement,
          MouseEvent
        >
        if (mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.altKey) {
          return
        }
        mouseEvent.preventDefault()
      }

      const [pathName] = router.matchPath(href)
      const tab = NAV_ITEM_TO_TAB[navItem]
      const isCurrent = isTab(currentRouteInfo.name, pathName)

      const onNavigate = () => {
        if (tab && onNavigateTab) {
          onNavigateTab(tab)
          return
        }
        if (isCurrent) {
          emitSoftReset()
        } else {
          const [screen, params] = router.matchPath(href)
          // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
          navigation.navigate(screen, params, {pop: true})
        }
      }

      if (IS_IOS) {
        onNavigate()
      } else if (IS_NATIVE) {
        control.close()
        onNavigate()
      } else {
        control.close(onNavigate)
      }
    },
    [ax, control, currentRouteInfo.name, navigation, onNavigateTab],
  )

  const isListsActive = isTab(currentRouteInfo.name, 'Lists')
  const isSettingsActive = isTab(currentRouteInfo.name, 'Settings')

  return (
    <Menu.Outer style={[{minWidth: 232}]}>
      <Menu.Group>
        {hasSession && (
          <Menu.Item
            testID="leftNavMoreLists"
            label="Lists"
            onPress={e => navigateFromMenu(e, '/lists', 'lists')}
            // @ts-expect-error href is web-only -prf
            href="/lists">
            <Menu.ItemIcon icon={isListsActive ? ListFilledIcon : ListIcon} />
            <Menu.ItemText>Lists</Menu.ItemText>
          </Menu.Item>
        )}
        <Menu.Item
          testID="leftNavMoreStudio"
          label="Creator Studio"
          onPress={e => navigateFromMenu(e, '/studio', 'studio')}
          // @ts-expect-error href is web-only -prf
          href="/studio">
          <Menu.ItemIcon icon={GrowthIcon} />
          <Menu.ItemText>Creator Studio</Menu.ItemText>
        </Menu.Item>
        <Menu.Item
          testID="leftNavMorePro"
          label="Premium"
          onPress={e => navigateFromMenu(e, '/premium', 'pro')}
          // @ts-expect-error href is web-only -prf
          href="/premium">
          <Menu.ItemIcon icon={VerifiedIcon} />
          <Menu.ItemText>Premium</Menu.ItemText>
        </Menu.Item>
      </Menu.Group>
      {(hasSession || showGetApp) && (
        <>
          <Menu.Divider />
          <Menu.Group>
            {hasSession && (
              <Menu.Item
                testID="leftNavMoreSettings"
                label="Settings"
                onPress={e => navigateFromMenu(e, '/settings', 'settings')}
                // @ts-expect-error href is web-only -prf
                href="/settings">
                <Menu.ItemIcon
                  icon={isSettingsActive ? SettingsFilledIcon : SettingsIcon}
                />
                <Menu.ItemText>Settings</Menu.ItemText>
                {numUnreadModerationInbox ? (
                  <View
                    style={[
                      a.rounded_full,
                      a.px_xs,
                      {
                        backgroundColor: '#1D9BF0',
                        paddingVertical: 1,
                        minWidth: 18,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        a.text_center,
                        {color: t.palette.white, lineHeight: 14},
                      ]}>
                      {numUnreadModerationInbox}
                    </Text>
                  </View>
                ) : null}
              </Menu.Item>
            )}
            {showGetApp && (
              <Menu.Item
                testID="leftNavMoreGetApp"
                label="Get App"
                onPress={e => navigateFromMenu(e, '/download', 'download')}
                // @ts-expect-error href is web-only -prf
                href="/download">
                <Menu.ItemIcon icon={DownloadIcon} />
                <Menu.ItemText>Get App</Menu.ItemText>
              </Menu.Item>
            )}
          </Menu.Group>
        </>
      )}
    </Menu.Outer>
  )
}

function MoreNavMenu({
  minimal,
  hasSession,
  numUnreadModerationInbox,
  onNavigateTab,
}: {
  minimal: boolean
  hasSession: boolean
  numUnreadModerationInbox?: string
  onNavigateTab?: (tab: SidebarTab) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const navigationState = useNavigationState(state => state)
  const currentRouteInfo = getCurrentRoute(navigationState)
  const isMoreActive = MORE_ROUTE_NAMES.some(name =>
    isTab(currentRouteInfo.name, name),
  )

  return (
    <Menu.Root>
      <Menu.Trigger label={l`More`}>
        {({props, state, control}) => {
          const hoveredOrOpen = state.hovered || state.focused || control.isOpen
          return (
            <Button
              testID="leftNavMoreBtn"
              label={props.accessibilityLabel}
              {...props}
              style={[
                a.flex_row,
                a.align_center,
                a.rounded_full,
                a.gap_md,
                a.outline_inset_1,
                a.transition_color,
                hoveredOrOpen
                  ? t.atoms.bg_contrast_25
                  : a.transition_delay_50ms,
                minimal
                  ? {padding: 10}
                  : {
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      alignSelf: 'flex-start',
                    },
              ]}>
              <View
                style={[
                  a.align_center,
                  a.justify_center,
                  {width: 26, height: 26},
                  a.z_10,
                ]}>
                <View
                  style={[
                    a.align_center,
                    a.justify_center,
                    {
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: t.atoms.text.color,
                    },
                  ]}>
                  <EllipsisIcon
                    aria-hidden={true}
                    width={14}
                    style={t.atoms.text}
                  />
                </View>
                {hasSession && numUnreadModerationInbox ? (
                  <View
                    style={[
                      a.absolute,
                      a.rounded_full,
                      a.z_20,
                      {
                        backgroundColor: '#1D9BF0',
                        width: 7,
                        height: 7,
                        right: -2,
                        top: -3,
                      },
                    ]}
                  />
                ) : null}
              </View>
              {!minimal && (
                <Text
                  numberOfLines={1}
                  style={[
                    {fontSize: 19, lineHeight: 24},
                    isMoreActive ? a.font_bold : a.font_normal,
                  ]}>
                  More
                </Text>
              )}
            </Button>
          )
        }}
      </Menu.Trigger>
      <MoreMenuItems
        hasSession={hasSession}
        numUnreadModerationInbox={numUnreadModerationInbox}
        onNavigateTab={onNavigateTab}
      />
    </Menu.Root>
  )
}

export function DesktopLeftNav({
  routeName,
  onNavigateTab,
}: {
  routeName: string
  onNavigateTab?: (tab: SidebarTab) => void
}) {
  const t = useTheme()
  const {hasSession, currentAccount} = useSession()
  const {i18n, t: l} = useLingui()
  const ax = useAnalytics()
  const {gtMobile} = useBreakpoints()

  const aa = useAgeAssurance()
  // splitview uses the minimal variant of the leftnav. unfortunately there's no easy
  // way to thread this data through because of the view hierarchy, so just check the route name
  const isMessagesRelatedScreen =
    !IS_NATIVE &&
    routeName.startsWith('Messages') &&
    aa.state.access === aa.Access.Full
  const {leftNavMinimal: leftNavMinimalBreakpoint, centerColumnOffset} =
    useLayoutBreakpoints()
  const numUnreadNotifications = useUnreadNotifications()
  const numUnreadMessages = useUnreadMessageCount()
  const moderationInboxUnreadCountQuery = useModerationInboxUnreadCountQuery()
  const moderationInboxUnreadCount =
    moderationInboxUnreadCountQuery.data?.unreadCounts.total ?? 0
  const numUnreadModerationInbox =
    moderationInboxUnreadCount > 0
      ? moderationInboxUnreadCount >= UNREAD_NOTIFICATION_CAP
        ? l({
            message: `${i18n.number(UNREAD_NOTIFICATION_CAP - 1)}+`,
            comment:
              'Displayed when the number of notifications exceeds the cap – for example, 99+',
          })
        : i18n.number(moderationInboxUnreadCount)
      : undefined
  const hasHomeBadge = useHomeBadge()
  const insets = useSafeAreaInsets()

  const leftNavMinimal = isMessagesRelatedScreen || leftNavMinimalBreakpoint

  if (!hasSession && !gtMobile) {
    return null
  }

  const content = (
    <View
      style={[
        a.flex_1,
        a.w_full,
        a.justify_between,
        leftNavMinimal && a.align_center,
      ]}>
      <View style={[a.w_full, leftNavMinimal && a.align_center, {gap: 1}]}>
        <BrandLogoHeader
          minimal={leftNavMinimal}
          onNavigateTab={onNavigateTab}
        />
        <NavItem
          label="Home"
          href="/"
          navItem="home"
          onNavigateTab={onNavigateTab}
          minimal={leftNavMinimal}
          hasNew={hasSession && hasHomeBadge && isFollowingV2HomeDotEnabled(ax)}
          icons={{
            inactive: HomeIcon,
            active: HomeFilledIcon,
          }}
        />
        <NavItem
          label="Explore"
          href="/search"
          navItem="search"
          onNavigateTab={onNavigateTab}
          minimal={leftNavMinimal}
          icons={{
            inactive: MagnifyingGlassIcon,
            active: MagnifyingGlassFilledIcon,
          }}
        />
        <NavItem
          label="Quanty"
          href="/quanty"
          navItem="quanty"
          onNavigateTab={onNavigateTab}
          minimal={leftNavMinimal}
          icons={{
            inactive: SparkleIcon,
            active: SparkleIcon,
          }}
        />
        {hasSession && (
          <>
            <NavItem
              label="Notifications"
              href="/notifications"
              navItem="notifications"
              onNavigateTab={onNavigateTab}
              minimal={leftNavMinimal}
              count={numUnreadNotifications}
              icons={{inactive: BellIcon, active: BellFilledIcon}}
            />
            <NavItem
              label="Chat"
              href="/messages"
              navItem="chat"
              onNavigateTab={onNavigateTab}
              minimal={leftNavMinimal}
              count={
                aa.flags.chatDisabled ? undefined : numUnreadMessages.numUnread
              }
              hasNew={!aa.flags.chatDisabled && numUnreadMessages.hasNew}
              icons={{inactive: MessageIcon, active: MessageFilledIcon}}
            />
          </>
        )}
        <NavItem
          label="Spaces"
          href="/spaces"
          navItem="spaces"
          onNavigateTab={onNavigateTab}
          minimal={leftNavMinimal}
          icons={{
            inactive: StreamingLiveIcon,
            active: StreamingLiveIcon,
          }}
        />
        <NavItem
          label="Articles"
          href="/articles"
          navItem="articles"
          onNavigateTab={onNavigateTab}
          minimal={leftNavMinimal}
          icons={{
            inactive: NewspaperIcon,
            active: NewspaperIcon,
          }}
        />
        {hasSession && (
          <>
            <NavItem
              label="Bookmarks"
              href="/saved"
              navItem="saved"
              onNavigateTab={onNavigateTab}
              minimal={leftNavMinimal}
              icons={{inactive: BookmarkIcon, active: BookmarkFilledIcon}}
            />
            <NavItem
              label="Profile"
              href={makeProfileLink(currentAccount!)}
              navItem="profile"
              onNavigateTab={onNavigateTab}
              minimal={leftNavMinimal}
              icons={{inactive: UserCircleIcon, active: UserCircleFilledIcon}}
            />
          </>
        )}
        <MoreNavMenu
          minimal={leftNavMinimal}
          hasSession={hasSession}
          numUnreadModerationInbox={numUnreadModerationInbox}
          onNavigateTab={onNavigateTab}
        />
        <ComposeBtn minimal={leftNavMinimal} />
        {!hasSession && !leftNavMinimal ? (
          <View
            style={[a.mt_lg, a.pt_md, a.border_t, t.atoms.border_contrast_low]}>
            <NavSignupCard />
          </View>
        ) : null}
      </View>
      {hasSession ? (
        <View style={[a.w_full, a.pt_xs, leftNavMinimal && a.align_center]}>
          <ProfileCard minimal={leftNavMinimal} />
        </View>
      ) : null}
    </View>
  )

  return (
    <View
      role="navigation"
      pointerEvents={IS_NATIVE ? 'box-none' : undefined}
      style={[
        a.fixed,
        a.top_0,
        web([a.px_md, a.py_md]),
        styles.leftNav,
        native(a.bottom_0),
        leftNavMinimal && [
          {width: LEFT_NAV_MINIMAL_WIDTH},
          !IS_NATIVE && a.h_full,
          a.align_center,
          web(a.overflow_x_hidden),
        ],
        web({
          height: '100dvh',
          maxHeight: '100dvh',
          overflowY: 'auto',
          scrollbarWidth: 'none',
        }),
        {
          transform: [
            {
              translateX:
                -(CENTER_COLUMN_WIDTH / 2) +
                (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0) +
                (!IS_NATIVE &&
                isMessagesRelatedScreen &&
                !leftNavMinimalBreakpoint
                  ? LEFT_NAV_MINIMAL_WIDTH - LEFT_NAV_STANDARD_WIDTH
                  : 0),
            },
            {translateX: '-100%'},
            ...a.scrollbar_offset.transform,
          ],
        },
      ]}>
      {IS_NATIVE ? (
        <ScrollView
          style={[a.flex_1, a.w_full]}
          contentContainerStyle={[
            a.flex_grow,
            a.p_lg,
            {
              paddingTop: insets.top + tokens.space.lg,
              paddingBottom: insets.bottom + tokens.space.lg,
            },
          ]}
          showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  leftNav: {
    left: '50%',
    width: LEFT_NAV_STANDARD_WIDTH,
  },
})
