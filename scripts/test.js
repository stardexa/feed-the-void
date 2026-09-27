const assert = require('node:assert/strict');
const { actionFromTitle, applyDecay, interact, statusFor } = require('./lib');

assert.equal(actionFromTitle('nib:feed'), 'feed');
assert.equal(actionFromTitle('[NIB:PLAY] please'), 'play');
assert.equal(actionFromTitle('hello nib:feed'), null);
const state = { pet: { hunger: 50, happiness: 50, energy: 50, status: 'CONTENT', last_updated: '2026-09-27T10:00:00.000Z', version: 1 }, leaderboard: {}, cooldowns: {}, recent_events: [] };
applyDecay(state, new Date('2026-09-27T12:00:00.000Z'));
assert.equal(state.pet.hunger, 40);
assert.equal(state.pet.happiness, 44);
const result = interact(state, { user: 'octocat', action: 'feed', now: new Date('2026-09-27T12:01:00.000Z') });
assert.equal(result.accepted, true);
assert.equal(state.leaderboard.octocat.total, 1);
assert.equal(statusFor({ hunger: 10, happiness: 80, energy: 90, status: 'CONTENT' }), 'SICK_OR_SAD');
console.log('Nib testleri geçti.');
