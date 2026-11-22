import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Pressable, View} from 'react-native'
import {
  type AtIdentifierString,
  AtUri,
  type AtUriString,
  type DidString,
} from '@atproto/syntax'
import {useNavigation, useRoute} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {VIDEO_FEED_URI} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {type CommonNavigatorParams, type NavigationProp} from '#/lib/routes/types'
import {updatePostShadow} from '#/state/cache/post-shadow'
import {useAppviewClient, useRequireAuth, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useBreakpoints, web} from '#/alf'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {ArrowOutOfBox_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import {
  Bookmark_Filled_Corner0_Rounded as BookmarkFilledIcon,
  Bookmark_Stroke2_Corner0_Rounded as BookmarkIcon,
} from '#/components/icons/Bookmark'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronTop_Stroke2_Corner0_Rounded as ChevronUpIcon,
} from '#/components/icons/Chevron'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilledIcon,
  Heart2_Stroke2_Corner0_Rounded as HeartIcon,
} from '#/components/icons/Heart2'
import {Mute_Stroke2_Corner0_Rounded as MuteIcon} from '#/components/icons/Mute'
import {Play_Filled_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Reply_Stroke2_Corner0_Rounded as ReplyIcon} from '#/components/icons/Reply'
import {Repost_Stroke2_Corner0_Rounded as RepostIcon} from '#/components/icons/Repost'
import {SpeakerVolumeFull_Stroke2_Corner0_Rounded as VolumeIcon} from '#/components/icons/SpeakerVolumeFull'
import {VerifiedCheck as VerifiedIcon} from '#/components/icons/brands/VerifiedCheck'
import {VideoClip_Stroke2_Corner0_Rounded as VideoClipIcon} from '#/components/icons/VideoClip'
import {Loader} from '#/components/Loader'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {app, com} from '#/lexicons'
import {type VideoFeedSourceContext} from './types'

type ReelItem = {
  post: app.bsky.feed.defs.PostView
  playlist: string
  thumbnail?: string
  alt?: string
  aspectRatio?: {width: number; height: number}
}

function extractVideoFromPost(post: app.bsky.feed.defs.PostView): ReelItem | null {
  const embed = post.embed as any
  if (!embed) return null
  if (embed.$type === 'app.bsky.embed.video#view' && embed.playlist) {
    return {
      post,
      playlist: embed.playlist,
      thumbnail: embed.thumbnail,
      alt: embed.alt,
      aspectRatio: embed.aspectRatio,
    }
  }
  if (
    embed.$type === 'app.bsky.embed.recordWithMedia#view' &&
    embed.media?.$type === 'app.bsky.embed.video#view' &&
    embed.media.playlist
  ) {
    return {
      post,
      playlist: embed.media.playlist,
      thumbnail: embed.media.thumbnail,
      alt: embed.media.alt,
      aspectRatio: embed.media.aspectRatio,
    }
  }
  return null
}

function formatCompact(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function VideoFeed() {
  const navigation = useNavigation<NavigationProp>()
  const route = useRoute()
  const params = route.params as VideoFeedSourceContext | undefined
  const client = useAppviewClient()
  const {currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()
  const {gtMobile} = useBreakpoints()

  const [reels, setReels] = useState<ReelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])

  const loadReels = useCallback(async () => {
    setLoading(true)
    try {
      let feedPosts: app.bsky.feed.defs.PostView[] = []
      if (params?.type === 'author' && params.did) {
        const res = await client.call(app.bsky.feed.getAuthorFeed, {
          actor: params.did as AtIdentifierString,
          filter: 'posts_with_video',
          limit: 40,
        })
        feedPosts = res.feed.map(f => f.post)
      } else {
        const feedUri = (
          params?.type === 'feedgen' && params.uri
            ? params.uri
            : VIDEO_FEED_URI
        ) as AtUriString
        const res = await client.call(app.bsky.feed.getFeed, {
          feed: feedUri,
          limit: 40,
        })
        feedPosts = res.feed.map(f => f.post)
      }

      const initialUri = params?.initialPostUri
      if (initialUri && !feedPosts.some(p => p.uri === initialUri)) {
        try {
          const single = await client.call(app.bsky.feed.getPosts, {
            uris: [initialUri as AtUriString],
          })
          if (single.posts?.[0]) {
            feedPosts = [single.posts[0], ...feedPosts]
          }
        } catch {}
      }

      const extracted: ReelItem[] = []
      const seen = new Set<string>()
      for (const p of feedPosts) {
        if (!p?.uri || seen.has(p.uri)) continue
        const item = extractVideoFromPost(p)
        if (item) {
          seen.add(p.uri)
          extracted.push(item)
        }
      }

      if (initialUri) {
        const idx = extracted.findIndex(r => r.post.uri === initialUri)
        if (idx > 0) {
          const [picked] = extracted.splice(idx, 1)
          extracted.unshift(picked)
        }
      }

      setReels(extracted)
      setActiveIndex(0)
    } catch {
      setReels([])
    } finally {
      setLoading(false)
    }
  }, [client, params?.type, params?.initialPostUri, (params as any)?.did, (params as any)?.uri])

  useEffect(() => {
    void loadReels()
  }, [loadReels])

  const scrollToIndex = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(reels.length - 1, nextIdx))
      const target = slideRefs.current[clamped]
      if (target) {
        target.scrollIntoView({behavior: 'smooth', block: 'start'})
        setActiveIndex(clamped)
      }
    },
    [reels.length],
  )

  const onClose = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      ;(navigation as any).navigate('Home')
    }
  }, [navigation])

  const onUploadReel = useCallback(() => {
    requireAuth(() => {
      openComposer({
        openGallery: true,
        logContext: 'Fab',
        onPost: () => {
          setTimeout(() => {
            void loadReels()
          }, 1200)
        },
      })
    })
  }, [loadReels, openComposer, requireAuth])

  // Keyboard navigation (ArrowDown/Up, j/k, m mute, Escape exit)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        scrollToIndex(activeIndex + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        scrollToIndex(activeIndex - 1)
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setMuted(prev => !prev)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, onClose, scrollToIndex])

  // Track which vertical reel slide is currently snapped in view
  useEffect(() => {
    const root = scrollerRef.current
    if (!root || reels.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number(
              (entry.target as HTMLElement).dataset.reelIndex ?? '0',
            )
            if (Number.isFinite(idx)) {
              setActiveIndex(idx)
            }
          }
        }
      },
      {root, threshold: [0.6, 0.85]},
    )
    for (const el of slideRefs.current) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [reels])

  return (
    <div
      data-testid="quantzingReelsViewer"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: '#000000',
        color: '#E7E9EA',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100vw',
        overflow: 'hidden',
      }}>
      {/* Top Overlay Header */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: gtMobile ? '16px 24px' : '12px 14px',
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
          }}>
          <Pressable
            testID="reelsBackBtn"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Reels"
            style={({pressed}) => [
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {
                width: 40,
                height: 40,
                backgroundColor: 'rgba(15, 20, 25, 0.72)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.16)',
                opacity: pressed ? 0.75 : 1,
              },
              web({cursor: 'pointer', backdropFilter: 'blur(10px)'}),
            ]}>
            <ArrowLeftIcon width={20} fill="#FFFFFF" />
          </Pressable>
          <View>
            <Text style={[a.text_lg, a.font_bold, {color: '#FFFFFF'}]}>
              Reels
            </Text>
            {reels.length > 0 && (
              <Text style={[a.text_xs, {color: 'rgba(231,233,234,0.75)'}]}>
                {activeIndex + 1} / {reels.length}
              </Text>
            )}
          </View>
        </div>

        <div style={{pointerEvents: 'auto'}}>
          <Pressable
            testID="reelsUploadBtn"
            onPress={onUploadReel}
            accessibilityRole="button"
            accessibilityLabel="Post Reel"
            style={({pressed}) => [
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.rounded_full,
              {
                height: 36,
                paddingHorizontal: 14,
                backgroundColor: '#EFF3F4',
                opacity: pressed ? 0.85 : 1,
              },
              web({cursor: 'pointer'}),
            ]}>
            <PlusIcon width={14} fill="#0F1419" />
            <Text style={[a.text_sm, a.font_bold, {color: '#0F1419'}]}>
              Post Reel
            </Text>
          </Pressable>
        </div>
      </div>

      {/* Desktop Up/Down Reel Switch Arrows */}
      {gtMobile && reels.length > 1 && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
          <Pressable
            testID="reelsPrevBtn"
            onPress={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous Reel"
            style={({pressed}) => [
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {
                width: 44,
                height: 44,
                backgroundColor: 'rgba(22, 24, 28, 0.8)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
                opacity: activeIndex === 0 ? 0.35 : pressed ? 0.75 : 1,
              },
              web({cursor: activeIndex === 0 ? 'default' : 'pointer'}),
            ]}>
            <ChevronUpIcon width={20} fill="#FFFFFF" />
          </Pressable>
          <Pressable
            testID="reelsNextBtn"
            onPress={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex >= reels.length - 1}
            accessibilityRole="button"
            accessibilityLabel="Next Reel"
            style={({pressed}) => [
              a.align_center,
              a.justify_center,
              a.rounded_full,
              {
                width: 44,
                height: 44,
                backgroundColor: 'rgba(22, 24, 28, 0.8)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
                opacity:
                  activeIndex >= reels.length - 1 ? 0.35 : pressed ? 0.75 : 1,
              },
              web({
                cursor: activeIndex >= reels.length - 1 ? 'default' : 'pointer',
              }),
            ]}>
            <ChevronDownIcon width={20} fill="#FFFFFF" />
          </Pressable>
        </div>
      )}

      {/* Body: Loading / Empty / Vertical Snap Feed */}
      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexDirection: 'column',
          }}>
          <Loader size="xl" fill="#1D9BF0" />
          <Text style={[a.text_sm, {color: '#71767B'}]}>
            Loading QuantZing Reels...
          </Text>
        </div>
      ) : reels.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}>
          <View
            style={{
              maxWidth: 360,
              width: '100%',
              padding: 28,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#2F3336',
              backgroundColor: '#16181C',
              alignItems: 'center',
              gap: 14,
            }}>
            <VideoClipIcon width={42} fill="#1D9BF0" />
            <Text
              style={[
                a.text_xl,
                a.font_bold,
                a.text_center,
                {color: '#E7E9EA'},
              ]}>
              No Reels yet
            </Text>
            <Text
              style={[
                a.text_sm,
                a.text_center,
                {color: '#71767B', lineHeight: 20},
              ]}>
              Upload your first video Zing and it will appear right here in
              full-screen vertical Reels.
            </Text>
            <Pressable
              onPress={onUploadReel}
              accessibilityRole="button"
              accessibilityLabel="Upload first Reel"
              style={({pressed}) => [
                a.rounded_full,
                a.align_center,
                a.justify_center,
                {
                  height: 44,
                  paddingHorizontal: 24,
                  backgroundColor: '#EFF3F4',
                  opacity: pressed ? 0.85 : 1,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text style={[a.text_md, a.font_bold, {color: '#0F1419'}]}>
                Upload a Reel
              </Text>
            </Pressable>
          </View>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          data-testid="reelsScrollContainer"
          style={{
            flex: 1,
            height: '100dvh',
            overflowY: 'auto',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}>
          {reels.map((item, idx) => (
            <div
              key={item.post.uri}
              data-reel-index={idx}
              ref={el => {
                slideRefs.current[idx] = el
              }}
              style={{
                height: '100dvh',
                width: '100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                backgroundColor: '#000000',
              }}>
              <ReelSlide
                item={item}
                isActive={idx === activeIndex}
                muted={muted}
                onToggleMute={() => setMuted(m => !m)}
                currentUserDid={currentAccount?.did}
                gtMobile={gtMobile}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReelSlide({
  item,
  isActive,
  muted,
  onToggleMute,
  currentUserDid,
  gtMobile,
}: {
  item: ReelItem
  isActive: boolean
  muted: boolean
  onToggleMute: () => void
  currentUserDid?: string
  gtMobile: boolean
}) {
  const {post} = item
  const queryClient = useQueryClient()
  const client = useAppviewClient()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()
  const navigation = useNavigation<NavigationProp>()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  const [likeUri, setLikeUri] = useState<string | undefined>(post.viewer?.like)
  const [likeCount, setLikeCount] = useState<number>(post.likeCount ?? 0)
  const [repostUri, setRepostUri] = useState<string | undefined>(
    post.viewer?.repost,
  )
  const [repostCount, setRepostCount] = useState<number>(post.repostCount ?? 0)
  const [bookmarked, setBookmarked] = useState<boolean>(
    Boolean(post.viewer?.bookmarked),
  )
  const [followUri, setFollowUri] = useState<string | undefined>(
    post.author.viewer?.following,
  )

  const isOwnPost = currentUserDid === post.author.did
  const recordText = String((post.record as any)?.text || '')
  const rkey = useMemo(() => {
    try {
      return new AtUri(post.uri).rkey
    } catch {
      return ''
    }
  }, [post.uri])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
  }, [muted])

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return
    void fetch('/api/quantzing/views/record', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({uris: [post.uri]}),
    }).catch(() => {})
  }, [isActive, post.uri])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isActive && !paused) {
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Browser autoplay policy fallback: retry muted
          v.muted = true
          v.play().catch(() => {})
        })
      }
    } else {
      v.pause()
      if (!isActive) {
        v.currentTime = 0
        setPaused(false)
      }
    }
  }, [isActive, paused])

  const onTogglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      setPaused(false)
      v.play().catch(() => {})
    } else {
      setPaused(true)
      v.pause()
    }
  }, [])

  const onToggleLike = useCallback(() => {
    requireAuth(async () => {
      if (!currentUserDid) return
      try {
        if (likeUri) {
          const prev = likeUri
          setLikeUri(undefined)
          setLikeCount(c => Math.max(0, c - 1))
          const parsed = new AtUri(prev)
          await client.call(com.atproto.repo.deleteRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.feed.like',
            rkey: parsed.rkey,
          })
          updatePostShadow(queryClient, post.uri, {likeUri: undefined})
          void queryClient.invalidateQueries({queryKey: ['liked-by', post.uri]})
        } else {
          setLikeCount(c => c + 1)
          const res = await client.call(com.atproto.repo.createRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.feed.like',
            record: {
              $type: 'app.bsky.feed.like',
              subject: {uri: post.uri, cid: post.cid},
              createdAt: new Date().toISOString(),
            },
          })
          setLikeUri(res.uri)
          updatePostShadow(queryClient, post.uri, {likeUri: res.uri})
          void queryClient.invalidateQueries({queryKey: ['liked-by', post.uri]})
        }
      } catch {
        Toast.show('Could not update like', {type: 'error'})
      }
    })
  }, [client, currentUserDid, likeUri, post.cid, post.uri, requireAuth])

  const onToggleRepost = useCallback(() => {
    requireAuth(async () => {
      if (!currentUserDid) return
      try {
        if (repostUri) {
          const prev = repostUri
          setRepostUri(undefined)
          setRepostCount(c => Math.max(0, c - 1))
          const parsed = new AtUri(prev)
          await client.call(com.atproto.repo.deleteRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.feed.repost',
            rkey: parsed.rkey,
          })
          updatePostShadow(queryClient, post.uri, {repostUri: undefined})
          void queryClient.invalidateQueries({queryKey: ['post-reposted-by', post.uri]})
        } else {
          setRepostCount(c => c + 1)
          const res = await client.call(com.atproto.repo.createRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.feed.repost',
            record: {
              $type: 'app.bsky.feed.repost',
              subject: {uri: post.uri, cid: post.cid},
              createdAt: new Date().toISOString(),
            },
          })
          setRepostUri(res.uri)
          updatePostShadow(queryClient, post.uri, {repostUri: res.uri})
          void queryClient.invalidateQueries({queryKey: ['post-reposted-by', post.uri]})
        }
      } catch {
        Toast.show('Could not update Rezing', {type: 'error'})
      }
    })
  }, [client, currentUserDid, post.cid, post.uri, repostUri, requireAuth])

  const onToggleBookmark = useCallback(() => {
    requireAuth(async () => {
      try {
        if (bookmarked) {
          setBookmarked(false)
          await client.call(app.bsky.bookmark.deleteBookmark, {uri: post.uri})
          updatePostShadow(queryClient, post.uri, {bookmarked: false})
        } else {
          setBookmarked(true)
          await client.call(app.bsky.bookmark.createBookmark, {
            uri: post.uri,
            cid: post.cid,
          })
          updatePostShadow(queryClient, post.uri, {bookmarked: true})
          Toast.show('Saved to Bookmarks', {type: 'success'})
        }
      } catch {
        Toast.show('Could not update bookmark', {type: 'error'})
      }
    })
  }, [bookmarked, client, post.cid, post.uri, requireAuth])

  const onToggleFollow = useCallback(() => {
    requireAuth(async () => {
      if (!currentUserDid || isOwnPost) return
      try {
        if (followUri) {
          const prev = followUri
          setFollowUri(undefined)
          const parsed = new AtUri(prev)
          await client.call(com.atproto.repo.deleteRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.graph.follow',
            rkey: parsed.rkey,
          })
        } else {
          const res = await client.call(com.atproto.repo.createRecord, {
            repo: currentUserDid as AtIdentifierString,
            collection: 'app.bsky.graph.follow',
            record: {
              $type: 'app.bsky.graph.follow',
              subject: post.author.did as DidString,
              createdAt: new Date().toISOString(),
            },
          })
          setFollowUri(res.uri)
        }
      } catch {
        Toast.show('Could not update follow', {type: 'error'})
      }
    })
  }, [client, currentUserDid, followUri, isOwnPost, post.author.did, requireAuth])

  const onReply = useCallback(() => {
    requireAuth(() => {
      openComposer({
        replyTo: {
          uri: post.uri,
          cid: post.cid,
          text: recordText,
          author: post.author,
          embed: post.embed,
        },
        logContext: 'PostReply',
      })
    })
  }, [openComposer, post, recordText, requireAuth])

  const onShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/profile/${post.author.handle}/post/${rkey}`
    try {
      await navigator.clipboard.writeText(url)
      Toast.show('Reel link copied', {type: 'success'})
    } catch {
      Toast.show(url, {type: 'info'})
    }
  }, [post.author.handle, rkey])

  const onOpenProfile = useCallback(() => {
    navigation.navigate('Profile', {name: post.author.handle})
  }, [navigation, post.author.handle])

  const onOpenThread = useCallback(() => {
    if (!rkey) return
    navigation.navigate('PostThread', {
      name: post.author.handle,
      rkey,
    } as CommonNavigatorParams['PostThread'])
  }, [navigation, post.author.handle, rkey])

  const frameStyle: React.CSSProperties = gtMobile
    ? {
        position: 'relative',
        height: 'calc(100dvh - 24px)',
        maxHeight: 920,
        width: 'min(520px, calc(100vw - 140px))',
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#0A0A0A',
        border: '1px solid #2F3336',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }
    : {
        position: 'relative',
        height: '100dvh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }

  const isVerified = post.author.verification?.verifiedStatus === 'valid'

  return (
    <div style={frameStyle}>
      <video
        ref={videoRef}
        src={item.playlist}
        poster={item.thumbnail}
        playsInline
        loop
        muted={muted}
        preload={isActive ? 'auto' : 'metadata'}
        onClick={onTogglePlay}
        onTimeUpdate={e => {
          const el = e.currentTarget
          if (el.duration > 0) {
            setProgress(Math.min(1, el.currentTime / el.duration))
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          cursor: 'pointer',
          backgroundColor: '#000000',
        }}
      />

      {paused && (
        <div
          onClick={onTogglePlay}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.22)',
            cursor: 'pointer',
          }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              backgroundColor: 'rgba(15,20,25,0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
            <PlayIcon width={28} fill="#FFFFFF" />
          </div>
        </div>
      )}

      {/* Right-Side Floating Action Rail */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 84,
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
        <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Open creator profile">
          <UserAvatar avatar={post.author.avatar} size={42} type="user" />
        </Pressable>

        <ReelActionButton
          testID="reelLikeBtn"
          label={formatCompact(likeCount)}
          ariaLabel="Like Reel"
          onPress={onToggleLike}
          icon={
            likeUri ? (
              <HeartFilledIcon width={24} fill="#F91880" />
            ) : (
              <HeartIcon width={24} fill="#FFFFFF" />
            )
          }
          activeColor={likeUri ? '#F91880' : undefined}
        />

        <ReelActionButton
          testID="reelReplyBtn"
          label={formatCompact(post.replyCount ?? 0)}
          ariaLabel="Reply to Reel"
          onPress={onReply}
          icon={<ReplyIcon width={24} fill="#FFFFFF" />}
        />

        <ReelActionButton
          testID="reelRezingBtn"
          label={formatCompact(repostCount)}
          ariaLabel="Rezing Reel"
          onPress={onToggleRepost}
          icon={
            <RepostIcon
              width={24}
              fill={repostUri ? '#00BA7C' : '#FFFFFF'}
            />
          }
          activeColor={repostUri ? '#00BA7C' : undefined}
        />

        <ReelActionButton
          testID="reelBookmarkBtn"
          label={bookmarked ? 'Saved' : 'Save'}
          ariaLabel="Bookmark Reel"
          onPress={onToggleBookmark}
          icon={
            bookmarked ? (
              <BookmarkFilledIcon width={22} fill="#1D9BF0" />
            ) : (
              <BookmarkIcon width={22} fill="#FFFFFF" />
            )
          }
          activeColor={bookmarked ? '#1D9BF0' : undefined}
        />

        <ReelActionButton
          testID="reelShareBtn"
          label="Share"
          ariaLabel="Share Reel"
          onPress={() => void onShare()}
          icon={<ShareIcon width={22} fill="#FFFFFF" />}
        />

        <ReelActionButton
          testID="reelMuteBtn"
          label={muted ? 'Muted' : 'Sound'}
          ariaLabel={muted ? 'Unmute Reel' : 'Mute Reel'}
          onPress={onToggleMute}
          icon={
            muted ? (
              <MuteIcon width={22} fill="#FFFFFF" />
            ) : (
              <VolumeIcon width={22} fill="#FFFFFF" />
            )
          }
        />
      </div>

      {/* Bottom-Left Creator Overlay */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '44px 76px 20px 16px',
          background:
            'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 8,
            pointerEvents: 'auto',
          }}>
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={post.author.handle}
            style={[a.flex_row, a.align_center, a.gap_xs]}>
            <Text style={[a.text_md, a.font_bold, {color: '#FFFFFF'}]}>
              {post.author.displayName || post.author.handle}
            </Text>
            {isVerified && <VerifiedIcon width={15} fill="#1D9BF0" />}
            <Text style={[a.text_xs, {color: 'rgba(231,233,234,0.75)'}]}>
              @{post.author.handle}
            </Text>
          </Pressable>

          {!isOwnPost && (
            <Pressable
              testID="reelFollowBtn"
              onPress={onToggleFollow}
              accessibilityRole="button"
              accessibilityLabel={followUri ? 'Unfollow' : 'Follow'}
              style={({pressed}) => [
                a.rounded_full,
                {
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  backgroundColor: followUri ? 'rgba(255,255,255,0.16)' : '#EFF3F4',
                  borderWidth: followUri ? 1 : 0,
                  borderColor: 'rgba(255,255,255,0.35)',
                  opacity: pressed ? 0.8 : 1,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_bold,
                  {color: followUri ? '#FFFFFF' : '#0F1419'},
                ]}>
                {followUri ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          )}
        </div>

        {recordText.length > 0 && (
          <div style={{pointerEvents: 'auto'}}>
            <Pressable onPress={onOpenThread} accessibilityRole="button">
              <Text
                numberOfLines={3}
                style={[
                  a.text_sm,
                  {color: '#E7E9EA', lineHeight: 20},
                ]}>
                {recordText}
              </Text>
            </Pressable>
          </div>
        )}
      </div>

      {/* Bottom Scrubber Bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          backgroundColor: 'rgba(255,255,255,0.2)',
        }}>
        <div
          style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: '#1D9BF0',
            transition: 'width 120ms linear',
          }}
        />
      </div>
    </div>
  )
}

function ReelActionButton({
  testID,
  icon,
  label,
  ariaLabel,
  onPress,
  activeColor,
}: {
  testID?: string
  icon: React.ReactNode
  label: string
  ariaLabel: string
  onPress: () => void
  activeColor?: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      style={({pressed}) => [
        a.align_center,
        {gap: 4, opacity: pressed ? 0.75 : 1},
        web({cursor: 'pointer'}),
      ]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          {
            width: 44,
            height: 44,
            backgroundColor: 'rgba(15, 20, 25, 0.62)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.14)',
          },
          web({backdropFilter: 'blur(8px)'}),
        ]}>
        {icon}
      </View>
      <Text
        style={[
          a.text_xs,
          a.font_bold,
          {
            color: activeColor || '#FFFFFF',
            backgroundColor: 'rgba(15, 20, 25, 0.56)',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
          },
          web({textShadow: '0 1px 4px rgba(0, 0, 0, 0.95)'}),
        ]}>
        {label}
      </Text>
    </Pressable>
  )
}
