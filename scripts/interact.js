const fs = require('node:fs');
const path = require('node:path');
const { ROOT, actionFromTitle, applyDecay, interact, loadState, renderAll, saveState } = require('./lib');

const now = new Date();
const action = actionFromTitle(process.env.ISSUE_TITLE);
const state = loadState();
const elapsed = applyDecay(state, now);
const result = action
  ? interact(state, { user: process.env.ISSUE_USER, action, now })
  : { accepted: false, message: 'Nib yalnızca besleme, oyun ve uyku ritüellerini anlayabiliyor.', user: process.env.ISSUE_USER || 'visitor' };

// Zamanın geçmesi de gerçek bir oyun olayıdır; reddedilen spam denemeleri
// state'i geri sarmamalı veya SVG ile JSON'u birbirinden koparmamalı.
if (elapsed >= 0.05 && !result.accepted) state.pet.version += 1;
saveState(state);
renderAll(state);
fs.writeFileSync(path.join(ROOT, '.nib-result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
