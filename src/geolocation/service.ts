import {useEffect, useState} from 'react'
import {EventEmitter} from 'eventemitter3'

import {networkRetry} from '#/lib/async/retry'
import {
  FALLBACK_GEOLOCATION_SERVICE_RESPONSE,
  GEOLOCATION_SERVICE_URL,
} from '#/geolocation/const'
import * as debug from '#/geolocation/debug'
import {logger} from '#/geolocation/logger'
import {type Geolocation} from '#/geolocation/types'
import {device} from '#/storage'

const LOCAL_DEFAULT_GEOLOCATION: Geolocation = {
  countryCode: 'IN',
  regionCode: undefined,
  city: undefined,
}

const GEOLOCATION_FETCH_TIMEOUT_MS = 600
const GEOLOCATION_RESOLVE_MAX_WAIT_MS = 650

let sessionFallbackGeolocation: Geolocation | undefined

function isLocalWebOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location?.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]'
  )
}

const events = new EventEmitter()
const EVENT = 'geolocation-service-response-updated'
const emitGeolocationServiceResponseUpdate = (data: Geolocation) => {
  events.emit(EVENT, data)
}
const onGeolocationServiceResponseUpdate = (
  listener: (data: Geolocation) => void,
) => {
  events.on(EVENT, listener)
  return () => {
    events.off(EVENT, listener)
  }
}

async function fetchGeolocationServiceData(
  url: string,
): Promise<Geolocation | undefined> {
  if (debug.enabled) return debug.resolve(debug.geolocation)
  if (isLocalWebOrigin()) return LOCAL_DEFAULT_GEOLOCATION
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timer = setTimeout(() => {
    controller?.abort()
  }, GEOLOCATION_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      url,
      controller ? {signal: controller.signal} : undefined,
    )
    if (!res.ok) {
      throw new Error(`fetchGeolocationServiceData failed ${res.status}`)
    }
    return (await res.json()) as Geolocation
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Local promise used within this file only.
 */
let geolocationServicePromise: Promise<{success: boolean}> | undefined

function applyLocalDefaultFallback() {
  if (!device.get(['geolocationServiceResponse'])) {
    sessionFallbackGeolocation = LOCAL_DEFAULT_GEOLOCATION
    emitGeolocationServiceResponseUpdate(LOCAL_DEFAULT_GEOLOCATION)
  }
}

/**
 * Begin the process of resolving geolocation config. This is called right away
 * at app start, and never stalls startup beyond GEOLOCATION_RESOLVE_MAX_WAIT_MS.
 */
export async function resolve() {
  if (geolocationServicePromise) {
    const cached = device.get(['geolocationServiceResponse'])
    if (cached) {
      logger.debug(`resolve(): using cache`)
    } else {
      logger.debug(`resolve(): no cache`)
      let timer: ReturnType<typeof setTimeout> | undefined
      const result = await Promise.race([
        geolocationServicePromise,
        new Promise<{success: boolean; timedOut: true}>(done => {
          timer = setTimeout(
            () => done({success: false, timedOut: true}),
            GEOLOCATION_RESOLVE_MAX_WAIT_MS,
          )
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer)
      })
      if (result.success) {
        logger.debug(`resolve(): resolved`)
      } else {
        applyLocalDefaultFallback()
        logger.info(
          'timedOut' in result
            ? `resolve(): timed out, defaulting to local geolocation`
            : `resolve(): failed, defaulting to local geolocation`,
        )
      }
    }
  } else {
    logger.debug(`resolve(): initiating`)

    /**
     * THIS PROMISE SHOULD NEVER `reject()`! We want the app to proceed with
     * startup, even if geolocation resolution fails.
     */
    geolocationServicePromise = new Promise(async resolve => {
      let success = false

      function cacheResponseOrThrow(response: Geolocation | undefined) {
        if (response) {
          sessionFallbackGeolocation = response
          device.set(['geolocationServiceResponse'], response)
          emitGeolocationServiceResponseUpdate(response)
        } else {
          // endpoint should throw on all failures, this is insurance
          throw new Error(`fetchGeolocationServiceData returned no data`)
        }
      }

      try {
        // Try once, fail fast
        const config = await fetchGeolocationServiceData(
          GEOLOCATION_SERVICE_URL,
        )
        cacheResponseOrThrow(config)
        success = true
      } catch (e: any) {
        logger.debug(
          `resolve(): fetchGeolocationServiceData failed initial request`,
          {
            safeMessage: e.message,
          },
        )
        applyLocalDefaultFallback()

        // retry 3 times, but don't await, proceed with default
        networkRetry(3, () =>
          fetchGeolocationServiceData(GEOLOCATION_SERVICE_URL),
        )
          .then(config => {
            cacheResponseOrThrow(config)
          })
          .catch((e: any) => {
            // complete fail closed
            logger.debug(
              `resolve(): fetchGeolocationServiceData failed retries`,
              {
                safeMessage: e.message,
              },
            )
          })
      } finally {
        resolve({success})
      }
    })
  }
}

export function useGeolocationServiceResponse() {
  const [config, setConfig] = useState(() => {
    const initial =
      device.get(['geolocationServiceResponse']) ||
      sessionFallbackGeolocation ||
      (isLocalWebOrigin()
        ? LOCAL_DEFAULT_GEOLOCATION
        : FALLBACK_GEOLOCATION_SERVICE_RESPONSE)
    return initial
  })

  useEffect(() => {
    return onGeolocationServiceResponseUpdate(config => {
      setConfig(config)
    })
  }, [])

  return config
}
