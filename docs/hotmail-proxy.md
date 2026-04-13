# Hotmail Proxy

用于把扩展里的 Hotmail 令牌刷新与邮件读取，转移到本地或你自己的后端，规避浏览器侧 `AADSTS90023` 这类跨域 token redemption 错误。

代理策略：

- 优先尝试 `Microsoft Graph`
- 如果当前 refresh token 没有 `graph.microsoft.com` 授权，会自动回退到 `outlook.office.com` 邮件接口
- 这对很多“买来的 Hotmail 邮箱 + 现成 refresh token”更友好
- 代理会按 `邮箱 + clientId + refreshToken + 通道策略` 缓存 access token，未过期就直接复用，不会每次请求都刷新

## 启动

```bash
npm run hotmail-proxy
```

默认监听：

```txt
http://127.0.0.1:8787
```

额外要求：

- 本机需要可执行的 `curl`

也可以自定义：

```bash
HOTMAIL_PROXY_HOST=0.0.0.0 HOTMAIL_PROXY_PORT=8787 npm run hotmail-proxy
```

## 扩展配置

1. 打开侧边栏
2. `邮箱服务` 选择 `Hotmail（微软 Graph）`
3. 在 `Hotmail 账号池` 里的 `代理地址` 填：

```txt
http://127.0.0.1:8787
```

4. 保存配置
5. 再去校验 Hotmail 账号

## 接口

健康检查：

```txt
GET /health
```

读取邮件：

```txt
POST /api/hotmail/messages
```

请求体：

```json
{
  "account": {
    "email": "name@hotmail.com",
    "clientId": "your-client-id",
    "refreshToken": "your-refresh-token",
    "accessToken": "",
    "expiresAt": 0
  },
  "mailboxes": ["INBOX", "Junk"]
}
```

## 注意

- 这是最小可用版本，默认放开 `Access-Control-Allow-Origin: *`，更适合本地使用。
- 如果你部署到公网，建议至少加反向代理鉴权或 IP 限制。
- 代理端不会替你申请微软应用；它只是把“刷 token + 读邮件”从浏览器搬到服务端。
- 当前实现依赖本机 `curl` 出网。如果你的环境没有 `curl`，请先安装。
- access token 会在代理进程内做内存缓存；重启代理后会重新刷新一次。
