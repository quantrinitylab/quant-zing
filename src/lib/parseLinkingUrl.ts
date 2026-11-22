export function parseLinkingUrl(url: string): URL {
  /*
   * Add a third slash to quantzing:// (or any custom app scheme) urls so that
   * `URL.host` is empty and `URL.pathname` has the full path.
   */
  if (url.startsWith('quantzing://') && !url.startsWith('quantzing:///')) {
    url = url.replace('quantzing://', 'quantzing:///')
  } else if (
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    /^[a-z][a-z0-9+.-]*:\/\/(?!\/)/i.test(url)
  ) {
    url = url.replace('://', ':///')
  }
  return new URL(url)
}
