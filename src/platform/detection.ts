import {IS_ANDROID, IS_IOS, IS_NATIVE, IS_WEB} from '#/env'

export const isWeb = IS_WEB
export const isNative = IS_NATIVE
export const isIOS = IS_IOS
export const isAndroid = IS_ANDROID

export function isBrowserNonStandaloneWeb(): boolean {
  if (!isWeb || typeof window === 'undefined') return false
  try {
    const standaloneMedia =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = Boolean((window.navigator as any)?.standalone)
    return !standaloneMedia && !iosStandalone
  } catch {
    return true
  }
}
