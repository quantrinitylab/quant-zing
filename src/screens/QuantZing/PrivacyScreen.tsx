import {useMemo} from 'react'
import {Linking, Pressable, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'

import {getQuantZingColors} from '#/lib/quantos/client'
import {atoms as a, useTheme} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import {Lock_Stroke2_Corner0_Rounded as LockIcon} from '#/components/icons/Lock'
import {Newspaper_Stroke2_Corner2_Rounded as DocumentIcon} from '#/components/icons/Newspaper'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface PrivacySection {
  number: string
  title: string
  badge: string
  paragraphs: string[]
  bullets?: string[]
}

const EFFECTIVE_DATE = 'November 21, 2026'

const PILLARS = [
  'Zero Data Brokering',
  'Private DMs & Bookmarks',
  'Private Quanty Prompts',
  'Full Export Anytime',
]

const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    number: '01',
    title: 'Zero-Surveillance Privacy Commitment',
    badge: 'Core Principle',
    paragraphs: [
      'QuantZing is built on a zero-surveillance privacy model. We believe your thoughts, reading habits, and private conversations belong to you—never to covert data brokers or cross-web tracking pixels.',
      'We do not sell your personal information, do not buy third-party shadow profiles about you, and do not track your browsing activity across external websites.',
    ],
  },
  {
    number: '02',
    title: 'Data We Collect vs. Data We Never Sell',
    badge: 'Minimal Collection',
    paragraphs: [
      'We collect only the minimum information required to run a reliable, spam-resistant, and legally compliant social network:',
    ],
    bullets: [
      'Account credentials: Email address, date of birth (for age compliance), chosen @handle.quantzing.com identifier, and strongly hashed password.',
      'Profile & content you publish: Display name, bio, avatar, banner, Zings, Rezings, Articles, and media uploads you choose to share.',
      'Essential security telemetry: Short-lived IP rate-limiting and abuse-prevention logs used strictly to stop credential stuffing, spam, and DDoS attacks.',
      'Never sold or rented: We never sell email addresses, behavioral graphs, private messages, or device fingerprints to advertisers or third-party brokers.',
    ],
  },
  {
    number: '03',
    title: 'Public Zings vs. Private DMs & Bookmarks',
    badge: 'Visibility Boundary',
    paragraphs: [
      'QuantZing draws an explicit technical line between public open-network records and private account spaces:',
    ],
    bullets: [
      'Public by design: Your @handle.quantzing.com profile, public Zings, Replies, Rezings, Likes, public Lists, and published Articles are public records on the open network.',
      'Strictly private: Direct Messages (Chat), saved Bookmarks, unpublished Article drafts, muted words, blocked-account preferences, and your email/birth date are never broadcast to the public feed.',
      'Granular controls: You decide who can reply to your Zings, who can send you Direct Messages, and whether logged-out visitors can view your profile.',
    ],
  },
  {
    number: '04',
    title: 'Quanty Privacy',
    badge: 'AI Privacy',
    paragraphs: [
      'Quanty is designed to give you real-time network intelligence without sacrificing privacy. Quanty processes only the prompt and public Zing context you submit.',
      'Quanty never trains on private DMs, saved Bookmarks, or unpublished Article drafts.',
    ],
    bullets: [
      'Scoped context: Only the prompt you type and any public Zing you explicitly attach are sent when answering your query.',
      'No private message access: Quanty has zero access to your Direct Messages, private bookmarks, or account passwords.',
    ],
  },
  {
    number: '05',
    title: 'Local Storage & Session Tokens',
    badge: 'No Ad Trackers',
    paragraphs: [
      'QuantZing uses browser local storage and secure native device storage solely for core app functionality—never for third-party behavioral ad surveillance:',
    ],
    bullets: [
      'Authenticated session JWTs and refresh tokens so you stay signed in seamlessly.',
      'Your UI theme (True Dark / Light), language, accessibility, and feed preferences.',
      'Local Article drafts and composer autosaves so you never lose work offline.',
    ],
  },
  {
    number: '06',
    title: 'Your Data Rights: Export & Account Deletion',
    badge: 'Full Control',
    paragraphs: [
      'Regardless of where you live, QuantZing provides every member with clear, self-service data rights:',
    ],
    bullets: [
      'Full Data Portability: Download your complete CAR repository containing your signed Zings, profile records, and follows at any time.',
      'Correction & Control: Update your email, handle, profile bio, or privacy settings directly in Settings.',
      'Permanent Deletion: Request immediate account deletion to remove your account record, private preferences, and hosted media from QuantZing servers.',
    ],
  },
  {
    number: '07',
    title: 'Privacy Contact & Data Protection Requests',
    badge: 'Direct Support',
    paragraphs: [
      'If you have questions about how QuantZing handles your information, want to submit a data access or erasure request, or wish to report a privacy concern, reach our privacy team directly at privacy@quantzing.com.',
    ],
  },
]

export function PrivacyScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )

  const handleCopyPrivacyEmail = () => {
    void setStringAsync('privacy@quantzing.com')
    Toast.show('Copied privacy@quantzing.com to clipboard', {type: 'success'})
  }

  return (
    <Layout.Screen testID="privacyScreen" style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <ShieldIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Privacy Policy
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Zero-Surveillance Data Architecture
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {/* Hero Card */}
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
              <LockIcon size="md" fill={colors.accent} />
            </View>
            <View style={[a.flex_1]}>
              <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                QuantZing Privacy Policy
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Effective {EFFECTIVE_DATE} · Zero-Surveillance Standard
              </Text>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            Your social graph belongs to you, your DMs and Bookmarks stay
            private, and Quanty never trains on your private messages or drafts.
          </Text>

          {/* Commitment Pillars */}
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {PILLARS.map(pillar => (
              <View
                key={pillar}
                style={[
                  a.flex_row,
                  a.align_center,
                  a.gap_2xs,
                  a.px_sm,
                  a.py_2xs,
                  a.rounded_full,
                  {
                    backgroundColor: colors.rezingSubtle,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <CheckIcon size="xs" fill={colors.rezing} />
                <Text
                  style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                  {pillar}
                </Text>
              </View>
            ))}
          </View>

          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            <Link
              to="/terms"
              label="Read QuantZing Terms of Service"
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <DocumentIcon size="xs" fill={colors.accent} />
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Terms of Service
              </Text>
            </Link>
            <Link
              to="/help"
              label="Visit QuantZing Help Center"
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.px_md,
                a.py_xs,
                a.rounded_full,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Help Center
              </Text>
            </Link>
          </View>
        </View>

        {/* Privacy Sections */}
        {PRIVACY_SECTIONS.map(section => (
          <View
            key={section.number}
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
            <View
              style={[
                a.flex_row,
                a.align_center,
                a.justify_between,
                a.gap_sm,
              ]}>
              <View style={[a.flex_row, a.align_center, a.gap_sm, a.flex_1]}>
                <View
                  style={[
                    a.px_sm,
                    a.py_2xs,
                    a.rounded_full,
                    {backgroundColor: colors.accentSubtle},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                    {section.number}
                  </Text>
                </View>
                <Text
                  style={[
                    a.text_md,
                    a.font_bold,
                    a.flex_1,
                    {color: colors.text},
                  ]}>
                  {section.title}
                </Text>
              </View>

              <View
                style={[
                  a.px_sm,
                  a.py_2xs,
                  a.rounded_full,
                  {backgroundColor: colors.surface},
                ]}>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  {section.badge}
                </Text>
              </View>
            </View>

            <View style={[a.gap_sm, a.pt_2xs]}>
              {section.paragraphs.map((paragraph, idx) => (
                <Text
                  key={idx}
                  style={[
                    a.text_sm,
                    a.leading_relaxed,
                    {color: colors.text},
                  ]}>
                  {paragraph}
                </Text>
              ))}
            </View>

            {section.bullets && section.bullets.length > 0 && (
              <View
                style={[
                  a.gap_xs,
                  a.p_md,
                  a.mt_2xs,
                  a.rounded_md,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                {section.bullets.map((bullet, idx) => (
                  <View key={idx} style={[a.flex_row, a.gap_sm]}>
                    <Text
                      style={[
                        a.text_sm,
                        a.font_bold,
                        {color: colors.rezing},
                      ]}>
                      -
                    </Text>
                    <Text
                      style={[
                        a.text_sm,
                        a.leading_snug,
                        a.flex_1,
                        {color: colors.text},
                      ]}>
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Privacy Contact Card */}
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
            <EnvelopeIcon size="md" fill={colors.accent} />
            <View style={[a.flex_1]}>
              <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                Privacy & Data Rights Desk
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Data export, erasure & privacy questions · privacy@quantzing.com
              </Text>
            </View>
          </View>

          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Email privacy@quantzing.com"
              onPress={() =>
                void Linking.openURL('mailto:privacy@quantzing.com')
              }
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Email privacy@quantzing.com
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy privacy email address"
              onPress={handleCopyPrivacyEmail}
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
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
