/**
 * NFLSHC 开放平台 · 前端 API 封装 + 通用 UI 组件
 * 依赖：js/theme.js（提供 window.AuthToken / window.ThemeManager / window.clearLoginState）
 *
 * 暴露：
 *   window.API_BASE
 *   escapeHtml(str)
 *   apiGet / apiPost / apiPatch / apiDelete (path, body, opts)
 *   PlatformUI.{ renderNav, requireLogin, toast, alert, confirm, prompt, secret, copy, formatDate }
 *   PlatformUtil.{ normalizeClient, normalizeScopeList, normalizeGrantUser, normalizeBanRequest,
 *                  normalizeBanEntry, loadScopes }
 */
(function () {
    'use strict';

    var API_BASE = 'https://worker.nflshcchat.cc.cd';
    window.API_BASE = API_BASE;

    /* /api/oauth/scopes 不可用时的内置权限回退表（依据 API.md 1.1） */
    var FALLBACK_SCOPES = [
        { key: 'profile', name: '基本资料', desc: '用户名、昵称、头像、简介、经验值、注册时间', sensitive: false },
        { key: 'email', name: '邮箱地址', desc: '账号绑定的邮箱（敏感）', sensitive: true },
        { key: 'rooms', name: '群聊列表', desc: '所在群聊的 id / 名称 / 类型', sensitive: false },
        { key: 'friends', name: '好友列表', desc: '好友用户名数组', sensitive: false },
        { key: 'messages', name: '消息内容', desc: '最近 50 条消息内容（敏感）', sensitive: true },
        { key: 'stats', name: '统计信息', desc: '消息总数等统计数据', sensitive: false }
    ];

    /* ==================================================================
     * 一、基础工具
     * ================================================================== */

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    window.escapeHtml = escapeHtml;

    function formatDate(value) {
        if (!value) return '—';
        if (typeof value === 'number') {
            var d0 = new Date(value < 1e12 ? value * 1000 : value);
            if (isNaN(d0.getTime())) return String(value);
            return pad(d0.getFullYear()) + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()) +
                ' ' + pad(d0.getHours()) + ':' + pad(d0.getMinutes());
        }
        var d = new Date(String(value));
        if (isNaN(d.getTime())) return String(value);
        return pad(d.getFullYear()) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function currentFileName() {
        var path = window.location.pathname || '';
        var name = path.substring(path.lastIndexOf('/') + 1);
        return name || 'dashboard.html';
    }

    function goLogin() {
        var next = currentFileName() + (window.location.search || '');
        window.location.href = 'index.html?next=' + encodeURIComponent(next);
    }

    /* ==================================================================
     * 二、API 封装
     * ================================================================== */

    function buildUrl(path) {
        if (/^https?:\/\//i.test(path)) return path;
        return API_BASE + (path.charAt(0) === '/' ? path : '/' + path);
    }

    function authHeaders() {
        var headers = { 'Accept': 'application/json' };
        var token = window.AuthToken ? window.AuthToken.get() : '';
        if (token) headers['Authorization'] = 'Bearer ' + token;
        return headers;
    }

    async function readErrorMessage(resp) {
        var text = '';
        try { text = await resp.text(); } catch (e) { text = ''; }
        if (text) {
            try {
                var data = JSON.parse(text);
                if (data && typeof data === 'object') {
                    var code = data.error || data.code || '';
                    var desc = data.error_description || data.message || data.detail || '';
                    if (code && desc && code !== desc) return code + '：' + desc;
                    if (desc) return String(desc);
                    if (code) return String(code);
                }
            } catch (e) {
                return text;
            }
            return text;
        }
        return '请求失败（HTTP ' + resp.status + '）';
    }

    async function request(method, path, body, opts) {
        opts = opts || {};
        var headers = authHeaders();
        var init = { method: method, headers: headers, mode: 'cors', credentials: 'omit' };
        if (body !== undefined && body !== null) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }

        var resp;
        try {
            resp = await fetch(buildUrl(path), init);
        } catch (e) {
            throw new Error('网络请求失败，请检查网络连接后重试');
        }

        if (resp.status === 401) {
            var msg401 = await readErrorMessage(resp);
            if (window.AuthToken) window.AuthToken.clear();
            try {
                var u = buildUrl(path);
                if (!opts.skipAuthRedirect && u.indexOf('/api/auth/') === -1 && currentFileName() !== 'index.html') {
                    goLogin();
                }
            } catch (e) { /* 忽略 */ }
            throw new Error(msg401 || '登录状态已失效，请重新登录');
        }

        if (!resp.ok) throw new Error(await readErrorMessage(resp));

        if (resp.status === 204) return { ok: true };
        var text = '';
        try { text = await resp.text(); } catch (e) { text = ''; }
        if (!text) return { ok: true };
        try {
            return JSON.parse(text);
        } catch (e) {
            return { ok: true, raw: text };
        }
    }

    function apiGet(path, opts) { return request('GET', path, null, opts); }
    function apiPost(path, body, opts) { return request('POST', path, body, opts); }
    function apiPatch(path, body, opts) { return request('PATCH', path, body, opts); }
    function apiDelete(path, opts) { return request('DELETE', path, null, opts); }

    window.apiGet = apiGet;
    window.apiPost = apiPost;
    window.apiPatch = apiPatch;
    window.apiDelete = apiDelete;

    /* ==================================================================
     * 三、导航栏 / 主题切换 / 登录校验
     * ================================================================== */

    var NAV_CSS = [
        '.pf-nav{position:sticky;top:0;z-index:60;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);box-shadow:0 4px 18px rgba(0,0,0,.18);}',
        '.pf-nav-inner{max-width:1180px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}',
        '.pf-brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700;font-size:16px;white-space:nowrap;}',
        '.pf-brand-dot{width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,var(--accent-color),var(--accent-hover));box-shadow:0 0 12px var(--accent-color);animation:pfPulse 2.6s ease-in-out infinite;}',
        '@keyframes pfPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.75}}',
        '.pf-brand-text{background:linear-gradient(135deg,var(--accent-color),var(--accent-hover));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}',
        '.pf-brand-badge{font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--accent-color);color:var(--accent-color);opacity:.85;}',
        '.pf-nav-links{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}',
        '.pf-nav-link{appearance:none;background:transparent;border:none;font:inherit;font-size:14px;cursor:pointer;padding:8px 14px;border-radius:10px;text-decoration:none;color:var(--text-secondary);transition:all .22s ease;white-space:nowrap;}',
        '.pf-nav-link:hover{color:var(--accent-color);background:var(--hover-bg);transform:translateY(-1px);}',
        '.pf-nav-link.pf-active{color:var(--accent-color);background:var(--accent-color-alpha);box-shadow:inset 0 0 0 1px var(--accent-color-alpha);}',
        '.pf-nav-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
        '.pf-user{font-size:13px;color:var(--text-secondary);max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.pf-user b{color:var(--accent-color);}',
        '.pf-theme-select{background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-color);border-radius:10px;padding:7px 10px;font-size:13px;cursor:pointer;transition:border-color .22s ease,box-shadow .22s ease;}',
        '.pf-theme-select:hover{border-color:var(--accent-color);}',
        '.pf-theme-select:focus{outline:none;border-color:var(--accent-color);box-shadow:0 0 0 3px var(--accent-color-alpha);}',
        '@media (max-width:720px){.pf-nav-inner{padding:10px 14px;gap:10px}.pf-user{display:none}.pf-nav-link{padding:7px 10px;font-size:13px}}'
    ].join('\n');

    var UI_CSS = [
        '.pf-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .2s ease;overflow-y:auto;}',
        '.pf-overlay.pf-show{opacity:1;}',
        '.pf-modal{width:100%;max-width:520px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.45);transform:translateY(14px) scale(.98);opacity:0;transition:transform .24s cubic-bezier(.22,1,.36,1),opacity .24s ease;max-height:calc(100vh - 40px);display:flex;flex-direction:column;}',
        '.pf-overlay.pf-show .pf-modal{transform:translateY(0) scale(1);opacity:1;}',
        '.pf-modal.pf-modal-wide{max-width:760px;}',
        '.pf-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border-color);}',
        '.pf-modal-head h3{margin:0;font-size:17px;color:var(--accent-color);}',
        '.pf-x{appearance:none;background:transparent;border:none;color:var(--text-muted);font-size:22px;line-height:1;cursor:pointer;padding:0 4px;border-radius:8px;transition:all .2s ease;}',
        '.pf-x:hover{color:var(--danger);background:var(--hover-bg);}',
        '.pf-modal-body{padding:20px;overflow-y:auto;}',
        '.pf-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid var(--border-color);flex-wrap:wrap;}',
        '.pf-text{margin:0 0 12px;color:var(--text-secondary);font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
        '.pf-label{display:block;font-size:13px;color:var(--text-secondary);margin:0 0 7px;}',
        '.pf-req{color:var(--danger);}',
        '.pf-input{width:100%;box-sizing:border-box;background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-color);border-radius:10px;padding:11px 13px;font:inherit;font-size:14px;transition:border-color .2s ease,box-shadow .2s ease;}',
        '.pf-input:focus{outline:none;border-color:var(--accent-color);box-shadow:0 0 0 3px var(--accent-color-alpha);}',
        '.pf-textarea{resize:vertical;line-height:1.65;min-height:90px;}',
        '.pf-hint{margin:8px 0 0;font-size:12px;color:var(--text-muted);line-height:1.6;}',
        '.pf-error{margin:10px 0 0;font-size:13px;color:var(--danger);}',
        '.pf-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:transform .18s ease,box-shadow .22s ease,background .22s ease,color .22s ease,border-color .22s ease;}',
        '.pf-btn:hover:not(:disabled){transform:translateY(-2px);}',
        '.pf-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}',
        '.pf-btn-primary{background:linear-gradient(135deg,var(--accent-color),var(--accent-hover));color:#1a1a2e;box-shadow:0 6px 18px var(--accent-color-alpha);}',
        '.pf-btn-primary:hover:not(:disabled){box-shadow:0 10px 26px var(--accent-color-alpha);}',
        '.pf-btn-ghost{background:transparent;color:var(--text-secondary);border-color:var(--border-color);}',
        '.pf-btn-ghost:hover:not(:disabled){color:var(--text-primary);border-color:var(--accent-color);}',
        '.pf-btn-danger{background:var(--danger);color:#fff;}',
        '.pf-secret-box{background:var(--bg-tertiary);border:1px dashed var(--accent-color);border-radius:14px;padding:16px;margin:14px 0 0;position:relative;overflow:hidden;}',
        '.pf-secret-box:before{content:"";position:absolute;inset:-40% -10% auto auto;width:180px;height:180px;background:radial-gradient(circle,var(--accent-color-alpha),transparent 70%);pointer-events:none;}',
        '.pf-secret-value{position:relative;font-family:"Consolas","Courier New",monospace;font-size:16px;font-weight:700;color:var(--accent-color);word-break:break-all;line-height:1.6;user-select:all;}',
        '.pf-warn{margin:0;padding:12px 14px;border-radius:12px;background:rgba(220,53,69,.12);border:1px solid var(--danger);color:var(--danger);font-size:13px;font-weight:600;line-height:1.65;}',
        '.pf-toast-wrap{position:fixed;right:18px;bottom:18px;z-index:400;display:flex;flex-direction:column;gap:10px;max-width:min(360px,90vw);}',
        '.pf-toast{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-left:4px solid var(--accent-color);border-radius:12px;padding:12px 16px;font-size:14px;box-shadow:0 12px 34px rgba(0,0,0,.34);animation:pfToastIn .26s cubic-bezier(.22,1,.36,1);line-height:1.6;word-break:break-word;}',
        '.pf-toast.pf-toast-error{border-left-color:var(--danger);}',
        '.pf-toast.pf-toast-success{border-left-color:var(--success);}',
        '.pf-toast.pf-toast-warning{border-left-color:var(--warning);}',
        '.pf-toast.pf-out{animation:pfToastOut .22s ease forwards;}',
        '@keyframes pfToastIn{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}',
        '@keyframes pfToastOut{to{opacity:0;transform:translateX(28px)}}'
    ].join('\n');

    function injectStyle(id, css) {
        if (document.getElementById(id)) return;
        var el = document.createElement('style');
        el.id = id;
        el.textContent = css;
        document.head.appendChild(el);
    }

    function setUserChip(nav, user) {
        var chip = nav.querySelector('#pfUserChip');
        if (!chip) return;
        if (user && user.username) {
            chip.innerHTML = (user.isAdmin ? '👑 ' : '👤 ') + '<b>' + escapeHtml(user.username) + '</b>' +
                (user.isAdmin ? ' <span style="opacity:.7">(管理员)</span>' : '');
        } else {
            chip.textContent = '';
        }
    }

    function renderNav(active) {
        injectStyle('pf-nav-style', NAV_CSS);
        var user = null;
        try { user = JSON.parse(localStorage.getItem('nflshc_currentUser') || 'null'); } catch (e) { user = null; }

        var themes = (window.ThemeManager && window.ThemeManager.getThemes()) || {};
        var currentTheme = window.ThemeManager ? window.ThemeManager.getTheme() : 'dark';
        var options = '';
        Object.keys(themes).forEach(function (key) {
            var t = themes[key] || {};
            options += '<option value="' + escapeHtml(key) + '"' + (key === currentTheme ? ' selected' : '') + '>' +
                escapeHtml((t.icon || '') + ' ' + (t.name || key)) + '</option>';
        });

        var links = [
            { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard' },
            { key: 'guide', href: 'guide.html', label: '接入指南' },
            { key: 'bans', href: 'bans.html', label: '封禁管理' }
        ];
        var linksHtml = links.map(function (l) {
            return '<a class="pf-nav-link' + (l.key === active ? ' pf-active' : '') + '" href="' +
                escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a>';
        }).join('');

        var nav = document.createElement('nav');
        nav.className = 'pf-nav';
        nav.innerHTML = ''
            + '<div class="pf-nav-inner">'
            + '  <a class="pf-brand" href="dashboard.html">'
            + '    <span class="pf-brand-dot"></span>'
            + '    <span class="pf-brand-text">NFLSHC 开放平台</span>'
            + '    <span class="pf-brand-badge">Developer</span>'
            + '  </a>'
            + '  <div class="pf-nav-links">' + linksHtml
            + '    <button type="button" class="pf-nav-link" id="pfLogoutBtn">退出登录</button>'
            + '  </div>'
            + '  <div class="pf-nav-right">'
            + '    <span class="pf-user" id="pfUserChip"></span>'
            + '    <select class="pf-theme-select" id="pfThemeSelect" aria-label="切换主题">' + options + '</select>'
            + '  </div>'
            + '</div>';

        document.body.insertBefore(nav, document.body.firstChild);

        setUserChip(nav, user);

        var sel = nav.querySelector('#pfThemeSelect');
        sel.addEventListener('change', function () {
            if (window.ThemeManager) window.ThemeManager.setTheme(sel.value);
        });

        nav.querySelector('#pfLogoutBtn').addEventListener('click', function () {
            if (typeof window.clearLoginState === 'function') {
                window.clearLoginState();
            } else {
                if (window.AuthToken) window.AuthToken.clear();
                try { localStorage.removeItem('nflshc_currentUser'); } catch (e) { /* 忽略 */ }
            }
            window.location.href = 'index.html';
        });

        return nav;
    }

    /**
     * 校验登录态并渲染导航栏。
     * - 无 token：跳回登录页，返回 null
     * - /api/auth/me 通过：刷新本地用户信息，返回用户对象
     * - token 失效（401/无效令牌）：跳回登录页，返回 null
     * - 校验端点不可用（404/405 等）：退化为信任本地 token，继续渲染页面
     */
    async function requireLogin(active) {
        if (!window.AuthToken || !window.AuthToken.get()) {
            goLogin();
            return null;
        }

        var user = null;
        try { user = JSON.parse(localStorage.getItem('nflshc_currentUser') || 'null'); } catch (e) { user = null; }

        try {
            var me = await apiGet('/api/auth/me', { skipAuthRedirect: true });
            var fetched = (me && (me.user || me.data)) || me || null;
            if (fetched && fetched.username) {
                user = fetched;
                try { localStorage.setItem('nflshc_currentUser', JSON.stringify(user)); } catch (e) { /* 忽略 */ }
            }
        } catch (e) {
            var msg = (e && e.message) ? e.message : '登录状态校验失败';
            var unavailable = /HTTP\s*40[045]|HTTP\s*50\d|not\s*found|method\s*not\s*allowed|未实现/i.test(msg);
            if (unavailable) {
                toast('未能校验登录状态（' + msg + '），已按本地登录态继续', 'warning');
            } else {
                if (/401|登录|令牌|token|invalid/i.test(msg)) goLogin();
                else toast(msg, 'error');
                return null;
            }
        }

        var nav = renderNav(active);
        setUserChip(nav, user);
        return user || { username: '' };
    }

    /* ==================================================================
     * 四、弹窗 / 提示 / 复制
     * ================================================================== */

    function modalRoot() {
        var root = document.getElementById('pfModalRoot');
        if (!root) {
            root = document.createElement('div');
            root.id = 'pfModalRoot';
            document.body.appendChild(root);
        }
        return root;
    }

    function createModal(innerHtml, opts) {
        opts = opts || {};
        injectStyle('pf-ui-style', UI_CSS);
        var overlay = document.createElement('div');
        overlay.className = 'pf-overlay';
        overlay.innerHTML = '<div class="pf-modal' + (opts.wide ? ' pf-modal-wide' : '') + '">' + innerHtml + '</div>';
        modalRoot().appendChild(overlay);

        var closed = false;
        function onKey(e) { if (e.key === 'Escape' && opts.dismissable !== false) close(); }
        function close() {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('pf-show');
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 200);
        }
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && opts.dismissable !== false) close();
        });
        void overlay.offsetWidth;
        overlay.classList.add('pf-show');
        return { overlay: overlay, modal: overlay.firstChild, close: close };
    }

    function pfAlert(opts) {
        opts = typeof opts === 'string' ? { message: opts } : (opts || {});
        return new Promise(function (resolve) {
            var html = ''
                + '<div class="pf-modal-head"><h3>' + escapeHtml(opts.title || '提示') + '</h3>'
                + '<button type="button" class="pf-x" data-act="close">&times;</button></div>'
                + '<div class="pf-modal-body"><p class="pf-text">' + escapeHtml(opts.message || '') + '</p></div>'
                + '<div class="pf-modal-foot"><button type="button" class="pf-btn pf-btn-primary" data-act="close">'
                + escapeHtml(opts.confirmText || '知道了') + '</button></div>';
            var m = createModal(html);
            m.modal.addEventListener('click', function (e) {
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'close') { m.close(); resolve(true); }
            });
        });
    }

    function pfConfirm(opts) {
        opts = typeof opts === 'string' ? { message: opts } : (opts || {});
        return new Promise(function (resolve) {
            var html = ''
                + '<div class="pf-modal-head"><h3>' + escapeHtml(opts.title || '请确认') + '</h3>'
                + '<button type="button" class="pf-x" data-act="cancel">&times;</button></div>'
                + '<div class="pf-modal-body"><p class="pf-text">' + escapeHtml(opts.message || '') + '</p></div>'
                + '<div class="pf-modal-foot">'
                + '<button type="button" class="pf-btn pf-btn-ghost" data-act="cancel">取消</button>'
                + '<button type="button" class="pf-btn ' + (opts.danger ? 'pf-btn-danger' : 'pf-btn-primary') + '" data-act="ok">'
                + escapeHtml(opts.confirmText || '确定') + '</button></div>';
            var m = createModal(html);
            m.modal.addEventListener('click', function (e) {
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'cancel') { m.close(); resolve(false); }
                if (act === 'ok') { m.close(); resolve(true); }
            });
        });
    }

    function pfPrompt(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var placeholder = escapeHtml(opts.placeholder || '');
            var field = opts.singleLine
                ? '<input class="pf-input" id="pfPromptInput" type="text" placeholder="' + placeholder + '">'
                : '<textarea class="pf-input pf-textarea" id="pfPromptInput" rows="' + (opts.rows || 4) +
                  '" placeholder="' + placeholder + '"></textarea>';
            var html = ''
                + '<div class="pf-modal-head"><h3>' + escapeHtml(opts.title || '请输入') + '</h3>'
                + '<button type="button" class="pf-x" data-act="cancel">&times;</button></div>'
                + '<div class="pf-modal-body">'
                + (opts.message ? '<p class="pf-text">' + escapeHtml(opts.message) + '</p>' : '')
                + (opts.label ? '<label class="pf-label" for="pfPromptInput">' + escapeHtml(opts.label)
                    + (opts.required ? ' <span class="pf-req">* 必填</span>' : '') + '</label>' : '')
                + field
                + (opts.hint ? '<p class="pf-hint">' + escapeHtml(opts.hint) + '</p>' : '')
                + '<p class="pf-error" id="pfPromptError" hidden></p>'
                + '</div>'
                + '<div class="pf-modal-foot">'
                + '<button type="button" class="pf-btn pf-btn-ghost" data-act="cancel">取消</button>'
                + '<button type="button" class="pf-btn ' + (opts.danger ? 'pf-btn-danger' : 'pf-btn-primary') + '" data-act="ok">'
                + escapeHtml(opts.confirmText || '提交') + '</button></div>';
            var m = createModal(html, { wide: opts.wide });
            var input = m.modal.querySelector('#pfPromptInput');
            var errEl = m.modal.querySelector('#pfPromptError');
            setTimeout(function () { if (input) input.focus(); }, 60);

            m.modal.addEventListener('click', function (e) {
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'cancel') { m.close(); resolve(null); return; }
                if (act !== 'ok') return;
                var value = input ? input.value.trim() : '';
                if (opts.required && !value) {
                    if (errEl) { errEl.textContent = opts.errorText || '此项为必填，请填写后再提交'; errEl.hidden = false; }
                    if (input) input.focus();
                    return;
                }
                m.close();
                resolve(value);
            });
        });
    }

    /** 醒目展示 client_secret（仅显示一次） */
    function pfSecret(opts) {
        opts = typeof opts === 'string' ? { secret: opts } : (opts || {});
        return new Promise(function (resolve) {
            var html = ''
                + '<div class="pf-modal-head"><h3>🔑 ' + escapeHtml(opts.title || '应用密钥（client_secret）') + '</h3></div>'
                + '<div class="pf-modal-body">'
                + '<p class="pf-warn">⚠️ 密钥仅显示这一次，请立即复制并妥善保存！关闭本窗口后将无法再次查看，'
                + '只能重置（重置后旧密钥立即失效）。</p>'
                + '<div class="pf-secret-box"><div class="pf-secret-value" id="pfSecretValue"></div></div>'
                + (opts.hint ? '<p class="pf-hint">' + escapeHtml(opts.hint) + '</p>' : '')
                + '<p class="pf-error" id="pfSecretMsg" hidden></p>'
                + '</div>'
                + '<div class="pf-modal-foot">'
                + '<button type="button" class="pf-btn pf-btn-ghost" data-act="copy">📋 复制密钥</button>'
                + '<button type="button" class="pf-btn pf-btn-primary" data-act="ok">我已保存，关闭</button></div>';
            var m = createModal(html, { dismissable: false });
            m.modal.querySelector('#pfSecretValue').textContent = opts.secret || '';
            var msgEl = m.modal.querySelector('#pfSecretMsg');
            m.modal.addEventListener('click', function (e) {
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'copy') {
                    copyText(opts.secret || '').then(function () {
                        if (msgEl) { msgEl.hidden = false; msgEl.style.color = 'var(--success)'; msgEl.textContent = '已复制到剪贴板'; }
                    }).catch(function () {
                        if (msgEl) { msgEl.hidden = false; msgEl.style.color = 'var(--danger)'; msgEl.textContent = '复制失败，请手动选中复制'; }
                    });
                }
                if (act === 'ok') { m.close(); resolve(true); }
            });
        });
    }

    function toast(message, type) {
        injectStyle('pf-ui-style', UI_CSS);
        var wrap = document.querySelector('.pf-toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'pf-toast-wrap';
            document.body.appendChild(wrap);
        }
        var el = document.createElement('div');
        el.className = 'pf-toast' + (type ? ' pf-toast-' + type : '');
        el.textContent = String(message === undefined || message === null ? '' : message);
        wrap.appendChild(el);
        setTimeout(function () {
            el.classList.add('pf-out');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
        }, type === 'error' ? 5200 : 3200);
    }

    function copyText(text) {
        text = String(text === undefined || text === null ? '' : text);
        if (window.navigator.clipboard && window.isSecureContext) {
            return window.navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', 'readonly');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('copy failed'));
            } catch (e) { reject(e); }
        });
    }

    /* ==================================================================
     * 五、响应数据归一化（后端字段容错）
     * ================================================================== */

    function firstOf(obj, keys) {
        if (!obj) return undefined;
        for (var i = 0; i < keys.length; i++) {
            var v = obj[keys[i]];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return undefined;
    }

    function normalizeScopeList(scopes) {
        if (!scopes) return [];
        if (!Array.isArray(scopes)) {
            if (typeof scopes === 'string') {
                return scopes.split(/[\s,]+/).filter(Boolean).map(function (k) { return { key: k, name: k }; });
            }
            return [];
        }
        return scopes.map(function (s) {
            if (typeof s === 'string') return { key: s, name: s };
            return {
                key: s.key || s.scope || s.name || '',
                name: s.name || s.label || s.key || '',
                desc: s.desc || s.description || ''
            };
        }).filter(function (s) { return !!s.key; });
    }

    function normalizeClient(c) {
        c = c || {};
        var uris = firstOf(c, ['redirectUris', 'redirect_uris', 'redirectURI', 'uris']);
        if (typeof uris === 'string') uris = [uris];
        if (!Array.isArray(uris)) uris = [];
        var count = firstOf(c, ['userCount', 'usersCount', 'grantCount', 'grantedCount', 'authorizedCount', 'authorizedUsers', 'authorisedUsers']);
        if (count === undefined && Array.isArray(c.users)) count = c.users.length;
        return {
            id: firstOf(c, ['clientId', 'client_id', 'id']) || '',
            name: firstOf(c, ['name', 'appName']) || '(未命名应用)',
            description: firstOf(c, ['description', 'desc']) || '',
            homepage: firstOf(c, ['homepage', 'homePage', 'url']) || '',
            logo: firstOf(c, ['logo', 'logoUrl', 'icon']) || '',
            redirectUris: uris,
            scopes: normalizeScopeList(firstOf(c, ['scopes', 'scope'])),
            scopeRaw: typeof c.scope === 'string' ? c.scope : (Array.isArray(c.scopes) ? c.scopes.join(' ') : ''),
            status: firstOf(c, ['status', 'state']) || 'active',
            owner: firstOf(c, ['owner', 'ownerUsername', 'username']) || '',
            createdAt: firstOf(c, ['createdAt', 'created_at', 'created', 'createdTime']) || '',
            userCount: (typeof count === 'number') ? count : null
        };
    }

    function normalizeGrantUser(u) {
        u = u || {};
        return {
            username: firstOf(u, ['username', 'user', 'name']) || '',
            nickname: firstOf(u, ['nickname', 'nick']) || '',
            avatarUrl: firstOf(u, ['avatarUrl', 'avatar']) || '',
            bio: firstOf(u, ['bio', 'signature']) || '',
            xp: (typeof u.xp === 'number') ? u.xp : null,
            email: firstOf(u, ['email']) || '',
            createdAt: firstOf(u, ['createdAt', 'created_at']) || '',
            scopes: normalizeScopeList(firstOf(u, ['scopes', 'scope'])),
            grantedAt: firstOf(u, ['grantedAt', 'authorizedAt', 'createdAt', 'grantTime', 'time']) || '',
            banned: u.banned === true || u.projectBanned === true || u.isBanned === true,
            banReason: firstOf(u, ['banReason', 'reason']) || '',
            bannedAt: firstOf(u, ['bannedAt', 'banTime']) || '',
            globalBanned: u.globalBanned === true || u.siteBanned === true || u.isGlobalBanned === true
        };
    }

    function normalizeBanEntry(b) {
        b = b || {};
        return {
            username: firstOf(b, ['username', 'user']) || '',
            nickname: firstOf(b, ['nickname']) || '',
            reason: firstOf(b, ['reason', 'banReason']) || '',
            bannedAt: firstOf(b, ['bannedAt', 'banned_at', 'createdAt', 'time', 'bannedTime']) || '',
            bannedBy: firstOf(b, ['bannedBy', 'banned_by', 'operator', 'by']) || '',
            clientId: firstOf(b, ['clientId', 'client_id']) || ''
        };
    }

    var STATUS_MAP = {
        pending: '待审核',
        approved: '已批准',
        rejected: '已驳回',
        processing: '审核中'
    };

    function normalizeBanRequest(r) {
        r = r || {};
        var status = String(firstOf(r, ['status', 'state']) || 'pending').toLowerCase();
        return {
            id: firstOf(r, ['id', 'requestId', '_id', 'request_id']) || '',
            clientId: firstOf(r, ['clientId', 'client_id', 'appId']) || '',
            clientName: firstOf(r, ['clientName', 'client_name', 'appName', 'name']) || '',
            username: firstOf(r, ['username', 'targetUser', 'user']) || '',
            reason: firstOf(r, ['reason', 'banReason', 'content']) || '',
            status: status,
            statusText: STATUS_MAP[status] || status,
            note: firstOf(r, ['note', 'adminNote', 'reviewNote', 'review_note', 'remark', 'admin_remark']) || '',
            createdAt: firstOf(r, ['createdAt', 'submittedAt', 'created_at', 'time', 'timestamp']) || '',
            reviewedAt: firstOf(r, ['reviewedAt', 'reviewed_at', 'handledAt', 'updatedAt']) || '',
            reviewer: firstOf(r, ['reviewer', 'reviewedBy']) || '',
            applicant: firstOf(r, ['applicant', 'applicantUser']) || ''
        };
    }

    function pickArray(data, keys) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        for (var i = 0; i < keys.length; i++) {
            if (Array.isArray(data[keys[i]])) return data[keys[i]];
        }
        if (Array.isArray(data.data)) return data.data;
        return [];
    }

    async function loadScopes() {
        try {
            var data = await apiGet('/api/oauth/scopes');
            var list = pickArray(data, ['scopes', 'items', 'list']);
            var normalized = normalizeScopeList(list);
            if (normalized.length) {
                return normalized.map(function (s) {
                    if (!s.desc) {
                        var local = FALLBACK_SCOPES.filter(function (f) { return f.key === s.key; })[0];
                        if (local) { s.desc = local.desc; s.sensitive = local.sensitive; }
                    }
                    return s;
                });
            }
        } catch (e) { /* 使用内置回退列表 */ }
        return FALLBACK_SCOPES.slice();
    }

    /* ==================================================================
     * 六、导出
     * ================================================================== */

    window.PlatformUtil = {
        firstOf: firstOf,
        pickArray: pickArray,
        normalizeClient: normalizeClient,
        normalizeScopeList: normalizeScopeList,
        normalizeGrantUser: normalizeGrantUser,
        normalizeBanEntry: normalizeBanEntry,
        normalizeBanRequest: normalizeBanRequest,
        statusText: function (s) { return STATUS_MAP[String(s || '').toLowerCase()] || s || ''; },
        loadScopes: loadScopes,
        fallbackScopes: FALLBACK_SCOPES
    };

    window.PlatformUI = {
        renderNav: renderNav,
        requireLogin: requireLogin,
        toast: toast,
        alert: pfAlert,
        confirm: pfConfirm,
        prompt: pfPrompt,
        secret: pfSecret,
        copy: copyText,
        formatDate: formatDate,
        escapeHtml: escapeHtml
    };
})();
