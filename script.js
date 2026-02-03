(function () {
  'use strict';

  class GenesisApp {
    constructor() {
      this.state = {
        apiKey: localStorage.getItem('apiKey') || '',
        temperature: parseFloat(localStorage.getItem('temperature')) || 0.4,
        maxTokens: parseInt(localStorage.getItem('maxTokens')) || 512,
        messages: JSON.parse(localStorage.getItem('messages') || '[]')
      };

      this.ui = {
        openSettingsBtn: document.getElementById('openSettingsBtn'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        settingsModal: document.getElementById('settingsModal'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        temperatureInput: document.getElementById('temperatureInput'),
        temperatureOut: document.getElementById('temperatureOut'),
        maxTokensInput: document.getElementById('maxTokensInput'),
        maxTokensOut: document.getElementById('maxTokensOut'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        messageList: document.getElementById('messageList'),
        composerForm: document.getElementById('composerForm'),
        messageInput: document.getElementById('messageInput'),
        toastRegion: document.getElementById('toastRegion')
      };

      this.init();
    }

    init() {
      this.bindEvents();
      this.loadSettingsToForm();
      this.renderMessages();
    }

    bindEvents() {
      this.ui.openSettingsBtn.addEventListener('click', () => this.openSettings());
      this.ui.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
      this.ui.settingsModal.addEventListener('click', (e) => {
        if (e.target === this.ui.settingsModal || e.target.classList.contains('modal-backdrop')) this.closeSettings();
      });
      this.ui.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
      this.ui.composerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSend();
      });

      this.ui.temperatureInput.addEventListener('input', () => {
        this.ui.temperatureOut.textContent = parseFloat(this.ui.temperatureInput.value).toFixed(2);
      });
      this.ui.maxTokensInput.addEventListener('input', () => {
        this.ui.maxTokensOut.textContent = this.ui.maxTokensInput.value;
      });
    }

    openSettings() {
      this.ui.settingsModal.style.display = 'block';
    }

    closeSettings() {
      this.ui.settingsModal.style.display = 'none';
    }

    loadSettingsToForm() {
      this.ui.apiKeyInput.value = this.state.apiKey;
      this.ui.temperatureInput.value = this.state.temperature;
      this.ui.temperatureOut.textContent = this.state.temperature.toFixed(2);
      this.ui.maxTokensInput.value = this.state.maxTokens;
      this.ui.maxTokensOut.textContent = this.state.maxTokens;
    }

    saveSettings() {
      this.state.apiKey = this.ui.apiKeyInput.value.trim();
      this.state.temperature = parseFloat(this.ui.temperatureInput.value);
      this.state.maxTokens = parseInt(this.ui.maxTokensInput.value);

      localStorage.setItem('apiKey', this.state.apiKey);
      localStorage.setItem('temperature', this.state.temperature);
      localStorage.setItem('maxTokens', this.state.maxTokens);

      this.closeSettings();
      this.showToast('Settings saved', 'Your API key and generation settings were saved locally.');
    }

    showToast(title, body) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
      this.ui.toastRegion.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    addMessage(role, text) {
      const msg = { role, text, ts: new Date().toISOString() };
      this.state.messages.push(msg);
      localStorage.setItem('messages', JSON.stringify(this.state.messages));
      this.renderMessages();
    }

    renderMessages() {
      this.ui.messageList.innerHTML = '';
      this.state.messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `<div class="role">${msg.role === 'user' ? 'You' : 'AI GENESIS'}</div><div class="text">${msg.text}</div>`;
        this.ui.messageList.appendChild(div);
      });
      this.ui.messageList.scrollTop = this.ui.messageList.scrollHeight;
    }

    async handleSend() {
      const text = this.ui.messageInput.value.trim();
      if (!text) return;

      if (!this.state.apiKey) {
        this.showToast('API Key Required', 'Open Settings and add your Google API key.');
        this.openSettings();
        return;
      }

      this.ui.messageInput.value = '';
      this.addMessage('user', text);

      try {
        const res = await this.callGemini(text);
        this.addMessage('assistant', res);
      } catch (e) {
        this.showToast('Error', e.message);
      }
    }

    async callGemini(userMessage) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(this.state.apiKey)}`;
      const payload = {
        contents: [
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        generationConfig: {
          temperature: this.state.temperature,
          maxOutputTokens: this.state.maxTokens
        }
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message || `Gemini error ${resp.status}`);
      }

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text;
    }
  }

  document.addEventListener('DOMContentLoaded', () => new GenesisApp());
})();
