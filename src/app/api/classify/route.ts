import { NextResponse } from 'next/server';
import OpenAI from 'openai';

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

    const first5 = questions
      .slice(0, 5)
      .map((q) => q.question_text ?? '')
      .join('\n---\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "What academic subject is this exam? Return ONLY ONE word exactly from this list: Math, Algebra, Calculus, Biology, Chemistry, Physics, History, English, Economics, Psychology, or Other. Do not include any punctuation."
        },
        {
          role: "user",
          content: first5
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
