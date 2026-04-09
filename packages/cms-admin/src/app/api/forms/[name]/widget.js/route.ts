import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/forms/[name]/widget.js — embeddable form widget script.
 *
 * Drop this on any page:
 *   <script src="https://admin.example.com/api/forms/contact/widget.js"></script>
 *   <div id="webhouse-form-contact"></div>
 *
 * The script fetches the form schema, renders styled HTML, handles
 * submission via fetch, and shows success/error inline. ~4KB, zero deps.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  const host = fwdHost ?? url.host;
  const proto = fwdProto ?? url.protocol.replace(":", "");
  const base = `${proto}://${host}`;

  const js = `
(function(){
  var FORM_NAME = ${JSON.stringify(name)};
  var BASE = ${JSON.stringify(base)};
  var SCHEMA_URL = BASE + "/api/forms/" + FORM_NAME + "/schema";
  var SUBMIT_URL = BASE + "/api/forms/" + FORM_NAME;
  var CONTAINER_ID = "webhouse-form-" + FORM_NAME;

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function render(schema) {
    var el = document.getElementById(CONTAINER_ID);
    if (!el) { console.warn("[webhouse] #" + CONTAINER_ID + " not found"); return; }

    var fields = schema.fields || [];
    var html = '<form id="whf-' + FORM_NAME + '" style="display:flex;flex-direction:column;gap:0.75rem;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.9rem">';

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      html += '<div style="display:flex;flex-direction:column;gap:0.25rem">';
      html += '<label style="font-size:0.8rem;font-weight:500">' + esc(f.label) + (f.required ? ' <span style="color:#e55">*</span>' : '') + '</label>';

      if (f.type === "textarea") {
        html += '<textarea name="' + esc(f.name) + '"' + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' rows="4" style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit;resize:vertical"></textarea>';
      } else if (f.type === "select" && f.options) {
        html += '<select name="' + esc(f.name) + '"' + (f.required ? ' required' : '') + ' style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit">';
        html += '<option value="">—</option>';
        for (var j = 0; j < f.options.length; j++) {
          html += '<option value="' + esc(f.options[j].value) + '">' + esc(f.options[j].label) + '</option>';
        }
        html += '</select>';
      } else if (f.type === "checkbox") {
        html += '<label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem"><input type="checkbox" name="' + esc(f.name) + '"' + (f.required ? ' required' : '') + '> ' + esc(f.label) + '</label>';
      } else if (f.type === "hidden") {
        html += '<input type="hidden" name="' + esc(f.name) + '" value="' + esc(f.defaultValue || "") + '">';
      } else {
        var inputType = f.type === "phone" ? "tel" : f.type;
        html += '<input type="' + inputType + '" name="' + esc(f.name) + '"' + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font:inherit">';
      }
      html += '</div>';
    }

    // Honeypot
    html += '<div style="position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden"><input name="_hp_email" tabindex="-1" autocomplete="off"></div>';

    html += '<button type="submit" style="padding:0.6rem 1.25rem;border:none;border-radius:6px;background:#F7BB2E;color:#0D0D0D;font-weight:600;font-size:0.9rem;cursor:pointer;align-self:flex-start">Submit</button>';
    html += '<div id="whf-msg-' + FORM_NAME + '" style="display:none;padding:0.5rem;border-radius:6px;font-size:0.85rem"></div>';
    html += '</form>';

    el.innerHTML = html;

    var form = document.getElementById("whf-" + FORM_NAME);
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = form.querySelector("button[type=submit]");
      var msgEl = document.getElementById("whf-msg-" + FORM_NAME);
      btn.disabled = true;
      btn.textContent = "Sending…";
      msgEl.style.display = "none";

      var fd = new FormData(form);
      var body = {};
      fd.forEach(function(v, k) { body[k] = v; });

      fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        if (res.ok) {
          msgEl.style.display = "block";
          msgEl.style.background = "#d4edda";
          msgEl.style.color = "#155724";
          msgEl.textContent = res.data.message || ${JSON.stringify("Thank you!")};
          form.reset();
        } else {
          msgEl.style.display = "block";
          msgEl.style.background = "#f8d7da";
          msgEl.style.color = "#721c24";
          msgEl.textContent = res.data.error || "Something went wrong.";
        }
        btn.disabled = false;
        btn.textContent = "Submit";
      })
      .catch(function() {
        msgEl.style.display = "block";
        msgEl.style.background = "#f8d7da";
        msgEl.style.color = "#721c24";
        msgEl.textContent = "Network error — please try again.";
        btn.disabled = false;
        btn.textContent = "Submit";
      });
    });
  }

  fetch(SCHEMA_URL)
    .then(function(r) { return r.json(); })
    .then(render)
    .catch(function(e) { console.error("[webhouse] Form widget error:", e); });
})();
`.trim();

  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
