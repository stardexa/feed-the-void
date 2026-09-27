const { applyDecay, loadState, renderAll, saveState } = require('./lib');

const state = loadState();
const elapsed = applyDecay(state, new Date());
// Workflow sık sık uyanır ama profilin git geçmişini dakikalık nabızlarla
// şişirmez. State son kayıttan iki saat geçtiğinde görünür biçimde yaşlanır.
if (elapsed >= 2) {
  state.pet.version += 1;
  saveState(state);
  renderAll(state);
  console.log(`Nib yaş aldı: ${elapsed.toFixed(2)} saat.`);
} else {
  console.log('Nib henüz aynı ruh hâlinde.');
}
