# NFLSHC OAuth 开放平台 · API 契约

> 平台域名：`platform.nflshcchat.cc.cd`（开发者平台）
> 授权中心：`accounts.nflshcchat.cc.cd`（用户登录 / 授权）
> API 基址：`https://worker.nflshcchat.cc.cd`
> 账号体系：与 nflshcchat 主站共用同一套账号（D1 `users` 表），密码使用 SHA-256 哈希，任何接口都不会返回密码。

---

## 一、核心概念

| 概念 | 说明 |
| --- | --- |
| `client_id` | 应用公开标识，形如 `nac_xxxxxxxx` |
| `client_secret` | 应用密钥，形如 `nacs_xxxxxxxx`，**仅在创建/重置时返回一次**，服务端只存哈希 |
| `redirect_uri` | 授权后回跳地址，必须与创建应用时登记的地址**完全一致** |
| `scope` | 需要获取的用户信息范围（见下表），用户在授权页会逐项看到 |
| 授权码 `code` | 一次性凭据，5 分钟有效，形如 `naco_xxxxxxxx` |
| `access_token` | 访问令牌，2 小时有效，形如 `naat_xxxxxxxx` |
| `refresh_token` | 刷新令牌，30 天有效，形如 `nart_xxxxxxxx` |

### 1.1 可用权限（scope）

| key | 名称 | 包含字段 | 敏感 |
| --- | --- | --- | --- |
| `profile` | 基本资料 | `username` `nickname` `avatarUrl` `bio` `xp` `isAdmin` `createdAt` | 否 |
| `email` | 邮箱地址 | `email` | 是 |
| `rooms` | 群聊列表 | `rooms[]`（id / name / type） | 否 |
| `friends` | 好友列表 | `friends[]`（用户名数组） | 否 |
| `messages` | 消息内容 | `messages[]`（最近 50 条：id / roomId / content / timestamp） | 是 |
| `stats` | 统计信息 | `messageCount` | 否 |

> `GET /api/oauth/scopes` 可实时获取该列表。

---

## 二、授权码流程（Authorization Code Flow）

```
┌──────────┐     ① 跳转授权页      ┌────────────────────────────┐
│ 开发者应用 │ ───────────────────▶ │ accounts.nflshcchat.cc.cd  │
│ (你的网站) │                      │  用户登录 → 查看权限 → 同意 │
└──────────┘                      └────────────────────────────┘
      ▲                                         │
      │ ③ 回跳 ?code=xxx&state=yyy               │ ② 用户同意
      └─────────────────────────────────────────┘
      │
      │ ④ 服务端 POST /api/oauth/token（code + client_secret）
      ▼
┌──────────────────────────┐   ⑤ GET /api/oauth/userinfo (Bearer access_token)
│ worker.nflshcchat.cc.cd  │ ◀───────────────────────────────────
└──────────────────────────┘
```

### 第 1 步：把用户引导到授权中心

```text
https://accounts.nflshcchat.cc.cd/authorize.html
  ?client_id=nac_xxxxxxxx
  &redirect_uri=https://你的站点/callback
  &scope=profile email
  &state=随机防CSRF字符串
```

### 第 2 步：用户同意后回跳

```text
https://你的站点/callback?code=naco_xxxxxxxx&state=随机防CSRF字符串
```

用户拒绝时：

```text
https://你的站点/callback?error=access_denied&error_description=用户拒绝了授权&state=...
```

### 第 3 步：服务端换取令牌

`POST https://worker.nflshcchat.cc.cd/api/oauth/token`

```json
{
  "grant_type": "authorization_code",
  "code": "naco_xxxxxxxx",
  "client_id": "nac_xxxxxxxx",
  "client_secret": "nacs_xxxxxxxx",
  "redirect_uri": "https://你的站点/callback"
}
```

响应：

```json
{
  "access_token": "naat_xxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 7200,
  "refresh_token": "nart_xxxxxxxx",
  "scope": "profile email"
}
```

### 第 4 步：读取用户信息

`GET https://worker.nflshcchat.cc.cd/api/oauth/userinfo`
Header：`Authorization: Bearer naat_xxxxxxxx`

```json
{
  "sub": "huangzhiyuan",
  "client_id": "nac_xxxxxxxx",
  "scope": "profile email",
  "username": "huangzhiyuan",
  "nickname": "huangzhiyuan",
  "avatarUrl": "https://...",
  "bio": "……",
  "xp": 120,
  "isAdmin": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "email": "user@example.com"
}
```

> 只返回你申请的 scope 范围内的字段。**密码、密码哈希永远不会返回。**

### 第 5 步：刷新 / 吊销

```json
POST /api/oauth/token
{ "grant_type": "refresh_token", "refresh_token": "nart_xxx", "client_id": "nac_xxx", "client_secret": "nacs_xxx" }

POST /api/oauth/revoke
{ "client_id": "nac_xxx", "client_secret": "nacs_xxx", "token": "naat_xxx" }
```

---

## 三、开发者接口（platform 后端调用）

> 以下接口均需开发者**本人**的 nflshcchat 访问令牌：`Authorization: Bearer <用户登录 token>`。
> 用户登录 token 由 `POST /api/auth/login` 获取（body：`{ username, password: <SHA-256 哈希> }`）。

### 3.1 应用管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/oauth/clients` | 创建应用 |
| GET | `/api/oauth/clients` | 我的应用列表 |
| GET | `/api/oauth/clients/:client_id` | 应用详情 |
| PATCH | `/api/oauth/clients/:client_id` | 更新应用 |
| DELETE | `/api/oauth/clients/:client_id` | 删除应用（级联清理授权/令牌） |
| POST | `/api/oauth/clients/:client_id/secret` | 重置 client_secret（旧密钥立即失效） |

创建应用请求体：

```json
{
  "name": "我的应用",
  "description": "应用简介",
  "homepage": "https://example.com",
  "logo": "https://example.com/logo.png",
  "redirectUris": ["https://example.com/callback"],
  "scopes": ["profile", "email"]
}
```

创建响应（`clientSecret` 只此一次返回）：

```json
{
  "ok": true,
  "client": { "clientId": "nac_xxx", "name": "我的应用", "redirectUris": ["..."], "scopes": ["profile","email"], "owner": "huangzhiyuan", "status": "active" },
  "clientSecret": "nacs_xxxxxxxx"
}
```

### 3.2 授权用户（管辖范围）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/oauth/clients/:client_id/users` | 已授权用户列表（含项目内封禁状态） |
| POST | `/api/oauth/clients/:client_id/users/:username/ban` | **项目内封禁**（body：`{ "reason": "..." }`，必填） |
| POST | `/api/oauth/clients/:client_id/users/:username/unban` | 解除项目内封禁 |
| GET | `/api/oauth/clients/:client_id/bans` | 项目内封禁列表 |

`GET .../users` 响应示例：

```json
{
  "ok": true,
  "users": [
    {
      "username": "someone",
      "nickname": "someone",
      "avatarUrl": "https://...",
      "bio": "……",
      "xp": 30,
      "email": "a@b.com",
      "createdAt": "...",
      "scopes": [{ "key": "profile", "name": "基本资料", "desc": "..." }],
      "grantedAt": "...",
      "banned": false,
      "banReason": "",
      "globalBanned": false
    }
  ]
}
```

> 字段同样受用户授权 scope 限制：未授权 `email` 时 `email` 为 `null`，未授权 `profile` 时头像/简介为空。
> **开发者无法通过任何接口修改用户在主站的状态（封禁/冻结/密码）。**

### 3.3 【校验端口】查询用户在你项目内的状态

`POST /api/oauth/check`（服务端到服务端，用 client_secret 鉴权）

```json
{ "client_id": "nac_xxx", "client_secret": "nacs_xxx", "username": "someone" }
```

响应：

```json
{ "ok": true, "username": "someone", "granted": true, "banned": false, "reason": "", "bannedAt": null }
```

- `granted`：该用户是否授权过你的应用（是否在你的管辖范围内）
- `banned`：是否被你**在项目内**封禁
- 建议：用户每次调用你项目的高风险接口前调用此接口校验。

### 3.4 申请全站封禁（需管理员审批）

`POST /api/oauth/ban-requests`

```json
{
  "clientId": "nac_xxx",
  "username": "someone",
  "reason": "必须填写理由，不限字数。请提供时间、行为、证据等细节，便于管理员判断。"
}
```

响应：`{ "ok": true, "requestId": "nbr_xxx", "status": "pending" }`

`GET /api/oauth/ban-requests` 查看自己提交的申请及其审核状态（`pending` / `approved` / `rejected`）。

> 只有主站管理员 `huangzhiyuan` 能批准并执行全站封禁；审批结果会以站内通知发送给申请人。
> 同一应用对同一用户只保留一条待审申请（重复提交返回 409）。

---

## 四、用户侧接口（accounts 授权中心调用）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/oauth/authorize-info?client_id=&redirect_uri=&scope=&state=` | 公开：授权页展示应用与权限 |
| POST | `/api/oauth/authorize` | 需用户 token：同意/拒绝授权 |
| GET | `/api/oauth/grants` | 需用户 token：我授权过的应用 |
| DELETE | `/api/oauth/grants/:client_id` | 需用户 token：撤销授权（同时吊销令牌） |

同意授权请求体：

```json
{ "clientId": "nac_xxx", "redirectUri": "https://...", "scopes": ["profile","email"], "state": "...", "approve": true }
```

响应：`{ "ok": true, "approved": true, "code": "naco_xxx", "redirect": "https://...?code=naco_xxx&state=..." }`

---

## 五、管理员接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/oauth/admin/ban-requests` | 申请列表（需 admin token） |
| POST | `/api/oauth/admin/ban-requests/:id` | 审批：`{ "action": "approve"\|"reject", "note": "备注" }` |

---

## 六、错误码

| error | 含义 |
| --- | --- |
| `invalid_client` | client_id / client_secret 不正确或应用被停用 |
| `invalid_grant` | code / refresh_token 无效、过期或已使用 |
| `invalid_redirect_uri` | 回调地址未登记 |
| `invalid_scope` | 未选择有效权限 |
| `access_denied` | 用户拒绝授权，或用户已撤销授权 |
| `invalid_token` | 访问令牌无效或已过期 |
| `login_required` | 需要先登录 nflshcchat 账号 |
| `client_suspended` | 应用已被管理员停用 |

---

## 七、接入代码示例

### 7.1 Node.js（Express）

```javascript
const express = require('express');
const app = express();

const CLIENT_ID = 'nac_你的应用ID';
const CLIENT_SECRET = 'nacs_你的密钥';
const REDIRECT_URI = 'https://你的站点/callback';
const API = 'https://worker.nflshcchat.cc.cd';
const ACCOUNTS = 'https://accounts.nflshcchat.cc.cd';

// ① 跳转授权中心
app.get('/login', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  req.session = req.session || {};
  res.redirect(`${ACCOUNTS}/authorize.html` +
    `?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent('profile email')}&state=${state}`);
});

// ② 回调：换令牌 + 读用户信息
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  const tokenRes = await fetch(`${API}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code', code,
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI
    })
  });
  const tokens = await tokenRes.json();
  const infoRes = await fetch(`${API}/api/oauth/userinfo`, {
    headers: { Authorization: 'Bearer ' + tokens.access_token }
  });
  const user = await infoRes.json();
  res.send(`欢迎，${user.nickname || user.username}！`);
});

// ③ 校验用户是否被你在项目内封禁
async function checkBan(username) {
  const r = await fetch(`${API}/api/oauth/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, username })
  });
  return r.json(); // { granted, banned, reason }
}

app.listen(3000);
```

### 7.2 Python（Flask）

```python
import requests
from flask import Flask, redirect, request

app = Flask(__name__)
CLIENT_ID = 'nac_你的应用ID'
CLIENT_SECRET = 'nacs_你的密钥'
REDIRECT_URI = 'https://你的站点/callback'
API = 'https://worker.nflshcchat.cc.cd'
ACCOUNTS = 'https://accounts.nflshcchat.cc.cd'

@app.route('/login')
def login():
    # ① 跳转授权中心
    return redirect(f'{ACCOUNTS}/authorize.html?client_id={CLIENT_ID}'
                    f'&redirect_uri={REDIRECT_URI}&scope=profile%20email&state=xyz')

@app.route('/callback')
def callback():
    code = request.args.get('code')
    # ② 换令牌
    tokens = requests.post(f'{API}/api/oauth/token', json={
        'grant_type': 'authorization_code', 'code': code,
        'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
    }).json()
    # ③ 读用户信息
    user = requests.get(f'{API}/api/oauth/userinfo',
                        headers={'Authorization': f"Bearer {tokens['access_token']}"}).json()
    return f"欢迎，{user.get('nickname') or user.get('username')}！"

# ④ 校验项目内封禁
def is_banned(username: str) -> bool:
    r = requests.post(f'{API}/api/oauth/check', json={
        'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET, 'username': username,
    }).json()
    return bool(r.get('banned'))
```

### 7.3 PHP

```php
<?php
const CLIENT_ID     = 'nac_你的应用ID';
const CLIENT_SECRET = 'nacs_你的密钥';
const REDIRECT_URI  = 'https://你的站点/callback';
const API           = 'https://worker.nflshcchat.cc.cd';

// ① 跳转授权中心
if (isset($_GET['login'])) {
    header('Location: https://accounts.nflshcchat.cc.cd/authorize.html?client_id=' . CLIENT_ID
        . '&redirect_uri=' . urlencode(REDIRECT_URI) . '&scope=' . urlencode('profile email') . '&state=xyz');
    exit;
}

// ② 回调换令牌
if (isset($_GET['code'])) {
    $ch = curl_init(API . '/api/oauth/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'grant_type' => 'authorization_code',
            'code' => $_GET['code'],
            'client_id' => CLIENT_ID,
            'client_secret' => CLIENT_SECRET,
            'redirect_uri' => REDIRECT_URI,
        ]),
    ]);
    $tokens = json_decode(curl_exec($ch), true);

    // ③ 读取用户信息
    $ch2 = curl_init(API . '/api/oauth/userinfo');
    curl_setopt_array($ch2, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $tokens['access_token']],
    ]);
    $user = json_decode(curl_exec($ch2), true);
    echo '欢迎，' . ($user['nickname'] ?? $user['username']);
    exit;
}
```

### 7.4 纯前端（仅演示，正式项目请用服务端换令牌）

```html
<script>
const CLIENT_ID = 'nac_你的应用ID';
const REDIRECT_URI = location.origin + '/';
function login() {
  location.href = 'https://accounts.nflshcchat.cc.cd/authorize.html'
    + '?client_id=' + CLIENT_ID
    + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
    + '&scope=' + encodeURIComponent('profile')
    + '&state=' + Math.random().toString(36).slice(2);
}
</script>
<button onclick="login()">使用 NFLSHC 账号登录</button>
```

> ⚠️ 浏览器端不要放 `client_secret`（会泄露）。纯前端项目请把换令牌的逻辑放到自己的服务端或 Cloudflare Worker。

---

## 八、安全边界（务必阅读）

1. **开发者看不到密码**：任何接口都不返回 `password` / `password_hash`。
2. **开发者不能操作主站账号**：项目内封禁只写入 `oauth_project_bans`，不影响用户在主站的状态；只有主站管理员能封禁/冻结主站账号。
3. **敏感信息需用户明确授权**：`email`、`messages` 等敏感 scope 在授权页会高亮提示，用户可拒绝或只授权部分。
4. **用户可随时撤销**：用户在 `accounts.nflshcchat.cc.cd/apps.html` 撤销授权后，相关令牌立即失效。
5. **回调地址白名单**：`redirect_uri` 必须与登记值完全一致，防止授权码被劫持。
6. **密钥保管**：`client_secret` 只在创建/重置时返回一次；如疑似泄露请在 platform 重置。
7. **全站封禁需人类审核**：开发者的封禁申请必须附带理由，由主站管理员核定后执行。
