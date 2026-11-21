import {memo, useCallback} from 'react'
import {View} from 'react-native'

import {useHaptics} from '#/lib/haptics'
import {useRequireAuth} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {CloseQuote_Stroke2_Corner1_Rounded as QuoteIcon} from '#/components/icons/Quote'
import {Repost_Stroke2_Corner3_Rounded as RepostIcon} from '#/components/icons/Repost'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import {Text} from '#/components/Typography'
import {IS_IPAD} from '#/env'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'
import {RepostButtonMenu, type RepostButtonProps} from './RepostButtonMenu'

let RepostButton = (props: RepostButtonProps): React.ReactNode =>
  IS_IPAD ? (
    <RepostButtonMenu {...props} longPressToQuote />
  ) : (
    <RepostButtonDialog {...props} />
  )

RepostButton = memo(RepostButton)
export {RepostButton}

function RepostButtonDialog({
  isReposted,
  repostCount,
  onRepost,
  onQuote,
  big,
  embeddingDisabled,
}: RepostButtonProps): React.ReactNode {
  const requireAuth = useRequireAuth()
  const dialogControl = Dialog.useDialogControl()
  const formatPostStatCount = useFormatPostStatCount()

  const onPress = () => requireAuth(() => dialogControl.open())

  const onLongPress = () =>
    requireAuth(() => {
      if (embeddingDisabled) {
        dialogControl.open()
      } else {
        onQuote()
      }
    })

  const count = repostCount || 0
  const countLabel = count === 1 ? '1 rezing' : `${count} rezings`

  return (
    <>
      <PostControlButton
        testID="repostBtn"
        active={isReposted}
        activeColor="#00BA7C"
        big={big}
        onPress={onPress}
        onLongPress={onLongPress}
        label={
          isReposted
            ? `Undo rezing (${countLabel})`
            : `Rezing (${countLabel})`
        }>
        <PostControlButtonIcon icon={RepostIcon} />
        {typeof repostCount !== 'undefined' && repostCount > 0 && (
          <PostControlButtonText testID="repostCount">
            {formatPostStatCount(repostCount)}
          </PostControlButtonText>
        )}
      </PostControlButton>
      <Dialog.Outer
        control={dialogControl}
        nativeOptions={{preventExpansion: true}}>
        <Dialog.Handle />
        <RepostButtonDialogInner
          isReposted={isReposted}
          onRepost={onRepost}
          onQuote={onQuote}
          embeddingDisabled={embeddingDisabled}
        />
      </Dialog.Outer>
    </>
  )
}

let RepostButtonDialogInner = ({
  isReposted,
  onRepost,
  onQuote,
  embeddingDisabled,
}: {
  isReposted: boolean
  onRepost: () => void
  onQuote: () => void
  embeddingDisabled: boolean
}): React.ReactNode => {
  const t = useTheme()
  const haptics = useHaptics()
  const control = Dialog.useDialogContext()

  const onPressRepost = useCallback(() => {
    if (!isReposted) haptics.confirm()

    control.close(() => {
      onRepost()
    })
  }, [control, isReposted, onRepost, haptics])

  const onPressQuote = useCallback(() => {
    haptics.confirm()
    control.close(() => {
      onQuote()
    })
  }, [control, onQuote, haptics])

  const onPressClose = useCallback(() => control.close(), [control])

  return (
    <Dialog.ScrollableInner label="Rezing or Quote Zing">
      <View style={a.gap_xl}>
        <View style={a.gap_xs}>
          <Button
            style={[a.justify_start, a.px_md, a.gap_sm]}
            label={isReposted ? 'Undo rezing' : 'Rezing'}
            onPress={onPressRepost}
            size="large"
            variant="ghost"
            color="primary">
            <RepostIcon size="lg" fill="#00BA7C" />
            <Text style={[a.font_semi_bold, a.text_xl]}>
              {isReposted ? 'Undo rezing' : 'Rezing'}
            </Text>
          </Button>
          <Button
            disabled={embeddingDisabled}
            testID="quoteBtn"
            style={[a.justify_start, a.px_md, a.gap_sm]}
            label={embeddingDisabled ? 'Quote Zings disabled' : 'Quote Zing'}
            onPress={onPressQuote}
            size="large"
            variant="ghost"
            color="primary">
            <QuoteIcon
              size="lg"
              fill={
                embeddingDisabled
                  ? t.atoms.text_contrast_low.color
                  : '#1D9BF0'
              }
            />
            <Text
              style={[
                a.font_semi_bold,
                a.text_xl,
                embeddingDisabled && t.atoms.text_contrast_low,
              ]}>
              {embeddingDisabled ? 'Quote Zings disabled' : 'Quote Zing'}
            </Text>
          </Button>
        </View>
        <Button
          label="Cancel Quote Zing"
          onPress={onPressClose}
          size="large"
          color="secondary">
          <ButtonText>Cancel</ButtonText>
        </Button>
      </View>
    </Dialog.ScrollableInner>
  )
}
RepostButtonDialogInner = memo(RepostButtonDialogInner)
export {RepostButtonDialogInner}
