import { NextResponse } from 'next/server';
import { getGeminiClient, DEFAULT_MODEL } from '@/lib/llm/gemini';
import fs from 'fs';
import path from 'path';

// Force dynamic execution to prevent any static route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const rawKey = process.env.GEMINI_API_KEY;
  const rawModel = process.env.GEMINI_MODEL;

  // Safe diagnostics: reports ONLY existence and non-emptiness, never secret values
  const keyExists = typeof rawKey === 'string';
  const keyNonEmpty = keyExists && rawKey.trim().length > 0 && rawKey !== 'YOUR_GEMINI_API_KEY';

  // Check file presence on disk in project root
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const envPath = path.resolve(process.cwd(), '.env');
  const envLocalExistsOnDisk = fs.existsSync(envLocalPath);
  const envExistsOnDisk = fs.existsSync(envPath);

  const hasClient = !!getGeminiClient();

  return NextResponse.json(
    {
      geminiConfigured: hasClient,
      configuredModel: rawModel || DEFAULT_MODEL,
      modes: ['mock', 'live'],
      diagnostics: {
        keyEnvExists: keyExists,
        keyNonEmpty,
        modelEnvExists: typeof rawModel === 'string',
        envLocalExistsOnDisk,
        envExistsOnDisk,
        cwd: process.cwd(),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
