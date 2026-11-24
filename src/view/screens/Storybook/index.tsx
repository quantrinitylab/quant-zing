import {lazy, Suspense} from 'react'

import * as Layout from '#/components/Layout'

const Storybook = __DEV__ ? lazy(() => import('./Storybook')) : null

export function StorybookScreen() {
  if (!__DEV__ || !Storybook) {
    return null
  }
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Storybook</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content keyboardShouldPersistTaps="handled">
        <Suspense fallback={null}>
          <Storybook />
        </Suspense>
      </Layout.Content>
    </Layout.Screen>
  )
}
