(function() {
  'use strict';

  const MAX_LOG = 50000;
  const MAX_ERRORS = 1000;
  const MAX_TOOL_CALLS = 500;

  let _enabled = true;
  let _sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let _startTime = Date.now();

  let _log = [];
  let _errors = [];
  let _toolCalls = [];
  let _wsMessages = [];
  let _timeline = [];

  let _metrics = {
    stateTransitions: 0, toolsExecuted: 0, toolsFailed: 0,
    audioChunksPlayed: 0, audioChunksSent: 0,
    wsConnects: 0, wsDisconnects: 0, wsReconnects: 0,
    wsMessagesSent: 0, wsMessagesReceived: 0,
    errors: 0, warnings: 0, userMessages: 0, jarvisMessages: 0,
    keepAlives: 0, micToggles: 0, configSaves: 0,
    unhandledErrors: 0, promiseRejections: 0,
    maxLatency: 0, totalLatency: 0, latencySamples: 0,
    ossifiedAudio: 0
  };

  function now() { return Date.now(); }

  function addLog(entry) {
    _log.push(entry);
    if (_log.length > MAX_LOG) _log = _log.slice(-(MAX_LOG / 2));
  }

  function addError(entry) {
    _errors.push(entry);
    if (_errors.length > MAX_ERRORS) _errors = _errors.slice(-(MAX_ERRORS / 2));
  }

  function addTimeline(label, data) {
    const entry = { t: now(), label, data };
    _timeline.push(entry);
    if (_timeline.length > 5000) _timeline = _timeline.slice(-2500);
    return entry;
  }

  function safeStr(v, max) {
    try {
      if (typeof v === 'object') return JSON.stringify(v).substring(0, max || 300);
      return String(v).substring(0, max || 300);
    } catch (e) { return '<unstringifiable>'; }
  }

  window.JarvisSupervisor = {
    // ─── Configuration ────────────────────────────────────
    enable() { _enabled = true; },
    disable() { _enabled = false; },
    isEnabled() { return _enabled; },
    getSessionId() { return _sessionId; },
    getUptime() { return now() - _startTime; },
    getMetrics() { return { ..._metrics }; },

    // ─── Core recording ──────────────────────────────────
    record(type, data) {
      if (!_enabled) return;
      const entry = { t: now(), type, data: typeof data === 'object' ? data : { message: String(data).substring(0, 500) } };
      addLog(entry);
      if (type === 'state') { _metrics.stateTransitions++; addTimeline('state', data); }
      else if (type === 'error') { _metrics.errors++; addError({ ...entry, stack: data instanceof Error ? data.stack : (data.stack || new Error().stack) }); }
      else if (type === 'warn') _metrics.warnings++;
      else if (type === 'tool') { _metrics.toolsExecuted++; addTimeline('tool', data); }
      else if (type === 'tool_error') { _metrics.toolsFailed++; addError({ ...entry, stack: data instanceof Error ? data.stack : (data.stack || '') }); addTimeline('tool_error', data); }
      else if (type === 'audio_play') _metrics.audioChunksPlayed++;
      else if (type === 'audio_send') _metrics.audioChunksSent++;
      else if (type === 'ws_connect') { _metrics.wsConnects++; addTimeline('ws', 'connect'); }
      else if (type === 'ws_disconnect') { _metrics.wsDisconnects++; addTimeline('ws', 'disconnect'); }
      else if (type === 'ws_reconnect') { _metrics.wsReconnects++; addTimeline('ws', 'reconnect'); }
      else if (type === 'ws_send') { _metrics.wsMessagesSent++; }
      else if (type === 'ws_recv') { _metrics.wsMessagesReceived++; }
      else if (type === 'keepalive') _metrics.keepAlives++;
      else if (type === 'user_msg') { _metrics.userMessages++; addTimeline('user_msg', data); }
      else if (type === 'jarvis_msg') { _metrics.jarvisMessages++; addTimeline('jarvis_msg', data); }
      else if (type === 'mic') { _metrics.micToggles++; addTimeline('mic', data); }
      else if (type === 'config') _metrics.configSaves++;
      else if (type === 'unhandled_error') { _metrics.unhandledErrors++; addError({ ...entry, stack: data instanceof Error ? data.stack : (data.stack || '') }); addTimeline('unhandled_error', data); }
      else if (type === 'promise_rejection') { _metrics.promiseRejections++; addError({ ...entry, stack: data instanceof Error ? data.stack : (data.stack || '') }); addTimeline('promise_rejection', data); }
    },

    addLatency(ms) {
      _metrics.latencySamples++;
      _metrics.totalLatency += ms;
      if (ms > _metrics.maxLatency) _metrics.maxLatency = ms;
    },

    // ─── Tool call tracking ─────────────────────────────
    recordToolCall(calls) {
      if (!_enabled) return;
      const entry = {
        t: now(),
        callId: _toolCalls.length + 1,
        count: calls.length,
        tools: calls.map(c => ({
          name: c.name,
          params: c.args ? { ...c.args } : {},
          id: c.id
        }))
      };
      _toolCalls.push(entry);
      if (_toolCalls.length > MAX_TOOL_CALLS) _toolCalls = _toolCalls.slice(-100);
      addTimeline('tool_call', { count: calls.length, names: calls.map(c => c.name) });
      return entry.callId;
    },

    recordToolResult(callId, toolName, result) {
      if (!_enabled) return;
      const call = _toolCalls.find(c => c.callId === callId);
      if (!call) return;
      if (!call.results) call.results = [];
      call.results.push({
        toolName,
        success: result.success,
        output: safeStr(result.output, 500),
        duration: now() - call.t
      });
    },

    getToolCalls() { return _toolCalls.slice(); },

    // ─── WS message tracking ────────────────────────────
    recordWsMessage(direction, data) {
      if (!_enabled) return;
      const entry = { t: now(), direction, data: String(data).substring(0, 500) };
      _wsMessages.push(entry);
      if (_wsMessages.length > 500) _wsMessages = _wsMessages.slice(-250);
      this.record(direction === 'send' ? 'ws_send' : 'ws_recv', { preview: String(data).substring(0, 100) });
    },

    // ─── Error helpers ────────────────────────────────────
    captureError(context, error) {
      if (!_enabled) return;
      const entry = {
        t: now(), type: 'error', context,
        message: error ? (error.message || String(error)) : 'Unknown error',
        stack: error ? error.stack : new Error().stack,
        state: typeof getState === 'function' ? getState() : 'unknown',
        micActive: typeof getCtx === 'function' ? getCtx('micActive') : 'unknown',
        toolCount: typeof getCtx === 'function' ? getCtx('toolCount') : 'unknown',
        activeSources: typeof window.getCtx === 'function' ? (window.getCtx('activeSources') || []).length : 0
      };
      addError(entry);
      _metrics.errors++;
      addTimeline('error', { context, message: entry.message });
    },

    // ─── Report generation ────────────────────────────────
    generateReport() {
      const uptime = this.getUptime();
      const avgLatency = _metrics.latencySamples > 0
        ? Math.round(_metrics.totalLatency / _metrics.latencySamples) : 0;
      const currentState = typeof getState === 'function' ? getState() : 'unknown';

      return {
        sessionId: _sessionId,
        generated: new Date().toISOString(),
        uptime: this._fmtDuration(uptime),
        uptimeMs: uptime,
        currentState,

        metrics: { ..._metrics, avgLatency },

        errors: _errors.slice(-30).map(e => ({
          time: new Date(e.t).toLocaleTimeString(),
          context: e.context || e.type,
          message: e.message || safeStr(e.data, 200),
          stack: e.stack ? e.stack.substring(0, 500) : ''
        })),

        toolSequence: _toolCalls.slice(-20).map(tc => ({
          id: tc.callId,
          count: tc.count,
          tools: tc.tools.map(t => `${t.name}(${safeStr(t.params, 80)})`),
          duration: tc.tools && tc.results ? `${now() - tc.t}ms` : 'incomplete',
          results: (tc.results || []).map(r => ({
            tool: r.toolName,
            success: r.success,
            output: r.output.substring(0, 100),
            duration: `${r.duration}ms`
          }))
        })),

        timeline: _timeline.slice(-50).map(t => ({
          time: new Date(t.t).toLocaleTimeString(),
          label: t.label,
          detail: typeof t.data === 'object' ? safeStr(t.data, 120) : String(t.data || '')
        })),

        wsMessages: _wsMessages.slice(-20).map(m => ({
          time: new Date(m.t).toLocaleTimeString(),
          dir: m.direction,
          preview: m.data.substring(0, 120)
        })),

        config: {
          voice: localStorage.getItem('jarvis_voice') || 'Fenrir',
          lang: localStorage.getItem('jarvis_lang') || 'es',
          personality: localStorage.getItem('jarvis_personality') || 'professional',
          vadThreshold: localStorage.getItem('jarvis_vad_threshold') || '300',
          theme: localStorage.getItem('jarvis_theme') || 'dark'
        }
      };
    },

    _fmtDuration(ms) {
      if (ms > 3600000) return `${(ms / 3600000).toFixed(1)}h`;
      if (ms > 60000) return `${(ms / 60000).toFixed(0)}min`;
      return `${(ms / 1000).toFixed(0)}s`;
    },

    exportPrompt() {
      const r = this.generateReport();
      let p = `# JARVIS SUPERVISOR REPORT — Session ${r.sessionId}\n\n`;
      p += `Uptime: ${r.uptime} | State: ${r.currentState}\n\n`;

      p += `## Metrics\n`;
      Object.entries(r.metrics).forEach(([k, v]) => { if (v !== 0) p += `- ${k}: ${v}\n`; });

      if (r.errors.length > 0) {
        p += `\n## Errors (${r.errors.length})\n`;
        r.errors.forEach(e => {
          p += `\n[${e.time}] ${e.context}\n  Message: ${e.message}\n`;
          if (e.stack) p += `  Stack: ${e.stack.split('\n').slice(0, 3).join('\n  ')}\n`;
        });
      }

      if (r.toolSequence.length > 0) {
        p += `\n## Tool Sequence (${_toolCalls.length} total)\n`;
        r.toolSequence.forEach(tc => {
          p += `\n[#${tc.id}] ${tc.tools.join(', ')} (duration: ${tc.duration})\n`;
          (tc.results || []).forEach(res => {
            p += `  → ${res.success ? 'OK' : 'FAIL'}: ${res.output} (${res.duration})\n`;
          });
        });
      }

      if (r.timeline.length > 0) {
        p += `\n## Timeline (last ${r.timeline.length})\n`;
        r.timeline.forEach(t => { p += `[${t.time}] ${t.label}: ${t.detail}\n`; });
      }

      if (r.wsMessages.length > 0) {
        p += `\n## WebSocket Messages (last ${r.wsMessages.length})\n`;
        r.wsMessages.forEach(m => { p += `[${m.time}] ${m.dir === 'send' ? '>>>' : '<<<'} ${m.preview}\n`; });
      }

      p += `\n## Config\n`;
      Object.entries(r.config).forEach(([k, v]) => { p += `- ${k}: ${v}\n`; });

      p += `\n## Diagnostic\n`;
      if (_metrics.errors > 0) p += `⚠️ ${_metrics.errors} errors detected. Review Error section.\n`;
      if (_metrics.toolsFailed > 0) p += `⚠️ ${_metrics.toolsFailed} tool failures.\n`;
      if (_metrics.wsReconnects > 2) p += `⚠️ ${_metrics.wsReconnects} reconnections — network may be unstable.\n`;
      if (_metrics.latencySamples > 0 && _metrics.maxLatency > 10000) p += `⚠️ Max latency ${_metrics.maxLatency}ms — check network.\n`;
      if (r.errors.length === 0 && _metrics.toolsFailed === 0) p += `✅ No issues detected.\n`;

      return p;
    },

    reset() {
      _sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      _startTime = now();
      _log = []; _errors = []; _toolCalls = []; _wsMessages = []; _timeline = [];
      Object.keys(_metrics).forEach(k => _metrics[k] = 0);
    }
  };

  // ─── Global error handlers ──────────────────────────────
  window.addEventListener('error', function(event) {
    if (window.JarvisSupervisor) {
      window.JarvisSupervisor.record('unhandled_error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        stack: event.error ? event.error.stack : ''
      });
    }
  });

  window.addEventListener('unhandledrejection', function(event) {
    if (window.JarvisSupervisor) {
      window.JarvisSupervisor.record('promise_rejection', {
        message: event.reason ? (event.reason.message || String(event.reason)) : 'Unknown',
        stack: event.reason ? event.reason.stack : ''
      });
    }
  });

  console.log('[SUPERVISOR] Agent activated. Session:', _sessionId);
})();
