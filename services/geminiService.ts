import { AnalysisResult, MediaType, AnalysisPreset, AnalysisFocus, AdvancedConfig } from '../types';

async function request(path: string, body: unknown): Promise<Response> {
  const response = await fetch(path, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed (${response.status}). Please try again.`);
  }
  return response;
}
export async function detectAIContent(mediaType: MediaType, content: string, mimeType: string | undefined, config: {preset:AnalysisPreset;focus:AnalysisFocus;advanced:AdvancedConfig}): Promise<AnalysisResult> {
  return (await request('/api/analyze', {mediaType,content,mimeType,config})).json();
}
export async function* streamChatMessage(history: {role:string;parts:{text:string}[]}[], newMessage: string) {
  const response = await request('/api/chat', {history:history.slice(-24),newMessage});
  if (!response.body) throw new Error('The chat service returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const {value,done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value,{stream:true});
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1);
        if (!line) continue;
        const part = JSON.parse(line);
        if (part.error) throw new Error(part.error);
        if (part.text) yield part.text as string;
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
