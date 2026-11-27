import {useCallback} from 'react'
import {type GestureResponderEvent, Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {HITSLOP_30} from '#/lib/constants'
import {getHomeNavigationAction} from '#/lib/routes/navigation'
import {type NavigationProp} from '#/lib/routes/types'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useFeedSourceInfoQuery} from '#/state/queries/feed'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {type VideoFeedSourceContext} from '#/screens/VideoFeed/types'
import {atoms as a, useBreakpoints} from '#/alf'
import {type ButtonProps} from '#/components/Button'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeft} from '#/components/icons/Arrow'
import {Text} from '#/components/Typography'

export function HeaderPlaceholder() {
  return (
    <View style={[a.flex_1, a.flex_row, a.align_center, a.gap_sm]}>
      <View
        style={[
          a.rounded_sm,
          {
            width: 36,
            height: 36,
            backgroundColor: 'white',
            opacity: 0.8,
          },
        ]}
      />

      <View style={[a.flex_1, a.gap_xs]}>
        <View
          style={[
            a.w_full,
            a.rounded_xs,
            {
              backgroundColor: 'white',
              height: 14,
              width: 80,
              opacity: 0.8,
            },
          ]}
        />
        <View
          style={[
            a.w_full,
            a.rounded_xs,
            {
              backgroundColor: 'white',
              height: 10,
              width: 140,
              opacity: 0.6,
            },
          ]}
        />
      </View>
    </View>
  )
}

export function Header({
  sourceContext: _sourceContext,
}: {
  sourceContext: VideoFeedSourceContext
}) {
  return (
    <View style={[a.w_full, a.flex_row, a.align_center, a.px_md, a.py_xs]}>
      <BackButton />
    </View>
  )
}

export function FeedHeader({
  sourceContext,
}: {
  sourceContext: Exclude<VideoFeedSourceContext, {type: 'author'}>
}) {
  const {gtMobile} = useBreakpoints()

  const {
    data: info,
    isLoading,
    error,
  } = useFeedSourceInfoQuery({uri: sourceContext.uri})

  if (sourceContext.sourceInterstitial !== undefined) {
    // For now, don't show the header if coming from an interstitial.
    return null
  }

  if (isLoading) {
    return <HeaderPlaceholder />
  } else if (error || !info) {
    return null
  }

  return (
    <View style={[a.flex_1, a.flex_row, a.align_center, a.gap_sm]}>
      {info.avatar && <UserAvatar size={36} type="algo" avatar={info.avatar} />}

      <View style={[a.flex_1]}>
        <Text
          style={[
            a.text_md,
            a.font_bold,
            a.leading_tight,
            gtMobile && a.text_lg,
          ]}
          numberOfLines={2}>
          {info.displayName}
        </Text>
        <View style={[a.flex_row, {gap: 6}]}>
          <Text
            style={[a.flex_shrink, a.text_sm, a.leading_snug]}
            numberOfLines={1}>
            {sanitizeHandle(info.creatorHandle, '@')}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function BackButton({onPress, style}: Partial<ButtonProps>) {
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()

  const onPressBack = useCallback(
    (evt: GestureResponderEvent) => {
      onPress?.(evt)
      if (evt.defaultPrevented) return
      if (navigation.canGoBack()) {
        navigation.goBack()
      } else {
        navigation.dispatch(
          getHomeNavigationAction(navigation.getState(), 'navigate'),
        )
      }
    },
    [onPress, navigation],
  )

  return (
    <Pressable
      testID="nativeReelsBackBtn"
      accessibilityLabel={_(msg`Go back`)}
      accessibilityHint=""
      accessibilityRole="button"
      hitSlop={HITSLOP_30}
      onPress={onPressBack}
      style={({pressed}) => [
        a.align_center,
        a.justify_center,
        a.rounded_full,
        {
          width: 38,
          height: 38,
          backgroundColor: 'rgba(15, 20, 25, 0.72)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.22)',
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}>
      <ArrowLeft size="md" fill="white" />
    </Pressable>
  )
}
