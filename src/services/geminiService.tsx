// src/services/geminiService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export interface VocabResult {
  word: string;
  meaning: string;
  type: string;
  sentence: string;
}

// ======= RATE LIMIT CONTROL =======
let lastRequestTime = 0;
const MIN_INTERVAL = 2000; // 2 giây giữa các request

const waitForRateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < MIN_INTERVAL) {
    const waitTime = MIN_INTERVAL - elapsed;
    console.log(`⏳ Đợi ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
};

// ======= FALLBACK MODELS (thử lần lượt nếu model không khả dụng) =======
const MODELS_TO_TRY = [
  "gemini-1.5-flash", // Ổn định nhất, free tier tốt
  "gemini-1.5-flash-8b", // Nhẹ hơn
  "gemini-2.0-flash-exp", // Experimental, có thể free
];

export const analyzeImage = async (
  base64Image: string
): Promise<VocabResult | null> => {
  // Đợi đủ thời gian trước khi gọi API
  await waitForRateLimit();

  // Thử từng model cho đến khi thành công
  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`🔄 Đang thử model: ${modelName}`);

      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
          maxOutputTokens: 150,
        },
      });

      const prompt = `Analyze this image and identify the main object.
Return ONLY a valid JSON object (no markdown, no backticks):
{"word": "object name in English", "meaning": "nghĩa tiếng Việt", "type": "noun", "sentence": "a simple example sentence"}`;

      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg",
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().trim();

      console.log(`✅ Response từ ${modelName}:`, text);

      // Parse JSON (loại bỏ markdown nếu có)
      const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanText) as VocabResult;

      // Validate kết quả
      if (parsed.word && parsed.meaning && parsed.sentence) {
        console.log(`✨ Thành công với model: ${modelName}`);
        return parsed;
      }

      throw new Error("Invalid response structure");
    } catch (error: any) {
      console.error(`❌ Lỗi với ${modelName}:`, error.message);

      // Nếu là 404 (model không tồn tại), thử model tiếp theo
      if (
        error.message?.includes("404") ||
        error.message?.includes("not found")
      ) {
        console.log(`⚠️ Model ${modelName} không khả dụng, thử model khác...`);
        continue;
      }

      // Nếu là 429 (rate limit), DỪNG ngay
      if (error.message?.includes("429") || error.status === 429) {
        console.error("🚫 RATE LIMIT: Bạn đã vượt quá giới hạn API");
        throw new Error("RATE_LIMIT_EXCEEDED");
      }

      // Nếu là lỗi API key
      if (
        error.message?.includes("API_KEY") ||
        error.message?.includes("invalid")
      ) {
        console.error("🔑 API KEY không hợp lệ hoặc chưa được kích hoạt");
        throw new Error("INVALID_API_KEY");
      }

      // Lỗi khác - thử model tiếp theo
      continue;
    }
  }

  // Nếu tất cả models đều thất bại
  console.error("💥 Tất cả models đều thất bại");
  throw new Error("ALL_MODELS_FAILED");
};

// ======= KIỂM TRA API KEY CÓ HOẠT ĐỘNG KHÔNG =======
export const testAPIConnection = async (): Promise<{
  success: boolean;
  model?: string;
  error?: string;
}> => {
  try {
    for (const modelName of MODELS_TO_TRY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(
          'Say OK in JSON: {"status":"ok"}'
        );
        const text = result.response.text();

        if (text.includes("ok")) {
          return { success: true, model: modelName };
        }
      } catch (error: any) {
        if (error.message?.includes("404")) continue; // Thử model khác
        throw error; // Lỗi khác thì dừng
      }
    }
    return { success: false, error: "No working model found" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// Thêm vào geminiService.ts để test UI
export const analyzeImageMock = async (): Promise<VocabResult> => {
  await new Promise((r) => setTimeout(r, 2000)); // Giả lập delay
  return {
    word: "Apple",
    meaning: "Quả táo",
    type: "noun",
    sentence: "I eat an apple every day",
  };
};
