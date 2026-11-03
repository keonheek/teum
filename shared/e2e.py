"""틈 전체 흐름 회귀 검사. 실제 클릭으로 화면 네 개를 잇는 여정을 끝까지 돌립니다. 헤드리스라 화면에 창이 뜨지 않습니다.
실행: .venv/bin/python projects/study/capstone-teum-vault/shared/e2e.py --base http://127.0.0.1:8841/ [--width 1440|390|both] [--iterations 5] [--reduced] [--shots DIR] [--ref HEAD]
서버: python3 -m http.server 8841 --bind 127.0.0.1 --directory projects/study/capstone-teum-vault  (떠 있어야 함)
폭마다 여정을 N번(새 컨텍스트, 빈 localStorage) 돌고, 가장 좁은 폭에서 움직임 줄이기로 한 번 더 돕니다 (--reduced면 모든 회차를 움직임 줄이기로).
매 단계 뒤에 주소 해시, 핵심 요소, 콘솔 오류 0, 가로 스크롤 없음, shared/smoke.js의 __smoke() 결과 없음을 확인합니다.
어떤 회차에선 통과하고 어떤 회차에선 실패한 단계는 FLAKY로 따로 보여줍니다. 실패나 FLAKY가 하나라도 있으면 1로 끝납니다.
--ref를 주면 index.html, app/, shared/ 파일을 그 git 버전으로 바꿔 내보냅니다 (디스크는 그대로, 고치기 전과 비교할 때).
앱 함수는 부르지 않습니다. 결과 확인용으로 localStorage만 읽습니다."""
import argparse, collections, json, pathlib, subprocess, sys, tempfile, urllib.parse
from playwright.sync_api import sync_playwright, expect, TimeoutError as PWTimeout, Error as PWError

STEP_WAIT = 450   # 클릭으로 다시 그릴 때 View Transition이 한 프레임 뒤에 DOM을 바꾸므로 단계 사이를 기다립니다
TIMEOUT = 6000
ROOT = pathlib.Path(__file__).resolve().parent.parent
SMOKE = ROOT / 'shared' / 'smoke.js'
JOB = '영업관리'  # 기본값(마케팅)과 다르고 부족 역량이 셋이라, 링크 하나가 ui.fill을 그 역량 하나로 좁히는지 가려낼 수 있습니다

# 가장 넓은 요소를 찾아 가로 스크롤 원인을 알려 줍니다
HSCROLL_JS = """() => {
  const de = document.documentElement, cw = de.clientWidth;
  if (de.scrollWidth <= cw + 1) return null;
  const off = [...document.querySelectorAll('body *')].filter(el => el.offsetParent !== null && el.getBoundingClientRect().right > cw + 1)
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 3)
    .map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' right=' + Math.round(el.getBoundingClientRect().right));
  return {scrollWidth: de.scrollWidth, clientWidth: cw, widest: off};
}"""


# smoke.js가 잘못 잡는 두 가지는 알려진 것으로 빼고 셉니다
# 1) 좁은 폭에서 접어 둔 내 조건(#cond-d) 안의 칩: 접혀 있을 때만 잠시 숨기고 검사합니다
# 2) 글자 없이 alt 있는 그림만 든 링크(포스터): smoke.js는 img alt를 이름으로 치지 않으므로 검사하는 동안만 alt를 aria-label로 빌려 줍니다
SMOKE_JS = """() => {
  const all = window.__smoke();
  const d = document.getElementById('cond-d'), inner = d && !d.open ? d.querySelector('.cond-in') : null;
  const prev = inner ? inner.style.display : null;
  if (inner) inner.style.display = 'none';
  const lent = [...document.querySelectorAll('a, button')].filter(el => !el.innerText.trim() && !el.getAttribute('aria-label') && el.querySelector('img[alt]:not([alt=""])'));
  lent.forEach(el => el.setAttribute('aria-label', el.querySelector('img[alt]').alt));
  const found = window.__smoke();
  lent.forEach(el => el.removeAttribute('aria-label'));
  if (inner) inner.style.display = prev;
  return {found, known: all.filter(x => !found.includes(x)).length};
}"""


class StepFail(Exception):
    pass


class Journey:
    def __init__(self, page, label, shots):
        self.page, self.label, self.shots = page, label, shots
        self.errors, self.results, self.blocked = [], [], None
        page.on('console', lambda m: m.type == 'error' and self.errors.append(f'console: {m.text}'))
        page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        # 콘솔의 'Failed to load resource'에는 주소가 없어서, 실패한 응답의 주소를 같이 남깁니다
        page.on('response', lambda r: r.status >= 400 and self.errors.append(f'http {r.status} {r.url}'))
        page.on('requestfailed', lambda r: self.errors.append(f'requestfailed {r.url} ({r.failure})'))
        self.ctx, self.smoke_known = {}, 0

    # ---------- 도구 ----------
    def loc(self, sel):
        return self.page.locator(sel)

    def click(self, sel_or_loc, what=None):
        l = self.loc(sel_or_loc) if isinstance(sel_or_loc, str) else sel_or_loc
        l = l.first
        try:
            l.scroll_into_view_if_needed(timeout=TIMEOUT)
            l.click(timeout=TIMEOUT)
        except (PWTimeout, PWError) as e:
            raise StepFail(f'click failed on {what or sel_or_loc}: {str(e).splitlines()[0]}')
        self.page.wait_for_timeout(STEP_WAIT)

    def need(self, sel, what=None, n=1):
        l = self.loc(sel)
        try:
            l.first.wait_for(state='attached', timeout=TIMEOUT)
        except PWTimeout:
            raise StepFail(f'missing {what or "element"}: {sel}')
        if l.count() < n:
            raise StepFail(f'expected >= {n} of {sel}, found {l.count()}')
        return l

    def expect_attr(self, sel, attr, val):
        try:
            expect(self.loc(sel).first).to_have_attribute(attr, val, timeout=TIMEOUT)
        except AssertionError:
            got = self.loc(sel).first.get_attribute(attr) if self.loc(sel).count() else '(no element)'
            raise StepFail(f'{sel} [{attr}] expected {val!r}, got {got!r}')

    def expect_hash(self, h):
        try:
            self.page.wait_for_function('h => location.hash === h', arg=h, timeout=TIMEOUT)
        except PWTimeout:
            raise StepFail(f'hash expected {h}, got {self.page.evaluate("location.hash")!r}')

    def storage(self, key):
        raw = self.page.evaluate('k => localStorage.getItem(k)', key)
        return json.loads(raw) if raw else None

    # ---------- 단계 실행과 공통 확인 ----------
    def step(self, name, hash_, fn):
        if self.blocked:
            self.results.append((name, 'SKIP', f'blocked by: {self.blocked}', None))
            print(f'[{self.label}] SKIP {name} (blocked by {self.blocked})', flush=True)
            return
        self.errors.clear()
        problems, detail = [], ''
        try:
            detail = fn() or ''
            self.expect_hash(hash_)
        except StepFail as e:
            problems.append(str(e)); self.blocked = name
        except Exception as e:  # 예상 못 한 실패도 이 단계 실패로 기록합니다
            problems.append(f'{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ""}'); self.blocked = name
        self.page.wait_for_timeout(150)
        if self.errors:
            problems.append('errors: ' + ' | '.join(dict.fromkeys(self.errors)))
        hs = self.page.evaluate(HSCROLL_JS)
        if hs:
            problems.append(f'horizontal scroll {hs["scrollWidth"]}>{hs["clientWidth"]}; widest: {", ".join(hs["widest"])}')
        try:
            self.page.add_script_tag(path=str(SMOKE))
            sm = self.page.evaluate(SMOKE_JS)
            self.smoke_known += sm['known']
            if sm['found']:
                problems.append('smoke: ' + ' | '.join(sm['found'][:8]) + (f' (+{len(sm["found"]) - 8} more)' if len(sm['found']) > 8 else ''))
        except PWError as e:
            problems.append(f'smoke.js could not run: {str(e).splitlines()[0]}')
        ok = not problems
        shot = None
        if not ok and self.shots:
            shot = pathlib.Path(self.shots) / f'e2e_{self.label.replace("#", "_it")}_step{name.split(" ")[0]}.png'
            try:
                self.page.screenshot(path=str(shot), full_page=True)
            except PWError:
                shot = None
        self.results.append((name, 'PASS' if ok else 'FAIL', detail if ok else '; '.join(problems), shot))
        print(f'[{self.label}] {"PASS" if ok else "FAIL"} {name}' + (f' ({detail})' if ok and detail else '') + ('' if ok else f'\n    -> ' + '\n    -> '.join(problems)) + (f'\n    screenshot {shot}' if shot else ''), flush=True)

    # ---------- 여정 ----------
    def s0_load(self):
        self.need('#view-me:not([hidden])', '내 역량 화면')
        self.need('#job', '지원 직무 select')
        return 'loaded #me'

    def s1_job(self):
        self.page.select_option('#job', JOB)
        self.page.wait_for_timeout(STEP_WAIT)
        if self.page.eval_on_selector('#job', 'el => el.value') != JOB:
            raise StepFail(f'#job value is not {JOB}')
        st = self.storage('gyeongheom-v2')
        if not st or st.get('job') != JOB:
            raise StepFail(f'store.job not saved as {JOB} (gyeongheom-v2.job={st and st.get("job")!r})')
        n = self.need('#view-me a[href^="#activities?fill="]', '부족 역량 링크 (a[href^="#activities?fill="])').count()
        return f'job={JOB}, {n} gap links'

    def s2_gap_link(self):
        # 마지막 부족 링크: 직무를 고를 때 채워진 ui.fill(부족 전부)과 달라야 링크가 실제로 반영됐는지 보입니다
        a = self.loc('#view-me a[href^="#activities?fill="]:not([href*="id="])').last
        href = a.get_attribute('href')
        q = urllib.parse.parse_qs(href.split('?', 1)[1])
        comp = q['fill'][0].split(',')[0]
        self.ctx['comp'] = comp
        self.click(a, f'부족 링크 {href}')
        self.expect_hash('#activities')
        self.need('#view-activities:not([hidden])', '활동 추천 화면')
        self.expect_attr(f'#gaps [data-gap="{comp}"]', 'aria-pressed', 'true')
        others = self.page.eval_on_selector_all(f'#gaps [data-gap]:not([data-gap="{comp}"])', 'els => els.filter(e => e.getAttribute("aria-pressed") === "true").map(e => e.dataset.gap)')
        if others:
            raise StepFail(f'ui.fill should be only {comp}, also pressed: {others}')
        self.need('#act-rows [data-actsel]', '활동 목록 행')
        return f'fill={comp}'

    def s3_plan(self):
        # 팀원 모집 글이 있는 활동을 고릅니다 (다음 단계에서 지원하려고). 없으면 첫 행
        rows = self.loc('#act-rows li:has(.flag.team) [data-actsel]')
        if not rows.count():
            rows = self.loc('#act-rows [data-actsel]')
        row = rows.first
        aid = row.get_attribute('data-actsel')
        self.ctx['act'] = aid
        self.click(row, f'활동 행 {aid}')
        self.expect_attr(f'#act-rows [data-actsel="{aid}"]', 'aria-current', 'true')
        self.need(f'#act-detail [data-plan="{aid}"]', f'담기 버튼 #act-detail [data-plan="{aid}"]')
        self.click(f'#act-detail [data-plan="{aid}"]', '참여 예정으로 담기')
        if self.loc(f'#act-detail [data-plan="{aid}"]:not([disabled])').count():
            raise StepFail('담기 button still enabled after click')
        exps = (self.storage('gyeongheom-v2') or {}).get('exps', [])
        planned = [e for e in exps if e.get('planned') and str(e.get('actId')) == aid]
        if not planned:
            raise StepFail(f'no planned exp with actId={aid} in gyeongheom-v2')
        self.ctx['planned'] = planned[0]['id']
        return f'act={aid}, planned exp={planned[0]["id"]}'

    def s4_team(self):
        aid = self.ctx['act']
        self.click(f'#act-detail a[href="#team?act={aid}"]', f'팀원 모집 링크 a[href="#team?act={aid}"]')
        self.expect_hash('#team')
        self.need('#view-team:not([hidden])', '팀원 모집 화면')
        rail = self.loc(f'[data-teamact="{aid}"]')
        sel_val = self.page.eval_on_selector('#team-act-select', 'el => el.value') if self.loc('#team-act-select').count() else None
        if not ((rail.count() and rail.first.get_attribute('aria-pressed') == 'true') or sel_val == aid):
            raise StepFail(f'team view not filtered to act {aid} (rail aria-pressed / #team-act-select={sel_val!r})')
        posts = self.loc('#view-team .post:not(.mine):not(.closed) [data-open]')
        if not posts.count():
            raise StepFail(f'no open post for act {aid} to apply to')
        pid = posts.first.get_attribute('data-open')
        self.ctx['post'] = pid
        self.click(posts.first, f'모집글 {pid}')
        self.expect_attr(f'[data-open="{pid}"]', 'aria-expanded', 'true')
        self.need(f'[data-applyopen="{pid}"]', '지원 버튼')
        return f'post={pid}'

    def s5_apply(self):
        pid = self.ctx['post']
        self.click(f'[data-applyopen="{pid}"]', '포트폴리오 붙여 지원하기')
        self.need('#apply-form', '#apply-form')
        if not self.loc('#apply-form input[name=exp]:checked').count():
            self.click('#apply-form input[name=exp]', '첫 경험 체크')
        n = self.loc('#apply-form input[name=exp]:checked').count()
        self.click('#apply-form [type=submit]', '지원 제출')
        self.need(f'[data-unapply="{pid}"]', '지원 완료 표시 [data-unapply]')
        apps = self.storage('teum-applications') or {}
        if pid not in apps:
            raise StepFail(f'teum-applications has no {pid}')
        return f'applied with {n} exp'

    def s6_me_planned(self):
        self.click('a[data-nav="me"]', '내 역량 nav')
        self.expect_hash('#me')
        pid = self.ctx['planned']
        el = self.need(f'#exp-{pid}', f'참여 예정 경험 #exp-{pid}')
        if '참여 예정' not in el.first.inner_text():
            raise StepFail(f'#exp-{pid} has no 참여 예정 marker')
        return f'#exp-{pid} 참여 예정'

    def s7_try(self):
        btn = self.need('#view-me [data-try]', '문항에 써 보기 [data-try]').first
        eid = btn.get_attribute('data-try')
        self.click(btn, f'문항에 써 보기 {eid}')
        self.expect_hash('#match')
        self.need('#write-match:not([hidden])', '문항별 쓰기 화면')
        self.expect_attr(f'#exp-list [data-expsel="{eid}"]', 'aria-current', 'true')
        self.need('#exp-detail h3', '경험 상세')
        return f'exp {eid} selected'

    def s8_apply_flow(self):
        self.click('a[data-sub="apply"]', '지원서 전체 배정 탭')
        self.expect_hash('#apply')
        self.need('#write-apply:not([hidden])', '지원서 전체 배정 화면')
        self.click('#sample-app', '예시 지원서 불러오기')
        self.click('#auto', '자동 배정')
        on = self.need('#apply-results [data-assign][aria-pressed="true"]', '배정된 칸')
        ids = sorted({a.split(':')[1] for a in on.evaluate_all('els => els.map(e => e.dataset.assign)')})
        self.click('#submit-app', '제출 완료로 표시')
        st = self.storage('gyeongheom-v2') or {}
        label = f'{st.get("app", {}).get("company") or "이름 없는 회사"} {st.get("job", "")}'.strip()
        not_marked = [i for i in ids if not any(str(e['id']) == i and label in e.get('used', []) for e in st.get('exps', []))]
        if not_marked:
            raise StepFail(f'exps {not_marked} not marked used with {label!r} in storage')
        self.click('a[data-nav="me"]', '내 역량 nav')
        self.expect_hash('#me')
        missing = [i for i in ids if label not in (self.loc(f'#exp-{i}').first.inner_text() if self.loc(f'#exp-{i}').count() else '')]
        if missing:
            raise StepFail(f'used marker {label!r} not shown on #me for #exp-{", #exp-".join(missing)}')
        self.ctx['final_hash'] = '#me'
        return f'{len(ids)} exps marked {label!r}'

    def run(self, base):
        self.page.goto(base.rstrip('/') + '/#me', wait_until='networkidle')
        self.page.wait_for_timeout(STEP_WAIT)
        self.step('0 load #me', '#me', self.s0_load)
        self.step('1 pick 지원 직무 (#job)', '#me', self.s1_job)
        self.step('2 부족 link -> #activities, ui.fill chip', '#activities', self.s2_gap_link)
        self.step('3 select activity + 담기 (참여 예정)', '#activities', self.s3_plan)
        self.step('4 팀원 모집 link -> #team, open post', '#team', self.s4_team)
        self.step('5 apply with portfolio (#apply-form)', '#team', self.s5_apply)
        self.step('6 #me shows planned experience', '#me', self.s6_me_planned)
        self.step('7 문항에 써 보기 -> #match selected', '#match', self.s7_try)
        self.step('8 #apply 예시 -> 자동 배정 -> 제출, used on #me', '#me', self.s8_apply_flow)
        return self.results


def ref_routes(ctx, ref):
    """--ref: 같은 서버 주소로 그 git 버전의 파일을 내보냅니다. 디스크의 파일은 건드리지 않습니다."""
    # ls-tree는 현재 폴더 기준 경로를 줍니다. 심볼릭 링크(120000, shared/tell-*)는 디스크 그대로 둡니다
    rows = subprocess.run(['git', '-C', str(ROOT), 'ls-tree', '-r', ref, '--', 'index.html', 'app', 'shared'], capture_output=True, text=True, check=True).stdout.splitlines()
    ctype = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json'}
    n = 0
    for row in rows:
        mode, path = row.split(' ', 1)[0], row.split('\t', 1)[1]
        ct = ctype.get(pathlib.PurePosixPath(path).suffix)
        if mode == '120000' or not ct:
            continue
        body = subprocess.run(['git', '-C', str(ROOT), 'show', f'{ref}:./{path}'], capture_output=True, check=True).stdout
        pat = '**/' + path + '*' if path != 'index.html' else '**/'  # 앱 첫 화면 주소는 /로 끝납니다
        ctx.route(pat, (lambda body, ct: lambda r: r.fulfill(status=200, content_type=ct + '; charset=utf-8', body=body))(body, ct))
        n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8841/')
    ap.add_argument('--width', default='both', choices=['1440', '390', 'both'])
    ap.add_argument('--iterations', type=int, default=5, help='journeys per width, each in a fresh context')
    ap.add_argument('--reduced', action='store_true', help='every pass uses prefers-reduced-motion: reduce (no extra pass)')
    ap.add_argument('--shots', default=str(pathlib.Path(tempfile.gettempdir()) / 'teum-e2e-shots'), help='failure screenshots go here')
    ap.add_argument('--ref', help='serve index.html, app/, shared/ from this git ref instead of disk')
    a = ap.parse_args()
    widths = [1440, 390] if a.width == 'both' else [int(a.width)]
    pathlib.Path(a.shots).mkdir(parents=True, exist_ok=True)
    plan = [(w, i, a.reduced) for w in widths for i in range(1, a.iterations + 1)]
    if not a.reduced:
        plan.append((min(widths), 1, True))  # 움직임 줄이기 한 번
    runs = []  # (group, iteration, results)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, it, red in plan:
            # 새 컨텍스트라 localStorage가 비어 있어 항상 예시 데이터에서 시작합니다
            ctx = b.new_context(viewport={'width': w, 'height': 900 if w > 500 else 844}, device_scale_factor=1,
                                reduced_motion='reduce' if red else 'no-preference')
            if a.ref:
                ref_routes(ctx, a.ref)
            group = f'{w}{"-reduced" if red else ""}'
            j = Journey(ctx.new_page(), f'{group}#{it}', a.shots)
            runs.append((group, it, j.run(a.base), j.smoke_known))
            ctx.close()
        b.close()

    # 단계별 통과 횟수와 FLAKY (같은 묶음 안에서 통과도 실패도 한 단계)
    bad, flaky = 0, []
    print(f'\n== summary{" (ref " + a.ref + ")" if a.ref else ""}: {a.iterations} iteration(s) per width' + ('' if a.reduced else f' + 1 reduced pass at {min(widths)}'))
    for group in dict.fromkeys(g for g, *_ in runs):
        rs = [(it, res) for g, it, res, _ in runs if g == group]
        known = sum(k for g, _, _, k in runs if g == group)
        print(f'-- {group} ({len(rs)} run(s)){f", known smoke false positives ignored (#cond-d, img-alt links): {known}" if known else ""}')
        for si, name in enumerate(r[0] for r in rs[0][1]):
            outs = [(it, res[si]) for it, res in rs]
            npass = sum(r[1] == 'PASS' for _, r in outs)
            nskip = sum(r[1] == 'SKIP' for _, r in outs)
            nfail = len(outs) - npass - nskip
            # 통과와 실패가 섞이면 FLAKY. 앞 단계 실패로 건너뛴 것만 섞였으면 이 단계 탓이 아닙니다
            tag = 'ok' if npass == len(outs) else 'FLAKY' if npass and nfail else 'skipped after an earlier failure' if npass else 'FAIL'
            print(f'   step {name}: {npass}/{len(outs)}' + (f' ({nskip} skipped)' if nskip else '') + ('' if tag == 'ok' else f'  {tag}'))
            if npass < len(outs):
                bad += 1
                if npass:
                    flaky += [(group, name, it, r) for it, r in outs if r[1] == 'FAIL']
    if flaky:
        print('\n== FLAKY (passes in some iterations, fails in others)')
        for group, name, it, r in flaky:
            print(f'  {group} iteration {it}, step {name}: {r[2]}' + (f'\n    screenshot {r[3]}' if r[3] else ''))
    print('RESULT', 'PASS' if not bad else 'FAIL', f'({bad} step(s) not passing in every run, {len({(f[0], f[1]) for f in flaky})} flaky)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
