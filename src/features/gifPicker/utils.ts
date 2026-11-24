/**
 * Direct provider CDN URL (Tenor or Klipy) without bsky proxy redirection.
 */
export function gifPreviewUrl(gifUrl: string) {
  try {
    const url = new URL(gifUrl)
    return url.href
  } catch (e) {
    return ''
  }
}

/**
 * Direct static CDN URL without bsky proxy redirection.
 */
export function klipyUrlToBskyGifUrl(klipyUrl: string) {
  try {
    const url = new URL(klipyUrl)
    return url.href
  } catch (e) {
    return ''
  }
}
