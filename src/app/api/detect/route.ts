import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an exam assistant. Look at this frame from a screen recording of someone scrolling through a test. Extract every visible question. Return a JSON object with a single key 'questions' representing an array: { \"questions\": [{ \"question_text\": \"\", \"question_type\": \"multiple_choice|true_false|fill_in_blank|free_response\", \"options\": [\"string\"] }] }. If no question is visible, return { \"questions\": [] }."
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
    });

    const content = response.choices[0].message?.content || '{"questions": []}';
    let data;
    try {
        data = JSON.parse(content);
    } catch(e) {
        data = { questions: [] };
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in detect route:', error);
    return NextResponse.json({ error: error.message || 'Failed to detect questions', questions: [] }, { status: 500 });
  }
}
