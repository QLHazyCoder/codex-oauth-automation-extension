# 项目开发规范（AI协作）

本文档是面向 AI 与开发者的项目开发规范。

阅读顺序要求：

1. [项目文件结构说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目文件结构说明.md)
2. [项目完整链路说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目完整链路说明.md)
3. 当前文件

原则：

- 目标是“让项目更清晰、更可维护、更可测试”，不是单纯把代码拆碎。
- 重构优先考虑稳定性、职责边界与可理解性。
- 任何新增功能都必须沿现有分层接入，禁止重新堆回大文件。
- 乱码问题视为阻塞问题，不是“后面再顺手修”的小问题。

## 1. 架构原则

### 1.1 背景层原则

- [background.js](c:/Users/projectf/Downloads/codex注册扩展/background.js) 应尽量保持为入口壳、装配层和少量保留函数。
- 业务流程优先放到：
  - `background/steps/`
  - `background/*.js` 的共享模块
- 不要把新 provider、大段自动运行逻辑、大段消息分发逻辑直接写回 `background.js`。

### 1.2 步骤原则

- 每个步骤必须有清晰边界。
- 步骤文件应优先使用语义化名称，不再使用 `stepX.js` 命名。
- 步骤顺序统一由：
  - [data/step-definitions.js](c:/Users/projectf/Downloads/codex注册扩展/data/step-definitions.js)
  - [background/steps/registry.js](c:/Users/projectf/Downloads/codex注册扩展/background/steps/registry.js)
  共同管理。

### 1.3 前后端步骤定义共享原则

- 任何步骤标题、顺序、key 变更，必须优先改 [data/step-definitions.js](c:/Users/projectf/Downloads/codex注册扩展/data/step-definitions.js)。
- 不允许只改 sidepanel 文案而不改共享定义。
- 不允许只改 registry 而不改共享定义。

## 2. 模块边界规则

### 2.1 可以继续增长的文件

允许增长，但必须保持边界清晰：

- provider 领域实现文件
- 某个单独步骤文件
- 某个单独 manager 文件

### 2.2 不应继续膨胀的文件

- [background.js](c:/Users/projectf/Downloads/codex注册扩展/background.js)
- [sidepanel/sidepanel.js](c:/Users/projectf/Downloads/codex注册扩展/sidepanel/sidepanel.js)

如果在这两个文件里新增了大段逻辑，应优先判断是否应该下沉到模块。

## 3. 新增功能接入规范

### 3.1 新增步骤

必须同步检查：

1. 新增步骤文件到 `background/steps/`
2. 更新 [data/step-definitions.js](c:/Users/projectf/Downloads/codex注册扩展/data/step-definitions.js)
3. 更新 [background/steps/registry.js](c:/Users/projectf/Downloads/codex注册扩展/background/steps/registry.js)
4. 检查 sidepanel 动态步骤渲染是否已自动覆盖
5. 检查 auto-run 是否需要纳入此步骤
6. 检查状态流、回退流、日志流是否完整
7. 补测试

### 3.2 新增 provider

必须同步检查：

1. 是否有纯工具模块
2. 是否需要 background provider 调度逻辑
3. 是否需要 sidepanel 配置项
4. 是否需要 Step 4 / 8 验证码链路接入
5. 是否需要成功收尾逻辑
6. 是否需要 README 与完整链路文档更新

### 3.2.1 共享别名邮箱逻辑补充

当 Gmail / 2925 这类“既影响注册邮箱生成，又影响 sidepanel 表单行为”的 provider 发生变化时，必须优先检查是否应落入共享层，而不是继续把规则分散写在：

- `background.js`
- `sidepanel/sidepanel.js`
- 某一个单独 provider 分支里

当前约定：

- Gmail / 2925 的基邮箱解析、兼容性判断、别名生成、UI 文案优先收敛到 `managed-alias-utils.js`
- `2925` 是否参与“共享别名邮箱链路”必须由共享层统一判断；当前只有 `mail2925Mode = provide` 才允许把 `2925` 视为别名邮箱 provider，`receive` 不能在 sidepanel / step / provider 分支里各自偷写一套判断
- `background/generated-email-helpers.js` 只负责调度，不应再次复制 Gmail / 2925 规则
- `background/signup-flow-helpers.js` 只负责“复用已有邮箱还是重新生成”的流程决策
- `sidepanel/sidepanel.js` 只负责 UI 接线、校验触发和状态同步
- Hotmail / 2925 账号池这类跨 provider 的 sidepanel 表单显隐、头部按钮文案切换与共用操作行，应优先收敛到共享 UI helper（当前为 `sidepanel/account-pool-ui.js`），不要在各自 manager 中复制一套近似状态机
- 如果 `2925` 的某个运行态模式会让“别名基邮箱”和“账号池 / 当前账号选择”出现不同显隐规则，必须优先拆行或拆成独立配置块，不能把账号池开关绑死在别名基邮箱那一行里

### 3.3 新增配置项

必须同步检查：

1. 默认值
2. 归一化
3. 导入导出
4. state restore
5. sidepanel UI
6. 是否挂在正确的职责域中
7. 文档

### 3.4 新增运行态模式

如果新增的是“运行态 UI 模式”而不是持久配置或新来源，必须先把边界说清楚，再落代码。

当前约定示例：

- `contributionMode` 是 sidepanel 的运行态 UI 模式，不是新的 `panelMode`
- `panelMode` 仍然只允许 `cpa | sub2api`
- 运行态模式不能混进 `PERSISTED_SETTING_DEFAULTS`
- 运行态模式不能混进配置导入/导出
- 如果运行态模式会临时覆盖某些持久配置的显示值，必须同时处理好“退出模式后恢复”和“自动保存不能误覆盖原配置”这两个问题
- 如果运行态模式要隐藏某一行 UI，必须先检查这行里是否绑定了不该一起隐藏的其他设置；必要时先拆行，再做显隐

当前贡献模式补充约定：

- 贡献模式属于 `CPA` 来源下的特殊业务模式，不是新的 provider
- 贡献模式允许扩展内承接公开 OAuth 交互，但只能调用公开接口，不能触碰 `/v0/management/*`
- 如果产品要求“开始贡献”和主自动流走同一条链路，则优先把贡献服务接入步骤 7 / 10，而不是额外分出一套平行 mini-flow
- 贡献流程的后台公开 OAuth 状态机应优先收敛到独立模块，例如 `background/contribution-oauth.js`
- 贡献模式的侧栏按钮、状态展示和轮询调度应优先收敛到独立 manager，例如 `sidepanel/contribution-mode.js`
- 如果服务端当前返回“无需手动提交 callback”，扩展端必须把它当兼容成功态处理，不能简单按 HTTP 非 200 直接视为失败

## 4. 测试规范

### 4.1 原则

- 任何结构性重构都必须伴随测试迁移或新增。
- 优先测试：
  - 模块是否接入
  - 核心纯函数是否仍可验证
  - 回退、停止、异常传播是否仍正确

### 4.2 不允许的做法

- 修改结构后不补测试
- 只跑局部测试，不跑全量回归
- 为了通过测试而破坏实际运行边界

### 4.3 最低要求

完成一次结构性改动后，至少执行：

```bash
bun test
```

补充说明：

- 实际执行命令以仓库当前 `package.json` 为准
- 本仓库当前全量回归命令为：

```bash
npm test
```

## 5. 文档更新规范

### 5.1 必须更新文档的场景

- 文件新增、删除、重命名后
  更新 [项目文件结构说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目文件结构说明.md)
- 功能链路变化
  更新 [项目完整链路说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目完整链路说明.md)
- 开发流程、边界、约束变化
  更新当前文件

### 5.2 文档更新要求

- 不能只改代码不改文档
- 不能只改文档标题不改正文细节
- 不能让结构文档漏文件
- 不能让链路文档落后于真实实现

### 5.3 乱码要求

- 所有中文文档、中文注释、中文日志、sidepanel 文案、错误提示文案都必须避免乱码。
- 修改任何包含中文的文件时，必须把“乱码检查”视为与“功能是否正确”同级的必做项。
- 如果某次修改引入了可见乱码，则该次开发视为未完成，不能提交为最终结果。
- 不允许把“当前终端显示有点乱，但文件也许没问题”当作默认成立；必须做显式检查。
- 如果文件历史上曾出现过编码问题，修改后必须再次审查该文件整体，而不是只看改动片段。

## 6. 命名规范

### 6.1 文件命名

- 步骤文件使用语义化名称
- 工具文件按职责命名
- 不要再新增 `misc.js`、`temp.js`、`new.js`、`helper2.js` 这种模糊文件名

### 6.2 key 命名

- 步骤 key 使用短语义英文 kebab-case
- message type 保持稳定，新增时优先语义化大写常量风格

## 7. 代码风格与实现要求

- 优先复用现有模块，不重复发明一套新流程
- 共享逻辑先提公共层，再让步骤层调用
- 代码新增后应尽量减少主文件体积，而不是只做“形式拆分”
- 观察、留档、日志、导出这类横切能力必须优先挂在独立配置域下，不能借某个 provider 的业务开关隐式控制
- 保留少量兼容型薄包装是允许的，但必须有明确目的：
  - 运行时装配
  - 测试迁移过渡
- 如果某个薄包装已经没有存在意义，应在后续重构中清掉
- 涉及中文内容的文件必须保持稳定编码，修改后要主动检查是否出现乱码、错码、异常替换字符。

## 8. AI 开发时的自检清单

每次修改后至少自问：

1. 我这次新增逻辑是不是应该下沉到模块？
2. 我有没有破坏共享步骤定义？
3. 我有没有漏掉 auto-run / sidepanel / message-router 其中之一？
4. 我有没有补或迁移测试？
5. 我有没有更新三份根目录文档？
6. 我新增或修改的文件是否有可见乱码？
7. 我有没有逐个检查本次改动涉及的中文文案、日志、注释、文档没有乱码？
8. 如果改动影响 Gmail / 2925 别名邮箱逻辑，我有没有同步检查 `managed-alias-utils.js`、sidepanel 接线、background 调度、auto-run reset 和回归测试？

## 9. 完成标准

当满足以下条件时，可以视为一次合格开发完成：

- 代码职责边界清晰
- 新旧功能链路完整
- 全量测试通过
- 三份根目录文档已同步
- 没有可见乱码
- 已对本次修改涉及的文件做过乱码审查

## 10. 特别要求

以后每次开发，如果影响到项目结构、功能链路或开发边界：

- 必须同步检查并在必要时更新：
  - [项目文件结构说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目文件结构说明.md)
  - [项目完整链路说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目完整链路说明.md)
  - [项目开发规范（AI协作）.md](c:/Users/projectf/Downloads/codex注册扩展/项目开发规范（AI协作）.md)

- 每次开发结束前，必须审查本次修改文件与关键运行文案没有乱码：
  - 文档正文
  - sidepanel 中文文案
  - 日志文案
  - 报错文案
  - 中文注释

这是硬要求，不是建议。
