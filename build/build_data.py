# -*- coding: utf-8 -*-
"""
בניית data.js מתוך data_source.json — מאגר מיפוי האקדמיה הישראלית בתחום החלל.

הרצה:  python3 build/build_data.py
פלט:   data.js בשורש הפרויקט (window.DATA + מטא-נתונים + לקסיקון חיפוש)
"""
import json, re, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FINALS = str.maketrans('םןץףך', 'מנצפכ')

def norm(s):
    s = re.sub(r'[֑-ׇ]', '', s or '')
    s = s.replace('״', '"').replace('׳', "'").replace('"', ' ').replace("'", ' ')
    s = re.sub(r'[\-–—/\\|,:;·\.\(\)\[\]]', ' ', s)
    s = s.translate(FINALS).replace('וו', 'ו').replace('יי', 'י')
    return ' '.join(s.lower().split())

# ---------------------------------------------------------------------------
# לקסיקון קונספטים: id -> (שם תצוגה, [מילים נרדפות שמשתמש עשוי להקליד],
#                            [תבניות regex לתיוג יחידות לפי הטקסט שלהן])
# החיפוש בדפדפן מרחיב שאילתות דרך המילים הנרדפות אל תגי היחידות.
# ---------------------------------------------------------------------------
CONCEPTS = {
 'rocket':        ('הנעה רקטית', ['טיל','טילים','רקטה','רקטות','משגר','שיגור','הנעה','מנוע רקטי','דלק רקטי','rocket','propulsion','launcher','הודף','שריפה','בעירה'],
                   [r'הנעה רקטית', r'\brocket', r'טיל', r'משגר', r'הודפ', r'שריפה', r'בעירה', r'propulsion']),
 'jet':           ('מנועי סילון', ['סילון','מנוע סילון','טורבינה','מגח','jet','turbine','ramjet'],
                   [r'סילונ', r'\bjet', r'טורבו', r'מגח', r'turbomach']),
 'satellite':     ('לוויינים', ['לוויין','לווין','לוויינים','satellite','satellites','חללית','חלליות','spacecraft'],
                   [r'לווינ', r'לוויינ', r'satellite', r'חללית', r'spacecraft']),
 'nanosat':       ('ננו-לוויינים', ['ננו לוויין','ננו-לוויין','קיובסאט','cubesat','nanosatellite','לוויין זעיר','לוויין סטודנטים','student satellite'],
                   [r'ננו.?לווינ', r'ננו.?לוויינ', r'cubesat', r'קיובסאט', r'nano.?satellite', r'לווינ(י|יי)? סטודנטימ']),
 'orbit':         ('אסטרודינמיקה ומסלולים', ['מסלול','מסלולים','אסטרודינמיקה','astrodynamics','orbit','orbital','מכניקה שמימית','גופים בחלל'],
                   [r'מסלול', r'אסטרודינמיקה', r'orbit', r'גופימ בחלל', r'space mechanics']),
 'formation':     ('מעופף מבנים', ['מעופף מבנים','formation flying','להקת לוויינים','להקה','מבוזרות'],
                   [r'מעופפ מבנימ', r'formation', r'מבוזר']),
 'navigation':    ('ניווט', ['ניווט','navigation','gps','gnss','אינרציאלי','שערוך','estimation','קלמן','kalman'],
                   [r'ניווט', r'navigat', r'\bgps\b', r'gnss', r'שערוכ', r'אינרציאל']),
 'control':       ('הנחיה ובקרה', ['בקרה','הנחיה','ביות','guidance','control','היגוי','בקרת מסלול'],
                   [r'בקרה', r'בקרת', r'הנחי(ה|יה)', r'ביות', r'guidance', r'control']),
 'robotics':      ('רובוטיקה ואוטונומיה', ['רובוט','רובוטיקה','רובוטים','אוטונומי','אוטונומיה','autonomous','robotics','slam','תפיסה','רב-סוכני'],
                   [r'רובוט', r'אוטונומ', r'autonom', r'\bslam\b', r'תפיסה', r'רב.?סוכנ']),
 'ai':            ('בינה מלאכותית', ['בינה מלאכותית','למידת מכונה','למידה עמוקה','ai','machine learning','deep learning','ראייה ממוחשבת','computer vision','נתונים','data science'],
                   [r'בינה מלאכותית', r'למידת מכונה', r'למידה עמוקה', r'machine learning', r'deep learning', r'ראי(י|)ה ממוחשבת', r'computer vision', r'\bai\b']),
 'astro':         ('אסטרופיזיקה ואסטרונומיה', ['אסטרונומיה','אסטרופיזיקה','astronomy','astrophysics','כוכב','כוכבים','גלקסיה','גלקסיות','יקום','קוסמולוגיה','שביט','אסטרואיד','סופרנובה','פולסר','קוואזר'],
                   [r'אסטרונומ', r'אסטרופיזי', r'astronom', r'astrophys', r'גלקסי', r'קוסמולוגי', r'כוכב', r'יקומ', r'סופרנובה', r'אסטרואיד']),
 'planets':       ('כוכבי לכת וירח', ['כוכבי לכת','כוכב לכת','פלנטה','מאדים','ירח','נוגה','צדק','exoplanet','mars','moon','planetary','בראשית'],
                   [r'כוכבי? לכת', r'פלנט', r'מאדימ', r'\bירח\b', r'exoplanet', r'planetar', r'בראשית']),
 'telescope':     ('טלסקופים ותצפיות', ['טלסקופ','טלסקופים','telescope','מצפה','מצפה כוכבים','observatory','תצפית'],
                   [r'טלסקופ', r'telescop', r'מצפה', r'observator']),
 'relativity':    ('יחסות וכבידה', ['יחסות','כבידה','גלי כבידה','חור שחור','חורים שחורים','relativity','gravitational','black hole'],
                   [r'יחסות', r'כבידה', r'חור(ימ)? שחור', r'gravitat', r'black hole']),
 'particles':     ('חלקיקים וקרינה קוסמית', ['חלקיקים','קרינה קוסמית','נייטרינו','cosmic ray','particle','קרינה'],
                   [r'חלקיקימ', r'קרינה קוסמית', r'נייטרינו', r'cosmic', r'קרינה']),
 'remote':        ('חישה מרחוק', ['חישה מרחוק','remote sensing','הדמיה','דימות','צילום לוויין','תצלומי לוויין','earth observation','תצפית כדור הארץ','gis','ממג','ממ"ג','היפרספקטרלי','ספקטרלי','מיפוי'],
                   [r'חישה מרחוק', r'remote sensing', r'הדמי(ה|יה)', r'דימות', r'היפרספקטרל', r'earth observation', r'\bgis\b', r'ממ.?ג', r'מיפוי']),
 'climate':       ('אקלים ואטמוספירה', ['אקלים','מזג אוויר','מטאורולוגיה','אטמוספירה','אטמוספרה','climate','atmosphere','עננים','ברקים','סערות'],
                   [r'אקלימ', r'מזג.?אוויר', r'מטאורולוגי', r'אטמוספ', r'climat', r'atmospher', r'עננ', r'ברקימ', r'סופות']),
 'earth':         ('מדעי כדור הארץ', ['גאופיזיקה','גיאופיזיקה','geophysics','סייסמולוגיה','אוקיינוגרפיה','אוקיינוס','כדור הארץ','גאולוגיה','גיאולוגיה','planetary science'],
                   [r'גא?יאופיזי|גאופיזי', r'geophys', r'סייסמ', r'אוקיינ', r'כדור הארצ', r'גא?יאולוגי|גאולוגי']),
 'spaceweather':  ('מזג אוויר בחלל', ['מזג אוויר בחלל','space weather','שמש','סופות שמש','יונוספירה','מגנטוספירה','פלזמת חלל'],
                   [r'space weather', r'יונוספ', r'מגנטוספ', r'סופות שמש', r'השמש']),
 'comm':          ('תקשורת לוויינית', ['תקשורת','תקשורת לוויינית','communication','אנטנה','אנטנות','antenna','רדיו','מיקרוגל','rf','קישור אופטי','תדר'],
                   [r'תקשורת', r'communicat', r'אנטנ', r'antenna', r'מיקרוגל', r'\brf\b', r'רדיו']),
 'optics':        ('אופטיקה ולייזרים', ['אופטיקה','אופטי','פוטוניקה','לייזר','לייזרים','optics','photonics','laser','אלקטרו אופטיקה','אלקטרואופטיקה'],
                   [r'אופטי', r'פוטוני', r'לייזר', r'optic', r'photon', r'laser']),
 'aero':          ('אווירודינמיקה ותעופה', ['אווירודינמיקה','אוירודינמיקה','אווירונאוטיקה','תעופה','טיס','מטוס','מטוסים','כלי טיס','זרימה','מנהרת רוח','aerodynamics','aeronautics','flight','מסוק','מסוקים'],
                   [r'א?ווירודינמי|אוירודינמי', r'אווירונאוט|אוירונאוט', r'תעופ', r'טיס', r'מטוס', r'זרימ', r'מנהרת רוח', r'aerodynam', r'aeronaut', r'flight', r'מסוק']),
 'uav':           ('כטב"מ ורחפנים', ['כטבמ','כטב"מ','רחפן','רחפנים','drone','uav','כלי טיס בלתי מאוישים'],
                   [r'כטב.?מ', r'רחפנ', r'\bdrone', r'\buav\b', r'בלתי מאויש']),
 'structures':    ('מבנים וחומרים', ['מבנים','חוזק','חומרים','materials','structures','קומפוזיט','אלסטיות','שבר'],
                   [r'מבנימ', r'חומרימ', r'קומפוזיט', r'אלסטי', r'structur', r'material', r'שבר']),
 'plasma':        ('פלזמה והנעה חשמלית', ['פלזמה','plasma','הנעה חשמלית','יונית','מנוע יוני','הול','אלקטרית'],
                   [r'פלזמה', r'plasma', r'הנעה חשמלית', r'יונ(י|ית)', r'electric propulsion']),
 'thermal':       ('תרמודינמיקה ומעבר חום', ['תרמי','תרמו','מעבר חום','thermal','תרמודינמיקה','קירור'],
                   [r'תרמ(י|ו)', r'מעבר חומ', r'thermal', r'תרמודינמי']),
 'law':           ('משפט ומדיניות חלל', ['משפט','משפט חלל','חוק','מדיניות','policy','law','רגולציה','ביטחון','אסטרטגיה','דיפלומטיה'],
                   [r'משפט', r'מדיניות', r'רגולצי', r'\blaw\b', r'policy', r'ביטחונ', r'אסטרטגי', r'דיפלומט']),
 'medicine':      ('רפואה וביולוגיה בחלל', ['רפואת חלל','רפואה','ביולוגיה','מיקרוגרביטציה','אסטרוביולוגיה','space medicine','astrobiology','חיים בחלל','כשירות'],
                   [r'רפוא', r'ביולוגי', r'מיקרוגרביטצי', r'אסטרוביולוגי', r'astrobiolog', r'medicine']),
 'business':      ('יזמות ותעשיית החלל', ['יזמות','סטארטאפ','עסקים','תעשייה','newspace','entrepreneurship','ניו ספייס','האצה','חדשנות'],
                   [r'יזמות', r'סטארט.?אפ', r'newspace', r'תעשי(י|)ת החלל', r'חדשנות', r'entrepreneur']),
 'humanflight':   ('טיסות מאוישות', ['אסטרונאוט','אסטרונאוטים','טיסה מאוישת','משימה מאוישת','רקיע','תחנת החלל','iss','אקסיום','axiom'],
                   [r'אסטרונאוט', r'מאויש', r'תחנת החלל', r'\biss\b', r'רקיע', r'axiom']),
 'quantum':       ('טכנולוגיות קוונטיות', ['קוונטי','קוונטים','quantum','הצפנה קוונטית'],
                   [r'קוונט', r'quantum']),
 'education':     ('חינוך ומעורבות', ['חינוך','הוראה','הסברה','outreach','תלמידים','נוער','קהילה'],
                   [r'חינוכ', r'הוראה', r'הסברה', r'outreach', r'תלמידימ', r'נוער']),
 'gamma':         ('קרינת גמא ורנטגן', ['גמא','רנטגן','x-ray','gamma','ספקטרוסקופיה'],
                   [r'גמא', r'רנטגנ', r'x.?ray', r'gamma', r'ספקטרוסקופ']),
}

def collapse(p):
    # התאמת תבניות לטקסט המנורמל (וו->ו, יי->י, אותיות סופיות)
    return p.replace('וו', 'ו').replace('יי', 'י')

def build_tags(entry):
    text = norm(' '.join([entry.get('name',''), entry.get('fac',''), entry.get('what',''),
                          entry.get('why',''), entry.get('notes',''), entry.get('dom',''),
                          ' '.join(entry.get('doms') or [])]))
    tags = []
    for cid, (_disp, _syns, pats) in CONCEPTS.items():
        for p in pats:
            if re.search(collapse(p), text):
                tags.append(cid)
                break
    return tags

DEG_FIX = {
    'גם וגם': 'תואר ראשון + מתקדמים',
    'תואר שני': 'תארים מתקדמים',
}
def fix_degree(d):
    d = (d or '').strip()
    d = DEG_FIX.get(d, d)
    if len(d) > 38:  # תיאור חופשי ארוך — לא ערך תואר
        return ''
    return d

def main():
    data = json.load(open(os.path.join(HERE, 'data_source.json'), encoding='utf-8'))
    inst_short = json.load(open(os.path.join(HERE, 'inst_short.json'), encoding='utf-8'))
    inst_summ = json.load(open(os.path.join(HERE, 'inst_summ.json'), encoding='utf-8'))

    KEEP = ['n','inst','fac','type','name','person','dom','doms','url','notes','year','core',
            'what','why','rakia','code','degree','credits','prereq','prereqIds','mandatory',
            'status','statusNote','ok']
    out = []
    for d in data:
        d['degree'] = fix_degree(d.get('degree'))
        e = {k: d.get(k) for k in KEEP if d.get(k) not in (None, '', [])}
        e['n'] = d['n']; e['rakia'] = bool(d.get('rakia'))
        e['status'] = d.get('status') or 'unverified'
        e['tags'] = build_tags(d)
        out.append(e)

    concepts_js = {cid: {'l': disp, 's': sorted({norm(s) for s in syns})}
                   for cid, (disp, syns, _p) in CONCEPTS.items()}

    today = datetime.date.today()
    meta = {'updated': f'{today.month}/{today.year}', 'total': len(out)}

    js = ('// קובץ נתונים שנוצר אוטומטית על-ידי build/build_data.py — לא לערוך ידנית\n'
          'window.DATA=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.INST_SHORT=' + json.dumps(inst_short, ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.INST_SUMM=' + json.dumps(inst_summ, ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.CONCEPTS=' + json.dumps(concepts_js, ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.META=' + json.dumps(meta, ensure_ascii=False) + ';\n')
    open(os.path.join(ROOT, 'data.js'), 'w', encoding='utf-8').write(js)
    n_tagged = sum(1 for e in out if e['tags'])
    print(f'data.js written: {len(out)} entries, {n_tagged} tagged, {len(concepts_js)} concepts')

if __name__ == '__main__':
    main()
