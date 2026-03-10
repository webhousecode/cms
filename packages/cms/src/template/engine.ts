export interface SafeHtml {
  __html: string;
}

export function raw(html: string): SafeHtml {
  return { __html: html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function processValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && '__html' in (value as object)) {
    return (value as SafeHtml).__html;
  }
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i] ?? '';
    if (i < values.length) {
      result += processValue(values[i]);
    }
  }
  return result;
}
