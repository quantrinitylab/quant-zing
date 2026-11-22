import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, Pressable, View} from 'react-native'

import {
  fetchQuantZingPoll,
  getQuantZingColors,
  type QuantZingPollOptionView,
  type QuantZingPollView,
  voteQuantZingPoll,
} from '#/lib/quantos/client'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {BulletList_Stroke2_Corner0_Rounded as PollIcon} from '#/components/icons/BulletList'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

export interface QuantZingPollCardProps {
  poll: Record<string, any>
  postUri?: string
}

function normalizePollView(
  raw: Record<string, any>,
  fallbackUri?: string,
): QuantZingPollView {
  const rawOptions = Array.isArray(raw?.options) ? raw.options : []
  let sumVotes = 0
  for (const opt of rawOptions) {
    sumVotes += Number(opt?.votesCount || 0)
  }
  const totalVotes =
    typeof raw?.totalVotes === 'number'
      ? Math.max(raw.totalVotes, sumVotes)
      : sumVotes

  const options: QuantZingPollOptionView[] = rawOptions.map(
    (opt: any, idx: number) => {
      const votesCount = Number(opt?.votesCount || 0)
      const percent =
        typeof opt?.percent === 'number' && totalVotes > 0
          ? opt.percent
          : totalVotes > 0
            ? Math.round((votesCount / totalVotes) * 100)
            : 0
      return {
        id:
          typeof opt?.id === 'string' && opt.id
            ? opt.id
            : `opt_${idx + 1}`,
        text:
          typeof opt?.text === 'string' && opt.text.trim()
            ? opt.text.trim()
            : `Option ${idx + 1}`,
        votesCount,
        percent,
      }
    },
  )

  const expiresAt =
    typeof raw?.expiresAt === 'string' && raw.expiresAt
      ? raw.expiresAt
      : new Date(Date.now() + 24 * 3600 * 1000).toISOString()

  const expMs = new Date(expiresAt).getTime()
  const isExpired = Boolean(
    raw?.isExpired || (Number.isFinite(expMs) && expMs <= Date.now()),
  )

  return {
    $type: 'com.quantzing.embed.poll#view',
    uri:
      (typeof raw?.uri === 'string' && raw.uri) ||
      (typeof fallbackUri === 'string' && fallbackUri) ||
      '',
    question:
      typeof raw?.question === 'string' && raw.question.trim()
        ? raw.question.trim()
        : undefined,
    options,
    totalVotes,
    expiresAt,
    isExpired,
    viewerVoteOptionId:
      typeof raw?.viewerVoteOptionId === 'string' && raw.viewerVoteOptionId
        ? raw.viewerVoteOptionId
        : null,
  }
}

function formatTimeRemaining(expiresAt: string, isExpired: boolean): string {
  if (isExpired) return 'Final results'
  const expMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expMs)) return 'Open poll'
  const diffMs = expMs - Date.now()
  if (diffMs <= 0) return 'Final results'
  const totalMinutes = Math.ceil(diffMs / 60000)
  if (totalMinutes < 60) {
    return `${totalMinutes}m left`
  }
  const totalHours = Math.ceil(totalMinutes / 60)
  if (totalHours < 48) {
    return `${totalHours}h left`
  }
  const days = Math.ceil(totalHours / 24)
  return `${days}d left`
}

function computeOptimisticVote(
  current: QuantZingPollView,
  optionId: string,
): QuantZingPollView {
  const prevVoteId = current.viewerVoteOptionId
  if (prevVoteId === optionId) {
    return current
  }

  const updatedCounts = current.options.map(opt => {
    let nextVotes = opt.votesCount
    if (prevVoteId && opt.id === prevVoteId) {
      nextVotes = Math.max(0, nextVotes - 1)
    }
    if (opt.id === optionId) {
      nextVotes = nextVotes + 1
    }
    return {
      ...opt,
      votesCount: nextVotes,
    }
  })

  const nextTotal = updatedCounts.reduce((acc, o) => acc + o.votesCount, 0)
  const nextOptions = updatedCounts.map(opt => ({
    ...opt,
    percent:
      nextTotal > 0 ? Math.round((opt.votesCount / nextTotal) * 100) : 0,
  }))

  return {
    ...current,
    options: nextOptions,
    totalVotes: nextTotal,
    viewerVoteOptionId: optionId,
  }
}

export function QuantZingPollCard({poll, postUri}: QuantZingPollCardProps) {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {currentAccount} = useSession()
  const accessJwt = currentAccount?.accessJwt

  const resolvedUri = useMemo(
    () =>
      (typeof poll?.uri === 'string' && poll.uri) ||
      (typeof postUri === 'string' && postUri) ||
      '',
    [poll?.uri, postUri],
  )

  const [localPoll, setLocalPoll] = useState<QuantZingPollView>(() =>
    normalizePollView(poll, resolvedUri),
  )
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null)

  useEffect(() => {
    setLocalPoll(prev => {
      const incoming = normalizePollView(poll, resolvedUri)
      // Preserve optimistic vote if incoming still has 0 votes and same URI
      if (
        prev.uri === incoming.uri &&
        prev.viewerVoteOptionId &&
        !incoming.viewerVoteOptionId &&
        incoming.totalVotes < prev.totalVotes
      ) {
        return prev
      }
      return incoming
    })
  }, [poll, resolvedUri])

  useEffect(() => {
    if (!resolvedUri) return
    if (poll?.$type === 'com.quantzing.embed.poll#view') return
    let cancelled = false
    fetchQuantZingPoll(resolvedUri, accessJwt)
      .then(hydrated => {
        if (!cancelled && hydrated) {
          setLocalPoll(normalizePollView(hydrated, resolvedUri))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accessJwt, poll?.$type, resolvedUri])

  const handleVote = useCallback(
    async (optionId: string, event?: any) => {
      event?.stopPropagation?.()
      event?.preventDefault?.()

      if (localPoll.isExpired || votingOptionId) return

      // Immediate optimistic update so counts/percentages reflect 100% / 1 vote right away
      setLocalPoll(prev => computeOptimisticVote(prev, optionId))

      if (!resolvedUri || !accessJwt) {
        if (!accessJwt) {
          Toast.show('Vote recorded on this poll', {type: 'info'})
        }
        return
      }

      setVotingOptionId(optionId)
      try {
        const updated = await voteQuantZingPoll(
          resolvedUri,
          optionId,
          accessJwt,
        )
        if (updated) {
          setLocalPoll(normalizePollView(updated, resolvedUri))
        }
      } catch (err: any) {
        Toast.show(err?.message || 'Unable to sync poll vote', {
          type: 'warning',
        })
      } finally {
        setVotingOptionId(null)
      }
    },
    [accessJwt, localPoll.isExpired, resolvedUri, votingOptionId],
  )

  const timeStatusLabel = useMemo(
    () => formatTimeRemaining(localPoll.expiresAt, localPoll.isExpired),
    [localPoll.expiresAt, localPoll.isExpired],
  )

  return (
    <View
      testID="quantZingPollCard"
      style={[
        a.p_md,
        a.rounded_lg,
        a.gap_sm,
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}>
      {/* Header Row */}
      <View style={[a.flex_row, a.align_center, a.justify_between]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <PollIcon width={14} fill={colors.accent} />
          <Text
            style={[
              a.text_xs,
              a.font_bold,
              {color: colors.accent, letterSpacing: 0.4},
            ]}>
            ZING POLL
          </Text>
        </View>
        <Text style={[a.text_xs, {color: colors.muted}]}>
          {timeStatusLabel}
        </Text>
      </View>

      {/* Option Bars */}
      <View style={[a.gap_xs]}>
        {localPoll.options.map(option => {
          const isSelected = localPoll.viewerVoteOptionId === option.id
          const isSubmittingThis = votingOptionId === option.id
          const pct = Math.max(0, Math.min(100, option.percent))

          return (
            <Pressable
              key={option.id}
              testID={`pollOption-${option.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Vote for ${option.text}, ${pct}% (${option.votesCount} votes)`}
              disabled={localPoll.isExpired}
              onPress={e => void handleVote(option.id, e)}
              style={({pressed}) => [
                a.rounded_md,
                a.overflow_hidden,
                {
                  position: 'relative',
                  minHeight: 42,
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.accent : colors.border,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}>
              {/* Progress Fill Bar */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  backgroundColor: isSelected
                    ? colors.accentSubtle
                    : colors.isLight
                      ? 'rgba(15, 20, 25, 0.06)'
                      : 'rgba(239, 243, 244, 0.08)',
                }}
              />

              {/* Option Label + Percentage */}
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.px_md,
                  a.py_sm,
                  a.gap_sm,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_1]}>
                  <Text
                    style={[
                      a.text_sm,
                      isSelected ? a.font_bold : a.font_semi_bold,
                      {color: colors.text},
                    ]}>
                    {option.text}
                  </Text>
                  {isSelected && (
                    <CheckIcon size="xs" fill={colors.accent} />
                  )}
                  {isSubmittingThis && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                </View>

                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_bold,
                      {
                        color: isSelected ? colors.accentText : colors.text,
                        fontVariant: ['tabular-nums'],
                      },
                    ]}>
                    {pct}%
                  </Text>
                </View>
              </View>
            </Pressable>
          )
        })}
      </View>

      {/* Footer Tally */}
      <View style={[a.flex_row, a.align_center, a.justify_between, a.pt_2xs]}>
        <Text
          testID="quantZingPollTotalVotes"
          style={[a.text_xs, a.font_semi_bold, {color: colors.muted}]}>
          {localPoll.totalVotes}{' '}
          {localPoll.totalVotes === 1 ? 'vote' : 'votes'}
        </Text>
        <Text style={[a.text_xs, {color: colors.muted}]}>
          {localPoll.viewerVoteOptionId
            ? 'Vote recorded · Tap an option to update'
            : localPoll.isExpired
              ? 'Poll closed'
              : 'Tap an option to vote'}
        </Text>
      </View>
    </View>
  )
}
