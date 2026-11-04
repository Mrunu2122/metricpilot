import { NextRequest, NextResponse } from 'next/server';
import { runEvaluationSuite } from '@/lib/eval/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const forceMock = typeof body.forceMock === 'boolean' ? body.forceMock : true;

    const report = await runEvaluationSuite({ forceMock });
    return NextResponse.json(report);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes('GEMINI_API_KEY') ? 400 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
