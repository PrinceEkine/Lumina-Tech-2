import { GoogleGenAI } from "@google/genai";

async function generateLogo() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: 'A modern, minimalist tech logo for a company named "Lumina Tech". The logo should feature a stylized "L" or a light-related symbol (like a prism or a glowing node) with a sleek, futuristic aesthetic. Colors: Cyan, Deep Blue, and White. Professional and high-quality.',
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const base64Data = part.inlineData.data;
      console.log("LOGO_BASE64_START");
      console.log(base64Data);
      console.log("LOGO_BASE64_END");
    }
  }
}

generateLogo();
