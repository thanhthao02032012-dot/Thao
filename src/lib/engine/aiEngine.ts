import { Engine, EngineCapability } from './manager';
import { generateContentWithRetry, extractTextFromResponse } from '../gemini';

export class AiEngine implements Engine {
  capability: EngineCapability = {
    name: 'AiEngine',
    version: '1.0.0',
    actions: ['plan', 'execute', 'summarize'],
    performanceCost: 'high',
  };

  async execute(action: string, params: any, context?: any): Promise<any> {
    if (action === 'plan') {
      const { aiClient, query } = params;
      const prompt = `Bạn là Project Manager kỹ thuật. Dựa trên yêu cầu: "${query}", hãy tạo một workflow gồm các bước cần thiết, sử dụng các Engine sau: SearchEngine, ImageEngine, FileEngine. Trả về dạng JSON array của các bước.`;
      
      // Use Gemini to plan
      const response = await generateContentWithRetry(aiClient, {
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json'
        }
      });
      
      let text = extractTextFromResponse(response);
      // Clean up potential markdown blocks if the model ignores responseMimeType
      const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      text = text.replace(/```json/ig, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    }
    return null;
  }
}
