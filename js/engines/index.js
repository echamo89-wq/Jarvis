import { store } from '../state/store.js';
import { IdentityEngine } from './identity.js';
import { UserModelEngine } from './user-model.js';
import { StrategicEngine } from './strategic.js';
import { MemoryEngine } from './memory.js';
import { ReflectionEngine } from './reflection.js';
import { EnergyEngine } from './energy.js';
import { RealityEngine } from './reality.js';
import { generateDailyBrief, generateNightReview } from './briefing.js';
import { createLogger } from '../utils/logger.js';
const _log = createLogger('JOS');

class JarvisOperatingSystem {
  constructor() {
    this.identity = new IdentityEngine();
    this.userModel = new UserModelEngine();
    this.strategic = new StrategicEngine();
    this.memory = new MemoryEngine();
    this.reflection = new ReflectionEngine();
    this.energy = new EnergyEngine();
    this.reality = new RealityEngine();
    this._initialized = false;
  }

  async boot() {
    _log('info', '=== JARVIS OPERATING SYSTEM v1.0 INICIANDO ===');
    
    const stores = await this.memory.load();
    
    this.userModel.loadFromMemory(stores.user);
    this.strategic.loadFromMemory(stores.user);
    this.reflection.loadFromMemory(stores.user);
    this.energy.loadFromMemory(stores.user);
    this.reality.loadFromMemory(stores.user);
    
    store.set('jos', this);
    this._initialized = true;
    
    // Auto-daily brief on first boot of the day
    const lastBrief = stores.temporal?.lastBriefDate;
    const today = new Date().toISOString().slice(0, 10);
    if (lastBrief !== today) {
      _log('info', 'Generando briefing diario automático...');
      const brief = await generateDailyBrief();
      store.set('dailyBrief', brief);
      this.memory.update('temporal', 'lastBriefDate', today);
    }

    _log('info', '=== JARVIS OPERATING SYSTEM LISTO ===');
  }

  getContextBlock() {
    const userProfile = this.userModel.getProfileSummary();
    const energyBlock = this.energy.getProfileBlock();
    const realityBlock = this.reality.getProfileBlock();
    const bottleneck = this.userModel.detectBottleneck();
    const topPriority = this.strategic.topPriority();
    const principles = this.identity.getPrinciplesBlock();

    return [
      `\n===== JARVIS OPERATING SYSTEM v1.0 =====`,
      ``,
      `PRINCIPIOS:`,
      principles,
      ``,
      `USUARIO: ${userProfile || 'Sin perfil'}`,
      energyBlock,
      realityBlock,
      bottleneck ? `CUELLO DE BOTELLA: ${bottleneck.label}` : '',
      topPriority ? `PRIORIDAD MÁXIMA: ${topPriority.label} → ${topPriority.objective}` : '',
      `IDENTIDAD: ${this.identity.getIdentity().persona}`,
      `REGLA SUPREMA: ${this.identity.getIdentity().supremeRule}`,
      ``,
      `JARVIS nunca optimiza conversaciones. JARVIS optimiza resultados.`,
      `Si una respuesta no mejora claridad, ejecución, aprendizaje o ingresos, probablemente sobra.`,
      ``,
      `ARQUITECTURA COGNITIVA ACTIVA:`,
      `• Identity Engine — personalidad permanente`,
      `• User Model Engine — modelo vivo del usuario con hipótesis y confianza`,
      `• Strategic Engine — prioriza según objetivos (anual→trimestral→mensual→semanal→diario)`,
      `• Bottleneck Engine — detecta automáticamente cuello de botella actual`,
      `• Reality Engine — corrige expectativas irreales`,
      `• Energy Engine — adapta trabajo según nivel de energía`,
      `• Memory Engine — 9 tipos de memoria separadas`,
      `• Reflection Engine — revisión nocturna y semanal`,
      `• Opportunity Filter — 72h de espera antes de cambiar estrategia`,
      `• Evidence Engine — clasifica todo como dato/investigación/experiencia/hipótesis/opinión/predicción`,
      `• Risk Engine — calcula riesgo antes de recomendar`,
      ``,
      `SISTEMA DE PRIORIDADES: 1) Objetivo principal 2) Cuello de botella 3) Acción de mayor impacto 4) Automatización 5) Optimización`,
      `============================================\n`
    ].filter(Boolean).join('\n');
  }
}

export const JOS = new JarvisOperatingSystem();
