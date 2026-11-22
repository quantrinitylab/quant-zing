import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import {setStringAsync} from 'expo-clipboard'

import {
  fetchSupportTickets,
  getQuantZingColors,
  submitSupportTicket,
  type SupportTicket,
} from '#/lib/quantos/client'
import {useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronTop_Stroke2_Corner0_Rounded as ChevronUpIcon,
} from '#/components/icons/Chevron'
import {CircleQuestion_Stroke2_Corner2_Rounded as QuestionIcon} from '#/components/icons/Circle'
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {Newspaper_Stroke2_Corner2_Rounded as ArticleIcon} from '#/components/icons/Newspaper'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {Repost_Stroke2_Corner2_Rounded as RezingIcon} from '#/components/icons/Repost'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import {Sparkle_Stroke2_Corner0_Rounded as SparkleIcon} from '#/components/icons/Sparkle'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface QuickGuide {
  id: string
  title: string
  category: string
  summary: string
  steps: string[]
  route?: string
  routeLabel?: string
}

interface FaqItem {
  id: string
  question: string
  answer: string
  category: string
}

const SUPPORT_CATEGORIES = [
  'General Support',
  'Feature & Feedback',
  'Bug Report',
  'Account & Verification',
  'Billing & Pro',
]

const QUICK_GUIDES: QuickGuide[] = [
  {
    id: 'zings-rezings',
    title: 'How Zings, Polls & Rezings Work',
    category: 'Core Feed',
    summary:
      'Publish real-time Zings and interactive polls, amplify voices with Rezings, and organize conversations with threads and bookmarks.',
    steps: [
      'Use the inline Zing composer or tap "New Zing" in the left sidebar to publish updates with photos, videos, interactive polls, or quotes.',
      'Rezing to share a post directly to your followers, or Quote Zing to add your own commentary.',
      'Save high-signal Zings to your private Bookmarks tab anytime for quick reference.',
    ],
  },
  {
    id: 'quanty',
    title: 'Using Quanty',
    category: 'Intelligence',
    summary:
      'Ask questions, fact-check live threads, summarize breaking news, and draft Zings with Quanty.',
    steps: [
      'Open Quanty from the sidebar or floating dock to use Ask, DeepSearch, Draft Zing, or News.',
      'Tap the Quanty icon on any Zing in your feed to explain and cross-check claims against live sources.',
      'Use "Send as Zing" on any Quanty answer to open the Zing composer with a ready-to-share draft.',
    ],
    route: '/quanty',
    routeLabel: 'Open Quanty',
  },
  {
    id: 'articles-spaces',
    title: 'Creating Articles & ZingSpaces',
    category: 'Publishing',
    summary:
      'Write rich long-form essays in Articles Studio and host live conversations in ZingSpaces.',
    steps: [
      'Open Articles Studio to compose long-form essays with custom cover presets, blob cover uploads, markdown sections, and one-click Zing sharing.',
      'Drafts and published essays persist directly to your Sovereign PDS account so you can access them across devices.',
      'Launch or join live rooms in ZingSpaces with real-time participant sync, raised hands, and stage reactions.',
    ],
    route: '/articles',
    routeLabel: 'Open Articles Studio',
  },
  {
    id: 'creator-pro',
    title: 'Creator Studio & QuantZing Pro',
    category: 'Monetization',
    summary:
      'Track real impression analytics, unlock Verified status, and enroll in 70/30 creator revenue share.',
    steps: [
      'Visit Creator Studio to inspect real view impressions, engagement velocity, top Zings, and 70/30 payout eligibility.',
      'Upgrade to QuantZing Pro for your Verified Checkmark badge, priority Quanty access, and creator tools.',
      'Eligible Pro creators can enroll in 70/30 creator monetization directly inside Creator Studio.',
    ],
    route: '/studio',
    routeLabel: 'Open Creator Studio',
  },
  {
    id: 'account-security',
    title: 'Account Security & Sovereignty',
    category: 'Security',
    summary:
      'Protect your @handle.quantzing.com identity on Sovereign ATProto.',
    steps: [
      'Use a strong unique password and review your active sessions in Settings.',
      'Your @handle.quantzing.com identity is backed by a portable Decentralized Identifier (DID) on Sovereign PDS.',
      'Submit a support ticket below or contact support@quantzing.com anytime for account assistance.',
    ],
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-handle',
    category: 'Account',
    question: 'What is my @handle.quantzing.com identity and do I own it?',
    answer:
      'Every QuantZing member receives a @handle.quantzing.com handle linked to a portable Decentralized Identifier (DID) persisted on Sovereign PDS.',
  },
  {
    id: 'faq-quanty',
    category: 'Quanty',
    question: 'How does Quanty protect my privacy?',
    answer:
      'Quanty processes only the prompt and public Zing context you submit. Quanty never accesses or trains on your private Direct Messages, saved Bookmarks, or unpublished Article drafts.',
  },
  {
    id: 'faq-payouts',
    category: 'Monetization',
    question: 'How do 70/30 creator payouts work?',
    answer:
      'Creators subscribed to QuantZing Pro who meet audience and 30-day impression thresholds can enroll in monetization inside Creator Studio to earn 70% of verified net ad revenue.',
  },
  {
    id: 'faq-privacy',
    category: 'Privacy',
    question: 'Are my Direct Messages, Bookmarks, and Article drafts private?',
    answer:
      'Yes. While public Zings, Replies, Rezings, and published Articles are public records on the network, your Direct Messages (Chat), saved Bookmarks, unpublished Article drafts, and muted words remain strictly private.',
  },
  {
    id: 'faq-moderation',
    category: 'Safety',
    question: 'How do I report spam, harassment, or mute unwanted topics?',
    answer:
      'Tap the three-dot menu on any Zing or profile to mute words, block accounts, or submit a moderation report. You can also manage muted keywords, thread reply limits, and moderation lists anytime inside Settings.',
  },
]

function GuideIcon({id, color}: {id: string; color: string}) {
  switch (id) {
    case 'zings-rezings':
      return <RezingIcon size="md" fill={color} />
    case 'quanty':
      return <SparkleIcon size="md" fill={color} />
    case 'articles-spaces':
      return <ArticleIcon size="md" fill={color} />
    case 'creator-pro':
      return <GrowthIcon size="md" fill={color} />
    default:
      return <LockIcon size="md" fill={color} />
  }
}

function formatTicketDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function HelpScreen() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {hasSession, currentAccount} = useSession()
  const accessJwt = currentAccount?.accessJwt

  const [searchQuery, setSearchQuery] = useState('')
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id)

  // Support ticket submission & history state
  const [ticketCategory, setTicketCategory] = useState<string>(
    SUPPORT_CATEGORIES[0],
  )
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketEmail, setTicketEmail] = useState(
    currentAccount?.email || '',
  )
  const [ticketMessage, setTicketMessage] = useState('')
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false)
  const [lastSubmittedTicket, setLastSubmittedTicket] =
    useState<SupportTicket | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  useEffect(() => {
    if (currentAccount?.email && !ticketEmail) {
      setTicketEmail(currentAccount.email)
    }
  }, [currentAccount?.email, ticketEmail])

  const loadTicketHistory = useCallback(async () => {
    if (!hasSession || !accessJwt) {
      setTickets([])
      return
    }
    setLoadingTickets(true)
    try {
      const list = await fetchSupportTickets(accessJwt)
      setTickets(list)
    } catch {
      // Ignore if offline
    } finally {
      setLoadingTickets(false)
    }
  }, [accessJwt, hasSession])

  useEffect(() => {
    void loadTicketHistory()
  }, [loadTicketHistory])

  const handleSubmitTicket = useCallback(async () => {
    const cleanSubject = ticketSubject.trim()
    const cleanMessage = ticketMessage.trim()
    if (!cleanSubject) {
      Toast.show('Enter a short subject for your support ticket', {
        type: 'warning',
      })
      return
    }
    if (!cleanMessage) {
      Toast.show('Describe your question, feedback, or issue', {
        type: 'warning',
      })
      return
    }
    if (isSubmittingTicket) return

    setIsSubmittingTicket(true)
    try {
      const created = await submitSupportTicket(
        {
          category: ticketCategory,
          subject: cleanSubject,
          message: cleanMessage,
          email: ticketEmail.trim() || currentAccount?.email || undefined,
        },
        accessJwt,
      )
      setLastSubmittedTicket(created)
      setTickets(prev => [created, ...prev.filter(tItem => tItem.id !== created.id)])
      setTicketSubject('')
      setTicketMessage('')
      Toast.show(`Support ticket #${created.id} submitted`, {
        type: 'success',
      })
    } catch (err: any) {
      Toast.show(err?.message || 'Unable to submit support ticket', {
        type: 'warning',
      })
    } finally {
      setIsSubmittingTicket(false)
    }
  }, [
    accessJwt,
    currentAccount?.email,
    isSubmittingTicket,
    ticketCategory,
    ticketEmail,
    ticketMessage,
    ticketSubject,
  ])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredGuides = useMemo(() => {
    if (!normalizedQuery) return QUICK_GUIDES
    return QUICK_GUIDES.filter(
      g =>
        g.title.toLowerCase().includes(normalizedQuery) ||
        g.summary.toLowerCase().includes(normalizedQuery) ||
        g.category.toLowerCase().includes(normalizedQuery) ||
        g.steps.some(step => step.toLowerCase().includes(normalizedQuery)),
    )
  }, [normalizedQuery])

  const filteredFaqs = useMemo(() => {
    if (!normalizedQuery) return FAQ_ITEMS
    return FAQ_ITEMS.filter(
      item =>
        item.question.toLowerCase().includes(normalizedQuery) ||
        item.answer.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery),
    )
  }, [normalizedQuery])

  const handleCopySupportEmail = () => {
    void setStringAsync('support@quantzing.com')
    Toast.show('Copied support@quantzing.com to clipboard', {type: 'success'})
  }

  return (
    <Layout.Screen testID="helpScreen" style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <QuestionIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Help Center & Support
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Guides, FAQs & Direct Support Tickets
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {/* Hero Search Banner */}
        <View
          style={[
            a.p_lg,
            a.rounded_lg,
            a.gap_md,
            {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          <View style={[a.gap_xs]}>
            <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
              How can we help you on QuantZing?
            </Text>
            <Text style={[a.text_sm, {color: colors.muted}]}>
              Search quick-start guides, Quanty tips, creator payouts, or submit
              a persisted support ticket below.
            </Text>
          </View>

          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_sm,
              a.px_md,
              a.py_sm,
              a.rounded_full,
              {
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <SearchIcon size="sm" fill={colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search guides & FAQs (e.g. Quanty, payouts, handle, polls)..."
              placeholderTextColor={colors.muted}
              style={[
                a.flex_1,
                a.text_sm,
                {color: colors.text},
                web({outlineStyle: 'none'} as any),
              ]}
            />
            {searchQuery.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearchQuery('')}>
                <Text
                  style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                  Clear
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Persisted Support & Feedback Ticket Submission Form */}
        <View
          testID="supportTicketFormCard"
          style={[
            a.p_lg,
            a.rounded_lg,
            a.gap_md,
            {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          <View style={[a.flex_row, a.align_center, a.justify_between]}>
            <View style={[a.flex_1, a.gap_2xs]}>
              <Text style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                Submit a Support or Feedback Ticket
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Persisted directly to Sovereign PDS for QuantZing Support review
              </Text>
            </View>
            <View
              style={[
                a.px_sm,
                a.py_2xs,
                a.rounded_full,
                {backgroundColor: colors.accentSubtle},
              ]}>
              <Text
                style={[{fontSize: 11, fontWeight: '700', color: colors.accent}]}>
                Direct Ticket
              </Text>
            </View>
          </View>

          {/* Category Pills */}
          <View style={[a.gap_xs]}>
            <Text style={[a.text_xs, a.font_bold, {color: colors.muted}]}>
              CATEGORY
            </Text>
            <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
              {SUPPORT_CATEGORIES.map(cat => {
                const selected = ticketCategory === cat
                return (
                  <Pressable
                    key={cat}
                    accessibilityRole="button"
                    onPress={() => setTicketCategory(cat)}
                    style={[
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: selected
                          ? colors.accentSubtle
                          : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: selected ? colors.accent : colors.text},
                      ]}>
                      {cat}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <TextInput
            testID="supportTicketSubjectInput"
            value={ticketSubject}
            onChangeText={setTicketSubject}
            placeholder="Subject (e.g. Verification request, bug report, feature idea)"
            placeholderTextColor={colors.muted}
            style={[
              a.text_sm,
              a.px_md,
              a.py_sm,
              a.rounded_md,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              },
              web({outlineStyle: 'none'} as any),
            ]}
          />

          {!hasSession && (
            <TextInput
              testID="supportTicketEmailInput"
              value={ticketEmail}
              onChangeText={setTicketEmail}
              placeholder="Contact email (optional)"
              placeholderTextColor={colors.muted}
              style={[
                a.text_sm,
                a.px_md,
                a.py_sm,
                a.rounded_md,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                web({outlineStyle: 'none'} as any),
              ]}
            />
          )}

          <TextInput
            testID="supportTicketMessageInput"
            value={ticketMessage}
            onChangeText={setTicketMessage}
            placeholder="Describe what happened or what you would like us to build..."
            placeholderTextColor={colors.muted}
            multiline
            style={[
              a.text_sm,
              a.px_md,
              a.py_sm,
              a.rounded_md,
              {
                minHeight: 88,
                textAlignVertical: 'top',
                backgroundColor: colors.surface,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
              },
              web({outlineStyle: 'none'} as any),
            ]}
          />

          {lastSubmittedTicket && (
            <View
              testID="supportTicketSubmittedBanner"
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.p_sm,
                a.rounded_md,
                {
                  backgroundColor: colors.rezingSubtle,
                  borderWidth: 1,
                  borderColor: colors.rezing,
                },
              ]}>
              <CheckIcon size="xs" fill={colors.rezing} />
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Ticket #{lastSubmittedTicket.id} ({lastSubmittedTicket.category})
                received — status: {lastSubmittedTicket.status.toUpperCase()}
              </Text>
            </View>
          )}

          <View style={[a.flex_row, a.align_center, a.justify_between]}>
            <Text style={[a.text_xs, {color: colors.muted}]}>
              {hasSession && currentAccount?.handle
                ? `Submitting as @${currentAccount.handle}`
                : 'Submitting to QuantZing Support queue'}
            </Text>

            <Pressable
              testID="submitSupportTicketBtn"
              accessibilityRole="button"
              accessibilityLabel="Submit Support Ticket"
              disabled={isSubmittingTicket}
              onPress={() => void handleSubmitTicket()}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {
                  backgroundColor: colors.ctaBg,
                  opacity: isSubmittingTicket ? 0.6 : 1,
                },
              ]}>
              {isSubmittingTicket ? (
                <ActivityIndicator size="small" color={colors.ctaText} />
              ) : (
                <SendIcon size="xs" fill={colors.ctaText} />
              )}
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Submit Ticket
              </Text>
            </Pressable>
          </View>
        </View>

        {/* User's Submitted Support Ticket History */}
        {(hasSession || tickets.length > 0) && (
          <View
            testID="supportTicketHistoryCard"
            style={[
              a.p_lg,
              a.rounded_lg,
              a.gap_sm,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <View style={[a.flex_row, a.align_center, a.justify_between]}>
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                Your Support Tickets ({tickets.length})
              </Text>
              {hasSession && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadTicketHistory()}>
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: colors.accent},
                    ]}>
                    Refresh
                  </Text>
                </Pressable>
              )}
            </View>

            {loadingTickets ? (
              <View style={[a.py_md, a.align_center]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : tickets.length === 0 ? (
              <Text style={[a.text_xs, {color: colors.muted}]}>
                No support tickets submitted yet.
              </Text>
            ) : (
              <View style={[a.gap_xs]}>
                {tickets.map(ticket => (
                  <View
                    key={ticket.id}
                    style={[
                      a.p_sm,
                      a.rounded_md,
                      a.gap_2xs,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
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
                          {color: colors.accent},
                        ]}>
                        #{ticket.id} · {ticket.category}
                      </Text>
                      <View
                        style={[
                          a.px_xs,
                          {
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor:
                              ticket.status === 'resolved'
                                ? colors.rezingSubtle
                                : colors.accentSubtle,
                          },
                        ]}>
                        <Text
                          style={[
                            {
                              fontSize: 10,
                              fontWeight: '700',
                              color:
                                ticket.status === 'resolved'
                                  ? colors.rezing
                                  : colors.accent,
                            },
                          ]}>
                          {(ticket.status || 'open').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        a.text_sm,
                        a.font_semi_bold,
                        {color: colors.text},
                      ]}>
                      {ticket.subject}
                    </Text>
                    {ticket.createdAt && (
                      <Text style={[{fontSize: 11, color: colors.muted}]}>
                        Submitted {formatTicketDate(ticket.createdAt)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Quick-Start Guides */}
        <View style={[a.gap_sm]}>
          <Text
            style={[a.text_md, a.font_bold, a.px_xs, {color: colors.text}]}>
            Quick-Start Guides
          </Text>

          {filteredGuides.length === 0 ? (
            <View
              style={[
                a.p_lg,
                a.rounded_lg,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[a.text_sm, {color: colors.muted}]}>
                No quick-start guides match "{searchQuery}". Try another keyword
                or submit a support ticket above.
              </Text>
            </View>
          ) : (
            filteredGuides.map(guide => (
              <View
                key={guide.id}
                style={[
                  a.p_lg,
                  a.rounded_lg,
                  a.gap_sm,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                  <View
                    style={[
                      a.align_center,
                      a.justify_center,
                      a.rounded_full,
                      {
                        width: 36,
                        height: 36,
                        backgroundColor: colors.accentSubtle,
                      },
                    ]}>
                    <GuideIcon id={guide.id} color={colors.accent} />
                  </View>
                  <View style={[a.flex_1]}>
                    <Text
                      style={[a.text_md, a.font_bold, {color: colors.text}]}>
                      {guide.title}
                    </Text>
                    <Text style={[a.text_xs, {color: colors.accent}]}>
                      {guide.category}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[
                    a.text_sm,
                    a.leading_relaxed,
                    {color: colors.muted},
                  ]}>
                  {guide.summary}
                </Text>

                <View
                  style={[
                    a.gap_xs,
                    a.p_md,
                    a.rounded_md,
                    {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}>
                  {guide.steps.map((step, idx) => (
                    <View key={idx} style={[a.flex_row, a.gap_sm]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.accent, minWidth: 16},
                        ]}>
                        {idx + 1}.
                      </Text>
                      <Text
                        style={[
                          a.text_sm,
                          a.leading_snug,
                          a.flex_1,
                          {color: colors.text},
                        ]}>
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>

                {guide.route && guide.routeLabel && (
                  <View style={[a.flex_row, a.pt_2xs]}>
                    <Link
                      to={guide.route}
                      label={guide.routeLabel}
                      style={[
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.accentSubtle,
                          borderWidth: 1,
                          borderColor: colors.accent,
                        },
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.accent},
                        ]}>
                        {guide.routeLabel}
                      </Text>
                    </Link>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Interactive FAQ Accordion */}
        <View style={[a.gap_sm]}>
          <Text
            style={[a.text_md, a.font_bold, a.px_xs, {color: colors.text}]}>
            Frequently Asked Questions
          </Text>

          <View
            style={[
              a.rounded_lg,
              a.overflow_hidden,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            {filteredFaqs.length === 0 ? (
              <View style={[a.p_lg]}>
                <Text style={[a.text_sm, {color: colors.muted}]}>
                  No FAQs match "{searchQuery}".
                </Text>
              </View>
            ) : (
              filteredFaqs.map((item, idx) => {
                const isOpen = openFaqId === item.id
                return (
                  <View
                    key={item.id}
                    style={[
                      idx > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      },
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{expanded: isOpen}}
                      accessibilityLabel={item.question}
                      onPress={() =>
                        setOpenFaqId(prev =>
                          prev === item.id ? null : item.id,
                        )
                      }
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.justify_between,
                        a.gap_md,
                        a.p_lg,
                      ]}>
                      <View style={[a.flex_1, a.gap_2xs]}>
                        <Text
                          style={[
                            a.text_xs,
                            a.font_semi_bold,
                            {color: colors.accent},
                          ]}>
                          {item.category}
                        </Text>
                        <Text
                          style={[
                            a.text_sm,
                            a.font_bold,
                            {color: colors.text},
                          ]}>
                          {item.question}
                        </Text>
                      </View>
                      {isOpen ? (
                        <ChevronUpIcon size="sm" fill={colors.muted} />
                      ) : (
                        <ChevronDownIcon size="sm" fill={colors.muted} />
                      )}
                    </Pressable>

                    {isOpen && (
                      <View
                        style={[
                          a.px_lg,
                          a.pb_lg,
                          {backgroundColor: colors.card},
                        ]}>
                        <Text
                          style={[
                            a.text_sm,
                            a.leading_relaxed,
                            {color: colors.muted},
                          ]}>
                          {item.answer}
                        </Text>
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* Direct Support Contact Card */}
        <View
          style={[
            a.p_lg,
            a.rounded_lg,
            a.gap_md,
            {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}>
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <View
              style={[
                a.align_center,
                a.justify_center,
                a.rounded_full,
                {
                  width: 40,
                  height: 40,
                  backgroundColor: colors.accentSubtle,
                },
              ]}>
              <EnvelopeIcon size="md" fill={colors.accent} />
            </View>
            <View style={[a.flex_1]}>
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                Direct QuantZing Support Email
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Prefer email? Reach our team at support@quantzing.com
              </Text>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            Include your @handle.quantzing.com username and ticket ID so our
            team can resolve your request quickly.
          </Text>

          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Email support@quantzing.com"
              onPress={() =>
                void Linking.openURL(
                  'mailto:support@quantzing.com?subject=QuantZing%20Support%20Request',
                )
              }
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Email support@quantzing.com
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy support email address"
              onPress={handleCopySupportEmail}
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Copy Email
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              a.flex_row,
              a.flex_wrap,
              a.gap_md,
              a.pt_sm,
              {borderTopWidth: 1, borderTopColor: colors.border},
            ]}>
            <Link
              to="/terms"
              label="Terms of Service"
              style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ArticleIcon size="xs" fill={colors.accent} />
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                Terms of Service
              </Text>
            </Link>
            <Link
              to="/privacy"
              label="Privacy Policy"
              style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldIcon size="xs" fill={colors.accent} />
              <Text
                style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                Privacy Policy
              </Text>
            </Link>
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
