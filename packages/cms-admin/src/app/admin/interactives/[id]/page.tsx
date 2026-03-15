"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, MousePointer2, Code, Save, RotateCcw, Loader2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then(m => m.default), { ssr: false });

/* ─── Types ──────────────────────────────────────────────────── */
interface InteractiveDetail {
  id: string;
  name: string;
  filename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  content: string;
}

type EditMode = "preview" | "visual" | "code";

/* ─── WYSIWYG injection script (adapted from Pitch Vault) ────── */
const WYSIWYG_SCRIPT = `
<script id="__cc_wysiwyg">
(function () {
  var SEMANTIC_SEL = 'h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,figcaption,span,label';
  var SKIP_SEL     = '#__cc_toolbar,#__cc_wysiwyg,script,style,noscript,svg,canvas,img,video,audio,iframe';
  var SKIP_TAGS    = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','CANVAS','IMG','VIDEO','AUDIO','IFRAME','INPUT','TEXTAREA','SELECT','BUTTON']);

  var activeEl    = null;
  var hoveredEl   = null;
  var toolbar     = null;
  var szInput     = null;
  var clrInput    = null;

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
    var m = String(rgb).match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
    if (!m) return '#ffffff';
    return '#' + [m[1],m[2],m[3]].map(function(n){ return (+n).toString(16).padStart(2,'0'); }).join('');
  }

  function buildToolbar() {
    var t = document.createElement('div');
    t.id = '__cc_toolbar';
    t.setAttribute('data-cc-skip','1');
    t.style.cssText = [
      'position:fixed;top:10px;left:50%;transform:translateX(-50%)',
      'background:#18181b;border:1px solid #3f3f46;border-radius:10px',
      'padding:6px 10px;display:flex;gap:6px;align-items:center',
      'z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.7)',
      'font-family:system-ui,sans-serif;font-size:13px;color:#fff',
      'user-select:none;pointer-events:all',
    ].join(';');

    function mkBtn(html, title, cmd) {
      var b = document.createElement('button');
      b.innerHTML = html;
      b.title = title;
      b.setAttribute('data-cc-skip','1');
      b.style.cssText = 'background:none;border:1px solid #52525b;color:#fff;min-width:28px;height:28px;border-radius:5px;cursor:pointer;font-size:13px;padding:0 6px;';
      b.addEventListener('mouseenter', function(){ b.style.background='#3f3f46'; });
      b.addEventListener('mouseleave', function(){ b.style.background='none'; });
      b.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); document.execCommand(cmd); });
      return b;
    }

    t.appendChild(mkBtn('<b>B</b>','Bold','bold'));
    t.appendChild(mkBtn('<i>I</i>','Italic','italic'));
    t.appendChild(mkBtn('<u>U</u>','Underline','underline'));

    var sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:20px;background:#3f3f46;';

    t.appendChild(sep.cloneNode());

    var szWrap = document.createElement('label');
    szWrap.style.cssText = 'display:flex;align-items:center;gap:4px;color:#a1a1aa;font-size:12px;cursor:default;';
    szWrap.textContent = 'px ';
    szInput = document.createElement('input');
    szInput.type = 'number'; szInput.min = '6'; szInput.max = '400';
    szInput.setAttribute('data-cc-skip','1');
    szInput.style.cssText = 'width:48px;background:#27272a;border:1px solid #52525b;color:#fff;border-radius:5px;padding:2px 6px;font-size:12px;';
    szInput.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    szInput.addEventListener('keydown', function(e){ e.stopPropagation(); });
    szInput.addEventListener('change', function(){
      if (activeEl) activeEl.style.fontSize = szInput.value + 'px';
    });
    szWrap.prepend(szInput);
    t.appendChild(szWrap);

    t.appendChild(sep.cloneNode());

    var clrWrap = document.createElement('label');
    clrWrap.style.cssText = 'display:flex;align-items:center;gap:4px;color:#a1a1aa;font-size:12px;cursor:pointer;';
    clrWrap.textContent = 'Color';
    clrInput = document.createElement('input');
    clrInput.type = 'color';
    clrInput.setAttribute('data-cc-skip','1');
    clrInput.style.cssText = 'width:28px;height:24px;border:1px solid #52525b;border-radius:4px;cursor:pointer;padding:1px;background:none;';
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
    doneBtn.style.cssText = 'background:#F7BB2E;border:none;color:#0D0D0D;padding:0 12px;height:28px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;';
    doneBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); deactivate(); });
    t.appendChild(doneBtn);

    document.body.appendChild(t);
    toolbar = t;
  }

  function activate(el) {
    if (activeEl === el) return;
    deactivate();

    activeEl = el;
    el.contentEditable = 'true';
    el.setAttribute('data-cc-editing','1');
    el.style.outline = '2px solid #F7BB2E';
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
      el.style.outline = '1px dashed rgba(247,187,46,.5)';
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

function injectWysiwyg(html: string): string {
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + WYSIWYG_SCRIPT + html.slice(insertAt);
  }
  const bodyEnd = html.toLowerCase().lastIndexOf("</body>");
  if (bodyEnd !== -1) {
    return html.slice(0, bodyEnd) + WYSIWYG_SCRIPT + html.slice(bodyEnd);
  }
  return html + WYSIWYG_SCRIPT;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function InteractiveDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detail, setDetail] = useState<InteractiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EditMode>("preview");
  const [codeValue, setCodeValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/interactives/${id}`);
      if (!res.ok) {
        router.push("/admin/interactives");
        return;
      }
      const data = await res.json();
      setDetail(data);
      setCodeValue(data.content);
      setOriginalContent(data.content);
    } catch {
      router.push("/admin/interactives");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  /* Listen for postMessage from WYSIWYG iframe */
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "htmlContent") {
        const html = e.data.html as string;
        setCodeValue(html);
        saveContent(html);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveContent(html: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/interactives/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: html }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail((prev) => (prev ? { ...prev, ...updated, content: html } : prev));
        setOriginalContent(html);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleVisualSave() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "getHtml" }, "*");
    }
  }

  function handleVisualReset() {
    setCodeValue(originalContent);
    // Re-render the visual editor with original content
    setMode("preview");
    setTimeout(() => setMode("visual"), 50);
  }

  function handleCodeSave() {
    saveContent(codeValue);
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl">
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const modes: { value: EditMode; label: string; icon: typeof Eye }[] = [
    { value: "preview", label: "Preview", icon: Eye },
    { value: "visual", label: "Visual Edit", icon: MousePointer2 },
    { value: "code", label: "Code", icon: Code },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 84px)" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.5rem 1rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/admin/interactives"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            fontSize: "0.7rem",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--muted-foreground)",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <ArrowLeft style={{ width: "0.75rem", height: "0.75rem" }} />
          Interactives
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="text-sm font-bold text-foreground truncate block">{detail.name}</span>
          <span
            style={{
              fontSize: "0.65rem",
              color: "var(--muted-foreground)",
              fontFamily: "monospace",
            }}
          >
            {detail.filename} &middot; {formatSize(detail.size)} &middot; {formatDate(detail.updatedAt)}
          </span>
        </div>

        {/* Mode tabs (compact pill style) */}
        <div
          style={{
            display: "flex",
            gap: "0.2rem",
            background: "var(--muted)",
            borderRadius: "7px",
            padding: "0.15rem",
            flexShrink: 0,
          }}
        >
          {modes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "5px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.75rem",
                fontWeight: 500,
                background: mode === value ? "var(--card)" : "transparent",
                color: mode === value ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: mode === value ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                transition: "all 150ms",
                whiteSpace: "nowrap",
              }}
            >
              <Icon style={{ width: "0.8rem", height: "0.8rem" }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area — fills remaining space, same padding as document editor */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 1rem" }}>
        {/* Preview mode */}
        {mode === "preview" && (
          <iframe
            src={`/api/interactives/${id}/preview?t=${Date.now()}`}
            title={detail.name}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: "100%",
              flex: 1,
              border: "none",
              background: "white",
            }}
          />
        )}

        {/* Visual edit mode */}
        {mode === "visual" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderBottom: "1px solid var(--border)",
                background: "var(--muted)",
              }}
            >
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", flex: 1 }}>
                Click on text elements to edit them in place
              </span>
              <button
                type="button"
                onClick={handleVisualReset}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.3rem 0.625rem",
                  borderRadius: "5px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                <RotateCcw style={{ width: "0.75rem", height: "0.75rem" }} />
                Reset
              </button>
              <button
                type="button"
                onClick={handleVisualSave}
                disabled={saving}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.3rem 0.625rem",
                  borderRadius: "5px",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <Loader2 style={{ width: "0.75rem", height: "0.75rem", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Save style={{ width: "0.75rem", height: "0.75rem" }} />
                )}
                {saved ? "Saved!" : saving ? "Saving..." : "Save"}
              </button>
            </div>
            <iframe
              ref={iframeRef}
              srcDoc={injectWysiwyg(codeValue)}
              title={`${detail.name} - Visual Edit`}
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                background: "white",
              }}
            />
          </div>
        )}

        {/* Code mode */}
        {mode === "code" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderBottom: "1px solid var(--border)",
                background: "var(--muted)",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", flex: 1, fontFamily: "monospace" }}>
                {codeValue.length.toLocaleString()} characters
              </span>
              <button
                type="button"
                onClick={() => setCodeValue(originalContent)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.3rem 0.625rem",
                  borderRadius: "5px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                <RotateCcw style={{ width: "0.75rem", height: "0.75rem" }} />
                Reset
              </button>
              <button
                type="button"
                onClick={handleCodeSave}
                disabled={saving || codeValue === originalContent}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.3rem 0.625rem",
                  borderRadius: "5px",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: saving || codeValue === originalContent ? "not-allowed" : "pointer",
                  opacity: saving || codeValue === originalContent ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <Loader2 style={{ width: "0.75rem", height: "0.75rem", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Save style={{ width: "0.75rem", height: "0.75rem" }} />
                )}
                {saved ? "Saved!" : saving ? "Saving..." : "Save"}
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <MonacoEditor
                language="html"
                theme="vs-dark"
                value={codeValue}
                onChange={(v) => setCodeValue(v ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12 },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
