import { z } from 'zod';
import {
  BLOCK_KIT,
  BUILT_IN_NAMES,
  MODULE_GUIDE,
  MODULE_TEMPLATES,
  applyEdits,
  checkModule,
  mergeModules,
  normalizeDoc,
  slug,
  type ModuleDoc,
  type ModuleEdit,
  type ModuleProposal,
} from '../../shared/modules';
import { getHubState } from '../achievements';
import { getLibrary } from '../library';
import { renderPreview, type PreviewSize } from '../modules/preview';
import {
  askQuestion,
  describeProposal,
  downloadAsset,
  getAiLog,
  getModule,
  getModuleErrors,
  getModulesState,
  getModuleStorage,
  getProposal,
  getQuestion,
  getVersion,
  listAssets,
  logAi,
  propose,
  saveAsset,
  waitForAnswer,
} from '../modules/store';
import { getSettings } from '../settings';
import { fail, json, MAX_WAIT_SECONDS, type ToolContext, type ToolSet } from './tools';

/**
 * The AI module maker's tools (Phase M1). The AI makes and edits data/kit modules; every change becomes a
 * proposal the player looks at and applies in ShotCaller. Only there while "Let AI make modules" is on.
 */

const INSTRUCTIONS = `Making ShotCaller modules (tools start with modules_): you can make and edit the player's own modules, pages built from ShotCaller's building blocks (cards, lists, tables, timers, checklists, tier lists, build cards, maps, calendars and more) for any game in their library.
- Start with modules_kit (the format and the blocks) and modules_suggest_game. The player is not technical: ask what they want in plain words, and confirm which game before making anything (modules_ask_user shows buttons).
- Nothing changes until the player clicks Apply in ShotCaller. After modules_create or modules_edit, tell them to look at the change on the Modules page.
- Use modules_check and modules_preview before you say it's done; fix every error. Change one piece at a time with modules_edit rather than rewriting the whole module.
- Write a one-line summary for every change: it becomes the module's changelog.
- Facts in a module must be right: check them with the other ShotCaller tools (dbd_, fortnite_, games_) rather than memory.`;

const by = (ctx: ToolContext) => ctx.caller;

function proposalReply(p: ModuleProposal, extra: Record<string, unknown> = {}) {
  const errors = p.problems.filter((x) => x.level === 'error');
  return json({
    proposal: p.id,
    module: p.moduleId,
    status: p.draft
      ? 'Saved as a draft on the Modules page. The player applies it when ready.'
      : 'Waiting for the player to click Apply on ShotCaller’s Modules page. Nothing has changed yet.',
    changes: describeProposal(p),
    mistakes: errors.map((x) => `${x.where}: ${x.message}`),
    warnings: p.problems.filter((x) => x.level === 'warning').map((x) => `${x.where}: ${x.message}`),
    note: errors.length ? 'Fix the mistakes (modules_edit): it can’t be applied while they are there.' : undefined,
    ...extra,
  });
}

/** The module to work from: a waiting change if there is one (so edits build on it), else the saved one. */
function workingDoc(id: string): { doc: ModuleDoc; pending: boolean } | null {
  const m = getModule(id);
  const p = getProposal(m?.doc.id ?? slug(id));
  if (p?.doc) return { doc: p.doc, pending: true };
  return m ? { doc: m.doc, pending: false } : null;
}

function gameFor(key: string | null | undefined, name?: string): { key: string | null; name: string } | null {
  if (!key && !name) return null;
  const g = getLibrary().games.find((x) => x.key === key) ?? getLibrary().games.find((x) => name && x.name.toLowerCase() === name.toLowerCase());
  return g ? { key: g.key, name: g.name } : { key: null, name: name ?? '' };
}

const anyJson = z.any();

export const moduleTools: ToolSet = {
  id: 'modules',
  instructions: INSTRUCTIONS,
  available: () => getSettings().mcp.modules,
  register(mcp, ctx) {
    const read = { readOnlyHint: true };
    const log = (tool: string, module: string | null, text: string) => logAi({ tool, module, text, by: by(ctx) });

    mcp.registerTool(
      'modules_kit',
      { description: 'How a module is written: the format, every building block and its fields, and the templates. Read this before making one.', annotations: read },
      async () =>
        json({
          guide: MODULE_GUIDE,
          blocks: BLOCK_KIT,
          templates: MODULE_TEMPLATES.map((t) => ({ id: t.id, name: t.name, what: t.what })),
          builtInAddOns: BUILT_IN_NAMES,
          example: MODULE_TEMPLATES[0].make({ key: 'example-key', name: 'Example Game' }),
        }),
    );

    mcp.registerTool(
      'modules_list',
      { description: "The player's modules: on/off, broken, version, where they show, and any change still waiting for Apply.", annotations: read },
      async () => {
        const s = getModulesState();
        return json({
          safeMode: s.safeMode ? 'Safe mode is on: every module is off until the player turns safe mode off.' : undefined,
          modules: s.modules.map((m) => ({
            id: m.doc.id,
            name: m.doc.name,
            game: m.doc.addOnFor ? `${BUILT_IN_NAMES[m.doc.addOnFor]} (add-on)` : (m.doc.game?.name ?? null),
            version: m.version,
            on: m.enabled,
            broken: m.broken?.error ?? null,
            places: m.doc.places,
            locked: !!m.doc.locked,
            lastChanges: m.history.slice(-3).map((h) => `v${h.version}: ${h.summary}`),
          })),
          waiting: s.proposals.map((p) => ({ proposal: p.id, module: p.moduleId, kind: p.kind, summary: p.summary, draft: p.draft })),
        });
      },
    );

    mcp.registerTool(
      'modules_read',
      {
        description: 'One module in full (its JSON), the pictures it has, and what the player has saved in it. Gives the waiting change instead if there is one, unless saved_only.',
        inputSchema: {
          module: z.string().min(1).describe('Module id or name.'),
          version: z.number().int().min(1).optional().describe('An old version instead.'),
          saved_only: z.boolean().optional(),
        },
        annotations: read,
      },
      async ({ module, version, saved_only }) => {
        const m = getModule(module);
        const p = getProposal(m?.doc.id ?? slug(module));
        if (!m && !p) return fail(`No module "${module}". Use modules_list.`);
        const id = m?.doc.id ?? p!.moduleId;
        const doc = version ? getVersion(id, version) : !saved_only && p?.doc ? p.doc : m?.doc;
        if (!doc) return fail(`Version ${version} isn't kept.`);
        return json({
          showing: version ? `version ${version}` : !saved_only && p?.doc ? 'the change waiting for Apply' : `saved version ${m?.version}`,
          module: doc,
          pictures: listAssets(id),
          playerData: m ? getModuleStorage(id) : {},
          history: m?.history.slice(-10) ?? [],
        });
      },
    );

    mcp.registerTool(
      'modules_suggest_game',
      {
        description: "Games in the player's library to make a module for (most played and recent first), with which already have modules or a built-in ShotCaller module. Suggest one and let the player confirm (modules_ask_user).",
        inputSchema: { limit: z.number().int().min(1).max(60).optional().describe('Default 25.') },
        annotations: read,
      },
      async ({ limit }) => {
        const mods = getModulesState().modules;
        const hub = getHubState().summaries;
        const games = getLibrary()
          .games.filter((g) => !g.hidden && !g.isTool)
          // Played in the last 60 days first, then by hours played.
          .sort((a, b) => {
            const recent = (g: typeof a) => ((g.lastPlayed ?? 0) > Date.now() - 60 * 86_400_000 ? 1 : 0);
            return recent(b) - recent(a) || (b.playMinutes ?? 0) - (a.playMinutes ?? 0);
          })
          .slice(0, limit ?? 25);
        return json(
          games.map((g) => ({
            key: g.key,
            name: g.name,
            hoursPlayed: g.playMinutes ? Math.round(g.playMinutes / 6) / 10 : null,
            lastPlayed: g.lastPlayed ? new Date(g.lastPlayed).toISOString().slice(0, 10) : null,
            achievements: hub[g.key] ? `${hub[g.key].unlocked}/${hub[g.key].total}` : null,
            builtIn: g.moduleId ?? null,
            aiModules: mods.filter((m) => m.doc.game?.key === g.key || (g.moduleId && m.doc.addOnFor === g.moduleId)).map((m) => m.doc.name),
          })),
        );
      },
    );

    mcp.registerTool(
      'modules_errors',
      { description: "A module's error log: drawing errors (which turn it off) and preview errors.", inputSchema: { module: z.string().min(1) }, annotations: read },
      async ({ module }) => {
        const m = getModule(module);
        if (!m) return fail(`No module "${module}".`);
        return json({ broken: m.broken, errors: getModuleErrors(m.doc.id).slice(0, 20) });
      },
    );

    mcp.registerTool(
      'modules_check',
      {
        description: 'The mistake checker: missing fields, wrong ids, broken data links, pictures not added, hard-to-read colours, long text and slow (too big) data. Checks the waiting change if there is one.',
        inputSchema: { module: z.string().optional(), doc: anyJson.optional().describe('Or check a module JSON you are writing.') },
        annotations: read,
      },
      async ({ module, doc }) => {
        const d = doc ? normalizeDoc(doc) : module ? workingDoc(module)?.doc : null;
        if (!d) return fail('Give a module id or a doc.');
        const problems = checkModule(d, new Set(listAssets(d.id).map((a) => a.name)));
        return json({ ok: !problems.some((p) => p.level === 'error'), problems });
      },
    );

    mcp.registerTool(
      'modules_preview',
      {
        description:
          'Draws a module the way the player would see it and returns a picture, the page text, errors and how long it took. Use it to test: other sizes (small, wide), the Home card (as "home"), the second monitor (as "monitor"), and pretend_running to see blocks that only show while the game runs. Previews the waiting change unless saved_only.',
        inputSchema: {
          module: z.string().min(1),
          page: z.string().optional().describe('Page id. Default the first.'),
          size: z.enum(['small', 'normal', 'wide', 'monitor', 'home']).optional(),
          as: z.enum(['page', 'home', 'monitor']).optional(),
          pretend_running: z.boolean().optional(),
          saved_only: z.boolean().optional(),
          picture: z.boolean().optional().describe('Default true. False returns only text and errors (faster).'),
        },
        annotations: read,
      },
      async ({ module, page, size, as, pretend_running, saved_only, picture }) => {
        const m = getModule(module);
        const w = saved_only ? (m ? { doc: m.doc, pending: false } : null) : workingDoc(module);
        if (!w) return fail(`No module "${module}".`);
        const where = as ?? 'page';
        const r = await renderPreview(
          {
            moduleId: w.doc.id,
            doc: w.doc,
            page: page ?? null,
            size: (size ?? (where === 'home' ? 'home' : where === 'monitor' ? 'monitor' : 'normal')) as PreviewSize,
            pretendRunning: !!pretend_running,
            as: where,
          },
          picture !== false,
        );
        const info = {
          showing: w.pending ? 'the change waiting for Apply' : 'the saved module',
          ok: r.ok,
          errors: r.errors,
          drawMs: r.ms,
          slow: r.ms > 400 ? 'This took a while to draw: make big lists smaller or add search.' : undefined,
          text: r.text.slice(0, 4000),
        };
        if (!r.png) return json(info);
        return { content: [{ type: 'image' as const, data: r.png.toString('base64'), mimeType: 'image/png' }, { type: 'text' as const, text: JSON.stringify(info, null, 1) }] };
      },
    );

    mcp.registerTool(
      'modules_run_tests',
      { description: "Runs the module's saved tests (its tests list): each opens a page and checks the expected text is there.", inputSchema: { module: z.string().min(1), saved_only: z.boolean().optional() }, annotations: read },
      async ({ module, saved_only }) => {
        const m = getModule(module);
        const w = saved_only ? (m ? { doc: m.doc, pending: false } : null) : workingDoc(module);
        if (!w) return fail(`No module "${module}".`);
        const tests = w.doc.tests ?? [];
        if (!tests.length) return fail('This module has no tests. Add some with modules_edit (set field "tests").');
        const results = [];
        for (const t of tests) {
          const r = await renderPreview({ moduleId: w.doc.id, doc: w.doc, page: t.page ?? null, size: 'normal', pretendRunning: !!t.pretendRunning, as: 'page' }, false);
          const missing = t.expectText.filter((x) => !r.text.toLowerCase().includes(x.toLowerCase()));
          results.push({ test: t.name, passed: r.ok && !missing.length, missing, errors: r.errors });
        }
        return json({ passed: results.filter((r) => r.passed).length, of: results.length, results });
      },
    );

    mcp.registerTool(
      'modules_ask_user',
      {
        description: `Asks the player a question with buttons in ShotCaller (and waits up to timeout_seconds, at most ${MAX_WAIT_SECONDS}). Use it to confirm the game or pick between ideas. If no answer yet, call modules_wait_answer with the question id.`,
        inputSchema: {
          question: z.string().min(1).max(300),
          choices: z.array(z.string().min(1).max(80)).min(2).max(6),
          timeout_seconds: z.number().min(1).max(MAX_WAIT_SECONDS).optional(),
        },
      },
      async ({ question, choices, timeout_seconds }) => {
        const q = askQuestion(question, choices);
        log('modules_ask_user', null, `Asked: ${question}`);
        const answer = await waitForAnswer(q.id, timeout_seconds ?? 50);
        return json(answer === null ? { question: q.id, answered: false, note: 'No answer yet. Call modules_wait_answer, or ask in chat.' } : { question: q.id, answered: true, answer });
      },
    );

    mcp.registerTool(
      'modules_wait_answer',
      { description: 'Waits for the answer to a modules_ask_user question.', inputSchema: { question: z.string(), timeout_seconds: z.number().min(1).max(MAX_WAIT_SECONDS).optional() }, annotations: read },
      async ({ question, timeout_seconds }) => {
        if (!getQuestion(question)) return fail('No such question.');
        const answer = await waitForAnswer(question, timeout_seconds ?? 50);
        return json(answer === null ? { answered: false } : { answered: true, answer });
      },
    );

    // ---- Changes (each one waits for Apply)

    mcp.registerTool(
      'modules_create',
      {
        description:
          'Makes a new module, from a whole module JSON (doc) or from a template plus a game. It waits for the player to Apply. game_key comes from modules_suggest_game. For an add-on to a built-in game page, set add_on_for.',
        inputSchema: {
          summary: z.string().min(1).max(300).describe('One line for the changelog, e.g. "New Elden Ring boss tracker".'),
          doc: anyJson.optional().describe('The whole module (see modules_kit).'),
          template: z.string().optional().describe('Template id instead of doc.'),
          game_key: z.string().optional(),
          game_name: z.string().optional(),
          add_on_for: z.enum(['dbd', 'fortnite', 'skillshot-city']).optional(),
          draft: z.boolean().optional().describe('Save quietly as a draft instead of asking now.'),
        },
      },
      async ({ summary, doc, template, game_key, game_name, add_on_for, draft }) => {
        let d: ModuleDoc;
        const game = gameFor(game_key, game_name);
        if (doc) d = normalizeDoc(doc);
        else if (template) {
          const t = MODULE_TEMPLATES.find((x) => x.id === template);
          if (!t) return fail(`No template "${template}". Templates: ${MODULE_TEMPLATES.map((x) => x.id).join(', ')}.`);
          d = t.make(game);
        } else return fail('Give doc or template.');
        if (game && !doc?.game) d.game = game;
        if (add_on_for) d = { ...d, addOnFor: add_on_for, game: null };
        if (!d.author || d.author === 'AI') d.author = ctx.caller === 'chat' ? 'AI (ShotCaller chat)' : 'AI';
        const p = propose('create', null, d, summary, !!draft, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_create', p.moduleId, summary);
        return proposalReply(p);
      },
    );

    const editSchema = z
      .array(z.record(z.string(), z.any()))
      .min(1)
      .max(60)
      .describe(
        'Edits, applied in order: {op:"set", field, value} (name, description, icon, color, author, game, addOnFor, places, permissions, homeBlocks, tour, tests); {op:"set_block", block}; {op:"add_block", page, block, after?}; {op:"remove_block", id}; {op:"move_block", id, page, after?}; {op:"set_page", page}; {op:"remove_page", id}; {op:"set_data", name, value}; {op:"remove_data", name}; {op:"set_option", option}; {op:"remove_option", key}.',
      );

    mcp.registerTool(
      'modules_edit',
      {
        description: 'Changes one module piece by piece (a block, a page, a data set, an option, or a field like name or icon). Builds on the change already waiting, if any. Waits for Apply.',
        inputSchema: { module: z.string().min(1), summary: z.string().min(1).max(300), edits: editSchema, draft: z.boolean().optional() },
      },
      async ({ module, summary, edits, draft }) => {
        const w = workingDoc(module);
        if (!w) return fail(`No module "${module}".`);
        const waiting = getProposal(w.doc.id);
        let next: ModuleDoc;
        try {
          next = applyEdits(w.doc, edits as unknown as ModuleEdit[]);
        } catch (e) {
          return fail((e as Error).message);
        }
        const kind = waiting?.kind === 'create' ? 'create' : 'edit';
        const p = propose(kind, w.doc.id, kind === 'create' ? { ...next, id: w.doc.id } : next, waiting ? `${waiting.summary}; ${summary}` : summary, draft ?? waiting?.draft ?? false, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_edit', p.moduleId, summary);
        return proposalReply(p);
      },
    );

    mcp.registerTool(
      'modules_edit_many',
      {
        description: 'The same kind of change across several modules at once (e.g. new colour everywhere). One waiting change per module.',
        inputSchema: { summary: z.string().min(1).max(300), changes: z.array(z.object({ module: z.string(), edits: editSchema })).min(1).max(20) },
      },
      async ({ summary, changes }) => {
        const out = [];
        for (const c of changes) {
          const w = workingDoc(c.module);
          if (!w) {
            out.push({ module: c.module, error: 'No such module.' });
            continue;
          }
          try {
            const next = applyEdits(w.doc, c.edits as unknown as ModuleEdit[]);
            const p = propose('edit', w.doc.id, next, summary, false, by(ctx));
            if ('error' in p) out.push({ module: c.module, error: p.error });
            else out.push({ module: p.moduleId, proposal: p.id, mistakes: p.problems.filter((x) => x.level === 'error').length });
          } catch (e) {
            out.push({ module: c.module, error: (e as Error).message });
          }
        }
        log('modules_edit_many', null, `${summary} (${changes.length} modules)`);
        return json({ status: 'Waiting for the player to Apply each one on the Modules page.', results: out });
      },
    );

    mcp.registerTool(
      'modules_copy',
      {
        description: 'Copies a module into a new one (e.g. to make a version for another game). Waits for Apply.',
        inputSchema: { module: z.string().min(1), name: z.string().min(1).max(60), game_key: z.string().optional(), summary: z.string().max(300).optional() },
      },
      async ({ module, name, game_key, summary }) => {
        const m = getModule(module);
        if (!m) return fail(`No module "${module}".`);
        if (m.doc.locked) return fail('This module was shared locked; it can’t be copied.');
        const doc = { ...m.doc, id: slug(name), name, ...(game_key ? { game: gameFor(game_key) } : {}) };
        const p = propose('create', null, doc, summary ?? `Copy of ${m.doc.name}`, false, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_copy', p.moduleId, `Copied ${m.doc.name}`);
        return proposalReply(p, { note2: 'Pictures are not copied: add them again with modules_add_asset if the copy uses them.' });
      },
    );

    mcp.registerTool(
      'modules_merge',
      { description: 'Merges two modules into one new module (pages from both). The old ones stay until the player deletes them. Waits for Apply.', inputSchema: { first: z.string(), second: z.string(), name: z.string().min(1).max(60) } },
      async ({ first, second, name }) => {
        const a = getModule(first);
        const b = getModule(second);
        if (!a || !b) return fail('Both modules must exist.');
        if (a.doc.locked || b.doc.locked) return fail('Locked modules can’t be merged.');
        const p = propose('create', null, mergeModules(a.doc, b.doc, name), `Merged ${a.doc.name} and ${b.doc.name}`, false, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_merge', p.moduleId, `Merged ${a.doc.name} + ${b.doc.name}`);
        return proposalReply(p);
      },
    );

    mcp.registerTool(
      'modules_restore',
      {
        description: 'Goes back to an earlier version of a module (version numbers from modules_read history). Leave version out to undo the last change. Waits for Apply.',
        inputSchema: { module: z.string().min(1), version: z.number().int().min(1).optional() },
      },
      async ({ module, version }) => {
        const m = getModule(module);
        if (!m) return fail(`No module "${module}".`);
        const v = version ?? m.version - 1;
        if (v < 1 || v >= m.version + 1) return fail('There is no earlier version.');
        const doc = getVersion(m.doc.id, v);
        if (!doc) return fail(`Version ${v} isn't kept.`);
        const p = propose('restore', m.doc.id, doc, `Back to version ${v}`, false, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_restore', m.doc.id, `Back to version ${v}`);
        return proposalReply(p);
      },
    );

    mcp.registerTool(
      'modules_delete',
      { description: 'Asks to delete a module. The player confirms with Apply; it goes to a bin folder, not erased.', inputSchema: { module: z.string().min(1), reason: z.string().max(200) } },
      async ({ module, reason }) => {
        const m = getModule(module);
        if (!m) return fail(`No module "${module}".`);
        const p = propose('delete', m.doc.id, null, `Delete: ${reason}`, false, by(ctx));
        if ('error' in p) return fail(p.error);
        log('modules_delete', m.doc.id, reason);
        return proposalReply(p);
      },
    );

    mcp.registerTool(
      'modules_add_asset',
      {
        description:
          'Adds a picture or video to a module (an existing one, or one waiting for Apply): download it from an https url (needs the module\'s internet permission), or draw it as SVG text. Use the returned file name in blocks. Saved at once (pictures aren’t shown until a block uses them).',
        inputSchema: {
          module: z.string().min(1),
          name: z.string().min(1).max(60).describe('File name, e.g. "boss-map.png" or "icon.svg".'),
          url: z.string().url().optional(),
          svg: z.string().max(200_000).optional(),
        },
      },
      async ({ module, name, url, svg }) => {
        const w = workingDoc(module);
        if (!w) return fail(`No module "${module}".`);
        const r = svg
          ? saveAsset(w.doc.id, name.replace(/\.[a-z0-9]+$/i, '') + '.svg', Buffer.from(svg, 'utf8'))
          : url
            ? await downloadAsset(w.doc.id, name, url, w.doc.permissions.internet)
            : ({ ok: false, error: 'Give url or svg.' } as const);
        if (!r.ok) return fail(r.error);
        log('modules_add_asset', w.doc.id, `Added picture ${r.name}${url ? ` from ${new URL(url).host}` : ''}`);
        return json({ saved: r.name, use: `"${r.name}" as src/image in a block` });
      },
    );

    mcp.registerTool(
      'modules_ai_log',
      { description: 'What AI tools did with modules recently (also shown to the player).', inputSchema: { limit: z.number().int().min(1).max(100).optional() }, annotations: read },
      async ({ limit }) => json(getAiLog().slice(0, limit ?? 30)),
    );
  },
};
