import {useMemo, useState} from 'react'
import {Pressable, View} from 'react-native'

import {type QuantyEngineOrigin} from '#/lib/quantos/client'
import {
  formatOriginLabel,
  getQuantyThemeColors,
  type QuantyToolTraceItem,
} from '#/lib/quantos/quantyBridge'
import {atoms as a, useTheme, web} from '#/alf'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon,
} from '#/components/icons/Chevron'
import {Wrench_Stroke2_Corner2_Rounded as ToolIcon} from '#/components/icons/Wrench'
import {Text} from '#/components/Typography'

export interface QuantyToolTraceProps {
  traces?: QuantyToolTraceItem[]
  origin?: QuantyEngineOrigin
  model?: string
  provider?: string
  latencyMs?: number
  compact?: boolean
}

export function QuantyToolTrace({
  traces = [],
  origin,
  model,
  provider,
  latencyMs,
  compact = false,
}: QuantyToolTraceProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantyThemeColors(t.name), [t.name])
  const [expanded, setExpanded] = useState(false)

  const originLabel = formatOriginLabel(origin)
  const originDotColor =
    origin === 'quant-ai' || origin === 'quant-router'
      ? colors.rezing
      : colors.accent

  const totalToolMs = useMemo(
    () => traces.reduce((acc, item) => acc + Number(item.latencyMs || 0), 0),
    [traces],
  )

  if (!origin && traces.length === 0) {
    return null
  }

  return (
    <View style={[a.gap_xs]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle live tool execution trace"
        onPress={() => {
          if (traces.length > 0) setExpanded(prev => !prev)
        }}
        style={[
          a.flex_row,
          a.flex_wrap,
          a.align_center,
          a.justify_between,
          a.gap_xs,
          a.px_sm,
          a.py_2xs,
          a.rounded_md,
          {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          },
          traces.length > 0 ? web({cursor: 'pointer'}) : undefined,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              backgroundColor: originDotColor,
            }}
          />
          <Text style={[a.text_2xs, a.font_bold, {color: colors.text}]}>
            {originLabel}
          </Text>
          {model && !compact ? (
            <Text style={[a.text_2xs, {color: colors.muted}]}>
              {model}
            </Text>
          ) : null}
          {provider &&
          provider !== origin &&
          provider !== 'quant-ai' &&
          provider !== 'quant-router' &&
          !compact ? (
            <Text style={[a.text_2xs, {color: colors.muted}]}>
              {provider}
            </Text>
          ) : null}
        </View>

        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          {traces.length > 0 && (
            <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
              <ToolIcon size="xs" fill={colors.muted} />
              <Text
                style={[a.text_2xs, a.font_semi_bold, {color: colors.muted}]}>
                {traces.length} {traces.length === 1 ? 'tool' : 'tools'}
                {totalToolMs > 0 ? ` (${totalToolMs}ms)` : ''}
              </Text>
            </View>
          )}
          {typeof latencyMs === 'number' && (
            <Text style={[a.text_2xs, {color: colors.muted}]}>
              {latencyMs}ms
            </Text>
          )}
          {traces.length > 0 &&
            (expanded ? (
              <ChevronDownIcon size="xs" fill={colors.muted} />
            ) : (
              <ChevronRightIcon size="xs" fill={colors.muted} />
            ))}
        </View>
      </Pressable>

      {/* Compact inline summary pills when collapsed */}
      {!expanded && traces.length > 0 && (
        <View style={[a.flex_row, a.flex_wrap, a.gap_2xs]}>
          {traces.slice(0, compact ? 3 : 6).map((item, idx) => {
            const dotColor =
              item.status === 'ok'
                ? colors.rezing
                : item.status === 'auth_required'
                  ? colors.accent
                  : colors.danger
            return (
              <Pressable
                key={`${item.toolName}_${idx}`}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => setExpanded(true)}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_2xs,
                  a.px_xs,
                  {
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: colors.bg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                  web({cursor: 'pointer'}),
                ]}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    backgroundColor: dotColor,
                  }}
                />
                <Text
                  style={[a.text_2xs, a.font_semi_bold, {color: colors.text}]}>
                  {item.title}
                  {typeof item.itemCount === 'number'
                    ? ` (${item.itemCount})`
                    : ''}
                </Text>
                <Text style={[a.text_2xs, {color: colors.muted}]}>
                  {item.latencyMs}ms
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {/* Detailed expanded tool trace */}
      {expanded && traces.length > 0 && (
        <View
          style={[
            a.p_sm,
            a.rounded_md,
            a.gap_xs,
            {
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          {traces.map((item, idx) => {
            const statusColor =
              item.status === 'ok'
                ? colors.rezing
                : item.status === 'auth_required'
                  ? colors.accent
                  : colors.danger
            const statusText =
              item.status === 'ok'
                ? 'Live'
                : item.status === 'auth_required'
                  ? 'Sign in'
                  : 'Error'
            return (
              <View
                key={`${item.toolName}_d_${idx}`}
                style={[
                  a.gap_2xs,
                  idx > 0 && {
                    paddingTop: 6,
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
                    style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                    {item.title}
                  </Text>
                  <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                    <Text
                      style={[
                        a.text_2xs,
                        a.font_bold,
                        {color: statusColor},
                      ]}>
                      {statusText}
                    </Text>
                    <Text style={[a.text_2xs, {color: colors.muted}]}>
                      {item.latencyMs}ms
                    </Text>
                  </View>
                </View>
                <Text style={[a.text_2xs, {color: colors.muted}]}>
                  {item.summary}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
