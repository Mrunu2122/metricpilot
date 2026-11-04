import { ExecutionPlan, AnalystResult, EvidenceItem } from '@/types/agentContracts';
import { executeToolByName, isValidToolName, ToolName } from '@/lib/tools/registry';
import {
  ToolResult,
  GetMetricSuccess,
  ComparePeriodsSuccess,
  CalculateGrowthSuccess,
  GetChannelBreakdownSuccess,
  GetPerformersSuccess,
} from '@/types/tools';

export async function runDataAnalystAgent(plan: ExecutionPlan): Promise<AnalystResult> {
  const evidence: EvidenceItem[] = [];
  const failedTasks: string[] = [];

  for (const task of plan.subtasks) {
    try {
      if (!isValidToolName(task.tool)) {
        failedTasks.push(task.id);
        evidence.push({
          id: `ev-${task.id}-unauthorized`,
          taskId: task.id,
          tool: String(task.tool),
          parameters: task.parameters,
          result: { success: false, error: `Unauthorized tool: ${task.tool}` },
          sourceRef: `error:${task.id}`,
          summary: `Unauthorized tool blocked: ${task.tool}`,
        });
        continue;
      }

      const toolRes: ToolResult = executeToolByName(task.tool, task.parameters);

      if (toolRes.success) {
        let summary = '';
        if (task.tool === 'compare_periods') {
          const comp = toolRes as ComparePeriodsSuccess;
          summary = `${comp.metric} went from ${comp.basePeriod.value} (${comp.basePeriod.month}) to ${comp.targetPeriod.value} (${comp.targetPeriod.month}) [delta: ${comp.delta}, ${comp.percentageChange}%]`;
        } else if (task.tool === 'get_metric') {
          const m = toolRes as GetMetricSuccess;
          summary = `${m.metric} for ${m.month}${m.channel ? ' (' + m.channel + ')' : ''} was ${m.value}`;
        } else if (task.tool === 'calculate_growth') {
          const g = toolRes as CalculateGrowthSuccess;
          summary = `${g.metric} grew by ${g.growthRatePercentage}% from ${g.startMonth} to ${g.endMonth}`;
        } else if (task.tool === 'get_channel_breakdown') {
          const b = toolRes as GetChannelBreakdownSuccess;
          summary = `Retrieved breakdown across ${b.channels.length} channels for ${b.month}`;
        } else if (task.tool === 'get_bottom_performers' || task.tool === 'get_top_performers') {
          const p = toolRes as GetPerformersSuccess;
          const names = p.performers.map((item) => item.channel).join(', ');
          summary = `${task.tool === 'get_bottom_performers' ? 'Bottom' : 'Top'} performers by ${p.rankingMetric}: ${names}`;
        } else {
          summary = `Successfully executed ${task.tool}`;
        }

        evidence.push({
          id: `ev-${task.id}`,
          taskId: task.id,
          tool: task.tool,
          parameters: task.parameters,
          result: toolRes,
          sourceRef: toolRes.ref || `ref:${task.id}`,
          summary,
        });
      } else {
        failedTasks.push(task.id);
        evidence.push({
          id: `ev-${task.id}-err`,
          taskId: task.id,
          tool: task.tool,
          parameters: task.parameters,
          result: toolRes,
          sourceRef: `error:${task.id}`,
          summary: `Failed: ${toolRes.error || 'Unknown error'}`,
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failedTasks.push(task.id);
      evidence.push({
        id: `ev-${task.id}-exception`,
        taskId: task.id,
        tool: task.tool,
        parameters: task.parameters,
        result: { error: errorMsg },
        sourceRef: `exception:${task.id}`,
        summary: `Execution exception: ${errorMsg}`,
      });
    }
  }

  const allSucceeded = failedTasks.length === 0;
  const dataSummary = `Retrieved ${evidence.length} evidence records across ${plan.subtasks.length} subtasks. ${allSucceeded ? 'All tool calls succeeded.' : `${failedTasks.length} tasks encountered retrieval issues.`}`;

  return {
    evidence,
    allTasksSucceeded: allSucceeded,
    failedTasks,
    dataSummary,
  };
}
