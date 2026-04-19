# Multi-Page Automation

一个用于批量跑通 ChatGPT OAuth 注册/登录流程的 Chrome 扩展。

当前版本基于侧边栏控制，支持单步执行、整套自动执行、停止当前流程、保存常用配置，以及通过 DuckDuckGo / QQ / 163 / Inbucket / MoeMail 协助获取验证码。

## 功能概览

- 支持两种来源：
  - `CPA`
  - `SUB2API`
- 支持两种执行方式：
  - 单步执行 `Step 1 ~ Step 10`
  - `Auto` 多轮自动执行
- 支持多种验证码来源：
  - `MoeMail`
  - `QQ Mail`
  - `163 Mail`
  - `163 VIP Mail`
  - `Inbucket`
- 支持两种注册邮箱生成方式：
  - `DuckDuckGo`
  - `Cloudflare`
- 支持：
  - 自定义密码
  - 自动暂停与继续
  - 手动跳过步骤
  - 导入 / 导出配置

## 环境要求

- Chrome 浏览器
- 已开启扩展开发者模式
- 你自己的 `CPA` 面板，或可用的 `SUB2API` 后台
- 至少一条能稳定收验证码的邮箱链路
- 如果使用 `QQ / 163 / Inbucket`，对应页面需要提前可正常访问和登录

## 安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录
5. 打开扩展侧边栏

更新本地代码后，记得在扩展页点一次“重新加载”。

## 快速开始

### 方案 A：`CPA + QQ / 163 / 163 VIP`

1. `来源` 选择 `CPA`
2. 填写 `CPA` 地址和管理密钥
3. `Mail` 选择 `QQ Mail`、`163 Mail` 或 `163 VIP Mail`
4. `邮箱生成` 选择 `DuckDuckGo` 或 `Cloudflare`
5. 点击 `获取` 生成邮箱，或手动粘贴可收信邮箱
6. 先单步验证 `Step 1 ~ Step 4`
7. 验证没问题后再用 `Auto`

### 方案 B：`SUB2API + QQ / 163 / 163 VIP`

1. `来源` 选择 `SUB2API`
2. 填写 `SUB2API` 地址、登录邮箱、登录密码
3. 点击分组区域右侧 `刷新`，勾选至少一个 `OpenAI` 分组
4. `Mail` 与 `邮箱生成` 配置方式同方案 A
5. `Step 1` 会在 `SUB2API` 后台生成 OAuth 链接
6. `Step 9` 会把 localhost 回调提交回 `SUB2API` 并创建账号

### 方案 C：`MoeMail API`

1. `Mail` 选择 `MoeMail`
2. 填写 `MoeMail API Base URL` 与 `MoeMail API Key`
3. 可选选择固定域名；不选则使用随机域名
4. 可选填写邮箱前缀；留空时自动生成
5. 点击 `生成` 创建注册邮箱
6. `Step 4 / Step 7` 会通过 `MoeMail API` 自动轮询验证码

## 侧边栏配置说明

### `来源`

- `CPA`
  - 需要填写管理面板 OAuth 页面地址，例如：

    ```txt
    http(s)://<your-host>/management.html#/oauth
    ```

  - `Step 1` 和 `Step 9` 依赖这个地址

- `SUB2API`
  - 需要填写后台地址、登录邮箱、登录密码
  - 分组是多选
  - 只有勾选至少一个分组后，`Step 1 / Step 9` 才会继续执行

### `Mail`

- `MoeMail`
  - 通过 API 直接创建邮箱并轮询验证码
  - 不依赖网页邮箱标签页

- `QQ / 163 / 163 VIP`
  - 直接轮询网页邮箱

- `Inbucket`
  - 通过 `https://<host>/m/<mailbox>/` 访问邮箱页面

### `邮箱生成`

- `DuckDuckGo`
  - 读取或生成新的 `@duck.com` 地址

- `Cloudflare`
  - 插件只负责基于已选域名生成随机前缀邮箱
  - 不会调用 Cloudflare API 创建路由
  - 你需要提前在 Cloudflare 后台配置好转发规则或 Catch-all

### `注册邮箱`

- 可以手动粘贴
- 也可以通过 `获取 / 生成` 自动填入
- `Mail = MoeMail` 时，可以直接点 `生成` 创建邮箱

### `密码`

- 留空时自动生成强密码
- 手动输入时使用自定义密码
- 运行过程中，实际使用的密码会同步回侧边栏

### `Auto`

- 支持多轮运行
- 支持启动前倒计时
- 支持步间延迟
- 支持失败暂停后继续

## 工作流

### 单步模式

侧边栏共有 10 个步骤：

1. `Get OAuth Link`
2. `Open Standalone Signup`
3. `Fill Email / Password`
4. `Get Signup Code`
5. `Fill Name / Birthday`
6. `Login via OAuth`
7. `Get Login Code`
8. `Manual OAuth Confirm`
9. `CPA Verify` / `SUB2API 回调验证`
10. `Logout ChatGPT`

### Auto 模式

`Auto` 会按“先注册，后授权，最后退出登录”的顺序执行完整流程。

关键行为：

- 默认顺序为 `2 -> 3 -> 4 -> 5 -> 1 -> 6 -> 7 -> 8 -> 9 -> 10`
- 会优先尝试自动获取注册邮箱
- 自动获取失败时会暂停，等待你手动补邮箱后继续
- 支持 `继续当前` 和 `重新开始`
- 支持中途 `Stop`
- 每轮开始前会根据当前配置决定是否倒计时和延迟

## 步骤说明

### Step 1

- `CPA`：打开管理面板并提取 OAuth 链接
- `SUB2API`：登录后台并生成 OAuth 链接
- 单步模式下可以单独预检；自动模式中会在注册完成后再执行

### Step 2

- 打开独立注册入口
- 如果当前页面已经处于注册流程，会直接视为该步骤完成
- 如果仍停留在入口页，则自动点击 `Sign up / Register`

### Step 3

- 自动填邮箱
- 自动填密码
- 必要时处理邮箱页和密码页切换

### Step 4

- 轮询注册验证码
- 支持 `MoeMail / QQ / 163 / Inbucket`

### Step 5

- 自动生成姓名和生日
- 兼容 `birthday` 和 `age` 两种页面结构

### Step 6

- 重新获取最新 OAuth 链接
- 用刚注册的账号登录

### Step 7

- 轮询登录验证码

### Step 8

- 自动尝试点击 OAuth 同意页的“继续”
- 监听 localhost 回调

只接受下面这类地址：

```txt
http(s)://localhost:<port>/auth/callback?code=...&state=...
http(s)://127.0.0.1:<port>/auth/callback?code=...&state=...
```

### Step 9

- `CPA`：把 localhost 回调地址提交回面板并等待成功状态
- `SUB2API`：提交回调并创建账号，创建时会绑定你选中的多个分组

### Step 10

- 返回 `chatgpt.com`
- 打开左下角账号菜单
- 点击 `退出登录`
- 如果弹出确认框，再点击一次确认退出

## 常见问题

### 1. Step 8 / Step 9 失败

优先检查：

- 回调地址是否真的是 `/auth/callback`
- query 里是否同时包含 `code` 和 `state`
- 授权页“继续”按钮是否变了

### 2. 收不到验证码

优先检查：

- `QQ / 163 / Inbucket` 是否已登录
- Cloudflare 转发是否真的生效
- `MoeMail API Key` 和域名配置是否正确

### 3. `SUB2API` 分组列表加载失败

先确认：

- `SUB2API` 地址正确
- 登录邮箱和密码正确
- 后台账号能访问 `/api/v1/admin/groups/all?platform=openai`

### 4. 自动获取邮箱失败

可以直接手动粘贴邮箱，然后继续执行：

- 单步模式：直接点 `Step 3`
- `Auto` 模式：在暂停后补邮箱，再点 `Continue`

## 调试建议

- 先看侧边栏日志
- 再看扩展 Service Worker 控制台
- 最后看目标页面 content script 控制台

如果某一步持续失败，优先检查页面选择器或目标站点 DOM 是否发生变化。

## 项目结构

```txt
background.js              后台主控，编排 1~9 步、状态管理、Tab 协调
manifest.json              扩展清单
data/names.js              随机姓名 / 生日数据
content/utils.js           通用工具
content/vps-panel.js       CPA 面板逻辑
content/signup-page.js     OpenAI 注册 / 登录页逻辑
content/moemail-utils.js   MoeMail 辅助函数
content/duck-mail.js       Duck 邮箱生成
content/qq-mail.js         QQ 邮箱轮询
content/mail-163.js        163 邮箱轮询
content/inbucket-mail.js   Inbucket 邮箱轮询
sidepanel/                 侧边栏 UI
tests/                     回归测试
```

## 安全说明

- 配置保存在浏览器本地存储中
- 运行时状态保存在会话存储中
- 不会硬编码你的 `CPA` / `SUB2API` 账号信息
- 本轮生成的邮箱和密码会保存在当前会话中，便于追踪结果
