const fs = require('fs');
const path = require('path');

module.exports = function () {
  const dir = path.join(__dirname, 'articles');
  const articles = {};
  if (!fs.existsSync(dir)) return articles;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const slug = file.replace(/\.json$/, '');
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      articles[slug] = JSON.parse(raw);
    } catch (e) {
      console.warn(`[articles data] Failed to parse ${file}:`, e.message);
    }
  }
  return articles;
};
