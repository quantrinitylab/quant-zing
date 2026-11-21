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
import {Envelope_Stroke2_Corner0_Rounded as EnvelopeIcon} from '#/components/icons/Envelope'
import {Newspaper_Stroke2_Corner2_Rounded as DocumentIcon} from '#/components/icons/Newspaper'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

interface CopyrightSection {
  number: string
  title: string
  summary: string
  paragraphs: string[]
  bullets?: string[]
}

const EFFECTIVE_DATE = 'November 21, 2026'

const COPYRIGHT_SECTIONS: CopyrightSection[] = [
  {
    number: '01',
    title: 'Creator Ownership & Respect for Intellectual Property',
    summary: 'Creators retain 100% copyright over their original Zings, Articles, and media.',
    paragraphs: [
      'QuantZing is built for creators, journalists, researchers, and independent publishers. You retain full intellectual property ownership over all original Zings, long-form Articles, images, 4K videos, and ZingSpaces audio content you publish on quantzing.com and quantzing.in.',
      'QuantZing respects the intellectual property rights of others and expects all members to do the same. We respond expeditiously to valid notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (17 U.S.C. § 512, "DMCA") and applicable international copyright statutes.',
    ],
  },
  {
    number: '02',
    title: 'DMCA Takedown Notice Requirements',
    summary: 'Required information when submitting a copyright infringement notice.',
    paragraphs: [
      'If you are a copyright owner—or authorized to act on behalf of one—and believe that content hosted on QuantZing infringes your copyright, please submit a written DMCA Takedown Notice to our Designated Copyright Agent containing all of the following elements:',
    ],
    bullets: [
      'Identification of the copyrighted work claimed to have been infringed (or a representative list if multiple copyrighted works are covered by a single notice).',
      'Identification of the allegedly infringing material on QuantZing, including the specific Zing URL, Article URL, AT-URI, or @handle.quantzing.com profile link sufficient for us to locate the material.',
      'Your full legal name, mailing address, telephone number, and direct email address.',
      'A statement that you have a good-faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.',
      'A statement that the information in your notice is accurate, and under penalty of perjury, that you are the copyright owner or authorized to act on behalf of the copyright owner.',
      'Your physical or electronic signature (typing your full legal name suffices for electronic submissions).',
    ],
  },
  {
    number: '03',
    title: 'Counter-Notification Procedure',
    summary: 'How to dispute a removal caused by mistake or misidentification.',
    paragraphs: [
      'When QuantZing removes or disables access to content in response to a DMCA notice, we notify the affected account holder and provide a copy of the takedown notice. If you believe your Zing, Article, or media was removed by mistake, misidentification, or constitutes fair use, you may send a written Counter-Notification to legal@quantzing.com containing:',
    ],
    bullets: [
      'Identification of the material that was removed or disabled and the URL or AT-URI where it appeared before removal.',
      'A statement under penalty of perjury that you have a good-faith belief the material was removed or disabled as a result of mistake or misidentification.',
      'Your full legal name, address, telephone number, email address, and a statement that you consent to the jurisdiction of the applicable judicial district and will accept service of process from the complaining party.',
      'Your physical or electronic signature.',
    ],
  },
  {
    number: '04',
    title: 'Repeat Infringer Policy',
    summary: 'Enforcement against accounts that repeatedly violate copyright.',
    paragraphs: [
      'In accordance with the DMCA and applicable law, QuantZing maintains a strict Repeat Infringer Policy. Accounts that accrue multiple valid, uncontested copyright infringement notices are subject to permanent termination and revocation of Creator Studio monetization privileges.',
    ],
    bullets: [
      'Knowingly submitting materially false or bad-faith DMCA takedown notices to censor lawful criticism or commentary may result in liability for damages under 17 U.S.C. § 512(f) and account suspension.',
    ],
  },
  {
    number: '05',
    title: 'Designated Copyright Agent',
    summary: 'Official channel for all DMCA notices and counter-notifications.',
    paragraphs: [
      'Send all DMCA takedown notices, counter-notifications, and trademark inquiries directly to QuantZing Legal & Compliance at legal@quantzing.com with the subject line "DMCA Notice - QuantZing".',
    ],
  },
]

type Props = Partial<
  NativeStackScreenProps<CommonNavigatorParams, 'CopyrightPolicy'>
>

export function CopyrightPolicyScreen(_props: Props) {
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
    <Layout.Screen
      testID="copyrightPolicyScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <DocumentIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Copyright & DMCA Policy
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Creator Ownership & Intellectual Property Protection
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
                QuantZing Copyright & DMCA Policy
              </Text>
              <Text style={[a.text_xs, {color: colors.muted}]}>
                Effective {EFFECTIVE_DATE} · Designated Agent: legal@quantzing.com
              </Text>
            </View>
          </View>

          <Text style={[a.text_sm, a.leading_relaxed, {color: colors.muted}]}>
            How QuantZing protects creator ownership across Zings, Articles, and
            ZingSpaces, and how rights holders can submit DMCA takedown notices
            or counter-notifications.
          </Text>

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

        {/* Copyright Sections */}
        {COPYRIGHT_SECTIONS.map(section => (
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
                <Text style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
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

        {/* Designated Copyright Agent Card */}
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
                Designated DMCA & Copyright Agent
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
              onPress={() =>
                void Linking.openURL(
                  'mailto:legal@quantzing.com?subject=DMCA%20Notice%20-%20QuantZing',
                )
              }
              style={[
                a.px_lg,
                a.py_sm,
                a.rounded_full,
                {backgroundColor: colors.ctaBg},
              ]}>
              <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                Submit Notice to legal@quantzing.com
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
