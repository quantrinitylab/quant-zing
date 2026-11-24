import {useMemo, useState} from 'react'
import {Pressable, View} from 'react-native'

import {
  type QuantyEngineOrigin,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {
  getQuantyThemeColors,
  type QuantyToolTraceItem,
} from '#/lib/quantos/quantyBridge'
import {atoms as a, useTheme, web} from '#/alf'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon,
} from '#/components/icons/Chevron'
import {Text} from '#/components/Typography'

export interface QuantyToolTraceProps {
  traces?: QuantyToolTraceItem[]
  origin?: QuantyEngineOrigin
  model?: string
  provider?: string
  latencyMs?: number
  compact?: boolean
}

function formatTraceCaptionItem(item: QuantyToolTraceItem): string {
  const key = (item.toolName || '').toLowerCase()
  const count =
    typeof item.itemCount === 'number' && item.itemCount > 0
      ? item.itemCount
      : null

  if (key.includes('trend')) {
    return count ? `Checked ${count} live trends` : 'Checked live trends'
  }
  if (key.includes('search_zing') || key === 'search') {
    return count
      ? `Searched ${count} ${count === 1 ? 'Zing' : 'Zings'}`
      : 'Searched Zings'
  }
  if (key.includes('people') || key.includes('account')) {
    return count
      ? `Searched ${count} ${count === 1 ? 'account' : 'accounts'}`
      : 'Searched accounts'
  }
  if (key.includes('analytic')) {
    return 'Reviewed your analytics'
  }
  if (key.includes('profile')) {
    return 'Checked profile'
  }
  if (key.includes('thread')) {
    return 'Read thread'
  }
  if (key.includes('notif')) {
    return count
      ? `Checked ${count} ${count === 1 ? 'notification' : 'notifications'}`
      : 'Checked notifications'
  }
  if (key.includes('bookmark')) {
    return count
      ? `Checked ${count} ${count === 1 ? 'bookmark' : 'bookmarks'}`
      : 'Checked bookmarks'
  }
  if (key.includes('dm') || key.includes('message')) {
    return 'Checked direct messages'
  }
  if (key.includes('list')) {
    return 'Checked lists'
  }

  const cleanTitle = stripEmojisAndSymbols(item.title || 'Checked source').trim()
  if (!cleanTitle) return 'Checked source'
  return count ? `${cleanTitle} (${count})` : cleanTitle
}

export function QuantyToolTrace({
  traces = [],
  compact = false,
}: QuantyToolTraceProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantyThemeColors(t.name), [t.name])
  const [expanded, setExpanded] = useState(false)

  const captionText = useMemo(() => {
    if (traces.length === 0) return ''
    if (traces.length === 1) {
      return formatTraceCaptionItem(traces[0])
    }
    const first = formatTraceCaptionItem(traces[0])
    if (compact || traces.length > 2) {
      return `${first} + ${traces.length - 1} more`
    }
    return `${first} · ${formatTraceCaptionItem(traces[1])}`
  }, [compact, traces])

  if (traces.length === 0) {
    return null
  }

  const detailsBg =
    colors.mode === 'dark'
      ? '#16181C'
      : colors.mode === 'dim'
        ? '#1E2732'
        : '#F7F9F9'

  return (
    <View style={[a.gap_xs]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${captionText}. Tap to inspect details`}
        onPress={() => setExpanded(prev => !prev)}
        style={[
          a.flex_row,
          a.align_center,
          a.gap_2xs,
          {alignSelf: 'flex-start', paddingVertical: 2},
          web({cursor: 'pointer'}),
        ]}>
        <Text
          numberOfLines={1}
          style={[
            a.text_xs,
            {
              color: colors.muted,
              fontSize: compact ? 11 : 12,
              lineHeight: compact ? 15 : 16,
            },
          ]}>
          {captionText}
        </Text>
        <View style={{opacity: 0.7}}>
          {expanded ? (
            <ChevronDownIcon size="xs" fill={colors.muted} />
          ) : (
            <ChevronRightIcon size="xs" fill={colors.muted} />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View
          style={[
            a.p_sm,
            a.gap_xs,
            {
              borderRadius: 12,
              backgroundColor: detailsBg,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          {traces.map((item, idx) => {
            const cleanTitle =
              stripEmojisAndSymbols(item.title || '') ||
              formatTraceCaptionItem(item)
            const cleanSummary = stripEmojisAndSymbols(item.summary || '')
            const statusColor =
              item.status === 'ok'
                ? colors.rezing
                : item.status === 'auth_required'
                  ? colors.accent
                  : colors.danger
            const statusText =
              item.status === 'ok'
                ? 'Done'
                : item.status === 'auth_required'
                  ? 'Sign in needed'
                  : 'Unavailable'

            return (
              <View
                key={`${item.toolName}_${idx}`}
                style={[
                  a.gap_2xs,
                  idx > 0 && {
                    paddingTop: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
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
                    numberOfLines={1}
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      a.flex_1,
                      {color: colors.text},
                    ]}>
                    {cleanTitle}
                  </Text>
                  <Text
                    style={[
                      a.text_2xs,
                      a.font_semi_bold,
                      {color: statusColor},
                    ]}>
                    {statusText}
                  </Text>
                </View>
                {cleanSummary ? (
                  <Text
                    style={[
                      a.text_xs,
                      {color: colors.muted, lineHeight: 17},
                    ]}>
                    {cleanSummary}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
