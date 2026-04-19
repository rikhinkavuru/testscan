import { NextResponse } from 'next/server';
import OpenAI from 'openai';

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
      model: "gpt-4o-mini",
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Extract all exam questions from this image. Return JSON: {\"questions\":[{\"question_text\":\"...\",\"question_type\":\"multiple_choice|true_false|fill_in_blank|free_response\",\"options\":[\"...\"]}]}. If none visible: {\"questions\":[]}."
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low"
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
