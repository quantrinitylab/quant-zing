import {useEffect, useMemo, useState} from 'react'
import {Keyboard, Pressable, type StyleProp, type ViewStyle} from 'react-native'
import {type AnimatedStyle} from 'react-native-reanimated'
import {type AtUriString, toDatetimeString} from '@atproto/syntax'
import {Trans, useLingui} from '@lingui/react/macro'
import deepEqual from 'fast-deep-equal'

import {isNetworkError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {usePostInteractionSettingsMutation} from '#/state/queries/post-interaction-settings'
import {createPostgateRecord} from '#/state/queries/postgate/util'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {
  type ThreadgateAllowUISetting,
  threadgateAllowUISettingToAllowRecordValue,
  threadgateRecordToAllowUISetting,
} from '#/state/queries/threadgate'
import {atoms as a} from '#/alf'
import * as Dialog from '#/components/Dialog'
import {PostInteractionSettingsControlledDialog} from '#/components/dialogs/PostInteractionSettingsDialog'
import {TinyChevronBottom_Stroke2_Corner0_Rounded as TinyChevronIcon} from '#/components/icons/Chevron'
import {Earth_Stroke2_Corner0_Rounded as EarthIcon} from '#/components/icons/Globe'
import {Group3_Stroke2_Corner0_Rounded as GroupIcon} from '#/components/icons/Group'
import * as Tooltip from '#/components/Tooltip'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'
import {type app} from '#/lexicons'
import {useThreadgateNudged} from '#/storage/hooks/threadgate-nudged'

export function ThreadgateBtn({
  postgate,
  onChangePostgate,
  threadgateAllowUISettings,
  onChangeThreadgateAllowUISettings,
}: {
  postgate: app.bsky.feed.postgate.Main
  onChangePostgate: (v: app.bsky.feed.postgate.Main) => void

  threadgateAllowUISettings: ThreadgateAllowUISetting[]
  onChangeThreadgateAllowUISettings: (v: ThreadgateAllowUISetting[]) => void

  style?: StyleProp<AnimatedStyle<ViewStyle>>
}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const control = Dialog.useDialogControl()
  const [threadgateNudged, setThreadgateNudged] = useThreadgateNudged()
  const [showTooltip, setShowTooltip] = useState(false)
  // eslint-disable-next-line react/hook-use-state
  const [tooltipWasShown] = useState(!threadgateNudged)

  useEffect(() => {
    if (!threadgateNudged) {
      const timeout = setTimeout(() => {
        setShowTooltip(true)
      }, 1000)
      return () => clearTimeout(timeout)
    }
  }, [threadgateNudged])

  const onDismissTooltip = (visible: boolean) => {
    if (visible) return
    setThreadgateNudged(true)
    setShowTooltip(false)
  }

  const {data: preferences} = usePreferencesQuery()
  const [persist, setPersist] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  const onPress = () => {
    ax.metric('composer:threadgate:open', {
      nudged: tooltipWasShown,
    })

    if (IS_NATIVE && Keyboard.isVisible()) {
      Keyboard.dismiss()
    }

    setShowTooltip(false)
    setThreadgateNudged(true)

    control.open()
  }

  const prefThreadgateAllowUISettings = threadgateRecordToAllowUISetting({
    $type: 'app.bsky.feed.threadgate',
    post: '' as AtUriString,
    createdAt: toDatetimeString(new Date()),
    allow: preferences?.postInteractionSettings.threadgateAllowRules,
  })
  const prefPostgate = createPostgateRecord({
    post: '',
    embeddingRules:
      preferences?.postInteractionSettings?.postgateEmbeddingRules || [],
  })

  const isDirty = useMemo(() => {
    const everybody = [{type: 'everybody'}]
    return (
      !deepEqual(
        threadgateAllowUISettings,
        prefThreadgateAllowUISettings ?? everybody,
      ) ||
      !deepEqual(postgate.embeddingRules, prefPostgate?.embeddingRules ?? [])
    )
  }, [
    prefThreadgateAllowUISettings,
    prefPostgate,
    threadgateAllowUISettings,
    postgate,
  ])

  const {mutate: persistChanges, isPending: isSaving} =
    usePostInteractionSettingsMutation({
      onError: err => {
        if (!isNetworkError(err)) {
          logger.error('Failed to persist threadgate settings', {
            safeMessage: err,
          })
        }
      },
      onSettled: () => {
        control.close(() => {
          setPersist(false)
        })
      },
    })

  const anyoneCanReply =
    threadgateAllowUISettings.length === 1 &&
    threadgateAllowUISettings[0].type === 'everybody'
  const anyoneCanQuote =
    !postgate.embeddingRules || postgate.embeddingRules.length === 0
  const anyoneCanInteract = anyoneCanReply && anyoneCanQuote
  const label = anyoneCanInteract
    ? l`Everyone can reply`
    : l`Interaction limited`

  return (
    <>
      <Tooltip.Outer
        visible={showTooltip}
        onVisibleChange={onDismissTooltip}
        position="top">
        <Tooltip.Target>
          <Pressable
            testID="openReplyGateButton"
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={l`Opens a dialog to choose who can interact with this post`}
            onPress={onPress}
            onHoverIn={() => setIsHovered(true)}
            onHoverOut={() => setIsHovered(false)}
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              {
                backgroundColor: isPressed
                  ? 'rgba(29, 155, 240, 0.22)'
                  : isHovered
                  ? 'rgba(29, 155, 240, 0.18)'
                  : 'rgba(29, 155, 240, 0.12)',
                borderRadius: 9999,
                paddingHorizontal: 12,
                paddingVertical: 5,
                alignSelf: 'flex-start',
              },
            ]}>
            {anyoneCanInteract ? (
              <EarthIcon size="sm" style={{color: '#1D9BF0'}} />
            ) : (
              <GroupIcon size="sm" style={{color: '#1D9BF0'}} />
            )}
            <Text
              style={{
                color: '#1D9BF0',
                fontWeight: '600',
                fontSize: 13,
                lineHeight: 16,
              }}
              numberOfLines={1}
              maxFontSizeMultiplier={2}>
              {label}
            </Text>
            <TinyChevronIcon size="2xs" style={{color: '#1D9BF0'}} />
          </Pressable>
        </Tooltip.Target>
        <Tooltip.BubbleText
          label={l`Psst! You can edit who can interact with this post.`}>
          <Trans>Psst! You can edit who can interact with this post.</Trans>
        </Tooltip.BubbleText>
      </Tooltip.Outer>
      <PostInteractionSettingsControlledDialog
        control={control}
        onSave={() => {
          if (persist) {
            persistChanges({
              threadgateAllowRules: threadgateAllowUISettingToAllowRecordValue(
                threadgateAllowUISettings,
              ),
              postgateEmbeddingRules: postgate.embeddingRules ?? [],
            })
          } else {
            control.close()
          }
        }}
        isSaving={isSaving}
        postgate={postgate}
        onChangePostgate={onChangePostgate}
        threadgateAllowUISettings={threadgateAllowUISettings}
        onChangeThreadgateAllowUISettings={onChangeThreadgateAllowUISettings}
        isDirty={isDirty}
        persist={persist}
        onChangePersist={setPersist}
      />
    </>
  )
}
