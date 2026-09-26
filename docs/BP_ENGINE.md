# BP Engine（v0.8）

本项目是玩家制作的非官方工具。内置规则仅供示例；规则内容不代表游戏官方赛事规则。

## Normalized Rule

旧版 Ninja-only `BattleRule` 仍可读取。进入 Shared Core 后，`normalizeBattleRule` 将旧 `banSequence`、`pickSequence` 等字段适配为单个 `NINJA` `ResourceDraftRule`；已有 `resourceDrafts` 的规则直接采用该配置。执行时只从规范化后的 `resourceDrafts` 读取 Ninja、Secret Scroll、Summon 的行为，旧字段仅承担兼容与持久化职责。

每个资源 Draft 配置启用状态、每方槽位、按序的 BAN/PICK 步骤、跨局锁定、双方唯一性、Ban 持续性、是否仅首局 Ban、是否每局重选以及可选的资源计时。`validateBattleRule` 校验结构与相互矛盾的配置；`analyzeRuleFeasibility` 在已知可用资源数量时，按最坏情况下的整场比赛容量拒绝无法完成的规则。设置页与开赛入口都使用该分析。

## Phase 与状态流转

`getCurrentDraftPhase(match)` 是阶段的唯一推导入口。它从当前局、资源序列和 `sequenceIndex` 得出行动方、动作、资源类型、步骤内剩余数量及稳定 `phaseKey`。Local、Online、UI 和计时器使用同一阶段语义；服务端始终重新验证命令，前端禁用按钮不是授权边界。

每局的顺序由规则决定：各资源的 BAN/PICK 步骤完成后进入 `READY`；`enterGame` 会再次核对所有必需槽位、重复、被 Ban 与跨局锁定情况，成功才进入 `PLAYING`。记录蓝方或红方胜者后，比分须与已完成局一致；到达 `winsRequired` 即结束整场比赛，否则进入下一局。BO1、BO3、BO5 适用同一逻辑。

## 跨局语义

- `banPersistence: true`：上一局被禁资源继续不可用；若每局都有 Ban，累计禁用。`false` 时下一局重新开放。
- `crossGameLock: true`：已使用的资源在后续局不可再选；`false` 时允许复用。
- `resetEachGame: true`：该资源每局重新 Draft；`false`：首局阵容继承到后续局，不再执行该资源的序列。继承阵容与跨局锁定不能同时开启；若存在 Ban，继承阵容也要求 Ban 持续。
- `uniqueAcrossSides: true`：双方同局不可选同一资源；`false` 时可以共享。

这些配置对三类资源独立生效。最小资源数按所有可能打满的局数计算，并考虑当前局 Ban、持续 Ban 和累计锁定的资源。

## Timer、Undo 与 Online

倒计时属于阶段而非组件渲染。`phaseKey` 不变时保留原 `deadlineAt`，刷新不重置；进入新阶段才建立新截止时间。到零显示 TIMEOUT，绝不自动随机选资源。Local 保存截止时间，Online 以服务端截止时间为准，客户端只按 `deadlineAt - Date.now()` 显示。旧 v0.7 timer key 会在读取时兼容。

Local Undo/Redo 恢复完整 MatchState 与相应阶段的计时状态。Online 命令使用服务器 ACK 更新；提交中的命令不会重复发送。断线、刷新或修订冲突后重新拉取权威房间状态，不重放离线点击。在线 Undo 需要另一方确认，且会在修订变化或超时后失效。Observer 保持只读。

## 验证

`npm run typecheck`、`npm run data:validate`、`npm run data:audit`、`npm run lint`、`npm run test`、`npm run build`、`npm run check:functions`、`npm run test:e2e`。数据库与在线测试需要 Local Supabase：`npx supabase start`、`npx supabase db reset`、`npm run test:db`、`npm run test:online`。
