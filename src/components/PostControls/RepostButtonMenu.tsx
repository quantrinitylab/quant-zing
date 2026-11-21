import {useRequireAuth, useSession} from '#/state/session'
import {EventStopper} from '#/view/com/util/EventStopper'
import {CloseQuote_Stroke2_Corner1_Rounded as QuoteIcon} from '#/components/icons/Quote'
import {Repost_Stroke2_Corner2_Rounded as RepostIcon} from '#/components/icons/Repost'
import * as Menu from '#/components/Menu'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'

export interface RepostButtonProps {
  isReposted: boolean
  repostCount?: number
  onRepost: () => void
  onQuote: () => void
  big?: boolean
  embeddingDisabled: boolean
  longPressToQuote?: boolean
}

export function RepostButtonMenu({
  isReposted,
  repostCount,
  onRepost,
  onQuote,
  big,
  embeddingDisabled,
  longPressToQuote = false,
}: RepostButtonProps): React.ReactNode {
  const {hasSession} = useSession()
  const requireAuth = useRequireAuth()
  const formatPostStatCount = useFormatPostStatCount()

  return hasSession ? (
    <EventStopper onKeyDown={false}>
      <Menu.Root>
        <Menu.Trigger label="Rezing or Quote Zing">
          {({props}) => (
            <PostControlButton
              testID="repostBtn"
              active={isReposted}
              activeColor="#00BA7C"
              label={props.accessibilityLabel}
              big={big}
              {...props}
              onLongPress={
                longPressToQuote
                  ? () =>
                      requireAuth(() => {
                        if (embeddingDisabled) {
                          props.onPress()
                        } else {
                          onQuote()
                        }
                      })
                  : undefined
              }>
              <PostControlButtonIcon icon={RepostIcon} />
              {typeof repostCount !== 'undefined' && repostCount > 0 && (
                <PostControlButtonText testID="repostCount">
                  {formatPostStatCount(repostCount)}
                </PostControlButtonText>
              )}
            </PostControlButton>
          )}
        </Menu.Trigger>
        <Menu.Outer style={{minWidth: 170}}>
          <Menu.Group>
            <Menu.Item
              label={isReposted ? 'Undo rezing' : 'Rezing'}
              testID="repostDropdownRepostBtn"
              onPress={onRepost}>
              <Menu.ItemText>
                {isReposted ? 'Undo rezing' : 'Rezing'}
              </Menu.ItemText>
              <Menu.ItemIcon icon={RepostIcon} position="right" />
            </Menu.Item>
            <Menu.Item
              disabled={embeddingDisabled}
              label={embeddingDisabled ? 'Quote Zings disabled' : 'Quote Zing'}
              testID="repostDropdownQuoteBtn"
              onPress={onQuote}>
              <Menu.ItemText>
                {embeddingDisabled ? 'Quote Zings disabled' : 'Quote Zing'}
              </Menu.ItemText>
              <Menu.ItemIcon icon={QuoteIcon} position="right" />
            </Menu.Item>
          </Menu.Group>
        </Menu.Outer>
      </Menu.Root>
    </EventStopper>
  ) : (
    <PostControlButton
      onPress={() => requireAuth(() => {})}
      active={isReposted}
      activeColor="#00BA7C"
      label="Rezing or Quote Zing"
      big={big}>
      <PostControlButtonIcon icon={RepostIcon} />
      {typeof repostCount !== 'undefined' && repostCount > 0 && (
        <PostControlButtonText testID="repostCount">
          {formatPostStatCount(repostCount)}
        </PostControlButtonText>
      )}
    </PostControlButton>
  )
}
