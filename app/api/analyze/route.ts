import { authorize, readJson, validateAnalysis, validateResult } from '../../../server/request-policy';
import { runtime, reserveQuota, errorResponse } from '../../../server/runtime';
import { detectAIContent } from '../../../server/gemini';
export async function POST(request: Request) {
  try {
    const user = authorize(request);
    const config = runtime();
    const body = await readJson(request);
    validateAnalysis(body);
    await reserveQuota(user);
    const result = await detectAIContent(body.mediaType, body.content, body.mimeType, body.config, config);
    validateResult(result);
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch (error) { return errorResponse(error); }
}
