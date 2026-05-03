# 本地自定义功能维护说明

> 目的：记录本仓库相对上游 `upstream/master` 需要长期保留的定制能力、关键代码位置和后续同步上游时的检查点。
>
> 最近一次整理基线：`upstream/master` Ultra2.0（`87fc333`）已合入到本地同步分支 `sync/upstream-ultra20-20260428`，合并提交为 `413057b`。

## 快速结论

后续同步上游时，需要优先保留以下本地功能：

1. Plus checkout 日本账单资料匹配与本地化地址填写。
2. 自定义邮箱池/账号池表格管理能力。
3. Hotmail / 2925 账号池搜索筛选。
4. Plus 免费试用资格提前判断，以及跳过账号仍标记“已用”。
5. SUB2API 多分组创建账号。
6. OAuth 登录使用全新标签页。
7. 接码平台多平台适配：HeroSMS + 5sim。
8. Plus 支付方式适配：PayPal + GoPay。
9. 本地导出配置 `/config.json` 忽略规则。

推荐每次同步后执行：

```bash
git diff --check
npm test
```

## 本地定制提交栈

在 Ultra2.0 合并后，本地相对 `upstream/master` 仍保留的定制提交主要是：

```text
3cf5f22 feat: upgrade custom email pool with manager UI and entry states
8d850be chore: 忽略本地导出配置
4d20160 fix(accounts): 统一流程完成后的账号标记
c52f505 fix(plus): 增强 checkout 免费试用校验
cc7671e feat(sub2api): 支持多分组创建账号
9f2c3eb feat(sidepanel): 添加账号池搜索筛选
b3790c1 fix(auth): OAuth 登录使用全新标签页
```

补充：接码平台多平台适配是当前分支新增的本地自定义功能；真实 5sim API Key 只允许通过侧边栏输入并保存到本地配置，不写入仓库、测试或文档。

排查本地定制范围可用：

```bash
git diff --stat upstream/master..HEAD
git diff --name-only upstream/master..HEAD
git log --oneline --reverse --no-merges upstream/master..HEAD
```

## 1. Plus checkout 日本资料匹配

### 目标

Plus checkout 填账单资料时，支持日本地区：

- 国家/地区选项可匹配 `JP`、`Japan`、`日本`、`日本国`。
- 日本地址可走本地化接口路径 `/jp-address`。
- 能识别日文表单标签，例如 `郵便番号`、`都道府県`。
- 地区匹配支持 `東京都` 与 `Tokyo` 这类本地化/英文混合值。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `data/address-sources.js` | 国家别名和本地 fallback 地址种子，包含 `JP`。 |
| `background/steps/fill-plus-checkout.js` | Plus checkout 后台步骤，`COUNTRY_ENDPOINTS.JP` 指向 `/jp-address`。 |
| `content/plus-checkout.js` | checkout 页面内容脚本，负责国家、地区、地址字段定位和填写。 |
| `tests/address-sources.test.js` | 国家码与地址 seed 单测。 |
| `tests/plus-checkout-address-input.test.js` | 地址字段、国家、地区匹配单测。 |
| `tests/plus-checkout-billing-tab-resolution.test.js` | billing tab 和地址 seed 传递单测。 |

### 关键代码点

- `data/address-sources.js`
  - `COUNTRY_ALIASES.JP`
  - `LOCAL_ADDRESS_SEEDS.JP`
- `background/steps/fill-plus-checkout.js`
  - `COUNTRY_ENDPOINTS.JP`
- `content/plus-checkout.js`
  - `COUNTRY_OPTION_ALIASES.JP`
  - `matchesCountryOption(...)`
  - `matchesRegionOption(...)`
  - 地址字段识别正则里对 `都道府県`、`郵便番号` 的支持。

### 维护注意

1. 上游如果重写 checkout 地址填写逻辑，不要只保留英文 `country/state/zip` 匹配，必须继续保留日文字段识别。
2. 上游如果调整地址接口配置，确认 `JP` 仍指向 `/jp-address` 或新的等效路径。
3. 合并后至少跑：

```bash
node --test \
  tests/address-sources.test.js \
  tests/plus-checkout-address-input.test.js \
  tests/plus-checkout-billing-tab-resolution.test.js
```

## 2. 自定义邮箱池 / 账号池表格

### 目标

支持导入一批自定义注册邮箱，并在侧边栏以表格/列表方式管理：

- 导入邮箱。
- 搜索邮箱。
- 按状态筛选。
- 批量标记已用/未用。
- 批量启用/停用。
- 批量删除。
- 自动运行时按轮次取邮箱。
- 成功、跳过或完成后标记当前邮箱为“已用”。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background.js` | 状态结构、邮箱池规范化、取当前轮邮箱、标记已用。 |
| `background/message-router.js` | 步骤完成/Plus 完成时调用标记已用逻辑。 |
| `sidepanel/sidepanel.html` | 自定义邮箱池 UI 区域和脚本加载。 |
| `sidepanel/sidepanel.js` | 侧边栏状态收集、DOM 绑定、manager 初始化。 |
| `sidepanel/custom-email-pool-manager.js` | 自定义邮箱池表格/列表管理器。 |
| `sidepanel/sidepanel.css` | 表格、搜索、筛选和批量操作样式。 |
| `tests/background-custom-email-pool.test.js` | 后台邮箱池逻辑测试。 |
| `tests/sidepanel-custom-email-pool.test.js` | 侧边栏脚本加载/基础 UI 测试。 |

### 关键代码点

后台：

- `background.js`
  - `customEmailPool`
  - `customEmailPoolEntries`
  - `normalizeCustomEmailPoolEntryObjects(...)`
  - `getCustomEmailPool(...)`
  - `getCustomEmailPoolEntries(...)`
  - `getCustomEmailPoolEmailForRun(...)`
  - `markCurrentCustomEmailPoolEntryUsed(...)`
  - `markCurrentRegistrationAccountUsed(...)`
- `background/message-router.js`
  - step 完成和 Plus 完成路径里需要能调用 `markCurrentRegistrationAccountUsed(...)`。
  - fallback 兼容路径仍需保留 `markCurrentCustomEmailPoolEntryUsed(...)`。

侧边栏：

- `sidepanel/sidepanel.html`
  - `row-custom-email-pool`
  - `input-custom-email-pool`
  - `input-custom-email-pool-import`
  - `input-custom-email-pool-search`
  - `select-custom-email-pool-filter`
  - `checkbox-custom-email-pool-select-all`
  - `btn-custom-email-pool-bulk-used`
  - `btn-custom-email-pool-bulk-unused`
  - `btn-custom-email-pool-bulk-enable`
  - `btn-custom-email-pool-bulk-disable`
  - `btn-custom-email-pool-bulk-delete`
  - `custom-email-pool-list`
- `sidepanel/custom-email-pool-manager.js`
  - `createCustomEmailPoolManager(...)`
  - 内部维护 `selectedEntryIds`、搜索词和筛选状态。
- `sidepanel/sidepanel.js`
  - 读取并传入上述 DOM 节点。
  - 初始化 `window.SidepanelCustomEmailPoolManager?.createCustomEmailPoolManager(...)`。

### 同步上游时的高风险点

上游经常改侧边栏脚本加载顺序。合并时必须确认这些脚本都还在，并且在 `sidepanel.js` 之前加载：

```html
<script src="custom-email-pool-manager.js"></script>
<script src="ip-proxy-provider-711proxy.js"></script>
<script src="ip-proxy-panel.js"></script>
<script src="sidepanel.js"></script>
```

如果上游新增脚本，例如 IP 代理面板，不要用“二选一”的方式解决冲突；应该同时保留本地 `custom-email-pool-manager.js` 和上游新增脚本。

### 验证

```bash
node --test \
  tests/background-custom-email-pool.test.js \
  tests/sidepanel-custom-email-pool.test.js \
  tests/background-registration-account-used.test.js
```

## 3. Hotmail / 2925 账号池搜索筛选

### 目标

账号池表格支持搜索和按状态筛选，便于维护大量账号。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `sidepanel/sidepanel.html` | Hotmail / 2925 搜索框和筛选下拉框。 |
| `sidepanel/sidepanel.js` | DOM 节点绑定并传入 manager。 |
| `sidepanel/hotmail-manager.js` | Hotmail 搜索、筛选、渲染。 |
| `sidepanel/mail-2925-manager.js` | 2925 搜索、筛选、渲染。 |
| `sidepanel/sidepanel.css` | 搜索框/筛选框样式。 |

### 关键 DOM

- Hotmail：
  - `input-hotmail-search`
  - `select-hotmail-filter`
- 2925：
  - `input-mail2925-search`
  - `select-mail2925-filter`

### 维护注意

上游如果重构账号池 UI，确认 manager 里这些事件仍存在：

- `dom.inputHotmailSearch?.addEventListener('input', ...)`
- `dom.selectHotmailFilter?.addEventListener('change', ...)`
- `dom.inputMail2925Search?.addEventListener('input', ...)`
- `dom.selectMail2925Filter?.addEventListener('change', ...)`

## 4. Plus 免费试用资格提前判断和账号标记

### 目标

Plus checkout 页面加载后尽早判断是否有免费试用资格：

- 如果“今日应付金额”不是 0，直接跳过支付填写/提交。
- 被跳过的账号也要标记为“已用”，避免下次重复拿到。
- 提交前再检查一次金额，防止页面中途变化。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background/steps/fill-plus-checkout.js` | Plus 第 7 步提前检查金额并抛出非重试 sentinel。 |
| `content/plus-checkout.js` | checkout 页面读取 `checkoutAmountSummary`。 |
| `background.js` | `isPlusCheckoutNonFreeTrialError(...)` 和账号标记统一入口。 |
| `background/message-router.js` | Plus 完成或跳过路径统一标记账号已用。 |
| `tests/plus-checkout-billing-tab-resolution.test.js` | 非免费试用跳过逻辑测试。 |
| `tests/background-registration-account-used.test.js` | 账号标记使用 fresh state 的测试。 |
| `tests/background-luckmail.test.js` | LuckMail Plus 完成后标记测试。 |

### 关键代码点

- `background/steps/fill-plus-checkout.js`
  - `inspectCheckoutAmountSummary(...)`
  - `PLUS_CHECKOUT_NON_FREE_TRIAL::...`
  - 调用 `markCurrentRegistrationAccountUsed(...)`
- `content/plus-checkout.js`
  - `getCheckoutAmountSummary(...)`
  - 返回 `checkoutAmountSummary`
- `background.js`
  - `markCurrentRegistrationAccountUsed(...)`
  - `isPlusCheckoutNonFreeTrialError(...)`

### 维护注意

1. 不要把免费资格判断放到账单地址或支付方式填写之后。
2. 不要把 `PLUS_CHECKOUT_NON_FREE_TRIAL::` 当作普通可重试错误。
3. 标记账号已用时要读取 fresh state，避免 step 局部传入的 state 过期。

## 5. Plus 支付方式适配：PayPal + GoPay

### 目标

Plus 模式新增 `plusPaymentMethod`：

- `paypal`：保留现有 PayPal 账号池、登录与授权。
- `gopay`：创建 checkout 时使用印尼账单国家 `ID / IDR`，第 7 步选择 GoPay，第 8 步填写 GoPay 手机号；验证码优先使用侧边栏已填值，否则执行时弹出手动输入框；提交验证码后继续填写 GoPay PIN。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `sidepanel/sidepanel.html` | Plus 支付下拉、GoPay 手机号、GoPay 验证码、GoPay PIN 输入。 |
| `sidepanel/sidepanel.js` | 保存 `plusPaymentMethod / gopayCountryCode / gopayPhone / gopayOtp / gopayPin`，按支付方式切换配置行，第 8 步标题按 PayPal / GoPay 动态匹配，并提供 GoPay 验证码手动输入弹窗。 |
| `gopay-utils.js` | GoPay 支付方式、手机号、验证码、PIN 规范化工具。 |
| `content/plus-checkout.js` | 创建 GoPay checkout payload，识别/选择 GoPay 付款方式。 |
| `background/steps/fill-plus-checkout.js` | 第 7 步按支付方式选择 PayPal 或 GoPay，并为 GoPay 使用印尼地址。 |
| `background/steps/gopay-approve.js` | 第 8 步 GoPay 手机号、手动验证码、PIN 自动化骨架。 |
| `content/gopay-flow.js` | GoPay 页面手机号/验证码/PIN 输入脚本，包含国家区号切换、贴近人工点击的确认按钮事件序列，并在必要时交给后台 debugger 真实鼠标事件兜底。 |
| `content/whatsapp-flow.js` | WhatsApp Web 验证码读取脚本。 |

### 维护注意

1. GoPay 验证码和 PIN 只能通过侧边栏输入或运行时弹窗临时填写，不要写入代码、测试或文档。
2. PayPal 和 GoPay 共享 Plus 可见步骤，第 8 步仍使用 `paypal-approve` 这个 step key，但展示标题会按 `plusPaymentMethod` 变为 PayPal 或 GoPay 文案，后台也会按该字段分发到 PayPal 或 GoPay executor。
3. GoPay 页面和 WhatsApp Web 的真实 DOM 可能变化；后续联调时优先在每个页面抓 `GOPAY_GET_STATE / WHATSAPP_GET_STATE` 输出，再补精确选择器。

## 6. SUB2API 多分组创建账号

### 目标

支持一次配置多个 SUB2API 分组，完成 OAuth 后为多个分组创建账号。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `content/sub2api-panel.js` | 多分组解析、查询和创建账号。 |
| `sidepanel/sidepanel.html` | 分组输入框提示支持多个分组。 |
| `background.js` / `background/message-router.js` | payload 透传。 |
| `background/steps/platform-verify.js` | Plus platform verify 兼容。 |
| `tests/sub2api-panel-proxy.test.js` | SUB2API 代理与多分组测试。 |

### 关键代码点

- `content/sub2api-panel.js`
  - `normalizeSub2ApiGroupNames(...)`
  - `getGroupsByNames(...)`
  - `sub2apiGroupIds`
- `sidepanel/sidepanel.html`
  - `input-sub2api-group`
  - placeholder：`默认 codex；多个用逗号或换行分隔`

### 维护注意

上游如果只按单个 `sub2apiGroupId` 写回，需要保留本地 `sub2apiGroupIds` 数组逻辑。

## 7. OAuth 登录使用全新标签页

### 目标

OAuth 登录流程打开新标签页，避免复用旧页面导致状态污染。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background/steps/oauth-login.js` | OAuth 登录步骤入口。 |
| `background/tab-runtime.js` | 新标签打开和导航等待能力。 |

### 维护注意

上游如果改 OAuth tab 打开方式，确认仍保留“全新标签页”语义，不要退回到复用已有 tab。

## 8. 接码平台多平台适配：HeroSMS + 5sim

### 目标

手机号验证 Step 9 支持按平台切换接码能力：

- 默认仍为 `HeroSMS`，老配置无需迁移。
- 新增 `5sim` 平台，下拉框在接码设置卡片中直接可见。
- 国家/地区列表、API Key、价格上限、余额、买号、查码、完成、取消、ban、复用均按当前 `phoneSmsProvider` 分发。当前侧边栏只开放三个常用地区：印度尼西亚、泰国、越南。
- HeroSMS 继续使用原 `heroSms*` 字段；5sim 使用独立 `fiveSim*` 字段，切换平台时不会互相覆盖草稿。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `phone-sms/providers/hero-sms.js` | HeroSMS 适配层，承接 HeroSMS 余额、价格、国家规范化等平台逻辑。 |
| `phone-sms/providers/five-sim.js` | 5sim 适配层，封装 profile、countries、prices、buy、check、finish、cancel、ban、reuse。 |
| `phone-sms/providers/registry.js` | 接码平台注册表，按 `phoneSmsProvider` 选择平台模块。 |
| `background.js` | 持久字段默认值、导入脚本、配置规范化、phone flow helper 注入。 |
| `background/phone-verification-flow.js` | Step 9 运行态按 activation.provider 分发后续查码/完成/取消/ban/reuse。 |
| `sidepanel/sidepanel.html` | 接码平台下拉、余额按钮、5sim operator 输入。 |
| `sidepanel/sidepanel.js` | 平台切换、地区列表联动、价格/余额查询、配置收集与恢复。 |
| `tests/five-sim-provider.test.js` | 5sim provider 单测。 |
| `tests/phone-verification-flow.test.js` | 5sim Step 9 buy/check/finish/reuse 分发测试。 |
| `tests/sidepanel-phone-verification-settings.test.js` | 接码平台下拉和侧边栏联动测试。 |

### 关键状态字段

- 通用：
  - `phoneSmsProvider: "hero-sms" | "5sim"`
- HeroSMS：
  - `heroSmsApiKey`
  - `heroSmsCountryId`
  - `heroSmsCountryLabel`
  - `heroSmsCountryFallback`
  - `heroSmsMaxPrice`
  - `heroSmsReuseEnabled`
  - `heroSmsAcquirePriority`
- 5sim：
  - `fiveSimApiKey`
  - `fiveSimCountryId`
  - `fiveSimCountryLabel`
  - `fiveSimCountryFallback`
  - `fiveSimMaxPrice`
  - `fiveSimOperator`

### 维护注意

1. 不要把真实 5sim key 写入代码、测试或文档；只允许用户在侧边栏输入。
2. 上游同步时如果改了 Step 9 手机号验证，必须保留 `currentPhoneActivation.provider` 驱动的后续分发。
3. 上游同步时如果改了 sidepanel 接码区域，必须保留 `select-phone-sms-provider`，且地区列表按平台加载：HeroSMS 数字国家 ID，5sim 字符串 country slug；当前只展示并保存印度尼西亚、泰国、越南，避免旧配置中的英国/美国等地区回写。
4. 5sim 产品码当前固定为 `openai`，operator 默认 `any`；价格上限为空时按价格目录最低可用价尝试。

### 验证

```bash
node --check phone-sms/providers/hero-sms.js
node --check phone-sms/providers/five-sim.js
node --check phone-sms/providers/registry.js
node --check background/phone-verification-flow.js
node --check sidepanel/sidepanel.js
node --test tests/five-sim-provider.test.js tests/phone-verification-flow.test.js tests/sidepanel-phone-verification-settings.test.js
```

## 9. 本地配置文件忽略

### 目标

避免本地导出的运行配置误提交。

### 关键文件

- `.gitignore`
  - `/config.json`

### 维护注意

如果后续出现新的本地导出文件，先确认是否应该忽略，不要直接提交。

## 后续同步上游的建议流程

```bash
git status --short --branch
git fetch --prune upstream
git switch -c sync/upstream-YYYYMMDD
git merge --no-ff upstream/master
```

冲突处理优先级：

1. 同时保留上游新增能力和本地定制能力。
2. `background.js` / `background/message-router.js` 里不要丢失：
   - `markCurrentRegistrationAccountUsed`
   - `markCurrentCustomEmailPoolEntryUsed`
   - 上游新增的 `refreshIpProxyPool` 等能力。
3. `sidepanel/sidepanel.html` 脚本冲突时不要二选一：
   - 保留 `custom-email-pool-manager.js`
   - 保留上游新增脚本。
4. `content/plus-checkout.js` 冲突时重点检查：
   - 日本国家/地区匹配。
   - checkout amount summary。
   - 地址字段定位正则。
5. 合并后执行完整测试：

```bash
npm test
```

## 快速检查命令

检查日本地址能力：

```bash
rg -n "JP:|日本|jp-address|matchesCountryOption|matchesRegionOption|郵便番号|都道府県" \
  data/address-sources.js \
  background/steps/fill-plus-checkout.js \
  content/plus-checkout.js \
  tests
```

检查自定义邮箱池能力：

```bash
rg -n "customEmailPool|custom-email-pool|markCurrentCustomEmailPoolEntryUsed|createCustomEmailPoolManager" \
  background.js \
  background/message-router.js \
  sidepanel \
  tests
```

检查 Plus 免费资格提前跳过：

```bash
rg -n "PLUS_CHECKOUT_NON_FREE_TRIAL|checkoutAmountSummary|inspectCheckoutAmountSummary|markCurrentRegistrationAccountUsed" \
  background \
  content \
  tests
```

检查 SUB2API 多分组：

```bash
rg -n "normalizeSub2ApiGroupNames|getGroupsByNames|sub2apiGroupIds|input-sub2api-group" \
  content/sub2api-panel.js \
  sidepanel/sidepanel.html \
  tests
```

检查接码多平台适配：

```bash
rg -n "phoneSmsProvider|select-phone-sms-provider|PhoneSmsFiveSimProvider|PhoneSmsProviderRegistry|fiveSim" \
  background.js \
  background/phone-verification-flow.js \
  phone-sms \
  sidepanel \
  tests
```
