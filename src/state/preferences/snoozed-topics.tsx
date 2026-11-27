import {useCallback, useSyncExternalStore} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {Atom_Stroke2_Corner0_Rounded} from '#/components/icons/Atom'
import {Bot_Stroke2_Corner0_Rounded} from '#/components/icons/Bot'
import {CodeBrackets_Stroke2_Corner0_Rounded} from '#/components/icons/Code'
import {ColorPalette_Stroke2_Corner0_Rounded} from '#/components/icons/ColorPalette'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Flame_Stroke2_Corner1_Rounded} from '#/components/icons/Flame'
import {GameController_Stroke2_Corner0_Rounded} from '#/components/icons/GameController'
import {Globe_Stroke2_Corner0_Rounded} from '#/components/icons/Globe'
import {MusicNote_Stroke2_Corner0_Rounded} from '#/components/icons/MusicNote'
import {Newspaper_Stroke2_Corner2_Rounded} from '#/components/icons/Newspaper'
import {Sparkle_Stroke2_Corner0_Rounded} from '#/components/icons/Sparkle'
import {
  Trending2_Stroke2_Corner2_Rounded,
  Trending3_Stroke2_Corner1_Rounded,
} from '#/components/icons/Trending'
import {VideoClip_Stroke2_Corner0_Rounded} from '#/components/icons/VideoClip'

export const SNOOZE_DURATION_MS = 86400000 // 24 hours

const SNOOZED_TOPICS_STORAGE_KEY = 'quantzing:snoozed_topics'
const PINNED_TOPICS_STORAGE_KEY = 'quantzing:pinned_topics'

export type TopicConfig = {
  id: string
  label: string
  query: string
  prefTag: string
  icon: React.ComponentType<SVGIconProps>
}

export const SNOOZE_TOPICS: {id: string; label: string; prefTag: string}[] = [
  {id: 'politics', label: 'Politics', prefTag: 'politics'},
  {id: 'sports', label: 'Sports', prefTag: 'sports'},
  {id: 'business', label: 'Business', prefTag: 'business'},
  {id: 'finance', label: 'Finance', prefTag: 'finance'},
  {id: 'science-tech', label: 'Science & Technology', prefTag: 'science'},
  {id: 'entertainment-arts', label: 'Entertainment & Arts', prefTag: 'entertainment'},
  {id: 'ai', label: 'Artificial Intelligence', prefTag: 'ai'},
  {id: 'gaming', label: 'Gaming', prefTag: 'gaming'},
  {id: 'crypto', label: 'Crypto', prefTag: 'crypto'},
]

export const TIMELINES_TOPICS: TopicConfig[] = [
  {
    id: 'soccer',
    label: 'Soccer',
    query: 'soccer',
    prefTag: 'sports',
    icon: Globe_Stroke2_Corner0_Rounded,
  },
  {
    id: 'stocks',
    label: 'Stocks & Economy',
    query: 'stocks economy finance',
    prefTag: 'finance',
    icon: Trending2_Stroke2_Corner2_Rounded,
  },
  {
    id: 'politics',
    label: 'Politics',
    query: 'politics',
    prefTag: 'politics',
    icon: Newspaper_Stroke2_Corner2_Rounded,
  },
  {
    id: 'technology',
    label: 'Technology',
    query: 'technology tech',
    prefTag: 'tech',
    icon: CodeBrackets_Stroke2_Corner0_Rounded,
  },
  {
    id: 'art',
    label: 'Art',
    query: 'art design',
    prefTag: 'art',
    icon: ColorPalette_Stroke2_Corner0_Rounded,
  },
  {
    id: 'movies-tv',
    label: 'Movies & TV',
    query: 'movies TV',
    prefTag: 'movies',
    icon: VideoClip_Stroke2_Corner0_Rounded,
  },
  {
    id: 'ai-agents',
    label: 'AI & Agents',
    query: 'AI agents',
    prefTag: 'dev',
    icon: Bot_Stroke2_Corner0_Rounded,
  },
  {
    id: 'sports',
    label: 'Sports',
    query: 'sports',
    prefTag: 'sports',
    icon: Flame_Stroke2_Corner1_Rounded,
  },
  {
    id: 'music',
    label: 'Music',
    query: 'music',
    prefTag: 'music',
    icon: MusicNote_Stroke2_Corner0_Rounded,
  },
  {
    id: 'gaming',
    label: 'Gaming',
    query: 'gaming',
    prefTag: 'gaming',
    icon: GameController_Stroke2_Corner0_Rounded,
  },
  {
    id: 'crypto',
    label: 'Crypto',
    query: 'crypto bitcoin',
    prefTag: 'crypto',
    icon: Trending3_Stroke2_Corner1_Rounded,
  },
]

export function getTopicById(topicId: string): TopicConfig | undefined {
  const normalized = topicId.toLowerCase().trim()
  return TIMELINES_TOPICS.find(
    t =>
      t.id.toLowerCase() === normalized ||
      t.label.toLowerCase() === normalized,
  )
}

export function getTopicIcon(topicIdOrName: string): React.ComponentType<SVGIconProps> | undefined {
  if (!topicIdOrName) return undefined
  const normalized = topicIdOrName.toLowerCase().trim()

  if (normalized.includes('soccer') || normalized.includes('football')) {
    return Globe_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('stock') || normalized.includes('economy')) {
    return Trending2_Stroke2_Corner2_Rounded
  }
  if (normalized.includes('politic') || normalized.includes('news')) {
    return Newspaper_Stroke2_Corner2_Rounded
  }
  if (normalized.includes('tech') || normalized.includes('code')) {
    return CodeBrackets_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('art') || normalized.includes('design')) {
    return ColorPalette_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('movie') || normalized.includes('tv') || normalized.includes('film')) {
    return VideoClip_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('ai') || normalized.includes('agent') || normalized.includes('bot')) {
    return Bot_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('science')) {
    return Atom_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('sport')) {
    return Flame_Stroke2_Corner1_Rounded
  }
  if (normalized.includes('music')) {
    return MusicNote_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('game') || normalized.includes('gaming')) {
    return GameController_Stroke2_Corner0_Rounded
  }
  if (normalized.includes('crypto') || normalized.includes('bitcoin')) {
    return Trending3_Stroke2_Corner1_Rounded
  }

  const exact = TIMELINES_TOPICS.find(
    t =>
      t.id.toLowerCase() === normalized ||
      t.label.toLowerCase() === normalized,
  )
  if (exact) {
    return exact.icon
  }

  return Sparkle_Stroke2_Corner0_Rounded
}

// -----------------------------------------------------------------------------
// Reactive Store Implementation
// -----------------------------------------------------------------------------

type StoreState = {
  snoozedTopics: Record<string, number>
  pinnedTopicIds: string[]
}

let storeState: StoreState = {
  snoozedTopics: {},
  pinnedTopicIds: [],
}

const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function initStore() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawSnoozed = window.localStorage.getItem(SNOOZED_TOPICS_STORAGE_KEY)
      if (rawSnoozed) {
        const parsed = JSON.parse(rawSnoozed)
        const now = Date.now()
        const cleaned: Record<string, number> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number' && v > now) {
            cleaned[k] = v
          }
        }
        storeState.snoozedTopics = cleaned
      }

      const rawPinned = window.localStorage.getItem(PINNED_TOPICS_STORAGE_KEY)
      if (rawPinned) {
        const parsed = JSON.parse(rawPinned)
        if (Array.isArray(parsed)) {
          storeState.pinnedTopicIds = parsed
        }
      }
    } catch {
      // Ignore storage read errors
    }
  } else {
    // Native fallback to AsyncStorage
    void Promise.all([
      AsyncStorage.getItem(SNOOZED_TOPICS_STORAGE_KEY),
      AsyncStorage.getItem(PINNED_TOPICS_STORAGE_KEY),
    ]).then(([rawSnoozed, rawPinned]) => {
      let changed = false
      if (rawSnoozed) {
        try {
          const parsed = JSON.parse(rawSnoozed)
          const now = Date.now()
          const cleaned: Record<string, number> = {}
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && v > now) {
              cleaned[k] = v
            }
          }
          storeState.snoozedTopics = cleaned
          changed = true
        } catch {}
      }
      if (rawPinned) {
        try {
          const parsed = JSON.parse(rawPinned)
          if (Array.isArray(parsed)) {
            storeState.pinnedTopicIds = parsed
            changed = true
          }
        } catch {}
      }
      if (changed) {
        emitChange()
      }
    })
  }
}

initStore()

function persistStore() {
  const {snoozedTopics, pinnedTopicIds} = storeState
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(
        SNOOZED_TOPICS_STORAGE_KEY,
        JSON.stringify(snoozedTopics),
      )
      window.localStorage.setItem(
        PINNED_TOPICS_STORAGE_KEY,
        JSON.stringify(pinnedTopicIds),
      )
    } catch {}
  }
  void AsyncStorage.setItem(
    SNOOZED_TOPICS_STORAGE_KEY,
    JSON.stringify(snoozedTopics),
  )
  void AsyncStorage.setItem(
    PINNED_TOPICS_STORAGE_KEY,
    JSON.stringify(pinnedTopicIds),
  )
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function getSnapshot(): StoreState {
  return storeState
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

export function useSnoozedTopics() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const isSnoozed = useCallback(
    (topicId: string) => {
      const expiresAt = current.snoozedTopics[topicId]
      if (!expiresAt) return false
      return Date.now() < expiresAt
    },
    [current.snoozedTopics],
  )

  const snoozeTopic = useCallback((topicId: string, durationMs = SNOOZE_DURATION_MS) => {
    const expiresAt = Date.now() + durationMs
    storeState = {
      ...storeState,
      snoozedTopics: {
        ...storeState.snoozedTopics,
        [topicId]: expiresAt,
      },
    }
    persistStore()
    emitChange()
  }, [])

  const unsnoozeTopic = useCallback((topicId: string) => {
    const next = {...storeState.snoozedTopics}
    delete next[topicId]
    storeState = {
      ...storeState,
      snoozedTopics: next,
    }
    persistStore()
    emitChange()
  }, [])

  const toggleSnoozeTopic = useCallback(
    (topicId: string) => {
      const currentlySnoozed = isSnoozed(topicId)
      if (currentlySnoozed) {
        unsnoozeTopic(topicId)
      } else {
        snoozeTopic(topicId)
      }
    },
    [isSnoozed, snoozeTopic, unsnoozeTopic],
  )

  const resetSnoozedTopics = useCallback(() => {
    storeState = {
      ...storeState,
      snoozedTopics: {},
    }
    persistStore()
    emitChange()
  }, [])

  return {
    snoozedTopics: current.snoozedTopics,
    isSnoozed,
    snoozeTopic,
    unsnoozeTopic,
    toggleSnoozeTopic,
    resetSnoozedTopics,
  }
}

export function usePinnedTopics() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const isPinned = useCallback(
    (topicId: string) => {
      return current.pinnedTopicIds.includes(topicId)
    },
    [current.pinnedTopicIds],
  )

  const pinTopic = useCallback((topicId: string) => {
    if (storeState.pinnedTopicIds.includes(topicId)) return
    storeState = {
      ...storeState,
      pinnedTopicIds: [...storeState.pinnedTopicIds, topicId],
    }
    persistStore()
    emitChange()
  }, [])

  const unpinTopic = useCallback((topicId: string) => {
    storeState = {
      ...storeState,
      pinnedTopicIds: storeState.pinnedTopicIds.filter(id => id !== topicId),
    }
    persistStore()
    emitChange()
  }, [])

  const togglePinTopic = useCallback(
    (topicId: string) => {
      if (isPinned(topicId)) {
        unpinTopic(topicId)
      } else {
        pinTopic(topicId)
      }
    },
    [isPinned, pinTopic, unpinTopic],
  )

  const reorderPinnedTopics = useCallback((nextIds: string[]) => {
    storeState = {
      ...storeState,
      pinnedTopicIds: nextIds,
    }
    persistStore()
    emitChange()
  }, [])

  return {
    pinnedTopicIds: current.pinnedTopicIds,
    isPinned,
    pinTopic,
    unpinTopic,
    togglePinTopic,
    reorderPinnedTopics,
  }
}
