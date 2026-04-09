/**
 * Tiny zero-dependency markdown → HTML converter for the example.
 * Astro projects can swap in marked, markdown-it, or remark for full support.
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = md;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre><code>${escapeHtml(code.trim())}</code></pre>`
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Paragraphs
  const lines = html.split('\n');
  const out: string[] = [];
  let inP = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inP) {
        out.push('</p>');
        inP = false;
      }
      continue;
    }
    if (t.startsWith('<') && !t.startsWith('<code')) {
      if (inP) {
        out.push('</p>');
        inP = false;
      }
      out.push(t);
      continue;
    }
    if (!inP) {
      out.push('<p>');
      inP = true;
    } else {
      out.push('<br>');
    }
    out.push(t);
  }
  if (inP) out.push('</p>');
  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
