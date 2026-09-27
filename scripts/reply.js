const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib');

async function main() {
  const result = JSON.parse(fs.readFileSync(path.join(ROOT, '.nib-result.json'), 'utf8'));
  const issue = process.env.ISSUE_NUMBER;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!issue || !repository || !token) throw new Error('Issue yanıtı için GitHub bağlamı eksik.');
  const base = `https://api.github.com/repos/${repository}/issues/${issue}`;
  const body = result.accepted
    ? `### ${result.action === 'feed' ? '🍊 Afiyet oldu!' : result.action === 'play' ? '🪀 Nib coştu!' : '🌙 İyi geceler, Nib!'}\n\n${result.message}\n\n> Durumu README’de birkaç saniye içinde güncellenecek. Tekrar buluşmak üzere, bakıcı. ✨`
    : `### 🫧 Nib küçük bir mola istiyor\n\n${result.message}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
  const comment = await fetch(`${base}/comments`, { method: 'POST', headers, body: JSON.stringify({ body }) });
  if (!comment.ok) throw new Error(`Yanıt yazılamadı: ${comment.status}`);
  const close = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  if (!close.ok) throw new Error(`Issue kapatılamadı: ${close.status}`);
}
main().catch((error) => { console.error(error); process.exit(1); });
