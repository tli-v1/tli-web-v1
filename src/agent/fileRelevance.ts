import { minervaModel } from "./initialize";

export interface ImageRelevanceResult {
  analyzed: boolean;
  relevant: boolean;
  reason: string;
}

const maxAnalyzableImageBytes = 8 * 1024 * 1024;

export function canAnalyzeImage(file: File): boolean {
  return file.type.startsWith("image/") && file.size <= maxAnalyzableImageBytes;
}

export async function analyzeImageRelevance(file: File): Promise<ImageRelevanceResult> {
  if (!canAnalyzeImage(file)) {
    return {
      analyzed: false,
      relevant: true,
      reason: "This file type was accepted without visual analysis.",
    };
  }

  try {
    const result = await minervaModel.generateContent([
      {
        text: [
          "Review this uploaded image for a legal case intake.",
          "Relevant images include accident scenes, vehicle damage, bodily injuries, property damage, police reports, medical bills, insurance documents, claim documents, court papers, or other evidence tied to a legal dispute.",
          "Irrelevant images include selfies, memes, unrelated screenshots, entertainment images, food, landscapes, or anything that does not appear connected to a legal matter.",
          "Return JSON only with this exact shape: {\"relevant\":true,\"reason\":\"short reason\"}.",
        ].join(" "),
      },
      {
        inlineData: {
          mimeType: file.type || "image/jpeg",
          data: await fileToBase64(file),
        },
      },
    ]);

    return parseImageReview(result.response.text());
  } catch (error) {
    console.warn("Unable to analyze uploaded image relevance:", error);
    return {
      analyzed: false,
      relevant: true,
      reason: "The image could not be analyzed, so it was accepted for attorney review.",
    };
  }
}

function parseImageReview(text: string): ImageRelevanceResult {
  const jsonText = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(jsonText) as { relevant?: unknown; reason?: unknown };

  return {
    analyzed: true,
    relevant: parsed.relevant === true,
    reason: typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "Image review completed.",
  };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
