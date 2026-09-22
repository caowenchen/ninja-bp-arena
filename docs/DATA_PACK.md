# Battle Data Pack v2

Battle Data Pack 是 Ninja BP Arena v0.6 的纯数据包格式，可同时提供 Ninja（忍者）、Secret Scroll（秘卷）与 Summon（通灵）。它不依赖图片素材即可工作。仓库内置资源全部是 Demo 示例，不是官方完整数据库。

## 目录与 Bundle

```text
data/packs/<pack-id>/
├── manifest.json
├── ninjas.json
├── secret-scrolls.json
├── summons.json
└── CHANGELOG.md
```

网页导入使用原子 JSON Bundle：

```json
{
  "manifest": {
    "schemaVersion": 2,
    "id": "my-pack",
    "name": "My Battle Pack",
    "version": "2026.09.1",
    "updatedAt": "2026-09-18T00:00:00.000Z",
    "ninjaCount": 1,
    "secretScrollCount": 1,
    "summonCount": 1
  },
  "ninjas": [{ "id": "ninja-stable-001", "name": "示例忍者", "quality": "A", "tags": [], "enabled": true }],
  "secretScrolls": [{ "id": "scroll-stable-001", "name": "示例秘卷", "tags": [], "enabled": true }],
  "summons": [{ "id": "summon-stable-001", "name": "示例通灵", "tags": [], "enabled": true }]
}
```

## v1 → v2 migration

v1 Ninja-only Bundle 仍可导入。导入器会把缺失的 `secretScrolls` / `summons` 当作空数组，并在内存中升级 manifest 为 schema v2；原有 Ninja stable ID 保持不变。已安装 v0.4 包、本地设置、历史和进行中比赛由 storage schema v4 兼容读取。损坏内容会被拒绝并回退到内置 Demo 包，不会让页面白屏。

## Manifest

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | v2 新包写 `2`；导入器兼容 `1` |
| `id` / `name` / `version` | 是 | 包的稳定 ID、显示名和内容版本 |
| `updatedAt` | 是 | ISO 时间 |
| `ninjaCount` | 是 | 等于 `ninjas.length` |
| `secretScrollCount` / `summonCount` | v2 是 | 分别等于对应数组长度 |
| `checksum` | 否 | 完整有效内容的 `sha256:<hex>` |
| `assetBaseUrl` | 否 | HTTPS 地址或站点绝对路径 |
| `dataStatus` | 否 | `DEMO` / `COMMUNITY` / `VERIFIED` |
| `sources` | 否 | 真实来源的 `id`、`label`、可选 HTTPS URL 与核验日期 |

checksum 覆盖规范化后的 `{ ninjas, secretScrolls, summons }`，不是只覆盖 Ninja。远程更新按“下载 → schema/数量/ID 校验 → checksum → 分类型 Diff 预览 → 用户确认 → 原子安装”执行。

## Resource schema 与 stable ID

三类资源共有：`id`、`name`、`aliases?`、`asset?` / `avatar?`、`assetKey?`、`tags`、`enabled`、`deprecated?`、`dataVersion?`。Ninja 额外要求 `quality`（S/A/B/C），并继续兼容 v0.4 字段。

- ID 是永久引用；改名、翻译或素材变化不能改 ID。
- 同一包内三类资源的 ID 必须全局唯一。
- 下架内容优先使用 `deprecated: true` 或 `enabled: false`。
- 不得把 Base64 / `data:` 图片写入在线快照。
- 缺图时 UI 使用按资源类别区分的原创文字占位。

## 远程托管

v2 远程目录把 `manifest.json`、`ninjas.json`、`secret-scrolls.json` 与 `summons.json` 放在同一 HTTPS 目录。v1 远程包只需要前两个文件。请求有超时和大小限制；校验失败时旧包保持不变。

## Asset Pack

素材包与数据包独立，只需要轻量 manifest：`id`、`version`、`baseUrl` 和可选 `overrides`（Stable Resource ID → URL）。统一 Resolver 按“用户覆盖 → Asset Pack → 资源显式素材 → Data Pack `assetBaseUrl + assetKey` → 占位图”解析。无素材、非法 URL、损坏 assetKey 或加载失败都只影响图片展示，不影响 BP；所有 `data:` / Base64 图片继续被拒绝。

## 在线与历史

本地比赛在创建时固化完整 Battle Resource Snapshot。在线房间把相同快照写入 `rooms.resource_snapshot`，BLUE、RED 与 Observer 都只使用房间权威快照。旧房间仍从 `rooms.pool` 安全回退。

比赛结束后历史只保留实际 Ban/Pick 过的资源 fallback metadata，不复制整个数据包。即使资源以后被删除，旧赛果仍可显示。

## Demo 数据状态

- Ninja：Demo
- Secret Scroll：Demo
- Summon：Demo

这些数据只用于功能演示与测试，不代表当前游戏版本、官方规则或官方完整名单。项目不会爬取腾讯网站、逆向 APK、解包游戏资源或自动抓取官方美术素材。

`VERIFIED` 只表示项目维护者依据 manifest 中列出的来源核验过，不代表腾讯或游戏官方认证。资源可选以 `sourceRefs` 引用少数例外来源；通常优先使用 Pack 级来源。

默认包由 `data/source/` 生成。Stable ID、删除保护、改名审查、Diff 与发布步骤见 [DATA_MAINTENANCE.md](DATA_MAINTENANCE.md)。

## 校验

```bash
npm run data:validate
node scripts/data-validate.mjs --fix-checksum
```
