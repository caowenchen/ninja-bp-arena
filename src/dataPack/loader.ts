import type { InstalledDataPack, Ninja } from '@bp-core'
import manifestJson from '../../data/packs/default/manifest.json'
import ninjasJson from '../../data/packs/default/ninjas.json'

/**
 * 内置默认数据包（构建时静态打包，运行时零网络请求）。
 *
 * ⚠️ 这是演示 / 联调用的示例数据（Demo），不是《火影忍者手游》的完整官方名单。
 * 数据文件位于 data/packs/default/，由 scripts/data-validate.mjs 在 CI 校验。
 */

export const BUILT_IN_MANIFEST = manifestJson as unknown as InstalledDataPack['manifest']

/** 内置包忍者（运行时只读；使用方需要可变副本时自行拷贝） */
export const BUILT_IN_NINJAS = ninjasJson as unknown as Ninja[]

/** 内置包安装记录 */
export function builtInPack(): InstalledDataPack {
  return {
    manifest: { ...BUILT_IN_MANIFEST },
    ninjas: BUILT_IN_NINJAS,
    origin: 'BUILT_IN',
    installedAt: BUILT_IN_MANIFEST.updatedAt,
  }
}

/** 深拷贝内置忍者（作为生效池时使用，避免直接改动内置数据） */
export function cloneBuiltInNinjas(): Ninja[] {
  return BUILT_IN_NINJAS.map((n) => ({ ...n }))
}
