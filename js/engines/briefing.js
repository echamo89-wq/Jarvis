import { store } from '../state/store.js';

export async function generateDailyBrief() {
  const now = new Date();
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dayName = days[now.getDay()];
  const memory = store.get('userMemory') || {};
  const objectives = memory.objectives || {};
  const userName = [memory.userTitle, memory.userName].filter(Boolean).join(' ') || 'señor';

  return [
    `\n=== BRIEFING DIARIO — ${now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ===`,
    `Nombre: ${userName}`,
    `Día: ${dayName} | Semana: ${Math.ceil(now.getDate() / 7)} del mes`,
    `Mes: ${now.toLocaleString('es-ES', { month: 'long' })} | Año: ${now.getFullYear()}`,
    '',
    `OBJETIVO ANUAL: ${objectives.anual || '—'}`,
    `OBJETIVO MENSUAL: ${objectives.mensual || '—'}`,
    `OBJETIVO SEMANAL: ${objectives.semanal || '—'}`,
    `OBJETIVO DIARIO: ${objectives.diario || '—'}`,
    '',
    `CUELLO DE BOTELLA: ${memory.bottleneck || 'No identificado'}`,
    `ENERGÍA: ${memory.energy || 'media'}`,
    '',
    '=== TRES TAREAS CRÍTICAS ===',
    '1. —',
    '2. —',
    '3. —',
    '',
    `ERROR MÁS PROBABLE: ${memory.mostLikelyError || 'Distracción'}`,
    `MÉTRICA DEL DÍA: ${memory.dailyMetric || 'Tiempo productivo'}`,
    '═══════════════════════════════\n'
  ].join('\n');
}

export async function generateNightReview() {
  const now = new Date();
  return [
    `\n=== REVISIÓN NOCTURNA — ${now.toLocaleDateString('es-ES')} ===`,
    '',
    'RESULTADO: —',
    'TIEMPO TRABAJADO: —',
    'APRENDIZAJES: —',
    'ERRORES: —',
    'MEJORAS: —',
    'BLOQUEOS: —',
    '',
    '=== SOLICITUDES PARA IMPROVEMENT ENGINE ===',
    '—',
    '═══════════════════════════════'
  ].join('\n');
}
