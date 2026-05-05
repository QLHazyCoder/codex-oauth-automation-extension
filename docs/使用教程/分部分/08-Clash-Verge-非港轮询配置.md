# 第八部分：Clash Verge 非港轮询配置

## 部分信息

- `section_slug`: `clash-verge-non-hk-rotation`
- `适用主题`: `Clash Verge`、`非港轮询`、扩展脚本、规则模式、系统代理
- `维护方式`: `直接更新本文件`

## 适用场景

- 需要在 [Clash Verge](https://github.com/clash-verge-rev/clash-verge-rev) 中启用 `🔁 非港轮询`
- 需要给现有订阅注入负载均衡分组
- 需要确保 `规则模式` 和 `系统代理` 生效

## 准备内容

- 已安装 [Clash Verge](https://github.com/clash-verge-rev/clash-verge-rev)
- 已导入可用订阅
- 可以打开 `订阅` 和 `代理` 页面

## 操作步骤

### 第一步：进入 `订阅` 并打开全局扩展脚本

1. 打开 `Clash Verge`
2. 进入左侧 `订阅`（`Profiles`）
3. 找到并打开 `全局扩展脚本`

### 第二步：替换脚本内容

先清空旧内容，再粘贴下面脚本，然后保存。

```javascript
function uniqPrepend(arr, items) {
  if (!Array.isArray(arr)) arr = [];
  for (var i = items.length - 1; i >= 0; i--) {
    var item = items[i];
    var exists = false;
    for (var j = 0; j < arr.length; j++) {
      if (arr[j] === item) {
        exists = true;
        break;
      }
    }
    if (!exists) arr.unshift(item);
  }
  return arr;
}

function upsertGroup(groups, group) {
  for (var i = 0; i < groups.length; i++) {
    if (groups[i] && groups[i].name === group.name) {
      groups[i] = group;
      return groups;
    }
  }
  groups.unshift(group);
  return groups;
}

function main(config, profileName) {
  if (!config) return config;

  if (!Array.isArray(config["proxy-groups"])) {
    config["proxy-groups"] = [];
  }

  var groups = config["proxy-groups"];
  var LB_NAME = "🔁 非港轮询";

  var excludeRegex =
    "(?i)(" +
    "香港|hong[ -]?kong|\\bhk\\b|\\bhkg\\b|🇭🇰" +
    "|剩余流量|套餐到期|下次重置剩余|重置剩余|到期时间|流量重置" +
    "|traffic|expire|expiration|subscription|subscribe|reset|plan" +
    ")";

  groups = upsertGroup(groups, {
    name: LB_NAME,
    type: "load-balance",
    strategy: "round-robin",
    "include-all-proxies": true,
    "exclude-filter": excludeRegex,
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true,
    "expected-status": 204
  });

  var injected = false;
  var entryNameRegex = /节点选择|代理|Proxy|PROXY|默认|GLOBAL|全局|选择/i;

  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!g || g.type !== "select") continue;

    if (entryNameRegex.test(g.name || "")) {
      if (!Array.isArray(g.proxies)) g.proxies = [];
      g.proxies = uniqPrepend(g.proxies, [LB_NAME]);
      injected = true;
    }
  }

  if (!injected) {
    for (var k = 0; k < groups.length; k++) {
      var g2 = groups[k];
      if (g2 && g2.type === "select") {
        if (!Array.isArray(g2.proxies)) g2.proxies = [];
        g2.proxies = uniqPrepend(g2.proxies, [LB_NAME]);
        break;
      }
    }
  }

  config["proxy-groups"] = groups;
  return config;
}
```

### 第三步：保存脚本

使用右上角保存按钮，或者按 `Ctrl+S` 保存。

### 第四步：切换到 `代理`

回到左侧 `代理`（`Proxies`）页面，也就是首页。

### 第五步：选择 `🔁 非港轮询`

在顶部常见的分组里，例如：

- `节点选择`
- `Proxy`
- `当前节点`

找到对应下拉框，然后选择 `🔁 非港轮询`。

### 第六步：确认运行模式

继续确认以下两项：

1. `代理模式` 已设置为 `规则模式`（`Rule`）
2. `系统代理`（`System Proxy`）已经开启

## 常见问题

### 为什么没有看到 `🔁 非港轮询`？

先确认：

- 脚本已经完整粘贴并保存
- 当前订阅本身可用
- 当前模式是 `规则模式`
- `系统代理` 已开启

### 粘贴脚本后报格式错误怎么办？

先确认是否把旧内容完全清空，再重新完整粘贴。
如果仍然报错，可以让 AI 只帮你修复脚本格式，不要同时改动脚本逻辑。

## 注意事项

- 粘贴新脚本前，先把旧脚本清空
- 必须完整保存后再去 `代理` 页面检查
- 如果更新了脚本逻辑，优先检查 `🔁 非港轮询` 是否仍被正确注入到选择分组中
