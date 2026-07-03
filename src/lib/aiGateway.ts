export interface AiGatewayRequest {
  messages: any[];
  scanContext: any;
  query?: string;
  type?: 'summary' | 'search' | 'explain';
}

export interface AiGatewayResponse {
  reply: string;
  cached?: boolean;
}

let activeRequest: Promise<AiGatewayResponse> | null = null;
let lastRequestTime = 0;

export async function aiGateway(req: AiGatewayRequest): Promise<AiGatewayResponse> {
  // Cooldown: 3s
  const now = Date.now();
  if (now - lastRequestTime < 3000) {
      throw new Error('AI đang bận (Cooldown 3s)');
  }
  
  if (activeRequest) {
    // Optionally cancel previous request here if needed
  }

  activeRequest = fetch('/api/ai/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  }).then(async res => {
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'AI Gateway Error');
      }
      return res.json();
  });
  
  lastRequestTime = Date.now();
  const res = await activeRequest;
  activeRequest = null;
  return res;
}
