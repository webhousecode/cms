/**
 * Runtime WYSIWYG injection for htmldoc fields.
 * Adapted from Pitch Vault's wysiwyg-inject.ts, styled with CMS admin CSS variables.
 *
 * Strategy:
 * - Click on a text element -> activate contenteditable, show toolbar
 * - Click on NON-text elements (navigation, buttons) -> pass through
 * - While an element is active: all keyboard events are intercepted
 * - ESC or click outside text -> deactivate
 * - postMessage { type:'getHtml' } -> stripped, clean HTML back to parent
 */
export const WYSIWYG_SCRIPT = `
<script id="__cc_wysiwyg">
(function () {
  /* --- config ----------------------------------------------------------- */
  var SEMANTIC_SEL = 'h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,figcaption,span,label,a';
  var SKIP_SEL     = '#__cc_toolbar,#__cc_wysiwyg,script,style,noscript,svg,canvas,img,video,audio,iframe';
  var SKIP_TAGS    = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','CANVAS','IMG','VIDEO','AUDIO','IFRAME','INPUT','TEXTAREA','SELECT','BUTTON']);

  /* --- state ------------------------------------------------------------ */
  var activeEl    = null;
  var hoveredEl   = null;
  var toolbar     = null;
  var szInput     = null;
  var clrInput    = null;

  /* --- helpers ---------------------------------------------------------- */
  function skip(el) {
    if (!el) return true;
    if (el.closest(SKIP_SEL)) return true;
    return false;
  }

  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim().length > 0) return true;
    }
    return false;
  }

  function findText(target) {
    var el = target;
    while (el && el !== document.body) {
      if (!skip(el) && !SKIP_TAGS.has(el.tagName)) {
        if (el.matches && el.matches(SEMANTIC_SEL)) return el;
        if (hasDirectText(el)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function rgbToHex(rgb) {
    var m = String(rgb).match(/rgb\\\\((\\\\d+),\\\\s*(\\\\d+),\\\\s*(\\\\d+)\\\\)/);
    if (!m) return '#ffffff';
    return '#' + [m[1],m[2],m[3]].map(function(n){ return (+n).toString(16).padStart(2,'0'); }).join('');
  }

  /* --- toolbar ---------------------------------------------------------- */
  function buildToolbar() {
    var t = document.createElement('div');
    t.id = '__cc_toolbar';
    t.setAttribute('data-cc-skip','1');
    t.style.cssText = [
      'position:fixed;top:10px;left:50%;transform:translateX(-50%)',
      'background:hsl(240 6% 10%);border:1px solid hsl(240 4% 20%);border-radius:10px',
      'padding:6px 10px;display:flex;gap:6px;align-items:center',
      'z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.7)',
      'font-family:system-ui,sans-serif;font-size:13px;color:#e5e5e5',
      'user-select:none;pointer-events:all',
    ].join(';');

    function mkBtn(html, title, cmd) {
      var b = document.createElement('button');
      b.innerHTML = html;
      b.title = title;
      b.setAttribute('data-cc-skip','1');
      b.style.cssText = 'background:none;border:1px solid hsl(240 4% 26%);color:#e5e5e5;min-width:28px;height:28px;border-radius:5px;cursor:pointer;font-size:13px;padding:0 6px;';
      b.addEventListener('mouseenter', function(){ b.style.background='hsl(240 4% 20%)'; });
      b.addEventListener('mouseleave', function(){ b.style.background='none'; });
      b.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); document.execCommand(cmd); });
      return b;
    }

    t.appendChild(mkBtn('<b>B</b>','Bold','bold'));
    t.appendChild(mkBtn('<i>I</i>','Italic','italic'));
    t.appendChild(mkBtn('<u>U</u>','Underline','underline'));

    var sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:20px;background:hsl(240 4% 20%);';

    t.appendChild(sep.cloneNode());

    /* font size */
    var szWrap = document.createElement('label');
    szWrap.style.cssText = 'display:flex;align-items:center;gap:4px;color:hsl(240 4% 55%);font-size:12px;cursor:default;';
    szWrap.textContent = 'px ';
    szInput = document.createElement('input');
    szInput.type = 'number'; szInput.min = '6'; szInput.max = '400';
    szInput.setAttribute('data-cc-skip','1');
    szInput.style.cssText = 'width:48px;background:hsl(240 6% 14%);border:1px solid hsl(240 4% 26%);color:#e5e5e5;border-radius:5px;padding:2px 6px;font-size:12px;';
    szInput.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    szInput.addEventListener('keydown', function(e){ e.stopPropagation(); });
    szInput.addEventListener('change', function(){
      if (activeEl) activeEl.style.fontSize = szInput.value + 'px';
    });
    szWrap.prepend(szInput);
    t.appendChild(szWrap);

    t.appendChild(sep.cloneNode());

    /* text color */
    var clrWrap = document.createElement('label');
    clrWrap.style.cssText = 'display:flex;align-items:center;gap:4px;color:hsl(240 4% 55%);font-size:12px;cursor:pointer;';
    clrWrap.textContent = 'Color';
    clrInput = document.createElement('input');
    clrInput.type = 'color';
    clrInput.setAttribute('data-cc-skip','1');
    clrInput.style.cssText = 'width:28px;height:24px;border:1px solid hsl(240 4% 26%);border-radius:4px;cursor:pointer;padding:1px;background:none;';
    clrInput.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    clrInput.addEventListener('input', function(){
      if (activeEl) activeEl.style.color = clrInput.value;
    });
    clrWrap.prepend(clrInput);
    t.appendChild(clrWrap);

    t.appendChild(sep.cloneNode());

    var doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.setAttribute('data-cc-skip','1');
    doneBtn.style.cssText = 'background:hsl(38 92% 50%);border:none;color:#0d0d0d;padding:0 12px;height:28px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;';
    doneBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); deactivate(); });
    t.appendChild(doneBtn);

    document.body.appendChild(t);
    toolbar = t;
  }

  /* --- activate / deactivate -------------------------------------------- */
  function activate(el) {
    if (activeEl === el) return;
    deactivate();

    activeEl = el;
    el.contentEditable = 'true';
    el.setAttribute('data-cc-editing','1');
    el.style.outline = '2px solid hsl(38 92% 50%)';
    el.style.outlineOffset = '2px';
    el.style.cursor = 'text';
    el.focus();

    if (!toolbar) buildToolbar();
    toolbar.style.display = 'flex';

    var cs = window.getComputedStyle(el);
    szInput.value  = Math.round(parseFloat(cs.fontSize));
    clrInput.value = rgbToHex(cs.color);

    window.parent.postMessage({ type:'editingActive', editing:true }, '*');
  }

  function deactivate() {
    if (!activeEl) return;
    activeEl.contentEditable = 'false';
    activeEl.removeAttribute('data-cc-editing');
    activeEl.style.outline = '';
    activeEl.style.outlineOffset = '';
    activeEl.style.cursor = '';
    activeEl.blur();
    activeEl = null;
    if (toolbar) toolbar.style.display = 'none';
    window.parent.postMessage({ type:'editingActive', editing:false }, '*');
  }

  /* --- event interception ----------------------------------------------- */
  document.addEventListener('click', function(e) {
    if (e.target && e.target.closest('#__cc_toolbar')) return;

    var textEl = findText(e.target);

    if (textEl) {
      e.stopImmediatePropagation();
      e.preventDefault();
      activate(textEl);
    } else if (activeEl) {
      deactivate();
    }
  }, true);

  document.addEventListener('mousedown', function(e) {
    if (e.target && e.target.closest('#__cc_toolbar')) return;

    var textEl = findText(e.target);
    if (textEl) {
      e.stopImmediatePropagation();
      if (!activeEl || e.target !== activeEl) e.preventDefault();
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (!activeEl) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); deactivate(); }
  }, true);

  /* --- hover highlight -------------------------------------------------- */
  document.addEventListener('mouseover', function(e) {
    if (activeEl) return;
    var el = findText(e.target);
    if (el === hoveredEl) return;
    if (hoveredEl && hoveredEl !== activeEl) {
      hoveredEl.style.outline = '';
      hoveredEl.style.cursor  = '';
    }
    hoveredEl = el;
    if (el) {
      el.style.outline = '1px dashed hsla(38,92%,50%,.5)';
      el.style.cursor  = 'text';
    }
  });

  document.addEventListener('mouseout', function(e) {
    if (activeEl) return;
    var el = findText(e.target);
    if (el && el === hoveredEl && el !== activeEl) {
      el.style.outline = '';
      el.style.cursor  = '';
      hoveredEl = null;
    }
  });

  /* --- postMessage API -------------------------------------------------- */
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'getHtml') {
      deactivate();
      if (toolbar) toolbar.remove();
      var s = document.getElementById('__cc_wysiwyg');
      if (s) s.remove();
      document.querySelectorAll('[contenteditable]').forEach(function(el){
        el.removeAttribute('contenteditable');
      });
      document.querySelectorAll('[data-cc-editing]').forEach(function(el){
        el.removeAttribute('data-cc-editing');
      });
      document.querySelectorAll('[data-cc-skip]').forEach(function(el){
        el.removeAttribute('data-cc-skip');
      });
      window.parent.postMessage({
        type: 'htmlContent',
        html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
      }, '*');
    }
  });

  window.parent.postMessage({ type:'wysiwygReady' }, '*');
})();
</script>
`;

/**
 * Injects the WYSIWYG script as the first element in <head> so our event
 * listeners are registered before any document scripts.
 */
export function injectWysiwyg(html: string): string {
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + WYSIWYG_SCRIPT + html.slice(insertAt);
  }
  // fallback: before </body>
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  if (bodyEnd !== -1) {
    return html.slice(0, bodyEnd) + WYSIWYG_SCRIPT + html.slice(bodyEnd);
  }
  return html + WYSIWYG_SCRIPT;
}
