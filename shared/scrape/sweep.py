#!/usr/bin/env python3
"""틈 listing sweeper: real, currently open 공모전 / 대외활동 / 서포터즈 / 학술제 -> shared/feed.js

On demand only (no cron). Polite: robots.txt checked per URL, >= 2 s between requests to one host,
browser UA, raw responses cached, never logs in, GET only. Rule-based on purpose: kind, tags, builds
and hours come from rules.json, never from a model.

  python sweep.py                 # real run: fetch, normalise, download posters, write shared/feed.js
  python sweep.py --dry-run       # fetch and normalise, print a summary, write nothing to the repo
  python sweep.py --limit 20      # cap the feed at 20 items
  python sweep.py --selftest      # parse the saved fixtures only, no network

Run with the repo venv: python3
"""
import argparse, datetime as dt, difflib, gzip, hashlib, html, json, os, re, subprocess, sys, threading, time
import urllib.robotparser
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent                      # projects/study/capstone-teum-vault
RULES = json.loads((HERE / 'rules.json').read_text(encoding='utf-8'))
FIXTURES = HERE / 'fixtures'
FEED_JS = APP / 'shared' / 'feed.js'
CURATED_JS = APP / 'shared' / 'activities.js'
POSTER_DIR = APP / 'assets' / 'posters' / 'feed'
UNKNOWN = RULES['unknown']
TODAY = dt.date.fromisoformat(RULES['today'])
KST = dt.timezone(dt.timedelta(hours=9))
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
MIN_GAP = 2.0                                  # seconds between requests to one host
POSTER_MAX_BYTES = 80_000


# ---------- polite fetcher ----------
class Fetcher:
    """GET only. Checks robots.txt, spaces requests per host, caches every raw body."""

    def __init__(self, cache_dir, offline=False):
        import requests
        self.s = requests.Session()
        self.s.headers.update({'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9'})
        self.cache = Path(cache_dir); self.cache.mkdir(parents=True, exist_ok=True)
        self.offline = offline
        self.last = {}; self.robots = {}; self.log = []   # log rows: (host, url, status, note)
        self.locks = defaultdict(threading.Lock)            # one lock per host: sources run in parallel, hosts never overlap

    def _wait(self, host):
        gap = time.monotonic() - self.last.get(host, 0)
        if gap < MIN_GAP: time.sleep(MIN_GAP - gap)
        self.last[host] = time.monotonic()

    def allowed(self, url):
        p = urlparse(url); base = f'{p.scheme}://{p.netloc}'
        if base not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._wait(p.netloc)
                r = self.s.get(base + '/robots.txt', timeout=15)
                # 4xx robots = no rules (RFC 9309); 5xx or network error = treat as disallow
                if r.status_code >= 500: rp.disallow_all = True
                elif r.status_code >= 400: rp.allow_all = True
                else: rp.parse(r.text.splitlines())
            except Exception:
                rp.disallow_all = True
            self.robots[base] = rp
        return self.robots[base].can_fetch(UA, url)

    def get(self, url, binary=False):
        key = hashlib.sha1(url.encode()).hexdigest()[:16] + ('.bin' if binary else '.html')
        path = self.cache / key
        if path.exists():
            return path.read_bytes() if binary else path.read_text(encoding='utf-8', errors='replace')
        host = urlparse(url).netloc
        if self.offline: self.log.append((host, url, 'offline', 'not cached')); return None
        with self.locks[host]:
            if not self.allowed(url): self.log.append((host, url, 'robots', 'disallowed')); return None
            self._wait(host)
            try:
                r = self.s.get(url, timeout=25)
            except Exception as e:
                self.log.append((host, url, 'error', type(e).__name__)); return None
        self.log.append((host, url, r.status_code, ''))
        if r.status_code != 200: return None
        if binary:
            path.write_bytes(r.content); return r.content
        if not r.encoding or r.encoding.lower() == 'iso-8859-1': r.encoding = r.apparent_encoding or 'utf-8'
        path.write_text(r.text, encoding='utf-8'); return r.text


# ---------- small helpers ----------
def clean(s):
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))
    return re.sub(r'\s+', ' ', s).strip()

def norm_title(s):
    s = clean(s).lower()
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)|【[^】]*】|<[^>]*>', ' ', s)        # [주최] prefixes, (~11/4) tails
    s = re.sub(r'모집|안내|공고|신청|접수|ㅣ|｜', ' ', s)
    return re.sub(r'[^0-9a-z가-힣]', '', s)

def stable_id(url):
    return 1000 + int(hashlib.sha1(url.encode()).hexdigest()[:8], 16) % 9_000_000

def iso(d): return d.isoformat() if d else ''

def parse_date(s):
    m = re.search(r'(20\d\d)[.\-/년 ]\s*(\d{1,2})[.\-/월 ]\s*(\d{1,2})', s or '')
    if not m: return None
    try: return dt.date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError: return None

def date_range(s):
    ds = [parse_date(x) for x in re.split(r'~|∼|부터', s or '')]
    ds = [d for d in ds if d]
    return (ds[0], ds[-1]) if len(ds) >= 2 else (None, ds[0] if ds else None)

def epoch_day(ms):
    return dt.datetime.fromtimestamp(ms / 1000, KST).date() if ms else None

def rx(pattern): return re.compile(pattern, re.I)

def elig_lines(body_html, limit=1500):
    """Lines of a listing's body that talk about who may apply (rules.json majors.context)."""
    ctx = rx(RULES['majors']['context'])
    lines = re.split(r'<br\s*/?>|</p>|</div>|</li>|</tr>|\n|■|※|○|●', body_html or '')
    out = [clean(l) for l in lines if ctx.search(clean(l)) and len(clean(l)) < 200]
    return ' | '.join(out)[:limit]


# ---------- wevity ----------
WEVITY = 'https://www.wevity.com/'
WEVITY_CATS = {  # cidx: (category name, section kind, pages)
    None: ('전체', '공모전', 2), 1: ('기획/아이디어', '공모전', 1), 2: ('광고/마케팅', '공모전', 1),
    3: ('논문/리포트', '공모전', 3), 10: ('영상/UCC/사진', '공모전', 1), 19: ('디자인/캐릭터/웹툰', '공모전', 1),
    20: ('웹/모바일/IT', '공모전', 1), 21: ('게임/소프트웨어', '공모전', 1), 22: ('과학/공학', '공모전', 2),
    23: ('문학/글/시나리오', '공모전', 2), 24: ('건축/건설/인테리어', '공모전', 1), 25: ('네이밍/슬로건', '공모전', 1),
    26: ('예체능/미술/음악', '공모전', 1), 27: ('대외활동/서포터즈', '대외활동', 3), 28: ('해외', '공모전', 1),
    29: ('기타', '공모전', 1), 88: ('취업/창업', '공모전', 1), 89: ('봉사활동', '대외활동', 2),
}
WEVITY_LISTS = [(sec, WEVITY + '?c=find&s=1&gub=1' + (f'&cidx={c}' if c else '') + '&gp={p}', pages)
                for c, (_, sec, pages) in WEVITY_CATS.items()]

def wevity_list(page):
    out = []
    for li in re.findall(r'<li[^>]*>\s*(?:<!--[^>]*-->)?\s*<div class="tit">(.*?)</li>', page, re.S):
        m = re.search(r'href="\?c=find[^"]*?ix=(\d+)">(.*?)</a>', li, re.S)
        if not m: continue
        title = clean(re.sub(r'<span class=.stat[^>]*>.*?</span>', '', m[2]))
        cats = clean(re.search(r'sub-tit">(.*?)</div>', li, re.S)[1]).replace('분야 :', '').strip() if 'sub-tit' in li else ''
        host = re.search(r'class="organ">(.*?)</div>', li, re.S)
        status = re.search(r'class="dday[^"]*">(.*?)</span>', li)
        out.append({'ix': m[1], 'title': title, 'cats': cats, 'host': clean(host[1]) if host else '',
                    'status': status[1] if status else ''})
    return out

def wevity_view(page):
    t = page
    if 'cd-info-list' not in t: return None
    title = re.search(r'<h6 class="tit">(.*?)</h6>', t, re.S)
    info = {clean(k): clean(v) for k, v in
            re.findall(r'<span class="tit">(.*?)</span>(.*?)</li>', t.split('cd-info-list', 1)[1].split('</ul>', 1)[0], re.S)}
    thumb = re.search(r'<div class="thumb">\s*<img src="([^"]+)"', t)
    home = re.search(r'홈페이지</span>\s*<a href="([^"]+)"', t)
    start, end = date_range(re.sub(r'D-\S+', '', info.get('접수기간', '')))
    body = t.split('id="viewContents"', 1)[1][:30000] if 'id="viewContents"' in t else ''
    return {'title': clean(title[1]) if title else '', 'cats': info.get('분야', ''), 'target': info.get('응모대상', ''),
            'host': info.get('주최/주관', ''), 'start': start, 'end': end, 'elig': elig_lines(body),
            'prize_total': info.get('총 상금', ''), 'prize_first': info.get('1등 상금', ''),
            'home': home[1] if home else '', 'poster': urljoin(WEVITY, thumb[1]) if thumb else ''}

def sweep_wevity(f):
    raw, seen = [], set()
    for section, tmpl, pages in WEVITY_LISTS:
        for p in range(1, pages + 1):
            page = f.get(tmpl.format(p=p))
            rows = wevity_list(page) if page else []
            f.log.append(('www.wevity.com', tmpl.format(p=p), 'rows', len(rows)))
            for r in rows:
                if r['ix'] in seen or r['status'] in ('접수예정', '마감') or EXCLUDE.search(r['title']): continue
                seen.add(r['ix']); r['section'] = section; raw.append(r)
    items = []
    for r in raw:
        url = f"{WEVITY}?c=find&s=1&gub=1&gbn=view&gp=1&ix={r['ix']}"
        page = f.get(url)
        v = wevity_view(page) if page else None
        if not v: continue
        prize = ', '.join(x for x in [f"총 상금 {v['prize_total']}" if v['prize_total'] else '',
                                      f"1등 {v['prize_first']}" if v['prize_first'] else ''] if x)
        items.append(dict(source='wevity', section=r['section'], url=url, title=v['title'] or r['title'],
                          host=v['host'] or r['host'], cats=v['cats'] or r['cats'], target=v['target'], elig=v['elig'],
                          start=v['start'], deadline=v['end'], benefit=prize, region='', term_start=None,
                          term_end=None, team='', poster_src=v['poster']))
    return items


# ---------- thinkcontest ----------
THINK = 'https://www.thinkcontest.com'

THINK_PER_SECTION = {'contest': 100, 'outside': 60}

def think_sitemap(xml, per_section=None):
    locs = re.findall(r'<loc>([^<]+)</loc>', xml)
    by = defaultdict(list)
    for u in locs:
        m = re.search(r'/user/(contest|outside)/view\.do\?contest_pk=(\d+)', u)
        if m: by[m[1]].append(int(m[2]))
    return {k: sorted(set(v), reverse=True)[:(per_section or THINK_PER_SECTION.get(k, 25))] for k, v in by.items()}

def think_view(page):
    if 'contest-view__title' not in page: return None
    title = re.search(r'contest-view__title">(.*?)</span>', page, re.S)
    info = {clean(k): clean(v) for k, v in
            re.findall(r'<div class="tit">\s*(.*?)\s*</div>\s*<div class="txt">(.*?)</div>\s*</div>', page, re.S)}
    img = re.search(r'<img src="([^"]+)" class="contestimg', page)
    start, end = date_range(info.get('접수기간', ''))
    prize = ', '.join(x for x in [info.get('시상종류', ''), f"1등 {info['시상금(1등)']}" if info.get('시상금(1등)') else ''] if x)
    body = page.split('content-detail__top', 1)[1][:60000] if 'content-detail__top' in page else ''
    return {'title': clean(title[1]) if title else '', 'host': info.get('주최', ''), 'cats': info.get('응모분야', ''),
            'target': info.get('참가자격', ''), 'start': start, 'end': end, 'benefit': prize, 'elig': elig_lines(body),
            'poster': urljoin(THINK, html.unescape(img[1])) if img else ''}

def sweep_think(f, per_section=None):
    xml = f.get(THINK + '/sitemap.xml')
    pks = think_sitemap(xml, per_section) if xml else {}
    f.log.append(('www.thinkcontest.com', 'sitemap.xml', 'rows', sum(len(v) for v in pks.values())))
    items = []
    for sec, ids in pks.items():
        for pk in ids:
            url = f'{THINK}/thinkgood/user/{sec}/view.do?contest_pk={pk}'
            page = f.get(url)
            v = think_view(page) if page else None
            if not v: continue
            items.append(dict(source='thinkcontest', section='공모전' if sec == 'contest' else '대외활동', url=url,
                              title=v['title'], host=v['host'], cats=v['cats'], target=v['target'], elig=v['elig'], start=v['start'],
                              deadline=v['end'], benefit=v['benefit'], region='', term_start=None, term_end=None,
                              team='', poster_src=v['poster']))
    return items


# ---------- linkareer ----------
LINK = 'https://linkareer.com'

def apollo(page):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page or '', re.S)
    if not m: return {}
    return json.loads(m[1]).get('props', {}).get('pageProps', {}).get('__APOLLO_STATE__', {}) or {}

LINK_LISTS = [  # (path, section, categoryID or None, pages); category names from the site's own filters
    ('/list/activity', '대외활동', None, 3), ('/list/activity', '대외활동', 1, 3),   # 서포터즈
    ('/list/activity', '대외활동', 2, 1), ('/list/activity', '대외활동', 3, 1),      # 해외탐방
    ('/list/activity', '대외활동', 4, 1), ('/list/activity', '대외활동', 5, 1),      # 봉사단 해외, 국내
    ('/list/activity', '대외활동', 6, 1), ('/list/activity', '대외활동', 7, 2),      # 마케터, 기자단
    ('/list/activity', '대외활동', 10, 1), ('/list/activity', '대외활동', 11, 1),    # 멘토링, 기타
    ('/list/contest', '공모전', None, 3),
    ('/list/contest', '공모전', 28, 1), ('/list/contest', '공모전', 30, 1),          # 기획/아이디어, 사진/영상/UCC
    ('/list/contest', '공모전', 31, 1), ('/list/contest', '공모전', 33, 1),          # 디자인/순수미술/공예, 캐릭터/만화/게임
    ('/list/contest', '공모전', 34, 1), ('/list/contest', '공모전', 35, 2),          # 건축/건설/인테리어, 과학/공학
    ('/list/contest', '공모전', 36, 1), ('/list/contest', '공모전', 37, 1),          # 예체능/패션, 전시/페스티벌
    ('/list/contest', '공모전', 38, 2), ('/list/contest', '공모전', 39, 2),          # 문학/시나리오, IT/소프트웨어/게임
    ('/list/contest', '공모전', 40, 3), ('/list/contest', '공모전', 41, 1),          # 학술, 창업
]

def link_list(page):
    """(id, title, close day) of every listing in a list page's Apollo cache."""
    st = apollo(page)
    return [(v['id'], v.get('title', ''), epoch_day(v['recruitCloseAt'])) for k, v in st.items()
            if k.startswith('Activity:') and v.get('recruitCloseAt')]

def link_view(page, aid):
    st = apollo(page)
    a = st.get(f'Activity:{aid}')
    if not a or 'targets' not in a: return None
    node = lambda r: st.get(r['__ref'], {}) if isinstance(r, dict) and '__ref' in r else (r if isinstance(r, dict) else {})
    deref = lambda refs: [node(r).get('name', '') for r in (refs or [])]
    thumb = st.get((a.get('thumbnailImage') or {}).get('__ref', ''), {}).get('url', '')
    benefits = [b for b in deref(a.get('benefits')) if b]
    if a.get('tenThousandUnitOfReward'): benefits.insert(0, f"시상 규모 {a['tenThousandUnitOfReward']:,}만원")
    if a.get('additionalBenefit'): benefits.append(clean(a['additionalBenefit']))
    regions = []
    for r in a.get('regionDistricts') or []:                     # "서울 송파구", or "서울" for the 전체 district
        d = node(r); reg = node(d.get('region')).get('name', '')
        name = reg if d.get('name') in (None, '', '전체') else f"{reg} {d['name']}".strip()
        if name and name not in regions: regions.append(name)
    regions = regions or [r for r in deref(a.get('regions')) if r]
    onoff = node(a.get('onoffline')).get('name', '')
    scale = str(a.get('recruitScale') or '').strip()
    body = node(a.get('detailText')).get('text', '') or ''.join(v.get('text', '') for k, v in st.items() if k.startswith('ActivityText:'))
    return {'title': a.get('title', ''), 'host': a.get('organizationName', ''), 'type': a.get('activityTypeID'),
            'elig': elig_lines(body),
            'cats': ', '.join(deref(a.get('categories')) + deref(a.get('interests'))),
            'target': ', '.join(deref(a.get('targets'))), 'status': a.get('status'),
            'start': epoch_day(a.get('recruitStartAt')), 'end': epoch_day(a.get('recruitCloseAt')),
            'term_start': epoch_day(a.get('activityStartAt')), 'term_end': epoch_day(a.get('activityEndAt')),
            'benefit': ', '.join(benefits), 'region': ', '.join(x for x in [onoff, ', '.join(regions)] if x),
            'team': f'{scale}명 선발' if scale.isdigit() and int(scale) > 0 else '', 'poster': thumb}

def sweep_link(f):
    ids, seen = [], set()
    cutoff = TODAY + dt.timedelta(days=RULES['balance']['min_days_left'])
    for path, section, cat, pages in LINK_LISTS:
        for p in range(1, pages + 1):
            q = (f'filterBy_categoryIDs={cat}&' if cat else '') + f'page={p}'
            got = link_list(f.get(f'{LINK}{path}?{q}'))
            f.log.append(('linkareer.com', f'{path}?{q}', 'rows', len(got)))
            for i, title, close in got:          # skip closed and excluded listings before fetching their detail page
                if i in seen or (close and close < cutoff) or EXCLUDE.search(title): continue
                seen.add(i); ids.append((i, section))
    items = []
    for aid, section in ids:
        url = f'{LINK}/activity/{aid}'
        page = f.get(url)
        v = link_view(page, aid) if page else None
        if not v or v['status'] not in (None, 'OPEN'): continue
        items.append(dict(source='linkareer', section=section, url=url, title=v['title'], host=v['host'], cats=v['cats'],
                          target=v['target'] or '대학생', elig=v['elig'], start=v['start'], deadline=v['end'], benefit=v['benefit'],
                          region=v['region'], term_start=v['term_start'], term_end=v['term_end'], team=v['team'],
                          poster_src=v['poster']))
    return items


# ---------- rules ----------
KIND_RULES = [(r['kind'], rx(r['match'])) for r in RULES['kind']['rules']]
TAG_RULES = [(r['tag'], rx(r['match'])) for r in RULES['tags']['rules']]
BUILD_RULES = [(r['build'], rx(r['match'])) for r in RULES['builds']['rules']]
EXCLUDE = rx(RULES['exclude_title']['match'])
EXCLUDE_CATS = rx(RULES['exclude_title']['match_cats'])
ALLOW = rx(RULES['eligible']['allow'])
GROUPS = RULES['tags']['groups']
GROUP_OF = {t: g for g, ts in GROUPS.items() for t in ts}
MJ = RULES['majors']
MAJOR_RULES = [(r['major'], rx(f"(?:{r['stem']})" if r.get('exact') else f"(?:{r['stem']})[^|,()]{{0,14}}?(?:{MJ['suffix']})"))
               for r in MJ['rules']]
ANY_MAJOR = rx(MJ['any_major'])
NEGATED = rx(MJ['negated_by'])
MAJOR_KEYS = list(dict.fromkeys(r['major'] for r in MJ['rules']))

def rule_kind(it):
    text = f"{it['title']} {it['cats']}"
    for kind, r in KIND_RULES:
        if r.search(text): return kind
    return it['section']

def rule_tags(it):
    # most hits first; ties go to the tag that shows up earlier in the title + categories text
    text = f"{it['title']} {it['cats']}"
    scored = []
    for t, r in TAG_RULES:
        hits = [m.start() for m in r.finditer(text)]
        if hits: scored.append((-len(hits), hits[0], t))
    tags = [t for _, _, t in sorted(scored)][:RULES['tags']['max']]
    return tags or list(RULES['tags']['fallback_by_kind'][it['kind']])

def rule_majors(it):
    """MAJORS keys a listing targets or restricts, read from its target field and eligibility lines only."""
    text = f"{it.get('target', '')} | {it.get('elig', '')}"
    if ANY_MAJOR.search(text): return []
    def targets(r):   # a match counts unless the next 20 characters exclude it (e.g. '음악대학 전공자 제외')
        return any(not NEGATED.search(text[m.end():m.end() + 20]) for m in r.finditer(text))
    return [m for m in MAJOR_KEYS if any(targets(r) for k, r in MAJOR_RULES if k == m)]

def rule_builds(it):
    text = f"{it['title']} {it['cats']}"
    out = [b for b, r in BUILD_RULES if r.search(text)]
    for b in RULES['builds']['base_by_kind'][it['kind']]:
        if b not in out: out.append(b)
    return out[:RULES['builds']['max']]

def rule_hours(it):
    h = RULES['hours']; n = h['base_by_kind'][it['kind']]
    if it['kind'] in ('공모전', '학술제') and it['start'] and it['deadline'] \
            and (it['deadline'] - it['start']).days <= h['short_window_days']: n += 1
    if it['kind'] in ('대외활동', '서포터즈') and it['term_start'] and it['term_end'] \
            and (it['term_end'] - it['term_start']).days >= h['long_term_days']: n += 1
    return max(1, min(8, n))

def eligible(target):
    # a target text must name 대학생 (or an open-to-all phrase); minor-only text never matches ALLOW
    return bool(target) and bool(ALLOW.search(target))

def keep(it, why):
    """Hard filters. Returns True to keep; records the drop reason otherwise."""
    if not it['title'] or not it['deadline']: why['no title/deadline'] += 1; return False
    if it['deadline'] < TODAY + dt.timedelta(days=RULES['balance']['min_days_left']): why['deadline passed'] += 1; return False
    if it['start'] and it['start'] > TODAY: why['not open yet'] += 1; return False
    if EXCLUDE.search(it['title']) or EXCLUDE_CATS.search(it['cats']): why['excluded title/category'] += 1; return False
    if not eligible(it['target']): why['not 대학생'] += 1; return False
    return True

def term_text(it):
    if it['term_start'] and it['term_end']:
        return f"{it['term_start']:%Y.%m.%d}~{it['term_end']:%Y.%m.%d}"
    if it['start'] and it['deadline']:
        fmt = '%m.%d' if it['start'].year == it['deadline'].year else '%Y.%m.%d'
        return f"접수 {it['start'].strftime(fmt)}~{it['deadline'].strftime(fmt)}"
    return UNKNOWN

def normalise(it):
    it['kind'] = rule_kind(it)
    return {'id': stable_id(it['url']), 'kind': it['kind'], 'title': clean(it['title']), 'host': clean(it['host']) or UNKNOWN,
            'tags': rule_tags(it), 'builds': rule_builds(it), 'majors': rule_majors(it), 'deadline': iso(it['deadline']),
            'hours': rule_hours(it),
            'slots': [], 'region': it['region'] or UNKNOWN, 'term': term_text(it), 'benefit': clean(it['benefit']) or UNKNOWN,
            'team': it['team'] or UNKNOWN, 'url': it['url'], 'poster': '', 'source': it['source'],
            '_poster_src': it['poster_src']}


# ---------- dedupe, curated skip, balance ----------
SOURCE_RANK = {'linkareer': 0, 'wevity': 1, 'thinkcontest': 2}

def similar(a, b):
    if not a or not b: return False
    if a == b or (min(len(a), len(b)) >= 8 and (a in b or b in a)): return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.85

def curated_titles(js_text):
    return [norm_title(t) for t in re.findall(r"title:'([^']+)'", js_text)]

def dedupe(items, curated):
    out, why = [], Counter()
    for it in sorted(items, key=lambda x: SOURCE_RANK[x['source']]):
        nt = norm_title(it['title'])
        if any(similar(nt, c) for c in curated): why['curated in ACTIVITIES'] += 1; continue
        if any(similar(nt, norm_title(o['title'])) or
               (nt[:10] == norm_title(o['title'])[:10] and norm_title(it['host']) == norm_title(o['host'])) for o in out):
            why['duplicate across sources'] += 1; continue
        out.append(it)
    return out, why

def groups_of(it): return {GROUP_OF[t] for t in it['tags'] if t in GROUP_OF}

def balance(items, cap):
    b = RULES['balance']
    pool = sorted(items, key=lambda x: x['deadline'])
    picked, ids, per_host = [], set(), Counter()

    def take(cands, n):
        """Pick up to n from cands, alternating sources, earliest deadline first, honouring max_per_host."""
        by_src = defaultdict(list)
        for it in cands: by_src[it['source']].append(it)
        lists, got = list(by_src.values()), 0
        while got < n and any(lists):
            for l in lists:
                while l:
                    it = l.pop(0); h = norm_title(it['host'])
                    if it['id'] in ids or per_host[h] >= b['max_per_host']: continue
                    picked.append(it); ids.add(it['id']); per_host[h] += 1; got += 1
                    break
                if got >= n or len(picked) >= cap: return got
        return got

    for kind, n in b['min_per_kind'].items():                                        # 1) kinds
        take([x for x in pool if x['kind'] == kind], n)
    for g in GROUPS:                                                                  # 2) interest groups
        have = sum(1 for x in picked if g in groups_of(x))
        if have < b['min_per_group']:
            take([x for x in pool if g in groups_of(x)], b['min_per_group'] - have)
    for t in GROUP_OF:                                                                # 3) interest tags
        have = sum(1 for x in picked if t in x['tags'])
        if have < b.get('min_per_tag', 0):
            take([x for x in pool if t in x['tags']], b['min_per_tag'] - have)
    while len(picked) < cap:                                                          # 4) round-robin fill
        before = len(picked)
        for g in GROUPS:
            if len(picked) >= cap: break
            take([x for x in pool if g in groups_of(x) and x['id'] not in ids], 1)
        if len(picked) == before: break
    order = ['공모전', '대외활동', '서포터즈', '학술제']
    return sorted(picked, key=lambda x: (order.index(x['kind']), x['deadline']))


# ---------- posters ----------
def is_image(path):
    out = subprocess.run(['file', '-b', str(path)], capture_output=True, text=True).stdout
    return bool(re.match(r'(JPEG|PNG|GIF|WebP|RIFF.*WEBP)', out)), out.strip()

def fetch_poster(f, item, tmp_dir):
    src = item.pop('_poster_src', '')
    if not src: return 'no poster url'
    data = f.get(src, binary=True)
    if not data: return 'download failed'
    raw = Path(tmp_dir) / f"{item['id']}.src"
    raw.write_bytes(data)
    ok, kind = is_image(raw)
    if not ok: return f'not an image ({kind[:40]})'
    out = POSTER_DIR / f"{item['id']}.jpg"
    for q in (75, 60, 45):
        r = subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(q), '-Z', '400', str(raw), '--out', str(out)],
                           capture_output=True, text=True)
        if r.returncode != 0: return 'sips failed'
        if out.stat().st_size <= POSTER_MAX_BYTES: break
    ok, kind = is_image(out)
    if not ok or not kind.startswith('JPEG'):
        out.unlink(missing_ok=True); return 'converted file not JPEG'
    item['poster'] = f"assets/posters/feed/{item['id']}.jpg"
    return ''


# ---------- output ----------
def validate(item):
    errs = []
    for k in ('id', 'kind', 'title', 'host', 'tags', 'builds', 'majors', 'deadline', 'hours', 'slots', 'region', 'term',
              'benefit', 'team', 'url', 'poster', 'source'):
        if k not in item: errs.append(f'missing {k}')
    if errs: return errs
    if not isinstance(item['id'], int) or item['id'] < 1000: errs.append('id < 1000')
    if item['kind'] not in ('공모전', '대외활동', '서포터즈', '학술제'): errs.append('bad kind')
    if not re.fullmatch(r'20\d\d-\d\d-\d\d', item['deadline']) or item['deadline'] < iso(TODAY): errs.append('bad deadline')
    if not isinstance(item['hours'], int) or not 1 <= item['hours'] <= 8: errs.append('bad hours')
    allowed_tags = {r['tag'] for r in RULES['tags']['rules']}
    allowed_builds = {r['build'] for r in RULES['builds']['rules']}
    if not item['tags'] or set(item['tags']) - allowed_tags: errs.append('bad tags')
    if not item['builds'] or set(item['builds']) - allowed_builds: errs.append('bad builds')
    if not isinstance(item.get('majors'), list) or set(item['majors']) - set(MAJOR_KEYS): errs.append('bad majors')
    if not re.match(r'https://', item['url']): errs.append('bad url')
    if item['poster'] and not re.fullmatch(r'assets/posters/feed/\d+\.jpg', item['poster']): errs.append('bad poster')
    return errs

def render_js(items, stamp):
    keys = ['id', 'kind', 'title', 'host', 'tags', 'builds', 'majors', 'deadline', 'hours', 'slots', 'region', 'term',
            'benefit', 'team', 'url', 'poster', 'source']
    rows = ',\n'.join('  ' + json.dumps({k: it[k] for k in keys}, ensure_ascii=False) for it in items)
    return f'// generated by shared/scrape/sweep.py on {stamp}; do not edit\nconst FEED = [\n{rows}\n];\n'


# ---------- selftest (fixtures only) ----------
def fixture(name):
    return gzip.decompress((FIXTURES / name).read_bytes()).decode('utf-8')

MAJORS_FIXTURE_ID = '356521'   # fixtures/majors_view.html.gz: linkareer 포스텍 SF 어워드 (이공계 대상)

def selftest():
    fails = []
    def check(cond, msg):
        if not cond: fails.append(msg)
        print(('  ok   ' if cond else '  FAIL ') + msg)

    rows = wevity_list(fixture('wevity_list.html.gz'))
    check(len(rows) >= 10 and all(r['ix'].isdigit() and r['title'] for r in rows), f'wevity list parses ({len(rows)} rows)')
    v = wevity_view(fixture('wevity_view.html.gz'))
    check(bool(v and v['title'] and v['end'] and v['target'] and v['poster'].startswith('https://')), 'wevity detail parses title, 접수기간, 응모대상, poster')
    pks = think_sitemap(fixture('think_sitemap.xml.gz'))
    check(len(pks.get('contest', [])) > 0 and len(pks.get('outside', [])) > 0, 'thinkcontest sitemap yields contest and outside ids')
    for name in ('think_contest.html.gz', 'think_outside.html.gz'):
        t = think_view(fixture(name))
        check(bool(t and t['title'] and t['end'] and t['target'] and t['poster']), f'thinkcontest detail parses ({name})')
    ids = link_list(fixture('link_list.html.gz'))
    check(len(ids) >= 10, f'linkareer list parses ({len(ids)} ids)')
    lv = link_view(fixture('link_view.html.gz'), '361500')
    check(bool(lv and lv['title'] and lv['end'] and lv['target'] and lv['poster']), 'linkareer detail parses Apollo state')

    # negative controls: an empty page parses to nothing, a broken item fails validation
    check(wevity_list('<html></html>') == [] and wevity_view('<html></html>') is None and link_list('') == [], 'empty pages parse to zero rows')
    base = dict(source='wevity', section='공모전', url='https://www.wevity.com/?ix=1', title='2026 대학생 데이터 분석 아이디어 공모전',
                host='테스트', cats='기획/아이디어', target='대학생', start=TODAY, deadline=TODAY + dt.timedelta(days=20),
                benefit='', region='', term_start=None, term_end=None, team='', poster_src='', elig='')
    good = normalise(dict(base)); good.pop('_poster_src')
    check(validate(good) == [], 'normalised item passes validation')
    check(good['kind'] == '공모전' and '데이터' in good['tags'] and '데이터' in good['builds'], 'rules: kind, tags, builds from rules.json')
    check(good['region'] == UNKNOWN and good['team'] == UNKNOWN and good['benefit'] == UNKNOWN, 'unknown fields read 확인 필요')
    check(validate(dict(good, deadline='2026-01-01')) != [] and validate(dict(good, tags=['요리'])) != [], 'validation rejects past deadline and off-table tag')
    check(rule_kind(dict(base, title='제5회 대학생 경영 학술제', cats='')) == '학술제', 'rules: 학술제 by keyword')
    check(rule_kind(dict(base, title='브랜드 서포터즈 3기', cats='', section='대외활동')) == '서포터즈', 'rules: 서포터즈 by keyword')
    sup = normalise(dict(base, title='브랜드 SNS 서포터즈 3기', cats='', section='대외활동'))
    check(sup['builds'] == ['고객', '의사소통', '직업윤리'] and '성실' not in sup['builds'], 'rules: 서포터즈 builds 고객, 의사소통, 직업윤리 (8-competency set)')
    check(set(GROUP_OF) == {r['tag'] for r in RULES['tags']['rules']} and len(GROUP_OF) == 23, 'tags: every rule tag sits in one of the 5 interest groups (23 interests)')
    sci = rule_tags(dict(base, title='2026 대학(원)생 생명과학 연구논문 공모전', cats='논문/리포트, 과학/공학'))
    check(sci[0] == '과학' and '기획' not in sci, f'tags: hit count ranks 과학 first for a science paper ({sci})')
    check({'개발', 'AI'} <= set(rule_tags(dict(base, title='대학생 AI 해커톤', cats=''))), 'tags: AI as a whole word')
    check(rule_tags(dict(base, title='TAIWAN 교류', cats='')) and 'AI' not in rule_tags(dict(base, title='TAIWAN 교류', cats='')), 'tags: AI inside a Latin word does not match')
    mj = lambda t: rule_majors({'target': '', 'elig': t})
    check(mj('공학 계열 재학생') == ['공학'] and mj('간호학과 3학년 이상') == ['의약, 보건'], 'majors: 계열 and 학과 targets')
    check(mj('이공계 대학(원)생') == ['공학', '자연과학'], 'majors: 이공계 maps to 공학 + 자연과학')
    check(mj('음악대학 전공자 및 전문연주자 제외') == [] and mj('전공 무관, 대학생 누구나') == [], 'majors: exclusions and 전공 무관 give []')
    check(mj('간호 분야 아이디어를 모집합니다') == [], 'majors: a topic word without 학과/전공/계열 gives []')
    ws = wevity_list(fixture('wevity_sci_list.html.gz'))
    check(len(ws) >= 10 and any('과학' in r['cats'] or '공학' in r['cats'] for r in ws), f'wevity 과학/공학 category list parses ({len(ws)} rows)')
    lc = link_list(fixture('link_cat_list.html.gz'))
    check(len(lc) >= 10 and all(isinstance(x[2], dt.date) for x in lc), f'linkareer category list parses ids + close dates ({len(lc)})')
    mv = fixture('majors_view.html.gz')
    mparsed = think_view(mv) or wevity_view(mv) or link_view(mv, MAJORS_FIXTURE_ID)
    check(bool(mparsed and rule_majors(mparsed)), f'majors read from a real detail page ({rule_majors(mparsed) if mparsed else None})')
    pool = [dict(good, id=1000 + i, source=['wevity', 'linkareer'][i % 2], host=f'h{i}', kind=['공모전', '대외활동', '서포터즈', '학술제'][i % 4],
                 tags=[['과학'], ['기획'], ['영상'], ['교육'], ['AI']][i % 5], deadline=iso(TODAY + dt.timedelta(days=5 + i))) for i in range(60)]
    saved = RULES['balance']
    RULES['balance'] = dict(saved, min_per_kind={k: 7 for k in saved['min_per_kind']}, min_per_group=5, max_per_host=3)
    try: picked = balance(pool, 30)
    finally: RULES['balance'] = saved
    check(len(picked) == 30 and all(sum(1 for x in picked if x['kind'] == k) >= 7 for k in ('공모전', '대외활동', '서포터즈', '학술제'))
          and len({g for x in picked for g in groups_of(x)}) == 5, 'balance: cap, every kind and every interest group present')
    # a rare group with the latest deadlines still reaches min_per_group
    rare = [dict(good, id=2000 + i, source='wevity', host=f'r{i}', kind=['공모전', '대외활동', '서포터즈', '학술제'][i % 4],
                 tags=['과학'] if i >= 36 else ['기획'], deadline=iso(TODAY + dt.timedelta(days=5 + i))) for i in range(40)]
    RULES['balance'] = dict(saved, min_per_kind={k: 5 for k in saved['min_per_kind']}, min_per_group=2, min_per_tag=0, max_per_host=3)
    try: picked = balance(rare, 22)
    finally: RULES['balance'] = saved
    check(sum(1 for x in picked if '과학' in x['tags']) >= 2, 'balance: min_per_group lifts a rare, late group')
    why = Counter()
    check(not keep(dict(base, target='초등학생, 청소년'), why) and why['not 대학생'] == 1, 'filter drops minor-only targets')
    check(not keep(dict(base, deadline=dt.date(2026, 11, 1)), why), 'filter drops passed deadlines')
    a = dict(base, url='https://linkareer.com/activity/1', source='linkareer', title='[테스트] 2026 대학생 데이터 분석 아이디어 공모전')
    d, dwhy = dedupe([dict(base), a], curated=[])
    check(len(d) == 1 and d[0]['source'] == 'linkareer', 'dedupe keeps one copy across sources')
    d, dwhy = dedupe([dict(base)], curated=[norm_title(base['title'])])
    check(d == [] and dwhy['curated in ACTIVITIES'] == 1, 'curated ACTIVITIES titles are skipped')
    check(stable_id(base['url']) == stable_id(base['url']) >= 1000, 'id is stable and >= 1000')
    js = render_js([good | {'poster': ''}], 'selftest')
    check(js.startswith('// generated by shared/scrape/sweep.py') and 'const FEED = [' in js, 'feed.js header and const')
    print(f"selftest: {'PASS' if not fails else 'FAIL'} ({len(fails)} failed)")
    return 0 if not fails else 1


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true', help='fetch and normalise, write nothing to the repo')
    ap.add_argument('--limit', type=int, default=RULES['balance']['cap'], help='max items in the feed')
    ap.add_argument('--selftest', action='store_true', help='parse saved fixtures only, no network')
    ap.add_argument('--cache', default=os.environ.get('TEUM_SCRAPE_CACHE', str(Path(os.environ.get('TMPDIR', '/tmp')) / 'teum-scrape-cache')),
                    help='raw response cache dir (keep it outside the repo)')
    ap.add_argument('--offline', action='store_true', help='use cached responses only')
    ap.add_argument('--report', help='write a JSON run report here')
    a = ap.parse_args()
    if a.selftest: return selftest()

    f = Fetcher(a.cache, offline=a.offline)
    controls = {'wevity': WEVITY, 'thinkcontest': THINK + '/thinkgood/user/contest/index.do', 'linkareer': LINK + '/list/activity'}
    control_ok = {s: bool(f.get(u)) for s, u in controls.items()}
    print('control pages:', control_ok)

    def run(name, fn):
        try:
            got = fn(f) if control_ok[name] else []
        except Exception as e:                      # one broken source must not kill the run
            print(f'{name}: parser error {type(e).__name__}: {e}'); got = []
        print(f'{name}: {len(got)} detail pages parsed', flush=True)
        return name, got
    raw, per_source = [], {}
    sources = (('linkareer', sweep_link), ('wevity', sweep_wevity), ('thinkcontest', sweep_think))
    with ThreadPoolExecutor(len(sources)) as ex:     # one thread per site; the per-host lock keeps 2 s spacing
        for name, got in ex.map(lambda x: run(*x), sources):
            per_source[name] = len(got); raw += got

    why = Counter()
    kept = [it for it in raw if keep(it, why)]
    items = [normalise(it) for it in kept]
    curated = curated_titles(CURATED_JS.read_text(encoding='utf-8')) if CURATED_JS.exists() else []
    items, dwhy = dedupe(items, curated)
    why.update(dwhy)
    items = balance(items, a.limit)

    poster_fail = Counter()
    if not a.dry_run:
        POSTER_DIR.mkdir(parents=True, exist_ok=True)
        tmp = Path(a.cache) / 'posters'; tmp.mkdir(exist_ok=True)
        with ThreadPoolExecutor(4) as ex:
            for err in ex.map(lambda it: fetch_poster(f, it, tmp), items):
                if err: poster_fail[err] += 1
    for it in items: it.pop('_poster_src', None)

    bad = {it['id']: validate(it) for it in items if validate(it)}
    if bad:
        print('validation failed:', bad); return 2
    stamp = dt.datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    if not a.dry_run:
        FEED_JS.write_text(render_js(items, stamp), encoding='utf-8')
        wanted = {f"{it['id']}.jpg" for it in items if it['poster']}
        stale = [p for p in POSTER_DIR.glob('*.jpg') if p.name not in wanted]
        for p in stale: p.unlink()                  # generated files only: this folder holds sweep output alone

    by_kind = Counter(it['kind'] for it in items)
    by_src = Counter(it['source'] for it in items)
    by_kind_src = Counter(f"{it['kind']}/{it['source']}" for it in items)
    by_group = Counter(g for it in items for g in groups_of(it))
    by_tag = Counter(t for it in items for t in it['tags'])
    by_major = Counter(m for it in items for m in it['majors'])
    with_majors = sum(1 for it in items if it['majors'])
    hak_tags = Counter(t for it in items if it['kind'] == '학술제' for t in it['tags'])
    http = Counter(f'{h} {s}' for h, _, s, _ in f.log if s != 'rows')
    rows = [(h, u, n) for h, u, s, n in f.log if s == 'rows']
    report = {'stamp': stamp, 'dry_run': a.dry_run, 'control_ok': control_ok, 'parsed_per_source': per_source,
              'kept': len(items), 'by_kind': by_kind, 'by_source': by_src, 'by_kind_source': by_kind_src,
              'by_interest_group': by_group, 'by_tag': by_tag, 'items_with_majors': with_majors, 'by_major': by_major,
              '학술제_tags': hak_tags,
              'dropped': why, 'posters': sum(1 for it in items if it['poster']), 'poster_failures': poster_fail,
              'http': http, 'list_rows': rows,
              'blocked': [(h, u, s, n) for h, u, s, n in f.log if s not in (200, 'rows')]}
    print(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    if a.report: Path(a.report).write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
