import {type CountryCode} from '#/lib/international-telephone-codes'

const FIND_CONTACTS_FEATURE_COUNTRY_ALLOWLIST = [
  'US',
  'GB',
  'JP',
  'CA',
  'DE',
  'FR',
  'ES',
  'BR',
  'KR',
  'NL',
  'AU',
  'SE',
  'IT',
  'IN',
] satisfies CountryCode[] as string[]

export function isFindContactsFeatureEnabled(_countryCode?: string): boolean {
  return true
}

export function useIsFindContactsFeatureEnabledBasedOnGeolocation() {
  return true
}
