import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const QUANTZING_DOMAIN = '.quantzing.com'
const QUANTZING_ALT_DOMAIN = '.quantzing.in'
const VIEW_FLUSH_INTERVAL_MS = 2500
const MAX_RECENT_VIEW_CACHE = 50_000
const MAX_AUDIT_LOG_ROWS = 10_000

const storeCache = new Map()

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

export function computeDefaultDataDir() {
  return (
    process.env.QUANTZING_DATA_DIR ||
    path.resolve(__dirname, '..', '.quantzing-data')
  )
}

export function computeDefaultSqlitePath(dataDir = computeDefaultDataDir()) {
  return path.join(path.resolve(dataDir), 'quantzing.sqlite')
}

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === '') return fallback
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return fallback
  }
}

export function parseAtUriRaw(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('at://')) return null
  const rest = uri.slice('at://'.length)
  const parts = rest.split('/')
  if (parts.length < 3) return null
  return {
    repo: parts[0],
    collection: parts[1],
    rkey: parts.slice(2).join('/'),
  }
}

export function extractHashtagsFromText(text) {
  const str = String(text || '')
  const out = []
  const seen = new Set()
  const re = /(^|\s)(#[A-Za-z][A-Za-z0-9_]{1,40})/g
  let m
  while ((m = re.exec(str)) !== null) {
    const displayTag = m[2]
    const tag = displayTag.slice(1).toLowerCase()
    if (!seen.has(tag)) {
      seen.add(tag)
      out.push({tag, displayTag})
    }
  }
  return out
}

export function extractMentionsFromText(text) {
  const str = String(text || '')
  const out = []
  const seen = new Set()
  const re = /(^|\s)@([a-zA-Z0-9][a-zA-Z0-9.-]{0,252})/g
  let m
  while ((m = re.exec(str)) !== null) {
    const raw = m[2].replace(/[.,!?;:]+$/, '').toLowerCase()
    if (raw && !seen.has(raw)) {
      seen.add(raw)
      out.push(raw)
    }
  }
  return out
}

export function sanitizeFtsQuery(raw) {
  const tokens = String(raw || '')
    .trim()
    .replace(/[#@]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u0900-\u097F-]/g, ''))
    .filter(t => t.length >= 1)
    .slice(0, 8)
  if (tokens.length === 0) return ''
  return tokens.map(t => `"${t.replace(/"/g, '')}"*`).join(' AND ')
}

function isVideoEmbedValue(embed) {
  if (!embed || typeof embed !== 'object') return false
  if (embed.$type === 'app.bsky.embed.video') return true
  if (
    embed.$type === 'app.bsky.embed.recordWithMedia' &&
    embed.media?.$type === 'app.bsky.embed.video'
  ) {
    return true
  }
  return false
}

function isMediaEmbedValue(embed) {
  if (!embed || typeof embed !== 'object') return false
  const t = embed.$type
  if (
    t === 'app.bsky.embed.images' ||
    t === 'app.bsky.embed.video' ||
    t === 'app.bsky.embed.gallery'
  ) {
    return true
  }
  if (t === 'app.bsky.embed.recordWithMedia') {
    const mt = embed.media?.$type
    return (
      mt === 'app.bsky.embed.images' ||
      mt === 'app.bsky.embed.video' ||
      mt === 'app.bsky.embed.gallery'
    )
  }
  return false
}

function extractQuoteUriFromValue(value) {
  const emb = value?.embed
  if (!emb || typeof emb !== 'object') return null
  if (emb.$type === 'app.bsky.embed.record' && emb.record?.uri) {
    return String(emb.record.uri)
  }
  if (
    emb.$type === 'app.bsky.embed.recordWithMedia' &&
    emb.record?.record?.uri
  ) {
    return String(emb.record.record.uri)
  }
  if (emb.record?.uri) return String(emb.record.uri)
  if (emb.record?.record?.uri) return String(emb.record.record.uri)
  return null
}

function makeSlug(raw, suffix = '') {
  const base = String(raw || 'space')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
  const tail = suffix || crypto.randomBytes(3).toString('hex')
  return `${base || 'space'}-${tail}`
}

function estimateReadTimeMinutes(body) {
  const words = String(body || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.ceil(words / 210))
}

// ---------------------------------------------------------------------------
// Schema DDL (SQLite WAL + O(1) Covering Indexes + FTS5)
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kv_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_json TEXT,
  banner_json TEXT,
  pronouns TEXT,
  website TEXT,
  pinned_post_json TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  department TEXT NOT NULL DEFAULT '',
  token_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT NOT NULL DEFAULT '',
  suspended_until TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  verified INTEGER NOT NULL DEFAULT 0,
  is_official INTEGER NOT NULL DEFAULT 0,
  is_system_quanty INTEGER NOT NULL DEFAULT 0,
  email_confirmed INTEGER NOT NULL DEFAULT 1,
  email_auth_factor INTEGER NOT NULL DEFAULT 0,
  offboarded_at TEXT,
  last_ops_login_at TEXT,
  notifications_seen_at TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  preferences_json TEXT NOT NULL DEFAULT '[]',
  notification_preferences_json TEXT NOT NULL DEFAULT '{}',
  extra_json TEXT NOT NULL DEFAULT '{}',
  followers_count INTEGER NOT NULL DEFAULT 0,
  follows_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_unique
  ON accounts(email COLLATE NOCASE) WHERE email IS NOT NULL AND email != '';
CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

CREATE TABLE IF NOT EXISTS preferences (
  did TEXT PRIMARY KEY,
  preferences_json TEXT NOT NULL DEFAULT '[]',
  notification_preferences_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  did TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  cid TEXT NOT NULL,
  value_json TEXT NOT NULL,
  text_content TEXT NOT NULL DEFAULT '',
  subject_uri TEXT,
  subject_did TEXT,
  root_uri TEXT,
  parent_uri TEXT,
  quote_uri TEXT,
  list_uri TEXT,
  is_reply INTEGER NOT NULL DEFAULT 0,
  has_video INTEGER NOT NULL DEFAULT 0,
  has_media INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (did, collection, rkey)
);

CREATE INDEX IF NOT EXISTS idx_records_col_created
  ON records(collection, created_at DESC, uri DESC);
CREATE INDEX IF NOT EXISTS idx_records_did_col_created
  ON records(did, collection, created_at DESC, uri DESC);
CREATE INDEX IF NOT EXISTS idx_records_subject_uri
  ON records(collection, subject_uri, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_subject_did
  ON records(collection, subject_did, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_parent_uri
  ON records(parent_uri, indexed_at ASC);
CREATE INDEX IF NOT EXISTS idx_records_root_uri
  ON records(root_uri, indexed_at ASC);
CREATE INDEX IF NOT EXISTS idx_records_quote_uri
  ON records(quote_uri, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_list_uri
  ON records(list_uri, subject_did);
CREATE INDEX IF NOT EXISTS idx_records_video_posts
  ON records(created_at DESC) WHERE collection = 'app.bsky.feed.post' AND has_video = 1;
CREATE INDEX IF NOT EXISTS idx_records_user_rx
  ON records(did, collection, subject_uri) WHERE subject_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_edge
  ON records(did, collection, subject_did) WHERE subject_did IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_counters (
  uri TEXT PRIMARY KEY,
  like_count INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_tags (
  tag TEXT NOT NULL,
  display_tag TEXT NOT NULL,
  uri TEXT NOT NULL,
  did TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tag, uri)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_created
  ON post_tags(created_at DESC, tag);
CREATE INDEX IF NOT EXISTS idx_post_tags_uri
  ON post_tags(uri);

CREATE TABLE IF NOT EXISTS post_views_dedup (
  uri TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (uri, viewer_key)
);

CREATE TABLE IF NOT EXISTS blobs (
  cid TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  did TEXT NOT NULL,
  uri TEXT NOT NULL,
  cid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (did, uri)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_did_created
  ON bookmarks(did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_uri
  ON bookmarks(uri);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_did_updated
  ON drafts(did, updated_at DESC);

CREATE TABLE IF NOT EXISTS mutes (
  viewer_did TEXT NOT NULL,
  target_did TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (viewer_did, target_did)
);

CREATE TABLE IF NOT EXISTS muted_lists (
  viewer_did TEXT NOT NULL,
  list_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (viewer_did, list_uri)
);

CREATE TABLE IF NOT EXISTS muted_threads (
  viewer_did TEXT NOT NULL,
  root_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (viewer_did, root_uri)
);

CREATE TABLE IF NOT EXISTS blocks (
  viewer_did TEXT NOT NULL,
  target_did TEXT NOT NULL,
  record_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (viewer_did, target_did)
);

CREATE INDEX IF NOT EXISTS idx_blocks_target
  ON blocks(target_did, viewer_did);

CREATE TABLE IF NOT EXISTS convos (
  id TEXT PRIMARY KEY,
  member_key TEXT NOT NULL UNIQUE,
  rev TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS convo_members (
  convo_id TEXT NOT NULL REFERENCES convos(id) ON DELETE CASCADE,
  did TEXT NOT NULL,
  read_rev TEXT NOT NULL DEFAULT '',
  muted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accepted',
  left_at TEXT,
  PRIMARY KEY (convo_id, did)
);

CREATE INDEX IF NOT EXISTS idx_convo_members_did
  ON convo_members(did, convo_id);

CREATE TABLE IF NOT EXISTS convo_messages (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convos(id) ON DELETE CASCADE,
  rev TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  text TEXT NOT NULL,
  facets_json TEXT,
  embed_json TEXT,
  reactions_json TEXT NOT NULL DEFAULT '[]',
  deleted_for_json TEXT NOT NULL DEFAULT '[]',
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_convo_messages_convo_rev
  ON convo_messages(convo_id, rev DESC);

CREATE TABLE IF NOT EXISTS convo_logs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  convo_id TEXT NOT NULL REFERENCES convos(id) ON DELETE CASCADE,
  rev TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_did TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_convo_logs_convo_seq
  ON convo_logs(convo_id, seq ASC);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_did TEXT NOT NULL,
  actor_did TEXT NOT NULL,
  reason TEXT NOT NULL,
  uri TEXT NOT NULL,
  cid TEXT NOT NULL,
  reason_subject TEXT,
  record_json TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  UNIQUE(recipient_did, uri, reason)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(recipient_did, indexed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_uri
  ON notifications(uri);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp
  ON revoked_tokens(expires_at);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  reporter_did TEXT,
  reason_type TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL,
  subject_uri TEXT,
  subject_did TEXT,
  subject_cid TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  appellant_did TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS takedowns_posts (
  uri TEXT PRIMARY KEY,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS takedowns_accounts (
  did TEXT PRIMARY KEY,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  subject_key TEXT PRIMARY KEY,
  labels_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_did TEXT NOT NULL,
  actor_handle TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '127.0.0.1',
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ts
  ON audit_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_users (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  last_ops_login_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  jti TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  uri TEXT,
  cid TEXT,
  author_did TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  read_time_minutes INTEGER NOT NULL DEFAULT 1,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_status_pub
  ON articles(status, published_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_author
  ON articles(author_did, updated_at DESC);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  host_did TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',
  audio_mode TEXT NOT NULL DEFAULT 'webrtc_signaling',
  allow_recording INTEGER NOT NULL DEFAULT 0,
  co_host_enabled INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  scheduled_for TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spaces_status_updated
  ON spaces(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS space_participants (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  did TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'listener',
  hand_raised INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (space_id, did)
);

CREATE TABLE IF NOT EXISTS space_reactions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  did TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_space_reactions_space_time
  ON space_reactions(space_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_uri TEXT NOT NULL,
  voter_did TEXT NOT NULL,
  option_id TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  PRIMARY KEY (post_uri, voter_did)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_option
  ON poll_votes(post_uri, option_id);

CREATE TABLE IF NOT EXISTS pro_subscriptions (
  did TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  activated_at TEXT,
  expires_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  verified_badge INTEGER NOT NULL DEFAULT 0,
  order_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pro_orders (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_inr INTEGER NOT NULL DEFAULT 0,
  amount_usd INTEGER NOT NULL DEFAULT 0,
  checkout_url TEXT,
  provider_session_id TEXT,
  return_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pro_orders_did
  ON pro_orders(did, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_monetization (
  did TEXT PRIMARY KEY,
  enrolled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_enrolled',
  payout_method TEXT NOT NULL DEFAULT '',
  enrolled_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quanty_threads (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Quanty Chat',
  mode TEXT NOT NULL DEFAULT 'ask',
  context_uri TEXT,
  post_context_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quanty_threads_did
  ON quanty_threads(did, updated_at DESC);

CREATE TABLE IF NOT EXISTS quanty_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES quanty_threads(id) ON DELETE CASCADE,
  did TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask',
  origin TEXT NOT NULL DEFAULT 'quant-ai',
  provider TEXT,
  model TEXT,
  latency_ms INTEGER,
  citations_json TEXT NOT NULL DEFAULT '[]',
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  tool_traces_json TEXT NOT NULL DEFAULT '[]',
  proposed_actions_json TEXT NOT NULL DEFAULT '[]',
  suggested_zing_draft TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quanty_messages_thread
  ON quanty_messages(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  did TEXT,
  handle TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_did
  ON support_tickets(did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS accounts_fts USING fts5(
  did UNINDEXED,
  handle,
  display_name,
  description,
  tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  uri UNINDEXED,
  did UNINDEXED,
  text_content,
  tokenize='unicode61'
);
`

// ---------------------------------------------------------------------------
// QuantZingStore Class
// ---------------------------------------------------------------------------

export class QuantZingStore {
  constructor(dataDir = computeDefaultDataDir()) {
    this.dataDir = path.resolve(dataDir)
    this.sqlitePath = path.join(this.dataDir, 'quantzing.sqlite')
    this.legacyJsonPath = path.join(this.dataDir, 'db.json')
    this.blobsDir = path.join(this.dataDir, 'blobs')
    this.closed = false

    fs.mkdirSync(this.dataDir, {recursive: true})
    fs.mkdirSync(this.blobsDir, {recursive: true})

    const sqliteExistedBeforeOpen = fs.existsSync(this.sqlitePath)

    this.db = new DatabaseSync(this.sqlitePath)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
    `)
    this.db.exec(SCHEMA_SQL)
    for (const alterSql of [
      "ALTER TABLE quanty_threads ADD COLUMN mode TEXT NOT NULL DEFAULT 'ask'",
      'ALTER TABLE quanty_threads ADD COLUMN post_context_json TEXT',
      'ALTER TABLE quanty_messages ADD COLUMN did TEXT',
      "ALTER TABLE quanty_messages ADD COLUMN mode TEXT NOT NULL DEFAULT 'ask'",
      'ALTER TABLE quanty_messages ADD COLUMN model TEXT',
      'ALTER TABLE quanty_messages ADD COLUMN latency_ms INTEGER',
      "ALTER TABLE quanty_messages ADD COLUMN tool_traces_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE quanty_messages ADD COLUMN proposed_actions_json TEXT NOT NULL DEFAULT '[]'",
      'ALTER TABLE quanty_messages ADD COLUMN suggested_zing_draft TEXT',
    ]) {
      try {
        this.db.exec(alterSql)
      } catch {}
    }

    // In-memory batched view queue (ZERO disk writes on GET requests!)
    this.pendingViews = new Map() // uri -> Set<viewerKey>
    this.pendingViewOverlay = new Map() // uri -> number (unflushed unique views)
    this.recentViewKeys = new Set() // `${uri}\0${viewerKey}` bounded cache
    this.lastRevokedPruneMs = 0

    // Prepare hot-path statements
    this._prepareStatements()

    // Automatic zero-loss migration from legacy db.json (FAIL-CLOSED on corrupt JSON!)
    try {
      this.migrationReport = this._maybeMigrateFromLegacyJson()
    } catch (err) {
      try {
        this.db.close()
      } catch {}
      this.closed = true
      if (!sqliteExistedBeforeOpen) {
        for (const suffix of ['', '-wal', '-shm']) {
          try {
            fs.unlinkSync(`${this.sqlitePath}${suffix}`)
          } catch {}
        }
      }
      throw err
    }

    // Ensure jwtSecret exists
    if (!this.getMeta('jwt_secret')) {
      this.setMeta('jwt_secret', crypto.randomBytes(32).toString('hex'))
    }
    if (!this.getMeta('version')) {
      this.setMeta('version', '3')
    }

    // Async batched view flusher every 2.5s (unref'd so clean process exit works)
    this._flushTimer = setInterval(() => {
      try {
        this.flushPendingViews()
      } catch (err) {
        console.error('[QuantZingStore] Error flushing pending views:', err)
      }
    }, VIEW_FLUSH_INTERVAL_MS)
    if (typeof this._flushTimer.unref === 'function') {
      this._flushTimer.unref()
    }
  }

  _prepareStatements() {
    const db = this.db
    this._stmts = {
      getMeta: db.prepare('SELECT value FROM kv_meta WHERE key = ?'),
      setMeta: db.prepare(
        'INSERT INTO kv_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ),
      countAccounts: db.prepare('SELECT COUNT(*) AS cnt FROM accounts'),
      getAccountByDid: db.prepare('SELECT * FROM accounts WHERE did = ?'),
      getAccountByHandle: db.prepare(
        'SELECT * FROM accounts WHERE handle = ? COLLATE NOCASE',
      ),
      getAccountByEmail: db.prepare(
        'SELECT * FROM accounts WHERE email = ? COLLATE NOCASE',
      ),
      upsertAccount: db.prepare(`
        INSERT INTO accounts (
          did, handle, email, password_salt, password_hash,
          display_name, description, avatar_json, banner_json, pronouns, website, pinned_post_json,
          role, department, token_version, status, status_reason, suspended_until,
          active, verified, is_official, is_system_quanty, email_confirmed, email_auth_factor,
          offboarded_at, last_ops_login_at, notifications_seen_at,
          warnings_json, preferences_json, notification_preferences_json, extra_json,
          followers_count, follows_count, posts_count, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
        ON CONFLICT(did) DO UPDATE SET
          handle = excluded.handle,
          email = excluded.email,
          password_salt = excluded.password_salt,
          password_hash = excluded.password_hash,
          display_name = excluded.display_name,
          description = excluded.description,
          avatar_json = excluded.avatar_json,
          banner_json = excluded.banner_json,
          pronouns = excluded.pronouns,
          website = excluded.website,
          pinned_post_json = excluded.pinned_post_json,
          role = excluded.role,
          department = excluded.department,
          token_version = excluded.token_version,
          status = excluded.status,
          status_reason = excluded.status_reason,
          suspended_until = excluded.suspended_until,
          active = excluded.active,
          verified = excluded.verified,
          is_official = excluded.is_official,
          is_system_quanty = excluded.is_system_quanty,
          email_confirmed = excluded.email_confirmed,
          email_auth_factor = excluded.email_auth_factor,
          offboarded_at = excluded.offboarded_at,
          last_ops_login_at = excluded.last_ops_login_at,
          notifications_seen_at = excluded.notifications_seen_at,
          warnings_json = excluded.warnings_json,
          preferences_json = excluded.preferences_json,
          notification_preferences_json = excluded.notification_preferences_json,
          extra_json = excluded.extra_json,
          updated_at = excluded.updated_at
      `),
      upsertPreferences: db.prepare(`
        INSERT INTO preferences (did, preferences_json, notification_preferences_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(did) DO UPDATE SET
          preferences_json = excluded.preferences_json,
          notification_preferences_json = excluded.notification_preferences_json,
          updated_at = excluded.updated_at
      `),
      deleteAccountFts: db.prepare('DELETE FROM accounts_fts WHERE did = ?'),
      insertAccountFts: db.prepare(
        'INSERT INTO accounts_fts(did, handle, display_name, description) VALUES (?, ?, ?, ?)',
      ),
      getRecord: db.prepare(
        'SELECT * FROM records WHERE did = ? AND collection = ? AND rkey = ?',
      ),
      getRecordByUri: db.prepare('SELECT * FROM records WHERE uri = ?'),
      upsertRecord: db.prepare(`
        INSERT INTO records (
          did, collection, rkey, uri, cid, value_json, text_content,
          subject_uri, subject_did, root_uri, parent_uri, quote_uri, list_uri,
          is_reply, has_video, has_media, created_at, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(did, collection, rkey) DO UPDATE SET
          uri = excluded.uri,
          cid = excluded.cid,
          value_json = excluded.value_json,
          text_content = excluded.text_content,
          subject_uri = excluded.subject_uri,
          subject_did = excluded.subject_did,
          root_uri = excluded.root_uri,
          parent_uri = excluded.parent_uri,
          quote_uri = excluded.quote_uri,
          list_uri = excluded.list_uri,
          is_reply = excluded.is_reply,
          has_video = excluded.has_video,
          has_media = excluded.has_media,
          created_at = excluded.created_at,
          indexed_at = excluded.indexed_at
      `),
      deleteRecord: db.prepare(
        'DELETE FROM records WHERE did = ? AND collection = ? AND rkey = ?',
      ),
      deletePostFts: db.prepare('DELETE FROM posts_fts WHERE uri = ?'),
      insertPostFts: db.prepare(
        'INSERT INTO posts_fts(uri, did, text_content) VALUES (?, ?, ?)',
      ),
      deletePostTags: db.prepare('DELETE FROM post_tags WHERE uri = ?'),
      insertPostTag: db.prepare(
        'INSERT OR IGNORE INTO post_tags(tag, display_tag, uri, did, created_at) VALUES (?, ?, ?, ?, ?)',
      ),
      ensurePostCounter: db.prepare(
        'INSERT OR IGNORE INTO post_counters(uri) VALUES (?)',
      ),
      getPostCounter: db.prepare('SELECT * FROM post_counters WHERE uri = ?'),
      bumpLikeCount: db.prepare(`
        INSERT INTO post_counters(uri, like_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET like_count = MAX(0, like_count + ?)
      `),
      bumpRepostCount: db.prepare(`
        INSERT INTO post_counters(uri, repost_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET repost_count = MAX(0, repost_count + ?)
      `),
      bumpReplyCount: db.prepare(`
        INSERT INTO post_counters(uri, reply_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET reply_count = MAX(0, reply_count + ?)
      `),
      bumpQuoteCount: db.prepare(`
        INSERT INTO post_counters(uri, quote_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET quote_count = MAX(0, quote_count + ?)
      `),
      bumpBookmarkCount: db.prepare(`
        INSERT INTO post_counters(uri, bookmark_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET bookmark_count = MAX(0, bookmark_count + ?)
      `),
      bumpViewCount: db.prepare(`
        INSERT INTO post_counters(uri, view_count) VALUES (?, MAX(0, ?))
        ON CONFLICT(uri) DO UPDATE SET view_count = MAX(0, view_count + ?)
      `),
      insertViewDedup: db.prepare(
        'INSERT OR IGNORE INTO post_views_dedup(uri, viewer_key, viewed_at) VALUES (?, ?, ?)',
      ),
      bumpAccountPosts: db.prepare(
        'UPDATE accounts SET posts_count = MAX(0, posts_count + ?) WHERE did = ?',
      ),
      bumpAccountFollows: db.prepare(
        'UPDATE accounts SET follows_count = MAX(0, follows_count + ?) WHERE did = ?',
      ),
      bumpAccountFollowers: db.prepare(
        'UPDATE accounts SET followers_count = MAX(0, followers_count + ?) WHERE did = ?',
      ),
      findUserReaction: db.prepare(
        'SELECT uri, rkey FROM records WHERE did = ? AND collection = ? AND subject_uri = ? LIMIT 1',
      ),
      findUserFollow: db.prepare(
        "SELECT uri, rkey FROM records WHERE did = ? AND collection = 'app.bsky.graph.follow' AND subject_did = ? LIMIT 1",
      ),
      findBlock: db.prepare(
        'SELECT record_uri FROM blocks WHERE viewer_did = ? AND target_did = ? LIMIT 1',
      ),
      upsertBlock: db.prepare(
        'INSERT OR REPLACE INTO blocks(viewer_did, target_did, record_uri, created_at) VALUES (?, ?, ?, ?)',
      ),
      deleteBlock: db.prepare(
        'DELETE FROM blocks WHERE viewer_did = ? AND target_did = ?',
      ),
      isMuted: db.prepare(
        'SELECT 1 AS ok FROM mutes WHERE viewer_did = ? AND target_did = ? LIMIT 1',
      ),
      isThreadMuted: db.prepare(
        'SELECT 1 AS ok FROM muted_threads WHERE viewer_did = ? AND root_uri = ? LIMIT 1',
      ),
      isListMuted: db.prepare(
        'SELECT 1 AS ok FROM muted_lists WHERE viewer_did = ? AND list_uri = ? LIMIT 1',
      ),
      isBookmarked: db.prepare(
        'SELECT 1 AS ok FROM bookmarks WHERE did = ? AND uri = ? LIMIT 1',
      ),
      isPostTakedown: db.prepare(
        'SELECT 1 AS ok FROM takedowns_posts WHERE uri = ? LIMIT 1',
      ),
      getLabels: db.prepare(
        'SELECT labels_json FROM labels WHERE subject_key = ?',
      ),
      getBlob: db.prepare('SELECT * FROM blobs WHERE cid = ?'),
      upsertBlob: db.prepare(`
        INSERT OR REPLACE INTO blobs(cid, did, mime_type, size, created_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      isRevoked: db.prepare(
        'SELECT expires_at FROM revoked_tokens WHERE jti = ? LIMIT 1',
      ),
      insertRevoked: db.prepare(
        'INSERT OR REPLACE INTO revoked_tokens(jti, expires_at, revoked_at) VALUES (?, ?, ?)',
      ),
      pruneRevoked: db.prepare(
        'DELETE FROM revoked_tokens WHERE expires_at > 0 AND expires_at < ?',
      ),
      insertNotification: db.prepare(`
        INSERT OR IGNORE INTO notifications(
          recipient_did, actor_did, reason, uri, cid, reason_subject, record_json, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      deleteNotificationsByUri: db.prepare(
        'DELETE FROM notifications WHERE uri = ?',
      ),
      deleteNotificationsByReasonSubject: db.prepare(
        'DELETE FROM notifications WHERE reason_subject = ?',
      ),
      deleteBookmarksByUri: db.prepare('DELETE FROM bookmarks WHERE uri = ?'),
      deletePostCounterByUri: db.prepare(
        'DELETE FROM post_counters WHERE uri = ?',
      ),
      deletePostViewsByUri: db.prepare(
        'DELETE FROM post_views_dedup WHERE uri = ?',
      ),
      deletePollVotesByUri: db.prepare(
        'DELETE FROM poll_votes WHERE post_uri = ?',
      ),
      isAuthorInMutedOrBlockedList: db.prepare(`
        SELECT 1 AS ok FROM records li
        WHERE li.collection = 'app.bsky.graph.listitem'
          AND li.subject_did = ?
          AND (
            EXISTS (
              SELECT 1 FROM muted_lists ml
              WHERE ml.viewer_did = ? AND ml.list_uri = li.list_uri
            )
            OR EXISTS (
              SELECT 1 FROM records lb
              WHERE lb.did = ?
                AND lb.collection = 'app.bsky.graph.listblock'
                AND lb.subject_uri = li.list_uri
            )
          )
        LIMIT 1
      `),
      upsertStaffUser: db.prepare(`
        INSERT INTO staff_users(did, handle, role, department, status, last_ops_login_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(did) DO UPDATE SET
          handle = excluded.handle,
          role = excluded.role,
          department = excluded.department,
          status = excluded.status,
          last_ops_login_at = excluded.last_ops_login_at,
          updated_at = excluded.updated_at
      `),
      deleteStaffUser: db.prepare('DELETE FROM staff_users WHERE did = ?'),
    }
  }

  // -------------------------------------------------------------------------
  // Transaction & Meta Helpers
  // -------------------------------------------------------------------------

  inTransaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      try {
        this.db.exec('ROLLBACK')
      } catch {}
      throw err
    }
  }

  getMeta(key, fallback = null) {
    const row = this._stmts.getMeta.get(String(key))
    return row ? row.value : fallback
  }

  setMeta(key, value) {
    this._stmts.setMeta.run(String(key), String(value))
  }

  getJwtSecret() {
    let secret = this.getMeta('jwt_secret')
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex')
      this.setMeta('jwt_secret', secret)
    }
    return secret
  }

  getAccountCount() {
    const row = this._stmts.countAccounts.get()
    return Number(row?.cnt || 0)
  }

  // -------------------------------------------------------------------------
  // Sharded Blob File Paths (Backwards-compatible with flat blobs/<cid>)
  // -------------------------------------------------------------------------

  getShardedBlobPath(cid) {
    const clean = String(cid || '')
    const p1 = clean.slice(0, 2) || '00'
    const p2 = clean.slice(2, 4) || '00'
    return path.join(this.blobsDir, p1, p2, clean)
  }

  getLegacyBlobPath(cid) {
    return path.join(this.blobsDir, String(cid || ''))
  }

  resolveExistingBlobPath(cid) {
    const sharded = this.getShardedBlobPath(cid)
    if (fs.existsSync(sharded)) return sharded
    const legacy = this.getLegacyBlobPath(cid)
    if (fs.existsSync(legacy)) return legacy
    return null
  }

  ensureBlobWritePath(cid) {
    const sharded = this.getShardedBlobPath(cid)
    fs.mkdirSync(path.dirname(sharded), {recursive: true})
    return sharded
  }

  getBlobMeta(cid) {
    const row = this._stmts.getBlob.get(String(cid || ''))
    if (!row) return null
    return {
      cid: row.cid,
      did: row.did,
      mimeType: row.mime_type,
      size: Number(row.size || 0),
      createdAt: row.created_at,
    }
  }

  putBlobMeta({cid, did, mimeType, size, createdAt = new Date().toISOString()}) {
    this._stmts.upsertBlob.run(
      String(cid),
      String(did || ''),
      String(mimeType || 'application/octet-stream'),
      Number(size || 0),
      createdAt,
    )
  }

  // -------------------------------------------------------------------------
  // Account Operations (O(1) Indexed + FTS5)
  // -------------------------------------------------------------------------

  _rowToAccount(row) {
    if (!row) return null
    const extra = safeJsonParse(row.extra_json, {})
    const profile = {
      ...(extra.profile || {}),
      displayName: row.display_name ?? '',
      description: row.description || '',
      avatar: safeJsonParse(row.avatar_json, null),
      banner: safeJsonParse(row.banner_json, null),
      ...(row.pronouns ? {pronouns: row.pronouns} : {}),
      ...(row.website ? {website: row.website} : {}),
      ...(row.pinned_post_json
        ? {pinnedPost: safeJsonParse(row.pinned_post_json, null)}
        : {}),
      ...(Array.isArray(extra.profileLinks)
        ? {links: extra.profileLinks}
        : {}),
      createdAt: extra.profileCreatedAt || row.created_at,
    }
    return {
      ...extra,
      did: row.did,
      handle: row.handle,
      email: row.email || undefined,
      passwordSalt: row.password_salt,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      active: row.active !== 0,
      role: row.role || 'user',
      department: row.department || '',
      tokenVersion: Number(row.token_version) || 1,
      status: row.status || 'active',
      statusReason: row.status_reason || '',
      suspendedUntil: row.suspended_until || null,
      verified: Boolean(row.verified),
      staffVerified: Boolean(extra.staffVerified),
      isOfficial: Boolean(row.is_official),
      officialAccount: Boolean(extra.officialAccount || row.is_official),
      isSystemQuanty: Boolean(row.is_system_quanty),
      emailConfirmed: row.email_confirmed !== 0,
      emailAuthFactor: Boolean(row.email_auth_factor),
      offboardedAt: row.offboarded_at || null,
      lastOpsLoginAt: row.last_ops_login_at || null,
      notificationsSeenAt: row.notifications_seen_at || undefined,
      warnings: safeJsonParse(row.warnings_json, []),
      preferences: safeJsonParse(row.preferences_json, []),
      notificationPreferences: safeJsonParse(
        row.notification_preferences_json,
        {},
      ),
      chatNotificationPreferences:
        extra.chatNotificationPreferences || undefined,
      appPasswords: Array.isArray(extra.appPasswords) ? extra.appPasswords : [],
      deactivatedAt: extra.deactivatedAt || null,
      deleteAfter: extra.deleteAfter || null,
      profile,
      followersCount: Number(row.followers_count || 0),
      followsCount: Number(row.follows_count || 0),
      postsCount: Number(row.posts_count || 0),
    }
  }

  getAccountByDid(did) {
    if (!did) return null
    return this._rowToAccount(this._stmts.getAccountByDid.get(String(did)))
  }

  findAccount(identifierOrDid) {
    if (!identifierOrDid) return null
    const raw = String(identifierOrDid).trim()
    if (!raw) return null
    if (raw.startsWith('did:')) {
      const byDid = this.getAccountByDid(raw)
      if (byDid) return byDid
    }
    const lower = raw.toLowerCase().replace(/^@/, '')
    let row = this._stmts.getAccountByHandle.get(lower)
    if (!row && !lower.includes('.')) {
      row =
        this._stmts.getAccountByHandle.get(`${lower}${QUANTZING_DOMAIN}`) ||
        this._stmts.getAccountByHandle.get(`${lower}${QUANTZING_ALT_DOMAIN}`)
    }
    if (!row && lower.includes('@')) {
      row = this._stmts.getAccountByEmail.get(lower)
    }
    return this._rowToAccount(row)
  }

  findAccountByEmail(email) {
    if (!email) return null
    return this._rowToAccount(
      this._stmts.getAccountByEmail.get(String(email).trim().toLowerCase()),
    )
  }

  listAllAccounts() {
    return this.db
      .prepare('SELECT * FROM accounts ORDER BY created_at DESC')
      .all()
      .map(r => this._rowToAccount(r))
  }

  upsertAccount(account) {
    if (!account?.did) throw new Error('Account did is required')
    const now = new Date().toISOString()
    const profile = account.profile || {}
    const existing = this._stmts.getAccountByDid.get(account.did)
    const existingExtra = existing ? safeJsonParse(existing.extra_json, {}) : {}
    const createdAt = account.createdAt || existing?.created_at || now
    const email =
      account.email && String(account.email).trim()
        ? String(account.email).trim().toLowerCase()
        : null
    const extra = {
      profileCreatedAt:
        profile.createdAt || existingExtra.profileCreatedAt || createdAt,
      ...(Array.isArray(profile.links) ? {profileLinks: profile.links} : {}),
      ...(account.staffVerified === true
        ? {staffVerified: true}
        : account.staffVerified === false
          ? {}
          : existingExtra.staffVerified === true
            ? {staffVerified: true}
            : {}),
      ...(account.officialAccount === true || account.isOfficial === true
        ? {officialAccount: true}
        : account.officialAccount === false
          ? {}
          : existingExtra.officialAccount === true
            ? {officialAccount: true}
            : {}),
      ...(account.chatNotificationPreferences !== undefined
        ? {chatNotificationPreferences: account.chatNotificationPreferences}
        : existingExtra.chatNotificationPreferences !== undefined
          ? {
              chatNotificationPreferences:
                existingExtra.chatNotificationPreferences,
            }
          : {}),
      ...(Array.isArray(account.appPasswords)
        ? {appPasswords: account.appPasswords}
        : Array.isArray(existingExtra.appPasswords)
          ? {appPasswords: existingExtra.appPasswords}
          : {}),
      ...(account.deactivatedAt !== undefined
        ? account.deactivatedAt
          ? {deactivatedAt: account.deactivatedAt}
          : {}
        : existingExtra.deactivatedAt
          ? {deactivatedAt: existingExtra.deactivatedAt}
          : {}),
      ...(account.deleteAfter !== undefined
        ? account.deleteAfter
          ? {deleteAfter: account.deleteAfter}
          : {}
        : existingExtra.deleteAfter
          ? {deleteAfter: existingExtra.deleteAfter}
          : {}),
    }
    const prefsJson = JSON.stringify(
      Array.isArray(account.preferences) ? account.preferences : [],
    )
    const notifPrefsJson = JSON.stringify(
      account.notificationPreferences &&
        typeof account.notificationPreferences === 'object'
        ? account.notificationPreferences
        : {},
    )

    this._stmts.upsertAccount.run(
      String(account.did),
      String(account.handle || '').toLowerCase(),
      email,
      String(account.passwordSalt || 'system'),
      String(account.passwordHash || 'system'),
      String(profile.displayName || ''),
      String(profile.description || ''),
      profile.avatar ? JSON.stringify(profile.avatar) : null,
      profile.banner ? JSON.stringify(profile.banner) : null,
      profile.pronouns ? String(profile.pronouns) : null,
      profile.website ? String(profile.website) : null,
      profile.pinnedPost ? JSON.stringify(profile.pinnedPost) : null,
      String(account.role || 'user'),
      String(account.department || ''),
      Number(account.tokenVersion) || 1,
      String(account.status || 'active'),
      String(account.statusReason || ''),
      account.suspendedUntil || null,
      account.active === false ? 0 : 1,
      account.verified ? 1 : 0,
      account.isOfficial ? 1 : 0,
      account.isSystemQuanty ? 1 : 0,
      account.emailConfirmed === false ? 0 : 1,
      account.emailAuthFactor ? 1 : 0,
      account.offboardedAt || null,
      account.lastOpsLoginAt || null,
      account.notificationsSeenAt || null,
      JSON.stringify(Array.isArray(account.warnings) ? account.warnings : []),
      prefsJson,
      notifPrefsJson,
      JSON.stringify(extra),
      Number(existing?.followers_count ?? account.followersCount ?? 0),
      Number(existing?.follows_count ?? account.followsCount ?? 0),
      Number(existing?.posts_count ?? account.postsCount ?? 0),
      createdAt,
      now,
    )

    this._stmts.upsertPreferences.run(
      String(account.did),
      prefsJson,
      notifPrefsJson,
      now,
    )

    // Sync FTS5 index
    this._stmts.deleteAccountFts.run(String(account.did))
    this._stmts.insertAccountFts.run(
      String(account.did),
      String(account.handle || ''),
      String(profile.displayName || ''),
      String(profile.description || ''),
    )

    // Sync staff_users mirror
    const role = String(account.role || 'user')
    if (role !== 'user') {
      this._stmts.upsertStaffUser.run(
        String(account.did),
        String(account.handle || ''),
        role,
        String(account.department || ''),
        String(account.status || 'active'),
        account.lastOpsLoginAt || null,
        now,
      )
    } else {
      this._stmts.deleteStaffUser.run(String(account.did))
    }

    return this.getAccountByDid(account.did)
  }

  updateAccountPreferences(did, preferences) {
    const now = new Date().toISOString()
    const json = JSON.stringify(Array.isArray(preferences) ? preferences : [])
    this.db
      .prepare(
        'UPDATE accounts SET preferences_json = ?, updated_at = ? WHERE did = ?',
      )
      .run(json, now, String(did))
    const row = this._stmts.getAccountByDid.get(String(did))
    this._stmts.upsertPreferences.run(
      String(did),
      json,
      row?.notification_preferences_json || '{}',
      now,
    )
  }

  updateAccountNotificationPreferences(did, notificationPreferences) {
    const now = new Date().toISOString()
    const json = JSON.stringify(notificationPreferences || {})
    this.db
      .prepare(
        'UPDATE accounts SET notification_preferences_json = ?, updated_at = ? WHERE did = ?',
      )
      .run(json, now, String(did))
    const row = this._stmts.getAccountByDid.get(String(did))
    this._stmts.upsertPreferences.run(
      String(did),
      row?.preferences_json || '[]',
      json,
      now,
    )
  }

  updateNotificationsSeenAt(did, seenAt) {
    this.db
      .prepare(
        'UPDATE accounts SET notifications_seen_at = ?, updated_at = ? WHERE did = ?',
      )
      .run(String(seenAt), new Date().toISOString(), String(did))
  }

  updateAccountHandle(did, nextHandle) {
    const clean = String(nextHandle || '').toLowerCase()
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE accounts SET handle = ?, updated_at = ? WHERE did = ?')
      .run(clean, now, String(did))
    const acc = this.getAccountByDid(did)
    if (acc) {
      this._stmts.deleteAccountFts.run(String(did))
      this._stmts.insertAccountFts.run(
        String(did),
        acc.handle,
        acc.profile?.displayName || '',
        acc.profile?.description || '',
      )
      if (acc.role && acc.role !== 'user') {
        this._stmts.upsertStaffUser.run(
          acc.did,
          acc.handle,
          acc.role,
          acc.department || '',
          acc.status || 'active',
          acc.lastOpsLoginAt || null,
          now,
        )
      }
    }
  }

  setAccountVerified(did, verified) {
    this.db
      .prepare('UPDATE accounts SET verified = ?, updated_at = ? WHERE did = ?')
      .run(verified ? 1 : 0, new Date().toISOString(), String(did))
  }

  deleteTakedownAccount(did) {
    if (!did) return
    this.db
      .prepare('DELETE FROM takedowns_accounts WHERE did = ?')
      .run(String(did))
  }

  updateAccountPassword(did, salt, hash) {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE accounts SET password_salt = ?, password_hash = ?, token_version = COALESCE(token_version, 1) + 1, updated_at = ? WHERE did = ?',
      )
      .run(String(salt), String(hash), now, String(did))
    return this.getAccountByDid(did)
  }

  updateAccountEmail(did, email, {emailConfirmed, emailAuthFactor} = {}) {
    const now = new Date().toISOString()
    const cleanEmail = email ? String(email).trim().toLowerCase() : null
    const existing = this.getAccountByDid(did)
    if (!existing) return null
    const nextConfirmed =
      emailConfirmed !== undefined
        ? emailConfirmed
          ? 1
          : 0
        : existing.emailConfirmed !== false
          ? 1
          : 0
    const nextAuthFactor =
      emailAuthFactor !== undefined
        ? emailAuthFactor
          ? 1
          : 0
        : existing.emailAuthFactor
          ? 1
          : 0
    this.db
      .prepare(
        'UPDATE accounts SET email = ?, email_confirmed = ?, email_auth_factor = ?, updated_at = ? WHERE did = ?',
      )
      .run(cleanEmail, nextConfirmed, nextAuthFactor, now, String(did))
    return this.getAccountByDid(did)
  }

  setAccountActive(did, active, {deleteAfter = null} = {}) {
    const existing = this.getAccountByDid(did)
    if (!existing) return null
    existing.active = Boolean(active)
    existing.deactivatedAt = active ? null : new Date().toISOString()
    existing.deleteAfter = active ? null : deleteAfter || null
    return this.upsertAccount(existing)
  }

  getAllRecordsForRepo(did) {
    return this.db
      .prepare(
        'SELECT * FROM records WHERE did = ? ORDER BY collection ASC, rkey ASC',
      )
      .all(String(did))
      .map(r => this._rowToRecord(r))
  }

  deleteChatAccountData(did) {
    const targetDid = String(did)
    const now = new Date().toISOString()
    this.inTransaction(() => {
      this.db
        .prepare('UPDATE convo_members SET left_at = ? WHERE did = ?')
        .run(now, targetDid)
      this.db
        .prepare('DELETE FROM convo_messages WHERE sender_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM convo_logs WHERE actor_did = ?')
        .run(targetDid)
    })
  }

  exportChatAccountData(did) {
    const targetDid = String(did)
    const memberRows = this.db
      .prepare('SELECT convo_id FROM convo_members WHERE did = ?')
      .all(targetDid)
    const convoIds = memberRows.map(r => r.convo_id)
    const lines = []
    for (const convoId of convoIds) {
      const convo = this.getConvoById(convoId)
      if (!convo) continue
      lines.push(
        JSON.stringify({
          $type: 'chat.bsky.convo.defs#convoView',
          id: convo.id,
          rev: convo.rev,
          members: convo.allMemberDids,
          createdAt: convo.createdAt,
          updatedAt: convo.updatedAt,
        }),
      )
      const msgs = this.db
        .prepare(
          'SELECT * FROM convo_messages WHERE convo_id = ? ORDER BY rev ASC',
        )
        .all(convoId)
      for (const m of msgs) {
        const deletedFor = safeJsonParse(m.deleted_for_json, [])
        if (deletedFor.includes(targetDid)) continue
        lines.push(
          JSON.stringify({
            $type: 'chat.bsky.convo.defs#messageView',
            id: m.id,
            convoId: m.convo_id,
            rev: m.rev,
            sender: {did: m.sender_did},
            text: m.text,
            sentAt: m.sent_at,
          }),
        )
      }
    }
    return lines.join('\n') + (lines.length > 0 ? '\n' : '')
  }

  deleteAccountCompletely(did) {
    const targetDid = String(did)
    this.inTransaction(() => {
      const ownedPosts = this.db
        .prepare(
          "SELECT uri FROM records WHERE did = ? AND collection = 'app.bsky.feed.post'",
        )
        .all(targetDid)
      for (const p of ownedPosts) {
        this._stmts.deletePostFts.run(p.uri)
        this._stmts.deletePostTags.run(p.uri)
        this._stmts.deleteNotificationsByUri.run(p.uri)
        this._stmts.deleteNotificationsByReasonSubject.run(p.uri)
        this._stmts.deleteBookmarksByUri.run(p.uri)
        this._stmts.deletePostCounterByUri.run(p.uri)
        this._stmts.deletePostViewsByUri.run(p.uri)
        this._stmts.deletePollVotesByUri.run(p.uri)
      }
      this.db.prepare('DELETE FROM records WHERE did = ?').run(targetDid)
      this.db.prepare('DELETE FROM post_tags WHERE did = ?').run(targetDid)
      this.db.prepare('DELETE FROM bookmarks WHERE did = ?').run(targetDid)
      this.db.prepare('DELETE FROM drafts WHERE did = ?').run(targetDid)
      this.db
        .prepare('DELETE FROM mutes WHERE viewer_did = ? OR target_did = ?')
        .run(targetDid, targetDid)
      this.db
        .prepare('DELETE FROM muted_lists WHERE viewer_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM muted_threads WHERE viewer_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM blocks WHERE viewer_did = ? OR target_did = ?')
        .run(targetDid, targetDid)
      this.db
        .prepare(
          'DELETE FROM notifications WHERE recipient_did = ? OR actor_did = ?',
        )
        .run(targetDid, targetDid)
      this.db.prepare('DELETE FROM convo_members WHERE did = ?').run(targetDid)
      this.db
        .prepare('DELETE FROM convo_messages WHERE sender_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM convo_logs WHERE actor_did = ?')
        .run(targetDid)
      this.db.prepare('DELETE FROM preferences WHERE did = ?').run(targetDid)
      this.db.prepare('DELETE FROM staff_users WHERE did = ?').run(targetDid)
      this.db.prepare('DELETE FROM staff_sessions WHERE did = ?').run(targetDid)
      this.db
        .prepare('DELETE FROM articles WHERE author_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM space_participants WHERE did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM space_reactions WHERE did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM poll_votes WHERE voter_did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM pro_subscriptions WHERE did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM creator_monetization WHERE did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM quanty_threads WHERE did = ?')
        .run(targetDid)
      this.db
        .prepare('DELETE FROM takedowns_accounts WHERE did = ?')
        .run(targetDid)
      this._stmts.deleteAccountFts.run(targetDid)
      this.db.prepare('DELETE FROM accounts WHERE did = ?').run(targetDid)
    })
  }

  // -------------------------------------------------------------------------
  // Canonical AT-URI Resolution
  // -------------------------------------------------------------------------

  resolveAtUri(uri) {
    const parsed = parseAtUriRaw(uri)
    if (!parsed) return null
    const account = this.findAccount(parsed.repo)
    if (!account) return null
    return {
      did: account.did,
      handle: account.handle,
      repo: account.did,
      collection: parsed.collection,
      rkey: parsed.rkey,
      canonicalUri: `at://${account.did}/${parsed.collection}/${parsed.rkey}`,
      account,
    }
  }

  canonicalizeUri(uri) {
    if (!uri || typeof uri !== 'string') return ''
    const resolved = this.resolveAtUri(uri)
    return resolved?.canonicalUri || uri
  }

  // -------------------------------------------------------------------------
  // Records + Transactional Counters + Tags + Blocks + Notifications + FTS5
  // -------------------------------------------------------------------------

  _rowToRecord(row) {
    if (!row) return null
    return {
      uri: row.uri,
      cid: row.cid,
      rkey: row.rkey,
      collection: row.collection,
      repo: row.did,
      value: safeJsonParse(row.value_json, {}),
      indexedAt: row.indexed_at,
      createdAt: row.created_at,
    }
  }

  getRecord(did, collection, rkey) {
    return this._rowToRecord(
      this._stmts.getRecord.get(String(did), String(collection), String(rkey)),
    )
  }

  getRecordByUri(uri) {
    if (!uri) return null
    const canonical = this.canonicalizeUri(uri)
    return this._rowToRecord(this._stmts.getRecordByUri.get(canonical))
  }

  getRecordCountForRepo(did) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM records WHERE did = ?')
      .get(String(did))
    return Number(row?.cnt || 0)
  }

  getCollectionsForRepo(did) {
    return this.db
      .prepare(
        'SELECT DISTINCT collection FROM records WHERE did = ? ORDER BY collection ASC',
      )
      .all(String(did))
      .map(r => r.collection)
  }

  listRecordsForRepo(did, collection, {limit = 50, reverse = false, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const order = reverse ? 'ASC' : 'DESC'
    const cmp = reverse ? '>' : '<'
    const rows = cursor
      ? this.db
          .prepare(
            `SELECT * FROM records WHERE did = ? AND collection = ? AND rkey ${cmp} ? ORDER BY rkey ${order} LIMIT ?`,
          )
          .all(String(did), String(collection), String(cursor), lim + 1)
      : this.db
          .prepare(
            `SELECT * FROM records WHERE did = ? AND collection = ? ORDER BY rkey ${order} LIMIT ?`,
          )
          .all(String(did), String(collection), lim + 1)
    const hasMore = rows.length > lim
    const slice = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      records: slice,
      cursor: hasMore && slice.length > 0 ? slice[slice.length - 1].rkey : undefined,
    }
  }

  findUserReactionUri(viewerDid, collection, subjectUri) {
    if (!viewerDid || !subjectUri) return undefined
    const canonical = this.canonicalizeUri(subjectUri)
    const row = this._stmts.findUserReaction.get(
      String(viewerDid),
      String(collection),
      canonical,
    )
    return row?.uri || undefined
  }

  findUserFollowUri(viewerDid, subjectDid) {
    if (!viewerDid || !subjectDid) return undefined
    const row = this._stmts.findUserFollow.get(
      String(viewerDid),
      String(subjectDid),
    )
    return row?.uri || undefined
  }

  findBlockUri(viewerDid, targetDid) {
    if (!viewerDid || !targetDid) return undefined
    const row = this._stmts.findBlock.get(String(viewerDid), String(targetDid))
    return row?.record_uri || undefined
  }

  isMuted(viewerDid, targetDid) {
    if (!viewerDid || !targetDid) return false
    return Boolean(this._stmts.isMuted.get(String(viewerDid), String(targetDid)))
  }

  isThreadMuted(viewerDid, rootUri) {
    if (!viewerDid || !rootUri) return false
    const canonical = this.canonicalizeUri(rootUri)
    return Boolean(
      this._stmts.isThreadMuted.get(String(viewerDid), canonical),
    )
  }

  isListMuted(viewerDid, listUri) {
    if (!viewerDid || !listUri) return false
    const canonical = this.canonicalizeUri(listUri)
    return Boolean(this._stmts.isListMuted.get(String(viewerDid), canonical))
  }

  isAuthorInViewerMutedOrBlockedList(viewerDid, authorDid) {
    if (!viewerDid || !authorDid || viewerDid === authorDid) return false
    return Boolean(
      this._stmts.isAuthorInMutedOrBlockedList.get(
        String(authorDid),
        String(viewerDid),
        String(viewerDid),
      ),
    )
  }

  findListItemUri(did, listUri, subjectDid) {
    if (!did || !listUri || !subjectDid) return undefined
    const canonicalList = this.canonicalizeUri(listUri)
    const row = this.db
      .prepare(
        "SELECT uri FROM records WHERE did = ? AND collection = 'app.bsky.graph.listitem' AND list_uri = ? AND subject_did = ? LIMIT 1",
      )
      .get(String(did), canonicalList, String(subjectDid))
    return row?.uri || undefined
  }

  isPostTakenDown(uri) {
    if (!uri) return false
    return Boolean(this._stmts.isPostTakedown.get(String(uri)))
  }

  getLabels(subjectKey) {
    if (!subjectKey) return []
    const row = this._stmts.getLabels.get(String(subjectKey))
    return row ? safeJsonParse(row.labels_json, []) : []
  }

  putRecord(entry, {skipCounters = false, skipNotifications = false} = {}) {
    const did = String(entry.repo || entry.did)
    const collection = String(entry.collection)
    const rkey = String(entry.rkey)
    const uri = entry.uri || `at://${did}/${collection}/${rkey}`
    const cid = String(entry.cid)
    const value = entry.value && typeof entry.value === 'object' ? entry.value : {}
    const indexedAt = entry.indexedAt || new Date().toISOString()
    const createdAt = value.createdAt || entry.createdAt || indexedAt

    const existing = this._stmts.getRecord.get(did, collection, rkey)

    let subjectUri = null
    let subjectDid = null
    let rootUri = null
    let parentUri = null
    let quoteUri = null
    let listUri = null
    let isReply = 0
    let hasVideo = 0
    let hasMedia = 0
    let textContent = ''

    if (collection === 'app.bsky.feed.post') {
      textContent = String(value.text || '')
      if (value.reply?.parent?.uri) {
        parentUri = this.canonicalizeUri(value.reply.parent.uri)
        isReply = 1
      }
      if (value.reply?.root?.uri) {
        rootUri = this.canonicalizeUri(value.reply.root.uri)
      } else if (parentUri) {
        rootUri = parentUri
      }
      const rawQuote = extractQuoteUriFromValue(value)
      if (rawQuote) {
        quoteUri = this.canonicalizeUri(rawQuote)
      }
      hasVideo = isVideoEmbedValue(value.embed) ? 1 : 0
      hasMedia = isMediaEmbedValue(value.embed) ? 1 : 0
    } else if (
      collection === 'app.bsky.feed.like' ||
      collection === 'app.bsky.feed.repost'
    ) {
      if (value.subject?.uri) {
        subjectUri = this.canonicalizeUri(value.subject.uri)
        value.subject = {...value.subject, uri: subjectUri}
      }
    } else if (
      collection === 'app.bsky.graph.follow' ||
      collection === 'app.bsky.graph.block'
    ) {
      if (typeof value.subject === 'string') {
        subjectDid = value.subject
      }
    } else if (collection === 'app.bsky.graph.listitem') {
      if (typeof value.list === 'string') {
        listUri = this.canonicalizeUri(value.list)
        value.list = listUri
      }
      if (typeof value.subject === 'string') {
        subjectDid = value.subject
      }
    } else if (collection === 'app.bsky.graph.listblock') {
      if (typeof value.subject === 'string') {
        subjectUri = this.canonicalizeUri(value.subject)
        value.subject = subjectUri
      }
    }

    const valueJson = JSON.stringify(value)

    this._stmts.upsertRecord.run(
      did,
      collection,
      rkey,
      uri,
      cid,
      valueJson,
      textContent,
      subjectUri,
      subjectDid,
      rootUri,
      parentUri,
      quoteUri,
      listUri,
      isReply,
      hasVideo,
      hasMedia,
      createdAt,
      indexedAt,
    )

    // Maintain side tables & FTS5 & O(1) counters
    if (collection === 'app.bsky.feed.post') {
      this._stmts.ensurePostCounter.run(uri)
      this._stmts.deletePostFts.run(uri)
      this._stmts.insertPostFts.run(uri, did, textContent)
      this._stmts.deletePostTags.run(uri)
      const tags = extractHashtagsFromText(textContent)
      if (Array.isArray(value.facets)) {
        for (const facet of value.facets) {
          for (const feat of facet?.features || []) {
            if (feat?.$type === 'app.bsky.richtext.facet#tag' && feat.tag) {
              const lc = String(feat.tag).toLowerCase()
              if (!tags.some(t => t.tag === lc)) {
                tags.push({tag: lc, displayTag: `#${feat.tag}`})
              }
            }
          }
        }
      }
      for (const t of tags) {
        this._stmts.insertPostTag.run(t.tag, t.displayTag, uri, did, createdAt)
      }

      if (!skipCounters && !existing) {
        this._stmts.bumpAccountPosts.run(1, did)
        if (parentUri) this._stmts.bumpReplyCount.run(parentUri, 1, 1)
        if (quoteUri) this._stmts.bumpQuoteCount.run(quoteUri, 1, 1)
      }

      if (!skipNotifications && !existing) {
        this._materializePostNotifications({
          uri,
          cid,
          did,
          value,
          valueJson,
          parentUri,
          quoteUri,
          indexedAt,
        })
      }
    } else if (collection === 'app.bsky.feed.like' && subjectUri) {
      if (!skipCounters && !existing) {
        this._stmts.bumpLikeCount.run(subjectUri, 1, 1)
      }
      if (!skipNotifications && !existing) {
        const targetOwner = parseAtUriRaw(subjectUri)?.repo
        if (targetOwner && targetOwner !== did) {
          this._stmts.insertNotification.run(
            targetOwner,
            did,
            'like',
            uri,
            cid,
            subjectUri,
            valueJson,
            indexedAt,
          )
        }
      }
    } else if (collection === 'app.bsky.feed.repost' && subjectUri) {
      if (!skipCounters && !existing) {
        this._stmts.bumpRepostCount.run(subjectUri, 1, 1)
      }
      if (!skipNotifications && !existing) {
        const targetOwner = parseAtUriRaw(subjectUri)?.repo
        if (targetOwner && targetOwner !== did) {
          this._stmts.insertNotification.run(
            targetOwner,
            did,
            'repost',
            uri,
            cid,
            subjectUri,
            valueJson,
            indexedAt,
          )
        }
      }
    } else if (collection === 'app.bsky.graph.follow' && subjectDid) {
      if (!skipCounters && !existing) {
        this._stmts.bumpAccountFollows.run(1, did)
        this._stmts.bumpAccountFollowers.run(1, subjectDid)
      }
      if (!skipNotifications && !existing && subjectDid !== did) {
        this._stmts.insertNotification.run(
          subjectDid,
          did,
          'follow',
          uri,
          cid,
          null,
          valueJson,
          indexedAt,
        )
      }
    } else if (collection === 'app.bsky.graph.block' && subjectDid) {
      this._stmts.upsertBlock.run(did, subjectDid, uri, createdAt)
    }

    return {
      uri,
      cid,
      rkey,
      collection,
      repo: did,
      value,
      indexedAt,
      createdAt,
    }
  }

  _materializePostNotifications({
    uri,
    cid,
    did,
    value,
    valueJson,
    parentUri,
    quoteUri,
    indexedAt,
  }) {
    const notified = new Set()
    if (parentUri) {
      const parentOwner = parseAtUriRaw(parentUri)?.repo
      if (parentOwner && parentOwner !== did) {
        this._stmts.insertNotification.run(
          parentOwner,
          did,
          'reply',
          uri,
          cid,
          parentUri,
          valueJson,
          indexedAt,
        )
        notified.add(parentOwner)
      }
    }
    if (quoteUri) {
      const quoteOwner = parseAtUriRaw(quoteUri)?.repo
      if (quoteOwner && quoteOwner !== did && !notified.has(quoteOwner)) {
        this._stmts.insertNotification.run(
          quoteOwner,
          did,
          'quote',
          uri,
          cid,
          quoteUri,
          valueJson,
          indexedAt,
        )
        notified.add(quoteOwner)
      }
    }
    // Mentions from ATProto facets
    if (Array.isArray(value.facets)) {
      for (const facet of value.facets) {
        for (const feat of facet?.features || []) {
          if (feat?.$type === 'app.bsky.richtext.facet#mention' && feat.did) {
            const targetDid = String(feat.did)
            if (targetDid !== did && !notified.has(targetDid)) {
              this._stmts.insertNotification.run(
                targetDid,
                did,
                'mention',
                uri,
                cid,
                null,
                valueJson,
                indexedAt,
              )
              notified.add(targetDid)
            }
          }
        }
      }
    }
    // Mentions from raw @handle text if facet missing
    for (const rawMention of extractMentionsFromText(value.text || '')) {
      const targetAcc = this.findAccount(rawMention)
      if (targetAcc && targetAcc.did !== did && !notified.has(targetAcc.did)) {
        this._stmts.insertNotification.run(
          targetAcc.did,
          did,
          'mention',
          uri,
          cid,
          null,
          valueJson,
          indexedAt,
        )
        notified.add(targetAcc.did)
      }
    }
  }

  deleteRecord(did, collection, rkey) {
    const existing = this._stmts.getRecord.get(
      String(did),
      String(collection),
      String(rkey),
    )
    if (!existing) return false

    this._stmts.deleteRecord.run(String(did), String(collection), String(rkey))
    this._stmts.deleteNotificationsByUri.run(existing.uri)

    if (collection === 'app.bsky.feed.post') {
      this._stmts.deletePostFts.run(existing.uri)
      this._stmts.deletePostTags.run(existing.uri)
      this._stmts.deleteNotificationsByReasonSubject.run(existing.uri)
      this._stmts.deleteBookmarksByUri.run(existing.uri)
      this._stmts.deletePostCounterByUri.run(existing.uri)
      this._stmts.deletePostViewsByUri.run(existing.uri)
      this._stmts.deletePollVotesByUri.run(existing.uri)
      this._stmts.bumpAccountPosts.run(-1, String(did))
      if (existing.parent_uri) {
        this._stmts.bumpReplyCount.run(existing.parent_uri, 0, -1)
      }
      if (existing.quote_uri) {
        this._stmts.bumpQuoteCount.run(existing.quote_uri, 0, -1)
      }
    } else if (collection === 'app.bsky.feed.like' && existing.subject_uri) {
      this._stmts.bumpLikeCount.run(existing.subject_uri, 0, -1)
      // Remove any legacy duplicates for same subject
      const dupes = this.db
        .prepare(
          'SELECT rkey, uri FROM records WHERE did = ? AND collection = ? AND subject_uri = ?',
        )
        .all(String(did), String(collection), existing.subject_uri)
      for (const d of dupes) {
        this._stmts.deleteRecord.run(String(did), String(collection), d.rkey)
        this._stmts.deleteNotificationsByUri.run(d.uri)
      }
    } else if (collection === 'app.bsky.feed.repost' && existing.subject_uri) {
      this._stmts.bumpRepostCount.run(existing.subject_uri, 0, -1)
      const dupes = this.db
        .prepare(
          'SELECT rkey, uri FROM records WHERE did = ? AND collection = ? AND subject_uri = ?',
        )
        .all(String(did), String(collection), existing.subject_uri)
      for (const d of dupes) {
        this._stmts.deleteRecord.run(String(did), String(collection), d.rkey)
        this._stmts.deleteNotificationsByUri.run(d.uri)
      }
    } else if (collection === 'app.bsky.graph.follow' && existing.subject_did) {
      this._stmts.bumpAccountFollows.run(-1, String(did))
      this._stmts.bumpAccountFollowers.run(-1, existing.subject_did)
      const dupes = this.db
        .prepare(
          'SELECT rkey, uri FROM records WHERE did = ? AND collection = ? AND subject_did = ?',
        )
        .all(String(did), String(collection), existing.subject_did)
      for (const d of dupes) {
        this._stmts.deleteRecord.run(String(did), String(collection), d.rkey)
        this._stmts.deleteNotificationsByUri.run(d.uri)
      }
    } else if (collection === 'app.bsky.graph.block' && existing.subject_did) {
      this._stmts.deleteBlock.run(String(did), existing.subject_did)
    }

    return true
  }

  // -------------------------------------------------------------------------
  // O(1) Post Counters & Batched View Flusher (ZERO Disk Writes on GETs!)
  // -------------------------------------------------------------------------

  getPostCounters(uri) {
    const canonical = this.canonicalizeUri(uri)
    const row = canonical ? this._stmts.getPostCounter.get(canonical) : null
    const overlay = canonical ? this.pendingViewOverlay.get(canonical) || 0 : 0
    return {
      likeCount: Number(row?.like_count || 0),
      repostCount: Number(row?.repost_count || 0),
      replyCount: Number(row?.reply_count || 0),
      quoteCount: Number(row?.quote_count || 0),
      bookmarkCount: Number(row?.bookmark_count || 0),
      viewCount: Number(row?.view_count || 0) + overlay,
    }
  }

  getPostViewCount(uri) {
    const canonical = this.canonicalizeUri(uri)
    if (!canonical) return 0
    const row = this._stmts.getPostCounter.get(canonical)
    const overlay = this.pendingViewOverlay.get(canonical) || 0
    return Number(row?.view_count || 0) + overlay
  }

  enqueuePostViews(postUris, viewerKey) {
    if (!viewerKey || !Array.isArray(postUris) || postUris.length === 0) {
      return false
    }
    let queuedAny = false
    for (const rawUri of postUris) {
      const canonical = this.canonicalizeUri(rawUri)
      if (!canonical || !canonical.includes('/app.bsky.feed.post/')) continue
      const dedupeKey = `${canonical}\0${viewerKey}`
      if (this.recentViewKeys.has(dedupeKey)) continue
      if (this.recentViewKeys.size >= MAX_RECENT_VIEW_CACHE) {
        this.recentViewKeys.clear()
      }
      this.recentViewKeys.add(dedupeKey)

      let set = this.pendingViews.get(canonical)
      if (!set) {
        set = new Set()
        this.pendingViews.set(canonical, set)
      }
      if (!set.has(viewerKey)) {
        set.add(viewerKey)
        this.pendingViewOverlay.set(
          canonical,
          (this.pendingViewOverlay.get(canonical) || 0) + 1,
        )
        queuedAny = true
      }
    }
    return queuedAny
  }

  flushPendingViews() {
    if (this.closed || this.pendingViews.size === 0) return 0
    const batch = this.pendingViews
    this.pendingViews = new Map()
    this.pendingViewOverlay = new Map()
    const now = new Date().toISOString()
    let totalInserted = 0

    this.inTransaction(() => {
      for (const [uri, viewerKeys] of batch.entries()) {
        let added = 0
        for (const vk of viewerKeys) {
          const res = this._stmts.insertViewDedup.run(uri, vk, now)
          if (Number(res.changes || 0) > 0) {
            added++
          }
        }
        if (added > 0) {
          this._stmts.bumpViewCount.run(uri, added, added)
          totalInserted += added
        }
      }
    })
    return totalInserted
  }

  // -------------------------------------------------------------------------
  // Revoked Tokens (Expiry-Pruned, NEVER 500-Capped!)
  // -------------------------------------------------------------------------

  revokeToken(jti, expiresAtSec = 0) {
    if (!jti) return
    const nowSec = Math.floor(Date.now() / 1000)
    const exp =
      Number.isFinite(Number(expiresAtSec)) && Number(expiresAtSec) > 0
        ? Math.floor(Number(expiresAtSec))
        : nowSec + 90 * 24 * 60 * 60
    this._stmts.insertRevoked.run(String(jti), exp, nowSec)
    if (Date.now() - this.lastRevokedPruneMs > 5 * 60 * 1000) {
      this.lastRevokedPruneMs = Date.now()
      this._stmts.pruneRevoked.run(nowSec)
    }
  }

  isTokenRevoked(jti) {
    if (!jti) return false
    const row = this._stmts.isRevoked.get(String(jti))
    if (!row) return false
    const nowSec = Math.floor(Date.now() / 1000)
    if (Number(row.expires_at) > 0 && Number(row.expires_at) < nowSec) {
      return false
    }
    return true
  }

  pruneExpiredRevokedTokens() {
    const nowSec = Math.floor(Date.now() / 1000)
    const res = this._stmts.pruneRevoked.run(nowSec)
    return Number(res.changes || 0)
  }

  // -------------------------------------------------------------------------
  // Indexed Feed, Thread, Search, Trends & Social Graph Queries
  // -------------------------------------------------------------------------

  queryPosts({
    authorDids = null,
    includeReplies = false,
    repliesOnly = false,
    authorThreadsOnly = false,
    onlyVideo = false,
    onlyMedia = false,
    tags = null,
    limit = 30,
    cursor = null,
  } = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 30))
    const params = []
    const wheres = ["r.collection = 'app.bsky.feed.post'"]

    if (Array.isArray(authorDids)) {
      if (authorDids.length === 0) return {records: [], cursor: undefined}
      wheres.push(`r.did IN (${authorDids.map(() => '?').join(',')})`)
      params.push(...authorDids)
    }
    if (repliesOnly) {
      wheres.push('r.is_reply = 1')
    } else if (authorThreadsOnly) {
      wheres.push(
        "(r.is_reply = 0 OR (r.parent_uri LIKE ('at://' || r.did || '/%') AND (r.root_uri IS NULL OR r.root_uri LIKE ('at://' || r.did || '/%'))))",
      )
    } else if (!includeReplies) {
      wheres.push('r.is_reply = 0')
    }
    if (onlyVideo) {
      wheres.push('r.has_video = 1')
    }
    if (onlyMedia) {
      wheres.push('r.has_media = 1')
    }
    if (Array.isArray(tags) && tags.length > 0) {
      const cleanTags = tags.map(t => String(t).toLowerCase().replace(/^#/, ''))
      wheres.push(
        `EXISTS (SELECT 1 FROM post_tags pt WHERE pt.uri = r.uri AND pt.tag IN (${cleanTags.map(() => '?').join(',')}))`,
      )
      params.push(...cleanTags)
    }
    if (cursor && String(cursor).includes('|')) {
      const [cTime, cUri] = String(cursor).split('|')
      wheres.push('(r.created_at < ? OR (r.created_at = ? AND r.uri < ?))')
      params.push(cTime, cTime, cUri)
    } else if (cursor && /^\d+$/.test(String(cursor))) {
      // Backwards-compatible numeric offset fallback
      const offset = parseInt(String(cursor), 10) || 0
      const sql = `
        SELECT r.* FROM records r
        JOIN accounts a ON a.did = r.did
        WHERE ${wheres.join(' AND ')}
          AND a.status NOT IN ('banned', 'suspended')
          AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ORDER BY r.created_at DESC, r.uri DESC
        LIMIT ? OFFSET ?
      `
      const rows = this.db.prepare(sql).all(...params, lim + 1, offset)
      const hasMore = rows.length > lim
      const records = rows.slice(0, lim).map(r => this._rowToRecord(r))
      return {
        records,
        cursor: hasMore ? String(offset + records.length) : undefined,
      }
    }

    const sql = `
      SELECT r.* FROM records r
      JOIN accounts a ON a.did = r.did
      WHERE ${wheres.join(' AND ')}
        AND a.status NOT IN ('banned', 'suspended')
        AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
      ORDER BY r.created_at DESC, r.uri DESC
      LIMIT ?
    `
    const rows = this.db.prepare(sql).all(...params, lim + 1)
    const hasMore = rows.length > lim
    const records = rows.slice(0, lim).map(r => this._rowToRecord(r))
    const last = records[records.length - 1]
    return {
      records,
      cursor: hasMore && last ? `${last.createdAt}|${last.uri}` : undefined,
    }
  }

  queryReposts({authorDids = null, limit = 30} = {}) {
    const lim = Math.min(200, Math.max(1, Number(limit) || 30))
    const params = []
    const wheres = ["r.collection = 'app.bsky.feed.repost'"]
    if (Array.isArray(authorDids)) {
      if (authorDids.length === 0) return []
      wheres.push(`r.did IN (${authorDids.map(() => '?').join(',')})`)
      params.push(...authorDids)
    }
    const sql = `
      SELECT r.* FROM records r
      JOIN accounts a ON a.did = r.did
      WHERE ${wheres.join(' AND ')}
        AND a.status NOT IN ('banned', 'suspended')
      ORDER BY r.created_at DESC, r.uri DESC
      LIMIT ?
    `
    return this.db
      .prepare(sql)
      .all(...params, lim)
      .map(r => this._rowToRecord(r))
  }

  getDirectReplies(parentUri, limit = 100) {
    const canonical = this.canonicalizeUri(parentUri)
    if (!canonical) return []
    return this.db
      .prepare(
        `
        SELECT r.* FROM records r
        WHERE r.collection = 'app.bsky.feed.post'
          AND r.parent_uri = ?
        ORDER BY r.indexed_at ASC
        LIMIT ?
      `,
      )
      .all(canonical, Math.min(200, Math.max(1, Number(limit) || 100)))
      .map(r => this._rowToRecord(r))
  }

  getLikesForPost(postUri, {limit = 50, cursor = null} = {}) {
    const canonical = this.canonicalizeUri(postUri)
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT r.* FROM records r
        JOIN accounts a ON a.did = r.did
        WHERE r.collection = 'app.bsky.feed.like'
          AND r.subject_uri = ?
          AND a.status NOT IN ('banned', 'suspended')
        ORDER BY r.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(canonical, lim + 1, offset)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      items,
      cursor: hasMore ? String(offset + items.length) : undefined,
    }
  }

  getRepostsForPost(postUri, {limit = 50, cursor = null} = {}) {
    const canonical = this.canonicalizeUri(postUri)
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT r.* FROM records r
        JOIN accounts a ON a.did = r.did
        WHERE r.collection = 'app.bsky.feed.repost'
          AND r.subject_uri = ?
          AND a.status NOT IN ('banned', 'suspended')
        ORDER BY r.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(canonical, lim + 1, offset)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      items,
      cursor: hasMore ? String(offset + items.length) : undefined,
    }
  }

  getQuotesForPost(postUri, {limit = 50, cursor = null, sort = 'latest'} = {}) {
    const canonical = this.canonicalizeUri(postUri)
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const orderClause =
      String(sort || '').toLowerCase() === 'top'
        ? '(COALESCE(pc.like_count, 0) * 3 + COALESCE(pc.repost_count, 0) * 5 + COALESCE(pc.reply_count, 0) * 4 + COALESCE(pc.quote_count, 0) * 4 + COALESCE(pc.bookmark_count, 0) * 2 + COALESCE(pc.view_count, 0) * 0.15) DESC, r.indexed_at DESC'
        : 'r.indexed_at DESC'
    const rows = this.db
      .prepare(
        `
        SELECT r.* FROM records r
        JOIN accounts a ON a.did = r.did
        LEFT JOIN post_counters pc ON pc.uri = r.uri
        WHERE r.collection = 'app.bsky.feed.post'
          AND r.quote_uri = ?
          AND a.status NOT IN ('banned', 'suspended')
          AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `,
      )
      .all(canonical, lim + 1, offset)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      items,
      cursor: hasMore ? String(offset + items.length) : undefined,
    }
  }

  getFollowsForActor(did, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT a.* FROM records r
        JOIN accounts a ON a.did = r.subject_did
        WHERE r.did = ? AND r.collection = 'app.bsky.graph.follow'
          AND a.status NOT IN ('banned', 'suspended')
        ORDER BY r.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(String(did), lim + 1, offset)
    const hasMore = rows.length > lim
    const accounts = rows.slice(0, lim).map(r => this._rowToAccount(r))
    return {
      accounts,
      cursor: hasMore ? String(offset + accounts.length) : undefined,
    }
  }

  getFollowersForActor(did, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT a.* FROM records r
        JOIN accounts a ON a.did = r.did
        WHERE r.collection = 'app.bsky.graph.follow' AND r.subject_did = ?
          AND a.status NOT IN ('banned', 'suspended')
        ORDER BY r.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(String(did), lim + 1, offset)
    const hasMore = rows.length > lim
    const accounts = rows.slice(0, lim).map(r => this._rowToAccount(r))
    return {
      accounts,
      cursor: hasMore ? String(offset + accounts.length) : undefined,
    }
  }

  getKnownFollowers(viewerDid, targetDid, {limit = 50, cursor = null} = {}) {
    if (!viewerDid || !targetDid) return {accounts: [], cursor: undefined}
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT a.* FROM records f_viewer
        JOIN records f_target
          ON f_target.did = f_viewer.subject_did
          AND f_target.collection = 'app.bsky.graph.follow'
          AND f_target.subject_did = ?
        JOIN accounts a ON a.did = f_viewer.subject_did
        WHERE f_viewer.did = ?
          AND f_viewer.collection = 'app.bsky.graph.follow'
          AND a.status NOT IN ('banned', 'suspended')
        ORDER BY f_target.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(String(targetDid), String(viewerDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const accounts = rows.slice(0, lim).map(r => this._rowToAccount(r))
    return {
      accounts,
      cursor: hasMore ? String(offset + accounts.length) : undefined,
    }
  }

  getFollowedDids(viewerDid) {
    if (!viewerDid) return []
    return this.db
      .prepare(
        "SELECT subject_did FROM records WHERE did = ? AND collection = 'app.bsky.graph.follow' AND subject_did IS NOT NULL",
      )
      .all(String(viewerDid))
      .map(r => r.subject_did)
  }

  getActorLikes(actorDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT r.subject_uri, r.indexed_at FROM records r
        WHERE r.did = ? AND r.collection = 'app.bsky.feed.like' AND r.subject_uri IS NOT NULL
        ORDER BY r.indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(String(actorDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const uris = rows.slice(0, lim).map(r => r.subject_uri)
    return {
      uris,
      cursor: hasMore ? String(offset + uris.length) : undefined,
    }
  }

  searchActors({query = '', viewerDid = null, limit = 25, cursor = null} = {}) {
    const lim = Math.min(50, Math.max(1, Number(limit) || 25))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const cleanQ = String(query || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')

    let rows = []
    if (!cleanQ) {
      rows = this.db
        .prepare(
          `
          SELECT a.* FROM accounts a
          WHERE a.active != 0 AND a.status NOT IN ('banned', 'suspended')
          ORDER BY a.followers_count DESC, a.posts_count DESC, a.created_at DESC
          LIMIT ? OFFSET ?
        `,
        )
        .all(lim + 10, offset)
    } else {
      const ftsQ = sanitizeFtsQuery(cleanQ)
      if (ftsQ) {
        try {
          rows = this.db
            .prepare(
              `
              SELECT a.* FROM accounts_fts f
              JOIN accounts a ON a.did = f.did
              WHERE accounts_fts MATCH ?
                AND a.active != 0 AND a.status NOT IN ('banned', 'suspended')
              ORDER BY bm25(accounts_fts, 4.0, 2.0, 1.0), a.followers_count DESC
              LIMIT ? OFFSET ?
            `,
            )
            .all(ftsQ, lim + 10, offset)
        } catch {
          rows = []
        }
      }
      if (rows.length === 0) {
        const likePat = `%${cleanQ}%`
        rows = this.db
          .prepare(
            `
            SELECT a.* FROM accounts a
            WHERE a.active != 0 AND a.status NOT IN ('banned', 'suspended')
              AND (LOWER(a.handle) LIKE ? OR LOWER(a.display_name) LIKE ? OR LOWER(a.description) LIKE ?)
            ORDER BY CASE WHEN LOWER(a.handle) = ? THEN 0 WHEN LOWER(a.handle) LIKE ? THEN 1 ELSE 2 END,
              a.followers_count DESC
            LIMIT ? OFFSET ?
          `,
          )
          .all(
            likePat,
            likePat,
            likePat,
            cleanQ,
            `${cleanQ}%`,
            lim + 10,
            offset,
          )
      }
    }

    const filtered = []
    for (const row of rows) {
      const acc = this._rowToAccount(row)
      if (!acc) continue
      if (viewerDid && viewerDid !== acc.did) {
        if (
          this.isMuted(viewerDid, acc.did) ||
          this.findBlockUri(viewerDid, acc.did) ||
          this.findBlockUri(acc.did, viewerDid)
        ) {
          continue
        }
      }
      filtered.push(acc)
      if (filtered.length > lim) break
    }
    const hasMore = filtered.length > lim
    const accounts = filtered.slice(0, lim)
    return {
      accounts,
      cursor: hasMore ? String(offset + accounts.length) : undefined,
    }
  }

  searchPosts({
    query = '',
    authorDid = null,
    authorDids = null,
    excludeAuthorDids = null,
    mentions = null,
    tags = [],
    excludeTags = [],
    sort = 'latest',
    since = null,
    until = null,
    lang = null,
    langs = null,
    domains = null,
    urls = null,
    hasMedia = false,
    hasVideo = false,
    followingOnly = false,
    viewerDid = null,
    excludeReplies = false,
    repliesOnly = false,
    limit = 25,
    cursor = null,
  } = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 25))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rawTerms = String(query || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    const effectiveAuthorDids = new Set(
      [
        ...(authorDid ? [String(authorDid)] : []),
        ...(Array.isArray(authorDids) ? authorDids.map(String) : []),
      ].filter(Boolean),
    )
    const effectiveExcludeAuthorDids = new Set(
      (Array.isArray(excludeAuthorDids) ? excludeAuthorDids.map(String) : []).filter(
        Boolean,
      ),
    )
    const effectiveMentions = Array.isArray(mentions)
      ? mentions.map(m => String(m || '').trim()).filter(Boolean)
      : []
    const textTerms = []
    const effectiveTags = (Array.isArray(tags) ? tags : [])
      .map(t => String(t || '').trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean)
    const effectiveExcludeTags = (Array.isArray(excludeTags) ? excludeTags : [])
      .map(t => String(t || '').trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean)
    const effectiveLangs = [
      ...(lang ? [String(lang).trim().toLowerCase()] : []),
      ...(Array.isArray(langs)
        ? langs.map(l => String(l || '').trim().toLowerCase())
        : []),
    ].filter(Boolean)
    const effectiveDomains = (Array.isArray(domains) ? domains : [])
      .map(d =>
        String(d || '')
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, ''),
      )
      .filter(Boolean)
    const effectiveUrls = (Array.isArray(urls) ? urls : [])
      .map(u => String(u || '').trim())
      .filter(Boolean)
    let effectiveSince = since ? String(since).trim() : null
    let effectiveUntil = until ? String(until).trim() : null

    for (const t of rawTerms) {
      const lower = t.toLowerCase()
      if (lower.startsWith('from:')) {
        const rawAuthor = t.slice(5).replace(/^@/, '').trim()
        if (rawAuthor.toLowerCase() === 'me') {
          if (!viewerDid) return {records: [], cursor: undefined, hitsTotal: 0}
          effectiveAuthorDids.add(viewerDid)
        } else {
          const acc = this.findAccount(rawAuthor)
          if (acc) effectiveAuthorDids.add(acc.did)
          else return {records: [], cursor: undefined, hitsTotal: 0}
        }
      } else if (lower.startsWith('-from:')) {
        const rawAuthor = t.slice(6).replace(/^@/, '').trim()
        if (rawAuthor.toLowerCase() === 'me') {
          if (viewerDid) effectiveExcludeAuthorDids.add(viewerDid)
        } else {
          const acc = this.findAccount(rawAuthor)
          if (acc) effectiveExcludeAuthorDids.add(acc.did)
        }
      } else if (lower.startsWith('mentions:') || lower.startsWith('to:')) {
        const rawMention = t.slice(t.indexOf(':') + 1).replace(/^@/, '').trim()
        if (rawMention) effectiveMentions.push(rawMention)
      } else if (lower.startsWith('lang:')) {
        const l = t.slice(5).trim().toLowerCase()
        if (l) effectiveLangs.push(l)
      } else if (lower.startsWith('domain:')) {
        const d = t
          .slice(7)
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
        if (d) effectiveDomains.push(d)
      } else if (lower.startsWith('since:')) {
        const s = t.slice(6).trim()
        if (s) effectiveSince = s
      } else if (lower.startsWith('until:')) {
        const u = t.slice(6).trim()
        if (u) effectiveUntil = u
      } else if (t.startsWith('-#') && t.length > 2) {
        effectiveExcludeTags.push(t.slice(2).toLowerCase())
      } else if (t.startsWith('#') && t.length > 1) {
        effectiveTags.push(t.slice(1).toLowerCase())
      } else {
        textTerms.push(t)
      }
    }

    const cleanTextQuery = textTerms.join(' ')
    const ftsQuery = sanitizeFtsQuery(cleanTextQuery)
    const wheres = [
      "r.collection = 'app.bsky.feed.post'",
      "a.status NOT IN ('banned', 'suspended')",
      'NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)',
    ]
    const params = []

    if (effectiveAuthorDids.size > 0) {
      const list = [...effectiveAuthorDids]
      wheres.push(`r.did IN (${list.map(() => '?').join(',')})`)
      params.push(...list)
    }
    if (effectiveExcludeAuthorDids.size > 0) {
      const list = [...effectiveExcludeAuthorDids]
      wheres.push(`r.did NOT IN (${list.map(() => '?').join(',')})`)
      params.push(...list)
    }
    if (followingOnly) {
      if (!viewerDid) return {records: [], cursor: undefined, hitsTotal: 0}
      const followed = this.getFollowedDids(viewerDid)
      if (followed.length === 0) {
        return {records: [], cursor: undefined, hitsTotal: 0}
      }
      wheres.push(`r.did IN (${followed.map(() => '?').join(',')})`)
      params.push(...followed)
    }
    for (const rawM of effectiveMentions) {
      const cleanedM = rawM.replace(/^@/, '').trim()
      if (!cleanedM) continue
      const mAcc =
        cleanedM.toLowerCase() === 'me'
          ? viewerDid
            ? this.getAccountByDid(viewerDid)
            : null
          : this.findAccount(cleanedM)
      if (mAcc) {
        const shortHandle = mAcc.handle.split('.')[0]
        wheres.push(
          '(r.value_json LIKE ? OR LOWER(r.text_content) LIKE ? OR LOWER(r.text_content) LIKE ?)',
        )
        params.push(
          `%"${mAcc.did}"%`,
          `%@${mAcc.handle.toLowerCase()}%`,
          `%@${shortHandle.toLowerCase()}%`,
        )
      } else {
        wheres.push('(r.value_json LIKE ? OR LOWER(r.text_content) LIKE ?)')
        params.push(`%${cleanedM}%`, `%@${cleanedM.toLowerCase()}%`)
      }
    }
    for (const tag of effectiveTags) {
      wheres.push(
        'EXISTS (SELECT 1 FROM post_tags pt WHERE pt.uri = r.uri AND pt.tag = ?)',
      )
      params.push(tag)
    }
    for (const exTag of effectiveExcludeTags) {
      wheres.push(
        'NOT EXISTS (SELECT 1 FROM post_tags pt WHERE pt.uri = r.uri AND pt.tag = ?)',
      )
      params.push(exTag)
    }
    if (effectiveSince) {
      wheres.push('r.created_at >= ?')
      params.push(effectiveSince)
    }
    if (effectiveUntil) {
      const untilVal = /^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil)
        ? `${effectiveUntil}T23:59:59.999Z`
        : effectiveUntil
      wheres.push('r.created_at <= ?')
      params.push(untilVal)
    }
    if (effectiveLangs.length > 0) {
      const langClauses = effectiveLangs.map(() => 'LOWER(r.value_json) LIKE ?')
      wheres.push(`(${langClauses.join(' OR ')})`)
      for (const l of effectiveLangs) {
        params.push(`%"${l.replace(/"/g, '')}"%`)
      }
    }
    if (effectiveDomains.length > 0) {
      const domClauses = effectiveDomains.map(
        () => '(LOWER(r.value_json) LIKE ? OR LOWER(r.text_content) LIKE ?)',
      )
      wheres.push(`(${domClauses.join(' OR ')})`)
      for (const d of effectiveDomains) {
        params.push(`%${d}%`, `%${d}%`)
      }
    }
    if (effectiveUrls.length > 0) {
      const urlClauses = effectiveUrls.map(
        () => '(LOWER(r.value_json) LIKE ? OR LOWER(r.text_content) LIKE ?)',
      )
      wheres.push(`(${urlClauses.join(' OR ')})`)
      for (const u of effectiveUrls) {
        const lu = u.toLowerCase()
        params.push(`%${lu}%`, `%${lu}%`)
      }
    }
    if (hasVideo) {
      wheres.push('r.has_video = 1')
    } else if (hasMedia) {
      wheres.push('r.has_media = 1')
    }
    if (repliesOnly) {
      wheres.push('r.is_reply = 1')
    } else if (excludeReplies) {
      wheres.push('r.is_reply = 0')
    }

    const orderClause =
      String(sort).toLowerCase() === 'top'
        ? '(COALESCE(pc.like_count, 0) * 3 + COALESCE(pc.repost_count, 0) * 5 + COALESCE(pc.reply_count, 0) * 4 + COALESCE(pc.quote_count, 0) * 4 + COALESCE(pc.bookmark_count, 0) * 2 + COALESCE(pc.view_count, 0) * 0.15) DESC, r.created_at DESC'
        : 'r.created_at DESC, r.uri DESC'

    let rows = []
    let hitsTotal = 0
    if (ftsQuery) {
      try {
        rows = this.db
          .prepare(
            `
            SELECT r.* FROM posts_fts f
            JOIN records r ON r.uri = f.uri
            JOIN accounts a ON a.did = r.did
            LEFT JOIN post_counters pc ON pc.uri = r.uri
            WHERE posts_fts MATCH ?
              AND ${wheres.join(' AND ')}
            ORDER BY ${orderClause}
            LIMIT ? OFFSET ?
          `,
          )
          .all(ftsQuery, ...params, lim + 1, offset)
        if (rows.length > 0) {
          const cntRow = this.db
            .prepare(
              `
              SELECT COUNT(*) AS cnt FROM posts_fts f
              JOIN records r ON r.uri = f.uri
              JOIN accounts a ON a.did = r.did
              WHERE posts_fts MATCH ?
                AND ${wheres.join(' AND ')}
            `,
            )
            .get(ftsQuery, ...params)
          hitsTotal = Number(cntRow?.cnt || rows.length)
        }
      } catch {
        rows = []
      }
    }

    if (rows.length === 0 && cleanTextQuery) {
      const likeWheres = [...wheres]
      const likeParams = [...params]
      for (const term of textTerms) {
        const bare = term.toLowerCase().replace(/^#/, '')
        likeWheres.push(
          '(LOWER(r.text_content) LIKE ? OR LOWER(a.handle) LIKE ? OR LOWER(a.display_name) LIKE ?)',
        )
        likeParams.push(`%${bare}%`, `%${bare}%`, `%${bare}%`)
      }
      rows = this.db
        .prepare(
          `
          SELECT r.* FROM records r
          JOIN accounts a ON a.did = r.did
          LEFT JOIN post_counters pc ON pc.uri = r.uri
          WHERE ${likeWheres.join(' AND ')}
          ORDER BY ${orderClause}
          LIMIT ? OFFSET ?
        `,
        )
        .all(...likeParams, lim + 1, offset)
      const cntRow = this.db
        .prepare(
          `
          SELECT COUNT(*) AS cnt FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE ${likeWheres.join(' AND ')}
        `,
        )
        .get(...likeParams)
      hitsTotal = Number(cntRow?.cnt || rows.length)
    } else if (!cleanTextQuery) {
      rows = this.db
        .prepare(
          `
          SELECT r.* FROM records r
          JOIN accounts a ON a.did = r.did
          LEFT JOIN post_counters pc ON pc.uri = r.uri
          WHERE ${wheres.join(' AND ')}
          ORDER BY ${orderClause}
          LIMIT ? OFFSET ?
        `,
        )
        .all(...params, lim + 1, offset)
      const cntRow = this.db
        .prepare(
          `
          SELECT COUNT(*) AS cnt FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE ${wheres.join(' AND ')}
        `,
        )
        .get(...params)
      hitsTotal = Number(cntRow?.cnt || rows.length)
    }

    const hasMore = rows.length > lim
    const records = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      records,
      cursor: hasMore ? String(offset + records.length) : undefined,
      hitsTotal,
    }
  }

  getTimeDecayedTrends({limit = 10, windowDays = 30} = {}) {
    const cutoff = new Date(
      Date.now() - Math.max(1, windowDays) * 86_400_000,
    ).toISOString()
    const rows = this.db
      .prepare(
        `
        SELECT
          pt.tag,
          pt.display_tag,
          pt.uri,
          pt.did,
          pt.created_at,
          r.text_content,
          COALESCE(pc.like_count, 0) AS like_count,
          COALESCE(pc.repost_count, 0) AS repost_count,
          COALESCE(pc.reply_count, 0) AS reply_count,
          COALESCE(pc.quote_count, 0) AS quote_count,
          COALESCE(pc.view_count, 0) AS view_count
        FROM post_tags pt
        JOIN records r ON r.uri = pt.uri
        JOIN accounts a ON a.did = pt.did
        LEFT JOIN post_counters pc ON pc.uri = pt.uri
        WHERE pt.created_at >= ?
          AND a.status NOT IN ('banned', 'suspended')
          AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = pt.uri)
        ORDER BY pt.created_at DESC
        LIMIT 2500
      `,
      )
      .all(cutoff)

    // Fallback to all-time tags if recent window has none (e.g., fresh older archive)
    const effectiveRows =
      rows.length > 0
        ? rows
        : this.db
            .prepare(
              `
              SELECT
                pt.tag,
                pt.display_tag,
                pt.uri,
                pt.did,
                pt.created_at,
                r.text_content,
                COALESCE(pc.like_count, 0) AS like_count,
                COALESCE(pc.repost_count, 0) AS repost_count,
                COALESCE(pc.reply_count, 0) AS reply_count,
                COALESCE(pc.quote_count, 0) AS quote_count,
                COALESCE(pc.view_count, 0) AS view_count
              FROM post_tags pt
              JOIN records r ON r.uri = pt.uri
              JOIN accounts a ON a.did = pt.did
              LEFT JOIN post_counters pc ON pc.uri = pt.uri
              WHERE a.status NOT IN ('banned', 'suspended')
                AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = pt.uri)
              ORDER BY pt.created_at DESC
              LIMIT 2500
            `,
            )
            .all()

    const nowMs = Date.now()
    const buckets = new Map()
    for (const row of effectiveRows) {
      const key = row.tag
      const ageHours = Math.max(
        0,
        (nowMs - (Date.parse(row.created_at) || nowMs)) / 3_600_000,
      )
      const decay = 1 / (1 + ageHours / 24)
      const engagement =
        1 +
        Number(row.like_count || 0) * 1.5 +
        Number(row.repost_count || 0) * 2.5 +
        Number(row.reply_count || 0) * 2.0 +
        Number(row.quote_count || 0) * 2.0 +
        Math.min(50, Number(row.view_count || 0) * 0.05)

      let b = buckets.get(key)
      if (!b) {
        b = {
          tag: key,
          topic: row.display_tag.replace(/^#/, ''),
          displayName: row.display_tag,
          postCount: 0,
          score: 0,
          latestAt: row.created_at,
          snippet: String(row.text_content || '').slice(0, 140),
          actorDids: new Set(),
          samplePosts: [],
        }
        buckets.set(key, b)
      }
      b.postCount += 1
      b.score += engagement * decay
      if (row.created_at > b.latestAt) {
        b.latestAt = row.created_at
        b.snippet = String(row.text_content || '').slice(0, 140)
      }
      b.actorDids.add(row.did)
      if (b.samplePosts.length < 3) {
        b.samplePosts.push({
          uri: row.uri,
          did: row.did,
          text: String(row.text_content || ''),
          viewCount:
            Number(row.view_count || 0) +
            (this.pendingViewOverlay.get(row.uri) || 0),
          likeCount: Number(row.like_count || 0),
        })
      }
    }

    const sorted = [...buckets.values()].sort((a, b) => {
      const scoreA = a.score * (1 + Math.min(2, a.actorDids.size * 0.25))
      const scoreB = b.score * (1 + Math.min(2, b.actorDids.size * 0.25))
      return scoreB - scoreA || b.latestAt.localeCompare(a.latestAt)
    })

    return sorted.slice(0, Math.min(25, Math.max(1, Number(limit) || 10)))
  }

  getSuggestedAccounts({viewerDid = null, actorDid = null, limit = 10} = {}) {
    const lim = Math.min(50, Math.max(1, Number(limit) || 10))
    const rows = this.db
      .prepare(
        `
        SELECT a.* FROM accounts a
        WHERE a.active != 0
          AND a.status NOT IN ('banned', 'suspended')
          ${viewerDid ? 'AND a.did != ?' : ''}
          ${
            viewerDid
              ? `AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.viewer_did = ? AND m.target_did = a.did)
                 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.viewer_did = ? AND b.target_did = a.did) OR (b.viewer_did = a.did AND b.target_did = ?))
                 AND NOT EXISTS (SELECT 1 FROM records f WHERE f.did = ? AND f.collection = 'app.bsky.graph.follow' AND f.subject_did = a.did)`
              : ''
          }
        ORDER BY (a.followers_count * 3 + a.posts_count * 2 + CASE WHEN a.verified = 1 THEN 5 ELSE 0 END) DESC,
                 a.created_at DESC
        LIMIT ?
      `,
      )
      .all(
        ...(viewerDid
          ? [viewerDid, viewerDid, viewerDid, viewerDid, viewerDid, lim * 2]
          : [lim * 2]),
      )

    let accounts = rows.map(r => this._rowToAccount(r)).filter(Boolean)
    if (actorDid) {
      accounts = accounts.filter(a => a.did !== actorDid)
      // Boost accounts followed by the target actor
      const actorFollows = new Set(this.getFollowedDids(actorDid))
      accounts.sort((a, b) => {
        const boostA = actorFollows.has(a.did) ? 100 : 0
        const boostB = actorFollows.has(b.did) ? 100 : 0
        const scoreA = boostA + a.followersCount * 3 + a.postsCount * 2
        const scoreB = boostB + b.followersCount * 3 + b.postsCount * 2
        return scoreB - scoreA
      })
    }
    return accounts.slice(0, lim)
  }

  // -------------------------------------------------------------------------
  // Bookmarks, Drafts, Mutes, Muted Threads, Muted Lists, Lists
  // -------------------------------------------------------------------------

  createBookmark(did, uri, cid) {
    const canonical = this.canonicalizeUri(uri)
    const now = new Date().toISOString()
    const existing = this._stmts.isBookmarked.get(String(did), canonical)
    this.db
      .prepare(
        'INSERT OR REPLACE INTO bookmarks(did, uri, cid, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(String(did), canonical, String(cid || ''), now)
    if (!existing) {
      this._stmts.bumpBookmarkCount.run(canonical, 1, 1)
    }
    return {uri: canonical, cid: String(cid || ''), createdAt: now}
  }

  deleteBookmark(did, uri) {
    const canonical = this.canonicalizeUri(uri)
    const res = this.db
      .prepare('DELETE FROM bookmarks WHERE did = ? AND (uri = ? OR uri = ?)')
      .run(String(did), canonical, String(uri))
    if (Number(res.changes || 0) > 0) {
      this._stmts.bumpBookmarkCount.run(canonical, 0, -1)
    }
    return Number(res.changes || 0) > 0
  }

  isBookmarked(did, uri) {
    if (!did || !uri) return false
    const canonical = this.canonicalizeUri(uri)
    return Boolean(this._stmts.isBookmarked.get(String(did), canonical))
  }

  getBookmarks(did, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        'SELECT * FROM bookmarks WHERE did = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .all(String(did), lim + 1, offset)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => ({
      uri: r.uri,
      cid: r.cid,
      createdAt: r.created_at,
    }))
    return {
      items,
      cursor: hasMore ? String(offset + items.length) : undefined,
    }
  }

  getDrafts(did) {
    return this.db
      .prepare(
        'SELECT * FROM drafts WHERE did = ? ORDER BY updated_at DESC LIMIT 100',
      )
      .all(String(did))
      .map(r => ({
        id: r.id,
        draft: safeJsonParse(r.draft_json, {posts: []}),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
  }

  countDrafts(did) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM drafts WHERE did = ?')
      .get(String(did))
    return Number(row?.cnt || 0)
  }

  createDraft(did, id, draft) {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'INSERT INTO drafts(id, did, draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(String(id), String(did), JSON.stringify(draft || {posts: []}), now, now)
    return {id, draft, createdAt: now, updatedAt: now}
  }

  updateDraft(did, id, draft) {
    const now = new Date().toISOString()
    const res = this.db
      .prepare(
        'UPDATE drafts SET draft_json = ?, updated_at = ? WHERE id = ? AND did = ?',
      )
      .run(JSON.stringify(draft || {posts: []}), now, String(id), String(did))
    return Number(res.changes || 0) > 0
  }

  deleteDraft(did, id) {
    const res = this.db
      .prepare('DELETE FROM drafts WHERE id = ? AND did = ?')
      .run(String(id), String(did))
    return Number(res.changes || 0) > 0
  }

  muteActor(viewerDid, targetDid) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO mutes(viewer_did, target_did, created_at) VALUES (?, ?, ?)',
      )
      .run(String(viewerDid), String(targetDid), new Date().toISOString())
  }

  unmuteActor(viewerDid, targetDid) {
    this.db
      .prepare('DELETE FROM mutes WHERE viewer_did = ? AND target_did = ?')
      .run(String(viewerDid), String(targetDid))
  }

  getMutedDids(viewerDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        'SELECT target_did FROM mutes WHERE viewer_did = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .all(String(viewerDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const dids = rows.slice(0, lim).map(r => r.target_did)
    return {dids, cursor: hasMore ? String(offset + dids.length) : undefined}
  }

  getBlockedDids(viewerDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        'SELECT target_did FROM blocks WHERE viewer_did = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .all(String(viewerDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const dids = rows.slice(0, lim).map(r => r.target_did)
    return {dids, cursor: hasMore ? String(offset + dids.length) : undefined}
  }

  muteThread(viewerDid, rootUri) {
    const canonical = this.canonicalizeUri(rootUri)
    if (!canonical) return
    this.db
      .prepare(
        'INSERT OR IGNORE INTO muted_threads(viewer_did, root_uri, created_at) VALUES (?, ?, ?)',
      )
      .run(String(viewerDid), canonical, new Date().toISOString())
  }

  unmuteThread(viewerDid, rootUri) {
    const canonical = this.canonicalizeUri(rootUri)
    this.db
      .prepare(
        'DELETE FROM muted_threads WHERE viewer_did = ? AND (root_uri = ? OR root_uri = ?)',
      )
      .run(String(viewerDid), canonical, String(rootUri))
  }

  muteList(viewerDid, listUri) {
    const canonical = this.canonicalizeUri(listUri)
    if (!canonical) return
    this.db
      .prepare(
        'INSERT OR IGNORE INTO muted_lists(viewer_did, list_uri, created_at) VALUES (?, ?, ?)',
      )
      .run(String(viewerDid), canonical, new Date().toISOString())
  }

  unmuteList(viewerDid, listUri) {
    const canonical = this.canonicalizeUri(listUri)
    this.db
      .prepare(
        'DELETE FROM muted_lists WHERE viewer_did = ? AND (list_uri = ? OR list_uri = ?)',
      )
      .run(String(viewerDid), canonical, String(listUri))
  }

  getMutedListUris(viewerDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        'SELECT list_uri FROM muted_lists WHERE viewer_did = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .all(String(viewerDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const uris = rows.slice(0, lim).map(r => r.list_uri)
    return {uris, cursor: hasMore ? String(offset + uris.length) : undefined}
  }

  getListBlockRecords(viewerDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT * FROM records
        WHERE did = ? AND collection = 'app.bsky.graph.listblock'
        ORDER BY indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(String(viewerDid), lim + 1, offset)
    const hasMore = rows.length > lim
    const records = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      records,
      cursor: hasMore ? String(offset + records.length) : undefined,
    }
  }

  getListItemCount(listUri) {
    const canonical = this.canonicalizeUri(listUri)
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM records WHERE collection = 'app.bsky.graph.listitem' AND list_uri = ?",
      )
      .get(canonical)
    return Number(row?.cnt || 0)
  }

  getListItems(listUri, {limit = 50, cursor = null} = {}) {
    const canonical = this.canonicalizeUri(listUri)
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT * FROM records
        WHERE collection = 'app.bsky.graph.listitem' AND list_uri = ?
        ORDER BY indexed_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(canonical, lim + 1, offset)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => this._rowToRecord(r))
    return {
      items,
      cursor: hasMore ? String(offset + items.length) : undefined,
    }
  }

  getListMemberDids(listUri) {
    const canonical = this.canonicalizeUri(listUri)
    return this.db
      .prepare(
        "SELECT subject_did FROM records WHERE collection = 'app.bsky.graph.listitem' AND list_uri = ? AND subject_did IS NOT NULL",
      )
      .all(canonical)
      .map(r => r.subject_did)
  }

  // -------------------------------------------------------------------------
  // Materialized Notifications (O(log N + K))
  // -------------------------------------------------------------------------

  listNotifications(recipientDid, {limit = 40, cursor = null, reasons = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 40))
    const params = [String(recipientDid)]
    const wheres = ['n.recipient_did = ?']
    if (Array.isArray(reasons) && reasons.length > 0) {
      wheres.push(`n.reason IN (${reasons.map(() => '?').join(',')})`)
      params.push(...reasons)
    }
    if (cursor && /^\d+$/.test(String(cursor))) {
      wheres.push('n.id < ?')
      params.push(Number(cursor))
    }
    const rows = this.db
      .prepare(
        `
        SELECT n.* FROM notifications n
        JOIN accounts a ON a.did = n.actor_did
        WHERE ${wheres.join(' AND ')}
          AND a.status NOT IN ('banned', 'suspended')
          AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.viewer_did = n.recipient_did AND m.target_did = n.actor_did)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.viewer_did = n.recipient_did AND b.target_did = n.actor_did) OR (b.viewer_did = n.actor_did AND b.target_did = n.recipient_did))
        ORDER BY n.indexed_at DESC, n.id DESC
        LIMIT ?
      `,
      )
      .all(...params, lim + 1)
    const hasMore = rows.length > lim
    const items = rows.slice(0, lim).map(r => ({
      id: r.id,
      recipientDid: r.recipient_did,
      actorDid: r.actor_did,
      reason: r.reason,
      uri: r.uri,
      cid: r.cid,
      reasonSubject: r.reason_subject || undefined,
      record: safeJsonParse(r.record_json, {}),
      indexedAt: r.indexed_at,
    }))
    return {
      items,
      cursor: hasMore && items.length > 0 ? String(items[items.length - 1].id) : undefined,
    }
  }

  getUnreadNotificationCount(recipientDid, seenAt) {
    const floor = seenAt || '1970-01-01T00:00:00.000Z'
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS cnt FROM notifications n
        JOIN accounts a ON a.did = n.actor_did
        WHERE n.recipient_did = ?
          AND n.indexed_at > ?
          AND a.status NOT IN ('banned', 'suspended')
          AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.viewer_did = n.recipient_did AND m.target_did = n.actor_did)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.viewer_did = n.recipient_did AND b.target_did = n.actor_did) OR (b.viewer_did = n.actor_did AND b.target_did = n.recipient_did))
      `,
      )
      .get(String(recipientDid), String(floor))
    return Number(row?.cnt || 0)
  }

  // -------------------------------------------------------------------------
  // Direct Messages / Chat (Strict Authz + Persistent Logs + Pagination)
  // -------------------------------------------------------------------------

  _hydrateConvoRecord(convoRow) {
    if (!convoRow) return null
    const memberRows = this.db
      .prepare('SELECT * FROM convo_members WHERE convo_id = ?')
      .all(convoRow.id)
    const members = memberRows.filter(m => !m.left_at).map(m => m.did)
    const allMemberDids = memberRows.map(m => m.did)
    const readBy = {}
    const mutedBy = {}
    const statusBy = {}
    const leftBy = {}
    for (const m of memberRows) {
      readBy[m.did] = m.read_rev || ''
      mutedBy[m.did] = Boolean(m.muted)
      statusBy[m.did] = m.status || 'accepted'
      if (m.left_at) leftBy[m.did] = m.left_at
    }
    return {
      id: convoRow.id,
      memberKey: convoRow.member_key,
      rev: convoRow.rev,
      createdAt: convoRow.created_at,
      updatedAt: convoRow.updated_at,
      members,
      allMemberDids,
      readBy,
      mutedBy,
      statusBy,
      leftBy,
    }
  }

  getConvoById(convoId) {
    const row = this.db
      .prepare('SELECT * FROM convos WHERE id = ?')
      .get(String(convoId || ''))
    return this._hydrateConvoRecord(row)
  }

  getConvoByMemberKey(memberKey) {
    const row = this.db
      .prepare('SELECT * FROM convos WHERE member_key = ?')
      .get(String(memberKey || ''))
    return this._hydrateConvoRecord(row)
  }

  createConvo({id, members, rev}) {
    const sorted = [...new Set(members.filter(Boolean))].sort()
    const memberKey = sorted.join('|')
    const existing = this.getConvoByMemberKey(memberKey)
    if (existing) return existing
    const now = new Date().toISOString()
    this.inTransaction(() => {
      this.db
        .prepare(
          'INSERT INTO convos(id, member_key, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(String(id), memberKey, String(rev), now, now)
      const insMember = this.db.prepare(
        'INSERT OR IGNORE INTO convo_members(convo_id, did, read_rev, muted, status) VALUES (?, ?, ?, 0, ?)',
      )
      for (const did of sorted) {
        insMember.run(String(id), did, '', 'accepted')
      }
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(id),
          String(rev),
          'beginConvo',
          sorted[0] || '',
          JSON.stringify({convoId: id, rev}),
          now,
        )
    })
    return this.getConvoById(id)
  }

  listConvosForMember(did, {status = null, limit = 30, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 30))
    const offset = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const params = [String(did)]
    const wheres = ['cm.did = ?', 'cm.left_at IS NULL']
    if (status) {
      wheres.push('cm.status = ?')
      params.push(String(status))
    }
    const rows = this.db
      .prepare(
        `
        SELECT c.* FROM convos c
        JOIN convo_members cm ON cm.convo_id = c.id
        WHERE ${wheres.join(' AND ')}
        ORDER BY c.updated_at DESC, c.rev DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params, lim + 1, offset)
    const hasMore = rows.length > lim
    const convos = rows.slice(0, lim).map(r => this._hydrateConvoRecord(r))
    return {
      convos,
      cursor: hasMore ? String(offset + convos.length) : undefined,
    }
  }

  getLastMessageForConvo(convoId, viewerDid = null) {
    const rows = this.db
      .prepare(
        'SELECT * FROM convo_messages WHERE convo_id = ? ORDER BY rev DESC LIMIT 10',
      )
      .all(String(convoId))
    for (const r of rows) {
      const deletedFor = safeJsonParse(r.deleted_for_json, [])
      if (viewerDid && deletedFor.includes(viewerDid)) continue
      return this._rowToConvoMessage(r)
    }
    return undefined
  }

  countUnreadMessages(convoId, viewerDid, readRev = '') {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS cnt FROM convo_messages
        WHERE convo_id = ? AND sender_did != ? AND rev > ?
      `,
      )
      .get(String(convoId), String(viewerDid), String(readRev || ''))
    return Number(row?.cnt || 0)
  }

  _rowToConvoMessage(row) {
    if (!row) return null
    const facets = safeJsonParse(row.facets_json, undefined)
    const embed = safeJsonParse(row.embed_json, undefined)
    const reactions = safeJsonParse(row.reactions_json, [])
    return {
      $type: 'chat.bsky.convo.defs#messageView',
      id: row.id,
      rev: row.rev,
      text: row.text,
      ...(Array.isArray(facets) && facets.length > 0 ? {facets} : {}),
      ...(embed ? {embed} : {}),
      ...(Array.isArray(reactions) && reactions.length > 0 ? {reactions} : {}),
      sender: {did: row.sender_did},
      sentAt: row.sent_at,
    }
  }

  getConvoMessages(convoId, viewerDid, {limit = 50, cursor = null} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const rows = cursor
      ? this.db
          .prepare(
            'SELECT * FROM convo_messages WHERE convo_id = ? AND rev < ? ORDER BY rev DESC LIMIT ?',
          )
          .all(String(convoId), String(cursor), lim + 1)
      : this.db
          .prepare(
            'SELECT * FROM convo_messages WHERE convo_id = ? ORDER BY rev DESC LIMIT ?',
          )
          .all(String(convoId), lim + 1)
    const hasMore = rows.length > lim
    const slice = rows.slice(0, lim)
    const messages = slice.map(r => {
      const deletedFor = safeJsonParse(r.deleted_for_json, [])
      if (viewerDid && deletedFor.includes(viewerDid)) {
        return {
          $type: 'chat.bsky.convo.defs#deletedMessageView',
          id: r.id,
          rev: r.rev,
          sender: {did: r.sender_did},
          sentAt: r.sent_at,
        }
      }
      return this._rowToConvoMessage(r)
    })
    return {
      messages,
      cursor:
        hasMore && slice.length > 0 ? slice[slice.length - 1].rev : undefined,
    }
  }

  sendConvoMessage({
    convoId,
    messageId,
    rev,
    senderDid,
    text,
    facets = null,
    embed = null,
    sentAt = new Date().toISOString(),
  }) {
    const msg = {
      $type: 'chat.bsky.convo.defs#messageView',
      id: String(messageId),
      rev: String(rev),
      text: String(text || ''),
      ...(Array.isArray(facets) && facets.length > 0 ? {facets} : {}),
      ...(embed ? {embed} : {}),
      sender: {did: String(senderDid)},
      sentAt,
    }
    this.inTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO convo_messages(
            id, convo_id, rev, sender_did, text, facets_json, embed_json, reactions_json, deleted_for_json, sent_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?)
        `,
        )
        .run(
          msg.id,
          String(convoId),
          msg.rev,
          String(senderDid),
          msg.text,
          facets ? JSON.stringify(facets) : null,
          embed ? JSON.stringify(embed) : null,
          sentAt,
        )
      this.db
        .prepare('UPDATE convos SET rev = ?, updated_at = ? WHERE id = ?')
        .run(msg.rev, sentAt, String(convoId))
      // Rejoin anyone who previously left if a new message arrives, and mark sender read
      this.db
        .prepare(
          'UPDATE convo_members SET left_at = NULL WHERE convo_id = ?',
        )
        .run(String(convoId))
      this.db
        .prepare(
          'UPDATE convo_members SET read_rev = ? WHERE convo_id = ? AND did = ?',
        )
        .run(msg.rev, String(convoId), String(senderDid))
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(convoId),
          msg.rev,
          'createMessage',
          String(senderDid),
          JSON.stringify({
            $type: 'chat.bsky.convo.defs#logCreateMessage',
            rev: msg.rev,
            convoId: String(convoId),
            message: msg,
          }),
          sentAt,
        )
    })
    return msg
  }

  updateConvoRead(convoId, did, readRev) {
    this.db
      .prepare(
        'UPDATE convo_members SET read_rev = ? WHERE convo_id = ? AND did = ?',
      )
      .run(String(readRev), String(convoId), String(did))
    return this.getConvoById(convoId)
  }

  updateAllConvosRead(did) {
    const convos = this.listConvosForMember(did, {limit: 200}).convos
    let updatedCount = 0
    this.inTransaction(() => {
      for (const c of convos) {
        const res = this.db
          .prepare(
            'UPDATE convo_members SET read_rev = ? WHERE convo_id = ? AND did = ? AND read_rev != ?',
          )
          .run(c.rev, c.id, String(did), c.rev)
        if (Number(res.changes || 0) > 0) updatedCount++
      }
    })
    return updatedCount
  }

  setConvoMuted(convoId, did, muted, rev) {
    const now = new Date().toISOString()
    this.inTransaction(() => {
      this.db
        .prepare(
          'UPDATE convo_members SET muted = ? WHERE convo_id = ? AND did = ?',
        )
        .run(muted ? 1 : 0, String(convoId), String(did))
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(convoId),
          String(rev),
          muted ? 'muteConvo' : 'unmuteConvo',
          String(did),
          JSON.stringify({
            $type: muted
              ? 'chat.bsky.convo.defs#logMuteConvo'
              : 'chat.bsky.convo.defs#logUnmuteConvo',
            rev: String(rev),
            convoId: String(convoId),
          }),
          now,
        )
    })
    return this.getConvoById(convoId)
  }

  acceptConvo(convoId, did, rev) {
    const now = new Date().toISOString()
    this.inTransaction(() => {
      this.db
        .prepare(
          "UPDATE convo_members SET status = 'accepted' WHERE convo_id = ? AND did = ?",
        )
        .run(String(convoId), String(did))
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(convoId),
          String(rev),
          'acceptConvo',
          String(did),
          JSON.stringify({
            $type: 'chat.bsky.convo.defs#logAcceptConvo',
            rev: String(rev),
            convoId: String(convoId),
          }),
          now,
        )
    })
    return this.getConvoById(convoId)
  }

  leaveConvo(convoId, did, rev) {
    const now = new Date().toISOString()
    this.inTransaction(() => {
      this.db
        .prepare(
          'UPDATE convo_members SET left_at = ? WHERE convo_id = ? AND did = ?',
        )
        .run(now, String(convoId), String(did))
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(convoId),
          String(rev),
          'leaveConvo',
          String(did),
          JSON.stringify({
            $type: 'chat.bsky.convo.defs#logLeaveConvo',
            rev: String(rev),
            convoId: String(convoId),
          }),
          now,
        )
    })
    return {convoId: String(convoId), rev: String(rev)}
  }

  deleteConvoMessageForSelf(convoId, messageId, did, rev) {
    const row = this.db
      .prepare(
        'SELECT * FROM convo_messages WHERE id = ? AND convo_id = ?',
      )
      .get(String(messageId), String(convoId))
    if (!row) return null
    const deletedFor = safeJsonParse(row.deleted_for_json, [])
    if (!deletedFor.includes(did)) {
      deletedFor.push(did)
    }
    const now = new Date().toISOString()
    const deletedView = {
      $type: 'chat.bsky.convo.defs#deletedMessageView',
      id: row.id,
      rev: String(rev),
      sender: {did: row.sender_did},
      sentAt: row.sent_at,
    }
    this.inTransaction(() => {
      this.db
        .prepare(
          'UPDATE convo_messages SET deleted_for_json = ? WHERE id = ?',
        )
        .run(JSON.stringify(deletedFor), row.id)
      this.db
        .prepare(
          'INSERT INTO convo_logs(convo_id, rev, event_type, actor_did, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          String(convoId),
          String(rev),
          'deleteMessage',
          String(did),
          JSON.stringify({
            $type: 'chat.bsky.convo.defs#logDeleteMessage',
            rev: String(rev),
            convoId: String(convoId),
            message: deletedView,
          }),
          now,
        )
    })
    return deletedView
  }

  mutateConvoReaction(convoId, messageId, did, value, add = true) {
    const row = this.db
      .prepare('SELECT * FROM convo_messages WHERE id = ? AND convo_id = ?')
      .get(String(messageId), String(convoId))
    if (!row) return null
    let reactions = safeJsonParse(row.reactions_json, [])
    const cleanVal = String(value || '').slice(0, 32)
    reactions = reactions.filter(
      r => !(r?.sender?.did === did && r?.value === cleanVal),
    )
    if (add && cleanVal) {
      reactions.push({
        value: cleanVal,
        sender: {did: String(did)},
        createdAt: new Date().toISOString(),
      })
    }
    this.db
      .prepare('UPDATE convo_messages SET reactions_json = ? WHERE id = ?')
      .run(JSON.stringify(reactions), row.id)
    const updated = this.db
      .prepare('SELECT * FROM convo_messages WHERE id = ?')
      .get(row.id)
    return this._rowToConvoMessage(updated)
  }

  getConvoLogsForMember(did, {cursor = null, limit = 50} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const afterSeq = cursor ? Math.max(0, parseInt(String(cursor), 10) || 0) : 0
    const rows = this.db
      .prepare(
        `
        SELECT l.* FROM convo_logs l
        JOIN convo_members cm ON cm.convo_id = l.convo_id
        WHERE cm.did = ? AND l.seq > ?
        ORDER BY l.seq ASC
        LIMIT ?
      `,
      )
      .all(String(did), afterSeq, lim)
    const logs = rows.map(r => safeJsonParse(r.payload_json, {rev: r.rev, convoId: r.convo_id}))
    return {
      logs,
      cursor: rows.length > 0 ? String(rows[rows.length - 1].seq) : cursor || undefined,
    }
  }

  getUnreadConvoCounts(did) {
    const rows = this.db
      .prepare(
        `
        SELECT cm.convo_id, cm.read_rev, cm.status
        FROM convo_members cm
        WHERE cm.did = ? AND cm.left_at IS NULL
      `,
      )
      .all(String(did))
    let unreadAcceptedConvos = 0
    let unreadRequestConvos = 0
    for (const r of rows) {
      const cnt = this.countUnreadMessages(r.convo_id, did, r.read_rev)
      if (cnt > 0) {
        if (r.status === 'request') unreadRequestConvos++
        else unreadAcceptedConvos++
      }
    }
    return {unreadAcceptedConvos, unreadRequestConvos}
  }

  // -------------------------------------------------------------------------
  // New Durable Domain Tables (CONTRACT.md Section 2)
  // -------------------------------------------------------------------------

  // --- A. Articles ---
  _rowToArticle(row) {
    if (!row) return null
    return {
      id: row.id,
      uri: row.uri || `at://${row.author_did}/com.quantzing.article/${row.id}`,
      cid: row.cid || undefined,
      authorDid: row.author_did,
      title: row.title,
      subtitle: row.subtitle || '',
      body: row.body || '',
      tags: safeJsonParse(row.tags_json, []),
      coverUrl: row.cover_url || undefined,
      status: row.status === 'published' ? 'published' : 'draft',
      readTimeMinutes: Number(row.read_time_minutes || 1),
      viewsCount: Number(row.views_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at || undefined,
    }
  }

  listArticles({actorDid = null, status = 'all', viewerDid = null, limit = 50} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const params = []
    const wheres = []
    if (actorDid) {
      wheres.push('author_did = ?')
      params.push(String(actorDid))
    }
    if (status === 'published') {
      wheres.push("status = 'published'")
    } else if (status === 'draft') {
      if (!viewerDid) return []
      wheres.push("status = 'draft' AND author_did = ?")
      params.push(String(viewerDid))
    } else {
      // 'all': published for everyone + drafts only for author
      if (viewerDid) {
        wheres.push("(status = 'published' OR author_did = ?)")
        params.push(String(viewerDid))
      } else {
        wheres.push("status = 'published'")
      }
    }
    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''
    return this.db
      .prepare(
        `SELECT * FROM articles ${whereSql} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`,
      )
      .all(...params, lim)
      .map(r => this._rowToArticle(r))
  }

  getArticleById(id) {
    const row = this.db
      .prepare('SELECT * FROM articles WHERE id = ?')
      .get(String(id || ''))
    return this._rowToArticle(row)
  }

  upsertArticle({
    id,
    uri = null,
    cid = null,
    authorDid,
    title,
    subtitle = '',
    body = '',
    tags = [],
    coverUrl = null,
    status = 'draft',
  }) {
    const now = new Date().toISOString()
    const existing = id ? this.getArticleById(id) : null
    const articleId = existing?.id || id || `art_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
    const cleanStatus = status === 'published' ? 'published' : 'draft'
    const publishedAt =
      cleanStatus === 'published' ? existing?.publishedAt || now : existing?.publishedAt || null
    const cleanTags = Array.isArray(tags)
      ? tags.map(t => String(t || '').trim().replace(/^#/, '')).filter(Boolean).slice(0, 12)
      : []
    const readTimeMinutes = estimateReadTimeMinutes(body)
    const canonicalUri =
      uri || existing?.uri || `at://${authorDid}/com.quantzing.article/${articleId}`

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE articles
          SET uri = ?, cid = ?, title = ?, subtitle = ?, body = ?, tags_json = ?,
              cover_url = ?, status = ?, read_time_minutes = ?, updated_at = ?, published_at = ?
          WHERE id = ?
        `,
        )
        .run(
          canonicalUri,
          cid || existing.cid || null,
          String(title || '').slice(0, 240),
          String(subtitle || '').slice(0, 400),
          String(body || '').slice(0, 200_000),
          JSON.stringify(cleanTags),
          coverUrl ? String(coverUrl).slice(0, 1000) : null,
          cleanStatus,
          readTimeMinutes,
          now,
          publishedAt,
          articleId,
        )
    } else {
      this.db
        .prepare(
          `
          INSERT INTO articles (
            id, uri, cid, author_did, title, subtitle, body, tags_json, cover_url,
            status, read_time_minutes, views_count, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `,
        )
        .run(
          articleId,
          canonicalUri,
          cid || null,
          String(authorDid),
          String(title || '').slice(0, 240),
          String(subtitle || '').slice(0, 400),
          String(body || '').slice(0, 200_000),
          JSON.stringify(cleanTags),
          coverUrl ? String(coverUrl).slice(0, 1000) : null,
          cleanStatus,
          readTimeMinutes,
          now,
          now,
          publishedAt,
        )
    }
    return this.getArticleById(articleId)
  }

  deleteArticle(id, authorDid) {
    const res = this.db
      .prepare('DELETE FROM articles WHERE id = ? AND author_did = ?')
      .run(String(id), String(authorDid))
    return Number(res.changes || 0) > 0
  }

  // --- B. ZingSpaces ---
  _hydrateSpace(row) {
    if (!row) return null
    const participants = this.db
      .prepare(
        'SELECT * FROM space_participants WHERE space_id = ? AND left_at IS NULL ORDER BY joined_at ASC',
      )
      .all(row.id)
      .map(p => ({
        did: p.did,
        role: p.role || 'listener',
        handRaised: Boolean(p.hand_raised),
        muted: Boolean(p.muted),
        joinedAt: p.joined_at,
      }))
    const recentReactions = this.db
      .prepare(
        'SELECT * FROM space_reactions WHERE space_id = ? ORDER BY created_at DESC LIMIT 30',
      )
      .all(row.id)
      .map(r => ({
        id: r.id,
        did: r.did,
        kind: r.kind,
        createdAt: r.created_at,
      }))
    const speakerCount = participants.filter(
      p => p.role === 'host' || p.role === 'speaker',
    ).length
    const listenerCount = participants.length
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      topic: row.topic || '',
      hostDid: row.host_did,
      status: row.status || 'live',
      audioMode: row.audio_mode || 'webrtc_signaling',
      allowRecording: Boolean(row.allow_recording),
      coHostEnabled: Boolean(row.co_host_enabled),
      startedAt: row.started_at || row.created_at,
      scheduledFor: row.scheduled_for || undefined,
      endedAt: row.ended_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      listenerCount,
      speakerCount,
      participants,
      recentReactions,
    }
  }

  listSpaces({status = 'all', hostDid = null, limit = 50} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const wheres = []
    const params = []
    if (status && status !== 'all') {
      wheres.push('status = ?')
      params.push(String(status))
    }
    if (hostDid) {
      wheres.push('host_did = ?')
      params.push(String(hostDid))
    }
    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''
    return this.db
      .prepare(
        `SELECT * FROM spaces ${whereSql} ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, updated_at DESC LIMIT ?`,
      )
      .all(...params, lim)
      .map(r => this._hydrateSpace(r))
  }

  getSpaceBySlug(slug) {
    const row = this.db
      .prepare('SELECT * FROM spaces WHERE slug = ? OR id = ?')
      .get(String(slug || ''), String(slug || ''))
    return this._hydrateSpace(row)
  }

  createSpace({
    hostDid,
    title,
    topic = '',
    status = 'live',
    audioMode = 'webrtc_signaling',
    scheduledFor = null,
    allowRecording = false,
    coHostEnabled = false,
  }) {
    const now = new Date().toISOString()
    const id = `spc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
    const slug = makeSlug(title)
    const cleanStatus = status === 'scheduled' ? 'scheduled' : 'live'
    const cleanAudioMode = String(audioMode || 'webrtc_signaling')
    const startedAt = cleanStatus === 'live' ? now : null
    this.inTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO spaces(
            id, slug, title, topic, host_did, status, audio_mode,
            allow_recording, co_host_enabled, started_at, scheduled_for, ended_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        `,
        )
        .run(
          id,
          slug,
          String(title || 'Untitled ZingSpace').slice(0, 180),
          String(topic || '').slice(0, 120),
          String(hostDid),
          cleanStatus,
          cleanAudioMode,
          allowRecording ? 1 : 0,
          coHostEnabled ? 1 : 0,
          startedAt,
          scheduledFor || null,
          now,
          now,
        )
      this.db
        .prepare(
          `
          INSERT OR REPLACE INTO space_participants(space_id, did, role, hand_raised, muted, joined_at, left_at)
          VALUES (?, ?, 'host', 0, 0, ?, NULL)
        `,
        )
        .run(id, String(hostDid), now)
    })
    return this.getSpaceBySlug(slug)
  }

  updateSpace(slug, {title, topic, status, promoteDid, demoteDid} = {}) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const now = new Date().toISOString()
    const nextTitle =
      title !== undefined ? String(title).slice(0, 180) : existing.title
    const nextTopic =
      topic !== undefined ? String(topic).slice(0, 120) : existing.topic
    const nextStatus =
      status === 'live' || status === 'scheduled' || status === 'ended'
        ? status
        : existing.status
    const nextStartedAt =
      nextStatus === 'live' && !existing.startedAt ? now : existing.startedAt
    const nextEndedAt =
      nextStatus === 'ended' ? existing.endedAt || now : null

    this.inTransaction(() => {
      this.db
        .prepare(
          `
          UPDATE spaces
          SET title = ?, topic = ?, status = ?, started_at = ?, ended_at = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          nextTitle,
          nextTopic,
          nextStatus,
          nextStartedAt,
          nextEndedAt,
          now,
          existing.id,
        )
      if (promoteDid && promoteDid !== existing.hostDid) {
        this.db
          .prepare(
            `
            INSERT INTO space_participants(space_id, did, role, hand_raised, muted, joined_at, left_at)
            VALUES (?, ?, 'speaker', 0, 0, ?, NULL)
            ON CONFLICT(space_id, did) DO UPDATE SET role = 'speaker', hand_raised = 0, left_at = NULL
          `,
          )
          .run(existing.id, String(promoteDid), now)
      }
      if (demoteDid && demoteDid !== existing.hostDid) {
        this.db
          .prepare(
            "UPDATE space_participants SET role = 'listener', muted = 1 WHERE space_id = ? AND did = ?",
          )
          .run(existing.id, String(demoteDid))
      }
    })
    return this.getSpaceBySlug(existing.slug)
  }

  deleteSpace(slug, hostDid) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing || existing.hostDid !== hostDid) return false
    const res = this.db
      .prepare('DELETE FROM spaces WHERE id = ?')
      .run(existing.id)
    return Number(res.changes || 0) > 0
  }

  joinSpace(slug, did) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const now = new Date().toISOString()
    const role = existing.hostDid === did ? 'host' : 'listener'
    const initialMuted = role === 'host' ? 0 : 1
    this.db
      .prepare(
        `
        INSERT INTO space_participants(space_id, did, role, hand_raised, muted, joined_at, left_at)
        VALUES (?, ?, ?, 0, ?, ?, NULL)
        ON CONFLICT(space_id, did) DO UPDATE SET
          left_at = NULL,
          joined_at = excluded.joined_at,
          muted = CASE WHEN space_participants.role = 'listener' THEN 1 ELSE space_participants.muted END
      `,
      )
      .run(existing.id, String(did), role, initialMuted, now)
    this.db
      .prepare('UPDATE spaces SET updated_at = ? WHERE id = ?')
      .run(now, existing.id)
    return this.getSpaceBySlug(existing.slug)
  }

  leaveSpace(slug, did) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const now = new Date().toISOString()
    if (existing.hostDid !== did) {
      this.db
        .prepare(
          'UPDATE space_participants SET left_at = ?, hand_raised = 0 WHERE space_id = ? AND did = ?',
        )
        .run(now, existing.id, String(did))
    }
    this.db
      .prepare('UPDATE spaces SET updated_at = ? WHERE id = ?')
      .run(now, existing.id)
    return this.getSpaceBySlug(existing.slug)
  }

  setSpaceHand(slug, did, raised) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const now = new Date().toISOString()
    const role = existing.hostDid === did ? 'host' : 'listener'
    const initialMuted = role === 'host' ? 0 : 1
    this.db
      .prepare(
        `
        INSERT INTO space_participants(space_id, did, role, hand_raised, muted, joined_at, left_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(space_id, did) DO UPDATE SET hand_raised = excluded.hand_raised, left_at = NULL
      `,
      )
      .run(existing.id, String(did), role, raised ? 1 : 0, initialMuted, now)
    this.db
      .prepare('UPDATE spaces SET updated_at = ? WHERE id = ?')
      .run(now, existing.id)
    return this.getSpaceBySlug(existing.slug)
  }

  setSpaceMuted(slug, did, muted) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const now = new Date().toISOString()
    const participant = this.db
      .prepare(
        'SELECT role FROM space_participants WHERE space_id = ? AND did = ?',
      )
      .get(existing.id, String(did))
    const role =
      participant?.role || (existing.hostDid === did ? 'host' : 'listener')
    const effectiveMuted = role === 'listener' ? 1 : muted ? 1 : 0
    this.db
      .prepare(
        `
        INSERT INTO space_participants(space_id, did, role, hand_raised, muted, joined_at, left_at)
        VALUES (?, ?, ?, 0, ?, ?, NULL)
        ON CONFLICT(space_id, did) DO UPDATE SET muted = excluded.muted, left_at = NULL
      `,
      )
      .run(existing.id, String(did), role, effectiveMuted, now)
    this.db
      .prepare('UPDATE spaces SET updated_at = ? WHERE id = ?')
      .run(now, existing.id)
    return this.getSpaceBySlug(existing.slug)
  }

  addSpaceReaction(slug, did, kind) {
    const existing = this.getSpaceBySlug(slug)
    if (!existing) return null
    const allowed = new Set(['applause', 'fire', 'insight', 'heart', 'wave'])
    const cleanKind = allowed.has(kind) ? kind : 'applause'
    const now = new Date().toISOString()
    const id = `rxn_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
    this.db
      .prepare(
        'INSERT INTO space_reactions(id, space_id, did, kind, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, existing.id, String(did), cleanKind, now)
    this.db
      .prepare('UPDATE spaces SET updated_at = ? WHERE id = ?')
      .run(now, existing.id)
    return this.getSpaceBySlug(existing.slug)
  }

  // --- C. Polls ---
  votePoll(postUri, voterDid, optionId) {
    const canonical = this.canonicalizeUri(postUri)
    const existing = this.db
      .prepare(
        'SELECT option_id FROM poll_votes WHERE post_uri = ? AND voter_did = ?',
      )
      .get(canonical, String(voterDid))
    if (existing) {
      return {alreadyVoted: true, optionId: existing.option_id}
    }
    this.db
      .prepare(
        'INSERT INTO poll_votes(post_uri, voter_did, option_id, voted_at) VALUES (?, ?, ?, ?)',
      )
      .run(canonical, String(voterDid), String(optionId), new Date().toISOString())
    return {alreadyVoted: false, optionId: String(optionId)}
  }

  getPollTallies(postUri, viewerDid = null) {
    const canonical = this.canonicalizeUri(postUri)
    const rows = this.db
      .prepare(
        'SELECT option_id, COUNT(*) AS cnt FROM poll_votes WHERE post_uri = ? GROUP BY option_id',
      )
      .all(canonical)
    const countsByOption = new Map()
    let totalVotes = 0
    for (const r of rows) {
      const cnt = Number(r.cnt || 0)
      countsByOption.set(r.option_id, cnt)
      totalVotes += cnt
    }
    let viewerVoteOptionId = null
    if (viewerDid) {
      const vRow = this.db
        .prepare(
          'SELECT option_id FROM poll_votes WHERE post_uri = ? AND voter_did = ?',
        )
        .get(canonical, String(viewerDid))
      if (vRow) viewerVoteOptionId = vRow.option_id
    }
    return {countsByOption, totalVotes, viewerVoteOptionId}
  }

  // --- D. QuantZing Pro Subscriptions & Orders ---
  getProSubscription(did) {
    const row = this.db
      .prepare('SELECT * FROM pro_subscriptions WHERE did = ?')
      .get(String(did))
    if (!row) {
      return {
        planId: 'free',
        status: 'free',
        billingCycle: 'monthly',
        activatedAt: undefined,
        expiresAt: undefined,
        cancelAtPeriodEnd: false,
        verifiedBadge: false,
        orderId: undefined,
      }
    }
    return {
      planId: row.plan_id,
      status: row.status,
      billingCycle: row.billing_cycle || 'monthly',
      activatedAt: row.activated_at || undefined,
      expiresAt: row.expires_at || undefined,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      verifiedBadge: Boolean(row.verified_badge),
      orderId: row.order_id || undefined,
    }
  }

  upsertProSubscription(did, sub) {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `
        INSERT INTO pro_subscriptions(
          did, plan_id, status, billing_cycle, activated_at, expires_at,
          cancel_at_period_end, verified_badge, order_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(did) DO UPDATE SET
          plan_id = excluded.plan_id,
          status = excluded.status,
          billing_cycle = excluded.billing_cycle,
          activated_at = excluded.activated_at,
          expires_at = excluded.expires_at,
          cancel_at_period_end = excluded.cancel_at_period_end,
          verified_badge = excluded.verified_badge,
          order_id = excluded.order_id,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        String(did),
        String(sub.planId || 'free'),
        String(sub.status || 'free'),
        String(sub.billingCycle || 'monthly'),
        sub.activatedAt || null,
        sub.expiresAt || null,
        sub.cancelAtPeriodEnd ? 1 : 0,
        sub.verifiedBadge ? 1 : 0,
        sub.orderId || null,
        now,
      )
    return this.getProSubscription(did)
  }

  createProOrder({
    id,
    did,
    planId,
    status = 'pending',
    amountInr = 0,
    amountUsd = 0,
    checkoutUrl = null,
    providerSessionId = null,
    returnUrl = null,
  }) {
    const now = new Date().toISOString()
    const orderId = id || `ord_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
    this.db
      .prepare(
        `
        INSERT INTO pro_orders(
          id, did, plan_id, status, amount_inr, amount_usd,
          checkout_url, provider_session_id, return_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        orderId,
        String(did),
        String(planId),
        String(status),
        Number(amountInr || 0),
        Number(amountUsd || 0),
        checkoutUrl,
        providerSessionId,
        returnUrl,
        now,
        now,
      )
    return this.getProOrder(orderId)
  }

  getProOrder(orderId) {
    const row = this.db
      .prepare('SELECT * FROM pro_orders WHERE id = ?')
      .get(String(orderId || ''))
    if (!row) return null
    return {
      id: row.id,
      did: row.did,
      planId: row.plan_id,
      status: row.status,
      amountInr: Number(row.amount_inr || 0),
      amountUsd: Number(row.amount_usd || 0),
      checkoutUrl: row.checkout_url || undefined,
      providerSessionId: row.provider_session_id || undefined,
      returnUrl: row.return_url || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  updateProOrderStatus(orderId, status) {
    this.db
      .prepare('UPDATE pro_orders SET status = ?, updated_at = ? WHERE id = ?')
      .run(String(status), new Date().toISOString(), String(orderId))
    return this.getProOrder(orderId)
  }

  // --- E. Creator Studio Analytics & Monetization (100% Real viewCount!) ---
  getCreatorAnalytics(did, windowDays = 30) {
    const days = Math.min(365, Math.max(1, Number(windowDays) || 30))
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString()
    const account = this.getAccountByDid(did)

    const rows = this.db
      .prepare(
        `
        SELECT
          r.uri, r.cid, r.text_content, r.created_at,
          COALESCE(pc.like_count, 0) AS like_count,
          COALESCE(pc.repost_count, 0) AS repost_count,
          COALESCE(pc.reply_count, 0) AS reply_count,
          COALESCE(pc.quote_count, 0) AS quote_count,
          COALESCE(pc.bookmark_count, 0) AS bookmark_count,
          COALESCE(pc.view_count, 0) AS view_count
        FROM records r
        LEFT JOIN post_counters pc ON pc.uri = r.uri
        WHERE r.did = ?
          AND r.collection = 'app.bsky.feed.post'
          AND r.created_at >= ?
          AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ORDER BY r.created_at DESC
      `,
      )
      .all(String(did), cutoffIso)

    let impressions = 0
    let likes = 0
    let rezings = 0
    let replies = 0
    let quotes = 0
    let bookmarks = 0

    const dailyMap = new Map()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
      dailyMap.set(d, {date: d, impressions: 0, engagements: 0, posts: 0})
    }

    const postMetrics = []
    for (const r of rows) {
      const viewCount =
        Number(r.view_count || 0) + (this.pendingViewOverlay.get(r.uri) || 0)
      const likeCount = Number(r.like_count || 0)
      const repostCount = Number(r.repost_count || 0)
      const replyCount = Number(r.reply_count || 0)
      const quoteCount = Number(r.quote_count || 0)
      const bookmarkCount = Number(r.bookmark_count || 0)
      const eng = likeCount + repostCount + replyCount + quoteCount + bookmarkCount

      impressions += viewCount
      likes += likeCount
      rezings += repostCount
      replies += replyCount
      quotes += quoteCount
      bookmarks += bookmarkCount

      const dayKey = String(r.created_at || '').slice(0, 10)
      const bucket = dailyMap.get(dayKey)
      if (bucket) {
        bucket.impressions += viewCount
        bucket.engagements += eng
        bucket.posts += 1
      }

      postMetrics.push({
        uri: r.uri,
        cid: r.cid,
        text: r.text_content || '',
        createdAt: r.created_at,
        viewCount,
        likeCount,
        repostCount,
        replyCount,
        quoteCount,
        bookmarkCount,
        engagementRate:
          viewCount > 0 ? Number(((eng / viewCount) * 100).toFixed(2)) : 0,
      })
    }

    const totalEngagements = likes + rezings + replies + quotes + bookmarks
    const engagementRate =
      impressions > 0
        ? Number(((totalEngagements / impressions) * 100).toFixed(2))
        : 0

    const topPosts = [...postMetrics]
      .sort(
        (a, b) =>
          b.viewCount - a.viewCount ||
          b.likeCount + b.repostCount - (a.likeCount + a.repostCount),
      )
      .slice(0, 20)

    return {
      windowDays: days,
      totals: {
        postsCount: rows.length,
        followersCount: Number(account?.followersCount || 0),
        followingCount: Number(account?.followsCount || 0),
        impressions,
        likes,
        rezings,
        replies,
        quotes,
        bookmarks,
        engagementRate,
      },
      daily: [...dailyMap.values()],
      topPosts,
    }
  }

  getCreatorMonetization(did) {
    const row = this.db
      .prepare('SELECT * FROM creator_monetization WHERE did = ?')
      .get(String(did))
    if (!row) {
      return {
        enrolled: false,
        status: 'not_enrolled',
        payoutMethod: '',
        enrolledAt: undefined,
      }
    }
    return {
      enrolled: Boolean(row.enrolled),
      status: row.status || 'not_enrolled',
      payoutMethod: row.payout_method || '',
      enrolledAt: row.enrolled_at || undefined,
    }
  }

  upsertCreatorMonetization(did, {enrolled, status, payoutMethod, enrolledAt}) {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `
        INSERT INTO creator_monetization(did, enrolled, status, payout_method, enrolled_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(did) DO UPDATE SET
          enrolled = excluded.enrolled,
          status = excluded.status,
          payout_method = excluded.payout_method,
          enrolled_at = excluded.enrolled_at,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        String(did),
        enrolled ? 1 : 0,
        String(status || 'not_enrolled'),
        String(payoutMethod || ''),
        enrolledAt || null,
        now,
      )
    return this.getCreatorMonetization(did)
  }

  // --- F. Quanty Threads & Messages ---
  listQuantyThreads(did, limit = 50) {
    return this.db
      .prepare(
        `
        SELECT t.*, (SELECT COUNT(*) FROM quanty_messages m WHERE m.thread_id = t.id) AS message_count
        FROM quanty_threads t
        WHERE t.did = ?
        ORDER BY t.updated_at DESC
        LIMIT ?
      `,
      )
      .all(String(did), Math.min(100, Math.max(1, Number(limit) || 50)))
      .map(r => ({
        id: r.id,
        did: r.did,
        title: r.title,
        mode: r.mode || 'ask',
        contextUri: r.context_uri || undefined,
        postContext: safeJsonParse(r.post_context_json, null),
        messageCount: Number(r.message_count || 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
  }

  getQuantyThread(arg1, arg2 = null) {
    let threadId = String(arg1 || '')
    let did = arg2 != null ? String(arg2) : null
    if (threadId.startsWith('did:') && did && !did.startsWith('did:')) {
      // Called as (did, threadId) from quantzing-quanty.mjs
      const tmp = threadId
      threadId = did
      did = tmp
    }
    const row = did
      ? this.db
          .prepare('SELECT * FROM quanty_threads WHERE id = ? AND did = ?')
          .get(threadId, did)
      : this.db
          .prepare('SELECT * FROM quanty_threads WHERE id = ?')
          .get(threadId)
    if (!row) return null
    const messages = this.db
      .prepare(
        'SELECT * FROM quanty_messages WHERE thread_id = ? ORDER BY created_at ASC',
      )
      .all(row.id)
      .map(m => ({
        id: m.id,
        threadId: m.thread_id,
        role: m.role,
        content: m.content,
        mode: m.mode || 'ask',
        origin: m.origin || undefined,
        provider: m.provider || undefined,
        model: m.model || undefined,
        latencyMs:
          m.latency_ms != null ? Number(m.latency_ms) : undefined,
        citations: safeJsonParse(m.citations_json, []),
        toolCalls: safeJsonParse(m.tool_calls_json, []),
        toolTraces: safeJsonParse(m.tool_traces_json, []),
        proposedActions: safeJsonParse(m.proposed_actions_json, []),
        suggestedZingDraft: m.suggested_zing_draft || undefined,
        createdAt: m.created_at,
      }))
    const thread = {
      id: row.id,
      did: row.did,
      title: row.title,
      mode: row.mode || 'ask',
      contextUri: row.context_uri || undefined,
      postContext: safeJsonParse(row.post_context_json, null),
      messageCount: messages.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    return {
      ...thread,
      thread,
      messages,
    }
  }

  createQuantyThread({
    id,
    did,
    title = 'New Quanty Thread',
    mode = 'ask',
    contextUri = null,
    postContext = null,
  }) {
    const now = new Date().toISOString()
    const threadId =
      id || `qth_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
    const cleanTitle = String(title || 'New Quanty Thread').slice(0, 160)
    const cleanMode = String(mode || 'ask')
    this.db
      .prepare(
        'INSERT INTO quanty_threads(id, did, title, mode, context_uri, post_context_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        threadId,
        String(did),
        cleanTitle,
        cleanMode,
        contextUri || postContext?.uri || null,
        postContext ? JSON.stringify(postContext) : null,
        now,
        now,
      )
    return {
      id: threadId,
      did: String(did),
      title: cleanTitle,
      mode: cleanMode,
      contextUri: contextUri || postContext?.uri || undefined,
      postContext: postContext || null,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  appendQuantyThreadMessage(did, threadId, msg = {}) {
    const existing = this.getQuantyThread(did, threadId)
    if (!existing) return null
    const now = new Date().toISOString()
    const msgId =
      msg.id ||
      `qmsg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const content = String(msg.content || '').slice(0, 16000)
    const mode = String(msg.mode || existing.thread.mode || 'ask')
    const nextTitle =
      (existing.thread.title === 'New Quanty Thread' ||
        existing.thread.title === 'New Quanty Chat') &&
      role === 'user' &&
      content
        ? content.slice(0, 72)
        : existing.thread.title

    const record = {
      id: msgId,
      threadId: String(threadId),
      role,
      content,
      mode,
      origin: msg.origin || 'quant-ai',
      provider: msg.provider || undefined,
      model: msg.model || undefined,
      latencyMs:
        typeof msg.latencyMs === 'number' ? Math.round(msg.latencyMs) : undefined,
      citations: Array.isArray(msg.citations) ? msg.citations : [],
      toolCalls: Array.isArray(msg.toolCalls) ? msg.toolCalls : [],
      toolTraces: Array.isArray(msg.toolTraces) ? msg.toolTraces : [],
      proposedActions: Array.isArray(msg.proposedActions)
        ? msg.proposedActions
        : [],
      suggestedZingDraft: msg.suggestedZingDraft
        ? String(msg.suggestedZingDraft).slice(0, 300)
        : undefined,
      createdAt: now,
    }

    this.inTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO quanty_messages(
            id, thread_id, did, role, content, mode, origin, provider, model, latency_ms,
            citations_json, tool_calls_json, tool_traces_json, proposed_actions_json, suggested_zing_draft, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          record.id,
          String(threadId),
          String(did),
          record.role,
          record.content,
          record.mode,
          String(record.origin || 'quant-ai'),
          record.provider ? String(record.provider) : null,
          record.model ? String(record.model) : null,
          record.latencyMs ?? null,
          JSON.stringify(record.citations),
          JSON.stringify(record.toolCalls),
          JSON.stringify(record.toolTraces),
          JSON.stringify(record.proposedActions),
          record.suggestedZingDraft || null,
          now,
        )
      this.db
        .prepare(
          'UPDATE quanty_threads SET title = ?, mode = ?, updated_at = ? WHERE id = ?',
        )
        .run(nextTitle, mode, now, String(threadId))
    })

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

  appendQuantyMessage(msg = {}) {
    const row = this.db
      .prepare('SELECT did FROM quanty_threads WHERE id = ?')
      .get(String(msg.threadId || ''))
    if (!row) return null
    const res = this.appendQuantyThreadMessage(row.did, msg.threadId, msg)
    return res?.message || null
  }

  deleteQuantyThread(arg1, arg2) {
    let threadId = String(arg1 || '')
    let did = String(arg2 || '')
    if (threadId.startsWith('did:') && !did.startsWith('did:')) {
      const tmp = threadId
      threadId = did
      did = tmp
    }
    const res = this.db
      .prepare('DELETE FROM quanty_threads WHERE id = ? AND did = ?')
      .run(threadId, did)
    return Number(res.changes || 0) > 0
  }

  // --- G. Support Tickets ---
  createSupportTicket({
    did = null,
    handle = null,
    email = null,
    category = 'general',
    subject,
    message,
  }) {
    const now = new Date().toISOString()
    const id = `tkt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
    this.db
      .prepare(
        `
        INSERT INTO support_tickets(
          id, did, handle, email, category, subject, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      `,
      )
      .run(
        id,
        did ? String(did) : null,
        handle ? String(handle) : null,
        email ? String(email).trim().slice(0, 200) : null,
        String(category || 'general').slice(0, 64),
        String(subject || 'Support Request').slice(0, 200),
        String(message || '').slice(0, 5000),
        now,
        now,
      )
    return {
      id,
      did: did || undefined,
      handle: handle || undefined,
      email: email || undefined,
      category: String(category || 'general').slice(0, 64),
      subject: String(subject || 'Support Request').slice(0, 200),
      message: String(message || '').slice(0, 5000),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }
  }

  listSupportTickets({did = null, includeAll = false, limit = 50} = {}) {
    const lim = Math.min(100, Math.max(1, Number(limit) || 50))
    const rows = includeAll
      ? this.db
          .prepare(
            'SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?',
          )
          .all(lim)
      : this.db
          .prepare(
            'SELECT * FROM support_tickets WHERE did = ? ORDER BY created_at DESC LIMIT ?',
          )
          .all(String(did || ''), lim)
    return rows.map(r => ({
      id: r.id,
      did: r.did || undefined,
      handle: r.handle || undefined,
      email: r.email || undefined,
      category: r.category,
      subject: r.subject,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  // -------------------------------------------------------------------------
  // Reports & Audit Logs (Direct O(1) SQLite helpers)
  // -------------------------------------------------------------------------

  createReport(report) {
    const row = this.db.prepare('SELECT COALESCE(MAX(id), 0) AS max_id FROM reports').get()
    const id = Number(row?.max_id || 0) + 1
    const full = {...report, id}
    this.db
      .prepare(
        `
        INSERT INTO reports(
          id, created_at, reporter_did, reason_type, reason,
          subject_type, subject_uri, subject_did, subject_cid, status, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        full.createdAt || new Date().toISOString(),
        full.reporterDid || null,
        full.reasonType || 'com.atproto.moderation.defs#reasonOther',
        full.reason || '',
        full.subjectType || 'account',
        full.subjectUri || null,
        full.subjectDid || null,
        full.subjectCid || null,
        full.status || 'open',
        JSON.stringify(full),
      )
    return full
  }

  appendAuditEvent({
    id,
    timestamp = new Date().toISOString(),
    actorDid = 'system',
    actorHandle = 'system',
    actorRole = 'system',
    ip = '127.0.0.1',
    action = '',
    target = '',
    details = {},
  }) {
    const entryId =
      id || `aud_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO audit_logs(
          id, timestamp, actor_did, actor_handle, actor_role, ip, action, target, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        entryId,
        timestamp,
        String(actorDid),
        String(actorHandle),
        String(actorRole),
        String(ip),
        String(action),
        String(target),
        JSON.stringify(details && typeof details === 'object' ? details : {}),
      )
    return {
      id: entryId,
      timestamp,
      actorDid,
      actorHandle,
      actorRole,
      ip,
      action,
      target,
      details,
    }
  }

  // -------------------------------------------------------------------------
  // Compatibility View for quantzing-admin.mjs & Quanty Bridge (Zero db.json writes!)
  // -------------------------------------------------------------------------

  createCompatibilityDbView({includeRecords = false} = {}) {
    const accounts = {}
    for (const acc of this.listAllAccounts()) {
      accounts[acc.did] = acc
    }

    const blobs = {}
    for (const b of this.db.prepare('SELECT * FROM blobs').all()) {
      blobs[b.cid] = {
        cid: b.cid,
        did: b.did,
        mimeType: b.mime_type,
        size: Number(b.size || 0),
        createdAt: b.created_at,
      }
    }

    const takedownsPosts = {}
    for (const r of this.db.prepare('SELECT * FROM takedowns_posts').all()) {
      takedownsPosts[r.uri] = safeJsonParse(r.data_json, {uri: r.uri})
    }

    const takedownsAccounts = {}
    for (const r of this.db.prepare('SELECT * FROM takedowns_accounts').all()) {
      takedownsAccounts[r.did] = safeJsonParse(r.data_json, {did: r.did})
    }

    const labels = {}
    for (const r of this.db.prepare('SELECT * FROM labels').all()) {
      labels[r.subject_key] = safeJsonParse(r.labels_json, [])
    }

    const mutes = {}
    for (const r of this.db.prepare('SELECT viewer_did, target_did FROM mutes').all()) {
      if (!mutes[r.viewer_did]) mutes[r.viewer_did] = []
      mutes[r.viewer_did].push(r.target_did)
    }

    const reports = this.db
      .prepare('SELECT data_json FROM reports ORDER BY id ASC')
      .all()
      .map(r => safeJsonParse(r.data_json, {}))

    const appeals = this.db
      .prepare('SELECT data_json FROM appeals ORDER BY created_at ASC')
      .all()
      .map(r => safeJsonParse(r.data_json, {}))

    const pendingApprovals = this.db
      .prepare('SELECT data_json FROM pending_approvals ORDER BY created_at ASC')
      .all()
      .map(r => safeJsonParse(r.data_json, {}))

    const staffInvites = this.db
      .prepare('SELECT data_json FROM staff_invites ORDER BY created_at ASC')
      .all()
      .map(r => safeJsonParse(r.data_json, {}))

    const auditLog = this.db
      .prepare(
        `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ${MAX_AUDIT_LOG_ROWS}`,
      )
      .all()
      .reverse()
      .map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        actorDid: r.actor_did,
        actorHandle: r.actor_handle,
        actorRole: r.actor_role,
        ip: r.ip,
        action: r.action,
        target: r.target,
        details: safeJsonParse(r.details_json, {}),
      }))

    const records = {}
    if (includeRecords) {
      for (const r of this.db.prepare('SELECT * FROM records').all()) {
        if (!records[r.did]) records[r.did] = {}
        if (!records[r.did][r.collection]) records[r.did][r.collection] = {}
        records[r.did][r.collection][r.rkey] = this._rowToRecord(r)
      }
    }

    return {
      _store: this,
      _isCompatView: true,
      version: Number(this.getMeta('version', '3')),
      genesisVersion: Number(this.getMeta('genesis_version', '0')),
      jwtSecret: this.getJwtSecret(),
      accounts,
      records,
      blobs,
      bookmarks: {},
      convos: {},
      revokedTokens: [],
      reports,
      appeals,
      takedowns: {posts: takedownsPosts, accounts: takedownsAccounts},
      labels,
      mutes,
      auditLog,
      pendingApprovals,
      staffInvites,
    }
  }

  syncAdminCompatView(dbView) {
    if (!dbView || typeof dbView !== 'object') return
    this.inTransaction(() => {
      if (dbView.genesisVersion !== undefined) {
        this.setMeta('genesis_version', String(dbView.genesisVersion))
      }

      // Sync accounts
      for (const acc of Object.values(dbView.accounts || {})) {
        if (acc?.did) this.upsertAccount(acc)
      }

      // Sync any blobs added via compat view
      for (const b of Object.values(dbView.blobs || {})) {
        if (b?.cid) {
          this.putBlobMeta({
            cid: b.cid,
            did: b.did || '',
            mimeType: b.mimeType || 'application/octet-stream',
            size: Number(b.size || 0),
          })
        }
      }

      // Sync any records added directly onto dbView.records (e.g., founder profile)
      for (const [did, collections] of Object.entries(dbView.records || {})) {
        for (const [collection, map] of Object.entries(collections || {})) {
          for (const [rkey, rec] of Object.entries(map || {})) {
            if (!rec?.value) continue
            const existing = this._stmts.getRecord.get(did, collection, rkey)
            if (!existing || existing.cid !== rec.cid) {
              this.putRecord({
                ...rec,
                repo: rec.repo || did,
                collection,
                rkey,
              })
            }
          }
        }
      }

      // Sync takedowns
      this.db.exec('DELETE FROM takedowns_posts')
      const insTp = this.db.prepare(
        'INSERT INTO takedowns_posts(uri, data_json) VALUES (?, ?)',
      )
      for (const [uri, data] of Object.entries(dbView.takedowns?.posts || {})) {
        insTp.run(uri, JSON.stringify(data || {uri}))
      }

      this.db.exec('DELETE FROM takedowns_accounts')
      const insTa = this.db.prepare(
        'INSERT INTO takedowns_accounts(did, data_json) VALUES (?, ?)',
      )
      for (const [did, data] of Object.entries(
        dbView.takedowns?.accounts || {},
      )) {
        insTa.run(did, JSON.stringify(data || {did}))
      }

      // Sync labels
      this.db.exec('DELETE FROM labels')
      const insLab = this.db.prepare(
        'INSERT INTO labels(subject_key, labels_json) VALUES (?, ?)',
      )
      for (const [k, list] of Object.entries(dbView.labels || {})) {
        if (Array.isArray(list) && list.length > 0) {
          insLab.run(k, JSON.stringify(list))
        }
      }

      // Sync reports
      this.db.exec('DELETE FROM reports')
      const insRep = this.db.prepare(`
        INSERT INTO reports(
          id, created_at, reporter_did, reason_type, reason,
          subject_type, subject_uri, subject_did, subject_cid, status, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const r of dbView.reports || []) {
        if (!r || r.id == null) continue
        insRep.run(
          Number(r.id),
          r.createdAt || new Date().toISOString(),
          r.reporterDid || null,
          r.reasonType || 'com.atproto.moderation.defs#reasonOther',
          r.reason || '',
          r.subjectType || 'account',
          r.subjectUri || null,
          r.subjectDid || null,
          r.subjectCid || null,
          r.status || 'open',
          JSON.stringify(r),
        )
      }

      // Sync appeals
      this.db.exec('DELETE FROM appeals')
      const insApl = this.db.prepare(
        'INSERT INTO appeals(id, created_at, appellant_did, status, data_json) VALUES (?, ?, ?, ?, ?)',
      )
      for (const a of dbView.appeals || []) {
        if (!a?.id) continue
        insApl.run(
          String(a.id),
          a.createdAt || new Date().toISOString(),
          String(a.appellantDid || ''),
          String(a.status || 'open'),
          JSON.stringify(a),
        )
      }

      // Sync pendingApprovals
      this.db.exec('DELETE FROM pending_approvals')
      const insApp = this.db.prepare(
        'INSERT INTO pending_approvals(id, status, created_at, data_json) VALUES (?, ?, ?, ?)',
      )
      for (const p of dbView.pendingApprovals || []) {
        if (!p?.id) continue
        insApp.run(
          String(p.id),
          String(p.status || 'pending'),
          p.createdAt || new Date().toISOString(),
          JSON.stringify(p),
        )
      }

      // Sync staffInvites
      this.db.exec('DELETE FROM staff_invites')
      const insInv = this.db.prepare(
        'INSERT INTO staff_invites(id, token_hash, email, status, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const inv of dbView.staffInvites || []) {
        if (!inv?.id) continue
        insInv.run(
          String(inv.id),
          inv.tokenHash || null,
          inv.email || null,
          String(inv.status || 'pending'),
          inv.createdAt || new Date().toISOString(),
          JSON.stringify(inv),
        )
      }

      // Upsert auditLog entries
      for (const e of dbView.auditLog || []) {
        if (!e?.id) continue
        this.appendAuditEvent(e)
      }
    })
  }

  // -------------------------------------------------------------------------
  // Zero-Loss Legacy db.json -> SQLite WAL Migrator (FAIL-CLOSED!)
  // -------------------------------------------------------------------------

  _maybeMigrateFromLegacyJson() {
    if (this.getMeta('migrated_from_json') === '1') {
      return {migrated: false, reason: 'already_migrated'}
    }
    if (this.getAccountCount() > 0) {
      return {migrated: false, reason: 'sqlite_populated'}
    }
    if (!fs.existsSync(this.legacyJsonPath)) {
      return {migrated: false, reason: 'no_legacy_json'}
    }

    const raw = fs.readFileSync(this.legacyJsonPath, 'utf8')
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const corruptBackup = `${this.legacyJsonPath}.corrupt.${ts}`
      try {
        fs.copyFileSync(this.legacyJsonPath, corruptBackup)
      } catch {}
      throw new Error(
        `[QuantZingStore] Refusing to wipe malformed db.json (${this.legacyJsonPath}): ${err.message}`,
      )
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        `[QuantZingStore] Refusing to wipe invalid db.json root structure (${this.legacyJsonPath})`,
      )
    }

    const stats = {
      accounts: 0,
      records: 0,
      blobs: 0,
      bookmarks: 0,
      postViews: 0,
      drafts: 0,
      mutes: 0,
      convos: 0,
      messages: 0,
      revokedTokens: 0,
      reports: 0,
      appeals: 0,
    }

    const nowIso = new Date().toISOString()
    const nowSec = Math.floor(Date.now() / 1000)

    this.inTransaction(() => {
      if (parsed.jwtSecret) this.setMeta('jwt_secret', String(parsed.jwtSecret))
      if (parsed.version != null) this.setMeta('version', String(parsed.version))
      if (parsed.genesisVersion != null) {
        this.setMeta('genesis_version', String(parsed.genesisVersion))
      }

      // 1. Accounts
      for (const acc of Object.values(parsed.accounts || {})) {
        if (!acc?.did) continue
        this.upsertAccount(acc)
        stats.accounts++
      }

      // 2. Blobs
      for (const [cid, meta] of Object.entries(parsed.blobs || {})) {
        if (!cid) continue
        this.putBlobMeta({
          cid: meta?.cid || cid,
          did: meta?.did || '',
          mimeType: meta?.mimeType || 'application/octet-stream',
          size: Number(meta?.size || 0),
          createdAt: meta?.createdAt || nowIso,
        })
        stats.blobs++
      }

      // 3. Records (skip per-record counters during bulk load; recompute accurately once!)
      for (const [did, collections] of Object.entries(parsed.records || {})) {
        for (const [collection, recMap] of Object.entries(collections || {})) {
          for (const [rkey, rec] of Object.entries(recMap || {})) {
            if (!rec) continue
            this.putRecord(
              {
                uri: rec.uri || `at://${did}/${collection}/${rkey}`,
                cid: rec.cid || '',
                rkey: rec.rkey || rkey,
                collection: rec.collection || collection,
                repo: rec.repo || did,
                value: rec.value || {},
                indexedAt: rec.indexedAt || rec.value?.createdAt || nowIso,
              },
              {skipCounters: true, skipNotifications: false},
            )
            stats.records++
          }
        }
      }

      // 4. Bookmarks (canonicalize URIs!)
      for (const [did, list] of Object.entries(parsed.bookmarks || {})) {
        if (!Array.isArray(list)) continue
        for (const bm of list) {
          if (!bm?.uri) continue
          const canonical = this.canonicalizeUri(bm.uri)
          this.db
            .prepare(
              'INSERT OR IGNORE INTO bookmarks(did, uri, cid, created_at) VALUES (?, ?, ?, ?)',
            )
            .run(
              String(did),
              canonical,
              String(bm.cid || ''),
              bm.createdAt || nowIso,
            )
          stats.bookmarks++
        }
      }

      // 5. Post Views (preserve exact count AND every deduplicated viewer key!)
      for (const [rawUri, entry] of Object.entries(parsed.postViews || {})) {
        const canonical = this.canonicalizeUri(rawUri)
        if (!canonical || !entry || typeof entry !== 'object') continue
        const viewers = Array.isArray(entry.viewers) ? entry.viewers : []
        for (const vk of viewers) {
          if (!vk) continue
          this._stmts.insertViewDedup.run(canonical, String(vk), nowIso)
        }
        const exactCount = Math.max(Number(entry.count) || 0, viewers.length)
        this.db
          .prepare(
            `
            INSERT INTO post_counters(uri, view_count) VALUES (?, ?)
            ON CONFLICT(uri) DO UPDATE SET view_count = MAX(view_count, excluded.view_count)
          `,
          )
          .run(canonical, exactCount)
        stats.postViews++
      }

      // 6. Drafts
      for (const [did, list] of Object.entries(parsed.drafts || {})) {
        if (!Array.isArray(list)) continue
        for (const d of list) {
          if (!d?.id) continue
          this.db
            .prepare(
              'INSERT OR REPLACE INTO drafts(id, did, draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(
              String(d.id),
              String(did),
              JSON.stringify(d.draft || {posts: []}),
              d.createdAt || nowIso,
              d.updatedAt || d.createdAt || nowIso,
            )
          stats.drafts++
        }
      }

      // 7. Mutes
      for (const [viewerDid, targets] of Object.entries(parsed.mutes || {})) {
        if (!Array.isArray(targets)) continue
        for (const targetDid of targets) {
          if (!targetDid) continue
          this.muteActor(viewerDid, targetDid)
          stats.mutes++
        }
      }

      // 8. Convos & Messages
      for (const [convoId, c] of Object.entries(parsed.convos || {})) {
        if (!c || !Array.isArray(c.members) || c.members.length === 0) continue
        const sortedMembers = [...new Set(c.members.filter(Boolean))].sort()
        const memberKey = sortedMembers.join('|')
        const id = c.id || convoId
        const rev = c.rev || '1'
        const messages = Array.isArray(c.messages) ? c.messages : []
        const updatedAt =
          messages.length > 0
            ? messages[messages.length - 1]?.sentAt || nowIso
            : nowIso
        this.db
          .prepare(
            'INSERT OR IGNORE INTO convos(id, member_key, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(id, memberKey, rev, nowIso, updatedAt)
        const insMem = this.db.prepare(
          'INSERT OR REPLACE INTO convo_members(convo_id, did, read_rev, muted, status) VALUES (?, ?, ?, ?, ?)',
        )
        for (const mDid of sortedMembers) {
          insMem.run(
            id,
            mDid,
            String(c.readBy?.[mDid] || ''),
            c.mutedBy?.[mDid] ? 1 : 0,
            'accepted',
          )
        }
        const insMsg = this.db.prepare(`
          INSERT OR IGNORE INTO convo_messages(
            id, convo_id, rev, sender_did, text, facets_json, embed_json, reactions_json, deleted_for_json, sent_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?)
        `)
        for (const m of messages) {
          if (!m?.id) continue
          insMsg.run(
            String(m.id),
            id,
            String(m.rev || rev),
            String(m.sender?.did || ''),
            String(m.text || ''),
            m.facets ? JSON.stringify(m.facets) : null,
            m.embed ? JSON.stringify(m.embed) : null,
            m.sentAt || nowIso,
          )
          stats.messages++
        }
        stats.convos++
      }

      // 9. Revoked Tokens (give 90-day expiry window so migrated revocations stay valid)
      for (const jti of parsed.revokedTokens || []) {
        if (!jti) continue
        this._stmts.insertRevoked.run(
          String(jti),
          nowSec + 90 * 24 * 60 * 60,
          nowSec,
        )
        stats.revokedTokens++
      }

      // 10. Moderation / Ops tables
      for (const r of parsed.reports || []) {
        if (!r || r.id == null) continue
        this.db
          .prepare(
            `
            INSERT OR REPLACE INTO reports(
              id, created_at, reporter_did, reason_type, reason,
              subject_type, subject_uri, subject_did, subject_cid, status, data_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            Number(r.id),
            r.createdAt || nowIso,
            r.reporterDid || null,
            r.reasonType || 'com.atproto.moderation.defs#reasonOther',
            r.reason || '',
            r.subjectType || 'account',
            r.subjectUri || null,
            r.subjectDid || null,
            r.subjectCid || null,
            r.status || 'open',
            JSON.stringify(r),
          )
        stats.reports++
      }

      for (const a of parsed.appeals || []) {
        if (!a?.id) continue
        this.db
          .prepare(
            'INSERT OR REPLACE INTO appeals(id, created_at, appellant_did, status, data_json) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            String(a.id),
            a.createdAt || nowIso,
            String(a.appellantDid || ''),
            String(a.status || 'open'),
            JSON.stringify(a),
          )
        stats.appeals++
      }

      for (const [uri, data] of Object.entries(parsed.takedowns?.posts || {})) {
        this.db
          .prepare(
            'INSERT OR REPLACE INTO takedowns_posts(uri, data_json) VALUES (?, ?)',
          )
          .run(uri, JSON.stringify(data || {uri}))
      }
      for (const [did, data] of Object.entries(parsed.takedowns?.accounts || {})) {
        this.db
          .prepare(
            'INSERT OR REPLACE INTO takedowns_accounts(did, data_json) VALUES (?, ?)',
          )
          .run(did, JSON.stringify(data || {did}))
      }
      for (const [subjectKey, list] of Object.entries(parsed.labels || {})) {
        if (Array.isArray(list) && list.length > 0) {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO labels(subject_key, labels_json) VALUES (?, ?)',
            )
            .run(subjectKey, JSON.stringify(list))
        }
      }
      for (const e of parsed.auditLog || []) {
        if (e?.id) this.appendAuditEvent(e)
      }
      for (const p of parsed.pendingApprovals || []) {
        if (!p?.id) continue
        this.db
          .prepare(
            'INSERT OR REPLACE INTO pending_approvals(id, status, created_at, data_json) VALUES (?, ?, ?, ?)',
          )
          .run(
            String(p.id),
            String(p.status || 'pending'),
            p.createdAt || nowIso,
            JSON.stringify(p),
          )
      }
      for (const inv of parsed.staffInvites || []) {
        if (!inv?.id) continue
        this.db
          .prepare(
            'INSERT OR REPLACE INTO staff_invites(id, token_hash, email, status, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            String(inv.id),
            inv.tokenHash || null,
            inv.email || null,
            String(inv.status || 'pending'),
            inv.createdAt || nowIso,
            JSON.stringify(inv),
          )
      }

      // 11. Recompute exact O(1) counters cleanly via SQL (preserving view_count!)
      this._recomputeCountersInTx()

      this.setMeta('migrated_from_json', '1')
      this.setMeta('migrated_at', nowIso)
    })

    // Archive legacy db.json without deleting original data
    const ts = nowIso.replace(/[:.]/g, '-')
    const migratedArchive = `${this.legacyJsonPath}.migrated.${ts}`
    try {
      fs.renameSync(this.legacyJsonPath, migratedArchive)
    } catch {
      try {
        fs.copyFileSync(this.legacyJsonPath, migratedArchive)
      } catch {}
    }

    console.log(
      `[QuantZingStore] Migrated db.json -> quantzing.sqlite (accounts=${stats.accounts}, records=${stats.records}, postViews=${stats.postViews}, bookmarks=${stats.bookmarks}, convos=${stats.convos})`,
    )
    return {migrated: true, archivePath: migratedArchive, stats}
  }

  _recomputeCountersInTx() {
    this.db.exec(`
      INSERT OR IGNORE INTO post_counters(uri)
      SELECT uri FROM records WHERE collection = 'app.bsky.feed.post';

      UPDATE post_counters SET
        like_count = (
          SELECT COUNT(DISTINCT r.did) FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE r.collection = 'app.bsky.feed.like'
            AND r.subject_uri = post_counters.uri
            AND a.status NOT IN ('banned', 'suspended')
        ),
        repost_count = (
          SELECT COUNT(DISTINCT r.did) FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE r.collection = 'app.bsky.feed.repost'
            AND r.subject_uri = post_counters.uri
            AND a.status NOT IN ('banned', 'suspended')
        ),
        reply_count = (
          SELECT COUNT(*) FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE r.collection = 'app.bsky.feed.post'
            AND r.parent_uri = post_counters.uri
            AND a.status NOT IN ('banned', 'suspended')
            AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ),
        quote_count = (
          SELECT COUNT(*) FROM records r
          JOIN accounts a ON a.did = r.did
          WHERE r.collection = 'app.bsky.feed.post'
            AND r.quote_uri = post_counters.uri
            AND a.status NOT IN ('banned', 'suspended')
            AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ),
        bookmark_count = (
          SELECT COUNT(DISTINCT b.did) FROM bookmarks b
          JOIN accounts a ON a.did = b.did
          WHERE b.uri = post_counters.uri
            AND a.status NOT IN ('banned', 'suspended')
        );

      UPDATE accounts SET
        posts_count = (
          SELECT COUNT(*) FROM records r
          WHERE r.did = accounts.did
            AND r.collection = 'app.bsky.feed.post'
            AND NOT EXISTS (SELECT 1 FROM takedowns_posts tp WHERE tp.uri = r.uri)
        ),
        follows_count = (
          SELECT COUNT(DISTINCT r.subject_did) FROM records r
          JOIN accounts target ON target.did = r.subject_did
          WHERE r.did = accounts.did
            AND r.collection = 'app.bsky.graph.follow'
            AND target.status NOT IN ('banned', 'suspended')
        ),
        followers_count = (
          SELECT COUNT(DISTINCT r.did) FROM records r
          JOIN accounts follower ON follower.did = r.did
          WHERE r.collection = 'app.bsky.graph.follow'
            AND r.subject_did = accounts.did
            AND follower.status NOT IN ('banned', 'suspended')
        );
    `)
  }

  // -------------------------------------------------------------------------
  // Hot WAL-Safe Snapshot Backup (VACUUM INTO) & Graceful Shutdown
  // -------------------------------------------------------------------------

  backupTo(destSqlitePath) {
    const absDest = path.resolve(destSqlitePath)
    fs.mkdirSync(path.dirname(absDest), {recursive: true})
    this.flushPendingViews()
    if (fs.existsSync(absDest)) {
      fs.unlinkSync(absDest)
    }
    this.db.prepare('VACUUM INTO ?').run(absDest)
    const stat = fs.statSync(absDest)
    return {
      path: absDest,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
    }
  }

  close() {
    if (this.closed) return
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
    try {
      this.flushPendingViews()
    } catch (err) {
      console.error('[QuantZingStore] Error during final view flush:', err)
    }
    this.closed = true
    try {
      this.db.close()
    } catch {}
    if (storeCache.get(this.dataDir) === this) {
      storeCache.delete(this.dataDir)
    }
  }
}

export function getStore(dataDir = computeDefaultDataDir()) {
  const absDir = path.resolve(dataDir)
  let existing = storeCache.get(absDir)
  if (existing && !existing.closed) {
    return existing
  }
  const store = new QuantZingStore(absDir)
  storeCache.set(absDir, store)
  return store
}

export function closeAllStores() {
  for (const store of [...storeCache.values()]) {
    store.close()
  }
  storeCache.clear()
}
