import {useMemo, useState} from 'react'
import {Linking, Pressable, TextInput, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'

import {getQuantZingColors} from '#/lib/quantos/client'
import {atoms as a, useTheme, web} from '#/alf'
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

const QUICK_GUIDES: QuickGuide[] = [
  {
    id: 'zings-rezings',
    title: 'How Zings & Rezings Work',
    category: 'Core Feed',
    summary:
      'Publish real-time Zings, amplify voices with Rezings, and organize conversations with threads and bookmarks.',
    steps: [
      'Tap "New Zing" in the left sidebar to publish updates with photos, videos, GIFs, or quotes.',
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
      'Write rich long-form essays in Articles Studio and host live audio conversations in ZingSpaces.',
    steps: [
      'Open Articles Studio to compose long-form essays with custom cover presets, markdown sections, and one-click Zing sharing.',
      'Drafts save automatically in local storage so you can write offline without losing progress.',
      'Launch or join live audio rooms in ZingSpaces to speak directly with your audience in real time.',
    ],
    route: '/articles',
    routeLabel: 'Open Articles Studio',
  },
  {
    id: 'creator-pro',
    title: 'Creator Studio & QuantZing Pro',
    category: 'Monetization',
    summary:
      'Track audience analytics, unlock Verified status, and earn 70/30 ad revenue share.',
    steps: [
      'Visit Creator Studio to inspect impressions, engagement velocity, top Zings, and 70/30 payout readiness.',
      'Upgrade to Zing Basic, Zing Pro, or Zing Pro+ for extended Zings, 4K video, and priority Quanty access.',
      'Eligible Pro creators earn 70% of net ad revenue directly to their connected payout account.',
    ],
    route: '/studio',
    routeLabel: 'Open Creator Studio',
  },
  {
    id: 'account-security',
    title: 'Account Security & Recovery',
    category: 'Security',
    summary:
      'Protect your @handle.quantzing.com identity with strong credentials, 2FA, and App Passwords.',
    steps: [
      'Use a unique password of at least 8 characters and enable email or authenticator 2FA in Privacy & Security settings.',
      'Create scoped App Passwords when connecting third-party tools instead of sharing your main password.',
      'Use "Forgot password?" on the Sign In screen anytime to send a verification reset code to your account email.',
    ],
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-handle',
    category: 'Account',
    question: 'What is my @handle.quantzing.com identity and do I own it?',
    answer:
      'Every QuantZing member receives a @handle.quantzing.com handle linked to a portable Decentralized Identifier (DID). You can also attach your own custom domain via DNS and export your full repository and follower graph at any time with zero lock-in.',
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
      'Creators subscribed to Zing Pro or Zing Pro+ who meet organic audience and engagement thresholds can enable monetization in Creator Studio. Creators receive 70% of verified net ad revenue generated on their eligible content.',
  },
  {
    id: 'faq-privacy',
    category: 'Privacy',
    question: 'Are my Direct Messages, Bookmarks, and Article drafts private?',
    answer:
      'Yes. While public Zings, Replies, Rezings, and published Articles are public records on the network, your Direct Messages (Chat), saved Bookmarks, unpublished Article drafts, and muted words remain strictly private and are never published to the public feed.',
  },
  {
    id: 'faq-moderation',
    category: 'Safety',
    question: 'How do I report spam, harassment, or mute unwanted topics?',
    answer:
      'Tap the three-dot menu on any Zing or profile to mute words, block accounts, or submit a moderation report. You can also manage muted keywords, thread reply limits, and moderation lists anytime inside Settings.',
  },
  {
    id: 'faq-export',
    category: 'Account',
    question: 'Can I export my data or delete my QuantZing account?',
    answer:
      'Yes. You retain complete data ownership. You can download your signed repository archive or initiate permanent account deletion directly from Settings, or contact privacy@quantzing.com for assistance.',
  },
  {
    id: 'faq-password',
    category: 'Security',
    question: 'I forgot my password — how do I recover my account?',
    answer:
      'Open the Sign In screen and tap "Forgot password?". Enter the email address registered to your QuantZing account to receive a one-time recovery code and set a new password immediately.',
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

export function HelpScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id)

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
              Help Center
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Guides, FAQs & Direct QuantZing Support
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
              Search quick-start guides, Quanty tips, creator payouts, or
              account recovery answers.
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
              placeholder="Search guides & FAQs (e.g. Quanty, payouts, handle, 2FA)..."
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

        {/* Quick-Start Guides */}
        <View style={[a.gap_sm]}>
          <Text
            style={[
              a.text_md,
              a.font_bold,
              a.px_xs,
              {color: colors.text},
            ]}>
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
                No quick-start guides match "{searchQuery}". Try another
                keyword or contact support@quantzing.com below.
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
            style={[
              a.text_md,
              a.font_bold,
              a.px_xs,
              {color: colors.text},
            ]}>
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
                Direct QuantZing Support
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Need human help? Reach our team at support@quantzing.com
              </Text>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            Include your @handle.quantzing.com username and a short description
            of the issue so we can resolve it quickly. Typical response time:
            under 24 hours.
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
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                Terms of Service
              </Text>
            </Link>
            <Link
              to="/privacy"
              label="Privacy Policy"
              style={[a.flex_row, a.align_center, a.gap_xs]}>
              <ShieldIcon size="xs" fill={colors.accent} />
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.accent}]}>
                Privacy Policy
              </Text>
            </Link>
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
