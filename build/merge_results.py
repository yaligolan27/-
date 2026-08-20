# -*- coding: utf-8 -*-
"""
מיזוג תוצאות צוות סוכני המחקר אל build/data_source.json.

קלט:  קובץ JSON עם מערך התוצאות של ה-workflow
       [{item:{kind,inst,id}, research:{verified,new_entries,access_issues,notes}, skeptic:{entries:[...]}}]
הרצה: python3 build/merge_results.py <results.json>
"""
import json, re, sys, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'data_source.json')

DOMS = ["פיזיקה ואסטרופיזיקה / אסטרונומיה","חישה מרחוק ולוויינים","הנדסת אוויר וחלל / אווירונאוטיקה",
        "רובוטיקה ומערכות חלל","תקשורת לוויינית","מדעי כדור הארץ והאטמוספירה","משפט / רפואת / מדיניות חלל"]
TYPES = ["קורס","מעבדה","תואר","מרכז/מכון","תוכנית מיוחדת"]
DEGS = {"תואר ראשון","תארים מתקדמים","תואר ראשון + מתקדמים","דוקטורט","פתוח לכולם",""}

FINALS = str.maketrans('םןץףך', 'מנצפכ')
def normtxt(s):
    return ' '.join((s or '').translate(FINALS).replace('"','').replace("'",'').lower().split())

def fix_dom(dom, text):
    if dom in DOMS: return dom
    d = normtxt(dom)
    for cand in DOMS:
        if d and (d in normtxt(cand) or normtxt(cand) in d): return cand
    t = normtxt(dom + ' ' + text)
    rules = [
        (r'אסטרו|כוכב|גלקס|קוסמו|פיזיקה|טלסקופ', DOMS[0]),
        (r'חישה|הדמי|דימות|לוינ|לווינ|earth observation|gis', DOMS[1]),
        (r'אויר|אוויר|תעופ|טיס|הנעה|רקט|אירונאוט', DOMS[2]),
        (r'רובוט|אוטונומ|מערכות חלל|ננו', DOMS[3]),
        (r'תקשורת|אנטנ|אופטי|לייזר|rf', DOMS[4]),
        (r'אטמוספ|אקלימ|כדור הארצ|גאו|גיאו|סביבה', DOMS[5]),
        (r'משפט|מדיניות|רפוא|ביולוג|עסקימ|יזמות|חינוכ', DOMS[6]),
    ]
    for pat, cand in rules:
        if re.search(pat, t): return cand
    return DOMS[0]

def fix_degree(d):
    d = (d or '').strip()
    aliases = {'תואר שני': 'תארים מתקדמים', 'גם וגם': 'תואר ראשון + מתקדמים',
               'תואר ראשון ושני': 'תואר ראשון + מתקדמים'}
    d = aliases.get(d, d)
    return d if d in DEGS else ''

def name_key(inst, name):
    return (normtxt(inst), re.sub(r'\(.*?\)', '', normtxt(name)).strip()[:60])

def main(results_path):
    data = json.load(open(SRC, encoding='utf-8'))
    byn = {d['n']: d for d in data}
    results = json.load(open(results_path, encoding='utf-8'))
    if isinstance(results, dict):  # עטוף באובייקט
        results = results.get('results') or results.get('value') or []

    stats = collections.Counter()
    access = []
    applied_status = collections.Counter()

    # --- שלב 1: עדכוני אימות ---
    for r in results:
        if not r: continue
        res = r.get('research') or {}
        access += [f"[{(r.get('item') or {}).get('inst','?')}] {a}" for a in (res.get('access_issues') or [])]
        for v in (res.get('verified') or []):
            d = byn.get(v.get('n'))
            if not d: continue
            st = v.get('status')
            if st in ('active','closed','uncertain'):
                d['status'] = st; applied_status[st] += 1
            if v.get('statusNote'): d['statusNote'] = v['statusNote']
            deg = fix_degree(v.get('degree'))
            if deg: d['degree'] = deg
            if v.get('url') and v['url'].startswith('http'): d['url'] = v['url']
            if v.get('prereq') and not d.get('prereq'): d['prereq'] = v['prereq']
            if v.get('extraNote'):
                d['notes'] = ((d.get('notes') or '') + ' | עדכון 8/2026: ' + v['extraNote']).strip(' |')
            stats['verified'] += 1

    # --- שלב 2: יחידות חדשות (אחרי מסנן הסקפטיק) ---
    existing_keys = {name_key(d['inst'], d['name']) for d in data}
    existing_codes = {(d['inst'], d.get('code')) for d in data if d.get('code')}
    next_n = max(d['n'] for d in data) + 1
    new_rows = []
    for r in results:
        if not r: continue
        res = r.get('research') or {}
        sk = (r.get('skeptic') or {}).get('entries') or []
        verdicts = {normtxt(e.get('name','')): e for e in sk}
        for e in (res.get('new_entries') or []):
            nm = normtxt(e.get('name',''))
            v = verdicts.get(nm)
            if v is None:
                # ללא פסק דין — שמרנות: רק ביטחון גבוה נכנס
                if e.get('confidence') != 'high':
                    stats['dropped_no_verdict'] += 1; continue
            elif v.get('verdict') == 'drop':
                stats['dropped_by_skeptic'] += 1; continue
            elif v.get('verdict') == 'fix':
                for fk, ek in [('fixedName','name'),('fixedUrl','url'),('fixedDegree','degree'),
                               ('fixedType','type'),('fixedDom','dom'),('fixedWhat','what')]:
                    if v.get(fk): e[ek] = v[fk]
            key = name_key(e.get('inst',''), e.get('name',''))
            if key in existing_keys:
                stats['dropped_duplicate'] += 1; continue
            code = (e.get('code') or '').strip()
            if code and (e.get('inst'), code) in existing_codes:
                stats['dropped_duplicate'] += 1; continue
            existing_keys.add(key)
            typ = e.get('type') if e.get('type') in TYPES else 'תוכנית מיוחדת'
            dom = fix_dom(e.get('dom',''), (e.get('what','') or '') + ' ' + (e.get('name','') or ''))
            row = {
                'n': next_n, 'inst': e.get('inst','').strip(), 'fac': e.get('fac',''),
                'type': typ, 'name': e.get('name','').strip(),
                'lead': '', 'lect': '', 'person': e.get('person',''),
                'dom': dom, 'doms': [dom], 'url': e.get('url',''),
                'notes': ('אותר במחקר מקוון 8/2026' + ('; ' + e['evidence'] if e.get('evidence') else '')),
                'ok': e.get('confidence') == 'high', 'src': 'ours', 'year': e.get('year'),
                'core': 'core', 'what': e.get('what',''), 'why': e.get('why',''),
                'rakia': False, 'code': code, 'degree': fix_degree(e.get('degree')),
                'credits': e.get('credits',''), 'prereq': e.get('prereq',''),
                'prereqIds': [], 'mandatory': '',
                'status': e.get('status') if e.get('status') in ('active','uncertain') else 'uncertain',
                'statusNote': 'אותר ואומת במחקר מקוון 8/2026' if e.get('confidence')=='high' else 'אותר במחקר מקוון 8/2026 — מומלץ אימות נוסף',
            }
            new_rows.append(row); next_n += 1
            stats['added'] += 1

    data += new_rows

    # --- שלב 3: חישוב מחדש של קישורי קדם ---
    def canon(x):
        x = re.sub(r'\D','',x)
        return x.zfill(6) if len(x)==5 else x
    code2n = {}
    for d in data:
        if d.get('code'): code2n[(d['inst'], d['code'])] = d['n']
    for d in data:
        refs = set(d.get('prereqIds') or [])
        for c in re.findall(r'\b0?\d{5}\b', d.get('prereq') or ''):
            n = code2n.get((d['inst'], canon(c)))
            if n and n != d['n']: refs.add(n)
        d['prereqIds'] = sorted(refs)

    json.dump(data, open(SRC,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
    print('status applied:', dict(applied_status))
    print('stats:', dict(stats))
    print('total entries now:', len(data))
    inst_new = sorted({r['inst'] for r in new_rows})
    print('institutions with new entries:', inst_new)
    if access:
        with open(os.path.join(HERE,'access_issues.txt'),'a',encoding='utf-8') as f:
            f.write('\n'.join(access) + '\n')
    print('access issues logged:', len(access))

if __name__ == '__main__':
    main(sys.argv[1])
