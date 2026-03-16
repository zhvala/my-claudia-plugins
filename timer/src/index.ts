/**
 * Timer Plugin - Sample plugin demonstrating the plugin API
 *
 * This plugin provides:
 * - Commands: /timer, /timer:list, /timer:clear
 * - Tools: create_timer, check_timer, list_timers
 * - Storage persistence for timer state
 */

import type { PluginContext, CommandExecuteResponse } from '@my-claudia/shared';

interface Timer {
  id: string;
  label?: string;
  endTime: number;
  createdAt: number;
  duration: number;
}

// In-memory timer storage (persisted to storage API)
const timers = new Map<string, Timer>();
const timerTimeouts = new Map<string, NodeJS.Timeout>();

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.log.info('Timer plugin activating...');

  // Load persisted timers from storage
  const savedTimers = await ctx.storage.get<Timer[]>('timers');
  if (savedTimers && Array.isArray(savedTimers)) {
    const now = Date.now();
    for (const timer of savedTimers) {
      // Only restore timers that haven't expired
      if (timer.endTime > now) {
        timers.set(timer.id, timer);
        scheduleTimerNotification(ctx, timer);
      }
    }
    ctx.log.info(`Restored ${timers.size} active timer(s) from storage`);
  }

  // Register /timer command
  ctx.commands.registerCommand('/timer', async (args: string[]): Promise<CommandExecuteResponse> => {
    if (args.length === 0) {
      return {
        type: 'builtin',
        command: '/timer',
        error: 'Usage: /timer <seconds> [label]\nExample: /timer 60 "Take a break"'
      };
    }

    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds <= 0) {
      return {
        type: 'builtin',
        command: '/timer',
        error: 'Invalid duration. Please provide a positive number of seconds.'
      };
    }

    const label = args.slice(1).join(' ').replace(/^["']|["']$/g, '') || undefined;
    const timer = createTimer(ctx, seconds, label);

    return {
      type: 'builtin',
      command: '/timer',
      data: {
        message: `Timer set for ${formatDuration(seconds)}`,
        timerId: timer.id,
        label: timer.label,
        endsAt: new Date(timer.endTime).toISOString()
      }
    };
  });

  // Register /timer:list command
  ctx.commands.registerCommand('/timer:list', async (): Promise<CommandExecuteResponse> => {
    const activeTimers = Array.from(timers.values());
    if (activeTimers.length === 0) {
      return {
        type: 'builtin',
        command: '/timer:list',
        data: { message: 'No active timers' }
      };
    }

    const now = Date.now();
    const timerList = activeTimers.map(t => ({
      id: t.id,
      label: t.label || 'Untitled',
      remaining: Math.max(0, Math.ceil((t.endTime - now) / 1000)),
      total: t.duration
    }));

    return {
      type: 'builtin',
      command: '/timer:list',
      data: {
        message: `Active timers: ${timerList.length}`,
        timers: timerList
      }
    };
  });

  // Register /timer:clear command
  ctx.commands.registerCommand('/timer:clear', async (): Promise<CommandExecuteResponse> => {
    const count = timers.size;

    // Clear all timeouts
    for (const timeout of timerTimeouts.values()) {
      clearTimeout(timeout);
    }
    timerTimeouts.clear();
    timers.clear();

    // Clear storage
    await ctx.storage.set('timers', []);

    return {
      type: 'builtin',
      command: '/timer:clear',
      data: { message: `Cleared ${count} timer(s)` }
    };
  });

  // Register create_timer tool
  ctx.tools.registerTool({
    id: 'create_timer',
    name: 'create_timer',
    description: 'Create a countdown timer that will notify when complete.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Duration in seconds' },
        label: { type: 'string', description: 'Optional label for the timer' }
      },
      required: ['seconds']
    },
    handler: async (args: Record<string, unknown>): Promise<string> => {
      const seconds = args.seconds as number;
      const label = args.label as string | undefined;

      if (typeof seconds !== 'number' || seconds <= 0) {
        return JSON.stringify({ error: 'Invalid duration. Seconds must be a positive number.' });
      }

      const timer = createTimer(ctx, seconds, label);

      return JSON.stringify({
        success: true,
        timerId: timer.id,
        message: `Timer "${label || timer.id}" set for ${formatDuration(seconds)}`,
        endsAt: new Date(timer.endTime).toISOString()
      });
    }
  });

  // Register check_timer tool
  ctx.tools.registerTool({
    id: 'check_timer',
    name: 'check_timer',
    description: 'Check the status of a timer by its ID.',
    parameters: {
      type: 'object',
      properties: {
        timerId: { type: 'string', description: 'The timer ID to check' }
      },
      required: ['timerId']
    },
    handler: async (args: Record<string, unknown>): Promise<string> => {
      const timerId = args.timerId as string;
      const timer = timers.get(timerId);

      if (!timer) {
        return JSON.stringify({ error: 'Timer not found', timerId });
      }

      const now = Date.now();
      const remainingMs = timer.endTime - now;
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      const expired = remaining === 0;

      return JSON.stringify({
        timerId: timer.id,
        label: timer.label,
        remaining,
        remainingFormatted: formatDuration(remaining),
        total: timer.duration,
        expired,
        createdAt: new Date(timer.createdAt).toISOString()
      });
    }
  });

  // Register list_timers tool
  ctx.tools.registerTool({
    id: 'list_timers',
    name: 'list_timers',
    description: 'List all active timers with their remaining time.',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async (): Promise<string> => {
      const now = Date.now();
      const timerList = Array.from(timers.values()).map(t => ({
        id: t.id,
        label: t.label || 'Untitled',
        remaining: Math.max(0, Math.ceil((t.endTime - now) / 1000)),
        remainingFormatted: formatDuration(Math.max(0, Math.ceil((t.endTime - now) / 1000))),
        total: t.duration,
        expired: t.endTime <= now
      }));

      return JSON.stringify({
        count: timerList.length,
        timers: timerList
      });
    }
  });

  ctx.log.info('Timer plugin activated successfully');
}

export function deactivate(): void {
  // Clear all timeouts on deactivation
  for (const timeout of timerTimeouts.values()) {
    clearTimeout(timeout);
  }
  timerTimeouts.clear();
  console.log('[Timer Plugin] Deactivated');
}

// Helper functions

function createTimer(ctx: PluginContext, seconds: number, label?: string): Timer {
  const id = `timer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const timer: Timer = {
    id,
    label,
    endTime: now + seconds * 1000,
    createdAt: now,
    duration: seconds
  };

  timers.set(id, timer);
  persistTimers(ctx);
  scheduleTimerNotification(ctx, timer);

  return timer;
}

function scheduleTimerNotification(ctx: PluginContext, timer: Timer): void {
  const delay = timer.endTime - Date.now();

  if (delay <= 0) {
    // Timer already expired
    return;
  }

  const timeout = setTimeout(async () => {
    timers.delete(timer.id);
    timerTimeouts.delete(timer.id);
    await persistTimers(ctx);

    // Emit event
    await ctx.events.emit('timer.complete', {
      timerId: timer.id,
      label: timer.label,
      duration: timer.duration
    });

    // Show notification if available
    if (ctx.notifications) {
      try {
        await ctx.notifications.show('Timer Complete', timer.label || `Timer finished after ${formatDuration(timer.duration)}`);
      } catch (e) {
        ctx.log.warn('Failed to show notification:', e);
      }
    }

    ctx.log.info(`Timer ${timer.id} completed`);
  }, delay);

  timerTimeouts.set(timer.id, timeout);
}

async function persistTimers(ctx: PluginContext): Promise<void> {
  await ctx.storage.set('timers', Array.from(timers.values()));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} minute${mins !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
}
