/**
 * Echo Plugin - Simplest plugin for testing basic tool + command registration
 *
 * Tests: tool registration, command registration, storage, basic lifecycle
 */

let callCount = 0;

export async function activate(ctx) {
  ctx.log.info('Echo plugin activating...');

  // Restore call count from storage
  const saved = await ctx.storage.get('callCount');
  if (typeof saved === 'number') callCount = saved;

  // Register /echo command
  ctx.commands.registerCommand('/echo', async (args) => {
    const text = args.join(' ');
    if (!text) {
      return {
        type: 'builtin',
        command: '/echo',
        error: 'Usage: /echo <message>'
      };
    }

    callCount++;
    await ctx.storage.set('callCount', callCount);

    return {
      type: 'builtin',
      command: '/echo',
      data: { message: text, callCount }
    };
  });

  // Register /echo:stats command
  ctx.commands.registerCommand('/echo:stats', async () => {
    return {
      type: 'builtin',
      command: '/echo:stats',
      data: {
        message: `Echo has been called ${callCount} time(s)`,
        callCount
      }
    };
  });

  // Register echo_tool
  ctx.tools.registerTool({
    id: 'echo_tool',
    name: 'echo_tool',
    description: 'Echoes back the input text, optionally transformed (uppercase, reverse, repeat).',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to echo back' },
        transform: {
          type: 'string',
          enum: ['none', 'uppercase', 'lowercase', 'reverse'],
          description: 'Optional transformation to apply'
        }
      },
      required: ['text']
    },
    handler: async (args) => {
      let text = String(args.text || '');
      const transform = args.transform || 'none';

      switch (transform) {
        case 'uppercase': text = text.toUpperCase(); break;
        case 'lowercase': text = text.toLowerCase(); break;
        case 'reverse': text = text.split('').reverse().join(''); break;
      }

      callCount++;
      await ctx.storage.set('callCount', callCount);

      return JSON.stringify({
        success: true,
        echo: text,
        transform,
        callCount
      });
    }
  });

  ctx.log.info('Echo plugin activated successfully');
}

export function deactivate() {
  console.log('[Echo Plugin] Deactivated');
}
