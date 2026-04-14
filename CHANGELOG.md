# 更新日志

## 2026-04-14

### 新增

- 新增 `MoeMail` 邮箱服务，支持通过 API 直接创建邮箱并自动轮询验证码。
- 新增 `content/moemail-utils.js`，集中处理 MoeMail 的地址规范化、域名解析、消息归一化与验证码匹配逻辑。
- 新增 `tests/moemail-utils.test.js`，覆盖 MoeMail 工具层的核心行为。

### 优化

- 精简邮箱服务架构，后台邮件链路收敛为两类：
  - API 型邮箱：`MoeMail`
  - 页面轮询型邮箱：`QQ / 163 / 163 VIP / Inbucket / 2925`
- 精简侧边栏配置逻辑，删除一整套不再使用的服务状态与交互入口，降低维护成本。
- 精简验证码轮询逻辑，将通用的时间过滤、发件人/标题匹配、验证码提取能力集中到 MoeMail 工具模块，减少分散实现。
- 清理文档结构，删除与已移除服务相关的过期设计稿、计划稿和辅助文件。

### 移除

- 移除 `Hotmail` 邮箱服务。
- 移除 Hotmail 账号池、本地 helper、相关脚本、测试和工具模块。
- 移除所有 Hotmail 专属 UI、后台分支、状态字段与文档说明。
- 不保留兼容性代码，不再支持旧的 Hotmail helper 使用方式。

### 影响

- 依赖 Hotmail helper、刷新令牌账号池或旧启动脚本的流程将无法继续使用。
- 当前推荐邮箱接收方案为：
  - `MoeMail`
  - `QQ`
  - `163 / 163 VIP`
  - `Inbucket`
  - `2925`

### 验证

- 已通过语法检查：
  - `node --check background.js`
  - `node --check sidepanel/sidepanel.js`
  - `node --check content/moemail-utils.js`
- 已通过自动化测试：
  - `npm test`
- 已确认仓库中不再残留 `Hotmail` 相关代码引用。
