'use strict'

// QuantZing Ops — Standalone X-Dark Employee Operations Portal (Pure ES2022)
// Zero external dependencies, zero mock data, zero emojis, zero orange/amber colors.

const JWT_STORAGE_KEY = 'qz_ops_jwt'
const BASE_PATH = typeof window !== 'undefined' && window.__QZ_OPS_BASE__ ? window.__QZ_OPS_BASE__ : '/'
const FOUNDER_DID = 'did:plc:quantzingfounder00000000'

const ROLE_META = {
  super_admin: {label: 'SUPER ADMIN', pillClass: 'pill-primary'},
  admin: {label: 'SUPER ADMIN', pillClass: 'pill-primary'},
  l2_trust_safety: {label: 'L2 TRUST & SAFETY', pillClass: 'pill-violet'},
  trust_safety: {label: 'L2 TRUST & SAFETY', pillClass: 'pill-violet'},
  l1_moderator: {label: 'L1 MODERATOR', pillClass: 'pill-accent'},
  moderator: {label: 'L1 MODERATOR', pillClass: 'pill-accent'},
  verification_ops: {label: 'VERIFICATION OPS', pillClass: 'pill-success'},
  support_agent: {label: 'SUPPORT AGENT', pillClass: 'pill-muted'},
  user: {label: 'USER', pillClass: 'pill-muted'},
}

const ASSIGNABLE_STAFF_ROLES = [
  {value: 'l1_moderator', label: 'L1 Moderator (Triage & Labels)'},
  {value: 'l2_trust_safety', label: 'L2 Trust & Safety (Takedowns & Enforcements)'},
  {value: 'verification_ops', label: 'Verification Ops (Blue Checkmarks)'},
  {value: 'support_agent', label: 'Support Agent (Read-Only + Reason-Logged PII)'},
  {value: 'super_admin', label: 'Super Admin (Full Control & Four-Eyes Review)'},
]

const ALL_USER_ROLES = [
  {value: 'user', label: 'User (Standard)'},
  ...ASSIGNABLE_STAFF_ROLES,
]

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    subtitle: 'Live network telemetry, daily velocity & sovereign snapshots',
    perm: 'overview.read',
    testId: 'opsNavOverview',
    icon: 'overview',
  },
  {
    id: 'reports',
    label: 'Reports Queue',
    subtitle: 'Shift-claimed moderation triage, content labels & enforcements',
    perm: 'reports.read',
    testId: 'opsNavReports',
    icon: 'flag',
    badgeKey: 'openReports',
    badgeTone: 'red',
  },
  {
    id: 'users',
    label: 'Users & PII',
    subtitle: 'Account directory, verification & reason-logged PII inspection',
    perm: 'users.read',
    testId: 'opsNavUsers',
    icon: 'users',
  },
  {
    id: 'posts',
    label: 'Posts & Takedowns',
    subtitle: 'Zing moderation, takedown enforcement & content labels',
    perm: 'posts.read',
    testId: 'opsNavPosts',
    icon: 'post',
  },
  {
    id: 'appeals',
    label: 'Appeals',
    subtitle: 'User account & post restoration appeals',
    perm: 'appeals.read',
    testId: 'opsNavAppeals',
    icon: 'inbox',
    badgeKey: 'openAppeals',
    badgeTone: 'blue',
  },
  {
    id: 'approvals',
    label: 'Four-Eyes Approvals',
    subtitle: 'Dual-control sign-off for high-impact bans & suspensions',
    perm: 'approvals.read',
    testId: 'opsNavApprovals',
    icon: 'shieldCheck',
    badgeKey: 'pendingApprovals',
    badgeTone: 'violet',
  },
  {
    id: 'staff',
    label: 'Staff & Invites',
    subtitle: 'Employee onboarding invites, productivity & instant offboarding kill switch',
    perm: 'staff.read',
    testId: 'opsNavStaff',
    icon: 'key',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    subtitle: 'Immutable chronological record of every staff action & PII query',
    perm: 'audit.read',
    testId: 'opsNavAudit',
    icon: 'list',
  },
]

// ---------------------------------------------------------------------------
// Crisp Geometric Inline SVG Icons (16x16 / 18x18 stroke=2, zero emojis)
// ---------------------------------------------------------------------------

function logoSvg(size = 32) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="16" fill="#000000" stroke="#2F3336" stroke-width="2" />
    <path fill="#FFFFFF" d="M15 15H49V21L27 42H49V49H15V43L37 22H15Z" />
    <path fill="#1D9BF0" d="M23 29.5H46L41 34.5H18Z" />
  </svg>`
}

function iconSvg(name, size = 16) {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`
  switch (name) {
    case 'overview':
      return `<svg ${attrs}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`
    case 'flag':
      return `<svg ${attrs}><path d="M4 22V4"/><path d="M4 4h14l-2.5 5L18 14H4"/></svg>`
    case 'users':
      return `<svg ${attrs}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
    case 'post':
      return `<svg ${attrs}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`
    case 'inbox':
      return `<svg ${attrs}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`
    case 'shield':
      return `<svg ${attrs}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
    case 'shieldCheck':
      return `<svg ${attrs}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`
    case 'key':
      return `<svg ${attrs}><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`
    case 'list':
      return `<svg ${attrs}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
    case 'lock':
      return `<svg ${attrs}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    case 'logout':
      return `<svg ${attrs}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
    case 'refresh':
      return `<svg ${attrs}><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`
    case 'search':
      return `<svg ${attrs}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
    case 'menu':
      return `<svg ${attrs}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
    case 'x':
      return `<svg ${attrs}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    case 'check':
      return `<svg ${attrs}><polyline points="20 6 9 17 4 12"/></svg>`
    case 'verified':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.39 1.73 2.94-.32 1.24 2.68 2.68 1.24-.32 2.94L22 12l-1.73 2.39.32 2.94-2.68 1.24-1.24 2.68-2.94-.32L12 22l-2.39-1.73-2.94.32-1.24-2.68-2.68-1.24.32-2.94L2 12l1.73-2.39-.32-2.94 2.68-1.24 1.24-2.68 2.94.32L12 2zm-1.2 13.4l5-5-1.4-1.4-3.6 3.6-1.6-1.6-1.4 1.4 3 3z"/></svg>`
    case 'alert':
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    case 'eye':
      return `<svg ${attrs}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    case 'eyeOff':
      return `<svg ${attrs}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    case 'copy':
      return `<svg ${attrs}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
    case 'backup':
      return `<svg ${attrs}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`
    case 'ban':
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
    case 'clock':
      return `<svg ${attrs}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    case 'power':
      return `<svg ${attrs}><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`
    case 'plus':
      return `<svg ${attrs}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    default:
      return `<svg ${attrs}><circle cx="12" cy="12" r="8"/></svg>`
  }
}

// ---------------------------------------------------------------------------
// Formatting & Escaping Helpers
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCompact(n) {
  const num = Number(n ?? 0)
  if (!Number.isFinite(num)) return '0'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

function formatBytes(bytes) {
  const b = Number(bytes ?? 0)
  if (!Number.isFinite(b) || b <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let val = b
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx += 1
  }
  return `${val >= 100 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`
}

function formatUptime(sec) {
  const s = Math.max(0, Math.floor(Number(sec ?? 0)))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatDateTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDay(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`
  return String(dateStr).slice(-5)
}

function formatReasonType(rt) {
  const raw = String(rt || 'other')
  const hashIdx = raw.indexOf('#')
  const slug = hashIdx >= 0 ? raw.slice(hashIdx + 1) : raw
  return slug
    .replace(/^reason/i, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toUpperCase() || 'OTHER'
}

function getRoleMeta(role, explicitLabel) {
  const key = String(role || 'user').toLowerCase()
  const base = ROLE_META[key] || {
    label: String(explicitLabel || role || 'STAFF').toUpperCase(),
    pillClass: 'pill-muted',
  }
  if (explicitLabel && !ROLE_META[key]) {
    return {label: String(explicitLabel).toUpperCase(), pillClass: base.pillClass}
  }
  return base
}

function statusPillHtml(status) {
  const s = String(status || 'active').toLowerCase()
  if (s === 'active' || s === 'approved' || s === 'accepted') {
    return `<span class="pill pill-success">${esc(s)}</span>`
  }
  if (s === 'banned' || s === 'rejected' || s === 'removed' || s === 'revoked' || s === 'expired') {
    return `<span class="pill pill-danger">${esc(s)}</span>`
  }
  if (s === 'suspended' || s === 'pending') {
    return `<span class="pill pill-violet">${esc(s)}</span>`
  }
  if (s === 'open' || s === 'warned' || s === 'labeled') {
    return `<span class="pill pill-accent">${esc(s)}</span>`
  }
  return `<span class="pill pill-muted">${esc(s)}</span>`
}

function actionPillHtml(action) {
  const a = String(action || '').toLowerCase()
  let cls = 'pill-muted'
  if (a.includes('ban') || a.includes('takedown') || a.includes('offboard') || a.includes('reject') || a.includes('revoke')) {
    cls = 'pill-danger'
  } else if (a.includes('suspend') || a.includes('approval')) {
    cls = 'pill-violet'
  } else if (a.includes('approve') || a.includes('verify') || a.includes('restore') || a.includes('backup') || a.includes('accept')) {
    cls = 'pill-success'
  } else if (a.includes('inspect') || a.includes('login') || a.includes('claim') || a.includes('invite') || a.includes('label') || a.includes('warn')) {
    cls = 'pill-accent'
  }
  return `<span class="pill ${cls}">${esc(action || 'event')}</span>`
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return []
  const out = []
  for (const item of labels) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
    else if (item && typeof item === 'object' && typeof item.val === 'string' && item.val.trim()) {
      out.push(item.val.trim())
    }
  }
  return Array.from(new Set(out))
}

function buildInviteUrl(inviteObj, rawRes) {
  const direct = rawRes?.inviteUrl || inviteObj?.inviteUrl || rawRes?.url || inviteObj?.url
  if (direct && typeof direct === 'string') {
    if (direct.startsWith('http://') || direct.startsWith('https://')) return direct
    return `${window.location.origin}${direct.startsWith('/') ? '' : '/'}${direct}`
  }
  const token = rawRes?.token || inviteObj?.token || inviteObj?.inviteToken
  if (!token) return ''
  return `${window.location.origin}${BASE_PATH}?invite=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------

const state = {
  view: 'boot', // 'boot' | 'invite' | 'login' | 'portal'
  inviteToken: null,
  inviteInfo: null,
  inviteError: null,
  loginError: null,
  me: null,
  activeTab: 'overview',
  mobileNavOpen: false,
  counts: {
    openReports: 0,
    openAppeals: 0,
    pendingApprovals: 0,
  },
  // Overview
  overview: null,
  backups: [],
  overviewLoading: false,
  // Reports
  reports: [],
  reportsStatus: 'open',
  reportsQueue: 'all',
  reportsLoading: false,
  highlightedReportId: null,
  reportNotes: {},
  // Users
  users: [],
  usersQuery: '',
  usersFilter: 'all',
  usersReason: '',
  usersLoading: false,
  // Posts
  posts: [],
  postsQuery: '',
  postsFilter: 'all',
  postsReason: '',
  postsLoading: false,
  // Appeals
  appeals: [],
  appealsStatus: 'open',
  appealsLoading: false,
  appealNotes: {},
  // Approvals
  approvals: [],
  approvalsStatus: 'pending',
  approvalsLoading: false,
  approvalNotes: {},
  // Staff
  staff: [],
  invites: [],
  staffLoading: false,
  lastInviteUrl: '',
  inviteDraft: {
    email: '',
    department: 'Trust & Safety',
    role: 'l1_moderator',
    expiresHours: '48',
  },
  // Audit
  audit: [],
  auditQuery: '',
  auditCategory: 'all',
  auditLoading: false,
  // Modal (PII inspection)
  inspectModal: null, // { did, handle, displayName, loading, error, data, ticketId, reason }
}

let userSearchTimer = null
let postSearchTimer = null

// ---------------------------------------------------------------------------
// Auth & HTTP Client
// ---------------------------------------------------------------------------

function getJwt() {
  try {
    return window.sessionStorage.getItem(JWT_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function setJwt(token) {
  try {
    if (token) window.sessionStorage.setItem(JWT_STORAGE_KEY, token)
    else window.sessionStorage.removeItem(JWT_STORAGE_KEY)
  } catch {}
}

function hasPerm(perm) {
  if (!state.me || !state.me.isStaff) return false
  const perms = state.me.permissions
  if (Array.isArray(perms)) {
    if (perms.includes('*')) return true
    return perms.includes(perm)
  }
  if (state.me.isAdmin || state.me.role === 'super_admin' || state.me.role === 'admin') {
    return true
  }
  const fallbackMod = new Set([
    'overview.read',
    'reports.read',
    'reports.label',
    'reports.takedown',
    'reports.enforce',
    'users.read',
    'users.inspect',
    'posts.read',
    'posts.moderate',
    'appeals.read',
    'appeals.resolve',
    'audit.read',
  ])
  return fallbackMod.has(perm)
}

function getPermittedNavItems() {
  return NAV_ITEMS.filter(item => hasPerm(item.perm))
}

async function apiRequest(path, {method = 'GET', body = undefined, auth = true} = {}) {
  const headers = {
    Accept: 'application/json',
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (auth) {
    const token = getJwt()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch (networkErr) {
    const err = new Error('Unable to reach QuantZing Ops API. Check server connectivity.')
    err.status = 0
    throw err
  }

  let data = {}
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      data = await res.json()
    } catch {
      data = {}
    }
  } else {
    const text = await res.text().catch(() => '')
    data = {message: text}
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      (res.status === 429
        ? `Rate limited. Try again in ${data?.retryAfterSec || 60}s.`
        : `Request failed (HTTP ${res.status})`)
    const err = new Error(msg)
    err.status = res.status
    err.code = data?.error || ''
    err.data = data

    // Instant kick-out if active portal session was revoked / offboarded / expired
    if (
      auth &&
      state.view === 'portal' &&
      (res.status === 401 ||
        err.code === 'SessionRevoked' ||
        err.code === 'AccountTakedown' ||
        err.code === 'AccountSuspended' ||
        err.code === 'StaffRevoked')
    ) {
      setJwt('')
      state.me = null
      state.view = 'login'
      state.loginError = msg || 'Your staff session is no longer valid. Sign in again.'
      closeModal()
      render()
    }
    throw err
  }

  return {status: res.status, data}
}

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------

function showToast(message, tone = 'info', durationMs = 4200) {
  const root = document.getElementById('toast-root')
  if (!root) return
  const el = document.createElement('div')
  el.className = `ops-toast ${tone}`
  const iconName = tone === 'success' ? 'check' : tone === 'error' ? 'alert' : 'shieldCheck'
  el.innerHTML = `${iconSvg(iconName, 16)}<span>${esc(message)}</span>`
  root.appendChild(el)
  window.setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 160ms ease'
    window.setTimeout(() => el.remove(), 180)
  }, durationMs)
}

async function copyToClipboard(text, successMsg = 'Copied to clipboard') {
  if (!text) return
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    showToast(successMsg, 'success')
  } catch {
    showToast('Unable to copy automatically. Select and copy manually.', 'error')
  }
}

// ---------------------------------------------------------------------------
// Boot & Session Lifecycle
// ---------------------------------------------------------------------------

async function boot() {
  const params = new URLSearchParams(window.location.search)
  const inviteToken = (params.get('invite') || '').trim()

  if (inviteToken) {
    state.view = 'invite'
    state.inviteToken = inviteToken
    state.inviteInfo = null
    state.inviteError = null
    render()
    await loadInviteInfo(inviteToken)
    return
  }

  const token = getJwt()
  if (token) {
    const entered = await tryEnterPortalFromSession()
    if (entered) return
  }

  state.view = 'login'
  render()
}

async function loadInviteInfo(token) {
  try {
    const {data} = await apiRequest(
      `/api/quantzing/ops/invite-info?token=${encodeURIComponent(token)}`,
      {auth: false},
    )
    const invite = data.invite || data
    if (!invite || invite.valid === false) {
      state.inviteError = data.message || 'This staff invite link is invalid or has expired.'
      state.inviteInfo = null
    } else {
      state.inviteInfo = invite
      state.inviteError = null
    }
  } catch (err) {
    state.inviteError = err.message || 'This staff invite link is invalid or has expired.'
    state.inviteInfo = null
  }
  render()
}

async function tryEnterPortalFromSession() {
  try {
    const {data} = await apiRequest('/api/quantzing/admin/me', {auth: true})
    if (!data || !data.isStaff) {
      setJwt('')
      state.me = null
      return false
    }
    state.me = data
    if (data.counts && typeof data.counts === 'object') {
      state.counts.openReports = Number(data.counts.openReports ?? state.counts.openReports)
      state.counts.openAppeals = Number(data.counts.openAppeals ?? state.counts.openAppeals)
      state.counts.pendingApprovals = Number(data.counts.pendingApprovals ?? state.counts.pendingApprovals)
    }
    const allowedTabs = getPermittedNavItems()
    if (allowedTabs.length === 0) {
      setJwt('')
      state.me = null
      state.loginError = 'Your account has no active Ops Portal permissions.'
      return false
    }
    if (!allowedTabs.some(t => t.id === state.activeTab)) {
      state.activeTab = allowedTabs[0].id
    }
    state.view = 'portal'
    state.loginError = null
    render()
    void refreshLiveBadges()
    void loadActiveTabData()
    return true
  } catch {
    setJwt('')
    state.me = null
    return false
  }
}

async function refreshLiveBadges() {
  if (!state.me?.isStaff) return
  if (hasPerm('overview.read')) {
    try {
      const {data} = await apiRequest('/api/quantzing/admin/overview')
      if (data?.metrics) {
        state.counts.openReports = Number(data.metrics.openReports || 0)
        state.counts.openAppeals = Number(data.metrics.openAppeals || 0)
        state.counts.pendingApprovals = Number(
          data.metrics.pendingApprovals ?? state.counts.pendingApprovals ?? 0,
        )
        updateSidebarBadgesDom()
      }
      if (state.activeTab === 'overview' && !state.overview) {
        state.overview = data
        renderActivePanel()
      }
      return
    } catch {}
  }
  // Fallback for roles without overview.read: probe permitted queues
  const tasks = []
  if (hasPerm('reports.read')) {
    tasks.push(
      apiRequest('/api/quantzing/admin/reports?status=open')
        .then(({data}) => {
          state.counts.openReports = Array.isArray(data.reports) ? data.reports.length : 0
        })
        .catch(() => {}),
    )
  }
  if (hasPerm('appeals.read')) {
    tasks.push(
      apiRequest('/api/quantzing/admin/appeals?status=open')
        .then(({data}) => {
          state.counts.openAppeals = Array.isArray(data.appeals) ? data.appeals.length : 0
        })
        .catch(() => {}),
    )
  }
  if (hasPerm('approvals.read')) {
    tasks.push(
      apiRequest('/api/quantzing/admin/approvals?status=pending')
        .then(({data}) => {
          state.counts.pendingApprovals = Array.isArray(data.approvals) ? data.approvals.length : 0
        })
        .catch(() => {}),
    )
  }
  if (tasks.length > 0) {
    await Promise.all(tasks)
    updateSidebarBadgesDom()
  }
}

function updateSidebarBadgesDom() {
  for (const item of NAV_ITEMS) {
    if (!item.badgeKey) continue
    const navBtn = document.querySelector(`[data-testid="${item.testId}"]`)
    if (!navBtn) continue
    const val = Number(state.counts[item.badgeKey] || 0)
    let badge = navBtn.querySelector('.ops-nav-badge')
    if (val > 0) {
      if (!badge) {
        badge = document.createElement('span')
        badge.className = `ops-nav-badge ${item.badgeTone || 'red'}`
        navBtn.appendChild(badge)
      }
      badge.textContent = String(val)
    } else if (badge) {
      badge.remove()
    }
  }
}

async function handleSignOut() {
  setJwt('')
  state.me = null
  state.overview = null
  state.reports = []
  state.users = []
  state.posts = []
  state.appeals = []
  state.approvals = []
  state.staff = []
  state.invites = []
  state.audit = []
  state.lastInviteUrl = ''
  state.mobileNavOpen = false
  state.view = 'login'
  state.loginError = null
  closeModal()
  render()
  showToast('Signed out of QuantZing Ops', 'info')
}

// ---------------------------------------------------------------------------
// Data Loaders per Tab
// ---------------------------------------------------------------------------

async function loadActiveTabData() {
  switch (state.activeTab) {
    case 'overview':
      return loadOverview()
    case 'reports':
      return loadReports()
    case 'users':
      return loadUsers()
    case 'posts':
      return loadPosts()
    case 'appeals':
      return loadAppeals()
    case 'approvals':
      return loadApprovals()
    case 'staff':
      return loadStaff()
    case 'audit':
      return loadAudit()
    default:
      return undefined
  }
}

async function loadOverview() {
  if (!hasPerm('overview.read')) return
  state.overviewLoading = true
  renderActivePanel()
  try {
    const reqs = [apiRequest('/api/quantzing/admin/overview')]
    if (hasPerm('backups.manage')) {
      reqs.push(apiRequest('/api/quantzing/admin/backups').catch(() => ({data: {backups: []}})))
    }
    const [ovRes, bkRes] = await Promise.all(reqs)
    state.overview = ovRes.data
    if (bkRes?.data) {
      state.backups = Array.isArray(bkRes.data.backups) ? bkRes.data.backups : []
    }
    if (ovRes.data?.metrics) {
      state.counts.openReports = Number(ovRes.data.metrics.openReports || 0)
      state.counts.openAppeals = Number(ovRes.data.metrics.openAppeals || 0)
      state.counts.pendingApprovals = Number(
        ovRes.data.metrics.pendingApprovals ?? state.counts.pendingApprovals ?? 0,
      )
      updateSidebarBadgesDom()
    }
  } catch (err) {
    showToast(err.message || 'Failed to load overview metrics', 'error')
  } finally {
    state.overviewLoading = false
    renderActivePanel()
  }
}

async function loadReports() {
  if (!hasPerm('reports.read')) return
  state.reportsLoading = true
  renderActivePanel()
  try {
    const params = new URLSearchParams({
      status: state.reportsStatus,
      claimed: state.reportsQueue,
    })
    const {data} = await apiRequest(`/api/quantzing/admin/reports?${params.toString()}`)
    state.reports = Array.isArray(data.reports) ? data.reports : []
    if (state.reportsStatus === 'open' && state.reportsQueue === 'all') {
      state.counts.openReports = state.reports.length
      updateSidebarBadgesDom()
    }
  } catch (err) {
    showToast(err.message || 'Failed to load reports queue', 'error')
  } finally {
    state.reportsLoading = false
    renderActivePanel()
  }
}

async function loadUsers(listOnly = false) {
  if (!hasPerm('users.read')) return
  state.usersLoading = true
  if (listOnly) renderUsersListSlot()
  else renderActivePanel()
  try {
    const params = new URLSearchParams({
      q: state.usersQuery,
      filter: state.usersFilter,
    })
    const {data} = await apiRequest(`/api/quantzing/admin/users?${params.toString()}`)
    state.users = Array.isArray(data.users) ? data.users : []
  } catch (err) {
    showToast(err.message || 'Failed to load users directory', 'error')
  } finally {
    state.usersLoading = false
    if (listOnly) renderUsersListSlot()
    else renderActivePanel()
  }
}

async function loadPosts(listOnly = false) {
  if (!hasPerm('posts.read')) return
  state.postsLoading = true
  if (listOnly) renderPostsListSlot()
  else renderActivePanel()
  try {
    const params = new URLSearchParams({
      q: state.postsQuery,
      filter: state.postsFilter,
    })
    const {data} = await apiRequest(`/api/quantzing/admin/posts?${params.toString()}`)
    state.posts = Array.isArray(data.posts) ? data.posts : []
  } catch (err) {
    showToast(err.message || 'Failed to load posts', 'error')
  } finally {
    state.postsLoading = false
    if (listOnly) renderPostsListSlot()
    else renderActivePanel()
  }
}

async function loadAppeals() {
  if (!hasPerm('appeals.read')) return
  state.appealsLoading = true
  renderActivePanel()
  try {
    const params = new URLSearchParams({status: state.appealsStatus})
    const {data} = await apiRequest(`/api/quantzing/admin/appeals?${params.toString()}`)
    state.appeals = Array.isArray(data.appeals) ? data.appeals : []
    if (state.appealsStatus === 'open') {
      state.counts.openAppeals = state.appeals.length
      updateSidebarBadgesDom()
    }
  } catch (err) {
    showToast(err.message || 'Failed to load appeals', 'error')
  } finally {
    state.appealsLoading = false
    renderActivePanel()
  }
}

async function loadApprovals() {
  if (!hasPerm('approvals.read')) return
  state.approvalsLoading = true
  renderActivePanel()
  try {
    const params = new URLSearchParams({status: state.approvalsStatus})
    const {data} = await apiRequest(`/api/quantzing/admin/approvals?${params.toString()}`)
    state.approvals = Array.isArray(data.approvals) ? data.approvals : []
    if (state.approvalsStatus === 'pending') {
      state.counts.pendingApprovals = state.approvals.length
      updateSidebarBadgesDom()
    }
  } catch (err) {
    showToast(err.message || 'Failed to load approvals queue', 'error')
  } finally {
    state.approvalsLoading = false
    renderActivePanel()
  }
}

async function loadStaff() {
  if (!hasPerm('staff.read')) return
  state.staffLoading = true
  renderActivePanel()
  try {
    const {data} = await apiRequest('/api/quantzing/admin/staff')
    state.staff = Array.isArray(data.staff) ? data.staff : []
    if (Array.isArray(data.invites)) {
      state.invites = data.invites
    } else {
      try {
        const invRes = await apiRequest('/api/quantzing/admin/staff/invites')
        state.invites = Array.isArray(invRes.data?.invites) ? invRes.data.invites : []
      } catch {
        state.invites = []
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to load staff roster', 'error')
  } finally {
    state.staffLoading = false
    renderActivePanel()
  }
}

async function loadAudit(listOnly = false) {
  if (!hasPerm('audit.read')) return
  state.auditLoading = true
  if (listOnly) renderAuditListSlot()
  else renderActivePanel()
  try {
    const {data} = await apiRequest('/api/quantzing/admin/audit?limit=250')
    state.audit = Array.isArray(data.entries) ? data.entries : []
  } catch (err) {
    showToast(err.message || 'Failed to load audit log', 'error')
  } finally {
    state.auditLoading = false
    if (listOnly) renderAuditListSlot()
    else renderActivePanel()
  }
}

// ---------------------------------------------------------------------------
// View A: Invite Onboarding Screen
// ---------------------------------------------------------------------------

function renderInviteScreen() {
  const info = state.inviteInfo
  const roleMeta = info ? getRoleMeta(info.role, info.roleLabel) : null

  return `
    <div class="ops-gate-page" data-testid="opsInviteScreen">
      <div class="ops-gate-card">
        <div class="ops-gate-brand">
          ${logoSvg(52)}
          <div class="ops-gate-title-row">
            <h1 class="ops-gate-title">QuantZing Ops</h1>
            <span class="pill pill-env">ONBOARDING</span>
          </div>
          <p class="ops-gate-subtitle">Activate your authorized staff account</p>
        </div>

        ${
          state.inviteError
            ? `
            <div class="ops-error-banner" data-testid="inviteErrorBanner">
              ${iconSvg('alert', 16)}
              <span>${esc(state.inviteError)}</span>
            </div>
            <div style="margin-top: 18px;">
              <button type="button" class="btn btn-secondary btn-block" data-action="go-to-login">
                Go to Staff Sign In
              </button>
            </div>
          `
            : !info
              ? `
              <div class="empty-state" style="border: 0; padding: 24px 0;">
                <span>Verifying staff invitation token...</span>
              </div>
            `
              : `
              <div class="ops-invite-meta">
                <div class="ops-invite-meta-row">
                  <span class="ops-invite-meta-label">Invited Email</span>
                  <span class="ops-invite-meta-value mono">${esc(info.email || '--')}</span>
                </div>
                <div class="ops-invite-meta-row">
                  <span class="ops-invite-meta-label">Department</span>
                  <span class="ops-invite-meta-value">${esc(info.department || 'Operations')}</span>
                </div>
                <div class="ops-invite-meta-row">
                  <span class="ops-invite-meta-label">Assigned Role</span>
                  <span class="pill ${roleMeta.pillClass}">${esc(roleMeta.label)}</span>
                </div>
                <div class="ops-invite-meta-row">
                  <span class="ops-invite-meta-label">Invited By</span>
                  <span class="ops-invite-meta-value">@${esc(info.createdByHandle || info.invitedByHandle || info.invitedBy || 'founder.quantzing.com')}</span>
                </div>
                <div class="ops-invite-meta-row">
                  <span class="ops-invite-meta-label">Expires</span>
                  <span class="ops-invite-meta-value tabular">${esc(formatDateTime(info.expiresAt))}</span>
                </div>
              </div>

              <form class="ops-form" id="ops-invite-form" novalidate>
                <div class="ops-field">
                  <label class="ops-label" for="invite-handle">Staff Handle</label>
                  <div class="ops-input-group">
                    <input
                      id="invite-handle"
                      class="ops-input"
                      type="text"
                      name="handle"
                      required
                      autocomplete="username"
                      placeholder="your-name"
                      data-testid="inviteHandleInput"
                    />
                    <span class="ops-input-suffix">.quantzing.com</span>
                  </div>
                </div>

                <div class="ops-field">
                  <label class="ops-label" for="invite-name">Display Name</label>
                  <input
                    id="invite-name"
                    class="ops-input"
                    type="text"
                    name="displayName"
                    required
                    autocomplete="name"
                    placeholder="Full Name"
                    data-testid="inviteNameInput"
                  />
                </div>

                <div class="ops-field">
                  <label class="ops-label" for="invite-password">Password (minimum 8 characters)</label>
                  <div class="ops-input-group">
                    <input
                      id="invite-password"
                      class="ops-input"
                      type="password"
                      name="password"
                      required
                      minlength="8"
                      autocomplete="new-password"
                      placeholder="Create a strong staff password"
                      data-testid="invitePasswordInput"
                    />
                    <button
                      type="button"
                      class="ops-input-icon-btn"
                      data-action="toggle-password"
                      data-target="invite-password"
                      aria-label="Toggle password visibility"
                    >
                      ${iconSvg('eye', 16)}
                    </button>
                  </div>
                </div>

                <div id="invite-form-error" class="ops-error-banner" style="display: none;"></div>

                <button
                  type="submit"
                  class="btn btn-primary btn-lg btn-block"
                  data-testid="inviteSubmitBtn"
                >
                  ${iconSvg('shieldCheck', 16)}
                  <span>Activate Staff Account</span>
                </button>
              </form>
            `
        }
      </div>
      <div class="ops-gate-footer">
        QuantZing Sovereign Network &middot; Authorized Staff Onboarding
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// View B: Dedicated Staff Login Gate
// ---------------------------------------------------------------------------

function renderLoginScreen() {
  return `
    <div class="ops-gate-page" data-testid="opsLoginScreen">
      <div class="ops-gate-card">
        <div class="ops-gate-brand">
          ${logoSvg(52)}
          <div class="ops-gate-title-row">
            <h1 class="ops-gate-title">QuantZing Ops</h1>
            <span class="pill pill-env">INTERNAL</span>
          </div>
          <p class="ops-gate-subtitle">Internal Trust, Safety &amp; Operations Portal</p>
        </div>

        <div class="ops-security-notice">
          ${iconSvg('lock', 16)}
          <span>Authorized QuantZing staff only. All access &amp; queries are audit-logged.</span>
        </div>

        <form class="ops-form" id="ops-login-form" novalidate>
          <div class="ops-field">
            <label class="ops-label" for="ops-login-id">Staff Handle or Email</label>
            <input
              id="ops-login-id"
              class="ops-input"
              type="text"
              name="identifier"
              required
              autocomplete="username"
              placeholder="founder.quantzing.com or staff@quantzing.com"
              data-testid="opsLoginIdentifier"
            />
          </div>

          <div class="ops-field">
            <label class="ops-label" for="ops-login-pw">Password</label>
            <div class="ops-input-group">
              <input
                id="ops-login-pw"
                class="ops-input"
                type="password"
                name="password"
                required
                autocomplete="current-password"
                placeholder="Enter staff password"
                data-testid="opsLoginPassword"
              />
              <button
                type="button"
                class="ops-input-icon-btn"
                data-action="toggle-password"
                data-target="ops-login-pw"
                aria-label="Toggle password visibility"
              >
                ${iconSvg('eye', 16)}
              </button>
            </div>
          </div>

          <div
            id="ops-login-error"
            class="ops-error-banner"
            data-testid="opsLoginError"
            style="${state.loginError ? '' : 'display: none;'}"
          >
            ${iconSvg('alert', 16)}
            <span>${esc(state.loginError || '')}</span>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-lg btn-block"
            data-testid="opsLoginSubmit"
          >
            ${iconSvg('shield', 16)}
            <span>Sign in to Ops Portal</span>
          </button>
        </form>
      </div>
      <div class="ops-gate-footer">
        Zero-Trust Operations Plane &middot; QuantZing Sovereign Network
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// View C: Authenticated Multi-Department Employee Portal
// ---------------------------------------------------------------------------

function renderPortalShell() {
  const me = state.me || {}
  const roleMeta = getRoleMeta(me.role, me.roleLabel)
  const navItems = getPermittedNavItems()
  const activeNav = navItems.find(n => n.id === state.activeTab) || navItems[0]

  return `
    <div class="ops-shell" data-testid="opsPortalShell">
      <div
        class="ops-sidebar-backdrop ${state.mobileNavOpen ? 'mobile-open' : ''}"
        data-action="close-mobile-nav"
      ></div>

      <aside class="ops-sidebar ${state.mobileNavOpen ? 'mobile-open' : ''}">
        <div class="ops-sidebar-header">
          <div class="ops-brand-lockup">
            ${logoSvg(30)}
            <span class="ops-brand-name">QuantZing Ops</span>
          </div>
          <span class="pill pill-env">INTERNAL</span>
        </div>

        <div class="ops-staff-card">
          <div class="ops-staff-name" title="${esc(me.displayName || me.handle || '')}">
            ${esc(me.displayName || (me.handle ? me.handle.split('.')[0] : 'Staff'))}
          </div>
          <div class="ops-staff-handle mono" title="@${esc(me.handle || '')}">
            @${esc(me.handle || '')}
          </div>
          <div class="ops-staff-dept">${esc(me.department || 'Trust & Operations')}</div>
          <div class="ops-staff-badges">
            <span class="pill ${roleMeta.pillClass}" data-testid="opsRoleBadge">
              ${esc(roleMeta.label)}
            </span>
            ${
              me.cfAccessEmail
                ? `<span class="ops-cf-badge" title="Verified via Cloudflare Access: ${esc(me.cfAccessEmail)}">
                    ${iconSvg('shieldCheck', 12)}
                    <span>Cloudflare Zero Trust</span>
                  </span>`
                : ''
            }
          </div>
        </div>

        <nav class="ops-nav" aria-label="Operations navigation">
          ${navItems
            .map(item => {
              const isActive = item.id === state.activeTab
              const badgeVal = item.badgeKey ? Number(state.counts[item.badgeKey] || 0) : 0
              return `
                <button
                  type="button"
                  class="ops-nav-item ${isActive ? 'active' : ''}"
                  data-action="select-tab"
                  data-tab="${item.id}"
                  data-testid="${item.testId}"
                >
                  <span class="ops-nav-label">
                    ${iconSvg(item.icon, 16)}
                    <span>${esc(item.label)}</span>
                  </span>
                  ${
                    badgeVal > 0
                      ? `<span class="ops-nav-badge ${item.badgeTone || 'red'}">${badgeVal}</span>`
                      : ''
                  }
                </button>
              `
            })
            .join('')}
        </nav>

        <div class="ops-sidebar-footer">
          <button
            type="button"
            class="btn btn-ghost btn-block"
            data-action="sign-out"
            data-testid="opsSignOutBtn"
          >
            ${iconSvg('logout', 15)}
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div class="ops-main-wrap">
        <header class="ops-topbar">
          <div class="ops-topbar-left">
            <button
              type="button"
              class="ops-mobile-menu-btn"
              data-action="toggle-mobile-nav"
              aria-label="Toggle navigation menu"
            >
              ${iconSvg('menu', 18)}
            </button>
            <div>
              <h1 class="ops-page-title" id="ops-topbar-title">${esc(activeNav?.label || 'Overview')}</h1>
              <p class="ops-page-subtitle" id="ops-topbar-subtitle">${esc(activeNav?.subtitle || '')}</p>
            </div>
          </div>

          <div class="ops-topbar-right">
            <span class="pill pill-muted">
              <span class="ops-live-dot"></span>
              <span>LIVE</span>
            </span>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              data-action="refresh-panel"
            >
              ${iconSvg('refresh', 14)}
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <main class="ops-content" id="ops-panel-root">
          ${renderCurrentPanelHtml()}
        </main>
      </div>
    </div>
  `
}

function renderCurrentPanelHtml() {
  switch (state.activeTab) {
    case 'overview':
      return renderOverviewPanel()
    case 'reports':
      return renderReportsPanel()
    case 'users':
      return renderUsersPanel()
    case 'posts':
      return renderPostsPanel()
    case 'appeals':
      return renderAppealsPanel()
    case 'approvals':
      return renderApprovalsPanel()
    case 'staff':
      return renderStaffPanel()
    case 'audit':
      return renderAuditPanel()
    default:
      return ''
  }
}

function renderActivePanel() {
  const panelRoot = document.getElementById('ops-panel-root')
  if (!panelRoot) return
  panelRoot.innerHTML = renderCurrentPanelHtml()
}

// ---------------------------------------------------------------------------
// Panel 1: Overview
// ---------------------------------------------------------------------------

function renderActivitySvgChart(signupsByDay, postsByDay) {
  const days = Array.isArray(postsByDay) && postsByDay.length ? postsByDay : signupsByDay || []
  if (!days.length) {
    return `<div class="empty-state" style="border: 0; padding: 24px;"><span>No daily telemetry recorded yet.</span></div>`
  }

  const signupMap = new Map((signupsByDay || []).map(d => [d.date, Number(d.count || 0)]))
  const postMap = new Map((postsByDay || []).map(d => [d.date, Number(d.count || 0)]))
  const points = days.map(d => ({
    date: d.date,
    signups: signupMap.get(d.date) || 0,
    posts: postMap.get(d.date) || 0,
  }))

  const maxVal = Math.max(1, ...points.flatMap(p => [p.signups, p.posts]))
  const svgW = 760
  const svgH = 210
  const padL = 36
  const padR = 14
  const padT = 16
  const padB = 30
  const plotW = svgW - padL - padR
  const plotH = svgH - padT - padB
  const groupW = plotW / points.length
  const barW = Math.max(6, Math.min(16, Math.floor((groupW - 10) / 2)))

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map(frac => {
      const y = padT + plotH * (1 - frac)
      const label = Math.round(maxVal * frac)
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="#2F3336" stroke-width="1" stroke-dasharray="${frac === 0 ? '0' : '3 3'}" />
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#71767B" font-size="10" font-family="ui-monospace, monospace">${label}</text>
      `
    })
    .join('')

  const bars = points
    .map((p, idx) => {
      const cx = padL + idx * groupW + groupW / 2
      const sH = p.signups > 0 ? Math.max(3, (p.signups / maxVal) * plotH) : 0
      const pH = p.posts > 0 ? Math.max(3, (p.posts / maxVal) * plotH) : 0
      const sX = cx - barW - 2
      const pX = cx + 2
      const sY = padT + plotH - sH
      const pY = padT + plotH - pH
      return `
        <g>
          <rect x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" width="${barW}" height="${sH.toFixed(1)}" rx="3" fill="#00BA7C">
            <title>${esc(p.date)} — Signups: ${p.signups}</title>
          </rect>
          <rect x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" width="${barW}" height="${pH.toFixed(1)}" rx="3" fill="#1D9BF0">
            <title>${esc(p.date)} — Zings: ${p.posts}</title>
          </rect>
          <text x="${cx.toFixed(1)}" y="${svgH - 10}" text-anchor="middle" fill="#71767B" font-size="10" font-family="ui-monospace, monospace">${esc(formatShortDay(p.date))}</text>
        </g>
      `
    })
    .join('')

  return `
    <div class="chart-svg-wrap">
      <svg class="chart-svg" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="14-day signups vs zings chart">
        ${gridLines}
        ${bars}
      </svg>
    </div>
  `
}

function renderOverviewPanel() {
  if (state.overviewLoading && !state.overview) {
    return `<div class="empty-state"><span>Loading sovereign network telemetry...</span></div>`
  }

  const ov = state.overview || {}
  const m = ov.metrics || {}
  const rl = ov.rateLimit || {}
  const sys = ov.system || {}
  const signupsSeries = ov.series?.signupsByDay || []
  const postsSeries = ov.series?.postsByDay || []
  const total14dSignups = signupsSeries.reduce((acc, d) => acc + Number(d.count || 0), 0)
  const total14dPosts = postsSeries.reduce((acc, d) => acc + Number(d.count || 0), 0)
  const pendingApprovals = Number(m.pendingApprovals ?? state.counts.pendingApprovals ?? 0)

  return `
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label"><span>Users</span>${iconSvg('users', 15)}</div>
        <div class="kpi-value">${formatCompact(m.totalUsers)}</div>
        <div class="kpi-sub">${formatCompact(m.activeUsers)} active &middot; ${formatCompact(m.verifiedUsers)} verified &middot; ${formatCompact(m.staffUsers)} staff</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>Active Zings</span>${iconSvg('post', 15)}</div>
        <div class="kpi-value accent">${formatCompact(m.totalPosts)}</div>
        <div class="kpi-sub">${formatCompact(m.totalReplies)} replies &middot; ${formatCompact(m.totalLikes)} likes &middot; ${formatCompact(m.totalReposts)} rezings</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>Media Storage</span>${iconSvg('backup', 15)}</div>
        <div class="kpi-value">${esc(formatBytes(m.totalBlobBytes))}</div>
        <div class="kpi-sub">${formatCompact(m.totalBlobs)} blobs &middot; DB ${esc(formatBytes(sys.dbSizeBytes))}</div>
      </div>

      <div class="kpi-card ${hasPerm('reports.read') ? 'clickable' : ''}" ${hasPerm('reports.read') ? 'data-action="select-tab" data-tab="reports"' : ''}>
        <div class="kpi-label"><span>Open Reports</span>${iconSvg('flag', 15)}</div>
        <div class="kpi-value ${Number(m.openReports || 0) > 0 ? 'danger' : ''}">${formatCompact(m.openReports)}</div>
        <div class="kpi-sub">${formatCompact(m.totalReports)} total &middot; ${formatCompact(m.takenDownPosts)} takedowns</div>
      </div>

      <div class="kpi-card ${hasPerm('appeals.read') ? 'clickable' : ''}" ${hasPerm('appeals.read') ? 'data-action="select-tab" data-tab="appeals"' : ''}>
        <div class="kpi-label"><span>Open Appeals</span>${iconSvg('inbox', 15)}</div>
        <div class="kpi-value ${Number(m.openAppeals || 0) > 0 ? 'accent' : ''}">${formatCompact(m.openAppeals)}</div>
        <div class="kpi-sub">${formatCompact(m.suspendedUsers)} suspended &middot; ${formatCompact(m.bannedUsers)} banned</div>
      </div>

      <div class="kpi-card ${hasPerm('approvals.read') ? 'clickable' : ''}" ${hasPerm('approvals.read') ? 'data-action="select-tab" data-tab="approvals"' : ''}>
        <div class="kpi-label"><span>Pending Four-Eyes Approvals</span>${iconSvg('shieldCheck', 15)}</div>
        <div class="kpi-value ${pendingApprovals > 0 ? 'violet' : ''}">${formatCompact(pendingApprovals)}</div>
        <div class="kpi-sub">Dual-control enforcement queue</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>Rate-Limit Blocks</span>${iconSvg('ban', 15)}</div>
        <div class="kpi-value">${formatCompact(rl.totalBlocked)}</div>
        <div class="kpi-sub">${formatCompact(rl.totalChecks)} requests evaluated</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label"><span>Server Uptime &amp; RAM</span>${iconSvg('clock', 15)}</div>
        <div class="kpi-value success">${esc(formatUptime(sys.uptimeSec))}</div>
        <div class="kpi-sub">${esc(sys.memoryMb ?? 0)} MB RSS &middot; Node ${esc(sys.nodeVersion || '--')}</div>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">14-Day Activity Velocity</h2>
          <p class="card-subtitle">Daily signups (${formatCompact(total14dSignups)}) vs Zings published (${formatCompact(total14dPosts)})</p>
        </div>
        <div class="chart-legend">
          <span class="chart-legend-item">
            <span class="legend-swatch" style="background: #00BA7C;"></span>
            <span>Signups</span>
          </span>
          <span class="chart-legend-item">
            <span class="legend-swatch" style="background: #1D9BF0;"></span>
            <span>Zings</span>
          </span>
        </div>
      </div>
      ${renderActivitySvgChart(signupsSeries, postsSeries)}
    </section>

    ${
      hasPerm('backups.manage')
        ? `
        <section class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">${iconSvg('backup', 16)}<span>Database Snapshots</span></h2>
              <p class="card-subtitle">Gzipped sovereign database snapshots stored in local backup vault</p>
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              data-action="create-backup"
              data-testid="opsCreateBackupBtn"
            >
              ${iconSvg('plus', 14)}
              <span>Create Snapshot Backup</span>
            </button>
          </div>
          ${
            state.backups.length === 0
              ? `<div class="empty-state" style="padding: 22px;"><span>No snapshots created yet. Create a snapshot backup to archive current PDS state.</span></div>`
              : `
              <div class="table-wrap">
                <table class="ops-table">
                  <thead>
                    <tr>
                      <th>Snapshot File</th>
                      <th>Size</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.backups
                      .map(
                        b => `
                        <tr>
                          <td class="mono">${esc(b.filename)}</td>
                          <td class="tabular">${esc(formatBytes(b.sizeBytes))}</td>
                          <td class="tabular">${esc(formatDateTime(b.createdAt))}</td>
                        </tr>
                      `,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </section>
      `
        : ''
    }
  `
}

// ---------------------------------------------------------------------------
// Panel 2: Reports & Shift Queue
// ---------------------------------------------------------------------------

function filterReportsClientSide(reports) {
  const myDid = state.me?.did
  const myHandle = state.me?.handle
  return reports.filter(r => {
    const claimedByDid = r.claimedByDid || null
    const claimedByHandle = r.claimedByHandle || r.claimedBy || null
    const isMine =
      (claimedByDid && myDid && claimedByDid === myDid) ||
      (claimedByHandle && myHandle && claimedByHandle === myHandle)
    const isClaimed = Boolean(claimedByDid || claimedByHandle)
    if (state.reportsQueue === 'mine') return isMine
    if (state.reportsQueue === 'unclaimed') return !isClaimed
    return true
  })
}

function renderReportsPanel() {
  const visibleReports = filterReportsClientSide(state.reports)
  const canClaim = hasPerm('reports.claim')
  const canLabel = hasPerm('reports.label')
  const canTakedown = hasPerm('reports.takedown')
  const canEnforce = hasPerm('reports.enforce')

  return `
    <div class="toolbar">
      <div class="toolbar-group">
        ${
          canClaim
            ? `<button
                type="button"
                class="btn btn-primary"
                data-action="claim-next-report"
                data-testid="opsClaimNextBtn"
              >
                ${iconSvg('flag', 15)}
                <span>Claim Next Ticket</span>
              </button>`
            : ''
        }

        <div class="filter-pills" role="group" aria-label="Queue filter">
          ${[
            {id: 'mine', label: 'My Queue'},
            {id: 'unclaimed', label: 'Unclaimed'},
            {id: 'all', label: 'All'},
          ]
            .map(
              q => `
              <button
                type="button"
                class="filter-pill ${state.reportsQueue === q.id ? 'active' : ''}"
                data-action="set-reports-queue"
                data-value="${q.id}"
              >${q.label}</button>
            `,
            )
            .join('')}
        </div>
      </div>

      <div class="filter-pills" role="group" aria-label="Status filter">
        ${[
          {id: 'open', label: 'Open'},
          {id: 'resolved', label: 'Resolved'},
          {id: 'dismissed', label: 'Dismissed'},
          {id: 'all', label: 'All'},
        ]
          .map(
            s => `
            <button
              type="button"
              class="filter-pill ${state.reportsStatus === s.id ? 'active' : ''}"
              data-action="set-reports-status"
              data-value="${s.id}"
            >${s.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    ${
      state.reportsLoading
        ? `<div class="empty-state"><span>Loading moderation reports...</span></div>`
        : visibleReports.length === 0
          ? `
          <div class="empty-state">
            ${iconSvg('shieldCheck', 28)}
            <h3 class="empty-state-title">Queue is clear</h3>
            <p class="empty-state-sub">No reports match the current status (${esc(state.reportsStatus)}) and queue (${esc(state.reportsQueue)}) filters.</p>
          </div>
        `
          : `
          <div class="item-list">
            ${visibleReports
              .map(r => {
                const claimedHandle = r.claimedByHandle || r.claimedBy || null
                const claimedDid = r.claimedByDid || null
                const isClaimed = Boolean(claimedHandle || claimedDid)
                const isMine =
                  (claimedDid && claimedDid === state.me?.did) ||
                  (claimedHandle && claimedHandle === state.me?.handle)
                const isOpen = String(r.status || 'open').toLowerCase() === 'open'
                const post = r.subjectPost || r.post || null
                const subAcc = r.subjectAccount || r.account || null
                const postLabels = normalizeLabels(post?.labels)
                const noteVal = state.reportNotes[r.id] || ''

                return `
                  <article class="item-card ${state.highlightedReportId === String(r.id) ? 'highlighted' : ''}" data-report-id="${esc(r.id)}">
                    <div class="item-card-top">
                      <div class="item-meta-row">
                        <span class="item-id">#${esc(r.id)}</span>
                        ${statusPillHtml(r.status)}
                        <span class="pill pill-violet">${esc(formatReasonType(r.reasonType))}</span>
                        ${r.pendingApprovalId ? `<span class="pill pill-violet">PENDING FOUR-EYES</span>` : ''}
                        ${
                          isClaimed
                            ? `<span class="pill ${isMine ? 'pill-accent' : 'pill-muted'}">Claimed by @${esc(claimedHandle || claimedDid)}</span>`
                            : `<span class="pill pill-muted">Unclaimed</span>`
                        }
                        <span class="item-timestamp tabular">${esc(formatDateTime(r.createdAt))}</span>
                      </div>

                      ${
                        isOpen && canClaim
                          ? `
                          <div class="toolbar-group">
                            ${
                              isClaimed
                                ? `<button type="button" class="btn btn-ghost btn-sm" data-action="release-report" data-id="${esc(r.id)}">Release</button>`
                                : `<button type="button" class="btn btn-secondary btn-sm" data-action="claim-report" data-id="${esc(r.id)}">Claim</button>`
                            }
                          </div>
                        `
                          : ''
                      }
                    </div>

                    <div class="item-meta-row" style="font-size: 13px;">
                      <span style="color: var(--text-muted);">Reporter:</span>
                      <strong>@${esc(r.reporter?.handle || r.reporterHandle || 'unknown')}</strong>
                      ${r.reason ? `<span style="color: var(--text-secondary);">&middot; "${esc(r.reason)}"</span>` : ''}
                    </div>

                    ${
                      subAcc
                        ? `
                        <div class="item-meta-row" style="font-size: 13px;">
                          <span style="color: var(--text-muted);">Reported Account:</span>
                          <strong>@${esc(subAcc.handle)}</strong>
                          ${subAcc.verified ? `<span class="verified-icon" title="Verified">${iconSvg('verified', 14)}</span>` : ''}
                          ${statusPillHtml(subAcc.status)}
                        </div>
                      `
                        : ''
                    }

                    ${
                      post || r.subjectUri
                        ? `
                        <div class="subject-box">
                          <div class="item-meta-row">
                            <strong style="font-size: 12px;">@${esc(post?.authorHandle || subAcc?.handle || 'unknown')}</strong>
                            ${post?.takenDown ? `<span class="pill pill-danger">TAKEN DOWN</span>` : ''}
                            ${postLabels.map(l => `<span class="pill pill-accent">${esc(l)}</span>`).join('')}
                          </div>
                          <p class="subject-text">${esc(post?.text || '[Post preview unavailable]')}</p>
                          <div class="subject-uri">${esc(post?.uri || r.subjectUri || '')}</div>
                        </div>
                      `
                        : ''
                    }

                    ${
                      !isOpen
                        ? `
                        <div class="item-meta-row" style="font-size: 12px; color: var(--text-muted);">
                          <span>Resolution: <strong style="color: var(--text-primary);">${esc(r.resolutionAction || r.status)}</strong></span>
                          ${r.resolvedBy ? `<span>&middot; By @${esc(r.resolvedBy)}</span>` : ''}
                          ${r.resolvedAt ? `<span>&middot; ${esc(formatDateTime(r.resolvedAt))}</span>` : ''}
                          ${r.resolutionNote ? `<span>&middot; Note: "${esc(r.resolutionNote)}"</span>` : ''}
                        </div>
                      `
                        : canLabel || canTakedown || canEnforce
                          ? `
                          <div class="action-bar">
                            <input
                              type="text"
                              class="ops-input inline-note-input"
                              placeholder="Moderation note / policy reference (audit-logged)..."
                              value="${esc(noteVal)}"
                              data-input="report-note"
                              data-id="${esc(r.id)}"
                            />
                            ${
                              canLabel
                                ? `
                                <button type="button" class="btn btn-secondary btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="dismiss">Dismiss</button>
                                <button type="button" class="btn btn-secondary btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="label" data-label="sensitive">Label Sensitive</button>
                              `
                                : ''
                            }
                            ${
                              canTakedown && (r.subjectUri || post?.uri)
                                ? `<button type="button" class="btn btn-danger btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="takedown_post">Takedown Post</button>`
                                : ''
                            }
                            ${
                              canEnforce && (subAcc || r.subjectDid)
                                ? `
                                <button type="button" class="btn btn-secondary btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="warn_user">Warn</button>
                                <button type="button" class="btn btn-violet btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="suspend_user">Suspend 24h</button>
                                <button type="button" class="btn btn-danger btn-sm" data-action="resolve-report" data-id="${esc(r.id)}" data-resolution="ban_user">Ban</button>
                              `
                                : ''
                            }
                          </div>
                        `
                          : ''
                    }
                  </article>
                `
              })
              .join('')}
          </div>
        `
    }
  `
}

// ---------------------------------------------------------------------------
// Panel 3: Users & Reason-Logged PII Lookup
// ---------------------------------------------------------------------------

function renderEmailPiiCell(u) {
  const raw = String(u.email || '').trim()
  if (u.emailRedacted || !raw || raw.toUpperCase() === '[REDACTED]' || raw.toUpperCase() === 'REDACTED') {
    return `<span class="pill pill-muted">${iconSvg('lock', 11)}<span>REDACTED</span></span>`
  }
  if (u.emailMasked || raw.includes('*')) {
    return `
      <div class="cell-identity">
        <span class="mono" style="font-size: 12px;">${esc(raw)}</span>
        <span class="pill pill-accent" style="width: fit-content;">MASKED</span>
      </div>
    `
  }
  return `<span class="mono" style="font-size: 12px;">${esc(raw)}</span>`
}

function renderUsersRowsHtml() {
  if (state.usersLoading) {
    return `<div class="empty-state"><span>Searching accounts...</span></div>`
  }
  if (state.users.length === 0) {
    return `
      <div class="empty-state">
        ${iconSvg('users', 26)}
        <h3 class="empty-state-title">No matching accounts</h3>
        <p class="empty-state-sub">Adjust your search query or account status filter.</p>
      </div>
    `
  }

  const canInspect = hasPerm('users.inspect')
  const canVerify = hasPerm('users.verify')
  const canEnforce = hasPerm('users.enforce')
  const canManageStaff = hasPerm('staff.manage')

  return `
    <div class="table-wrap">
      <table class="ops-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Status &amp; Role</th>
            <th>Email PII</th>
            <th>Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.users
            .map(u => {
              const roleMeta = getRoleMeta(u.role, u.roleLabel)
              const isSelf = u.did === state.me?.did
              const isFounder = u.did === FOUNDER_DID
              const statusLower = String(u.status || 'active').toLowerCase()
              const canRestore = statusLower === 'suspended' || statusLower === 'banned' || statusLower === 'warned'
              const warnings = Number(u.warningsCount ?? (Array.isArray(u.warnings) ? u.warnings.length : 0))

              return `
                <tr data-user-did="${esc(u.did)}">
                  <td>
                    <div class="cell-identity">
                      <div class="cell-name-row">
                        <span>${esc(u.displayName || u.handle)}</span>
                        ${u.verified ? `<span class="verified-icon" title="Verified">${iconSvg('verified', 15)}</span>` : ''}
                      </div>
                      <span class="cell-sub mono">@${esc(u.handle)}</span>
                      <span class="cell-sub mono" style="font-size: 11px;" title="${esc(u.did)}">${esc(u.did)}</span>
                    </div>
                  </td>
                  <td>
                    <div class="toolbar-group">
                      ${statusPillHtml(u.status)}
                      <span class="pill ${roleMeta.pillClass}">${esc(roleMeta.label)}</span>
                    </div>
                    ${u.department ? `<div class="cell-sub" style="margin-top: 5px;">${esc(u.department)}</div>` : ''}
                    ${u.statusReason ? `<div class="cell-sub" style="margin-top: 4px;">Reason: ${esc(u.statusReason)}</div>` : ''}
                  </td>
                  <td>${renderEmailPiiCell(u)}</td>
                  <td class="tabular">
                    <div><strong>${formatCompact(u.postsCount)}</strong> zings &middot; <strong>${formatCompact(u.followersCount)}</strong> followers</div>
                    <div class="cell-sub">${warnings} warnings &middot; Joined ${esc(formatDateTime(u.createdAt))}</div>
                  </td>
                  <td>
                    <div class="toolbar-group">
                      ${
                        canInspect
                          ? `<button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              data-action="open-inspect-modal"
                              data-did="${esc(u.did)}"
                              data-handle="${esc(u.handle)}"
                              data-name="${esc(u.displayName || u.handle)}"
                            >
                              ${iconSvg('lock', 12)}
                              <span>Inspect (Reason Required)</span>
                            </button>`
                          : ''
                      }
                      ${
                        canVerify
                          ? u.verified
                            ? `<button type="button" class="btn btn-ghost btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="unverify">Revoke Check</button>`
                            : `<button type="button" class="btn btn-success btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="verify">Verify</button>`
                          : ''
                      }
                      ${
                        canEnforce && !isSelf && !isFounder
                          ? `
                          <button type="button" class="btn btn-secondary btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="warn">Warn</button>
                          <button type="button" class="btn btn-violet btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="suspend">Suspend 24h</button>
                          <button type="button" class="btn btn-danger btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="ban">Ban</button>
                          ${canRestore ? `<button type="button" class="btn btn-success btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="restore">Restore</button>` : ''}
                        `
                          : canEnforce && canRestore
                            ? `<button type="button" class="btn btn-success btn-sm" data-action="user-action" data-did="${esc(u.did)}" data-op="restore">Restore</button>`
                            : ''
                      }
                      ${
                        canManageStaff && !isSelf && !isFounder
                          ? `
                          <div class="role-inline-form">
                            <select class="ops-select role-inline-select" data-role-select="${esc(u.did)}" aria-label="Role for ${esc(u.handle)}">
                              ${ALL_USER_ROLES.map(
                                opt => `<option value="${opt.value}" ${String(u.role) === opt.value || (u.role === 'admin' && opt.value === 'super_admin') || (u.role === 'moderator' && opt.value === 'l1_moderator') ? 'selected' : ''}>${esc(opt.label)}</option>`,
                              ).join('')}
                            </select>
                            <button type="button" class="btn btn-ghost btn-sm" data-action="update-user-role" data-did="${esc(u.did)}">Update Role</button>
                          </div>
                        `
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              `
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderUsersListSlot() {
  const slot = document.getElementById('users-list-slot')
  if (slot) slot.innerHTML = renderUsersRowsHtml()
}

function renderUsersPanel() {
  return `
    <div class="toolbar">
      <div class="search-wrap">
        ${iconSvg('search', 15)}
        <input
          type="search"
          class="ops-input"
          placeholder="Search @handle, display name, email, or DID..."
          value="${esc(state.usersQuery)}"
          data-input="users-search"
          data-testid="opsUserSearch"
        />
      </div>

      <div class="filter-pills" role="group" aria-label="User filters">
        ${[
          {id: 'all', label: 'All'},
          {id: 'verified', label: 'Verified'},
          {id: 'suspended', label: 'Suspended'},
          {id: 'banned', label: 'Banned'},
          {id: 'staff', label: 'Staff'},
        ]
          .map(
            f => `
            <button
              type="button"
              class="filter-pill ${state.usersFilter === f.id ? 'active' : ''}"
              data-action="set-users-filter"
              data-value="${f.id}"
            >${f.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    <div class="toolbar">
      <input
        type="text"
        class="ops-input"
        placeholder="Optional enforcement / verification reason (recorded in audit log)..."
        value="${esc(state.usersReason)}"
        data-input="users-reason"
      />
    </div>

    <div id="users-list-slot">
      ${renderUsersRowsHtml()}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Panel 4: Posts & Takedowns
// ---------------------------------------------------------------------------

function renderPostsRowsHtml() {
  if (state.postsLoading) {
    return `<div class="empty-state"><span>Loading Zings...</span></div>`
  }
  if (state.posts.length === 0) {
    return `
      <div class="empty-state">
        ${iconSvg('post', 26)}
        <h3 class="empty-state-title">No posts found</h3>
        <p class="empty-state-sub">No Zings match your current filter or search query.</p>
      </div>
    `
  }

  const canModerate = hasPerm('posts.moderate')

  return `
    <div class="item-list">
      ${state.posts
        .map(p => {
          const labels = normalizeLabels(p.labels)
          const takenDown = Boolean(p.takenDown ?? p.removed)
          return `
            <article class="item-card">
              <div class="item-card-top">
                <div class="item-meta-row">
                  <strong>${esc(p.authorDisplayName || p.authorHandle)}</strong>
                  ${p.authorVerified ? `<span class="verified-icon" title="Verified">${iconSvg('verified', 14)}</span>` : ''}
                  <span class="cell-sub mono">@${esc(p.authorHandle)}</span>
                  <span class="item-timestamp tabular">${esc(formatDateTime(p.createdAt))}</span>
                </div>
                <div class="item-meta-row">
                  ${takenDown ? `<span class="pill pill-danger">REMOVED</span>` : `<span class="pill pill-success">ACTIVE</span>`}
                  ${p.hasMedia ? `<span class="pill pill-muted">MEDIA</span>` : ''}
                  ${labels.map(l => `<span class="pill pill-accent">${esc(l)}</span>`).join('')}
                </div>
              </div>

              <div class="subject-box">
                <p class="subject-text">${esc(p.text || '[Empty post]')}</p>
                <div class="subject-uri">${esc(p.uri)}</div>
              </div>

              <div class="item-meta-row tabular" style="font-size: 12px; color: var(--text-muted);">
                <span>${formatCompact(p.likeCount)} likes</span>
                <span>&middot;</span>
                <span>${formatCompact(p.replyCount)} replies</span>
                <span>&middot;</span>
                <span>${formatCompact(p.repostCount)} rezings</span>
                ${takenDown && p.takedownReason ? `<span>&middot; Takedown reason: <strong style="color: var(--danger);">${esc(p.takedownReason)}</strong></span>` : ''}
              </div>

              ${
                canModerate
                  ? `
                  <div class="action-bar">
                    ${
                      takenDown
                        ? `<button type="button" class="btn btn-success btn-sm" data-action="post-action" data-uri="${esc(p.uri)}" data-op="restore">Restore</button>`
                        : `<button type="button" class="btn btn-danger btn-sm" data-action="post-action" data-uri="${esc(p.uri)}" data-op="takedown">Takedown</button>`
                    }
                    <button type="button" class="btn btn-secondary btn-sm" data-action="post-action" data-uri="${esc(p.uri)}" data-op="label" data-label="sensitive">Label Sensitive</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="post-action" data-uri="${esc(p.uri)}" data-op="label" data-label="spam">Label Spam</button>
                    ${
                      labels.length > 0
                        ? `<button type="button" class="btn btn-ghost btn-sm" data-action="post-action" data-uri="${esc(p.uri)}" data-op="unlabel">Clear Labels</button>`
                        : ''
                    }
                  </div>
                `
                  : ''
              }
            </article>
          `
        })
        .join('')}
    </div>
  `
}

function renderPostsListSlot() {
  const slot = document.getElementById('posts-list-slot')
  if (slot) slot.innerHTML = renderPostsRowsHtml()
}

function renderPostsPanel() {
  return `
    <div class="toolbar">
      <div class="search-wrap">
        ${iconSvg('search', 15)}
        <input
          type="search"
          class="ops-input"
          placeholder="Search Zings by text, @handle, or AT-URI..."
          value="${esc(state.postsQuery)}"
          data-input="posts-search"
        />
      </div>

      <div class="filter-pills" role="group" aria-label="Post filter">
        ${[
          {id: 'all', label: 'All'},
          {id: 'active', label: 'Active'},
          {id: 'removed', label: 'Removed'},
          {id: 'labeled', label: 'Labeled'},
        ]
          .map(
            f => `
            <button
              type="button"
              class="filter-pill ${state.postsFilter === f.id ? 'active' : ''}"
              data-action="set-posts-filter"
              data-value="${f.id}"
            >${f.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    <div class="toolbar">
      <input
        type="text"
        class="ops-input"
        placeholder="Optional takedown / label reason (audit-logged)..."
        value="${esc(state.postsReason)}"
        data-input="posts-reason"
      />
    </div>

    <div id="posts-list-slot">
      ${renderPostsRowsHtml()}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Panel 5: Appeals
// ---------------------------------------------------------------------------

function renderAppealsPanel() {
  const canResolve = hasPerm('appeals.resolve')

  return `
    <div class="toolbar">
      <div class="filter-pills" role="group" aria-label="Appeal status filter">
        ${[
          {id: 'open', label: 'Open'},
          {id: 'approved', label: 'Approved'},
          {id: 'rejected', label: 'Rejected'},
          {id: 'all', label: 'All'},
        ]
          .map(
            s => `
            <button
              type="button"
              class="filter-pill ${state.appealsStatus === s.id ? 'active' : ''}"
              data-action="set-appeals-status"
              data-value="${s.id}"
            >${s.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    ${
      state.appealsLoading
        ? `<div class="empty-state"><span>Loading appeals queue...</span></div>`
        : state.appeals.length === 0
          ? `
          <div class="empty-state">
            ${iconSvg('inbox', 26)}
            <h3 class="empty-state-title">No appeals in this view</h3>
            <p class="empty-state-sub">No ${esc(state.appealsStatus)} appeals currently require attention.</p>
          </div>
        `
          : `
          <div class="item-list">
            ${state.appeals
              .map(a => {
                const isOpen = String(a.status || 'open').toLowerCase() === 'open'
                const claimedHandle = a.claimedByHandle || a.claimedBy || null
                const claimedDid = a.claimedByDid || null
                const isClaimed = Boolean(claimedHandle || claimedDid)
                const noteVal = state.appealNotes[a.id] || ''
                return `
                  <article class="item-card">
                    <div class="item-card-top">
                      <div class="item-meta-row">
                        <span class="item-id">#${esc(a.id)}</span>
                        ${statusPillHtml(a.status)}
                        <span class="pill pill-accent">${esc(String(a.type || 'account').toUpperCase())} APPEAL</span>
                        ${
                          isClaimed
                            ? `<span class="pill pill-muted">Claimed by @${esc(claimedHandle || claimedDid)}</span>`
                            : ''
                        }
                        <span class="item-timestamp tabular">${esc(formatDateTime(a.createdAt))}</span>
                      </div>

                      ${
                        isOpen
                          ? `
                          <div class="toolbar-group">
                            ${
                              isClaimed
                                ? `<button type="button" class="btn btn-ghost btn-sm" data-action="release-appeal" data-id="${esc(a.id)}">Release</button>`
                                : `<button type="button" class="btn btn-secondary btn-sm" data-action="claim-appeal" data-id="${esc(a.id)}">Claim</button>`
                            }
                          </div>
                        `
                          : ''
                      }
                    </div>

                    <div class="item-meta-row" style="font-size: 13px;">
                      <span style="color: var(--text-muted);">Appellant:</span>
                      <strong>${esc(a.appellantDisplayName || a.appellantHandle)}</strong>
                      <span class="mono" style="color: var(--text-muted);">@${esc(a.appellantHandle || a.appellantDid)}</span>
                      ${a.appellantStatus ? statusPillHtml(a.appellantStatus) : ''}
                    </div>

                    <div class="subject-box">
                      <p class="subject-text">${esc(a.message || '[No appeal text]')}</p>
                      ${a.subjectUri ? `<div class="subject-uri">Target Post: ${esc(a.subjectUri)}</div>` : ''}
                    </div>

                    ${
                      !isOpen
                        ? `
                        <div class="item-meta-row" style="font-size: 12px; color: var(--text-muted);">
                          <span>Decision: <strong style="color: var(--text-primary);">${esc(a.status)}</strong></span>
                          ${a.resolvedBy ? `<span>&middot; By @${esc(a.resolvedBy)}</span>` : ''}
                          ${a.resolvedAt ? `<span>&middot; ${esc(formatDateTime(a.resolvedAt))}</span>` : ''}
                          ${a.resolutionNote ? `<span>&middot; Note: "${esc(a.resolutionNote)}"</span>` : ''}
                        </div>
                      `
                        : canResolve
                          ? `
                          <div class="action-bar">
                            <input
                              type="text"
                              class="ops-input inline-note-input"
                              placeholder="Appeal resolution note (audit-logged)..."
                              value="${esc(noteVal)}"
                              data-input="appeal-note"
                              data-id="${esc(a.id)}"
                            />
                            <button type="button" class="btn btn-success btn-sm" data-action="resolve-appeal" data-id="${esc(a.id)}" data-decision="approve">Approve &amp; Restore</button>
                            <button type="button" class="btn btn-danger btn-sm" data-action="resolve-appeal" data-id="${esc(a.id)}" data-decision="reject">Reject</button>
                          </div>
                        `
                          : ''
                    }
                  </article>
                `
              })
              .join('')}
          </div>
        `
    }
  `
}

// ---------------------------------------------------------------------------
// Panel 6: Four-Eyes Approvals
// ---------------------------------------------------------------------------

function renderApprovalsPanel() {
  const canReview = hasPerm('approvals.review')

  return `
    <div class="info-banner accent">
      ${iconSvg('shieldCheck', 16)}
      <span>
        <strong>Four-Eyes Dual Control:</strong> High-impact enforcements targeting verified accounts require independent review by a Super Admin. Requesters cannot approve their own escalations.
      </span>
    </div>

    <div class="toolbar">
      <div class="filter-pills" role="group" aria-label="Approval status filter">
        ${[
          {id: 'pending', label: 'Pending'},
          {id: 'approved', label: 'Approved'},
          {id: 'rejected', label: 'Rejected'},
          {id: 'all', label: 'All'},
        ]
          .map(
            s => `
            <button
              type="button"
              class="filter-pill ${state.approvalsStatus === s.id ? 'active' : ''}"
              data-action="set-approvals-status"
              data-value="${s.id}"
            >${s.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    ${
      state.approvalsLoading
        ? `<div class="empty-state"><span>Loading Four-Eyes approval queue...</span></div>`
        : state.approvals.length === 0
          ? `
          <div class="empty-state">
            ${iconSvg('shieldCheck', 26)}
            <h3 class="empty-state-title">No ${esc(state.approvalsStatus)} approvals</h3>
            <p class="empty-state-sub">Dual-control enforcement requests appear here when L2 Trust &amp; Safety escalates actions on verified accounts.</p>
          </div>
        `
          : `
          <div class="item-list">
            ${state.approvals
              .map(ap => {
                const isPending = String(ap.status || 'pending').toLowerCase() === 'pending'
                const reqAction = String(ap.action || ap.requestedAction || 'ENFORCE').toUpperCase()
                const actionBadgeClass = reqAction.includes('BAN') ? 'pill-danger' : 'pill-violet'
                const isSelfRequest = Boolean(
                  ap.requestedByDid && state.me?.did && ap.requestedByDid === state.me.did,
                )
                const noteVal = state.approvalNotes[ap.id] || ''
                const targetHandle = ap.targetHandle || ap.targetAccount?.handle || ap.targetDid || 'unknown'
                const targetVerified = Boolean(ap.targetVerified ?? ap.targetAccount?.verified ?? true)

                return `
                  <article class="item-card" data-approval-id="${esc(ap.id)}">
                    <div class="item-card-top">
                      <div class="item-meta-row">
                        <span class="item-id">#${esc(ap.id)}</span>
                        <span class="pill ${actionBadgeClass}">${esc(reqAction)}</span>
                        ${statusPillHtml(ap.status)}
                        <span class="item-timestamp tabular">${esc(formatDateTime(ap.createdAt))}</span>
                      </div>
                    </div>

                    <div class="subject-box">
                      <div class="item-meta-row">
                        <span style="color: var(--text-muted); font-size: 12px;">Target Account:</span>
                        <strong>@${esc(targetHandle)}</strong>
                        ${targetVerified ? `<span class="verified-icon" title="Verified Account">${iconSvg('verified', 15)}</span><span class="pill pill-accent">VERIFIED</span>` : ''}
                      </div>
                      <div class="item-meta-row" style="font-size: 12px;">
                        <span style="color: var(--text-muted);">Requested By:</span>
                        <strong class="mono">@${esc(ap.requestedByHandle || ap.requestedByDid || 'staff')}</strong>
                        ${ap.requestedByRole ? `<span class="pill ${getRoleMeta(ap.requestedByRole).pillClass}">${esc(getRoleMeta(ap.requestedByRole).label)}</span>` : ''}
                        ${ap.suspendHours ? `<span class="pill pill-muted">${esc(ap.suspendHours)}h duration</span>` : ''}
                      </div>
                      <p class="subject-text" style="font-size: 13px;">
                        <span style="color: var(--text-muted);">Justification:</span> ${esc(ap.reason || 'No reason provided')}
                      </p>
                      ${ap.reportId ? `<div class="subject-uri">Linked Report: #${esc(ap.reportId)}</div>` : ''}
                    </div>

                    ${
                      !isPending
                        ? `
                        <div class="item-meta-row" style="font-size: 12px; color: var(--text-muted);">
                          <span>Reviewed By: <strong style="color: var(--text-primary);">@${esc(ap.reviewedByHandle || ap.reviewedBy || 'super_admin')}</strong></span>
                          ${ap.reviewedAt ? `<span>&middot; ${esc(formatDateTime(ap.reviewedAt))}</span>` : ''}
                          ${ap.reviewNote ? `<span>&middot; Note: "${esc(ap.reviewNote)}"</span>` : ''}
                        </div>
                      `
                        : canReview
                          ? isSelfRequest
                            ? `
                            <div class="action-bar">
                              <span class="pill pill-muted">${iconSvg('lock', 12)}<span>Self-approval prohibited — another Super Admin must review</span></span>
                            </div>
                          `
                            : `
                            <div class="action-bar">
                              <input
                                type="text"
                                class="ops-input inline-note-input"
                                placeholder="Super-Admin sign-off note (audit-logged)..."
                                value="${esc(noteVal)}"
                                data-input="approval-note"
                                data-id="${esc(ap.id)}"
                              />
                              <button type="button" class="btn btn-success btn-sm" data-action="review-approval" data-id="${esc(ap.id)}" data-decision="approve">Approve &amp; Execute</button>
                              <button type="button" class="btn btn-danger btn-sm" data-action="review-approval" data-id="${esc(ap.id)}" data-decision="reject">Reject</button>
                            </div>
                          `
                          : ''
                    }
                  </article>
                `
              })
              .join('')}
          </div>
        `
    }
  `
}

// ---------------------------------------------------------------------------
// Panel 7: Staff Team & Offboarding Kill Switch
// ---------------------------------------------------------------------------

function renderStaffPanel() {
  const canManage = hasPerm('staff.manage')

  return `
    ${
      canManage
        ? `
        <section class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">${iconSvg('key', 16)}<span>Invite New Employee</span></h2>
              <p class="card-subtitle">Generate a single-use, role-scoped onboarding link for a new QuantZing staff member</p>
            </div>
          </div>

          <form id="staff-invite-form" class="invite-grid" novalidate>
            <div class="ops-field">
              <label class="ops-label" for="staff-invite-email">Work Email</label>
              <input
                id="staff-invite-email"
                class="ops-input"
                type="email"
                name="email"
                required
                placeholder="employee@quantzing.com"
                value="${esc(state.inviteDraft.email)}"
                data-input="invite-email"
                data-testid="staffInviteEmail"
              />
            </div>

            <div class="ops-field">
              <label class="ops-label" for="staff-invite-dept">Department</label>
              <input
                id="staff-invite-dept"
                class="ops-input"
                type="text"
                name="department"
                required
                placeholder="Trust & Safety"
                value="${esc(state.inviteDraft.department)}"
                data-input="invite-dept"
                data-testid="staffInviteDept"
              />
            </div>

            <div class="ops-field">
              <label class="ops-label" for="staff-invite-role">Role</label>
              <select
                id="staff-invite-role"
                class="ops-select"
                name="role"
                data-input="invite-role"
                data-testid="staffInviteRole"
              >
                ${ASSIGNABLE_STAFF_ROLES.map(
                  r => `<option value="${r.value}" ${state.inviteDraft.role === r.value ? 'selected' : ''}>${esc(r.label)}</option>`,
                ).join('')}
              </select>
            </div>

            <div class="ops-field">
              <label class="ops-label" for="staff-invite-expiry">Expires (hrs)</label>
              <input
                id="staff-invite-expiry"
                class="ops-input tabular"
                type="number"
                name="expiresHours"
                min="1"
                max="720"
                value="${esc(state.inviteDraft.expiresHours)}"
                data-input="invite-expiry"
              />
            </div>

            <button
              type="submit"
              class="btn btn-primary"
              data-testid="staffInviteBtn"
            >
              ${iconSvg('plus', 15)}
              <span>Generate Invite Link</span>
            </button>
          </form>

          ${
            state.lastInviteUrl
              ? `
              <div class="invite-url-box">
                <div class="invite-url-code" data-testid="staffInviteUrlOutput">${esc(state.lastInviteUrl)}</div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-action="copy-text"
                  data-text="${esc(state.lastInviteUrl)}"
                >
                  ${iconSvg('copy', 13)}
                  <span>Copy Link</span>
                </button>
              </div>
            `
              : ''
          }
        </section>
      `
        : ''
    }

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">${iconSvg('users', 16)}<span>Active Staff Roster</span></h2>
          <p class="card-subtitle">Live productivity counters and instant offboarding kill switch</p>
        </div>
      </div>

      ${
        state.staffLoading
          ? `<div class="empty-state" style="border: 0;"><span>Loading staff directory...</span></div>`
          : state.staff.length === 0
            ? `<div class="empty-state" style="border: 0;"><span>No active staff accounts found.</span></div>`
            : `
            <div class="table-wrap">
              <table class="ops-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Live Productivity</th>
                    <th>Kill Switch</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.staff
                    .map(member => {
                      const roleMeta = getRoleMeta(member.role, member.roleLabel)
                      const isSelf = member.did === state.me?.did
                      const isFounder = member.did === FOUNDER_DID || Boolean(member.isFounder)
                      const prod = member.metrics || member.productivity || member.stats || {}
                      const resolved = Number(
                        prod.ticketsResolved ?? prod.resolvedCount ?? prod.resolved ?? member.resolvedCount ?? 0,
                      )
                      const claimed = Number(
                        prod.openClaimed ?? prod.claimedCount ?? prod.claimed ?? member.claimedCount ?? 0,
                      )
                      const auditEvents = Number(
                        prod.totalAuditActions ?? prod.auditCount ?? prod.auditEvents ?? member.auditCount ?? 0,
                      )
                      const lastLogin = member.lastOpsLoginAt || prod.lastOpsLoginAt || null

                      return `
                        <tr data-staff-did="${esc(member.did)}">
                          <td>
                            <div class="cell-identity">
                              <div class="cell-name-row">
                                <span>${esc(member.displayName || member.handle)}</span>
                                ${isSelf ? `<span class="pill pill-accent">YOU</span>` : ''}
                              </div>
                              <span class="cell-sub mono">@${esc(member.handle)}</span>
                              ${member.email ? `<span class="cell-sub mono">${esc(member.email)}</span>` : ''}
                            </div>
                          </td>
                          <td>${esc(member.department || 'Operations')}</td>
                          <td><span class="pill ${roleMeta.pillClass}">${esc(roleMeta.label)}</span></td>
                          <td class="tabular">
                            <div>
                              <strong>${formatCompact(resolved)}</strong> resolved &middot;
                              <strong>${formatCompact(claimed)}</strong> claimed &middot;
                              <strong>${formatCompact(auditEvents)}</strong> audit events
                            </div>
                            <div class="cell-sub">Last Ops Login: ${esc(formatDateTime(lastLogin))}</div>
                          </td>
                          <td>
                            ${
                              canManage
                                ? `<button
                                    type="button"
                                    class="btn btn-danger btn-sm"
                                    data-action="offboard-staff"
                                    data-did="${esc(member.did)}"
                                    data-handle="${esc(member.handle)}"
                                    data-testid="staffOffboardBtn"
                                    ${isSelf || isFounder ? 'disabled title="Cannot offboard self or sovereign founder"' : ''}
                                  >
                                    ${iconSvg('power', 13)}
                                    <span>Offboard (Kill Switch)</span>
                                  </button>`
                                : `<span class="cell-sub">Super Admin only</span>`
                            }
                          </td>
                        </tr>
                      `
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
      }
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Pending &amp; Recent Invites</h2>
          <p class="card-subtitle">Track single-use staff onboarding links</p>
        </div>
      </div>

      ${
        state.invites.length === 0
          ? `<div class="empty-state" style="border: 0; padding: 20px;"><span>No staff invites issued yet.</span></div>`
          : `
          <div class="table-wrap">
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role &amp; Department</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${state.invites
                  .map(inv => {
                    const roleMeta = getRoleMeta(inv.role, inv.roleLabel)
                    const statusLower = String(inv.status || 'pending').toLowerCase()
                    const inviteUrl = buildInviteUrl(inv)
                    return `
                      <tr>
                        <td class="mono">${esc(inv.email)}</td>
                        <td>
                          <div class="toolbar-group">
                            <span class="pill ${roleMeta.pillClass}">${esc(roleMeta.label)}</span>
                            <span class="cell-sub">${esc(inv.department || 'Operations')}</span>
                          </div>
                        </td>
                        <td>${statusPillHtml(inv.status || 'pending')}</td>
                        <td class="tabular">${esc(formatDateTime(inv.expiresAt))}</td>
                        <td>
                          <div class="toolbar-group">
                            ${
                              statusLower === 'pending' && inviteUrl
                                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="copy-text" data-text="${esc(inviteUrl)}">${iconSvg('copy', 12)}<span>Copy Link</span></button>`
                                : ''
                            }
                            ${
                              statusLower === 'pending' && canManage
                                ? `<button type="button" class="btn btn-danger btn-sm" data-action="revoke-invite" data-id="${esc(inv.id || inv.token)}">Revoke</button>`
                                : `<span class="cell-sub">${inv.acceptedByHandle ? `@${esc(inv.acceptedByHandle)}` : '--'}</span>`
                            }
                          </div>
                        </td>
                      </tr>
                    `
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    </section>
  `
}

// ---------------------------------------------------------------------------
// Panel 8: Audit Log
// ---------------------------------------------------------------------------

function filterAuditEntries(entries) {
  const q = state.auditQuery.trim().toLowerCase()
  const cat = state.auditCategory
  return entries.filter(e => {
    const action = String(e.action || '').toLowerCase()
    if (cat === 'auth' && !action.includes('ops.login') && !action.includes('ops.logout') && !action.includes('auth')) return false
    if (cat === 'inspect' && !action.includes('inspect')) return false
    if (cat === 'enforcement' && !action.includes('ban') && !action.includes('suspend') && !action.includes('warn') && !action.includes('takedown')) return false
    if (cat === 'reports' && !action.includes('report')) return false
    if (cat === 'approvals' && !action.includes('approval')) return false
    if (cat === 'staff' && !action.includes('staff') && !action.includes('invite') && !action.includes('role')) return false
    if (!q) return true
    const blob = [
      e.action,
      e.actorHandle,
      e.actorDid,
      e.target,
      e.ip,
      e.details ? JSON.stringify(e.details) : '',
    ]
      .join(' ')
      .toLowerCase()
    return blob.includes(q)
  })
}

function renderAuditDetailsHtml(details) {
  if (!details || typeof details !== 'object') return `<span class="cell-sub">--</span>`
  const entries = Object.entries(details).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return `<span class="cell-sub">--</span>`
  return `
    <div class="detail-chips">
      ${entries
        .map(([k, v]) => {
          const valStr = typeof v === 'string' ? v : JSON.stringify(v)
          return `<span class="detail-chip" title="${esc(`${k}: ${valStr}`)}"><strong>${esc(k)}:</strong> ${esc(valStr)}</span>`
        })
        .join('')}
    </div>
  `
}

function renderAuditRowsHtml() {
  if (state.auditLoading) {
    return `<div class="empty-state"><span>Loading audit ledger...</span></div>`
  }
  const rows = filterAuditEntries(state.audit)
  if (rows.length === 0) {
    return `
      <div class="empty-state">
        ${iconSvg('list', 26)}
        <h3 class="empty-state-title">No matching audit entries</h3>
        <p class="empty-state-sub">All staff authentications, PII inspections, and moderation actions appear here in real time.</p>
      </div>
    `
  }

  return `
    <div class="table-wrap">
      <table class="ops-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Actor</th>
            <th>IP</th>
            <th>Target</th>
            <th>Structured Details</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(entry => {
              const ip = entry.ip || entry.details?.ip || '--'
              return `
                <tr>
                  <td class="mono tabular" style="white-space: nowrap; font-size: 12px; color: var(--text-secondary);">
                    ${esc(formatDateTime(entry.timestamp))}
                  </td>
                  <td>${actionPillHtml(entry.action)}</td>
                  <td>
                    <div class="cell-identity">
                      <span class="mono" style="font-size: 12px; font-weight: 600;">@${esc(entry.actorHandle || 'system')}</span>
                      ${entry.actorRole ? `<span class="cell-sub">${esc(getRoleMeta(entry.actorRole).label)}</span>` : ''}
                    </div>
                  </td>
                  <td class="mono" style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">${esc(ip)}</td>
                  <td class="mono" style="font-size: 12px; max-width: 220px; word-break: break-all;">${esc(entry.target || '--')}</td>
                  <td>${renderAuditDetailsHtml(entry.details)}</td>
                </tr>
              `
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderAuditListSlot() {
  const slot = document.getElementById('audit-list-slot')
  if (slot) slot.innerHTML = renderAuditRowsHtml()
}

function renderAuditPanel() {
  return `
    <div class="toolbar">
      <div class="search-wrap">
        ${iconSvg('search', 15)}
        <input
          type="search"
          class="ops-input"
          placeholder="Filter by action, @actor, IP, target, ticketId, or reason..."
          value="${esc(state.auditQuery)}"
          data-input="audit-search"
        />
      </div>

      <div class="filter-pills" role="group" aria-label="Audit category filter">
        ${[
          {id: 'all', label: 'All'},
          {id: 'auth', label: 'Ops Auth'},
          {id: 'inspect', label: 'PII Inspect'},
          {id: 'enforcement', label: 'Enforcement'},
          {id: 'reports', label: 'Reports'},
          {id: 'approvals', label: 'Approvals'},
          {id: 'staff', label: 'Staff'},
        ]
          .map(
            c => `
            <button
              type="button"
              class="filter-pill ${state.auditCategory === c.id ? 'active' : ''}"
              data-action="set-audit-category"
              data-value="${c.id}"
            >${c.label}</button>
          `,
          )
          .join('')}
      </div>
    </div>

    <div id="audit-list-slot">
      ${renderAuditRowsHtml()}
    </div>
  `
}

// ---------------------------------------------------------------------------
// Modal: Reason-Logged PII User Inspection
// ---------------------------------------------------------------------------

function openInspectModal({did, handle, displayName}) {
  state.inspectModal = {
    did,
    handle,
    displayName,
    ticketId: '',
    reason: '',
    loading: false,
    error: null,
    data: null,
  }
  renderModal()
}

function closeModal() {
  state.inspectModal = null
  const root = document.getElementById('modal-root')
  if (root) {
    root.classList.remove('open')
    root.setAttribute('aria-hidden', 'true')
    root.innerHTML = ''
  }
}

function renderModal() {
  const root = document.getElementById('modal-root')
  if (!root) return
  const modal = state.inspectModal
  if (!modal) {
    closeModal()
    return
  }

  root.classList.add('open')
  root.setAttribute('aria-hidden', 'false')

  const result = modal.data
  const inspectedUser = result?.inspection || result?.user || result?.account || result || null
  const warnings = Array.isArray(inspectedUser?.warnings)
    ? inspectedUser.warnings
    : Array.isArray(result?.warnings)
      ? result.warnings
      : []
  const reports = Array.isArray(inspectedUser?.recentReportsAgainst)
    ? inspectedUser.recentReportsAgainst
    : Array.isArray(result?.reports)
      ? result.reports
      : []
  const appeals = Array.isArray(inspectedUser?.recentAppeals)
    ? inspectedUser.recentAppeals
    : Array.isArray(result?.appeals)
      ? result.appeals
      : []
  const dmNotice =
    inspectedUser?.dmAccessNote ||
    result?.privacyNotice ||
    'Private DMs are strictly inaccessible to staff unless explicitly reported.'

  root.innerHTML = `
    <div class="ops-modal" role="dialog" aria-modal="true" aria-labelledby="inspect-modal-title" data-testid="opsInspectModal">
      <div class="ops-modal-header">
        <div>
          <h2 class="ops-modal-title" id="inspect-modal-title">Reason-Logged Account Inspection</h2>
          <div class="cell-sub mono">@${esc(modal.handle)} &middot; ${esc(modal.did)}</div>
        </div>
        <button type="button" class="ops-modal-close" data-action="close-modal" aria-label="Close modal">
          ${iconSvg('x', 16)}
        </button>
      </div>

      ${
        !result
          ? `
          <div class="ops-security-notice" style="margin-bottom: 0;">
            ${iconSvg('lock', 16)}
            <span>Every account inspection requires a Ticket ID and business Reason. Your query is permanently recorded in the Ops Audit Log.</span>
          </div>

          <form class="ops-form" id="ops-inspect-form" novalidate>
            <div class="ops-field">
              <label class="ops-label" for="inspect-ticket-id">Ticket / Case ID</label>
              <input
                id="inspect-ticket-id"
                class="ops-input mono"
                type="text"
                name="ticketId"
                required
                placeholder="e.g. TNS-402 or SUP-1088"
                value="${esc(modal.ticketId)}"
                data-testid="inspectTicketInput"
              />
            </div>

            <div class="ops-field">
              <label class="ops-label" for="inspect-reason">Inspection Reason (Required)</label>
              <textarea
                id="inspect-reason"
                class="ops-textarea"
                name="reason"
                required
                placeholder="Explain why you need to inspect this user's safety & account metadata..."
                data-testid="inspectReasonInput"
              >${esc(modal.reason)}</textarea>
            </div>

            ${
              modal.error
                ? `<div class="ops-error-banner">${iconSvg('alert', 16)}<span>${esc(modal.error)}</span></div>`
                : ''
            }

            <div class="toolbar-group" style="justify-content: flex-end;">
              <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
              <button
                type="submit"
                class="btn btn-primary"
                data-testid="inspectSubmitBtn"
                ${modal.loading ? 'disabled' : ''}
              >
                ${iconSvg('shieldCheck', 15)}
                <span>${modal.loading ? 'Logging & Fetching...' : 'Log Reason & Inspect'}</span>
              </button>
            </div>
          </form>
        `
          : `
          <div class="privacy-lock-banner" data-testid="inspectPrivacyNotice">
            ${iconSvg('lock', 16)}
            <span>${esc(dmNotice)}</span>
          </div>

          <div class="inspect-section">
            <h3 class="inspect-section-title">Account Summary</h3>
            <div class="inspect-kv-grid">
              <div class="inspect-kv">
                <span class="inspect-kv-label">Handle</span>
                <span class="inspect-kv-val mono">@${esc(inspectedUser?.handle || modal.handle)}</span>
              </div>
              <div class="inspect-kv">
                <span class="inspect-kv-label">Status</span>
                <span class="inspect-kv-val">${statusPillHtml(inspectedUser?.status || 'active')}</span>
              </div>
              <div class="inspect-kv">
                <span class="inspect-kv-label">Email</span>
                <span class="inspect-kv-val mono">${esc(inspectedUser?.email || '[REDACTED]')}</span>
              </div>
              <div class="inspect-kv">
                <span class="inspect-kv-label">Role</span>
                <span class="inspect-kv-val">${esc(getRoleMeta(inspectedUser?.role).label)}</span>
              </div>
              <div class="inspect-kv">
                <span class="inspect-kv-label">Created</span>
                <span class="inspect-kv-val tabular">${esc(formatDateTime(inspectedUser?.createdAt))}</span>
              </div>
              <div class="inspect-kv">
                <span class="inspect-kv-label">Status Reason</span>
                <span class="inspect-kv-val">${esc(inspectedUser?.statusReason || 'None')}</span>
              </div>
            </div>
          </div>

          <div class="inspect-section">
            <h3 class="inspect-section-title">Warnings (${warnings.length})</h3>
            ${
              warnings.length === 0
                ? `<span class="cell-sub">No policy warnings on record.</span>`
                : warnings
                    .map(
                      w => `
                      <div style="font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--border);">
                        <div><strong>${esc(w.reason || 'Policy warning')}</strong></div>
                        <div class="cell-sub">By @${esc(w.by || 'staff')} &middot; ${esc(formatDateTime(w.createdAt || w.at))}</div>
                      </div>
                    `,
                    )
                    .join('')
            }
          </div>

          <div class="inspect-section">
            <h3 class="inspect-section-title">Related Reports (${reports.length})</h3>
            ${
              reports.length === 0
                ? `<span class="cell-sub">No linked moderation reports.</span>`
                : reports
                    .slice(0, 8)
                    .map(
                      r => `
                      <div style="font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--border);">
                        <div class="item-meta-row">
                          <span class="mono">#${esc(r.id)}</span>
                          ${statusPillHtml(r.status)}
                          <span class="pill pill-violet">${esc(formatReasonType(r.reasonType))}</span>
                        </div>
                        ${r.reason ? `<div class="cell-sub" style="margin-top: 3px;">"${esc(r.reason)}"</div>` : ''}
                      </div>
                    `,
                    )
                    .join('')
            }
          </div>

          <div class="inspect-section">
            <h3 class="inspect-section-title">Related Appeals (${appeals.length})</h3>
            ${
              appeals.length === 0
                ? `<span class="cell-sub">No appeals submitted by this account.</span>`
                : appeals
                    .slice(0, 6)
                    .map(
                      a => `
                      <div style="font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--border);">
                        <div class="item-meta-row">
                          <span class="mono">#${esc(a.id)}</span>
                          ${statusPillHtml(a.status)}
                          <span class="cell-sub">${esc(formatDateTime(a.createdAt))}</span>
                        </div>
                        <div style="margin-top: 3px;">${esc(a.message || '')}</div>
                      </div>
                    `,
                    )
                    .join('')
            }
          </div>

          <div class="toolbar-group" style="justify-content: flex-end;">
            <button type="button" class="btn btn-primary" data-action="close-modal">Done</button>
          </div>
        `
      }
    </div>
  `
}

// ---------------------------------------------------------------------------
// Root Render & Action Handlers
// ---------------------------------------------------------------------------

function render() {
  const app = document.getElementById('app')
  if (!app) return
  if (state.view === 'invite') {
    app.innerHTML = renderInviteScreen()
  } else if (state.view === 'login') {
    app.innerHTML = renderLoginScreen()
  } else if (state.view === 'portal') {
    app.innerHTML = renderPortalShell()
  }
}

async function handleLoginSubmit(form) {
  const identifier = String(form.elements.identifier?.value || '').trim()
  const password = String(form.elements.password?.value || '')
  const errEl = document.getElementById('ops-login-error')
  const submitBtn = form.querySelector('[data-testid="opsLoginSubmit"]')

  if (!identifier || !password) {
    state.loginError = 'Enter your staff handle or email and password.'
    if (errEl) {
      errEl.style.display = 'flex'
      errEl.innerHTML = `${iconSvg('alert', 16)}<span>${esc(state.loginError)}</span>`
    }
    return
  }

  if (submitBtn) submitBtn.disabled = true
  if (errEl) errEl.style.display = 'none'

  try {
    const {data} = await apiRequest('/api/quantzing/ops/login', {
      method: 'POST',
      body: {identifier, password},
      auth: false,
    })
    const token = data.accessJwt || data.session?.accessJwt || data.token
    if (!token) {
      throw new Error('Authentication succeeded without an access token.')
    }
    setJwt(token)
    const entered = await tryEnterPortalFromSession()
    if (!entered) {
      throw new Error('Staff session could not be verified.')
    }
    showToast(`Signed in as @${state.me.handle}`, 'success')
  } catch (err) {
    state.loginError = err.message || 'Invalid staff credentials.'
    if (errEl) {
      errEl.style.display = 'flex'
      errEl.innerHTML = `${iconSvg('alert', 16)}<span>${esc(state.loginError)}</span>`
    } else {
      render()
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false
  }
}

async function handleInviteSubmit(form) {
  const rawHandle = String(form.elements.handle?.value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  const displayName = String(form.elements.displayName?.value || '').trim()
  const password = String(form.elements.password?.value || '')
  const errEl = document.getElementById('invite-form-error')
  const submitBtn = form.querySelector('[data-testid="inviteSubmitBtn"]')

  const showErr = msg => {
    if (errEl) {
      errEl.style.display = 'flex'
      errEl.innerHTML = `${iconSvg('alert', 16)}<span>${esc(msg)}</span>`
    }
  }

  if (!rawHandle) return showErr('Choose a staff handle.')
  if (!displayName) return showErr('Enter your display name.')
  if (password.length < 8) return showErr('Password must be at least 8 characters.')

  const handle = rawHandle.endsWith('.quantzing.com')
    ? rawHandle
    : rawHandle.includes('.')
      ? rawHandle
      : `${rawHandle}.quantzing.com`

  if (submitBtn) submitBtn.disabled = true
  if (errEl) errEl.style.display = 'none'

  try {
    const {data} = await apiRequest('/api/quantzing/ops/accept-invite', {
      method: 'POST',
      body: {
        token: state.inviteToken,
        handle,
        displayName,
        password,
      },
      auth: false,
    })
    const jwt = data.accessJwt || data.session?.accessJwt || data.token
    if (!jwt) {
      throw new Error('Account activated, but no staff token was returned.')
    }
    setJwt(jwt)
    try {
      window.history.replaceState({}, '', window.location.pathname)
    } catch {}
    state.inviteToken = null
    state.inviteInfo = null
    const entered = await tryEnterPortalFromSession()
    if (!entered) {
      throw new Error('Failed to load newly activated staff session.')
    }
    showToast(`Staff account @${state.me.handle} activated`, 'success')
  } catch (err) {
    showErr(err.message || 'Unable to activate staff account.')
  } finally {
    if (submitBtn) submitBtn.disabled = false
  }
}

async function handleStaffInviteSubmit(form) {
  const email = String(form.elements.email?.value || '').trim()
  const department = String(form.elements.department?.value || '').trim() || 'Operations'
  const role = String(form.elements.role?.value || 'l1_moderator').trim()
  const expiresHours = Math.max(1, Number(form.elements.expiresHours?.value || 48) || 48)
  const submitBtn = form.querySelector('[data-testid="staffInviteBtn"]')

  if (!email || !email.includes('@')) {
    showToast('Enter a valid employee email address', 'error')
    return
  }

  if (submitBtn) submitBtn.disabled = true
  try {
    const {data} = await apiRequest('/api/quantzing/admin/staff/invite', {
      method: 'POST',
      body: {email, department, role, expiresHours},
    })
    const url = buildInviteUrl(data.invite, data)
    state.lastInviteUrl = url
    state.inviteDraft.email = ''
    showToast(`Staff invite generated for ${email}`, 'success')
    await loadStaff()
  } catch (err) {
    showToast(err.message || 'Failed to generate staff invite', 'error')
  } finally {
    if (submitBtn) submitBtn.disabled = false
  }
}

async function handleInspectSubmit(form) {
  if (!state.inspectModal) return
  const ticketId = String(form.elements.ticketId?.value || '').trim()
  const reason = String(form.elements.reason?.value || '').trim()

  state.inspectModal.ticketId = ticketId
  state.inspectModal.reason = reason

  if (!ticketId || !reason) {
    state.inspectModal.error = 'Both Ticket ID and Inspection Reason are required.'
    renderModal()
    return
  }

  state.inspectModal.loading = true
  state.inspectModal.error = null
  renderModal()

  try {
    const {data} = await apiRequest(
      `/api/quantzing/admin/users/${encodeURIComponent(state.inspectModal.did)}/inspect`,
      {
        method: 'POST',
        body: {ticketId, reason},
      },
    )
    state.inspectModal.loading = false
    state.inspectModal.data = data
    renderModal()
    showToast(`Reason-logged inspection recorded for ${ticketId}`, 'info')
  } catch (err) {
    if (state.inspectModal) {
      state.inspectModal.loading = false
      state.inspectModal.error = err.message || 'Failed to inspect account.'
      renderModal()
    }
  }
}

async function handleClaimNextReport() {
  try {
    const {data} = await apiRequest('/api/quantzing/admin/reports/claim-next', {
      method: 'POST',
      body: {},
    })
    const claimed = data.report || null
    if (!claimed) {
      showToast(data.message || 'No unclaimed open tickets in queue', 'info')
      return
    }
    state.highlightedReportId = String(claimed.id)
    showToast(`Claimed ticket #${claimed.id}`, 'success')
    await loadReports()
  } catch (err) {
    if (err.status === 404 && String(err.message || '').toLowerCase().includes('no unclaimed')) {
      showToast('No unclaimed open tickets available right now', 'info')
    } else {
      showToast(err.message || 'Unable to claim next ticket', 'error')
    }
  }
}

async function handleClaimOrRelease(kind, id, release) {
  const endpoint = release
    ? `/api/quantzing/admin/${kind}/${encodeURIComponent(id)}/release`
    : `/api/quantzing/admin/${kind}/${encodeURIComponent(id)}/claim`
  try {
    await apiRequest(endpoint, {method: 'POST', body: release ? {release: true} : {}})
    showToast(release ? `Released #${id} back to queue` : `Claimed #${id}`, 'success')
    if (kind === 'reports') await loadReports()
    else await loadAppeals()
  } catch (err) {
    // Fallback if backend uses /claim with {release: true} instead of /release
    if (release && err.status === 404) {
      try {
        await apiRequest(`/api/quantzing/admin/${kind}/${encodeURIComponent(id)}/claim`, {
          method: 'POST',
          body: {release: true},
        })
        showToast(`Released #${id} back to queue`, 'success')
        if (kind === 'reports') await loadReports()
        else await loadAppeals()
        return
      } catch (err2) {
        showToast(err2.message || 'Failed to release ticket', 'error')
        return
      }
    }
    showToast(err.message || 'Failed to update ticket claim', 'error')
  }
}

async function handleResolveReport(id, resolution, labelVal) {
  const note = String(state.reportNotes[id] || '').trim()
  const payload = {action: resolution, note}
  if (resolution === 'label') payload.labelVal = labelVal || 'sensitive'
  if (resolution === 'suspend_user') payload.suspendHours = 24

  try {
    const {status, data} = await apiRequest(
      `/api/quantzing/admin/reports/${encodeURIComponent(id)}/resolve`,
      {method: 'POST', body: payload},
    )
    if (status === 202 || data?.pendingApproval) {
      showToast('Queued for Super-Admin Four-Eyes approval', 'info', 5200)
      await refreshLiveBadges()
    } else {
      showToast(`Report #${id} updated (${resolution})`, 'success')
    }
    delete state.reportNotes[id]
    await loadReports()
    await refreshLiveBadges()
  } catch (err) {
    showToast(err.message || 'Failed to resolve report', 'error')
  }
}

async function handleUserAction(did, op, extra = {}) {
  const payload = {
    action: op,
    reason: state.usersReason.trim() || undefined,
    ...extra,
  }
  if (op === 'suspend') payload.suspendHours = 24

  try {
    const {status, data} = await apiRequest(
      `/api/quantzing/admin/users/${encodeURIComponent(did)}/action`,
      {method: 'POST', body: payload},
    )
    if (status === 202 || data?.pendingApproval) {
      showToast('Queued for Super-Admin Four-Eyes approval', 'info', 5200)
      await refreshLiveBadges()
    } else {
      showToast(`Account action "${op}" applied`, 'success')
    }
    await loadUsers(true)
  } catch (err) {
    showToast(err.message || `Action "${op}" failed`, 'error')
  }
}

async function handlePostAction(uri, op, labelVal) {
  const payload = {
    uri,
    action: op,
    reason: state.postsReason.trim() || undefined,
  }
  if (op === 'label') payload.labelVal = labelVal || 'sensitive'
  if (op === 'unlabel') payload.labelVal = labelVal || ''

  try {
    await apiRequest('/api/quantzing/admin/posts/action', {method: 'POST', body: payload})
    showToast(`Post action "${op}" applied`, 'success')
    await loadPosts(true)
  } catch (err) {
    showToast(err.message || `Post action "${op}" failed`, 'error')
  }
}

async function handleResolveAppeal(id, decision) {
  const note = String(state.appealNotes[id] || '').trim()
  try {
    await apiRequest(`/api/quantzing/admin/appeals/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: {decision, note},
    })
    showToast(
      decision === 'approve' ? `Appeal #${id} approved and restored` : `Appeal #${id} rejected`,
      'success',
    )
    delete state.appealNotes[id]
    await loadAppeals()
    await refreshLiveBadges()
  } catch (err) {
    showToast(err.message || 'Failed to resolve appeal', 'error')
  }
}

async function handleReviewApproval(id, decision) {
  const note = String(state.approvalNotes[id] || '').trim()
  try {
    await apiRequest(`/api/quantzing/admin/approvals/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: {decision, note},
    })
    showToast(
      decision === 'approve'
        ? `Four-Eyes request #${id} approved and executed`
        : `Four-Eyes request #${id} rejected`,
      'success',
    )
    delete state.approvalNotes[id]
    await loadApprovals()
    await refreshLiveBadges()
  } catch (err) {
    showToast(err.message || 'Failed to review approval request', 'error')
  }
}

async function handleOffboardStaff(did, handle) {
  try {
    await apiRequest(`/api/quantzing/admin/staff/${encodeURIComponent(did)}/offboard`, {
      method: 'POST',
      body: {reason: 'Offboarded via QuantZing Ops Kill Switch'},
    })
    showToast(`Offboarded @${handle} — role demoted & sessions revoked`, 'success', 5000)
    await loadStaff()
  } catch (err) {
    showToast(err.message || 'Offboarding failed', 'error')
  }
}

async function handleRevokeInvite(id) {
  try {
    await apiRequest(`/api/quantzing/admin/staff/invites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    showToast('Staff invite revoked', 'success')
    await loadStaff()
  } catch (err) {
    showToast(err.message || 'Failed to revoke invite', 'error')
  }
}

async function handleCreateBackup() {
  try {
    const {data} = await apiRequest('/api/quantzing/admin/backup', {method: 'POST', body: {}})
    showToast(`Snapshot created: ${data?.backup?.filename || 'backup saved'}`, 'success')
    await loadOverview()
  } catch (err) {
    showToast(err.message || 'Failed to create snapshot backup', 'error')
  }
}

// ---------------------------------------------------------------------------
// Global Delegated Event Wiring
// ---------------------------------------------------------------------------

function wireEvents() {
  document.addEventListener('submit', event => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return

    if (form.id === 'ops-login-form') {
      event.preventDefault()
      void handleLoginSubmit(form)
    } else if (form.id === 'ops-invite-form') {
      event.preventDefault()
      void handleInviteSubmit(form)
    } else if (form.id === 'staff-invite-form') {
      event.preventDefault()
      void handleStaffInviteSubmit(form)
    } else if (form.id === 'ops-inspect-form') {
      event.preventDefault()
      void handleInspectSubmit(form)
    }
  })

  document.addEventListener('input', event => {
    const target = event.target
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    )
      return
    const kind = target.dataset.input
    if (!kind) return

    if (kind === 'invite-email') {
      state.inviteDraft.email = target.value
    } else if (kind === 'invite-dept') {
      state.inviteDraft.department = target.value
    } else if (kind === 'invite-role') {
      state.inviteDraft.role = target.value
    } else if (kind === 'invite-expiry') {
      state.inviteDraft.expiresHours = target.value
    } else if (kind === 'report-note') {
      state.reportNotes[target.dataset.id] = target.value
    } else if (kind === 'appeal-note') {
      state.appealNotes[target.dataset.id] = target.value
    } else if (kind === 'approval-note') {
      state.approvalNotes[target.dataset.id] = target.value
    } else if (kind === 'users-reason') {
      state.usersReason = target.value
    } else if (kind === 'posts-reason') {
      state.postsReason = target.value
    } else if (kind === 'users-search') {
      state.usersQuery = target.value
      window.clearTimeout(userSearchTimer)
      userSearchTimer = window.setTimeout(() => void loadUsers(true), 220)
    } else if (kind === 'posts-search') {
      state.postsQuery = target.value
      window.clearTimeout(postSearchTimer)
      postSearchTimer = window.setTimeout(() => void loadPosts(true), 220)
    } else if (kind === 'audit-search') {
      state.auditQuery = target.value
      renderAuditListSlot()
    }
  })

  document.addEventListener('change', event => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement)) return
    if (target.dataset.input === 'invite-role') {
      state.inviteDraft.role = target.value
    }
  })

  document.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('[data-action]') : null
    if (!el) {
      if (event.target === document.getElementById('modal-root')) {
        closeModal()
      }
      return
    }

    const action = el.getAttribute('data-action')
    if (!action) return

    switch (action) {
      case 'toggle-password': {
        const inputId = el.getAttribute('data-target')
        const input = inputId ? document.getElementById(inputId) : null
        if (input) {
          const isPw = input.type === 'password'
          input.type = isPw ? 'text' : 'password'
          el.innerHTML = iconSvg(isPw ? 'eyeOff' : 'eye', 16)
        }
        break
      }
      case 'go-to-login': {
        try {
          window.history.replaceState({}, '', window.location.pathname)
        } catch {}
        state.inviteToken = null
        state.inviteInfo = null
        state.inviteError = null
        state.view = 'login'
        render()
        break
      }
      case 'toggle-mobile-nav':
        state.mobileNavOpen = !state.mobileNavOpen
        render()
        break
      case 'close-mobile-nav':
        state.mobileNavOpen = false
        render()
        break
      case 'select-tab': {
        const tab = el.getAttribute('data-tab')
        if (tab && getPermittedNavItems().some(n => n.id === tab)) {
          state.activeTab = tab
          state.mobileNavOpen = false
          render()
          void loadActiveTabData()
        }
        break
      }
      case 'refresh-panel':
        void refreshLiveBadges()
        void loadActiveTabData()
        break
      case 'sign-out':
        void handleSignOut()
        break
      case 'create-backup':
        void handleCreateBackup()
        break
      case 'claim-next-report':
        void handleClaimNextReport()
        break
      case 'set-reports-queue':
        state.reportsQueue = el.getAttribute('data-value') || 'all'
        void loadReports()
        break
      case 'set-reports-status':
        state.reportsStatus = el.getAttribute('data-value') || 'open'
        void loadReports()
        break
      case 'claim-report':
        void handleClaimOrRelease('reports', el.getAttribute('data-id'), false)
        break
      case 'release-report':
        void handleClaimOrRelease('reports', el.getAttribute('data-id'), true)
        break
      case 'resolve-report':
        void handleResolveReport(
          el.getAttribute('data-id'),
          el.getAttribute('data-resolution'),
          el.getAttribute('data-label'),
        )
        break
      case 'set-users-filter':
        state.usersFilter = el.getAttribute('data-value') || 'all'
        void loadUsers()
        break
      case 'open-inspect-modal':
        openInspectModal({
          did: el.getAttribute('data-did') || '',
          handle: el.getAttribute('data-handle') || '',
          displayName: el.getAttribute('data-name') || '',
        })
        break
      case 'close-modal':
        closeModal()
        break
      case 'user-action':
        void handleUserAction(el.getAttribute('data-did'), el.getAttribute('data-op'))
        break
      case 'update-user-role': {
        const did = el.getAttribute('data-did')
        const select = document.querySelector(`select[data-role-select="${CSS.escape(did)}"]`)
        if (did && select instanceof HTMLSelectElement) {
          void handleUserAction(did, 'set_role', {role: select.value})
        }
        break
      }
      case 'set-posts-filter':
        state.postsFilter = el.getAttribute('data-value') || 'all'
        void loadPosts()
        break
      case 'post-action':
        void handlePostAction(
          el.getAttribute('data-uri'),
          el.getAttribute('data-op'),
          el.getAttribute('data-label'),
        )
        break
      case 'set-appeals-status':
        state.appealsStatus = el.getAttribute('data-value') || 'open'
        void loadAppeals()
        break
      case 'claim-appeal':
        void handleClaimOrRelease('appeals', el.getAttribute('data-id'), false)
        break
      case 'release-appeal':
        void handleClaimOrRelease('appeals', el.getAttribute('data-id'), true)
        break
      case 'resolve-appeal':
        void handleResolveAppeal(el.getAttribute('data-id'), el.getAttribute('data-decision'))
        break
      case 'set-approvals-status':
        state.approvalsStatus = el.getAttribute('data-value') || 'pending'
        void loadApprovals()
        break
      case 'review-approval':
        void handleReviewApproval(el.getAttribute('data-id'), el.getAttribute('data-decision'))
        break
      case 'offboard-staff':
        void handleOffboardStaff(el.getAttribute('data-did'), el.getAttribute('data-handle'))
        break
      case 'revoke-invite':
        void handleRevokeInvite(el.getAttribute('data-id'))
        break
      case 'copy-text':
        void copyToClipboard(el.getAttribute('data-text') || '', 'Invite link copied to clipboard')
        break
      case 'set-audit-category':
        state.auditCategory = el.getAttribute('data-value') || 'all'
        renderActivePanel()
        break
      default:
        break
    }
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.inspectModal) {
      closeModal()
    }
  })
}

wireEvents()

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot())
} else {
  void boot()
}
