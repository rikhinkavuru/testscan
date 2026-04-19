import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// gpt-4o-mini is ideal for simple classification — fast, cheap, and accurate
// enough for mapping questions to a single subject label. No need for a
// heavier model on this trivial task.
const CLASSIFY_MODEL = "gpt-4o-mini";

interface ClassifyQuestion {
  question_text?: string;
}

interface ClassifyRequestBody {
  questions?: ClassifyQuestion[];
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
    const body = (await req.json()) as ClassifyRequestBody;
    const questions = Array.isArray(body.questions) ? body.questions : [];

    if (!questions || questions.length === 0) {
      return NextResponse.json({ subject: 'Other' }, { status: 200 });
    }

    const first3 = questions
      .slice(0, 3)
      .map((q) => q.question_text ?? '')
      .join('\n');

    const response = await openai.chat.completions.create({
      model: CLASSIFY_MODEL,
      max_tokens: 32,
      messages: [
        {
          role: "system",
          content: "Return ONE word for the academic subject: Math, Algebra, Calculus, Biology, Chemistry, Physics, History, English, Economics, Psychology, or Other."
        },
        {
          role: "user",
          content: first3
        }
      ],
    });

    const subject = response.choices[0].message?.content?.trim() || 'Other';

    return NextResponse.json({ subject });
  } catch (error: unknown) {
    console.error('Error in classify route:', error);
    return NextResponse.json({ subject: 'Other' }, { status: 200 });
  }
}
