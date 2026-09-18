# NFLSHC 开放平台 · 开发者站点

NFLSHC OAuth 开放平台的**开发者前端站点**（纯静态 HTML/CSS/JS，无构建步骤、无 npm 依赖、无外部 CDN 框架），
部署在 GitHub Pages，自定义域名 **platform.nflshcchat.cc.cd**。

- 授权中心（用户授权页）：`accounts.nflshcchat.cc.cd`
- API 基址（Worker）：`https://worker.nflshcchat.cc.cd`
- 账号体系：与 nflshcchat 主站共用同一套账号（密码 SHA-256 哈希，接口从不返回密码）

## 页面清单

| 文件 | 作用 |
| --- | --- |
| `index.html` | 开发者登录页。密码在浏览器内先做 SHA-256 哈希再提交 `/api/auth/login`，成功后保存 token 与用户信息并跳转 Dashboard；已登录（`/api/auth/me` 通过）时自动跳转。 |
| `dashboard.html` | 应用管理。列出我的全部 OAuth 应用（名称 / client_id / 授权用户数 / 状态 / 创建时间），支持创建应用（返回的 `clientSecret` 以醒目弹窗展示，提示仅显示一次）与删除应用。 |
| `app.html` | 应用详情（`?id=<client_id>`）。基本信息与编辑（PATCH）、client_id 复制、重置密钥（`clientSecret` 同样只显示一次）、回调地址与已申请 scope 的兜底展示；含「授权用户」表格（项目内封禁 / 解除封禁）与「申请全站封禁」表单及申请状态列表。 |
| `guide.html` | 接入指南。授权码流程说明、在 platform 的配置步骤、可用 scope 表、**一键复制的多语言示例代码**（Node.js/Express、Python/Flask、PHP、纯前端）、校验端口 `/api/oauth/check` 用法、错误码与安全建议。 |
| `bans.html` | 封禁管理。汇总我名下所有应用的「项目内封禁名单」（逐个应用查询，可解除封禁）与「全站封禁申请记录」（状态 pending/approved/rejected、管理员备注、理由全文）。 |
| `js/api.js` | API 封装与通用 UI：`API_BASE`、`apiGet/apiPost/apiPatch/apiDelete`（统一附加 `Authorization: Bearer`、401 跳回登录页、非 2xx 抛出服务端 `error` 文本）、`escapeHtml`、导航栏 / 弹窗 / Toast / 复制 / 日期格式化、响应字段归一化与 scope 列表加载。 |
| `js/theme.js` | （已有，未修改）主题切换 `ThemeManager` 与令牌存取 `AuthToken`。 |
| `css/themes.css` | （已有，未修改）主题变量，`<html data-theme>` 切换，默认 dark（暗夜黑金 `#ffd700`）。 |

## 功能要点

- **主题切换**：每个页面右上角都有主题下拉框，调用 `ThemeManager.setTheme()`，可选 暗夜黑金 / 晨曦白光 / 深海蓝调 / 紫罗兰夜 / 翡翠绿意，选择结果持久化在 `localStorage`。
- **安全**：所有用户可控文本渲染到 DOM 前统一经 `escapeHtml()` 转义；密码从不明文出网；`client_secret` 只在创建/重置时由弹窗展示一次。
- **封禁边界**：项目内封禁仅写入开发者自己的应用管辖范围，**不影响用户在 nflshcchat 主站的状态**；全站封禁必须由主站管理员 `huangzhiyuan` 审核批准。页面中已明确提示。
- **接口契约**：所有请求严格按仓库根目录的 `API.md` 实现（该文件为只读契约，未做任何修改）。

## 本地预览

无构建步骤，直接用浏览器打开 `index.html` 即可（登录哈希优先使用 WebCrypto；非 HTTPS 环境会自动回退到内置的纯 JS SHA-256 实现）。
如需以 HTTP 方式预览（避免 `file://` 的跨域限制），任选一种静态服务器：

```bash
python -m http.server 8080
# 或
npx serve .
```

## 部署（GitHub Pages + 自定义域名）

1. 把本目录内容推送到仓库默认分支（`main`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会在推送到 `main` 时自动构建并发布（也可在 Actions 页面手动 `workflow_dispatch`）：
   `actions/checkout@v4` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3`（`path: '.'`）→ `actions/deploy-pages@v4`。
4. 仓库根目录的 `CNAME` 已写入 `platform.nflshcchat.cc.cd`；在域名 DNS 处把该子域 `CNAME` 指向 `<用户名>.github.io`，并在 Pages 设置中勾选 **Enforce HTTPS**。
5. `.nojekyll` 为空文件，用于跳过 Jekyll 处理，保证 `js/`、`css/` 等目录按原样发布。

> 站点为纯静态资源，不包含任何密钥；`client_secret` 只存在于开发者的服务端。
