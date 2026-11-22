import {useCallback, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import {RichText} from '@bsky/sdk/richtext'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  useCameraPermission,
  usePhotoLibraryPermission,
  useVideoLibraryPermission,
} from '#/lib/hooks/usePermissions'
import {openCamera, openUnifiedPicker} from '#/lib/media/picker'
import {
  createQuantZingPostRecord,
  getQuantZingColors,
} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {emitPostCreated} from '#/state/events'
import {useCurrentAccountProfile} from '#/state/queries/useCurrentAccountProfile'
import {
  useAppviewClient,
  useMaybePdsClient,
  useRequireAuth,
  useSession,
} from '#/state/session'
import {MAX_GALLERY_IMAGES} from '#/view/com/composer/state/composer'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button} from '#/components/Button'
import {useSheetWrapper} from '#/components/Dialog/sheet-wrapper'
import {BulletList_Stroke2_Corner0_Rounded as PollIcon} from '#/components/icons/BulletList'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {Image_Stroke2_Corner2_Rounded as ImageIcon} from '#/components/icons/Image'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {TimesLarge_Stroke2_Corner0_Rounded as CloseIcon} from '#/components/icons/TimesLarge'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE, IS_WEB} from '#/env'
import {com} from '#/lexicons'

const MAX_WAVE_LENGTH = 300
const MIN_POLL_OPTIONS = 2
const MAX_POLL_OPTIONS = 4
const POLL_DURATIONS = [
  {hours: 1, label: '1h'},
  {hours: 6, label: '6h'},
  {hours: 24, label: '24h'},
  {hours: 72, label: '3d'},
]

export function ComposerPrompt() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const ax = useAnalytics()
  const navigation = useNavigation<NavigationProp>()
  const queryClient = useQueryClient()
  const appviewClient = useAppviewClient()
  const pdsClient = useMaybePdsClient()
  const {hasSession, currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()
  const profile = useCurrentAccountProfile()
  const {requestCameraAccessIfNeeded} = useCameraPermission()
  const {requestPhotoAccessIfNeeded} = usePhotoLibraryPermission()
  const {requestVideoAccessIfNeeded} = useVideoLibraryPermission()
  const sheetWrapper = useSheetWrapper()

  const [draftText, setDraftText] = useState('')
  const [pollOpen, setPollOpen] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollDurationHours, setPollDurationHours] = useState<number>(24)
  const [isPublishing, setIsPublishing] = useState(false)

  const trimmedDraft = useMemo(() => draftText.trim(), [draftText])
  const filledPollOptions = useMemo(
    () => pollOptions.map(o => o.trim()).filter(Boolean),
    [pollOptions],
  )
  const charCount = draftText.length
  const isOverLimit = charCount > MAX_WAVE_LENGTH
  const hasContent =
    trimmedDraft.length > 0 || (pollOpen && filledPollOptions.length >= 2)

  const onTogglePoll = useCallback(() => {
    setPollOpen(prev => {
      if (prev) {
        setPollOptions(['', ''])
        return false
      }
      return true
    })
  }, [])

  const onUpdatePollOption = useCallback((index: number, value: string) => {
    setPollOptions(prev => prev.map((opt, i) => (i === index ? value : opt)))
  }, [])

  const onAddPollOption = useCallback(() => {
    setPollOptions(prev =>
      prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev,
    )
  }, [])

  const onRemovePollOption = useCallback((index: number) => {
    setPollOptions(prev =>
      prev.length > MIN_POLL_OPTIONS
        ? prev.filter((_, i) => i !== index)
        : prev,
    )
  }, [])

  const publishInlineZing = useCallback(async () => {
    if (isPublishing || isOverLimit) return

    if (pollOpen && filledPollOptions.length < MIN_POLL_OPTIONS) {
      Toast.show('Add at least 2 poll choices before publishing', {
        type: 'warning',
      })
      return
    }

    const postText =
      trimmedDraft || (pollOpen ? 'Vote in this Zing Poll:' : '')
    if (!postText) {
      openComposer({
        logContext: 'Fab',
      })
      return
    }

    const did = currentAccount?.did || pdsClient?.did
    if (!did) {
      openComposer({
        text: trimmedDraft || undefined,
        logContext: 'Fab',
      })
      return
    }

    setIsPublishing(true)
    try {
      const rt = new RichText({text: postText}, {cleanNewlines: true})
      try {
        await rt.detectFacets(appviewClient)
      } catch {
        // Proceed even if offline facet detection fails
      }

      const expiresAt = new Date(
        Date.now() + pollDurationHours * 3600 * 1000,
      ).toISOString()

      const pollInput =
        pollOpen && filledPollOptions.length >= MIN_POLL_OPTIONS
          ? {
              question: trimmedDraft || 'Community Poll',
              options: filledPollOptions.map((text, idx) => ({
                id: `opt_${idx + 1}`,
                text,
              })),
              durationHours: pollDurationHours,
              expiresAt,
            }
          : undefined

      if (currentAccount?.accessJwt) {
        await createQuantZingPostRecord(
          {
            repo: did,
            text: rt.text,
            facets: rt.facets,
            poll: pollInput,
          },
          currentAccount.accessJwt,
        )
      } else if (pdsClient) {
        const record: Record<string, unknown> = {
          $type: 'app.bsky.feed.post',
          text: rt.text,
          createdAt: new Date().toISOString(),
        }
        if (rt.facets && rt.facets.length > 0) {
          record.facets = rt.facets
        }
        if (pollInput) {
          record.embed = {
            $type: 'com.quantzing.embed.poll',
            question: pollInput.question,
            options: pollInput.options,
            durationHours: pollInput.durationHours,
            expiresAt: pollInput.expiresAt,
          }
        }
        await pdsClient.call(com.atproto.repo.createRecord, {
          repo: did as any,
          collection: 'app.bsky.feed.post',
          record: record as any,
          validate: false,
        })
      } else {
        throw new Error('Authentication session not ready')
      }

      setDraftText('')
      setPollOpen(false)
      setPollOptions(['', ''])
      setPollDurationHours(24)

      emitPostCreated()
      await queryClient.invalidateQueries({queryKey: ['post-feed']})

      Toast.show(pollInput ? 'Zing Poll published' : 'Zing published', {
        type: 'success',
      })
    } catch (err: any) {
      Toast.show(err?.message || 'Unable to publish Zing right now', {
        type: 'warning',
      })
    } finally {
      setIsPublishing(false)
    }
  }, [
    appviewClient,
    currentAccount?.accessJwt,
    currentAccount?.did,
    filledPollOptions,
    isOverLimit,
    isPublishing,
    openComposer,
    pdsClient,
    pollDurationHours,
    pollOpen,
    queryClient,
    trimmedDraft,
  ])

  const onPressWave = useCallback(() => {
    if (isOverLimit || isPublishing) return
    ax.metric('composerPrompt:press', {})
    requireAuth(() => {
      if (trimmedDraft.length > 0 || pollOpen) {
        void publishInlineZing()
      } else {
        // Open full modal composer without destroying any existing state
        openComposer({
          text: trimmedDraft || undefined,
          logContext: 'Fab',
        })
      }
    })
  }, [
    ax,
    isOverLimit,
    isPublishing,
    openComposer,
    pollOpen,
    publishInlineZing,
    requireAuth,
    trimmedDraft,
  ])

  const onPressAskQuanty = useCallback(() => {
    const prompt = trimmedDraft
      ? `Refine and fact-check this Zing draft: ${trimmedDraft}`
      : 'Help me draft a high-signal Zing about trending topics today'
    navigation.navigate('Quanty', {prompt})
  }, [navigation, trimmedDraft])

  const onPressTagQuanty = useCallback(() => {
    setDraftText(prev => {
      if (/(?:^|\s)@quanty\b/i.test(prev)) return prev
      const trimmed = prev.trim()
      return trimmed ? `@quanty ${trimmed}` : '@quanty '
    })
  }, [])

  const onPressImage = useCallback(async () => {
    ax.metric('composerPrompt:gallery:press', {})

    if (!IS_NATIVE) {
      requireAuth(() => {
        openComposer({
          text: trimmedDraft || undefined,
          openGallery: true,
          logContext: 'Fab',
        })
      })
      return
    }

    try {
      const [photoAccess, videoAccess] = await Promise.all([
        requestPhotoAccessIfNeeded(),
        requestVideoAccessIfNeeded(),
      ])

      if (!photoAccess && !videoAccess) {
        return
      }

      if (Keyboard.isVisible()) {
        Keyboard.dismiss()
      }

      const selectionCountRemaining = MAX_GALLERY_IMAGES
      const {assets, canceled} = await sheetWrapper(
        openUnifiedPicker({selectionCountRemaining}),
      )

      if (canceled) {
        return
      }

      if (assets.length > 0) {
        const videoAsset = assets.find(asset =>
          asset.mimeType?.startsWith('video/'),
        )
        if (videoAsset) {
          openComposer({
            text: trimmedDraft || undefined,
            videoUri: {
              uri: videoAsset.uri,
              width: videoAsset.width,
              height: videoAsset.height,
            },
            logContext: 'Fab',
          })
          return
        }

        const imageUris = assets
          .filter(asset => asset.mimeType?.startsWith('image/'))
          .slice(0, MAX_GALLERY_IMAGES)
          .map(asset => ({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
          }))

        if (imageUris.length > 0) {
          openComposer({
            text: trimmedDraft || undefined,
            imageUris,
            logContext: 'Fab',
          })
        }
      }
    } catch (err: any) {
      if (!String(err).toLowerCase().includes('cancel')) {
        ax.logger.error('Error opening image picker', {error: err})
      }
    }
  }, [
    ax,
    openComposer,
    requestPhotoAccessIfNeeded,
    requestVideoAccessIfNeeded,
    requireAuth,
    sheetWrapper,
    trimmedDraft,
  ])

  const onPressCamera = useCallback(async () => {
    ax.metric('composerPrompt:camera:press', {})

    try {
      if (!(await requestCameraAccessIfNeeded())) {
        return
      }

      if (IS_NATIVE && Keyboard.isVisible()) {
        Keyboard.dismiss()
      }

      const image = await openCamera({
        mediaTypes: 'images',
      })
      if (!image) {
        return
      }

      const imageUris = [
        {
          uri: image.path,
          width: image.width,
          height: image.height,
        },
      ]

      let nativeImageUris
      if (IS_NATIVE) {
        nativeImageUris = imageUris
      }
      openComposer({
        text: trimmedDraft || undefined,
        imageUris: nativeImageUris,
        logContext: 'Fab',
      })
    } catch (err: any) {
      if (!String(err).toLowerCase().includes('cancel')) {
        ax.logger.error('Error opening camera', {error: err})
      }
    }
  }, [ax, openComposer, requestCameraAccessIfNeeded, trimmedDraft])

  if (!IS_WEB && !profile) {
    return null
  }

  const counterColor = isOverLimit
    ? colors.like
    : charCount >= 260
      ? colors.accent
      : colors.muted

  return (
    <View
      style={[
        {
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
        },
      ]}>
      <View style={[a.flex_row, a.align_start, a.gap_md]}>
        <View style={{paddingTop: 2}}>
          <UserAvatar
            avatar={profile?.avatar}
            size={40}
            type={profile?.associated?.labeler ? 'labeler' : 'user'}
          />
        </View>
        <View style={[a.flex_1, {minWidth: 0}]}>
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            placeholder="What's zinging?"
            placeholderTextColor={colors.muted}
            multiline
            accessibilityLabel="What's zinging?"
            style={[
              {
                color: colors.text,
                fontSize: 19,
                lineHeight: 24,
                minHeight: 46,
                paddingTop: 4,
                paddingBottom: 6,
                textAlignVertical: 'top',
              },
              web({
                outline: 'none',
                resize: 'none',
              }),
            ]}
          />

          {pollOpen && (
            <View
              testID="composerPollBuilder"
              style={[
                a.gap_sm,
                {
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}>
              <View style={[a.flex_row, a.align_center, a.justify_between]}>
                <Text
                  style={[
                    a.text_xs,
                    a.font_bold,
                    {color: colors.accent, letterSpacing: 0.4},
                  ]}>
                  ZING POLL
                </Text>
                <Pressable
                  onPress={onTogglePoll}
                  accessibilityRole="button"
                  accessibilityLabel="Remove poll">
                  <Text style={[a.text_xs, {color: colors.like}]}>
                    Remove poll
                  </Text>
                </Pressable>
              </View>
              {pollOptions.map((option, index) => (
                <View
                  key={index}
                  style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <TextInput
                    value={option}
                    onChangeText={val => onUpdatePollOption(index, val)}
                    placeholder={`Choice ${index + 1}${index >= 2 ? ' (optional)' : ''}`}
                    placeholderTextColor={colors.muted}
                    maxLength={60}
                    accessibilityLabel={`Poll choice ${index + 1}`}
                    style={[
                      a.flex_1,
                      {
                        color: colors.text,
                        fontSize: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.bg,
                      },
                      web({outline: 'none'}),
                    ]}
                  />
                  {pollOptions.length > MIN_POLL_OPTIONS && (
                    <Pressable
                      onPress={() => onRemovePollOption(index)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove choice ${index + 1}`}
                      style={[
                        a.align_center,
                        a.justify_center,
                        a.rounded_full,
                        {width: 30, height: 30},
                      ]}>
                      <CloseIcon width={14} style={{color: colors.muted}} />
                    </Pressable>
                  )}
                </View>
              ))}

              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.flex_wrap,
                  a.gap_xs,
                  {paddingTop: 2},
                ]}>
                {pollOptions.length < MAX_POLL_OPTIONS ? (
                  <Pressable
                    onPress={onAddPollOption}
                    accessibilityRole="button"
                    accessibilityLabel="Add poll choice"
                    style={[a.flex_row, a.align_center, a.gap_xs]}>
                    <PlusIcon width={14} style={{color: colors.accent}} />
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: colors.accent},
                      ]}>
                      Add choice
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}

                <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    Duration:
                  </Text>
                  {POLL_DURATIONS.map(d => {
                    const active = pollDurationHours === d.hours
                    return (
                      <Pressable
                        key={d.hours}
                        accessibilityRole="button"
                        accessibilityLabel={`Poll duration ${d.label}`}
                        onPress={() => setPollDurationHours(d.hours)}
                        style={[
                          a.px_xs,
                          {
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: active
                              ? colors.accentSubtle
                              : colors.surface,
                            borderWidth: 1,
                            borderColor: active ? colors.accent : colors.border,
                          },
                        ]}>
                        <Text
                          style={[
                            {
                              fontSize: 11,
                              fontWeight: active ? '700' : '500',
                              color: active ? colors.accent : colors.muted,
                            },
                          ]}>
                          {d.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>
          )}

          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              a.flex_wrap,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                marginTop: 10,
                paddingTop: 10,
                rowGap: 8,
                columnGap: 6,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <Button
                onPress={() => void onPressImage()}
                label="Add media"
                variant="ghost"
                shape="round"
                style={{width: 30, height: 30, padding: 0}}>
                <ImageIcon width={19} style={{color: colors.accent}} />
              </Button>
              {IS_NATIVE && (
                <Button
                  onPress={() => requireAuth(() => void onPressCamera())}
                  label="Open camera"
                  variant="ghost"
                  shape="round"
                  style={{width: 30, height: 30, padding: 0}}>
                  <CameraIcon width={19} style={{color: colors.accent}} />
                </Button>
              )}
              <Button
                onPress={onTogglePoll}
                label={pollOpen ? 'Close poll' : 'Add poll'}
                variant="ghost"
                shape="round"
                style={[
                  {width: 30, height: 30, padding: 0},
                  pollOpen && {backgroundColor: colors.accentSubtle},
                ]}>
                <PollIcon width={19} style={{color: colors.accent}} />
              </Button>
              <Button
                onPress={onPressAskQuanty}
                label="Draft with Quanty"
                variant="ghost"
                shape="round"
                style={{width: 30, height: 30, padding: 0}}>
                <SparkleIcon width={19} style={{color: colors.accent}} />
              </Button>
              <Pressable
                testID="composerTagQuantyBtn"
                onPress={onPressTagQuanty}
                accessibilityRole="button"
                accessibilityLabel="Mention @quanty in Zing"
                style={({pressed}) => [
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    paddingHorizontal: 8,
                    height: 26,
                    backgroundColor: colors.accentSubtle,
                    borderWidth: 1,
                    borderColor: colors.accent,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}>
                <Text
                  style={[
                    a.text_xs,
                    a.font_bold,
                    {color: colors.accent, lineHeight: 14},
                  ]}>
                  @quanty
                </Text>
              </Pressable>
            </View>

            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_medium,
                  {color: counterColor, fontVariant: ['tabular-nums']},
                ]}>
                {charCount}/{MAX_WAVE_LENGTH}
              </Text>
              <Pressable
                testID="composerPromptPostBtn"
                disabled={isOverLimit || isPublishing}
                onPress={onPressWave}
                accessibilityRole="button"
                accessibilityLabel={
                  hasSession ? 'Post Zing' : 'Sign in to Zing'
                }
                style={({pressed}) => [
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.gap_xs,
                  a.rounded_full,
                  {
                    backgroundColor: colors.ctaBg,
                    height: 34,
                    paddingHorizontal: 14,
                    opacity:
                      isOverLimit || isPublishing
                        ? 0.45
                        : !hasContent && hasSession
                          ? 0.75
                          : pressed
                            ? 0.86
                            : 1,
                  },
                ]}>
                {isPublishing ? (
                  <ActivityIndicator size="small" color={colors.ctaText} />
                ) : (
                  <Text
                    style={[
                      a.font_bold,
                      {
                        color: colors.ctaText,
                        fontSize: 15,
                        lineHeight: 18,
                      },
                    ]}>
                    Zing
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
