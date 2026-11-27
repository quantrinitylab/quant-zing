import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, type GestureResponderEvent, Pressable, StyleSheet, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {currentDatetimeString} from '@atproto/syntax'
import {setInterestsPref} from '@bsky/sdk'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {type NavigationProp} from '#/lib/routes/types'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {
  preferencesQueryKey,
  usePreferencesQuery,
} from '#/state/queries/preferences'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {createGetSuggestedFeedsQueryKey} from '#/state/queries/trending/useGetSuggestedFeedsQuery'
import {createGetSuggestedUsersForDiscoverQueryKey} from '#/state/queries/trending/useGetSuggestedUsersForDiscoverQuery'
import {createGetSuggestedUsersForExploreQueryKey, useGetSuggestedUsersForExploreQuery} from '#/state/queries/trending/useGetSuggestedUsersForExploreQuery'
import {createGetSuggestedUsersForSeeMoreQueryKey} from '#/state/queries/trending/useGetSuggestedUsersForSeeMoreQuery'
import {createSuggestedStarterPacksQueryKey} from '#/state/queries/useSuggestedStarterPacksQuery'
import {usePdsClient, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {Phone_Stroke2_Corner0_Rounded as PhoneIcon} from '#/components/icons/Phone'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import {UserCircle_Stroke2_Corner0_Rounded as UserCircleIcon} from '#/components/icons/UserCircle'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'
import {type app} from '#/lexicons'

export type TopicItem = {
  id: string
  label: string
  prefTag: string
  query: string
}

export const FOLLOW_HUB_TOPICS: TopicItem[] = [
  {id: 'politics', label: 'Politics', prefTag: 'politics', query: 'politics'},
  {id: 'sports', label: 'Sports', prefTag: 'sports', query: 'sports'},
  {id: 'business', label: 'Business', prefTag: 'business', query: 'business'},
  {id: 'finance', label: 'Finance', prefTag: 'finance', query: 'finance'},
  {
    id: 'science-tech',
    label: 'Science & Technology',
    prefTag: 'science',
    query: 'science technology',
  },
  {
    id: 'entertainment-arts',
    label: 'Entertainment & Arts',
    prefTag: 'entertainment',
    query: 'entertainment arts',
  },
  {
    id: 'ai',
    label: 'Artificial Intelligence',
    prefTag: 'ai',
    query: 'artificial intelligence AI',
  },
  {id: 'gaming', label: 'Gaming', prefTag: 'gaming', query: 'gaming'},
  {id: 'crypto', label: 'Crypto', prefTag: 'crypto', query: 'crypto'},
  {id: 'soccer', label: 'Soccer', prefTag: 'sports', query: 'soccer'},
  {
    id: 'movies-tv',
    label: 'Movies & TV',
    prefTag: 'movies',
    query: 'movies TV',
  },
  {id: 'music', label: 'Music', prefTag: 'music', query: 'music'},
]

export const DISCOVER_TOPICS = FOLLOW_HUB_TOPICS

type TabType = 'topics' | 'contacts' | 'suggested'

export function DiscoverTopicsModal({
  control,
}: {
  control: Dialog.DialogControlProps
}) {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavigationProp>()
  const ax = useAnalytics()
  const {hasSession} = useSession()
  const pdsClient = usePdsClient()
  const qc = useQueryClient()
  const {data: preferences} = usePreferencesQuery()
  const [activeTab, setActiveTab] = useState<TabType>('topics')

  const savedTags = useMemo(
    () => preferences?.interests.tags || [],
    [preferences?.interests.tags],
  )
  const [localInterests, setLocalInterests] = useState<string[]>(savedTags)

  useEffect(() => {
    if (preferences?.interests.tags) {
      setLocalInterests(preferences.interests.tags)
    }
  }, [preferences?.interests.tags])

  const onToggleTopic = useCallback(
    async (topic: TopicItem) => {
      const currentlySelected =
        localInterests.includes(topic.prefTag) ||
        localInterests.includes(topic.id)
      let next: string[]
      if (currentlySelected) {
        next = localInterests.filter(t => t !== topic.prefTag && t !== topic.id)
      } else {
        next = Array.from(new Set([...localInterests, topic.prefTag, topic.id]))
      }
      setLocalInterests(next)

      if (hasSession && pdsClient) {
        try {
          await pdsClient.call(setInterestsPref, {tags: next})
          const updatedAt = currentDatetimeString()
          qc.setQueriesData(
            {queryKey: preferencesQueryKey},
            (old?: UsePreferencesQueryResponse) => {
              if (!old) return old
              return {
                ...old,
                interests: {
                  ...old.interests,
                  tags: next,
                  updatedAt,
                },
              }
            },
          )
          await Promise.all([
            qc.resetQueries({queryKey: createSuggestedStarterPacksQueryKey()}),
            qc.resetQueries({queryKey: createGetSuggestedFeedsQueryKey()}),
            qc.resetQueries({
              queryKey: createGetSuggestedUsersForDiscoverQueryKey({}),
            }),
            qc.resetQueries({
              queryKey: createGetSuggestedUsersForExploreQueryKey({}),
            }),
            qc.resetQueries({
              queryKey: createGetSuggestedUsersForSeeMoreQueryKey({}),
            }),
          ])
        } catch (err) {
          logger.error('Failed to update interests', {safeMessage: err})
        }
      }
    },
    [localInterests, hasSession, pdsClient, qc],
  )

  const onExploreTopic = useCallback(
    (topic: TopicItem) => {
      ax.metric('nav:click', {item: 'search', surface: 'topBar'})
      control.close()
      navigation.navigate('Search', {q: topic.query})
    },
    [control, navigation, ax],
  )

  const onPressFindPeople = useCallback(() => {
    ax.metric('nav:click', {item: 'search', surface: 'topBar'})
    control.close()
    if (IS_NATIVE) {
      navigation.navigate('FindContactsFlow')
    } else {
      navigation.navigate('Search', {tab: 'user'})
    }
  }, [control, navigation, ax])

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Follow hub"
        style={[
          styles.dialogOuter,
          web({maxWidth: 560, marginHorizontal: 'auto'}),
        ]}
        contentContainerStyle={[
          styles.dialogContent,
          {paddingBottom: Math.max(insets.bottom, 24) + 16},
        ]}>
        <View style={styles.modalHeader}>
          <View style={a.flex_1}>
            <Text style={styles.modalTitle}>Follow</Text>
            <Text style={styles.modalSubtitle}>
              Personalize what you see and connect with creators
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint=""
            onPress={() => control.close()}
            hitSlop={8}
            style={({pressed}) => [
              styles.closeBtn,
              pressed && styles.pressedOpacity,
            ]}>
            <TimesIcon width={18} height={18} style={{color: '#EFF3F4'}} />
          </Pressable>
        </View>

        {/* 3 crisp X-style tabs */}
        <View style={styles.tabBar} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Topics"
            accessibilityHint=""
            onPress={() => setActiveTab('topics')}
            style={[
              styles.tabBtn,
              activeTab === 'topics' && styles.tabBtnActive,
            ]}>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'topics'
                  ? styles.tabLabelActive
                  : styles.tabLabelInactive,
              ]}>
              Topics
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="You may know"
            accessibilityHint=""
            onPress={() => setActiveTab('contacts')}
            style={[
              styles.tabBtn,
              activeTab === 'contacts' && styles.tabBtnActive,
            ]}>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'contacts'
                  ? styles.tabLabelActive
                  : styles.tabLabelInactive,
              ]}>
              You may know
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Suggested"
            accessibilityHint=""
            onPress={() => setActiveTab('suggested')}
            style={[
              styles.tabBtn,
              activeTab === 'suggested' && styles.tabBtnActive,
            ]}>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'suggested'
                  ? styles.tabLabelActive
                  : styles.tabLabelInactive,
              ]}>
              Suggested
            </Text>
          </Pressable>
        </View>

        {activeTab === 'topics' && (
          <View style={styles.tabContentWrap}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionHeader}>Topics</Text>
              <Text style={styles.sectionHelper}>Tap to explore or follow</Text>
            </View>

            <View style={styles.topicsGrid}>
              {FOLLOW_HUB_TOPICS.map(topic => {
                const isSelected =
                  localInterests.includes(topic.prefTag) ||
                  localInterests.includes(topic.id)
                return (
                  <View
                    key={topic.id}
                    style={[
                      styles.pillContainer,
                      isSelected
                        ? styles.pillContainerSelected
                        : styles.pillContainerUnselected,
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Explore ${topic.label}`}
                      accessibilityHint=""
                      onPress={() => onExploreTopic(topic)}
                      style={({pressed}) => [
                        styles.pillExploreBtn,
                        pressed && styles.pressedOpacity,
                      ]}>
                      <SearchIcon
                        width={13}
                        height={13}
                        style={{color: isSelected ? '#1D9BF0' : '#71767B'}}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.pillLabel,
                          isSelected
                            ? styles.pillLabelSelected
                            : styles.pillLabelUnselected,
                        ]}>
                        {topic.label}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        isSelected
                          ? `Unfollow ${topic.label}`
                          : `Follow ${topic.label}`
                      }
                      accessibilityHint=""
                      onPress={() => onToggleTopic(topic)}
                      hitSlop={6}
                      style={({pressed}) => [
                        styles.pillToggleBtn,
                        isSelected
                          ? styles.pillToggleBtnSelected
                          : styles.pillToggleBtnUnselected,
                        pressed && styles.pressedOpacity,
                      ]}>
                      {isSelected ? (
                        <CheckIcon
                          width={14}
                          height={14}
                          style={{color: '#FFFFFF'}}
                        />
                      ) : (
                        <PlusIcon
                          width={14}
                          height={14}
                          style={{color: '#71767B'}}
                        />
                      )}
                    </Pressable>
                  </View>
                )
              })}
            </View>

            <View style={styles.topicCreatorsPrompt}>
              <View style={a.flex_1}>
                <Text style={styles.topicCreatorsTitle}>
                  Looking for creators?
                </Text>
                <Text style={styles.topicCreatorsSubtitle}>
                  Browse suggested accounts curated based on your preferences
                </Text>
              </View>
              <Button
                label="View creators"
                accessibilityLabel="View creators"
                accessibilityHint=""
                size="small"
                variant="solid"
                color="secondary"
                onPress={() => setActiveTab('suggested')}>
                <ButtonText>View creators</ButtonText>
              </Button>
            </View>
          </View>
        )}

        {activeTab === 'contacts' && (
          <View style={styles.tabContentWrap}>
            <View style={styles.findPeopleCard}>
              <View style={styles.findPeopleHeader}>
                <View style={styles.findPeopleIconWrap}>
                  <PhoneIcon
                    width={22}
                    height={22}
                    style={{color: '#1D9BF0'}}
                  />
                </View>
                <View style={a.flex_1}>
                  <Text style={styles.findPeopleTitle}>Find your friends</Text>
                  <Text style={styles.findPeopleSubtitle}>
                    Sync your address book to discover people you already know
                    on QuantZing.
                  </Text>
                </View>
              </View>

              <View style={styles.buttonStack}>
                <Button
                  testID="followHubFindFriendsBtn"
                  label="Find your friends"
                  accessibilityLabel="Find your friends"
                  accessibilityHint=""
                  size="small"
                  variant="solid"
                  color="primary"
                  onPress={onPressFindPeople}
                  style={styles.findPeopleCta}>
                  <ButtonText style={styles.findPeopleCtaText}>
                    Find your friends
                  </ButtonText>
                </Button>

                <Button
                  testID="followHubAddPhoneBtn"
                  label="Add phone number"
                  accessibilityLabel="Add phone number"
                  accessibilityHint=""
                  size="small"
                  variant="outline"
                  color="secondary"
                  onPress={onPressFindPeople}
                  style={styles.secondaryCta}>
                  <ButtonText style={styles.secondaryCtaText}>
                    Add phone number
                  </ButtonText>
                </Button>
              </View>
            </View>

            <View style={styles.syncPreviewCard}>
              <Text style={styles.syncPreviewTitle}>Contact sync preview</Text>
              <View style={styles.syncFeatureRow}>
                <UserCircleIcon
                  width={18}
                  height={18}
                  style={{color: '#71767B', marginTop: 2}}
                />
                <View style={a.flex_1}>
                  <Text style={styles.syncFeatureText}>
                    Match with people from your phone contacts automatically
                  </Text>
                </View>
              </View>
              <View style={styles.syncFeatureRow}>
                <CheckIcon
                  width={18}
                  height={18}
                  style={{color: '#71767B', marginTop: 2}}
                />
                <View style={a.flex_1}>
                  <Text style={styles.syncFeatureText}>
                    Receive alerts when friends join QuantZing
                  </Text>
                </View>
              </View>
              <View style={styles.syncFeatureRow}>
                <ChevronRightIcon
                  width={18}
                  height={18}
                  style={{color: '#71767B', marginTop: 2}}
                />
                <View style={a.flex_1}>
                  <Text style={styles.syncFeatureText}>
                    Manage contact permissions and remove uploaded data anytime
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'suggested' && (
          <View style={styles.tabContentWrap}>
            <SuggestedCreatorsList onClose={() => control.close()} />
          </View>
        )}
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

function SuggestedCreatorsList({onClose}: {onClose: () => void}) {
  const {data, isLoading, error} = useGetSuggestedUsersForExploreQuery({
    limit: 15,
  })

  if (isLoading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" color="#1D9BF0" />
      </View>
    )
  }

  const actors = data?.actors ?? []
  if (error || actors.length === 0) {
    return (
      <View style={styles.emptyStateWrap}>
        <Text style={styles.emptyStateTitle}>No suggestions available</Text>
        <Text style={styles.emptyStateSubtitle}>
          Check back later for newly suggested accounts
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.creatorsList}>
      {actors.map((actor, idx) => (
        <CreatorRow key={actor.did} actor={actor} index={idx} onClose={onClose} />
      ))}
    </View>
  )
}

function CreatorRow({
  actor,
  index,
  onClose,
}: {
  actor: app.bsky.actor.defs.ProfileView
  index: number
  onClose: () => void
}) {
  const navigation = useNavigation<NavigationProp>()
  const profile = useProfileShadow(actor)
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    profile,
    'ExploreSuggestedAccounts',
    index,
  )
  const isFollowing = Boolean(profile.viewer?.following)
  const displayName = sanitizeDisplayName(
    profile.displayName || sanitizeHandle(profile.handle, '@'),
  )

  const onPressProfile = useCallback(() => {
    onClose()
    navigation.navigate('Profile', {name: profile.did})
  }, [navigation, profile.did, onClose])

  const onToggleFollow = async (e: GestureResponderEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      if (isFollowing) {
        await queueUnfollow()
        Toast.show(`No longer following ${displayName}`)
      } else {
        await queueFollow()
        Toast.show(`Following ${displayName}`)
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        Toast.show('An issue occurred, please try again.', {type: 'error'})
      }
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${displayName}'s profile`}
      accessibilityHint=""
      onPress={onPressProfile}
      style={({pressed}) => [
        styles.creatorRow,
        pressed && styles.creatorRowPressed,
      ]}>
      <UserAvatar
        avatar={profile.avatar}
        size={40}
        type={profile.associated?.labeler ? 'labeler' : 'user'}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={styles.creatorDisplayName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.creatorHandle} numberOfLines={1}>
          {sanitizeHandle(profile.handle, '@')}
        </Text>
        {profile.description ? (
          <Text style={styles.creatorBio} numberOfLines={2}>
            {profile.description}
          </Text>
        ) : null}
      </View>
      <Button
        label={isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
        accessibilityLabel={
          isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`
        }
        accessibilityHint=""
        size="small"
        variant="solid"
        color={isFollowing ? 'secondary' : 'primary'}
        onPress={onToggleFollow}
        style={styles.followActionBtn}>
        <ButtonText style={isFollowing ? styles.followingText : styles.followText}>
          {isFollowing ? 'Following' : 'Follow'}
        </ButtonText>
      </Button>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  dialogOuter: {
    backgroundColor: '#000000',
  },
  dialogContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#EFF3F4',
    lineHeight: 24,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#71767B',
    marginTop: 2,
    lineHeight: 18,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16181C',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2F3336',
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#1D9BF0',
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  tabLabelActive: {
    color: '#EFF3F4',
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: '#71767B',
    fontWeight: '500',
  },
  tabContentWrap: {
    gap: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EFF3F4',
    letterSpacing: 0.2,
  },
  sectionHelper: {
    fontSize: 12,
    color: '#71767B',
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillContainerUnselected: {
    backgroundColor: '#16181C',
    borderColor: '#2F3336',
  },
  pillContainerSelected: {
    backgroundColor: 'rgba(29, 155, 240, 0.14)',
    borderColor: '#1D9BF0',
  },
  pillExploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  pillLabelUnselected: {
    color: '#E7E9EA',
  },
  pillLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pillToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  pillToggleBtnUnselected: {
    borderLeftColor: '#2F3336',
  },
  pillToggleBtnSelected: {
    backgroundColor: '#1D9BF0',
    borderLeftColor: '#1D9BF0',
  },
  topicCreatorsPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16181C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2F3336',
    padding: 12,
    gap: 12,
    marginTop: 6,
  },
  topicCreatorsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  topicCreatorsSubtitle: {
    fontSize: 12,
    color: '#71767B',
    marginTop: 2,
  },
  findPeopleCard: {
    backgroundColor: '#16181C',
    borderColor: '#2F3336',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  findPeopleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  findPeopleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(29, 155, 240, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  findPeopleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EFF3F4',
    lineHeight: 20,
  },
  findPeopleSubtitle: {
    fontSize: 13,
    color: '#71767B',
    lineHeight: 18,
    marginTop: 3,
  },
  buttonStack: {
    gap: 8,
  },
  findPeopleCta: {
    borderRadius: 9999,
    backgroundColor: '#1D9BF0',
    alignSelf: 'stretch',
    justifyContent: 'center',
    height: 40,
  },
  findPeopleCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryCta: {
    borderRadius: 9999,
    borderColor: '#536471',
    alignSelf: 'stretch',
    justifyContent: 'center',
    height: 38,
  },
  secondaryCtaText: {
    color: '#EFF3F4',
    fontWeight: '700',
    fontSize: 14,
  },
  syncPreviewCard: {
    backgroundColor: '#16181C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2F3336',
    padding: 14,
    gap: 12,
  },
  syncPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
    marginBottom: 2,
  },
  syncFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  syncFeatureText: {
    fontSize: 13,
    color: '#8B98A5',
    lineHeight: 18,
  },
  loaderWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#71767B',
    textAlign: 'center',
  },
  creatorsList: {
    gap: 12,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#16181C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2F3336',
    gap: 12,
  },
  creatorRowPressed: {
    backgroundColor: '#202327',
  },
  creatorDisplayName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  creatorHandle: {
    fontSize: 12,
    color: '#71767B',
  },
  creatorBio: {
    fontSize: 12,
    color: '#8B98A5',
    lineHeight: 16,
  },
  followActionBtn: {
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  followText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  followingText: {
    color: '#EFF3F4',
    fontWeight: '700',
    fontSize: 13,
  },
  pressedOpacity: {
    opacity: 0.75,
  },
})
