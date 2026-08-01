import { describe, it, expect } from 'vitest';

// Test env parsing (replicates logic from main.js)
function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=#\s]+)=\s*(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1].trim()] = value;
  }
  return result;
}

describe('parseEnv', () => {
  it('parses simple key=value', () => {
    const result = parseEnv('KEY=value');
    expect(result.KEY).toBe('value');
  });

  it('handles values with spaces in quotes', () => {
    const result = parseEnv('KEY="value with spaces"');
    expect(result.KEY).toBe('value with spaces');
  });

  it('handles single-quoted values', () => {
    const result = parseEnv("KEY='quoted value'");
    expect(result.KEY).toBe('quoted value');
  });

  it('skips comments', () => {
    const result = parseEnv('# this is a comment\nKEY=value');
    expect(result.KEY).toBe('value');
  });

  it('ignores empty lines', () => {
    const result = parseEnv('\n\nKEY=val\n\n');
    expect(result.KEY).toBe('val');
  });
});

// Test blocklist (replicates logic from ps-executor.js)
function checkBlocked(command, patterns) {
  const normalized = command
    .replace(/`/g, '')
    .replace(/["']/g, '')
    .replace(/[()&$,;{}|]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const blockedRaw = patterns.some(p => p.test(command));
  const blockedNorm = patterns.some(p => p.test(normalized));
  return blockedRaw || blockedNorm;
}

const PS_BLOCKED_PATTERNS = [
  /remove-item/i, /\brm\s/i, /\bdel\s/i, /erase\s/i,
  /format-volume/i, /diskpart/i,
  /invoke-expression/i, /\biex\s/i,
];

describe('PS Blocklist', () => {
  it('blocks Remove-Item directly', () => {
    expect(checkBlocked('Remove-Item C:\\test', PS_BLOCKED_PATTERNS)).toBe(true);
  });

  it('blocks rm shorthand', () => {
    expect(checkBlocked('rm C:\\test', PS_BLOCKED_PATTERNS)).toBe(true);
  });

  it('blocks del command', () => {
    expect(checkBlocked('del C:\\test', PS_BLOCKED_PATTERNS)).toBe(true);
  });

  it('blocks IEX (Invoke-Expression)', () => {
    expect(checkBlocked('iex (Get-Content cmd.txt)', PS_BLOCKED_PATTERNS)).toBe(true);
  });

  it('allows harmless commands', () => {
    expect(checkBlocked('Get-Process', PS_BLOCKED_PATTERNS)).toBe(false);
  });

  it('allows Get-ChildItem', () => {
    expect(checkBlocked('Get-ChildItem C:\\Users', PS_BLOCKED_PATTERNS)).toBe(false);
  });
});
