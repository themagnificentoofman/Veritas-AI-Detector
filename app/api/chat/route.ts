import { authorize, readJson, validateChat, safeError } from '../../../server/request-policy';
import { runtime, reserveQuota, errorResponse } from '../../../server/runtime';
import { streamChatMessage } from '../../../server/gemini';
export async function POST(request: Request) {
  try {
    const user = authorize(request);
    const config = runtime();
    const body = await readJson(request, 256 * 1024);
    validateChat(body);
    await reserveQuota(user);
    const generator = streamChatMessage(body.history, body.newMessage, config);
    // Wait for the upstream before committing a streaming success status.
    const first = await generator.next();
    const encoder = new TextEncoder();
    let initial = true;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = initial ? first : await generator.next();
          initial = false;
          if (next.done) { controller.close(); return; }
          controller.enqueue(encoder.encode(JSON.stringify({text:next.value || ''})+'\n'));
        } catch (error) {
          controller.enqueue(encoder.encode(JSON.stringify({error:safeError(error).message})+'\n'));
          controller.close();
        }
      },
      async cancel() { await generator.return(undefined); },
    });
    return new Response(stream, {headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) { return errorResponse(error); }
}
