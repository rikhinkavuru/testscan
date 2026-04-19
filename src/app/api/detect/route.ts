import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// gpt-4o excels at vision tasks and OCR-like text extraction from images.
// Using "high" detail mode ensures the model receives full-resolution image
// tiles, which is critical for accurately reading small or dense exam text.
// gpt-4o-mini with "low" detail was misreading text and producing wrong answers.
const DETECT_MODEL = "gpt-4o";
const IMAGE_DETAIL: "low" | "high" | "auto" = "high";

interface DetectedQuestion {
  question_text: string;
  question_type: string;
  options: string[];
}

interface DetectResponse {
  questions: DetectedQuestion[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isDetectedQuestion(value: unknown): value is DetectedQuestion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.question_text === 'string' &&
    typeof candidate.question_type === 'string' &&
    Array.isArray(candidate.options)
  );
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  try {
    const openai = getOpenAIClient();
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: DETECT_MODEL,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an expert OCR and document analysis system. Your job is to extract all exam/test questions from the provided image with perfect accuracy. Read every word carefully, preserving the exact original text including numbers, symbols, and formatting. Return JSON: {\"questions\":[{\"question_text\":\"...\",\"question_type\":\"multiple_choice|true_false|fill_in_blank|free_response\",\"options\":[\"...\"]}]}. If no questions are visible: {\"questions\":[]}."
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: IMAGE_DETAIL
              }
            }
          ]
        }
      ],
    });

    const content = response.choices[0].message?.content || '{"questions": []}';
    let data: DetectResponse = { questions: [] };
    try {
      const parsed = JSON.parse(content) as { questions?: unknown };
      data = {
        questions: Array.isArray(parsed.questions)
          ? parsed.questions.filter(isDetectedQuestion)
          : []
      };
    } catch {
      data = { questions: [] };
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in detect route:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to detect questions', questions: [] }, { status: 500 });
  }
}
