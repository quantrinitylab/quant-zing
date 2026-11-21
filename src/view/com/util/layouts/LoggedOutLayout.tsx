import {useMemo} from 'react'
import {ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native'

import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {getQuantZingColors} from '#/lib/quantos/client'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, BreakpointWidthContext, useTheme} from '#/alf'
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
  const isDark = t.scheme === 'dark'
  const colors = useMemo(() => getQuantZingColors(isDark), [isDark])

  const sideBg = {
    backgroundColor: isDark ? '#000000' : '#F7F9F9',
  }
  const contentBg = {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderLeftWidth: 1,
  }

  if (IS_NATIVE || isMobile) {
    const content = (
      <BreakpointWidthContext
        value={IS_NATIVE ? Math.min(width, CENTER_COLUMN_WIDTH) : undefined}>
        <View
          style={[
            scrollable && a.flex_1,
            a.pt_lg,
            {backgroundColor: colors.bg},
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
            <Logotype width={124} fill={colors.text} />
          </View>
          {children}
        </View>
      </BreakpointWidthContext>
    )

    if (scrollable) {
      return (
        <ScrollView
          style={[a.flex_1, {backgroundColor: colors.bg}]}
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
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <View style={[styles.side, sideBg]}>
        <View style={styles.brandRow}>
          <Logo width={44} />
          <Logotype width={150} fill={colors.text} />
        </View>
        {leadin ? (
          <Text
            style={[
              {color: colors.muted},
              styles.leadinText,
              isTabletOrMobile && styles.leadinTextSmall,
            ]}>
            {leadin}
          </Text>
        ) : null}
        <Text
          style={[
            {color: colors.text},
            styles.titleText,
            isTabletOrMobile && styles.titleTextSmall,
          ]}>
          {title}
        </Text>
        <Text
          type="2xl-medium"
          style={[{color: colors.muted}, styles.descriptionText]}>
          {description}
        </Text>
      </View>
      {scrollable ? (
        <View style={[styles.scrollableContent, contentBg]}>
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
        <View style={[styles.content, contentBg]}>
          <View style={styles.contentWrapper}>{children}</View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: '100vh',
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
    flex: 1,
    paddingHorizontal: 40,
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
