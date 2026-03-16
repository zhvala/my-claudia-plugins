/**
 * Event Logger Plugin - Tests event subscription and storage
 *
 * Tests: events.on (multiple events), storage persistence, event data capture
 */

const MAX_EVENTS = 500;
const EVENTS_KEY = 'eventLog';

const TRACKED_EVENTS = [
  'run.started', 'run.completed', 'run.error',
  'run.message', 'run.toolCall', 'run.toolResult',
  'session.created', 'session.deleted', 'session.archived',
  'project.opened', 'project.closed',
  'plugin.loaded', 'plugin.activated', 'plugin.deactivated', 'plugin.error',
  'provider.changed',
];

let eventLog = [];
let unsubscribers = [];

async function loadLog(storage) {
  const saved = await storage.get(EVENTS_KEY);
  return Array.isArray(saved) ? saved : [];
}

async function persistLog(storage) {
  // Keep only the last MAX_EVENTS
  if (eventLog.length > MAX_EVENTS) {
    eventLog = eventLog.slice(-MAX_EVENTS);
  }
  await storage.set(EVENTS_KEY, eventLog);
}

export async function activate(ctx) {
  ctx.log.info('Event Logger plugin activating...');

  // Load persisted events
  eventLog = await loadLog(ctx.storage);
  ctx.log.info(`Loaded ${eventLog.length} persisted event(s)`);

  // Subscribe to all tracked events
  for (const eventType of TRACKED_EVENTS) {
    const unsub = ctx.events.on(eventType, async (data) => {
      const entry = {
        type: eventType,
        timestamp: new Date().toISOString(),
        data: summarizeData(data)
      };
      eventLog.push(entry);

      // Persist every 10 events to reduce I/O
      if (eventLog.length % 10 === 0) {
        await persistLog(ctx.storage);
      }
    });
    unsubscribers.push(unsub);
  }

  // Register /events command
  ctx.commands.registerCommand('/events', async (args) => {
    const limit = parseInt(args[0], 10) || 10;
    const recent = eventLog.slice(-limit).reverse();
    return {
      type: 'builtin',
      command: '/events',
      data: {
        message: `Showing last ${recent.length} of ${eventLog.length} events`,
        events: recent
      }
    };
  });

  // Register /events:clear command
  ctx.commands.registerCommand('/events:clear', async () => {
    const count = eventLog.length;
    eventLog = [];
    await ctx.storage.set(EVENTS_KEY, []);
    return {
      type: 'builtin',
      command: '/events:clear',
      data: { message: `Cleared ${count} event(s)` }
    };
  });

  // Register /events:stats command
  ctx.commands.registerCommand('/events:stats', async () => {
    const stats = {};
    for (const e of eventLog) {
      stats[e.type] = (stats[e.type] || 0) + 1;
    }
    return {
      type: 'builtin',
      command: '/events:stats',
      data: {
        message: `${eventLog.length} events recorded`,
        total: eventLog.length,
        byType: stats,
        oldest: eventLog[0]?.timestamp || null,
        newest: eventLog[eventLog.length - 1]?.timestamp || null
      }
    };
  });

  // Register query_events tool
  ctx.tools.registerTool({
    id: 'query_events',
    name: 'query_events',
    description: 'Query the event log. Can filter by event type, time range, or search in event data.',
    parameters: {
      type: 'object',
      properties: {
        eventType: { type: 'string', description: 'Filter by event type' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        search: { type: 'string', description: 'Search keyword in event data' }
      }
    },
    handler: async (args) => {
      let results = [...eventLog];

      if (args.eventType) {
        results = results.filter(e => e.type === args.eventType);
      }

      if (args.search) {
        const q = String(args.search).toLowerCase();
        results = results.filter(e =>
          JSON.stringify(e.data).toLowerCase().includes(q)
        );
      }

      const limit = Number(args.limit) || 20;
      results = results.slice(-limit).reverse();

      return JSON.stringify({
        count: results.length,
        total: eventLog.length,
        events: results
      });
    }
  });

  // Register get_event_stats tool
  ctx.tools.registerTool({
    id: 'get_event_stats',
    name: 'get_event_stats',
    description: 'Get statistics about recorded events.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const stats = {};
      for (const e of eventLog) {
        stats[e.type] = (stats[e.type] || 0) + 1;
      }
      return JSON.stringify({
        total: eventLog.length,
        byType: stats,
        trackedEvents: TRACKED_EVENTS,
        oldest: eventLog[0]?.timestamp || null,
        newest: eventLog[eventLog.length - 1]?.timestamp || null
      });
    }
  });

  ctx.log.info('Event Logger plugin activated successfully');
}

export async function deactivate() {
  // Unsubscribe from all events
  for (const unsub of unsubscribers) {
    if (typeof unsub === 'function') unsub();
  }
  unsubscribers = [];

  console.log('[Event Logger Plugin] Deactivated');
}

// Summarize event data to avoid storing huge payloads
function summarizeData(data) {
  if (!data || typeof data !== 'object') return data;

  const summary = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > 200) {
      summary[key] = value.slice(0, 200) + '...';
    } else if (Array.isArray(value)) {
      summary[key] = `[Array(${value.length})]`;
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = '{...}';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
