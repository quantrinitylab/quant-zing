import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {fileURLToPath} from 'node:url'
import {
  buildIosMobileconfigXml,
  findAndroidApkPath,
  findIosTouchIconPng,
  flushAndClosePdsStore,
  getActiveStore,
  getAppReleasePayload,
  getPackageVersion,
  handleQuantZingPds,
  isQuantZingPdsRoute,
} from './quantzing-pds.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.resolve(__dirname, '..', 'dist')
const opsPortalDir = path.resolve(__dirname, '..', 'ops-portal')
const port = Number(process.env.PORT || 3008)
const host = process.env.HOST || '127.0.0.1'

function findQuantZingIconPng() {
  const candidates = [
    path.join(projectRoot, 'assets', 'app-icons', 'android_icon_default_next.png'),
    path.join(projectRoot, 'assets', 'app-icons', 'ios_icon_default_next.png'),
    path.join(projectRoot, 'assets', 'icon.png'),
    path.join(projectRoot, 'assets', 'favicon.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function pipeFileStreamSafe(req, res, filePath, headers, compress = false) {
  const readStream = fs.createReadStream(filePath)
  readStream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, {'content-type': 'text/plain; charset=utf-8'})
    }
    if (!res.writableEnded) {
      res.end('Internal stream error')
    }
  })

  if (compress) {
    const gzip = zlib.createGzip()
    gzip.on('error', () => {
      if (!res.writableEnded) res.end()
    })
    res.writeHead(200, {...headers, 'content-encoding': 'gzip'})
    readStream.pipe(gzip).pipe(res)
  } else {
    res.writeHead(200, headers)
    readStream.pipe(res)
  }

  req.on('aborted', () => {
    readStream.destroy()
  })
}

const OPS_SECURITY_HEADERS = {
  'x-robots-tag': 'noindex, nofollow',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
}

function getRequestHostname(req) {
  const raw = String(
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || '',
  )
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (!raw) return ''
  if (raw.startsWith('[')) {
    const endIdx = raw.indexOf(']')
    return endIdx !== -1 ? raw.slice(1, endIdx) : raw
  }
  return raw.replace(/:\d+$/, '')
}

function isDedicatedOpsHost(hostname) {
  return (
    (hostname.startsWith('ops.') && hostname.length > 4) ||
    (hostname.startsWith('quantzing-ops.') && hostname.length > 14)
  )
}

export function isOpsRequestHost(req) {
  const hostname = getRequestHostname(req)
  if (!hostname) return false
  if (isDedicatedOpsHost(hostname)) return true
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    return true
  }
  const extraRaw = String(process.env.QUANTZING_OPS_HOSTS || '')
  if (extraRaw.trim()) {
    for (const part of extraRaw.split(',')) {
      const cleaned = part
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '')
      if (cleaned && hostname === cleaned) return true
    }
  }
  return false
}

function isRestrictedOpsPath(pathname) {
  return (
    pathname === '/ops' ||
    pathname.startsWith('/ops/') ||
    pathname === '/api/quantzing/admin' ||
    pathname.startsWith('/api/quantzing/admin/') ||
    pathname === '/api/quantzing/ops' ||
    pathname.startsWith('/api/quantzing/ops/')
  )
}

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
  forwardedHeaders['x-forwarded-host'] = String(
    req.headers.host || `${host}:${port}`,
  )
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
      proxyRes.on('error', () => {
        if (!res.writableEnded) res.end()
      })
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('ETIMEDOUT'))
  })

  proxyReq.on('error', err => {
    const code =
      err && typeof err === 'object' && 'code' in err ? err.code : err?.message
    sendProxyOffline(res, route, String(code || 'UNAVAILABLE'))
  })

  req.on('aborted', () => {
    proxyReq.destroy()
  })
  req.on('error', () => {
    proxyReq.destroy()
  })

  req.pipe(proxyReq)
}

function resolveStaticFile(pathname) {
  let clean
  try {
    clean = decodeURIComponent(pathname.split('?')[0])
  } catch {
    return null
  }
  if (clean.startsWith('/static/')) {
    clean = clean.slice('/static'.length)
  }
  const normalized = path.normalize(clean).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.resolve(distDir, normalized.replace(/^[/\\]+/, ''))
  try {
    if (
      candidate.startsWith(`${distDir}${path.sep}`) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate
    }
  } catch {}
  return null
}

function resolveOpsStaticFile(subPathname) {
  let clean
  try {
    clean = decodeURIComponent(String(subPathname || '/').split('?')[0])
  } catch {
    return null
  }
  if (clean === '/' || clean === '') {
    clean = '/index.html'
  }
  const normalized = path.normalize(clean).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.resolve(
    opsPortalDir,
    normalized.replace(/^[/\\]+/, ''),
  )
  try {
    if (
      candidate.startsWith(`${opsPortalDir}${path.sep}`) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate
    }
  } catch {}
  return null
}

function serveOpsPortal(req, res, subPathname) {
  const cleanSub = String(subPathname || '/').split('?')[0]
  let filePath = resolveOpsStaticFile(cleanSub)
  const extRequested = path.extname(cleanSub).toLowerCase()

  if (!filePath) {
    if (extRequested && extRequested !== '.html') {
      res.writeHead(404, {
        ...OPS_SECURITY_HEADERS,
        'content-type': 'text/plain; charset=utf-8',
      })
      res.end('Not found')
      return
    }
    filePath = path.join(opsPortalDir, 'index.html')
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(503, {
      ...OPS_SECURITY_HEADERS,
      'content-type': 'text/plain; charset=utf-8',
    })
    res.end('QuantZing Ops Portal is not built/installed at ops-portal/.')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'
  const headers = {
    ...OPS_SECURITY_HEADERS,
    'content-type': contentType,
    'x-powered-by': 'QuantZing Ops / QuantOS',
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  const shouldCompress = COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip')
  pipeFileStreamSafe(req, res, filePath, headers, shouldCompress)
}

// Warm SQLite WAL store once on process boot
try {
  getActiveStore()
} catch (err) {
  console.error('[QuantZing] Failed to bootstrap SQLite WAL store:', err)
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/'
  const pathname = urlPath.split('?')[0]

  if (pathname === '/health' || pathname === '/_health') {
    res.writeHead(200, {'content-type': 'application/json; charset=utf-8'})
    res.end(
      JSON.stringify({
        ok: true,
        service: 'quant-zing',
        version: getPackageVersion(),
        engine: 'atproto-sovereign-pure',
        storage: 'sqlite-wal',
        pds: true,
        blueskyUpstream: false,
        port,
        distReady: fs.existsSync(path.join(distDir, 'index.html')),
        opsPortalReady: fs.existsSync(path.join(opsPortalDir, 'index.html')),
        proxyRoutes: PROXY_ROUTES.map(r => ({
          prefix: r.prefix,
          service: r.service,
          upstream: `http://${r.targetHost}:${r.targetPort}`,
        })),
      }),
    )
    return
  }

  if (pathname === '/manifest.json') {
    const manifest = JSON.stringify(
      {
        name: 'QuantZing',
        short_name: 'QuantZing',
        description:
          'Real-time sovereign conversations, vertical Reels, ZingSpaces, and built-in Quanty AI.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['social', 'news', 'entertainment'],
        icons: [
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: '/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      null,
      2,
    )
    res.writeHead(200, {
      'content-type': 'application/manifest+json; charset=utf-8',
      'content-length': Buffer.byteLength(manifest),
      'cache-control': 'public, max-age=3600',
    })
    res.end(manifest)
    return
  }

  if (pathname === '/sw.js') {
    const sw = [
      "self.addEventListener('install', () => self.skipWaiting());",
      "self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));",
      "self.addEventListener('fetch', () => {});",
    ].join('\n')
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'content-length': Buffer.byteLength(sw),
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    })
    res.end(sw)
    return
  }

  if (pathname === '/apple-touch-icon.png') {
    const iosIcon = findIosTouchIconPng()
    if (iosIcon) {
      const stat = fs.statSync(iosIcon)
      pipeFileStreamSafe(req, res, iosIcon, {
        'content-type': 'image/png',
        'content-length': stat.size,
        'cache-control': 'public, max-age=86400',
      })
      return
    }
  }

  if (pathname === '/app-icon-192.png' || pathname === '/app-icon-512.png') {
    const iconFile = findQuantZingIconPng()
    if (iconFile) {
      const stat = fs.statSync(iconFile)
      pipeFileStreamSafe(req, res, iconFile, {
        'content-type': 'image/png',
        'content-length': stat.size,
        'cache-control': 'public, max-age=86400',
      })
      return
    }
  }

  if (pathname === '/api/quantzing/app-release') {
    const payload = JSON.stringify(getAppReleasePayload())
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
    })
    res.end(payload)
    return
  }

  if (pathname === '/download/quantzing-ios.mobileconfig') {
    const xml = buildIosMobileconfigXml()
    const buf = Buffer.from(xml, 'utf8')
    res.writeHead(200, {
      'content-type': 'application/x-apple-aspen-config; charset=utf-8',
      'content-length': buf.length,
      'content-disposition':
        'attachment; filename="QuantZing-iOS.mobileconfig"',
      'cache-control': 'no-cache',
    })
    res.end(buf)
    return
  }

  if (pathname === '/download/quantzing-android.apk') {
    const apkPath = findAndroidApkPath()
    if (!apkPath) {
      const payload = JSON.stringify({
        error: 'ReleaseNotBuilt',
        message:
          'Direct Android APK build is being prepared. Install QuantZing instantly as a native-feel Web App from /download.',
      })
      res.writeHead(404, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'cache-control': 'no-store',
      })
      res.end(payload)
      return
    }
    const stat = fs.statSync(apkPath)
    const baseHeaders = {
      'content-type': 'application/vnd.android.package-archive',
      'accept-ranges': 'bytes',
      'content-disposition': 'attachment; filename="QuantZing-Android.apk"',
      'cache-control': 'public, max-age=3600',
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {...baseHeaders, 'content-length': stat.size})
      res.end()
      return
    }
    const rangeHeader = String(req.headers.range || '')
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
    if (rangeMatch) {
      const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0
      const end = rangeMatch[2]
        ? Math.min(Number(rangeMatch[2]), stat.size - 1)
        : stat.size - 1
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        start <= end &&
        start < stat.size
      ) {
        const chunkLen = end - start + 1
        const rs = fs.createReadStream(apkPath, {start, end})
        rs.on('error', () => {
          if (!res.writableEnded) res.end()
        })
        res.writeHead(206, {
          ...baseHeaders,
          'content-range': `bytes ${start}-${end}/${stat.size}`,
          'content-length': chunkLen,
        })
        rs.pipe(res)
        req.on('aborted', () => rs.destroy())
        return
      }
    }
    pipeFileStreamSafe(req, res, apkPath, {
      ...baseHeaders,
      'content-length': stat.size,
    })
    return
  }

  const hostname = getRequestHostname(req)
  const isOpsHost = isOpsRequestHost(req)
  const rootOpsHost = isOpsHost && isDedicatedOpsHost(hostname)

  // Strict Host-Based Isolation: hide /ops, /api/quantzing/admin/*, /api/quantzing/ops/* on public consumer hosts
  if (!isOpsHost && isRestrictedOpsPath(pathname)) {
    const payload = JSON.stringify({error: 'NotFound', message: 'Not found'})
    res.writeHead(404, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'cache-control': 'no-store',
    })
    res.end(payload)
    return
  }

  // Sovereign QuantZing ATProto PDS + Public AppView + Quanty MCP (/xrpc/*, /blob/*, /api/quantzing/*, /mcp*)
  if (isQuantZingPdsRoute(urlPath)) {
    handleQuantZingPds(req, res).catch(err => {
      console.error('[QuantZing Server] Unhandled PDS error:', err)
      if (!res.headersSent) {
        res.writeHead(500, {'content-type': 'application/json; charset=utf-8'})
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            error: 'InternalServerError',
            message: 'Unhandled QuantZing PDS error',
          }),
        )
      }
    })
    return
  }

  // Same-origin reverse proxy to local QuantOS services (zero CORS)
  const matchedProxy = matchProxyRoute(urlPath)
  if (matchedProxy) {
    proxyRequest(req, res, matchedProxy)
    return
  }

  // Dedicated Ops Subdomain (ops.* or quantzing-ops.*): serve ops-portal/ at root /
  if (rootOpsHost) {
    const subPath =
      pathname === '/ops' || pathname === '/ops/'
        ? '/index.html'
        : pathname.startsWith('/ops/')
          ? pathname.slice('/ops'.length)
          : pathname
    serveOpsPortal(req, res, subPath)
    return
  }

  // Local dev / allowed ops host: serve ops-portal/ at /ops and /ops/*
  if (isOpsHost && (pathname === '/ops' || pathname.startsWith('/ops/'))) {
    const subPath =
      pathname === '/ops' || pathname === '/ops/'
        ? '/index.html'
        : pathname.slice('/ops'.length)
    serveOpsPortal(req, res, subPath)
    return
  }

  let filePath = resolveStaticFile(urlPath)

  // Fallback for relative ops-portal assets (e.g. ./styles.css) when loaded via /ops without trailing slash
  if (
    !filePath &&
    isOpsHost &&
    String(req.headers.referer || '').includes('/ops')
  ) {
    const opsFallback = resolveOpsStaticFile(pathname)
    if (opsFallback && path.basename(opsFallback) !== 'index.html') {
      serveOpsPortal(req, res, pathname)
      return
    }
  }
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
  const shouldCompress = COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip')
  pipeFileStreamSafe(req, res, filePath, headers, shouldCompress)
})

// Defensive HTTP timeouts against slow-loris / stalled sockets (5 min for large APK downloads)
server.requestTimeout = 300_000
server.headersTimeout = 30_000
server.keepAliveTimeout = 10_000

function gracefulShutdown(signal) {
  console.log(`[QuantZing] Received ${signal}, flushing SQLite WAL & closing...`)
  try {
    flushAndClosePdsStore()
  } catch {}
  server.close(() => {
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

server.listen(port, host, () => {
  console.log(
    `[QuantZing] Live standalone ATProto web app running at http://localhost:${port}`,
  )
  console.log(
    `[QuantZing] 100% Sovereign PDS + AppView + SQLite WAL + Quanty MCP active at /xrpc/*, /blob/*, /api/quantzing/*, /mcp`,
  )
  console.log(
    `[QuantZing] Employee Ops Portal active at http://localhost:${port}/ops (and root / on ops.* / quantzing-ops.* hosts)`,
  )
  console.log(
    `[QuantZing] Same-origin QuantOS proxy active: /api/quant-ai -> :${PROXY_ROUTES[0].targetPort}, /api/quant-router -> :${PROXY_ROUTES[1].targetPort}, /api/quant-pay -> :${PROXY_ROUTES[2].targetPort}`,
  )
})
