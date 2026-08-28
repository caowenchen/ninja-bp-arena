/** 忍者数据模型（玩家工具自维护的数据，不代表官方名单） */
export type NinjaQuality = 'S' | 'A' | 'B' | 'C'

export interface Ninja {
  id: string
  name: string
  /** 别名：用于搜索（如「秽土斑」可指向正式名称），不代表官方设定 */
  aliases?: string[]
  /** 头像：支持 https(s) 远程地址或 /assets/ninjas/xxx.webp 本地资源 */
  avatar?: string
  quality: NinjaQuality
  tags: string[]
  enabled: boolean
  /** 自定义排序权重（小者靠前），可选 */
  sortOrder?: number

  version?: string
  releaseDate?: string
  remark?: string
}

export const NINJA_QUALITIES: NinjaQuality[] = ['S', 'A', 'B', 'C']
