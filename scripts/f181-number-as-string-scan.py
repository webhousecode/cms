#!/usr/bin/env python3
"""F181 — hvor mange number-felter baerer en STRENG i stedet for et tal.

FIRE tilstande, ikke to. Blandes de sidste tre, ser rapporten bedre ud end
virkeligheden (samme fejl som undertekst-scanneren i torrent-repoet lavede).
  A number      rigtigt
  B "2800"      streng, men taluigtig    -> kan migreres maskinelt
  C "4.950"     streng, IKKE taluigtig   -> KAN IKKE gaettes, et menneske skal afgoere
  D null/""/-   aldrig sat               -> ikke en fejl, migreringen skal lade den vaere
"""
import json,os,re,sys
from pathlib import Path

def number_felter(cfg_tekst):
    """Feltnavne erklaeret som type:'number'. Regex, ikke en TS-parser — derfor
    rapporteres antallet, saa en for lav faangst kan ses frem for at gaette."""
    ud=set()
    for m in re.finditer(r'name:\s*[\'"]([A-Za-z0-9_]+)[\'"]([^}]{0,200}?)type:\s*[\'"]number[\'"]', cfg_tekst, re.S):
        ud.add(m.group(1))
    for m in re.finditer(r'type:\s*[\'"]number[\'"]([^}]{0,200}?)name:\s*[\'"]([A-Za-z0-9_]+)[\'"]', cfg_tekst, re.S):
        ud.add(m.group(2))
    return ud

def klassificer(v):
    if isinstance(v,bool): return "C"
    if isinstance(v,(int,float)): return "A"
    if v is None: return "D"
    if isinstance(v,str):
        s=v.strip()
        if s=="": return "D"
        try:
            f=float(s)
            # "00" og "2800" er taluigtige; "4.950" parser ogsaa men betyder noget andet
            return "B" if str(int(f))==s or str(f)==s else "C"
        except ValueError: return "C"
    return "C"

def gaa(doc, felter, sti, ud):
    if isinstance(doc,dict):
        for k,v in doc.items():
            if k in felter and not isinstance(v,(dict,list)):
                ud.append((k, klassificer(v), v, sti))
            else: gaa(v, felter, f"{sti}.{k}", ud)
    elif isinstance(doc,list):
        for i,v in enumerate(doc): gaa(v, felter, f"{sti}[{i}]", ud)

ROD = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
cfgs = sorted(ROD.rglob("cms.config.ts"))
if not cfgs: print(f"ingen cms.config.ts under {ROD} — forkert population?"); sys.exit(2)
for cfg in cfgs:
    if "node_modules" in str(cfg) or "boilerplate" in str(cfg) or "-test" in str(cfg): continue
    rod=cfg.parent
    felter=number_felter(cfg.read_text(errors="replace"))
    if not felter: continue
    fund=[]
    for cd in [rod/"content", rod/"src"/"content"]:
        if not cd.is_dir(): continue
        for f in cd.rglob("*.json"):
            try: gaa(json.loads(f.read_text(errors="replace")), felter, str(f.relative_to(rod)), fund)
            except Exception: pass
    if not fund: continue
    t={k:0 for k in "ABCD"}
    for _,k,_,_ in fund: t[k]+=1
    print(f"\n{rod}  ({len(felter)} number-felter erklaeret: {', '.join(sorted(felter))})")
    print(f"   A tal={t['A']}   B streng-taluigtig={t['B']}   C IKKE-taluigtig={t['C']}   D tom={t['D']}")
    for navn,k,v,sti in fund:
        if k=="C": print(f"     C! {navn}={v!r}  <- {sti}")
    b=[(n,v,s) for n,k,v,s in fund if k=="B"]
    for n,v,s in b[:4]: print(f"     B  {n}={v!r}  <- {s}")
    if len(b)>4: print(f"     B  ... og {len(b)-4} mere")
