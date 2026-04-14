# 开发者 AI 开发与 PR 流程

请开发者们先让自己的 AI 阅读此文件。

AI 在本仓库里进行开发、整理改动、发起 PR、更新 PR、补充说明时，都必须按本文执行，不能跳步，不能猜，不能自创流程。

本文面向“开发者自己电脑上的 AI”，不是给仓库维护者批量处理别人 PR 用的，也不是版本发布流程。

## 使用前准备

在让 AI 操作 GitHub 之前，开发者本机必须先安装 GitHub CLI，并完成登录。

最低要求：

1. 本机已安装 `git`
2. 本机已安装 GitHub CLI，也就是 `gh`
3. 已完成 GitHub 登录
4. 当前账号对目标仓库至少有读取权限；如果要推分支、改 PR、合并 PR，还需要对应写权限

登录示例：

```powershell
gh auth login
```

如果 AI 检查到 `gh` 不可用，或者 `gh auth status` 显示未登录、登录到错误账号、权限不足，则必须先停止并明确告诉开发者，不准假装已经完成 GitHub 操作。

## 本文适用场景

适用于下面这些任务：

- 开发新功能
- 修复 bug
- 清理陈旧逻辑
- 整理本地提交
- 发起新的 PR
- 更新已有 PR
- 在自己的 PR 下补充说明
- 在权限允许时，把自己的 PR 合并到 `dev`

不适用于：

- 版本发布
- 直接把代码合并到 `master`
- 在没看代码上下文的前提下，靠猜测生成 PR 结论

## 仓库硬性规则

1. 任何结论都不能猜，必须基于真实命令输出、真实 diff、真实代码上下文。
2. 开发基线分支只能是 `dev`。AI 不得以 `master` 作为日常开发起点，也不得把 PR 目标分支设为 `master`。
3. 发起 PR 前，必须先同步最新远端提交，确保当前分支已经对齐最新 `origin/dev`。
4. 如果发现当前 PR 的目标分支是 `master`，AI 必须立刻改为 `dev`，然后重新检查 PR 信息。
5. 如果当前工作区有无法确认归属的脏改动，AI 必须先停下来告诉开发者，不能偷偷带进本次 PR，也不能擅自删除。
6. 开发新功能时，不要为了兼容旧逻辑而保留明显无用的陈旧代码；如果确认无其他代码依赖，应一并清理。
7. 如果旧逻辑本身设计差、实现混乱或者存在 bug，AI 需要继续检查相关调用点；在不影响其他功能的前提下，可以顺手一起修正。
8. 如果改动了 SQL 文件，必须按仓库规则同步本地 MySQL：账号 `root`，密码 `123456`，数据库 `xzs`。
9. 默认不编译、不跑测试。开发完成后提醒开发者自行测试。
10. 如果是前端改动且没有新增依赖，只提醒开发者自己测试即可；如果新增了依赖并完成安装，可以自行验证能否启动，验证后要关闭启动占用的端口，并提醒开发者重新启动。
11. PR 标题、PR 正文、PR 评论都用自然中文直接表达，不要写“自动回复”“AI 分析结果如下”这种固定机器人腔。
12. 没有开发者明确授权时，AI 不得擅自合并 PR、关闭 PR、删除远端分支。

## 开发者需要提供给 AI 的信息

至少提供下面这些内容：

- 仓库本地路径
- 本次要做的功能或问题描述
- 是新任务，还是继续一个已有分支/已有 PR
- 如果已经有 PR，要提供 PR 编号
- 是否允许 AI 在自己的功能分支上执行 `rebase`
- 是否允许 AI 在最后直接发起 PR
- 如果 PR 已经审完，是否允许 AI 直接合并到 `dev`

如果这些关键信息缺失，AI 不能靠猜来补。

## 标准执行顺序

### 阶段 1：环境确认与仓库现状检查

AI 开始干活前，先执行下面这些动作：

```powershell
gh --version
gh auth status
git status --short --branch
git remote -v
git branch --show-current
git fetch origin
```

要求：

1. 必须先确认 `gh` 可用且已登录。
2. 必须确认当前仓库远端是正确仓库。
3. 必须确认当前工作区是否有未提交改动。
4. 不能在没看当前分支状态的情况下直接开始写代码或直接发 PR。

### 阶段 2：先对齐最新 `dev`

#### 场景 A：这是一个新任务

如果是新任务，还没开始写代码，则必须先同步最新 `dev`：

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c <feature-branch>
```

规则：

1. 新任务必须从最新 `dev` 拉出功能分支。
2. 不允许直接在 `dev` 上开发。
3. 不允许从 `master` 拉开发分支。

#### 场景 B：这是一个已有分支上的继续开发

如果开发已经在某个功能分支上进行，则不能为了同步 `dev` 直接丢本地改动。

这时至少要先执行：

```powershell
git fetch origin
git rev-list --left-right --count origin/dev...HEAD
git log --oneline HEAD..origin/dev
```

要求：

1. 必须真实判断当前分支是否已经落后于 `origin/dev`。
2. 如果当前分支落后，先继续开发可以，但在发起 PR 前必须补齐最新 `dev`。
3. 如果当前分支已经出现复杂冲突风险，AI 需要提前告诉开发者，不要拖到最后一刻再爆。

### 阶段 3：开发与本地整理

AI 开发时，必须遵守下面这些要求：

1. 先读相关代码上下文，再改代码。
2. 不能只改表面调用点，必须检查相关联的状态流、配置项、消息流、页面流程、回调流程。
3. 如果发现本次功能附近本来就有坏逻辑，而且修复不会影响其他已使用代码，可以顺手一并修正。
4. 如果为了完成新功能必须删除旧逻辑，就删除，不要为了“看起来兼容”堆陈旧代码。
5. 改完后必须自己检查：
   - `git diff --stat`
   - `git diff`
   - 相关文件中是否残留冲突标记
   - 是否混入无关改动
6. 如果改了 SQL，别忘了同步本地 MySQL `xzs`。

### 阶段 4：发起 PR 前必须再次同步最新 `dev`

这是硬规则。

无论这个分支什么时候开始开发，只要准备发起 PR，就必须再次拉取远端最新提交，并确认当前分支已经吸收了最新 `origin/dev`。

先执行：

```powershell
git fetch origin
git log --oneline HEAD..origin/dev
```

#### 如果 `origin/dev` 没有新提交

可以继续进入下一阶段。

#### 如果 `origin/dev` 有新提交

优先处理方式：

```powershell
git rebase origin/dev
```

如果开发者明确禁止改写当前分支历史，或者这个分支已经有多人共同使用，再改用：

```powershell
git merge origin/dev
```

处理规则：

1. 如果执行了 `rebase`，必须重新检查 diff，确认没有把逻辑改坏。
2. 如果执行了 `rebase` 且当前分支之前已经推到远端，后续推送时只能使用：

```powershell
git push --force-with-lease origin <feature-branch>
```

3. 不允许使用 `git push --force`。
4. 不能只把冲突标记删掉就算完，必须继续检查冲突两边的真实逻辑是否仍然一致。

### 阶段 5：提交与推送

在发起 PR 前，AI 必须先把本次改动整理干净。

至少要执行下面这些检查：

```powershell
git status --short
git diff --stat origin/dev...HEAD
git diff origin/dev...HEAD
```

要求：

1. PR 中只能包含与本次任务相关的改动。
2. 不要把临时调试代码、无关格式化、无关文件重命名、构建产物一起带进 PR。
3. 提交信息必须描述真实功能结果，不要写：
   - `update`
   - `fix bug`
   - `merge branch`
   - `修改一下`
4. 推送前要确认当前分支不是 `dev`，也不是 `master`。

推送示例：

```powershell
git push -u origin <feature-branch>
```

### 阶段 6：创建或更新 PR

PR 只能指向 `dev`。

创建 PR 时使用：

```powershell
gh pr create --base dev --head <feature-branch> --title "<PR标题>" --body-file <PR正文文件>
```

如果 PR 已经存在，则执行：

```powershell
gh pr view <PR_NUMBER> --json number,title,baseRefName,headRefName,state,isDraft,url
```

如果发现已有 PR 的目标分支不是 `dev`，必须改正：

```powershell
gh pr edit <PR_NUMBER> --base dev
```

改完后，再重新读取一次 PR 信息，确认：

- `baseRefName = dev`
- PR 仍是 open
- head 分支正确

#### PR 标题要求

1. 直接描述功能结果或修复结果。
2. 不要把标题写成 Git 动作描述。
3. 不要写空洞标题。

#### PR 正文要求

PR 正文直接写真实信息，建议结构如下：

```markdown
## 本次改动
- ...

## 风险与影响
- ...

## 测试情况
- 未运行测试，请开发者自行验证
```

说明：

1. 正文必须基于真实改动来写。
2. 不要写固定“自动回复”抬头。
3. 不要写和代码不相符的夸大表述。

### 阶段 7：PR 后续补充说明

如果 AI 需要在 PR 里补充评论、解释冲突、说明待确认点，要求如下：

1. 直接写清楚问题、原因、影响、建议。
2. 语气自然、简洁、可读。
3. 不要使用固定机器人模板。
4. 不要为了“像 AI”而加免责声明废话。
5. 评论内容必须和真实代码、真实 diff、真实冲突一致。

### 阶段 8：只有在明确授权时，才允许合并 PR

如果开发者明确要求 AI 继续合并自己的 PR，则必须先再次确认：

```powershell
gh pr view <PR_NUMBER> --json number,title,baseRefName,headRefName,state,isDraft,mergeable,mergeStateStatus,url
git fetch origin
git log --oneline HEAD..origin/dev
```

合并前必须满足：

1. PR 目标分支是 `dev`
2. PR 不是 draft
3. PR 仍然是 open
4. 当前分支已经吸收了最新 `origin/dev`
5. 没有尚未处理的明确问题
6. 开发者已经明确授权合并

如果满足以上条件，才可以执行 GitHub 合并，例如：

```powershell
gh pr merge <PR_NUMBER> --merge --delete-branch
```

限制：

1. AI 只能把自己的 PR 合并到 `dev`。
2. AI 不得把任何开发分支直接合并到 `master`。
3. 如果发现 PR 目标分支是 `master`，先改成 `dev`，再重新核对是否允许继续。

## 开发清单

开发时按下面清单自检，避免漏项：

### 第 1 阶段：开始前

- `gh` 已安装且已登录
- 当前仓库正确
- 当前工作区状态已确认
- 已明确本次任务是否是新任务还是续做

### 第 2 阶段：开发前基线

- 新任务已从最新 `dev` 拉分支
- 续做任务已确认自己相对 `origin/dev` 的落后情况
- 没有误在 `master` 或 `dev` 上直接开发

### 第 3 阶段：开发中

- 代码上下文已阅读
- 相关联逻辑已检查
- 无用旧代码已清理
- SQL 改动已同步本地数据库

### 第 4 阶段：发 PR 前

- 已再次获取最新 `origin/dev`
- 已完成 `rebase` 或 `merge`
- diff 只包含本次任务改动
- 提交信息清晰
- 当前分支不是 `dev` / `master`

### 第 5 阶段：PR 与收尾

- PR 目标分支确认是 `dev`
- PR 标题和正文与真实改动一致
- 如有评论，内容为自然中文，不用固定机器人模板
- 如果未跑测试，已明确提醒开发者测试

## 最终反馈给开发者时必须说明

AI 完成后，至少要向开发者明确反馈下面这些信息：

1. 实际执行了哪些命令和动作
2. 当前分支是否已经同步最新 `origin/dev`
3. 是否创建了新 PR，或者更新了已有 PR
4. PR 编号和链接是什么
5. PR 目标分支是否确认是 `dev`
6. 是否执行了 `rebase` 或 `merge`
7. 是否改了 SQL 并同步了本地数据库
8. 是否运行过测试；如果没跑，要明确提醒开发者自行测试
9. 是否已经合并；如果已合并，要明确说明是合并到 `dev`

## 一句话执行要求

AI 在本仓库里做开发与提 PR 时，必须按“先确认环境与当前工作区，再对齐最新 `dev`，再开发与整理改动，再次同步最新 `dev`，最后只向 `dev` 发起或更新 PR；只有在开发者明确授权时，才允许把自己的 PR 合并到 `dev`”的顺序执行，不能跳步，不能猜，不能偷懒。
