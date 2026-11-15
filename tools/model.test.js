import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentPlan, dateKey, dayDate, defaultPlan, midnight, readable, stageIndex, parseDays, sequence} from '../site/model.js';

const load = (path) => JSON.parse(readFileSync(new URL('../site/assets/bible/' + path + '.json',import.meta.url)));
const books = load('books');

test('Christmas plan unlocks on each Hong Kong date and remains open for catch-up', () => {
  assert.equal(dateKey(defaultPlan.start),'2026-12-01');
  assert.equal(dateKey(dayDate(defaultPlan,23)),'2026-12-24');
  assert.equal(readable(defaultPlan,0,Date.parse('2026-11-30T15:59:59Z')),false);
  assert.equal(readable(defaultPlan,0,Date.parse('2026-11-30T16:00:00Z')),true);
  assert.equal(readable(defaultPlan,23,midnight('2026-12-23')),false);
  assert.equal(readable(defaultPlan,23,midnight('2027-01-01')),true);
  assert.equal(readable(defaultPlan,24,midnight('2027-01-01')),false);
  assert.deepEqual(defaultPlan.days,sequence('LUK',1,24,books));
});
test('exact 24-day growth milestones and progress on shorter plans', () => {
  assert.deepEqual(Array.from({length:25},(_,n) => stageIndex(n,24)),
    [0,1,1,1,2,2,2,2,3,3,3,3,3,4,4,4,4,4,5,5,5,5,5,5,6]);
  assert.equal(stageIndex(1,2),3);
  assert.equal(stageIndex(1,1),6);
  assert.equal(stageIndex(365,366),5);
});
test('schedule authoring validates chapter ranges and allows future / archived selection', () => {
  assert.deepEqual(parseDays('luk 1\nACT 28，PSA 150',books),['LUK 1','ACT 28','PSA 150']);
  assert.throws(() => parseDays('REV 99',books));
  assert.throws(() => parseDays('constructor 1',books));
  assert.throws(() => sequence('ACT',2,29,books));
  const later = {...defaultPlan,id:'future',start:midnight('2027-03-01')};
  assert.equal(currentPlan([later,defaultPlan],midnight('2026-11-01')).id,defaultPlan.id);
  assert.equal(currentPlan([later,defaultPlan],midnight('2027-01-01')).id,defaultPlan.id);
  assert.equal(currentPlan([later,defaultPlan],midnight('2027-03-01')).id,later.id);
});
test('both editions contain text in all chapters of the 66-book catalog', () => {
  assert.equal(Object.keys(books).length,66);
  for (const [code,[,size]] of Object.entries(books)) {
    for (const lang of ['zh','en']) {
      const chapters = load(lang+'/'+code);
      assert.equal(Object.keys(chapters).length,size);
      for (let i=1; i<=size; i++) {
        assert.ok(chapters[i]?.some(([,text]) => text.trim()), lang+' '+code+' '+i);
        assert.ok(chapters[i].every(([verse,text]) => verse && typeof text === 'string'));
      }
    }
  }
  assert.equal(load('zh/LUK')[24].at(-1)[0],'53');
  assert.equal(load('en/LUK')[24].at(-1)[0],'53');
});
