const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const outputFile = path.join(srcDir, 'llms-full.txt');

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== '_includes' && file !== 'assets' && file !== '.well-known') {
        getFiles(filePath, fileList);
      }
    } else {
      if (file.endsWith('.njk') || file.endsWith('.html') || file.endsWith('.md')) {
        if (!file.startsWith('_') && file !== '404.njk') {
          fileList.push(filePath);
        }
      }
    }
  }
  return fileList;
}

function cleanContent(raw, filePath) {
  const relPath = path.relative(srcDir, filePath);
  let title = relPath;
  let text = raw;

  const fmMatch = raw.match(/^---\s*[\s\S]*?title:\s*["']?([^"'\r\n]+)["']?[\s\S]*?---/i);
  if (fmMatch && fmMatch[1]) {
    title = fmMatch[1].trim();
  }

  text = text.replace(/^---\s*[\s\S]*?---\s*/, '');

  text = text
    .replace(/{%[\s\S]*?%}/g, '')
    .replace(/{{[\s\S]*?}}/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return `# ${title}\nURL path: /${relPath.replace(/\.(njk|html|md)$/, '')}\n\n${text}\n\n---\n\n`;
}

function generate() {
  const files = getFiles(srcDir);
  console.log(`Processing ${files.length} pages for llms-full.txt in llmcfo...`);
  
  let fullText = `# LLM CFO — Complete Executive Guides & Financial Models (llms-full.txt)\n\n`;
  fullText += `Content-Signal: ai-train=no, search=yes, ai-input=yes\n\n`;
  fullText += `This document contains the complete text of all 73 public pages on llmcfo.com.\n\n`;
  fullText += `=`.repeat(80) + `\n\n`;

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    fullText += cleanContent(raw, file);
  }

  fs.writeFileSync(outputFile, fullText, 'utf8');
  console.log(`Successfully generated ${outputFile} (${fullText.length} bytes, ${files.length} pages).`);
}

generate();
