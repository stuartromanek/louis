import type { InjectionKey } from 'vue'
import type { useYotoMyo } from './useYotoMyo'

export type YotoMyoContext = ReturnType<typeof useYotoMyo>

export const YOTO_MYO_KEY: InjectionKey<YotoMyoContext> = Symbol('yotoMyo')
