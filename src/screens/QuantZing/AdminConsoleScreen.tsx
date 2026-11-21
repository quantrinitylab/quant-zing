import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import {CommonActions, useNavigation} from '@react-navigation/native'

import {
  type AdminAppealItem,
  type AdminAuditEntry,
  type AdminBackupItem,
  type AdminDailyPoint,
  type AdminMeResponse,
  type AdminOverviewResponse,
  type AdminPostItem,
  type AdminReportItem,
  type AdminUserItem,
  type AppealStatusFilter,
  createAdminBackup,
  fetchAdminAppeals,
  fetchAdminAudit,
  fetchAdminBackups,
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminPosts,
  fetchAdminReports,
  fetchAdminUsers,
  performAdminPostAction,
  performAdminUserAction,
  type PostFilter,
  type PostModerationAction,
  type ReportResolveAction,
  type ReportStatusFilter,
  resolveAdminAppeal,
  resolveAdminReport,
  type UserFilter,
  type UserModerationAction,
} from '#/lib/quantos/adminClient'
import {getQuantZingColors} from '#/lib/quantos/client'
import {type NavigationProp} from '#/lib/routes/types'
import {useSession} from '#/state/session'
import {atoms as a, web} from '#/alf'
import {ArrowRotateCounterClockwise_Stroke2_Corner0_Rounded as RefreshIcon} from '#/components/icons/Arrow'
import {VerifiedCheck} from '#/components/icons/brands/VerifiedCheck'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {
  CircleBanSign_Stroke2_Corner0_Rounded as BanIcon,
  CircleCheck_Stroke2_Corner0_Rounded as CircleCheckIcon,
  CircleX_Stroke2_Corner0_Rounded as CircleXIcon,
} from '#/components/icons/Circle'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Flag_Stroke2_Corner0_Rounded as FlagIcon} from '#/components/icons/Flag'
import {FloppyDisk_Stroke2_Corner0_Rounded as BackupIcon} from '#/components/icons/FloppyDisk'
import {Growth_Stroke2_Corner0_Rounded as OverviewIcon} from '#/components/icons/Growth'
import {Inbox_Stroke2_Corner2_Rounded as AppealsIcon} from '#/components/icons/Inbox'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {PageText_Stroke2_Corner0_Rounded as PostDocIcon} from '#/components/icons/Page'
import {
  Person_Stroke2_Corner0_Rounded as PersonIcon,
  PersonGroup_Stroke2_Corner2_Rounded as UsersGroupIcon,
} from '#/components/icons/Person'
import {
  Shield_Stroke2_Corner0_Rounded as ShieldIcon,
  ShieldCheck_Stroke2_Corner0_Rounded as ShieldCheckIcon,
} from '#/components/icons/Shield'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {Warning_Stroke2_Corner0_Rounded as WarningIcon} from '#/components/icons/Warning'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

type AdminTab =
  | 'overview'
  | 'reports'
  | 'users'
  | 'posts'
  | 'appeals'
  | 'audit'

const BASE_DARK = getQuantZingColors(true)

const X_DARK = {
  bg: BASE_DARK.bg, // #000000
  card: BASE_DARK.card, // #16181C
  surface: BASE_DARK.surface, // #202327
  border: BASE_DARK.border, // #2F3336
  text: BASE_DARK.text, // #E7E9EA
  muted: BASE_DARK.muted, // #71767B
  accent: BASE_DARK.accent, // #1D9BF0
  accentSubtle: BASE_DARK.accentSubtle, // rgba(29, 155, 240, 0.14)
  ctaBg: BASE_DARK.ctaBg, // #EFF3F4
  ctaText: BASE_DARK.ctaText, // #0F1419
  success: BASE_DARK.rezing, // #00BA7C
  successSubtle: BASE_DARK.rezingSubtle, // rgba(0, 186, 124, 0.14)
  danger: BASE_DARK.danger, // #F4212E
  dangerSubtle: 'rgba(244, 33, 46, 0.14)',
} as const

function formatCompact(n: number | undefined | null): string {
  const num = Number(n ?? 0)
  if (!Number.isFinite(num)) return '0'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

function formatBytes(bytes: number | undefined | null): string {
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

function formatUptime(sec: number | undefined | null): string {
  const s = Math.max(0, Math.floor(Number(sec ?? 0)))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${s % 60}s`
  return `${s}s`
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '--'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatShortDay(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`
  }
  return dateStr.slice(-5)
}

function normalizeLabels(
  labels?: Array<string | {val?: string}> | null,
): string[] {
  if (!Array.isArray(labels)) return []
  const out: string[] = []
  for (const item of labels) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim())
    } else if (item && typeof item === 'object' && typeof item.val === 'string') {
      const val = item.val.trim()
      if (val) out.push(val)
    }
  }
  return Array.from(new Set(out))
}

function getWarningsCount(user: AdminUserItem): number {
  if (typeof user.warningsCount === 'number') return user.warningsCount
  if (typeof user.warnings === 'number') return user.warnings
  if (Array.isArray(user.warnings)) return user.warnings.length
  return 0
}

function isUserVerified(user: AdminUserItem): boolean {
  return Boolean(user.verified ?? user.isVerified)
}

function isPostRemoved(post: AdminPostItem): boolean {
  return Boolean(post.takenDown ?? post.removed)
}

function formatAuditDetails(entry: AdminAuditEntry): string {
  if (typeof entry.details === 'string' && entry.details.trim()) {
    return entry.details.trim()
  }
  if (entry.details && typeof entry.details === 'object') {
    const pairs = Object.entries(entry.details)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    if (pairs.length > 0) return pairs.join(' · ')
  }
  if (entry.note?.trim()) return entry.note.trim()
  if (entry.reason?.trim()) return entry.reason.trim()
  return ''
}

function BadgePill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'solidDanger' | 'solidAccent'
}) {
  let backgroundColor: string = X_DARK.surface
  let borderColor: string = X_DARK.border
  let color: string = X_DARK.muted

  if (tone === 'accent') {
    backgroundColor = X_DARK.accentSubtle
    borderColor = X_DARK.accent
    color = X_DARK.accent
  } else if (tone === 'solidAccent') {
    backgroundColor = X_DARK.accent
    borderColor = X_DARK.accent
    color = '#FFFFFF'
  } else if (tone === 'success') {
    backgroundColor = X_DARK.successSubtle
    borderColor = X_DARK.success
    color = X_DARK.success
  } else if (tone === 'danger') {
    backgroundColor = X_DARK.dangerSubtle
    borderColor = X_DARK.danger
    color = X_DARK.danger
  } else if (tone === 'solidDanger') {
    backgroundColor = X_DARK.danger
    borderColor = X_DARK.danger
    color = '#FFFFFF'
  }

  return (
    <View
      style={[
        a.px_xs,
        a.rounded_full,
        {
          paddingVertical: 2,
          backgroundColor,
          borderWidth: 1,
          borderColor,
        },
      ]}>
      <Text
        style={[
          a.font_bold,
          {fontSize: 10, lineHeight: 14, letterSpacing: 0.4, color},
        ]}>
        {label}
      </Text>
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  tone = 'neutral',
  disabled = false,
  testID,
  icon,
}: {
  label: string
  onPress: () => void
  tone?: 'neutral' | 'primary' | 'accent' | 'success' | 'danger'
  disabled?: boolean
  testID?: string
  icon?: React.ReactNode
}) {
  let backgroundColor: string = X_DARK.surface
  let borderColor: string = X_DARK.border
  let textColor: string = X_DARK.text

  if (tone === 'primary') {
    backgroundColor = X_DARK.ctaBg
    borderColor = X_DARK.ctaBg
    textColor = X_DARK.ctaText
  } else if (tone === 'accent') {
    backgroundColor = X_DARK.accentSubtle
    borderColor = X_DARK.accent
    textColor = X_DARK.accent
  } else if (tone === 'success') {
    backgroundColor = X_DARK.successSubtle
    borderColor = X_DARK.success
    textColor = X_DARK.success
  } else if (tone === 'danger') {
    backgroundColor = X_DARK.dangerSubtle
    borderColor = X_DARK.danger
    textColor = X_DARK.danger
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_2xs,
        a.px_sm,
        a.rounded_full,
        {
          paddingVertical: 6,
          backgroundColor,
          borderWidth: 1,
          borderColor,
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      {icon}
      <Text style={[a.text_xs, a.font_bold, {color: textColor}]}>{label}</Text>
    </Pressable>
  )
}

function FilterBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{value: T; label: string}>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            onPress={() => onChange(opt.value)}
            style={[
              a.px_md,
              a.py_xs,
              a.rounded_full,
              {
                backgroundColor: active ? X_DARK.ctaBg : X_DARK.card,
                borderWidth: 1,
                borderColor: active ? X_DARK.ctaBg : X_DARK.border,
              },
            ]}>
            <Text
              style={[
                a.text_xs,
                a.font_bold,
                {color: active ? X_DARK.ctaText : X_DARK.text},
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function DailyActivityChart({
  signupsByDay,
  postsByDay,
}: {
  signupsByDay: AdminDailyPoint[]
  postsByDay: AdminDailyPoint[]
}) {
  const days = useMemo(() => {
    const map = new Map<string, {date: string; signups: number; posts: number}>()
    for (const pt of signupsByDay) {
      map.set(pt.date, {
        date: pt.date,
        signups: Number(pt.count ?? 0),
        posts: 0,
      })
    }
    for (const pt of postsByDay) {
      const existing = map.get(pt.date)
      if (existing) {
        existing.posts = Number(pt.count ?? 0)
      } else {
        map.set(pt.date, {
          date: pt.date,
          signups: 0,
          posts: Number(pt.count ?? 0),
        })
      }
    }
    return Array.from(map.values())
      .sort((x, y) => x.date.localeCompare(y.date))
      .slice(-14)
  }, [signupsByDay, postsByDay])

  const maxCount = useMemo(() => {
    let max = 1
    for (const d of days) {
      if (d.signups > max) max = d.signups
      if (d.posts > max) max = d.posts
    }
    return max
  }, [days])

  const totalSignups = useMemo(
    () => days.reduce((acc, d) => acc + d.signups, 0),
    [days],
  )
  const totalPosts = useMemo(
    () => days.reduce((acc, d) => acc + d.posts, 0),
    [days],
  )

  return (
    <View
      style={[
        a.p_md,
        a.rounded_lg,
        a.gap_md,
        {
          backgroundColor: X_DARK.card,
          borderWidth: 1,
          borderColor: X_DARK.border,
        },
      ]}>
      <View
        style={[
          a.flex_row,
          a.flex_wrap,
          a.align_center,
          a.justify_between,
          a.gap_sm,
        ]}>
        <View>
          <Text style={[a.text_md, a.font_bold, {color: X_DARK.text}]}>
            14-Day Network Activity
          </Text>
          <Text style={[a.text_xs, {color: X_DARK.muted}]}>
            Daily account signups vs Zings published
          </Text>
        </View>
        <View style={[a.flex_row, a.align_center, a.gap_md]}>
          <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: X_DARK.success,
              }}
            />
            <Text style={[a.text_xs, a.font_semi_bold, {color: X_DARK.text}]}>
              Signups ({formatCompact(totalSignups)})
            </Text>
          </View>
          <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: X_DARK.accent,
              }}
            />
            <Text style={[a.text_xs, a.font_semi_bold, {color: X_DARK.text}]}>
              Zings ({formatCompact(totalPosts)})
            </Text>
          </View>
        </View>
      </View>

      {days.length === 0 ? (
        <View style={[a.py_lg, a.align_center]}>
          <Text style={[a.text_sm, {color: X_DARK.muted}]}>
            No activity series data available yet.
          </Text>
        </View>
      ) : (
        <View
          style={[
            a.flex_row,
            a.align_end,
            a.gap_2xs,
            {
              height: 148,
              paddingTop: 18,
              borderBottomWidth: 1,
              borderBottomColor: X_DARK.border,
              paddingBottom: 6,
            },
          ]}>
          {days.map(day => {
            const signupHeight =
              day.signups > 0
                ? Math.max(6, Math.round((day.signups / maxCount) * 92))
                : 3
            const postHeight =
              day.posts > 0
                ? Math.max(6, Math.round((day.posts / maxCount) * 92))
                : 3
            return (
              <View
                key={day.date}
                style={[a.flex_1, a.align_center, a.justify_end, a.gap_2xs]}>
                <Text
                  numberOfLines={1}
                  style={{fontSize: 9, color: X_DARK.muted}}>
                  {day.posts + day.signups > 0 ? day.posts + day.signups : ''}
                </Text>
                <View
                  style={[
                    a.flex_row,
                    a.align_end,
                    {gap: 2, width: '100%', justifyContent: 'center'},
                  ]}>
                  <View
                    style={{
                      width: '38%',
                      maxWidth: 14,
                      height: signupHeight,
                      borderRadius: 3,
                      backgroundColor:
                        day.signups > 0 ? X_DARK.success : X_DARK.surface,
                    }}
                  />
                  <View
                    style={{
                      width: '38%',
                      maxWidth: 14,
                      height: postHeight,
                      borderRadius: 3,
                      backgroundColor:
                        day.posts > 0 ? X_DARK.accent : X_DARK.surface,
                    }}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{fontSize: 9, color: X_DARK.muted}}>
                  {formatShortDay(day.date)}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

export function AdminConsoleScreen() {
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const accessJwt = currentAccount?.accessJwt

  const [meLoading, setMeLoading] = useState(true)
  const [me, setMe] = useState<AdminMeResponse | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [refreshing, setRefreshing] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Overview + Backups
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [backups, setBackups] = useState<AdminBackupItem[]>([])
  const [creatingBackup, setCreatingBackup] = useState(false)

  // Reports
  const [reportFilter, setReportFilter] = useState<ReportStatusFilter>('open')
  const [reports, setReports] = useState<AdminReportItem[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({})

  // Users
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userActionReason, setUserActionReason] = useState('')

  // Posts
  const [postFilter, setPostFilter] = useState<PostFilter>('all')
  const [postSearch, setPostSearch] = useState('')
  const [debouncedPostSearch, setDebouncedPostSearch] = useState('')
  const [posts, setPosts] = useState<AdminPostItem[]>([])
  const [postsLoading, setPostsLoading] = useState(false)

  // Appeals
  const [appealFilter, setAppealFilter] = useState<AppealStatusFilter>('open')
  const [appeals, setAppeals] = useState<AdminAppealItem[]>([])
  const [appealsLoading, setAppealsLoading] = useState(false)
  const [appealNotes, setAppealNotes] = useState<Record<string, string>>({})

  // Audit Log
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Debounce user search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserSearch(userSearch), 250)
    return () => clearTimeout(t)
  }, [userSearch])

  // Debounce post search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPostSearch(postSearch), 250)
    return () => clearTimeout(t)
  }, [postSearch])

  // Staff role verification on mount / session change
  useEffect(() => {
    let active = true
    setMeLoading(true)
    setErrorBanner(null)
    void fetchAdminMe(accessJwt).then(res => {
      if (!active) return
      setMe(res)
      setMeLoading(false)
    })
    return () => {
      active = false
    }
  }, [accessJwt])

  const loadOverviewAndBackups = useCallback(async () => {
    if (!accessJwt) return
    try {
      const [ovRes, bkRes] = await Promise.all([
        fetchAdminOverview(accessJwt),
        fetchAdminBackups(accessJwt).catch(() => ({ok: false, backups: []})),
      ])
      if (!mountedRef.current) return
      setOverview(ovRes)
      setBackups(Array.isArray(bkRes.backups) ? bkRes.backups : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load overview metrics',
      )
    }
  }, [accessJwt])

  const loadReports = useCallback(async () => {
    if (!accessJwt) return
    setReportsLoading(true)
    try {
      const res = await fetchAdminReports(accessJwt, reportFilter)
      if (!mountedRef.current) return
      setReports(Array.isArray(res.reports) ? res.reports : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load reports',
      )
    } finally {
      if (mountedRef.current) setReportsLoading(false)
    }
  }, [accessJwt, reportFilter])

  const loadUsers = useCallback(async () => {
    if (!accessJwt) return
    setUsersLoading(true)
    try {
      const res = await fetchAdminUsers(accessJwt, {
        q: debouncedUserSearch,
        filter: userFilter,
      })
      if (!mountedRef.current) return
      setUsers(Array.isArray(res.users) ? res.users : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load accounts',
      )
    } finally {
      if (mountedRef.current) setUsersLoading(false)
    }
  }, [accessJwt, debouncedUserSearch, userFilter])

  const loadPosts = useCallback(async () => {
    if (!accessJwt) return
    setPostsLoading(true)
    try {
      const res = await fetchAdminPosts(accessJwt, {
        q: debouncedPostSearch,
        filter: postFilter,
      })
      if (!mountedRef.current) return
      setPosts(Array.isArray(res.posts) ? res.posts : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load posts',
      )
    } finally {
      if (mountedRef.current) setPostsLoading(false)
    }
  }, [accessJwt, debouncedPostSearch, postFilter])

  const loadAppeals = useCallback(async () => {
    if (!accessJwt) return
    setAppealsLoading(true)
    try {
      const res = await fetchAdminAppeals(accessJwt, appealFilter)
      if (!mountedRef.current) return
      setAppeals(Array.isArray(res.appeals) ? res.appeals : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load appeals',
      )
    } finally {
      if (mountedRef.current) setAppealsLoading(false)
    }
  }, [accessJwt, appealFilter])

  const loadAudit = useCallback(async () => {
    if (!accessJwt) return
    setAuditLoading(true)
    try {
      const res = await fetchAdminAudit(accessJwt, 100)
      if (!mountedRef.current) return
      setAuditEntries(Array.isArray(res.entries) ? res.entries : [])
      setErrorBanner(null)
    } catch (err) {
      if (!mountedRef.current) return
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to load audit log',
      )
    } finally {
      if (mountedRef.current) setAuditLoading(false)
    }
  }, [accessJwt])

  // Always hydrate overview once staff verified (keeps tab badges live too)
  useEffect(() => {
    if (me?.isStaff && accessJwt) {
      void loadOverviewAndBackups()
    }
  }, [me?.isStaff, accessJwt, loadOverviewAndBackups])

  // Load tab-specific live data on tab or filter change
  useEffect(() => {
    if (!me?.isStaff || !accessJwt) return
    if (activeTab === 'overview') {
      void loadOverviewAndBackups()
    } else if (activeTab === 'reports') {
      void loadReports()
    } else if (activeTab === 'users') {
      void loadUsers()
    } else if (activeTab === 'posts') {
      void loadPosts()
    } else if (activeTab === 'appeals') {
      void loadAppeals()
    } else if (activeTab === 'audit') {
      void loadAudit()
    }
  }, [
    me?.isStaff,
    accessJwt,
    activeTab,
    loadOverviewAndBackups,
    loadReports,
    loadUsers,
    loadPosts,
    loadAppeals,
    loadAudit,
  ])

  const handleRefreshAll = useCallback(async () => {
    if (!me?.isStaff || !accessJwt) return
    setRefreshing(true)
    try {
      const tasks: Array<Promise<void>> = [loadOverviewAndBackups()]
      if (activeTab === 'reports') tasks.push(loadReports())
      if (activeTab === 'users') tasks.push(loadUsers())
      if (activeTab === 'posts') tasks.push(loadPosts())
      if (activeTab === 'appeals') tasks.push(loadAppeals())
      if (activeTab === 'audit') tasks.push(loadAudit())
      await Promise.all(tasks)
    } finally {
      if (mountedRef.current) setRefreshing(false)
    }
  }, [
    me?.isStaff,
    accessJwt,
    activeTab,
    loadOverviewAndBackups,
    loadReports,
    loadUsers,
    loadPosts,
    loadAppeals,
    loadAudit,
  ])

  const handleCreateBackup = useCallback(async () => {
    if (!accessJwt || me?.role !== 'admin' || creatingBackup) return
    setCreatingBackup(true)
    try {
      const res = await createAdminBackup(accessJwt)
      Toast.show(`Snapshot created: ${res.backup?.filename || 'db.json'}`, {
        type: 'success',
      })
      await loadOverviewAndBackups()
    } catch (err) {
      Toast.show(
        err instanceof Error ? err.message : 'Failed to create snapshot backup',
        {type: 'error'},
      )
    } finally {
      if (mountedRef.current) setCreatingBackup(false)
    }
  }, [accessJwt, me?.role, creatingBackup, loadOverviewAndBackups])

  const handleResolveReport = useCallback(
    async (
      reportId: string,
      action: ReportResolveAction,
      extra?: {labelVal?: string; suspendHours?: number},
    ) => {
      if (!accessJwt) return
      const key = `report:${reportId}`
      setBusyKey(key)
      try {
        const note = reportNotes[reportId]?.trim() || undefined
        await resolveAdminReport(accessJwt, reportId, {
          action,
          note,
          labelVal: extra?.labelVal,
          suspendHours: extra?.suspendHours,
        })
        Toast.show(`Report ${action.replace(/_/g, ' ')} applied`, {
          type: 'success',
        })
        setReportNotes(prev => {
          const next = {...prev}
          delete next[reportId]
          return next
        })
        await Promise.all([loadReports(), loadOverviewAndBackups()])
      } catch (err) {
        Toast.show(
          err instanceof Error ? err.message : 'Failed to resolve report',
          {type: 'error'},
        )
      } finally {
        if (mountedRef.current) setBusyKey(null)
      }
    },
    [accessJwt, reportNotes, loadReports, loadOverviewAndBackups],
  )

  const handleUserAction = useCallback(
    async (
      user: AdminUserItem,
      action: UserModerationAction,
      extra?: {suspendHours?: number; role?: 'user' | 'moderator' | 'admin'},
    ) => {
      if (!accessJwt) return
      const key = `user:${user.did}`
      setBusyKey(key)
      try {
        const reason = userActionReason.trim() || undefined
        await performAdminUserAction(accessJwt, user.did, {
          action,
          reason,
          suspendHours: extra?.suspendHours,
          role: extra?.role,
        })
        Toast.show(
          `Updated @${user.handle} (${extra?.role ? `role: ${extra.role}` : action})`,
          {type: 'success'},
        )
        await Promise.all([loadUsers(), loadOverviewAndBackups()])
      } catch (err) {
        Toast.show(
          err instanceof Error ? err.message : 'Failed to update account',
          {type: 'error'},
        )
      } finally {
        if (mountedRef.current) setBusyKey(null)
      }
    },
    [accessJwt, userActionReason, loadUsers, loadOverviewAndBackups],
  )

  const handlePostAction = useCallback(
    async (
      post: AdminPostItem,
      action: PostModerationAction,
      extra?: {labelVal?: string; reason?: string},
    ) => {
      if (!accessJwt) return
      const key = `post:${post.uri}`
      setBusyKey(key)
      try {
        await performAdminPostAction(accessJwt, {
          uri: post.uri,
          action,
          labelVal: extra?.labelVal,
          reason: extra?.reason,
        })
        Toast.show(`Post ${action} completed`, {type: 'success'})
        await Promise.all([loadPosts(), loadOverviewAndBackups()])
      } catch (err) {
        Toast.show(
          err instanceof Error ? err.message : 'Failed to moderate post',
          {type: 'error'},
        )
      } finally {
        if (mountedRef.current) setBusyKey(null)
      }
    },
    [accessJwt, loadPosts, loadOverviewAndBackups],
  )

  const handleResolveAppeal = useCallback(
    async (appealId: string, decision: 'approve' | 'reject') => {
      if (!accessJwt) return
      const key = `appeal:${appealId}`
      setBusyKey(key)
      try {
        const note = appealNotes[appealId]?.trim() || undefined
        await resolveAdminAppeal(accessJwt, appealId, {decision, note})
        Toast.show(
          decision === 'approve'
            ? 'Appeal approved and restored'
            : 'Appeal rejected',
          {type: 'success'},
        )
        setAppealNotes(prev => {
          const next = {...prev}
          delete next[appealId]
          return next
        })
        await Promise.all([loadAppeals(), loadOverviewAndBackups()])
      } catch (err) {
        Toast.show(
          err instanceof Error ? err.message : 'Failed to resolve appeal',
          {type: 'error'},
        )
      } finally {
        if (mountedRef.current) setBusyKey(null)
      }
    },
    [accessJwt, appealNotes, loadAppeals, loadOverviewAndBackups],
  )

  const handleGoHome = useCallback(() => {
    try {
      navigation.dispatch(CommonActions.navigate({name: 'Home'}))
    } catch {
      // Ignore if Home is already mounted
    }
  }, [navigation])

  const isAdmin = me?.role === 'admin'
  const openReportsCount = overview?.metrics.openReports ?? 0
  const openAppealsCount = overview?.metrics.openAppeals ?? 0

  const tabs: Array<{
    id: AdminTab
    label: string
    testID: string
    badge?: number
    icon: React.ReactNode
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      testID: 'adminTabOverview',
      icon: (
        <OverviewIcon
          size="xs"
          fill={activeTab === 'overview' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
    {
      id: 'reports',
      label: 'Reports',
      testID: 'adminTabReports',
      badge: openReportsCount > 0 ? openReportsCount : undefined,
      icon: (
        <FlagIcon
          size="xs"
          fill={activeTab === 'reports' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
    {
      id: 'users',
      label: 'Users',
      testID: 'adminTabUsers',
      icon: (
        <UsersGroupIcon
          size="xs"
          fill={activeTab === 'users' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
    {
      id: 'posts',
      label: 'Posts',
      testID: 'adminTabPosts',
      icon: (
        <PostDocIcon
          size="xs"
          fill={activeTab === 'posts' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
    {
      id: 'appeals',
      label: 'Appeals',
      testID: 'adminTabAppeals',
      badge: openAppealsCount > 0 ? openAppealsCount : undefined,
      icon: (
        <AppealsIcon
          size="xs"
          fill={activeTab === 'appeals' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
    {
      id: 'audit',
      label: 'Audit Log',
      testID: 'adminTabAudit',
      icon: (
        <ClockIcon
          size="xs"
          fill={activeTab === 'audit' ? X_DARK.ctaText : X_DARK.muted}
        />
      ),
    },
  ]

  // Loading state while verifying staff credentials
  if (meLoading) {
    return (
      <Layout.Screen
        testID="adminConsoleScreen"
        style={{backgroundColor: X_DARK.bg}}>
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldCheckIcon size="md" fill={X_DARK.accent} />
              <Layout.Header.TitleText style={{color: X_DARK.text}}>
                QuantZing Admin
              </Layout.Header.TitleText>
            </View>
          </Layout.Header.Content>
        </Layout.Header.Outer>
        <Layout.Content
          style={{backgroundColor: X_DARK.bg}}
          contentContainerStyle={[
            a.p_xl,
            a.align_center,
            a.justify_center,
            a.gap_md,
            {minHeight: 320},
          ]}>
          <ActivityIndicator size="small" color={X_DARK.accent} />
          <Text style={[a.text_sm, {color: X_DARK.muted}]}>
            Verifying staff credentials...
          </Text>
        </Layout.Content>
      </Layout.Screen>
    )
  }

  // Non-staff / logged-out clean restricted view (ZERO sensitive controls rendered)
  if (!me?.isStaff) {
    return (
      <Layout.Screen
        testID="adminConsoleScreen"
        style={{backgroundColor: X_DARK.bg}}>
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <View style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldIcon size="md" fill={X_DARK.muted} />
              <Layout.Header.TitleText style={{color: X_DARK.text}}>
                QuantZing Admin
              </Layout.Header.TitleText>
            </View>
          </Layout.Header.Content>
        </Layout.Header.Outer>
        <Layout.Content
          style={{backgroundColor: X_DARK.bg}}
          contentContainerStyle={[a.p_lg, a.align_center, {paddingTop: 56}]}>
          <View
            testID="adminRestrictedNotice"
            style={[
              a.p_xl,
              a.rounded_lg,
              a.align_center,
              a.gap_md,
              {
                width: '100%',
                maxWidth: 460,
                backgroundColor: X_DARK.card,
                borderWidth: 1,
                borderColor: X_DARK.border,
              },
            ]}>
            <View
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 52,
                  height: 52,
                  backgroundColor: X_DARK.dangerSubtle,
                  borderWidth: 1,
                  borderColor: X_DARK.danger,
                },
              ]}>
              <LockIcon size="lg" fill={X_DARK.danger} />
            </View>
            <Text
              style={[
                a.text_xl,
                a.font_bold,
                a.text_center,
                {color: X_DARK.text},
              ]}>
              Admin access required
            </Text>
            <Text
              style={[
                a.text_sm,
                a.text_center,
                a.leading_snug,
                {color: X_DARK.muted},
              ]}>
              This console is restricted to authorized QuantZing Trust & Safety
              staff.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleGoHome}
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                a.mt_xs,
                {backgroundColor: X_DARK.ctaBg},
              ]}>
              <Text style={[a.text_sm, a.font_bold, {color: X_DARK.ctaText}]}>
                Return Home
              </Text>
            </Pressable>
          </View>
        </Layout.Content>
      </Layout.Screen>
    )
  }

  const metrics = overview?.metrics
  const rateLimit = overview?.rateLimit
  const sys = overview?.system
  const topBlockedBucket = rateLimit?.blockedByBucket
    ? Object.entries(rateLimit.blockedByBucket).sort((x, y) => y[1] - x[1])[0]
    : undefined

  return (
    <Layout.Screen
      testID="adminConsoleScreen"
      style={{backgroundColor: X_DARK.bg}}>
      {/* Flagship X-Dark Header */}
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
            <ShieldCheckIcon size="md" fill={X_DARK.accent} />
            <Layout.Header.TitleText style={{color: X_DARK.text}}>
              QuantZing Admin
            </Layout.Header.TitleText>
            <BadgePill
              label={me.role === 'admin' ? 'ADMIN' : 'MODERATOR'}
              tone={me.role === 'admin' ? 'solidAccent' : 'accent'}
            />
          </View>
          <Layout.Header.SubtitleText>
            Trust & Safety Console{me.handle ? ` · @${me.handle}` : ''}
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Pressable
          testID="adminRefreshBtn"
          accessibilityRole="button"
          accessibilityLabel="Refresh admin console"
          disabled={refreshing}
          onPress={() => void handleRefreshAll()}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_2xs,
            a.px_sm,
            a.py_xs,
            a.rounded_full,
            {
              backgroundColor: X_DARK.card,
              borderWidth: 1,
              borderColor: X_DARK.border,
              opacity: refreshing ? 0.6 : 1,
            },
          ]}>
          <RefreshIcon size="xs" fill={X_DARK.accent} />
          <Text style={[a.text_xs, a.font_semi_bold, {color: X_DARK.accent}]}>
            {refreshing ? 'Syncing...' : 'Refresh'}
          </Text>
        </Pressable>
      </Layout.Header.Outer>

      {/* Horizontal 6-Tab Navigation Strip */}
      <Layout.Center>
        <View
          style={{
            backgroundColor: X_DARK.bg,
            borderBottomWidth: 1,
            borderBottomColor: X_DARK.border,
          }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[a.px_md, a.py_sm, a.gap_xs]}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <Pressable
                  key={tab.id}
                  testID={tab.testID}
                  accessibilityRole="tab"
                  accessibilityState={{selected: isActive}}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      backgroundColor: isActive ? X_DARK.ctaBg : X_DARK.card,
                      borderWidth: 1,
                      borderColor: isActive ? X_DARK.ctaBg : X_DARK.border,
                    },
                  ]}>
                  {tab.icon}
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {color: isActive ? X_DARK.ctaText : X_DARK.text},
                    ]}>
                    {tab.label}
                  </Text>
                  {tab.badge !== undefined && (
                    <View
                      style={[
                        a.px_xs,
                        a.rounded_full,
                        {
                          minWidth: 18,
                          paddingVertical: 1,
                          alignItems: 'center',
                          backgroundColor: X_DARK.danger,
                        },
                      ]}>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: '#FFFFFF',
                        }}>
                        {tab.badge}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </Layout.Center>

      <Layout.Content
        style={{backgroundColor: X_DARK.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {/* Live Error Banner */}
        {errorBanner && (
          <View
            style={[
              a.p_md,
              a.rounded_lg,
              a.flex_row,
              a.align_center,
              a.justify_between,
              a.gap_sm,
              {
                backgroundColor: X_DARK.dangerSubtle,
                borderWidth: 1,
                borderColor: X_DARK.danger,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
              <WarningIcon size="sm" fill={X_DARK.danger} />
              <Text style={[a.text_xs, a.flex_1, {color: X_DARK.text}]}>
                {errorBanner}
              </Text>
            </View>
            <ActionButton
              label="Retry"
              tone="danger"
              onPress={() => void handleRefreshAll()}
            />
          </View>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <View style={[a.gap_md]}>
            {!overview ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_sm,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_sm, {color: X_DARK.muted}]}>
                  Loading live telemetry...
                </Text>
              </View>
            ) : (
              <>
                {/* 8 Live KPI Cards */}
                <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
                  {[
                    {
                      label: 'Users',
                      value: formatCompact(metrics?.totalUsers),
                      sub: `${formatCompact(metrics?.activeUsers)} active · ${formatCompact(metrics?.verifiedUsers)} verified · ${formatCompact(metrics?.staffUsers)} staff`,
                      icon: <UsersGroupIcon size="sm" fill={X_DARK.accent} />,
                      accentColor: X_DARK.text,
                    },
                    {
                      label: 'Active Zings',
                      value: formatCompact(metrics?.totalPosts),
                      sub: `${formatCompact(metrics?.totalReplies)} replies · ${formatCompact(metrics?.totalLikes)} likes · ${formatCompact(metrics?.totalReposts)} rezings`,
                      icon: <PostDocIcon size="sm" fill={X_DARK.accent} />,
                      accentColor: X_DARK.text,
                    },
                    {
                      label: 'Media Storage',
                      value: formatBytes(metrics?.totalBlobBytes),
                      sub: `${formatCompact(metrics?.totalBlobs)} blobs · DB ${formatBytes(sys?.dbSizeBytes)}`,
                      icon: <BackupIcon size="sm" fill={X_DARK.success} />,
                      accentColor: X_DARK.text,
                    },
                    {
                      label: 'Open Reports',
                      value: formatCompact(metrics?.openReports),
                      sub: `${formatCompact(metrics?.totalReports)} total · ${formatCompact(metrics?.takenDownPosts)} removed · ${formatCompact(metrics?.activeLabels)} labels`,
                      icon: (
                        <FlagIcon
                          size="sm"
                          fill={
                            (metrics?.openReports ?? 0) > 0
                              ? X_DARK.danger
                              : X_DARK.success
                          }
                        />
                      ),
                      accentColor:
                        (metrics?.openReports ?? 0) > 0
                          ? X_DARK.danger
                          : X_DARK.success,
                    },
                    {
                      label: 'Open Appeals',
                      value: formatCompact(metrics?.openAppeals),
                      sub: 'Pending moderation review',
                      icon: (
                        <AppealsIcon
                          size="sm"
                          fill={
                            (metrics?.openAppeals ?? 0) > 0
                              ? X_DARK.accent
                              : X_DARK.success
                          }
                        />
                      ),
                      accentColor:
                        (metrics?.openAppeals ?? 0) > 0
                          ? X_DARK.accent
                          : X_DARK.success,
                    },
                    {
                      label: 'Suspended / Banned',
                      value: formatCompact(
                        (metrics?.suspendedUsers ?? 0) +
                          (metrics?.bannedUsers ?? 0),
                      ),
                      sub: `${formatCompact(metrics?.suspendedUsers)} suspended · ${formatCompact(metrics?.bannedUsers)} banned`,
                      icon: <BanIcon size="sm" fill={X_DARK.danger} />,
                      accentColor:
                        (metrics?.suspendedUsers ?? 0) +
                          (metrics?.bannedUsers ?? 0) >
                        0
                          ? X_DARK.danger
                          : X_DARK.text,
                    },
                    {
                      label: 'Rate-Limit Blocks',
                      value: formatCompact(rateLimit?.totalBlocked),
                      sub: topBlockedBucket
                        ? `${formatCompact(rateLimit?.totalChecks)} checks · top: ${topBlockedBucket[0]} (${topBlockedBucket[1]})`
                        : `${formatCompact(rateLimit?.totalChecks)} checks enforced`,
                      icon: <ShieldIcon size="sm" fill={X_DARK.accent} />,
                      accentColor: X_DARK.text,
                    },
                    {
                      label: 'Server Uptime & RAM',
                      value: formatUptime(sys?.uptimeSec),
                      sub: `${Math.round(sys?.memoryMb ?? 0)} MB RAM · ${sys?.nodeVersion || 'node'} · ${formatCompact(metrics?.totalMessages)} DMs`,
                      icon: <ClockIcon size="sm" fill={X_DARK.success} />,
                      accentColor: X_DARK.success,
                    },
                  ].map(card => (
                    <View
                      key={card.label}
                      style={[
                        a.p_md,
                        a.rounded_lg,
                        a.gap_xs,
                        {
                          flexGrow: 1,
                          flexBasis: '46%',
                          minWidth: 160,
                          backgroundColor: X_DARK.card,
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                        },
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                          a.gap_xs,
                        ]}>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {card.label}
                        </Text>
                        {card.icon}
                      </View>
                      <Text
                        style={[
                          a.text_2xl,
                          a.font_bold,
                          {color: card.accentColor},
                        ]}>
                        {card.value}
                      </Text>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        {card.sub}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* 14-Day Native View-Based Signups & Zings Vertical Bar Chart */}
                <DailyActivityChart
                  signupsByDay={overview.series?.signupsByDay ?? []}
                  postsByDay={overview.series?.postsByDay ?? []}
                />

                {/* Rate-Limit Buckets Breakdown (if any blocked) */}
                {rateLimit?.blockedByBucket &&
                  Object.keys(rateLimit.blockedByBucket).length > 0 && (
                    <View
                      style={[
                        a.p_md,
                        a.rounded_lg,
                        a.gap_sm,
                        {
                          backgroundColor: X_DARK.card,
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                        },
                      ]}>
                      <Text
                        style={[a.text_md, a.font_bold, {color: X_DARK.text}]}>
                        Rate-Limit Telemetry
                      </Text>
                      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                        {Object.entries(rateLimit.blockedByBucket).map(
                          ([bucket, count]) => (
                            <View
                              key={bucket}
                              style={[
                                a.px_sm,
                                a.py_xs,
                                a.rounded_md,
                                a.flex_row,
                                a.align_center,
                                a.gap_xs,
                                {
                                  backgroundColor: X_DARK.surface,
                                  borderWidth: 1,
                                  borderColor: X_DARK.border,
                                },
                              ]}>
                              <Text
                                style={[a.text_xs, {color: X_DARK.muted}]}>
                                {bucket}
                              </Text>
                              <Text
                                style={[
                                  a.text_xs,
                                  a.font_bold,
                                  {color: X_DARK.danger},
                                ]}>
                                {count}
                              </Text>
                            </View>
                          ),
                        )}
                      </View>
                    </View>
                  )}

                {/* Database Snapshots Card */}
                <View
                  style={[
                    a.p_md,
                    a.rounded_lg,
                    a.gap_md,
                    {
                      backgroundColor: X_DARK.card,
                      borderWidth: 1,
                      borderColor: X_DARK.border,
                    },
                  ]}>
                  <View
                    style={[
                      a.flex_row,
                      a.flex_wrap,
                      a.align_center,
                      a.justify_between,
                      a.gap_sm,
                    ]}>
                    <View
                      style={[a.flex_row, a.align_center, a.gap_sm, a.flex_1]}>
                      <BackupIcon size="md" fill={X_DARK.accent} />
                      <View style={[a.flex_1]}>
                        <Text
                          style={[
                            a.text_md,
                            a.font_bold,
                            {color: X_DARK.text},
                          ]}>
                          Database Snapshots
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[a.text_xs, {color: X_DARK.muted}]}>
                          DB {formatBytes(sys?.dbSizeBytes)}
                          {sys?.dataDir ? ` · ${sys.dataDir}` : ''}
                        </Text>
                      </View>
                    </View>
                    <ActionButton
                      testID="adminCreateBackupBtn"
                      label={
                        creatingBackup
                          ? 'Creating Snapshot...'
                          : isAdmin
                            ? 'Create Snapshot Backup'
                            : 'Admin Only'
                      }
                      tone="primary"
                      disabled={!isAdmin || creatingBackup}
                      onPress={() => void handleCreateBackup()}
                      icon={
                        <BackupIcon
                          size="xs"
                          fill={isAdmin ? X_DARK.ctaText : X_DARK.muted}
                        />
                      }
                    />
                  </View>

                  {backups.length === 0 ? (
                    <View
                      style={[
                        a.p_md,
                        a.rounded_md,
                        a.align_center,
                        {
                          backgroundColor: X_DARK.surface,
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                        },
                      ]}>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        No snapshot backups created yet.
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        a.rounded_md,
                        a.overflow_hidden,
                        {
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                          backgroundColor: X_DARK.surface,
                        },
                      ]}>
                      {backups.map((bk, idx) => (
                        <View
                          key={bk.filename}
                          style={[
                            a.p_sm,
                            a.flex_row,
                            a.align_center,
                            a.justify_between,
                            a.gap_sm,
                            idx > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: X_DARK.border,
                            },
                          ]}>
                          <View style={[a.flex_1]}>
                            <Text
                              numberOfLines={1}
                              style={[
                                a.text_xs,
                                a.font_semi_bold,
                                {color: X_DARK.text},
                              ]}>
                              {bk.filename}
                            </Text>
                            <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                              {formatDateTime(bk.createdAt)}
                            </Text>
                          </View>
                          <BadgePill
                            label={formatBytes(bk.sizeBytes)}
                            tone="accent"
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* TAB 2: REPORTS */}
        {activeTab === 'reports' && (
          <View style={[a.gap_md]}>
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <FilterBar<ReportStatusFilter>
                value={reportFilter}
                onChange={setReportFilter}
                options={[
                  {value: 'open', label: 'Open'},
                  {value: 'resolved', label: 'Resolved'},
                  {value: 'dismissed', label: 'Dismissed'},
                  {value: 'all', label: 'All'},
                ]}
              />
              <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                {reports.length} report{reports.length === 1 ? '' : 's'}
              </Text>
            </View>

            {reportsLoading ? (
              <View style={[a.p_xl, a.align_center, a.gap_sm]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  Loading reports queue...
                </Text>
              </View>
            ) : reports.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_xs,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <CircleCheckIcon size="lg" fill={X_DARK.success} />
                <Text style={[a.text_md, a.font_bold, {color: X_DARK.text}]}>
                  Queue clear
                </Text>
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  No {reportFilter === 'all' ? '' : `${reportFilter} `}reports
                  found.
                </Text>
              </View>
            ) : (
              reports.map(rep => {
                const isBusy = busyKey === `report:${rep.id}`
                const subjectUri =
                  rep.subjectPost?.uri ||
                  rep.post?.uri ||
                  rep.subjectUri ||
                  rep.subject?.uri ||
                  null
                const subjectText =
                  rep.subjectPost?.text ||
                  rep.post?.text ||
                  rep.subjectText ||
                  null
                const subjectAcc = rep.subjectAccount || rep.account || null
                const targetHandle =
                  rep.subjectPost?.authorHandle ||
                  rep.post?.authorHandle ||
                  subjectAcc?.handle ||
                  rep.targetHandle ||
                  rep.subjectHandle ||
                  null
                const targetDid =
                  rep.subjectPost?.authorDid ||
                  rep.post?.authorDid ||
                  subjectAcc?.did ||
                  rep.targetDid ||
                  rep.subjectDid ||
                  rep.subject?.did ||
                  null
                const reporterLabel =
                  rep.reporter?.handle ||
                  rep.reporterHandle ||
                  rep.reporter?.did ||
                  rep.reporterDid ||
                  'anonymous'
                const statusTone =
                  rep.status === 'open'
                    ? 'danger'
                    : rep.status === 'resolved'
                      ? 'success'
                      : 'neutral'

                return (
                  <View
                    key={rep.id}
                    style={[
                      a.p_md,
                      a.rounded_lg,
                      a.gap_sm,
                      {
                        backgroundColor: X_DARK.card,
                        borderWidth: 1,
                        borderColor: X_DARK.border,
                      },
                    ]}>
                    {/* Top Meta Row */}
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_xs,
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.gap_xs,
                        ]}>
                        <BadgePill
                          label={String(rep.status || 'open').toUpperCase()}
                          tone={statusTone}
                        />
                        <BadgePill
                          label={rep.reasonType || 'report'}
                          tone="accent"
                        />
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          #{rep.id}
                        </Text>
                      </View>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        {formatDateTime(rep.createdAt)}
                      </Text>
                    </View>

                    {/* Reporter & Reason */}
                    <View style={[a.gap_2xs]}>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        Reported by{' '}
                        <Text style={[a.font_semi_bold, {color: X_DARK.text}]}>
                          @{reporterLabel}
                        </Text>
                      </Text>
                      {Boolean(rep.reason?.trim()) && (
                        <Text style={[a.text_sm, {color: X_DARK.text}]}>
                          {rep.reason}
                        </Text>
                      )}
                    </View>

                    {/* Reported Post or Account Preview */}
                    <View
                      style={[
                        a.p_sm,
                        a.rounded_md,
                        a.gap_2xs,
                        {
                          backgroundColor: X_DARK.surface,
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                        },
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.justify_between,
                          a.gap_xs,
                        ]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_bold,
                            {color: X_DARK.accent},
                          ]}>
                          {subjectUri ? 'Reported Zing' : 'Reported Account'}
                          {targetHandle ? ` · @${targetHandle}` : ''}
                        </Text>
                        {subjectAcc?.status && (
                          <BadgePill
                            label={subjectAcc.status.toUpperCase()}
                            tone={
                              subjectAcc.status === 'active'
                                ? 'success'
                                : 'danger'
                            }
                          />
                        )}
                      </View>
                      {subjectText ? (
                        <Text
                          style={[
                            a.text_sm,
                            a.leading_snug,
                            {color: X_DARK.text},
                          ]}>
                          {subjectText}
                        </Text>
                      ) : subjectAcc ? (
                        <Text style={[a.text_xs, {color: X_DARK.text}]}>
                          {subjectAcc.displayName || subjectAcc.handle} (
                          {subjectAcc.did})
                        </Text>
                      ) : null}
                      {(subjectUri || targetDid) && (
                        <Text
                          numberOfLines={1}
                          style={{fontSize: 11, color: X_DARK.muted}}>
                          {subjectUri || targetDid}
                        </Text>
                      )}
                    </View>

                    {/* Resolution Summary (if resolved/dismissed) */}
                    {rep.status !== 'open' && (
                      <View
                        style={[
                          a.p_xs,
                          a.px_sm,
                          a.rounded_md,
                          {
                            backgroundColor: X_DARK.bg,
                            borderWidth: 1,
                            borderColor: X_DARK.border,
                          },
                        ]}>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          Action:{' '}
                          <Text style={[a.font_bold, {color: X_DARK.text}]}>
                            {rep.resolutionAction || rep.status}
                          </Text>
                          {rep.resolvedByHandle
                            ? ` by @${rep.resolvedByHandle}`
                            : ''}
                          {rep.resolvedAt
                            ? ` · ${formatDateTime(rep.resolvedAt)}`
                            : ''}
                        </Text>
                        {Boolean(rep.resolutionNote) && (
                          <Text
                            style={[a.text_xs, a.mt_2xs, {color: X_DARK.text}]}>
                            Note: {rep.resolutionNote}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Inline Moderation Note + Action Buttons */}
                    {rep.status === 'open' && (
                      <View style={[a.gap_sm, a.pt_2xs]}>
                        <TextInput
                          value={reportNotes[rep.id] ?? ''}
                          onChangeText={text =>
                            setReportNotes(prev => ({...prev, [rep.id]: text}))
                          }
                          placeholder="Add moderation note (optional)..."
                          placeholderTextColor={X_DARK.muted}
                          style={[
                            a.px_sm,
                            a.py_xs,
                            a.rounded_md,
                            a.text_xs,
                            {
                              color: X_DARK.text,
                              backgroundColor: X_DARK.surface,
                              borderWidth: 1,
                              borderColor: X_DARK.border,
                              minHeight: 36,
                            },
                            web({outlineStyle: 'none'} as any),
                          ]}
                        />
                        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                          <ActionButton
                            label="Dismiss"
                            tone="neutral"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveReport(rep.id, 'dismiss')
                            }
                            icon={
                              <CheckIcon size="xs" fill={X_DARK.muted} />
                            }
                          />
                          <ActionButton
                            label="Label Sensitive"
                            tone="accent"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveReport(rep.id, 'label', {
                                labelVal: 'sensitive',
                              })
                            }
                            icon={
                              <FlagIcon size="xs" fill={X_DARK.accent} />
                            }
                          />
                          {Boolean(subjectUri) && (
                            <ActionButton
                              label="Takedown Post"
                              tone="danger"
                              disabled={isBusy}
                              onPress={() =>
                                void handleResolveReport(
                                  rep.id,
                                  'takedown_post',
                                )
                              }
                              icon={
                                <TrashIcon size="xs" fill={X_DARK.danger} />
                              }
                            />
                          )}
                          <ActionButton
                            label="Warn"
                            tone="accent"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveReport(rep.id, 'warn_user')
                            }
                            icon={
                              <WarningIcon size="xs" fill={X_DARK.accent} />
                            }
                          />
                          <ActionButton
                            label="Suspend 24h"
                            tone="danger"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveReport(rep.id, 'suspend_user', {
                                suspendHours: 24,
                              })
                            }
                            icon={
                              <ClockIcon size="xs" fill={X_DARK.danger} />
                            }
                          />
                          <ActionButton
                            label="Ban"
                            tone="danger"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveReport(rep.id, 'ban_user')
                            }
                            icon={<BanIcon size="xs" fill={X_DARK.danger} />}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* TAB 3: USERS */}
        {activeTab === 'users' && (
          <View style={[a.gap_md]}>
            {/* Search & Action Reason Inputs */}
            <View style={[a.gap_sm]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_xs,
                  a.px_md,
                  a.rounded_full,
                  {
                    backgroundColor: X_DARK.surface,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                    minHeight: 42,
                  },
                ]}>
                <SearchIcon size="sm" fill={X_DARK.muted} />
                <TextInput
                  testID="adminUserSearchInput"
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="Search by handle, display name, DID, or email..."
                  placeholderTextColor={X_DARK.muted}
                  returnKeyType="search"
                  onSubmitEditing={() => void loadUsers()}
                  style={[
                    a.flex_1,
                    a.text_sm,
                    {color: X_DARK.text, minHeight: 38},
                    web({outlineStyle: 'none'} as any),
                  ]}
                />
                {Boolean(userSearch) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear user search"
                    onPress={() => setUserSearch('')}>
                    <CircleXIcon size="sm" fill={X_DARK.muted} />
                  </Pressable>
                )}
              </View>

              <TextInput
                value={userActionReason}
                onChangeText={setUserActionReason}
                placeholder="Optional moderation reason attached to Warn / Suspend / Ban actions..."
                placeholderTextColor={X_DARK.muted}
                style={[
                  a.px_sm,
                  a.py_xs,
                  a.rounded_md,
                  a.text_xs,
                  {
                    color: X_DARK.text,
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                    minHeight: 36,
                  },
                  web({outlineStyle: 'none'} as any),
                ]}
              />

              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                ]}>
                <FilterBar<UserFilter>
                  value={userFilter}
                  onChange={setUserFilter}
                  options={[
                    {value: 'all', label: 'All'},
                    {value: 'verified', label: 'Verified'},
                    {value: 'suspended', label: 'Suspended'},
                    {value: 'banned', label: 'Banned'},
                    {value: 'staff', label: 'Staff'},
                  ]}
                />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  {users.length} account{users.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {usersLoading ? (
              <View style={[a.p_xl, a.align_center, a.gap_sm]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  Loading accounts...
                </Text>
              </View>
            ) : users.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_xs,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <PersonIcon size="lg" fill={X_DARK.muted} />
                <Text style={[a.text_sm, {color: X_DARK.muted}]}>
                  No matching accounts found.
                </Text>
              </View>
            ) : (
              users.map(user => {
                const isBusy = busyKey === `user:${user.did}`
                const verified = isUserVerified(user)
                const warnings = getWarningsCount(user)
                const isSelf = me.did === user.did
                const statusLower = String(user.status || 'active').toLowerCase()
                const roleLower = String(user.role || 'user').toLowerCase()
                const statusTone =
                  statusLower === 'active'
                    ? 'success'
                    : statusLower === 'banned'
                      ? 'solidDanger'
                      : 'danger'
                const roleTone =
                  roleLower === 'admin'
                    ? 'solidAccent'
                    : roleLower === 'moderator'
                      ? 'accent'
                      : 'neutral'

                return (
                  <View
                    key={user.did}
                    style={[
                      a.p_md,
                      a.rounded_lg,
                      a.gap_sm,
                      {
                        backgroundColor: X_DARK.card,
                        borderWidth: 1,
                        borderColor: X_DARK.border,
                      },
                    ]}>
                    {/* Identity & Status Row */}
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_xs,
                      ]}>
                      <View style={[a.flex_1, {minWidth: 180}]}>
                        <View
                          style={[a.flex_row, a.align_center, a.gap_2xs]}>
                          <Text
                            numberOfLines={1}
                            style={[
                              a.text_md,
                              a.font_bold,
                              {color: X_DARK.text},
                            ]}>
                            {user.displayName || user.handle}
                          </Text>
                          {verified && (
                            <VerifiedCheck size="xs" fill={X_DARK.accent} />
                          )}
                          {isSelf && <BadgePill label="YOU" tone="neutral" />}
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[a.text_xs, {color: X_DARK.accent}]}>
                          @{user.handle}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{fontSize: 11, color: X_DARK.muted}}>
                          {user.did}
                        </Text>
                      </View>
                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.gap_xs,
                        ]}>
                        <BadgePill
                          label={statusLower.toUpperCase()}
                          tone={statusTone}
                        />
                        <BadgePill
                          label={roleLower.toUpperCase()}
                          tone={roleTone}
                        />
                      </View>
                    </View>

                    {/* Account Metrics Row */}
                    <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        <Text style={[a.font_bold, {color: X_DARK.text}]}>
                          {formatCompact(user.postsCount)}
                        </Text>{' '}
                        Zings
                      </Text>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        <Text style={[a.font_bold, {color: X_DARK.text}]}>
                          {formatCompact(user.followersCount)}
                        </Text>{' '}
                        Followers
                      </Text>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        <Text
                          style={[
                            a.font_bold,
                            {
                              color:
                                warnings > 0 ? X_DARK.danger : X_DARK.text,
                            },
                          ]}>
                          {warnings}
                        </Text>{' '}
                        Warnings
                      </Text>
                      {user.createdAt && (
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          Joined {formatDateTime(user.createdAt)}
                        </Text>
                      )}
                    </View>

                    {(user.suspendedUntil || user.moderationReason) && (
                      <View
                        style={[
                          a.px_sm,
                          a.py_xs,
                          a.rounded_md,
                          {
                            backgroundColor: X_DARK.dangerSubtle,
                            borderWidth: 1,
                            borderColor: X_DARK.danger,
                          },
                        ]}>
                        <Text style={[a.text_xs, {color: X_DARK.text}]}>
                          {user.suspendedUntil
                            ? `Suspended until ${formatDateTime(user.suspendedUntil)}`
                            : 'Moderation note'}
                          {user.moderationReason
                            ? ` · ${user.moderationReason}`
                            : ''}
                        </Text>
                      </View>
                    )}

                    {/* 1-Click Actions Row */}
                    <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                      <ActionButton
                        label={verified ? 'Revoke Check' : 'Verify'}
                        tone={verified ? 'neutral' : 'accent'}
                        disabled={isBusy}
                        onPress={() =>
                          void handleUserAction(
                            user,
                            verified ? 'unverify' : 'verify',
                          )
                        }
                        icon={
                          <VerifiedCheck
                            size="xs"
                            fill={verified ? X_DARK.muted : X_DARK.accent}
                          />
                        }
                      />
                      <ActionButton
                        label="Warn"
                        tone="accent"
                        disabled={isBusy || isSelf}
                        onPress={() => void handleUserAction(user, 'warn')}
                        icon={<WarningIcon size="xs" fill={X_DARK.accent} />}
                      />
                      <ActionButton
                        label="Suspend 24h"
                        tone="danger"
                        disabled={isBusy || isSelf}
                        onPress={() =>
                          void handleUserAction(user, 'suspend', {
                            suspendHours: 24,
                          })
                        }
                        icon={<ClockIcon size="xs" fill={X_DARK.danger} />}
                      />
                      <ActionButton
                        label="Ban"
                        tone="danger"
                        disabled={isBusy || isSelf || statusLower === 'banned'}
                        onPress={() => void handleUserAction(user, 'ban')}
                        icon={<BanIcon size="xs" fill={X_DARK.danger} />}
                      />
                      {statusLower !== 'active' && (
                        <ActionButton
                          label="Restore"
                          tone="success"
                          disabled={isBusy}
                          onPress={() => void handleUserAction(user, 'restore')}
                          icon={
                            <CircleCheckIcon size="xs" fill={X_DARK.success} />
                          }
                        />
                      )}

                      {/* Admin-Only Role Controls */}
                      {isAdmin && !isSelf && (
                        <>
                          {roleLower !== 'moderator' && (
                            <ActionButton
                              label="Make Mod"
                              tone="neutral"
                              disabled={isBusy}
                              onPress={() =>
                                void handleUserAction(user, 'set_role', {
                                  role: 'moderator',
                                })
                              }
                              icon={
                                <ShieldIcon size="xs" fill={X_DARK.accent} />
                              }
                            />
                          )}
                          {roleLower !== 'admin' && (
                            <ActionButton
                              label="Make Admin"
                              tone="primary"
                              disabled={isBusy}
                              onPress={() =>
                                void handleUserAction(user, 'set_role', {
                                  role: 'admin',
                                })
                              }
                              icon={
                                <ShieldCheckIcon
                                  size="xs"
                                  fill={X_DARK.ctaText}
                                />
                              }
                            />
                          )}
                          {roleLower !== 'user' && (
                            <ActionButton
                              label="Set User"
                              tone="neutral"
                              disabled={isBusy}
                              onPress={() =>
                                void handleUserAction(user, 'set_role', {
                                  role: 'user',
                                })
                              }
                              icon={
                                <PersonIcon size="xs" fill={X_DARK.muted} />
                              }
                            />
                          )}
                        </>
                      )}
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* TAB 4: POSTS */}
        {activeTab === 'posts' && (
          <View style={[a.gap_md]}>
            <View style={[a.gap_sm]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_xs,
                  a.px_md,
                  a.rounded_full,
                  {
                    backgroundColor: X_DARK.surface,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                    minHeight: 42,
                  },
                ]}>
                <SearchIcon size="sm" fill={X_DARK.muted} />
                <TextInput
                  testID="adminPostSearchInput"
                  value={postSearch}
                  onChangeText={setPostSearch}
                  placeholder="Search Zings by text, author handle, or AT-URI..."
                  placeholderTextColor={X_DARK.muted}
                  returnKeyType="search"
                  onSubmitEditing={() => void loadPosts()}
                  style={[
                    a.flex_1,
                    a.text_sm,
                    {color: X_DARK.text, minHeight: 38},
                    web({outlineStyle: 'none'} as any),
                  ]}
                />
                {Boolean(postSearch) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear post search"
                    onPress={() => setPostSearch('')}>
                    <CircleXIcon size="sm" fill={X_DARK.muted} />
                  </Pressable>
                )}
              </View>

              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                ]}>
                <FilterBar<PostFilter>
                  value={postFilter}
                  onChange={setPostFilter}
                  options={[
                    {value: 'all', label: 'All'},
                    {value: 'active', label: 'Active'},
                    {value: 'removed', label: 'Removed'},
                    {value: 'labeled', label: 'Labeled'},
                  ]}
                />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  {posts.length} Zing{posts.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {postsLoading ? (
              <View style={[a.p_xl, a.align_center, a.gap_sm]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  Loading Zings...
                </Text>
              </View>
            ) : posts.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_xs,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <PostDocIcon size="lg" fill={X_DARK.muted} />
                <Text style={[a.text_sm, {color: X_DARK.muted}]}>
                  No matching Zings found.
                </Text>
              </View>
            ) : (
              posts.map(post => {
                const isBusy = busyKey === `post:${post.uri}`
                const removed = isPostRemoved(post)
                const labels = normalizeLabels(post.labels)

                return (
                  <View
                    key={post.uri}
                    style={[
                      a.p_md,
                      a.rounded_lg,
                      a.gap_sm,
                      {
                        backgroundColor: X_DARK.card,
                        borderWidth: 1,
                        borderColor: removed ? X_DARK.danger : X_DARK.border,
                      },
                    ]}>
                    {/* Author Header */}
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_xs,
                      ]}>
                      <View
                        style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
                        <Text
                          numberOfLines={1}
                          style={[
                            a.text_sm,
                            a.font_bold,
                            {color: X_DARK.text},
                          ]}>
                          {post.authorDisplayName || post.authorHandle}
                        </Text>
                        {post.authorVerified && (
                          <VerifiedCheck size="xs" fill={X_DARK.accent} />
                        )}
                        <Text
                          numberOfLines={1}
                          style={[a.text_xs, {color: X_DARK.accent}]}>
                          @{post.authorHandle}
                        </Text>
                      </View>
                      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                        <BadgePill
                          label={removed ? 'REMOVED' : 'ACTIVE'}
                          tone={removed ? 'solidDanger' : 'success'}
                        />
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {formatDateTime(post.createdAt || post.indexedAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Post Body */}
                    <Text
                      style={[
                        a.text_sm,
                        a.leading_snug,
                        {color: X_DARK.text},
                      ]}>
                      {post.text || '[Media Zing]'}
                    </Text>

                    <Text
                      numberOfLines={1}
                      style={{fontSize: 11, color: X_DARK.muted}}>
                      {post.uri}
                    </Text>

                    {/* Counts + Active Labels */}
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_sm,
                      ]}>
                      <View style={[a.flex_row, a.gap_md]}>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {formatCompact(post.likeCount)} Likes
                        </Text>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {formatCompact(post.repostCount)} Rezings
                        </Text>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {formatCompact(post.replyCount)} Replies
                        </Text>
                      </View>

                      {labels.length > 0 && (
                        <View style={[a.flex_row, a.flex_wrap, a.gap_2xs]}>
                          {labels.map(lbl => (
                            <BadgePill
                              key={lbl}
                              label={`LABEL: ${lbl.toUpperCase()}`}
                              tone="accent"
                            />
                          ))}
                        </View>
                      )}
                    </View>

                    {Boolean(post.takedownReason) && (
                      <Text style={[a.text_xs, {color: X_DARK.danger}]}>
                        Removal reason: {post.takedownReason}
                      </Text>
                    )}

                    {/* Post Moderation Actions */}
                    <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                      {removed ? (
                        <ActionButton
                          label="Restore"
                          tone="success"
                          disabled={isBusy}
                          onPress={() =>
                            void handlePostAction(post, 'restore')
                          }
                          icon={
                            <CircleCheckIcon size="xs" fill={X_DARK.success} />
                          }
                        />
                      ) : (
                        <ActionButton
                          label="Takedown"
                          tone="danger"
                          disabled={isBusy}
                          onPress={() =>
                            void handlePostAction(post, 'takedown')
                          }
                          icon={<TrashIcon size="xs" fill={X_DARK.danger} />}
                        />
                      )}
                      <ActionButton
                        label="Label Sensitive"
                        tone="accent"
                        disabled={isBusy}
                        onPress={() =>
                          void handlePostAction(post, 'label', {
                            labelVal: 'sensitive',
                          })
                        }
                        icon={<FlagIcon size="xs" fill={X_DARK.accent} />}
                      />
                      <ActionButton
                        label="Label Spam"
                        tone="accent"
                        disabled={isBusy}
                        onPress={() =>
                          void handlePostAction(post, 'label', {
                            labelVal: 'spam',
                          })
                        }
                        icon={<WarningIcon size="xs" fill={X_DARK.accent} />}
                      />
                      {labels.length > 0 && (
                        <ActionButton
                          label="Clear Labels"
                          tone="neutral"
                          disabled={isBusy}
                          onPress={() =>
                            void handlePostAction(post, 'unlabel')
                          }
                          icon={<CheckIcon size="xs" fill={X_DARK.muted} />}
                        />
                      )}
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* TAB 5: APPEALS */}
        {activeTab === 'appeals' && (
          <View style={[a.gap_md]}>
            <View
              style={[
                a.flex_row,
                a.flex_wrap,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <FilterBar<AppealStatusFilter>
                value={appealFilter}
                onChange={setAppealFilter}
                options={[
                  {value: 'open', label: 'Open'},
                  {value: 'approved', label: 'Approved'},
                  {value: 'rejected', label: 'Rejected'},
                  {value: 'all', label: 'All'},
                ]}
              />
              <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                {appeals.length} appeal{appeals.length === 1 ? '' : 's'}
              </Text>
            </View>

            {appealsLoading ? (
              <View style={[a.p_xl, a.align_center, a.gap_sm]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  Loading appeals...
                </Text>
              </View>
            ) : appeals.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_xs,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <CircleCheckIcon size="lg" fill={X_DARK.success} />
                <Text style={[a.text_md, a.font_bold, {color: X_DARK.text}]}>
                  No pending appeals
                </Text>
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  No {appealFilter === 'all' ? '' : `${appealFilter} `}appeals
                  in the queue.
                </Text>
              </View>
            ) : (
              appeals.map(appeal => {
                const isBusy = busyKey === `appeal:${appeal.id}`
                const appealType = String(
                  appeal.type || appeal.subjectType || 'account',
                ).toLowerCase()
                const appellantHandle =
                  appeal.appellantHandle ||
                  appeal.handle ||
                  appeal.appellantDid ||
                  appeal.did ||
                  'unknown'
                const targetUri = appeal.targetUri || appeal.subjectUri || null
                const appealMessage =
                  appeal.message || appeal.reason || 'No message provided.'
                const statusLower = String(appeal.status || 'open').toLowerCase()
                const statusTone =
                  statusLower === 'open'
                    ? 'accent'
                    : statusLower === 'approved'
                      ? 'success'
                      : 'danger'

                return (
                  <View
                    key={appeal.id}
                    style={[
                      a.p_md,
                      a.rounded_lg,
                      a.gap_sm,
                      {
                        backgroundColor: X_DARK.card,
                        borderWidth: 1,
                        borderColor: X_DARK.border,
                      },
                    ]}>
                    <View
                      style={[
                        a.flex_row,
                        a.flex_wrap,
                        a.align_center,
                        a.justify_between,
                        a.gap_xs,
                      ]}>
                      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                        <BadgePill
                          label={statusLower.toUpperCase()}
                          tone={statusTone}
                        />
                        <BadgePill
                          label={appealType.toUpperCase()}
                          tone="neutral"
                        />
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          #{appeal.id}
                        </Text>
                      </View>
                      <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                        {formatDateTime(appeal.createdAt)}
                      </Text>
                    </View>

                    <View style={[a.gap_2xs]}>
                      <Text
                        style={[
                          a.text_sm,
                          a.font_bold,
                          {color: X_DARK.accent},
                        ]}>
                        @{appellantHandle}
                      </Text>
                      {targetUri && (
                        <Text
                          numberOfLines={1}
                          style={{fontSize: 11, color: X_DARK.muted}}>
                          Target: {targetUri}
                        </Text>
                      )}
                    </View>

                    <View
                      style={[
                        a.p_sm,
                        a.rounded_md,
                        {
                          backgroundColor: X_DARK.surface,
                          borderWidth: 1,
                          borderColor: X_DARK.border,
                        },
                      ]}>
                      <Text
                        style={[
                          a.text_sm,
                          a.leading_snug,
                          {color: X_DARK.text},
                        ]}>
                        {appealMessage}
                      </Text>
                    </View>

                    {statusLower !== 'open' ? (
                      <View
                        style={[
                          a.p_xs,
                          a.px_sm,
                          a.rounded_md,
                          {
                            backgroundColor: X_DARK.bg,
                            borderWidth: 1,
                            borderColor: X_DARK.border,
                          },
                        ]}>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          Decision:{' '}
                          <Text style={[a.font_bold, {color: X_DARK.text}]}>
                            {(appeal.decision || statusLower).toUpperCase()}
                          </Text>
                          {appeal.resolvedByHandle
                            ? ` by @${appeal.resolvedByHandle}`
                            : ''}
                          {appeal.resolvedAt
                            ? ` · ${formatDateTime(appeal.resolvedAt)}`
                            : ''}
                        </Text>
                        {Boolean(appeal.resolutionNote) && (
                          <Text
                            style={[a.text_xs, a.mt_2xs, {color: X_DARK.text}]}>
                            Note: {appeal.resolutionNote}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={[a.gap_sm]}>
                        <TextInput
                          value={appealNotes[appeal.id] ?? ''}
                          onChangeText={text =>
                            setAppealNotes(prev => ({
                              ...prev,
                              [appeal.id]: text,
                            }))
                          }
                          placeholder="Add review note (optional)..."
                          placeholderTextColor={X_DARK.muted}
                          style={[
                            a.px_sm,
                            a.py_xs,
                            a.rounded_md,
                            a.text_xs,
                            {
                              color: X_DARK.text,
                              backgroundColor: X_DARK.surface,
                              borderWidth: 1,
                              borderColor: X_DARK.border,
                              minHeight: 36,
                            },
                            web({outlineStyle: 'none'} as any),
                          ]}
                        />
                        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                          <ActionButton
                            label="Approve & Restore"
                            tone="success"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveAppeal(appeal.id, 'approve')
                            }
                            icon={
                              <CircleCheckIcon
                                size="xs"
                                fill={X_DARK.success}
                              />
                            }
                          />
                          <ActionButton
                            label="Reject"
                            tone="danger"
                            disabled={isBusy}
                            onPress={() =>
                              void handleResolveAppeal(appeal.id, 'reject')
                            }
                            icon={
                              <CircleXIcon size="xs" fill={X_DARK.danger} />
                            }
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* TAB 6: AUDIT LOG */}
        {activeTab === 'audit' && (
          <View style={[a.gap_md]}>
            <View
              style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
              <Text style={[a.text_md, a.font_bold, {color: X_DARK.text}]}>
                Trust & Safety Audit Log
              </Text>
              <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                Latest {auditEntries.length} events
              </Text>
            </View>

            {auditLoading ? (
              <View style={[a.p_xl, a.align_center, a.gap_sm]}>
                <ActivityIndicator size="small" color={X_DARK.accent} />
                <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                  Loading audit log...
                </Text>
              </View>
            ) : auditEntries.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_xs,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                <ClockIcon size="lg" fill={X_DARK.muted} />
                <Text style={[a.text_sm, {color: X_DARK.muted}]}>
                  No audit events recorded yet.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  a.rounded_lg,
                  a.overflow_hidden,
                  {
                    backgroundColor: X_DARK.card,
                    borderWidth: 1,
                    borderColor: X_DARK.border,
                  },
                ]}>
                {auditEntries.map((entry, idx) => {
                  const ts = entry.at || entry.createdAt || entry.timestamp
                  const actor = entry.actorHandle
                    ? `@${entry.actorHandle}`
                    : entry.actorDid || 'system'
                  const target =
                    entry.targetHandle
                      ? `@${entry.targetHandle}`
                      : entry.target || entry.targetUri || entry.targetDid || ''
                  const details = formatAuditDetails(entry)
                  const actionLower = String(entry.action || '').toLowerCase()
                  const actionTone =
                    actionLower.includes('ban') ||
                    actionLower.includes('takedown') ||
                    actionLower.includes('suspend') ||
                    actionLower.includes('reject')
                      ? 'danger'
                      : actionLower.includes('restore') ||
                          actionLower.includes('verify') ||
                          actionLower.includes('approve') ||
                          actionLower.includes('backup')
                        ? 'success'
                        : 'accent'

                  return (
                    <View
                      key={entry.id || `${ts || idx}-${entry.action}-${idx}`}
                      style={[
                        a.p_md,
                        a.gap_2xs,
                        idx > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: X_DARK.border,
                        },
                      ]}>
                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.justify_between,
                          a.gap_xs,
                        ]}>
                        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                          <BadgePill
                            label={String(entry.action || 'event').toUpperCase()}
                            tone={actionTone}
                          />
                          <Text
                            style={[
                              a.text_xs,
                              a.font_bold,
                              {color: X_DARK.text},
                            ]}>
                            {actor}
                          </Text>
                        </View>
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {formatDateTime(ts)}
                        </Text>
                      </View>
                      {Boolean(target) && (
                        <Text
                          numberOfLines={1}
                          style={[a.text_xs, {color: X_DARK.accent}]}>
                          Target: {target}
                        </Text>
                      )}
                      {Boolean(details) && (
                        <Text style={[a.text_xs, {color: X_DARK.muted}]}>
                          {details}
                        </Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
