import {type ComponentProps, type JSX, memo, useCallback} from 'react'
import {Pressable, ScrollView, TouchableOpacity, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import Svg, {Path} from 'react-native-svg'
import {plural} from '@lingui/core/macro'
import {Plural, Trans, useLingui} from '@lingui/react/macro'
import {
  type NavigationState,
  StackActions,
  useNavigation,
  useNavigationState,
} from '@react-navigation/native'

import {UNREAD_NOTIFICATION_CAP} from '#/lib/constants'
import {type PressableScale} from '#/lib/custom-animations/PressableScale'
import {useNavigationTabState} from '#/lib/hooks/useNavigationTabState'
import {getCurrentRoute, getTabState, TabState} from '#/lib/routes/helpers'
import {
  getCommonNavigationAction,
  getTabNavigationAction,
  getTabResetAction,
} from '#/lib/routes/navigation'
import {type SharedNavTab, TAB_TO_NAV_ITEM} from '#/lib/routes/tab-to-nav-item'
import {type RootNavigationProp} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {isBrowserNonStandaloneWeb} from '#/platform/detection'
import {emitSoftReset} from '#/state/events'
import {useModerationInboxUnreadCountQuery} from '#/state/queries/moderation-inbox'
import {useProfileQuery} from '#/state/queries/profile'
import {type SessionAccount, useSession} from '#/state/session'
import {useSetDrawerOpen} from '#/state/shell'
import {useSetThemePrefs, useThemePrefs} from '#/state/shell/color-mode'
import {formatCount} from '#/view/com/util/numeric/format'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {NavSignupCard} from '#/view/shell/NavSignupCard'
import {atoms as a, tokens, useTheme, web} from '#/alf'
import {BetaTag} from '#/components/BetaTag'
import {Button, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {Divider} from '#/components/Divider'
import {ArrowShareRight_Stroke2_Corner2_Rounded as ArrowShareRightIcon} from '#/components/icons/Arrow'
import {
  Bookmark_Filled_Corner0_Rounded as BookmarkFilledIcon,
  Bookmark_Stroke2_Corner0_Rounded as BookmarkIcon,
} from '#/components/icons/Bookmark'
import {BulletList_Stroke2_Corner0_Rounded as ListIcon} from '#/components/icons/BulletList'
import {CircleQuestion_Stroke2_Corner2_Rounded as CircleQuestionIcon} from '#/components/icons/Circle'
import {Group3_Stroke2_Corner0_Rounded as CommunitiesIcon} from '#/components/icons/Group3'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilledIcon,
  HomeOpen_Stroke2_Corner0_Rounded as HomeIcon,
} from '#/components/icons/Home'
import {
  MagnifyingGlass_Filled_Stroke2_Corner0_Rounded as MagnifyingGlassFilledIcon,
  MagnifyingGlass_Stroke2_Corner0_Rounded as MagnifyingGlassIcon,
} from '#/components/icons/MagnifyingGlass'
import {Moon_Stroke2_Corner0_Rounded as MoonIcon} from '#/components/icons/Moon'
import {PersonCheck_Stroke2_Corner0_Rounded as PersonCheckIcon} from '#/components/icons/Person'
import {SettingsGear2_Stroke2_Corner0_Rounded as SettingsIcon} from '#/components/icons/Settings'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {StreamingLive_Stroke2_Corner0_Rounded as StreamingLiveIcon} from '#/components/icons/StreamingLive'
import {
  UserCircle_Filled_Corner0_Rounded as UserCircleFilledIcon,
  UserCircle_Stroke2_Corner0_Rounded as UserCircleIcon,
} from '#/components/icons/UserCircle'
import {Verified_Stroke2_Corner2_Rounded as VerifiedIcon} from '#/components/icons/Verified'
import {InlineLinkText} from '#/components/Link'
import {OTAChannelNotice} from '#/components/OTAChannelNotice'
import {ProfileBadges} from '#/components/ProfileBadges'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE, IS_WEB} from '#/env'
import {InviteFriendsDialog} from '#/features/inviteFriends'
import {useActorStatus} from '#/features/liveNow'

const iconWidth = 26
type SecondarySidebarTab =
  'Atmosphere' | 'Feeds' | 'Lists' | 'Bookmarks' | 'Settings'
const SECONDARY_TAB_ROUTES: Record<
  SecondarySidebarTab,
  'AtmosphereTab' | 'FeedsTab' | 'ListsTab' | 'BookmarksTab' | 'SettingsTab'
> = {
  Atmosphere: 'AtmosphereTab',
  Feeds: 'FeedsTab',
  Lists: 'ListsTab',
  Bookmarks: 'BookmarksTab',
  Settings: 'SettingsTab',
}

let DrawerProfileCard = ({
  account,
  onPressProfile,
  onPressShare,
}: {
  account: SessionAccount
  onPressProfile: () => void
  onPressShare?: () => void
}): React.ReactNode => {
  const {t: l, i18n} = useLingui()
  const t = useTheme()
  const {data: profile} = useProfileQuery({did: account.did})
  const {isActive: live} = useActorStatus(profile)

  return (
    <TouchableOpacity
      testID="profileCardButton"
      accessibilityLabel={l`Profile`}
      accessibilityHint={l`Navigates to your profile`}
      onPress={onPressProfile}
      style={[a.gap_sm, a.pr_lg]}>
      <UserAvatar
        size={52}
        avatar={profile?.avatar}
        // See https://github.com/bluesky-social/social-app/pull/1801:
        usePlainRNImage={true}
        type={profile?.associated?.labeler ? 'labeler' : 'user'}
        live={live}
      />
      <View style={[a.gap_2xs]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
          <Text
            emoji
            style={[
              a.font_bold,
              a.text_xl,
              a.mt_2xs,
              a.leading_tight,
              a.flex_shrink,
            ]}
            numberOfLines={1}>
            {profile?.displayName || account.handle}
          </Text>
          {profile && <ProfileBadges profile={profile} size="lg" />}
          {onPressShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={l`Invite friends`}
              accessibilityHint={l`Opens the invite friends sheet to share your profile`}
              onPress={onPressShare}
              hitSlop={8}
              style={({pressed}) => [
                a.ml_auto,
                {
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: t.palette.contrast_50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ArrowShareRightIcon
                width={16}
                height={16}
                fill={t.palette.primary_500}
              />
            </Pressable>
          )}
        </View>
        <Text
          emoji
          style={[t.atoms.text_contrast_medium, a.text_md, a.leading_tight]}
          numberOfLines={1}>
          {sanitizeHandle(account.handle, '@')}
        </Text>
      </View>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        <Trans>
          <Text style={[a.text_md, a.font_semi_bold]}>
            {formatCount(i18n, profile?.followersCount ?? 0)}
          </Text>{' '}
          <Plural
            value={profile?.followersCount || 0}
            one="follower"
            other="followers"
          />
        </Trans>{' '}
        &middot;{' '}
        <Trans>
          <Text style={[a.text_md, a.font_semi_bold]}>
            {formatCount(i18n, profile?.followsCount ?? 0)}
          </Text>{' '}
          <Plural
            value={profile?.followsCount || 0}
            one="following"
            other="following"
          />
        </Trans>
      </Text>
    </TouchableOpacity>
  )
}
DrawerProfileCard = memo(DrawerProfileCard)
export {DrawerProfileCard}

let DrawerContent = ({}: React.PropsWithoutRef<{}>): React.ReactNode => {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const setDrawerOpen = useSetDrawerOpen()
  const navigation = useNavigation<RootNavigationProp>()
  const ax = useAnalytics()
  const {
    isAtHome,
    isAtSearch,
    isAtFeeds,
    isAtBookmarks,
    isAtMyProfile,
  } = useNavigationTabState()
  const {hasSession, currentAccount} = useSession()
  const inviteFriendsControl = useDialogControl()
  const currentRouteName = useNavigationState(state =>
    state ? getCurrentRoute(state).name : 'Home',
  )
  const isAtQuanty = currentRouteName === 'Quanty'
  const isAtSpaces = currentRouteName === 'ZingSpaces'
  const isAtStudio = currentRouteName === 'CreatorStudio'
  const isAtPro = currentRouteName === 'QuantZingPro'
  const unreadCountQuery = useModerationInboxUnreadCountQuery()
  const unreadCount = unreadCountQuery.data?.unreadCounts.total ?? 0
  const settingsCount =
    unreadCount > 0
      ? unreadCount >= UNREAD_NOTIFICATION_CAP
        ? `${UNREAD_NOTIFICATION_CAP - 1}+`
        : String(unreadCount)
      : undefined

  // events
  // =

  const onPressTab = useCallback(
    (tab: SharedNavTab, surface: 'drawer' | 'drawerHeader' = 'drawer') => {
      ax.metric('nav:click', {
        item: TAB_TO_NAV_ITEM[tab],
        surface,
      })
      const state: NavigationState = navigation.getState()
      setDrawerOpen(false)
      if (IS_WEB) {
        navigation.dispatch(getTabNavigationAction(tab, currentAccount?.handle))
      } else {
        const tabState = getTabState(state, tab)
        if (tabState === TabState.InsideAtRoot) {
          emitSoftReset()
        } else if (tabState === TabState.Inside) {
          // find the correct navigator in which to pop-to-top
          const target = state.routes.find(route => route.name === `${tab}Tab`)
            ?.state?.key
          if (target) {
            // if we found it, trigger pop-to-top
            navigation.dispatch({
              ...StackActions.popToTop(),
              target,
            })
          } else {
            // fallback: reset navigation
            navigation.dispatch(getTabResetAction(tab))
          }
        } else {
          navigation.dispatch(getTabNavigationAction(tab))
        }
      }
    },
    [navigation, setDrawerOpen, currentAccount, ax],
  )

  const onPressHome = useCallback(() => onPressTab('Home'), [onPressTab])

  const onPressSearch = useCallback(() => onPressTab('Search'), [onPressTab])

  const onPressProfile = useCallback(() => {
    onPressTab('MyProfile')
  }, [onPressTab])

  const onPressDrawerHeaderProfile = useCallback(() => {
    onPressTab('MyProfile', 'drawerHeader')
  }, [onPressTab])

  const navigateToSecondaryTab = useCallback(
    (tab: SecondarySidebarTab) => {
      const state: NavigationState = navigation.getState()
      const tabState = getTabState(state, tab)
      const routeName = SECONDARY_TAB_ROUTES[tab]
      if (tabState === TabState.InsideAtRoot) {
        emitSoftReset()
      } else if (tabState === TabState.Inside) {
        const target = state.routes.find(route => route.name === routeName)
          ?.state?.key
        if (target) {
          navigation.dispatch({
            ...StackActions.popToTop(),
            target,
          })
        } else {
          navigation.dispatch(getTabResetAction(tab))
        }
      } else {
        navigation.dispatch(getTabNavigationAction(tab))
      }
      setDrawerOpen(false)
    },
    [navigation, setDrawerOpen],
  )

  const onPressCommunities = useCallback(() => {
    ax.metric('nav:click', {item: 'feeds', surface: 'drawer'})
    if (IS_WEB) navigation.dispatch(getTabNavigationAction('Feeds'))
    else navigateToSecondaryTab('Feeds')
    if (IS_WEB) setDrawerOpen(false)
  }, [navigation, navigateToSecondaryTab, setDrawerOpen, ax])

  const onPressHistory = useCallback(() => {
    ax.metric('nav:click', {item: 'saved', surface: 'drawer'})
    if (IS_WEB) navigation.dispatch(getTabNavigationAction('Bookmarks'))
    else navigateToSecondaryTab('Bookmarks')
    if (IS_WEB) setDrawerOpen(false)
  }, [navigation, navigateToSecondaryTab, setDrawerOpen, ax])

  const onPressLists = useCallback(() => {
    ax.metric('nav:click', {item: 'lists', surface: 'drawer'})
    if (IS_WEB) navigation.dispatch(getTabNavigationAction('Lists'))
    else navigateToSecondaryTab('Lists')
    if (IS_WEB) setDrawerOpen(false)
  }, [navigation, navigateToSecondaryTab, setDrawerOpen, ax])

  const onPressFollowRequests = useCallback(() => {
    ax.metric('nav:click', {item: 'profile', surface: 'drawer'})
    setDrawerOpen(false)
    if (IS_NATIVE) {
      navigation.dispatch(
        getCommonNavigationAction(
          {name: 'FindContactsFlow', params: undefined},
          navigation.getState(),
        ),
      )
    } else {
      navigation.dispatch(getTabNavigationAction('Search'))
    }
  }, [navigation, setDrawerOpen, ax])

  const onPressQuanty = useCallback(() => {
    ax.metric('nav:click', {item: 'quanty', surface: 'drawer'})
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'Quanty', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen, ax])

  const onPressZingSpaces = useCallback(() => {
    ax.metric('nav:click', {item: 'spaces', surface: 'drawer'})
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'ZingSpaces', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen, ax])

  const onPressCreatorStudio = useCallback(() => {
    ax.metric('nav:click', {item: 'studio', surface: 'drawer'})
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'CreatorStudio', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen, ax])

  const onPressQuantZingPro = useCallback(() => {
    ax.metric('nav:click', {item: 'pro', surface: 'drawer'})
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'QuantZingPro', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen, ax])

  const onPressSettings = useCallback(() => {
    ax.metric('nav:click', {item: 'settings', surface: 'drawer'})
    if (IS_WEB) navigation.dispatch(getTabNavigationAction('Settings'))
    else navigateToSecondaryTab('Settings')
    if (IS_WEB) setDrawerOpen(false)
  }, [navigation, navigateToSecondaryTab, setDrawerOpen, ax])

  const onPressFeedback = useCallback(() => {
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'Help', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen])

  const onPressHelp = useCallback(() => {
    setDrawerOpen(false)
    navigation.dispatch(
      getCommonNavigationAction(
        {name: 'Help', params: undefined},
        navigation.getState(),
      ),
    )
  }, [navigation, setDrawerOpen])

  // rendering
  // =

  return (
    <View
      testID="drawer"
      style={[a.flex_1, a.border_r, t.atoms.bg, t.atoms.border_contrast_low]}>
      <ScrollView
        style={[a.flex_1]}
        contentContainerStyle={[
          {
            paddingTop: Math.max(
              insets.top + a.pt_xl.paddingTop,
              a.pt_xl.paddingTop,
            ),
          },
        ]}>
        <View style={[a.px_xl]}>
          {hasSession && currentAccount ? (
            <DrawerProfileCard
              account={currentAccount}
              onPressProfile={onPressDrawerHeaderProfile}
              onPressShare={
                IS_NATIVE
                  ? () => {
                      ax.metric('invite:dialog:open', {logContext: 'Drawer'})
                      setDrawerOpen(false)
                      inviteFriendsControl.open()
                    }
                  : undefined
              }
            />
          ) : (
            <View style={[a.pr_xl]}>
              <NavSignupCard />
            </View>
          )}

          <OTAChannelNotice style={[a.mt_lg]} />

          <Divider style={[a.mt_xl, a.mb_sm]} />
        </View>

        {hasSession ? (
          <>
            <ProfileMenuItem
              isActive={isAtMyProfile}
              onPress={onPressProfile}
            />
            <PremiumMenuItem
              isActive={isAtPro}
              onPress={onPressQuantZingPro}
            />
            <CommunitiesMenuItem
              isActive={isAtFeeds}
              onPress={onPressCommunities}
            />
            <HistoryMenuItem
              isActive={isAtBookmarks}
              onPress={onPressHistory}
            />
            <ListsMenuItem onPress={onPressLists} />
            <SpacesMenuItem
              isActive={isAtSpaces}
              onPress={onPressZingSpaces}
            />
            <FollowRequestsMenuItem onPress={onPressFollowRequests} />
            <CreatorStudioMenuItem
              isActive={isAtStudio}
              onPress={onPressCreatorStudio}
            />

            <View style={[a.px_xl]}>
              <Divider style={[a.my_md]} />
            </View>

            <SecondaryMenuItem
              icon={<SparkleIcon style={[t.atoms.text]} width={20} />}
              label="Autonomous Work"
              bold={isAtQuanty}
              onPress={onPressQuanty}
            />
            <SecondaryMenuItem
              icon={<SettingsIcon style={[t.atoms.text]} width={20} />}
              label="Settings and privacy"
              count={settingsCount}
              accessibilityHint={
                unreadCount > 0
                  ? plural(unreadCount, {
                      one: '# unread update',
                      other: '# unread updates',
                    })
                  : ''
              }
              onPress={onPressSettings}
            />
            <SecondaryMenuItem
              icon={<CircleQuestionIcon style={[t.atoms.text]} width={20} />}
              label="Help Center"
              onPress={onPressHelp}
            />
          </>
        ) : (
          <>
            <HomeMenuItem isActive={isAtHome} onPress={onPressHome} />
            <PremiumMenuItem
              isActive={isAtPro}
              onPress={onPressQuantZingPro}
            />
            <CommunitiesMenuItem
              isActive={isAtFeeds}
              onPress={onPressCommunities}
            />
            <SearchMenuItem isActive={isAtSearch} onPress={onPressSearch} />
            <SpacesMenuItem
              isActive={isAtSpaces}
              onPress={onPressZingSpaces}
            />
            <CreatorStudioMenuItem
              isActive={isAtStudio}
              onPress={onPressCreatorStudio}
            />

            <View style={[a.px_xl]}>
              <Divider style={[a.my_md]} />
            </View>

            <SecondaryMenuItem
              icon={<SparkleIcon style={[t.atoms.text]} width={20} />}
              label="Autonomous Work"
              bold={isAtQuanty}
              onPress={onPressQuanty}
            />
            <SecondaryMenuItem
              icon={<SettingsIcon style={[t.atoms.text]} width={20} />}
              label="Settings and privacy"
              onPress={onPressSettings}
            />
            <SecondaryMenuItem
              icon={<CircleQuestionIcon style={[t.atoms.text]} width={20} />}
              label="Help Center"
              onPress={onPressHelp}
            />
          </>
        )}

        <View style={[a.px_xl]}>
          <Divider style={[a.mb_xl, a.mt_sm]} />
          <ExtraLinks />
        </View>
      </ScrollView>

      <DrawerFooter
        onPressFeedback={onPressFeedback}
        onPressHelp={onPressHelp}
      />
      <InviteFriendsDialog control={inviteFriendsControl} />
    </View>
  )
}
DrawerContent = memo(DrawerContent)
export {DrawerContent}

function SunIcon({size = 16, fill}: {size?: number; fill?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM3.515 4.929l1.414-1.414L7.05 5.636 5.636 7.05 3.515 4.93Zm13.435 13.435 1.414-1.414 2.121 2.121-1.414 1.415-2.121-2.122ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM5.636 16.95l1.414 1.414-2.121 2.121-1.414-1.414 2.121-2.121Zm13.435-13.435 1.414 1.414-2.121 2.121-1.414-1.414 2.121-2.121Z"
        fill={fill || 'currentColor'}
      />
    </Svg>
  )
}

let DrawerFooter = ({
  onPressFeedback,
  onPressHelp,
}: {
  onPressFeedback: () => void
  onPressHelp: () => void
}): React.ReactNode => {
  const {t: l} = useLingui()
  const insets = useSafeAreaInsets()
  const t = useTheme()
  const {colorMode, darkTheme} = useThemePrefs()
  const {setColorMode, setDarkTheme} = useSetThemePrefs()

  const currentModeLabel =
    t.name === 'dark' ? 'Dark' : t.name === 'dim' ? 'Dim' : 'Light'

  const cycleTheme = useCallback(() => {
    const isLight =
      colorMode === 'light' || (colorMode === 'system' && t.name === 'light')
    if (isLight) {
      setColorMode('dark')
      setDarkTheme('dim')
    } else if (darkTheme === 'dim' || t.name === 'dim') {
      setColorMode('dark')
      setDarkTheme('dark')
    } else {
      setColorMode('light')
    }
  }, [colorMode, darkTheme, t.name, setColorMode, setDarkTheme])

  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.justify_between,
        a.px_xl,
        a.pt_md,
        a.border_t,
        t.atoms.border_contrast_low,
        {
          paddingBottom: Math.max(
            insets.bottom + tokens.space.xs,
            tokens.space.md,
          ),
        },
      ]}>
      {/* Theme Toggle Button on bottom-left */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Theme: ${currentModeLabel}. Tap to change theme.`}
        accessibilityHint="Cycles between Light, Dim, and Dark themes"
        onPress={cycleTheme}
        style={({pressed}) => [
          a.flex_row,
          a.align_center,
          a.gap_xs,
          a.px_md,
          a.py_xs,
          a.rounded_full,
          pressed ? t.atoms.bg_contrast_50 : t.atoms.bg_contrast_25,
          web({cursor: 'pointer'}),
        ]}>
        {t.name === 'light' ? (
          <SunIcon size={16} fill={t.palette.contrast_700} />
        ) : (
          <MoonIcon width={16} style={[t.atoms.text]} />
        )}
        <Text style={[a.text_sm, a.font_semi_bold, t.atoms.text]}>
          {currentModeLabel}
        </Text>
      </Pressable>

      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
        <Button
          label={l`Send feedback`}
          size="small"
          variant="ghost"
          color="secondary"
          accessibilityHint=""
          onPress={onPressFeedback}>
          <ButtonText style={[a.text_xs]}>
            <Trans>Feedback</Trans>
          </ButtonText>
        </Button>
        <Button
          label={l`Get help`}
          size="small"
          variant="ghost"
          color="secondary"
          accessibilityHint=""
          onPress={onPressHelp}>
          <ButtonText style={[a.text_xs]}>
            <Trans>Help</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}
DrawerFooter = memo(DrawerFooter)

interface MenuItemProps extends ComponentProps<typeof PressableScale> {
  icon: JSX.Element
  label: string
  count?: string
  bold?: boolean
  beta?: boolean
}

let SearchMenuItem = ({
  isActive,
  onPress,
}: {
  isActive: boolean
  onPress: () => void
}): React.ReactNode => {
  const {t: l} = useLingui()
  const t = useTheme()
  return (
    <MenuItem
      icon={
        isActive ? (
          <MagnifyingGlassFilledIcon style={[t.atoms.text]} width={iconWidth} />
        ) : (
          <MagnifyingGlassIcon style={[t.atoms.text]} width={iconWidth} />
        )
      }
      label={l`Explore`}
      bold={isActive}
      onPress={onPress}
    />
  )
}
SearchMenuItem = memo(SearchMenuItem)

let HomeMenuItem = ({
  isActive,
  onPress,
}: {
  isActive: boolean
  onPress: () => void
}): React.ReactNode => {
  const {t: l} = useLingui()
  const t = useTheme()
  return (
    <MenuItem
      icon={
        isActive ? (
          <HomeFilledIcon style={[t.atoms.text]} width={iconWidth} />
        ) : (
          <HomeIcon style={[t.atoms.text]} width={iconWidth} />
        )
      }
      label={l`Home`}
      bold={isActive}
      onPress={onPress}
    />
  )
}
HomeMenuItem = memo(HomeMenuItem)

let ListsMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const {t: l} = useLingui()
  const t = useTheme()

  return (
    <MenuItem
      icon={<ListIcon style={[t.atoms.text]} width={iconWidth} />}
      label={l`Lists`}
      bold={isActive}
      onPress={onPress}
    />
  )
}
ListsMenuItem = memo(ListsMenuItem)

let HistoryMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()

  return (
    <MenuItem
      icon={
        isActive ? (
          <BookmarkFilledIcon style={[t.atoms.text]} width={iconWidth} />
        ) : (
          <BookmarkIcon style={[t.atoms.text]} width={iconWidth} />
        )
      }
      label="History"
      bold={isActive}
      onPress={onPress}
    />
  )
}
HistoryMenuItem = memo(HistoryMenuItem)

let ProfileMenuItem = ({
  isActive,
  onPress,
}: {
  isActive: boolean
  onPress: () => void
}): React.ReactNode => {
  const {t: l} = useLingui()
  const t = useTheme()
  return (
    <MenuItem
      icon={
        isActive ? (
          <UserCircleFilledIcon style={[t.atoms.text]} width={iconWidth} />
        ) : (
          <UserCircleIcon style={[t.atoms.text]} width={iconWidth} />
        )
      }
      label={l`Profile`}
      bold={isActive}
      onPress={onPress}
    />
  )
}
ProfileMenuItem = memo(ProfileMenuItem)

let CommunitiesMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()
  return (
    <MenuItem
      icon={<CommunitiesIcon style={[t.atoms.text]} width={iconWidth} />}
      label="Communities"
      bold={isActive}
      onPress={onPress}
    />
  )
}
CommunitiesMenuItem = memo(CommunitiesMenuItem)

let SpacesMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()
  return (
    <MenuItem
      icon={<StreamingLiveIcon style={[t.atoms.text]} width={iconWidth} />}
      label="Spaces"
      bold={isActive}
      onPress={onPress}
    />
  )
}
SpacesMenuItem = memo(SpacesMenuItem)

let FollowRequestsMenuItem = ({
  onPress,
}: {
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()
  return (
    <MenuItem
      icon={<PersonCheckIcon style={[t.atoms.text]} width={iconWidth} />}
      label="Follow Requests"
      onPress={onPress}
    />
  )
}
FollowRequestsMenuItem = memo(FollowRequestsMenuItem)

let CreatorStudioMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()
  return (
    <MenuItem
      icon={<GrowthIcon style={[t.atoms.text]} width={iconWidth} />}
      label="Creator Studio"
      bold={isActive}
      onPress={onPress}
    />
  )
}
CreatorStudioMenuItem = memo(CreatorStudioMenuItem)

let PremiumMenuItem = ({
  isActive,
  onPress,
}: {
  isActive?: boolean
  onPress: () => void
}): React.ReactNode => {
  const t = useTheme()
  return (
    <MenuItem
      icon={<VerifiedIcon style={[t.atoms.text]} width={iconWidth} />}
      label="Premium"
      bold={isActive}
      onPress={onPress}
    />
  )
}
PremiumMenuItem = memo(PremiumMenuItem)

function MenuItem({
  beta,
  icon,
  label,
  count,
  bold,
  onPress,
  accessibilityHint = '',
}: MenuItemProps) {
  const t = useTheme()
  const {t: l} = useLingui()
  const accessibilityLabel = beta ? l`${label}, Beta` : label
  return (
    <Button
      testID={`menuItemButton-${label}`}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityHint={accessibilityHint}
      label={accessibilityLabel}>
      {({hovered, pressed}) => (
        <View
          style={[
            a.flex_1,
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.py_md,
            a.px_xl,
            (hovered || pressed) && t.atoms.bg_contrast_25,
          ]}>
          <View style={[a.relative]}>
            {icon}
            {count ? (
              <View
                style={[
                  a.absolute,
                  a.inset_0,
                  a.align_end,
                  {top: -4, right: a.gap_sm.gap * -1},
                ]}>
                <View
                  style={[
                    a.rounded_full,
                    {
                      right: count.length === 1 ? 6 : 0,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      backgroundColor: t.palette.primary_500,
                    },
                  ]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.leading_tight,
                      a.font_semi_bold,
                      {
                        fontVariant: ['tabular-nums'],
                        color: t.palette.white,
                      },
                    ]}
                    numberOfLines={1}>
                    {count}
                  </Text>
                </View>
              </View>
            ) : undefined}
          </View>
          <View style={[a.flex_1, a.flex_row, a.align_center, a.gap_sm]}>
            <Text
              style={[
                a.flex_shrink,
                a.text_2xl,
                bold && a.font_bold,
                web(a.leading_snug),
              ]}
              numberOfLines={1}>
              {label}
            </Text>
            {beta && <BetaTag />}
          </View>
        </View>
      )}
    </Button>
  )
}

function SecondaryMenuItem({
  icon,
  label,
  onPress,
  bold,
  count,
  accessibilityHint = '',
}: {
  icon: JSX.Element
  label: string
  onPress: () => void
  bold?: boolean
  count?: string
  accessibilityHint?: string
}) {
  const t = useTheme()
  return (
    <Button
      testID={`secondaryMenuItemButton-${label}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      label={label}>
      {({hovered, pressed}) => (
        <View
          style={[
            a.flex_1,
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.py_sm,
            a.px_xl,
            (hovered || pressed) && t.atoms.bg_contrast_25,
          ]}>
          <View
            style={[
              {width: 22, alignItems: 'center', justifyContent: 'center'},
            ]}>
            {icon}
          </View>
          <Text
            style={[
              a.flex_1,
              a.text_md,
              bold ? a.font_bold : a.font_medium,
              t.atoms.text,
              web(a.leading_snug),
            ]}
            numberOfLines={1}>
            {label}
          </Text>
          {count ? (
            <View
              style={[
                a.rounded_full,
                {
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  backgroundColor: t.palette.primary_500,
                },
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.leading_tight,
                  a.font_semi_bold,
                  {
                    fontVariant: ['tabular-nums'],
                    color: t.palette.white,
                  },
                ]}
                numberOfLines={1}>
                {count}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Button>
  )
}

function ExtraLinks() {
  const {t: l} = useLingui()
  const setDrawerOpen = useSetDrawerOpen()
  const showDownload = IS_WEB && isBrowserNonStandaloneWeb()

  return (
    <View style={[a.flex_col, a.gap_md, a.flex_wrap]}>
      {showDownload && (
        <InlineLinkText
          style={[a.text_md, a.font_bold]}
          label="Download QuantZing App"
          to="/download"
          onPress={() => setDrawerOpen(false)}>
          Download App
        </InlineLinkText>
      )}
      <InlineLinkText
        style={[a.text_md]}
        label={l`Terms of Service`}
        to="/terms"
        onPress={() => setDrawerOpen(false)}>
        <Trans>Terms of Service</Trans>
      </InlineLinkText>
      <InlineLinkText
        style={[a.text_md]}
        to="/privacy"
        label={l`Privacy Policy`}
        onPress={() => setDrawerOpen(false)}>
        <Trans>Privacy Policy</Trans>
      </InlineLinkText>
    </View>
  )
}
