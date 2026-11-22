import {isValidElement} from 'react'
import {nanoid} from 'nanoid/non-secure'
import {toast as sonner, Toaster} from 'sonner'

import {useHasOpenDialog} from '#/state/dialogs'
import {useIsDrawerOpen} from '#/state/shell'
import {atoms as a} from '#/alf'
import {useLightbox} from '#/components/Lightbox/state'
import {DURATION} from '#/components/Toast/const'
import {
  Icon as ToastIcon,
  Outer as ToastOuter,
  Text as ToastText,
  ToastConfigProvider,
} from '#/components/Toast/Toast'
import {type BaseToastOptions} from '#/components/Toast/types'

export {DURATION} from '#/components/Toast/const'
export * from '#/components/Toast/Toast'
export {type ToastType} from '#/components/Toast/types'

/**
 * Toasts are rendered in a global outlet, which is placed at the top of the
 * component tree.
 */
export function ToastOutlet() {
  const hasOpenDialog = useHasOpenDialog()
  const lightboxOpen = Boolean(useLightbox().activeLightbox)
  const drawerOpen = useIsDrawerOpen()
  const isBottomBarHidden = hasOpenDialog || lightboxOpen || drawerOpen

  return (
    <Toaster
      position="bottom-left"
      gap={a.gap_sm.gap}
      offset={a.p_xl.padding}
      mobileOffset={{
        bottom: isBottomBarHidden ? a.p_xl.padding : 76,
        left: a.p_md.padding,
        right: a.p_md.padding,
      }}
    />
  )
}

/**
 * Access the full Sonner API
 */
export const api = sonner

/**
 * Our base toast API, using the `Toast` export of this file.
 */
export function show(
  content: React.ReactNode,
  {type = 'default', ...options}: BaseToastOptions = {},
) {
  const id = nanoid()

  if (typeof content === 'string') {
    sonner(
      <ToastConfigProvider id={id} type={type}>
        <ToastOuter>
          <ToastIcon />
          <ToastText>{content}</ToastText>
        </ToastOuter>
      </ToastConfigProvider>,
      {
        ...options,
        unstyled: true, // required on web
        id,
        duration: options?.duration ?? DURATION,
      },
    )
  } else if (isValidElement(content)) {
    sonner(
      <ToastConfigProvider id={id} type={type}>
        {content}
      </ToastConfigProvider>,
      {
        ...options,
        unstyled: true, // required on web
        id,
        duration: options?.duration ?? DURATION,
      },
    )
  } else {
    throw new Error(
      `Toast can be a string or a React element, got ${typeof content}`,
    )
  }
}
