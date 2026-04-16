# 项目开发规范（AI协作）

本文档是面向 AI 与开发者的项目开发规范。

阅读顺序要求：

1. [项目文件结构说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目文件结构说明.md)
2. [项目完整链路说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目完整链路说明.md)
3. 当前文件

原则：

- 目标是“让项目更清晰、更可维护、更可测试”，不是单纯把代码拆碎。
- 重构优先考虑稳定性、职责边界与可理解性。
- 任何新增功能都必须沿现有分层接入，禁止重新堆回巨石文件。

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

- 任何步骤标题、顺序、key 变更，必须优先改 [data/step-definitions.js](c:/Users/projectf/Downloads/codex注册扩展/data/step-definitions.js)
- 不允许只改 sidepanel 文案而不改共享定义
- 不允许只改 registry 而不改共享定义

## 2. 模块边界规则

### 2.1 可以继续增长的文件

允许增长，但必须保持边界清晰：

- provider 领域实现文件
- 某个单独步骤文件
- 某个单独 manager 文件

### 2.2 不应该继续膨胀的文件

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
4. 是否需要 Step 4 / 7 验证码链路接入
5. 是否需要成功收尾逻辑
6. 是否需要 README 与完整链路文档更新

### 3.3 新增配置项

必须同步检查：

1. 默认值
2. 归一化
3. 导入导出
4. state restore
5. sidepanel UI
6. 是否挂在正确的职责域下
7. 文档

## 4. 测试规范

### 4.1 原则

- 任何结构性重构都必须伴随测试迁移或新增。
- 优先测试：
  - 模块是否接入
  - 核心纯函数是否仍可验证
  - 回退/停止/异常传播是否仍正确

### 4.2 不允许的做法

- 修改结构后不补测试
- 只跑局部测试，不跑全量回归
- 为了通过测试而破坏实际运行边界

### 4.3 最低要求

完成一次结构性改动后，至少执行：

```bash
bun test
```

## 5. 文档更新规范

### 5.1 必须更新文档的场景

- 文件新增/删除/重命名  
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
- 观测、留档、日志、导出这类横切能力必须优先挂在独立配置域下，不能借某个 provider 的业务模式开关隐式控制
- 保留少量兼容型薄包装是允许的，但必须有明确目的：
  - 运行时装配
  - 测试迁移过渡
- 如果某个薄包装已经没有存在意义，应在后续重构中清掉

## 8. AI 开发时的自检清单

每次修改后至少自问：

1. 我这次新增逻辑是不是应该下沉到模块？
2. 我有没有破坏共享步骤定义？
3. 我有没有漏掉 auto-run / sidepanel / message-router 其中之一？
4. 我有没有补或迁移测试？
5. 我有没有更新三份根目录文档？
6. 我新增或修改的文件是否有可见乱码？

## 9. 完成标准

当满足以下条件时，可以视为一次合格开发完成：

- 代码职责边界清晰
- 新旧功能链路完整
- 全量测试通过
- 三份根目录文档已同步
- 没有可见乱码

## 10. 特别要求

以后每次开发，如果影响到项目结构、功能链路或开发边界：

- 必须同步检查并在必要时更新：
  - [项目文件结构说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目文件结构说明.md)
  - [项目完整链路说明.md](c:/Users/projectf/Downloads/codex注册扩展/项目完整链路说明.md)
  - [项目开发规范（AI协作）.md](c:/Users/projectf/Downloads/codex注册扩展/项目开发规范（AI协作）.md)

这是硬要求，不是建议。
