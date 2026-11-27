import {useCallback} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {SNOOZE_TOPICS, useSnoozedTopics} from '#/state/preferences/snoozed-topics'
import {atoms as a, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

export function SnoozeTopicsModal({
  control,
}: {
  control: Dialog.DialogControlProps
}) {
  const insets = useSafeAreaInsets()
  const {isSnoozed, toggleSnoozeTopic, resetSnoozedTopics, snoozedTopics} =
    useSnoozedTopics()

  const snoozedCount = Object.keys(snoozedTopics).filter(id => isSnoozed(id)).length

  const handleToggle = useCallback(
    (topicId: string, label: string) => {
      const willSnooze = !isSnoozed(topicId)
      toggleSnoozeTopic(topicId)
      if (willSnooze) {
        Toast.show(`Snoozed ${label} for 1 day`)
      } else {
        Toast.show(`Unsnoozed ${label}`)
      }
    },
    [isSnoozed, toggleSnoozeTopic],
  )

  const handleReset = useCallback(() => {
    resetSnoozedTopics()
    Toast.show('Reset all snoozed topics')
  }, [resetSnoozedTopics])

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Snooze topics"
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
            <Text style={styles.modalTitle}>Snooze topics</Text>
            <Text style={styles.modalSubtitle}>
              Select topics to hide for 1 day
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

        <View style={styles.noticeCard}>
          <ClockIcon width={18} height={18} style={{color: '#1D9BF0', marginTop: 1}} />
          <View style={a.flex_1}>
            <Text style={styles.noticeText}>
              Posts from snoozed topics will be hidden from your For you feed for 24 hours.
            </Text>
          </View>
        </View>

        <View style={styles.pillsWrap}>
          {SNOOZE_TOPICS.map(topic => {
            const snoozed = isSnoozed(topic.id)
            return (
              <Pressable
                key={topic.id}
                accessibilityRole="button"
                accessibilityLabel={
                  snoozed
                    ? `Unsnooze ${topic.label}`
                    : `Snooze ${topic.label} for 1 day`
                }
                accessibilityHint=""
                onPress={() => handleToggle(topic.id, topic.label)}
                style={({pressed}) => [
                  styles.pill,
                  snoozed ? styles.pillSelected : styles.pillUnselected,
                  pressed && styles.pressedOpacity,
                ]}>
                <View style={styles.pillIconWrap}>
                  {snoozed ? (
                    <CheckIcon width={14} height={14} style={{color: '#FFFFFF'}} />
                  ) : (
                    <PlusIcon width={14} height={14} style={{color: '#71767B'}} />
                  )}
                </View>
                <Text
                  style={[
                    styles.pillLabel,
                    snoozed ? styles.pillLabelSelected : styles.pillLabelUnselected,
                  ]}>
                  {topic.label}
                </Text>
                {snoozed ? (
                  <Text style={styles.pillBadge}>1d</Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        <View style={styles.divider} />

        <View style={styles.actionRow}>
          <Button
            label="Reset"
            accessibilityLabel="Reset snoozed topics"
            accessibilityHint=""
            size="small"
            variant="ghost"
            color="secondary"
            disabled={snoozedCount === 0}
            onPress={handleReset}
            style={styles.resetBtn}>
            <ButtonText style={snoozedCount === 0 ? styles.resetTextDisabled : styles.resetText}>
              Reset
            </ButtonText>
          </Button>

          <Button
            label="Done"
            accessibilityLabel="Done"
            accessibilityHint=""
            size="small"
            variant="solid"
            color="primary"
            onPress={() => control.close()}
            style={styles.doneBtn}>
            <ButtonText style={styles.doneText}>Done</ButtonText>
          </Button>
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
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#16181C',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2F3336',
  },
  noticeText: {
    fontSize: 13,
    color: '#8B98A5',
    lineHeight: 18,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  pillUnselected: {
    backgroundColor: '#16181C',
    borderColor: '#2F3336',
  },
  pillSelected: {
    backgroundColor: '#1D9BF0',
    borderColor: '#1D9BF0',
  },
  pillIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  pillLabelUnselected: {
    color: '#EFF3F4',
    fontWeight: '600',
  },
  pillLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pillBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2F3336',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resetBtn: {
    paddingHorizontal: 16,
    height: 38,
  },
  resetText: {
    color: '#F4212E',
    fontWeight: '600',
    fontSize: 14,
  },
  resetTextDisabled: {
    color: '#71767B',
    fontWeight: '600',
    fontSize: 14,
  },
  doneBtn: {
    borderRadius: 9999,
    backgroundColor: '#EFF3F4',
    paddingHorizontal: 22,
    height: 38,
    justifyContent: 'center',
  },
  doneText: {
    color: '#0F1419',
    fontWeight: '700',
    fontSize: 14,
  },
  pressedOpacity: {
    opacity: 0.75,
  },
})
