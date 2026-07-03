import { universalEngineFramework } from './universalFramework';

export interface EngineCapability {
  name: string;
  version: string;
  actions: string[];
  performanceCost: 'low' | 'medium' | 'high';
}

export interface Engine {
  capability: EngineCapability;
  execute(action: string, params: any): Promise<any>;
}

export class EngineManager {
  private engines: Map<string, Engine> = new Map();

  register(name: string, engine: Engine) {
    this.engines.set(name, engine);
    console.log(`Engine registered: ${name}`);
  }

  async run(engineName: string, action: string, params: any): Promise<any> {
    const engine = this.engines.get(engineName) || universalEngineFramework.getEngine(engineName);
    if (!engine) throw new Error(`Engine not found in local manager or Universal Framework: ${engineName}`);
    return await engine.execute(action, params);
  }
}

export const engineManager = new EngineManager();

