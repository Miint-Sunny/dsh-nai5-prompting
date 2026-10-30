# dsh-nai5-prompting

中文 | [English](README.en.md)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）加一个「NAI5 提示词」预设：用 [nai5-prompting](https://github.com/Miint-Sunny/nai5-prompting) 的 11 个拆分技能构思、设计和写 NovelAI V5 提示词。这个预设只交文本，不调用生图接口；它和 dsh 的其他预设互不干涉。

## 装上之后有什么

新建会话时，在预设菜单（默认显示「Standard mode」的那个按钮）里选「NAI5 提示词」。这个预设里：

- **系统提示词**整份换成写提示词的说明，写代码那套说明不会出现。说明里交代了这个环境的实际情况（只交文本、没有生图和工作台写入、预设开关按「关闭写足」），方法本身全部交给技能。
- **技能**只有 nai5-prompting v1.2.5 的 11 个拆分技能，原样拷贝，没有改动（见 [VENDOR.md](VENDOR.md)）。
- **工具**只有这些：载入技能、读写工作区文件、看图、向你提问、联网搜索和抓取网页（核对 tag 和角色名）。没有终端、子代理、计划模式、任务清单和 MCP。dsh 0.2.2 起，当前模型线路拿不到搜索服务的凭据时，那一步不提供联网搜索。
- **长对话**：上下文快满时自动压缩，也可以手动输入 `/compact`。

## 互不干涉

| | 「NAI5 提示词」预设 | 其他预设（Standard、Creator 等） |
|---|---|---|
| 系统提示词 | 只有本插件的说明 | 不变 |
| 技能 | 只有 11 个 nai5 技能；`~/.dsh/skills`、`~/.agents/skills`、项目里的技能和全局技能（例如桌面端自带的 Office 技能）都不出现 | 不变，看不到 nai5 技能 |
| 工具 | 只有本预设挂载的工具；MCP、宿主插件和其他全局工具都隐藏 | 不变 |
| 工作区说明文件 | 只读工作区里的 `NAI.md`，不读 `AGENTS.md`、`CLAUDE.md` | 不变，不读 `NAI.md` |

隔离只作用在这个预设的会话里，包括先开空会话再切换到这个预设的情况。插件不注册 HTTP 路由，不写任何自定义会话事件，不改默认预设。

例外：`~/.dsh/AGENTS.md` 和 `~/.agents/AGENTS.md` 这两个全局说明文件由 dsh 固定读取，没法按预设关掉。写代码的规则不要放在这两个文件里，放进各个代码仓库自己的 `AGENTS.md`。

## 安装

需要 dsh **0.2.1-rc.2 及以上、0.3.0 以下**（`package.json` 的 `engines.dsh`），在 0.2.1-rc.3、0.2.1-rc.5 和 0.2.2-alpha.2 上实测过。插件是纯 JavaScript，安装时不需要构建，也不需要打开 `allowBuilds`。

**桌面端**：点侧栏的「插件」（不是「设置」），再点页面右上角的「＋ 添加插件」（它旁边的下拉箭头里也有同一个入口「安装第三方插件」），在输入框里填 `github:Miint-Sunny/dsh-nai5-prompting#v0.1.3`，然后点「安装」。想防止标签被改动，就把 `v0.1.3` 换成 [Release 页](https://github.com/Miint-Sunny/dsh-nai5-prompting/releases)上写的那个提交号。输入框里也可以填本机仓库的目录路径。

也可以用命令行：先 **⌘Q 完全退出桌面端**，再用桌面端自带的 dsh 安装：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add github:Miint-Sunny/dsh-nai5-prompting#v0.1.3
```

Release 页上附了打好的 `dsh-nai5-prompting-0.1.3.tgz`，下载后把上面的 `github:…` 换成这个文件的路径也能装，不用联网拉仓库。

**其他 profile**（例如 `dsh web`）：

```bash
dsh plugin --profile web add github:Miint-Sunny/dsh-nai5-prompting#v0.1.3
```

卸载：在插件页关掉或移除这个插件；或者退出桌面端后运行 `dsh plugin --profile desktop remove dsh-nai5-prompting`。卸载后，用这个预设建的旧会话没法继续，装回来就能接着用。

## 使用

1. 准备一个专门写提示词的目录作为工作区，例如 `~/NAI`。不要用代码仓库，免得混进别的文件。
2. 在这个目录里放一份 `NAI.md`，写长期偏好、固定画师串、UC 和 OC 库的位置。模板见 [examples/studio/NAI.md](examples/studio/NAI.md)。每个会话都会自动读入它，压缩上下文后也会重新读入。
3. 新建会话，选「NAI5 提示词」，直接说需求。默认会给出能直接复制的提示词：只给题材（例如“荷叶有关的场景”）或选了某个方向时，它先用几行写出替你补的画面方案，再给完整提示词，题材很开放时另附几个可换的方向。只想要点子、角色或服装设计、漫画分镜时，明确说“先给几个方向”“只要设计”就行。
4. 要存东西时直接说，例如“把这个角色存进 OC 库”“存一下这版定稿”。不说就不写文件。
5. 照图反推：在输入框里附上图片。需要选一个能看图的模型（例如内置目录里的 `deepseek-flash`）；模型不支持图片时，dsh 会直接拒收带图的消息。

## 记忆与上下文

dsh 本身没有跨会话记忆。这个预设靠下面几样就够用，不需要另装记忆插件：

- **`NAI.md`**：长期偏好和资料索引，每个会话自动读入，压缩后重新读入，改了下一轮就生效。
- **工作区文件**：OC 设定、定稿提示词存成文件，用到时再读。画师串、UC 和原串都要逐字保留，存成文件最可靠。
- **`@` 引用**：在输入框里用 `@` 选一个旧会话，它的文字内容会作为只读背景带进来；`@文件` 只插入路径，由模型自己去读。

不推荐给写提示词装语义记忆 MCP（官方文档里的 Memorix、MCP Reference Memory、Engram）：这类工具会转述和模糊检索，而技能要求原串逐字保留。

已知局限：dsh 自动压缩用的总结提示词是写死的，按写代码的会话来写英文总结，没法配置。用 DeepSeek 的长上下文时很少会触发；真被压缩过，长期内容靠 `NAI.md` 和工作区文件补回来。

## 配置

预设里 `isolation` 这一行（插件本身）有四个开关：

| 键 | 默认 | 作用 |
|---|---|---|
| `hideGlobalTools` | `true` | 隐藏全局工具（MCP、宿主插件、桌面端附加工具） |
| `keepGlobalTools` | `[]` | 仍要保留的全局工具名，例如某个 MCP 工具的完整名字 |
| `hideGlobalSkills` | `true` | 隐藏全局技能（例如桌面端的 Office 技能） |
| `keepGlobalSkills` | `[]` | 仍要保留的全局技能名 |

要改任何一项（包括预设名、系统提示词、工具），把 [cordis.patch.yml](cordis.patch.yml) 里的整行 `preset-nai5-prompting` 复制到你 profile 的 `cordis.patch.yml` 再改：dsh 的补丁会替换整行配置，只写改动的那一项会丢掉其余内容。

## 更新技能

`skills/` 是 nai5-prompting 某个发布标签的原样拷贝，`vendor.json` 记着标签、提交号和每个文件的 SHA-256。不要在这里改技能文件，测试会拦下。上游发了新版本时：

```bash
node scripts/sync-skills.mjs v1.3
```

脚本会克隆那个标签，按发布自带的 `SHA256SUMS.txt` 逐个校验，再整份替换 `skills/` 并重写 `vendor.json`。之后更新本文里的版本号，运行 `npm test`，再提交。

## 开发

```bash
npm install --ignore-scripts
npm test
```

测试覆盖：技能与 `vendor.json` 逐字节一致；补丁只插入一个预设、只挂允许的插件、系统提示词里没有会被插值的 `{{`；技能目录的路径表达式在 profile 布局下解析到 `skills/`；隔离插件在注册表替身上的行为。

## 已验证

**0.1.3，2026-10-30。** dsh 0.2.1-rc.3、0.2.1-rc.5（桌面端更新前后自带的 CLI）和 0.2.2-alpha.2（npm 上的官方包，装在临时目录），各用一个临时 `DSH_HOME` 的 `web` profile，装 `npm pack` 出的包。模型换成本机一个记录请求的假接口，没有用真实 key，直接核对 dsh 发给模型的内容。另加了一个启动 4 秒后才注册的全局测试工具，模拟 MCP 工具晚注册：

- 预设出现在菜单里；输入 `/` 时技能区只有 11 个 nai5 技能。
- 「NAI5 提示词」会话的请求：系统提示词只有本插件的说明；工具只有本预设挂载的那几个（0.2.1 上 8 个；0.2.2 上 7 个，因为没配搜索凭据时 dsh 不提供 `web_search`）；读入 `NAI.md`，不读 `AGENTS.md`；技能目录只有 nai5 技能。测试用的全局工具、全局技能和晚注册的工具都被隐藏，服务重启后接着用旧会话的第一步也一样。
- 0.1.2 在 rc.3 上复现过晚注册的问题：那个工具会出现在第一步，第二步才被移除。0.1.3 改成工具注册表一有变化就屏蔽。

**桌面端 0.2.1-rc.3 日常使用（0.1.2）。** 技能目录只有 11 个 nai5 技能，桌面端自带的 Office 技能被隐藏。MCP 和 Office 附加工具在每次启动后的第一步出现、第二步才被移除，就是上面那个问题，0.1.3 已修。

**0.1.0，2026-10-20，dsh 0.2.1-rc.2。** 除上面的检查外还核对过：同一工作区的 Standard 会话照旧能看到全局工具和全局技能、读 `AGENTS.md` 不读 `NAI.md`、没有 nai5 技能；先开空会话再切到这个预设也生效；会话文件里没有自定义事件类型。

技能调用的效果只在桌面端日常用过，没有系统测过。

## 许可

GPL-3.0-only，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。`skills/` 里的技能版权归 Miint-Sunny，来自 [nai5-prompting](https://github.com/Miint-Sunny/nai5-prompting)，同样按 GPL-3.0-only 提供。
