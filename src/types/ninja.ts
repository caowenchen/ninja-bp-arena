/** 忍者数据模型（玩家工具自维护的数据，不代表官方名单） */
export type NinjaQuality = 'S' | 'A' | 'B' | 'C'

export interface Ninja {
  id: string
  name: string
  avatar?: string
  quality: NinjaQuality
  tags: string[]
  enabled: boolean

  version?: string
  releaseDate?: string
  remark?: string
}

export const NINJA_QUALITIES: NinjaQuality[] = ['S', 'A', 'B', 'C']
