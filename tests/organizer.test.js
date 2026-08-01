import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOrganizeFolder } from '../js/tools/handlers/organizer.js';
import { grantFullAccess } from '../js/state/file-permissions.js';
import { resolvePath } from '../js/system/file-system/PathResolver.js';

describe('handleOrganizeFolder', () => {
  beforeEach(() => {
    const storage = {};
    global.localStorage = {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    };
    global.window = {
      electronAPI: {
        runPowerShell: vi.fn().mockResolvedValue({
          success: true,
          output: 'PREVIEW|3|Imagenes:2|Documentos:1'
        })
      }
    };
    const resolved = resolvePath('Descargas');
    if (resolved.success) grantFullAccess(resolved.resolvedPath);
  });

  it('returns error if no path provided', async () => {
    const res = await handleOrganizeFolder({ args: {} });
    expect(res.success).toBe(false);
    expect(res.output).toContain('Necesito la ruta');
  });

  it('expands Descargas to sentinel and runs preview mode', async () => {
    const res = await handleOrganizeFolder({ args: { path: 'Descargas', mode: 'preview' } });
    expect(res.success).toBe(true);
    expect(res.output).toContain('Vista previa');
    expect(res.output).toContain('Imagenes');
    expect(window.electronAPI.runPowerShell).toHaveBeenCalled();
  });

  it('handles execute output cleanly', async () => {
    window.electronAPI.runPowerShell.mockResolvedValue({
      success: true,
      output: 'DONE|3|0|0|Imagenes:2|Documentos:1'
    });
    const res = await handleOrganizeFolder({ args: { path: 'Descargas', mode: 'execute' } });
    expect(res.success).toBe(true);
    expect(res.output).toContain('Organización completada');
  });

  it('handles undo output cleanly', async () => {
    window.electronAPI.runPowerShell.mockResolvedValue({
      success: true,
      output: 'UNDO|3|0'
    });
    const res = await handleOrganizeFolder({ args: { path: 'Descargas', mode: 'undo' } });
    expect(res.success).toBe(true);
    expect(res.output).toContain('Organización deshecha');
  });
});
