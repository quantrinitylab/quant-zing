import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  TextInput,
  View,
} from 'react-native'

import {uploadBlob} from '#/lib/api/upload-blob'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {openUnifiedPicker} from '#/lib/media/picker'
import {
  buildQuantZingBlobUrl,
  deleteQuantZingArticle,
  fetchQuantZingArticle,
  fetchQuantZingArticles,
  getQuantZingColors,
  type QuantZingArticleRecord,
  saveQuantZingArticle,
} from '#/lib/quantos/client'
import {
  useMaybePdsClient,
  useRequireAuth,
  useSession,
} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {Clock_Stroke2_Corner0_Rounded as ClockIcon} from '#/components/icons/Clock'
import {Eye_Stroke2_Corner0_Rounded as EyeIcon} from '#/components/icons/Eye'
import {Image_Stroke2_Corner2_Rounded as ImageIcon} from '#/components/icons/Image'
import {Newspaper_Stroke2_Corner2_Rounded as ArticleIcon} from '#/components/icons/Newspaper'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import {PencilLine_Stroke2_Corner0_Rounded as EditIcon} from '#/components/icons/Pencil'
import {PlusSmall_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Layout from '#/components/Layout'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'

type ArticlesTab = 'all' | 'mine' | 'drafts' | 'write'

const COVER_PRESETS: Array<{
  id: string
  label: string
  bg: string
  accent: string
  swatch: string
}> = [
  {
    id: 'midnight',
    label: 'Midnight Blue',
    bg: '#0A192F',
    accent: '#4DB5F7',
    swatch: '#1D9BF0',
  },
  {
    id: 'obsidian',
    label: 'Obsidian Slate',
    bg: '#16181C',
    accent: '#E7E9EA',
    swatch: '#475569',
  },
  {
    id: 'emerald',
    label: 'Deep Emerald',
    bg: '#052E25',
    accent: '#00D18B',
    swatch: '#00875A',
  },
  {
    id: 'indigo',
    label: 'Cosmic Indigo',
    bg: '#111633',
    accent: '#A78BFA',
    swatch: '#6D28D9',
  },
]

function computeStats(text: string) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const readMinutes = Math.max(1, Math.ceil(words / 220))
  return {words, chars: text.length, readMinutes}
}

function formatDate(iso?: string) {
  if (!iso) return ''
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

function extractCidFromBlob(blob: unknown): string {
  const rawRef = (blob as any)?.ref
  if (typeof rawRef === 'string') return rawRef
  if (typeof rawRef?.$link === 'string') return rawRef.$link
  if (typeof rawRef?.toString === 'function') {
    const str = rawRef.toString()
    if (str && str !== '[object Object]') return str
  }
  return ''
}

function parseTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,#]+/)
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0 && tag.length <= 32),
    ),
  ).slice(0, 6)
}

export function ArticlesScreen() {
  const t = useTheme()
  const colors = useMemo(() => getQuantZingColors(t.name), [t.name])
  const {hasSession, currentAccount} = useSession()
  const pdsClient = useMaybePdsClient()
  const requireAuth = useRequireAuth()
  const {openComposer} = useOpenComposer()

  const accessJwt = currentAccount?.accessJwt

  const [activeTab, setActiveTab] = useState<ArticlesTab>('all')
  const [articles, setArticles] = useState<QuantZingArticleRecord[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [readingArticle, setReadingArticle] =
    useState<QuantZingArticleRecord | null>(null)
  const [isLoadingReader, setIsLoadingReader] = useState(false)

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [coverPreset, setCoverPreset] = useState('midnight')
  const [coverUrl, setCoverUrl] = useState('')
  const [body, setBody] = useState('')
  const [shareToFeed, setShareToFeed] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingCover, setIsUploadingCover] = useState(false)

  const stats = useMemo(() => computeStats(body), [body])

  const loadArticlesForTab = useCallback(
    async (tab: ArticlesTab) => {
      if (tab === 'write') return
      if ((tab === 'mine' || tab === 'drafts') && (!hasSession || !currentAccount?.did)) {
        setArticles([])
        setListError(null)
        setIsLoadingList(false)
        return
      }

      setIsLoadingList(true)
      setListError(null)
      try {
        const fetched = await fetchQuantZingArticles({
          actor:
            tab === 'mine' || tab === 'drafts'
              ? currentAccount?.did
              : undefined,
          status:
            tab === 'all'
              ? 'published'
              : tab === 'drafts'
                ? 'draft'
                : 'all',
          limit: 50,
          accessJwt,
        })
        setArticles(fetched)
      } catch (err: any) {
        setListError(err?.message || 'Unable to load articles right now.')
      } finally {
        setIsLoadingList(false)
      }
    },
    [accessJwt, currentAccount?.did, hasSession],
  )

  useEffect(() => {
    void loadArticlesForTab(activeTab)
  }, [activeTab, loadArticlesForTab])

  const resetEditor = useCallback(() => {
    setEditingId(null)
    setTitle('')
    setSubtitle('')
    setTagsInput('')
    setCoverPreset('midnight')
    setCoverUrl('')
    setBody('')
    setShareToFeed(true)
  }, [])

  const handleOpenReader = useCallback(
    async (article: QuantZingArticleRecord) => {
      setReadingArticle(article)
      setIsLoadingReader(true)
      try {
        const hydrated = await fetchQuantZingArticle(article.id, accessJwt)
        if (hydrated) {
          setReadingArticle(hydrated)
          setArticles(prev =>
            prev.map(item => (item.id === hydrated.id ? hydrated : item)),
          )
        }
      } catch {
        // Keep summary article already loaded in reader
      } finally {
        setIsLoadingReader(false)
      }
    },
    [accessJwt],
  )

  const handleUploadCoverImage = useCallback(() => {
    requireAuth(async () => {
      if (!pdsClient || !currentAccount?.did || isUploadingCover) return

      if (IS_WEB && typeof document !== 'undefined') {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/png,image/jpeg,image/webp,image/gif'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          if (file.size > 5 * 1024 * 1024) {
            Toast.show('Cover image must be under 5 MB', {type: 'warning'})
            return
          }
          setIsUploadingCover(true)
          try {
            const {blob} = await uploadBlob(
              pdsClient,
              file,
              file.type || 'image/jpeg',
            )
            const cid = extractCidFromBlob(blob)
            if (!cid) {
              throw new Error('Could not resolve uploaded blob CID')
            }
            const uploadedUrl = buildQuantZingBlobUrl(currentAccount.did, cid)
            setCoverUrl(uploadedUrl)
            Toast.show('Cover image uploaded to QuantZing PDS', {
              type: 'success',
            })
          } catch (err: any) {
            Toast.show(err?.message || 'Cover image upload failed', {
              type: 'error',
            })
          } finally {
            setIsUploadingCover(false)
          }
        }
        input.click()
        return
      }

      // Native image upload via unified picker -> PDS uploadBlob
      setIsUploadingCover(true)
      try {
        const {assets, canceled} = await openUnifiedPicker({
          selectionCountRemaining: 1,
        })
        if (canceled || !assets.length) return
        const img = assets.find(aItem => aItem.mimeType?.startsWith('image/'))
        if (!img) {
          Toast.show('Select an image file for your cover', {type: 'warning'})
          return
        }
        const {blob} = await uploadBlob(
          pdsClient,
          img.uri,
          img.mimeType || 'image/jpeg',
        )
        const cid = extractCidFromBlob(blob)
        if (!cid) {
          throw new Error('Could not resolve uploaded blob CID')
        }
        setCoverUrl(buildQuantZingBlobUrl(currentAccount.did, cid))
        Toast.show('Cover image uploaded to QuantZing PDS', {type: 'success'})
      } catch (err: any) {
        Toast.show(err?.message || 'Cover image upload failed', {type: 'error'})
      } finally {
        setIsUploadingCover(false)
      }
    })
  }, [currentAccount?.did, isUploadingCover, pdsClient, requireAuth])

  const persistArticle = useCallback(
    (status: 'draft' | 'published') => {
      requireAuth(async () => {
        if (!accessJwt || isSaving) return
        const cleanTitle = title.trim()
        const cleanBody = body.trim()
        if (!cleanTitle) {
          Toast.show('Add an article title before saving', {type: 'warning'})
          return
        }
        if (status === 'published' && cleanBody.length < 20) {
          Toast.show('Write at least a short paragraph before publishing', {
            type: 'warning',
          })
          return
        }

        setIsSaving(true)
        try {
          const tags = parseTagsInput(tagsInput)
          const res = await saveQuantZingArticle(
            {
              id: editingId || undefined,
              title: cleanTitle,
              subtitle: subtitle.trim(),
              body: cleanBody,
              tags,
              coverUrl: coverUrl.trim() || undefined,
              status,
              shareToFeed: status === 'published' ? shareToFeed : false,
            },
            accessJwt,
          )
          const saved = res.article
          setEditingId(saved.id)
          setArticles(prev => {
            const filtered = prev.filter(item => item.id !== saved.id)
            return [saved, ...filtered]
          })
          if (status === 'draft') {
            Toast.show('Draft saved to your QuantZing account', {
              type: 'success',
            })
          } else {
            Toast.show(
              res.postUri
                ? 'Article published and shared to your feed'
                : 'Article published on QuantZing',
              {type: 'success'},
            )
            setReadingArticle(saved)
            setActiveTab('mine')
          }
        } catch (err: any) {
          Toast.show(err?.message || 'Unable to save article right now', {
            type: 'error',
          })
        } finally {
          setIsSaving(false)
        }
      })
    },
    [
      accessJwt,
      body,
      coverUrl,
      editingId,
      isSaving,
      requireAuth,
      shareToFeed,
      subtitle,
      tagsInput,
      title,
    ],
  )

  const shareArticleAsZing = useCallback(
    (article: QuantZingArticleRecord) => {
      const excerpt = article.subtitle
        ? article.subtitle
        : article.body.replace(/\s+/g, ' ').slice(0, 120)
      const tagsLine =
        article.tags && article.tags.length > 0
          ? article.tags.map(tag => `#${tag.replace(/[^a-zA-Z0-9_]/g, '')}`).join(' ')
          : '#QuantZing'
      const zingText = `${article.title}\n\n${excerpt}${
        excerpt.length >= 120 ? '...' : ''
      }\n\n${article.readTimeMinutes} min read by @${article.authorHandle} ${tagsLine}`
      openComposer({text: zingText.slice(0, 295), logContext: 'Other'})
    },
    [openComposer],
  )

  const handleEditArticle = useCallback(
    (article: QuantZingArticleRecord) => {
      requireAuth(() => {
        setEditingId(article.id)
        setTitle(article.title)
        setSubtitle(article.subtitle || '')
        setTagsInput((article.tags || []).join(', '))
        setCoverUrl(article.coverUrl || '')
        setBody(article.body)
        setReadingArticle(null)
        setActiveTab('write')
      })
    },
    [requireAuth],
  )

  const handleDeleteArticle = useCallback(
    (article: QuantZingArticleRecord) => {
      requireAuth(async () => {
        if (!accessJwt) return
        try {
          await deleteQuantZingArticle(article.id, accessJwt)
          setArticles(prev => prev.filter(item => item.id !== article.id))
          if (readingArticle?.id === article.id) setReadingArticle(null)
          if (editingId === article.id) resetEditor()
          Toast.show('Article deleted from QuantZing', {type: 'info'})
        } catch (err: any) {
          Toast.show(err?.message || 'Could not delete article', {
            type: 'error',
          })
        }
      })
    },
    [accessJwt, editingId, readingArticle?.id, requireAuth, resetEditor],
  )

  const insertMarkdownSnippet = useCallback((snippet: string) => {
    setBody(prev => (prev ? `${prev}\n${snippet}` : snippet))
  }, [])

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
            Sovereign long-form publishing & discovery
          </Layout.Header.SubtitleText>
        </Layout.Header.Content>
        {activeTab === 'write' && editingId ? (
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write new article"
            onPress={() => {
              requireAuth(() => {
                setReadingArticle(null)
                setActiveTab('write')
              })
            }}
            style={[
              a.flex_row,
              a.align_center,
              a.gap_2xs,
              a.px_sm,
              a.py_xs,
              a.rounded_full,
              {backgroundColor: colors.ctaBg},
            ]}>
            <EditIcon size="xs" fill={colors.ctaText} />
            <Text style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
              Write
            </Text>
          </Pressable>
        )}
      </Layout.Header.Outer>

      {/* Top Segmented Tabs: All Articles | My Articles | Drafts | Write */}
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
            {id: 'all', label: 'All Articles'},
            {id: 'mine', label: 'My Articles'},
            {id: 'drafts', label: 'Drafts'},
            {id: 'write', label: editingId ? 'Edit' : 'Write'},
          ] as const
        ).map(tab => {
          const active = activeTab === tab.id
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              onPress={() => {
                if (tab.id === 'write' && !hasSession) {
                  requireAuth(() => {
                    setReadingArticle(null)
                    setActiveTab('write')
                  })
                  return
                }
                setReadingArticle(null)
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
                  a.text_xs,
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
          !hasSession || !currentAccount ? (
            <View
              style={[
                a.p_xl,
                a.rounded_lg,
                a.align_center,
                a.gap_md,
                {
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}>
              <ArticleIcon size="xl" fill={colors.accent} />
              <Text
                style={[
                  a.text_lg,
                  a.font_bold,
                  a.text_center,
                  {color: colors.text},
                ]}>
                Sign in to publish QuantZing Articles
              </Text>
              <Text
                style={[
                  a.text_sm,
                  a.text_center,
                  {color: colors.muted, maxWidth: 340},
                ]}>
                Your drafts and published articles are stored under your
                sovereign QuantZing identity.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => requireAuth(() => {})}
                style={[
                  a.px_xl,
                  a.py_sm,
                  a.rounded_full,
                  {backgroundColor: colors.ctaBg},
                ]}>
                <Text style={[a.text_sm, a.font_bold, {color: colors.ctaText}]}>
                  Sign In
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Live Cover Preview */}
              <View
                style={[
                  a.rounded_lg,
                  a.overflow_hidden,
                  {
                    height: 156,
                    backgroundColor: selectedCover.bg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}>
                {coverUrl.trim().length > 0 ? (
                  <Image
                    source={{uri: coverUrl.trim()}}
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
                        QUANTZING ARTICLE · @{currentAccount.handle}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[a.text_xl, a.font_bold, {color: '#F7F9F9'}]}>
                      {title.trim() || 'Your headline appears here'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Cover Upload & Backdrop Controls */}
              <View style={[a.gap_xs]}>
                <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Upload cover image to QuantZing PDS"
                    disabled={isUploadingCover}
                    onPress={handleUploadCoverImage}
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.gap_xs,
                      a.px_md,
                      a.py_xs,
                      a.rounded_full,
                      {
                        backgroundColor: colors.accentSubtle,
                        borderWidth: 1,
                        borderColor: colors.accent,
                        opacity: isUploadingCover ? 0.65 : 1,
                      },
                    ]}>
                    {isUploadingCover ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <ImageIcon size="xs" fill={colors.accentText} />
                    )}
                    <Text
                      style={[
                        a.text_xs,
                        a.font_bold,
                        {color: colors.accentText},
                      ]}>
                      {isUploadingCover ? 'Uploading...' : 'Upload Cover Image'}
                    </Text>
                  </Pressable>

                  {coverUrl.trim().length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCoverUrl('')}
                      style={[
                        a.px_sm,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text style={[a.text_xs, {color: colors.dangerText}]}>
                        Remove Cover
                      </Text>
                    </Pressable>
                  )}

                  {COVER_PRESETS.map(preset => {
                    const selected = coverPreset === preset.id
                    return (
                      <Pressable
                        key={preset.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${preset.label} backdrop`}
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
                            borderColor: selected
                              ? colors.accent
                              : colors.border,
                          },
                        ]}>
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: preset.swatch,
                            borderWidth: 1,
                            borderColor: colors.border,
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
                  value={coverUrl}
                  onChangeText={setCoverUrl}
                  placeholder="Cover image URL (uploaded automatically above, or paste https://...)"
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

              {/* Title, Subtitle, Tags & Body Card */}
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

                <TextInput
                  value={tagsInput}
                  onChangeText={setTagsInput}
                  placeholder="Tags (comma separated, e.g. engineering, ai, markets)"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  style={[
                    a.text_xs,
                    a.px_sm,
                    a.py_xs,
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

                {/* Share-to-feed Toggle */}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: shareToFeed}}
                  onPress={() => setShareToFeed(prev => !prev)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_xs,
                    a.py_xs,
                  ]}>
                  <View
                    style={[
                      a.align_center,
                      a.justify_center,
                      {
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        backgroundColor: shareToFeed
                          ? colors.accent
                          : colors.surface,
                        borderWidth: 1,
                        borderColor: shareToFeed
                          ? colors.accent
                          : colors.border,
                      },
                    ]}>
                    {shareToFeed && <CheckIcon size="xs" fill="#FFFFFF" />}
                  </View>
                  <Text style={[a.text_xs, {color: colors.text}]}>
                    Also share a Zing announcement to my followers when
                    publishing
                  </Text>
                </Pressable>

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
                      disabled={isSaving}
                      onPress={() => persistArticle('draft')}
                      style={[
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                          opacity: isSaving ? 0.6 : 1,
                        },
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.text},
                        ]}>
                        {isSaving ? 'Saving...' : 'Save Draft'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Publish Article"
                      disabled={isSaving}
                      onPress={() => persistArticle('published')}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_xs,
                        a.px_md,
                        a.py_xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.ctaBg,
                          opacity: isSaving ? 0.6 : 1,
                        },
                      ]}>
                      <SendIcon size="xs" fill={colors.ctaText} />
                      <Text
                        style={[
                          a.text_xs,
                          a.font_bold,
                          {color: colors.ctaText},
                        ]}>
                        {isSaving ? 'Publishing...' : 'Publish Article'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          )
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
                  height: 180,
                  backgroundColor: '#0A192F',
                },
              ]}>
              {readingArticle.coverUrl ? (
                <Image
                  source={{uri: readingArticle.coverUrl}}
                  style={{width: '100%', height: '100%'}}
                  resizeMode="cover"
                />
              ) : (
                <View style={[a.flex_1, a.justify_end, a.p_lg]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: '#4DB5F7'}]}>
                    {readingArticle.status === 'published'
                      ? 'PUBLISHED ARTICLE'
                      : 'PRIVATE DRAFT'}
                  </Text>
                </View>
              )}
            </View>

            <View style={[a.p_lg, a.gap_md]}>
              <View
                style={[a.flex_row, a.align_center, a.justify_between]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReadingArticle(null)}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.accentText}]}>
                    Back to Articles
                  </Text>
                </Pressable>
                {isLoadingReader && (
                  <ActivityIndicator size="small" color={colors.accent} />
                )}
              </View>

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
                  style={[a.text_xs, a.font_bold, {color: colors.text}]}>
                  {readingArticle.authorDisplayName ||
                    readingArticle.authorHandle}{' '}
                  (@{readingArticle.authorHandle})
                </Text>
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  ·{' '}
                  {formatDate(
                    readingArticle.publishedAt || readingArticle.updatedAt,
                  )}{' '}
                  · {readingArticle.readTimeMinutes} min read ·{' '}
                  {readingArticle.viewsCount.toLocaleString()} views
                </Text>
              </View>

              {readingArticle.tags && readingArticle.tags.length > 0 && (
                <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                  {readingArticle.tags.map(tag => (
                    <View
                      key={tag}
                      style={[
                        a.px_sm,
                        a.py_2xs,
                        a.rounded_full,
                        {
                          backgroundColor: colors.accentSubtle,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: colors.accentText},
                        ]}>
                        #{tag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

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

                {currentAccount?.did === readingArticle.authorDid && (
                  <>
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
                      onPress={() => handleDeleteArticle(readingArticle)}
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
                      <TrashIcon size="xs" fill={colors.dangerText} />
                      <Text
                        style={[
                          a.text_xs,
                          a.font_semi_bold,
                          {color: colors.dangerText},
                        ]}>
                        Delete
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </View>
        ) : (
          /* Network Discovery / My Articles / Drafts List */
          <View style={[a.gap_md]}>
            {(activeTab === 'mine' || activeTab === 'drafts') &&
            (!hasSession || !currentAccount) ? (
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
                  Sign in to access your articles & drafts
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => requireAuth(() => {})}
                  style={[
                    a.px_lg,
                    a.py_sm,
                    a.rounded_full,
                    a.mt_xs,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Sign In
                  </Text>
                </Pressable>
              </View>
            ) : isLoadingList ? (
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
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[a.text_xs, {color: colors.muted}]}>
                  Loading articles from QuantZing...
                </Text>
              </View>
            ) : listError ? (
              <View
                style={[
                  a.p_lg,
                  a.rounded_lg,
                  a.align_center,
                  a.gap_sm,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.danger,
                  },
                ]}>
                <Text style={[a.text_sm, {color: colors.dangerText}]}>
                  {listError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadArticlesForTab(activeTab)}
                  style={[
                    a.px_md,
                    a.py_xs,
                    a.rounded_full,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : articles.length === 0 ? (
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
                  {activeTab === 'drafts'
                    ? 'No saved drafts yet'
                    : activeTab === 'mine'
                      ? 'You have not written any articles yet'
                      : 'No published articles on the network yet'}
                </Text>
                <Text
                  style={[
                    a.text_xs,
                    a.text_center,
                    {color: colors.muted, maxWidth: 320},
                  ]}>
                  Publish long-form essays and deep dives straight to Sovereign
                  QuantZing storage and share them with your followers.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    requireAuth(() => {
                      resetEditor()
                      setActiveTab('write')
                    })
                  }}
                  style={[
                    a.px_lg,
                    a.py_sm,
                    a.rounded_full,
                    a.mt_xs,
                    {backgroundColor: colors.ctaBg},
                  ]}>
                  <Text
                    style={[a.text_xs, a.font_bold, {color: colors.ctaText}]}>
                    Write an Article
                  </Text>
                </Pressable>
              </View>
            ) : (
              articles.map(article => {
                const isOwner = currentAccount?.did === article.authorDid
                return (
                  <Pressable
                    key={article.id}
                    accessibilityRole="button"
                    onPress={() => void handleOpenReader(article)}
                    style={[
                      a.rounded_lg,
                      a.overflow_hidden,
                      {
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}>
                    {article.coverUrl ? (
                      <Image
                        source={{uri: article.coverUrl}}
                        style={{width: '100%', height: 140}}
                        resizeMode="cover"
                      />
                    ) : null}

                    <View style={[a.p_md, a.gap_sm]}>
                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.justify_between,
                          a.gap_xs,
                        ]}>
                        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
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
                                borderWidth: 1,
                                borderColor:
                                  article.status === 'published'
                                    ? colors.rezing
                                    : colors.border,
                              },
                            ]}>
                            {article.status === 'published' && (
                              <CheckIcon size="xs" fill={colors.rezingText} />
                            )}
                            <Text
                              style={[
                                {fontSize: 11, fontWeight: '700'},
                                {
                                  color:
                                    article.status === 'published'
                                      ? colors.rezingText
                                      : colors.muted,
                                },
                              ]}>
                              {article.status === 'published'
                                ? 'Published'
                                : 'Draft'}
                            </Text>
                          </View>
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.text},
                            ]}>
                            @{article.authorHandle}
                          </Text>
                        </View>

                        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                          <View
                            style={[a.flex_row, a.align_center, a.gap_2xs]}>
                            <EyeIcon size="xs" fill={colors.muted} />
                            <Text style={[a.text_xs, {color: colors.muted}]}>
                              {article.viewsCount.toLocaleString()}
                            </Text>
                          </View>
                          <Text style={[a.text_xs, {color: colors.muted}]}>
                            {formatDate(
                              article.publishedAt || article.updatedAt,
                            )}{' '}
                            · {article.readTimeMinutes}m read
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[a.text_lg, a.font_bold, {color: colors.text}]}>
                        {article.title}
                      </Text>
                      {article.subtitle ? (
                        <Text
                          numberOfLines={2}
                          style={[a.text_sm, {color: colors.muted}]}>
                          {article.subtitle}
                        </Text>
                      ) : null}

                      {article.tags && article.tags.length > 0 && (
                        <View style={[a.flex_row, a.flex_wrap, a.gap_2xs]}>
                          {article.tags.map(tag => (
                            <Text
                              key={tag}
                              style={[
                                a.text_xs,
                                a.font_semi_bold,
                                {color: colors.accentText},
                              ]}>
                              #{tag}
                            </Text>
                          ))}
                        </View>
                      )}

                      <View
                        style={[
                          a.flex_row,
                          a.flex_wrap,
                          a.align_center,
                          a.gap_xs,
                          a.pt_xs,
                          {borderTopWidth: 1, borderTopColor: colors.border},
                        ]}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void handleOpenReader(article)}
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
                          <Text
                            style={[
                              a.text_xs,
                              a.font_semi_bold,
                              {color: colors.accentText},
                            ]}>
                            Share as Zing
                          </Text>
                        </Pressable>

                        {isOwner && (
                          <>
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
                            <View style={[a.flex_1]} />
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Delete article"
                              onPress={() => handleDeleteArticle(article)}
                              hitSlop={8}>
                              <TrashIcon size="xs" fill={colors.dangerText} />
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                  </Pressable>
                )
              })
            )}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}
