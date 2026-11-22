import {ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native'

import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, BreakpointWidthContext, useTheme, web} from '#/alf'
import {CENTER_COLUMN_WIDTH} from '#/components/Layout'
import {IS_NATIVE, IS_WEB} from '#/env'
import {Text} from '../text/Text'

export const LoggedOutLayout = ({
  leadin,
  title,
  description,
  children,
  scrollable,
}: React.PropsWithChildren<{
  leadin: string
  title: string
  description: string
  scrollable?: boolean
}>) => {
  const {isMobile, isTabletOrMobile} = useWebMediaQueries()
  const {width} = useWindowDimensions()
  const t = useTheme()

  const sideBg = {
    backgroundColor:
      t.name === 'light' ? t.palette.contrast_25 : t.palette.contrast_0,
  }
  const contentBg = [
    t.atoms.bg,
    t.atoms.border_contrast_low,
    {borderLeftWidth: 1},
  ]

  if (IS_NATIVE || isMobile) {
    const content = (
      <BreakpointWidthContext
        value={IS_NATIVE ? Math.min(width, CENTER_COLUMN_WIDTH) : undefined}>
        <View
          style={[
            scrollable && a.flex_grow,
            a.pt_lg,
            t.atoms.bg,
            web({minHeight: '100dvh'}),
            IS_NATIVE && [
              a.w_full,
              a.self_center,
              {maxWidth: CENTER_COLUMN_WIDTH},
            ],
          ]}>
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_sm,
              a.px_xl,
              a.pb_sm,
            ]}>
            <Logo width={34} />
            <Logotype width={124} fill={t.atoms.text.color} />
          </View>
          {children}
        </View>
      </BreakpointWidthContext>
    )

    if (scrollable) {
      return (
        <ScrollView
          style={[a.flex_1, t.atoms.bg]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          contentContainerStyle={[a.flex_grow]}>
          {content}
        </ScrollView>
      )
    } else {
      return content
    }
  }

  return (
    <View style={[styles.container, web({minHeight: '100dvh'}), t.atoms.bg]}>
      <View style={[styles.side, sideBg]}>
        <View style={styles.brandRow}>
          <Logo width={44} />
          <Logotype width={150} fill={t.atoms.text.color} />
        </View>
        {leadin ? (
          <Text
            style={[
              t.atoms.text_contrast_medium,
              styles.leadinText,
              isTabletOrMobile && styles.leadinTextSmall,
            ]}>
            {leadin}
          </Text>
        ) : null}
        <Text
          style={[
            t.atoms.text,
            styles.titleText,
            isTabletOrMobile && styles.titleTextSmall,
          ]}>
          {title}
        </Text>
        <Text
          type="2xl-medium"
          style={[t.atoms.text_contrast_medium, styles.descriptionText]}>
          {description}
        </Text>
      </View>
      {scrollable ? (
        <View style={[styles.scrollableContent, ...contentBg]}>
          <ScrollView
            style={a.flex_1}
            contentContainerStyle={styles.scrollViewContentContainer}
            keyboardShouldPersistTaps="handled"
            /*
             * RNW implements `on-drag` by blurring the focused element on ANY
             * scroll event - including the one Firefox fires when swapping
             * splash -> login content resizes the scroller - which kills the
             * login form's autofocus. It doesn't appear to do anything anyways
             * on web (judging by iOS safari, which keeps the keyboard open
             * regardless of scrolling) -sfn
             */
            keyboardDismissMode={IS_WEB ? 'none' : 'on-drag'}>
            <View style={[styles.contentWrapper, IS_WEB && a.my_auto]}>
              {children}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.content, ...contentBg]}>
          <View style={styles.contentWrapper}>{children}</View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: '100vh' as any,
  },
  side: {
    flex: 1,
    paddingHorizontal: 40,
    paddingBottom: 80,
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 24,
  },
  content: {
    flex: 2,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  scrollableContent: {
    flex: 2,
  },
  scrollViewContentContainer: {
    flexGrow: 1,
    paddingHorizontal: 40,
    paddingVertical: 24,
  },
  leadinText: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'right',
  },
  leadinTextSmall: {
    fontSize: 24,
  },
  titleText: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'right',
  },
  titleTextSmall: {
    fontSize: 36,
  },
  descriptionText: {
    maxWidth: 400,
    marginTop: 12,
    marginLeft: 'auto',
    textAlign: 'right',
  },
  contentWrapper: {
    maxWidth: 600,
  },
})
