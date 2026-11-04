import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeMultiAgentWorkflow } from '@/lib/orchestrator/engine';

export const dynamic = 'force-dynamic';

export const OrchestrateRequestSchema = z.object({
  query: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Query parameter is required' : 'Query must be a string'),
    })
    .trim()
    .min(1, 'Query parameter cannot be empty')
    .max(2000, 'Query exceeds maximum allowed length of 2000 characters'),
  mode: z
    .enum(['mock', 'live'], {
      error: () => 'Mode must be either "mock" or "live"',
    })
    .default('mock'),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);

    if (rawBody === null || typeof rawBody !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = OrchestrateRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const errorMessage = issue ? issue.message : 'Invalid request payload';
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { query, mode } = parseResult.data;
    const forceMock = mode === 'mock';

    // Live multi-agent workflows executing multiple sequential LLM calls require 90s timeout
    const timeoutMs = forceMock ? 30000 : 90000;
    const result = await executeMultiAgentWorkflow(query, { forceMock, timeoutMs });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during orchestration';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
