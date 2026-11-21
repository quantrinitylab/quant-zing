#!/usr/bin/env node
// =============================================================================
// Sovereign QuantOS Cloud & Local Adapter for QuantZing (:3008)
// Connects QuantZing to local or cloud QuantOS services:
//   - QUANT_AI_URL         (default: http://127.0.0.1:4240)
//   - QUANT_ROUTER_URL     (default: http://127.0.0.1:4003)
//   - QUANT_PAY_URL        (default: http://127.0.0.1:4002)
//   - QUANTZING_PDS_DATA_DIR (default: ./.quantzing-data)
// Checks upstream service health, bridges URLs into host/port env vars,
// and boots ./scripts/serve-quantzing.mjs.
// =============================================================================

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function parseServiceEndpoint(rawUrl, fallbackHost, fallbackPort) {
  if (!rawUrl) {
    return {
      url: `http://${fallbackHost}:${fallbackPort}`,
      host: fallbackHost,
      port: String(fallbackPort),
    }
  }
  try {
    const parsed = new URL(rawUrl)
    const port =
      parsed.port ||
      (parsed.protocol === 'https:' ? '443' : String(fallbackPort))
    return {
      url: parsed.origin,
      host: parsed.hostname || fallbackHost,
      port,
    }
  } catch {
    return {
      url: `http://${fallbackHost}:${fallbackPort}`,
      host: fallbackHost,
      port: String(fallbackPort),
    }
  }
}

const quantAi = parseServiceEndpoint(
  process.env.QUANT_AI_URL,
  process.env.QUANT_AI_HOST || '127.0.0.1',
  Number(process.env.QUANT_AI_PORT || 4240),
)

const quantRouter = parseServiceEndpoint(
  process.env.QUANT_ROUTER_URL,
  process.env.QUANT_ROUTER_HOST || '127.0.0.1',
  Number(process.env.QUANT_ROUTER_PORT || 4003),
)

const quantPay = parseServiceEndpoint(
  process.env.QUANT_PAY_URL,
  process.env.QUANT_PAY_HOST || '127.0.0.1',
  Number(process.env.QUANT_PAY_PORT || 4002),
)

const pdsDataDir = path.resolve(
  process.env.QUANTZING_PDS_DATA_DIR ||
    process.env.QUANTZING_DATA_DIR ||
    path.join(rootDir, '.quantzing-data'),
)

process.env.QUANT_AI_HOST = quantAi.host
process.env.QUANT_AI_PORT = quantAi.port
process.env.QUANT_ROUTER_HOST = quantRouter.host
process.env.QUANT_ROUTER_PORT = quantRouter.port
process.env.QUANT_PAY_HOST = quantPay.host
process.env.QUANT_PAY_PORT = quantPay.port
process.env.QUANTZING_DATA_DIR = pdsDataDir
process.env.QUANTZING_PDS_DATA_DIR = pdsDataDir
process.env.HOST = process.env.HOST || '0.0.0.0'
process.env.PORT = process.env.PORT || '3008'

fs.mkdirSync(path.join(pdsDataDir, 'blobs'), {recursive: true})

async function probeService(name, baseUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return {
      name,
      url: baseUrl,
      status: res.ok ? 'ONLINE' : `HTTP_${res.status}`,
    }
  } catch (err) {
    clearTimeout(timer)
    const reason =
      err && typeof err === 'object' && 'cause' in err && err.cause?.code
        ? err.cause.code
        : err?.name === 'AbortError'
          ? 'TIMEOUT'
          : 'OFFLINE'
    return {
      name,
      url: baseUrl,
      status: `FALLBACK (${reason})`,
    }
  }
}

async function main() {
  console.log('========================================================================')
  console.log(' QuantZing Sovereign Cloud & QuantOS Adapter')
  console.log('========================================================================')
  console.log(` Bind Address         : http://${process.env.HOST}:${process.env.PORT}`)
  console.log(` Sovereign PDS Store  : ${pdsDataDir}`)

  const probes = await Promise.all([
    probeService('quant-ai (Quanty)', quantAi.url),
    probeService('quant-router', quantRouter.url),
    probeService('quant-pay (Wallet)', quantPay.url),
  ])

  for (const probe of probes) {
    console.log(` Upstream ${probe.name.padEnd(20)}: ${probe.url.padEnd(28)} [${probe.status}]`)
  }
  console.log('========================================================================')

  if (process.argv.includes('--check-only')) {
    return
  }

  const serverScript = path.join(rootDir, 'scripts', 'serve-quantzing.mjs')
  await import(pathToFileURL(serverScript).href)
}

main().catch(err => {
  console.error('[QuantZing Adapter] Fatal startup error:', err)
  process.exit(1)
})
