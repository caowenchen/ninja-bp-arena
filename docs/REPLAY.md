# BP Replay

v0.7.0 的 Replay 是 **BP Draft Replay**，只记录 Ban、Pick、秘卷、通灵、单局结果与规则信息；它不是战斗视频或战斗操作录像。

## Schema 与重建

`BPReplay.schemaVersion` 当前为 `1`。Replay 保存比赛规则、玩家显示名、最终比分、每局初始 BP 状态、按真实顺序排列的 action，以及比赛实际引用资源的紧凑 fallback metadata。它不保存 React/Zustand 状态、Realtime、连接状态、请求队列或 Supabase client。

播放器使用 `initial state + action timeline` 调用纯函数 `reconstructReplayAt(step)` 重建任一步，不在持久化数据中复制逐步完整 MatchState。`RESULT` action 到达时才推进比分。

资源名称与安全素材来自 Replay 自带 snapshot，因此切换、升级或删除当前 Data Pack 后，旧 Replay 仍可显示。没有可靠 timestamp 的事件不会伪造时间。

## 导入与导出

导出文件是 JSON bundle：

```json
{
  "bundleVersion": 1,
  "replay": { "schemaVersion": 1 },
  "checksum": "sha256:..."
}
```

导入上限为 2 MB，并在预览前执行 JSON 解析、schema migration、结构、动作顺序、比分、资源引用、危险 URL 与 checksum 校验。未来 schema 会被明确拒绝，不会清空现有档案。

Checksum 是 canonical serialization 的 SHA-256，只用于发现文件损坏；它不是数字签名，也不能证明比赛真实、官方或未经有意篡改。

## 分享与隐私

本地 Replay 完全离线。只有用户点击“生成只读分享链接”后，紧凑 Replay 才会上传 Supabase。发布前会预览玩家显示名，并可将名称匿名化为 `BLUE` / `RED`。链接包含高熵 opaque token，不在 URL 中嵌入 Replay 数据。

公开页标记为“用户分享的 BP 记录”，不表示官方认证。发布者可手动撤销；撤销后公开读取返回失效状态。本地 Replay 在发布失败或撤销后仍然保留。

服务端重新执行相同 Replay validator，分享上限 512 KB；`javascript:`、`data:`、`file:`、`blob:` 素材地址会被拒绝。数据库客户端没有 `replay_shares` 的直接读写权限，发布、读取与撤销只通过 Edge Functions；在线来源还会检查发布者是对应房间成员。

## Compatibility

Replay Library 使用独立 localStorage key 和 storage schema v5。已有 current match、history、settings、Data Pack 与自定义数据原样迁移。v0.6 及更早的已完成 History 在用户点击“复盘”时动态转换，不做一次性膨胀迁移。
