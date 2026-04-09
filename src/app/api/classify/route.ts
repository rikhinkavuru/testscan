import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { questions } = await req.json();

    if (!questions || questions.length === 0) {
      return NextResponse.json({ subject: 'Other' }, { status: 200 });
    }

    const first5 = questions.slice(0, 5).map((q: any) => q.question_text).join('\n---\n');

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
  } catch (error: any) {
    console.error('Error in classify route:', error);
    return NextResponse.json({ subject: 'Other' }, { status: 200 });
  }
}
