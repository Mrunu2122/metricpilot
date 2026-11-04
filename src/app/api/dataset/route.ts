import { NextResponse } from 'next/server';
import datasetRaw from '@/data/businessMetrics.json';

export async function GET() {
  return NextResponse.json(datasetRaw);
}
