import {useMemo} from 'react'
import {Linking, Platform, View} from 'react-native'

import {
  type QuantySourceCitation,
  stripEmojisAndSymbols,
} from '#/lib/quantos/client'
import {getQuantyThemeColors} from '#/lib/quantos/quantyBridge'
import {atoms as a, useTheme, web} from '#/alf'
import {Text} from '#/components/Typography'

export interface QuantyMarkdownProps {
  content: string
  compact?: boolean
  citations?: QuantySourceCitation[]
  onPressCitation?: (citation: QuantySourceCitation) => void
  onPressHandle?: (handle: string) => void
  onPressTag?: (tag: string) => void
}

function openExternalSafely(url: string) {
  if (!/^https?:\/\//i.test(url)) return
  void Linking.openURL(url).catch(() => {})
}

function renderInlineSegments({
  line,
  compact,
  textColor,
  mutedColor,
  accentColor,
  surfaceColor,
  borderColor,
  citations,
  onPressCitation,
  onPressHandle,
  onPressTag,
}: {
  line: string
  compact?: boolean
  textColor: string
  mutedColor: string
  accentColor: string
  surfaceColor: string
  borderColor: string
  citations?: QuantySourceCitation[]
  onPressCitation?: (citation: QuantySourceCitation) => void
  onPressHandle?: (handle: string) => void
  onPressTag?: (tag: string) => void
}) {
  const baseTextStyle = compact ? a.text_xs : a.text_sm
  const nodes: React.ReactNode[] = []
  const scanner =
    /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s)]+)|\[(\d+)\]|_([^_]+)_|\*([^*]+)\*/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  let keyCounter = 0

  const renderPlainWithMentions = (plain: string) => {
    if (!plain) return null
    if (!plain.includes('@') && !plain.includes('#')) {
      return (
        <Text key={`p_${keyCounter++}`} style={[baseTextStyle, {color: textColor}]}>
          {plain}
        </Text>
      )
    }
    const segs = plain.split(/(@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_]+)/g)
    return segs.map((seg, idx) => {
      if (seg.startsWith('@') && seg.length > 2) {
        const clean = seg.slice(1)
        return (
          <Text
            key={`m_${keyCounter++}_${idx}`}
            onPress={onPressHandle ? () => onPressHandle(clean) : undefined}
            style={[
              baseTextStyle,
              a.font_semi_bold,
              {color: accentColor},
              onPressHandle ? web({cursor: 'pointer'}) : undefined,
            ]}>
            {seg}
          </Text>
        )
      }
      if (seg.startsWith('#') && seg.length > 1) {
        const clean = seg.slice(1)
        return (
          <Text
            key={`t_${keyCounter++}_${idx}`}
            onPress={onPressTag ? () => onPressTag(clean) : undefined}
            style={[
              baseTextStyle,
              a.font_semi_bold,
              {color: accentColor},
              onPressTag ? web({cursor: 'pointer'}) : undefined,
            ]}>
            {seg}
          </Text>
        )
      }
      return (
        <Text
          key={`pl_${keyCounter++}_${idx}`}
          style={[baseTextStyle, {color: textColor}]}>
          {seg}
        </Text>
      )
    })
  }

  while ((match = scanner.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(renderPlainWithMentions(line.slice(lastIndex, match.index)))
    }
    if (match[1]) {
      // Bold
      nodes.push(
        <Text
          key={`b_${keyCounter++}`}
          style={[baseTextStyle, a.font_bold, {color: textColor}]}>
          {match[1]}
        </Text>,
      )
    } else if (match[2]) {
      // Inline code
      nodes.push(
        <Text
          key={`c_${keyCounter++}`}
          style={[
            a.text_xs,
            {
              color: textColor,
              backgroundColor: surfaceColor,
              borderColor,
              fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
              paddingHorizontal: 4,
              borderRadius: 4,
            },
          ]}>
          {` ${match[2]} `}
        </Text>,
      )
    } else if (match[3] && match[4]) {
      // Markdown link
      const href = match[4]
      nodes.push(
        <Text
          key={`ml_${keyCounter++}`}
          onPress={() => openExternalSafely(href)}
          style={[
            baseTextStyle,
            a.font_semi_bold,
            {color: accentColor, textDecorationLine: 'underline'},
            web({cursor: 'pointer'}),
          ]}>
          {match[3]}
        </Text>,
      )
    } else if (match[5]) {
      // Bare URL
      const href = match[5]
      nodes.push(
        <Text
          key={`u_${keyCounter++}`}
          onPress={() => openExternalSafely(href)}
          style={[
            baseTextStyle,
            {color: accentColor, textDecorationLine: 'underline'},
            web({cursor: 'pointer'}),
          ]}>
          {href}
        </Text>,
      )
    } else if (match[6]) {
      // Numeric citation [1]
      const citeIdx = Number(match[6]) - 1
      const cite =
        citations && citeIdx >= 0 && citeIdx < citations.length
          ? citations[citeIdx]
          : undefined
      nodes.push(
        <Text
          key={`cit_${keyCounter++}`}
          onPress={cite && onPressCitation ? () => onPressCitation(cite) : undefined}
          style={[
            a.text_xs,
            a.font_bold,
            {color: cite ? accentColor : mutedColor},
            cite && onPressCitation ? web({cursor: 'pointer'}) : undefined,
          ]}>
          {`[${match[6]}]`}
        </Text>,
      )
    } else if (match[7] || match[8]) {
      // Italic
      nodes.push(
        <Text
          key={`i_${keyCounter++}`}
          style={[baseTextStyle, {color: mutedColor, fontStyle: 'italic'}]}>
          {match[7] || match[8]}
        </Text>,
      )
    }
    lastIndex = scanner.lastIndex
  }

  if (lastIndex < line.length) {
    nodes.push(renderPlainWithMentions(line.slice(lastIndex)))
  }

  return nodes
}

export function QuantyMarkdown({
  content,
  compact = false,
  citations,
  onPressCitation,
  onPressHandle,
  onPressTag,
}: QuantyMarkdownProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantyThemeColors(t.name), [t.name])

  const blocks = useMemo(() => {
    const raw = String(content || '')
    const parts = raw.split(/(```[\s\S]*?```)/g)
    const out: Array<
      | {kind: 'code'; code: string}
      | {kind: 'line'; line: string}
    > = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i % 2 === 1) {
        // Strip the outer ``` and optional language tag, keeping exact code indentation
        const inner = part.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')
        out.push({kind: 'code', code: inner})
      } else {
        const sanitized = stripEmojisAndSymbols(part)
        const rawLines = sanitized.split('\n')
        for (const rawLine of rawLines) {
          out.push({kind: 'line', line: rawLine.trimEnd()})
        }
      }
    }
    return out
  }, [content])

  const baseTextStyle = compact ? a.text_xs : a.text_sm
  const headingStyle = compact ? a.text_sm : a.text_md
  const monoFont = Platform.select({ios: 'Menlo', default: 'monospace'})

  return (
    <View style={[a.gap_xs]}>
      {blocks.map((block, index) => {
        if (block.kind === 'code') {
          return (
            <View
              key={`code_${index}`}
              style={[
                a.p_sm,
                a.rounded_md,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[
                  a.text_xs,
                  a.leading_snug,
                  {color: colors.text, fontFamily: monoFont},
                ]}>
                {block.code}
              </Text>
            </View>
          )
        }

        const line = block.line
        if (!line.trim()) {
          return <View key={`sp_${index}`} style={{height: compact ? 2 : 4}} />
        }

        if (
          line.startsWith('### ') ||
          line.startsWith('## ') ||
          line.startsWith('# ')
        ) {
          const headingText = line.replace(/^#{1,3}\s+/, '')
          return (
            <Text
              key={`h_${index}`}
              style={[
                headingStyle,
                a.font_bold,
                a.leading_snug,
                {
                  color: colors.text,
                  marginTop: index === 0 ? 0 : compact ? 4 : 6,
                },
              ]}>
              {headingText}
            </Text>
          )
        }

        if (line.startsWith('> ')) {
          return (
            <View
              key={`q_${index}`}
              style={[
                a.pl_sm,
                a.py_2xs,
                {borderLeftWidth: 2, borderLeftColor: colors.accent},
              ]}>
              <Text style={[baseTextStyle, a.leading_snug, {color: colors.text}]}>
                {renderInlineSegments({
                  line: line.slice(2),
                  compact,
                  textColor: colors.text,
                  mutedColor: colors.muted,
                  accentColor: colors.accent,
                  surfaceColor: colors.surface,
                  borderColor: colors.border,
                  citations,
                  onPressCitation,
                  onPressHandle,
                  onPressTag,
                })}
              </Text>
            </View>
          )
        }

        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/)
        if (numberedMatch) {
          return (
            <View
              key={`ol_${index}`}
              style={[a.flex_row, a.align_start, a.gap_xs, {paddingLeft: 2}]}>
              <Text
                style={[
                  baseTextStyle,
                  a.font_bold,
                  {color: colors.accent, minWidth: 18},
                ]}>
                {numberedMatch[1]}.
              </Text>
              <Text
                style={[
                  a.flex_1,
                  baseTextStyle,
                  a.leading_snug,
                  {color: colors.text},
                ]}>
                {renderInlineSegments({
                  line: numberedMatch[2],
                  compact,
                  textColor: colors.text,
                  mutedColor: colors.muted,
                  accentColor: colors.accent,
                  surfaceColor: colors.surface,
                  borderColor: colors.border,
                  citations,
                  onPressCitation,
                  onPressHandle,
                  onPressTag,
                })}
              </Text>
            </View>
          )
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <View
              key={`ul_${index}`}
              style={[a.flex_row, a.align_start, a.gap_xs, {paddingLeft: 4}]}>
              <Text style={[baseTextStyle, a.font_bold, {color: colors.muted}]}>
                {'-'}
              </Text>
              <Text
                style={[
                  a.flex_1,
                  baseTextStyle,
                  a.leading_snug,
                  {color: colors.text},
                ]}>
                {renderInlineSegments({
                  line: line.slice(2),
                  compact,
                  textColor: colors.text,
                  mutedColor: colors.muted,
                  accentColor: colors.accent,
                  surfaceColor: colors.surface,
                  borderColor: colors.border,
                  citations,
                  onPressCitation,
                  onPressHandle,
                  onPressTag,
                })}
              </Text>
            </View>
          )
        }

        if (line === '---') {
          return (
            <View
              key={`hr_${index}`}
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: 4,
              }}
            />
          )
        }

        return (
          <Text
            key={`tx_${index}`}
            style={[baseTextStyle, a.leading_snug, {color: colors.text}]}>
            {renderInlineSegments({
              line,
              compact,
              textColor: colors.text,
              mutedColor: colors.muted,
              accentColor: colors.accent,
              surfaceColor: colors.surface,
              borderColor: colors.border,
              citations,
              onPressCitation,
              onPressHandle,
              onPressTag,
            })}
          </Text>
        )
      })}
    </View>
  )
}
