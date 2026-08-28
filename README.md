# 忍界 BP · 火影忍者手游武斗赛 BP 模拟器

> Ninja BP Arena —— 玩家制作的非官方赛事 BP 辅助工具。
> **本工具与游戏官方无隶属或合作关系**；内置忍者数据与规则均为示例，不代表官方名单或官方规则。

一个纯前端、无后端的《火影忍者手游》武斗赛 Ban/Pick 模拟器：完整支持 BO3 三局两胜、Ban 继承、忍者跨局消耗、撤销、历史复盘、JSON 导入导出与移动端适配。

## 功能

- **完整 BO3 流程**：Ban（蓝1 → 红2 → 蓝1）→ Pick（红1 → 蓝2 → 红2 → 蓝1）→ 阵容锁定 → 记录胜负 → 自动进入下一局，先胜 2 局结束整场
- **规则核心约束**：被 Ban 忍者整场不可用；同一局双方不能重复选择；之前小局出过场的忍者整场禁用
- **状态机驱动的 BP 引擎**：当前 Game / 阶段 / 行动方 / 步骤剩余数量全部由引擎推导，支持任意自定义序列
- **撤销 / 重做**：基于完整状态快照，可跨过「记录胜负」「进入下一局」回退
- **倒计时**：每个序列步骤共用一份时间（如红方连续选 2 人不重置），归零不代替玩家操作，提供「继续选择 / 重新计时」
- **历史记录**：按 Game 分组的完整操作流水 + 赛果纯文本复制 + 比赛 JSON 导出
- **刷新恢复**：进行中的比赛实时写入 localStorage，刷新后恢复到当前步骤；损坏数据自动回退默认值，不会白屏
- **忍者池管理**：增删改查、启用/停用、搜索（忽略空格）、品质筛选/排序、JSON 导入（严格校验，失败不崩溃）与导出
- **响应式**：桌面三栏（蓝方 | 舞台 | 红方），手机 375px 单列 + sticky 底部操作栏
- **其他**：首页最近 20 场比赛（继续/查看/删除）、键盘快捷键（Ctrl+Z 撤销 / Ctrl+Y 重做）、错误边界、动画与声音开关

## 技术栈

React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router v7 · Zustand · Vitest

## 目录结构

```
src/
├── app/            # App 外壳与路由
├── pages/          # HomePage / BPPage / NinjaPoolPage / SettingsPage / ResultPage
├── components/
│   ├── bp/         # BPHeader、BPStage、PlayerPanel、Ban/PickSlot、倒计时、历史抽屉
│   ├── ninja/      # NinjaGrid、NinjaCard、NinjaAvatar（占位图容错）、搜索、筛选
│   ├── match/      # ScoreBoard、GameResultDialog、MatchResult、MatchSetupDialog
│   └── common/     # Dialog、ConfirmDialog、Toast、NavBar、ErrorBoundary
├── engine/         # ★ 核心业务（不依赖 React/DOM）
│   ├── bpEngine.ts      # 状态机：阶段推导、canSelectNinja、Ban/Pick/胜负/换局
│   ├── ruleEngine.ts    # 序列展开与规则校验
│   ├── validators.ts    # UI 校验门面
│   └── historyEngine.ts # 撤销/重做快照栈、历史分组、赛果文本
├── store/          # Zustand：bpStore（比赛+快照栈）、ninja/settings/toast
├── data/           # 内置示例忍者池 + 默认规则模板
├── types/          # Ninja / BattleRule / MatchState 等类型
├── hooks/          # 键盘快捷键
└── utils/          # storage（localStorage 统一封装）、clipboard、importExport、sound
test/engine.test.ts # 场景 A~I 全流程单元测试（npm run test）
```

## 启动

```bash
npm install
npm run dev        # 开发：http://localhost:5173
```

```bash
npm run build      # 生产构建（tsc 类型检查 + vite build）
npm run preview    # 预览构建产物
npm run test       # 运行引擎单元测试
```

无需任何环境变量、数据库或账号系统，下载即可运行。

## 数据结构（localStorage）

| Key | 内容 |
| --- | --- |
| `ninja-bp.ninja_pool` | 忍者池（Ninja[]） |
| `ninja-bp.battle_rules` | 自定义规则模板（BattleRule），为空表示用默认模板 |
| `ninja-bp.bp_settings` | 声音/动画/排序等设置 |
| `ninja-bp.current_match` | 最近一场比赛完整状态（刷新恢复用） |
| `ninja-bp.recent_matches` | 最近 20 场比赛记录 |

所有读写经 `src/utils/storage.ts` 封装：JSON 损坏时记录 warning 并回退默认值，页面不会白屏。

## 核心类型

```ts
interface Ninja { id; name; avatar?; quality: 'S'|'A'|'B'|'C'; tags: string[]; enabled; version?; releaseDate?; remark? }

interface BattleRule {
  bestOf; winsRequired
  banOnlyFirstGame; banPersistence; usedNinjaLocked
  banSequence: { side: 'BLUE'|'RED'; action: 'BAN'|'PICK'; count }[]
  pickSequence: /* 同上 */
  timerEnabled; timerSeconds
}

interface MatchState {
  id; rule; bluePlayerName; redPlayerName
  score: { blue; red }
  currentGame; games: GameState[]   // 每局双方 bans/picks/winner
  status: 'SETUP'|'IN_PROGRESS'|'MATCH_FINISHED'
  history: BPAction[]               // 每一步 Ban/Pick 流水
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
    "avatar": "",
    "quality": "S",
    "tags": ["近战", "突进"],
    "enabled": true
  }
]
```

- `id` 缺省自动生成；`quality` 必须是 S/A/B/C；`name` 必填
- 校验失败会逐条报告错误，不会影响现有数据
- 导出得到 `ninja-pool.json`，也可「复制 JSON」直接编辑

## 修改 BP 规则

「规则设置 → Ban/Pick 序列（高级）」直接编辑 JSON：

```json
[
  { "side": "BLUE", "action": "BAN", "count": 1 },
  { "side": "RED",  "action": "BAN", "count": 2 }
]
```

引擎约定：`banSequence` 内只放 BAN 步骤、`pickSequence` 内只放 PICK 步骤，Ban 全部完成后进入 Pick；双方 Pick 总数需相等。保存前会完整校验。

## 未来计划

1. 真实忍者数据库（官方完整名单 + 头像资源分发方案）
2. 双人在线 BP 房间（房间号 / WebSocket 或 Supabase Realtime / OB 观战页）
3. 秘卷 / 通灵 BP（MatchState 预留了扩展位）
