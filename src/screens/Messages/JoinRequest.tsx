import {useEffect} from 'react'
import {View} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
import {moderateProfile} from '@bsky/sdk/moderation'
import {Trans, useLingui} from '@lingui/react/macro'

import {createSanitizedDisplayName} from '#/lib/moderation/create-sanitized-display-name'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useJoinLinkPreviewsQuery} from '#/state/queries/join-links'
import {useActiveGroupChatJoinRequest} from '#/state/shell/landing'
import {LoggedOutScreenState} from '#/view/com/auth/LoggedOut'
import {LogomarkWithType} from '#/view/icons/LogomarkWithType'
import {atoms as a, useTheme} from '#/alf'
import {AvatarBubbles} from '#/components/AvatarBubbles'
import {Button, ButtonText} from '#/components/Button'
import {ChainLinkBroken_Stroke2_Corner0_Rounded as ChainLinkBrokenIcon} from '#/components/icons/ChainLink'
import {Message_Stroke2_Corner0_Rounded as MessageIcon} from '#/components/icons/Message'
import {PersonGroup_Stroke2_Corner2_Rounded as PersonGroupIcon} from '#/components/icons/Person'
import {ProfileBadges} from '#/components/ProfileBadges'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'
import {chat} from '#/lexicons'
import * as bsky from '#/types/bsky'

type Props = {
  setScreenState: (state: LoggedOutScreenState) => void
}

export function JoinRequest({setScreenState}: Props) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ax = useAnalytics()

  const moderationOpts = useModerationOpts()

  useEffect(() => {
    ax.metric('groupchat:landingPage:view', {hasSession: false})
  }, [ax])

  // Get code from context (logged-out only)
  const contextJoinRequest = useActiveGroupChatJoinRequest()
  const code = contextJoinRequest?.code

  const {data, error} = useJoinLinkPreviewsQuery({
    codes: code ? [code] : undefined,
    hasSession: false,
  })

  const joinLinkPreview = data?.joinLinkPreviews[0]

  return (
    <View style={[a.util_screen_outer, a.w_full, {backgroundColor: '#16181C'}]}>
      <View
        style={[
          a.util_screen_outer,
          a.w_full,
          a.flex_1,
          a.justify_center,
          a.relative,
          a.overflow_hidden,
        ]}>
        <LinearGradient
          colors={['#16181C', '#0D0E10', '#16181C']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={[a.absolute, a.inset_0]}
        />
        <View
          style={[a.absolute, {top: -50, right: -50, opacity: 0.06}]}
          pointerEvents="none">
          <MessageIcon width={320} height={320} fill="#1D9BF0" />
        </View>
        <View
          style={[a.absolute, {bottom: -50, left: -50, opacity: 0.04}]}
          pointerEvents="none">
          <PersonGroupIcon width={280} height={280} fill="#1D9BF0" />
        </View>
        <View
          style={[
            a.util_screen_outer,
            a.w_full,
            a.justify_center,
            a.align_center,
          ]}>
          {error ||
          (data &&
            !bsky.isType(
              chat.bsky.group.defs.joinLinkPreviewView,
              joinLinkPreview,
            )) ? (
            <Wrapper>
              <ChainLinkBrokenIcon fill={t.palette.primary_500} size="3xl" />
              <Text
                style={[
                  a.mb_sm,
                  a.text_center,
                  a.text_lg,
                  a.font_semi_bold,
                  t.atoms.text,
                ]}>
                <Trans>Chat invite link no longer available</Trans>
              </Text>
              <ActionButtons setScreenState={setScreenState} />
            </Wrapper>
          ) : data &&
            moderationOpts &&
            bsky.isType(
              chat.bsky.group.defs.joinLinkPreviewView,
              joinLinkPreview,
            ) ? (
            <Wrapper>
              <AvatarBubbles
                profiles={[joinLinkPreview.owner]}
                count={joinLinkPreview.memberCount}
                size={135}
              />
              <View style={[a.gap_2xs]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.justify_center,
                    a.gap_sm,
                  ]}>
                  <Text
                    style={[
                      a.text_center,
                      a.text_xs,
                      a.leading_snug,
                      t.atoms.text_contrast_medium,
                    ]}>
                    <Trans>Group chat</Trans>
                  </Text>
                  <View style={[a.flex_row, a.align_center]}>
                    <PersonGroupIcon
                      size="xs"
                      style={[a.mr_2xs, t.atoms.text_contrast_medium]}
                    />
                    <Text
                      style={[
                        a.text_center,
                        a.text_xs,
                        a.leading_snug,
                        t.atoms.text_contrast_medium,
                      ]}>
                      <Trans
                        context="group-chat-member-count"
                        comment="The number of active group chat members out of the total number allowed.">
                        {joinLinkPreview.memberCount}/
                        {joinLinkPreview.memberLimit}
                      </Trans>
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    a.text_center,
                    a.text_4xl,
                    a.leading_tight,
                    a.font_bold,
                    t.atoms.text,
                  ]}>
                  {joinLinkPreview.name}
                </Text>
              </View>
              <View style={[a.w_full]}>
                <View
                  style={[
                    a.flex_row,
                    a.gap_xs,
                    a.align_center,
                    a.justify_center,
                    a.mb_xs,
                  ]}>
                  <Text
                    style={[
                      a.text_center,
                      a.text_sm,
                      a.leading_snug,
                      a.font_semi_bold,
                      t.atoms.text,
                      a.max_w_full,
                    ]}>
                    <Trans comment="The owner (creator) of a group chat.">
                      By{' '}
                      {createSanitizedDisplayName(
                        joinLinkPreview.owner,
                        true,
                        moderateProfile(
                          joinLinkPreview.owner,
                          moderationOpts,
                        ).ui('displayName'),
                      )}
                    </Trans>
                  </Text>
                  <ProfileBadges profile={joinLinkPreview.owner} size="sm" />
                </View>
                <Text
                  style={[
                    a.text_center,
                    a.text_xs,
                    a.leading_snug,
                    a.font_medium,
                    t.atoms.text_contrast_medium,
                    a.max_w_full,
                  ]}>
                  {sanitizeHandle(joinLinkPreview.owner.handle, '@')}
                </Text>
              </View>
              <Text
                style={[
                  a.text_center,
                  a.text_sm,
                  a.leading_snug,
                  t.atoms.text_contrast_high,
                ]}>
                {joinLinkPreview.requireApproval
                  ? l`Sign in to request access to this group chat.`
                  : l`Sign in to accept invite.`}{' '}
                {joinLinkPreview.joinRule === 'followedByOwner' &&
                  l`Only people ${createSanitizedDisplayName(
                    joinLinkPreview.owner,
                    true,
                    moderateProfile(joinLinkPreview.owner, moderationOpts).ui(
                      'displayName',
                    ),
                  )} follows can join.`}
              </Text>
              <ActionButtons setScreenState={setScreenState} />
            </Wrapper>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function Wrapper({children}: React.PropsWithChildren<unknown>) {
  const t = useTheme()

  const isDarkMode = t.name !== 'light'

  return (
    <>
      <LogomarkWithType
        width={136}
        fill={t.palette.primary_500}
        style={[
          a.absolute,
          {
            top: 40,
          },
        ]}
      />
      <View
        style={[
          a.zoom_fade_in,
          a.align_center,
          a.gap_lg,
          a.p_2xl,
          a.pt_4xl,
          t.atoms.bg,
          t.atoms.shadow_xl,
          isDarkMode ? [a.border, t.atoms.border_contrast_low] : null,
          {
            borderRadius: 48,
            maxWidth: 320,
            width: '90%',
          },
        ]}>
        {children}
      </View>
    </>
  )
}

function ActionButtons({
  setScreenState,
}: {
  setScreenState: (state: LoggedOutScreenState) => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const isDarkMode = t.name !== 'light'

  return (
    <View style={[a.w_full, a.gap_md]}>
      <Button
        testID="signInButton"
        onPress={() => {
          setScreenState(LoggedOutScreenState.S_Login)
        }}
        label={l`Sign in`}
        accessibilityHint={l`Opens flow to sign in to your existing QuantZing account`}
        size="large"
        color="primary"
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Sign in</Trans>
        </ButtonText>
      </Button>
      <Button
        testID="createAccountButton"
        onPress={() => {
          setScreenState(LoggedOutScreenState.S_CreateAccount)
        }}
        label={l`Create new account`}
        accessibilityHint={l`Opens flow to create a new QuantZing account`}
        size="large"
        color={isDarkMode ? 'secondary_inverted' : 'secondary'}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Create account</Trans>
        </ButtonText>
      </Button>
    </View>
  )
}
