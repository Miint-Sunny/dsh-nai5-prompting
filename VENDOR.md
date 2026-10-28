# 内置技能：nai5-prompting

- 来源：<https://github.com/Miint-Sunny/nai5-prompting>
- 版本：见 `vendor.json` 的 `tag` 与 `commit`（当前 v1.2.5，`5f131b770b2295d8280663927c2bf00a8c2af688`）
- 形式：拆分版，11 个技能
- 许可：GPL-3.0-only，与本仓库相同；每个技能目录里保留了原有的 `LICENSE` 与 `NOTICE`

**`skills/` 里的文件是原样拷贝，不要就地改。** 上游改了什么，就用 `node scripts/sync-skills.mjs <tag>` 整份换一次：脚本按那个发布自带的 `SHA256SUMS.txt` 校验后替换，并重写 `vendor.json`。`npm test` 会逐个比对校验和，就地改过的文件会让测试失败。

本插件自己的补充（这个环境只交文本、预设开关怎么处理、交付格式、文件写入的边界）写在 `cordis.patch.yml` 的系统提示词里，不写进技能文件。
