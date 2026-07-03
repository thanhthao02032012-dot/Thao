import { GoogleGenAI } from '@google/genai';

export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

export async function generateContentWithRetry(aiClient: any, request: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // According to the skill, use ai.models.generateContent
      return await aiClient.models.generateContent(request);
    } catch (err: any) {
      if (err.status === 503 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.warn(`Gemini API 503 error. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      throw err;
    }
  }
}

export function extractTextFromResponse(response: any): string {
  if (!response) return '';
  
  // The @google/genai SDK response features a .text property (not a method)
  if (typeof response.text === 'string') {
    return response.text;
  }
  
  // Fallback for candidates if text property is missing for some reason
  if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    return response.candidates[0].content.parts[0].text;
  }
  
  return '';
}
