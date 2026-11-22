import {createTheme, DEFAULT_PALETTE, type Palette} from '@bsky.app/alf'

/**
 * QuantZing X-Dark Palette (X Lights Out)
 * Pure #000000 canvas, #16181C elevated cards, #202327 search/input pills,
 * #2F3336 crisp borders, #E7E9EA primary text, #71767B muted text,
 * #1D9BF0 electric blue accent, #F91880 heart, #00BA7C rezing green.
 */
const X_DARK_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  white: '#FFFFFF',
  black: '#000000',
  pink: '#F91880',
  like: '#F91880',
  yellow: '#FFD400',
  contrast_0: '#000000',
  contrast_25: '#16181C',
  contrast_50: '#202327',
  contrast_100: '#2F3336',
  contrast_200: '#333639',
  contrast_300: '#536471',
  contrast_400: '#71767B',
  contrast_500: '#71767B',
  contrast_600: '#8B98A5',
  contrast_700: '#71767B',
  contrast_800: '#B9CAD3',
  contrast_900: '#EFF3F4',
  contrast_950: '#D7DBDC',
  contrast_975: '#D7DBDC',
  contrast_1000: '#E7E9EA',
  primary_25: '#000000',
  primary_50: '#061B2B',
  primary_100: '#0A2940',
  primary_200: '#0E4D7A',
  primary_300: '#136AA8',
  primary_400: '#1A8CD8',
  primary_500: '#1D9BF0',
  primary_600: '#1D9BF0',
  primary_700: '#4DB5F7',
  primary_800: '#7CCAFA',
  primary_900: '#B3DFFD',
  primary_950: '#D9EFFE',
  primary_975: '#EFF8FF',
  positive_25: '#021D0F',
  positive_50: '#032A17',
  positive_100: '#033F21',
  positive_200: '#04522B',
  positive_300: '#036D38',
  positive_400: '#009E69',
  positive_500: '#00BA7C',
  positive_600: '#00D18B',
  positive_700: '#2CF28F',
  positive_800: '#6AF6B0',
  positive_900: '#A3FACF',
  positive_950: '#D3FDE8',
  positive_975: '#ECFEF5',
  negative_25: '#1F0508',
  negative_50: '#33080D',
  negative_100: '#4F0B14',
  negative_200: '#78101C',
  negative_300: '#A81725',
  negative_400: '#DC1E29',
  negative_500: '#F4212E',
  negative_600: '#FF424E',
  negative_700: '#FF6B75',
  negative_800: '#FF99A0',
  negative_900: '#FFC2C6',
  negative_950: '#FFE0E2',
  negative_975: '#FFF2F3',
}

/**
 * QuantZing X-Dim Palette (X Dim #15202B)
 */
const X_DIM_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  white: '#FFFFFF',
  black: '#000000',
  pink: '#F91880',
  like: '#F91880',
  yellow: '#FFD400',
  contrast_0: '#15202B',
  contrast_25: '#1E2732',
  contrast_50: '#273340',
  contrast_100: '#38444D',
  contrast_200: '#425364',
  contrast_300: '#536471',
  contrast_400: '#8B98A5',
  contrast_500: '#8B98A5',
  contrast_600: '#9BA8B5',
  contrast_700: '#8B98A5',
  contrast_800: '#C4CFD6',
  contrast_900: '#EFF3F4',
  contrast_950: '#D7DBDC',
  contrast_975: '#D7DBDC',
  contrast_1000: '#F7F9F9',
  primary_25: '#15202B',
  primary_50: '#0E2438',
  primary_100: '#12314D',
  primary_200: '#154F7D',
  primary_300: '#176DAA',
  primary_400: '#1A8CD8',
  primary_500: '#1D9BF0',
  primary_600: '#1D9BF0',
  primary_700: '#4DB5F7',
  primary_800: '#7CCAFA',
  primary_900: '#B3DFFD',
  primary_950: '#D9EFFE',
  primary_975: '#EFF8FF',
  positive_25: '#021D0F',
  positive_50: '#032A17',
  positive_100: '#033F21',
  positive_200: '#04522B',
  positive_300: '#036D38',
  positive_400: '#009E69',
  positive_500: '#00BA7C',
  positive_600: '#00D18B',
  positive_700: '#2CF28F',
  positive_800: '#6AF6B0',
  positive_900: '#A3FACF',
  positive_950: '#D3FDE8',
  positive_975: '#ECFEF5',
  negative_25: '#240A0E',
  negative_50: '#380E14',
  negative_100: '#54131D',
  negative_200: '#7D1926',
  negative_300: '#AC1E2E',
  negative_400: '#DC1E29',
  negative_500: '#F4212E',
  negative_600: '#FF424E',
  negative_700: '#FF6B75',
  negative_800: '#FF99A0',
  negative_900: '#FFC2C6',
  negative_950: '#FFE0E2',
  negative_975: '#FFF2F3',
}

/**
 * QuantZing X-Light Palette
 */
const X_LIGHT_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  white: '#FFFFFF',
  black: '#000000',
  pink: '#F91880',
  like: '#F91880',
  yellow: '#FFD400',
  contrast_0: '#FFFFFF',
  contrast_25: '#F7F9F9',
  contrast_50: '#EFF3F4',
  contrast_100: '#E1E8ED',
  contrast_200: '#CFD9DE',
  contrast_300: '#B9CAD3',
  contrast_400: '#5B7083',
  contrast_500: '#536471',
  contrast_600: '#536471',
  contrast_700: '#536471',
  contrast_800: '#272C30',
  contrast_900: '#0F1419',
  contrast_950: '#272C30',
  contrast_975: '#272C30',
  contrast_1000: '#0F1419',
  primary_25: '#FFFFFF',
  primary_50: '#E8F5FD',
  primary_100: '#D2ECFB',
  primary_200: '#9AD4F9',
  primary_300: '#65BDF6',
  primary_400: '#3AAAF3',
  primary_500: '#1D9BF0',
  primary_600: '#1A8CD8',
  primary_700: '#136AA8',
  primary_800: '#0E4D7A',
  primary_900: '#0A3555',
  primary_950: '#062238',
  primary_975: '#031320',
  positive_500: '#00BA7C',
  positive_600: '#009E69',
  negative_500: '#F4212E',
  negative_600: '#DC1E29',
}

const QUANTZING_LIGHT = createTheme({
  scheme: 'light',
  name: 'light',
  palette: X_LIGHT_PALETTE,
})

const QUANTZING_DARK = createTheme({
  scheme: 'dark',
  name: 'dark',
  palette: X_DARK_PALETTE,
  options: {
    shadowOpacity: 0.4,
  },
})

const QUANTZING_DIM = createTheme({
  scheme: 'dark',
  name: 'dim',
  palette: X_DIM_PALETTE,
  options: {
    shadowOpacity: 0.4,
  },
})

export const themes = {
  lightPalette: QUANTZING_LIGHT.palette,
  darkPalette: QUANTZING_DARK.palette,
  dimPalette: QUANTZING_DIM.palette,
  light: QUANTZING_LIGHT,
  dark: QUANTZING_DARK,
  dim: QUANTZING_DIM,
}

/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const lightPalette = QUANTZING_LIGHT.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const darkPalette = QUANTZING_DARK.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const dimPalette = QUANTZING_DIM.palette
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const light = QUANTZING_LIGHT
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dark = QUANTZING_DARK
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dim = QUANTZING_DIM
