import {useMemo} from 'react'
import {Linking, Pressable, View} from 'react-native'
import {setStringAsync} from 'expo-clipboard'

import {getQuantZingColors} from '#/lib/quantos/client'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, useTheme} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import {Newspaper_Stroke2_Corner2_Rounded as DocumentIcon} from '#/components/icons/Newspaper'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface GuidelineSection {
  number: string
  title: string
  badge: string
  paragraphs: string[]
  bullets?: string[]
}

const EFFECTIVE_DATE = 'November 21, 2026'

const PILLARS = [
  'Authentic Identity',
  'Open Discourse',
  'Composable Safety',
  'Fair Appeals',
]

const GUIDELINE_SECTIONS: GuidelineSection[] = [
  {
    number: '01',
    title: 'Authentic Identity & Sovereign Handles',
    badge: 'Identity Standard',
    paragraphs: [
      'QuantZing empowers every member with a portable @handle.quantzing.com or @handle.quantzing.in identity backed by a cryptographic Decentralized Identifier (DID). Authentic conversation depends on knowing who is speaking.',
      'Parody, commentary, and fan accounts are welcome on QuantZing provided they clearly disclose their nature in both their display name and profile bio so readers are never deceived.',
    ],
    bullets: [
      'Do not impersonate another individual, creator, journalist, organization, or government official in a misleading or deceptive manner.',
      'Do not register handles solely to extort, cybersquat, or confuse members regarding official brand or creator affiliation.',
      'Verified QuantZing Pro badges require an active account in good standing and are revoked immediately upon deceptive display-name or handle changes.',
    ],
  },
  {
    number: '02',
    title: 'Constructive Conversation Across Zings, Articles & ZingSpaces',
    badge: 'Discourse Rules',
    paragraphs: [
      'QuantZing is built for high-signal real-time debate, breaking news analysis, long-form Articles, and live ZingSpaces audio rooms. Vigorous disagreement, investigative reporting, and sharp critique are core to an open public square.',
      'To keep conversations readable and productive, members have access to thread reply gates, quote detachments, muted keywords, and custom moderation lists.',
    ],
    bullets: [
      'Attack ideas and arguments rather than coordinating targeted harassment campaigns against individuals.',
      'Respect ZingSpaces host stage rules when speaking in live audio rooms; hosts may mute or remove disruptive speakers at any time.',
      'Use sensitive-media labels accurately when posting adult content, graphic news footage, or intense medical imagery so user filter preferences work reliably.',
    ],
  },
  {
    number: '03',
    title: 'Zero-Tolerance Safety Rules',
    badge: 'Strict Enforcement',
    paragraphs: [
      'Certain categories of harm are incompatible with a safe network and result in immediate content removal, permanent account suspension, and referral to law enforcement where applicable:',
    ],
    bullets: [
      'Child Sexual Abuse Material (CSAM) or Child Sexual Exploitation and Abuse (CSAE) in any form, whether real, edited, or synthetic.',
      'Non-consensual intimate imagery (NCII), creeping/voyeuristic media, or extortion involving private personal media.',
      'Credible threats of physical violence, terrorism, violent extremism, mass-casualty glorification, or incitement to suicide and self-harm.',
      'Doxxing: publishing private home addresses, government ID numbers, personal phone numbers, or financial credentials with intent to endanger or harass.',
      'Malware distribution, credential phishing, financial fraud, or unauthorized exploitation of QuantZing infrastructure.',
    ],
  },
  {
    number: '04',
    title: '@quanty & Automated Account Rules',
    badge: 'Automation & AI',
    paragraphs: [
      'QuantZing natively integrates Quanty (@quanty.quantzing.com) for thread fact-checking, DeepSearch synthesis, and Zing drafting, and welcomes constructive developer bots built on the open AT Protocol.',
      'All automated accounts and AI-assisted workflows must operate transparently and respect network rate limits:',
    ],
    bullets: [
      'Tag `@quanty` in any public Zing thread to request grounded context, summaries, or fact checks; do not abuse `@quanty` mentions to flood threads or harass other participants.',
      'Third-party automated accounts must clearly identify themselves as automated in their profile bio and use scoped App Passwords.',
      'Coordinated botnets, artificial like/Rezing amplification rings, reply spam farms, and synthetic impression manipulation in Creator Studio are strictly prohibited.',
    ],
  },
  {
    number: '05',
    title: 'Reporting, Enforcement & Appeals',
    badge: 'Due Process',
    paragraphs: [
      'You can report any Zing, Article, Direct Message, or profile directly from the three-dot menu in the app. Our Trust & Safety team reviews reports against these Community Guidelines with proportionality and context.',
      'Enforcement actions range from content label application and temporary read-only cooldowns to permanent suspension for severe or repeated violations. If you believe an enforcement action was taken in error, you may submit a formal appeal to safety@quantzing.com.',
    ],
    bullets: [
      'Include your @handle.quantzing.com username and the relevant Zing URI or notice ID when submitting an appeal.',
      'Every appeal is reviewed by a human Trust & Safety specialist who was not involved in the initial automated flag.',
    ],
  },
]

type Props = Partial<
  NativeStackScreenProps<CommonNavigatorParams, 'CommunityGuidelines'>
>

export function CommunityGuidelinesScreen(_props: Props) {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )

  const handleCopySafetyEmail = () => {
    void setStringAsync('safety@quantzing.com')
    Toast.show('Copied safety@quantzing.com to clipboard', {type: 'success'})
  }

  return (
    <Layout.Screen
      testID="communityGuidelinesScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <ShieldIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Community Guidelines
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            QuantZing Trust, Safety & Open Discourse Standards
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
            <Logo width={34} />
            <View style={[a.flex_1]}>
              <Text style={[a.text_xl, a.font_bold, {color: colors.text}]}>
                QuantZing Community Guidelines
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Effective {EFFECTIVE_DATE} · quantzing.com
              </Text>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            QuantZing is designed for fast, fearless public conversation paired
            with composable user controls and clear safety boundaries across
            Zings, Rezings, Articles, ZingSpaces, and @quanty threads.
          </Text>

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

        {/* Guideline Sections */}
        {GUIDELINE_SECTIONS.map(section => (
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

        {/* Safety & Appeals Contact Card */}
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
                QuantZing Trust & Safety Appeals
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Safety reports, moderation reviews & appeals · safety@quantzing.com
              </Text>
            </View>
          </View>

          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Email safety@quantzing.com"
              onPress={() =>
                void Linking.openURL('mailto:safety@quantzing.com')
              }
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Email safety@quantzing.com
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy safety email address"
              onPress={handleCopySafetyEmail}
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
