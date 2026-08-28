# 忍界 BP · 火影忍者手游武斗赛 BP 模拟器

> Ninja BP Arena —— 玩家制作的非官方赛事 BP 辅助工具。
> **本工具与游戏官方无隶属或合作关系**；内置忍者数据与规则均为示例，不代表官方名单或官方规则。

一个纯前端、无后端的《火影忍者手游》武斗赛 Ban/Pick 模拟器：完整支持 BO3 三局两胜、Ban 继承、忍者跨局消耗、可刷新恢复的倒计时、撤销/重做、历史复盘、JSON 导入导出与移动端适配。

**在线使用**：https://caowenchen.github.io/ninja-bp-arena/ （GitHub Pages 自动部署）

## 功能

- **完整 BO3 流程**：Ban（蓝1 → 红2 → 蓝1）→ Pick（红1 → 蓝2 → 红2 → 蓝1）→ 阵容锁定 → 记录胜负 → 自动进入下一局，先胜 2 局结束整场
- **规则核心约束**：被 Ban 忍者整场不可用；同一局双方不能重复选择；之前小局出过场的忍者整场禁用
- **状态机驱动的 BP 引擎**：当前 Game / 阶段 / 行动方 / 步骤剩余数量全部由引擎推导，支持任意自定义序列
- **可恢复倒计时**：以「阶段标识 + 截止时间戳」持久化；同一序列步骤共用一份时间；刷新后恢复真实剩余时间，已过期进入超时态（不代选，提供继续选择 / 重新计时）
- **撤销 / 重做**：基于完整状态快照，可跨过「记录胜负」「进入下一局」回退，撤销后计时器正确对齐新阶段
- **数据可靠性**：所有 localStorage 读取经过严格运行时校验（schema v2 + 版本迁移），损坏数据自动丢弃回退，绝不白屏
- **历史记录**：按 Game 分组的完整操作流水 + 赛果纯文本复制 + 比赛 JSON 导出
- **赛事版式 BP 页**：桌面「蓝方阵容 | 中央阶段与忍者池 | 红方阵容」对阵结构，大头像人物卡槽位；手机 375px 单列 + sticky 底栏（含 safe-area）
- **忍者池管理**：增删改查、批量启用/停用/删除、导入预览（新增/更新/无变化统计 + 合并/替换模式）、搜索支持别名、本地头像资源（public/assets/ninjas/）
- **数据备份**：一键导出全部本地数据（ninja-bp-backup.json），恢复前显示内容摘要
- **其他**：最近 20 场比赛、键盘快捷键（Ctrl+Z / Ctrl+Y）、错误边界、prefers-reduced-motion 支持

## 技术栈

React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router v7 · Zustand · Vitest · Playwright · ESLint · GitHub Actions

## 目录结构

```
src/
├── app/            # App 外壳与路由（basename 兼容 GitHub Pages 子路径）
├── pages/          # HomePage / BPPage / NinjaPoolPage / SettingsPage / ResultPage / AboutPage
├── components/
│   ├── bp/         # BPHeader、BPStage、PlayerPanel、MobileTeamBar、Ban/PickSlot、
│   │               # CountdownTimer（持久化 deadline）、历史抽屉、底栏
│   ├── ninja/      # NinjaGrid（状态筛选）、NinjaCard、NinjaAvatar（占位图容错）
│   ├── match/      # ScoreBoard、GameResultDialog、MatchResult、MatchSetupDialog
│   └── common/     # Dialog（焦点管理）、ConfirmDialog、Toast、NavBar、ErrorBoundary
├── engine/         # ★ 核心业务（不依赖 React/DOM）
│   ├── bpEngine.ts        # 状态机：阶段推导、canSelectNinja、Ban/Pick/胜负/换局
│   ├── ruleEngine.ts      # 序列展开与规则校验
│   ├── matchValidator.ts  # 持久化数据运行时校验（MatchState / Ninja / Rule / Timer）
│   ├── historyEngine.ts   # 撤销/重做快照栈、历史分组、赛果文本
│   └── validators.ts      # UI 校验门面
├── store/          # Zustand：bpStore（比赛+快照栈）、timerStore（计时运行时）、
│                   # ninjaStore、settingsStore、toastStore
├── data/           # 内置示例忍者池 + 默认规则模板
├── types/          # Ninja / BattleRule / MatchState 等类型
├── hooks/          # 键盘快捷键
└── utils/          # storage（schema v2 封装）、clipboard、importExport（导入/备份）、sound
e2e/                # Playwright E2E（BO3 全流程 / 撤销 / 刷新恢复 / 移动端 / 坏数据）
test/               # 单元测试（engine / importExport / validation）
scripts/copy-404.mjs # GitHub Pages SPA 404 兜底
```

## 启动与命令

```bash
npm install
npm run dev        # 开发：http://localhost:5173
```

| 命令 | 说明 |
| --- | --- |
| `npm run typecheck` | TypeScript 严格检查 |
| `npm run lint` | ESLint（0 error） |
| `npm run test` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright E2E（首次需 `npx playwright install chromium`） |
| `npm run build` | 生产构建（含类型检查） |
| `npm run build:pages` | GitHub Pages 构建（子路径 base + 404.html 兜底） |

无需任何环境变量、数据库或账号系统，下载即可运行。

## 部署（GitHub Pages）

推送到 `main` 后，`.github/workflows/deploy.yml` 会自动执行
`typecheck → lint → test → build:pages` 并部署到 Pages。
直接访问 `/bp`、`/ninjas` 等子路径刷新由 `dist/404.html`（index.html 副本）兜底，
React Router 以 `/ninja-bp-arena` 为 basename 接管路由，不会 404。

## 数据结构（localStorage，schema v2）

| Key | 内容 |
| --- | --- |
| `ninja-bp.ninja_pool` | 忍者池（Ninja[]） |
| `ninja-bp.battle_rules` | 自定义规则模板（BattleRule），为空表示用默认模板 |
| `ninja-bp.bp_settings` | 声音/动画/排序等设置 |
| `ninja-bp.current_match` | 最近一场比赛完整状态（刷新恢复用） |
| `ninja-bp.recent_matches` | 最近 20 场比赛记录 |
| `ninja-bp.bp_timer` | 倒计时运行时（phaseKey + deadlineAt） |

所有值以 `{ __v: 2, data: ... }` 包装存储；旧版（无包装）数据按 v1 自动迁移。
所有读取经过 `matchValidator` 严格校验，损坏数据 warn + 回退。

## 核心类型

```ts
interface Ninja {
  id; name; aliases?          // 别名用于搜索
  avatar?;                    // https(s) 或 /assets/ninjas/xxx.webp
  quality: 'S'|'A'|'B'|'C'; tags; enabled; sortOrder?
  version?; releaseDate?; remark?
}

interface BattleRule {
  bestOf; winsRequired
  banOnlyFirstGame; banPersistence; usedNinjaLocked
  banSequence: { side: 'BLUE'|'RED'; action: 'BAN'|'PICK'; count }[]
  pickSequence: /* 同上 */
  timerEnabled; timerSeconds
}
```

## 默认规则（武斗赛 BO3 模板 v1.0）

| 阶段 | 顺序 |
| --- | --- |
| Ban（仅第 1 局，全场生效） | 蓝方×1 → 红方×2 → 蓝方×1 |
| Pick（每局） | 红方×1 → 蓝方×2 → 红方×2 → 蓝方×1 |

- 每方每局 3 名忍者出场；BO3 先胜 2 局获胜
- 第 2 / 3 局不再 Ban，但第 1 局的 4 个 Ban 持续有效
- Game1 出场的 6 名忍者 Game2 不可用；Game1+Game2 的 12 名 Game3 不可用
- 以上全部可在「规则设置」中修改（含 Ban/Pick 序列 JSON 编辑器），修改只影响之后新开的比赛

## 自定义忍者池

在忍者池页面「导入 JSON」，支持数组或 `{ ninjas: [...] }`：

```json
[
  {
    "id": "naruto-001",
    "name": "漩涡鸣人",
    "aliases": ["秽土鸣人"],
    "avatar": "/assets/ninjas/naruto-sage.webp",
    "quality": "S",
    "tags": ["近战", "突进"],
    "enabled": true
  }
]
```

- 导入先显示预览（检测到 / 新增 / 更新 / 无变化 / 错误），确认后才写入
- 模式：**合并**（默认，按 ID 更新/新增）或 **替换**（整池覆盖，有明显警告）
- 校验失败会逐条报告错误，不会影响现有数据
- 头像图片放入 `public/assets/ninjas/`（建议 WebP 正方形 256/512，详见目录内 README）

## 修改 BP 规则

「规则设置 → Ban/Pick 序列（高级）」直接编辑 JSON：

```json
[
  { "side": "BLUE", "action": "BAN", "count": 1 },
  { "side": "RED",  "action": "BAN", "count": 2 }
]
```

引擎约定：`banSequence` 内只放 BAN 步骤、`pickSequence` 内只放 PICK 步骤，Ban 全部完成后进入 Pick；双方 Pick 总数需相等。保存前会完整校验。

## 未来计划（第三阶段）

1. 双人实时 BP 房间（房间号 / 实时同步 / OB 观战页）
2. 真实忍者数据与素材管理
3. 秘卷 / 通灵 BP
