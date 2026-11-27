import {useCallback, useMemo, useState} from 'react'
import {type ListRenderItemInfo, View} from 'react-native'
import {LayoutAnimationConfig} from 'react-native-reanimated'
import * as Contacts from 'expo-contacts/legacy'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {usePreventRemove} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useGetSuggestedUsersForExploreQuery} from '#/state/queries/trending/useGetSuggestedUsersForExploreQuery'
import {useSession} from '#/state/session'
import {useEnableMinimalShellMode} from '#/state/shell'
import {List} from '#/view/com/util/List'
import {atoms as a, useGutters, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {ContactsHeroImage} from '#/components/contacts/components/HeroImage'
import {FindContactsFlow} from '#/components/contacts/FindContactsFlow'
import {useFindContactsFlowState} from '#/components/contacts/state'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {UserCircle_Stroke2_Corner0_Rounded as PersonIcon} from '#/components/icons/UserCircle'
import * as Layout from '#/components/Layout'
import {Loader} from '#/components/Loader'
import * as ProfileCard from '#/components/ProfileCard'
import {ScreenTransition} from '#/components/ScreenTransition'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'
import type * as bsky from '#/types/bsky'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'FindContactsFlow'>
export function FindContactsFlowScreen({navigation}: Props) {
  const {_} = useLingui()
  const t = useTheme()
  const gutter = useGutters(['base'])
  const moderationOpts = useModerationOpts()
  const {currentAccount} = useSession()

  const [state, dispatch] = useFindContactsFlowState()

  const [transitionDirection, setTransitionDirection] = useState<
    'Forward' | 'Backward'
  >('Forward')

  const [inNativeSyncFlow, setInNativeSyncFlow] = useState(false)

  const overrideGoBack = state.step === '2: verify number'

  usePreventRemove(overrideGoBack, () => {
    setTransitionDirection('Backward')
    dispatch({type: 'BACK'})
    setTimeout(() => {
      setTransitionDirection('Forward')
    })
  })

  useEnableMinimalShellMode()

  // Suggested users query so the screen is ALWAYS rich and populated!
  const {data: suggestedUsersData, isLoading: isSuggestedLoading} =
    useGetSuggestedUsersForExploreQuery({
      limit: 30,
    })

  const handleStartContactsSync = useCallback(async () => {
    if (!IS_NATIVE) return
    try {
      const res = await Contacts.requestPermissionsAsync()
      if (res.granted) {
        setInNativeSyncFlow(true)
      } else {
        Toast.show(
          _(
            msg`Contacts permission denied. Follow suggested creators below or enable contacts in Settings.`,
          ),
          {type: 'info'},
        )
      }
    } catch {
      Toast.show(
        _(
          msg`Contact sync unavailable right now. Browse suggested creators below.`,
        ),
        {type: 'info'},
      )
    }
  }, [_])

  const handleCancel = useCallback(() => {
    if (inNativeSyncFlow) {
      setInNativeSyncFlow(false)
      return
    }
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.navigate('Search', {})
    }
  }, [inNativeSyncFlow, navigation])

  const profiles = useMemo(() => {
    const actors = suggestedUsersData?.actors ?? []
    return actors.filter(actor => actor.did !== currentAccount?.did)
  }, [suggestedUsersData, currentAccount?.did])

  const renderProfileItem = useCallback(
    ({item, index}: ListRenderItemInfo<bsky.profile.AnyProfileView>) => {
      if (!moderationOpts) return null
      return (
        <View style={[a.px_lg]}>
          <View
            style={[
              a.p_md,
              a.border_t,
              t.atoms.border_contrast_low,
              a.flex_row,
              a.align_center,
            ]}>
            <View style={[a.flex_1]}>
              <ProfileCard.Default
                profile={item}
                moderationOpts={moderationOpts}
                position={index}
                logContext="ProfileCard"
              />
            </View>
          </View>
        </View>
      )
    },
    [moderationOpts, t.atoms.border_contrast_low],
  )

  const headerComponent = useMemo(() => {
    return (
      <View style={[gutter, a.gap_xl, a.pb_md]}>
        <ContactsHeroImage />

        <View style={[a.gap_xs]}>
          <Text style={[a.text_2xl, a.font_bold]}>
            <Trans>Find People on QuantZing</Trans>
          </Text>
          <Text
            style={[a.text_md, a.leading_snug, t.atoms.text_contrast_medium]}>
            <Trans>
              Sync your contacts to find friends you know, or follow suggested
              creators on QuantZing.
            </Trans>
          </Text>
        </View>

        {/* Allow Contacts Card on Native */}
        {IS_NATIVE && (
          <View
            style={[
              a.p_lg,
              a.rounded_xl,
              t.atoms.bg_contrast_25,
              a.border,
              t.atoms.border_contrast_low,
              a.gap_md,
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_md]}>
              <View
                style={[
                  a.p_md,
                  a.rounded_full,
                  t.atoms.bg_contrast_50,
                  a.align_center,
                  a.justify_center,
                ]}>
                <PhoneIcon size="lg" style={t.atoms.text_contrast_high} />
              </View>
              <View style={[a.flex_1, a.gap_2xs]}>
                <Text style={[a.text_md, a.font_semi_bold]}>
                  <Trans>Allow Contacts</Trans>
                </Text>
                <Text
                  style={[
                    a.text_sm,
                    a.leading_snug,
                    t.atoms.text_contrast_medium,
                  ]}>
                  <Trans>
                    Match your address book with friends already on QuantZing.
                  </Trans>
                </Text>
              </View>
            </View>

            <View style={[a.flex_row, a.gap_sm]}>
              <Button
                onPress={handleStartContactsSync}
                label={_(msg`Sync contacts`)}
                size="large"
                color="primary"
                style={[a.flex_1, a.justify_center]}>
                <ButtonText>
                  <Trans>Sync contacts</Trans>
                </ButtonText>
              </Button>
            </View>
          </View>
        )}

        <View style={[a.flex_row, a.justify_between, a.align_center, a.pt_sm]}>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <SparkleIcon size="sm" style={{color: t.palette.primary_500}} />
            <Text style={[a.text_lg, a.font_bold]}>
              <Trans>Suggested People on QuantZing</Trans>
            </Text>
          </View>
        </View>
      </View>
    )
  }, [gutter, t, handleStartContactsSync, _])

  // If user activated phone verification / contact sync flow on native
  if (IS_NATIVE && inNativeSyncFlow) {
    return (
      <Layout.Screen>
        <LayoutAnimationConfig skipEntering skipExiting>
          <ScreenTransition key={state.step} direction={transitionDirection}>
            <FindContactsFlow
              state={state}
              dispatch={dispatch}
              onCancel={handleCancel}
              context="Standalone"
            />
          </ScreenTransition>
        </LayoutAnimationConfig>
      </Layout.Screen>
    )
  }

  // If on web, render the full X-Dark web flow directly
  if (!IS_NATIVE) {
    return (
      <Layout.Screen>
        <Layout.Header.Outer>
          <Layout.Header.BackButton onPress={handleCancel} />
          <Layout.Header.Content>
            <Layout.Header.TitleText>
              <Trans>Find People</Trans>
            </Layout.Header.TitleText>
          </Layout.Header.Content>
          <Layout.Header.Slot />
        </Layout.Header.Outer>
        <FindContactsFlow
          state={state}
          dispatch={dispatch}
          onCancel={handleCancel}
          context="Standalone"
        />
      </Layout.Screen>
    )
  }

  // On Native: Show Header + Allow Contacts Card + Suggested People with 1-tap Follow!
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton onPress={handleCancel} />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Find People</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <List
        data={profiles}
        renderItem={renderProfileItem}
        keyExtractor={(item: bsky.profile.AnyProfileView) => item.did}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={
          isSuggestedLoading ? (
            <View style={[a.py_3xl, a.align_center]}>
              <Loader size="xl" />
            </View>
          ) : (
            <View style={[a.px_lg, a.py_2xl, a.align_center, a.gap_sm]}>
              <PersonIcon size="xl" style={t.atoms.text_contrast_low} />
              <Text
                style={[
                  a.text_md,
                  a.font_semi_bold,
                  t.atoms.text_contrast_medium,
                ]}>
                <Trans>No suggested people available right now</Trans>
              </Text>
            </View>
          )
        }
        contentContainerStyle={[a.pb_5xl]}
      />
    </Layout.Screen>
  )
}
