import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __quantyDirname = path.dirname(fileURLToPath(import.meta.url))
let quantyEnvLoaded = false

function loadOptionalQuantyEnvOnce() {
  if (quantyEnvLoaded) return
  quantyEnvLoaded = true
  const candidates = [
    process.env.QUANTY_ENV_FILE,
    '/etc/quantzing/quanty.env',
    path.resolve(__quantyDirname, '..', 'quanty.env'),
    path.resolve(__quantyDirname, '..', '.env'),
  ].filter(Boolean)

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue
      const raw = fs.readFileSync(filePath, 'utf8')
      for (const rawLine of raw.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const stripped = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const eqIdx = stripped.indexOf('=')
        if (eqIdx <= 0) continue
        const key = stripped.slice(0, eqIdx).trim()
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
        if (process.env[key] !== undefined && process.env[key] !== '') continue
        let val = stripped.slice(eqIdx + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
          (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
        ) {
          val = val.slice(1, -1)
        }
        process.env[key] = val
      }
    } catch {
      // Optional env file — fail open silently
    }
  }
}

// ---------------------------------------------------------------------------
// QuantZing Quanty AI Sovereign Control Bridge & MCP 2025-03-26 Server
// Zero external dependencies (Node built-ins only)
// ---------------------------------------------------------------------------

export const QUANTY_PROTOCOL_VERSION = '2025-03-26'
export const QUANTY_BRIDGE_VERSION = '2.0.0'

const CONFIRMATION_TTL_MS = 5 * 60 * 1000 // 5 minutes
const USED_ACTION_RETENTION_MS = 15 * 60 * 1000
const WRITE_RATE_WINDOW_MS = 60 * 1000
const WRITE_RATE_MAX_PER_WINDOW = 25
const HEALTH_CACHE_TTL_MS = 15 * 1000
const HEALTH_PROBE_TIMEOUT_MS = 1500
const AI_CALL_TIMEOUT_MS = 4500
const MENTION_AI_TIMEOUT_MS = 2800

const DEFAULT_QUANT_AI_URL =
  process.env.QUANT_AI_URL ||
  `http://${process.env.QUANT_AI_HOST || '127.0.0.1'}:${process.env.QUANT_AI_PORT || '4240'}`
const DEFAULT_QUANT_ROUTER_URL =
  process.env.QUANT_ROUTER_URL ||
  `http://${process.env.QUANT_ROUTER_HOST || '127.0.0.1'}:${process.env.QUANT_ROUTER_PORT || '4003'}`
const DEFAULT_QUANT_PAY_URL =
  process.env.QUANT_PAY_URL ||
  `http://${process.env.QUANT_PAY_HOST || '127.0.0.1'}:${process.env.QUANT_PAY_PORT || '4002'}`

// ---------------------------------------------------------------------------
// Complete 21-Tool Sovereign + QuantOS Catalog (10 Read + 11 Write/Destructive)
// ---------------------------------------------------------------------------

export const QUANTY_TOOLS = [
  // ---- 10 READ TOOLS (approvalRequired: false) ----
  {
    name: 'quantzing_get_trends',
    title: 'Trending on QuantZing',
    description:
      'Fetch real-time trending topics, hashtags, and top momentum discussions on QuantZing.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/trends',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', minimum: 1, maximum: 20, default: 8},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_search_zings',
    title: 'Search Zings',
    description:
      'Search live Sovereign QuantZing posts by keyword, author handle, or hashtag sorted by top or latest.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/search',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', minLength: 1, maxLength: 200},
        author: {type: 'string', maxLength: 120},
        tag: {type: 'string', maxLength: 80},
        sort: {type: 'string', enum: ['top', 'latest'], default: 'top'},
        limit: {type: 'integer', minimum: 1, maximum: 25, default: 8},
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_search_people',
    title: 'Search People',
    description:
      'Discover Sovereign QuantZing accounts by handle, display name, or bio keywords.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/people',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', minLength: 1, maxLength: 120},
        limit: {type: 'integer', minimum: 1, maximum: 25, default: 8},
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_get_thread',
    title: 'Inspect Thread',
    description:
      'Read a Zing post, its parent context, live replies, view count, and engagement metrics.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/thread',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        uri: {type: 'string', minLength: 5, maxLength: 300},
        depth: {type: 'integer', minimum: 1, maximum: 5, default: 2},
      },
      required: ['uri'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_get_profile',
    title: 'Inspect Profile',
    description:
      'Fetch a Sovereign QuantZing account profile, follower stats, verification status, and recent Zings.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/profile',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        actor: {type: 'string', maxLength: 160},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_get_user_analytics',
    title: 'Creator Analytics',
    description:
      'Retrieve real viewer-owned creator analytics including authentic viewCount impressions, engagements, and top Zings.',
    category: 'read',
    requiresAuth: true,
    approvalRequired: false,
    slashCommand: '/analytics',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        windowDays: {type: 'integer', minimum: 1, maximum: 365, default: 30},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_get_notifications',
    title: 'Notifications Inbox',
    description:
      'Inspect the signed-in user notifications, mentions, replies, likes, rezings, and unread count.',
    category: 'read',
    requiresAuth: true,
    approvalRequired: false,
    slashCommand: '/notifications',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', minimum: 1, maximum: 40, default: 15},
        unreadOnly: {type: 'boolean', default: false},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_get_bookmarks',
    title: 'Saved Bookmarks',
    description: 'Fetch Zings bookmarked by the signed-in user.',
    category: 'read',
    requiresAuth: true,
    approvalRequired: false,
    slashCommand: '/bookmarks',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', minimum: 1, maximum: 40, default: 15},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_list_convos',
    title: 'Direct Messages',
    description:
      'List active Direct Message conversations and recent message snippets for the signed-in user.',
    category: 'read',
    requiresAuth: true,
    approvalRequired: false,
    slashCommand: '/dms',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', minimum: 1, maximum: 30, default: 12},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_list_lists',
    title: 'Lists, Spaces & Articles',
    description:
      'Fetch curated lists for an actor (and optionally active ZingSpaces or Sovereign Articles).',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/lists',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        actor: {type: 'string', maxLength: 160},
        include: {
          type: 'string',
          enum: ['lists', 'spaces', 'articles', 'all'],
          default: 'lists',
        },
        limit: {type: 'integer', minimum: 1, maximum: 30, default: 15},
      },
      additionalProperties: false,
    },
  },

  // ---- 11 WRITE / ACTION TOOLS (requiresAuth: true, approvalRequired: true) ----
  {
    name: 'quantzing_publish_zing',
    title: 'Publish Zing',
    description:
      'Publish a new Sovereign Zing post (up to 300 characters) on behalf of the signed-in account.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/zing',
    editableFields: ['text'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        text: {type: 'string', minLength: 1, maxLength: 300},
        langs: {type: 'array', items: {type: 'string'}},
        quoteUri: {type: 'string', maxLength: 300},
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_reply_to_zing',
    title: 'Reply to Zing',
    description:
      'Post a threaded reply to an existing Zing on behalf of the signed-in account.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/reply',
    editableFields: ['text'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        postUri: {type: 'string', minLength: 5, maxLength: 300},
        text: {type: 'string', minLength: 1, maxLength: 300},
      },
      required: ['postUri', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_send_dm',
    title: 'Send Direct Message',
    description:
      'Send a Direct Message to another Sovereign QuantZing handle or DID.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/dm',
    editableFields: ['recipient', 'text'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {type: 'string', minLength: 2, maxLength: 160},
        text: {type: 'string', minLength: 1, maxLength: 1000},
      },
      required: ['recipient', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_publish_article',
    title: 'Publish Sovereign Article',
    description:
      'Publish or save a draft long-form Sovereign Article persisted directly to the QuantZing database.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/article',
    editableFields: ['title', 'subtitle', 'body'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        title: {type: 'string', minLength: 2, maxLength: 180},
        subtitle: {type: 'string', maxLength: 280},
        body: {type: 'string', minLength: 10, maxLength: 40000},
        tags: {type: 'array', items: {type: 'string'}},
        coverUrl: {type: 'string', maxLength: 500},
        status: {type: 'string', enum: ['published', 'draft'], default: 'published'},
        shareToFeed: {type: 'boolean', default: false},
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_create_poll',
    title: 'Create Interactive Poll',
    description:
      'Publish a Sovereign Zing with an interactive multi-option poll embedded in the timeline.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/poll',
    editableFields: ['text', 'options'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        text: {type: 'string', minLength: 2, maxLength: 300},
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {type: 'string', minLength: 1, maxLength: 80},
        },
        durationHours: {type: 'integer', minimum: 1, maximum: 168, default: 24},
      },
      required: ['text', 'options'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_create_space',
    title: 'Host ZingSpace',
    description:
      'Create a live or scheduled ZingSpace audio/community room hosted by the signed-in account.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/space',
    editableFields: ['title', 'topic'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        title: {type: 'string', minLength: 3, maxLength: 140},
        topic: {type: 'string', maxLength: 140},
        scheduledFor: {type: 'string', maxLength: 60},
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_create_list',
    title: 'Create Curated List',
    description:
      'Create a curated or moderation list and optionally add initial QuantZing member handles.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/list',
    editableFields: ['name', 'description'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string', minLength: 2, maxLength: 64},
        description: {type: 'string', maxLength: 300},
        purpose: {
          type: 'string',
          enum: ['curatelist', 'modlist'],
          default: 'curatelist',
        },
        members: {type: 'array', items: {type: 'string'}},
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_follow_account',
    title: 'Follow / Unfollow Account',
    description:
      'Follow or unfollow a Sovereign QuantZing handle or DID.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/follow',
    editableFields: ['actor'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        actor: {type: 'string', minLength: 2, maxLength: 160},
        unfollow: {type: 'boolean', default: false},
      },
      required: ['actor'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_bookmark_zing',
    title: 'Bookmark Zing',
    description:
      'Save or remove a Zing in the signed-in user personal bookmarks.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/bookmark',
    editableFields: ['postUri'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        postUri: {type: 'string', minLength: 5, maxLength: 300},
        remove: {type: 'boolean', default: false},
      },
      required: ['postUri'],
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_update_profile',
    title: 'Update Profile Bio',
    description:
      'Update the signed-in user display name and/or bio description on Sovereign QuantZing.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/bio',
    editableFields: ['displayName', 'description'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        displayName: {type: 'string', maxLength: 64},
        description: {type: 'string', maxLength: 256},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'quantzing_moderate_account',
    title: 'Mute or Block Account',
    description:
      'Apply a personal mute or block safety action against a QuantZing account (or lift it).',
    category: 'destructive',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/mute',
    editableFields: ['actor'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        actor: {type: 'string', minLength: 2, maxLength: 160},
        action: {type: 'string', enum: ['mute', 'unmute', 'block', 'unblock']},
      },
      required: ['actor', 'action'],
      additionalProperties: false,
    },
  },
]

// Additional auxiliary tools supported seamlessly in execute & /chat without inflating the 21-tool manifest
const AUXILIARY_TOOLS = {
  quantzing_get_spaces: {
    name: 'quantzing_get_spaces',
    title: 'Active ZingSpaces',
    description: 'List live and scheduled ZingSpaces audio rooms.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/spaces',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        status: {type: 'string', enum: ['all', 'live', 'scheduled', 'ended']},
        limit: {type: 'integer', minimum: 1, maximum: 30},
      },
    },
  },
  quantzing_get_articles: {
    name: 'quantzing_get_articles',
    title: 'Sovereign Articles',
    description: 'List published long-form Sovereign Articles on QuantZing.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/articles',
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        actor: {type: 'string'},
        status: {type: 'string', enum: ['all', 'published', 'draft']},
        limit: {type: 'integer', minimum: 1, maximum: 30},
      },
    },
  },
  quantzing_quantos_status: {
    name: 'quantzing_quantos_status',
    title: 'QuantOS Engine Status',
    description: 'Probe live QuantAI, QuantRouter, and QuantPay engine health.',
    category: 'read',
    requiresAuth: false,
    approvalRequired: false,
    slashCommand: '/status',
    estimatedCredits: 0,
    inputSchema: {type: 'object', properties: {}},
  },
  quantzing_like_zing: {
    name: 'quantzing_like_zing',
    title: 'Like Zing',
    description: 'Like or unlike a Zing on behalf of the signed-in account.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/like',
    editableFields: ['postUri'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        postUri: {type: 'string'},
        unlike: {type: 'boolean'},
      },
      required: ['postUri'],
    },
  },
  quantzing_rezing: {
    name: 'quantzing_rezing',
    title: 'Rezing Post',
    description: 'Rezing or un-rezing a Zing on behalf of the signed-in account.',
    category: 'write',
    requiresAuth: true,
    approvalRequired: true,
    slashCommand: '/rezing',
    editableFields: ['postUri'],
    estimatedCredits: 0,
    inputSchema: {
      type: 'object',
      properties: {
        postUri: {type: 'string'},
        unrezing: {type: 'boolean'},
      },
      required: ['postUri'],
    },
  },
}

const TOOL_ALIASES = {
  quantzing_create_zing: 'quantzing_publish_zing',
  quantzing_reply_zing: 'quantzing_reply_to_zing',
  quantzing_follow_actor: 'quantzing_follow_account',
}

const TOOL_MAP = new Map(QUANTY_TOOLS.map(t => [t.name, t]))

// ---------------------------------------------------------------------------
// Deterministic Helpers (Zero Emojis, Canonical JSON, HMAC, Safe Parsing)
// ---------------------------------------------------------------------------

function stripEmojis(text) {
  if (!text) return ''
  return String(text)
    .replace(/[0-9#*]\uFE0F?\u20E3/g, '')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{203C}\u{2049}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(item => canonicalJson(item)).join(',') + ']'
  }
  const keys = Object.keys(value)
    .filter(k => value[k] !== undefined)
    .sort()
  return (
    '{' +
    keys
      .map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',') +
    '}'
  )
}

function cleanHandle(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[.,;:!?]+$/, '')
}

function clampInt(val, min, max, fallback) {
  const n = Number(val)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function getValidQuantOsModel(mode) {
  return mode === 'deepsearch' || mode === 'drafter'
    ? 'quant/auto-pro'
    : 'quant/auto-fast'
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'what',
  'about',
  'into',
  'have',
  'your',
  'will',
  'just',
  'like',
  'more',
  'when',
  'they',
  'them',
  'were',
  'been',
  'than',
  'then',
  'some',
  'could',
  'would',
  'should',
  'there',
  'their',
  'which',
  'where',
  'please',
  'tell',
  'give',
  'show',
  'explain',
  'summarize',
  'quanty',
  'quantzing',
  'zing',
  'zings',
  'post',
  'posts',
])

function extractKeywords(text, maxTerms = 5) {
  const tokens = stripEmojis(text)
    .toLowerCase()
    .replace(/[^a-z0-9@#._\-\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^[@#]+/, ''))
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
  return [...new Set(tokens)].slice(0, maxTerms)
}

function postViewToCitation(pv) {
  if (!pv || typeof pv !== 'object') return null
  const uri = pv.uri || ''
  const text = stripEmojis(pv.record?.text || pv.text || '')
  if (!uri || !text) return null
  const handle = pv.author?.handle || pv.handle || 'member.quantzing.com'
  const displayName =
    stripEmojis(pv.author?.displayName || pv.displayName || '') || handle
  return {
    uri,
    handle,
    displayName,
    text,
    likeCount: Number(pv.likeCount || 0),
    repostCount: Number(pv.repostCount || 0),
    replyCount: Number(pv.replyCount || 0),
    viewCount: Number(pv.viewCount || 0),
    indexedAt: pv.indexedAt || pv.record?.createdAt || undefined,
    isVerified:
      pv.author?.verification?.verifiedStatus === 'valid' ||
      Boolean(pv.author?.verified),
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch(url, {...options, signal: controller.signal})
    const latencyMs = Date.now() - started
    const data = await res.json().catch(() => null)
    return {ok: res.ok, status: res.status, data, latencyMs}
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'network_error',
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractKnowledgeSubject(rawPrompt) {
  let q = stripEmojis(rawPrompt || '').trim()
  q = q.replace(/[?!.]+$/g, '').trim()
  q = q
    .replace(
      /^(?:(?:hi+|hey+|hello+|namaste)[,\s]+)?(?:quanty[,\s]+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+|please\s+)*/i,
      '',
    )
    .replace(
      /^(?:what\s+(?:is|are|was|were)\s+(?:a\s+|an\s+|the\s+)?|who\s+(?:is|are|was|were)\s+|where\s+(?:is|are|was|were)\s+|when\s+(?:was|did|is)\s+|why\s+(?:is|are|do|does|did)\s+|how\s+(?:does|do|did|is|are|to)\s+|explain\s+(?:to\s+me\s+)?(?:what\s+(?:is|are)\s+)?(?:the\s+)?|tell\s+me\s+(?:all\s+)?about\s+|define\s+|describe\s+|overview\s+of\s+|summary\s+of\s+|meaning\s+of\s+)/i,
      '',
    )
    .replace(/\s+(?:work|works|mean|means|exist|exists)\s*$/i, '')
    .replace(
      /\s+in\s+(?:simple\s+terms|brief|short|detail|plain\s+english|one\s+sentence)$/i,
      '',
    )
    .trim()
  return q || stripEmojis(rawPrompt || '').trim()
}

function cleanWikiExtract(text) {
  return stripEmojis(String(text || ''))
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchExternalKnowledge(rawPrompt, timeoutMs = 2500) {
  const subject = extractKnowledgeSubject(rawPrompt)
  if (!subject || subject.length < 2) return {ok: false, subject: ''}

  const started = Date.now()
  const headers = {
    accept: 'application/json',
    'user-agent': 'QuantZing-Quanty/2.0 (https://quantzing.quantrinity.in)',
  }
  const directSlug = (
    subject.charAt(0).toUpperCase() + subject.slice(1)
  ).replace(/\s+/g, '_')

  const [directWiki, openSearch, ddgRes] = await Promise.all([
    fetchJsonWithTimeout(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(directSlug)}`,
      {headers},
      Math.min(timeoutMs, 2200),
    ),
    fetchJsonWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&namespace=0&format=json&search=${encodeURIComponent(subject)}`,
      {headers},
      Math.min(timeoutMs, 2200),
    ),
    fetchJsonWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(subject)}&format=json&no_html=1&skip_disambig=1`,
      {headers},
      Math.min(timeoutMs, 2200),
    ),
  ])

  let wikiData =
    directWiki.ok &&
    directWiki.data &&
    directWiki.data.type !== 'disambiguation' &&
    typeof directWiki.data.extract === 'string' &&
    directWiki.data.extract.trim().length >= 40
      ? directWiki.data
      : null

  if (!wikiData && openSearch.ok && Array.isArray(openSearch.data?.[1])) {
    const bestTitle = String(openSearch.data[1][0] || '').trim()
    const remainingMs = Math.max(800, timeoutMs - (Date.now() - started))
    if (bestTitle && bestTitle.toLowerCase() !== subject.toLowerCase()) {
      const followUp = await fetchJsonWithTimeout(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle.replace(/\s+/g, '_'))}`,
        {headers},
        remainingMs,
      )
      if (
        followUp.ok &&
        followUp.data &&
        followUp.data.type !== 'disambiguation' &&
        typeof followUp.data.extract === 'string' &&
        followUp.data.extract.trim().length >= 30
      ) {
        wikiData = followUp.data
      }
    }
  }

  const ddg = ddgRes.ok && ddgRes.data ? ddgRes.data : null
  const ddgAbstract = cleanWikiExtract(
    ddg?.AbstractText || ddg?.Answer || ddg?.Definition || '',
  )
  const wikiExtract = cleanWikiExtract(wikiData?.extract || '')

  const relatedPoints = []
  const seenPoints = new Set()
  if (Array.isArray(ddg?.RelatedTopics)) {
    for (const item of ddg.RelatedTopics) {
      const candidates = Array.isArray(item?.Topics) ? item.Topics : [item]
      for (const c of candidates) {
        const t = cleanWikiExtract(c?.Text || '')
        if (t && t.length >= 25 && !seenPoints.has(t.toLowerCase().slice(0, 60))) {
          seenPoints.add(t.toLowerCase().slice(0, 60))
          relatedPoints.push(t.slice(0, 180))
          if (relatedPoints.length >= 3) break
        }
      }
      if (relatedPoints.length >= 3) break
    }
  }

  const primarySummary = wikiExtract || ddgAbstract
  if (!primarySummary && relatedPoints.length === 0) {
    return {ok: false, subject}
  }

  const title = cleanWikiExtract(
    wikiData?.title || ddg?.Heading || subject,
  )
  const shortDescription = cleanWikiExtract(wikiData?.description || '')
  const sourceName = wikiExtract
    ? 'Wikipedia'
    : cleanWikiExtract(ddg?.AbstractSource || 'DuckDuckGo')
  const sourceUrl =
    wikiData?.content_urls?.desktop?.page || ddg?.AbstractURL || ''

  return {
    ok: true,
    subject,
    title,
    shortDescription,
    summary: primarySummary,
    relatedPoints,
    sourceName,
    sourceUrl,
    latencyMs: Date.now() - started,
  }
}

function classifyConversationalIntent(prompt, mode, postContext) {
  const trimmed = stripEmojis(prompt || '').trim()
  const lower = trimmed.toLowerCase()
  if (!trimmed || trimmed.startsWith('/')) return {kind: 'none'}

  // 1. Warm greetings (English + Hinglish/Hindi, single or compound)
  const greetingPhrase =
    "(?:hi+|hey+|hello+|yo+|sup|hola|namaste|namaskar|good\\s+(?:morning|afternoon|evening|night)|kaise\\s+ho|kya\\s+haal(?:\\s+hai)?|what'?s\\s+up|wassup|how\\s+are\\s+you|how'?s\\s+it\\s+going)"
  const greetingRe = new RegExp(
    `^${greetingPhrase}(?:[\\s,!?.]+(?:quanty|there|bro|friend|ai|buddy|${greetingPhrase}))*[\\s!?.]*$`,
    'i',
  )
  if (greetingRe.test(trimmed)) {
    return {kind: 'greeting', lower}
  }

  // 2. Identity & capability queries
  if (
    /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+quanty|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|who\s+(?:made|built|created)\s+you|help|commands|how\s+do\s+you\s+work|introduce\s+yourself)[\s!?.]*$/i.test(
      trimmed,
    )
  ) {
    return {kind: 'identity', lower}
  }

  // 3. Thanks / casual closing
  if (
    /^(?:thanks?(?:\s+(?:a\s+lot|so\s+much|quanty))?|thank\s+you(?:\s+(?:so\s+much|quanty))?|thx|ty|cheers|cool|nice|awesome|great|got\s+it|ok(?:ay)?|sounds\s+good|bye|goodbye|see\s+you)[\s!?.]*$/i.test(
      trimmed,
    )
  ) {
    return {kind: 'thanks', lower}
  }

  // 4. Creative drafting / rewriting requests (distinct from direct "post a zing saying ...")
  const rewriteMatch = trimmed.match(
    /^(?:please\s+)?(?:rewrite|improve|polish|tighten|shorten|rephrase|make\s+(?:this|it)\s+(?:sharper|better|shorter|punchier))(?:\s+(?:this|my\s+(?:zing|post|draft|tweet)))?(?:\s*[:\-]\s*|\s+)([\s\S]+)$/i,
  )
  if (rewriteMatch) {
    return {
      kind: 'draft',
      format: 'rewrite',
      topic: rewriteMatch[1].trim(),
      sourceText: rewriteMatch[1].trim(),
    }
  }

  const draftMatch = trimmed.match(
    /^(?:please\s+)?(?:write|draft|compose|generate|give\s+me|help\s+me\s+(?:write|draft))\s+(?:a\s+|an\s+|some\s+|me\s+a\s+)?(?:short\s+|sharp\s+|punchy\s+|viral\s+|good\s+|engaging\s+|crisp\s+)?(zing|post|tweet|thread|caption|hook|announcement)(?:\s+(?:about|on|for|regarding|explaining))?\s*([\s\S]*)$/i,
  )
  if (draftMatch) {
    const kindWord = draftMatch[1].toLowerCase()
    const rawTopic = draftMatch[2].trim().replace(/^["':\-\s]+|["'\s]+$/g, '')
    return {
      kind: 'draft',
      format: kindWord === 'thread' ? 'thread' : 'zing',
      topic: rawTopic || postContext?.text || '',
    }
  }

  if (mode === 'drafter') {
    const cleanedTopic = trimmed
      .replace(
        /^(?:draft|write|compose)\s+(?:a\s+)?(?:sharp\s+)?(?:zing|post|tweet|reply|thread)(?:\s+(?:about|on|for))?\s*/i,
        '',
      )
      .trim()
    return {
      kind: 'draft',
      format: /\bthread\b/i.test(lower) ? 'thread' : 'zing',
      topic: cleanedTopic || postContext?.text || trimmed,
    }
  }

  // 5. General knowledge / factual explanation questions
  const isQuantZingSpecific =
    Boolean(postContext?.uri) ||
    /@[a-zA-Z0-9._-]{3,}/.test(trimmed) ||
    /\b(analytics|impressions|my\s+stats|engagement\s+rate|creator\s+studio|notifications|unread|bookmarks|saved\s+zings|my\s+dms|direct\s+messages|inbox|convos|my\s+lists|zingspaces|audio\s+rooms|quantos|wallet|credits|engine\s+status|trending|trends|what'?s\s+trending|happening\s+on\s+quantzing)\b/i.test(
      lower,
    )

  const looksLikeQuestion =
    /^(?:what|who|where|when|why|how|explain|tell\s+me\s+about|define|describe|compare|difference\s+between|overview\s+of|summary\s+of|meaning\s+of|is\s+|are\s+|can\s+you\s+explain)\b/i.test(
      trimmed,
    ) || trimmed.endsWith('?')

  if (!isQuantZingSpecific && (looksLikeQuestion || trimmed.length >= 3)) {
    return {
      kind: 'knowledge',
      subject: extractKnowledgeSubject(trimmed),
    }
  }

  return {kind: 'none'}
}

function buildSmartCreativeDraft({topic, format, sourceText, knowledge, citations}) {
  const cleanTopic = stripEmojis(topic || '').trim()
  if (format === 'rewrite' && sourceText) {
    const base = stripEmojis(sourceText)
      .replace(/^["']|["']$/g, '')
      .replace(/\b(just|really|very|actually|basically|literally)\s+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    const tightened =
      base.length > 260 ? `${base.slice(0, 257).trim()}...` : base
    const polished =
      tightened.charAt(0).toUpperCase() +
      tightened.slice(1) +
      (/[.!?]$/.test(tightened) ? '' : '.')
    return {
      suggestedZingDraft: polished.slice(0, 280),
      markdown: [
        'Here is a tighter, sharper rewrite:',
        '',
        `> ${polished}`,
        '',
        'Tap **Confirm** below if you want to post it straight to QuantZing, or edit the copy right in the card.',
      ].join('\n'),
    }
  }

  const factLead = knowledge?.ok && knowledge.summary
    ? knowledge.summary.split(/(?<=[.!?])\s+/)[0]
    : ''

  if (format === 'thread') {
    const title = cleanTopic || 'building independent software'
    const capTitle = title.charAt(0).toUpperCase() + title.slice(1)
    const tag = cleanTopic
      ? `#${cleanTopic.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 22)}`
      : '#QuantZing'
    const p1 = factLead
      ? `1/ Quick breakdown on ${title}: ${factLead}`.slice(0, 275)
      : `1/ Everyone talks about ${title}, but most people miss what actually matters once it hits real-world scale. Here is the short version:`
    const p2 = knowledge?.relatedPoints?.[0]
      ? `2/ Why it matters right now: ${knowledge.relatedPoints[0]}`.slice(0, 275)
      : `2/ The real edge with ${title} comes down to speed, reliability, and clear execution rather than hype.`
    const p3 = `3/ Bottom line on ${capTitle}: teams that ship fast and stay grounded in real users win. What is your take? ${tag.length > 2 ? tag : ''}`.trim().slice(0, 275)
    return {
      suggestedZingDraft: p1,
      markdown: [
        `Here is a crisp 3-part thread on **${capTitle}**:`,
        '',
        `**Post 1**`,
        `> ${p1}`,
        '',
        `**Post 2**`,
        `> ${p2}`,
        '',
        `**Post 3**`,
        `> ${p3}`,
        '',
        'You can post the opener below or tweak any line before publishing.',
      ].join('\n'),
    }
  }

  const subject = cleanTopic || 'what we are building next'
  const capSubject = subject.charAt(0).toUpperCase() + subject.slice(1)
  const refHandle = citations?.[0]?.handle ? ` (building on @${citations[0].handle})` : ''
  const draftOne = factLead
    ? `${capSubject}: ${factLead.slice(0, 210)} What do you think comes next?`.slice(0, 275)
    : `${capSubject}${refHandle} is moving faster than most people expect. The winners are focusing on speed, clarity, and real-world utility over noise.`.slice(
        0,
        275,
      )
  const draftTwo = `Hot take on ${subject}: the best breakthroughs feel obvious in hindsight, right after someone ships the clean version first.`.slice(
    0,
    275,
  )

  return {
    suggestedZingDraft: draftOne,
    markdown: [
      `Here are two ready-to-post Zing drafts on **${capSubject}**:`,
      '',
      `**Option 1 (Direct)**`,
      `> ${draftOne}`,
      '',
      `**Option 2 (Conversational)**`,
      `> ${draftTwo}`,
      '',
      'Want it shorter, bolder, or turned into a 3-post thread? Otherwise confirm the card below to post Option 1.',
    ].join('\n'),
  }
}

function parseJsonSafe(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function extractQuantyActionsBlock(rawText) {
  const text = String(rawText || '')
  const actions = []
  const cleaned = text
    .replace(/```quanty-actions\s*([\s\S]*?)```/gi, (_, block) => {
      try {
        const parsed = JSON.parse(block.trim())
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.toolName === 'string') {
              actions.push({
                toolName: item.toolName,
                arguments:
                  item.arguments && typeof item.arguments === 'object'
                    ? item.arguments
                    : item.args && typeof item.args === 'object'
                      ? item.args
                      : {},
              })
            }
          }
        }
      } catch {
        // Ignore malformed model action block cleanly
      }
      return ''
    })
    .trim()
  return {cleaned, actions}
}

// ---------------------------------------------------------------------------
// Thread Persistence Adapter (SQLite WAL via deps.store, or facade fallback)
// ---------------------------------------------------------------------------

function createThreadPersistence(deps) {
  const store = deps?.store || null
  const sqlite =
    store &&
    (typeof store.prepare === 'function' && typeof store.exec === 'function'
      ? store
      : store.db &&
          typeof store.db.prepare === 'function' &&
          typeof store.db.exec === 'function'
        ? store.db
        : store.sqlite &&
            typeof store.sqlite.prepare === 'function' &&
            typeof store.sqlite.exec === 'function'
          ? store.sqlite
          : null)

  let sqliteReady = false
  if (sqlite) {
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS quanty_threads (
          id TEXT PRIMARY KEY,
          did TEXT NOT NULL,
          title TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'ask',
          post_context_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_quanty_threads_did_updated
          ON quanty_threads (did, updated_at DESC);
        CREATE TABLE IF NOT EXISTS quanty_messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          did TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'ask',
          origin TEXT,
          provider TEXT,
          model TEXT,
          latency_ms INTEGER,
          citations_json TEXT,
          tool_traces_json TEXT,
          proposed_actions_json TEXT,
          suggested_zing_draft TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (thread_id) REFERENCES quanty_threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quanty_messages_thread_created
          ON quanty_messages (thread_id, created_at ASC);
      `)
      sqliteReady = true
    } catch {
      sqliteReady = false
    }
  }

  function getFallbackMap() {
    const db = deps?.getDb?.()
    if (db && typeof db === 'object') {
      if (!db._quantyThreadsFallback) {
        db._quantyThreadsFallback = {threads: new Map(), messages: new Map()}
      }
      return db._quantyThreadsFallback
    }
    if (!createThreadPersistence._mem) {
      createThreadPersistence._mem = {threads: new Map(), messages: new Map()}
    }
    return createThreadPersistence._mem
  }

  function rowToThread(row, messageCount = 0) {
    return {
      id: row.id,
      did: row.did,
      title: row.title,
      mode: row.mode || 'ask',
      postContext: parseJsonSafe(row.post_context_json, null),
      messageCount: Number(row.message_count ?? messageCount ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  function rowToMessage(row) {
    return {
      id: row.id,
      threadId: row.thread_id,
      role: row.role,
      content: row.content,
      mode: row.mode || 'ask',
      origin: row.origin || undefined,
      provider: row.provider || undefined,
      model: row.model || undefined,
      latencyMs:
        row.latency_ms !== null && row.latency_ms !== undefined
          ? Number(row.latency_ms)
          : undefined,
      citations: parseJsonSafe(row.citations_json, []),
      toolTraces: parseJsonSafe(row.tool_traces_json, []),
      proposedActions: parseJsonSafe(row.proposed_actions_json, []),
      suggestedZingDraft: row.suggested_zing_draft || undefined,
      createdAt: row.created_at,
    }
  }

  return {
    listThreads(did, limit = 30) {
      if (typeof store?.listQuantyThreads === 'function') {
        return store.listQuantyThreads(did, limit)
      }
      if (sqliteReady) {
        const rows = sqlite
          .prepare(
            `SELECT t.*, (SELECT COUNT(*) FROM quanty_messages m WHERE m.thread_id = t.id) AS message_count
             FROM quanty_threads t
             WHERE t.did = ?
             ORDER BY t.updated_at DESC
             LIMIT ?`,
          )
          .all(did, limit)
        return rows.map(r => rowToThread(r))
      }
      const mem = getFallbackMap()
      return [...mem.threads.values()]
        .filter(t => t.did === did)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit)
        .map(t => ({
          ...t,
          messageCount: (mem.messages.get(t.id) || []).length,
        }))
    },

    createThread({did, title, mode = 'ask', postContext = null}) {
      if (typeof store?.createQuantyThread === 'function') {
        return store.createQuantyThread({did, title, mode, postContext})
      }
      const id = `qth_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
      const now = new Date().toISOString()
      const cleanTitle = stripEmojis(title || 'New Quanty Thread').slice(0, 100) || 'New Quanty Thread'
      if (sqliteReady) {
        sqlite
          .prepare(
            `INSERT INTO quanty_threads (id, did, title, mode, post_context_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            did,
            cleanTitle,
            mode,
            postContext ? JSON.stringify(postContext) : null,
            now,
            now,
          )
        return {
          id,
          did,
          title: cleanTitle,
          mode,
          postContext,
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
        }
      }
      const mem = getFallbackMap()
      const thread = {
        id,
        did,
        title: cleanTitle,
        mode,
        postContext,
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      }
      mem.threads.set(id, thread)
      mem.messages.set(id, [])
      return thread
    },

    getThread(did, threadId) {
      if (typeof store?.getQuantyThread === 'function') {
        return store.getQuantyThread(did, threadId)
      }
      if (sqliteReady) {
        const row = sqlite
          .prepare(`SELECT * FROM quanty_threads WHERE id = ? AND did = ?`)
          .get(threadId, did)
        if (!row) return null
        const msgRows = sqlite
          .prepare(
            `SELECT * FROM quanty_messages WHERE thread_id = ? AND did = ? ORDER BY created_at ASC`,
          )
          .all(threadId, did)
        return {
          thread: rowToThread(row, msgRows.length),
          messages: msgRows.map(rowToMessage),
        }
      }
      const mem = getFallbackMap()
      const thread = mem.threads.get(threadId)
      if (!thread || thread.did !== did) return null
      const messages = mem.messages.get(threadId) || []
      return {
        thread: {...thread, messageCount: messages.length},
        messages: [...messages],
      }
    },

    appendMessage(did, threadId, msg) {
      if (typeof store?.appendQuantyThreadMessage === 'function') {
        return store.appendQuantyThreadMessage(did, threadId, msg)
      }
      const existing = this.getThread(did, threadId)
      if (!existing) return null
      const id = `qmsg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
      const now = new Date().toISOString()
      const role = msg.role === 'assistant' ? 'assistant' : 'user'
      const content = stripEmojis(msg.content || '').slice(0, 16000)
      const mode = msg.mode || existing.thread.mode || 'ask'
      const nextTitle =
        existing.thread.title === 'New Quanty Thread' && role === 'user' && content
          ? content.slice(0, 72)
          : existing.thread.title

      const record = {
        id,
        threadId,
        role,
        content,
        mode,
        origin: msg.origin || undefined,
        provider: msg.provider || undefined,
        model: msg.model || undefined,
        latencyMs:
          typeof msg.latencyMs === 'number' ? Math.round(msg.latencyMs) : undefined,
        citations: Array.isArray(msg.citations) ? msg.citations.slice(0, 12) : [],
        toolTraces: Array.isArray(msg.toolTraces) ? msg.toolTraces.slice(0, 12) : [],
        proposedActions: Array.isArray(msg.proposedActions)
          ? msg.proposedActions.slice(0, 6)
          : [],
        suggestedZingDraft: msg.suggestedZingDraft
          ? stripEmojis(msg.suggestedZingDraft).slice(0, 300)
          : undefined,
        createdAt: now,
      }

      if (sqliteReady) {
        sqlite
          .prepare(
            `INSERT INTO quanty_messages (
              id, thread_id, did, role, content, mode, origin, provider, model, latency_ms,
              citations_json, tool_traces_json, proposed_actions_json, suggested_zing_draft, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            record.id,
            threadId,
            did,
            record.role,
            record.content,
            record.mode,
            record.origin || null,
            record.provider || null,
            record.model || null,
            record.latencyMs ?? null,
            JSON.stringify(record.citations),
            JSON.stringify(record.toolTraces),
            JSON.stringify(record.proposedActions),
            record.suggestedZingDraft || null,
            record.createdAt,
          )
        sqlite
          .prepare(
            `UPDATE quanty_threads SET title = ?, mode = ?, updated_at = ? WHERE id = ? AND did = ?`,
          )
          .run(nextTitle, mode, now, threadId, did)
        return {
          message: record,
          thread: {
            ...existing.thread,
            title: nextTitle,
            mode,
            messageCount: existing.messages.length + 1,
            updatedAt: now,
          },
        }
      }

      const mem = getFallbackMap()
      const list = mem.messages.get(threadId) || []
      list.push(record)
      mem.messages.set(threadId, list)
      const updatedThread = {
        ...existing.thread,
        title: nextTitle,
        mode,
        messageCount: list.length,
        updatedAt: now,
      }
      mem.threads.set(threadId, updatedThread)
      return {message: record, thread: updatedThread}
    },

    deleteThread(did, threadId) {
      if (typeof store?.deleteQuantyThread === 'function') {
        return store.deleteQuantyThread(did, threadId)
      }
      if (sqliteReady) {
        const res = sqlite
          .prepare(`DELETE FROM quanty_threads WHERE id = ? AND did = ?`)
          .run(threadId, did)
        sqlite
          .prepare(`DELETE FROM quanty_messages WHERE thread_id = ? AND did = ?`)
          .run(threadId, did)
        return Number(res?.changes || 0) > 0
      }
      const mem = getFallbackMap()
      const existing = mem.threads.get(threadId)
      if (!existing || existing.did !== did) return false
      mem.threads.delete(threadId)
      mem.messages.delete(threadId)
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// Main Factory: createQuantyBridge(deps)
// ---------------------------------------------------------------------------

export function createQuantyBridge(deps = {}) {
  const helpers = deps.helpers || {}
  const threads = createThreadPersistence(deps)

  // Persistent fallback secret if db.jwtSecret is absent in isolated unit tests
  const fallbackSecret = crypto.randomBytes(32).toString('hex')
  const usedActionIds = new Map() // actionId -> usedTimestampMs
  const writeRateBuckets = new Map() // did -> number[] timestamps
  const healthCache = {checkedAt: 0, value: null}
  const walletCache = new Map() // did -> { checkedAt, balanceCredits }

  function getSigningSecret() {
    const db = deps.getDb?.()
    if (db?.jwtSecret && typeof db.jwtSecret === 'string') {
      return db.jwtSecret
    }
    if (process.env.QUANTZING_QUANTY_SECRET) {
      return process.env.QUANTZING_QUANTY_SECRET
    }
    return fallbackSecret
  }

  function getQuantOsUrls() {
    const cfg = helpers.quantOsUrls || {}
    return {
      aiUrl: String(cfg.aiUrl || DEFAULT_QUANT_AI_URL).replace(/\/+$/, ''),
      routerUrl: String(cfg.routerUrl || DEFAULT_QUANT_ROUTER_URL).replace(
        /\/+$/,
        '',
      ),
      payUrl: String(cfg.payUrl || DEFAULT_QUANT_PAY_URL).replace(/\/+$/, ''),
      internalApiKey:
        cfg.internalApiKey || process.env.QUANTOS_INTERNAL_TOKEN || '',
    }
  }

  function replyJson(res, status, payload) {
    if (typeof deps.sendJson === 'function') {
      deps.sendJson(res, status, payload)
      return
    }
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, X-Quant-Service-Token, X-Quant-Owner-Id',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    })
    res.end(body)
  }

  async function parseBody(req, maxBytes = 256 * 1024) {
    if (typeof deps.readJsonBody === 'function') {
      const parsed = await deps.readJsonBody(req, maxBytes)
      return parsed && typeof parsed === 'object' ? parsed : {}
    }
    return await new Promise((resolve, reject) => {
      let total = 0
      const chunks = []
      req.on('data', chunk => {
        total += chunk.length
        if (total > maxBytes) {
          reject(new Error('Payload too large'))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8').trim()
        if (!raw) return resolve({})
        try {
          resolve(JSON.parse(raw))
        } catch {
          resolve({})
        }
      })
      req.on('error', reject)
    })
  }

  function resolveAuth(req) {
    if (typeof deps.getAuth !== 'function') return null
    const raw = deps.getAuth(req)
    if (!raw || raw.error || !raw.did) return null
    return raw
  }

  function resolveOptionalViewerDid(req) {
    if (typeof deps.getOptionalViewerDid === 'function') {
      return deps.getOptionalViewerDid(req) || null
    }
    return resolveAuth(req)?.did || null
  }

  function checkEnforcement(did) {
    if (!did) return {allowed: false, status: 'guest', reason: 'Not signed in'}
    if (typeof deps.checkAccountEnforcement === 'function') {
      const res = deps.checkAccountEnforcement(did)
      if (res && typeof res.allowed === 'boolean') return res
    }
    return {allowed: true, status: 'active'}
  }

  function checkWriteRateLimit(did) {
    const now = Date.now()
    const list = (writeRateBuckets.get(did) || []).filter(
      ts => now - ts < WRITE_RATE_WINDOW_MS,
    )
    if (list.length >= WRITE_RATE_MAX_PER_WINDOW) {
      const oldest = list[0] || now
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((WRITE_RATE_WINDOW_MS - (now - oldest)) / 1000),
      )
      writeRateBuckets.set(did, list)
      return {allowed: false, retryAfterSeconds}
    }
    list.push(now)
    writeRateBuckets.set(did, list)
    return {allowed: true}
  }

  function pruneUsedActions() {
    const now = Date.now()
    if (usedActionIds.size < 200) return
    for (const [key, ts] of usedActionIds.entries()) {
      if (now - ts > USED_ACTION_RETENTION_MS) {
        usedActionIds.delete(key)
      }
    }
  }

  function signConfirmationToken({actionId, did, toolName, args, expiresAt}) {
    const material = [
      'qz-quanty-v2',
      actionId,
      did,
      toolName,
      canonicalJson(args),
      expiresAt,
    ].join('|')
    return crypto
      .createHmac('sha256', getSigningSecret())
      .update(material)
      .digest('hex')
  }

  function verifyConfirmationToken({
    actionId,
    did,
    toolName,
    args,
    expiresAt,
    confirmationToken,
  }) {
    if (
      typeof confirmationToken !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(confirmationToken)
    ) {
      return false
    }
    const expected = signConfirmationToken({
      actionId,
      did,
      toolName,
      args,
      expiresAt,
    })
    const actualBuf = Buffer.from(confirmationToken.toLowerCase(), 'utf8')
    const expectedBuf = Buffer.from(expected.toLowerCase(), 'utf8')
    if (actualBuf.length !== expectedBuf.length) return false
    return crypto.timingSafeEqual(actualBuf, expectedBuf)
  }

  function resolveToolDefinition(rawToolName) {
    const canonicalName = TOOL_ALIASES[rawToolName] || rawToolName
    const tool = TOOL_MAP.get(canonicalName) || AUXILIARY_TOOLS[canonicalName]
    return tool || null
  }

  // -------------------------------------------------------------------------
  // Cached QuantOS Health & Wallet Probes (1.5s timeout, 15s TTL)
  // -------------------------------------------------------------------------

  async function probeQuantOsHealth(viewerDid = null) {
    const now = Date.now()
    const urls = getQuantOsUrls()
    let baseHealth = healthCache.value

    if (!baseHealth || now - healthCache.checkedAt > HEALTH_CACHE_TTL_MS) {
      const [aiRes, routerRes, payRes] = await Promise.all([
        fetchJsonWithTimeout(`${urls.aiUrl}/health`, {}, HEALTH_PROBE_TIMEOUT_MS),
        fetchJsonWithTimeout(
          `${urls.routerUrl}/health`,
          {},
          HEALTH_PROBE_TIMEOUT_MS,
        ),
        fetchJsonWithTimeout(
          `${urls.payUrl}/health`,
          {},
          HEALTH_PROBE_TIMEOUT_MS,
        ),
      ])

      const isHealthy = r =>
        Boolean(
          r.ok &&
            !r.data?.offline &&
            (r.data?.ok === true || r.data?.status === 'ok' || r.status === 200),
        )

      baseHealth = {
        ai: {
          online: isHealthy(aiRes),
          baseUrl: urls.aiUrl,
          latencyMs: aiRes.latencyMs,
        },
        router: {
          online: isHealthy(routerRes),
          baseUrl: urls.routerUrl,
          latencyMs: routerRes.latencyMs,
          models: isHealthy(routerRes)
            ? ['quant/auto-fast', 'quant/auto-pro']
            : [],
        },
        pay: {
          online: isHealthy(payRes),
          baseUrl: urls.payUrl,
          latencyMs: payRes.latencyMs,
        },
      }
      healthCache.checkedAt = now
      healthCache.value = baseHealth
    }

    const result = {
      ai: {...baseHealth.ai},
      router: {...baseHealth.router},
      pay: {...baseHealth.pay},
    }

    if (result.pay.online && viewerDid) {
      const cached = walletCache.get(viewerDid)
      if (cached && now - cached.checkedAt < HEALTH_CACHE_TTL_MS) {
        if (typeof cached.balanceCredits === 'number') {
          result.pay.balanceCredits = cached.balanceCredits
        }
      } else {
        const w = await fetchJsonWithTimeout(
          `${urls.payUrl}/v1/wallets/${encodeURIComponent(viewerDid)}`,
          {headers: {accept: 'application/json'}},
          1200,
        )
        const bal =
          typeof w.data?.balanceCredits === 'number'
            ? w.data.balanceCredits
            : typeof w.data?.balance === 'number'
              ? w.data.balance
              : typeof w.data?.wallet?.balanceCredits === 'number'
                ? w.data.wallet.balanceCredits
                : undefined
        walletCache.set(viewerDid, {checkedAt: now, balanceCredits: bal})
        if (typeof bal === 'number') {
          result.pay.balanceCredits = bal
        }
      }
    }

    return result
  }

  // -------------------------------------------------------------------------
  // Validation, Target Resolution & Normalization for Write Tools
  // -------------------------------------------------------------------------

  function validateAndPrepareWriteTool(tool, rawArgs, auth) {
    const a = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}

    switch (tool.name) {
      case 'quantzing_publish_zing': {
        const text = stripEmojis(a.text || '')
        if (!text) {
          return {ok: false, status: 400, error: 'InvalidRequest', message: 'Zing text is required.'}
        }
        if (text.length > 300) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Zing text must be 300 characters or fewer.',
          }
        }
        const langs =
          Array.isArray(a.langs) && a.langs.length > 0
            ? a.langs.map(l => String(l).slice(0, 12))
            : ['en']
        const quoteUri = a.quoteUri ? String(a.quoteUri).trim() : undefined
        const normalized = {text, langs, ...(quoteUri ? {quoteUri} : {})}
        return {
          ok: true,
          normalized,
          title: 'Publish Zing',
          summary: `Publish new Zing: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
          resolvedTarget: {did: auth.did, handle: auth.handle || auth.account?.handle},
        }
      }

      case 'quantzing_reply_to_zing': {
        const postUri = String(a.postUri || '').trim()
        const text = stripEmojis(a.text || '')
        if (!postUri) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Target postUri is required to reply.',
          }
        }
        if (!text || text.length > 300) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Reply text must be between 1 and 300 characters.',
          }
        }
        const resolved = helpers.resolveAtUri?.(postUri)
        if (!resolved) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: 'Target Zing could not be found.',
          }
        }
        const targetAcc = helpers.findLocalAccount?.(resolved.did)
        const normalized = {postUri: resolved.canonicalUri || postUri, text}
        return {
          ok: true,
          normalized,
          title: 'Reply to Zing',
          summary: `Reply to @${targetAcc?.handle || resolved.did}: "${text.slice(0, 90)}${text.length > 90 ? '...' : ''}"`,
          resolvedTarget: {
            uri: normalized.postUri,
            did: resolved.did,
            handle: targetAcc?.handle || resolved.did,
          },
        }
      }

      case 'quantzing_send_dm': {
        const recipient = cleanHandle(a.recipient || a.target || '')
        const text = stripEmojis(a.text || a.message || '')
        if (!recipient) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Recipient handle or DID is required.',
          }
        }
        if (!text || text.length > 1000) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Direct message must be between 1 and 1000 characters.',
          }
        }
        const target = helpers.findLocalAccount?.(recipient)
        if (!target) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: `Account @${recipient} was not found on QuantZing.`,
          }
        }
        if (target.did === auth.did) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'You cannot send a Direct Message to yourself.',
          }
        }
        const normalized = {recipient: target.handle || recipient, text}
        return {
          ok: true,
          normalized,
          title: 'Send Direct Message',
          summary: `Send DM to @${target.handle}: "${text.slice(0, 90)}${text.length > 90 ? '...' : ''}"`,
          resolvedTarget: {
            did: target.did,
            handle: target.handle,
            displayName: target.profile?.displayName || target.displayName || target.handle,
          },
        }
      }

      case 'quantzing_publish_article': {
        const title = stripEmojis(a.title || '')
        const subtitle = stripEmojis(a.subtitle || '')
        const body = stripEmojis(a.body || '')
        const status = a.status === 'draft' ? 'draft' : 'published'
        const shareToFeed = Boolean(a.shareToFeed || a.shareAsZing)
        const tags = Array.isArray(a.tags)
          ? a.tags.map(t => stripEmojis(t).replace(/^#/, '').slice(0, 32)).filter(Boolean).slice(0, 8)
          : []
        const coverUrl = a.coverUrl ? String(a.coverUrl).trim().slice(0, 500) : undefined
        if (title.length < 2 || title.length > 180) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Article title must be between 2 and 180 characters.',
          }
        }
        if (body.length < 10) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Article body must be at least 10 characters.',
          }
        }
        const normalized = {
          title,
          ...(subtitle ? {subtitle} : {}),
          body,
          tags,
          ...(coverUrl ? {coverUrl} : {}),
          status,
          shareToFeed,
        }
        return {
          ok: true,
          normalized,
          title: status === 'draft' ? 'Save Article Draft' : 'Publish Sovereign Article',
          summary: `${status === 'draft' ? 'Save draft' : 'Publish article'} "${title}" (${body.length} chars)`,
          resolvedTarget: {did: auth.did, handle: auth.handle || auth.account?.handle},
        }
      }

      case 'quantzing_create_poll': {
        const text = stripEmojis(a.text || a.question || '')
        const rawOptions = Array.isArray(a.options)
          ? a.options
          : typeof a.options === 'string'
            ? a.options.split(/\r?\n|\|/).map(s => s.trim())
            : []
        const options = rawOptions
          .map(o => stripEmojis(o).slice(0, 80))
          .filter(Boolean)
          .slice(0, 4)
        const durationHours = clampInt(a.durationHours, 1, 168, 24)
        if (text.length < 2 || text.length > 300) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Poll question must be between 2 and 300 characters.',
          }
        }
        if (options.length < 2) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Polls require between 2 and 4 options.',
          }
        }
        const normalized = {text, options, durationHours}
        return {
          ok: true,
          normalized,
          title: 'Create Interactive Poll',
          summary: `Publish poll "${text.slice(0, 75)}" with ${options.length} options (${durationHours}h)`,
          resolvedTarget: {optionsCount: options.length, durationHours},
        }
      }

      case 'quantzing_create_space': {
        const title = stripEmojis(a.title || '')
        const topic = stripEmojis(a.topic || 'General Discussion')
        const scheduledFor = a.scheduledFor ? String(a.scheduledFor).trim() : undefined
        if (title.length < 3 || title.length > 140) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Space title must be between 3 and 140 characters.',
          }
        }
        const normalized = {
          title,
          topic,
          ...(scheduledFor ? {scheduledFor} : {}),
        }
        return {
          ok: true,
          normalized,
          title: scheduledFor ? 'Schedule ZingSpace' : 'Start Live ZingSpace',
          summary: `${scheduledFor ? 'Schedule' : 'Launch live'} ZingSpace "${title}" (${topic})`,
          resolvedTarget: {hostDid: auth.did, hostHandle: auth.handle || auth.account?.handle},
        }
      }

      case 'quantzing_create_list': {
        const name = stripEmojis(a.name || '')
        const description = stripEmojis(a.description || '')
        const purpose =
          a.purpose === 'modlist' ? 'modlist' : 'curatelist'
        const members = Array.isArray(a.members)
          ? a.members.map(cleanHandle).filter(Boolean).slice(0, 25)
          : []
        if (name.length < 2 || name.length > 64) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'List name must be between 2 and 64 characters.',
          }
        }
        const normalized = {
          name,
          ...(description ? {description} : {}),
          purpose,
          members,
        }
        return {
          ok: true,
          normalized,
          title: 'Create Curated List',
          summary: `Create ${purpose === 'modlist' ? 'moderation' : 'curated'} list "${name}"${members.length ? ` with ${members.length} members` : ''}`,
          resolvedTarget: {membersCount: members.length},
        }
      }

      case 'quantzing_follow_account': {
        const actor = cleanHandle(a.actor || '')
        const unfollow = Boolean(a.unfollow)
        if (!actor) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Target account handle or DID is required.',
          }
        }
        const target = helpers.findLocalAccount?.(actor)
        if (!target) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: `Account @${actor} was not found.`,
          }
        }
        if (target.did === auth.did) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'You cannot follow or unfollow your own account.',
          }
        }
        const normalized = {actor: target.handle || actor, unfollow}
        return {
          ok: true,
          normalized,
          title: unfollow ? 'Unfollow Account' : 'Follow Account',
          summary: `${unfollow ? 'Unfollow' : 'Follow'} @${target.handle}`,
          resolvedTarget: {
            did: target.did,
            handle: target.handle,
            displayName: target.profile?.displayName || target.displayName || target.handle,
          },
        }
      }

      case 'quantzing_bookmark_zing': {
        const postUri = String(a.postUri || '').trim()
        const remove = Boolean(a.remove)
        if (!postUri) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Target postUri is required to bookmark.',
          }
        }
        const resolved = helpers.resolveAtUri?.(postUri)
        if (!resolved) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: 'Target Zing was not found.',
          }
        }
        const normalized = {postUri: resolved.canonicalUri || postUri, remove}
        return {
          ok: true,
          normalized,
          title: remove ? 'Remove Bookmark' : 'Bookmark Zing',
          summary: `${remove ? 'Remove bookmark for' : 'Save bookmark for'} ${normalized.postUri}`,
          resolvedTarget: {uri: normalized.postUri, did: resolved.did},
        }
      }

      case 'quantzing_update_profile': {
        const hasName = typeof a.displayName === 'string' && a.displayName.trim().length > 0
        const hasDesc = typeof a.description === 'string'
        if (!hasName && !hasDesc) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Provide displayName and/or description to update your profile.',
          }
        }
        const displayName = hasName
          ? stripEmojis(a.displayName).slice(0, 64)
          : undefined
        const description = hasDesc
          ? stripEmojis(a.description).slice(0, 256)
          : undefined
        const normalized = {
          ...(displayName !== undefined ? {displayName} : {}),
          ...(description !== undefined ? {description} : {}),
        }
        return {
          ok: true,
          normalized,
          title: 'Update Profile',
          summary: `Update profile${displayName ? ` name to "${displayName}"` : ''}${description !== undefined ? ` bio (${description.length} chars)` : ''}`,
          resolvedTarget: {did: auth.did, handle: auth.handle || auth.account?.handle},
        }
      }

      case 'quantzing_moderate_account': {
        const actor = cleanHandle(a.actor || '')
        const action = String(a.action || 'mute').toLowerCase()
        if (!actor) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Target account handle or DID is required.',
          }
        }
        if (!['mute', 'unmute', 'block', 'unblock'].includes(action)) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Action must be mute, unmute, block, or unblock.',
          }
        }
        const target = helpers.findLocalAccount?.(actor)
        if (!target) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: `Account @${actor} was not found.`,
          }
        }
        if (target.did === auth.did) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'You cannot mute or block your own account.',
          }
        }
        const normalized = {actor: target.handle || actor, action}
        const verb = action.charAt(0).toUpperCase() + action.slice(1)
        return {
          ok: true,
          normalized,
          title: `${verb} Account`,
          summary: `${verb} @${target.handle} on QuantZing`,
          resolvedTarget: {
            did: target.did,
            handle: target.handle,
            displayName: target.profile?.displayName || target.displayName || target.handle,
          },
        }
      }

      case 'quantzing_like_zing': {
        const postUri = String(a.postUri || '').trim()
        const unlike = Boolean(a.unlike)
        const resolved = helpers.resolveAtUri?.(postUri)
        if (!resolved) {
          return {ok: false, status: 404, error: 'NotFound', message: 'Target Zing was not found.'}
        }
        const normalized = {postUri: resolved.canonicalUri || postUri, unlike}
        return {
          ok: true,
          normalized,
          title: unlike ? 'Remove Like' : 'Like Zing',
          summary: `${unlike ? 'Unlike' : 'Like'} ${normalized.postUri}`,
          resolvedTarget: {uri: normalized.postUri},
        }
      }

      case 'quantzing_rezing': {
        const postUri = String(a.postUri || '').trim()
        const unrezing = Boolean(a.unrezing)
        const resolved = helpers.resolveAtUri?.(postUri)
        if (!resolved) {
          return {ok: false, status: 404, error: 'NotFound', message: 'Target Zing was not found.'}
        }
        const normalized = {postUri: resolved.canonicalUri || postUri, unrezing}
        return {
          ok: true,
          normalized,
          title: unrezing ? 'Undo Rezing' : 'Rezing Post',
          summary: `${unrezing ? 'Remove Rezing on' : 'Rezing'} ${normalized.postUri}`,
          resolvedTarget: {uri: normalized.postUri},
        }
      }

      default:
        return {
          ok: false,
          status: 400,
          error: 'UnknownTool',
          message: `Unsupported write tool: ${tool.name}`,
        }
    }
  }

  // -------------------------------------------------------------------------
  // Read Tool Execution (In-Process Sovereign PDS Queries)
  // -------------------------------------------------------------------------

  async function executeReadTool(tool, rawArgs, {auth, viewerDid, origin}) {
    const started = Date.now()
    const a = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}

    if (tool.requiresAuth && !auth) {
      return {
        ok: false,
        status: 401,
        error: 'AuthenticationRequired',
        message: `Sign in to your QuantZing account to run ${tool.title}.`,
      }
    }

    switch (tool.name) {
      case 'quantzing_get_trends': {
        const limit = clampInt(a.limit, 1, 20, 8)
        const trendsRaw =
          (await helpers.computeSovereignTrends?.(viewerDid, origin, limit)) || []
        const trends = Array.isArray(trendsRaw)
          ? trendsRaw
          : trendsRaw.trends || []
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Loaded ${trends.length} live QuantZing trends`,
          data: {trends, count: trends.length},
        }
      }

      case 'quantzing_search_zings': {
        const query = stripEmojis(a.query || '')
        const author = a.author ? cleanHandle(a.author) : undefined
        const tag = a.tag ? stripEmojis(a.tag).replace(/^#/, '') : undefined
        const sort = a.sort === 'latest' ? 'latest' : 'top'
        const limit = clampInt(a.limit, 1, 25, 8)
        if (!query && !author && !tag) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Provide a search query, author, or tag.',
          }
        }
        const raw =
          (await helpers.searchLocalPosts?.({
            query,
            author,
            tag,
            sort,
            limit,
            viewerDid,
            origin,
          })) || []
        const posts = Array.isArray(raw) ? raw : raw.posts || []
        const citations = posts.map(postViewToCitation).filter(Boolean)
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Found ${posts.length} Zings matching "${query || tag || author}"`,
          data: {query, sort, posts, citations, count: posts.length},
        }
      }

      case 'quantzing_search_people': {
        const query = stripEmojis(a.query || '')
        const limit = clampInt(a.limit, 1, 25, 8)
        if (!query) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Search query is required to find people.',
          }
        }
        const raw =
          (await helpers.searchLocalActors?.({query, limit, viewerDid, origin})) || []
        const actors = Array.isArray(raw) ? raw : raw.actors || []
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Found ${actors.length} QuantZing accounts for "${query}"`,
          data: {query, actors, count: actors.length},
        }
      }

      case 'quantzing_get_thread': {
        const uri = String(a.uri || '').trim()
        if (!uri) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'A Zing AT-URI is required.',
          }
        }
        const resolved = helpers.resolveAtUri?.(uri)
        if (!resolved) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: 'Zing thread could not be found.',
          }
        }
        const hydrated =
          (await helpers.hydrateLocalPosts?.(
            [resolved.canonicalUri || uri],
            viewerDid,
            origin,
          )) || []
        const rootPost = Array.isArray(hydrated) ? hydrated[0] || null : null
        const viewCount = Number(
          helpers.getPostViewCount?.(resolved.canonicalUri || uri) ??
            rootPost?.viewCount ??
            0,
        )

        // Collect direct replies from live db if available
        const replies = []
        const db = deps.getDb?.()
        if (db?.records) {
          const canonical = resolved.canonicalUri || uri
          for (const [did, cols] of Object.entries(db.records)) {
            const postsCol = cols?.['app.bsky.feed.post']
            if (!postsCol) continue
            for (const [rkey, entry] of Object.entries(postsCol)) {
              const parentUri = entry?.value?.reply?.parent?.uri
              const rootUri = entry?.value?.reply?.root?.uri
              if (parentUri === canonical || rootUri === canonical) {
                const pv = helpers.buildLocalPostView?.(
                  did,
                  rkey,
                  entry,
                  viewerDid,
                  origin,
                )
                if (pv) replies.push(pv)
              }
            }
          }
        }
        replies.sort((x, y) =>
          String(y.indexedAt || '').localeCompare(String(x.indexedAt || '')),
        )
        const limitedReplies = replies.slice(0, 12)
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Loaded thread (${limitedReplies.length} replies, ${viewCount} views)`,
          data: {
            post: rootPost,
            viewCount,
            replies: limitedReplies,
            replyCount: limitedReplies.length,
          },
        }
      }

      case 'quantzing_get_profile': {
        const actorInput = cleanHandle(a.actor || '') || auth?.did || auth?.handle
        if (!actorInput) {
          return {
            ok: false,
            status: 400,
            error: 'InvalidRequest',
            message: 'Specify an account handle or sign in to inspect your own profile.',
          }
        }
        const acc = helpers.findLocalAccount?.(actorInput)
        if (!acc) {
          return {
            ok: false,
            status: 404,
            error: 'NotFound',
            message: `Account @${actorInput} was not found.`,
          }
        }
        const profile =
          helpers.buildLocalProfileView?.(acc, viewerDid, origin, true) || {
            did: acc.did,
            handle: acc.handle,
            displayName: acc.profile?.displayName || acc.handle,
            description: acc.profile?.description || '',
          }
        const recentRaw =
          (await helpers.searchLocalPosts?.({
            query: '',
            author: acc.handle,
            sort: 'latest',
            limit: 5,
            viewerDid,
            origin,
          })) || []
        const recentPosts = Array.isArray(recentRaw)
          ? recentRaw
          : recentRaw.posts || []
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Loaded profile @${profile.handle || acc.handle}`,
          data: {profile, recentPosts},
        }
      }

      case 'quantzing_get_user_analytics': {
        const windowDays = clampInt(a.windowDays, 1, 365, 30)
        const analytics = await helpers.getUserAnalytics?.(
          auth.did,
          windowDays,
          origin,
        )
        const totals = analytics?.totals || {
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          impressions: 0,
          likes: 0,
          rezings: 0,
          replies: 0,
          quotes: 0,
          bookmarks: 0,
          engagementRate: 0,
        }
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${windowDays}d analytics: ${totals.impressions} impressions, ${totals.postsCount} Zings, ${totals.followersCount} followers`,
          data: analytics || {windowDays, totals, daily: [], topPosts: []},
        }
      }

      case 'quantzing_get_notifications': {
        const limit = clampInt(a.limit, 1, 40, 15)
        const unreadOnly = Boolean(a.unreadOnly)
        const raw =
          (await helpers.buildLocalNotifications?.(auth.did, origin, limit)) || []
        let notifications = Array.isArray(raw) ? raw : raw.notifications || []
        const unreadCount = notifications.filter(n => !n.isRead).length
        if (unreadOnly) {
          notifications = notifications.filter(n => !n.isRead)
        }
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${notifications.length} notifications (${unreadCount} unread)`,
          data: {notifications, unreadCount, count: notifications.length},
        }
      }

      case 'quantzing_get_bookmarks': {
        const limit = clampInt(a.limit, 1, 40, 15)
        const db = deps.getDb?.()
        const rawList = Array.isArray(db?.bookmarks?.[auth.did])
          ? db.bookmarks[auth.did]
          : []
        const uris = rawList
          .slice(0, limit)
          .map(b => (typeof b === 'string' ? b : b?.uri || b?.subject?.uri))
          .filter(Boolean)
        const posts = uris.length
          ? (await helpers.hydrateLocalPosts?.(uris, auth.did, origin)) || []
          : []
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${posts.length} bookmarked Zings`,
          data: {bookmarks: posts, count: posts.length},
        }
      }

      case 'quantzing_list_convos': {
        const limit = clampInt(a.limit, 1, 30, 12)
        const raw = (await helpers.listUserConvos?.(auth.did, origin, limit)) || []
        const convos = Array.isArray(raw) ? raw : raw.convos || []
        const unreadTotal = convos.reduce(
          (sum, c) => sum + Number(c?.unreadCount || 0),
          0,
        )
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${convos.length} DM conversations (${unreadTotal} unread)`,
          data: {convos, unreadTotal, count: convos.length},
        }
      }

      case 'quantzing_list_lists': {
        const include = ['lists', 'spaces', 'articles', 'all'].includes(a.include)
          ? a.include
          : 'lists'
        const limit = clampInt(a.limit, 1, 30, 15)
        const actorInput = cleanHandle(a.actor || '') || auth?.did
        const targetAcc = actorInput ? helpers.findLocalAccount?.(actorInput) : null
        const db = deps.getDb?.()

        const lists = []
        if (include === 'lists' || include === 'all') {
          const reposToScan = targetAcc
            ? [[targetAcc.did, db?.records?.[targetAcc.did]]]
            : Object.entries(db?.records || {})
          for (const [did, cols] of reposToScan) {
            const listCol = cols?.['app.bsky.graph.list']
            if (!listCol) continue
            const ownerAcc = helpers.findLocalAccount?.(did)
            for (const [rkey, entry] of Object.entries(listCol)) {
              const val = entry?.value || entry || {}
              lists.push({
                uri: entry?.uri || `at://${did}/app.bsky.graph.list/${rkey}`,
                rkey,
                name: stripEmojis(val.name || 'Untitled List'),
                description: stripEmojis(val.description || ''),
                purpose: val.purpose || 'app.bsky.graph.defs#curatelist',
                creatorHandle: ownerAcc?.handle || did,
                createdAt: val.createdAt || entry?.indexedAt,
              })
            }
          }
        }

        let spaces = []
        if (include === 'spaces' || include === 'all') {
          const sp = (await helpers.listSpaces?.({status: 'all', limit})) || []
          spaces = Array.isArray(sp) ? sp : sp.spaces || []
        }

        let articles = []
        if (include === 'articles' || include === 'all') {
          const ar =
            (await helpers.listArticles?.({
              actor: targetAcc?.did,
              status: 'published',
              limit,
              viewerDid,
            })) || []
          articles = Array.isArray(ar) ? ar : ar.articles || []
        }

        const clippedLists = lists.slice(0, limit)
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary:
            include === 'spaces'
              ? `Loaded ${spaces.length} ZingSpaces`
              : include === 'articles'
                ? `Loaded ${articles.length} Sovereign Articles`
                : `Loaded ${clippedLists.length} curated lists`,
          data: {
            lists: clippedLists,
            ...(include === 'spaces' || include === 'all' ? {spaces} : {}),
            ...(include === 'articles' || include === 'all' ? {articles} : {}),
            count:
              include === 'spaces'
                ? spaces.length
                : include === 'articles'
                  ? articles.length
                  : clippedLists.length,
          },
        }
      }

      case 'quantzing_get_spaces': {
        const limit = clampInt(a.limit, 1, 30, 12)
        const status = a.status || 'all'
        const raw = (await helpers.listSpaces?.({status, limit})) || []
        const spaces = Array.isArray(raw) ? raw : raw.spaces || []
        const liveCount = spaces.filter(s => s.status === 'live').length
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${spaces.length} ZingSpaces (${liveCount} live)`,
          data: {spaces, liveCount, count: spaces.length},
        }
      }

      case 'quantzing_get_articles': {
        const limit = clampInt(a.limit, 1, 30, 12)
        const actor = a.actor ? cleanHandle(a.actor) : undefined
        const status = a.status || 'published'
        const raw =
          (await helpers.listArticles?.({actor, status, limit, viewerDid})) || []
        const articles = Array.isArray(raw) ? raw : raw.articles || []
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `${articles.length} Sovereign Articles`,
          data: {articles, count: articles.length},
        }
      }

      case 'quantzing_quantos_status': {
        const quantos = await probeQuantOsHealth(viewerDid)
        const modeLabel = quantos.ai.online
          ? 'QuantAI Live'
          : quantos.router.online
            ? 'QuantRouter Live'
            : 'Live Sovereign Network'
        return {
          ok: true,
          status: 'EXECUTED',
          toolName: tool.name,
          category: 'read',
          executedAt: new Date().toISOString(),
          latencyMs: Date.now() - started,
          summary: `Engine status: ${modeLabel}`,
          data: {modeLabel, quantos},
        }
      }

      default:
        return {
          ok: false,
          status: 400,
          error: 'UnknownTool',
          message: `Unknown read tool: ${tool.name}`,
        }
    }
  }

  // -------------------------------------------------------------------------
  // Write Tool Mutation Execution (ONLY after 2-Phase HMAC Verification!)
  // -------------------------------------------------------------------------

  async function runConfirmedWriteMutation(tool, args, {auth, origin}) {
    const started = Date.now()
    const handle = auth.handle || auth.account?.handle || auth.did

    switch (tool.name) {
      case 'quantzing_publish_zing': {
        const createdAt = new Date().toISOString()
        const record = {
          $type: 'app.bsky.feed.post',
          text: args.text,
          langs: args.langs || ['en'],
          createdAt,
        }
        if (args.quoteUri) {
          const qResolved = helpers.resolveAtUri?.(args.quoteUri)
          const qPosts = qResolved
            ? (await helpers.hydrateLocalPosts?.(
                [qResolved.canonicalUri || args.quoteUri],
                auth.did,
                origin,
              )) || []
            : []
          const qCid = qPosts[0]?.cid
          if (qResolved && qCid) {
            record.embed = {
              $type: 'app.bsky.embed.record',
              record: {uri: qResolved.canonicalUri || args.quoteUri, cid: qCid},
            }
          }
        }
        const putRes = await helpers.putLocalRecord?.(
          auth.did,
          'app.bsky.feed.post',
          undefined,
          record,
        )
        const uri = putRes?.uri || `at://${auth.did}/app.bsky.feed.post/${putRes?.rkey || ''}`
        const rkey = putRes?.rkey || uri.split('/').pop() || ''
        return {
          summary: `Published Zing on @${handle}`,
          data: {uri, cid: putRes?.cid, rkey, text: args.text, createdAt},
          target: uri,
          navigationHint: {
            screen: 'PostThread',
            params: {name: handle, rkey},
            label: 'View Zing',
          },
          invalidateKeys: ['post-feed', 'profile', 'author-feed'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_reply_to_zing': {
        const resolved = helpers.resolveAtUri?.(args.postUri)
        const hydrated =
          (await helpers.hydrateLocalPosts?.(
            [resolved?.canonicalUri || args.postUri],
            auth.did,
            origin,
          )) || []
        const parentView = hydrated[0]
        const parentCid = parentView?.cid || 'bafyreiquantzingparent000000000000'
        const parentUri = resolved?.canonicalUri || args.postUri
        const existingRoot = parentView?.record?.reply?.root
        const rootRef =
          existingRoot?.uri && existingRoot?.cid
            ? {uri: existingRoot.uri, cid: existingRoot.cid}
            : {uri: parentUri, cid: parentCid}
        const createdAt = new Date().toISOString()
        const record = {
          $type: 'app.bsky.feed.post',
          text: args.text,
          langs: ['en'],
          reply: {
            root: rootRef,
            parent: {uri: parentUri, cid: parentCid},
          },
          createdAt,
        }
        const putRes = await helpers.putLocalRecord?.(
          auth.did,
          'app.bsky.feed.post',
          undefined,
          record,
        )
        const uri = putRes?.uri || `at://${auth.did}/app.bsky.feed.post/${putRes?.rkey || ''}`
        const rkey = putRes?.rkey || uri.split('/').pop() || ''
        return {
          summary: `Posted reply on thread`,
          data: {uri, cid: putRes?.cid, rkey, parentUri, text: args.text, createdAt},
          target: parentUri,
          navigationHint: {
            screen: 'PostThread',
            params: {name: handle, rkey},
            label: 'View Reply',
          },
          invalidateKeys: ['post-thread', 'post-feed', 'post'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_send_dm': {
        const dmRes = await helpers.sendLocalDm?.({
          senderDid: auth.did,
          targetHandleOrDid: args.recipient,
          text: args.text,
          origin,
        })
        const convoId = dmRes?.convoId || dmRes?.convo?.id || ''
        return {
          summary: `Sent Direct Message to @${args.recipient}`,
          data: dmRes || {recipient: args.recipient, text: args.text},
          target: args.recipient,
          navigationHint: convoId
            ? {
                screen: 'MessagesConversation',
                params: {conversation: convoId},
                label: 'Open DM',
              }
            : {
                screen: 'MessagesInbox',
                params: {},
                label: 'Open Messages',
              },
          invalidateKeys: ['convo-list', 'convo', 'unread-counts'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_publish_article': {
        const artRes = await helpers.upsertArticle?.({
          authorDid: auth.did,
          title: args.title,
          subtitle: args.subtitle || '',
          body: args.body,
          tags: args.tags || [],
          coverUrl: args.coverUrl,
          status: args.status || 'published',
        })
        const article = artRes?.article || artRes
        let postUri
        if (args.shareToFeed && (args.status || 'published') === 'published') {
          const teaser = stripEmojis(
            `New Sovereign Article: ${args.title}${args.subtitle ? ` — ${args.subtitle}` : ''}`,
          ).slice(0, 290)
          const postPut = await helpers.putLocalRecord?.(
            auth.did,
            'app.bsky.feed.post',
            undefined,
            {
              $type: 'app.bsky.feed.post',
              text: teaser,
              langs: ['en'],
              createdAt: new Date().toISOString(),
            },
          )
          postUri = postPut?.uri
        }
        return {
          summary:
            args.status === 'draft'
              ? `Saved article draft "${args.title}"`
              : `Published Sovereign Article "${args.title}"`,
          data: {article, ...(postUri ? {postUri} : {})},
          target: article?.uri || article?.id || args.title,
          navigationHint: {
            screen: 'Articles',
            params: {},
            label: 'Open Articles',
          },
          invalidateKeys: ['articles', 'post-feed'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_create_poll': {
        const pollRes = await helpers.createPollPost?.({
          authorDid: auth.did,
          text: args.text,
          options: args.options,
          durationHours: args.durationHours || 24,
        })
        const uri = pollRes?.uri || pollRes?.post?.uri || ''
        const rkey = pollRes?.rkey || uri.split('/').pop() || ''
        return {
          summary: `Published interactive poll "${args.text.slice(0, 60)}"`,
          data: pollRes || {text: args.text, options: args.options},
          target: uri || args.text,
          navigationHint: rkey
            ? {
                screen: 'PostThread',
                params: {name: handle, rkey},
                label: 'View Poll',
              }
            : {screen: 'Home', params: {}, label: 'Open Feed'},
          invalidateKeys: ['post-feed', 'profile', 'polls'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_create_space': {
        const spRes = await helpers.createSpace?.({
          hostDid: auth.did,
          title: args.title,
          topic: args.topic || 'General Discussion',
          scheduledFor: args.scheduledFor,
        })
        const space = spRes?.space || spRes
        return {
          summary: `Created ZingSpace "${args.title}"`,
          data: {space},
          target: space?.slug || space?.id || args.title,
          navigationHint: {
            screen: 'ZingSpaces',
            params: {},
            label: 'Open ZingSpace',
          },
          invalidateKeys: ['spaces', 'live-events'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_create_list': {
        const purposeUri =
          args.purpose === 'modlist'
            ? 'app.bsky.graph.defs#modlist'
            : 'app.bsky.graph.defs#curatelist'
        const listRes = await helpers.createLocalList?.({
          authorDid: auth.did,
          name: args.name,
          purpose: purposeUri,
          description: args.description || '',
        })
        const listUri = listRes?.uri || listRes?.list?.uri || ''
        const rkey = listRes?.rkey || listUri.split('/').pop() || ''
        const addedMembers = []
        if (listUri && Array.isArray(args.members)) {
          for (const m of args.members) {
            const acc = helpers.findLocalAccount?.(m)
            if (acc?.did) {
              await helpers.addListMember?.({
                authorDid: auth.did,
                listUri,
                subjectDid: acc.did,
              })
              addedMembers.push(acc.handle || acc.did)
            }
          }
        }
        return {
          summary: `Created list "${args.name}"${addedMembers.length ? ` (+${addedMembers.length} members)` : ''}`,
          data: {uri: listUri, rkey, name: args.name, addedMembers},
          target: listUri || args.name,
          navigationHint: rkey
            ? {
                screen: 'ProfileList',
                params: {name: handle, rkey},
                label: 'Open List',
              }
            : {screen: 'Lists', params: {}, label: 'Open Lists'},
          invalidateKeys: ['my-lists', 'list', 'profile-lists'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_follow_account': {
        const target = helpers.findLocalAccount?.(args.actor)
        if (!target) throw new Error(`Account @${args.actor} not found`)
        const res = await helpers.toggleFollow?.({
          viewerDid: auth.did,
          targetDid: target.did,
          follow: !args.unfollow,
        })
        return {
          summary: `${args.unfollow ? 'Unfollowed' : 'Followed'} @${target.handle}`,
          data: {targetDid: target.did, handle: target.handle, following: !args.unfollow, ...(res || {})},
          target: target.did,
          navigationHint: {
            screen: 'Profile',
            params: {name: target.handle},
            label: 'View Profile',
          },
          invalidateKeys: ['profile', 'post-feed', 'profile-follows'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_bookmark_zing': {
        const hydrated =
          (await helpers.hydrateLocalPosts?.([args.postUri], auth.did, origin)) ||
          []
        const cid = hydrated[0]?.cid || ''
        const res = await helpers.toggleBookmark?.({
          viewerDid: auth.did,
          uri: args.postUri,
          cid,
          bookmarked: !args.remove,
        })
        return {
          summary: args.remove ? 'Removed Zing from bookmarks' : 'Saved Zing to bookmarks',
          data: {uri: args.postUri, bookmarked: !args.remove, ...(res || {})},
          target: args.postUri,
          navigationHint: {
            screen: 'Bookmarks',
            params: {},
            label: 'View Bookmarks',
          },
          invalidateKeys: ['bookmarks', 'post-feed', 'post'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_update_profile': {
        const res = await helpers.updateProfile?.({
          did: auth.did,
          displayName: args.displayName,
          description: args.description,
        })
        return {
          summary: `Updated profile for @${handle}`,
          data: res || {did: auth.did, ...args},
          target: auth.did,
          navigationHint: {
            screen: 'Profile',
            params: {name: handle},
            label: 'View Profile',
          },
          invalidateKeys: ['profile', 'profiles'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_moderate_account': {
        const target = helpers.findLocalAccount?.(args.actor)
        if (!target) throw new Error(`Account @${args.actor} not found`)
        let res
        if (args.action === 'mute' || args.action === 'unmute') {
          res = await helpers.toggleMuteActor?.({
            viewerDid: auth.did,
            targetDid: target.did,
            muted: args.action === 'mute',
          })
        } else {
          res = await helpers.toggleBlockActor?.({
            viewerDid: auth.did,
            targetDid: target.did,
            blocked: args.action === 'block',
          })
        }
        const verb = args.action.charAt(0).toUpperCase() + args.action.slice(1)
        return {
          summary: `Applied ${verb} to @${target.handle}`,
          data: {targetDid: target.did, handle: target.handle, action: args.action, ...(res || {})},
          target: target.did,
          navigationHint: {
            screen: 'Profile',
            params: {name: target.handle},
            label: 'View Account',
          },
          invalidateKeys: ['profile', 'post-feed', 'mutes', 'blocks'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_like_zing': {
        const hydrated =
          (await helpers.hydrateLocalPosts?.([args.postUri], auth.did, origin)) ||
          []
        const cid = hydrated[0]?.cid || ''
        const res = await helpers.toggleLike?.({
          viewerDid: auth.did,
          subjectUri: args.postUri,
          subjectCid: cid,
          like: !args.unlike,
        })
        return {
          summary: args.unlike ? 'Removed like from Zing' : 'Liked Zing',
          data: {uri: args.postUri, liked: !args.unlike, ...(res || {})},
          target: args.postUri,
          invalidateKeys: ['post-feed', 'post', 'post-thread'],
          latencyMs: Date.now() - started,
        }
      }

      case 'quantzing_rezing': {
        const hydrated =
          (await helpers.hydrateLocalPosts?.([args.postUri], auth.did, origin)) ||
          []
        const cid = hydrated[0]?.cid || ''
        const res = await helpers.toggleRepost?.({
          viewerDid: auth.did,
          subjectUri: args.postUri,
          subjectCid: cid,
          repost: !args.unrezing,
        })
        return {
          summary: args.unrezing ? 'Removed Rezing' : 'Rezinged post',
          data: {uri: args.postUri, rezinged: !args.unrezing, ...(res || {})},
          target: args.postUri,
          invalidateKeys: ['post-feed', 'post', 'post-thread'],
          latencyMs: Date.now() - started,
        }
      }

      default:
        throw new Error(`Unsupported write mutation: ${tool.name}`)
    }
  }

  // -------------------------------------------------------------------------
  // Unified Tool Execution (Read + 2-Phase Fail-Closed Write Gate)
  // -------------------------------------------------------------------------

  async function executeTool(
    rawToolName,
    rawArgs,
    {
      auth = null,
      viewerDid = null,
      origin = '',
      mode = undefined,
      confirmed = false,
      actionId = undefined,
      confirmationToken = undefined,
      expiresAt = undefined,
      serviceAuthorized = false,
      approvalGrantId = undefined,
    } = {},
  ) {
    const tool = resolveToolDefinition(rawToolName)
    if (!tool) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          error: 'UnknownTool',
          message: `Tool "${rawToolName}" is not registered on QuantZing.`,
        },
      }
    }

    // Read tool path
    if (tool.category === 'read') {
      const readRes = await executeReadTool(tool, rawArgs, {
        auth,
        viewerDid: auth?.did || viewerDid || null,
        origin,
      })
      if (!readRes.ok) {
        return {
          httpStatus: readRes.status || 400,
          body: {
            ok: false,
            error: readRes.error || 'ToolError',
            message: readRes.message || 'Tool execution failed.',
          },
        }
      }
      return {httpStatus: 200, body: readRes}
    }

    // Write / Destructive tool path -> Strict Auth + Enforcement + 2-Phase HMAC Gate
    if (!auth) {
      return {
        httpStatus: 401,
        body: {
          ok: false,
          error: 'AuthenticationRequired',
          message: `Sign in to your QuantZing account to run ${tool.title}.`,
        },
      }
    }

    const enforcement = checkEnforcement(auth.did)
    if (!enforcement.allowed) {
      return {
        httpStatus: 403,
        body: {
          ok: false,
          error: 'AccountRestricted',
          message:
            enforcement.reason ||
            `Account status "${enforcement.status}" cannot execute write actions.`,
          details: {status: enforcement.status},
        },
      }
    }

    const prepared = validateAndPrepareWriteTool(tool, rawArgs, auth)
    if (!prepared.ok) {
      return {
        httpStatus: prepared.status || 400,
        body: {
          ok: false,
          error: prepared.error || 'InvalidRequest',
          message: prepared.message,
        },
      }
    }

    // Phase 1: Preview / Proposal (default when confirmed !== true or mode === 'preview')
    const isPhase2 =
      confirmed === true && mode !== 'preview' && (!serviceAuthorized || Boolean(approvalGrantId || confirmationToken))
    if (!isPhase2) {
      const nextActionId = `qact_${crypto.randomUUID()}`
      const nextExpiresAt = new Date(
        Date.now() + CONFIRMATION_TTL_MS,
      ).toISOString()
      const token = signConfirmationToken({
        actionId: nextActionId,
        did: auth.did,
        toolName: tool.name,
        args: prepared.normalized,
        expiresAt: nextExpiresAt,
      })

      return {
        httpStatus: 202,
        body: {
          ok: true,
          status: 'PENDING_CONFIRMATION',
          actionCard: {
            actionId: nextActionId,
            toolName: tool.name,
            category: tool.category,
            title: prepared.title,
            summary: prepared.summary,
            arguments: prepared.normalized,
            args: prepared.normalized,
            resolvedTarget: prepared.resolvedTarget,
            editableFields: tool.editableFields || [],
            expiresAt: nextExpiresAt,
            confirmationToken: token,
          },
        },
      }
    }

    // Phase 2: Fail-Closed Cryptographic Verification
    if (!actionId || !confirmationToken || !expiresAt) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          error: 'MissingConfirmationToken',
          message:
            'Confirmed write actions require actionId, confirmationToken, and expiresAt from Phase 1 preview.',
        },
      }
    }

    const expiryMs = Date.parse(String(expiresAt))
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      return {
        httpStatus: 410,
        body: {
          ok: false,
          error: 'ActionExpired',
          message:
            'This action confirmation has expired. Preview the action again to confirm.',
        },
      }
    }

    pruneUsedActions()
    if (usedActionIds.has(actionId)) {
      return {
        httpStatus: 409,
        body: {
          ok: false,
          error: 'ActionAlreadyExecuted',
          message:
            'This confirmation token was already executed and cannot be replayed.',
        },
      }
    }

    const validSig = verifyConfirmationToken({
      actionId,
      did: auth.did,
      toolName: tool.name,
      args: prepared.normalized,
      expiresAt: String(expiresAt),
      confirmationToken,
    })
    if (!validSig) {
      return {
        httpStatus: 403,
        body: {
          ok: false,
          error: 'InvalidConfirmationToken',
          message:
            'Confirmation signature failed verification (token mismatch, cross-account misuse, or modified arguments). Please preview again.',
        },
      }
    }

    const rate = checkWriteRateLimit(auth.did)
    if (!rate.allowed) {
      return {
        httpStatus: 429,
        body: {
          ok: false,
          error: 'RateLimitExceeded',
          message: 'Too many Quanty write actions. Please wait a moment.',
          details: {retryAfterSeconds: rate.retryAfterSeconds},
        },
      }
    }

    // Re-check account enforcement immediately prior to mutation
    const recheck = checkEnforcement(auth.did)
    if (!recheck.allowed) {
      return {
        httpStatus: 403,
        body: {
          ok: false,
          error: 'AccountRestricted',
          message: recheck.reason || 'Account is restricted from write actions.',
        },
      }
    }

    // Mark single-use BEFORE executing to eliminate concurrent double-spend/replay races
    usedActionIds.set(actionId, Date.now())

    try {
      const execResult = await runConfirmedWriteMutation(
        tool,
        prepared.normalized,
        {auth, origin},
      )

      await helpers.recordAuditEvent?.({
        actorDid: auth.did,
        action: `quanty.tool.${tool.name}`,
        target: execResult.target || auth.did,
        metadata: {
          actionId,
          category: tool.category,
          summary: execResult.summary,
        },
      })

      return {
        httpStatus: 200,
        body: {
          ok: true,
          status: 'EXECUTED',
          actionId,
          toolName: tool.name,
          category: tool.category,
          executedAt: new Date().toISOString(),
          latencyMs: execResult.latencyMs,
          summary: execResult.summary,
          data: execResult.data,
          ...(execResult.navigationHint
            ? {navigationHint: execResult.navigationHint}
            : {}),
          invalidateKeys: execResult.invalidateKeys || [],
        },
      }
    } catch (err) {
      return {
        httpStatus: 500,
        body: {
          ok: false,
          error: 'ExecutionFailed',
          message:
            err instanceof Error
              ? err.message
              : 'Action execution failed on Sovereign PDS.',
        },
      }
    }
  }

  // -------------------------------------------------------------------------
  // Multi-Provider LLM Reasoning Cascade (QuantAI -> QuantRouter -> Gemini -> Groq -> OpenRouter/OpenAI -> Ollama)
  // -------------------------------------------------------------------------

  async function callQuantOsReasoning({
    prompt,
    mode,
    viewerDid,
    history,
    groundingBlock,
    allowToolProposals = true,
    timeoutMs = AI_CALL_TIMEOUT_MS,
  }) {
    loadOptionalQuantyEnvOnce()
    const urls = getQuantOsUrls()
    const model = getValidQuantOsModel(mode)
    const ownerId = viewerDid || 'quantzing-guest'
    const quantos = await probeQuantOsHealth(viewerDid)

    const systemPrompt = [
      'You are Quanty, the sharp, witty, and genuinely helpful AI assistant built into QuantZing.',
      'Write naturally, clearly, and directly like a world-class conversational AI. Use concise markdown when helpful, stay factual, and never use emojis.',
      'Never use robotic boilerplate or mention Bluesky or other third-party social networks.',
      allowToolProposals
        ? 'You never execute account write actions on your own. If the user asks to publish a Zing, reply, send a DM, publish an article, create a poll, host a Space, create a list, follow/unfollow, bookmark, update bio, or mute/block, explain the draft briefly and append a fenced ```quanty-actions JSON array [{"toolName":"...","arguments":{...}}].'
        : 'Keep your reply concise, sharp, and strictly under 260 characters.',
      groundingBlock ? `\nLIVE CONTEXT:\n${groundingBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const recentHistory = (Array.isArray(history) ? history.slice(-6) : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({role: m.role, content: String(m.content).slice(0, 1200)}))

    const chatMessages = [
      {role: 'system', content: systemPrompt},
      ...recentHistory,
      {role: 'user', content: prompt},
    ]

    const maxTokens = allowToolProposals
      ? mode === 'deepsearch'
        ? 950
        : 600
      : 180
    const cloudTimeoutMs = allowToolProposals ? Math.max(timeoutMs, 10_000) : timeoutMs

    // Tier 1: quant-ai (/v1/agent/reason)
    if (quantos.ai.online) {
      const aiRes = await fetchJsonWithTimeout(
        `${urls.aiUrl}/v1/agent/reason`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
            'x-quant-owner-id': ownerId,
          },
          body: JSON.stringify({
            ownerId,
            model,
            messages: chatMessages,
            includeMemoryContext: true,
            includeSkillContext: true,
            maxTokens,
          }),
        },
        timeoutMs,
      )
      const content = stripEmojis(
        aiRes.data?.content ||
          aiRes.data?.completion ||
          aiRes.data?.choices?.[0]?.message?.content ||
          '',
      )
      if (aiRes.ok && content) {
        return {
          ok: true,
          origin: 'quant-ai',
          content,
          model: aiRes.data?.model || model,
          provider: aiRes.data?.routing?.provider || 'quant-ai',
          billingMode: aiRes.data?.routing?.billingMode || undefined,
          latencyMs: aiRes.latencyMs,
        }
      }
    }

    // Tier 2: quant-router (/v1/chat/completions) — strictly valid model
    if (quantos.router.online) {
      const routerRes = await fetchJsonWithTimeout(
        `${urls.routerUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
            'x-quant-owner-id': ownerId,
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            max_tokens: maxTokens,
          }),
        },
        timeoutMs,
      )
      const content = stripEmojis(
        routerRes.data?.choices?.[0]?.message?.content ||
          routerRes.data?.content ||
          '',
      )
      if (routerRes.ok && content) {
        return {
          ok: true,
          origin: 'quant-router',
          content,
          model: routerRes.data?.model || model,
          provider: routerRes.data?.provider || 'quant-router',
          billingMode: routerRes.data?.billingMode || undefined,
          latencyMs: routerRes.latencyMs,
        }
      }
    }

    // Tier 3: Google Gemini (GEMINI_API_KEY -> gemini-2.5-flash)
    const geminiKey = String(process.env.GEMINI_API_KEY || '').trim()
    if (geminiKey) {
      const geminiModel = String(
        process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      ).trim()
      const geminiContents = [
        ...recentHistory.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{text: m.content}],
        })),
        {role: 'user', parts: [{text: prompt}]},
      ]
      const geminiRes = await fetchJsonWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', accept: 'application/json'},
          body: JSON.stringify({
            systemInstruction: {parts: [{text: systemPrompt}]},
            contents: geminiContents,
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: mode === 'drafter' ? 0.8 : 0.6,
            },
          }),
        },
        cloudTimeoutMs,
      )
      const parts = geminiRes.data?.candidates?.[0]?.content?.parts
      const rawContent = Array.isArray(parts)
        ? parts.map(p => p?.text || '').join('')
        : ''
      const content = stripEmojis(rawContent)
      if (geminiRes.ok && content) {
        return {
          ok: true,
          origin: 'gemini',
          content,
          model: geminiModel,
          provider: 'google-gemini',
          latencyMs: geminiRes.latencyMs,
        }
      }
    }

    // Tier 4: Groq OpenAI-compatible (GROQ_API_KEY -> llama-3.3-70b-versatile)
    const groqKey = String(process.env.GROQ_API_KEY || '').trim()
    if (groqKey) {
      const groqModel = String(
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      ).trim()
      const groqRes = await fetchJsonWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: groqModel,
            messages: chatMessages,
            max_tokens: maxTokens,
            temperature: mode === 'drafter' ? 0.8 : 0.6,
          }),
        },
        cloudTimeoutMs,
      )
      const content = stripEmojis(
        groqRes.data?.choices?.[0]?.message?.content || '',
      )
      if (groqRes.ok && content) {
        return {
          ok: true,
          origin: 'groq',
          content,
          model: groqRes.data?.model || groqModel,
          provider: 'groq',
          latencyMs: groqRes.latencyMs,
        }
      }
    }

    // Tier 5: OpenRouter or OpenAI compatible endpoint
    const openRouterKey = String(process.env.OPENROUTER_API_KEY || '').trim()
    const openAiKey = String(process.env.OPENAI_API_KEY || '').trim()
    if (openRouterKey || openAiKey) {
      const isOpenRouter = Boolean(openRouterKey)
      const apiKey = isOpenRouter ? openRouterKey : openAiKey
      const endpoint = isOpenRouter
        ? String(
            process.env.OPENROUTER_BASE_URL ||
              'https://openrouter.ai/api/v1/chat/completions',
          ).trim()
        : `${String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`
      const targetModel = isOpenRouter
        ? String(process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash').trim()
        : String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
      const reqHeaders = {
        'Content-Type': 'application/json',
        accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
      if (isOpenRouter) {
        reqHeaders['HTTP-Referer'] = 'https://quantzing.quantrinity.in'
        reqHeaders['X-Title'] = 'QuantZing Quanty'
      }
      const oaiRes = await fetchJsonWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({
            model: targetModel,
            messages: chatMessages,
            max_tokens: maxTokens,
            temperature: mode === 'drafter' ? 0.8 : 0.6,
          }),
        },
        cloudTimeoutMs,
      )
      const content = stripEmojis(
        oaiRes.data?.choices?.[0]?.message?.content || '',
      )
      if (oaiRes.ok && content) {
        return {
          ok: true,
          origin: isOpenRouter ? 'openrouter' : 'openai',
          content,
          model: oaiRes.data?.model || targetModel,
          provider: isOpenRouter ? 'openrouter' : 'openai',
          latencyMs: oaiRes.latencyMs,
        }
      }
    }

    // Tier 6: Local / Self-Hosted Ollama (OLLAMA_URL -> /api/chat)
    const ollamaUrl = String(process.env.OLLAMA_URL || '')
      .trim()
      .replace(/\/+$/, '')
    if (ollamaUrl) {
      const ollamaModel = String(process.env.OLLAMA_MODEL || 'llama3.2').trim()
      const ollamaRes = await fetchJsonWithTimeout(
        `${ollamaUrl}/api/chat`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', accept: 'application/json'},
          body: JSON.stringify({
            model: ollamaModel,
            messages: chatMessages,
            stream: false,
          }),
        },
        cloudTimeoutMs,
      )
      const content = stripEmojis(
        ollamaRes.data?.message?.content || ollamaRes.data?.response || '',
      )
      if (ollamaRes.ok && content) {
        return {
          ok: true,
          origin: 'ollama',
          content,
          model: ollamaRes.data?.model || ollamaModel,
          provider: 'ollama',
          latencyMs: ollamaRes.latencyMs,
        }
      }
    }

    return {ok: false, origin: 'live-network'}
  }

  // -------------------------------------------------------------------------
  // Stage 1 Deterministic Slash Command + Natural Language Intent Router
  // -------------------------------------------------------------------------

  function parseIntent(prompt, mode, postContext) {
    const trimmed = stripEmojis(prompt || '').trim()
    const readCalls = []
    const writeProposals = []
    let isExplicitSlash = false

    if (trimmed.startsWith('/')) {
      isExplicitSlash = true
      const spaceIdx = trimmed.indexOf(' ')
      const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
      const rest = (spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)).trim()

      switch (cmd) {
        case '/trends':
          readCalls.push({
            toolName: 'quantzing_get_trends',
            arguments: {limit: clampInt(rest, 1, 20, 8)},
          })
          break
        case '/search':
          readCalls.push({
            toolName: 'quantzing_search_zings',
            arguments: {query: rest || 'QuantZing', sort: 'top', limit: 8},
          })
          break
        case '/people':
          readCalls.push({
            toolName: 'quantzing_search_people',
            arguments: {query: rest || 'quantzing', limit: 8},
          })
          break
        case '/thread':
          readCalls.push({
            toolName: 'quantzing_get_thread',
            arguments: {uri: rest || postContext?.uri || ''},
          })
          break
        case '/profile':
          readCalls.push({
            toolName: 'quantzing_get_profile',
            arguments: rest ? {actor: cleanHandle(rest)} : {},
          })
          break
        case '/analytics':
          readCalls.push({
            toolName: 'quantzing_get_user_analytics',
            arguments: {windowDays: clampInt(rest, 1, 365, 30)},
          })
          break
        case '/notifications':
          readCalls.push({
            toolName: 'quantzing_get_notifications',
            arguments: {limit: clampInt(rest, 1, 40, 15)},
          })
          break
        case '/bookmarks':
          readCalls.push({
            toolName: 'quantzing_get_bookmarks',
            arguments: {limit: clampInt(rest, 1, 40, 15)},
          })
          break
        case '/dms':
          readCalls.push({
            toolName: 'quantzing_list_convos',
            arguments: {limit: clampInt(rest, 1, 30, 12)},
          })
          break
        case '/lists':
          readCalls.push({
            toolName: 'quantzing_list_lists',
            arguments: rest ? {actor: cleanHandle(rest)} : {},
          })
          break
        case '/spaces':
          readCalls.push({
            toolName: 'quantzing_get_spaces',
            arguments: {status: 'all', limit: 12},
          })
          break
        case '/articles':
          readCalls.push({
            toolName: 'quantzing_get_articles',
            arguments: rest ? {actor: cleanHandle(rest)} : {status: 'published'},
          })
          break
        case '/status':
          readCalls.push({toolName: 'quantzing_quantos_status', arguments: {}})
          break

        // Write slash commands -> ALWAYS proposed (Phase 1 preview), NEVER auto-executed!
        case '/zing':
          if (rest) {
            writeProposals.push({
              toolName: 'quantzing_publish_zing',
              arguments: {text: rest.slice(0, 300)},
            })
          }
          break
        case '/reply': {
          const uriMatch = rest.match(/^(at:\/\/\S+)\s+(.+)$/i)
          const postUri = uriMatch ? uriMatch[1] : postContext?.uri || ''
          const replyText = uriMatch ? uriMatch[2] : rest
          if (postUri && replyText) {
            writeProposals.push({
              toolName: 'quantzing_reply_to_zing',
              arguments: {postUri, text: replyText.slice(0, 300)},
            })
          }
          break
        }
        case '/dm': {
          const dmMatch = rest.match(/^@?([a-zA-Z0-9._:-]+)\s+([\s\S]+)$/)
          if (dmMatch) {
            writeProposals.push({
              toolName: 'quantzing_send_dm',
              arguments: {
                recipient: cleanHandle(dmMatch[1]),
                text: dmMatch[2].trim().slice(0, 1000),
              },
            })
          }
          break
        }
        case '/article': {
          const parts = rest.split('|').map(s => s.trim()).filter(Boolean)
          if (parts.length >= 2) {
            writeProposals.push({
              toolName: 'quantzing_publish_article',
              arguments: {
                title: parts[0].slice(0, 180),
                body: parts.slice(1).join('\n\n'),
                status: 'published',
              },
            })
          } else if (parts.length === 1) {
            writeProposals.push({
              toolName: 'quantzing_publish_article',
              arguments: {
                title: parts[0].slice(0, 180),
                body: `${parts[0]}\n\nDrafted with Quanty. Edit this body directly before publishing.`,
                status: 'draft',
              },
            })
          }
          break
        }
        case '/poll': {
          const parts = rest.split('|').map(s => s.trim()).filter(Boolean)
          if (parts.length >= 3) {
            writeProposals.push({
              toolName: 'quantzing_create_poll',
              arguments: {
                text: parts[0].slice(0, 300),
                options: parts.slice(1, 5),
                durationHours: 24,
              },
            })
          } else if (parts.length >= 1) {
            writeProposals.push({
              toolName: 'quantzing_create_poll',
              arguments: {
                text: parts[0].slice(0, 300),
                options: ['Yes', 'No'],
                durationHours: 24,
              },
            })
          }
          break
        }
        case '/space': {
          const parts = rest.split('|').map(s => s.trim()).filter(Boolean)
          if (parts.length >= 1) {
            writeProposals.push({
              toolName: 'quantzing_create_space',
              arguments: {
                title: parts[0].slice(0, 140),
                topic: parts[1] || 'Live Sovereign Discussion',
              },
            })
          }
          break
        }
        case '/list': {
          const parts = rest.split('|').map(s => s.trim()).filter(Boolean)
          if (parts.length >= 1) {
            writeProposals.push({
              toolName: 'quantzing_create_list',
              arguments: {
                name: parts[0].slice(0, 64),
                description: parts[1] || '',
                purpose: 'curatelist',
              },
            })
          }
          break
        }
        case '/follow':
        case '/unfollow':
          if (rest) {
            writeProposals.push({
              toolName: 'quantzing_follow_account',
              arguments: {
                actor: cleanHandle(rest.split(/\s+/)[0]),
                unfollow: cmd === '/unfollow',
              },
            })
          }
          break
        case '/bookmark': {
          const targetUri = rest || postContext?.uri || ''
          if (targetUri) {
            writeProposals.push({
              toolName: 'quantzing_bookmark_zing',
              arguments: {postUri: targetUri, remove: false},
            })
          }
          break
        }
        case '/bio': {
          const parts = rest.split('|').map(s => s.trim())
          if (parts.length >= 2 && parts[0]) {
            writeProposals.push({
              toolName: 'quantzing_update_profile',
              arguments: {
                displayName: parts[0].slice(0, 64),
                description: parts.slice(1).join(' | ').slice(0, 256),
              },
            })
          } else if (rest) {
            writeProposals.push({
              toolName: 'quantzing_update_profile',
              arguments: {description: rest.slice(0, 256)},
            })
          }
          break
        }
        case '/mute':
        case '/unmute':
        case '/block':
        case '/unblock':
          if (rest) {
            writeProposals.push({
              toolName: 'quantzing_moderate_account',
              arguments: {
                actor: cleanHandle(rest.split(/\s+/)[0]),
                action: cmd.slice(1),
              },
            })
          }
          break
        case '/like':
          if (rest || postContext?.uri) {
            writeProposals.push({
              toolName: 'quantzing_like_zing',
              arguments: {postUri: rest || postContext?.uri || ''},
            })
          }
          break
        case '/rezing':
          if (rest || postContext?.uri) {
            writeProposals.push({
              toolName: 'quantzing_rezing',
              arguments: {postUri: rest || postContext?.uri || ''},
            })
          }
          break
        default:
          readCalls.push({
            toolName: 'quantzing_search_zings',
            arguments: {query: trimmed.slice(1), sort: 'top', limit: 6},
          })
          break
      }

      return {readCalls, writeProposals, isExplicitSlash}
    }

    const conversational = classifyConversationalIntent(trimmed, mode, postContext)

    // Natural-language write intent patterns (always proposed, never auto-executed)
    const zingMatch = trimmed.match(
      /^(?:post|publish|send)\s+(?:a\s+)?zing(?:\s+(?:saying|that|:))?\s+([\s\S]+)$/i,
    )
    if (zingMatch) {
      writeProposals.push({
        toolName: 'quantzing_publish_zing',
        arguments: {text: zingMatch[1].trim().replace(/^["']|["']$/g, '').slice(0, 300)},
      })
    }

    const replyMatch = trimmed.match(
      /^(?:reply|respond)(?:\s+to\s+this(?:\s+zing)?)?(?:\s+(?:saying|with|:))?\s+([\s\S]+)$/i,
    )
    if (replyMatch && postContext?.uri) {
      writeProposals.push({
        toolName: 'quantzing_reply_to_zing',
        arguments: {
          postUri: postContext.uri,
          text: replyMatch[1].trim().replace(/^["']|["']$/g, '').slice(0, 300),
        },
      })
    }

    const dmMatch = trimmed.match(
      /^(?:dm|message|send\s+(?:a\s+)?dm\s+to)\s+@?([a-zA-Z0-9._:-]+)(?:\s+(?:saying|that|:))?\s+([\s\S]+)$/i,
    )
    if (dmMatch) {
      writeProposals.push({
        toolName: 'quantzing_send_dm',
        arguments: {
          recipient: cleanHandle(dmMatch[1]),
          text: dmMatch[2].trim().replace(/^["']|["']$/g, '').slice(0, 1000),
        },
      })
    }

    const followMatch = trimmed.match(/^(follow|unfollow)\s+@?([a-zA-Z0-9._:-]+)/i)
    if (followMatch) {
      writeProposals.push({
        toolName: 'quantzing_follow_account',
        arguments: {
          actor: cleanHandle(followMatch[2]),
          unfollow: followMatch[1].toLowerCase() === 'unfollow',
        },
      })
    }

    const modMatch = trimmed.match(/^(mute|unmute|block|unblock)\s+@?([a-zA-Z0-9._:-]+)/i)
    if (modMatch) {
      writeProposals.push({
        toolName: 'quantzing_moderate_account',
        arguments: {
          actor: cleanHandle(modMatch[2]),
          action: modMatch[1].toLowerCase(),
        },
      })
    }

    const bookmarkMatch = trimmed.match(/^(bookmark|save)\s+(?:this|the)\s+(?:zing|post)/i)
    if (bookmarkMatch && postContext?.uri) {
      writeProposals.push({
        toolName: 'quantzing_bookmark_zing',
        arguments: {postUri: postContext.uri, remove: false},
      })
    }

    const pollMatch = trimmed.match(
      /^(?:create|make|start)\s+(?:a\s+)?poll(?:\s+(?:asking|about|:))?\s+([\s\S]+)$/i,
    )
    if (pollMatch) {
      const parts = pollMatch[1].split('|').map(s => s.trim()).filter(Boolean)
      writeProposals.push({
        toolName: 'quantzing_create_poll',
        arguments: {
          text: (parts[0] || pollMatch[1]).slice(0, 300),
          options: parts.length >= 3 ? parts.slice(1, 5) : ['Agree', 'Disagree'],
          durationHours: 24,
        },
      })
    }

    const spaceMatch = trimmed.match(
      /^(?:create|start|host|launch)\s+(?:a\s+)?(?:zing)?space(?:\s+(?:called|titled|about|:))?\s+([\s\S]+)$/i,
    )
    if (spaceMatch) {
      const parts = spaceMatch[1].split('|').map(s => s.trim()).filter(Boolean)
      writeProposals.push({
        toolName: 'quantzing_create_space',
        arguments: {
          title: (parts[0] || spaceMatch[1]).replace(/^["']|["']$/g, '').slice(0, 140),
          topic: parts[1] || 'Live Sovereign Discussion',
        },
      })
    }

    const listMatch = trimmed.match(
      /^(?:create|make)\s+(?:a\s+)?list(?:\s+(?:called|named))?\s+"?([^"|]+)"?(?:\s*\|\s*([\s\S]+))?$/i,
    )
    if (listMatch) {
      writeProposals.push({
        toolName: 'quantzing_create_list',
        arguments: {
          name: listMatch[1].trim().slice(0, 64),
          description: (listMatch[2] || '').trim().slice(0, 300),
          purpose: 'curatelist',
        },
      })
    }

    const bioMatch = trimmed.match(
      /^(?:update|change|set)\s+(?:my\s+)?(?:profile\s+)?bio(?:\s+to|:)?\s+([\s\S]+)$/i,
    )
    if (bioMatch) {
      writeProposals.push({
        toolName: 'quantzing_update_profile',
        arguments: {description: bioMatch[1].trim().replace(/^["']|["']$/g, '').slice(0, 256)},
      })
    }

    const articleMatch = trimmed.match(
      /^(?:publish|write|create)\s+(?:an?\s+)?article(?:\s+(?:titled|called|about|:))?\s+([\s\S]+)$/i,
    )
    if (articleMatch) {
      const parts = articleMatch[1].split('|').map(s => s.trim()).filter(Boolean)
      writeProposals.push({
        toolName: 'quantzing_publish_article',
        arguments: {
          title: (parts[0] || articleMatch[1]).slice(0, 180),
          body:
            parts.slice(1).join('\n\n') ||
            `${parts[0]}\n\nDrafted with Quanty. Review and edit before publishing.`,
          status: parts.length >= 2 ? 'published' : 'draft',
        },
      })
    }

    // Pure greetings / identity / thanks: skip noisy feed/trends queries so responses feel instant & natural
    if (
      writeProposals.length === 0 &&
      (conversational.kind === 'greeting' ||
        conversational.kind === 'identity' ||
        conversational.kind === 'thanks')
    ) {
      return {readCalls: [], writeProposals: [], isExplicitSlash, conversational}
    }

    // Natural-language read intents
    const lower = trimmed.toLowerCase()
    if (postContext?.uri) {
      readCalls.push({
        toolName: 'quantzing_get_thread',
        arguments: {uri: postContext.uri},
      })
    }
    if (/\b(analytics|impressions|views|my stats|engagement rate|creator studio)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_get_user_analytics', arguments: {windowDays: 30}})
    }
    if (/\b(notifications|mentions|unread)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_get_notifications', arguments: {limit: 15}})
    }
    if (/\b(bookmarks|saved zings|saved posts)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_get_bookmarks', arguments: {limit: 15}})
    }
    if (/\b(my dms|direct messages|messages|inbox|convos)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_list_convos', arguments: {limit: 12}})
    }
    if (/\b(my lists|curated lists)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_list_lists', arguments: {}})
    }
    if (/\b(spaces|zingspaces|audio rooms|live rooms)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_get_spaces', arguments: {status: 'all', limit: 10}})
    }
    if (/\b(articles|long-form|essays)\b/i.test(lower) && writeProposals.length === 0) {
      readCalls.push({toolName: 'quantzing_get_articles', arguments: {status: 'published', limit: 10}})
    }
    if (/\b(quantos|credits|wallet|engine status|system status)\b/i.test(lower)) {
      readCalls.push({toolName: 'quantzing_quantos_status', arguments: {}})
    }
    if (
      mode === 'pulse' ||
      /\b(trending|trends|breaking|news|happening|pulse|today)\b/i.test(lower)
    ) {
      readCalls.push({toolName: 'quantzing_get_trends', arguments: {limit: 8}})
    }

    const handleQuery = trimmed.match(/@([a-zA-Z0-9._-]{3,})/)
    if (handleQuery && writeProposals.length === 0) {
      readCalls.push({
        toolName: 'quantzing_get_profile',
        arguments: {actor: cleanHandle(handleQuery[1])},
      })
    }

    // Search QuantZing gently for general questions/drafts (without dumping unrelated trends!)
    if (readCalls.length === 0 && writeProposals.length === 0) {
      const searchSeed =
        conversational.kind === 'knowledge'
          ? conversational.subject || extractKeywords(trimmed, 4).join(' ')
          : conversational.kind === 'draft'
            ? extractKeywords(conversational.topic || trimmed, 4).join(' ')
            : extractKeywords(trimmed, 4).join(' ')
      if (searchSeed && searchSeed.length >= 2) {
        readCalls.push({
          toolName: 'quantzing_search_zings',
          arguments: {query: searchSeed.slice(0, 120), sort: 'top', limit: 6},
        })
      }
      if (conversational.kind === 'none') {
        readCalls.push({toolName: 'quantzing_get_trends', arguments: {limit: 6}})
      }
    }

    // Deduplicate read calls by toolName
    const seenReads = new Set()
    const dedupReads = readCalls.filter(c => {
      if (seenReads.has(c.toolName)) return false
      seenReads.add(c.toolName)
      return true
    })

    return {
      readCalls: dedupReads,
      writeProposals,
      isExplicitSlash,
      conversational,
    }
  }

  // -------------------------------------------------------------------------
  // Grounded Local & External Knowledge Synthesis (Natural Grok-Style Fallback)
  // -------------------------------------------------------------------------

  function synthesizeGroundedAnswer({
    prompt,
    mode,
    postContext,
    toolOutputs,
    proposedActions,
    citations,
    conversational = {kind: 'none'},
    externalKnowledge = null,
  }) {
    const sections = []
    let suggestedZingDraft

    // 1. Warm, crisp conversational replies for greetings, identity, and casual acks
    if (proposedActions.length === 0 && conversational?.kind === 'greeting') {
      const l = conversational.lower || ''
      if (/\b(namaste|namaskar|kaise\s+ho|kya\s+haal)\b/i.test(l)) {
        return {
          answer:
            "Namaste! I'm doing great and ready to help. Ask me anything — from breaking down complex topics and live QuantZing trends to drafting sharp Zings or checking your analytics. What's on your mind?",
        }
      }
      if (/\bgood\s+morning\b/i.test(l)) {
        return {
          answer:
            "Good morning! I'm Quanty. Ask me about any topic, catch up on what's trending on QuantZing, or tell me what you'd like to draft today.",
        }
      }
      if (/\bgood\s+(?:afternoon|evening|night)\b/i.test(l)) {
        return {
          answer:
            "Hey there! I'm Quanty, built right into QuantZing. Ask me anything, pull up live trends, or let's draft your next Zing together. What are we looking into?",
        }
      }
      return {
        answer:
          "Hey! I'm Quanty, built right into QuantZing. Ask me anything — explain a concept, check what's trending, draft a sharp Zing or thread, or pull up your stats and notifications. What's on your mind?",
      }
    }

    if (proposedActions.length === 0 && conversational?.kind === 'identity') {
      return {
        answer: [
          "I'm **Quanty**, the built-in AI assistant on QuantZing.",
          '',
          'Here is what I can help you with right here:',
          '- **Answer & explain** almost any topic with live factual context and discussions from QuantZing',
          '- **Track what is happening** — trending topics (`/trends`), threads, profiles, and ZingSpaces',
          '- **Draft & sharpen copy** — single Zings, threads, polls, or long-form articles',
          '- **Run account actions with your confirmation** — publish Zings (`/zing`), view Creator Studio analytics (`/analytics`), check notifications, DMs, or bookmarks',
          '',
          'Ask naturally or type `/` to browse quick commands.',
        ].join('\n'),
      }
    }

    if (proposedActions.length === 0 && conversational?.kind === 'thanks') {
      return {
        answer:
          "Anytime. Let me know what you'd like to explore, check, or draft next.",
      }
    }

    // 2. Creative drafting / rewriting requests
    if (conversational?.kind === 'draft' && proposedActions.length === 0) {
      const drafted = buildSmartCreativeDraft({
        topic: conversational.topic,
        format: conversational.format,
        sourceText: conversational.sourceText,
        knowledge: externalKnowledge,
        citations,
      })
      suggestedZingDraft = drafted.suggestedZingDraft
      sections.push(drafted.markdown)
      return {
        answer: sections.join('\n\n'),
        suggestedZingDraft,
      }
    }

    // 3. Explicit write action proposal intro
    if (proposedActions.length > 0) {
      const a = proposedActions[0]
      if (a.requiresAuth) {
        sections.push(
          `Sign in to QuantZing to review and confirm this action:\n- **${a.title}**: ${a.summary}`,
        )
      } else {
        sections.push(
          `Ready when you are — review the details below and confirm to run it:\n- **${a.title}**: ${a.summary}`,
        )
      }
    }

    // 4. External factual knowledge lead (Wikipedia + DuckDuckGo) for general questions
    if (externalKnowledge?.ok && externalKnowledge.summary) {
      const heading = externalKnowledge.title
        ? `### ${externalKnowledge.title}`
        : ''
      const lead = externalKnowledge.shortDescription &&
        !externalKnowledge.summary
          .toLowerCase()
          .includes(externalKnowledge.shortDescription.toLowerCase())
        ? `*${externalKnowledge.shortDescription}*\n\n${externalKnowledge.summary}`
        : externalKnowledge.summary

      const parts = [heading, lead].filter(Boolean)
      if (
        Array.isArray(externalKnowledge.relatedPoints) &&
        externalKnowledge.relatedPoints.length > 0
      ) {
        parts.push(
          '**Key context**\n' +
            externalKnowledge.relatedPoints.map(pt => `- ${pt}`).join('\n'),
        )
      }
      if (externalKnowledge.sourceName) {
        parts.push(`*Source: ${externalKnowledge.sourceName}*`)
      }
      sections.push(parts.join('\n\n'))
    }

    // 5. QuantZing tool outputs (clean, natural markdown — zero robotic boilerplate)
    for (const out of toolOutputs) {
      if (out.status === 'auth_required') {
        sections.push(
          `### ${out.title}\nSign in to your QuantZing account to view your ${out.title.toLowerCase()}.`,
        )
        continue
      }
      if (out.status !== 'ok' || !out.data) continue

      switch (out.toolName) {
        case 'quantzing_get_trends': {
          const list = out.data.trends || []
          if (list.length > 0) {
            const bullets = list
              .slice(0, 6)
              .map(
                (t, idx) =>
                  `${idx + 1}. **${stripEmojis(t.displayName || t.topic)}**${t.postCount ? ` (${t.postCount} ${t.postCount === 1 ? 'Zing' : 'Zings'})` : ''}${t.description ? ` — ${stripEmojis(t.description).slice(0, 110)}` : ''}`,
              )
              .join('\n')
            sections.push(`### Trending on QuantZing\n${bullets}`)
          } else {
            sections.push(
              '### Trending on QuantZing\nNothing is spiking just yet. Start a conversation with a hashtag to kick off a live topic.',
            )
          }
          break
        }

        case 'quantzing_get_user_analytics': {
          const t = out.data.totals || {}
          const top = (out.data.topPosts || []).slice(0, 3)
          let block = [
            `### Creator Analytics (${out.data.windowDays || 30} Days)`,
            `- **Impressions**: ${t.impressions ?? 0}`,
            `- **Zings Published**: ${t.postsCount ?? 0} | **Followers**: ${t.followersCount ?? 0} | **Following**: ${t.followingCount ?? 0}`,
            `- **Engagements**: ${t.likes ?? 0} likes, ${t.rezings ?? 0} rezings, ${t.replies ?? 0} replies, ${t.bookmarks ?? 0} bookmarks (${Number(t.engagementRate || 0).toFixed(1)}% rate)`,
          ].join('\n')
          if (top.length > 0) {
            block +=
              '\n\n**Top Performing Zings**\n' +
              top
                .map(
                  (p, i) =>
                    `${i + 1}. "${stripEmojis(p.text || '').slice(0, 85)}" — ${p.viewCount || 0} views, ${p.likeCount || 0} likes`,
                )
                .join('\n')
          }
          sections.push(block)
          break
        }

        case 'quantzing_get_notifications': {
          const items = out.data.notifications || []
          if (items.length === 0) {
            sections.push('### Notifications\nYou are all caught up — no new notifications right now.')
          } else {
            const lines = items.slice(0, 6).map(n => {
              const who = n.author?.handle ? `@${n.author.handle}` : 'Member'
              const reason = n.reason || 'activity'
              const text = n.record?.text
                ? `: "${stripEmojis(n.record.text).slice(0, 70)}"`
                : ''
              return `- **${who}** (${reason})${n.isRead ? '' : ' [unread]'}${text}`
            })
            sections.push(
              `### Notifications (${out.data.unreadCount || 0} unread)\n${lines.join('\n')}`,
            )
          }
          break
        }

        case 'quantzing_get_bookmarks': {
          const bms = out.data.bookmarks || []
          if (bms.length === 0) {
            sections.push('### Saved Bookmarks\nYou have not bookmarked any Zings yet.')
          } else {
            const lines = bms.slice(0, 6).map(
              p =>
                `- **@${p.author?.handle || 'member'}**: "${stripEmojis(p.record?.text || '').slice(0, 95)}"`,
            )
            sections.push(`### Saved Bookmarks (${bms.length})\n${lines.join('\n')}`)
          }
          break
        }

        case 'quantzing_list_convos': {
          const convos = out.data.convos || []
          if (convos.length === 0) {
            sections.push('### Direct Messages\nNo active conversations yet. Try `/dm @handle message` to start one.')
          } else {
            const lines = convos.slice(0, 6).map(c => {
              const members = (c.members || [])
                .map(m => `@${m.handle || m.did}`)
                .join(', ')
              const last = c.lastMessage?.text
                ? `"${stripEmojis(c.lastMessage.text).slice(0, 70)}"`
                : 'No messages yet'
              return `- **${members || c.id}**${c.unreadCount ? ` (${c.unreadCount} unread)` : ''}: ${last}`
            })
            sections.push(`### Direct Messages (${convos.length})\n${lines.join('\n')}`)
          }
          break
        }

        case 'quantzing_search_zings': {
          const posts = out.data.posts || []
          if (posts.length > 0) {
            const lines = posts.slice(0, 4).map(
              (p, i) =>
                `${i + 1}. **@${p.author?.handle || 'member'}**: "${stripEmojis(p.record?.text || '').slice(0, 120)}" (${p.likeCount || 0} likes, ${p.repostCount || 0} rezings)`,
            )
            sections.push(
              `### On QuantZing (${posts.length} ${posts.length === 1 ? 'Zing' : 'Zings'})\n${lines.join('\n')}`,
            )
          }
          break
        }

        case 'quantzing_search_people': {
          const actors = out.data.actors || []
          if (actors.length > 0) {
            const lines = actors.slice(0, 6).map(
              acc =>
                `- **${stripEmojis(acc.displayName || acc.handle)}** (@${acc.handle})${acc.description ? ` — ${stripEmojis(acc.description).slice(0, 90)}` : ''}`,
            )
            sections.push(`### People on QuantZing (${actors.length})\n${lines.join('\n')}`)
          } else {
            sections.push(`I didn't find any accounts matching "${out.data.query}" on QuantZing.`)
          }
          break
        }

        case 'quantzing_get_profile': {
          const p = out.data.profile || {}
          sections.push(
            [
              `### ${stripEmojis(p.displayName || p.handle || 'Account')} (@${p.handle || ''})`,
              p.description ? `> ${stripEmojis(p.description)}` : null,
              `- **Followers**: ${p.followersCount ?? 0} | **Following**: ${p.followsCount ?? 0} | **Zings**: ${p.postsCount ?? 0}`,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          break
        }

        case 'quantzing_get_thread': {
          const p = out.data.post
          const reps = out.data.replies || []
          if (p) {
            const lines = [
              `### Thread (@${p.author?.handle || postContext?.authorHandle || 'author'})`,
              `> ${stripEmojis(p.record?.text || postContext?.text || '').slice(0, 220)}`,
              `- **Engagement**: ${out.data.viewCount ?? 0} views, ${p.likeCount ?? 0} likes, ${p.repostCount ?? 0} rezings, ${reps.length} replies`,
            ]
            if (reps.length > 0) {
              lines.push(
                '**Top Replies**\n' +
                  reps
                    .slice(0, 3)
                    .map(
                      r =>
                        `- @${r.author?.handle || 'member'}: "${stripEmojis(r.record?.text || '').slice(0, 100)}"`,
                    )
                    .join('\n'),
              )
            }
            sections.push(lines.join('\n'))
          }
          break
        }

        case 'quantzing_list_lists': {
          const lists = out.data.lists || []
          sections.push(
            lists.length > 0
              ? `### Curated Lists (${lists.length})\n` +
                  lists
                    .slice(0, 6)
                    .map(l => `- **${l.name}** by @${l.creatorHandle}${l.description ? ` — ${l.description.slice(0, 80)}` : ''}`)
                    .join('\n')
              : '### Curated Lists\nNo lists found yet. Use `/list Name | Description` to create one.',
          )
          break
        }

        case 'quantzing_get_spaces': {
          const spaces = out.data.spaces || []
          sections.push(
            spaces.length > 0
              ? `### ZingSpaces (${out.data.liveCount || 0} live)\n` +
                  spaces
                    .slice(0, 6)
                    .map(s => `- **${stripEmojis(s.title)}** [${s.status}] hosted by @${s.hostHandle || 'host'} (${s.listenerCount || 0} listeners)`)
                    .join('\n')
              : '### ZingSpaces\nNo live rooms right now. Use `/space Title | Topic` to start one.',
          )
          break
        }

        case 'quantzing_get_articles': {
          const articles = out.data.articles || []
          sections.push(
            articles.length > 0
              ? `### Articles on QuantZing (${articles.length})\n` +
                  articles
                    .slice(0, 6)
                    .map(ar => `- **${stripEmojis(ar.title)}** by @${ar.authorHandle || 'author'} (${ar.readTimeMinutes || 1} min read)`)
                    .join('\n')
              : '### Articles on QuantZing\nNo published articles yet. Use `/article Title | Body` to start writing.',
          )
          break
        }

        case 'quantzing_quantos_status': {
          const q = out.data.quantos || {}
          sections.push(
            [
              `### QuantOS Engine Status: ${out.data.modeLabel || 'QuantZing Live'}`,
              `- **QuantAI**: ${q.ai?.online ? `Online (${q.ai.latencyMs}ms)` : 'Standby'}`,
              `- **QuantRouter**: ${q.router?.online ? `Online (${q.router.latencyMs}ms)` : 'Standby'}`,
              `- **QuantPay**: ${q.pay?.online ? `Online${typeof q.pay.balanceCredits === 'number' ? ` (${q.pay.balanceCredits} credits)` : ''}` : 'Standby'}`,
            ].join('\n'),
          )
          break
        }
      }
    }

    if (sections.length === 0) {
      const cleanQ = stripEmojis(prompt || '').slice(0, 120)
      sections.push(
        `I couldn't find live discussions or an instant reference summary for "${cleanQ}" just yet. Try rephrasing with a specific term, ask me to draft a Zing to start the conversation, or type \`/trends\` to see what's active right now.`,
      )
    }

    if (mode === 'drafter' && !suggestedZingDraft) {
      const drafted = buildSmartCreativeDraft({
        topic: prompt,
        format: 'zing',
        knowledge: externalKnowledge,
        citations,
      })
      suggestedZingDraft = drafted.suggestedZingDraft
    }

    return {
      answer: sections.join('\n\n'),
      suggestedZingDraft,
    }
  }

  // -------------------------------------------------------------------------
  // POST /api/quantzing/quanty/chat Handler
  // -------------------------------------------------------------------------

  async function handleChat(req, res, origin) {
    const started = Date.now()
    const body = await parseBody(req)
    const prompt = stripEmojis(body.prompt || '').trim()
    const mode = ['ask', 'deepsearch', 'drafter', 'pulse', 'control'].includes(
      body.mode,
    )
      ? body.mode
      : 'ask'
    const postContext =
      body.postContext && typeof body.postContext === 'object'
        ? body.postContext
        : null
    const history = Array.isArray(body.history) ? body.history : []
    const allowAutoReadTools = body.allowAutoReadTools !== false
    const threadId = typeof body.threadId === 'string' ? body.threadId.trim() : ''

    if (!prompt) {
      replyJson(res, 400, {
        ok: false,
        error: 'InvalidRequest',
        message: 'Prompt is required.',
      })
      return
    }

    const auth = resolveAuth(req)
    const viewerDid = auth?.did || resolveOptionalViewerDid(req)
    const intent = parseIntent(prompt, mode, postContext)

    const toolTraces = []
    const toolOutputs = []
    const citations = []
    const seenCiteUris = new Set()

    const pushCitation = c => {
      if (!c || !c.uri || seenCiteUris.has(c.uri)) return
      seenCiteUris.add(c.uri)
      citations.push(c)
    }

    // Stage 2: Auto-execute safe READ tools in-process
    if (allowAutoReadTools) {
      for (const call of intent.readCalls) {
        const def = resolveToolDefinition(call.toolName)
        if (!def || def.category !== 'read') continue
        const tStart = Date.now()
        const exec = await executeTool(call.toolName, call.arguments, {
          auth,
          viewerDid,
          origin,
        })
        const latencyMs = Date.now() - tStart
        if (exec.httpStatus === 401) {
          toolTraces.push({
            toolName: def.name,
            title: def.title,
            status: 'auth_required',
            latencyMs,
            summary: 'Sign in required',
          })
          toolOutputs.push({
            toolName: def.name,
            title: def.title,
            status: 'auth_required',
          })
        } else if (exec.body?.ok) {
          const data = exec.body.data || {}
          const itemCount =
            typeof data.count === 'number'
              ? data.count
              : Array.isArray(data.posts)
                ? data.posts.length
                : Array.isArray(data.trends)
                  ? data.trends.length
                  : undefined
          toolTraces.push({
            toolName: def.name,
            title: def.title,
            status: 'ok',
            latencyMs,
            summary: exec.body.summary || 'Completed',
            ...(itemCount !== undefined ? {itemCount} : {}),
          })
          toolOutputs.push({
            toolName: def.name,
            title: def.title,
            status: 'ok',
            data,
            summary: exec.body.summary,
          })

          // Harvest citations from read tools
          const rawPosts = [
            ...(Array.isArray(data.posts) ? data.posts : []),
            ...(Array.isArray(data.recentPosts) ? data.recentPosts : []),
            ...(Array.isArray(data.bookmarks) ? data.bookmarks : []),
            ...(data.post ? [data.post] : []),
            ...(Array.isArray(data.replies) ? data.replies.slice(0, 3) : []),
          ]
          for (const pv of rawPosts) {
            pushCitation(postViewToCitation(pv))
          }
        } else {
          toolTraces.push({
            toolName: def.name,
            title: def.title,
            status: 'error',
            latencyMs,
            summary: exec.body?.message || 'Error',
          })
          toolOutputs.push({
            toolName: def.name,
            title: def.title,
            status: 'error',
          })
        }
      }
    }

    // Build Phase 1 preview actionCards for deterministic write proposals (NEVER auto-execute!)
    const proposedActions = []
    async function addProposedAction(proposal) {
      const def = resolveToolDefinition(proposal.toolName)
      if (!def || def.category === 'read') return
      if (!auth) {
        proposedActions.push({
          actionId: `guest_${crypto.randomUUID().slice(0, 12)}`,
          toolName: def.name,
          category: def.category,
          title: def.title,
          summary: `${def.title}: sign in to preview and confirm`,
          arguments: proposal.arguments || {},
          args: proposal.arguments || {},
          editableFields: def.editableFields || [],
          expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
          confirmationToken: '',
          requiresAuth: true,
        })
        return
      }
      const preview = await executeTool(def.name, proposal.arguments || {}, {
        auth,
        viewerDid,
        origin,
        mode: 'preview',
        confirmed: false,
      })
      if (preview.httpStatus === 202 && preview.body?.actionCard) {
        proposedActions.push(preview.body.actionCard)
      } else if (preview.body?.message) {
        toolTraces.push({
          toolName: def.name,
          title: def.title,
          status: 'error',
          latencyMs: 1,
          summary: preview.body.message,
        })
      }
    }

    for (const prop of intent.writeProposals) {
      await addProposedAction(prop)
    }

    // Stage 2B: Fetch external factual knowledge in parallel when answering general knowledge or drafting on a topic
    const conversational = intent.conversational || {kind: 'none'}
    const shouldFetchKnowledge =
      !intent.isExplicitSlash &&
      proposedActions.length === 0 &&
      (conversational.kind === 'knowledge' ||
        (conversational.kind === 'draft' &&
          conversational.format !== 'rewrite' &&
          Boolean(conversational.topic)))

    const externalKnowledgePromise = shouldFetchKnowledge
      ? fetchExternalKnowledge(
          conversational.kind === 'draft'
            ? conversational.topic
            : prompt,
          2500,
        ).catch(() => ({ok: false}))
      : Promise.resolve(null)

    const externalKnowledge = await externalKnowledgePromise

    // Stage 3: Build grounding context and try configured LLM cascade
    const groundingLines = []
    if (postContext?.text) {
      groundingLines.push(
        `Attached Zing (@${postContext.authorHandle || 'author'}): "${stripEmojis(postContext.text).slice(0, 260)}"`,
      )
    }
    if (externalKnowledge?.ok && externalKnowledge.summary) {
      groundingLines.push(
        `[reference:${externalKnowledge.sourceName}] ${externalKnowledge.title}: ${externalKnowledge.summary.slice(0, 600)}`,
      )
    }
    for (const out of toolOutputs) {
      if (out.status === 'ok') {
        groundingLines.push(
          `[${out.toolName}] ${out.summary}: ${JSON.stringify(out.data).slice(0, 700)}`,
        )
      }
    }

    let answer = ''
    let engineOrigin = 'live-network'
    let provider
    let billingMode
    let model
    let suggestedZingDraft

    // Skip slow LLM call if an explicit write slash command already built a clean deterministic card
    const shouldCallLlm = !(intent.isExplicitSlash && proposedActions.length > 0)
    if (shouldCallLlm) {
      const llm = await callQuantOsReasoning({
        prompt,
        mode,
        viewerDid,
        history,
        groundingBlock: groundingLines.join('\n'),
        allowToolProposals: true,
      })
      if (llm.ok && llm.content) {
        const extracted = extractQuantyActionsBlock(llm.content)
        answer = stripEmojis(extracted.cleaned)
        engineOrigin = llm.origin
        provider = llm.provider
        billingMode = llm.billingMode
        model = llm.model
        for (const extraProp of extracted.actions.slice(0, 3)) {
          const alreadyProposed = proposedActions.some(
            p => p.toolName === (TOOL_ALIASES[extraProp.toolName] || extraProp.toolName),
          )
          if (!alreadyProposed) {
            await addProposedAction(extraProp)
          }
        }
      }
    }

    if (!answer) {
      const local = synthesizeGroundedAnswer({
        prompt,
        mode,
        postContext,
        toolOutputs,
        proposedActions,
        citations,
        conversational,
        externalKnowledge,
      })
      answer = local.answer
      suggestedZingDraft = local.suggestedZingDraft
      engineOrigin = externalKnowledge?.ok ? 'quanty-knowledge' : 'live-network'
    }

    // Attach a clean Phase 1 "Post this Zing" action card for creative drafts & drafter mode
    if (
      (mode === 'drafter' || conversational.kind === 'draft') &&
      !proposedActions.some(p => p.toolName === 'quantzing_publish_zing')
    ) {
      const draftCandidate =
        suggestedZingDraft ||
        answer
          .replace(/^#{1,3}\s+/gm, '')
          .replace(/\*\*/g, '')
          .trim()
          .slice(0, 275)
      if (draftCandidate) {
        suggestedZingDraft = draftCandidate
        await addProposedAction({
          toolName: 'quantzing_publish_zing',
          arguments: {text: draftCandidate},
        })
      }
    }

    const quantos = await probeQuantOsHealth(viewerDid)
    const latencyMs = Date.now() - started

    const responsePayload = {
      ok: true,
      answer,
      origin: engineOrigin,
      ...(provider ? {provider} : {}),
      ...(billingMode ? {billingMode} : {}),
      ...(model ? {model} : {}),
      latencyMs,
      citations: citations.slice(0, 8),
      ...(suggestedZingDraft ? {suggestedZingDraft} : {}),
      toolTraces,
      proposedActions,
      quantosMeta: {
        ...(typeof quantos.pay.balanceCredits === 'number'
          ? {creditsBalance: quantos.pay.balanceCredits}
          : {}),
      },
    }

    // Persist turn automatically if threadId was supplied by an authenticated user
    if (auth && threadId) {
      const existing = threads.getThread(auth.did, threadId)
      if (existing) {
        threads.appendMessage(auth.did, threadId, {
          role: 'user',
          content: prompt,
          mode,
        })
        threads.appendMessage(auth.did, threadId, {
          role: 'assistant',
          content: answer,
          mode,
          origin: engineOrigin,
          provider,
          model,
          latencyMs,
          citations: responsePayload.citations,
          toolTraces,
          proposedActions,
          suggestedZingDraft,
        })
        responsePayload.threadId = threadId
      }
    }

    replyJson(res, 200, responsePayload)
  }

  // -------------------------------------------------------------------------
  // Manifest Builder (GET /api/quantzing/quanty/manifest & GET /mcp)
  // -------------------------------------------------------------------------

  async function buildManifestPayload(req) {
    const auth = resolveAuth(req)
    const viewerDid = auth?.did || resolveOptionalViewerDid(req)
    const enforcement = auth ? checkEnforcement(auth.did) : {status: 'guest'}
    const quantos = await probeQuantOsHealth(viewerDid)

    return {
      ok: true,
      service: 'quant-zing',
      protocolVersion: QUANTY_PROTOCOL_VERSION,
      version: QUANTY_BRIDGE_VERSION,
      viewer: {
        authenticated: Boolean(auth),
        did: auth?.did || null,
        handle: auth?.handle || auth?.account?.handle || null,
        displayName:
          auth?.account?.profile?.displayName ||
          auth?.account?.displayName ||
          auth?.handle ||
          null,
        verified: Boolean(auth?.account?.verified),
        accountStatus: enforcement.status || (auth ? 'active' : 'guest'),
      },
      quantos,
      tools: QUANTY_TOOLS,
    }
  }

  // -------------------------------------------------------------------------
  // MCP JSON-RPC 2.0 + Direct REST Execution Dispatcher
  // -------------------------------------------------------------------------

  async function handleExecuteOrMcpInvoke(req, res, origin) {
    const body = await parseBody(req)
    const auth = resolveAuth(req)
    const viewerDid = auth?.did || resolveOptionalViewerDid(req)

    const urls = getQuantOsUrls()
    const svcHeader = String(req.headers?.['x-quant-service-token'] || '')
    const serviceAuthorized = Boolean(
      urls.internalApiKey &&
        svcHeader &&
        svcHeader.length === urls.internalApiKey.length &&
        crypto.timingSafeEqual(
          Buffer.from(svcHeader, 'utf8'),
          Buffer.from(urls.internalApiKey, 'utf8'),
        ),
    )

    // MCP JSON-RPC 2.0 handling
    if (body && body.jsonrpc === '2.0') {
      const rpcId = body.id ?? null
      const method = String(body.method || '')

      if (method === 'initialize') {
        replyJson(res, 200, {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            protocolVersion: QUANTY_PROTOCOL_VERSION,
            serverInfo: {
              name: 'quant-zing-quanty-bridge',
              version: QUANTY_BRIDGE_VERSION,
            },
            capabilities: {
              tools: {listChanged: false},
            },
          },
        })
        return
      }

      if (method === 'tools/list') {
        replyJson(res, 200, {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            tools: QUANTY_TOOLS.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: {
                title: t.title,
                readOnlyHint: t.category === 'read',
                destructiveHint: t.category === 'destructive',
                requiresAuth: t.requiresAuth,
                approvalRequired: t.approvalRequired,
              },
            })),
          },
        })
        return
      }

      if (method === 'tools/call') {
        const params = body.params || {}
        const meta = params._meta || {}
        const exec = await executeTool(
          params.name || params.toolName,
          params.arguments || {},
          {
            auth,
            viewerDid,
            origin,
            mode: meta.mode ?? params.mode,
            confirmed: Boolean(meta.confirmed ?? params.confirmed),
            actionId: meta.actionId ?? params.actionId,
            confirmationToken:
              meta.confirmationToken ?? params.confirmationToken,
            expiresAt: meta.expiresAt ?? params.expiresAt,
            serviceAuthorized,
            approvalGrantId: meta.approvalGrantId ?? params.approvalGrantId,
          },
        )
        if (!exec.body?.ok) {
          replyJson(res, exec.httpStatus, {
            jsonrpc: '2.0',
            id: rpcId,
            error: {
              code: -32000 - exec.httpStatus,
              message: exec.body?.message || 'Tool execution error',
              data: exec.body,
            },
          })
          return
        }
        const summaryText =
          exec.body.summary ||
          exec.body.actionCard?.summary ||
          'Tool call completed'
        replyJson(res, exec.httpStatus, {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [{type: 'text', text: summaryText}],
            structuredContent: exec.body,
            isError: false,
          },
        })
        return
      }

      replyJson(res, 400, {
        jsonrpc: '2.0',
        id: rpcId,
        error: {code: -32601, message: `Method not found: ${method}`},
      })
      return
    }

    // Standard REST execution payload
    const toolName = String(body.toolName || body.name || '').trim()
    if (!toolName) {
      replyJson(res, 400, {
        ok: false,
        error: 'InvalidRequest',
        message: 'toolName is required.',
      })
      return
    }

    const exec = await executeTool(toolName, body.arguments ?? body.args ?? {}, {
      auth,
      viewerDid,
      origin,
      mode: body.mode,
      confirmed: body.confirmed === true,
      actionId: body.actionId,
      confirmationToken: body.confirmationToken,
      expiresAt: body.expiresAt,
      serviceAuthorized,
      approvalGrantId: body.approvalGrantId,
    })

    replyJson(res, exec.httpStatus, exec.body)
  }

  // -------------------------------------------------------------------------
  // Grounded @quanty In-Thread Mention Reply Builder
  // -------------------------------------------------------------------------

  async function buildQuantyMentionReply({
    prompt = '',
    postContext = null,
    viewerDid = null,
    origin = '',
  } = {}) {
    const cleanedPrompt = stripEmojis(prompt)
      .replace(/@quanty(?:\.quantzing\.(?:com|in))?/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    const authorHandle = cleanHandle(postContext?.authorHandle || '')
    const handlePrefix = authorHandle ? `@${authorHandle} ` : ''
    const parentText = stripEmojis(postContext?.text || '')

    const searchSeed =
      extractKeywords(`${cleanedPrompt} ${parentText}`, 4).join(' ') ||
      cleanedPrompt.slice(0, 60)

    const [searchRaw, trendsRaw] = await Promise.all([
      searchSeed
        ? Promise.resolve(
            helpers.searchLocalPosts?.({
              query: searchSeed,
              sort: 'top',
              limit: 4,
              viewerDid,
              origin,
            }),
          ).catch(() => [])
        : Promise.resolve([]),
      Promise.resolve(
        helpers.computeSovereignTrends?.(viewerDid, origin, 4),
      ).catch(() => []),
    ])

    const posts = Array.isArray(searchRaw) ? searchRaw : searchRaw?.posts || []
    const trends = Array.isArray(trendsRaw)
      ? trendsRaw
      : trendsRaw?.trends || []
    const citations = posts.map(postViewToCitation).filter(Boolean)

    const groundingLines = []
    if (parentText) groundingLines.push(`Parent Zing: "${parentText.slice(0, 180)}"`)
    if (citations.length > 0) {
      groundingLines.push(
        'Related Zings: ' +
          citations
            .slice(0, 3)
            .map(c => `@${c.handle}: "${c.text.slice(0, 80)}"`)
            .join(' | '),
      )
    }
    if (trends.length > 0) {
      groundingLines.push(
        'Live Trends: ' +
          trends
            .slice(0, 3)
            .map(t => t.displayName || t.topic)
            .join(', '),
      )
    }

    const llm = await callQuantOsReasoning({
      prompt: cleanedPrompt || 'Summarize and provide factual context on this Zing.',
      mode: 'ask',
      viewerDid,
      history: [],
      groundingBlock: groundingLines.join('\n'),
      allowToolProposals: false,
      timeoutMs: MENTION_AI_TIMEOUT_MS,
    })

    let replyText = ''
    let replyOrigin = 'live-network'

    if (llm.ok && llm.content) {
      const base = stripEmojis(llm.content).replace(/\s+/g, ' ')
      replyText = (
        base.toLowerCase().startsWith(handlePrefix.trim().toLowerCase())
          ? base
          : `${handlePrefix}${base}`
      ).slice(0, 280)
      replyOrigin = llm.origin
    } else if (/trending|breaking|news|happening|today/i.test(cleanedPrompt)) {
      const topTrendNames = trends
        .slice(0, 3)
        .map(t => stripEmojis(t.displayName || t.topic))
        .filter(Boolean)
        .join(', ')
      replyText = `${handlePrefix}Trending on QuantZing right now: ${topTrendNames || 'active builder discussions'}${citations[0] ? ` — top post from @${citations[0].handle} (${citations[0].likeCount} likes)` : ''}.`.slice(
        0,
        280,
      )
    } else {
      const mentionKnowledge =
        cleanedPrompt.length >= 4
          ? await fetchExternalKnowledge(cleanedPrompt, 1800).catch(() => null)
          : null
      if (mentionKnowledge?.ok && mentionKnowledge.summary) {
        const firstSentence =
          mentionKnowledge.summary.split(/(?<=[.!?])\s+/)[0] ||
          mentionKnowledge.summary
        replyText = `${handlePrefix}${firstSentence}`.slice(0, 276)
        replyOrigin = 'quanty-knowledge'
      } else if (citations.length > 0) {
        const top = citations[0]
        replyText = `${handlePrefix}From QuantZing: @${top.handle} notes "${top.text.slice(0, 120)}${top.text.length > 120 ? '...' : ''}" (${citations.length} related ${citations.length === 1 ? 'Zing' : 'Zings'}).`.slice(
          0,
          280,
        )
      } else if (parentText) {
        const viewCount = postContext?.uri
          ? Number(helpers.getPostViewCount?.(postContext.uri) || 0)
          : 0
        replyText = `${handlePrefix}Context on "${parentText.slice(0, 95)}${parentText.length > 95 ? '...' : ''}": ${viewCount > 0 ? `${viewCount} views so far; ` : ''}open Quanty to explore deeper or draft a reply.`.slice(
          0,
          280,
        )
      } else {
        const topTrend = trends[0]?.displayName || trends[0]?.topic
        replyText = `${handlePrefix}Hey! Ask me anything or tap Quanty for a full breakdown${topTrend ? ` — ${stripEmojis(topTrend)} is active right now` : ''}.`.slice(
          0,
          280,
        )
      }
    }

    return {
      text: replyText,
      replyText,
      origin: replyOrigin,
      citations,
      toString() {
        return replyText
      },
    }
  }

  // -------------------------------------------------------------------------
  // Main HTTP Router: handleQuantyHttpRequest(req, res, url, origin)
  // -------------------------------------------------------------------------

  async function handleQuantyHttpRequest(req, res, rawUrl, origin = '') {
    const parsedUrl =
      rawUrl instanceof URL
        ? rawUrl
        : new URL(
            String(rawUrl || req.url || '/'),
            origin || 'http://127.0.0.1:3008',
          )
    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/'
    const method = String(req.method || 'GET').toUpperCase()

    const isQuantyRoute =
      pathname === '/mcp' ||
      pathname === '/mcp/invoke' ||
      pathname === '/api/quantzing/quanty/manifest' ||
      pathname === '/api/quantzing/quanty/execute' ||
      pathname === '/api/quantzing/quanty/chat' ||
      pathname === '/api/quantzing/quanty/threads' ||
      pathname.startsWith('/api/quantzing/quanty/threads/')

    if (!isQuantyRoute) {
      return false
    }

    if (method === 'OPTIONS') {
      replyJson(res, 200, {ok: true})
      return true
    }

    try {
      // Manifest / MCP Discovery
      if (
        method === 'GET' &&
        (pathname === '/api/quantzing/quanty/manifest' || pathname === '/mcp')
      ) {
        const manifest = await buildManifestPayload(req)
        replyJson(res, 200, manifest)
        return true
      }

      // Execute / MCP Invoke (REST + JSON-RPC 2.0)
      if (
        method === 'POST' &&
        (pathname === '/api/quantzing/quanty/execute' ||
          pathname === '/mcp/invoke' ||
          pathname === '/mcp')
      ) {
        await handleExecuteOrMcpInvoke(req, res, origin || parsedUrl.origin)
        return true
      }

      // Conversational Tool-Orchestrated Chat
      if (method === 'POST' && pathname === '/api/quantzing/quanty/chat') {
        await handleChat(req, res, origin || parsedUrl.origin)
        return true
      }

      // Persisted Quanty Threads (strictly scoped to auth.did)
      if (pathname === '/api/quantzing/quanty/threads') {
        const auth = resolveAuth(req)
        if (!auth) {
          replyJson(res, 401, {
            ok: false,
            error: 'AuthenticationRequired',
            message: 'Sign in to access saved Quanty threads.',
          })
          return true
        }
        if (method === 'GET') {
          const limit = clampInt(parsedUrl.searchParams.get('limit'), 1, 50, 30)
          const list = threads.listThreads(auth.did, limit)
          replyJson(res, 200, {ok: true, threads: list})
          return true
        }
        if (method === 'POST') {
          const body = await parseBody(req)
          const thread = threads.createThread({
            did: auth.did,
            title: body.title,
            mode: body.mode || 'ask',
            postContext: body.postContext || null,
          })
          replyJson(res, 201, {ok: true, thread})
          return true
        }
      }

      const threadMessagesMatch = pathname.match(
        /^\/api\/quantzing\/quanty\/threads\/([^/]+)\/messages$/,
      )
      if (threadMessagesMatch && method === 'POST') {
        const auth = resolveAuth(req)
        if (!auth) {
          replyJson(res, 401, {
            ok: false,
            error: 'AuthenticationRequired',
            message: 'Sign in to save messages to a Quanty thread.',
          })
          return true
        }
        const threadId = decodeURIComponent(threadMessagesMatch[1])
        const body = await parseBody(req)
        const appended = threads.appendMessage(auth.did, threadId, body)
        if (!appended) {
          replyJson(res, 404, {
            ok: false,
            error: 'NotFound',
            message: 'Quanty thread not found.',
          })
          return true
        }
        replyJson(res, 201, {
          ok: true,
          message: appended.message,
          thread: appended.thread,
        })
        return true
      }

      const threadIdMatch = pathname.match(
        /^\/api\/quantzing\/quanty\/threads\/([^/]+)$/,
      )
      if (threadIdMatch) {
        const auth = resolveAuth(req)
        if (!auth) {
          replyJson(res, 401, {
            ok: false,
            error: 'AuthenticationRequired',
            message: 'Sign in to access saved Quanty threads.',
          })
          return true
        }
        const threadId = decodeURIComponent(threadIdMatch[1])
        if (method === 'GET') {
          const detail = threads.getThread(auth.did, threadId)
          if (!detail) {
            replyJson(res, 404, {
              ok: false,
              error: 'NotFound',
              message: 'Quanty thread not found.',
            })
            return true
          }
          replyJson(res, 200, {
            ok: true,
            thread: detail.thread,
            messages: detail.messages,
          })
          return true
        }
        if (method === 'DELETE') {
          const deleted = threads.deleteThread(auth.did, threadId)
          if (!deleted) {
            replyJson(res, 404, {
              ok: false,
              error: 'NotFound',
              message: 'Quanty thread not found.',
            })
            return true
          }
          replyJson(res, 200, {ok: true, deleted: true, id: threadId})
          return true
        }
      }

      replyJson(res, 405, {
        ok: false,
        error: 'MethodNotAllowed',
        message: `${method} is not supported on ${pathname}`,
      })
      return true
    } catch (err) {
      replyJson(res, 500, {
        ok: false,
        error: 'InternalError',
        message:
          err instanceof Error ? err.message : 'Unexpected Quanty bridge error',
      })
      return true
    }
  }

  return {
    handleQuantyHttpRequest,
    buildQuantyMentionReply,
    executeTool,
    buildManifestPayload,
    tools: QUANTY_TOOLS,
  }
}
