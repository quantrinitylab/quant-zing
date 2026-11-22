import {useMemo, useRef} from 'react'
import {WebView, type WebViewNavigation} from 'react-native-webview'
import {type ShouldStartLoadRequest} from 'react-native-webview/lib/WebViewTypes'

import {QUANTZING_SERVICE} from '#/lib/constants'
import {type CaptchaWebViewProps} from './CaptchaWebView.shared'

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unparseable'
  }
}

const DEFAULT_QUANTZING_HOST = (() => {
  const host = safeHost(QUANTZING_SERVICE)
  return host !== 'unparseable' ? host : 'quantzing.quantrinity.in'
})()

const ALLOWED_HOSTS = [
  DEFAULT_QUANTZING_HOST,
  'quantzing.quantrinity.in',
  'quantzing.com',
  'quantzing.in',
  'js.hcaptcha.com',
  'newassets.hcaptcha.com',
  'api2.hcaptcha.com',
]

export function CaptchaWebView({
  url,
  stateParam,
  state,
  onSuccess,
  onError,
  onBlockedLoad,
}: CaptchaWebViewProps) {
  const redirectHost = useMemo(() => {
    if (!state?.serviceUrl) return DEFAULT_QUANTZING_HOST

    const serviceHost = safeHost(state.serviceUrl)
    return serviceHost !== 'unparseable' ? serviceHost : DEFAULT_QUANTZING_HOST
  }, [state?.serviceUrl])

  const wasSuccessful = useRef(false)

  const onShouldStartLoadWithRequest = (event: ShouldStartLoadRequest) => {
    const host = safeHost(event.url)
    const allowed = ALLOWED_HOSTS.includes(host) || host === redirectHost

    /*
     * iOS routes subframe navigations through this handler and cancels them if
     * we return false; Android's shouldOverrideUrlLoading only ever sees the
     * main frame. Report what we refuse so we can tell whether the allowlist is
     * silently breaking hCaptcha's challenge on iOS.
     * TODO Behavior is intentionally unchanged here - the fix is gated on this
     * data. -dsb
     */
    if (!allowed) {
      onBlockedLoad?.(host, event.isTopFrame)
    }

    return allowed
  }

  const onNavigationStateChange = (e: WebViewNavigation) => {
    if (wasSuccessful.current) return

    const urlp = new URL(e.url)
    if (urlp.host !== redirectHost || urlp.pathname === '/gate/signup') return

    const code = urlp.searchParams.get('code')
    if (urlp.searchParams.get('state') !== stateParam || !code) {
      onError({reason: 'state-mismatch', host: urlp.host})
      return
    }

    /*
     * Report success synchronously. The parent swaps this view for a spinner
     * as soon as it hears about it, so anything deferred from in here (e.g. a
     * timer) would be torn down with the view before it could fire.
     */
    wasSuccessful.current = true
    onSuccess(code)
  }

  return (
    <WebView
      source={{uri: url}}
      javaScriptEnabled
      style={{
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 10,
      }}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onNavigationStateChange={onNavigationStateChange}
      scrollEnabled={false}
      onError={e => {
        onError({
          reason: 'webview-error',
          host: safeHost(e.nativeEvent.url),
          cause: e.nativeEvent,
        })
      }}
      onHttpError={e => {
        onError({
          reason: 'http-error',
          host: safeHost(e.nativeEvent.url),
          statusCode: e.nativeEvent.statusCode,
          cause: e.nativeEvent,
        })
      }}
    />
  )
}
