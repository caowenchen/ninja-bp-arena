# 数据维护流程

默认 Battle Data Pack 只由 `data/source/` 生成。请维护 CSV 和元数据源，不要直接修改 `data/packs/default/*.json`。

## Source

- `manifest.json`：包 ID、内容版本、固定更新时间、Data Status 与来源。
- `ninjas.csv`、`secret-scrolls.csv`、`summons.csv`：人工维护资源。
- `stable-ids.json`：已发布稳定 ID 的类型与名称基线。

当前仓库没有可信的完整游戏数据源，因此默认包保持 `DEMO`。禁止凭记忆补齐名单或来源。`VERIFIED` 只表示维护者依据 `sources` 所列材料核验过，不代表官方认证。

## Stable ID

ID 一经发布即作为历史引用永久保留。改名不改 ID；停止使用的资源设置 `enabled=false`，需要明确废弃时同时设置 `deprecated=true`，不要删除再新增。确需改名时，在评审中确认后更新 Registry；审计中的 `REVIEW REQUIRED` 不得绕过。

## Build 与 Audit

```bash
npm run data:build
npm run data:validate
npm run data:audit
```

构建会执行 Unicode NFC、trim、布尔解析、数组去重和稳定排序，生成三类 JSON、counts、SHA-256 checksum 与 `data/reports/latest-diff.json`。`updatedAt` 来自 Source manifest，不读取当前时间，所以相同输入会产生逐字节相同输出。

Audit 会检查重复/跨类型 ID、空名称、非法字段、重复别名或标签、缺失 Stable ID、可疑改名、删除 ID、deprecated/enabled 冲突、素材键以及过期 checksum/生成文件。危险变化会以非零退出码终止 CI。

## Diff、Review 与 Release

1. 编辑 Source 和内容版本；来源必须真实且可复核。
2. 新资源同步登记 Stable ID；移除改为停用或废弃。
3. 运行构建与审计，检查 `latest-diff.json` 的 Added / Updated / Disabled / Removed。
4. 审查来源、版权、稳定 ID 和差异；不得提交 Base64 或未授权批量图片。
5. 运行完整质量门后再发布。

图片与数据保持解耦。素材解析优先级是用户覆盖、已安装 Asset Pack、资源显式地址、Data Pack `assetBaseUrl + assetKey`、占位图；加载失败不得阻断 BP。
