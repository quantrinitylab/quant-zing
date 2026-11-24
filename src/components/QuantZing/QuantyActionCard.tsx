import {useCallback, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import {CommonActions, useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {stripEmojisAndSymbols} from '#/lib/quantos/client'
import {
  executeQuantyTool,
  getQuantyThemeColors,
  type QuantyActionCardPayload,
  type QuantyExecuteResponse,
  type QuantyNavigationHint,
} from '#/lib/quantos/quantyBridge'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {CircleCheck_Stroke2_Corner0_Rounded as CheckCircleIcon} from '#/components/icons/CircleCheck'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import {SquareArrowTopRight_Stroke2_Corner0_Rounded as OpenIcon} from '#/components/icons/SquareArrowTopRight'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

export interface QuantyActionCardProps {
  actionCard: QuantyActionCardPayload
  compact?: boolean
  onExecuted?: (res: QuantyExecuteResponse) => void
  onCancelled?: (actionId: string) => void
}

const FIELD_LABELS: Record<string, string> = {
  text: 'Post text',
  title: 'Title',
  subtitle: 'Subtitle',
  body: 'Article body',
  topic: 'Topic',
  name: 'List name',
  description: 'Description',
  displayName: 'Display name',
  recipient: 'Recipient',
  actor: 'Account',
  postUri: 'Zing link',
  options: 'Poll options (one per line)',
}

const MULTILINE_FIELDS = new Set(['text', 'body', 'description', 'options'])

function getFriendlyActionHeading(
  toolName: string,
  fallbackTitle: string,
): string {
  const key = (toolName || '').toLowerCase()
  if (
    key.includes('publish_zing') ||
    key.includes('create_zing') ||
    key.includes('post_zing') ||
    key === 'zing'
  ) {
    return 'Ready to post Zing'
  }
  if (key.includes('reply')) return 'Ready to post reply'
  if (key.includes('send_dm') || key === 'dm') return 'Ready to send DM'
  if (key.includes('article')) return 'Ready to publish Article'
  if (key.includes('poll')) return 'Ready to create Poll'
  if (key.includes('space')) return 'Ready to start ZingSpace'
  if (key.includes('list')) return 'Ready to create List'
  if (key.includes('follow')) return 'Ready to follow account'
  if (key.includes('bookmark')) return 'Ready to save bookmark'
  if (key.includes('bio') || key.includes('profile')) {
    return 'Ready to update profile'
  }
  if (key.includes('mute')) return 'Confirm mute'
  if (key.includes('block')) return 'Confirm block'

  const clean = stripEmojisAndSymbols(fallbackTitle || '').trim()
  return clean || 'Ready to continue'
}

function getFriendlyReceiptHeading(toolName: string): string {
  const key = (toolName || '').toLowerCase()
  if (
    key.includes('zing') ||
    key.includes('reply') ||
    key.includes('article') ||
    key.includes('poll')
  ) {
    return 'Published'
  }
  if (key.includes('dm')) return 'Message sent'
  if (key.includes('follow')) return 'Followed'
  if (key.includes('bookmark')) return 'Saved'
  if (key.includes('bio') || key.includes('profile')) return 'Profile updated'
  if (key.includes('mute')) return 'Account muted'
  if (key.includes('block')) return 'Account blocked'
  return 'Done'
}

function fieldValueToInputString(field: string, value: unknown): string {
  if (field === 'options' && Array.isArray(value)) {
    return value.map(item => String(item ?? '')).join('\n')
  }
  if (value === null || value === undefined) return ''
  return String(value)
}

function inputStringToFieldValue(field: string, text: string): unknown {
  if (field === 'options') {
    return text
      .split(/\r?\n/)
      .map(s => stripEmojisAndSymbols(s.trim()))
      .filter(Boolean)
      .slice(0, 4)
  }
  return stripEmojisAndSymbols(text)
}

export function QuantyActionCard({
  actionCard,
  compact = false,
  onExecuted,
  onCancelled,
}: QuantyActionCardProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantyThemeColors(t.name), [t.name])
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const {currentAccount, hasSession} = useSession()
  const requireAuth = useRequireAuth()

  const [card, setCard] = useState<QuantyActionCardPayload>(actionCard)
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>(
    () => ({...(actionCard.arguments || actionCard.args || {})}),
  )
  const [rawInputs, setRawInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    const source = actionCard.arguments || actionCard.args || {}
    for (const field of actionCard.editableFields || []) {
      initial[field] = fieldValueToInputString(field, source[field])
    }
    return initial
  })
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [status, setStatus] = useState<
    'pending' | 'previewing' | 'executing' | 'executed' | 'cancelled'
  >('pending')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<QuantyExecuteResponse | null>(null)

  const isDestructive = card.category === 'destructive'
  const cardSurface =
    colors.mode === 'dark'
      ? '#16181C'
      : colors.mode === 'dim'
        ? '#1E2732'
        : '#F7F9F9'
  const inputBg = colors.bg

  const handleFieldChange = useCallback((field: string, value: string) => {
    setRawInputs(prev => ({...prev, [field]: value}))
    setEditedArgs(prev => ({
      ...prev,
      [field]: inputStringToFieldValue(field, value),
    }))
    setIsDirty(true)
    setErrorMsg(null)
  }, [])

  const handleNavigateHint = useCallback(
    (hint: QuantyNavigationHint) => {
      try {
        navigation.dispatch(
          CommonActions.navigate({
            name: hint.screen,
            params: hint.params,
          }),
        )
      } catch {
        Toast.show('Open the target tab to view the updated item.', {
          type: 'info',
        })
      }
    },
    [navigation],
  )

  const handleApproveAndExecute = useCallback(async () => {
    const jwt = currentAccount?.accessJwt
    if (!hasSession || !jwt) {
      requireAuth(() => {})
      return
    }

    setErrorMsg(null)
    let activeCard = card
    let activeArgs = editedArgs

    const expiresMs = Date.parse(activeCard.expiresAt || '')
    const needsFreshPreview =
      isDirty ||
      activeCard.requiresAuth ||
      !activeCard.confirmationToken ||
      !Number.isFinite(expiresMs) ||
      expiresMs <= Date.now() + 5000

    try {
      if (needsFreshPreview) {
        setStatus('previewing')
        const previewRes = await executeQuantyTool(
          {
            toolName: activeCard.toolName,
            arguments: activeArgs,
            mode: 'preview',
            confirmed: false,
          },
          jwt,
        )
        if (
          !previewRes.ok ||
          previewRes.status !== 'PENDING_CONFIRMATION' ||
          !previewRes.actionCard
        ) {
          setStatus('pending')
          setErrorMsg(
            previewRes.message ||
              'Could not prepare updated details. Please review your inputs.',
          )
          return
        }
        activeCard = previewRes.actionCard
        activeArgs = previewRes.actionCard.arguments || activeArgs
        setCard(previewRes.actionCard)
        setEditedArgs(activeArgs)
        setIsDirty(false)
      }

      setStatus('executing')
      const execRes = await executeQuantyTool(
        {
          toolName: activeCard.toolName,
          arguments: activeArgs,
          mode: 'execute',
          confirmed: true,
          actionId: activeCard.actionId,
          confirmationToken: activeCard.confirmationToken,
          expiresAt: activeCard.expiresAt,
        },
        jwt,
      )

      if (!execRes.ok || execRes.status !== 'EXECUTED') {
        setStatus('pending')
        if (execRes.httpStatus === 410) {
          setIsDirty(true)
        }
        setErrorMsg(
          execRes.message || 'Could not complete this action. Please try again.',
        )
        return
      }

      setReceipt(execRes)
      setStatus('executed')

      if (Array.isArray(execRes.invalidateKeys)) {
        for (const key of execRes.invalidateKeys) {
          void queryClient.invalidateQueries({queryKey: [key]})
        }
      }

      Toast.show(
        stripEmojisAndSymbols(
          execRes.summary || getFriendlyReceiptHeading(activeCard.toolName),
        ),
        {type: 'success'},
      )
      onExecuted?.(execRes)
    } catch (err) {
      setStatus('pending')
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Network error while completing this action.',
      )
    }
  }, [
    card,
    currentAccount?.accessJwt,
    editedArgs,
    hasSession,
    isDirty,
    onExecuted,
    queryClient,
    requireAuth,
  ])

  const handleCancel = useCallback(() => {
    setStatus('cancelled')
    setErrorMsg(null)
    onCancelled?.(card.actionId)
  }, [card.actionId, onCancelled])

  const friendlyHeading = useMemo(
    () => getFriendlyActionHeading(card.toolName, card.title),
    [card.title, card.toolName],
  )

  if (status === 'cancelled') {
    return (
      <View style={[a.flex_row, a.align_center, a.py_2xs]}>
        <Text style={[a.text_xs, {color: colors.muted}]}>
          Cancelled · {stripEmojisAndSymbols(card.title)}
        </Text>
      </View>
    )
  }

  if (status === 'executed' && receipt) {
    const receiptTitle = getFriendlyReceiptHeading(card.toolName)
    return (
      <View
        testID={`quantyActionReceipt_${card.toolName}`}
        style={[
          compact ? a.p_sm : a.p_md,
          a.gap_sm,
          {
            borderRadius: 16,
            backgroundColor: cardSurface,
            borderWidth: 1,
            borderColor: colors.border,
          },
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <CheckCircleIcon size="sm" fill={colors.rezing} />
          <Text
            numberOfLines={1}
            style={[
              a.text_sm,
              a.font_bold,
              a.flex_1,
              {color: colors.text},
            ]}>
            {receiptTitle}
          </Text>
        </View>

        {receipt.summary ? (
          <Text
            style={[
              a.text_xs,
              {color: colors.muted, lineHeight: 19},
            ]}>
            {stripEmojisAndSymbols(receipt.summary)}
          </Text>
        ) : null}

        {receipt.navigationHint && (
          <View style={[a.flex_row, a.pt_2xs]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={receipt.navigationHint.label}
              onPress={() => handleNavigateHint(receipt.navigationHint!)}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.rounded_full,
                {
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor: colors.rezingSubtle,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text
                style={[a.text_xs, a.font_bold, {color: colors.rezingText}]}>
                {receipt.navigationHint.label}
              </Text>
              <OpenIcon size="xs" fill={colors.rezingText} />
            </Pressable>
          </View>
        )}
      </View>
    )
  }

  const editableFields = card.editableFields || []
  const busy = status === 'previewing' || status === 'executing'
  const resolvedHandle =
    typeof card.resolvedTarget?.handle === 'string'
      ? `@${card.resolvedTarget.handle}`
      : null

  return (
    <View
      testID={`quantyActionCard_${card.toolName}`}
      style={[
        compact ? a.p_sm : a.p_md,
        a.gap_sm,
        {
          borderRadius: 16,
          backgroundColor: cardSurface,
          borderWidth: 1,
          borderColor: isDestructive
            ? 'rgba(244, 33, 46, 0.45)'
            : colors.border,
        },
      ]}>
      {/* Clean Grok Confirmation Header */}
      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
        {isDestructive ? (
          <LockIcon size="xs" fill={colors.danger} />
        ) : (
          <SparkleIcon size="xs" fill={colors.text} />
        )}
        <Text
          numberOfLines={1}
          style={[
            compact ? a.text_xs : a.text_sm,
            a.font_bold,
            a.flex_1,
            {color: colors.text},
          ]}>
          {friendlyHeading}
        </Text>
      </View>

      {/* Human-readable Summary & Target */}
      {(card.summary || resolvedHandle) && (
        <View style={[a.gap_2xs]}>
          {card.summary ? (
            <Text
              style={[
                a.text_xs,
                {color: colors.muted, lineHeight: 19},
              ]}>
              {stripEmojisAndSymbols(card.summary)}
            </Text>
          ) : null}
          {resolvedHandle && (
            <Text
              style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
              {resolvedHandle}
            </Text>
          )}
        </View>
      )}

      {/* Editable Inputs */}
      {editableFields.length > 0 && (
        <View style={[a.gap_sm]}>
          {editableFields.map(field => {
            const isMulti = MULTILINE_FIELDS.has(field)
            const label = FIELD_LABELS[field] || field
            const isFocused = focusedField === field
            return (
              <View key={field} style={[a.gap_2xs]}>
                <Text
                  style={[
                    a.text_xs,
                    a.font_semi_bold,
                    {color: colors.muted, fontSize: 12},
                  ]}>
                  {label}
                </Text>
                <TextInput
                  value={rawInputs[field] ?? ''}
                  onChangeText={val => handleFieldChange(field, val)}
                  onFocus={() => setFocusedField(field)}
                  onBlur={() => setFocusedField(null)}
                  multiline={isMulti}
                  editable={!busy}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  placeholderTextColor={colors.muted}
                  style={[
                    a.text_sm,
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: inputBg,
                      color: colors.text,
                      borderWidth: 1,
                      borderColor: isFocused ? colors.accent : colors.border,
                      minHeight: isMulti ? (compact ? 64 : 84) : 40,
                      lineHeight: 20,
                      textAlignVertical: isMulti ? 'top' : 'center',
                    },
                    web({outlineStyle: 'none'} as any),
                  ]}
                />
              </View>
            )
          })}
          {isDirty && (
            <Text style={[a.text_2xs, {color: colors.muted}]}>
              Your edits will be applied when you approve.
            </Text>
          )}
        </View>
      )}

      {/* Inline Error */}
      {errorMsg && (
        <View
          style={[
            a.px_sm,
            a.py_xs,
            {
              borderRadius: 10,
              backgroundColor: 'rgba(244, 33, 46, 0.10)',
              borderWidth: 1,
              borderColor: 'rgba(244, 33, 46, 0.35)',
            },
          ]}>
          <Text style={[a.text_xs, {color: colors.danger}]}>
            {stripEmojisAndSymbols(errorMsg)}
          </Text>
        </View>
      )}

      {/* Footer Controls */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_sm,
          a.flex_wrap,
          a.pt_2xs,
        ]}>
        {!hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in to approve action"
            onPress={() => requireAuth(() => {})}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.rounded_full,
              {
                paddingHorizontal: 18,
                height: 36,
                backgroundColor: colors.ctaBg,
              },
              web({cursor: 'pointer'}),
            ]}>
            <LockIcon size="xs" fill={colors.ctaText} />
            <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
              Sign in to continue
            </Text>
          </Pressable>
        ) : (
          <Pressable
            testID={`quantyApproveBtn_${card.toolName}`}
            accessibilityRole="button"
            accessibilityLabel={`Approve and execute ${card.title}`}
            disabled={busy}
            onPress={() => void handleApproveAndExecute()}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.rounded_full,
              {
                paddingHorizontal: 18,
                height: 36,
                backgroundColor: isDestructive ? colors.danger : colors.ctaBg,
                opacity: busy ? 0.65 : 1,
              },
              web({cursor: 'pointer'}),
            ]}>
            {busy && (
              <ActivityIndicator
                size="small"
                color={isDestructive ? '#FFFFFF' : colors.ctaText}
              />
            )}
            <Text
              style={[
                a.text_xs,
                a.font_bold,
                {color: isDestructive ? '#FFFFFF' : colors.ctaText},
              ]}>
              {status === 'previewing'
                ? 'Preparing...'
                : status === 'executing'
                  ? 'Publishing...'
                  : 'Approve & Execute'}
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel proposed action"
          disabled={busy}
          onPress={handleCancel}
          style={[
            a.align_center,
            a.justify_center,
            a.rounded_full,
            {
              paddingHorizontal: 14,
              height: 36,
              opacity: busy ? 0.45 : 1,
            },
            web({cursor: 'pointer'}),
          ]}>
          <Text style={[a.text_xs, a.font_semi_bold, {color: colors.muted}]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
