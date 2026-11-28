import {useEffect, useEffectEvent} from 'react'
import {Pressable, View} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {atoms as a} from '#/alf'
import {PersonGroup_Stroke2_Corner2_Rounded as PersonGroupIcon} from '#/components/icons/Person'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function FollowersPromoBanner({
  onPress,
  onDismiss,
}: {
  onPress: () => void
  onDismiss: () => void
}) {
  const {t: l} = useLingui()
  const ax = useAnalytics()

  const onSeen = useEffectEvent(() => {
    ax.metric('invite:followersPromo:seen', {})
  })

  useEffect(() => {
    // Fire once per mount - parent unmounts the banner when followers > 0 or
    // when dismissed, so each mount is a distinct impression.
    onSeen()
  }, [])

  const handlePress = () => {
    ax.metric('invite:followersPromo:press', {})
    onPress()
  }

  const handleDismiss = () => {
    ax.metric('invite:followersPromo:dismiss', {})
    onDismiss()
  }
  return (
    <View style={[a.px_lg, a.pt_md]}>
      {/*
       * The dismiss button is a sibling of (not nested inside) the banner
       * Pressable - nesting Pressables causes touch-handling conflicts on
       * Android. This relative wrapper matches the banner bounds so the dismiss
       * button can be positioned absolutely against the card's top-right corner.
       */}
      <View style={[a.relative]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={l`Find and invite friends`}
          accessibilityHint=""
          onPress={handlePress}
          style={({pressed}) => [
            a.flex_row,
            a.align_center,
            a.w_full,
            {
              height: 80,
              borderRadius: 16,
              backgroundColor: '#16181C',
              borderColor: '#2F3336',
              borderWidth: 1,
              paddingHorizontal: 16,
              paddingVertical: 16,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <View
            style={[
              a.align_center,
              a.justify_center,
              a.rounded_md,
              {
                width: 48,
                height: 48,
                backgroundColor: '#202327',
                borderColor: '#2F3336',
                borderWidth: 1,
                marginRight: 16,
              },
            ]}>
            <PersonGroupIcon size="lg" fill="#1D9BF0" />
          </View>
          <Text
            style={[
              a.flex_1,
              a.text_md,
              a.font_bold,
              {color: '#FFFFFF', lineHeight: 19.5},
            ]}>
            {l`Import contacts or invite your friends`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={l`Dismiss`}
          accessibilityHint=""
          onPress={handleDismiss}
          hitSlop={12}
          style={({pressed}) => [
            {
              position: 'absolute',
              top: 8,
              right: 8,
              padding: 4,
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <TimesIcon width={12} height={12} fill="#71767B" />
        </Pressable>
      </View>
    </View>
  )
}
