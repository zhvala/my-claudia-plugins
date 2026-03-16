/**
 * Notes Board Plugin
 * Opens the visual Notes Board UI panel in the bottom panel area.
 */

export async function activate(ctx) {
  ctx.log.info('Notes Board plugin activated');

  ctx.commands.registerCommand('/board', async (_args, _context) => {
    ctx.ui.showPanel('notes-board');
    return {
      type: 'builtin',
      command: '/board',
      action: 'show_panel',
      data: { message: 'Notes Board panel opened' }
    };
  });
}

export async function deactivate() {}
