import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// gpt-4o provides stronger reasoning for solving academic questions across
// STEM, humanities, and other domains. Worth the cost increase over gpt-4o-mini
// because accuracy on answers is the primary value proposition of this tool.
const SOLVE_MODEL = "gpt-4o";

interface SolveResult {
  id: string;
  answer: string | null;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  selected_option: string | null;
}

interface BatchQuestion {
  id: string;
  question_text: string;
  options?: string[];
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey });
}

// Process questions in batches to stay within model context limits.
const BATCH_SIZE = 25;
// Budget ~200 output tokens per question for answer + explanation.
const TOKENS_PER_QUESTION = 200;

export async function POST(req: Request) {
  try {
    const openai = getOpenAIClient();
    const body = await req.json();

    // Support batch mode: { questions: [...] }
    const questions: BatchQuestion[] = Array.isArray(body.questions) ? body.questions : [];

    if (questions.length === 0) {
      return NextResponse.json({ answers: [] });
    }

    const allResults: SolveResult[] = [];

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);

      const questionsText = batch.map((q, idx) => {
        const opts = q.options && q.options.length > 0 ? ` Options: ${q.options.join('; ')}` : '';
        return `${idx + 1}. [${q.id}] ${q.question_text}${opts}`;
      }).join('\n');

      const response = await openai.chat.completions.create({
        model: SOLVE_MODEL,
        max_tokens: Math.min(4096, batch.length * TOKENS_PER_QUESTION),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an expert academic problem solver. Solve each exam question accurately and thoroughly. Show your reasoning. Return JSON: {\"answers\":[{\"id\":\"...\",\"answer\":\"...\",\"explanation\":\"step-by-step reasoning\",\"confidence\":\"high|medium|low\",\"selected_option\":\"letter or null\"}]}."
          },
          {
            role: "user",
            content: questionsText
          }
        ],
      });

      const content = response.choices[0].message?.content || '{"answers":[]}';
      try {
        const parsed = JSON.parse(content) as { answers?: SolveResult[] };
        if (Array.isArray(parsed.answers)) {
          allResults.push(...parsed.answers);
        }
      } catch {
        // If parsing fails for this batch, push null results
        for (const q of batch) {
          allResults.push({ id: q.id, answer: null, explanation: 'Parse error', confidence: 'low', selected_option: null });
        }
      }
    }

    return NextResponse.json({ answers: allResults });
  } catch (error: unknown) {
    console.error('Error in solve route:', error);
    return NextResponse.json({ answers: [] }, { status: 200 });
  }
}
