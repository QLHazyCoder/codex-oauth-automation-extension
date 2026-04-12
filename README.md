# Multi-Page Automation

一个用于批量跑通 ChatGPT OAuth 注册/登录流程的 Chrome 扩展。

当前版本基于侧边栏控制，支持单步执行、整套自动执行、停止当前流程、保存常用配置，以及通过 DuckDuckGo / QQ / 163 / Inbucket / Hotmail 协助获取验证码。

## 最新版本测试结果

最新版本实测了一个 5 轮自动，0 次失重试；睡前挂了一个十轮自动，1次重试：

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/五轮自动.png" alt="最新版本五轮测试结果" width="100%" />
    </td>
    <td align="center" width="50%">
      <img src="docs/images/十轮自动.png" alt="最新版本运行日志" width="100%" />
    </td>
  </tr>
</table>

## 打赏一下

佬们觉得好用的话，也可以打赏小弟一杯奶茶哦

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/支付宝.jpg" alt="支付宝收款码" width="100%" />
    </td>
    <td align="center" width="50%">
      <img src="docs/images/微信.png" alt="微信收款码" width="100%" />
    </td>
  </tr>
</table>

## 当前能力

- 从 CPA 面板自动获取 OpenAI OAuth 授权链接
- 自动打开 OpenAI 注册页并点击 `Sign up / Register`
- 自动填写邮箱与密码
- 支持自定义密码；留空时自动生成强密码
- 自动显示当前使用中的密码，便于后续保存
- 自动获取注册验证码与登录验证码
- 支持 `Hotmail`：直接使用 `邮箱 + 客户端 ID + 刷新令牌（refresh token）` 刷新微软令牌，并通过 Microsoft Graph 读取最新邮件
- 支持 `QQ Mail`、`163 Mail`、`Inbucket mailbox`
- 支持从 DuckDuckGo Email Protection 自动生成新的 `@duck.com` 地址
- 支持基于 Cloudflare 自定义域名自动生成随机邮箱前缀
- Step 5 同时兼容两种页面：
  - 页面要求填写 `birthday`
  - 页面要求填写 `age`
- 支持 `Auto` 多轮运行
- 支持中途 `Stop`
- Step 8 会自动寻找 OAuth 同意页的“继续”按钮，并通过 Chrome debugger 输入事件发起点击，然后监听本地回调地址


## 环境要求

- Chrome 浏览器
- 打开扩展开发者模式
- 你自己的 CPA 管理面板，且页面结构与当前脚本适配
- 至少准备一种验证码接收方式：
  - DuckDuckGo `@duck.com` + QQ / 163 / Inbucket 转发
  - Cloudflare 自定义域邮箱前缀 + QQ / 163 / Inbucket 转发
  - 手动填写一个可收信邮箱
- 如果使用 `QQ` / `163` / `Inbucket`，对应页面需要提前能正常打开

## 安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录
5. 打开扩展侧边栏

## 侧边栏配置说明

### `CPA`

你的管理面板 OAuth 页面地址，例如：

```txt
http(s)://<your-host>/management.html#/oauth
```

Step 1 和 Step 9 都依赖这个地址。

### `Mail`

支持四种验证码来源：

- `Hotmail`
- `163 Mail`
- `QQ Mail`
- `Inbucket`

说明：

- `Hotmail` 通过侧边栏里的 Hotmail 账号池选择账号，并直接访问 Microsoft Graph 邮件接口
- `QQ` 和 `163` 用于直接轮询网页邮箱
- `Inbucket` 通过你在侧边栏里配置的 host 访问 `mailbox` 页面：`https://<your-inbucket-host>/m/<mailbox>/`

### `Hotmail 账号池`

仅当 `Mail = Hotmail` 时使用。

每条账号支持保存：

- `email`
- `clientId`
- `refreshToken`
- 可选邮箱密码备注

使用方式：

- 先新增账号
- 点击 `校验`
- 校验通过后，可点击 `测试收信`
- Auto 模式每轮会自动选用一个可用账号

### `Mailbox`

仅当 `Mail = Inbucket` 时显示。

填写 Inbucket mailbox 名称，例如：

```txt
tmp-mailbox
```

脚本会自动打开：

```txt
https://<your-inbucket-host>/m/<mailbox>/
```

并且只检索未读邮件：

- 只匹配 `.message-list-entry.unseen`
- 第 2 次轮询开始会自动点击 mailbox 页面上的刷新按钮
- 识别到验证码后会尝试删除当前邮件，减少重复命中

### `Inbucket`

仅当 `Mail = Inbucket` 时显示。

这里填写 Inbucket host，支持两种格式：

- `your-inbucket-host`
- `https://your-inbucket-host`

脚本会自动规范化成 origin 后再拼接 mailbox URL。

### `Email`

Step 3 使用的注册邮箱。

来源有两种：

- 手动粘贴
- 点击 `获取` 自动生成邮箱（DuckDuckGo 或 Cloudflare）

注意：

- 若 `邮箱生成 = Cloudflare`，插件里只需要维护 `CF 域名`
- `CF 域名` 支持保存多个，并通过下拉框切换当前要生成的域名
- Cloudflare 侧的转发规则、Catch-all、路由目标邮箱等，都需要你自己提前在 Cloudflare 后台配置好
- 当 `Mail = Hotmail` 时，这个输入框由账号池自动同步当前账号邮箱
- 当前 `Auto` 按钮只负责 DuckDuckGo 地址获取
- 如果你使用 Inbucket，它只是验证码收件箱，不会自动生成 Inbucket 地址

### `邮箱生成 = Cloudflare` 时的配置

- `CF 域名`：例如 `example.xyz`
- 右侧 `添加 / 保存`：用于保存多个可切换的域名
- 下拉框：用于切换当前这次要生成邮箱所使用的域名

#### 当前实现是什么逻辑

Cloudflare 模式下，插件不会再调用 Cloudflare API 创建路由。

它现在只做一件事：

1. 根据你当前选中的 `CF 域名`
2. 本地生成一个随机前缀
3. 直接得到一个类似 `user20260412153000123@example.xyz` 的注册邮箱
4. 把这个邮箱写入当前流程继续往下跑

也就是说，插件默认认为：

- 你已经在 Cloudflare 后台把这个域名的收件转发规则配置好了
- 这个随机前缀邮箱发来的邮件，最终能被你现有的 `163 / QQ / Inbucket` 收件链路接住

#### 你需要自己提前做什么

在 Cloudflare 后台，至少保证下面一条成立：

- 你已经配好了 Catch-all / 通配规则，能接住任意前缀邮箱
- 或者你本来就有一套能覆盖这些随机前缀邮箱的转发规则

否则插件虽然能生成 `@你的域名` 邮箱，但验证码邮件最后没人接收，后面的 Step 4 / Step 7 还是会失败。

#### 最简单的使用方式

1. 在 Cloudflare 后台先把你的域名收件转发规则配好
2. 在插件里选择 `邮箱生成 = Cloudflare`
3. 在 `CF 域名` 里点 `添加`
4. 输入域名后点 `保存`
5. 以后直接从下拉框切换当前使用的域名
6. 点击 `获取`，插件就会基于这个域名生成一个随机邮箱

### `Password`

- 留空：自动生成强密码
- 手动输入：使用你自定义的密码
- 可通过输入框右侧的眼睛图标切换显示
- 配置会自动保存，也可以点击右侧 `保存` 按钮手动保存一次

扩展会把本轮实际使用的密码同步回侧边栏，便于查看和复制。

### `Auto`

整套流程自动跑。

支持多轮运行，运行次数由右上角数字框决定。

如果当前面板里已经存在未完成进度，点击 `Auto` 时会弹出选择：

- `重新开始`：重置当前流程进度，从 Step 1 开始新一轮
- `继续当前`：把 `已完成 / 已跳过` 视为已处理，从第一个未处理步骤继续往后执行

## 工作流

### 单步模式

侧边栏共有 9 个步骤按钮，可逐步执行：

1. `Get OAuth Link`
2. `Open Signup`
3. `Fill Email / Password`
4. `Get Signup Code`
5. `Fill Name / Birthday`
6. `Login via OAuth`
7. `Get Login Code`
8. `Manual OAuth Confirm`
9. `CPA Verify`

### Auto 模式

点击右上角 `Auto` 后，后台会按顺序跑完整流程。

当前 Auto 逻辑是：

1. Step 1 获取 CPA OAuth 链接
2. Step 2 打开 OpenAI 注册页
3. 根据 `Mail` 选择邮箱来源
4. 如果 `Mail = Hotmail`，会从账号池自动分配一个可用账号
5. 如果不是 Hotmail，则按当前“邮箱生成”配置尝试自动获取邮箱（Duck 或 Cloudflare）
6. 如果自动获取失败，暂停并等待你在侧边栏填写邮箱后点击 `Continue`
7. 继续执行 Step 3 ~ Step 9

也就是说：

- 如果邮箱可自动获取，整套流程更接近全自动
- 如果自动获取失败，后台会先自动重试 5 次；仍失败时，Auto 才会在邮箱阶段暂停
- Auto 的暂停状态会保存在会话状态中，重新打开侧边栏后仍可继续
- 如果你在 Auto 暂停时改为手动点步骤或跳过步骤，面板会先确认并停止 Auto，再切回手动控制
- 选择 `继续当前` 时，后台不会先做大而全的前置校验，而是从当前步骤状态直接继续；缺什么条件，就在运行到那一步时再报错或暂停

## 详细步骤说明

### Step 1: Get OAuth Link

通过 `content/vps-panel.js`：

- 打开 CPA OAuth 面板
- 等待 `Codex OAuth` 卡片出现
- 点击“登录”
- 读取页面里的授权链接

结果会保存到侧边栏的 `OAuth` 字段。

### Step 2: Open Signup

通过 `content/signup-page.js`：

- 打开授权链接
- 查找 `Sign up / Register / 创建账户` 按钮
- 自动点击进入注册流程

### Step 3: Fill Email / Password

- 如果侧边栏邮箱为空，会先按当前“邮箱生成”配置自动获取邮箱；失败时再提示手动粘贴
- 自动填写邮箱
- 如页面先要求邮箱，再进入密码页，会自动切页继续填写
- 使用自定义密码或自动生成密码
- 提交注册表单

实际使用的密码会写入会话状态，并同步到侧边栏显示。

### Step 4: Get Signup Code

根据 `Mail` 配置，轮询邮箱并提取 6 位验证码。

进入邮箱轮询前，脚本会先确认认证页是否已经进入验证码页面；如果密码页出现 `糟糕，出错了 / 操作超时（Operation timed out）` 并带有 `重试` 按钮，会先自动点击 `重试`、回到密码页重新提交，再继续等待验证码页面。

支持：

- `Hotmail`（Microsoft Graph 邮件接口）
- `content/qq-mail.js`
- `content/mail-163.js`
- `content/inbucket-mail.js`

邮件匹配规则以以下关键词为主：

- 发件人：`openai`、`noreply`、`verify`、`auth`、`duckduckgo`、`forward`
- 标题：`verify`、`verification`、`code`、`验证`、`confirm`

### Step 5: Fill Name / Birthday

随机生成人名与生日。

当前脚本支持两种页面结构：

- 页面要求 `birthday`
- 页面要求 `age`

如果页面是生日模式，会填写年月日；如果页面上存在 `input[name='age']`，则直接填写年龄。

### Step 6: Login via OAuth

在登录前会先重新获取一遍最新的 CPA OAuth 链接，再使用刚注册的账号登录。

支持：

- 邮箱 + 密码登录
- 提交后进入验证码验证流程

### Step 7: Get Login Code

与 Step 4 类似，但会使用稍微不同的关键词组合去找登录验证码邮件。

### Step 8: Manual OAuth Confirm

严格回调捕获规则：

- 步骤 8 现在只接受 `http(s)://localhost:<port>/auth/callback?code=...&state=...` 或 `http(s)://127.0.0.1:<port>/auth/callback?code=...&state=...`
- 监听范围只限于当前 OAuth 认证标签页的主 frame 跳转
- 普通 `localhost` 页面，包括本地部署的 CPA 面板，不会再被误判为回调地址

虽然按钮名称还是 `Manual OAuth Confirm`，但当前代码已经做了自动尝试：

- 在授权页定位“继续”按钮
- 等待按钮可点击
- 获取按钮坐标
- 通过 Chrome `debugger` 的输入事件点击该按钮
- 同时监听 `chrome.webNavigation.onBeforeNavigate`
- 一旦捕获本地回调地址，就把结果保存到 `Callback`

注意：

- 这一步仍然是最容易因页面变化而失效的一步
- 如果 120 秒内没有捕获到 localhost 回调，会报错超时
- README 中的按钮名称沿用了旧文案，但代码行为是“自动尝试点击”

### Step 9: CPA Verify

校验规则：

- 步骤 9 会拒绝任何不是真实 `/auth/callback`，或缺少 `code` / `state` 的本地回调地址
- 成功后的清理只会针对 `/auth` 这一类真实回调标签页，不会再泛化清理任意 localhost 路径
- 侧边栏可切换“本地 CPA”策略，默认是 `全部回调`
- 选择 `全部回调` 时，即使 CPA 部署在本地，也会执行步骤 9
- 选择 `跳过第9步` 时，仅当本地 CPA 且步骤 8 已拿到回调地址时，才会直接跳过步骤 9

回到 CPA 面板：

- 自动填写 localhost 回调地址
- 自动点击“提交回调 URL”
- 必须等到 CPA 面板出现精确的 `认证成功！` 状态徽标后，才判定成功
- 成功后会自动关闭匹配 `http://localhost:1455/auth` 这一类前缀的 localhost 残留页面

## Duck 邮箱自动获取

通过 `content/duck-mail.js`：

- 打开 DuckDuckGo Email Protection Autofill 设置页
- 查找当前私有地址
- 如需要，点击 `Generate Private Duck Address`
- 读取新的 `@duck.com` 地址

这个功能会被：

- 侧边栏 `Email` 旁边的 `Auto` 按钮使用
- `Auto Run` 流程优先尝试使用

## 停止机制

扩展内置了停止当前流程的能力：

- 侧边栏点击 `Stop`
- Background 会广播 `STOP_FLOW`
- 各 content script 会在等待、轮询、sleep、元素查找中尽量中断

适合以下场景：

- 卡在某一步
- 邮件迟迟不来
- 页面结构变化导致等待超时
- Auto 暂停后，明确放弃 Auto、改为手动接管

## 状态与数据

运行时状态主要使用 `chrome.storage.session` 保存：

- 当前步骤
- 每一步状态
- OAuth 链接
- 当前邮箱
- 当前密码
- localhost 回调地址
- 账号记录
- tab 注册信息
- 各来源最近一次打开的地址（用于打开新地址前清理旧标签）
- Auto 当前阶段、当前轮次、暂停信息

配置项另外使用 `chrome.storage.local` 持久化保存：

- CPA 地址
- CPA 管理密钥
- 自定义密码
- 邮箱服务
- Inbucket 主机
- Inbucket 邮箱名
- Hotmail 账号池与对应令牌
- 兜底开关

特点：

- 运行时步骤状态是浏览器会话级存储
- 配置项会持久化保存，关闭浏览器后重新打开仍会恢复
- 扩展运行期间可在多个步骤之间共享
- 代码里已启用 `storage.session` 对 content script 的访问
- 同一来源打开新地址前，会先按来源/站点范围关闭旧标签，避免旧页面残留

## 项目结构

```txt
background.js              后台主控，编排 1~9 步、Tab 复用、状态管理
manifest.json              扩展清单
data/names.js              随机姓名、生日数据
content/utils.js           通用工具：等待元素、点击、日志、停止控制
content/vps-panel.js       CPA 面板步骤：Step 1 / Step 9
content/signup-page.js     OpenAI 注册/登录页步骤：Step 2 / 3 / 5 / 6 / 8
hotmail-utils.js           Hotmail 收信相关通用辅助
content/duck-mail.js       Duck 邮箱自动获取
content/qq-mail.js         QQ 邮箱验证码轮询
content/mail-163.js        163 邮箱验证码轮询
content/inbucket-mail.js   Inbucket mailbox 验证码轮询
sidepanel/                 侧边栏 UI
```

## 常见使用建议

### 1. 先单步验证，再开 Auto

推荐先手动跑通一次：

1. Step 1
2. Step 2
3. Step 3
4. Step 4

确认邮箱和验证码链路稳定后，再使用 `Auto`。

### 2. Inbucket 建议使用专用 mailbox

当前 Inbucket 逻辑只看未读邮件，但还是建议：

- 给脚本准备一个相对独立的 mailbox
- 避免收件箱里混入过多无关邮件

### 3. 自动获取失败时直接手填

如果 Duck 页面打不开、Cloudflare 域名未配置、未登录或按钮变化：

- 直接在 `Email` 输入框中粘贴邮箱
- 手动点 `Step 3` 时，如果邮箱为空，脚本会先自动尝试获取 Duck 邮箱；失败后再改为手填
- Auto 暂停时，仍可手动粘贴邮箱后点击 `Continue`

### 4. 跳过步骤

- 每个步骤右侧都会在满足顺序条件时出现一个小按钮，用来直接跳过该步骤
- 点击后会先弹窗确认；它不会真正执行脚本，只会把该步骤状态改为“已跳过”，从而放行后续步骤
- 跳过按钮的规则很简单：只要上一步已完成、当前步骤没在运行，就可以使用；Step 1 没有前置步骤，也可直接跳过
- 如果 Auto 处于暂停状态，点击该按钮会先确认是否接管 Auto

### 5. Step 8 失败时重点检查

补充检查项：

- 确认回调路径仍然是 `/auth/callback`
- 确认回调 query 里仍然同时包含 `code` 和 `state`
- 如果 CPA 部署在 `localhost`，确认当前看到的页面是真实 OAuth 回调，而不是 CPA 面板自身页面

- OAuth 同意页 DOM 是否变化
- “继续”按钮是否变成了别的文案
- localhost 回调是否真的触发
- 浏览器是否允许 debugger 附加

## 已知限制

- Step 8 对页面结构较敏感
- Duck 自动获取依赖 Duck 页面真实 DOM
- CPA 面板 DOM 也需要和当前脚本选择器匹配
- `Auto` 按钮名称和 Step 8 的旧文案还未完全统一，但代码行为以实际实现为准

## 调试建议

- 打开扩展侧边栏看日志
- 查看 Service Worker 控制台
- 查看目标页面的 content script 控制台日志
- 当某一步频繁失败时，优先检查当前页面选择器是否仍然匹配

## 安全说明

- 所有状态仅保存在浏览器会话中
- 没有硬编码你的 CPA 地址、密码或账户
- 自定义密码只存在当前会话存储中
- 邮箱和密码会被记录到本轮 `accounts` 中，便于追踪本次运行结果
