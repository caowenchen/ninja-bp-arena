# Ninja Data Pack

Ninja Data Pack 是 Ninja BP Arena 的纯数据包格式。它不依赖头像素材即可工作；项目内置包和第三方包都不得声称为官方数据，除非来源确有可验证的官方授权。

当前仓库的 `data/packs/default/` 是 28 名角色的 Demo 示例包，不是当前游戏版本的完整名单。

## 目录与 Bundle

仓库包目录：

```text
data/packs/<pack-id>/
├── manifest.json
├── ninjas.json
└── CHANGELOG.md
```

网页导入使用单 JSON Bundle：

```json
{
  "manifest": { "schemaVersion": 1, "id": "my-pack", "name": "我的数据包", "version": "2026.09.1", "updatedAt": "2026-09-01T00:00:00.000Z", "ninjaCount": 1 },
  "ninjas": [{ "id": "stable-ninja-001", "name": "示例忍者", "quality": "A", "tags": [], "enabled": true }]
}
```

## Manifest

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 当前为 `1`，描述 JSON 结构版本 |
| `id` | 是 | 数据包稳定 ID |
| `name` | 是 | 显示名称 |
| `version` | 是 | 内容版本，推荐 `YYYY.MM.N` |
| `updatedAt` | 是 | ISO 时间 |
| `ninjaCount` | 是 | 必须等于 `ninjas.length` |
| `gameVersion` | 否 | 对应的游戏版本说明 |
| `source` / `description` | 否 | 来源与纯文本描述 |
| `checksum` | 否 | `sha256:<hex>`；存在时导入和远程更新必须匹配 |
| `assetBaseUrl` | 否 | HTTPS 地址或站点绝对路径，与 `assetKey` 拼接 |

`schemaVersion` 与 `version` 不同：前者只在格式变化时升级，后者在内容变化时升级。版本比较按数字分段进行，无法解析时回退到 `updatedAt`。

## Ninja Schema v2

必需字段：`id`、`name`、`quality`、`tags`、`enabled`。

可选字段：`aliases`、`avatar`、`sortOrder`、`version`、`releaseDate`、`remark`、`slug`、`series`、`forms`、`roles`、`rarityLabel`、`dataVersion`、`assetKey`、`deprecated`。

- `id` 是永久引用。一旦发布，不得因改名、翻译或格式变化而修改。
- `quality` 只能是 `S`、`A`、`B`、`C`。
- 下架角色优先设置 `deprecated: true` 或 `enabled: false`，不要直接删除，否则旧历史可能失去引用。
- 不要把 Base64 图片写入数据包或在线房间快照。

## Checksum

checksum 针对 `ninjas.json` 解析后重新 `JSON.stringify` 的 UTF-8 内容计算 SHA-256。仓库内置包运行：

```bash
npm run data:validate
node scripts/data-validate.mjs --fix-checksum
```

第二条命令会修改 manifest，只应在确认数据变更后使用。

## 远程托管与更新

将 `manifest.json` 与 `ninjas.json` 放在同一 HTTPS 目录。应用先下载并校验 manifest，再下载 ninjas；manifest 最大 100KB，忍者 JSON 最大 5MB，请求 12 秒超时。所有内容通过 schema、数量、稳定 ID 与 checksum 校验后才会进入预览，用户确认前不会覆盖本地数据。

自动检查默认每天最多一次，只检查不自动应用。远程包应使用静态 JSON，不得包含脚本、HTML、动态模块或需要执行的代码。

## 素材

素材优先级为：条目 `avatar` → `assetBaseUrl + assetKey` → 原创文字占位图。图片失败后同一会话不再重复请求，列表图片使用懒加载。

数据包和素材包应分离。请只使用你有权使用的图片；仓库不会抓取、解包或自动提交游戏官方美术资源。

## CSV 维护

可选维护流程：

```text
Excel / data/source/ninjas.csv
→ npm run data:build
→ npm run data:validate
→ 更新 CHANGELOG.md
→ commit
```

CSV 表头见 `templates/ninja-data-pack.example.csv`。`aliases` 与 `tags` 使用 `|` 分隔，不支持跨行单元格。

## 在线与历史兼容

本地比赛创建时保存完整轻量快照；比赛完成后只保留 Ban/Pick 实际引用的角色。在线房间保存房主的轻量快照与数据包元信息，所有成员在该房间内统一显示这份数据，退出房间后仍使用各自的本地数据包。

房间快照和历史回退数据不会覆盖用户的全局忍者池。
