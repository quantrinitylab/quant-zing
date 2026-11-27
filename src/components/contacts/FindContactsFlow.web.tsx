import {type ActionDispatch, useCallback, useMemo, useState} from 'react'
import {type ListRenderItemInfo, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {popularInterests, useInterestsDisplayNames} from '#/lib/interests'
import {cleanError} from '#/lib/strings/errors'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useActorSearch} from '#/state/queries/actor-search'
import {useGetSuggestedUsersForExploreQuery} from '#/state/queries/trending/useGetSuggestedUsersForExploreQuery'
import {useSession} from '#/state/session'
import {List} from '#/view/com/util/List'
import {atoms as a, useGutters, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ContactsHeroImage} from '#/components/contacts/components/HeroImage'
import {SearchInput} from '#/components/forms/SearchInput'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clipboard_Stroke2_Corner2_Rounded as ClipboardIcon} from '#/components/icons/Clipboard'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {UserCircle_Stroke2_Corner0_Rounded as PersonIcon} from '#/components/icons/UserCircle'
import {InterestTabs} from '#/components/InterestTabs'
import {Loader} from '#/components/Loader'
import * as ProfileCard from '#/components/ProfileCard'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import type * as bsky from '#/types/bsky'
import {type Action, type State} from './state'

export function FindContactsFlow({
  onCancel,
}: {
  state?: State
  dispatch?: ActionDispatch<[Action]>
  onBack?: () => void
  onCancel: () => void
  context?: 'Onboarding' | 'Standalone'
}) {
  const {_} = useLingui()
  const t = useTheme()
  const ax = useAnalytics()
  const gutter = useGutters(['base'])
  const moderationOpts = useModerationOpts()
  const {currentAccount} = useSession()

  const [selectedTopic, setSelectedTopic] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  const interestsDisplayNames = useInterestsDisplayNames()
  const topicsList = useMemo(() => {
    return ['all', ...popularInterests]
  }, [])

  const topicTabDisplayNames = useMemo<Record<string, string>>(() => {
    return {
      all: _(msg`All Topics`),
      ...interestsDisplayNames,
    }
  }, [_, interestsDisplayNames])

  // Suggested users query by category
  const {
    data: suggestedUsersData,
    isLoading: isSuggestedLoading,
    error: suggestedError,
  } = useGetSuggestedUsersForExploreQuery({
    category: selectedTopic === 'all' ? undefined : selectedTopic,
    limit: 25,
  })

  // Search actors query if user types in search bar
  const {data: searchResultsData, isLoading: isSearchLoading} = useActorSearch({
    query: searchQuery.trim(),
    enabled: !!searchQuery.trim(),
    limit: 20,
  })

  const handleCopyInviteLink = useCallback(async () => {
    const handle = currentAccount?.handle || 'quantzing'
    const link =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/profile/${handle}`
        : `https://quantzing.com/profile/${handle}`

    await setStringAsync(link)
    setCopiedLink(true)
    Toast.show(_(msg`Invite link copied to clipboard!`))
    setTimeout(() => {
      setCopiedLink(false)
    }, 3000)
    ax.metric('invite:dialog:open', {logContext: 'FindContactsSettings'})
  }, [_, ax, currentAccount?.handle])

  // Aggregate profiles
  const profiles = useMemo(() => {
    if (searchQuery.trim()) {
      return (
        searchResultsData?.pages.flatMap(page => page.actors) ?? []
      ).filter(actor => actor.did !== currentAccount?.did)
    }

    const actors = suggestedUsersData?.actors ?? []
    return actors.filter(actor => actor.did !== currentAccount?.did)
  }, [searchQuery, searchResultsData, suggestedUsersData, currentAccount?.did])

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
              Discover top creators, follow topics you love, or invite friends
              directly to QuantZing.
            </Trans>
          </Text>
        </View>

        {/* Contact Sync Notice Card for Web */}
        <View
          style={[
            a.p_lg,
            a.rounded_lg,
            t.atoms.bg_contrast_25,
            a.border,
            t.atoms.border_contrast_low,
            a.flex_row,
            a.align_center,
            a.gap_md,
          ]}>
          <View
            style={[
              a.p_sm,
              a.rounded_full,
              t.atoms.bg_contrast_50,
              a.align_center,
              a.justify_center,
            ]}>
            <PhoneIcon size="md" style={t.atoms.text_contrast_high} />
          </View>
          <View style={[a.flex_1, a.gap_2xs]}>
            <Text style={[a.text_sm, a.font_semi_bold]}>
              <Trans>Sync Address Book on Mobile</Trans>
            </Text>
            <Text
              style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_medium]}>
              <Trans>
                To automatically match your phone contacts, open QuantZing in
                the iOS or Android mobile app.
              </Trans>
            </Text>
          </View>
        </View>

        {/* Invite Friends Copy Link Card */}
        <View
          style={[
            a.p_lg,
            a.rounded_lg,
            t.atoms.bg_contrast_25,
            a.border,
            t.atoms.border_contrast_low,
            a.gap_sm,
          ]}>
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <SparkleIcon size="sm" style={{color: t.palette.primary_500}} />
            <Text style={[a.text_sm, a.font_semi_bold]}>
              <Trans>Invite your network</Trans>
            </Text>
          </View>
          <Text
            style={[a.text_xs, a.leading_snug, t.atoms.text_contrast_medium]}>
            <Trans>
              Share your personal profile link with friends so they can join and
              follow you in 1 tap.
            </Trans>
          </Text>
          <View style={[a.flex_row, a.align_center, a.gap_sm, a.mt_2xs]}>
            <Button
              onPress={handleCopyInviteLink}
              label={_(msg`Copy profile link`)}
              size="small"
              color="secondary"
              style={[a.flex_1, a.justify_center]}>
              <ButtonIcon icon={copiedLink ? CheckIcon : ClipboardIcon} />
              <ButtonText>
                {copiedLink ? (
                  <Trans>Copied!</Trans>
                ) : (
                  <Trans>Copy profile link</Trans>
                )}
              </ButtonText>
            </Button>
            <Button
              onPress={onCancel}
              label={_(msg`Done`)}
              size="small"
              color="primary"
              style={[a.justify_center]}>
              <ButtonText>
                <Trans>Done</Trans>
              </ButtonText>
            </Button>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[a.gap_sm]}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClearText={() => setSearchQuery('')}
            placeholder={_(msg`Search people by name or handle...`)}
          />
        </View>

        {/* Topic Filter Chips */}
        {!searchQuery.trim() && (
          <View style={[a.gap_xs]}>
            <Text style={[a.text_sm, a.font_semi_bold]}>
              <Trans>Explore by Topic</Trans>
            </Text>
            <InterestTabs
              interests={topicsList}
              selectedInterest={selectedTopic}
              onSelectTab={topic => setSelectedTopic(topic)}
              interestsDisplayNames={topicTabDisplayNames}
            />
          </View>
        )}

        <View style={[a.flex_row, a.justify_between, a.align_center]}>
          <Text style={[a.text_lg, a.font_bold]}>
            {searchQuery.trim() ? (
              <Trans>Search Results</Trans>
            ) : (
              <Trans>Suggested People to Follow</Trans>
            )}
          </Text>
        </View>
      </View>
    )
  }, [
    gutter,
    t,
    handleCopyInviteLink,
    copiedLink,
    _,
    onCancel,
    searchQuery,
    topicsList,
    selectedTopic,
    topicTabDisplayNames,
  ])

  const isLoading = isSuggestedLoading || isSearchLoading

  return (
    <View style={[a.flex_1, t.atoms.bg]}>
      <List
        data={profiles}
        renderItem={renderProfileItem}
        keyExtractor={(item: bsky.profile.AnyProfileView) => item.did}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={
          isLoading ? (
            <View style={[a.py_3xl, a.align_center]}>
              <Loader size="xl" />
            </View>
          ) : suggestedError ? (
            <View style={[a.px_lg, a.py_xl]}>
              <Text
                style={[
                  a.text_sm,
                  a.text_center,
                  t.atoms.text_contrast_medium,
                ]}>
                {cleanError(suggestedError)}
              </Text>
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
                <Trans>No people found</Trans>
              </Text>
            </View>
          )
        }
        contentContainerStyle={[a.pb_5xl]}
      />
    </View>
  )
}
