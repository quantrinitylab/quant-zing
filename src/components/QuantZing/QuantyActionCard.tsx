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
import {CircleX_Stroke2_Corner0_Rounded as CancelIcon} from '#/components/icons/CircleX'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
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
  text: 'Message / Text',
  title: 'Title',
  subtitle: 'Subtitle',
  body: 'Article Body',
  topic: 'Topic',
  name: 'List Name',
  description: 'Description / Bio',
  displayName: 'Display Name',
  recipient: 'Recipient Handle',
  actor: 'Account Handle',
  postUri: 'Target Zing URI',
  options: 'Poll Options (one per line)',
}

const MULTILINE_FIELDS = new Set(['text', 'body', 'description', 'options'])

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
  const [isDirty, setIsDirty] = useState(false)
  const [status, setStatus] = useState<
    'pending' | 'previewing' | 'executing' | 'executed' | 'cancelled'
  >('pending')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<QuantyExecuteResponse | null>(null)

  const isDestructive = card.category === 'destructive'
  const badgeColor = isDestructive ? colors.danger : colors.accent
  const badgeBg = isDestructive
    ? 'rgba(244, 33, 46, 0.14)'
    : colors.accentSubtle

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
              'Could not verify updated action parameters. Check your inputs.',
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
          execRes.message || 'Action could not be completed. Please try again.',
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

      Toast.show(execRes.summary || `${activeCard.title} completed`, {
        type: 'success',
      })
      onExecuted?.(execRes)
    } catch (err) {
      setStatus('pending')
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Network error while executing Quanty action.',
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

  if (status === 'cancelled') {
    return (
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_xs,
          a.px_sm,
          a.py_xs,
          a.rounded_md,
          {
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.border,
          },
        ]}>
        <CancelIcon size="xs" fill={colors.muted} />
        <Text style={[a.text_xs, {color: colors.muted}]}>
          Cancelled: {stripEmojisAndSymbols(card.title)}
        </Text>
      </View>
    )
  }

  if (status === 'executed' && receipt) {
    return (
      <View
        testID={`quantyActionReceipt_${card.toolName}`}
        style={[
          compact ? a.p_sm : a.p_md,
          a.rounded_lg,
          a.gap_xs,
          {
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.rezing,
          },
        ]}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_between,
            a.gap_xs,
          ]}>
          <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
            <CheckCircleIcon size="sm" fill={colors.rezing} />
            <Text
              numberOfLines={1}
              style={[a.text_xs, a.font_bold, {color: colors.text}]}>
              {stripEmojisAndSymbols(card.title)} Executed
            </Text>
          </View>
          {typeof receipt.latencyMs === 'number' && (
            <Text style={[a.text_2xs, {color: colors.muted}]}>
              {receipt.latencyMs}ms
            </Text>
          )}
        </View>

        <Text style={[a.text_xs, a.leading_snug, {color: colors.text}]}>
          {stripEmojisAndSymbols(receipt.summary || 'Action persisted on QuantZing.')}
        </Text>

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
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor: colors.rezingSubtle,
                  borderWidth: 1,
                  borderColor: colors.rezing,
                },
                web({cursor: 'pointer'}),
              ]}>
              <Text
                style={[a.text_xs, a.font_bold, {color: colors.rezing}]}>
                {receipt.navigationHint.label}
              </Text>
              <OpenIcon size="xs" fill={colors.rezing} />
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
        a.rounded_lg,
        a.gap_sm,
        {
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: isDestructive ? colors.danger : colors.border,
        },
      ]}>
      {/* Header Row */}
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.gap_xs,
          a.flex_wrap,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
          {isDestructive ? (
            <LockIcon size="xs" fill={colors.danger} />
          ) : (
            <ShieldIcon size="xs" fill={colors.accent} />
          )}
          <Text
            numberOfLines={1}
            style={[a.text_xs, a.font_bold, {color: colors.text}]}>
            {stripEmojisAndSymbols(card.title)}
          </Text>
        </View>
        <View
          style={[
            a.px_xs,
            {
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: badgeBg,
            },
          ]}>
          <Text style={[a.text_2xs, a.font_bold, {color: badgeColor}]}>
            {isDestructive ? 'Destructive Gate' : 'Approval Required'}
          </Text>
        </View>
      </View>

      {/* Human-readable Summary & Target */}
      <View style={[a.gap_2xs]}>
        <Text style={[a.text_xs, a.leading_snug, {color: colors.text}]}>
          {stripEmojisAndSymbols(card.summary)}
        </Text>
        {resolvedHandle && (
          <Text style={[a.text_2xs, {color: colors.muted}]}>
            Target: {resolvedHandle}
          </Text>
        )}
      </View>

      {/* Editable Inputs */}
      {editableFields.length > 0 && (
        <View style={[a.gap_xs]}>
          {editableFields.map(field => {
            const isMulti = MULTILINE_FIELDS.has(field)
            const label = FIELD_LABELS[field] || field
            return (
              <View key={field} style={[a.gap_2xs]}>
                <Text
                  style={[a.text_2xs, a.font_semi_bold, {color: colors.muted}]}>
                  {label}
                </Text>
                <TextInput
                  value={rawInputs[field] ?? ''}
                  onChangeText={val => handleFieldChange(field, val)}
                  multiline={isMulti}
                  editable={!busy}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  placeholderTextColor={colors.muted}
                  style={[
                    a.text_xs,
                    a.px_sm,
                    a.py_xs,
                    a.rounded_md,
                    {
                      backgroundColor: colors.card,
                      color: colors.text,
                      borderWidth: 1,
                      borderColor: colors.border,
                      minHeight: isMulti ? (compact ? 54 : 72) : 34,
                      textAlignVertical: isMulti ? 'top' : 'center',
                    },
                    web({outlineStyle: 'none'} as any),
                  ]}
                />
              </View>
            )
          })}
          {isDirty && (
            <Text style={[a.text_2xs, {color: colors.accent}]}>
              Parameters edited — a fresh cryptographic approval signature will
              be verified on execute.
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
            a.rounded_md,
            {
              backgroundColor: 'rgba(244, 33, 46, 0.12)',
              borderWidth: 1,
              borderColor: colors.danger,
            },
          ]}>
          <Text style={[a.text_2xs, {color: colors.danger}]}>
            {stripEmojisAndSymbols(errorMsg)}
          </Text>
        </View>
      )}

      {/* Footer Controls */}
      <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
        {!hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in to execute action"
            onPress={() => requireAuth(() => {})}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              a.px_md,
              a.py_xs,
              a.rounded_full,
              {backgroundColor: colors.ctaBg},
              web({cursor: 'pointer'}),
            ]}>
            <LockIcon size="xs" fill={colors.ctaText} />
            <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
              Sign in to Execute
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
              a.px_md,
              a.py_xs,
              a.rounded_full,
              {
                backgroundColor: isDestructive ? colors.danger : colors.ctaBg,
                opacity: busy ? 0.6 : 1,
              },
              web({cursor: 'pointer'}),
            ]}>
            {busy ? (
              <ActivityIndicator
                size="small"
                color={isDestructive ? '#FFFFFF' : colors.ctaText}
              />
            ) : (
              <ShieldIcon
                size="xs"
                fill={isDestructive ? '#FFFFFF' : colors.ctaText}
              />
            )}
            <Text
              style={[
                a.text_xs,
                a.font_bold,
                {color: isDestructive ? '#FFFFFF' : colors.ctaText},
              ]}>
              {status === 'previewing'
                ? 'Verifying...'
                : status === 'executing'
                  ? 'Executing...'
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
            a.px_md,
            a.py_xs,
            a.rounded_full,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: busy ? 0.5 : 1,
            },
            web({cursor: 'pointer'}),
          ]}>
          <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
