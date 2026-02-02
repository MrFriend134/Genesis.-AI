(function () {
  'use strict';

  class Ids {
    static uid(prefix) {
      const rand = Math.random().toString(16).slice(2);
      const time = Date.now().toString(16);
      return `${prefix}_${time}_${rand}`;
    }

    static nowIso() {
      return new Date().toISOString();
    }

    static nowTimeString() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    static clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    static safeJsonParse(text, fallback) {
      try {
        return JSON.parse(text);
      } catch {
        return fallback;
      }
    }

    static debounce(fn, waitMs) {
      let t = null;
      return function (...args) {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => fn.apply(this, args), waitMs);
      };
    }
  }

  class Storage {
    constructor(prefix) {
      this.prefix = prefix;
    }

    key(k) {
      return `${this.prefix}.${k}`;
    }

    getString(k, fallback = '') {
      const v = window.localStorage.getItem(this.key(k));
      if (v === null || v === undefined) return fallback;
      return String(v);
    }

    setString(k, value) {
      window.localStorage.setItem(this.key(k), String(value));
    }

    getJson(k, fallback) {
      const raw = window.localStorage.getItem(this.key(k));
      if (!raw) return fallback;
      return Ids.safeJsonParse(raw, fallback);
    }

    setJson(k, obj) {
      window.localStorage.setItem(this.key(k), JSON.stringify(obj));
    }

    remove(k) {
      window.localStorage.removeItem(this.key(k));
    }
  }

  class Markdown {
    static escapeHtml(text) {
      return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    static format(text) {
      const src = String(text ?? '');
      const parts = src.split('```');
      const out = [];

      for (let i = 0; i < parts.length; i++) {
        const isCode = i % 2 === 1;
        if (isCode) {
          const rawCode = parts[i];
          const trimmed = rawCode.replace(/^\n+/, '').replace(/\n+$/, '');
          const safe = Markdown.escapeHtml(trimmed);
          out.push(`<pre><code>${safe}</code></pre>`);
          continue;
        }

        const normal = parts[i];
        out.push(Markdown.formatInlineAndBlocks(normal));
      }

      return out.join('');
    }

    static formatInlineAndBlocks(text) {
      const raw = String(text ?? '');
      const lines = raw.split(/\r?\n/);

      let html = '';
      let listMode = null;
      let listBuf = [];

      const flushList = () => {
        if (!listMode || listBuf.length === 0) return;
        const tag = listMode === 'ol' ? 'ol' : 'ul';
        const items = listBuf
          .map((li) => `<li>${Markdown.formatInline(li)}</li>`)
          .join('');
        html += `<${tag}>${items}</${tag}>`;
        listMode = null;
        listBuf = [];
      };

      const pushParagraph = (line) => {
        const t = line.trim();
        if (!t) return;
        html += `<p>${Markdown.formatInline(t)}</p>`;
      };

      for (const line of lines) {
        const trimmed = line.trimEnd();

        const ulMatch = trimmed.match(/^\s*[-*]\s+(.+)$/);
        const olMatch = trimmed.match(/^\s*(\d+)\.\s+(.+)$/);

        if (ulMatch) {
          if (listMode && listMode !== 'ul') flushList();
          listMode = 'ul';
          listBuf.push(ulMatch[1]);
          continue;
        }

        if (olMatch) {
          if (listMode && listMode !== 'ol') flushList();
          listMode = 'ol';
          listBuf.push(olMatch[2]);
          continue;
        }

        if (!trimmed.trim()) {
          flushList();
          continue;
        }

        flushList();
        pushParagraph(trimmed);
      }

      flushList();
      return html;
    }

    static formatInline(text) {
      let safe = Markdown.escapeHtml(String(text ?? ''));

      safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      safe = safe.replace(/`([^`]+?)`/g, (m, g1) => {
        const inner = Markdown.escapeHtml(g1);
        return `<code>${inner}</code>`;
      });

      safe = safe.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

      return safe;
    }
  }

  class Toasts {
    constructor(regionEl) {
      this.regionEl = regionEl;
    }

    show({ title, body, tone = 'info', timeoutMs = 4200 }) {
      const toastEl = document.createElement('div');
      toastEl.className = 'toast';

      const dot = document.createElement('div');
      dot.className = 'toast-dot';
      if (tone === 'warn') dot.setAttribute('data-tone', 'warn');
      if (tone === 'ok') dot.setAttribute('data-tone', 'ok');

      const main = document.createElement('div');
      main.className = 'toast-main';

      const t = document.createElement('div');
      t.className = 'toast-title';
      t.textContent = title;

      const b = document.createElement('div');
      b.className = 'toast-body';
      b.textContent = body;

      const close = document.createElement('button');
      close.className = 'toast-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';

      close.addEventListener('click', () => toastEl.remove());

      main.appendChild(t);
      main.appendChild(b);

      toastEl.appendChild(dot);
      toastEl.appendChild(main);
      toastEl.appendChild(close);

      this.regionEl.appendChild(toastEl);

      if (timeoutMs > 0) {
        window.setTimeout(() => {
          toastEl.remove();
        }, timeoutMs);
      }
    }
  }

  class GeminiService {
    constructor({ getApiKey, getSettings, onDiagnosticError }) {
      this.getApiKey = getApiKey;
      this.getSettings = getSettings;
      this.onDiagnosticError = onDiagnosticError;
      this.model = 'gemini-1.5-flash';
      this.base = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    buildUrl() {
      const apiKey = this.getApiKey();
      const encoded = encodeURIComponent(apiKey);
      return `${this.base}/${this.model}:generateContent?key=${encoded}`;
    }

    buildSystemInstruction() {
      const policy = [
        'You are AI GENESIS, an assistant operating inside a secure command dashboard.',
        'Language policy: Respond strictly in English. Do not use any other language.',
        'If the user requests non-English output, refuse and continue in English.',
        'Be concise but technically precise. Prefer structured output when appropriate.',
        'If you do not know, say you do not know. Do not fabricate APIs or facts.'
      ].join('\n');

      return {
        parts: [{ text: policy }]
      };
    }

    toGeminiContents(messages) {
      const mapped = [];
      for (const m of messages) {
        if (!m || !m.text) continue;
        const role = m.role === 'assistant' ? 'model' : 'user';
        mapped.push({ role, parts: [{ text: String(m.text) }] });
      }
      return mapped;
    }

    async generate({ memoryMessages, settingsOverride }) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        const err = new Error('Missing API key');
        err.status = 401;
        throw err;
      }

      const settings = settingsOverride || this.getSettings();
      const temperature = Ids.clamp(Number(settings.temperature ?? 0.4), 0, 1);
      const maxOutputTokens = Ids.clamp(Number(settings.maxTokens ?? 512), 1, 2048);

      const url = this.buildUrl();
      const payload = {
        systemInstruction: this.buildSystemInstruction(),
        contents: this.toGeminiContents(memoryMessages),
        generationConfig: {
          temperature,
          maxOutputTokens
        }
      };

      const started = performance.now();
      let res;
      let raw;

      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        raw = await res.text();
      } catch (e) {
        const err = new Error('Network error while contacting Gemini. Check your connection.');
        err.cause = e;
        err.status = 0;
        this.onDiagnosticError?.(err);
        throw err;
      }

      const elapsedMs = Math.round(performance.now() - started);

      if (!res.ok) {
        const parsed = Ids.safeJsonParse(raw, null);
        const messageFromServer = parsed?.error?.message ? String(parsed.error.message) : '';
        const err = new Error(messageFromServer || `Gemini request failed (HTTP ${res.status}).`);
        err.status = res.status;
        err.details = parsed;
        err.elapsedMs = elapsedMs;
        this.onDiagnosticError?.(err);
        throw err;
      }

      const json = Ids.safeJsonParse(raw, null);
      if (!json) {
        const err = new Error('Gemini returned an unreadable response.');
        err.status = 500;
        err.elapsedMs = elapsedMs;
        this.onDiagnosticError?.(err);
        throw err;
      }

      const text =
        json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
        '';

      return {
        text,
        elapsedMs,
        raw: json
      };
    }

    async testKey() {
      const settings = this.getSettings();
      const probeSettings = {
        ...settings,
        temperature: 0,
        maxTokens: 16
      };

      const res = await this.generate({
        memoryMessages: [{ role: 'user', text: 'Reply with exactly: OK' }],
        settingsOverride: probeSettings
      });

      return res;
    }
  }

  class SessionStore {
    constructor(storage) {
      this.storage = storage;
      this.keySessions = 'sessions';
      this.keyActive = 'activeSessionId';
    }

    loadAll() {
      const sessions = this.storage.getJson(this.keySessions, []);
      if (!Array.isArray(sessions)) return [];
      return sessions;
    }

    saveAll(sessions) {
      this.storage.setJson(this.keySessions, sessions);
    }

    getActiveId() {
      return this.storage.getString(this.keyActive, '');
    }

    setActiveId(id) {
      this.storage.setString(this.keyActive, id);
    }

    ensureShape(s) {
      const now = Ids.nowIso();
      const id = String(s?.id || Ids.uid('sess'));
      const title = String(s?.title || 'Session');
      const createdAt = String(s?.createdAt || now);
      const updatedAt = String(s?.updatedAt || now);
      const messages = Array.isArray(s?.messages) ? s.messages : [];

      return { id, title, createdAt, updatedAt, messages };
    }

    createNewSession(title) {
      const now = Ids.nowIso();
      return {
        id: Ids.uid('sess'),
        title: title || 'New Session',
        createdAt: now,
        updatedAt: now,
        messages: []
      };
    }

    upsertSession(session) {
      const all = this.loadAll();
      const shaped = this.ensureShape(session);
      const idx = all.findIndex((s) => s.id === shaped.id);
      if (idx >= 0) all[idx] = shaped;
      else all.unshift(shaped);
      this.saveAll(all);
      return shaped;
    }

    deleteAllSessions() {
      this.saveAll([]);
      this.setActiveId('');
    }

    deleteOne(id) {
      const all = this.loadAll().filter((s) => s.id !== id);
      this.saveAll(all);
      if (this.getActiveId() === id) {
        this.setActiveId(all[0]?.id || '');
      }
      return all;
    }

    getById(id) {
      const all = this.loadAll();
      const found = all.find((s) => s.id === id);
      return found ? this.ensureShape(found) : null;
    }

    rename(id, newTitle) {
      const sess = this.getById(id);
      if (!sess) return null;
      sess.title = String(newTitle || 'Session').slice(0, 80);
      sess.updatedAt = Ids.nowIso();
      return this.upsertSession(sess);
    }

    addMessage(sessionId, message) {
      const sess = this.getById(sessionId);
      if (!sess) return null;
      const now = Ids.nowIso();
      const shaped = {
        id: message?.id || Ids.uid('msg'),
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        text: String(message?.text || ''),
        ts: message?.ts || now
      };
      sess.messages.push(shaped);
      sess.updatedAt = now;
      return this.upsertSession(sess);
    }
  }

  class GenesisApp {
    constructor() {
      this.storage = new Storage('genesis');
      this.sessions = new SessionStore(this.storage);
      this.toasts = new Toasts(document.getElementById('toastRegion'));

      this.state = {
        settings: {
          apiKey: this.storage.getString('apiKey', ''),
          temperature: Number(this.storage.getJson('settings', { temperature: 0.4 }).temperature ?? 0.4),
          maxTokens: Number(this.storage.getJson('settings', { maxTokens: 512 }).maxTokens ?? 512)
        },
        activeSessionId: this.sessions.getActiveId(),
        sidebarCollapsed: false,
        sidebarMobileHidden: true,
        lastError: 'none',
        lastLatencyMs: null
      };

      this.ui = this.bindUi();

      this.gemini = new GeminiService({
        getApiKey: () => this.state.settings.apiKey,
        getSettings: () => this.state.settings,
        onDiagnosticError: (err) => {
          const msg = err?.message ? String(err.message) : 'unknown';
          this.state.lastError = msg.slice(0, 120);
          this.renderDiagnostics();
        }
      });

      this.clockTimer = null;

      this.init();
    }

    bindUi() {
      return {
        app: document.getElementById('app'),
        bootOverlay: document.getElementById('bootOverlay'),
        bootOpenSettings: document.getElementById('bootOpenSettings'),
        sidebar: document.getElementById('sidebar'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sessionList: document.getElementById('sessionList'),
        sessionFilter: document.getElementById('sessionFilter'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        newSessionBtn: document.getElementById('newSessionBtn'),
        renameSessionBtn: document.getElementById('renameSessionBtn'),
        exportSessionBtn: document.getElementById('exportSessionBtn'),

        diagStatus: document.getElementById('diagStatus'),
        diagClock: document.getElementById('diagClock'),
        diagMemory: document.getElementById('diagMemory'),
        diagLatency: document.getElementById('diagLatency'),

        activeSessionTitle: document.getElementById('activeSessionTitle'),
        activeSessionId: document.getElementById('activeSessionId'),
        activeSessionSub: document.getElementById('activeSessionSub'),

        chatBody: document.getElementById('chatBody'),
        chatEmpty: document.getElementById('chatEmpty'),
        messageList: document.getElementById('messageList'),
        typingIndicator: document.getElementById('typingIndicator'),

        composerForm: document.getElementById('composerForm'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        apiKeyHint: document.getElementById('apiKeyHint'),

        settingsModal: document.getElementById('settingsModal'),
        openSettingsBtn: document.getElementById('openSettingsBtn'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        apiKeyStatus: document.getElementById('apiKeyStatus'),
        revealKeyBtn: document.getElementById('revealKeyBtn'),
        testKeyBtn: document.getElementById('testKeyBtn'),
        temperatureInput: document.getElementById('temperatureInput'),
        temperatureOut: document.getElementById('temperatureOut'),
        maxTokensInput: document.getElementById('maxTokensInput'),
        maxTokensOut: document.getElementById('maxTokensOut'),
        diagModel: document.getElementById('diagModel'),
        diagStorage: document.getElementById('diagStorage'),
        diagSessionsCount: document.getElementById('diagSessionsCount'),
        diagLastError: document.getElementById('diagLastError'),
        wipeApiKeyBtn: document.getElementById('wipeApiKeyBtn'),
        wipeSessionsBtn: document.getElementById('wipeSessionsBtn')
      };
    }

    init() {
      this.ensureAtLeastOneSession();
      this.attachEvents();
      this.syncSettingsToUi();
      this.renderAll();
      this.startClock();

      window.setTimeout(() => {
        this.hideBootOverlayIfAllowed();
      }, 600);

      window.setTimeout(() => {
        this.hideBootOverlayIfAllowed();
      }, 1500);
    }

    hideBootOverlayIfAllowed() {
      if (!this.ui.bootOverlay) return;
      this.ui.bootOverlay.setAttribute('data-hide', 'true');
      this.ui.bootOverlay.setAttribute('aria-hidden', 'true');
      this.ui.app.setAttribute('data-app-state', 'ready');
    }

    attachEvents() {
      this.ui.sidebarToggle.addEventListener('click', () => {
        this.toggleSidebar();
      });

      this.ui.bootOpenSettings.addEventListener('click', () => this.openSettings());
      this.ui.openSettingsBtn.addEventListener('click', () => this.openSettings());
      this.ui.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
      this.ui.settingsModal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close') === 'true') this.closeSettings();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const open = this.ui.settingsModal.getAttribute('data-open') === 'true';
          if (open) this.closeSettings();
        }
      });

      this.ui.sessionFilter.addEventListener(
        'input',
        Ids.debounce(() => this.renderSessionList(), 120)
      );

      this.ui.clearAllBtn.addEventListener('click', () => this.clearAllSessions());
      this.ui.newSessionBtn.addEventListener('click', () => this.createAndActivateSession());
      this.ui.renameSessionBtn.addEventListener('click', () => this.renameActiveSession());
      this.ui.exportSessionBtn.addEventListener('click', () => this.exportActiveSession());

      this.ui.composerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSend();
      });

      this.ui.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });

      this.ui.messageInput.addEventListener('input', () => {
        this.autoResizeTextarea();
      });

      this.ui.temperatureInput.addEventListener('input', () => {
        const v = Number(this.ui.temperatureInput.value);
        this.ui.temperatureOut.textContent = v.toFixed(2);
      });

      this.ui.maxTokensInput.addEventListener('input', () => {
        const v = Number(this.ui.maxTokensInput.value);
        this.ui.maxTokensOut.textContent = String(v);
      });

      this.ui.revealKeyBtn.addEventListener('click', () => {
        const t = this.ui.apiKeyInput.type;
        this.ui.apiKeyInput.type = t === 'password' ? 'text' : 'password';
        this.ui.revealKeyBtn.textContent = t === 'password' ? 'Hide' : 'Reveal';
      });

      this.ui.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
      this.ui.wipeApiKeyBtn.addEventListener('click', () => this.wipeApiKey());
      this.ui.wipeSessionsBtn.addEventListener('click', () => this.clearAllSessions());

      this.ui.testKeyBtn.addEventListener('click', async () => {
        await this.testApiKey();
      });

      window.addEventListener('resize', () => {
        this.applyResponsiveSidebarRules();
      });

      this.applyResponsiveSidebarRules();
    }

    startClock() {
      if (this.clockTimer) window.clearInterval(this.clockTimer);
      this.ui.diagClock.textContent = Ids.nowTimeString();
      this.clockTimer = window.setInterval(() => {
        this.ui.diagClock.textContent = Ids.nowTimeString();
      }, 1000);
    }

    applyResponsiveSidebarRules() {
      const isMobile = window.matchMedia('(max-width: 820px)').matches;
      if (isMobile) {
        this.state.sidebarMobileHidden = true;
        this.ui.sidebar.setAttribute('data-mobile-hidden', 'true');
      } else {
        this.state.sidebarMobileHidden = false;
        this.ui.sidebar.removeAttribute('data-mobile-hidden');
      }
    }

    toggleSidebar() {
      const isMobile = window.matchMedia('(max-width: 820px)').matches;
      if (isMobile) {
        this.state.sidebarMobileHidden = !this.state.sidebarMobileHidden;
        this.ui.sidebar.setAttribute('data-mobile-hidden', this.state.sidebarMobileHidden ? 'true' : 'false');
        this.ui.sidebarToggle.setAttribute('aria-expanded', this.state.sidebarMobileHidden ? 'false' : 'true');
        return;
      }

      this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
      this.ui.sidebar.setAttribute('data-collapsed', this.state.sidebarCollapsed ? 'true' : 'false');
      this.ui.sidebarToggle.setAttribute('aria-expanded', this.state.sidebarCollapsed ? 'false' : 'true');
    }

    openSettings() {
      this.ui.settingsModal.setAttribute('data-open', 'true');
      this.ui.settingsModal.setAttribute('aria-hidden', 'false');
      this.syncSettingsToUi();
      window.setTimeout(() => this.ui.apiKeyInput.focus(), 0);
    }

    closeSettings() {
      this.ui.settingsModal.removeAttribute('data-open');
      this.ui.settingsModal.setAttribute('aria-hidden', 'true');
      this.ui.messageInput.focus();
    }

    syncSettingsToUi() {
      const s = this.state.settings;
      this.ui.apiKeyInput.value = s.apiKey || '';

      const temp = Ids.clamp(Number(s.temperature ?? 0.4), 0, 1);
      const maxTok = Ids.clamp(Number(s.maxTokens ?? 512), 64, 2048);

      this.ui.temperatureInput.value = String(temp);
      this.ui.temperatureOut.textContent = temp.toFixed(2);
      this.ui.maxTokensInput.value = String(maxTok);
      this.ui.maxTokensOut.textContent = String(maxTok);

      const hasKey = !!(s.apiKey && s.apiKey.trim());
      this.ui.apiKeyStatus.textContent = hasKey ? 'Set (stored locally)' : 'Not set';
      this.ui.apiKeyHint.style.display = hasKey ? 'none' : 'flex';

      this.renderDiagnostics();
    }

    saveSettings() {
      const apiKey = String(this.ui.apiKeyInput.value || '').trim();
      const temperature = Ids.clamp(Number(this.ui.temperatureInput.value), 0, 1);
      const maxTokens = Ids.clamp(Number(this.ui.maxTokensInput.value), 64, 2048);

      this.state.settings.apiKey = apiKey;
      this.state.settings.temperature = temperature;
      this.state.settings.maxTokens = maxTokens;

      this.storage.setString('apiKey', apiKey);
      this.storage.setJson('settings', { temperature, maxTokens });

      this.syncSettingsToUi();
      this.closeSettings();

      if (apiKey) {
        this.toasts.show({
          title: 'Settings Saved',
          body: 'API key and generation controls have been saved locally.',
          tone: 'ok'
        });
      } else {
        this.toasts.show({
          title: 'Settings Saved',
          body: 'Generation controls saved. API key is not set.',
          tone: 'warn'
        });
      }
    }

    wipeApiKey() {
      const ok = window.confirm('Wipe the stored API key from this browser?');
      if (!ok) return;
      this.state.settings.apiKey = '';
      this.storage.remove('apiKey');
      this.syncSettingsToUi();
      this.toasts.show({ title: 'API Key Removed', body: 'The stored key has been wiped.', tone: 'warn' });
    }

    clearAllSessions() {
      const ok = window.confirm('This will delete ALL sessions stored in this browser. Continue?');
      if (!ok) return;
      this.sessions.deleteAllSessions();
      this.ensureAtLeastOneSession();
      this.renderAll();
      this.toasts.show({ title: 'Sessions Cleared', body: 'All local chat sessions were removed.', tone: 'warn' });
    }

    ensureAtLeastOneSession() {
      let activeId = this.sessions.getActiveId();
      const all = this.sessions.loadAll().map((s) => this.sessions.ensureShape(s));

      if (all.length === 0) {
        const created = this.sessions.createNewSession('Operator Session');
        this.sessions.saveAll([created]);
        this.sessions.setActiveId(created.id);
        this.state.activeSessionId = created.id;
        return;
      }

      if (!activeId || !all.some((s) => s.id === activeId)) {
        this.sessions.setActiveId(all[0].id);
        this.state.activeSessionId = all[0].id;
      } else {
        this.state.activeSessionId = activeId;
      }
    }

    createAndActivateSession() {
      const created = this.sessions.createNewSession('New Session');
      this.sessions.upsertSession(created);
      this.sessions.setActiveId(created.id);
      this.state.activeSessionId = created.id;
      this.renderAll();
      this.toasts.show({ title: 'New Session', body: 'A new session has been created and activated.', tone: 'ok' });
    }

    setActiveSession(id) {
      this.sessions.setActiveId(id);
      this.state.activeSessionId = id;
      this.renderAll();

      const isMobile = window.matchMedia('(max-width: 820px)').matches;
      if (isMobile) {
        this.state.sidebarMobileHidden = true;
        this.ui.sidebar.setAttribute('data-mobile-hidden', 'true');
      }
    }

    renameActiveSession() {
      const active = this.getActiveSession();
      if (!active) return;
      const name = window.prompt('Rename session:', active.title);
      if (!name) return;
      this.sessions.rename(active.id, name);
      this.renderAll();
      this.toasts.show({ title: 'Renamed', body: 'Session title updated.', tone: 'ok' });
    }

    exportActiveSession() {
      const active = this.getActiveSession();
      if (!active) return;

      const payload = {
        exportedAt: Ids.nowIso(),
        app: 'AI GENESIS',
        session: active
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-genesis_${active.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      this.toasts.show({ title: 'Exported', body: 'Session exported as JSON.', tone: 'ok' });
    }

    getActiveSession() {
      const id = this.state.activeSessionId;
      if (!id) return null;
      return this.sessions.getById(id);
    }

    getRollingMemory(session, limit = 15) {
      const msgs = Array.isArray(session?.messages) ? session.messages : [];
      const slice = msgs.slice(Math.max(0, msgs.length - limit));
      return slice.map((m) => ({ role: m.role, text: m.text }));
    }

    renderAll() {
      this.renderSessionList();
      this.renderActiveSession();
      this.renderDiagnostics();
      this.autoResizeTextarea();
    }

    renderDiagnostics() {
      const hasKey = !!(this.state.settings.apiKey && this.state.settings.apiKey.trim());
      const status = hasKey ? 'READY' : 'NEEDS KEY';

      this.ui.diagStatus.textContent = status;
      this.ui.diagStatus.setAttribute('data-state', hasKey ? 'ready' : 'needs_key');

      const active = this.getActiveSession();
      const memCount = active ? this.getRollingMemory(active, 15).length : 0;
      this.ui.diagMemory.textContent = `${memCount} / 15`;

      if (this.state.lastLatencyMs === null || this.state.lastLatencyMs === undefined) {
        this.ui.diagLatency.textContent = '-- ms';
      } else {
        this.ui.diagLatency.textContent = `${this.state.lastLatencyMs} ms`;
      }

      const all = this.sessions.loadAll();
      this.ui.diagSessionsCount.textContent = String(all.length);
      this.ui.diagLastError.textContent = this.state.lastError || 'none';
    }

    renderSessionList() {
      const all = this.sessions.loadAll().map((s) => this.sessions.ensureShape(s));
      const filter = String(this.ui.sessionFilter.value || '').trim().toLowerCase();

      const filtered = !filter
        ? all
        : all.filter((s) => {
            const t = (s.title || '').toLowerCase();
            const id = (s.id || '').toLowerCase();
            return t.includes(filter) || id.includes(filter);
          });

      this.ui.sessionList.innerHTML = '';

      for (const s of filtered) {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.setAttribute('data-active', s.id === this.state.activeSessionId ? 'true' : 'false');

        const dot = document.createElement('div');
        dot.className = 'session-dot';

        const main = document.createElement('div');
        main.className = 'session-main';

        const title = document.createElement('div');
        title.className = 'session-title';
        title.textContent = s.title;

        const sub = document.createElement('div');
        sub.className = 'session-sub';
        const msgCount = Array.isArray(s.messages) ? s.messages.length : 0;
        sub.textContent = `${msgCount} messages · Updated ${new Date(s.updatedAt).toLocaleString()}`;

        main.appendChild(title);
        main.appendChild(sub);

        item.appendChild(dot);
        item.appendChild(main);

        item.addEventListener('click', () => this.setActiveSession(s.id));

        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const ok = window.confirm(`Delete session "${s.title}"?`);
          if (!ok) return;
          this.sessions.deleteOne(s.id);
          this.ensureAtLeastOneSession();
          this.renderAll();
          this.toasts.show({ title: 'Deleted', body: 'Session removed.', tone: 'warn' });
        });

        this.ui.sessionList.appendChild(item);
      }

      this.ui.diagSessionsCount.textContent = String(all.length);
    }

    renderActiveSession() {
      const active = this.getActiveSession();
      if (!active) {
        this.ui.activeSessionTitle.textContent = 'No Session';
        this.ui.activeSessionId.textContent = '--';
        this.ui.messageList.innerHTML = '';
        this.ui.chatEmpty.style.display = 'block';
        return;
      }

      this.ui.activeSessionTitle.textContent = active.title;
      this.ui.activeSessionId.textContent = active.id;

      this.ui.messageList.innerHTML = '';

      const messages = Array.isArray(active.messages) ? active.messages : [];
      if (messages.length === 0) {
        this.ui.chatEmpty.style.display = 'block';
      } else {
        this.ui.chatEmpty.style.display = 'none';
      }

      for (const m of messages) {
        this.ui.messageList.appendChild(this.renderMessage(m));
      }

      this.scrollChatToBottom();
      this.renderDiagnostics();
    }

    renderMessage(m) {
      const wrap = document.createElement('article');
      wrap.className = 'message';
      wrap.setAttribute('data-role', m.role === 'assistant' ? 'assistant' : 'user');

      const head = document.createElement('header');
      head.className = 'message-head';

      const who = document.createElement('div');
      who.className = 'message-who';

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.setAttribute('data-kind', m.role === 'assistant' ? 'assistant' : 'user');
      badge.textContent = m.role === 'assistant' ? 'GENESIS' : 'OPERATOR';

      const stamp = document.createElement('div');
      stamp.className = 'timestamp';
      stamp.textContent = new Date(m.ts).toLocaleTimeString();

      who.appendChild(badge);

      head.appendChild(who);
      head.appendChild(stamp);

      const body = document.createElement('div');
      body.className = 'message-body';

      if (m.role === 'assistant') {
        body.innerHTML = Markdown.format(m.text);
      } else {
        body.textContent = m.text;
      }

      wrap.appendChild(head);
      wrap.appendChild(body);

      return wrap;
    }

    setTyping(show) {
      if (show) {
        this.ui.chatBody.setAttribute('aria-busy', 'true');
        this.ui.typingIndicator.setAttribute('data-show', 'true');
        this.ui.typingIndicator.setAttribute('aria-hidden', 'false');
      } else {
        this.ui.chatBody.setAttribute('aria-busy', 'false');
        this.ui.typingIndicator.removeAttribute('data-show');
        this.ui.typingIndicator.setAttribute('aria-hidden', 'true');
      }
    }

    scrollChatToBottom() {
      const el = this.ui.chatBody;
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }

    autoResizeTextarea() {
      const ta = this.ui.messageInput;
      ta.style.height = '0px';
      const next = Math.min(180, Math.max(46, ta.scrollHeight));
      ta.style.height = `${next}px`;
    }

    async handleSend() {
      const active = this.getActiveSession();
      if (!active) return;

      const text = String(this.ui.messageInput.value || '').trim();
      if (!text) return;

      if (!this.state.settings.apiKey || !this.state.settings.apiKey.trim()) {
        this.toasts.show({
          title: 'API Key Required',
          body: 'Open Settings and add your Google API key to use Gemini 1.5 Flash.',
          tone: 'warn'
        });
        window.alert('Google API Key is required. Open Settings and paste your key.');
        this.openSettings();
        return;
      }

      this.ui.messageInput.value = '';
      this.autoResizeTextarea();

      this.sessions.addMessage(active.id, { role: 'user', text });
      this.renderActiveSession();

      await this.runAssistantTurn();
    }

    async runAssistantTurn() {
      const active = this.getActiveSession();
      if (!active) return;

      const memory = this.getRollingMemory(active, 15);

      this.setTyping(true);
      this.scrollChatToBottom();

      try {
        const res = await this.gemini.generate({ memoryMessages: memory });
        this.state.lastLatencyMs = res.elapsedMs;
        this.state.lastError = 'none';

        const reply = String(res.text || '').trim();
        const safeReply = reply || 'I did not receive any text content from the model.';

        this.sessions.addMessage(active.id, { role: 'assistant', text: safeReply });
        this.renderActiveSession();
        this.toasts.show({ title: 'Response Received', body: `Latency: ${res.elapsedMs} ms`, tone: 'ok', timeoutMs: 2600 });
      } catch (err) {
        const status = Number(err?.status ?? 0);
        const msg = err?.message ? String(err.message) : 'Unknown error';

        this.state.lastError = msg.slice(0, 120);

        if (status === 401 || status === 403) {
          this.toasts.show({
            title: 'Authentication Failed',
            body: 'Your API key is invalid or unauthorized. Update it in Settings.',
            tone: 'warn'
          });
          window.alert('Gemini authentication failed (401/403). Check your API key in Settings.');
          this.openSettings();
        } else if (status === 429) {
          this.toasts.show({
            title: 'Rate Limited',
            body: 'Too many requests. Wait a moment and try again.',
            tone: 'warn'
          });
          window.alert('Rate limit reached (429). Please wait and retry.');
        } else if (status >= 500) {
          this.toasts.show({
            title: 'Gemini Service Error',
            body: 'The service responded with an error. Try again shortly.',
            tone: 'warn'
          });
          window.alert(`Gemini service error (HTTP ${status}). Please retry.`);
        } else {
          this.toasts.show({
            title: 'Request Failed',
            body: msg,
            tone: 'warn'
          });
          window.alert(`Request failed: ${msg}`);
        }

        this.renderDiagnostics();
      } finally {
        this.setTyping(false);
      }
    }

    async testApiKey() {
      const apiKey = String(this.ui.apiKeyInput.value || '').trim();
      if (!apiKey) {
        this.toasts.show({ title: 'Missing Key', body: 'Enter an API key first.', tone: 'warn' });
        return;
      }

      const previous = this.state.settings.apiKey;
      this.state.settings.apiKey = apiKey;

      try {
        this.toasts.show({ title: 'Testing Key', body: 'Contacting Gemini 1.5 Flash...', tone: 'info', timeoutMs: 1800 });
        const res = await this.gemini.testKey();
        const okText = String(res.text || '').trim();

        this.toasts.show({
          title: 'Key Test Succeeded',
          body: okText ? `Model replied: ${okText}` : 'Model responded successfully.',
          tone: 'ok'
        });
      } catch (e) {
        const status = Number(e?.status ?? 0);
        if (status === 401 || status === 403) {
          this.toasts.show({ title: 'Key Rejected', body: 'Unauthorized (401/403).', tone: 'warn' });
        } else if (status === 429) {
          this.toasts.show({ title: 'Rate Limited', body: '429 rate limit during test.', tone: 'warn' });
        } else {
          const msg = e?.message ? String(e.message) : 'Unknown error';
          this.toasts.show({ title: 'Key Test Failed', body: msg, tone: 'warn' });
        }
      } finally {
        this.state.settings.apiKey = previous;
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    new GenesisApp();
  });
})();
