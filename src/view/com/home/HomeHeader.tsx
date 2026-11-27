import {useCallback, useMemo} from 'react'
import {Pressable} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {
  DISCOVER_FEED_URI,
  HITSLOP_10,
  TIMELINE_SAVED_FEED,
} from '#/lib/constants'
import {getLocalizedFeedName} from '#/lib/strings/feed-names'
import {getTopicIcon} from '#/state/preferences/snoozed-topics'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {HomeHeaderLayout} from '#/view/com/home/HomeHeaderLayout'
import {SnoozeTopicsModal} from '#/view/com/home/SnoozeTopicsModal'
import {TimelinesModal} from '#/view/com/home/TimelinesModal'
import {type RenderTabBarFnProps} from '#/view/com/pager/Pager'
import {TabBar} from '#/view/com/pager/TabBar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronBottomIcon} from '#/components/icons/Chevron'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'

export function HomeHeader(
  props: RenderTabBarFnProps & {
    testID?: string
    onPressSelected: (index?: number) => void
    feeds: Pick<FeedSourceInfo, 'displayName' | 'uri'>[]
  },
) {
  const {feeds, onSelect: onSelectProp} = props
  const t = useTheme()
  const {_} = useLingui()
  const {i18n} = useLingui()
  const snoozeTopicsControl = Dialog.useDialogControl()
  const timelinesControl = Dialog.useDialogControl()

  const items = useMemo(() => {
    return feeds.map(f => {
      if (f.displayName === 'Discover' || f.uri === DISCOVER_FEED_URI) {
        return 'For you'
      }
      return getLocalizedFeedName(f, i18n)
    })
  }, [i18n, feeds])

  const onSelect = useCallback(
    (index: number) => {
      if (onSelectProp) {
        onSelectProp(index)
      }
    },
    [onSelectProp],
  )

  const onPressSelected = useCallback(
    (index: number) => {
      if (index === 0) {
        snoozeTopicsControl.open()
      } else {
        props.onPressSelected(index)
      }
    },
    [props, snoozeTopicsControl],
  )

  const renderItemSuffix = useCallback(
    (index: number, isActive: boolean) => {
      if (index === 0 && isActive) {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Snooze topics"
            accessibilityHint=""
            hitSlop={HITSLOP_10}
            onPress={e => {
              e.stopPropagation()
              snoozeTopicsControl.open()
            }}
            style={[a.justify_center, a.align_center, a.pl_2xs]}>
            <ChevronBottomIcon
              size="xs"
              style={{color: t.palette.primary_500}}
            />
          </Pressable>
        )
      }
      return null
    },
    [snoozeTopicsControl, t],
  )

  const renderItemPrefix = useCallback(
    (index: number, isActive: boolean) => {
      if (!isActive) return null
      const feed = feeds[index]
      if (!feed) return null

      const isForYouOrFollowing =
        feed.displayName === 'For you' ||
        feed.displayName === 'Following' ||
        feed.uri === TIMELINE_SAVED_FEED.value ||
        feed.uri === DISCOVER_FEED_URI
      if (isForYouOrFollowing) return null

      const IconComponent = getTopicIcon(feed.displayName || feed.uri)
      if (IconComponent) {
        return (
          <IconComponent
            size="xs"
            style={{color: t.palette.primary_500, marginRight: 2}}
          />
        )
      }
      return null
    },
    [feeds, t],
  )

  const trailingSlot = useMemo(() => {
    return (
      <Button
        testID="homeHeaderTimelinesBtn"
        label={_(msg`Timelines and pinned topics`)}
        accessibilityLabel="Timelines"
        accessibilityHint=""
        size="small"
        variant="ghost"
        color="secondary"
        shape="round"
        hitSlop={HITSLOP_10}
        onPress={() => timelinesControl.open()}
        style={[
          a.justify_center,
          a.align_center,
          {width: 32, height: 32, backgroundColor: 'transparent'},
        ]}>
        <ButtonIcon icon={PlusIcon} size="md" />
      </Button>
    )
  }, [_, timelinesControl])

  return (
    <>
      <HomeHeaderLayout tabBarAnchor={props.tabBarAnchor}>
        <TabBar
          key={items.join(',')}
          onPressSelected={onPressSelected}
          selectedPage={props.selectedPage}
          onSelect={onSelect}
          testID={props.testID}
          items={items}
          dragProgress={props.dragProgress}
          dragState={props.dragState}
          trailingSlot={trailingSlot}
          renderItemPrefix={renderItemPrefix}
          renderItemSuffix={renderItemSuffix}
          transparent
        />
      </HomeHeaderLayout>
      <SnoozeTopicsModal control={snoozeTopicsControl} />
      <TimelinesModal control={timelinesControl} />
    </>
  )
}
