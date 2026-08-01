import { createLogger } from '../../../utils/logger.js';
const _log = createLogger('VERIFIER');

const VERIFICATION_RULES = {
  launch_app: {
    verify: async (args, result) => {
      const appName = args?.appName || '';
      if (!result?.success) return { passed: false, reason: result?.output || 'Error al ejecutar launch_app' };
      return { passed: true };
    }
  },
  execute_powershell: {
    verify: async (args, result) => {
      if (!result?.success) return { passed: false, reason: result?.output || 'PowerShell falló' };
      return { passed: true, evidence: result.output?.substring(0, 500) };
    }
  },
  search_web: {
    verify: async (args, result) => {
      if (!result?.success) return { passed: false, reason: 'Búsqueda falló' };
      const output = (result?.output || '').toLowerCase();
      if (output.includes('error') || output.includes('no results')) return { passed: false, reason: 'Sin resultados' };
      return { passed: true, evidence: output.substring(0, 500) };
    }
  },
  open_browser: {
    verify: async (args, result) => {
      if (!result?.success) return { passed: false, reason: 'No se pudo abrir el navegador' };
      return { passed: true };
    }
  },
  file_operation: {
    verify: async (args, result) => {
      if (!result?.success) return { passed: false, reason: result?.output || 'Operación de archivo falló' };
      return { passed: true, evidence: result.output?.substring(0, 500) };
    }
  }
};

const DEFAULT_VERIFY = {
  verify: async (_args, result) => {
    if (!result) return { passed: false, reason: 'Sin resultado' };
    if (result.success === false) return { passed: false, reason: result?.output || 'Error desconocido' };
    return { passed: true, evidence: result?.output?.substring(0, 500) };
  }
};

export async function verifyStep(toolName, args, result) {
  const rule = VERIFICATION_RULES[toolName] || DEFAULT_VERIFY;
  try {
    const outcome = await rule.verify(args, result);
    if (outcome.passed) {
      _log('info', `Verificación exitosa: ${toolName}`);
    } else {
      _log('warn', `Verificación falló: ${toolName} — ${outcome.reason}`);
    }
    return outcome;
  } catch (err) {
    _log('error', `Error en verificación: ${err.message}`);
    return { passed: false, reason: `Error de verificación: ${err.message}` };
  }
}

export function addVerificationRule(toolName, verifyFn) {
  VERIFICATION_RULES[toolName] = { verify: verifyFn };
}
