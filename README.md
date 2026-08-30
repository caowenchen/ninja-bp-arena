# 忍界 BP · 火影忍者手游武斗赛 BP 模拟器

> Ninja BP Arena —— 玩家制作的非官方赛事 BP 辅助工具。
> **本工具与游戏官方无隶属或合作关系**；内置忍者数据与规则均为示例，不代表官方名单或官方规则。

一款《火影忍者手游》武斗赛 Ban/Pick 模拟器：本地模式纯前端离线可用，完整支持 BO3 三局两胜、Ban 继承、忍者跨局消耗、可刷新恢复的倒计时、撤销/重做、历史复盘、JSON 导入导出与移动端适配；可选的双人在线 BP 房间基于 Supabase（服务端权威 + Realtime 同步）。

**在线使用**：https://caowenchen.github.io/ninja-bp-arena/ （GitHub Pages 自动部署）

> ⚠ **部署是两件事**：GitHub Pages 只发布前端页面；双人在线 BP 需要另外部署
> Supabase 后端（migration + Edge Functions，见下方「在线 BP 设置」与可选的
> `deploy-supabase.yml` 手动工作流）。Pages 显示 success ≠ 在线模式已部署。

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
├── engine/（转发层，实际实现见 supabase/functions/_shared/bp-core）         # ★ 核心业务（不依赖 React/DOM）
│   ├── bpEngine.ts        # 状态机（实现见 supabase/functions/_shared/bp-core）
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
| `npm run test:e2e` | 本地模式 E2E（首次需 `npx playwright install chromium`） |
| `npm run check:functions` | Deno 检查 Edge Functions 与 Shared Core（需安装 Deno） |
| `npm run test:db` | 数据库 RLS 安全测试（需 Local Supabase 运行中） |
| `npm run test:online` | 在线集成 E2E（完整 BO3 / 权限 / RLS attack；**Supabase 不可用时直接失败**） |
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

## 未来计划

1. 真实忍者数据库与素材系统
2. 秘卷 / 通灵 BP
3. 赛事数据与复盘统计

## 在线 BP 设置（可选，自 v0.3.0 起逐步完善）

本地 BP 仍然完全离线可用。双人实时 BP 房间基于 Supabase（Postgres + Realtime + Edge Functions + Anonymous Auth）。

### 1. 创建 Supabase 项目并开启匿名登录

1. 在 [supabase.com](https://supabase.com) 创建项目
2. Dashboard → Authentication → Sign In / Up → 勾选 **Anonymous sign-ins**

### 2. 运行数据库迁移（结构可版本控制、可复现）

```bash
npm i -g supabase          # 或 scoop/brew 安装 Supabase CLI
supabase login
supabase link --project-ref <你的项目 ref>
supabase db push           # 应用 supabase/migrations/ 下的全部迁移
```

迁移内容：
- `0001_online_rooms.sql`：`rooms` / `room_members` / `room_commands` 三张表、唯一索引（房间码、席位唯一）、
  RLS 策略与权限（成员可读、客户端对业务表只读、客户端禁止修改 match_state）、Realtime publication。
  **已发布的迁移视为 immutable，不再修改。**
- `0002_security_hardening.sql`：room_commands 幂等约束收紧为 `UNIQUE(room_id, user_id, command_id)`；
  `join_attempts` 演化为通用限速表 `action_attempts`（含 `action_type`：JOIN_ROOM / CREATE_ROOM）；
  `apply_room_state_cas` 审计更新按幂等范围定位（`create or replace`，权限不变）。

本地开发可用 `supabase start`（本地栈），不要把生产库用于自动化测试。

### 3. 部署 Edge Functions

```bash
supabase functions deploy room-create
supabase functions deploy room-join
supabase functions deploy room-command
```

三个函数共用 `supabase/functions/_shared/bp-core`（Shared BP Core，与浏览器完全同一套 BP 逻辑），服务端权威：
验证回合与席位、执行 BP 规则、以 revision CAS 写回状态（commandId 幂等）。

### 3.5 忍者池容量

房间创建时会校验「可用忍者数量」是否足以完成整场比赛（最坏情况）。
默认武斗赛 BO3 需要 **22** 名可用忍者（4 Ban + 6 Pick × 3 局）。
不足时返回 `INSUFFICIENT_NINJA_POOL { required, available }`；
本地开赛同样会阻止并提示。容量需求由
`supabase/functions/_shared/bp-core/poolRequirement.ts` 统一推导。

### 3.6 滥用防护

创建 / 加入房间均按 auth user 做服务端限速（CREATE 5/60s + 20/24h；JOIN 15/60s），
单房间观战者上限 50。限速基于 auth user，Anonymous Auth 可重建身份绕过——
生产环境请开启 CAPTCHA（见上方注意事项）。

### 4. 配置前端环境变量

```bash
cp .env.example .env.local
# 填入：
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=<Publishable / anon key>
```

GitHub Pages 部署：在仓库 Settings → Secrets and variables → Actions → **Variables** 中
配置同名两个变量（均为前端公开凭据；SERVICE ROLE 绝不能进 CI/Pages）。

### 5. 安全模型速览

- 客户端对在线业务表（rooms / room_members / room_commands）**只读**——
  创建房间、加入席位、BP 操作、关闭房间全部通过 Edge Functions（service role）完成
- 客户端只能发送语义命令（`SELECT_NINJA` / `SET_GAME_WINNER` / `REQUEST_UNDO`…），
  Side 一律由服务端按 `room_members` + BP 引擎阶段推导，不信任客户端
- `rooms.match_state` 客户端不可写（RLS + GRANT 双重约束），唯一写入口是 `room-command`
  （service role，密钥只在 Deno.env）
- 授权严格先于幂等：跨房间 / 跨用户重用 commandId 返回 `IDEMPOTENCY_KEY_REUSE`，
  绝不返回目标房间状态
- 幂等范围 = (room_id, user_id, command_id) 且校验 command_type / payload 一致性
- 所有状态更新带 `revision` 乐观锁；房间 24h 过期
- Realtime 走 RLS 保护的 postgres_changes，非成员收不到事件；Presence 仅展示在线状态
- 断线自动重订阅 + 低频兜底轮询保证最终一致

### 生产安全注意事项

基于 auth user 的 rate limit 只能防基础滥用：Anonymous Auth 用户可以反复重建匿名身份。
生产公开使用建议在 Supabase Dashboard 为 Anonymous Auth 开启 CAPTCHA / Turnstile。
当前 rate limit 不能阻止所有机器人。

### 6. 已知限制

- 双方需要使用同一份忍者池 JSON（房间固化创建者的池子做服务端校验；名字显示取自各自本地池）
- 在线模式的撤销 = 撤销最后一步 Ban/Pick，且需对方确认（本地模式撤销能力更强）
- 胜负记录/进入下一局/重置 仅房主可执行（防双提交），后续可加双方确认


## v0.3.2 安全加固说明

**在线安全最终加固**（授权先于幂等 / 滥用防护 / 池容量合法性）：

- **幂等授权顺序（P0）**：room-command 严格按「JWT → 解析校验 → load room → 成员授权 → 幂等检查 → 执行」顺序处理；
  授权永远先于幂等响应——跨房间 / 跨用户 / payload 不一致重用 commandId 一律返回
  `IDEMPOTENCY_KEY_REUSE`（或先返回 `NOT_MEMBER`），绝不因 commandId 曾存在而跳过授权或泄漏他房状态
- **幂等范围收紧**：数据库唯一约束从 `command_id` 全局唯一改为 `UNIQUE(room_id, user_id, command_id)`
  （0002 迁移）；同 scope 但 command_type / 规范化 payload 不一致同样判定为复用
- **忍者池容量合法性**：Shared BP Core 新增 `getMinimumRequiredPoolSize(rule)` 按规则推导完成整场比赛
  所需最少可用忍者（默认武斗赛 BO3 = **22**：4 Ban + 6 Pick × 3 局，USED 跨局锁定）；
  room-create 不足返回 `INSUFFICIENT_NINJA_POOL { required, available }`，本地开赛同样前置阻止
- **滥用防护**：room-create 服务端限速（每 auth user 5 次/60s + 20 次/24h，`action_attempts` 通用限速表）；
  单房间观战者上限 50（超出返回 `ROOM_OBSERVER_LIMIT`）
- **Rejected command 审计并发安全**：重复 rejected commandId 走 upsert（忽略冲突），始终返回稳定业务响应，revision 不变
- **test:online 不可静默跳过**：`playwright.online.config.ts` 在配置加载阶段校验
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`，缺失直接抛错非零退出；环境不满足只有 FAIL，没有 SKIP
- **测试收紧**：CAS 并发断言「恰好 1 个 APPLIED + 1 个 REVISION_CONFLICT，revision 只 +1、history 只 +1」；
  新增 Cross-room / Cross-user / payload 不一致攻击测试（全部走真实 Edge Function HTTP）

## v0.3.1 修复说明

**v0.3.1 已通过 CI 中的 Local Supabase 全链路集成验证**：
`supabase start` → `db reset`（空库迁移）→ 数据库安全测试（psql，10 项 RLS/权限断言）→
Edge Functions 真实 HTTP 冒烟（创建/加入/START_MATCH/权限拒绝）→ 在线集成 E2E
（双 Context 完整 BO3 2:1、回合权限、撤销请求流、RLS attack、幂等、revision 冲突、关闭房间）。

关键修复：
- **Edge 导入路径**：Shared BP Core 迁至 `supabase/functions/_shared/bp-core`（CLI 推荐位置），
  前端经 Vite alias `@bp-core` 引用同一实现；`deno check` 进入 CI（edge-check job）
- **Host 判定**：room-command 读取 `host_user_id`，`isHost = JWT user.id === host`
  （v0.3.0 字段缺失导致全部 Host 权限失效）
- **撤销请求**：`pendingAtRevision` = 请求应用后的 revision，期间任何比赛命令自动失效；
  请求者按 JWT 身份绝不能自确认（房主也不可绕过）
- **RESET_MATCH**：`restartMatch()` 比分 0:0、清空 Ban/Pick/USED/历史/计时器
- **玩家名称**：START_MATCH 由服务端从 `room_members.display_name` 填充
- **RLS 最小权限**：客户端对三张业务表仅 SELECT（INSERT/UPDATE/DELETE 全部 REVOKE）；
  `private.is_room_member`（SECURITY DEFINER）消除自引用递归；房间创建与「CAS+审计」
  均为数据库事务 RPC（仅 service_role）；房间码用 pgcrypto 加密学随机源；
  join 尝试限速表（成功失败都计数）
- **断线自愈**：Realtime 断线自动重订阅 + 12s 兜底轮询（最终一致）；
  客户端状态滞后时「未轮到」操作会先 resync 再重试
- **关闭房间**：CLOSE_ROOM 命令正确置 CLOSED 并同步到所有成员

- **Edge Function 导入路径**：Shared BP Core 正式迁至 `supabase/functions/_shared/bp-core`
  （Supabase CLI 推荐位置），前端通过 Vite alias `@bp-core` 引用同一份实现；
  修复了 `../../shared/...` 从函数目录解析到 `supabase/shared/...` 的路径错误
- **`deno check` 进入 CI**（`npm run check:functions`）：三个函数 + Shared Core 全部静态检查
- **Host 判定修复**：room-command 读取 `host_user_id`，`isHost = JWT user.id === host_user_id`
  （v0.3.0 该字段缺失导致 Host 权限全部失效）
- **撤销请求语义重做**：`pendingAtRevision` = 请求应用后的 revision；
  期间任何其他比赛命令都会使命令失效；请求者按真实身份（JWT user.id）绝对不能自确认，
  房主身份也不能绕过双人确认
- **RESET_MATCH**：新增 `restartMatch()`（比分 0:0、清空 Ban/Pick/USED/历史/计时器），
  在线重置回到 WAITING 由房主再次开始
- **玩家名称服务端填充**：START_MATCH 从 `room_members.display_name` 读取双方名称写入 MatchState
- **RLS 重建（最小权限）**：客户端对三张表仅 SELECT；INSERT/UPDATE/DELETE 全部 REVOKE；
  席位/花名册判断走 `private.is_room_member()`（SECURITY DEFINER，无自引用递归）；
  加入尝试限速表 `join_attempts`（成功失败都计数）
- **原子性**：房间创建（房间 + 房主入座）与「CAS 写入 + 命令审计」分别由
  `private.create_room_transaction` / `private.apply_room_state_cas` 单事务完成，
  仅 service role 可执行
- **真实 Supabase 验证进入 CI**：`supabase-integration` job 启动 Local Supabase →
  `db reset` 验证迁移 → pgTAP RLS 安全测试 → Edge Functions HTTP 冒烟 → 在线集成 E2E
  （完整 BO3 / 权限 / 撤销 / RLS attack / 幂等 / revision 冲突）


### Supabase 后端手动部署后的最短验证流程

1. 打开前端 → 「在线 BP」→ 匿名登录成功
2. 创建房间 → 返回 6 位房间码
3. 第二浏览器打开邀请链接 → 加入成功
4. Host 开始比赛 → 双方进入 Ban 阶段
5. 双端实时看到对方的操作

以上全部通过才能认为 Online BP 后端可用。
Pages 部署成功不代表 Supabase 后端已部署或可用。