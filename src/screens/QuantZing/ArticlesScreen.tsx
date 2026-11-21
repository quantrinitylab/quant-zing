import {useCallback, useEffect, useMemo, useState} from 'react'
import {Image, Pressable, TextInput, View} from 'react-native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getQuantZingColors} from '#/lib/quantos/client'
import {useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Newspaper_Stroke2_Corner2_Rounded as ArticleIcon} from '#/components/icons/Newspaper'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {PencilLine_Stroke2_Corner0_Rounded as EditIcon} from '#/components/icons/Pencil'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

const STORAGE_KEY = 'quantzing_articles_v1'

interface QuantZingArticle {
  id: string
  title: string
  subtitle: string
  coverPreset: string
  coverImageUrl: string
  body: string
  status: 'draft' | 'published'
  authorHandle: string
  wordCount: number
  readMinutes: number
  createdAt: string
  updatedAt: string
}

const COVER_PRESETS: Array<{
  id: string
  label: string
  bg: string
  accent: string
}> = [
  {id: 'midnight', label: 'Midnight Blue', bg: '#0A192F', accent: '#1D9BF0'},
  {id: 'obsidian', label: 'Obsidian Slate', bg: '#16181C', accent: '#E7E9EA'},
  {id: 'emerald', label: 'Deep Emerald', bg: '#052E25', accent: '#00BA7C'},
  {id: 'indigo', label: 'Cosmic Indigo', bg: '#111633', accent: '#7856FF'},
]

function loadArticles(): QuantZingArticle[] {
  if (!IS_WEB || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QuantZingArticle[]) : []
  } catch {
    return []
  }
}

function persistArticles(items: QuantZingArticle[]) {
  if (!IS_WEB || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function computeStats(text: string) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const readMinutes = Math.max(1, Math.ceil(words / 220))
  return {words, chars: text.length, readMinutes}
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function ArticlesScreen() {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const {currentAccount} = useSession()
  const {openComposer} = useOpenComposer()

  const [activeTab, setActiveTab] = useState<'write' | 'library'>('write')
  const [libraryFilter, setLibraryFilter] = useState<
    'all' | 'published' | 'draft'
  >('all')
  const [articles, setArticles] = useState<QuantZingArticle[]>(() =>
    loadArticles(),
  )
  const [readingId, setReadingId] = useState<string | null>(null)

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [coverPreset, setCoverPreset] = useState('midnight')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    persistArticles(articles)
  }, [articles])

  const stats = useMemo(() => computeStats(body), [body])
  const authorHandle = currentAccount?.handle || 'sovereign.quantzing.com'

  const resetEditor = useCallback(() => {
    setEditingId(null)
    setTitle('')
    setSubtitle('')
    setCoverPreset('midnight')
    setCoverImageUrl('')
    setBody('')
  }, [])

  const upsertArticle = useCallback(
    (status: 'draft' | 'published'): QuantZingArticle | null => {
      const cleanTitle = title.trim()
      const cleanBody = body.trim()
      if (!cleanTitle) {
        Toast.show('Add an article title before saving', {type: 'warning'})
        return null
      }
      if (status === 'published' && cleanBody.length < 20) {
        Toast.show('Write at least a short paragraph before publishing', {
          type: 'warning',
        })
        return null
      }

      const now = new Date().toISOString()
      const {words, readMinutes} = computeStats(cleanBody)

      const existing = editingId
        ? articles.find(item => item.id === editingId)
        : undefined

      const record: QuantZingArticle = {
        id: existing?.id || `art_${Date.now()}`,
        title: cleanTitle,
        subtitle: subtitle.trim(),
        coverPreset,
        coverImageUrl: coverImageUrl.trim(),
        body: cleanBody,
        status,
        authorHandle,
        wordCount: words,
        readMinutes,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }

      setArticles(prev => {
        const filtered = prev.filter(item => item.id !== record.id)
        return [record, ...filtered]
      })
      setEditingId(record.id)
      return record
    },
    [
      articles,
      authorHandle,
      body,
      coverImageUrl,
      coverPreset,
      editingId,
      subtitle,
      title,
    ],
  )

  const handleSaveDraft = useCallback(() => {
    const saved = upsertArticle('draft')
    if (saved) {
      Toast.show('Draft saved locally', {type: 'success'})
    }
  }, [upsertArticle])

  const shareArticleAsZing = useCallback(
    (article: QuantZingArticle) => {
      const excerpt = article.subtitle
        ? article.subtitle
        : article.body.replace(/\s+/g, ' ').slice(0, 120)
      const zingText = `${article.title}\n\n${excerpt}${
        excerpt.length >= 120 ? '...' : ''
      }\n\n${article.readMinutes} min read on QuantZing Articles #QuantZing`
      openComposer({text: zingText.slice(0, 295), logContext: 'Other'})
    },
    [openComposer],
  )

  const handlePublishAndShare = useCallback(() => {
    const published = upsertArticle('published')
    if (published) {
      Toast.show('Article published! Opening Zing Composer...', {
        type: 'success',
      })
      shareArticleAsZing(published)
    }
  }, [shareArticleAsZing, upsertArticle])

  const handleEditArticle = useCallback((article: QuantZingArticle) => {
    setEditingId(article.id)
    setTitle(article.title)
    setSubtitle(article.subtitle)
    setCoverPreset(article.coverPreset)
    setCoverImageUrl(article.coverImageUrl)
    setBody(article.body)
    setReadingId(null)
    setActiveTab('write')
  }, [])

  const handleDeleteArticle = useCallback(
    (id: string) => {
      setArticles(prev => prev.filter(item => item.id !== id))
      if (readingId === id) setReadingId(null)
      if (editingId === id) resetEditor()
      Toast.show('Article deleted', {type: 'info'})
    },
    [editingId, readingId, resetEditor],
  )

  const insertMarkdownSnippet = useCallback((snippet: string) => {
    setBody(prev => (prev ? `${prev}\n${snippet}` : snippet))
  }, [])

  const readingArticle = useMemo(
    () => articles.find(item => item.id === readingId) || null,
    [articles, readingId],
  )

  const filteredArticles = useMemo(() => {
    if (libraryFilter === 'all') return articles
    return articles.filter(item => item.status === libraryFilter)
  }, [articles, libraryFilter])

  const selectedCover =
    COVER_PRESETS.find(c => c.id === coverPreset) || COVER_PRESETS[0]

  return (
    <Layout.Screen
      testID="articlesScreen"
      style={{backgroundColor: colors.bg}}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <View style={[a.flex_row, a.align_center, a.gap_xs]}>
            <ArticleIcon size="md" fill={colors.accent} />
            <Layout.Header.TitleText style={{color: colors.text}}>
              Articles
            </Layout.Header.TitleText>
          </View>
          <Layout.Header.SubtitleText>
            Long-form publishing studio & reader
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        {editingId && activeTab === 'write' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start new article"
            onPress={resetEditor}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_2xs,
              a.px_sm,
              a.py_xs,
              a.rounded_full,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}>
            <PlusIcon size="xs" fill={colors.text} />
            <Text style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
              New
            </Text>
          </Pressable>
        ) : (
          <Layout.Header.Slot />
        )}
      </Layout.Header.Outer>

      {/* Top X-style Segmented Tabs */}
      <Layout.Center
        style={[
          a.flex_row,
          {
            backgroundColor: colors.bg,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
        ]}>
        {(
          [
            {id: 'write', label: 'Write Article'},
            {
              id: 'library',
              label: `My Articles & Drafts (${articles.length})`,
            },
          ] as const
        ).map(tab => {
          const active = activeTab === tab.id
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              onPress={() => {
                setReadingId(null)
                setActiveTab(tab.id)
              }}
              style={[
                a.flex_1,
                a.align_center,
                a.justify_center,
                a.py_md,
                {
                  borderBottomWidth: 3,
                  borderBottomColor: active ? colors.accent : 'transparent',
                },
              ]}>
              <Text
                style={[
                  a.text_sm,
                  active ? a.font_bold : a.font_semi_bold,
                  {color: active ? colors.text : colors.muted},
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </Layout.Center>

      <Layout.Content
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[a.p_md, a.gap_md, {paddingBottom: 96}]}>
        {activeTab === 'write' ? (
          <>
            {/* Live Cover Preview */}
            <View
              style={[
                a.rounded_lg,
                a.overflow_hidden,
                {
                  height: 140,
                  backgroundColor: selectedCover.bg,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              {coverImageUrl.trim().startsWith('http') ? (
                <Image
                  source={{uri: coverImageUrl.trim()}}
                  style={{width: '100%', height: '100%'}}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    a.flex_1,
                    a.justify_between,
                    a.p_md,
                    {backgroundColor: selectedCover.bg},
                  ]}>
                  <View
                    style={[
                      a.align_start,
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {backgroundColor: 'rgba(0,0,0,0.45)'},
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: selectedCover.accent},
                      ]}>
                      QUANTZING ARTICLE · @{authorHandle}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[a.text_xl, a.font_bold, {color: '#E7E9EA'}]}>
                    {title.trim() || 'Your headline appears here'}
                  </Text>
                </View>
              )}
            </View>

            {/* Cover Controls */}
            <View style={[a.gap_xs]}>
              <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                {COVER_PRESETS.map(preset => {
                  const selected = coverPreset === preset.id
                  return (
                    <Pressable
                      key={preset.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${preset.label} cover`}
                      onPress={() => setCoverPreset(preset.id)}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_xs,
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: selected ? colors.accent : colors.border,
                        },
                      ]}>
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: preset.accent,
                        }}
                      />
                      <Text style={[a.text_xs, {color: colors.text}]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <TextInput
                value={coverImageUrl}
                onChangeText={setCoverImageUrl}
                placeholder="Optional cover image URL (https://...)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  a.text_xs,
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
            </View>

            {/* Title, Subtitle & Body Card */}
            <View
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
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Article Title"
                placeholderTextColor={colors.muted}
                style={[
                  a.text_2xl,
                  a.font_bold,
                  {color: colors.text, paddingVertical: 4},
                  web({outlineStyle: 'none'} as any),
                ]}
              />

              <TextInput
                value={subtitle}
                onChangeText={setSubtitle}
                placeholder="Add a sharp subtitle or thesis..."
                placeholderTextColor={colors.muted}
                style={[
                  a.text_md,
                  {
                    color: colors.muted,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                  web({outlineStyle: 'none'} as any),
                ]}
              />

              {/* Quick Formatting Toolbar */}
              <View style={[a.flex_row, a.flex_wrap, a.gap_xs, a.pt_2xs]}>
                {[
                  {label: 'H2 Section', snippet: '## Section Heading\n'},
                  {label: 'Pull Quote', snippet: '> Highlighted insight\n'},
                  {label: 'Bullet List', snippet: '- Key point\n'},
                ].map(tool => (
                  <Pressable
                    key={tool.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${tool.label}`}
                    onPress={() => insertMarkdownSnippet(tool.snippet)}
                    style={[
                      a.px_sm,
                      a.py_2xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_semi_bold,
                        {color: colors.text},
                      ]}>
                      + {tool.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Write your long-form story, technical essay, or market deep dive..."
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                style={[
                  a.text_md,
                  a.leading_relaxed,
                  {
                    color: colors.text,
                    minHeight: 240,
                    paddingTop: 6,
                  },
                  web({outlineStyle: 'none'} as any),
                ]}
              />

              {/* Live Metrics + Save / Publish Actions */}
              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                  a.pt_sm,
                  {borderTopWidth: 1, borderTopColor: colors.border},
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                  <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
                    <ClockIcon size="xs" fill={colors.muted} />
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      {stats.readMinutes} min read
                    </Text>
                  </View>
                  <Text style={[a.text_xs, {color: colors.muted}]}>
                    {stats.words.toLocaleString()} words ·{' '}
                    {stats.chars.toLocaleString()} chars
                  </Text>
                </View>

                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save Draft"
                    onPress={handleSaveDraft}
                    style={[
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.text},
                      ]}>
                      Save Draft
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Publish and Share as Zing"
                    onPress={handlePublishAndShare}
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_xs,
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {backgroundColor: colors.ctaBg},
                    ]}>
                    <SendIcon size="xs" fill={colors.ctaText} />
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.ctaText},
                      ]}>
                      Publish & Share as Zing
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </>
        ) : readingArticle ? (
          /* Full Article Reader View */
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
            <View
              style={[
                {
                  height: 160,
                  backgroundColor:
                    COVER_PRESETS.find(c => c.id === readingArticle.coverPreset)
                      ?.bg || '#0A192F',
                },
              ]}>
              {readingArticle.coverImageUrl.startsWith('http') ? (
                <Image
                  source={{uri: readingArticle.coverImageUrl}}
                  style={{width: '100%', height: '100%'}}
                  resizeMode="cover"
                />
              ) : (
                <View style={[a.flex_1, a.justify_end, a.p_lg]}>
                  <Text style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                    {readingArticle.status === 'published'
                      ? 'PUBLISHED ARTICLE'
                      : 'DRAFT'}
                  </Text>
                </View>
              )}
            </View>

            <View style={[a.p_lg, a.gap_md]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReadingId(null)}>
                <Text
                  style={[a.text_xs, a.font_bold, {color: colors.accent}]}>
                  Back to My Articles & Drafts
                </Text>
              </Pressable>

              <Text style={[a.text_2xl, a.font_bold, {color: colors.text}]}>
                {readingArticle.title}
              </Text>
              {readingArticle.subtitle ? (
                <Text style={[a.text_md, {color: colors.muted}]}>
                  {readingArticle.subtitle}
                </Text>
              ) : null}

              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.align_center,
                  a.gap_sm,
                  a.pb_md,
                  {borderBottomWidth: 1, borderBottomColor: colors.border},
                ]}>
                <Text
                  style={[a.text_xs, a.font_semi_bold, {color: colors.text}]}>
                  @{readingArticle.authorHandle}
                </Text>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  · {formatDate(readingArticle.updatedAt)} ·{' '}
                  {readingArticle.readMinutes} min read (
                  {readingArticle.wordCount} words)
                </Text>
              </View>

              <View style={[a.gap_sm]}>
                {readingArticle.body.split('\n').map((para, idx) => {
                  const trimmed = para.trim()
                  if (!trimmed) return <View key={idx} style={{height: 6}} />
                  if (trimmed.startsWith('## ')) {
                    return (
                      <Text
                        key={idx}
                        style={[
                          a.text_lg,
                          a.font_bold,
                          {color: colors.text, marginTop: 8},
                        ]}>
                        {trimmed.slice(3)}
                      </Text>
                    )
                  }
                  if (trimmed.startsWith('> ')) {
                    return (
                      <View
                        key={idx}
                        style={[
                          a.pl_md,
                          a.py_xs,
                          {borderLeftWidth: 3, borderLeftColor: colors.accent},
                        ]}>
                        <Text
                          style={[
                            a.text_md,
                            {color: colors.muted, fontStyle: 'italic'},
                          ]}>
                          {trimmed.slice(2)}
                        </Text>
                      </View>
                    )
                  }
                  return (
                    <Text
                      key={idx}
                      style={[
                        a.text_md,
                        a.leading_relaxed,
                        {color: colors.text},
                      ]}>
                      {trimmed}
                    </Text>
                  )
                })}
              </View>

              <View
                style={[
                  a.flex_row,
                  a.flex_wrap,
                  a.gap_sm,
                  a.pt_md,
                  {borderTopWidth: 1, borderTopColor: colors.border},
                ]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => shareArticleAsZing(readingArticle)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <SendIcon size="xs" fill={colors.ctaText} />
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Share as Zing
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleEditArticle(readingArticle)}
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
                  <EditIcon size="xs" fill={colors.text} />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: colors.text},
                    ]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleDeleteArticle(readingArticle.id)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {
                      borderWidth: 1,
                      borderColor: colors.danger,
                    },
                  ]}>
                  <TrashIcon size="xs" fill={colors.danger} />
                  <Text
                    style={[
                      a.text_xs,
                      a.font_semi_bold,
                      {color: colors.danger},
                    ]}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          /* Library List */
          <View style={[a.gap_md]}>
            <View style={[a.flex_row, a.gap_xs]}>
              {(
                [
                  {id: 'all', label: 'All'},
                  {id: 'published', label: 'Published'},
                  {id: 'draft', label: 'Drafts'},
                ] as const
              ).map(f => {
                const active = libraryFilter === f.id
                return (
                  <Pressable
                    key={f.id}
                    accessibilityRole="button"
                    onPress={() => setLibraryFilter(f.id)}
                    style={[
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {
                        backgroundColor: active ? colors.ctaBg : colors.card,
                        borderWidth: 1,
                        borderColor: active ? colors.ctaBg : colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: active ? colors.ctaText : colors.text},
                      ]}>
                      {f.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {filteredArticles.length === 0 ? (
              <View
                style={[
                  a.p_xl,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_sm,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                <ArticleIcon size="lg" fill={colors.muted} />
                <Text style={[a.text_md, a.font_bold, {color: colors.text}]}>
                  No articles saved yet
                </Text>
                <Text
                  style={[
                    a.text_xs,
                    a.text_center,
                    {color: colors.muted, maxWidth: 320},
                  ]}>
                  Publish long-form essays, newsletters, and threads right
                  inside QuantZing and share them directly to your followers.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActiveTab('write')}
                  style={[
                    a.px_lg,
                    a.py_sm,
                    a.rounded_full,
                    a.mt_xs,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Write Your First Article
                  </Text>
                </Pressable>
              </View>
            ) : (
              filteredArticles.map(article => (
                <Pressable
                  key={article.id}
                  accessibilityRole="button"
                  onPress={() => setReadingId(article.id)}
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
                  <View
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.justify_between,
                      a.gap_xs,
                    ]}>
                    <View
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_2xs,
                        a.px_sm,
                        {
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor:
                            article.status === 'published'
                              ? colors.rezingSubtle
                              : colors.surface,
                        },
                      ]}>
                      {article.status === 'published' && (
                        <CheckIcon size="xs" fill={colors.rezing} />
                      )}
                      <Text
                        style={[
                          {fontSize: 11, fontWeight: '700'},
                          {
                            color:
                              article.status === 'published'
                                ? colors.rezing
                                : colors.muted,
                          },
                        ]}>
                        {article.status === 'published' ? 'Published' : 'Draft'}
                      </Text>
                    </View>
                    <Text style={[a.text_xs, {color: colors.muted}]}>
                      {formatDate(article.updatedAt)} · {article.readMinutes}{' '}
                      min read
                    </Text>
                  </View>

                  <Text style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                    {article.title}
                  </Text>
                  {article.subtitle ? (
                    <Text
                      numberOfLines={2}
                      style={[a.text_sm, {color: colors.muted}]}>
                      {article.subtitle}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_xs,
                      a.pt_xs,
                      {borderTopWidth: 1, borderTopColor: colors.border},
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setReadingId(article.id)}
                      style={[
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {backgroundColor: colors.ctaBg},
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.ctaText},
                        ]}>
                        Read
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleEditArticle(article)}
                      style={[
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[a.text_xs, {color: colors.text}]}>
                        Edit
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => shareArticleAsZing(article)}
                      style={[
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[a.text_xs, {color: colors.accent}]}>
                        Share as Zing
                      </Text>
                    </Pressable>
                    <View style={[a.flex_1]} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete article"
                      onPress={() => handleDeleteArticle(article.id)}
                      hitSlop={8}>
                      <TrashIcon size="xs" fill={colors.muted} />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
