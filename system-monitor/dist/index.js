/**
 * System Monitor Plugin
 * Opens the System Monitor UI panel in the bottom panel area.
 */

export async function activate(ctx) {
  ctx.log.info('System Monitor plugin activated');

  ctx.commands.registerCommand('/sysmon', async (_args, _context) => {
    ctx.ui.showPanel('system-monitor');
    return {
      type: 'builtin',
      command: '/sysmon',
      action: 'show_panel',
      data: { message: 'System Monitor panel opened' }
    };
  });
}

export async function deactivate() {}
