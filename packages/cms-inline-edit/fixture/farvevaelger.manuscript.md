# flow: farvevaelger-skifter-faktisk-farven
base: http://127.0.0.1:4321

# Kør: python3 -m http.server 4321 --bind 127.0.0.1 fra packages/cms-inline-edit
# derefter lens_run_manuscript({ project: "cms", manuscript: <denne fil> }).
#
# Beviset er IKKE at execCommand bliver kaldt — det blev det også dengang
# farven ikke skiftede. Beviset er den målte computed color bagefter.

- goto /fixture/index.html
- expectVisible [inline-edit-idle]
- click [inline-edit-enter]
- expectVisible [inline-edit-badge]
- click [fixture-felt]
- expectEditable [fixture-felt]
- assert: const el=document.querySelector('#felt'); el.focus(); const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); return { pass: s.toString().trim().length > 0, detail: 'markeret: ' + s.toString() };
- assert: const f=document.querySelector('#felt'); return { pass: f.querySelector('font,span') === null, detail: 'FOER: ' + f.innerHTML };
- click [inline-toolbar-color]
- expectVisible [inline-color-picker]
- click [inline-color-site-swatch-brand-primary]
- assert: const f=document.querySelector('#felt'); const n=f.querySelector('font,span'); if(!n) return {pass:false, detail:'ingen farvet node — innerHTML: '+f.innerHTML}; const c=getComputedStyle(n).color; return { pass: c === 'rgb(0, 178, 255)', detail: 'maalt=' + c + ' forventet=rgb(0, 178, 255)' };
- screenshot farven-sat
