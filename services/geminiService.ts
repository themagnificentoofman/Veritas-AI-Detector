import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, MediaType, AnalysisPreset, AnalysisFocus, AdvancedConfig } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to clean JSON string if markdown code blocks are present
const cleanJsonString = (str: string): string => {
  return str.replace(/^```json\s*/, '').replace(/\s*```$/, '');
};

export const detectAIContent = async (
  mediaType: MediaType,
  content: string, // text or base64
  mimeType: string | undefined,
  config: { 
    preset: AnalysisPreset; 
    focus: AnalysisFocus;
    advanced: AdvancedConfig;
  }
): Promise<AnalysisResult> => {
  
  const modelName = 'gemini-3-pro-preview';
  
  // Construct dynamic instructions based on presets
  let presetInstruction = "";
  switch (config.preset) {
    case 'sensitive':
      presetInstruction = "MODE: SENSITIVE/STRICT. Lower your threshold for detecting AI. Scrutinize micro-anomalies aggressively. If patterns match generative algorithms even slightly, flag them. Useful for deepfake security.";
      break;
    case 'conservative':
      presetInstruction = "MODE: CONSERVATIVE/PERMISSIVE. High burden of proof required for AI verdict. Assume content is human or digitally edited unless artifacts are impossible to explain otherwise. Favor 'Likely Human' for artistic styles.";
      break;
    case 'balanced':
    default:
      presetInstruction = "MODE: BALANCED/NEUTRAL. Maintain a scientific, objective stance. Weigh evidence equally. Require substantial consistency errors to classify as AI. Distinguish between 'bad quality' and 'AI generated'.";
      break;
  }

  // Construct focus instructions
  let focusInstruction = "";
  switch (config.focus) {
    case 'people':
      focusInstruction = "FOCUS AREA: HUMAN SUBJECTS. Pay extreme attention to biological consistency: iris symmetry, pupil shape, skin texture (pores vs smoothness), hand/finger anatomy, teeth alignment, and hair physics.";
      break;
    case 'documents':
      focusInstruction = "FOCUS AREA: DOCUMENTS/TEXT. Pay attention to font consistency, character rendering artifacts, layout geometry, logical coherence of text, and paper texture/lighting continuity.";
      break;
    case 'art':
      focusInstruction = "FOCUS AREA: ART/DESIGN. Analyze brush stroke logic, composition consistency, lighting coherence, and medium-specific textures. Distinguish between human digital art styles and diffusion noise.";
      break;
    case 'general':
    default:
      focusInstruction = "FOCUS AREA: GENERAL. Look for global consistency, physics engines (lighting/shadows), and standard generative artifacts (warping, spectral cutoffs).";
      break;
  }

  // Construct depth instructions
  let depthInstruction = "";
  switch (config.advanced.reasoningDepth) {
      case 'concise':
          depthInstruction = "OUTPUT STYLE: CONCISE. Provide short, punchy reasoning. Focus only on the single most damning piece of evidence. Keep the explanation under 50 words.";
          break;
      case 'exhaustive':
          depthInstruction = "OUTPUT STYLE: EXHAUSTIVE. Provide a detailed step-by-step forensic breakdown. Mention minor anomalies and edge cases. Explain the 'why' behind the verdict in depth (150-200 words).";
          break;
      case 'standard':
      default:
          depthInstruction = "OUTPUT STYLE: STANDARD. Provide a clear, balanced explanation citing the top 2-3 factors (80-120 words).";
          break;
  }

  let parts: any[] = [];
  
  if (mediaType === MediaType.TEXT) {
    parts.push({ text: `Analyze the following text for AI generation patterns.\n\n${presetInstruction}\n${focusInstruction}\n${depthInstruction}\n\nBe skeptical and look for specific LLM habits (overuse of transition words, lack of personal anecdote, uniform sentence structure). If the text feels natural, conversational, or contains specific human errors/nuances, classify as human:\n\n${content}` });
  } else {
    // For Image, Audio, Video
    if (!mimeType) throw new Error("MimeType is required for media files");
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: content // base64 string
      }
    });
    // Enhanced prompt with config context
    parts.push({ text: `Analyze the attached media file for authenticity.\n\nCONFIGURATION:\n1. ${presetInstruction}\n2. ${focusInstruction}\n3. ${depthInstruction}\n\nPROCEDURE:\n1. Search for distinct evidence of HUMAN origin (sensor noise, physics, specific imperfections).\n2. Search for distinct evidence of AI generation based on the Focus Area.\n3. Weigh the evidence according to the selected Mode.\n4. CRITICAL: Do not confuse compression/low-res with AI artifacts.` });
  }

  // Define schema for deterministic output
  const schema = {
    type: Type.OBJECT,
    properties: {
      probabilityAI: { type: Type.NUMBER, description: "Probability score (0-100). <50 indicates likely human, >50 indicates likely AI." },
      label: { type: Type.STRING, enum: ["Likely AI", "Likely Human", "Mixed/Uncertain"], description: "Final classification label." },
      confidence: { type: Type.NUMBER, description: "Confidence score (0-100) in your assessment." },
      reasoning: { type: Type.STRING, description: "Detailed explanation citing specific artifacts or human traits found." },
      keyFeatures: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT,
          properties: {
            feature: { type: Type.STRING, description: "Short name (2-5 words) of the feature or artifact." },
            impactScore: { type: Type.NUMBER, description: "Impact score (0-100) indicating how strongly this feature influenced the result." }
          },
          required: ["feature", "impactScore"]
        },
        description: "List of 3-6 specific features with their impact scores." 
      }
    },
    required: ["probabilityAI", "label", "confidence", "reasoning", "keyFeatures"]
  };

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: `You are a forensic AI content detector. Your goal is to provide a scientifically grounded assessment of media authenticity. ${presetInstruction}`,
        temperature: config.advanced.temperature,
        topP: config.advanced.topP,
        topK: config.advanced.topK
      }
    });

    const resultText = response.text || "{}";
    return JSON.parse(cleanJsonString(resultText)) as AnalysisResult;

  } catch (error: any) {
    console.error("Analysis Failed", error);
    // Propagate the actual error message so the UI can show "Payload too large" or "Invalid MIME type"
    throw new Error(error.message || "Failed to analyze content. Please try again.");
  }
};

export const streamChatMessage = async function* (
  history: { role: string; parts: { text: string }[] }[],
  newMessage: string
) {
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    history: history,
    config: {
      temperature: 0.7,
      systemInstruction: "You are Veritas, a helpful AI assistant integrated into a content detection app. You help users understand AI technology, deepfakes, and content verification."
    }
  });

  const result = await chat.sendMessageStream({ message: newMessage });
  
  for await (const chunk of result) {
    yield chunk.text;
  }
};