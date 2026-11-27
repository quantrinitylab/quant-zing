import {useMemo} from 'react'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

export const interests = [
  'ai',
  'animals',
  'art',
  'books',
  'comedy',
  'comics',
  'culture',
  'dev',
  'education',
  'finance',
  'food',
  'gaming',
  'journalism',
  'movies',
  'movies_tv',
  'music',
  'nature',
  'news',
  'pets',
  'photography',
  'politics',
  'science',
  'soccer',
  'sports',
  'tech',
  'tv',
  'writers',
] as const
export type Interest = (typeof interests)[number]

// most popular selected interests
export const popularInterests = [
  'politics',
  'soccer',
  'tech',
  'art',
  'movies_tv',
  'ai',
  'sports',
  'music',
  'finance',
  'gaming',
  'news',
  'science',
] satisfies Interest[]

export function useInterestsDisplayNames() {
  const {_} = useLingui()

  return useMemo<Record<string, string>>(() => {
    return {
      // Keep this alphabetized
      ai: _(msg`AI & Agents`),
      animals: _(msg`Animals`),
      art: _(msg`Art`),
      books: _(msg`Books`),
      comedy: _(msg`Comedy`),
      comics: _(msg`Comics`),
      culture: _(msg`Culture`),
      dev: _(msg`Software Dev`),
      education: _(msg`Education`),
      finance: _(msg`Finance`),
      food: _(msg`Food`),
      gaming: _(msg`Gaming`),
      journalism: _(msg`Journalism`),
      movies: _(msg`Movies`),
      movies_tv: _(msg`Movies & TV`),
      music: _(msg`Music`),
      nature: _(msg`Nature`),
      news: _(msg`News`),
      pets: _(msg`Pets`),
      photography: _(msg`Photography`),
      politics: _(msg`Politics`),
      science: _(msg`Science`),
      soccer: _(msg`Soccer`),
      sports: _(msg`Sports`),
      tech: _(msg`Technology`),
      tv: _(msg`TV`),
      writers: _(msg`Writers`),
    } satisfies Record<Interest, string>
  }, [_])
}
