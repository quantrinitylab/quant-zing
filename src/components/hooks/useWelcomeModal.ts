import {useEffect, useState} from 'react'

import {useSession} from '#/state/session'
import {IS_WEB} from '#/env'
import {type WelcomeModalControl} from './useWelcomeModal.shared'

export function useWelcomeModal(): WelcomeModalControl {
  const {hasSession} = useSession()
  const [isOpen, setIsOpen] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  useEffect(() => {
    // On QuantZing web, keep the live discovery feed immediately visible
    // without blocking behind a popup unless `?welcome=1` is requested.
    if (IS_WEB && !hasSession && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('welcome') === '1') {
        open()
      }
    }
  }, [hasSession])

  return {isOpen, open, close}
}
