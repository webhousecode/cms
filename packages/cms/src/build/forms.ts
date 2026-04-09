/**
 * F30 — Build-time form HTML generation.
 *
 * For each form defined in cms.config.ts, generates a standalone HTML page
 * at `forms/<name>/index.html` containing a semantic <form> element.
 *
 * The form POSTs to the CMS admin API. It includes:
 *   - All fields with correct HTML5 types and validation attributes
 *   - A honeypot field (hidden, invisible to humans)
 *   - A tiny inline <script> for async submit + success/error UI
 *   - Works without JS as a plain form POST with redirect fallback
 *
 * Sites can:
 *   a) Use the generated page directly (link to /forms/contact/)
 *   b) Copy the <form> HTML into their own templates
 *   c) Use the embeddable widget script instead (GET /api/forms/[name]/widget.js)
 */

import type { FormConfig, FormFieldConfig } from '../schema/types.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderField(f: FormFieldConfig): string {
  const req = f.required ? ' required' : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const pat = f.validation?.pattern ? ` pattern="${esc(f.validation.pattern)}"` : '';
  const minLen = f.validation?.minLength ? ` minlength="${f.validation.minLength}"` : '';
  const maxLen = f.validation?.maxLength ? ` maxlength="${f.validation.maxLength}"` : '';
  const attrs = `${req}${ph}${pat}${minLen}${maxLen}`;

  if (f.type === 'hidden') {
    return `<input type="hidden" name="${esc(f.name)}" value="${esc(f.defaultValue ?? '')}">`;
  }

  let input: string;
  if (f.type === 'textarea') {
    input = `<textarea name="${esc(f.name)}"${attrs} rows="4" style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit;width:100%;box-sizing:border-box;resize:vertical"></textarea>`;
  } else if (f.type === 'select' && f.options) {
    const opts = f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    input = `<select name="${esc(f.name)}"${req} style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit;width:100%;box-sizing:border-box"><option value="">—</option>${opts}</select>`;
  } else if (f.type === 'checkbox') {
    input = `<label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9rem"><input type="checkbox" name="${esc(f.name)}"${req}> ${esc(f.label)}</label>`;
    return `<div>${input}</div>`;
  } else {
    const inputType = f.type === 'phone' ? 'tel' : f.type;
    input = `<input type="${inputType}" name="${esc(f.name)}"${attrs} style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit;width:100%;box-sizing:border-box">`;
  }

  return `<div style="display:flex;flex-direction:column;gap:0.25rem">
  <label style="font-size:0.85rem;font-weight:500">${esc(f.label)}${f.required ? ' <span style="color:#e55">*</span>' : ''}</label>
  ${input}
</div>`;
}

/**
 * Generate the full <form> HTML for a single form config.
 * `adminUrl` is the absolute URL to the CMS admin (e.g. "https://cms.example.com").
 */
export function generateFormHtml(form: FormConfig, adminUrl: string): string {
  const actionUrl = `${adminUrl}/api/forms/${encodeURIComponent(form.name)}`;
  const fields = form.fields.map(renderField).join('\n');
  const honeypot = `<div style="position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden" aria-hidden="true"><input name="_hp_email" tabindex="-1" autocomplete="off"></div>`;
  const successMsg = esc(form.successMessage ?? 'Thank you!');

  return `<form id="whf-${esc(form.name)}" action="${esc(actionUrl)}" method="POST" style="display:flex;flex-direction:column;gap:0.75rem;font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px">
${fields}
${honeypot}
<button type="submit" style="padding:0.6rem 1.25rem;border:none;border-radius:6px;background:#F7BB2E;color:#0D0D0D;font-weight:600;font-size:0.9rem;cursor:pointer;align-self:flex-start;transition:opacity 0.15s">Submit</button>
<div id="whf-msg-${esc(form.name)}" style="display:none;padding:0.5rem;border-radius:6px;font-size:0.85rem"></div>
</form>
<script>
(function(){
  var f=document.getElementById("whf-${form.name}");
  if(!f)return;
  f.addEventListener("submit",function(e){
    e.preventDefault();
    var btn=f.querySelector("button[type=submit]"),msg=document.getElementById("whf-msg-${form.name}");
    btn.disabled=true;btn.textContent="Sending…";msg.style.display="none";
    var fd=new FormData(f),body={};fd.forEach(function(v,k){body[k]=v;});
    fetch(f.action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
    .then(function(r){
      msg.style.display="block";
      if(r.ok){msg.style.background="#d4edda";msg.style.color="#155724";msg.textContent=r.data.message||"${successMsg}";f.reset();}
      else{msg.style.background="#f8d7da";msg.style.color="#721c24";msg.textContent=r.data.error||"Something went wrong.";}
      btn.disabled=false;btn.textContent="Submit";
    }).catch(function(){
      msg.style.display="block";msg.style.background="#f8d7da";msg.style.color="#721c24";msg.textContent="Network error.";
      btn.disabled=false;btn.textContent="Submit";
    });
  });
})();
</script>`;
}

/**
 * Generate a full standalone HTML page wrapping the form.
 */
export function generateFormPage(form: FormConfig, adminUrl: string, siteTitle?: string): string {
  const formHtml = generateFormHtml(form, adminUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(form.label)} — ${esc(siteTitle ?? 'webhouse.app')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1.5rem; font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p.desc { color: #666; margin: 0 0 1.5rem; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>${esc(form.label)}</h1>
${formHtml}
</body>
</html>`;
}
