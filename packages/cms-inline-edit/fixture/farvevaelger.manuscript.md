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
- expectVisible [inline-color-pipette]
- click [inline-color-site-swatch-brand-primary]
- assert: const f=document.querySelector('#felt'); const n=f.querySelector('font,span'); if(!n) return {pass:false, detail:'ingen farvet node — innerHTML: '+f.innerHTML}; const c=getComputedStyle(n).color; return { pass: c === 'rgb(0, 178, 255)', detail: 'maalt=' + c + ' forventet=rgb(0, 178, 255)' };
- screenshot farven-sat

---

# flow: pipetten-skriver-i-hex-feltet
base: http://127.0.0.1:4321

# Browserens EGEN pipette kan ikke drives af et script — den åbner en vælger på
# operativsystem-niveau. Derfor stubber fixturen KUN den, via ?pipette=<hex>.
# Alt vores eget — knappen, at den kun tegnes hvor API'et findes, skrivningen i
# hex-feltet, og at teksten IKKE farves før man trykker Brug — er den rigtige kode.

- goto /fixture/index.html?pipette=%23bada55
- click [inline-edit-enter]
- click [fixture-felt]
- assert: const el=document.querySelector('#felt'); el.focus(); const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); return { pass: true };
- click [inline-toolbar-color]
- expectVisible [inline-color-pipette]
- assert: const h=document.querySelector('[data-testid=inline-color-hex]'); const n=document.querySelector('#felt font,#felt span'); return { pass: h.value === '' && !n, detail: 'FOER: hex=«' + h.value + '»' };
- click [inline-color-pipette]
- assert: const h=document.querySelector('[data-testid=inline-color-hex]'); const n=document.querySelector('#felt font,#felt span'); return { pass: h.value === '#bada55' && !n, detail: 'EFTER maaling: hex=«' + h.value + '» · teksten er IKKE farvet endnu' };
- click [inline-color-hex-brug]
- assert: const n=document.querySelector('#felt font,#felt span'); const c=n?getComputedStyle(n).color:'ingen'; const p=document.querySelector('[data-testid=inline-toolbar-color] [data-role=prik]'); return { pass: c === 'rgb(186, 218, 85)' && getComputedStyle(p).backgroundColor === 'rgb(186, 218, 85)', detail: 'EFTER Brug: tekst=' + c };
- screenshot pipette-maalt
