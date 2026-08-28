import type { Ninja } from '@/types/ninja'

/**
 * 内置示例忍者数据（28 名）。
 *
 * ⚠️ 这只是用于演示与联调的示例数据，不是《火影忍者手游》当前版本的
 * 完整忍者名单；品质与标签也仅为示例。真实忍者池请通过
 * 忍者池管理页的 JSON 导入功能导入。
 */
export const NINJA_POOL: Ninja[] = [
  { id: 'example-naruto-001', name: '漩涡鸣人', quality: 'S', tags: ['近战', '突进'], enabled: true, remark: '示例数据' },
  { id: 'example-sasuke-002', name: '宇智波佐助', quality: 'S', tags: ['近战', '爆发'], enabled: true, remark: '示例数据' },
  { id: 'example-kakashi-003', name: '旗木卡卡西', quality: 'S', tags: ['近战', '位移'], enabled: true, remark: '示例数据' },
  { id: 'example-itachi-004', name: '宇智波鼬', quality: 'S', tags: ['远程', '控制'], enabled: true, remark: '示例数据' },
  { id: 'example-minato-005', name: '波风水门', quality: 'S', tags: ['近战', '位移'], enabled: true, remark: '示例数据' },
  { id: 'example-pain-006', name: '佩恩', quality: 'S', tags: ['远程', '控制'], enabled: true, remark: '示例数据' },
  { id: 'example-hashirama-007', name: '千手柱间', quality: 'S', tags: ['近战', '爆发'], enabled: true, remark: '示例数据' },
  { id: 'example-obito-008', name: '宇智波带土', quality: 'S', tags: ['近战', '位移'], enabled: true, remark: '示例数据' },
  { id: 'example-jiraiya-009', name: '自来也', quality: 'A', tags: ['近战', '爆发'], enabled: true, remark: '示例数据' },
  { id: 'example-tsunade-010', name: '纲手', quality: 'A', tags: ['近战', '抓取'], enabled: true, remark: '示例数据' },
  { id: 'example-orochimaru-011', name: '大蛇丸', quality: 'A', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-gaara-012', name: '我爱罗', quality: 'A', tags: ['远程', '控制'], enabled: true, remark: '示例数据' },
  { id: 'example-neji-013', name: '日向宁次', quality: 'A', tags: ['近战', '突进'], enabled: true, remark: '示例数据' },
  { id: 'example-sakura-014', name: '春野樱', quality: 'A', tags: ['近战', '爆发'], enabled: true, remark: '示例数据' },
  { id: 'example-deidara-015', name: '迪达拉', quality: 'A', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-sasori-016', name: '蝎', quality: 'A', tags: ['远程', '抓取'], enabled: true, remark: '示例数据' },
  { id: 'example-kisame-017', name: '干柿鬼鲛', quality: 'A', tags: ['近战', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-lee-018', name: '李洛克', quality: 'B', tags: ['近战', '突进'], enabled: true, remark: '示例数据' },
  { id: 'example-tenten-019', name: '天天', quality: 'B', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-shikamaru-020', name: '奈良鹿丸', quality: 'B', tags: ['远程', '控制'], enabled: true, remark: '示例数据' },
  { id: 'example-choji-021', name: '秋道丁次', quality: 'B', tags: ['近战', '抓取'], enabled: true, remark: '示例数据' },
  { id: 'example-ino-022', name: '山中井野', quality: 'B', tags: ['远程', '控制'], enabled: true, remark: '示例数据' },
  { id: 'example-kiba-023', name: '犬冢牙', quality: 'B', tags: ['近战', '突进'], enabled: true, remark: '示例数据' },
  { id: 'example-shino-024', name: '油女志乃', quality: 'B', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-hidan-025', name: '飞段', quality: 'B', tags: ['近战', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-kakuzu-026', name: '角都', quality: 'B', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-kabuto-027', name: '药师兜', quality: 'C', tags: ['远程', '消耗'], enabled: true, remark: '示例数据' },
  { id: 'example-shizune-028', name: '静音', quality: 'C', tags: ['近战', '消耗'], enabled: true, remark: '示例数据' },
]
