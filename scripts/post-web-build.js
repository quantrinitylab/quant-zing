const path = require('node:path')
const fs = require('node:fs')
const zlib = require('node:zlib')
const {execFileSync} = require('node:child_process')

const projectRoot = path.join(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const bskywebStatic = path.join(projectRoot, 'bskyweb', 'static')
const templatesDir = path.join(projectRoot, 'bskyweb', 'templates')
const templateFile = path.join(templatesDir, 'scripts.html')
const fontsTemplateFile = path.join(templatesDir, 'fonts.html')

const QUANTZING_FAVICON_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='2' y='2' width='60' height='60' rx='16' fill='%23000000' stroke='%232F3336' stroke-width='2'/%3E%3Cpath fill='%23FFFFFF' d='M15 15H49V21L27 42H49V49H15V43L37 22H15Z'/%3E%3Cpath fill='%231D9BF0' d='M23 29.5H46L41 34.5H18Z'/%3E%3C/svg%3E"

/**
 * Wrap one or more PNG buffers into a valid multi-resolution ICO binary
 * (PNG-in-ICO format supported by all modern browsers and OSes).
 */
function buildIcoFromPngs(pngBuffers) {
  const count = pngBuffers.length
  const headerSize = 6
  const entrySize = 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = ICO
  header.writeUInt16LE(count, 4)

  const entries = []
  let offset = headerSize + entrySize * count
  for (const png of pngBuffers) {
    // PNG IHDR width/height live at bytes 16..23 (big-endian uint32)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    const entry = Buffer.alloc(entrySize)
    entry.writeUInt8(width >= 256 ? 0 : width, 0)
    entry.writeUInt8(height >= 256 ? 0 : height, 1)
    entry.writeUInt8(0, 2) // color count
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...pngBuffers])
}

function writeQuantZingFaviconIco() {
  const pngCandidates = [
    path.join(bskywebStatic, 'favicon-32x32.png'),
    path.join(bskywebStatic, 'favicon-16x16.png'),
    path.join(bskywebStatic, 'favicon.png'),
  ]
  const pngBuffers = pngCandidates
    .filter(p => fs.existsSync(p))
    .map(p => fs.readFileSync(p))

  if (pngBuffers.length === 0) {
    const fallbackPng = path.join(projectRoot, 'assets', 'favicon.png')
    if (fs.existsSync(fallbackPng)) {
      pngBuffers.push(fs.readFileSync(fallbackPng))
    }
  }

  if (pngBuffers.length === 0) {
    console.warn('No QuantZing favicon PNGs found; skipping favicon.ico write')
    return
  }

  const icoBuffer = buildIcoFromPngs(pngBuffers)
  const distFaviconPath = path.join(distDir, 'favicon.ico')
  const staticFaviconPath = path.join(bskywebStatic, 'favicon.ico')

  fs.writeFileSync(distFaviconPath, icoBuffer)
  fs.writeFileSync(staticFaviconPath, icoBuffer)
  console.log(
    `Wrote QuantZing multi-size favicon.ico (${icoBuffer.length}B) to ${distFaviconPath} and ${staticFaviconPath}`,
  )
}

// Parse dist/index.html for entrypoint scripts and stylesheets injected by Metro.
// Metro injects <link rel="preload/stylesheet"> and <script> tags referencing
// /_expo/static/ paths, optionally prefixed by `experiments.baseUrl` (e.g. /static).
// We capture from /_expo/static/ onward so the captured path is independent of baseUrl.
//
// We preserve the _expo/static/ structure when copying to bskyweb/static, because
// Metro's runtime chunk loader and source maps embed these paths. Rewriting them
// would mean rewriting the chunk loader and every .map file's references; not worth it.
const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')

// Find all CSS stylesheet links pointing to _expo (skips preload links).
const cssEntries = []
const cssRegex = /<link\b[^>]*href="[^"]*?(\/_expo\/static\/css\/[^"]+)"[^>]*>/g
let match
while ((match = cssRegex.exec(indexHtml)) !== null) {
  if (match[0].includes('rel="stylesheet"')) {
    cssEntries.push(match[1])
  }
}

// Find all script src entries pointing to _expo
const jsEntries = []
const jsRegex = /<script\b[^>]*src="[^"]*?(\/_expo\/static\/js\/[^"]+)"[^>]*>/g
while ((match = jsRegex.exec(indexHtml)) !== null) {
  jsEntries.push(match[1])
}

if (jsEntries.length === 0) {
  // Fail loudly: an empty scripts.html silently breaks the deployed app.
  throw new Error(
    'No JS entrypoints found in dist/index.html. ' +
      'Metro may have changed its output format; update post-web-build.js.',
  )
}

console.log(`Found ${jsEntries.length} script entrypoints`)
console.log(`Found ${cssEntries.length} CSS entrypoints`)

// Generate scripts.html template.
// Map /_expo/static/... to {{ staticCDNHost }}/static/_expo/static/... so the
// path matches what we copy into bskyweb/static below.
const outputLines = []

for (const href of cssEntries) {
  const cdnPath = href.replace(/^\//, '{{ staticCDNHost }}/static/')
  outputLines.push(`<link rel="stylesheet" href="${cdnPath}">`)
}

for (const src of jsEntries) {
  const cdnPath = src.replace(/^\//, '{{ staticCDNHost }}/static/')
  outputLines.push(`<script defer="defer" src="${cdnPath}"></script>`)
}

console.log(`Writing ${templateFile}`)
fs.writeFileSync(templateFile, outputLines.join('\n'))

// Generate fonts.html — preload + @font-face for the splash, using the same
// content-hashed paths Metro emits for the bundle. Avoids shipping a duplicate
// font copy under /static/media/ and ensures the preload is actually used.
const fontsDir = path.join(distDir, 'assets', 'assets', 'fonts', 'inter')
function findFontHash(prefix) {
  if (!fs.existsSync(fontsDir)) return null
  const match = fs
    .readdirSync(fontsDir)
    .find(name => name.startsWith(prefix) && name.endsWith('.woff2'))
  return match || null
}
const interRegular = findFontHash('InterVariable.')
const interItalic = findFontHash('InterVariable-Italic.')
if (!interRegular || !interItalic) {
  throw new Error(
    `Could not find Inter font files in ${fontsDir}. ` +
      'Update post-web-build.js if the font emit path changed.',
  )
}

const interFontPath = '/assets/assets/fonts/inter/'
/*
 * The static index.html references the fonts by their unhashed names, but
 * Metro emits them content-hashed. Rewrite dist/index.html in place so the
 * font preload and @font-face URLs resolve when serving dist/ directly, and
 * enforce our QuantZing SVG + cache-busted /static/favicon.ico?v=qz1 links.
 */
const quantZingIconTags =
  `<link rel="icon" href="/static/favicon.ico?v=qz1" sizes="any"/>` +
  `<link rel="shortcut icon" href="/static/favicon.ico?v=qz1"/>` +
  `<link rel="icon" type="image/svg+xml" href="${QUANTZING_FAVICON_SVG}"/>` +
  `<link rel="manifest" href="/manifest.json"/>` +
  `<link rel="apple-touch-icon" href="/app-icon-192.png"/>` +
  `<meta name="theme-color" content="#000000"/>` +
  `<meta name="apple-mobile-web-app-capable" content="yes"/>` +
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>` +
  `<meta name="apple-mobile-web-app-title" content="QuantZing"/>` +
  `<script>window.__qzDeferredInstall=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__qzDeferredInstall=e;window.dispatchEvent(new CustomEvent('qz-install-ready'));});if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}</script>`

const fixedIndexHtml = indexHtml
  .replaceAll(
    '/assets/assets/fonts/inter/InterVariable.woff2',
    `${interFontPath}${interRegular}`,
  )
  .replaceAll(
    '/assets/assets/fonts/inter/InterVariable-Italic.woff2',
    `${interFontPath}${interItalic}`,
  )
  .replace(/<title>[^<]*<\/title>/i, '<title>QuantZing</title>')
  .replace(/<link\b[^>]*\brel="(?:shortcut\s+)?icon"[^>]*\/?>/gi, '')
  .replace('</head>', `  ${quantZingIconTags}\n  </head>`)

if (fixedIndexHtml !== indexHtml) {
  console.log(
    'Rewriting font paths and QuantZing favicon links in dist/index.html',
  )
  fs.writeFileSync(path.join(distDir, 'index.html'), fixedIndexHtml)
}

// Always overwrite Expo's generated dist/favicon.ico with our QuantZing multi-size ICO
writeQuantZingFaviconIco()

// Scrub any stale Metro-cached expo-constants strings inside dist/_expo/static/js/web/*.js
const distJsWebDir = path.join(distDir, '_expo', 'static', 'js', 'web')
if (fs.existsSync(distJsWebDir)) {
  for (const name of fs.readdirSync(distJsWebDir)) {
    if (!name.endsWith('.js')) continue
    const jsPath = path.join(distJsWebDir, name)
    const raw = fs.readFileSync(jsPath, 'utf8')
    const cleaned = raw
      .replace(/QuantWave/g, 'QuantZing')
      .replace(/quantwave/g, 'quantzing')
      .replace(/#FF5A00/gi, '#1D9BF0')
    if (cleaned !== raw) {
      fs.writeFileSync(jsPath, cleaned, 'utf8')
      console.log(`Scrubbed stale Metro manifest cache in ${name}`)
    }
  }
}

const interRegularPath = `{{ staticCDNHost }}/static${interFontPath}${interRegular}`
const interItalicPath = `{{ staticCDNHost }}/static${interFontPath}${interItalic}`

const fontsHtml = `<link rel="preload" as="font" type="font/woff2" href="${interRegularPath}" crossorigin>
<style>
  @font-face {
    font-family: 'InterVariable';
    src: url("${interRegularPath}") format('woff2');
    font-weight: 300 1000;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'InterVariableItalic';
    src: url("${interItalicPath}") format('woff2');
    font-weight: 300 1000;
    font-style: italic;
    font-display: swap;
  }
</style>
`
console.log(`Writing ${fontsTemplateFile}`)
fs.writeFileSync(fontsTemplateFile, fontsHtml)

// Clean previous build output to avoid stale files
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, {recursive: true})
    console.log(`Cleaned ${dir}`)
  }
}

cleanDir(path.join(bskywebStatic, '_expo'))
cleanDir(path.join(bskywebStatic, 'assets'))

// Recursively copy a directory.
function copyDir(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    console.log(`Skipping ${sourceDir} (does not exist)`)
    return
  }
  fs.mkdirSync(targetDir, {recursive: true})
  const entries = fs.readdirSync(sourceDir, {withFileTypes: true})
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
      console.log(`Copied ${sourcePath} to ${targetPath}`)
    }
  }
}

// Copy Metro's _expo/ tree wholesale so JS chunks (including lazy chunks
// referenced by hash) and source maps resolve at the same paths the runtime expects.
copyDir(path.join(distDir, '_expo'), path.join(bskywebStatic, '_expo'))

// Copy assets (fonts, images, icons, etc.) referenced as /static/assets/... by the bundle.
copyDir(path.join(distDir, 'assets'), path.join(bskywebStatic, 'assets'))

// Build-time Brotli (quality 11) + Gzip (level 9) pre-compression for every .js and .css > 8 KB
function precompressStaticAssets(rootDir) {
  const MIN_BYTES = 8 * 1024
  let fileCount = 0
  let totalRaw = 0
  let totalBr = 0
  let totalGz = 0

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, {withFileTypes: true})
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (ext !== '.js' && ext !== '.css') continue
      const stat = fs.statSync(fullPath)
      if (stat.size <= MIN_BYTES) continue

      const raw = fs.readFileSync(fullPath)
      const brBuf = zlib.brotliCompressSync(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      })
      const gzBuf = zlib.gzipSync(raw, {level: 9})

      fs.writeFileSync(`${fullPath}.br`, brBuf)
      fs.writeFileSync(`${fullPath}.gz`, gzBuf)

      fileCount += 1
      totalRaw += raw.length
      totalBr += brBuf.length
      totalGz += gzBuf.length
    }
  }

  walk(rootDir)
  if (fileCount > 0) {
    const rawKb = (totalRaw / 1024).toFixed(1)
    const brKb = (totalBr / 1024).toFixed(1)
    const gzKb = (totalGz / 1024).toFixed(1)
    const brPct = (((totalRaw - totalBr) / totalRaw) * 100).toFixed(1)
    const gzPct = (((totalRaw - totalGz) / totalRaw) * 100).toFixed(1)
    console.log(
      `Pre-compressed ${fileCount} JS/CSS assets (>8 KB) in dist/: raw ${rawKb} KB -> .br ${brKb} KB (-${brPct}%) | .gz ${gzKb} KB (-${gzPct}%)`,
    )
  } else {
    console.log('No JS/CSS assets > 8 KB found in dist/ for pre-compression')
  }
}

precompressStaticAssets(distDir)

// Upload source maps to Sentry
if (
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_AUTH_TOKEN != 'unknown'
) {
  const releasePackage = 'xyz.blueskyweb.app'
  const release =
    process.env.SENTRY_RELEASE ||
    `${releasePackage}@${require(path.join(projectRoot, 'package.json')).version}`
  /*
   * The runtime reports `xyz.blueskyweb.app@` + (EXPO_PUBLIC_RELEASE_VERSION
   * || package.json version) (SENTRY_RELEASE in src/env/common.ts), so maps
   * uploaded under a bogus release never match incoming events. "null" and
   * "undefined" catch `jq -r '.version'` stringifying a missing package.json
   * version field, and the empty case catches an unset
   * EXPO_PUBLIC_RELEASE_VERSION in the Dockerfile.
   */
  const version = release.startsWith(`${releasePackage}@`)
    ? release.slice(releasePackage.length + 1)
    : ''
  if (!version || version === 'null' || version === 'undefined') {
    throw new Error(
      `Refusing to upload source maps under invalid Sentry release ${JSON.stringify(release)}. ` +
        `Set SENTRY_RELEASE to "${releasePackage}@<version>" or restore the "version" field in package.json.`,
    )
  }
  const dist = process.env.SENTRY_DIST || undefined
  const sourceMapDir = path.join(distDir, '_expo', 'static')

  console.log(`Uploading source maps to Sentry (release: ${release})`)
  const args = [
    'sourcemaps',
    'upload',
    '--org',
    'blueskyweb',
    '--project',
    'app',
    '--release',
    release,
    ...(dist ? ['--dist', dist] : []),
    sourceMapDir,
  ]
  try {
    execFileSync('sentry-cli', args, {stdio: 'inherit', cwd: projectRoot})
    console.log('Sentry source map upload complete')
  } catch (e) {
    console.error('Sentry source map upload failed:', e.message)
    process.exit(1)
  }
} else {
  console.log('Skipping Sentry source map upload (SENTRY_AUTH_TOKEN not set)')
}
