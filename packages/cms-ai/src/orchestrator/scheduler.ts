import type { AgentConfig } from './types.js';

const WINDOW_MINUTES = 5;

export class AgentScheduler {
  shouldRun(agent: AgentConfig, now: Date): boolean {
    if (!agent.active || !agent.schedule.enabled) return false;
    if (agent.schedule.frequency === 'manual') return false;

    if (agent.schedule.frequency === 'weekly' && now.getDay() !== 1) {
      return false; // Only Mondays
    }

    const { hours, minutes } = this.parseTime(agent.schedule.time);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduleMinutes = hours * 60 + minutes;
    const diff = Math.abs(nowMinutes - scheduleMinutes);

    return diff <= WINDOW_MINUTES || diff >= 1440 - WINDOW_MINUTES;
  }

  getDueAgents(agents: AgentConfig[], now?: Date): AgentConfig[] {
    const timestamp = now ?? new Date();
    return agents.filter(a => this.shouldRun(a, timestamp));
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } {
    const [h, m] = timeStr.split(':');
    return {
      hours: parseInt(h ?? '0', 10),
      minutes: parseInt(m ?? '0', 10),
    };
  }
}
