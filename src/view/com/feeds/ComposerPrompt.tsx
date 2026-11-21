import {useCallback, useMemo, useState} from 'react'
import {Keyboard, Pressable, StyleSheet, TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {
  useCameraPermission,
  usePhotoLibraryPermission,
  useVideoLibraryPermission,
} from '#/lib/hooks/usePermissions'
import {openCamera, openUnifiedPicker} from '#/lib/media/picker'
import {type NavigationProp} from '#/lib/routes/types'
import {useCurrentAccountProfile} from '#/state/queries/useCurrentAccountProfile'
import {useRequireAuth, useSession} from '#/state/session'
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
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE, IS_WEB} from '#/env'

const MAX_WAVE_LENGTH = 300
const MIN_POLL_OPTIONS = 2
const MAX_POLL_OPTIONS = 4

function formatWaveWithPoll(
  rawText: string,
  pollOpen: boolean,
  pollOptions: string[],
) {
  const trimmed = rawText.trim()
  if (!pollOpen) return trimmed
  const filledOptions = pollOptions.map(o => o.trim()).filter(Boolean)
  if (filledOptions.length === 0) return trimmed
  const pollBlock = [
    'Poll:',
    ...filledOptions.map((opt, idx) => `${idx + 1}. ${opt}`),
  ].join('\n')
  return trimmed ? `${trimmed}\n\n${pollBlock}` : pollBlock
}

export function ComposerPrompt() {
  const t = useTheme()
  const ax = useAnalytics()
  const navigation = useNavigation<NavigationProp>()
  const {hasSession} = useSession()
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

  const composedText = useMemo(
    () => formatWaveWithPoll(draftText, pollOpen, pollOptions),
    [draftText, pollOpen, pollOptions],
  )
  const charCount = composedText.length
  const isOverLimit = charCount > MAX_WAVE_LENGTH
  const hasContent = charCount > 0

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

  const onPressWave = useCallback(() => {
    if (isOverLimit) return
    ax.metric('composerPrompt:press', {})
    requireAuth(() => {
      openComposer({
        text: composedText || undefined,
        logContext: 'Fab',
      })
      setDraftText('')
      setPollOpen(false)
      setPollOptions(['', ''])
    })
  }, [ax, composedText, isOverLimit, openComposer, requireAuth])

  const onPressAskQuanty = useCallback(() => {
    const prompt = draftText.trim()
      ? `Refine and fact-check this Wave draft: ${draftText.trim()}`
      : 'Help me draft a high-signal Wave about trending topics today'
    navigation.navigate('Quanty', {prompt})
  }, [draftText, navigation])

  const onPressImage = useCallback(async () => {
    ax.metric('composerPrompt:gallery:press', {})

    if (!IS_NATIVE) {
      requireAuth(() => {
        openComposer({
          text: composedText || undefined,
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
            text: composedText || undefined,
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
    composedText,
    openComposer,
    requestPhotoAccessIfNeeded,
    requestVideoAccessIfNeeded,
    requireAuth,
    sheetWrapper,
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
        text: composedText || undefined,
        imageUris: nativeImageUris,
        logContext: 'Fab',
      })
    } catch (err: any) {
      if (!String(err).toLowerCase().includes('cancel')) {
        ax.logger.error('Error opening camera', {error: err})
      }
    }
  }, [ax, composedText, openComposer, requestCameraAccessIfNeeded])

  if (!IS_WEB && !profile) {
    return null
  }

  const isLight = t.name === 'light'
  const pillBg = isLight ? '#0F1419' : '#EFF3F4'
  const pillText = isLight ? '#FFFFFF' : '#0F1419'
  const counterColor = isOverLimit
    ? '#F91880'
    : charCount >= 260
      ? '#1D9BF0'
      : '#71767B'

  return (
    <View
      style={[
        t.atoms.bg,
        {
          borderBottomWidth: 1,
          borderColor: t.atoms.border_contrast_low.borderColor,
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
        <View style={[a.flex_1]}>
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            placeholder="What's zinging?"
            placeholderTextColor="#71767B"
            multiline
            accessibilityLabel="What's zinging?"
            style={[
              {
                color: t.atoms.text.color,
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
              style={[
                a.gap_sm,
                {
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.atoms.border_contrast_low.borderColor,
                  backgroundColor: isLight ? '#F7F9F9' : '#16181C',
                },
              ]}>
              <View style={[a.flex_row, a.align_center, a.justify_between]}>
                <Text
                  style={[
                    a.text_xs,
                    a.font_bold,
                    {color: '#1D9BF0', letterSpacing: 0.4},
                  ]}>
                  ZING POLL
                </Text>
                <Pressable
                  onPress={onTogglePoll}
                  accessibilityRole="button"
                  accessibilityLabel="Remove poll">
                  <Text style={[a.text_xs, {color: '#F91880'}]}>
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
                    placeholderTextColor="#71767B"
                    maxLength={40}
                    accessibilityLabel={`Poll choice ${index + 1}`}
                    style={[
                      a.flex_1,
                      {
                        color: t.atoms.text.color,
                        fontSize: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: t.atoms.border_contrast_low.borderColor,
                        backgroundColor: isLight ? '#FFFFFF' : '#000000',
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
                      <CloseIcon width={14} style={{color: '#71767B'}} />
                    </Pressable>
                  )}
                </View>
              ))}
              {pollOptions.length < MAX_POLL_OPTIONS && (
                <Pressable
                  onPress={onAddPollOption}
                  accessibilityRole="button"
                  accessibilityLabel="Add poll choice"
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    {paddingTop: 2, alignSelf: 'flex-start'},
                  ]}>
                  <PlusIcon width={14} style={{color: '#1D9BF0'}} />
                  <Text style={[a.text_xs, a.font_semi_bold, {color: '#1D9BF0'}]}>
                    Add choice
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: t.atoms.border_contrast_low.borderColor,
                marginTop: 10,
                paddingTop: 10,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <Button
                onPress={() => void onPressImage()}
                label="Add image"
                variant="ghost"
                shape="round"
                style={{width: 34, height: 34, padding: 0}}>
                <ImageIcon width={19} style={{color: '#1D9BF0'}} />
              </Button>
              {IS_NATIVE && (
                <Button
                  onPress={() => requireAuth(() => void onPressCamera())}
                  label="Open camera"
                  variant="ghost"
                  shape="round"
                  style={{width: 34, height: 34, padding: 0}}>
                  <CameraIcon width={19} style={{color: '#1D9BF0'}} />
                </Button>
              )}
              <Button
                onPress={onTogglePoll}
                label={pollOpen ? 'Close poll' : 'Add poll'}
                variant="ghost"
                shape="round"
                style={[
                  {width: 34, height: 34, padding: 0},
                  pollOpen && {backgroundColor: 'rgba(29, 155, 240, 0.16)'},
                ]}>
                <PollIcon width={19} style={{color: '#1D9BF0'}} />
              </Button>
              <Button
                onPress={onPressAskQuanty}
                label="Draft with Quanty"
                variant="ghost"
                shape="round"
                style={{width: 34, height: 34, padding: 0}}>
                <SparkleIcon width={19} style={{color: '#1D9BF0'}} />
              </Button>
            </View>

            <View style={[a.flex_row, a.align_center, a.gap_md]}>
              <Text
                style={[
                  a.text_xs,
                  a.font_medium,
                  {color: counterColor, fontVariant: ['tabular-nums']},
                ]}>
                {charCount}/{MAX_WAVE_LENGTH}
              </Text>
              <Pressable
                disabled={isOverLimit}
                onPress={onPressWave}
                accessibilityRole="button"
                accessibilityLabel={
                  hasSession ? 'Post Zing' : 'Sign in to Zing'
                }
                style={({pressed}) => [
                  a.align_center,
                  a.justify_center,
                  a.rounded_full,
                  {
                    backgroundColor: pillBg,
                    height: 36,
                    paddingHorizontal: 18,
                    opacity: isOverLimit
                      ? 0.4
                      : !hasContent && hasSession
                        ? 0.72
                        : pressed
                          ? 0.86
                          : 1,
                  },
                ]}>
                <Text
                  style={[
                    a.font_bold,
                    {
                      color: pillText,
                      fontSize: 15,
                      lineHeight: 18,
                    },
                  ]}>
                  Zing
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
