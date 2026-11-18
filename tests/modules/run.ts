import assert from 'node:assert/strict';
import {
  applyEdits,
  blockVisible,
  checkModule,
  contrastOnCard,
  diffModules,
  mergeModules,
  MODULE_TEMPLATES,
  normalizeDoc,
  optionValues,
  type Block,
  type ModuleDoc,
} from '../../shared/modules';

/** Phase M1: checks for the AI module format (npm run test:modules). Pure functions only. */

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
};
const errors = (d: ModuleDoc, assets?: Set<string>) => checkModule(d, assets).filter((p) => p.level === 'error');

const sample = (): ModuleDoc =>
  normalizeDoc({
    id: 'elden-bosses',
    name: 'Elden Ring bosses',
    color: '#4f8cff',
    game: { key: 'steam:1245620', name: 'ELDEN RING' },
    places: ['page', 'home'],
    options: [{ key: 'spoilers', label: 'Show spoilers', type: 'switch', default: false }],
    pages: [
      {
        id: 'main',
        title: 'Bosses',
        blocks: [
          { id: 'intro', type: 'text', text: 'Hello **there**' },
          { id: 'list', type: 'table', data: 'bosses', search: true },
          { id: 'secret', type: 'text', text: 'Spoiler', option: 'spoilers' },
          { id: 'tabs', type: 'tabs', tabs: [{ title: 'A', blocks: [{ id: 'inner', type: 'checklist', items: ['x'] }] }] },
        ],
      },
    ],
    data: { bosses: [{ name: 'Margit', area: 'Limgrave' }] },
  });

test('every template makes a module with no mistakes', () => {
  for (const t of MODULE_TEMPLATES) {
    for (const game of [null, { key: 'k1', name: 'Some Game' }]) {
      const d = t.make(game);
      assert.deepEqual(errors(d), [], `${t.id} with ${game ? 'a game' : 'no game'}`);
    }
  }
});

test('a good module has no mistakes', () => assert.deepEqual(errors(sample()), []));

test('normalize fills gaps and cleans the id', () => {
  const d = normalizeDoc({ name: 'My Cool Module!', pages: [] });
  assert.equal(d.id, 'my-cool-module');
  assert.deepEqual(d.places, ['page']);
  assert.equal(d.permissions.internet, false);
  assert.equal(d.color, '#4f8cff');
});

test('the checker finds the usual mistakes', () => {
  const d = sample();
  d.pages[0].blocks.push({ id: 'intro', type: 'text', text: 'dup' } as Block);
  d.pages[0].blocks.push({ id: 'bad', type: 'nope' } as unknown as Block);
  d.pages[0].blocks.push({ id: 'nodata', type: 'list', data: 'missing' } as Block);
  d.pages[0].blocks.push({ id: 'link', type: 'links', links: [{ label: 'x', url: 'http://insecure' }] } as Block);
  d.pages[0].blocks.push({ id: 'pic', type: 'image', src: 'boss.png' } as Block);
  d.pages[0].blocks.push({ id: 'ach', type: 'achievements' } as Block);
  d.pages[0].blocks.push({ id: 'opt', type: 'text', text: 'x', option: 'nope' } as Block);
  const msgs = errors(d, new Set()).map((p) => `${p.where}: ${p.message}`).join('\n');
  for (const want of ['same id', 'Unknown block type', 'doesn\'t exist', 'https link', 'isn\'t in the module', 'achievements', 'option "nope"'])
    assert.ok(msgs.includes(want), `expected "${want}" in:\n${msgs}`);
});

test('pictures that are added pass', () => {
  const d = sample();
  d.pages[0].blocks.push({ id: 'pic', type: 'image', src: 'boss.png' } as Block);
  assert.deepEqual(errors(d, new Set(['boss.png'])), []);
});

test('dark colours get a readability warning', () => {
  assert.ok(contrastOnCard('#101020') < 3);
  assert.ok(contrastOnCard('#ffffff') > 10);
  const d = { ...sample(), color: '#11122a' };
  assert.ok(checkModule(d).some((p) => p.level === 'warning' && p.where === 'color'));
});

test('big data gets a slow warning', () => {
  const d = sample();
  d.data.bosses = Array.from({ length: 2500 }, (_, i) => ({ name: `B${i}` }));
  assert.ok(checkModule(d).some((p) => p.level === 'warning' && p.message.includes('slow')));
});

test('edits change one piece only', () => {
  const d = sample();
  const next = applyEdits(d, [
    { op: 'set', field: 'name', value: 'Bosses!' },
    { op: 'set_block', block: { id: 'intro', type: 'text', text: 'Changed' } },
    { op: 'add_block', page: 'main', after: 'intro', block: { id: 'timer', type: 'timer', seconds: 30 } },
    { op: 'set_block', block: { id: 'inner', type: 'checklist', items: ['y'] } },
    { op: 'remove_block', id: 'secret' },
    { op: 'set_data', name: 'bosses', value: [{ name: 'Godrick' }] },
  ]);
  assert.equal(next.name, 'Bosses!');
  assert.deepEqual(next.pages[0].blocks.map((b) => b.id), ['intro', 'timer', 'list', 'tabs']);
  const tabs = next.pages[0].blocks[3] as Extract<Block, { type: 'tabs' }>;
  assert.deepEqual((tabs.tabs[0].blocks[0] as Extract<Block, { type: 'checklist' }>).items, ['y']);
  assert.equal(d.name, 'Elden Ring bosses', 'the original is untouched');
  const changes = diffModules(d, next);
  const labels = changes.map((c) => `${c.kind} ${c.label}`);
  assert.ok(labels.some((l) => l.startsWith('changed Module name')));
  assert.ok(labels.some((l) => l.startsWith('added Block') && l.includes('timer')));
  assert.ok(labels.some((l) => l.startsWith('removed Block') && l.includes('secret')));
  assert.ok(labels.some((l) => l.startsWith('changed Data')));
});

test('bad edits explain themselves', () => {
  assert.throws(() => applyEdits(sample(), [{ op: 'remove_block', id: 'ghost' }]), /no block "ghost"/);
  assert.throws(() => applyEdits(sample(), [{ op: 'add_block', page: 'main', block: { id: 'intro', type: 'text', text: 'x' } }]), /already exists/);
  assert.throws(() => applyEdits(sample(), [{ op: 'set', field: 'id' as 'name', value: 'x' }]), /can't be set/);
});

test('merge keeps both and makes ids unique', () => {
  const a = sample();
  const b = sample();
  const m = mergeModules(a, b, 'Both');
  assert.equal(m.pages.length, 2);
  assert.notEqual(m.pages[0].id, m.pages[1].id);
  assert.deepEqual(errors(m), []);
});

test('options and showWhen decide what shows', () => {
  const d = sample();
  const opts = optionValues(d, undefined);
  assert.equal(opts.spoilers, false);
  const secret = d.pages[0].blocks[2];
  assert.equal(blockVisible(secret, false, opts), false);
  assert.equal(blockVisible(secret, false, optionValues(d, { spoilers: true })), true);
  const live = { id: 'l', type: 'text', text: 'x', showWhen: 'running' } as Block;
  assert.equal(blockVisible(live, false, {}), false);
  assert.equal(blockVisible(live, true, {}), true);
});

test('new and deleted modules diff as one line', () => {
  assert.equal(diffModules(null, sample())[0].kind, 'added');
  assert.equal(diffModules(sample(), null)[0].kind, 'removed');
});

console.log(`${passed} module tests passed${process.exitCode ? ', some FAILED' : ''}`);
