# 第三部分：Cloudflare Temp Email 使用说明

## 部分信息

- `section_slug`: `cloudflare-temp-email`
- `适用主题`: `Cloudflare Temp Email`、`Admin Auth`、`Custom Auth`、随机子域、邮件接收
- `维护方式`: `直接更新本文件`

## 适用场景

- 需要把 `Cloudflare Temp Email` 用作 `邮箱生成`
- 需要把 `Cloudflare Temp Email` 用作 `邮箱服务`
- 需要同时配置 `Temp API`、认证信息、域名和收件邮箱

## 准备内容

- 一个可用的 `Cloudflare Temp Email` 后端地址
- 如果要使用随机子域，对应域名解析已经提前配置好
- 后端的 `admin auth`
- 如果站点额外设置了访问密码，对应的访问认证信息
- 一个真正用于接收转发邮件的收件邮箱

## 操作步骤

### 第一步：先确认当前用途

`Cloudflare Temp Email` 可以同时承担两类角色：

- `邮箱生成`
- `邮箱服务`

如果两边都选择了它，就需要把两套配置都填完整。

### 第二步：填写 `Temp API`

在插件中先填写 `Temp API`，例如：

- `https://your-worker-domain`

不论你把它用于 `邮箱生成` 还是 `邮箱服务`，这一项都必须先配好。

### 第三步：按需填写 `Admin Auth`

如果你把 `邮箱生成` 选择成 `Cloudflare Temp Email`，就需要填写 `Admin Auth`。
它对应后端配置里的 `admin auth`。

### 第四步：按需填写 `Custom Auth`

`Custom Auth` 只有在站点额外开启访问密码时才需要填写。
如果没有这层额外访问密码，留空即可。
它不会替代 `Admin Auth`。

### 第五步：配置 `Temp 域名`

这里填写允许创建邮箱的基础域名。
即使你开启了 `随机子域`，这里仍然填写基础域名，而不是随机出来的子域名。

### 第六步：按需开启 `随机子域`

只有在 `邮箱生成 = Cloudflare Temp Email` 时，这一项才会生效。
启用前需要先确认：

- 后端已经配置 `RANDOM_SUBDOMAIN_DOMAINS`
- Cloudflare DNS 已经设置 `MX *`

### 第七步：作为 `邮箱服务` 时填写 `邮件接收`

如果 `邮箱服务` 也选了 `Cloudflare Temp Email`，还需要填写真正的收件邮箱。
后续转发邮件会送到这里。

### 第八步：查看后端搭建参考

如果你还没有部署后端，可以参考：

- `https://linux.do/t/topic/316819`

## 常见问题

### 为什么我明明配了 `Temp API`，还是不能生成邮箱？

先确认：

- `邮箱生成` 是否真的选了 `Cloudflare Temp Email`
- `Admin Auth` 是否正确
- `Temp 域名` 是否正确

### 为什么随机子域没有生效？

通常是因为后端没有配置 `RANDOM_SUBDOMAIN_DOMAINS`，或者 Cloudflare DNS 没有完成 `MX *` 设置。

## 注意事项

- 如果同时把它用作 `邮箱生成` 和 `邮箱服务`，要把两边相关字段都检查一遍
- `Custom Auth` 只有额外访问密码场景才需要填写
- 开启随机子域前，先确认后端和 DNS 已经准备好
