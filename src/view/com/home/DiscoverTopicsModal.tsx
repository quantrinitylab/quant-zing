import {useCallback, useEffect, useMemo, useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {currentDatetimeString} from '@atproto/syntax'
import {setInterestsPref} from '@bsky/sdk'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {type NavigationProp} from '#/lib/routes/types'
import {logger} from '#/logger'
import {
  preferencesQueryKey,
  usePreferencesQuery,
} from '#/state/queries/preferences'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {createGetSuggestedFeedsQueryKey} from '#/state/queries/trending/useGetSuggestedFeedsQuery'
import {createGetSuggestedUsersForDiscoverQueryKey} from '#/state/queries/trending/useGetSuggestedUsersForDiscoverQuery'
import {createGetSuggestedUsersForExploreQueryKey} from '#/state/queries/trending/useGetSuggestedUsersForExploreQuery'
import {createGetSuggestedUsersForSeeMoreQueryKey} from '#/state/queries/trending/useGetSuggestedUsersForSeeMoreQuery'
import {createSuggestedStarterPacksQueryKey} from '#/state/queries/useSuggestedStarterPacksQuery'
import {usePdsClient, useSession} from '#/state/session'
import {atoms as a, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import {Hashtag_Stroke2_Corner0_Rounded as HashtagIcon} from '#/components/icons/Hashtag'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import {UserCircle_Stroke2_Corner0_Rounded as UserCircleIcon} from '#/components/icons/UserCircle'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'

export type TopicItem = {
  id: string
  label: string
  prefTag: string
  query: string
}

export const DISCOVER_TOPICS: TopicItem[] = [
  {id: 'politics', label: 'Politics', prefTag: 'politics', query: 'politics'},
  {id: 'soccer', label: 'Soccer', prefTag: 'sports', query: 'soccer'},
  {id: 'technology', label: 'Technology', prefTag: 'tech', query: 'technology'},
  {id: 'art', label: 'Art', prefTag: 'art', query: 'art'},
  {
    id: 'movies-tv',
    label: 'Movies & TV',
    prefTag: 'movies',
    query: 'movies TV',
  },
  {id: 'ai-agents', label: 'AI & Agents', prefTag: 'dev', query: 'AI agents'},
  {id: 'sports', label: 'Sports', prefTag: 'sports', query: 'sports'},
  {id: 'music', label: 'Music', prefTag: 'music', query: 'music'},
  {id: 'finance', label: 'Finance', prefTag: 'finance', query: 'finance'},
  {id: 'gaming', label: 'Gaming', prefTag: 'gaming', query: 'gaming'},
  {id: 'science', label: 'Science', prefTag: 'science', query: 'science'},
  {id: 'news', label: 'News', prefTag: 'news', query: 'news'},
]

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

  const onPressManageFeeds = useCallback(() => {
    ax.metric('nav:click', {item: 'feeds', surface: 'topBar'})
    control.close()
    navigation.navigate('Feeds')
  }, [control, navigation, ax])

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Discover topics and find people"
        style={[
          styles.dialogOuter,
          web({maxWidth: 520, marginHorizontal: 'auto'}),
        ]}
        contentContainerStyle={[
          styles.dialogContent,
          {paddingBottom: Math.max(insets.bottom, 24) + 16},
        ]}>
        <View style={styles.modalHeader}>
          <View style={a.flex_1}>
            <Text style={styles.modalTitle}>Discover</Text>
            <Text style={styles.modalSubtitle}>
              Follow topics and find people to personalize your feed
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

        <View style={styles.divider} />

        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionHeader}>Follow Topics</Text>
            <Text style={styles.sectionHelper}>Tap to explore or follow</Text>
          </View>

          <View style={styles.topicsGrid}>
            {DISCOVER_TOPICS.map(topic => {
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
        </View>

        <View style={styles.divider} />

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>Find People</Text>
          <View style={styles.findPeopleCard}>
            <View style={styles.findPeopleHeader}>
              <View style={styles.findPeopleIconWrap}>
                <UserCircleIcon
                  width={24}
                  height={24}
                  style={{color: '#1D9BF0'}}
                />
              </View>
              <View style={a.flex_1}>
                <Text style={styles.findPeopleTitle}>Find people you know</Text>
                <Text style={styles.findPeopleSubtitle}>
                  Sync contacts to find friends and connect with people you know
                  on QuantZing.
                </Text>
              </View>
            </View>
            <Button
              testID="discoverFindPeopleBtn"
              label="Allow Contacts / Find People"
              size="small"
              variant="solid"
              color="primary"
              onPress={onPressFindPeople}
              style={styles.findPeopleCta}>
              <ButtonText style={styles.findPeopleCtaText}>
                Allow Contacts / Find People
              </ButtonText>
            </Button>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeader}>Feeds</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage Feeds"
            accessibilityHint=""
            onPress={onPressManageFeeds}
            style={({pressed}) => [
              styles.manageFeedsRow,
              pressed && {backgroundColor: '#202327'},
            ]}>
            <View style={styles.manageFeedsLeft}>
              <View style={styles.manageFeedsIconWrap}>
                <HashtagIcon
                  width={20}
                  height={20}
                  style={{color: '#1D9BF0'}}
                />
              </View>
              <View style={a.flex_1}>
                <Text style={styles.manageFeedsTitle}>Manage Feeds</Text>
                <Text style={styles.manageFeedsSubtitle}>
                  Browse, pin, and organize custom feeds and algorithms
                </Text>
              </View>
            </View>
            <ChevronRightIcon
              width={18}
              height={18}
              style={{color: '#71767B'}}
            />
          </Pressable>
        </View>
      </Dialog.ScrollableInner>
    </Dialog.Outer>
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
    paddingBottom: 14,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2F3336',
    marginVertical: 14,
  },
  sectionWrap: {
    gap: 12,
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
  findPeopleCard: {
    backgroundColor: '#16181C',
    borderColor: '#2F3336',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
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
    fontSize: 15,
    fontWeight: '700',
    color: '#EFF3F4',
    lineHeight: 20,
  },
  findPeopleSubtitle: {
    fontSize: 13,
    color: '#71767B',
    lineHeight: 18,
    marginTop: 2,
  },
  findPeopleCta: {
    borderRadius: 9999,
    backgroundColor: '#1D9BF0',
    alignSelf: 'stretch',
    justifyContent: 'center',
    height: 38,
  },
  findPeopleCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  manageFeedsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16181C',
    borderColor: '#2F3336',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  manageFeedsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  manageFeedsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(29, 155, 240, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageFeedsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  manageFeedsSubtitle: {
    fontSize: 12,
    color: '#71767B',
    marginTop: 1,
  },
  pressedOpacity: {
    opacity: 0.75,
  },
})
