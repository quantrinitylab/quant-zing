import {useCallback, useMemo, useState} from 'react'
import {TextInput, View} from 'react-native'
import {type $Typed} from '@atproto/lex'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {
  type NavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native'

import {useInitialNumToRender} from '#/lib/hooks/useInitialNumToRender'
import {usePostViewTracking} from '#/lib/hooks/usePostViewTracking'
import {getHomeNavigationAction} from '#/lib/routes/navigation'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {useBookmarkMutation} from '#/state/queries/bookmarks/useBookmarkMutation'
import {useBookmarksQuery} from '#/state/queries/bookmarks/useBookmarksQuery'
import {Post} from '#/view/com/post/Post'
import {EmptyState} from '#/view/com/util/EmptyState'
import {List} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {
  Bookmark_Filled_Corner0_Rounded as BookmarkFilled,
  BookmarkDelete_Stroke2_Corner0_Rounded_Large as BookmarkDeleteLarge,
} from '#/components/icons/Bookmark'
import {CircleQuestion_Stroke2_Corner2_Rounded as QuestionIcon} from '#/components/icons/CircleQuestion'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as MagnifyingGlassIcon} from '#/components/icons/MagnifyingGlass'
import * as Layout from '#/components/Layout'
import {ListFooter} from '#/components/Lists'
import {PostFeedSkeleton} from '#/components/PostFeedSkeleton'
import * as Prompt from '#/components/Prompt'
import * as Skele from '#/components/Skeleton'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_IOS} from '#/env'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Bookmarks'>

export function BookmarksScreen({}: Props) {
  const ax = useAnalytics()
  const t = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const {data, refetch} = useBookmarksQuery()
  const {mutateAsync: toggleBookmark} = useBookmarkMutation()
  const clearPromptControl = Prompt.usePromptControl()

  useFocusEffect(
    useCallback(() => {
      ax.metric('bookmarks:view', {})
    }, [ax]),
  )

  const handleClearAll = useCallback(async () => {
    const allUris =
      data?.pages.flatMap(p => p.bookmarks).map(b => b.item.uri) || []
    for (const uri of allUris) {
      try {
        await toggleBookmark({uri, action: 'delete'})
      } catch {}
    }
    toast.show('All bookmarks cleared')
    void refetch()
  }, [data?.pages, refetch, toggleBookmark])

  const hasBookmarks = Boolean(
    data && data.pages.some(p => p.bookmarks.length > 0),
  )

  return (
    <Layout.Screen testID="bookmarksScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Bookmarks</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot>
          {hasBookmarks && (
            <Button
              label="Clear all"
              size="tiny"
              variant="ghost"
              color="negative"
              onPress={() => clearPromptControl.open()}>
              <ButtonText style={{color: t.palette.negative_400}}>Clear all</ButtonText>
            </Button>
          )}
        </Layout.Header.Slot>
      </Layout.Header.Outer>
      <BookmarksInner
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      <Prompt.Basic
        control={clearPromptControl}
        title="Clear all bookmarks?"
        description="This will remove all saved Zings from your bookmarks."
        onConfirm={handleClearAll}
        confirmButtonCta="Clear all"
        confirmButtonColor="negative"
      />
    </Layout.Screen>
  )
}

type ListItem =
  | {
      type: 'loading'
      key: 'loading'
    }
  | {
      type: 'empty'
      key: 'empty'
    }
  | {
      type: 'bookmark'
      key: string
      bookmark: Omit<app.bsky.bookmark.defs.BookmarkView, 'item'> & {
        item: $Typed<app.bsky.feed.defs.PostView>
      }
    }
  | {
      type: 'bookmarkNotFound'
      key: string
      bookmark: Omit<app.bsky.bookmark.defs.BookmarkView, 'item'> & {
        item: $Typed<app.bsky.feed.defs.NotFoundPost>
      }
    }

function BookmarksInner({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string
  setSearchQuery: (q: string) => void
}) {
  const t = useTheme()
  const initialNumToRender = useInitialNumToRender()
  const [isPTRing, setIsPTRing] = useState(false)
  const trackPostView = usePostViewTracking('Bookmarks')
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useBookmarksQuery()

  const onRefresh = useCallback(async () => {
    setIsPTRing(true)
    try {
      await refetch()
    } finally {
      setIsPTRing(false)
    }
  }, [refetch, setIsPTRing])

  const onEndReached = useCallback(async () => {
    if (isFetchingNextPage || !hasNextPage || error) return
    try {
      await fetchNextPage()
    } catch {}
  }, [isFetchingNextPage, hasNextPage, error, fetchNextPage])

  const items = useMemo(() => {
    const i: ListItem[] = []

    if (isLoading) {
      i.push({type: 'loading', key: 'loading'})
    } else if (error || !data) {
      // handled in Footer
    } else {
      const allBookmarks = data.pages.flatMap(p => p.bookmarks)
      const q = searchQuery.trim().toLowerCase()
      const bookmarks = q
        ? allBookmarks.filter(b => {
            const post = bsky.isType(app.bsky.feed.defs.postView, b.item)
              ? b.item
              : null
            if (!post) return false
            const text = (post.record as any)?.text || ''
            const handle = post.author.handle || ''
            const name = post.author.displayName || ''
            return (
              text.toLowerCase().includes(q) ||
              handle.toLowerCase().includes(q) ||
              name.toLowerCase().includes(q)
            )
          })
        : allBookmarks

      if (bookmarks.length > 0) {
        for (const bookmark of bookmarks) {
          if (bsky.isType(app.bsky.feed.defs.notFoundPost, bookmark.item)) {
            i.push({
              type: 'bookmarkNotFound',
              key: bookmark.item.uri,
              bookmark: {
                ...bookmark,
                item: bookmark.item,
              },
            })
          }
          if (bsky.isType(app.bsky.feed.defs.postView, bookmark.item)) {
            i.push({
              type: 'bookmark',
              key: bookmark.item.uri,
              bookmark: {
                ...bookmark,
                item: bookmark.item,
              },
            })
          }
        }
      } else {
        i.push({type: 'empty', key: 'empty'})
      }
    }

    return i
  }, [isLoading, error, data, searchQuery])

  const isEmpty = items.length === 1 && items[0]?.type === 'empty'

  return (
    <List
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      refreshing={isPTRing}
      onRefresh={() => void onRefresh()}
      onEndReached={() => void onEndReached()}
      onEndReachedThreshold={4}
      ListHeaderComponent={
        <View style={[a.px_md, a.py_sm, a.border_b, t.atoms.border_contrast_low]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.px_sm,
              a.py_xs,
              a.rounded_full,
              t.atoms.bg_contrast_25,
              {borderWidth: 1, borderColor: t.palette.contrast_100},
            ]}>
            <MagnifyingGlassIcon size="xs" style={{color: t.palette.contrast_500}} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search Bookmarks..."
              placeholderTextColor={t.palette.contrast_500}
              style={[
                a.flex_1,
                a.text_sm,
                t.atoms.text,
                {padding: 0},
              ]}
            />
          </View>
        </View>
      }
      onItemSeen={(item: ListItem) => {
        if (item.type === 'bookmark') {
          trackPostView(item.bookmark.item)
        }
      }}
      ListFooterComponent={
        <ListFooter
          isFetchingNextPage={isFetchingNextPage}
          error={cleanError(error)}
          onRetry={fetchNextPage}
          style={[isEmpty && a.border_t_0]}
        />
      }
      initialNumToRender={initialNumToRender}
      windowSize={9}
      maxToRenderPerBatch={IS_IOS ? 5 : 1}
      updateCellsBatchingPeriod={40}
      sideBorders={false}
    />
  )
}

function BookmarkNotFound({
  hideTopBorder,
  post,
}: {
  hideTopBorder: boolean
  post: $Typed<app.bsky.feed.defs.NotFoundPost>
}) {
  const t = useTheme()
  const {_} = useLingui()
  const {mutateAsync: bookmark} = useBookmarkMutation()

  const remove = async () => {
    try {
      await bookmark({action: 'delete', uri: post.uri})
      toast.show(_(msg`Removed from saved posts`), {
        type: 'info',
      })
    } catch (err) {
      toast.show(cleanError(err), {
        type: 'error',
      })
    }
  }

  return (
    <View
      style={[
        a.flex_row,
        a.align_start,
        a.px_xl,
        a.py_lg,
        a.gap_sm,
        !hideTopBorder && a.border_t,
        t.atoms.border_contrast_low,
      ]}>
      <Skele.Circle size={42}>
        <QuestionIcon size="lg" fill={t.atoms.text_contrast_low.color} />
      </Skele.Circle>
      <View style={[a.flex_1, a.gap_2xs]}>
        <View style={[a.flex_row, a.gap_xs]}>
          <Skele.Text style={[a.text_md, {width: 80}]} />
          <Skele.Text style={[a.text_md, {width: 100}]} />
        </View>

        <Text
          style={[
            a.text_md,
            a.leading_snug,
            a.italic,
            t.atoms.text_contrast_medium,
          ]}>
          <Trans>This post was deleted by its author</Trans>
        </Text>
      </View>
      <Button
        label={_(msg`Remove from saved posts`)}
        size="tiny"
        color="secondary"
        onPress={() => void remove()}>
        <ButtonIcon icon={BookmarkFilled} />
        <ButtonText>
          <Trans>Remove</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}

function BookmarkItem({
  item,
  hideTopBorder,
}: {
  item: Extract<ListItem, {type: 'bookmark'}>
  hideTopBorder: boolean
}) {
  const ax = useAnalytics()
  return (
    <Post
      post={item.bookmark.item}
      hideTopBorder={hideTopBorder}
      onBeforePress={() => {
        ax.metric('bookmarks:post-clicked', {})
      }}
    />
  )
}

function BookmarksEmpty() {
  const t = useTheme()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp<CommonNavigatorParams>>()

  return (
    <EmptyState
      icon={BookmarkDeleteLarge}
      message={_(msg`Nothing saved yet`)}
      textStyle={[t.atoms.text_contrast_medium, a.font_medium]}
      button={{
        label: _(msg`Button to go back to the home timeline`),
        text: _(msg`Go home`),
        onPress: () =>
          navigation.dispatch(
            getHomeNavigationAction(navigation.getState(), 'navigate'),
          ),
        size: 'small',
        color: 'secondary',
      }}
      style={[a.pt_3xl]}
    />
  )
}

function renderItem({item, index}: {item: ListItem; index: number}) {
  switch (item.type) {
    case 'loading': {
      return <PostFeedSkeleton />
    }
    case 'empty': {
      return <BookmarksEmpty />
    }
    case 'bookmark': {
      return <BookmarkItem item={item} hideTopBorder={index === 0} />
    }
    case 'bookmarkNotFound': {
      return (
        <BookmarkNotFound
          post={item.bookmark.item}
          hideTopBorder={index === 0}
        />
      )
    }
    default:
      return null
  }
}

const keyExtractor = (item: ListItem) => item.key
