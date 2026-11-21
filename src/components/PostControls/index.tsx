import {memo, useMemo, useState} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {type RichText as RichTextAPI} from '@bsky/sdk/richtext'
import {plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {CountWheel} from '#/lib/custom-animations/CountWheel'
import {AnimatedLikeIcon} from '#/lib/custom-animations/LikeIcon'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {type NavigationProp} from '#/lib/routes/types'
import {type Shadow} from '#/state/cache/types'
import {
  usePostLikeMutationQueue,
  usePostRepostMutationQueue,
} from '#/state/queries/post'
import {useRequireAuth} from '#/state/session'
import {
  ProgressGuideAction,
  useProgressGuideControls,
} from '#/state/shell/progress-guide'
import {atoms as a, useBreakpoints} from '#/alf'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {Reply_Stroke2_Corner0_Rounded as Bubble} from '#/components/icons/Reply'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import * as Skele from '#/components/Skeleton'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {useFeedItemFeedback} from '#/features/feedFeedback'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {BookmarkButton} from './BookmarkButton'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'
import {PostMenuButton} from './PostMenu'
import {RepostButton} from './RepostButton'
import {ShareMenuButton} from './ShareMenu'

let PostControls = ({
  big,
  post,
  record,
  richText,
  style,
  onPressReply,
  onPostReply,
  logContext,
  threadgateRecord,
  onShowLess,
  variant,
  forceGoogleTranslate = false,
}: {
  big?: boolean
  post: Shadow<app.bsky.feed.defs.PostView>
  record: app.bsky.feed.post.Main
  richText: RichTextAPI
  style?: StyleProp<ViewStyle>
  onPressReply: () => void
  onPostReply?: (postUri: string | undefined) => void
  logContext: 'FeedItem' | 'PostThreadItem' | 'Post' | 'ImmersiveVideo'
  threadgateRecord?: app.bsky.feed.threadgate.Main
  onShowLess?: (interaction: app.bsky.feed.defs.Interaction) => void
  variant?: 'compact' | 'normal' | 'large'
  forceGoogleTranslate?: boolean
}): React.ReactNode => {
  const ax = useAnalytics()
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const {openComposer} = useOpenComposer()
  const feedItem = useFeedItemFeedback()
  const {feedDescriptor} = feedItem
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    feedItem.item?.via,
    feedDescriptor,
    logContext,
  )
  const [queueRepost, queueUnrepost] = usePostRepostMutationQueue(
    post,
    feedItem.item?.via,
    feedDescriptor,
    logContext,
  )
  const requireAuth = useRequireAuth()
  const {captureAction} = useProgressGuideControls()
  const isBlocked = Boolean(
    post.author.viewer?.blocking ||
    post.author.viewer?.blockedBy ||
    post.author.viewer?.blockingByList,
  )
  const replyDisabled = post.viewer?.replyDisabled
  const {gtPhone} = useBreakpoints()
  const formatPostStatCount = useFormatPostStatCount()

  const [hasLikeIconBeenToggled, setHasLikeIconBeenToggled] = useState(false)

  const estimatedViews =
    (post.likeCount ?? 0) * 18 +
    (post.repostCount ?? 0) * 42 +
    (post.replyCount ?? 0) * 28 +
    (post.quoteCount ?? 0) * 35

  const onPressToggleLike = async () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    const existingLike = post.viewer?.like
    try {
      setHasLikeIconBeenToggled(true)
      if (!existingLike) {
        feedItem.send('app.bsky.feed.defs#interactionLike')
        captureAction(ProgressGuideAction.Like)
        await queueLike()
      } else {
        await queueUnlike()
      }
    } catch (err) {
      const e = err as Error
      if (e?.name !== 'AbortError') {
        throw e
      }
    }
  }

  const onRepost = async () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    const existingRepost = post.viewer?.repost
    try {
      if (!existingRepost) {
        feedItem.send('app.bsky.feed.defs#interactionRepost')
        await queueRepost()
      } else {
        await queueUnrepost()
      }
    } catch (err) {
      const e = err as Error
      if (e?.name !== 'AbortError') {
        throw e
      }
    }
  }

  const onQuote = () => {
    if (isBlocked) {
      Toast.show(l`Cannot interact with a blocked user`, {
        type: 'warning',
      })
      return
    }

    feedItem.send('app.bsky.feed.defs#interactionQuote')
    ax.metric('post:clickQuotePost', {
      uri: post.uri,
      authorDid: post.author.did,
      logContext,
      feedDescriptor,
    })
    openComposer({
      quote: post,
      onPost: onPostReply,
      logContext: 'QuotePost',
    })
  }

  const onShare = () => {
    feedItem.send('app.bsky.feed.defs#interactionShare')
  }

  const onAskQuanty = () => {
    const richContext = extractRichWaveContext(post, record)
    navigation.navigate('Quanty', {
      postUri: post.uri,
      postText: richContext,
      authorHandle: post.author.handle,
      prompt: `Explain, fact-check, and summarize the context behind @${post.author.handle}'s Wave`,
    })
  }

  const secondaryControlSpacingStyles = useSecondaryControlSpacingStyles({
    variant,
    big,
    gtPhone,
  })

  return (
    <View
      style={[
        a.flex_row,
        a.justify_between,
        a.align_center,
        !big && a.pt_2xs,
        gtPhone ? a.gap_md : a.gap_2xs,
        style,
      ]}>
      <View style={[a.flex_row, a.flex_1, {maxWidth: 420}]}>
        <View
          style={[
            a.flex_1,
            a.align_start,
            {marginLeft: big ? -2 : -6},
            replyDisabled ? {opacity: 0.6} : undefined,
          ]}>
          <PostControlButton
            testID="replyBtn"
            onPress={
              !replyDisabled
                ? () =>
                    requireAuth(() => {
                      ax.metric('post:clickReply', {
                        uri: post.uri,
                        authorDid: post.author.did,
                        logContext,
                        feedDescriptor,
                      })
                      onPressReply()
                    })
                : undefined
            }
            label={l({
              message: `Reply (${plural(post.replyCount || 0, {
                one: '# reply',
                other: '# replies',
              })})`,
              comment:
                'Accessibility label for the reply button, verb form followed by number of replies and noun form',
            })}
            big={big}>
            <PostControlButtonIcon icon={Bubble} />
            {typeof post.replyCount !== 'undefined' && post.replyCount > 0 && (
              <PostControlButtonText>
                {formatPostStatCount(post.replyCount)}
              </PostControlButtonText>
            )}
          </PostControlButton>
        </View>
        <View style={[a.flex_1, a.align_start]}>
          <RepostButton
            isReposted={!!post.viewer?.repost}
            repostCount={(post.repostCount ?? 0) + (post.quoteCount ?? 0)}
            onRepost={() => void onRepost()}
            onQuote={onQuote}
            big={big}
            embeddingDisabled={Boolean(post.viewer?.embeddingDisabled)}
          />
        </View>
        <View style={[a.flex_1, a.align_start]}>
          <PostControlButton
            testID="likeBtn"
            big={big}
            active={Boolean(post.viewer?.like)}
            activeColor="#F91880"
            onPress={() => requireAuth(() => onPressToggleLike())}
            label={
              post.viewer?.like
                ? l({
                    message: `Unlike (${plural(post.likeCount || 0, {
                      one: '# like',
                      other: '# likes',
                    })})`,
                    comment:
                      'Accessibility label for the like button when the post has been liked, verb followed by number of likes and noun',
                  })
                : l({
                    message: `Like (${plural(post.likeCount || 0, {
                      one: '# like',
                      other: '# likes',
                    })})`,
                    comment:
                      'Accessibility label for the like button when the post has not been liked, verb form followed by number of likes and noun form',
                  })
            }>
            <AnimatedLikeIcon
              isLiked={Boolean(post.viewer?.like)}
              big={big}
              hasBeenToggled={hasLikeIconBeenToggled}
            />
            <CountWheel
              count={post.likeCount ?? 0}
              isToggled={Boolean(post.viewer?.like)}
              hasBeenToggled={hasLikeIconBeenToggled}
              renderCount={({count}) => (
                <PostControlButtonText testID="likeCount">
                  {formatPostStatCount(count)}
                </PostControlButtonText>
              )}
            />
          </PostControlButton>
        </View>
        <View style={[a.flex_1, a.align_start]}>
          <View
            accessible
            accessibilityLabel={
              estimatedViews > 0
                ? `${formatPostStatCount(estimatedViews)} views`
                : 'Views'
            }
            style={[a.flex_row, a.align_center, a.gap_xs, {padding: 5}]}>
            <EyeIcon
              aria-hidden={true}
              width={big ? 20 : 17}
              style={{color: '#71767B'}}
            />
            {estimatedViews > 0 && (
              <Text
                style={[
                  a.user_select_none,
                  big ? a.text_md : a.text_sm,
                  {
                    color: '#71767B',
                    includeFontPadding: false,
                    textAlignVertical: 'center',
                  },
                ]}>
                {formatPostStatCount(estimatedViews)}
              </Text>
            )}
          </View>
        </View>
      </View>
      <View style={[a.flex_row, a.justify_end, secondaryControlSpacingStyles]}>
        <PostControlButton
          testID="askQuantyBtn"
          big={big}
          onPress={onAskQuanty}
          label="Ask Quanty about this Wave"
          hitSlop={{
            right: secondaryControlSpacingStyles.gap / 2,
          }}>
          <PostControlButtonIcon
            icon={SparkleIcon}
            style={{color: '#1D9BF0'}}
          />
        </PostControlButton>
        <BookmarkButton
          post={post}
          big={big}
          logContext={logContext}
          hitSlop={{
            left: secondaryControlSpacingStyles.gap / 2,
            right: secondaryControlSpacingStyles.gap / 2,
          }}
        />
        <ShareMenuButton
          testID="postShareBtn"
          post={post}
          big={big}
          record={record}
          richText={richText}
          timestamp={post.indexedAt}
          threadgateRecord={threadgateRecord}
          onShare={onShare}
          hitSlop={{
            left: secondaryControlSpacingStyles.gap / 2,
            right: secondaryControlSpacingStyles.gap / 2,
          }}
          logContext={logContext}
        />
        <PostMenuButton
          testID="postDropdownBtn"
          post={post}
          big={big}
          record={record}
          richText={richText}
          timestamp={post.indexedAt}
          threadgateRecord={threadgateRecord}
          onShowLess={onShowLess}
          hitSlop={{
            left: secondaryControlSpacingStyles.gap / 2,
          }}
          logContext={logContext}
          forceGoogleTranslate={forceGoogleTranslate}
        />
      </View>
    </View>
  )
}
PostControls = memo(PostControls)
export {PostControls}

export function PostControlsSkeleton({
  big,
  style,
  variant,
}: {
  big?: boolean
  style?: StyleProp<ViewStyle>
  variant?: 'compact' | 'normal' | 'large'
}) {
  const {gtPhone} = useBreakpoints()

  const rowHeight = big ? 32 : 28
  const padding = 4
  const size = rowHeight - padding * 2

  const secondaryControlSpacingStyles = useSecondaryControlSpacingStyles({
    variant,
    big,
    gtPhone,
  })

  const itemStyles = {
    padding,
  }

  return (
    <Skele.Row
      style={[a.flex_row, a.justify_between, a.align_center, a.gap_md, style]}>
      <View style={[a.flex_row, a.flex_1, {maxWidth: 420}]}>
        <View
          style={[itemStyles, a.flex_1, a.align_start, {marginLeft: -padding}]}>
          <Skele.Pill blend size={size} />
        </View>

        <View style={[itemStyles, a.flex_1, a.align_start]}>
          <Skele.Pill blend size={size} />
        </View>

        <View style={[itemStyles, a.flex_1, a.align_start]}>
          <Skele.Pill blend size={size} />
        </View>

        <View style={[itemStyles, a.flex_1, a.align_start]}>
          <Skele.Pill blend size={size} />
        </View>
      </View>
      <View style={[a.flex_row, a.justify_end, secondaryControlSpacingStyles]}>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
        <View style={itemStyles}>
          <Skele.Circle blend size={size} />
        </View>
      </View>
    </Skele.Row>
  )
}

function useSecondaryControlSpacingStyles({
  variant,
  big,
  gtPhone,
}: {
  variant?: 'compact' | 'normal' | 'large'
  big?: boolean
  gtPhone: boolean
}) {
  return useMemo(() => {
    let gap = 0 // default, we want `gap` to be defined on the resulting object
    if (variant !== 'compact') gap = a.gap_xs.gap
    if (big || gtPhone) gap = a.gap_sm.gap
    return {gap}
  }, [variant, big, gtPhone])
}

function collectParsedEmbedLines(
  parsed: bsky.post.Embed,
  lines: string[],
  depth = 0,
) {
  if (!parsed || parsed.type === 'unknown') return

  if (parsed.type === 'post_with_media') {
    collectParsedEmbedLines(parsed.media, lines, depth)
    collectParsedEmbedLines(parsed.view, lines, depth)
    return
  }

  if (parsed.type === 'post') {
    const quotedAuthor = parsed.view.author?.handle || 'creator'
    const quotedText = bsky.isType(app.bsky.feed.post, parsed.view.value)
      ? parsed.view.value.text.replace(/\s+/g, ' ').trim()
      : ''
    if (quotedText) {
      lines.push(`Quoted @${quotedAuthor}: "${quotedText.slice(0, 420)}"`)
    } else {
      lines.push(`Quoted Wave by @${quotedAuthor}`)
    }
    if (depth < 1 && parsed.view.embeds && parsed.view.embeds.length > 0) {
      for (const nested of parsed.view.embeds.slice(0, 2)) {
        const nestedParsed = bsky.post.parseEmbed(
          nested as app.bsky.feed.defs.PostView['embed'],
        )
        collectParsedEmbedLines(nestedParsed, lines, depth + 1)
      }
    }
    return
  }

  if (parsed.type === 'link') {
    const title = parsed.view.external.title?.replace(/\s+/g, ' ').trim()
    const desc = parsed.view.external.description
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
    const uri = parsed.view.external.uri?.trim()
    const parts: string[] = []
    if (title) parts.push(`"${title}"`)
    if (desc && desc !== title) parts.push(desc)
    const summary = parts.join(' — ')
    if (summary && uri) {
      lines.push(`Link: ${summary} (${uri})`)
    } else if (summary) {
      lines.push(`Link: ${summary}`)
    } else if (uri) {
      lines.push(`Link: ${uri}`)
    }
    return
  }

  if (parsed.type === 'images') {
    const alts = parsed.view.images
      .map(img => img.alt?.replace(/\s+/g, ' ').trim())
      .filter((alt): alt is string => Boolean(alt))
    if (alts.length > 0) {
      lines.push(`Image alt: ${alts.join(' | ').slice(0, 360)}`)
    } else if (parsed.view.images.length > 0) {
      lines.push(
        `[Attached ${parsed.view.images.length} ${
          parsed.view.images.length === 1 ? 'image' : 'images'
        }]`,
      )
    }
    return
  }

  if (parsed.type === 'gallery') {
    const alts: string[] = []
    for (const item of parsed.view.items) {
      if (bsky.isType(app.bsky.embed.gallery.viewImage, item)) {
        const alt = item.alt?.replace(/\s+/g, ' ').trim()
        if (alt) alts.push(alt)
      }
    }
    if (alts.length > 0) {
      lines.push(`Image alt: ${alts.join(' | ').slice(0, 360)}`)
    } else if (parsed.view.items.length > 0) {
      lines.push(`[Attached ${parsed.view.items.length} media items]`)
    }
    return
  }

  if (parsed.type === 'video') {
    const alt = parsed.view.alt?.replace(/\s+/g, ' ').trim()
    if (alt) {
      lines.push(`Video alt: ${alt.slice(0, 320)}`)
    } else {
      lines.push('[Attached video]')
    }
    return
  }

  if (parsed.type === 'feed') {
    const desc = parsed.view.description?.replace(/\s+/g, ' ').trim()
    lines.push(
      `Feed: "${parsed.view.displayName}"${desc ? ` — ${desc.slice(0, 180)}` : ''}`,
    )
    return
  }

  if (parsed.type === 'list') {
    const desc = parsed.view.description?.replace(/\s+/g, ' ').trim()
    lines.push(
      `List: "${parsed.view.name}"${desc ? ` — ${desc.slice(0, 180)}` : ''}`,
    )
  }
}

function extractRichWaveContext(
  post: Shadow<app.bsky.feed.defs.PostView>,
  record: app.bsky.feed.post.Main,
): string {
  const lines: string[] = []
  const primaryText = record.text?.trim()
  if (primaryText) {
    lines.push(primaryText)
  }

  if (post.embed) {
    const parsed = bsky.post.parseEmbed(post.embed)
    collectParsedEmbedLines(parsed, lines, 0)
  }

  if (lines.length === 0) {
    return `Wave by @${post.author.handle}`
  }

  return lines.join('\n').slice(0, 1400)
}
