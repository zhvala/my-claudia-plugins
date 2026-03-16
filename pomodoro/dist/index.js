/**
 * Pomodoro Timer Plugin — Server Side
 *
 * Minimal server module: just registers the /pomodoro command
 * that opens the HTML UI panel. All timer logic lives in ui/index.html.
 */

export async function activate(ctx) {
  ctx.log.info('Pomodoro Timer plugin activated');

  ctx.commands.registerCommand('/pomodoro', async () => {
    ctx.ui.showPanel('pomodoro');
    return {
      type: 'builtin',
      command: '/pomodoro',
      action: 'show_panel',
      data: { panelId: 'pomodoro', message: 'Pomodoro Timer opened' }
    };
  });
}

export async function deactivate() {}
