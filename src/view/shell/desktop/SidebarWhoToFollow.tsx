import {type GestureResponderEvent, View} from 'react-native'

import {makeProfileLink} from '#/lib/routes/links'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {useGetSuggestedUsersForDiscoverQuery} from '#/state/queries/trending/useGetSuggestedUsersForDiscoverQuery'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useInteractionState} from '#/components/hooks/useInteractionState'
import {Link} from '#/components/Link'
import {ProfileBadges} from '#/components/ProfileBadges'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {type app} from '#/lexicons'

const SUGGESTED_LIMIT = 2

export function SidebarWhoToFollow({
  title = 'You might like',
}: {
  title?: string
} = {}) {
  const t = useTheme()
  const {data, error, isLoading} = useGetSuggestedUsersForDiscoverQuery({
    limit: SUGGESTED_LIMIT,
  })

  const actors = data?.actors?.slice(0, SUGGESTED_LIMIT) ?? []
  const noActors = !isLoading && !error && actors.length === 0

  if (error || noActors) {
    return null
  }

  const rowHoverBg =
    t.scheme === 'dark'
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(15, 20, 25, 0.03)'

  return (
    <View
      testID="sidebarWhoToFollowCard"
      style={[
        a.w_full,
        t.atoms.bg_contrast_25,
        a.rounded_lg,
        a.border,
        t.atoms.border_contrast_low,
        a.overflow_hidden,
      ]}>
      <View style={[a.px_lg, a.pt_md, a.pb_xs]}>
        <Text style={[a.text_xl, a.font_bold, t.atoms.text]}>
          {title}
        </Text>
      </View>

      <View style={[a.w_full]}>
        {isLoading
          ? Array(SUGGESTED_LIMIT)
              .fill(0)
              .map((_, i) => (
                <View
                  key={i}
                  style={[
                    a.w_full,
                    a.flex_row,
                    a.align_center,
                    a.gap_sm,
                    a.px_lg,
                    a.py_sm,
                  ]}>
                  <View
                    style={[
                      a.rounded_full,
                      t.atoms.bg_contrast_50,
                      {width: 38, height: 38},
                    ]}
                  />
                  <View style={[a.flex_1, a.gap_xs]}>
                    <View
                      style={[
                        a.rounded_xs,
                        t.atoms.bg_contrast_50,
                        {height: 14, width: '65%'},
                      ]}
                    />
                    <View
                      style={[
                        a.rounded_xs,
                        t.atoms.bg_contrast_50,
                        {height: 12, width: '48%'},
                      ]}
                    />
                  </View>
                  <View
                    style={[
                      a.rounded_full,
                      t.atoms.bg_contrast_50,
                      {height: 30, width: 64},
                    ]}
                  />
                </View>
              ))
          : actors.map((profile, index) => (
              <SuggestedProfileRow
                key={profile.did}
                profile={profile}
                position={index}
                rowHoverBg={rowHoverBg}
              />
            ))}
      </View>

      <Link
        label="Show more suggested accounts"
        to="/search"
        style={[a.w_full, a.px_lg, a.py_sm, a.justify_start]}
        hoverStyle={{backgroundColor: rowHoverBg}}>
        <Text
          style={[a.text_md, a.font_normal, {color: t.palette.primary_500}]}
          numberOfLines={1}>
          Show more
        </Text>
      </Link>
    </View>
  )
}

function SuggestedProfileRow({
  profile: rawProfile,
  position,
  rowHoverBg,
}: {
  profile: app.bsky.actor.defs.ProfileView
  position: number
  rowHoverBg: string
}) {
  const t = useTheme()
  const {hasSession, currentAccount} = useSession()
  const profile = useProfileShadow(rawProfile)
  const {
    state: hovered,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()

  const profileUrl = makeProfileLink({
    did: profile.did,
    handle: profile.handle,
  })
  const displayName = sanitizeDisplayName(
    profile.displayName || sanitizeHandle(profile.handle),
  )
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}]|[\u{FE0E}\u{FE0F}\u{200D}]/gu,
      '',
    )
    .trim() || sanitizeHandle(profile.handle)
  const handle = sanitizeHandle(profile.handle, '@')
  const isMe = currentAccount?.did === profile.did
  const canFollow =
    hasSession &&
    !isMe &&
    Boolean(profile.viewer) &&
    !profile.viewer?.blockedBy &&
    !profile.viewer?.blocking &&
    !profile.viewer?.blockingByList

  return (
    <View
      style={[
        a.w_full,
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.px_lg,
        a.py_xs,
        hovered && {backgroundColor: rowHoverBg},
      ]}
      {...web({
        onMouseEnter: onHoverIn,
        onMouseLeave: onHoverOut,
      })}>
      <Link
        to={profileUrl}
        label={`View ${displayName}'s profile`}
        style={[
          a.flex_1,
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.justify_start,
          {minWidth: 0},
        ]}>
        <UserAvatar
          type={profile.associated?.labeler ? 'labeler' : 'user'}
          size={38}
          avatar={profile.avatar}
        />
        <View style={[a.flex_1, {minWidth: 0}]}>
          <View style={[a.flex_row, a.align_center, a.max_w_full]}>
            <Text
              emoji
              style={[
                a.text_md,
                a.font_bold,
                a.leading_snug,
                a.flex_shrink,
                t.atoms.text,
              ]}
              numberOfLines={1}>
              {displayName}
            </Text>
            <ProfileBadges profile={profile} size="sm" style={[a.pl_2xs]} />
          </View>
          <Text
            emoji
            style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_low]}
            numberOfLines={1}>
            {handle}
          </Text>
        </View>
      </Link>

      {canFollow ? (
        <FollowActionButton
          profile={profile}
          displayName={displayName}
          position={position}
        />
      ) : (
        <Link
          to={profileUrl}
          label={`View ${displayName}`}
          size="small"
          variant="solid"
          color="primary"
          style={[{paddingVertical: 6, paddingHorizontal: 14}]}>
          <ButtonText>View</ButtonText>
        </Link>
      )}
    </View>
  )
}

function FollowActionButton({
  profile,
  displayName,
  position,
}: {
  profile: ReturnType<typeof useProfileShadow<app.bsky.actor.defs.ProfileView>>
  displayName: string
  position: number
}) {
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    profile,
    'ProfileCard',
    position,
  )
  const isFollowing = Boolean(profile.viewer?.following)

  const onPress = async (e: GestureResponderEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      if (isFollowing) {
        await queueUnfollow()
        Toast.show(`No longer following ${displayName}`)
      } else {
        await queueFollow()
        Toast.show(`Following ${displayName}`)
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        Toast.show('An issue occurred, please try again.', {type: 'error'})
      }
    }
  }

  return (
    <Button
      label={isFollowing ? `Unfollow ${displayName}` : `Follow ${displayName}`}
      size="small"
      variant="solid"
      color={isFollowing ? 'secondary' : 'primary'}
      style={[{paddingVertical: 6, paddingHorizontal: 14}]}
      onPress={e => {
        void onPress(e)
      }}>
      <ButtonText>{isFollowing ? 'Following' : 'Follow'}</ButtonText>
    </Button>
  )
}
