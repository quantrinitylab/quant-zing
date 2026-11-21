import {atoms as a} from '#/alf'

const COMPACT_BUTTON_SIZE = 48

export function getComposeButtonLayout({
  minimal,
  isNative,
}: {
  minimal: boolean
  isNative: boolean
}) {
  return {
    container: minimal
      ? [!isNative && a.px_sm, a.pt_lg]
      : [a.w_full, a.pt_md, a.pr_sm],
    button: [
      a.rounded_full,
      !minimal && [a.w_full, {height: 52}],
      minimal && {width: COMPACT_BUTTON_SIZE, height: COMPACT_BUTTON_SIZE},
      minimal && isNative && {paddingHorizontal: 0, paddingVertical: 0},
    ],
  }
}
