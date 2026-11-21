import {useMemo} from 'react'
import {Linking, Pressable, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'

import {getQuantZingColors} from '#/lib/quantos/client'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import {Newspaper_Stroke2_Corner2_Rounded as DocumentIcon} from '#/components/icons/Newspaper'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface TermsSection {
  number: string
  title: string
  summary: string
  paragraphs: string[]
  bullets?: string[]
}

const EFFECTIVE_DATE = 'November 21, 2026'

const TERMS_SECTIONS: TermsSection[] = [
  {
    number: '01',
    title: 'Effective Date & Acceptance of Terms',
    summary: 'Your agreement when accessing QuantZing across web and mobile.',
    paragraphs: [
      `These Terms of Service ("Terms") govern your access to and use of QuantZing, including the QuantZing web application, mobile apps, APIs, Quanty, Articles Studio, ZingSpaces audio rooms, Creator Studio, and QuantZing Pro services (collectively, the "Service").`,
      `By creating a QuantZing account, posting Zings, or browsing the Service on or after ${EFFECTIVE_DATE}, you agree to be bound by these Terms and our Privacy Policy. If you are under the age of majority in your jurisdiction, your parent or legal guardian must review and accept these Terms on your behalf.`,
    ],
  },
  {
    number: '02',
    title: 'Account Ownership & @handle.quantzing.com Identity',
    summary: 'You own your handle, cryptographic DID, and social graph.',
    paragraphs: [
      'QuantZing is built on open, decentralized social standards. Every account receives a portable Decentralized Identifier (DID) and a handle under the .quantzing.com namespace (for example, @you.quantzing.com) or a custom domain you verify via DNS.',
      'Unlike closed walled-garden networks, QuantZing does not claim ownership over your identity or follower relationships. You are responsible for safeguarding your password, recovery credentials, and App Passwords.',
    ],
    bullets: [
      'You must be at least 13 years old (or the minimum digital consent age in your country) to register an account.',
      'Handles may not impersonate another individual, brand, or public institution in a deceptive manner.',
      'Dormant or squatting handles reserved strictly for extortion or trademark abuse may be reclaimed following notice.',
    ],
  },
  {
    number: '03',
    title: 'Zings, Rezings, Articles & ZingSpaces Content Rules',
    summary: 'You keep 100% ownership of what you create and publish.',
    paragraphs: [
      'You retain full copyright and intellectual property rights to all Zings, Rezings, Quote Zings, Replies, long-form Articles, images, 4K videos, and live ZingSpaces audio broadcasts you submit to QuantZing.',
      'To operate, display, cache, transcode, and federate your public content across the open network, you grant QuantZing a non-exclusive, worldwide, royalty-free license to host, reproduce, format, and distribute your public content. This license terminates automatically when you delete your content or account, subject to normal network caching and federation propagation.',
    ],
    bullets: [
      'Public Zings, Rezings, Replies, and published Articles are publicly visible and indexable across open protocol relays.',
      'You warrant that you hold all necessary rights, licenses, and permissions for any media, audio, or text you publish.',
      'ZingSpaces hosts are responsible for moderating their live speaker stage and adhering to local recording consent laws.',
    ],
  },
  {
    number: '04',
    title: 'Quanty Usage Terms',
    summary: 'Clear guidelines for Quanty questions and Zing drafting.',
    paragraphs: [
      'Quanty provides real-time Ask, DeepSearch fact-checking, News briefings, and Zing drafting capabilities inside QuantZing. Outputs are provided for informational and creative assistance only and may occasionally be incomplete or inaccurate—always verify critical financial, legal, medical, or news claims against primary sources.',
      'Quanty processes only the prompt and public Zing context you submit, and never trains on private DMs, bookmarks, or unpublished drafts.',
    ],
    bullets: [
      'Do not use Quanty to generate deceptive deepfakes, coordinated spam, phishing lures, or unlawful harassment.',
      'You are responsible for reviewing any Zing drafted with Quanty before publishing it to your timeline.',
    ],
  },
  {
    number: '05',
    title: 'QuantZing Pro & 70/30 Creator Payouts',
    summary: 'Subscriptions, verification, and transparent creator revenue share.',
    paragraphs: [
      'QuantZing offers optional paid tiers (Zing Basic, Zing Pro, and Zing Pro+) billed monthly or annually. Subscriptions renew automatically until cancelled from your billing settings, and you retain benefits through the end of the paid period.',
      'Creators enrolled in Creator Monetization through Creator Studio earn a transparent 70% Creator / 30% Platform split of verified net ad revenue generated across eligible Zings and Articles.',
    ],
    bullets: [
      'Verification badges require an authentic, active account in good standing; badges may be revoked for deceptive impersonation.',
      'Creator payouts require verified payout details, compliance with applicable tax reporting, and genuine organic engagement.',
      'Artificial impression farming, click bots, or engagement manipulation will result in forfeiture of fraudulent earnings and program removal.',
    ],
  },
  {
    number: '06',
    title: 'Community Safety & Moderation',
    summary: 'Composable safety controls backed by firm platform standards.',
    paragraphs: [
      'QuantZing gives every member fine-grained control over their experience—including muted words, user blocks, thread reply gates, custom moderation lists, and optional third-party labelers.',
      'In addition to user-controlled filters, QuantZing enforces baseline network safety policies to protect users from abuse, illegal content, and infrastructure disruption. Decisions affecting account standing can be appealed via support@quantzing.com.',
    ],
  },
  {
    number: '07',
    title: 'Prohibited Conduct',
    summary: 'Clear red lines that are never permitted on QuantZing.',
    paragraphs: [
      'To keep QuantZing fast, authentic, and safe for everyone, you agree not to engage in any of the following activities:',
    ],
    bullets: [
      'Child sexual abuse material (CSAM), child exploitation, or non-consensual intimate imagery (zero tolerance, immediate termination and legal reporting).',
      'Credible threats of violence, terrorism, incitement to self-harm, or targeted doxxing of private personal information.',
      'Malware distribution, phishing, credential harvesting, unauthorized scraping, or attempts to disrupt QuantZing servers or APIs.',
      'Automated spam farms, botnet amplification, or selling compromised accounts and artificial engagement.',
      'Copyright or trademark infringement after valid rights-holder notice.',
    ],
  },
  {
    number: '08',
    title: 'Termination & Data Portability',
    summary: 'Leave anytime with your full repository and social graph.',
    paragraphs: [
      'You may export your complete repository archive, media blobs, and follow graph, or permanently delete your account at any time from Account Settings.',
      'QuantZing may suspend or terminate access to QuantZing-hosted services if you materially breach Prohibited Conduct or pose a security threat to the platform. Where legally permissible, we provide notice and preserve your ability to migrate your DID and data repository to another compatible host.',
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.',
    ],
  },
  {
    number: '09',
    title: 'Contact & Legal Notices',
    summary: 'Direct channel for legal inquiries, copyright notices, and appeals.',
    paragraphs: [
      'We may update these Terms from time to time to reflect new features, regulatory requirements, or ecosystem improvements. Material updates will be announced in-app with an updated Effective Date.',
      'For legal notices, copyright claims, law enforcement inquiries, or questions about these Terms, contact our legal team directly at legal@quantzing.com.',
    ],
  },
]

export function TermsScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )

  const handleCopyLegalEmail = () => {
    void setStringAsync('legal@quantzing.com')
    Toast.show('Copied legal@quantzing.com to clipboard', {type: 'success'})
  }

  return (
    <Layout.Screen testID="termsScreen" style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <DocumentIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Terms of Service
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            QuantZing Platform Agreement
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
          <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Logo width={34} />
              <View>
                <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                  QuantZing Terms of Service
                </Text>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Effective {EFFECTIVE_DATE} · Version 1.0
                </Text>
              </View>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            Built for open conversation, creator ownership, and zero
            platform lock-in. Read how your @handle.quantzing.com identity,
            Zings, Articles, Quanty, and 70/30 creator payouts work.
          </Text>

          {/* Quick Cross-Navigation Pills */}
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            <Link
              to="/privacy"
              label="Read QuantZing Privacy Policy"
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
              <ShieldIcon size="xs" fill={colors.accent} />
              <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                Privacy Policy
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

        {/* Terms Sections */}
        {TERMS_SECTIONS.map(section => (
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
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
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

            <Text style={[a.text_xs, a.font_semi_bold, {color: colors.muted}]}>
              {section.summary}
            </Text>

            <View style={[a.gap_sm, a.pt_2xs]}>
              {section.paragraphs.map((paragraph, index) => (
                <Text
                  key={index}
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
                        {color: colors.accent},
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

        {/* Legal Contact Card */}
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
                Legal Inquiries & Notices
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                QuantZing Legal & Compliance · legal@quantzing.com
              </Text>
            </View>
          </View>

          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Email legal@quantzing.com"
              onPress={() => void Linking.openURL('mailto:legal@quantzing.com')}
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text
                style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Email legal@quantzing.com
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy legal email address"
              onPress={handleCopyLegalEmail}
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
