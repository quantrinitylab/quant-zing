import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import {BottomSheetNativeComponent} from '@bsky.app/bottom-sheet'

import {useHotkeysContext} from '#/lib/hotkeys'
import {type DialogControlRefProps} from '#/components/Dialog'
import {Provider as GlobalDialogsProvider} from '#/components/dialogs/Context'
import {IS_WEB} from '#/env'

interface IDialogContext {
  /**
   * The currently active `useDialogControl` hooks.
   */
  activeDialogs: React.MutableRefObject<
    Map<string, React.MutableRefObject<DialogControlRefProps>>
  >
  /**
   * The currently open dialogs, referenced by their IDs, generated from
   * `useId`.
   */
  openDialogs: React.MutableRefObject<Set<string>>
}

interface IDialogControlContext {
  closeAllDialogs(): boolean
  setDialogIsOpen(id: string, isOpen: boolean): void
  setFullyExpandedCount: React.Dispatch<React.SetStateAction<number>>
}

const DialogContext = createContext<IDialogContext>({} as IDialogContext)
DialogContext.displayName = 'DialogContext'

const DialogControlContext = createContext<IDialogControlContext>(
  {} as IDialogControlContext,
)
DialogControlContext.displayName = 'DialogControlContext'

/**
 * The number of dialogs that are fully expanded. This is used to determine the background color of the status bar
 * on iOS.
 */
const DialogFullyExpandedCountContext = createContext<number>(0)
DialogFullyExpandedCountContext.displayName = 'DialogFullyExpandedCountContext'

const HasOpenDialogContext = createContext<boolean>(false)
HasOpenDialogContext.displayName = 'HasOpenDialogContext'

export function useDialogStateContext() {
  return useContext(DialogContext)
}

export function useDialogStateControlContext() {
  return useContext(DialogControlContext)
}

/** The number of dialogs that are fully expanded */
export function useDialogFullyExpandedCountContext() {
  return useContext(DialogFullyExpandedCountContext)
}

export function useHasOpenDialog() {
  return useContext(HasOpenDialogContext)
}

export function Provider({children}: React.PropsWithChildren<{}>) {
  const [fullyExpandedCount, setFullyExpandedCount] = useState(0)
  const [hasOpenDialog, setHasOpenDialog] = useState(false)
  const {disableScope, enableScope} = useHotkeysContext()

  const activeDialogs = useRef<
    Map<string, React.MutableRefObject<DialogControlRefProps>>
  >(new Map())
  const openDialogs = useRef<Set<string>>(new Set())

  const closeAllDialogs = useCallback(() => {
    if (IS_WEB) {
      openDialogs.current.forEach(id => {
        const dialog = activeDialogs.current.get(id)
        if (dialog) dialog.current.close()
      })

      return openDialogs.current.size > 0
    } else {
      void BottomSheetNativeComponent.dismissAll()
      return false
    }
  }, [])

  const setDialogIsOpen = useCallback(
    (id: string, isOpen: boolean) => {
      if (isOpen) {
        openDialogs.current.add(id)
      } else {
        openDialogs.current.delete(id)
      }
      const anyOpen = openDialogs.current.size > 0
      setHasOpenDialog(anyOpen)
      if (anyOpen) {
        disableScope('global')
      } else {
        enableScope('global')
      }
    },
    [disableScope, enableScope],
  )

  const context = useMemo<IDialogContext>(
    () => ({
      activeDialogs,
      openDialogs,
    }),
    [activeDialogs, openDialogs],
  )
  const controls = useMemo(
    () => ({
      closeAllDialogs,
      setDialogIsOpen,
      setFullyExpandedCount,
    }),
    [closeAllDialogs, setDialogIsOpen, setFullyExpandedCount],
  )

  return (
    <DialogContext.Provider value={context}>
      <DialogControlContext.Provider value={controls}>
        <DialogFullyExpandedCountContext.Provider value={fullyExpandedCount}>
          <HasOpenDialogContext.Provider value={hasOpenDialog}>
            <GlobalDialogsProvider>{children}</GlobalDialogsProvider>
          </HasOpenDialogContext.Provider>
        </DialogFullyExpandedCountContext.Provider>
      </DialogControlContext.Provider>
    </DialogContext.Provider>
  )
}
Provider.displayName = 'DialogsProvider'
