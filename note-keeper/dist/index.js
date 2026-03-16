/**
 * Note Keeper Plugin - Tests storage API with CRUD operations
 *
 * Tests: storage.get/set/delete/keys, complex data structures, search
 */

const NOTES_KEY = 'notes';

async function loadNotes(storage) {
  const notes = await storage.get(NOTES_KEY);
  return Array.isArray(notes) ? notes : [];
}

async function saveNotes(storage, notes) {
  await storage.set(NOTES_KEY, notes);
}

export async function activate(ctx) {
  ctx.log.info('Note Keeper plugin activating...');

  // Register /note command
  ctx.commands.registerCommand('/note', async (args) => {
    const text = args.join(' ');
    if (!text) {
      return {
        type: 'builtin',
        command: '/note',
        error: 'Usage: /note <content>'
      };
    }

    const notes = await loadNotes(ctx.storage);
    const note = {
      id: `note_${Date.now()}`,
      title: text.slice(0, 50),
      content: text,
      tags: [],
      createdAt: new Date().toISOString()
    };
    notes.push(note);
    await saveNotes(ctx.storage, notes);

    return {
      type: 'builtin',
      command: '/note',
      data: { message: `Note saved: "${note.title}"`, noteId: note.id, total: notes.length }
    };
  });

  // Register /note:list command
  ctx.commands.registerCommand('/note:list', async () => {
    const notes = await loadNotes(ctx.storage);
    if (notes.length === 0) {
      return {
        type: 'builtin',
        command: '/note:list',
        data: { message: 'No notes saved', notes: [] }
      };
    }

    return {
      type: 'builtin',
      command: '/note:list',
      data: {
        message: `${notes.length} note(s)`,
        notes: notes.map(n => ({ id: n.id, title: n.title, tags: n.tags, createdAt: n.createdAt }))
      }
    };
  });

  // Register /note:clear command
  ctx.commands.registerCommand('/note:clear', async () => {
    const notes = await loadNotes(ctx.storage);
    const count = notes.length;
    await saveNotes(ctx.storage, []);
    return {
      type: 'builtin',
      command: '/note:clear',
      data: { message: `Cleared ${count} note(s)` }
    };
  });

  // Register save_note tool
  ctx.tools.registerTool({
    id: 'save_note',
    name: 'save_note',
    description: 'Save a note with a title and content. Notes persist across sessions and restarts.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the note' },
        content: { type: 'string', description: 'The note content' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' }
      },
      required: ['title', 'content']
    },
    handler: async (args) => {
      const notes = await loadNotes(ctx.storage);
      const note = {
        id: `note_${Date.now()}`,
        title: String(args.title),
        content: String(args.content),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        createdAt: new Date().toISOString()
      };
      notes.push(note);
      await saveNotes(ctx.storage, notes);

      return JSON.stringify({
        success: true,
        noteId: note.id,
        message: `Note "${note.title}" saved`,
        total: notes.length
      });
    }
  });

  // Register search_notes tool
  ctx.tools.registerTool({
    id: 'search_notes',
    name: 'search_notes',
    description: 'Search through saved notes by keyword or tag.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        tag: { type: 'string', description: 'Filter by tag' }
      }
    },
    handler: async (args) => {
      const notes = await loadNotes(ctx.storage);
      let results = notes;

      if (args.query) {
        const q = String(args.query).toLowerCase();
        results = results.filter(n =>
          n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
        );
      }

      if (args.tag) {
        const tag = String(args.tag).toLowerCase();
        results = results.filter(n =>
          n.tags.some(t => t.toLowerCase() === tag)
        );
      }

      return JSON.stringify({
        count: results.length,
        notes: results.map(n => ({
          id: n.id,
          title: n.title,
          content: n.content,
          tags: n.tags,
          createdAt: n.createdAt
        }))
      });
    }
  });

  // Register delete_note tool
  ctx.tools.registerTool({
    id: 'delete_note',
    name: 'delete_note',
    description: 'Delete a note by its ID.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'The note ID to delete' }
      },
      required: ['noteId']
    },
    handler: async (args) => {
      const notes = await loadNotes(ctx.storage);
      const idx = notes.findIndex(n => n.id === args.noteId);
      if (idx === -1) {
        return JSON.stringify({ error: 'Note not found', noteId: args.noteId });
      }

      const deleted = notes.splice(idx, 1)[0];
      await saveNotes(ctx.storage, notes);

      return JSON.stringify({
        success: true,
        message: `Deleted note "${deleted.title}"`,
        remaining: notes.length
      });
    }
  });

  ctx.log.info('Note Keeper plugin activated successfully');
}

export function deactivate() {
  console.log('[Note Keeper Plugin] Deactivated');
}
