import {createContext, useContext, useMemo} from 'react'

import {useLanguagePrefs} from '#/state/preferences/languages'
import {useServiceConfigQuery} from '#/state/queries/service-config'
import {device} from '#/storage'

function isLocalWebOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location?.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]'
  )
}

type TrendingContext = {
  enabled: boolean
}

const TrendingContext = createContext<TrendingContext>({
  enabled: false,
})
TrendingContext.displayName = 'TrendingContext'

const CheckEmailConfirmedContext = createContext<boolean | null>(null)

export function Provider({children}: {children: React.ReactNode}) {
  const langPrefs = useLanguagePrefs()
  const isLocalWeb = isLocalWebOrigin()
  const {data: config, isLoading: isInitialLoad} = useServiceConfigQuery()
  const trending = useMemo<TrendingContext>(() => {
    if (__DEV__ || isLocalWeb) {
      return {enabled: true}
    }

    /*
     * Only English during beta period
     */
    if (
      !!langPrefs.contentLanguages.length &&
      !langPrefs.contentLanguages.includes('en')
    ) {
      return {enabled: false}
    }

    /*
     * While loading, use cached value
     */
    const cachedEnabled = device.get(['trendingBetaEnabled'])
    if (isInitialLoad) {
      return {enabled: Boolean(cachedEnabled)}
    }

    const enabled = Boolean(config?.topicsEnabled)

    // update cache
    device.set(['trendingBetaEnabled'], enabled)

    return {enabled}
  }, [isInitialLoad, isLocalWeb, config, langPrefs.contentLanguages])

  // probably true, so default to true when loading
  // if the call fails, the query will set it to false for us
  const checkEmailConfirmed = config?.checkEmailConfirmed ?? true

  return (
    <TrendingContext.Provider value={trending}>
      <CheckEmailConfirmedContext.Provider value={checkEmailConfirmed}>
        {children}
      </CheckEmailConfirmedContext.Provider>
    </TrendingContext.Provider>
  )
}

export function useTrendingConfig() {
  return useContext(TrendingContext)
}

export function useCheckEmailConfirmed() {
  const ctx = useContext(CheckEmailConfirmedContext)
  if (ctx === null) {
    throw new Error(
      'useCheckEmailConfirmed must be used within a ServiceConfigManager',
    )
  }
  return ctx
}
