"""틈 접근성 검사. axe-core로 #me, #activities, #team, #match, #apply를 1440과 390 폭에서 검사합니다. 헤드리스라 화면에 창이 뜨지 않습니다.
실행: .venv/bin/python projects/study/capstone-teum-vault/shared/a11y.py --base http://127.0.0.1:8841/ --out <결과.json> [--width 1440|390|both] [--fail-on serious]
axe-core는 cdnjs의 고정 버전(4.12.1, 2026-06-10 배포)을 쓰고, 못 받으면 jsDelivr 같은 버전으로 넘어갑니다.
--fail-on 이상 영향도(기본 serious) 위반이 하나라도 있으면 1, 없으면 0으로 끝납니다."""
import argparse, json, pathlib, sys, tempfile
from playwright.sync_api import sync_playwright, Error as PWError

AXE_VERSION = '4.12.1'
AXE_URLS = [f'https://cdnjs.cloudflare.com/ajax/libs/axe-core/{AXE_VERSION}/axe.min.js',
            f'https://cdn.jsdelivr.net/npm/axe-core@{AXE_VERSION}/axe.min.js']
IMPACTS = ['critical', 'serious', 'moderate', 'minor']
SETTLE = 1500  # 화면에 들어올 때의 차례 등장 움직임(1.1초)이 끝난 뒤 검사합니다. 움직이는 중에는 색 대비가 틀리게 잡힙니다

# (이름, 주소, 검사 전에 누를 것). 빈 화면 대신 사용자가 보게 될 상태를 검사합니다
VIEWS = [
    ('me', '#me', []),
    ('activities', '#activities', ['#act-rows [data-actsel]']),
    ('team', '#team', ['#view-team .post:not(.closed) [data-open]', '[data-applyopen]']),
    ('match', '#match', ['[data-s="0"]']),
    ('apply', '#apply', ['#auto']),
]


def audit(page, base, view, hash_, clicks, axe_url):
    page.goto(base.rstrip('/') + '/' + hash_, wait_until='networkidle')
    page.wait_for_timeout(450)
    for sel in clicks:
        l = page.locator(sel).first
        if not l.count():
            print(f'    note: {view}: pre-click {sel} not found, auditing without it')
            continue
        l.scroll_into_view_if_needed(); l.click(); page.wait_for_timeout(450)
    page.add_style_tag(content='.toast{display:none!important}')
    page.wait_for_timeout(SETTLE)
    page.add_script_tag(url=axe_url)
    return page.evaluate("""async () => {
      const r = await axe.run(document, {resultTypes: ['violations']});
      return {version: axe.version, violations: r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.map(n => ({target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').split('\\n').slice(0, 3).join(' ')}))}))};
    }""")


def pick_axe(page):
    for u in AXE_URLS:
        try:
            r = page.request.get(u)
            if r.ok and len(r.body()) > 100_000:
                return u
        except PWError:
            pass
    sys.exit('axe-core could not be fetched from cdnjs or jsDelivr')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8841/')
    ap.add_argument('--width', default='both', choices=['1440', '390', 'both'])
    ap.add_argument('--out', default=str(pathlib.Path(tempfile.gettempdir()) / 'teum-a11y.json'))
    ap.add_argument('--fail-on', default='serious', choices=IMPACTS)
    a = ap.parse_args()
    widths = [1440, 390] if a.width == 'both' else [int(a.width)]
    runs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in widths:
            for view, hash_, clicks in VIEWS:
                ctx = b.new_context(viewport={'width': w, 'height': 900 if w > 500 else 844}, device_scale_factor=1)
                page = ctx.new_page()
                axe_url = pick_axe(page)
                try:
                    res = audit(page, a.base, view, hash_, clicks, axe_url)
                    runs.append({'view': view, 'width': w, 'axe': res['version'], 'source': axe_url, 'violations': res['violations']})
                    print(f'audited {view} @{w}: {len(res["violations"])} rules')
                except PWError as e:
                    runs.append({'view': view, 'width': w, 'error': str(e).splitlines()[0]})
                    print(f'ERROR {view} @{w}: {str(e).splitlines()[0]}')
                ctx.close()
        b.close()

    # 규칙별로 묶기: 어느 화면, 어느 폭에서, 몇 개 요소가 걸렸는지
    rules = {}
    for r in runs:
        for v in r.get('violations', []):
            g = rules.setdefault(v['id'], {'id': v['id'], 'impact': v['impact'], 'help': v['help'], 'helpUrl': v['helpUrl'], 'where': {}, 'nodes': {}})
            g['where'].setdefault(r['view'], set()).add(r['width'])
            for n in v['nodes']:
                g['nodes'].setdefault(n['target'], {'views': set(), **n})['views'].add(f'{r["view"]}@{r["width"]}')
    ordered = sorted(rules.values(), key=lambda g: (IMPACTS.index(g['impact']) if g['impact'] in IMPACTS else 9, -len(g['nodes'])))
    print(f'\n== axe-core {AXE_VERSION}: {len(ordered)} rules violated across {len(runs)} audits')
    for imp in IMPACTS:
        gs = [g for g in ordered if g['impact'] == imp]
        if not gs:
            continue
        print(f'\n[{imp.upper()}]')
        for g in gs:
            where = ', '.join(f'{v}@{"/".join(map(str, sorted(ws)))}' for v, ws in g['where'].items())
            print(f'  {g["id"]}: {g["help"]}  ({len(g["nodes"])} nodes; {where})')
            for t, n in list(g['nodes'].items())[:4]:
                print(f'    - {t}  [{", ".join(sorted(n["views"]))}]')
            if len(g['nodes']) > 4:
                print(f'    - ... {len(g["nodes"]) - 4} more')
    errs = [r for r in runs if 'error' in r]
    limit = IMPACTS.index(a.fail_on)
    blocking = [g for g in ordered if g['impact'] in IMPACTS and IMPACTS.index(g['impact']) <= limit]
    out = {'axe': AXE_VERSION, 'runs': runs, 'rules': [{**g, 'where': {k: sorted(v) for k, v in g['where'].items()},
            'nodes': [{**n, 'views': sorted(n['views'])} for n in g['nodes'].values()]} for g in ordered]}
    pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f'\njson: {a.out}')
    print('RESULT', 'FAIL' if blocking or errs else 'PASS', f'({len(blocking)} rules at {a.fail_on} or worse, {len(errs)} audit errors)')
    sys.exit(1 if blocking or errs else 0)


if __name__ == '__main__':
    main()
