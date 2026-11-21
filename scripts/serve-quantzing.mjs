import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {fileURLToPath} from 'node:url'
import {handleQuantZingPds, isQuantZingPdsRoute} from './quantzing-pds.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const port = Number(process.env.PORT || 3008)
const host = process.env.HOST || '127.0.0.1'

const PROXY_ROUTES = [
  {
    prefix: '/api/quant-ai',
    service: 'quant-ai',
    targetHost: process.env.QUANT_AI_HOST || '127.0.0.1',
    targetPort: Number(process.env.QUANT_AI_PORT || 4240),
  },
  {
    prefix: '/api/quant-router',
    service: 'quant-router',
    targetHost: process.env.QUANT_ROUTER_HOST || '127.0.0.1',
    targetPort: Number(process.env.QUANT_ROUTER_PORT || 4003),
  },
  {
    prefix: '/api/quant-pay',
    service: 'quant-pay',
    targetHost: process.env.QUANT_PAY_HOST || '127.0.0.1',
    targetPort: Number(process.env.QUANT_PAY_PORT || 4002),
  },
]

const PROXY_TIMEOUT_MS = 15000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg'])

function sendProxyOffline(res, route, reason) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end()
    return
  }
  const payload = JSON.stringify({
    ok: false,
    offline: true,
    service: route.service,
    upstream: `http://${route.targetHost}:${route.targetPort}`,
    message: `QuantOS service "${route.service}" is offline at ${route.targetHost}:${route.targetPort}${reason ? ` (${reason})` : ''}. Start local QuantOS services with node quant-platform/infra/start-local-os.mjs.`,
  })
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-quantzing-proxy': route.service,
  })
  res.end(payload)
}

function matchProxyRoute(urlPath) {
  const pathname = urlPath.split('?')[0]
  for (const route of PROXY_ROUTES) {
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
      return route
    }
  }
  return null
}

function proxyRequest(req, res, route) {
  const rawUrl = req.url || route.prefix
  const queryIdx = rawUrl.indexOf('?')
  const pathname = queryIdx === -1 ? rawUrl : rawUrl.slice(0, queryIdx)
  const search = queryIdx === -1 ? '' : rawUrl.slice(queryIdx)
  const strippedPath = pathname.slice(route.prefix.length) || '/'
  const upstreamPath =
    (strippedPath.startsWith('/') ? strippedPath : `/${strippedPath}`) + search

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': req.headers.origin || '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers':
        req.headers['access-control-request-headers'] ||
        'content-type,authorization,x-quant-owner-id,x-request-id',
      'cache-control': 'no-store',
    })
    res.end()
    return
  }

  const forwardedHeaders = {...req.headers}
  delete forwardedHeaders.host
  delete forwardedHeaders.connection
  forwardedHeaders['x-forwarded-host'] = String(req.headers.host || `${host}:${port}`)
  forwardedHeaders['x-forwarded-proto'] = 'http'

  const proxyReq = http.request(
    {
      hostname: route.targetHost,
      port: route.targetPort,
      path: upstreamPath,
      method: req.method || 'GET',
      headers: forwardedHeaders,
      timeout: PROXY_TIMEOUT_MS,
    },
    proxyRes => {
      const responseHeaders = {...proxyRes.headers}
      responseHeaders['cache-control'] =
        responseHeaders['cache-control'] || 'no-store'
      responseHeaders['x-quantzing-proxy'] = route.service
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 502, responseHeaders)
      }
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('ETIMEDOUT'))
  })

  proxyReq.on('error', err => {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : err?.message
    sendProxyOffline(res, route, String(code || 'UNAVAILABLE'))
  })

  req.on('aborted', () => {
    proxyReq.destroy()
  })

  req.pipe(proxyReq)
}

function resolveStaticFile(pathname) {
  let clean = decodeURIComponent(pathname.split('?')[0])
  if (clean.startsWith('/static/')) {
    clean = clean.slice('/static'.length)
  }
  const normalized = path.normalize(clean).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(distDir, normalized)
  if (
    candidate.startsWith(distDir) &&
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isFile()
  ) {
    return candidate
  }
  return null
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/'

  if (urlPath === '/health' || urlPath === '/_health') {
    res.writeHead(200, {'content-type': 'application/json; charset=utf-8'})
    res.end(
      JSON.stringify({
        ok: true,
        service: 'quant-zing',
        engine: 'atproto-sovereign-pure',
        pds: true,
        blueskyUpstream: false,
        port,
        distReady: fs.existsSync(path.join(distDir, 'index.html')),
        proxyRoutes: PROXY_ROUTES.map(r => ({
          prefix: r.prefix,
          service: r.service,
          upstream: `http://${r.targetHost}:${r.targetPort}`,
        })),
      }),
    )
    return
  }

  // Sovereign QuantZing ATProto PDS + Public AppView Hybrid (/xrpc/*, /blob/*, /api/quantzing/*)
  if (isQuantZingPdsRoute(urlPath)) {
    void handleQuantZingPds(req, res)
    return
  }

  // Same-origin reverse proxy to local QuantOS services (zero CORS)
  const matchedProxy = matchProxyRoute(urlPath)
  if (matchedProxy) {
    proxyRequest(req, res, matchedProxy)
    return
  }

  let filePath = resolveStaticFile(urlPath)
  const isAssetRequest =
    urlPath.startsWith('/_expo/') ||
    urlPath.startsWith('/static/_expo/') ||
    urlPath.startsWith('/assets/') ||
    urlPath.startsWith('/static/assets/')

  if (!filePath) {
    if (isAssetRequest) {
      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
      res.end('Not found')
      return
    }
    filePath = path.join(distDir, 'index.html')
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(503, {'content-type': 'text/plain; charset=utf-8'})
    res.end('QuantZing dist/ not built yet. Run pnpm build-web first.')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'
  const isImmutable =
    filePath.includes(`${path.sep}_expo${path.sep}`) ||
    ext === '.woff2' ||
    ext === '.ttf'

  const headers = {
    'content-type': contentType,
    'cache-control': isImmutable
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'x-powered-by': 'QuantZing / QuantOS',
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  if (COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip')) {
    headers['content-encoding'] = 'gzip'
    res.writeHead(200, headers)
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res)
  } else {
    res.writeHead(200, headers)
    fs.createReadStream(filePath).pipe(res)
  }
})

server.listen(port, host, () => {
  console.log(
    `[QuantZing] Live standalone ATProto web app running at http://localhost:${port}`,
  )
  console.log(
    `[QuantZing] 100% Sovereign PDS + AppView active at /xrpc/*, /blob/*, /api/quantzing/* (zero external Bluesky calls)`,
  )
  console.log(
    `[QuantZing] Same-origin QuantOS proxy active: /api/quant-ai -> :${PROXY_ROUTES[0].targetPort}, /api/quant-router -> :${PROXY_ROUTES[1].targetPort}, /api/quant-pay -> :${PROXY_ROUTES[2].targetPort}`,
  )
})
