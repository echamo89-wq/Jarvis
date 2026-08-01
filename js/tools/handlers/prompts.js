import bus from '../../utils/event-bus.js';
import { createLogger } from '../../utils/logger.js';
const _log = createLogger('PROMPTS');

export function handleCreatePrompt(call) {
  const prompt = (call.args.prompt || '').trim();
  if (!prompt) return { success: false, output: 'No se especificó el prompt.' };
  const title = (call.args.title || '').trim() || `Prompt ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  const links = Array.isArray(call.args.links) ? call.args.links.filter(l => typeof l === 'string' && l.trim()) : [];
  const entry = { id: Date.now().toString(36), title, prompt, links, date: new Date().toISOString() };
  bus.emit('prompt:new', entry);
  _log('info', `Prompt creado: ${title}`);
  return { success: true, output: 'Prompt guardado en el panel Prompts, listo para copiar.' };
}
