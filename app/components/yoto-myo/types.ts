export interface YotoMyoCard {
  cardId: string
  title: string
  author: string
  coverUrl: string | null
  duration: number
  trackCount: number
  updatedAt: string
}

export type YotoMyoStatus =
  | 'idle'
  | 'loading'
  | 'error'
  | 'unconfigured'
  | 'disconnected'

/** Browser OAuth callback landed on `/` with this query flag. */
export type YotoOAuthInterrupt = 'expired' | 'denied' | 'failed'

export interface YotoAuthStatus {
  configured: boolean
  connected: boolean
  hasWriteScope: boolean
}

export interface YotoContentMineResponse {
  cards: YotoMyoCard[]
}
