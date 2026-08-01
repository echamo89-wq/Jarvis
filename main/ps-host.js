const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class PersistentPowerShellHost {
  constructor() {
    this.psProcess = null;
    this.commandId = 0;
    this.pendingCommands = new Map();
    this.isReady = false;
    this.initPromise = null;
    this.outputBuffer = '';
    this.errorBuffer = '';
    this.hostFile = null;
    this.collectedOutput = '';
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._spawnHost();
    return this.initPromise;
  }

  _spawnHost() {
    return new Promise((resolve, reject) => {
      const hostScript = [
        `$ErrorActionPreference = 'Stop'`,
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
        ``,
        `function Invoke-JarvisCommand {`,
        `  param([string]$Id, [string]$Command)`,
        `  try {`,
        `    $result = Invoke-Expression $Command 2>&1`,
        `    if ($result -ne $null) { $result | Out-String | Write-Output }`,
        `    Write-Host "###JARVIS_CMD_END### $Id SUCCESS"`,
        `  } catch {`,
        `    Write-Host "###JARVIS_CMD_END### $Id ERROR: $($_.Exception.Message)"`,
        `  }`,
        `}`,
        ``,
        `$reader = [System.IO.StreamReader]::new([System.Console]::OpenStandardInput())`,
        `while (($line = $reader.ReadLine()) -ne $null) {`,
        `  if ($line.StartsWith('###JARVIS_CMD###')) {`,
        `    $parts = $line -split '###', 4`,
        `    $id = $parts[2].Trim()`,
        `    $cmd = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($parts[3].Trim()))`,
        `    Invoke-JarvisCommand -Id $id -Command $cmd`,
        `  }`,
        `}`,
        `$reader.Dispose()`
      ].join('\n');

      let hostFile = null;
      try {
        hostFile = path.join(os.tmpdir(), `jarvis_pshost_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.ps1`);
        fs.writeFileSync(hostFile, '\uFEFF' + hostScript, 'utf8');
      } catch (e) {
        return reject(new Error(`Failed to write host script: ${e.message}`));
      }
      this.hostFile = hostFile;

      this.psProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', hostFile
      ], {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      this.psProcess.stdin.setEncoding('utf8');
      this.psProcess.stdin.on('error', (e) => {
        if (e.code === 'ERR_STREAM_WRITE_AFTER_END') return;
        this.isReady = false;
        this._rejectAllPending(`stdin error: ${e.message}`);
      });

      this.psProcess.stdout.on('data', (data) => {
        this.outputBuffer += data.toString();
        this._processOutput();
      });

      this.psProcess.stderr.on('data', (data) => {
        this.errorBuffer += data.toString();
      });

      this.psProcess.on('error', (err) => {
        this.isReady = false;
        this.psProcess = null;
        this.initPromise = null;
        this._rejectAllPending(`PS host spawn error: ${err.message}`);
        reject(err);
      });

      this.psProcess.on('exit', (code) => {
        this.isReady = false;
        this.psProcess = null;
        this.initPromise = null;
        if (this.hostFile) { try { fs.unlinkSync(this.hostFile); } catch (e) {} this.hostFile = null; }
        this._rejectAllPending(`PowerShell host exited with code ${code}`);
        reject(new Error(`PowerShell host exited with code ${code}`));
      });

      // Wait for host to be ready
      setTimeout(() => {
        if (this.psProcess && this.psProcess.exitCode === null && this.psProcess.signalCode === null) {
          this.isReady = true;
          resolve();
        } else {
          this.isReady = false;
          this.initPromise = null;
          reject(new Error('PowerShell host failed to start'));
        }
      }, 500);
    });
  }

  _processOutput() {
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      const match = line.match(/^###JARVIS_CMD_END###\s+(\S+)\s+(SUCCESS|ERROR)(?:\:\s*(.*))?$/);
      if (match) {
        const [, id, status, inlineOutput] = match;
        const pending = this.pendingCommands.get(id);
        if (pending) {
          this.pendingCommands.delete(id);
          let output = '';
          if (status === 'ERROR') {
            output = (inlineOutput || '').trim();
          } else {
            output = inlineOutput || this.collectedOutput.trim();
          }
          this.collectedOutput = '';
          pending.resolve({ success: status === 'SUCCESS', output });
        }
      } else {
        this.collectedOutput += line + '\n';
      }
    }
  }

  _rejectAllPending(reason) {
    for (const [, pending] of this.pendingCommands) {
      pending.reject(new Error(reason));
    }
    this.pendingCommands.clear();
  }

  async execute(command, timeout = 30000) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.isReady || !this.psProcess || this.psProcess.exitCode !== null) {
        this.initPromise = null;
        try { await this.init(); } catch (e) { throw e; }
      }
      if (this.isReady) break;
    }
    if (!this.isReady || !this.psProcess) {
      throw new Error('PowerShell host not available');
    }

    const id = `cmd_${++this.commandId}_${Date.now()}`;
    const cmdB64 = Buffer.from(command, 'utf8').toString('base64');
    const cmdLine = `###JARVIS_CMD### ${id} ### ${cmdB64}\n`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        done(reject, new Error(`PowerShell command timeout after ${timeout}ms`));
      }, timeout);

      const cleanup = () => {
        if (this.stdinErrorHandler) {
          this.psProcess.stdin.removeListener('error', this.stdinErrorHandler);
          this.stdinErrorHandler = null;
        }
      };

      const done = (fn, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingCommands.delete(id);
        cleanup();
        fn(val);
      };

      this.pendingCommands.set(id, { resolve: (v) => done(resolve, v), reject: (e) => done(reject, e), timer });

      try {
        const written = this.psProcess.stdin.write(cmdLine);
        if (!written) {
          this.psProcess.stdin.once('drain', () => {});
        }
      } catch (e) {
        done(reject, e);
      }
      this.stdinErrorHandler = (e) => done(reject, e);
      this.psProcess.stdin.on('error', this.stdinErrorHandler);
    });
  }

  async executeBatch(commands, timeout = 60000) {
    if (!this.isReady) await this.init();
    const results = await Promise.all(
      commands.map(cmd => this.execute(cmd, timeout / commands.length))
    );
    return results;
  }

  async shutdown() {
    if (this.psProcess) {
      this.psProcess.kill();
      this.psProcess = null;
    }
    if (this.hostFile) { try { fs.unlinkSync(this.hostFile); } catch (e) {} this.hostFile = null; }
    this.isReady = false;
    this.initPromise = null;
    this._rejectAllPending('Host shutting down');
  }
}

let _hostInstance = null;
function getPowerShellHost() {
  if (!_hostInstance) _hostInstance = new PersistentPowerShellHost();
  return _hostInstance;
}

module.exports = { getPowerShellHost, PersistentPowerShellHost };