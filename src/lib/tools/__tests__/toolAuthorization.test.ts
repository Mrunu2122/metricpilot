import { describe, it, expect } from 'vitest';
import { executeToolByName, isValidToolName } from '../registry';

describe('Tool Registry Authorization and Parameter Validation', () => {
  it('blocks unregistered tools (SQL, Shell, System commands)', () => {
    const tools = ['execute_sql', 'shell_exec', 'fs_read', 'run_command', 'eval', 'exec'];
    for (const tool of tools) {
      expect(isValidToolName(tool)).toBe(false);
      const res = executeToolByName(tool, {});
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain('Unauthorized or non-existent tool');
      }
    }
  });

  it('validates tool parameters with Zod and rejects malformed inputs safely', () => {
    // 1. get_metric with invalid month format
    const res1 = executeToolByName('get_metric', { metric: 'revenue', month: 12345 });
    expect(res1.success).toBe(false);
    if (!res1.success) expect(res1.error).toBeDefined();

    // 2. compare_periods with missing metric
    const res2 = executeToolByName('compare_periods', { baseMonth: '2024-06', targetMonth: '2024-07' });
    expect(res2.success).toBe(false);
    if (!res2.success) expect(res2.error).toBeDefined();

    // 3. calculate_growth with invalid metric type
    const res3 = executeToolByName('calculate_growth', { metric: 'arbitrary_metric', startMonth: '2024-01', endMonth: '2024-02' });
    expect(res3.success).toBe(false);

    // 4. get_top_performers with limit out of range (limit > 5)
    const res4 = executeToolByName('get_top_performers', { month: '2024-07', limit: 100 });
    expect(res4.success).toBe(false);
  });
});
