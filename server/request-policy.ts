export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const MAX_BODY_BYTES = 12 * 1024 * 1024;
export function authorize(request: Request): string {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) throw new RequestError(401, 'Sign in to use Veritas.');
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new RequestError(403, 'This request must come from Veritas.');
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RequestError(415, 'JSON is required.');
  return userId;
}
export async function readJson(request: Request, maximum = MAX_BODY_BYTES): Promise<any> {
  const length = Number(request.headers.get('content-length'));
  if (length > maximum) throw new RequestError(413, 'Upload is too large. Use a file of 8 MB or less, or video frame sampling.');
  if (!request.body) throw new RequestError(400, 'A request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new RequestError(413, 'Upload is too large.'); }
      chunks.push(part.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(body)); }
    catch { throw new RequestError(400, 'Invalid JSON.'); }
  } finally { reader.releaseLock(); }
}
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const mediaTypes = new Set(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']);
const supportedMime = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','audio/wav','audio/x-wav','audio/mp3','audio/mpeg','audio/aac','audio/ogg','audio/flac','audio/x-m4a','audio/mp4','audio/webm','audio/aiff','audio/x-aiff','audio/opus','video/mp4','video/mpeg','video/quicktime','video/x-msvideo','video/webm','video/3gpp','video/x-matroska','video/x-flv','video/x-ms-wmv']);
export function validateAnalysis(body: any): void {
  if (!isObject(body) || !mediaTypes.has(body.mediaType) || typeof body.content !== 'string' || !body.content.trim()) throw new RequestError(400, 'Provide text or supported media.');
  if (body.mediaType === 'TEXT') {
    if (body.content.length > 100_000) throw new RequestError(413, 'Text must be 100,000 characters or fewer.');
  } else {
    if (body.content.length > Math.ceil(8 * 1024 * 1024 / 3) * 4) throw new RequestError(413, 'Media must be 8 MB or smaller.');
    if (!supportedMime.has(body.mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content) || body.content.length % 4 !== 0) throw new RequestError(400, 'Invalid media encoding or file type.');
  }
  const c = body.config;
  if (!isObject(c) || !['balanced','sensitive','conservative'].includes(c.preset) || !['general','people','documents','art'].includes(c.focus) || !isObject(c.advanced)) throw new RequestError(400, 'Invalid analysis settings.');
  const a = c.advanced;
  if (!numberIn(a.temperature,0,1) || !numberIn(a.topP,0,1) || !numberIn(a.topK,1,40) || !Number.isInteger(a.topK) || !['concise','standard','exhaustive'].includes(a.reasoningDepth)) throw new RequestError(400, 'Invalid analysis settings.');
}
export function validateChat(body: any): void {
  if (!isObject(body) || typeof body.newMessage !== 'string' || !body.newMessage.trim() || body.newMessage.length > 8000 || !Array.isArray(body.history) || body.history.length > 24) throw new RequestError(400, 'Invalid chat message.');
  let total = body.newMessage.length;
  for (const message of body.history) {
    if (!isObject(message) || !['user','model'].includes(message.role) || !Array.isArray(message.parts) || message.parts.length !== 1 || !isObject(message.parts[0]) || typeof message.parts[0].text !== 'string') throw new RequestError(400, 'Invalid chat history.');
    total += message.parts[0].text.length;
  }
  if (total > 50_000) throw new RequestError(413, 'Chat history is too long. Start a new conversation.');
}
export function validateResult(result: any): void {
  if (!isObject(result) || !numberIn(result.probabilityAI,0,100) || !numberIn(result.confidence,0,100) || !['Likely AI','Likely Human','Mixed/Uncertain'].includes(result.label) || typeof result.reasoning !== 'string' || !Array.isArray(result.keyFeatures) || result.keyFeatures.length > 20 || result.keyFeatures.some((f: any) => !isObject(f) || typeof f.feature !== 'string' || !numberIn(f.impactScore,0,100))) throw new RequestError(502, 'The AI service returned an invalid result. Please try again.');
}
export function safeError(error: unknown): { status: number; message: string } {
  if (error instanceof RequestError) return { status: error.status, message: error.message };
  const status = (error as {status?: number})?.status;
  if (status === 429) return { status: 429, message: 'The AI service is busy. Please wait and try again.' };
  return { status: 502, message: 'The AI service could not complete this request. Please try again later.' };
}
