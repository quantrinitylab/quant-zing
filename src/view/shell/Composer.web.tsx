import {StyleSheet, View} from 'react-native'
import * as DismissableLayer from '@radix-ui/react-dismissable-layer'
import * as FocusGuards from '@radix-ui/react-focus-guards'
import * as FocusScope from '@radix-ui/react-focus-scope'
import {RemoveScrollBar} from 'react-remove-scroll-bar'

import {useA11y} from '#/state/a11y'
import {type ComposerOpts, useComposerState} from '#/state/shell/composer'
import {ComposePost, useComposerCancelRef} from '#/view/com/composer/Composer'
import {atoms as a, flatten, useBreakpoints, useTheme} from '#/alf'

const BOTTOM_BAR_HEIGHT = 61

export function Composer() {
  const state = useComposerState()
  const isActive = !!state

  if (!isActive) {
    return null
  }

  return (
    <>
      <RemoveScrollBar />
      <Inner state={state} />
    </>
  )
}

function Inner({state}: {state: ComposerOpts}) {
  const ref = useComposerCancelRef()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {reduceMotionEnabled} = useA11y()

  FocusGuards.useFocusGuards()

  return (
    <FocusScope.FocusScope loop trapped asChild>
      <DismissableLayer.DismissableLayer
        role="dialog"
        aria-modal
        style={flatten([
          {position: 'fixed', zIndex: 100},
          a.inset_0,
          {backgroundColor: '#000c'},
          a.flex,
          a.flex_col,
          a.align_center,
          !reduceMotionEnabled && a.fade_in,
        ])}
        onFocusOutside={evt => evt.preventDefault()}
        onInteractOutside={evt => evt.preventDefault()}
        onDismiss={() => ref.current?.onPressCancel()}>
        <View
          style={[
            styles.container,
            !gtMobile && styles.containerMobile,
            t.atoms.bg,
            t.atoms.border_contrast_medium,
            !reduceMotionEnabled && [
              a.zoom_fade_in,
              {animationDelay: 0.1},
              {animationFillMode: 'backwards'},
            ],
          ]}>
          <ComposePost
            cancelRef={ref}
            replyTo={state.replyTo}
            quote={state.quote}
            onPost={state.onPost}
            onPostSuccess={state.onPostSuccess}
            mention={state.mention}
            text={state.text}
            imageUris={state.imageUris}
            openGallery={state.openGallery}
          />
        </View>
      </DismissableLayer.DismissableLayer>
    </FocusScope.FocusScope>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    maxWidth: 600,
    width: '100%',
    paddingVertical: 0,
    borderRadius: 16,
    marginBottom: 0,
    borderWidth: 1,
    maxHeight: 'calc(100dvh - 80px)' as any,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
  },
  containerMobile: {
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    height: '100dvh' as any,
    maxHeight: '100dvh' as any,
  },
})
