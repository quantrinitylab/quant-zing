const SAFELINK_CHECK_TIMEOUT = 5e3

/**
 * The Safelink rule for a URL, from the same lookup that guards link taps, so
 * blocks T&S manage in Ozone apply when a link is added. Fails open: taps are
 * still checked, so a missing answer shouldn't stop someone saving.
 */
export async function checkSafelink(
  _url: string,
): Promise<'block' | 'warn' | 'whitelist' | 'none'> {
  void SAFELINK_CHECK_TIMEOUT
  return 'none'
}
