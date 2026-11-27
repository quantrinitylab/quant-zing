import {type JSX} from 'react'
import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {HITSLOP_10} from '#/lib/constants'
import {emitSoftReset} from '#/state/events'
import {useSession} from '#/state/session'
import {useShellHeaderLayout} from '#/state/shell/shell-layout'
import {DiscoverTopicsModal} from '#/view/com/home/DiscoverTopicsModal'
import {HomeHeaderLayoutMobile} from '#/view/com/home/HomeHeaderLayoutMobile'
import {Logo} from '#/view/icons/Logo'
import {useLogoVariant} from '#/view/icons/useLogoVariant'
import {
  atoms as a,
  select,
  useBreakpoints,
  useGutters,
  useTheme,
  web,
} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {PersonPlus_Stroke2_Corner0_Rounded as PersonPlusIcon} from '#/components/icons/Person'
import * as Layout from '#/components/Layout'
import {useAnalytics} from '#/analytics'

export function HomeHeaderLayout(props: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
}) {
  const {gtMobile} = useBreakpoints()
  if (!gtMobile) {
    return <HomeHeaderLayoutMobile {...props} />
  } else {
    return <HomeHeaderLayoutDesktopAndTablet {...props} />
  }
}

function HomeHeaderLayoutDesktopAndTablet({
  children,
  tabBarAnchor,
}: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
}) {
  const t = useTheme()
  const {onLayout} = useShellHeaderLayout()
  const {hasSession} = useSession()
  const {_} = useLingui()
  const ax = useAnalytics()
  const logoVariant = useLogoVariant()
  const gutters = useGutters([0, 'base'])
  const discoverTopicsControl = Dialog.useDialogControl()

  const stickyBg = select(t.name, {
    dark: 'rgba(0, 0, 0, 0.65)',
    dim: 'rgba(21, 32, 43, 0.75)',
    light: 'rgba(255, 255, 255, 0.85)',
  })

  return (
    <>
      {hasSession && (
        <Layout.Center>
          <View
            style={[a.flex_row, a.align_center, gutters, a.pt_md, t.atoms.bg]}>
            <View style={{width: 34}} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="QuantZing"
              accessibilityHint=""
              onPress={() => emitSoftReset()}
              style={[a.flex_1, a.align_center, a.justify_center]}>
              <Logo width={logoVariant === 'kawaii' ? 60 : 28} />
            </Pressable>
            <Button
              testID="viewHeaderDiscoverTopicsBtnWeb"
              hitSlop={HITSLOP_10}
              label={_(msg`Follow hub`)}
              accessibilityLabel="Follow hub"
              accessibilityHint=""
              size="small"
              variant="ghost"
              color="secondary"
              shape="square"
              onPress={() => {
                ax.metric('nav:click', {item: 'feeds', surface: 'topBar'})
                discoverTopicsControl.open()
              }}
              style={[a.justify_center]}>
              <ButtonIcon icon={PersonPlusIcon} size="lg" />
            </Button>
          </View>
        </Layout.Center>
      )}
      {tabBarAnchor}
      <Layout.Center
        style={[
          a.sticky,
          a.z_10,
          a.align_center,
          {top: 0, backgroundColor: stickyBg},
          web({backdropFilter: 'blur(12px)'}),
        ]}
        onLayout={onLayout}>
        {children}
      </Layout.Center>
      <DiscoverTopicsModal control={discoverTopicsControl} />
    </>
  )
}
