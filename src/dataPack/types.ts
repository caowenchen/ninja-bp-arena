import type { InstalledDataPack, NinjaDataPackManifest } from '@bp-core'

/**
 * 数据包体系的 Web 侧类型。
 * 核心数据结构（Manifest / Diff / 校验）位于 Shared BP Core，浏览器与脚本共用。
 */

export type {
  DataPackDiff,
  InstalledDataPack,
  NinjaDataPackManifest,
  PackDiffFieldChange,
  PackDiffUpdatedEntry,
} from '@bp-core'

/** 当前忍者池的来源分类（UI 三态：默认数据包 / 远程数据包 / 自定义数据） */
export type NinjaPoolSource = 'BUILT_IN' | 'REMOTE_PACK' | 'CUSTOM'

/** 内置示例包的固定 ID（manifest.id） */
export const BUILT_IN_PACK_ID = 'ninja-bp-default'

/** 远程更新检查状态（按远程源记录） */
export interface RemoteUpdateState {
  url: string
  lastCheckedAt: string | null
  /** 检查到的更新（尚未应用） */
  pending?: {
    manifest: NinjaDataPackManifest
    checkedAt: string
  }
  /** 拒绝的旧版本（不再提示，除非发布更新） */
  ignoredVersion?: string
}

/** 数据包更新检查的全局状态（持久化） */
export interface DataPackUpdateState {
  /** 自动检查更新开关（默认开；只检查不自动应用） */
  autoCheckEnabled: boolean
  /** 任一远程源最后一次检查时间（控制检查频率：每天最多一次） */
  lastCheckedAt: string | null
  /** 已确认过的内置包版本（应用升级带来新内置包时用于提示） */
  seenBuiltinVersion: string | null
  /** 内置包更新后新增忍者的 NEW 徽标（应用时间 + id 列表，保留 7 天） */
  newNinjaBadge?: {
    appliedAt: string
    ids: string[]
  }
  remotes: Record<string, RemoteUpdateState>
}

/** 数据包导入 Bundle（单 JSON 文件格式；ZIP 本阶段不支持） */
export interface DataPackBundle {
  manifest: NinjaDataPackManifest
  ninjas: unknown[]
}

/** CSV 导入 / 导出的列定义（aliases / tags 用 | 分隔） */
export const DATA_PACK_CSV_HEADERS = ['id', 'name', 'aliases', 'quality', 'tags', 'releaseDate', 'enabled', 'assetKey'] as const

export type { InstalledDataPack as InstalledPack }
