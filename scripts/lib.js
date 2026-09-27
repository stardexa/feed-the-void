const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'data', 'state.json');
const SVG_PATH = path.join(ROOT, 'assets', 'nib.svg');
const README_PATH = path.join(ROOT, 'README.md');
const MAX = 100;
const MIN = 0;
const DECAY_PER_HOUR = { hunger: 5, happiness: 3, energy: 1 };

function clamp(value) { return Math.max(MIN, Math.min(MAX, Math.round(value))); }
function loadState() { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
function saveState(state) { fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`); }
function escapeXml(value) { return String(value).replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]); }
function escapeMarkdown(value) { return String(value).replace(/[|]/g, '\\|'); }

function statusFor(pet) {
  if (pet.status === 'SLEEPING' && pet.energy < 88) return 'SLEEPING';
  if (pet.hunger <= 12 || pet.happiness <= 12) return 'SICK_OR_SAD';
  if (pet.hunger < 40) return 'HUNGRY';
  if (pet.happiness > 82 && pet.hunger > 65 && pet.energy > 50) return 'SUPER_HAPPY';
  return 'CONTENT';
}

function applyDecay(state, now = new Date()) {
  const pet = state.pet;
  const previous = new Date(pet.last_updated);
  const elapsedHours = Math.max(0, (now.getTime() - previous.getTime()) / 3_600_000);
  if (elapsedHours < 0.05) return 0;
  pet.hunger = clamp(pet.hunger - elapsedHours * DECAY_PER_HOUR.hunger);
  pet.happiness = clamp(pet.happiness - elapsedHours * DECAY_PER_HOUR.happiness);
  pet.energy = clamp(pet.energy - elapsedHours * DECAY_PER_HOUR.energy);
  pet.last_updated = now.toISOString();
  pet.status = statusFor(pet);
  return elapsedHours;
}

function actionFromTitle(title = '') {
  const normalized = title.trim().toLowerCase().replace(/[\[\]]/g, '');
  const match = normalized.match(/^nib:(feed|play|sleep)\b/);
  return match ? match[1] : null;
}

const ACTIONS = {
  feed: { hunger: 18, happiness: 5, energy: 2, emoji: '🍊', text: 'Nib lezzetli bir atıştırmalık kaptı' },
  play: { hunger: -4, happiness: 18, energy: -9, emoji: '🪀', text: 'Nib ile vahşi bir koridor yarışı yaptı' },
  sleep: { hunger: -2, happiness: 3, energy: 26, emoji: '🌙', text: 'Nib battaniyesine sarılıp uykuya daldı' }
};

function addEvent(state, message, now) {
  state.recent_events.unshift({ at: now.toISOString(), message });
  state.recent_events = state.recent_events.slice(0, 5);
}

function interact(state, { user, action, now = new Date() }) {
  const safeUser = String(user || 'mysterious-caretaker').replace(/[^a-zA-Z0-9-]/g, '');
  const key = `${safeUser}:${action}`;
  const last = state.cooldowns[key] ? new Date(state.cooldowns[key]) : null;
  const cooldownMs = 5 * 60 * 1000;
  if (last && now.getTime() - last.getTime() < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now.getTime() - last.getTime())) / 60_000);
    return { accepted: false, message: `Nib hâlâ son hareketinin etkisinde. ${remaining} dk sonra tekrar dene.`, user: safeUser };
  }
  const effect = ACTIONS[action];
  if (!effect) return { accepted: false, message: 'Nib bu ritüeli henüz öğrenmedi.', user: safeUser };
  const pet = state.pet;
  pet.hunger = clamp(pet.hunger + effect.hunger);
  pet.happiness = clamp(pet.happiness + effect.happiness);
  pet.energy = clamp(pet.energy + effect.energy);
  pet.status = action === 'sleep' ? 'SLEEPING' : statusFor(pet);
  pet.last_updated = now.toISOString();
  pet.version += 1;
  state.cooldowns[key] = now.toISOString();
  const score = state.leaderboard[safeUser] || { feed: 0, play: 0, sleep: 0, total: 0 };
  score[action] += 1;
  score.total += 1;
  state.leaderboard[safeUser] = score;
  addEvent(state, `@${safeUser} ${effect.text}. ${effect.emoji}`, now);
  return { accepted: true, message: `Teşekkürler @${safeUser}! ${effect.text}.`, user: safeUser, action };
}

function mood(state) {
  const { status } = state.pet;
  return {
    SUPER_HAPPY: { label: 'aşırı mutlu', color: '#9cf5d0', face: '◕‿◕', note: 'Bugün kodu değil, atmosferi compile ediyor.' },
    CONTENT: { label: 'keyfi yerinde', color: '#b9a7ff', face: '•ᴗ•', note: 'Biraz sevgiyle inanılmaz işler çıkarabilir.' },
    HUNGRY: { label: 'atıştırmalık düşünüyor', color: '#ffbd73', face: '•︵•', note: 'Bir issue onu çok mutlu eder.' },
    SICK_OR_SAD: { label: 'dramatik biçimde üzgün', color: '#8ea0c8', face: '╥﹏╥', note: 'Nib acilen bir portakal bekliyor.' },
    SLEEPING: { label: 'uyuyor', color: '#9c8ee8', face: 'ᵕᴗᵕ', note: 'Şşşt. Hata mesajlarını rüyasında çözüyor.' }
  }[status] || { label: 'gizemli', color: '#b9a7ff', face: '•ᴗ•', note: 'Bir şeyler planlıyor.' };
}

function meter(label, value, color, y) {
  const width = 270 * value / 100;
  return `<text x="332" y="${y}" fill="#dfe4ff" font-size="14" font-family="ui-monospace, monospace">${label.toUpperCase()} ${String(value).padStart(3, ' ')}%</text><rect x="332" y="${y + 10}" width="270" height="10" rx="5" fill="#2b315c"/><rect x="332" y="${y + 10}" width="${width}" height="10" rx="5" fill="${color}"/>`;
}

function renderSvg(state) {
  const pet = state.pet;
  const currentMood = mood(state);
  const sleeping = pet.status === 'SLEEPING';
  const tears = pet.status === 'SICK_OR_SAD' ? '<path class="tear" d="M245 258c8 12 8 18 0 24-8-6-8-12 0-24zm68 0c8 12 8 18 0 24-8-6-8-12 0-24z" fill="#79d9ff"/>' : '';
  const snack = pet.status === 'HUNGRY' || pet.status === 'SICK_OR_SAD' ? '<text x="258" y="335" text-anchor="middle" font-size="34">🍊</text>' : '';
  const sleep = sleeping ? '<text x="305" y="152" font-size="28" fill="#d9d1ff" class="zzz">Z z z</text>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="390" viewBox="0 0 720 390" role="img" aria-label="Nib is ${escapeXml(currentMood.label)}">
  <style>
    .float { animation: float 2.8s ease-in-out infinite; transform-origin: 260px 250px; }
    .blink { animation: blink 5s step-end infinite; transform-origin: center; }
    .tear { animation: drip 1.4s ease-in infinite; } .zzz { animation: drift 2.4s ease-in-out infinite; }
    @keyframes float { 50% { transform: translateY(-7px); } } @keyframes blink { 96% { transform: scaleY(.08); } }
    @keyframes drip { to { transform: translateY(12px); opacity: 0; } } @keyframes drift { 50% { transform: translate(8px,-9px); opacity: .35; } }
  </style>
  <rect width="720" height="390" rx="28" fill="#12162f"/>
  <circle cx="93" cy="75" r="2" fill="#f8bd75"/><circle cx="641" cy="100" r="3" fill="#a9f1d1"/><circle cx="575" cy="310" r="2" fill="#f8bd75"/><path d="M0 334C160 282 196 380 370 332s237 4 350-43v101H0z" fill="#1e2450"/>
  <g class="float">
    <path d="M132 245c0-86 52-145 128-145s128 59 128 145c0 76-45 111-128 111s-128-35-128-111z" fill="${currentMood.color}" stroke="#090d25" stroke-width="8"/>
    <path d="M160 142l-16-55 55 25m124 0 55-25-16 55" fill="${currentMood.color}" stroke="#090d25" stroke-width="8" stroke-linejoin="round"/>
    <ellipse class="blink" cx="216" cy="228" rx="21" ry="29" fill="#11142e"/><ellipse class="blink" cx="305" cy="228" rx="21" ry="29" fill="#11142e"/>
    <circle cx="221" cy="219" r="7" fill="#fff6d9"/><circle cx="310" cy="219" r="7" fill="#fff6d9"/>
    <path d="M242 274q18 14 36 0" fill="none" stroke="#11142e" stroke-width="7" stroke-linecap="round"/>
    <path d="M175 326q-13 26-33 21m199-21q13 26 33 21" fill="none" stroke="#090d25" stroke-width="12" stroke-linecap="round"/>
    ${tears}${snack}${sleep}
  </g>
  <text x="332" y="80" fill="#f7f4ff" font-size="33" font-family="ui-rounded, system-ui, sans-serif" font-weight="700">Nib · Lv. ${pet.level}</text>
  <text x="332" y="111" fill="${currentMood.color}" font-size="17" font-family="ui-monospace, monospace">${escapeXml(currentMood.face)}  ${escapeXml(currentMood.label)}</text>
  ${meter('Tokluk', pet.hunger, '#ff985d', 162)}
  ${meter('Neşe', pet.happiness, '#a9f1d1', 218)}
  ${meter('Enerji', pet.energy, '#a99aff', 274)}
  <text x="332" y="337" fill="#98a0c5" font-size="13" font-family="ui-monospace, monospace">${escapeXml(currentMood.note)}</text>
  <text x="332" y="362" fill="#5d6694" font-size="11" font-family="ui-monospace, monospace">alive via GitHub Issues · v${pet.version}</text>
</svg>`;
}

function leaderboardRows(state) {
  const entries = Object.entries(state.leaderboard).sort(([, a], [, b]) => b.total - a.total || b.feed - a.feed).slice(0, 5);
  if (!entries.length) return '| ✨ | You could be first | — | — | — | — |';
  const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
  return entries.map(([user, score], index) => `| ${medals[index]} | [@${escapeMarkdown(user)}](https://github.com/${encodeURIComponent(user)}) | ${roleFor(score)} | ${score.feed} | ${score.play} | ${score.total} 💖 |`).join('\n');
}

function roleFor(score) {
  const { feed = 0, play = 0, sleep = 0, total = 0 } = score;
  if (total >= 12 && Math.max(feed, play, sleep) - Math.min(feed, play, sleep) <= 2) return '🌌 Void Maintainer';
  if (feed >= play + 2 && feed >= sleep + 2) return '🍊 Snack Engineer';
  if (play >= feed + 2 && play >= sleep + 2) return '🪀 Chaos QA';
  if (sleep >= feed + 2 && sleep >= play + 2) return '🌙 DreamOps';
  return '✨ Junior Voidkeeper';
}

function renderReadmeBlock(state) {
  const pet = state.pet;
  const currentMood = mood(state);
  const event = state.recent_events[0]?.message || 'Nib etrafı kokluyor.';
  const owner = process.env.GITHUB_REPOSITORY_OWNER || 'stardexa';
  const repo = `${owner}/${owner}`;
  const svg = `https://raw.githubusercontent.com/${repo}/main/assets/nib.svg?v=${pet.version}`;
  const issueBase = `https://github.com/${repo}/issues/new?template=`;
  return `<!-- NIB:START -->
<div align="center">

### 👾 **Nib** · profilimde yaşayan küçük canavar

<img src="${svg}" alt="Nib şu an ${currentMood.label}" width="720" />

*${currentMood.note}*

[![Nib'yu besle](https://img.shields.io/badge/%F0%9F%8D%8A_Nib'yu_besle-Issue_a%C3%A7-ff8b5f?style=for-the-badge)](${issueBase}feed.yml)
[![Nib'yla oyna](https://img.shields.io/badge/%F0%9F%AA%80_Nib'yla_oyna-Issue_a%C3%A7-7bc9ff?style=for-the-badge)](${issueBase}play.yml)
[![Nib'yu uyut](https://img.shields.io/badge/%F0%9F%8C%99_Nib'yu_uyut-Issue_a%C3%A7-b3a2ff?style=for-the-badge)](${issueBase}sleep.yml)

<sub>Bir buton issue açar; Nib onu işler, teşekkür eder ve yaşar. Sıfır sunucu. Biraz büyü.</sub>

#### 🏆 Nib'nun en sevdiği bakıcılar

| Rank | Voidkeeper | Title | Snacks | Play | Total |
| :--: | :-- | :-- | :--: | :--: | :--: |
${leaderboardRows(state)}

<sub>Son olay: ${escapeMarkdown(event)}</sub>

</div>
<!-- NIB:END -->`;
}

function renderLeaderboardBlock(state) {
  return `<!-- NIB:LEADERBOARD:START -->
| Rank | Voidkeeper | Title | Snacks | Play | Total |
| :--: | :-- | :-- | :--: | :--: | :--: |
${leaderboardRows(state)}
<!-- NIB:LEADERBOARD:END -->`;
}

function updateReadme(state) {
  const block = renderLeaderboardBlock(state);
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const next = readme.replace(/<!-- NIB:LEADERBOARD:START -->[\s\S]*<!-- NIB:LEADERBOARD:END -->/, block);
  if (next === readme) throw new Error('README içinde NIB leaderboard işaretçileri bulunamadı.');
  fs.writeFileSync(README_PATH, next);
}

function renderAll(state) { fs.writeFileSync(SVG_PATH, renderSvg(state)); updateReadme(state); }
module.exports = { ACTIONS, ROOT, STATE_PATH, SVG_PATH, README_PATH, actionFromTitle, applyDecay, interact, loadState, mood, renderAll, roleFor, saveState, statusFor };
