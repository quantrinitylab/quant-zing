import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {
  type NavigationProp,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {DISCOVER_FEED_URI, VIDEO_FEED_URIS} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getRootNavigation, getTabState, TabState} from '#/lib/routes/helpers'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {listenSoftReset} from '#/state/events'
import {useSetHomeBadge} from '#/state/home-badge'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {RQKEY_ROOT} from '#/state/queries/post-feed'
import {useSession} from '#/state/session'
import {FAB} from '#/view/com/util/fab/FAB'
import {type ListMethods} from '#/view/com/util/List'
import {MainScrollProvider} from '#/view/com/util/MainScrollProvider'
import {useTheme} from '#/alf'
import {useHeaderOffset} from '#/components/hooks/useHeaderOffset'
import {PlusLarge_Stroke2_Corner0_Rounded} from '#/components/icons/Plus'
import {NewPostsPill, type NewPostsPillAuthor} from '#/components/NewPostsPill'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'
import {FeedFeedbackProvider, useFeedFeedback} from '#/features/feedFeedback'
import {app} from '#/lexicons'
import {PostFeed, type PostFeedRef} from './PostFeed'
import {type FeedDescriptor, type FeedParams, RQKEY as FEED_RQKEY} from './queries/postFeed'

const POLL_FREQ = 60e3 // 60sec

export function FeedPage({
  testID,
  isPageFocused,
  isPageAdjacent,
  feed,
  feedParams,
  renderEmptyState,
  renderEndOfFeed,
  savedFeedConfig,
  feedInfo,
}: {
  testID?: string
  feed: FeedDescriptor
  feedParams?: FeedParams
  isPageFocused: boolean
  isPageAdjacent: boolean
  renderEmptyState: () => JSX.Element
  renderEndOfFeed?: () => JSX.Element
  savedFeedConfig?: app.bsky.actor.defs.SavedFeed
  feedInfo: FeedSourceInfo
}) {
  const ax = useAnalytics()
  const {hasSession} = useSession()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp<CommonNavigatorParams>>()
  const queryClient = useQueryClient()
  const isScreenFocused = useIsFocused()
  const {openComposer} = useOpenComposer()
  const [_isScrolledDown, setIsScrolledDown] = useState(false)
  const headerOffset = useHeaderOffset()
  const feedFeedback = useFeedFeedback(feedInfo, hasSession, 'feed')
  const scrollElRef = useRef<ListMethods>(null)
  const feedRef = useRef<PostFeedRef>(null)
  const [hasNew, setHasNew] = useState(false)
  const setHomeBadge = useSetHomeBadge()
  const isVideoFeed = useMemo(() => {
    const isBskyVideoFeed = VIDEO_FEED_URIS.includes(feedInfo.uri)
    const feedIsVideoMode =
      feedInfo.contentMode === app.bsky.feed.defs.contentModeVideo.value
    const _isVideoFeed = isBskyVideoFeed || feedIsVideoMode
    return IS_NATIVE && _isVideoFeed
  }, [feedInfo])
  const t = useTheme()

  const latestAuthors = useMemo(() => {
    if (!hasNew) return []
    try {
      type CachedFeedPages = {
        pages?: Array<{
          slices?: Array<{
            items?: Array<{post?: {author?: {did: string; avatar?: string}}}>
          }>
          feed?: Array<{post?: {author?: {did: string; avatar?: string}}}>
        }>
      }
      let cached = queryClient.getQueryData<CachedFeedPages>(
        FEED_RQKEY(feed, feedParams),
      )
      if (!cached) {
        cached = queryClient.getQueryData<CachedFeedPages>([
          RQKEY_ROOT,
          feed,
          feedParams || {},
        ])
      }
      const authors: NewPostsPillAuthor[] = []
      const seen = new Set<string>()

      const addAuthor = (author?: {did: string; avatar?: string}) => {
        if (!author?.did || !author?.avatar || seen.has(author.did)) return
        seen.add(author.did)
        authors.push({did: author.did, avatar: author.avatar})
      }

      if (cached?.pages) {
        for (const page of cached.pages) {
          if (Array.isArray(page.slices)) {
            for (const slice of page.slices) {
              if (Array.isArray(slice.items)) {
                for (const item of slice.items) {
                  addAuthor(item.post?.author)
                  if (authors.length >= 3) return authors
                }
              }
            }
          }
          if (Array.isArray(page.feed)) {
            for (const item of page.feed) {
              addAuthor(item.post?.author)
              if (authors.length >= 3) return authors
            }
          }
        }
      }
      return authors
    } catch {
      return []
    }
  }, [hasNew, queryClient, feed, feedParams])

  useEffect(() => {
    if (isPageFocused) {
      setHomeBadge(hasNew)
    }
  }, [isPageFocused, hasNew, setHomeBadge])

  const scrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: IS_NATIVE,
      offset: -headerOffset,
    })
  }, [headerOffset])

  const onSoftReset = useCallback(() => {
    const isScreenFocused =
      getTabState(getRootNavigation(navigation).getState(), 'Home') ===
      TabState.InsideAtRoot
    if (isScreenFocused && isPageFocused) {
      scrollToTop()
      void feedRef.current?.refresh()
      setHasNew(false)
      ax.metric('feed:refresh', {
        feedType: feed.split('|')[0],
        feedUrl: feed,
        reason: 'soft-reset',
      })
    }
  }, [ax, navigation, isPageFocused, scrollToTop, feed])

  // fires when page within screen is activated/deactivated
  useEffect(() => {
    if (!isPageFocused) {
      return
    }
    return listenSoftReset(onSoftReset)
  }, [onSoftReset, isPageFocused])

  const onPressCompose = useCallback(() => {
    openComposer({logContext: 'Fab'})
  }, [openComposer])

  const onPressLoadLatest = useCallback(() => {
    scrollToTop()
    void feedRef.current?.refresh()
    setHasNew(false)
    ax.metric('feed:refresh', {
      feedType: feed.split('|')[0],
      feedUrl: feed,
      reason: 'load-latest',
    })
  }, [ax, scrollToTop, feed])

  const shouldPrefetch = IS_NATIVE && isPageAdjacent
  const isDiscoverFeed = feedInfo.uri === DISCOVER_FEED_URI
  return (
    <View
      testID={testID}
      // @ts-expect-error web only -sfn
      dataSet={{nosnippet: isDiscoverFeed ? '' : undefined}}>
      <MainScrollProvider>
        <FeedFeedbackProvider value={feedFeedback}>
          <PostFeed
            testID={testID ? `${testID}-feed` : undefined}
            enabled={isPageFocused || shouldPrefetch}
            isActive={isPageFocused && isScreenFocused}
            feed={feed}
            feedParams={feedParams}
            pollInterval={POLL_FREQ}
            disablePoll={hasNew || !isPageFocused}
            scrollElRef={scrollElRef}
            onScrolledDownChange={setIsScrolledDown}
            onHasNew={setHasNew}
            renderEmptyState={renderEmptyState}
            renderEndOfFeed={renderEndOfFeed}
            headerOffset={headerOffset}
            savedFeedConfig={savedFeedConfig}
            isVideoFeed={isVideoFeed}
            ref={feedRef}
          />
        </FeedFeedbackProvider>
      </MainScrollProvider>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: headerOffset + 10,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 20,
        }}>
        <NewPostsPill
          visible={hasNew}
          variant="newPosts"
          count={Math.max(4, latestAuthors.length)}
          authors={latestAuthors}
          onPress={onPressLoadLatest}
        />
      </View>

      {hasSession && (
        <FAB
          testID="composeFAB"
          onPress={onPressCompose}
          icon={
            <PlusLarge_Stroke2_Corner0_Rounded
              size="lg"
              fill={t.palette.white}
            />
          }
          accessibilityRole="button"
          accessibilityLabel={_(msg({message: `New post`, context: 'action'}))}
          accessibilityHint=""
        />
      )}
    </View>
  )
}
