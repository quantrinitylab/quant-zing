import {logger} from '#/logger'

export function useShortenLink() {
  return async (inputUrl: string): Promise<{url: string}> => {
    void logger
    return {url: inputUrl}
  }
}
