const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const theme = fs.readFileSync('web/website/theme.js','utf8');
function setup(initial, blocked = false) {
  let saved = initial, ready, click; const root = {dataset:{}}, button = {setAttribute(){}, addEventListener(_, fn){click=fn;}};
  const localStorage = {getItem(){if(blocked)throw Error('blocked');return saved;},setItem(_,v){if(blocked)throw Error('blocked');saved=v;}};
  vm.runInNewContext(theme,{document:{documentElement:root,addEventListener(_,fn){ready=fn},getElementById(){return button}},localStorage});
  ready(); return {root,button,click:()=>click(),saved:()=>saved};
}
test('mocked, not real: defaults to dark and toggles',()=>{const a=setup(null);assert.equal(a.root.dataset.theme,'dark');a.click();assert.equal(a.root.dataset.theme,'light');assert.equal(a.saved(),'light');});
test('mocked, not real: saved choice and blocked storage',()=>{const a=setup('light');assert.equal(a.root.dataset.theme,'light');const b=setup(null,true);b.click();assert.equal(b.root.dataset.theme,'light');b.click();assert.equal(b.root.dataset.theme,'dark');});
