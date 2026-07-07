import { store } from '../state/store.js';

export async function buildSystemInstruction(memory) {
  const summariesText = (memory?.conversationSummaries?.length > 0)
    ? `\nCONVERSATION HISTORY SUMMARY:\n${memory.conversationSummaries.slice(-3).map(s => `- ${s.date}: ${s.summary}`).join('\n')}`
    : '';
  const frequentText = (memory?.frequentCommands && Object.keys(memory.frequentCommands).length > 0)
    ? `\nUSER FREQUENT REQUESTS: ${Object.entries(memory.frequentCommands).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `"${k}" (${v}x)`).join(', ')}`
    : '';
  const name = memory?.userName || localStorage.getItem('jarvis_username') || '';
  const title = memory?.userTitle || localStorage.getItem('jarvis_title') || '';
  const city = memory?.city || localStorage.getItem('jarvis_city') || '';
  const context = memory?.userContext || localStorage.getItem('jarvis_context') || '';
  const rules = memory?.userRules || localStorage.getItem('jarvis_rules') || '';
  const userDetails = memory?.userDetails || '';
  const sessionCount = memory?.sessionCount || 1;
  const firstSeenDate = new Date(memory?.firstSeen || new Date()).toLocaleDateString();
  const lang = localStorage.getItem('jarvis_lang') || 'es';
  const lengthMode = localStorage.getItem('jarvis_length') || 'normal';
  const personalityMode = localStorage.getItem('jarvis_personality') || 'companion';

  let integrityProtocol = window._cachedIntegrity || '';
  let masterPrompt = window._cachedMasterPrompt || '';
  if (!integrityProtocol || !masterPrompt) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      if (!integrityProtocol) {
        const resp = await fetch('config/integrity_protocol.txt', { signal: controller.signal });
        if (resp.ok) integrityProtocol = await resp.text();
      }
      if (!masterPrompt) {
        const respMaster = await fetch('config/system_prompt_master.txt', { signal: controller.signal });
        if (respMaster.ok) masterPrompt = await respMaster.text();
      }
      clearTimeout(timeout);
    } catch (e) {
      console.warn('[CONFIG] No se pudo cargar integrity_protocol.txt o system_prompt_master.txt', e.message);
    }
  }

  let integrationsText = '';
  try {
    const { getAllIntegrations, getIntegrationStatus, getIntegrationConfig } = await import('../integrations/index.js');
    const ints = getAllIntegrations();
    const statusLines = ints.map(int => {
      const status = getIntegrationStatus(int.id);
      const config = getIntegrationConfig(int.id);
      let details = '';
      if (int.id === 'github' && config._configured) {
        details = ` (Scopes: ${config._scopes?.join(', ') || 'ninguno'})`;
      } else if (int.id === 'gmail' && config._configured) {
        details = ` (Email: ${config.userEmail || 'desconocido'})`;
      }
      const label = status === 'connected' ? 'CONECTADO' : (status === 'error' ? 'ERROR' : 'DESCONECTADO');
      return `  - ${int.name}: ${label}${details}`;
    }).join('\n');

    integrationsText = [
      `=== PROTOCOLO DE SOPORTE DE INTEGRACIONES ===`,
      `1. ESTADO ACTUAL DE LAS INTEGRACIONES:`,
      statusLines,
      `2. GUÍA DE CONFIGURACIÓN Y ERRORES:`,
      `   - Si el usuario te pide conectar/configurar o si una integración tiene estado DESCONECTADO o ERROR:`,
      `     * Indícale que abra el panel de "Integraciones" en la barra lateral izquierda (haciendo clic en el botón "Integraciones") para rellenar sus credenciales.`,
      `   - Si falla la conexión de GMAIL (Google Workspace OAuth):`,
      `     * Explícale que en Google Cloud Console debe configurar el tipo de cliente OAuth como "Desktop app" (Aplicación de escritorio) para habilitar el Device Flow. El tipo de aplicación web u otros no funcionarán con el flujo de dispositivo.`,
      `     * Recuérdale habilitar la API de Gmail en el proyecto de Google Cloud.`,
      `     * Recuérdale añadir su correo en "Usuarios de prueba" (Test users) en la pantalla de consentimiento de OAuth de Google si la app está en "Prueba".`,
      `   - Si falla GITHUB:`,
      `     * Necesita generar un Personal Access Token (PAT) clásico en GitHub Settings > Developer Settings > Personal Access Tokens > Tokens (classic) con los permisos 'repo' y 'delete_repo'.`,
      `   - Si falla OPENWEATHERMAP:`,
      `     * Necesita una API Key gratuita de openweathermap.org/api (que puede tardar unas horas en activarse).`,
      `=== FIN PROTOCOLO DE SOPORTE ===`
    ].join('\n');
  } catch (e) {
    console.warn('[CONFIG] Error cargando estado de integraciones:', e.message);
  }

  let lengthInstruction = 'Concise: 1-3 sentences for simple answers. Expand only when asked.';
  if (lengthMode === 'concise') lengthInstruction = 'Keep responses extremely concise and brief, strictly maximum 2 sentences.';
  else if (lengthMode === 'detailed') lengthInstruction = 'Provide detailed, comprehensive responses with no strict length limit.';

  let personalityInstruction = 'Eres un compañero cercano, no un asistente. Habla como un amigo que entiende al usuario. NUNCA digas frases de IA como "¿En qué puedo ayudarte?", "¿Qué podemos hacer hoy?", "¿Cómo puedo servirte?". Simplemente conversa naturalmente. Sé directo, natural, con confianza, como si conocieras al usuario de toda la vida.';
  if (personalityMode === 'companion') personalityInstruction = 'Eres el compañero ideal: directo, sin rodeos, con confianza y buen humor. No eres una IA, eres como un amigo que siempre está ahí. Habla natural, sin frases hechas de asistente. NUNCA preguntes "¿en qué puedo ayudarte?" o similares. Simplemente responde como lo haría un amigo.';
  else if (personalityMode === 'friendly') personalityInstruction = 'Cálido, leal, conversacional, con un toque de humor seco e inteligente. Siempre respetuoso y útil, pero sin sonar a centro de atención al cliente. Habla natural, como un amigo.';
  else if (personalityMode === 'strategic') personalityInstruction = 'Estratega y compañero. Directo, va al grano. Ofrece pasos inteligentes sin rodeos. Confianza absoluta, cero formalismo vacío. Habla como un aliado de confianza.';
  else if (personalityMode === 'humorous') personalityInstruction = 'Con humor y picardía, pero siempre natural. Bromas que fluyen en la conversación sin forzar. Como un amigo divertido pero útil.';
  else if (personalityMode === 'ultra-formal') personalityInstruction = 'Impecablemente educado, distinguido, mayordomo. Lenguaje elevado pero nunca servil. Elegancia y lealtad absoluta.';

  const toolsBrief = [
    'launch_app|search_web|open_browser|execute_powershell|set_volume|set_brightness',
    'fetch_url|show_notification|get_system_time|quick_note|remember_user_info|open_file',
    'get_weather|get_news|file_operation|computer_action|youtube_action|set_reminder',
    'desktop_action|process_file|youtube_download|translate_text|list_processes',
    'system_stats|find_files|set_timer'
  ].join('\n');

  const selectedOs = localStorage.getItem('jarvis_os') || 'windows';

  return [
    `JARVIS — tu compañero. Usuario: ${[title, name].filter(Boolean).join(' ') || 'señor'}.`,
    `REGLAS ABSOLUTAS:`,
    `1. NUNCA repitas ni hagas eco de lo que el usuario dice. Si él pregunta "¿qué hora es?", tú responde "Son las 8:41" — no repitas su pregunta.`,
    `2. El usuario tiene acento paraguayo y dictado imperfecto. NO corrijas su forma de hablar, solo entiende el contenido.`,
    `3. NUNCA uses frases de asistente virtual como "¿En qué puedo ayudarte?", "¿Qué te gustaría hacer hoy?", "¿Cómo puedo servirte?", "Estoy aquí para ayudarte". Habla como un compañero, no como un bot de servicio.`,
    `4. IDIOMA: Español siempre, natural. Nada de markdown, listas con asteriscos, encabezados. Respuesta directa y conversacional.`,
    `5. No necesitas saludar ni presentarte cada vez. Si el usuario ya habló, responde directo al tema.`,
    `6. VELOCIDAD Y ENTONACIÓN DE VOZ: Habla a un ritmo normal, pausado, natural y tranquilo. No vayas rápido. Modula tu tono para que suene como una conversación humana relajada y amigable.`,
    `7. SISTEMA OPERATIVO ACTUAL DEL USUARIO: ${selectedOs.toUpperCase()}. Adapta todas tus respuestas y el uso de herramientas (como launch_app, file_operation, run-cmd) a este sistema operativo. Si estás en macOS o Linux, usa comandos Unix/Bash e interactúa con rutas tipo POSIX (/Users/...) en lugar de Windows (C:\\...).`,
    `Personalidad: ${personalityInstruction} ${lengthInstruction}`,
    `Herramientas (26): ${toolsBrief}`,
    `Integraciones: Gmail(gmail_list_inbox/send/search/read/unread), GitHub(github_*), OpenWeatherMap(clima detallado).`,
    `REGLAS: 1) Ejecuta sin pedir permiso. 2) Puedes ejecutar VARIAS herramientas independientes en un mismo turno. 3) NO digas "Listo" ni "Hecho". 4) computer_action para Win+D/E/I/L. 5) get_weather para clima, get_news para noticias. 6) file_operation para archivos. 7) process_file para PDF/DOCX/XLSX/CSV/ZIP. 8) youtube_download con formato video/audio/custom. 9) Atajos de teclado con computer_action type_text/press_keys. 10) Llama herramientas por su NOMBRE EXACTO. 11) translate_text para traducciones. 12) list_processes/system_stats para monitoreo. 13) find_files para buscar archivos. 14) set_timer para temporizadores.`,
    rules ? `\nREGLAS DEL USUARIO:\n${rules}` : '',
    masterPrompt || '',
    summariesText || '',
    frequentText || '',
    (() => {
      const jos = store.get('jos');
      if (!jos) return '';
      const profile = jos.userModel.getProfileSummary();
      const energy = jos.energy.getProfileBlock();
      const bottleneck = jos.userModel.detectBottleneck();
      const topPriority = jos.strategic.topPriority();
      return [
        `\n=== COGNITIVE STATE (JOS v2.0) ===`,
        profile ? `USER PROFILE: ${profile}` : '',
        energy ? `ENERGY STATE: ${energy}` : '',
        bottleneck ? `CURRENT SYSTEM BOTTLENECK: ${bottleneck.label}` : '',
        topPriority ? `CURRENT PRIORITY TARGET: ${topPriority.label} -> ${topPriority.objective}` : '',
        `==================================`
      ].filter(Boolean).join('\n');
    })()
  ].join('\n');
}
