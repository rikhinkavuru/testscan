import { NextResponse } from 'next/server';
import OpenAI from 'openai';

interface SolveResponse {
  answer: string | null;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  selected_option: string | null;
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
    const { question_text, question_type, options } = await req.json();

    if (!question_text) {
      return NextResponse.json({ error: 'No question text provided' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an expert tutor. Solve this exam question. Show step-by-step reasoning. For multiple choice, state the correct letter and explain why. Return JSON exactly matching this format: { \"answer\": \"string\", \"explanation\": \"string\", \"confidence\": \"high|medium|low\", \"selected_option\": \"string|null\" }"
        },
        {
          role: "user",
          content: `Question: ${question_text}\nType: ${question_type}\nOptions: ${JSON.stringify(options || [])}`
        }
      ],
    });

    const content = response.choices[0].message?.content || '{}';
    let data: SolveResponse;
    try {
      data = JSON.parse(content) as SolveResponse;
    } catch {
      throw new Error("Invalid format from LLM");
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in solve route:', error);
    return NextResponse.json({ answer: null, explanation: 'Failed to solve due to an error.', confidence: 'low', selected_option: null }, { status: 200 });
  }
}
