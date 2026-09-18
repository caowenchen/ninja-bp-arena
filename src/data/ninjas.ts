import type { Ninja } from '@/types/ninja'
import { BUILT_IN_NINJAS } from '@/dataPack/loader'

/**
 * 内置示例忍者数据（28 名）—— 自 v0.4 起来自内置 Data Pack
 * （data/packs/default/ninjas.json，构建时静态打包）。
 *
 * ⚠️ 这只是用于演示与联调的示例数据（Demo），不是《火影忍者手游》当前版本的
 * 完整忍者名单；品质与标签也仅为示例。真实忍者池请使用「数据包」页面的
 * 导入功能或配置远程数据包。
 */
export const NINJA_POOL: Ninja[] = BUILT_IN_NINJAS
