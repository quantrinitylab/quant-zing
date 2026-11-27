import {useCallback, useMemo, useState} from 'react'
import {Pressable, StyleSheet, TextInput, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {
  TIMELINES_TOPICS,
  usePinnedTopics,
} from '#/state/preferences/snoozed-topics'
import {atoms as a, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {
  ArrowLeft_Stroke2_Corner0_Rounded as ArrowUpIcon,
  ArrowRight_Stroke2_Corner0_Rounded as ArrowDownIcon,
} from '#/components/icons/Arrow'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {Pin_Stroke2_Corner0_Rounded as PinIcon} from '#/components/icons/Pin'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

export function TimelinesModal({
  control,
}: {
  control: Dialog.DialogControlProps
}) {
  const insets = useSafeAreaInsets()
  const {pinnedTopicIds, isPinned, pinTopic, unpinTopic, reorderPinnedTopics} =
    usePinnedTopics()
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditingPinned, setIsEditingPinned] = useState(false)

  const filteredTopics = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return TIMELINES_TOPICS
    return TIMELINES_TOPICS.filter(
      t =>
        t.label.toLowerCase().includes(q) ||
        t.query.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const pinnedTopicsList = useMemo(() => {
    return pinnedTopicIds
      .map(id => TIMELINES_TOPICS.find(t => t.id === id))
      .filter((t): t is (typeof TIMELINES_TOPICS)[number] => Boolean(t))
  }, [pinnedTopicIds])

  const onTogglePin = useCallback(
    (topicId: string, label: string) => {
      if (isPinned(topicId)) {
        unpinTopic(topicId)
        Toast.show(`Unpinned ${label} tab`)
      } else {
        pinTopic(topicId)
        Toast.show(`Pinned ${label} to tabs`)
      }
    },
    [isPinned, pinTopic, unpinTopic],
  )

  const onMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return
      const next = [...pinnedTopicIds]
      const temp = next[index - 1]
      next[index - 1] = next[index]
      next[index] = temp
      reorderPinnedTopics(next)
    },
    [pinnedTopicIds, reorderPinnedTopics],
  )

  const onMoveDown = useCallback(
    (index: number) => {
      if (index >= pinnedTopicIds.length - 1) return
      const next = [...pinnedTopicIds]
      const temp = next[index + 1]
      next[index + 1] = next[index]
      next[index] = temp
      reorderPinnedTopics(next)
    },
    [pinnedTopicIds, reorderPinnedTopics],
  )

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Timelines"
        style={[
          styles.dialogOuter,
          web({maxWidth: 540, marginHorizontal: 'auto'}),
        ]}
        contentContainerStyle={[
          styles.dialogContent,
          {paddingBottom: Math.max(insets.bottom, 24) + 16},
        ]}>
        <View style={styles.modalHeader}>
          <View style={a.flex_1}>
            <Text style={styles.modalTitle}>Timelines</Text>
            <Text style={styles.modalSubtitle}>
              Pinned topics appear as tabs at the top of Home
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

        {/* Search input */}
        <View style={styles.searchBar}>
          <SearchIcon width={16} height={16} style={{color: '#71767B'}} />
          <TextInput
            accessibilityRole="search"
            accessibilityLabel="Search topics"
            accessibilityHint=""
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search topics"
            placeholderTextColor="#71767B"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              accessibilityHint=""
              onPress={() => setSearchQuery('')}
              hitSlop={6}
              style={styles.clearSearchBtn}>
              <TimesIcon width={14} height={14} style={{color: '#71767B'}} />
            </Pressable>
          ) : null}
        </View>

        {/* Pinned Section */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleLeft}>
              <PinIcon width={16} height={16} style={{color: '#1D9BF0'}} />
              <Text style={styles.sectionHeader}>Pinned</Text>
              {pinnedTopicsList.length > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {pinnedTopicsList.length}
                  </Text>
                </View>
              ) : null}
            </View>

            {pinnedTopicsList.length > 0 ? (
              <Button
                label={isEditingPinned ? 'Done' : 'Edit'}
                accessibilityLabel={isEditingPinned ? 'Done editing pinned' : 'Edit pinned tabs'}
                accessibilityHint=""
                size="tiny"
                variant="ghost"
                color="primary"
                onPress={() => setIsEditingPinned(prev => !prev)}>
                <ButtonText style={styles.editBtnText}>
                  {isEditingPinned ? 'Done' : 'Edit'}
                </ButtonText>
              </Button>
            ) : null}
          </View>

          {pinnedTopicsList.length === 0 ? (
            <View style={styles.emptyPinnedCard}>
              <Text style={styles.emptyPinnedTitle}>Nothing yet here</Text>
              <Text style={styles.emptyPinnedSubtitle}>
                Pin topics from below to see them as tabs next to Following on Home.
              </Text>
            </View>
          ) : (
            <View style={styles.pinnedChipsWrap}>
              {pinnedTopicsList.map((topic, idx) => {
                const IconComponent = topic.icon
                return (
                  <View key={topic.id} style={styles.pinnedChip}>
                    <IconComponent width={14} height={14} style={{color: '#1D9BF0'}} />
                    <Text style={styles.pinnedChipLabel}>{topic.label}</Text>

                    {isEditingPinned ? (
                      <View style={styles.chipActions}>
                        {idx > 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${topic.label} left`}
                            accessibilityHint=""
                            hitSlop={6}
                            onPress={() => onMoveUp(idx)}
                            style={styles.chipReorderBtn}>
                            <ArrowUpIcon width={12} height={12} style={{color: '#71767B'}} />
                          </Pressable>
                        ) : null}
                        {idx < pinnedTopicsList.length - 1 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${topic.label} right`}
                            accessibilityHint=""
                            hitSlop={6}
                            onPress={() => onMoveDown(idx)}
                            style={styles.chipReorderBtn}>
                            <ArrowDownIcon width={12} height={12} style={{color: '#71767B'}} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${topic.label} from pinned`}
                          accessibilityHint=""
                          hitSlop={6}
                          onPress={() => onTogglePin(topic.id, topic.label)}
                          style={styles.chipRemoveBtn}>
                          <TimesIcon width={12} height={12} style={{color: '#F4212E'}} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Unpin ${topic.label}`}
                        accessibilityHint=""
                        hitSlop={6}
                        onPress={() => onTogglePin(topic.id, topic.label)}
                        style={styles.chipRemoveBtn}>
                        <TimesIcon width={12} height={12} style={{color: '#71767B'}} />
                      </Pressable>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Topics List */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionHeader}>Topics</Text>
            <Text style={styles.sectionHelper}>
              Tap + to pin to your timeline tabs
            </Text>
          </View>

          <View style={styles.topicsList}>
            {filteredTopics.map(topic => {
              const pinned = isPinned(topic.id)
              const IconComponent = topic.icon
              return (
                <View key={topic.id} style={styles.topicRow}>
                  <View style={styles.topicRowLeft}>
                    <View style={styles.topicIconCircle}>
                      <IconComponent width={18} height={18} style={{color: '#1D9BF0'}} />
                    </View>
                    <View style={a.flex_1}>
                      <Text style={styles.topicLabel}>{topic.label}</Text>
                      <Text style={styles.topicQuery} numberOfLines={1}>
                        {topic.query}
                      </Text>
                    </View>
                  </View>

                  <Button
                    label={pinned ? `Unpin ${topic.label}` : `Pin ${topic.label}`}
                    accessibilityLabel={
                      pinned ? `Unpin ${topic.label}` : `Pin ${topic.label}`
                    }
                    accessibilityHint=""
                    size="small"
                    variant={pinned ? 'solid' : 'outline'}
                    color={pinned ? 'primary' : 'secondary'}
                    shape="round"
                    onPress={() => onTogglePin(topic.id, topic.label)}
                    style={styles.pinBtn}>
                    {pinned ? (
                      <CheckIcon width={16} height={16} style={{color: '#FFFFFF'}} />
                    ) : (
                      <PlusIcon width={16} height={16} style={{color: '#EFF3F4'}} />
                    )}
                  </Button>
                </View>
              )
            })}
          </View>
        </View>

        <View style={styles.divider} />

        <Button
          label="Done"
          accessibilityLabel="Done"
          accessibilityHint=""
          size="small"
          variant="solid"
          color="primary"
          onPress={() => control.close()}
          style={styles.doneBtn}>
          <ButtonText style={styles.doneBtnText}>Done</ButtonText>
        </Button>
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
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16181C',
    borderRadius: 9999,
    paddingHorizontal: 14,
    height: 40,
    borderWidth: 1,
    borderColor: '#2F3336',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#EFF3F4',
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionWrap: {
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  countBadge: {
    backgroundColor: '#16181C',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#2F3336',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D9BF0',
  },
  editBtnText: {
    fontSize: 13,
    color: '#1D9BF0',
    fontWeight: '600',
  },
  emptyPinnedCard: {
    backgroundColor: '#16181C',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F3336',
    alignItems: 'center',
    gap: 4,
  },
  emptyPinnedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  emptyPinnedSubtitle: {
    fontSize: 12,
    color: '#71767B',
    textAlign: 'center',
    lineHeight: 16,
  },
  pinnedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pinnedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16181C',
    borderRadius: 9999,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: '#2F3336',
    gap: 8,
  },
  pinnedChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EFF3F4',
  },
  chipActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipReorderBtn: {
    padding: 2,
  },
  chipRemoveBtn: {
    padding: 2,
  },
  topicsList: {
    gap: 8,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16181C',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2F3336',
    gap: 12,
  },
  topicRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  topicIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(29, 155, 240, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EFF3F4',
  },
  topicQuery: {
    fontSize: 12,
    color: '#71767B',
    marginTop: 1,
  },
  pinBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2F3336',
  },
  doneBtn: {
    borderRadius: 9999,
    backgroundColor: '#EFF3F4',
    height: 40,
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#0F1419',
    fontWeight: '700',
    fontSize: 14,
  },
  pressedOpacity: {
    opacity: 0.75,
  },
})
