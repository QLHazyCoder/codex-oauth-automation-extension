# IP Proxy 模块说明（Ultra1 集成版）

## 1. 模块定位

`IP Proxy` 是扩展内的网络出口接管模块，用于把自动化流程的页面访问链路切到指定代理节点，并在侧边栏内可视化展示当前代理与出口状态。

本模块目标是解决三件事：

1. 在扩展内统一配置和切换代理，而不是依赖浏览器外部全局代理。
2. 对“代理已配置但未真正接管/未真正出站”的情况进行显式诊断。
3. 在自动化流程中可控地切换出口，降低单节点波动影响。

## 2. 代码结构

### 2.1 Background（核心逻辑）

- `background/ip-proxy-core.js`
  - 代理池解析与运行态管理
  - 应用/清除代理配置
  - 出口探测与状态诊断
  - `SYNC/NEXT/CHANGE/PROBE` 主流程
- `background/ip-proxy-provider-lumiproxy.js`
  - Provider 级别参数处理（当前重点是 711 账号串 token 规则）
- `background/message-router.js`
  - 暴露消息接口：
    - `REFRESH_IP_PROXY_POOL`
    - `SWITCH_IP_PROXY`
    - `CHANGE_IP_PROXY_EXIT`
    - `PROBE_IP_PROXY_EXIT`
- `background.js`
  - 持久化字段定义与默认值
  - 启动恢复时的代理状态接管
  - 自动运行成功后的代理切换钩子

### 2.2 Sidepanel（界面与交互）

- `sidepanel/ip-proxy-panel.js`
  - 代理 UI 状态渲染
  - 按钮行为（同步/下一条/Change/检测出口）
  - 运行态文案和诊断详情展示
  - 711 账号参数双向同步（`session/sessTime/region`）
- `sidepanel/ip-proxy-provider-lumiproxy.js`
  - Provider 级输入辅助（地区推断）
- `sidepanel/sidepanel.html`
  - 代理区块 UI
- `sidepanel/sidepanel.css`
  - 代理区块样式
- `sidepanel/sidepanel.js`
  - 与设置保存流整合、事件绑定

## 3. 当前功能范围（本 PR）

### 3.1 基础能力

1. 启用/禁用代理接管（PAC + 认证回填）。
2. 固定账号模式（Host/Port/Username/Password/Region）。
3. 出口探测与状态卡（当前代理、当前出口、诊断详情）。
4. 四个动作按钮：
   - `同步`：应用当前配置并刷新运行态
   - `下一条`：切到下一个可用节点
   - `Change`：保持 session 的前提下重绑并换出口（711）
   - `检测出口`：只做出口复测，不改节点
5. `检查IP`：打开 `https://ipinfo.io/what-is-my-ip`

### 3.2 711 账号串参数联动

支持从用户名中识别并回填：

- `session-xxxx`
- `sessTime-xx`（兼容 `life-xx`）
- `region-XX`

支持从表单回写到用户名：

- 修改会话值 -> 更新 `session-*`
- 修改时长 -> 更新 `sessTime-*`
- 修改地区 -> 更新 `region-*`

### 3.3 同步后的自动复测

为避免“同步后还要手动点检测出口”：

- `同步/下一条/Change` 执行完成后，自动追加一次静默 `检测出口`。

## 4. 当前发布策略（为了稳定）

本 PR 是“先可用，再扩展”的第一阶段：

1. 服务商主路径按 `711` 优先。
2. `API 模式`在 UI 中保留但禁用（暂未开放）。
3. `账号列表模式`目前关闭（防止多条目与鉴权缓存复用带来的不稳定）。

对应开关位于：

- `sidepanel/sidepanel.js`：`IP_PROXY_API_MODE_ENABLED = false`
- `sidepanel/sidepanel.js`：`IP_PROXY_ACCOUNT_LIST_ENABLED = false`
- `background.js`：`IP_PROXY_ACCOUNT_LIST_ENABLED = false`

## 5. 使用方式（操作步骤）

1. 打开侧边栏 `IP代理` 开关。
2. 选择账号模式，填写：
   - Host
   - Port
   - Username
   - Password
   - Region（可选）
3. 点击 `同步`。
4. 查看状态卡：
   - 当前代理
   - 当前出口
   - 是否有校验提示
5. 需要换出口时：
   - 711 + session 场景优先用 `Change`
   - 或使用 `下一条`
6. 需要手动复核时点击 `检测出口` 或 `检查IP`。

## 6. 已知限制

1. 某些代理链路不会返回标准 `407`，扩展无法触发认证回填，这类链路可能不稳定。
2. 地区“期望值”和“实际出口”不一致时，模块会保留接管并提示校验告警（不直接判定全失败）。
3. 不同探测源（页面探测/后台兜底）在网络波动时可能短时出现差异，状态卡会显示来源与诊断。

## 7. 回归建议

建议至少覆盖以下场景：

1. 固定账号：启用 -> 同步 -> 出口检测成功。
2. 固定账号：`session/sessTime/region` 双向同步正确。
3. 固定账号：`同步/下一条/Change` 后无需手动点检测即可刷新出口状态。
4. 非标准链路失败时，诊断信息可读且不误报“已接管成功”。
