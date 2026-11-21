#!/usr/bin/env node
/**
 * Deterministic, idempotent Lingui .po rebrand sweep for QuantZing.
 *
 * Rules:
 * - Leaves EVERY `msgid`, `msgctxt`, comment, header, and obsolete `#~` entry 100% untouched.
 * - For `en`, `en-GB`, `en-CA`: populates/updates `msgstr` with QuantZing branding
 *   and Zing / Rezing / Quote Zing vocabulary while strictly protecting ICU placeholders,
 *   plural/select headers & selector keys, `<0>...</0>` tags, URLs, `at://` URIs,
 *   `.bsky.social` handle examples, and non-social idioms (`blog post`, `Keep me posted`, `post-*`).
 * - For the 41 other locales configured in `lingui.config.ts`: performs a safe
 *   `Bluesky` / `QuantZing` -> `QuantZing` pass ONLY on already non-empty `msgstr` values while
 *   protecting ICU placeholders, tags, URLs, and `.bsky.social` handles.
 */

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOCALES_DIR = path.join(ROOT, 'src', 'locale', 'locales')
const LINGUI_CONFIG_PATH = path.join(ROOT, 'lingui.config.ts')

const ENGLISH_LOCALES = new Set(['en', 'en-GB', 'en-CA'])
const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Exact msgid overrides for English locales where idiomatic/verb phrasing
 * benefits from explicit mapping.
 */
const EXACT_ENGLISH_OVERRIDES = new Map([
  ['Post', 'Zing'],
  ['Post All', 'Zing All'],
  ['Posts', 'Zings'],
  ['New post', 'New Zing'],
  ['New Post', 'New Zing'],
  ['Compose new post', 'Compose new Zing'],
  ["What's up?", "What's zinging?"],
  ["What's waving?", "What's zinging?"],
  ['Feeds ✨', 'Feeds'],
  ['Get notified when {name} posts', 'Get notified when {name} zings'],
  ['Get notified when someone posts', 'Get notified when someone zings'],
  [
    'So many thoughts, you should post one',
    'So many thoughts, you should send a Zing',
  ],
  [
    'Find posts, users, and feeds on Bluesky',
    'Find Zings, people, and feeds on QuantZing',
  ],
  ['Post to Bluesky', 'Zing to QuantZing'],
  [
    'Post it to Bluesky or share anywhere.',
    'Zing it to QuantZing or share anywhere.',
  ],
  ['Post a photo', 'Zing a photo'],
  ['Post a video', 'Zing a video'],
  ['Post anyway', 'Zing anyway'],
  ['Keep me posted', 'Keep me posted'],
])

function readConfiguredLocales() {
  const src = fs.readFileSync(LINGUI_CONFIG_PATH, 'utf8')
  const match = src.match(/locales:\s*\[([\s\S]*?)\]/)
  if (!match) {
    throw new Error('Could not parse locales array from lingui.config.ts')
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

/**
 * Unescape a gettext PO quoted string literal (including leading & trailing quotes).
 */
function unescapePoLiteral(quoted) {
  const trimmed = quoted.trim()
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    throw new Error(`Invalid PO string literal: ${quoted}`)
  }
  const inner = trimmed.slice(1, -1)
  let out = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '\\' && i + 1 < inner.length) {
      const next = inner[++i]
      switch (next) {
        case 'n':
          out += '\n'
          break
        case 'r':
          out += '\r'
          break
        case 't':
          out += '\t'
          break
        case '"':
          out += '"'
          break
        case '\\':
          out += '\\'
          break
        default:
          out += '\\' + next
          break
      }
    } else {
      out += ch
    }
  }
  return out
}

function escapePoContent(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

function formatMsgstrLines(value) {
  if (!value.includes('\n')) {
    return [`msgstr "${escapePoContent(value)}"`]
  }
  const lines = ['msgstr ""']
  const parts = value.split('\n')
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1
    if (isLast && parts[i] === '') continue
    const segment = isLast ? parts[i] : parts[i] + '\n'
    lines.push(`"${escapePoContent(segment)}"`)
  }
  return lines
}

/**
 * Parse a .po file into blocks while keeping every original line intact so
 * unchanged blocks and non-msgstr lines are preserved byte-for-byte.
 */
function parsePoFile(rawText) {
  const hasCrlf = rawText.includes('\r\n')
  const normalized = rawText.replace(/\r\n/g, '\n')
  const endsWithNewline = normalized.endsWith('\n')
  const allLines = (endsWithNewline ? normalized.slice(0, -1) : normalized).split(
    '\n',
  )

  const blocks = []
  let current = []
  for (const line of allLines) {
    if (line === '') {
      blocks.push({type: 'entry', lines: current})
      blocks.push({type: 'blank', lines: ['']})
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) {
    blocks.push({type: 'entry', lines: current})
  }
  return {hasCrlf, endsWithNewline, blocks}
}

function inspectEntryBlock(lines) {
  if (lines.length === 0) return null
  // Skip obsolete blocks
  if (lines.every(l => l.startsWith('#') || l.trim() === '')) return null

  let msgctxt = null
  let msgid = null
  let msgstr = null
  let msgstrStart = -1
  let msgstrEnd = -1
  let hasPluralForm = false
  let cur = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#')) {
      continue
    }
    if (line.startsWith('msgid_plural ') || line.startsWith('msgstr[')) {
      hasPluralForm = true
      cur = null
      continue
    }
    if (line.startsWith('msgctxt ')) {
      cur = 'msgctxt'
      msgctxt = unescapePoLiteral(line.slice(8))
    } else if (line.startsWith('msgid ')) {
      cur = 'msgid'
      msgid = unescapePoLiteral(line.slice(6))
    } else if (line.startsWith('msgstr ')) {
      cur = 'msgstr'
      msgstr = unescapePoLiteral(line.slice(7))
      msgstrStart = i
      msgstrEnd = i
    } else if (line.startsWith('"') && cur) {
      const piece = unescapePoLiteral(line)
      if (cur === 'msgctxt') msgctxt += piece
      else if (cur === 'msgid') msgid += piece
      else if (cur === 'msgstr') {
        msgstr += piece
        msgstrEnd = i
      }
    } else {
      cur = null
    }
  }

  if (msgid === null || msgstr === null || msgstrStart === -1 || hasPluralForm) {
    return null
  }
  // Skip PO header block
  if (msgid === '') {
    return null
  }

  return {msgctxt, msgid, msgstr, msgstrStart, msgstrEnd}
}

/**
 * Find matching closing brace `}` starting from `openIdx` (where input[openIdx] === '{').
 */
function findMatchingBrace(str, openIdx) {
  let depth = 0
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * ICU-aware string transformer:
 * - Preserves Lingui JSX tags (`<0>`, `</0>`, `<1/>`, etc.) untouched.
 * - Preserves simple placeholders (`{0}`, `{post}`, `{reposter}`, `{n, number}`) untouched.
 * - Preserves ICU plural/selectordinal/select headers and selector keys (`one`, `other`, `=0`, `offset:1`, etc.) untouched,
 *   while recursively transforming ONLY human-visible text inside each branch `{...}`.
 */
function transformIcuString(input, transformPlainText) {
  let out = ''
  let plainBuf = ''
  let i = 0

  const flushPlain = () => {
    if (plainBuf.length > 0) {
      out += transformPlainText(plainBuf)
      plainBuf = ''
    }
  }

  while (i < input.length) {
    const ch = input[i]

    // Protect Lingui tag tokens like <0>, </0>, <1/>
    if (ch === '<') {
      const tagMatch = input.slice(i).match(/^<\/?\d+\/?>/)
      if (tagMatch) {
        flushPlain()
        out += tagMatch[0]
        i += tagMatch[0].length
        continue
      }
    }

    // Handle ICU `{ ... }` blocks
    if (ch === '{') {
      const closeIdx = findMatchingBrace(input, i)
      if (closeIdx === -1) {
        // Unbalanced brace — leave untouched as plain text char
        plainBuf += ch
        i++
        continue
      }

      flushPlain()
      const inner = input.slice(i + 1, closeIdx)
      const icuMatch = inner.match(
        /^(\s*[^,{}\s]+\s*,\s*(?:plural|selectordinal|select)\s*,)([\s\S]*)$/,
      )

      if (!icuMatch) {
        // Simple placeholder or formatter — preserve 100% untouched
        out += '{' + inner + '}'
      } else {
        const header = icuMatch[1]
        const branches = icuMatch[2]
        let transformedBranches = ''
        let j = 0
        while (j < branches.length) {
          const nextOpen = branches.indexOf('{', j)
          if (nextOpen === -1) {
            transformedBranches += branches.slice(j)
            break
          }
          // Preserve selector / offset / whitespace prefix before branch `{`
          transformedBranches += branches.slice(j, nextOpen)
          const branchClose = findMatchingBrace(branches, nextOpen)
          if (branchClose === -1) {
            transformedBranches += branches.slice(nextOpen)
            break
          }
          const branchBody = branches.slice(nextOpen + 1, branchClose)
          transformedBranches +=
            '{' + transformIcuString(branchBody, transformPlainText) + '}'
          j = branchClose + 1
        }
        out += '{' + header + transformedBranches + '}'
      }

      i = closeIdx + 1
      continue
    }

    plainBuf += ch
    i++
  }

  flushPlain()
  return out
}

/**
 * Protect sensitive substrings during regex replacement and restore afterward.
 */
function withProtectedSpans(text, patterns, fn) {
  const saved = []
  let masked = text
  for (const regex of patterns) {
    masked = masked.replace(regex, match => {
      const id = saved.length
      saved.push(match)
      return `\uE000${id}\uE001`
    })
  }
  let result = fn(masked)
  for (let i = saved.length - 1; i >= 0; i--) {
    result = result.replaceAll(`\uE000${i}\uE001`, saved[i])
  }
  return result
}

const ENGLISH_PROTECTED_PATTERNS = [
  // Preserve explicit @handle.bsky.social and .bsky.social handle/PDS examples
  /@?[A-Za-z0-9._-]+\.bsky\.social\b/gi,
  /\bbsky\.social\b/gi,
  // Preserve at:// URIs
  /\bat:\/\/[^\s<>"')]+/gi,
  // Preserve all URLs (note: bsky.app and quantzing.in are rewritten BEFORE this protection runs)
  /\bhttps?:\/\/[^\s<>"')]+/gi,
  // Preserve non-social idioms
  /\bblog posts?\b/gi,
  /\bkeep me posted\b/gi,
  /\bpost-[A-Za-z0-9]+\b/gi,
  /\b[A-Za-z0-9]+-post\b/gi,
]

function transformEnglishPlainText(segment) {
  // Rewrite bsky.app / quantzing.in web domain first (before general URL protection)
  let s = segment
    .replace(/\bbsky\.app\b/g, 'quantzing.com')
    .replace(/\bquantzing\.in\b/g, 'quantzing.com')

  return withProtectedSpans(s, ENGLISH_PROTECTED_PATTERNS, text => {
    let t = text

    // 0. Strip sparkle emoji on Feeds and update composer prompt
    t = t.replace(/Feeds\s*✨/g, 'Feeds')
    t = t.replace(/What's waving\?/g, "What's zinging?")
    t = t.replace(/What's up\?/g, "What's zinging?")

    // 1. Brand mentions: Bluesky / QuantZing -> QuantZing
    t = t.replace(/\bBluesky Social\b/g, 'QuantZing')
    t = t.replace(/\bBluesky\b/g, 'QuantZing')
    t = t.replace(/\bQuantZing\b/g, 'QuantZing')

    // 2. Repost / Rezing -> Rezing (all inflections & cases)
    t = t.replace(/\bUndo (?:repost|rezing)\b/g, 'Undo rezing')
    t = t.replace(/\bRemove (?:repost|rezing)\b/g, 'Remove rezing')
    t = t.replace(/\b(?:Repost|Rezing) or quote (?:post|Wave|wave)\b/g, 'Rezing or quote Zing')
    t = t.replace(/\b(?:Reposting|Rewaving)\b/g, 'Rezinging')
    t = t.replace(/\b(?:reposting|rewaving)\b/g, 'rezinging')
    t = t.replace(/\b(?:Reposted|Rezingd)\b/g, 'Rezinged')
    t = t.replace(/\b(?:reposted|rezingd)\b/g, 'rezinged')
    t = t.replace(/\b(?:Reposts|Rezings)\b/g, 'Rezings')
    t = t.replace(/\b(?:reposts|rezings)\b/g, 'rezings')
    t = t.replace(/\b(?:Repost|Rezing)\b/g, 'Rezing')
    t = t.replace(/\b(?:repost|rezing)\b/g, 'rezing')

    // 3. Quote post / Quote Wave -> Quote Zing (all inflections & cases)
    t = t.replace(/\bQuoted (?:posts|Waves|waves)\b/g, 'Quoted Zings')
    t = t.replace(/\bquoted (?:posts|Waves|waves)\b/g, 'quoted Zings')
    t = t.replace(/\bQuoted (?:post|Wave|wave)\b/g, 'Quoted Zing')
    t = t.replace(/\bquoted (?:post|Wave|wave)\b/g, 'quoted Zing')
    t = t.replace(/\bQuote (?:posts|Waves|waves)\b/g, 'Quote Zings')
    t = t.replace(/\bquote (?:posts|Waves|waves)\b/g, 'quote Zings')
    t = t.replace(/\bQuote (?:post|Wave|wave)\b/g, 'Quote Zing')
    t = t.replace(/\bquote (?:post|Wave|wave)\b/g, 'quote Zing')

    // 4. Contextual Post / Posts / Wave / Waves -> Zing / Zings
    t = t.replace(/(?<!-)\b(?:Posts|Waves)\b(?!-)/g, 'Zings')
    t = t.replace(/(?<!-)\b(?:Post|Wave)\b(?!-)/g, 'Zing')
    t = t.replace(/(?<!-)\b(?:posts|waves)\b(?!-)/g, 'Zings')
    t = t.replace(/(?<!-)\b(?:post|wave)\b(?!-)/g, 'Zing')

    return t
  })
}

const OTHER_LOCALE_PROTECTED_PATTERNS = [
  /@?[A-Za-z0-9._-]+\.bsky\.social\b/gi,
  /\bbsky\.social\b/gi,
  /\bat:\/\/[^\s<>"')]+/gi,
  /\bhttps?:\/\/[^\s<>"')]+/gi,
]

function transformOtherLocalePlainText(segment) {
  return withProtectedSpans(segment, OTHER_LOCALE_PROTECTED_PATTERNS, text => {
    return text
      .replace(/\b(?:Bluesky|QuantZing)\b/g, 'QuantZing')
      .replace(/Feeds\s*✨/g, 'Feeds')
  })
}

/**
 * Safety invariant checker: verifies ICU tags, placeholders, and brace balance
 * are 100% preserved between original and transformed strings.
 */
function extractStructuralSignature(str) {
  const tokens = []

  function walk(s) {
    let i = 0
    while (i < s.length) {
      if (s[i] === '<') {
        const tagMatch = s.slice(i).match(/^<\/?\d+\/?>/)
        if (tagMatch) {
          tokens.push(`TAG:${tagMatch[0]}`)
          i += tagMatch[0].length
          continue
        }
      }
      if (s[i] === '{') {
        const closeIdx = findMatchingBrace(s, i)
        if (closeIdx === -1) {
          throw new Error(`Unbalanced opening brace in: ${str}`)
        }
        const inner = s.slice(i + 1, closeIdx)
        const icuMatch = inner.match(
          /^(\s*[^,{}\s]+\s*,\s*(?:plural|selectordinal|select)\s*,)([\s\S]*)$/,
        )
        if (!icuMatch) {
          tokens.push(`VAR:{${inner}}`)
        } else {
          tokens.push(`ICU:{${icuMatch[1].replace(/\s+/g, ' ').trim()}`)
          const branches = icuMatch[2]
          let j = 0
          while (j < branches.length) {
            const nextOpen = branches.indexOf('{', j)
            if (nextOpen === -1) break
            const selector = branches.slice(j, nextOpen).trim()
            if (selector) tokens.push(`SEL:${selector}`)
            const branchClose = findMatchingBrace(branches, nextOpen)
            if (branchClose === -1) {
              throw new Error(`Unbalanced branch brace in: ${str}`)
            }
            walk(branches.slice(nextOpen + 1, branchClose))
            j = branchClose + 1
          }
          tokens.push('ICU:}')
        }
        i = closeIdx + 1
        continue
      }
      if (s[i] === '}') {
        throw new Error(`Unexpected closing brace in: ${str}`)
      }
      i++
    }
  }

  walk(str)
  return JSON.stringify(tokens)
}

function verifyIcuIntegrity(locale, msgid, before, after) {
  const sigBefore = extractStructuralSignature(before)
  const sigAfter = extractStructuralSignature(after)
  if (sigBefore !== sigAfter) {
    throw new Error(
      `ICU integrity violation in [${locale}] for msgid ${JSON.stringify(msgid)}:\n  before: ${before}\n  after:  ${after}\n  sigBefore: ${sigBefore}\n  sigAfter:  ${sigAfter}`,
    )
  }
}

function processLocaleFile(locale) {
  const filePath = path.join(LOCALES_DIR, locale, 'messages.po')
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing catalog file: ${filePath}`)
  }

  const rawText = fs.readFileSync(filePath, 'utf8')
  const {hasCrlf, endsWithNewline, blocks} = parsePoFile(rawText)
  const isEnglish = ENGLISH_LOCALES.has(locale)

  let totalEntries = 0
  let transformedCount = 0
  let initializedFromMsgidCount = 0

  for (const block of blocks) {
    if (block.type !== 'entry') continue
    const entry = inspectEntryBlock(block.lines)
    if (!entry) continue
    totalEntries++

    let nextMsgstr = entry.msgstr

    if (isEnglish) {
      const wasEmpty = entry.msgstr === ''
      const base = wasEmpty ? entry.msgid : entry.msgstr

      let candidate
      if (EXACT_ENGLISH_OVERRIDES.has(entry.msgid)) {
        const overrideVal = EXACT_ENGLISH_OVERRIDES.get(entry.msgid)
        candidate = overrideVal
      } else {
        candidate = transformIcuString(base, transformEnglishPlainText)
      }

      if (candidate !== base) {
        verifyIcuIntegrity(locale, entry.msgid, base, candidate)
        nextMsgstr = candidate
        if (wasEmpty) initializedFromMsgidCount++
      }
    } else {
      // Other 41 locales: ONLY transform already non-empty msgstr values
      if (entry.msgstr !== '') {
        const candidate = transformIcuString(
          entry.msgstr,
          transformOtherLocalePlainText,
        )
        if (candidate !== entry.msgstr) {
          verifyIcuIntegrity(locale, entry.msgid, entry.msgstr, candidate)
          nextMsgstr = candidate
        }
      }
    }

    if (nextMsgstr !== entry.msgstr) {
      const newMsgstrLines = formatMsgstrLines(nextMsgstr)
      block.lines = [
        ...block.lines.slice(0, entry.msgstrStart),
        ...newMsgstrLines,
        ...block.lines.slice(entry.msgstrEnd + 1),
      ]
      transformedCount++
    }
  }

  if (transformedCount > 0 && !DRY_RUN) {
    const outLines = blocks.flatMap(b => b.lines)
    const eol = hasCrlf ? '\r\n' : '\n'
    const output = outLines.join(eol) + (endsWithNewline ? eol : '')
    fs.writeFileSync(filePath, output, 'utf8')
  }

  return {locale, isEnglish, totalEntries, transformedCount, initializedFromMsgidCount}
}

function main() {
  const locales = readConfiguredLocales()
  const results = locales.map(processLocaleFile)

  let englishTotal = 0
  let otherTotal = 0
  let otherLocalesTouched = 0

  console.log(
    `QuantZing Lingui PO Sweep (${DRY_RUN ? 'DRY RUN' : 'APPLIED'}) across ${locales.length} locales:`,
  )
  for (const r of results) {
    if (r.isEnglish) {
      englishTotal += r.transformedCount
      console.log(
        `  [EN] ${r.locale.padEnd(6)} transformed=${String(r.transformedCount).padStart(4)} (fromEmpty=${r.initializedFromMsgidCount}, total=${r.totalEntries})`,
      )
    } else {
      otherTotal += r.transformedCount
      if (r.transformedCount > 0) otherLocalesTouched++
    }
  }
  console.log(
    `  [OTHER 41 LOCALES] localesModified=${otherLocalesTouched}/41, entriesTransformed=${otherTotal}`,
  )
  console.log(
    `  [GRAND TOTAL] entriesTransformed=${englishTotal + otherTotal} (English=${englishTotal}, Other=${otherTotal})`,
  )
}

main()
