import {useCallback, useMemo} from 'react'
import {useLingui} from '@lingui/react/macro'

import {getLocalizedFeedName} from '#/lib/strings/feed-names'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {type RenderTabBarFnProps} from '#/view/com/pager/Pager'
import {TabBar} from '../pager/TabBar'
import {HomeHeaderLayout} from './HomeHeaderLayout'

export function HomeHeader(
  props: RenderTabBarFnProps & {
    testID?: string
    onPressSelected: () => void
    feeds: Pick<FeedSourceInfo, 'displayName' | 'uri'>[]
  },
) {
  const {feeds, onSelect: onSelectProp} = props
  const {i18n} = useLingui()

  const items = useMemo(() => {
    return feeds.map(f => getLocalizedFeedName(f, i18n))
  }, [i18n, feeds])

  const onSelect = useCallback(
    (index: number) => {
      if (onSelectProp) {
        onSelectProp(index)
      }
    },
    [onSelectProp],
  )

  return (
    <HomeHeaderLayout tabBarAnchor={props.tabBarAnchor}>
      <TabBar
        key={items.join(',')}
        onPressSelected={props.onPressSelected}
        selectedPage={props.selectedPage}
        onSelect={onSelect}
        testID={props.testID}
        items={items}
        dragProgress={props.dragProgress}
        dragState={props.dragState}
        transparent
      />
    </HomeHeaderLayout>
  )
}
