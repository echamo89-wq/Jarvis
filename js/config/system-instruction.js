import { store } from '../state/store.js';

// Module-level caches
let _cachedIntegrationsText = null;
let _cachedIntegrationsTime = 0;
const _INTEGRATIONS_TTL = 5 * 60 * 1000;

function _getPlanSummary() {
  try {
    const p = store.get('_activePlan');
    if (p && p.status === 'active') {
      const done = p.steps.filter(s => s.status === 'done').length;
      const current = p.steps.find(s => s.status === 'in_progress' || s.status === 'pending');
      return `\n=== PLAN ACTIVO ===\nObjetivo: ${p.goal}\nProgreso: ${done}/${p.steps.length}\nSiguiente: ${current ? current.desc : 'Completado'}\n==================`;
    }
    const planModeId = store.get('_activePlanMode');
    if (planModeId) {
      const plans = store.get('userMemory')?.plans || [];
      const plan = plans.find(p => p.id === planModeId);
      if (plan) {
        const done = plan.steps.filter(s => s.status === 'done').length;
        const current = plan.steps.find(s => s.status === 'in_progress' || s.status === 'pending');
        const nextStep = current ? `\nSiguiente (${current.index + 1}/${plan.steps.length}): ${current.desc}` : '\nTodos los pasos completados. Llamá exit_plan_mode.';
        return `\n=== MODO PLAN: "${plan.title}" ===\nProgreso: ${done}/${plan.steps.length}${nextStep}\nEjecutá pasos con herramientas, llamá update_step al completar cada uno, exit_plan_mode al finalizar.\n====`;
      }
    }
    return '';
  } catch { return ''; }
}

export async function buildSystemInstruction(memory, memoryContext = '') {
  const name = memory?.userName || localStorage.getItem('jarvis_username') || '';
  const title = memory?.userTitle || localStorage.getItem('jarvis_title') || '';
  const city = memory?.city || localStorage.getItem('jarvis_city') || '';
  const context = memory?.userContext || localStorage.getItem('jarvis_context') || '';
  const rules = memory?.userRules || localStorage.getItem('jarvis_rules') || '';
  const lang = localStorage.getItem('jarvis_lang') || 'es';
  const lengthMode = localStorage.getItem('jarvis_length') || 'normal';
  const personalityMode = localStorage.getItem('jarvis_personality') || 'companion';
  const selectedOs = localStorage.getItem('jarvis_os') || 'windows';

  // Master prompt (fetched once)
  let masterPrompt = window._cachedMasterPrompt || '';
  if (!masterPrompt) {
    try {
      const r = await fetch('config/system_prompt_master.txt', { signal: AbortSignal.timeout(2000) });
      if (r.ok) { masterPrompt = await r.text(); window._cachedMasterPrompt = masterPrompt; }
    } catch {}
  }

  // Integrations (cached 5 min)
  let integrationsText = _cachedIntegrationsText || '';
  if (!integrationsText || (Date.now() - _cachedIntegrationsTime) > _INTEGRATIONS_TTL) {
    try {
      const { getAllIntegrations, getIntegrationStatus } = await import('../engines/integration/index.js');
      const connected = getAllIntegrations().filter(i => getIntegrationStatus(i.id) === 'connected').map(i => i.name);
      integrationsText = connected.length ? `Integraciones activas: ${connected.join(', ')}` : '';
      _cachedIntegrationsText = integrationsText;
      _cachedIntegrationsTime = Date.now();
    } catch {}
  }

  const lengthInstruction =
    lengthMode === 'concise' ? 'Respuestas ultra breves, máximo 2 oraciones.' :
    lengthMode === 'detailed' ? 'Respuestas extensas y completas.' :
    'Respuestas equilibradas: completa si es necesario, breve si alcanza.';

  const personalities = {
    companion: 'Compañero directo, con confianza y buen humor. Amigo de confianza. Sin frases de asistente.',
    professional: 'Asistente cognitivo de élite. Preciso, eficiente, formal pero no frío.',
    friendly: 'Cálido, conversacional, con humor. Natural, como un amigo.',
    strategic: 'Estratega. Directo, al grano, objetivos y resultados.',
    humorous: 'Con humor y picardía natural. Sabés cuándo bromear y cuándo ser serio.',
    'ultra-formal': 'Impecablemente educado, distinguido. Elegancia y precisión.',
  };

  let factsText = '';
  try {
    const { getFormattedFactsForPrompt } = await import('../memory/facts.js');
    const formatted = getFormattedFactsForPrompt(30);
    if (formatted) factsText = `\nHECHOS DEL USUARIO:\n${formatted}`;
  } catch {
    // Fallback al sistema anterior
    factsText = memory?.userFacts?.length > 0
      ? `\nHECHOS DEL USUARIO:\n${memory.userFacts.slice(-15).map(f => `- [${f.category}] ${f.fact}`).join('\n')}`
      : '';
  }


  const tasksText = (() => {
    try {
      const pending = (memory?.tasks || []).filter(t => t.status === 'pending');
      if (!pending.length) return '';
      return `\nTAREAS PENDIENTES (${pending.length}): ${pending.slice(0, 8).map(t => `${t.title}${t.dueDate ? ' ('+t.dueDate+')' : ''}${t.priority === 'high' ? '⚠' : ''}`).join(' | ')}`;
    } catch { return ''; }
  })();

  const summariesText = memory?.conversationSummaries?.length > 0
    ? `\nHISTORIAL RESUMIDO:\n${memory.conversationSummaries.slice(-2).map(s => `- ${s.date}: ${s.summary}`).join('\n')}`
    : '';

  const frequentText = memory?.frequentCommands && Object.keys(memory.frequentCommands).length > 0
    ? `\nSOLICITUDES FRECUENTES: ${Object.entries(memory.frequentCommands).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`"${k}"(${v}x)`).join(', ')}`
    : '';

  const parts = [
    `JARVIS — asistente cognitivo local. OS: ${selectedOs.toUpperCase()}. Usuario: ${[title,name].filter(Boolean).join(' ') || 'señor'}${city ? ', '+city : ''}.`,
    context ? `Contexto: ${context}` : '',
    `Personalidad: ${personalities[personalityMode] || personalities.companion}`,
    `${lengthInstruction}`,
    ``,
    `# REGLAS ABSOLUTAS`,
    `1. SOLO español. Ni una palabra en inglés. Cero excepciones.`,
    `2. NUNCA markdown: sin **, sin *, sin #, sin guiones, sin cursivas. Texto plano siempre.`,
    `3. NUNCA narres tu proceso interno. Nada de "voy a", "déjame", "analizando", "procesando". Solo el resultado.`,
    `4. NUNCA frases de bot: "¿En qué puedo ayudarte?", "¿Cómo puedo asistirte?", "Claro que sí", "Entendido señor". Hablá como persona.`,
    `5. NUNCA te disculpes con frases robóticas. Si hubo error, di brevemente qué pasó y qué hacés.`,
    `6. NO uses herramientas a menos que el usuario pida una acción concreta. Para conversar, responde directo.`,
    `7. get_system_time: SOLO si el usuario pregunta la hora o fecha explícitamente.`,
    `8. NO repitas lo que el usuario dijo. Respondé directo.`,
    `9. Acento paraguayo y dictado por voz: tolerá variaciones. Si es ambiguo, preguntá brevemente.`,
    `10. Al mencionar archivos por voz, abreviá nombres técnicos largos de forma natural.`,
    `11. Cuando investigués en la web (search_web/fetch_url/deep_research): respondé SOLO con lo que encontraste en las fuentes y SOLO lo que el usuario preguntó. No alargues, no añadas información extra ni contexto que no pidió, no repitas la pregunta. Máximo 4 oraciones o 6 bullets con datos, más los enlaces relevantes.`,
    ``,
    `# ARCHIVOS Y CARPETAS — ÁRBOL DE DECISIÓN`,
    `• VER/LISTAR/EXPLORAR una CARPETA → analyze_path(path=..., deep=false)`,
    `• LEER un ARCHIVO texto/código → analyze_path(path=...) — detecta tipo automáticamente`,
    `• LEER PDF/DOCX/XLSX/ZIP/imagen → process_file(path=...)`,
    `• BUSCAR archivo por nombre → find_files(pattern=...)`,
    `• BUSCAR en contenido de documentos → search_documents(query=...)`,
    `• ORGANIZAR/LIMPIAR carpeta → organize_folder(mode="preview") → confirmar → "execute"`,
    `• CREAR documento (PDF, Word, HTML, MD, TXT...) → create_document(title, format, sections[])`,
    `  - Si el tema requiere datos reales, usá search_web ANTES de create_document`,
    `  - Cada sección debe tener contenido ÚNICO y sustancial. Nunca repetir ideas.`,
    `  - Creá directamente sin pedir confirmación`,
    `• Rutas: "Descargas"=Downloads, "Escritorio"=Desktop, "Documentos"=Documents`,
    `• Resultados: lista ordenada y numerada, agrupada por categoría. NUNCA un párrafo.`,
    ``,
    `# PANTALLA`,
    `take_screenshot / analyze_screen: SOLO si el usuario pide ver su pantalla explícitamente. Advertí antes de tomar la captura.`,
    ``,
    `# MEMORIA AUTOMÁTICA — save_fact`,
    `Guardá hechos automáticamente cuando el usuario mencione algo relevante sobre sí mismo. NO necesitás permiso.`,
    `Importancia: critical=identidad/salud/condición permanente | high=proyecto activo/meta/preferencia fuerte | normal=gusto/hábito | low=dato menor`,
    `Categorías: identidad, nombre, edad, ubicacion, profesion, idioma, preferencia, gusto, disgusto, comida, musica, entretenimiento, proyecto, trabajo, meta, tecnologia, programacion, rutina, habito, horario, familia, amigo, mascota, salud, finanzas, habilidad, conocimiento, aprendizaje, general`,
    `Ejemplos: "me llamo Nicolás" → save_fact(identidad, "Su nombre es Nicolás", critical) | "me gusta el mate" → save_fact(gusto, "Le gusta el mate", normal)`,
    `Deduplicación automática: si ya existe algo similar, no lo guarda de nuevo — no hagas dobles de lo mismo.`,
    ``,
    `# ELIMINACIÓN DE ARCHIVOS`,
    `Pedí confirmación breve antes de borrar. Si el usuario dijo "no preguntes más", eliminá directamente.`,
    ``,
    integrationsText,
    rules ? `REGLAS DEL USUARIO:\n${rules}` : '',
    masterPrompt || '',
    summariesText,
    frequentText,
    factsText,
    tasksText,
    memoryContext || '',
    _getPlanSummary(),
    (() => {
      try {
        const jos = store.get('jos');
        if (!jos) return '';
        const profile = jos.userModel.getProfileSummary();
        const energy = jos.energy.getProfileBlock();
        const bottleneck = jos.userModel.detectBottleneck();
        const topPriority = jos.strategic.topPriority();
        return [
          `\nESTADO COGNITIVO:`,
          profile ? `Perfil: ${profile}` : '',
          energy ? `Energía: ${energy}` : '',
          bottleneck ? `Cuello de botella: ${bottleneck.label}` : '',
          topPriority ? `Prioridad: ${topPriority.label} → ${topPriority.objective}` : '',
        ].filter(Boolean).join('\n');
      } catch { return ''; }
    })(),
  ];

  return parts.filter(l => l !== '').join('\n');
}
