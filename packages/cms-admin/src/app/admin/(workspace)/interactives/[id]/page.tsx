"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, MousePointer2, Code, Save, Loader2, Copy, History, Settings2, Trash2, Globe, FileText, AlertTriangle, Sparkles, Pencil, ChevronDown } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTabs } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSiteRole } from "@/hooks/use-site-role";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then(m => m.default), { ssr: false });

/* ─── Types ──────────────────────────────────────────────────── */
interface InteractiveDetail {
  id: string;
  name: string;
  filename: string;
  size: number;
  status: "draft" | "published" | "trashed";
  createdAt: string;
  updatedAt: string;
  content: string;
  locale?: string;
  translationOf?: string;
}

type EditMode = "preview" | "visual" | "code" | "ai-edit";

const InteractiveAIPanel = dynamic(() => import("@/components/editor/interactive-ai-panel").then(m => ({ default: m.InteractiveAIPanel })), { ssr: false });

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
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";

  const [detail, setDetail] = useState<InteractiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EditMode>("preview");
  const [codeValue, setCodeValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [siteLocales, setSiteLocales] = useState<string[]>([]);
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [siblings, setSiblings] = useState<Array<{ id: string; name: string; locale?: string; translationOf?: string }>>([]);
  const [translating, setTranslating] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setTabTitle } = useTabs();

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

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Set tab title when detail loads
  useEffect(() => {
    if (detail?.name) setTabTitle(detail.name);
  }, [detail?.name, setTabTitle]);

  // Fetch site locales + sibling translations
  useEffect(() => {
    fetch("/api/admin/site-config", { cache: "no-store" })
      .then(r => r.json())
      .then(cfg => {
        setSiteLocales(cfg.locales ?? []);
        setDefaultLocale(cfg.defaultLocale ?? "en");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!detail) return;
    fetch("/api/interactives")
      .then(r => r.json())
      .then((all: Array<{ id: string; name: string; locale?: string; translationOf?: string }>) => {
        const sourceId = detail.translationOf ?? detail.id;
        setSiblings(all.filter(i =>
          i.id !== detail.id &&
          (i.translationOf === sourceId || i.id === sourceId)
        ));
      })
      .catch(() => {});
  }, [detail?.id, detail?.translationOf]);

  /* Close panels and dialogs on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmTrash) { setConfirmTrash(false); e.preventDefault(); return; }
        if (propertiesOpen) { setPropertiesOpen(false); e.preventDefault(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [propertiesOpen, confirmTrash]);

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

  async function cloneInteractive() {
    if (!detail) return;
    setCloning(true);
    try {
      const blob = new Blob([codeValue], { type: "text/html" });
      const file = new File([blob], `${detail.name}-copy.html`, { type: "text/html" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/interactives", { method: "POST", body: fd });
      if (res.ok) {
        const created = await res.json();
        router.push(`/admin/interactives/${created.id}`);
      }
    } finally {
      setCloning(false);
    }
  }

  async function setStatus(status: "draft" | "published" | "trashed") {
    setSaving(true);
    try {
      const res = await fetch(`/api/interactives/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail((prev) => prev ? { ...prev, ...updated } : prev);
        if (status === "trashed") {
          router.push("/admin/interactives");
        }
      }
    } finally {
      setSaving(false);
    }
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

  async function renameTo(newName: string) {
    const res = await fetch(`/api/interactives/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDetail((prev) => prev ? { ...prev, ...updated } : prev);
      setTabTitle(newName);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: "0.8rem", fontFamily: "monospace", color: "var(--foreground)",
  };

  if (!detail) return null;

  const modes: { value: EditMode; label: string; icon: typeof Eye }[] = [
    { value: "preview", label: "Preview", icon: Eye },
    { value: "visual", label: "Visual Edit", icon: MousePointer2 },
    { value: "code", label: "Code", icon: Code },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 84px)", minHeight: 0 }}>
      {/* Top bar — matches document editor exactly */}
      <ActionBar
        actions={
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}

            {/* Status badge — same as editor */}
            <span className={`flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded-full ${
              detail.status === "published"
                ? "bg-green-500/10 text-green-400"
                : "bg-yellow-500/10 text-yellow-400"
            }`}>
              <Globe className="w-3 h-3" />
              {detail.status ?? "draft"}
            </span>

            {/* Clone */}
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={cloneInteractive}
                disabled={cloning}
                className="text-muted-foreground hover:text-foreground gap-1.5"
                title="Clone interactive"
              >
                <Copy className="w-3.5 h-3.5" />
                {cloning ? "Cloning..." : "Clone"}
              </Button>
            )}

            {/* Edit dropdown — Visual / Code / AI */}
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${["visual", "code", "ai-edit"].includes(mode) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {mode === "visual" ? <MousePointer2 className="w-3.5 h-3.5" /> :
                     mode === "code" ? <Code className="w-3.5 h-3.5" /> :
                     mode === "ai-edit" ? <Sparkles className="w-3.5 h-3.5" /> :
                     <Pencil className="w-3.5 h-3.5" />}
                    {mode === "visual" ? "Visual" : mode === "code" ? "Code" : mode === "ai-edit" ? "AI" : "Edit"}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => setMode("visual")} className={mode === "visual" ? "bg-accent" : ""}>
                    <MousePointer2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Visual
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode("code")} className={mode === "code" ? "bg-accent" : ""}>
                    <Code className="mr-2 h-4 w-4 text-muted-foreground" />
                    Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode("ai-edit")} className={mode === "ai-edit" ? "bg-accent" : ""}>
                    <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
                    AI
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* History */}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5"
              title="Revision history"
              disabled
            >
              <History className="w-3.5 h-3.5" />
              History
            </Button>

            {/* Properties */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setPropertiesOpen((o) => !o); if (!propertiesOpen) setEditName(detail.name); }}
              className={propertiesOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}
              title="Properties (name, filename, dates)"
            >
              <Settings2 className="w-4 h-4" />
            </Button>

            {/* Trash */}
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmTrash(true)}
                className="text-muted-foreground hover:text-destructive"
                title="Move to trash"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}

            {/* Preview — icon only */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMode("preview")}
              className={mode === "preview" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
              title="Preview"
            >
              <Eye className="w-4 h-4" />
            </Button>

            {/* Publish / Unpublish — same as editor */}
            {!readOnly && (
              detail.status === "published" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatus("draft")}
                  disabled={saving}
                  className="gap-1.5"
                  title="Revert to draft (unpublish)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Unpublish
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatus("published")}
                  disabled={saving}
                  className="gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-400"
                  title="Publish"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Publish
                </Button>
              )
            )}

            {/* Save */}
            {!readOnly && (
              <Button
                size="sm"
                onClick={mode === "visual" ? handleVisualSave : handleCodeSave}
                disabled={saving || (mode === "code" && codeValue === originalContent)}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saved ? "Saved!" : "Save"}
              </Button>
            )}
          </div>
        }
      >
        <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center" }} />
        <Link
          href="/admin/interactives"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Back to Interactives"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <ActionBarBreadcrumb items={["interactives", detail.name]} />
        <span className="text-xs text-muted-foreground font-mono">{formatSize(detail.size)}</span>
      </ActionBar>

      {/* Translations bar — same pattern as document editor */}
      {siteLocales.length > 1 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap",
          padding: "0.35rem 1rem",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.75rem",
        }}>
          <span style={{ fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
            TRANSLATIONS
          </span>
          {/* Locale badge */}
          <span style={{
            fontSize: "0.65rem", fontWeight: 600, padding: "1px 6px",
            borderRadius: "3px", background: "rgba(247,187,46,0.12)", color: "#F7BB2E",
          }}>
            {(detail.locale || defaultLocale).toUpperCase()}
          </span>
          {/* Sibling translations */}
          {siblings.map(s => (
            <Link
              key={s.id}
              href={`/admin/interactives/${s.id}`}
              style={{
                fontSize: "0.65rem", fontWeight: 500, padding: "1px 6px",
                borderRadius: "3px", border: "1px solid var(--border)",
                color: "var(--muted-foreground)", textDecoration: "none",
              }}
            >
              {(s.locale || "?").toUpperCase()} {s.name}
            </Link>
          ))}
          {/* Add translation button — only on source docs */}
          {!detail.translationOf && (() => {
            const existingLocales = [detail.locale || defaultLocale, ...siblings.map(s => s.locale).filter(Boolean)];
            const available = siteLocales.filter(l => !existingLocales.includes(l));
            if (available.length === 0) return null;
            return available.map(locale => (
              <button
                key={locale}
                type="button"
                disabled={translating}
                onClick={async () => {
                  setTranslating(true);
                  try {
                    // Set locale on source if not set
                    if (!detail.locale) {
                      await fetch(`/api/interactives/${id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ locale: defaultLocale }),
                      });
                    }
                    // Create translated copy via AI
                    const res = await fetch(`/api/interactives/${id}/translate`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ targetLocale: locale }),
                    });
                    if (res.ok) {
                      const result = await res.json();
                      // Set locale + translationOf on the new interactive
                      await fetch(`/api/interactives/${result.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ locale, translationOf: id }),
                      });
                      router.push(`/admin/interactives/${result.id}`);
                    }
                  } finally {
                    setTranslating(false);
                  }
                }}
                style={{
                  fontSize: "0.65rem", fontWeight: 500, padding: "1px 8px",
                  borderRadius: "3px", border: "1px solid rgb(247 187 46 / 0.3)",
                  background: "rgb(247 187 46 / 0.08)", color: "#F7BB2E",
                  cursor: translating ? "wait" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: "0.25rem",
                }}
              >
                {translating ? "Translating..." : `+ ${locale.toUpperCase()}`}
              </button>
            ));
          })()}
        </div>
      )}

      {/* Properties panel — right sidebar, same as document editor */}
      {propertiesOpen && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "340px", zIndex: 100,
          background: "var(--card)", borderLeft: "1px solid var(--border)",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Properties</span>
            <button type="button" onClick={() => setPropertiesOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", lineHeight: 1 }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* ID */}
            <div>
              <p style={labelStyle}>ID</p>
              <p style={{ ...valueStyle, color: "var(--muted-foreground)", fontSize: "0.72rem" }}>{detail.id}</p>
            </div>

            {/* Name — editable */}
            <div>
              <p style={labelStyle}>Name</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && editName !== detail.name) renameTo(editName); }}
                  style={{
                    flex: 1, padding: "0.35rem 0.5rem", borderRadius: "5px",
                    border: `1px solid ${editName !== detail.name ? "var(--primary)" : "var(--border)"}`,
                    background: "var(--background)", color: "var(--foreground)",
                    fontSize: "0.8rem", fontFamily: "monospace", outline: "none",
                  }}
                />
                {editName !== detail.name && (
                  <button
                    type="button"
                    onClick={() => renameTo(editName)}
                    style={{
                      padding: "0.35rem 0.625rem", borderRadius: "5px",
                      border: "none", background: "var(--primary)",
                      color: "var(--primary-foreground)", fontSize: "0.75rem",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Filename */}
            <div>
              <p style={labelStyle}>Filename</p>
              <p style={valueStyle}>{detail.filename}</p>
            </div>

            {/* Status */}
            <div>
              <p style={labelStyle}>Status</p>
              <p style={valueStyle}>{detail.status ?? "draft"}</p>
            </div>

            {/* Size */}
            <div>
              <p style={labelStyle}>Size</p>
              <p style={valueStyle}>{formatSize(detail.size)}</p>
            </div>

            {/* Dates */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <p style={labelStyle}>Created</p>
                <p style={valueStyle}>{new Date(detail.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p style={labelStyle}>Last updated</p>
                <p style={valueStyle}>{new Date(detail.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content area — fills remaining space, same padding as document editor */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 1rem", minHeight: 0 }}>
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

        {/* AI Edit mode — split view: preview left, AI chat right */}
        {mode === "ai-edit" && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: "1px", background: "var(--border)" }}>
            <div style={{ flex: 1, background: "var(--background)", display: "flex", flexDirection: "column" }}>
              <iframe
                src={`/api/interactives/${id}/preview?t=${Date.now()}`}
                title={detail.name}
                sandbox="allow-scripts allow-same-origin"
                style={{ width: "100%", flex: 1, border: "none", background: "white" }}
              />
            </div>
            <div style={{ width: "430px", flexShrink: 0, background: "var(--background)" }}>
              <InteractiveAIPanel
                interactiveId={id}
                title={detail.name}
                content={codeValue}
                onApply={(html) => setCodeValue(html)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Trash confirmation dialog */}
      {confirmTrash && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--card)", border: "1px solid rgb(239 68 68 / 0.3)", borderRadius: "12px", padding: "1.5rem", maxWidth: "420px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <AlertTriangle style={{ width: "1.25rem", height: "1.25rem", color: "rgb(239 68 68)", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>Move to trash?</p>
                <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace", wordBreak: "break-all", marginTop: "0.2rem" }}>{detail.name}</p>
              </div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
              This interactive will be moved to trash. You can restore it later from the trash.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button variant="outline" size="sm" onClick={() => setConfirmTrash(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setConfirmTrash(false); setStatus("trashed"); }}
              >
                Move to trash
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
