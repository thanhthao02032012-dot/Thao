/**
 * Modular Scanner Pipeline Infrastructure
 */
export interface ScanResult {
  data: any;
  status: 'success' | 'warning' | 'error';
  message: string;
}

export interface ScanStage {
  id: string;
  name: string;
  description: string;
  run: (file: File, context: any, signal: AbortSignal) => Promise<ScanResult>;
}

export class ScannerPipeline {
  private stages: ScanStage[] = [];
  private context: any = {};
  private abortController: AbortController | null = null;

  constructor(context: any = {}) {
    this.context = context;
  }

  addStage(stage: ScanStage) {
    this.stages.push(stage);
  }

  async run(file: File, onProgress: (step: number, total: number, result: ScanResult) => void) {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    for (let i = 0; i < this.stages.length; i++) {
      if (signal.aborted) throw new Error('Scan aborted');
      
      const stage = this.stages[i];
      try {
        const result = await stage.run(file, this.context, signal);
        this.context[stage.id] = result;
        onProgress(i + 1, this.stages.length, result);
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Scan aborted') {
          throw err;
        }
        console.error(`[ScannerPipeline] Stage ${stage.name} failed:`, err);
        const errorResult: ScanResult = { 
          data: null, 
          status: 'error', 
          message: err.message || 'Unknown error in stage' 
        };
        this.context[stage.id] = errorResult;
        onProgress(i + 1, this.stages.length, errorResult);
      }
    }
    return this.context;
  }

  abort() {
    this.abortController?.abort();
  }
}
