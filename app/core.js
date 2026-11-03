// 틈 공통 로직: 저장소 하나, 화면 상태 하나, 역량 계산. 서버나 AI 호출은 없습니다.

// ---------- 도구 ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const hasNum = s => /\d/.test(s || '');
const md = iso => iso.slice(5).replace('-', '/');
const enc = encodeURIComponent;

// 받침 있으면 a, 없으면 b (ro: ㄹ받침은 '로' 쪽)
function josa(word, a, b, ro){
  const c = String(word).trim().slice(-1).charCodeAt(0) - 0xAC00;
  if(c < 0 || c > 11171) return a;
  const jong = c % 28;
  return jong === 0 || (ro && jong === 8) ? b : a;
}
function highlight(text, words){
  let out = esc(text);
  [...words].sort((a, b) => b.length - a.length).forEach(w => { out = out.split(esc(w)).join(`<mark>${esc(w)}</mark>`); });
  return out;
}
const actions = e => (e.a || '').split('\n').map(s => s.trim()).filter(Boolean);
const expText = e => [e.title, e.s, e.t, e.a, e.r, e.l].join(' ');

let toastT;
// act = {label, href}: 알림 끝에 다음 화면으로 가는 연결을 붙입니다 (그때는 조금 더 오래 보여줍니다)
function toast(m, act){
  const t = $('#toast');
  t.innerHTML = esc(m) + (act ? ` <a class="toast-go" href="${esc(act.href)}">${esc(act.label)}</a>` : '');
  t.classList.toggle('has-act', !!act); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), act ? 4600 : 2400);
}

// ---------- 확인 창: confirm, prompt 대신 씁니다. 확인이면 true(입력 칸이 있으면 그 값), 취소면 null ----------
function ask({title, body = '', ok = '확인', danger = false, input = null}){
  const d = $('#ask');
  $('#ask-h').textContent = title; $('#ask-p').textContent = body; $('#ask-p').hidden = !body;
  $('#ask-ok').textContent = ok; $('#ask-ok').className = 'btn ' + (danger ? 'danger' : 'accent');
  $('#ask-field').innerHTML = !input ? '' : input.multi
    ? `<textarea id="ask-in" aria-label="${esc(title)}" placeholder="${esc(input.ph || '')}">${esc(input.value || '')}</textarea>`
    : `<input id="ask-in" aria-label="${esc(title)}" value="${esc(input.value || '')}" placeholder="${esc(input.ph || '')}">`;
  d.returnValue = ''; d.showModal(); (input ? $('#ask-in') : $('#ask-ok')).focus();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok' ? (input ? $('#ask-in').value : true) : null), {once: true}));
}

// ---------- 움직임 ----------
// 움직임 스위치: <html>에 m-<키> 클래스가 붙으면 그 움직임이 켜집니다. 화면 파일은 motionOn('morph')처럼 확인합니다
const MOTIONS = [
  ['morph', '포스터가 상세로 커짐', '활동을 누르면 그 포스터가 커지며 상세가 됩니다'],
  ['push', '뒤 화면 밀려남', '상세 시트가 올라오면 뒤 목록이 작아지며 물러납니다'],
  ['spring', '스프링 재정렬', '조건을 바꾸면 카드가 살짝 튕기며 새 자리로 갑니다'],
  ['strip', '가운데가 커지는 포스터 띠', '시작 화면 포스터 띠에서 가운데 포스터가 커집니다'],
  ['unfold', '펼쳐지는 층', '시작 화면 맨 위 카드가 스크롤하면 화면 너비로 펼쳐집니다'],
  ['stack', '쌓이는 카드', '경험창고 카드가 스크롤하면 위로 겹쳐 쌓입니다'],
  ['grow', '마우스 올리면 커짐', '카드가 6px쯤 커지며 그림자가 깊어집니다'],
  ['roll', '굴러가는 숫자', '점수와 D-day가 숫자가 굴러가듯 바뀝니다']
];
const MOTION_KEY = 'teum-motion', MOTION_BEST = ['morph', 'push', 'spring', 'strip', 'grow', 'roll'];
function loadMotion(){ try{ const v = JSON.parse(localStorage.getItem(MOTION_KEY) || 'null'); if(Array.isArray(v)) return v; }catch(e){} return MOTION_BEST.slice(); }
let motionSet = new Set(loadMotion());
// 주소에 ?m=morph,roll 처럼 붙이면 그 조합으로 엽니다 (조합 공유용)
try{ const q = new URLSearchParams(location.search).get('m'); if(q !== null) motionSet = new Set(q.split(',').filter(k => MOTIONS.some(m => m[0] === k))); }catch(e){}
function applyMotion(){ MOTIONS.forEach(([k]) => document.documentElement.classList.toggle('m-' + k, motionSet.has(k))); try{ localStorage.setItem(MOTION_KEY, JSON.stringify([...motionSet])); }catch(e){} }
const motionOn = k => motionSet.has(k) && !REDUCED.matches;
applyMotion();

// 화면에 처음 들어올 때만 목록이 차례로 올라옵니다. 같은 화면 안의 클릭은 View Transition으로 자리를 옮깁니다.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const canMorph = () => !!document.startViewTransition && !REDUCED.matches && !document.hidden;
function morph(fn){ canMorph() ? document.startViewTransition(fn) : fn(); }
const STAGGER = '.rows > li,.lib-item,.post,.exp,.acts > li,.gap-row,.me > div > .box,.cond,.act-detail,.qrow,.plan > li';
let enterT;
function enterView(el){
  if(REDUCED.matches) return;
  const seen = new Map();
  el.querySelectorAll(STAGGER).forEach(x => { const n = seen.get(x.parentElement) || 0; seen.set(x.parentElement, n + 1); x.style.setProperty('--i', Math.min(n, 8)); });
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  clearTimeout(enterT); enterT = setTimeout(() => el.classList.remove('enter'), 1100);
}
// data-n이 붙은 숫자는 이전 값에서 새 값까지 굴러갑니다 (점수, 맞음 %)
const lastN = new Map();
function countUp(){
  document.querySelectorAll('[data-n]').forEach(el => {
    const key = el.dataset.n, to = +(el.textContent.match(/\d+/) || [0])[0], from = lastN.get(key);
    lastN.set(key, to);
    if(from === undefined || from === to || REDUCED.matches || !el.offsetParent) return;
    if(motionOn('roll')) return rollDigits(el, from, to);
    const tpl = el.textContent, t0 = performance.now(), dur = 520;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if(el.isConnected) el.textContent = tpl.replace(/\d+/, Math.round(from + (to - from) * e)); if(k < 1) requestAnimationFrame(step); };
    el.textContent = tpl.replace(/\d+/, from); requestAnimationFrame(step);
  });
}
// 자리마다 0~9 띠를 세워 이전 숫자에서 새 숫자로 굴립니다. 끝나면 보통 글자로 되돌립니다 (읽기 프로그램과 테스트용)
function rollDigits(el, from, to){
  const tpl = el.textContent, m = tpl.match(/\d+/), a = String(from), b = String(to), n = Math.max(a.length, b.length);
  const A = a.padStart(n, ' '), B = b.padStart(n, ' ');
  const col = (d, i) => `<span class="roll-d"><span class="roll-s" style="--v:${d === ' ' ? 10 : d}" data-to="${B[i] === ' ' ? 10 : B[i]}">${'0123456789'.split('').map(x => `<span>${x}</span>`).join('')}<span>&nbsp;</span></span></span>`;
  el.setAttribute('aria-label', tpl);
  el.innerHTML = esc(tpl.slice(0, m.index)) + `<span class="roll" aria-hidden="true">${[...A].map(col).join('')}</span>` + esc(tpl.slice(m.index + m[0].length));
  void el.offsetWidth;
  el.querySelectorAll('.roll-s').forEach(s => s.style.setProperty('--v', s.dataset.to));
  setTimeout(() => { if(el.isConnected && el.querySelector('.roll')){ el.textContent = tpl; el.removeAttribute('aria-label'); } }, 950);
}
// 눌린 세그먼트 버튼과 탭에 이름을 붙여, 바뀔 때 바탕이 옆 칸으로 미끄러지게 합니다
function nameThumbs(){
  document.querySelectorAll('.seg,.tabs').forEach((g, i) => {
    g.querySelectorAll('.seg-thumb').forEach(b => { b.classList.remove('seg-thumb'); b.style.viewTransitionName = ''; });
    const on = g.querySelector('[aria-pressed="true"],[aria-selected="true"],[aria-current="page"]');
    if(on && g.offsetParent){ on.classList.add('seg-thumb'); on.style.viewTransitionName = 'thumb-' + (g.id || i); }
  });
}
function moveNavInd(instant){
  const a = document.querySelector('nav.views a[aria-current="page"]'), ind = $('.nav-ind');
  if(!a || !ind) return;
  if(instant) ind.style.transition = 'none';
  ind.style.width = a.offsetWidth + 'px'; ind.style.translate = a.offsetLeft + 'px 0';
  if(instant){ void ind.offsetWidth; ind.style.transition = ''; }
}

// ---------- 공고: 손으로 확인한 ACTIVITIES 뒤에 스크래퍼가 모은 FEED(shared/feed.js)를 붙입니다. 같은 제목은 건너뜁니다 ----------
if(typeof FEED !== 'undefined'){
  const norm = t => String(t).replace(/\s+/g, '').toLowerCase(), seen = new Set(ACTIVITIES.map(a => norm(a.title)));
  FEED.forEach(a => { if(a && a.id && !seen.has(norm(a.title))){ seen.add(norm(a.title)); ACTIVITIES.push(a); } });
}

// ---------- 화면별 이벤트: 각 화면 파일이 on('click', fn)으로 자기 처리기를 붙입니다. fn이 true를 돌려주면 main.js는 더 처리하지 않습니다 ----------
const HANDLERS = {click: [], change: [], input: [], submit: []};
const on = (type, fn) => { HANDLERS[type].push(fn); };
const runHandlers = (type, e) => HANDLERS[type].some(fn => fn(e) === true);

// ---------- 저장소: 화면 전체가 같은 객체를 씁니다 (localStorage는 새로고침용) ----------
const KEY = 'gyeongheom-v2', POSTS_KEY = 'teum-posts', APPS_KEY = 'teum-applications';
// 학생 프로필: 시작 화면에서 묻고, 언제든 내 조건에서 바꿉니다. 매칭이 이 값을 씁니다
const DEMO_PROFILE = {grade: '3학년', major: '경영학과', majorGroup: '경영, 경제', interests: ['기획', '마케팅', '데이터'], kinds: [], hours: 6, online: false, goals: [], done: true};
const EMPTY_PROFILE = {grade: '', major: '', majorGroup: '', interests: [], kinds: [], hours: 6, online: false, goals: [], done: false};
// 예시 학생: data.js의 PERSONAS(전공별 예시 학생)가 있으면 그중 하나로, 없으면 경영 예시 학생으로 시작합니다
function fresh(key){
  const P = typeof PERSONAS !== 'undefined' ? PERSONAS : {};
  const p = P[key] || P[Object.keys(P)[0]];
  if(p) return {exps: clone(p.exps), app: clone(p.app), drafts: {}, job: p.job, saved: [], profile: {...clone(EMPTY_PROFILE), ...clone(p.profile), done: true}, persona: key in P ? key : Object.keys(P)[0]};
  return {exps: clone(SEED), app: clone(SAMPLE_APP), drafts: {}, job: '마케팅', saved: [], profile: clone(DEMO_PROFILE), persona: 'biz'};
}
// 예시 없이 내 경험으로 시작할 때: 경험창고, 지원서, 직무를 비웁니다 (팀 모집글과 지원 기록은 그대로)
function blank(){ return {exps: [], app: {company: '', job: '', questions: [{id: 'q1', text: '', limit: 800}], assign: {}}, drafts: {}, job: '', saved: [], profile: clone(EMPTY_PROFILE)}; }
function readJSON(k, fb){ try{ const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? fb; }catch(e){ return fb; } }
// 예전 저장본의 역량 이름을 새 이름으로 바꿉니다 (성실은 NCS 이름인 직업윤리로)
const RENAMED = {'성실': '직업윤리'};
const renameTags = list => Array.isArray(list) ? [...new Set(list.map(t => RENAMED[t] || t))] : list;
function migrate(base){
  base.exps.forEach(e => { e.tags = renameTags(e.tags); });
  base.posts.forEach(p => { p.want = renameTags(p.want); p.has = renameTags(p.has); (p.portfolio || []).forEach(x => { x.tags = renameTags(x.tags); }); });
  return base;
}
function loadStore(){
  const d = readJSON(KEY, null);
  const base = d && Array.isArray(d.exps) && d.app ? Object.assign(fresh(), d) : fresh();
  base.posts = Array.isArray(readJSON(POSTS_KEY, [])) ? readJSON(POSTS_KEY, []) : [];
  base.apps = readJSON(APPS_KEY, {}) || {};
  return migrate(base);
}
const store = loadStore();
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({exps: store.exps, app: store.app, drafts: store.drafts, job: store.job, saved: store.saved, profile: store.profile, persona: store.persona})); }catch(e){} }
function savePosts(){ try{ localStorage.setItem(POSTS_KEY, JSON.stringify(store.posts)); }catch(e){} }
function saveApps(){ try{ localStorage.setItem(APPS_KEY, JSON.stringify(store.apps)); }catch(e){} }

// ---------- 화면 상태 ----------
const ui = {
  view: 'me', sub: 'match',
  // 내 역량
  libSort: 'quality', libGap: null, flashExp: null,
  // 활동 추천
  interests: new Set(['기획','마케팅','데이터']), hours: 6, connected: false, mode: 'fit', kind: '전체', sort: 'score', hideClash: false,
  selected: null, fill: new Set(),
  // 팀원 모집
  teamAct: null, openPost: null, applyFor: null, writing: false, teamSort: 'fit', openOnly: true, cmp: null, wantDraft: null,
  // 지원서
  q: '', limit: 800, sel: null, dtab: 'star', editId: null
};

// 프로필의 관심 분야와 시간을 활동 추천 조건으로 옮깁니다 (빈 값이면 기본값 유지)
function applyProfile(){
  const p = store.profile || {};
  if(p.interests?.length) ui.interests = new Set(p.interests);
  if(p.hours) ui.hours = p.hours;
}
applyProfile();

// ---------- 역량 ----------
// 보유 수준(0~3) = 한 일의 우선순위 합 / 3. 참여 예정 경험은 보유에 넣지 않고 plan으로 따로 셉니다
function coverage(job){
  return COMP_KEYS.map(c => {
    const sum = list => list.filter(e => e.tags.includes(c)).reduce((a, e) => a + e.pri, 0) / 3;
    const have = Math.min(3, sum(store.exps.filter(e => !e.planned)));
    const plan = Math.min(3 - have, sum(store.exps.filter(e => e.planned)));
    const need = job ? (JOBS[job][c] || 0) : 0;
    const st = !need ? 'na' : have >= need ? 'ok' : 'gap';
    return {c, have, plan, need, lack: Math.max(0, need - have), st};
  });
}
const gapsFor = job => coverage(job).filter(x => x.lack > 0).sort((a, b) => b.lack - a.lack);
const doneExps = () => store.exps.filter(e => !e.planned);
const GAP_TIP = {
  '리더십':'모임, 프로젝트, 아르바이트에서 내가 먼저 정하고 이끈 순간을 하나 정리해 보세요',
  '문제해결':'불편하거나 비효율적이던 것을 내가 바꾼 경험을 숫자와 함께 정리해 보세요',
  '협업':'의견이 갈렸다가 합의한 팀 경험을 하나 정리해 보세요',
  '도전':'처음 해 보거나 결과가 불확실했던 일에 뛰어든 경험을 정리해 보세요',
  '데이터':'기록, 설문, 엑셀 정리처럼 숫자로 판단한 경험을 정리해 보세요',
  '고객':'손님, 사용자, 회원을 직접 상대하며 바꾼 점이 있는 경험을 정리해 보세요',
  '직업윤리':'오랫동안 빠짐없이 이어 온 일, 약속을 지킨 일을 기간과 횟수로 정리해 보세요',
  '의사소통':'발표, 설명, 설득으로 상대의 생각이나 행동이 바뀐 순간을 하나 정리해 보세요'
};

// 틈의 8개 역량과 NCS 직업기초능력(10개 영역) 대응. NCS는 2026-04에 직업공통능력(7개 영역)으로 개편됐고, 새 영역 이름은 공식 자료로 다시 확인해야 합니다
const NCS_MAP = {
  '의사소통': '의사소통능력', '문제해결': '문제해결능력', '직업윤리': '직업윤리',
  '협업': '대인관계능력 중 팀워크', '리더십': '대인관계능력 중 리더십', '고객': '대인관계능력 중 고객서비스',
  '데이터': '수리능력과 정보능력', '도전': 'NCS에는 없음, 기업 인재상의 도전정신(대한상의 2023)'
};

function quality(e){
  const acts = actions(e);
  const checks = [
    {ok: (e.s || '').length >= 20, msg: '상황 설명이 짧습니다. 언제, 어디서, 무엇이 문제였는지 적어 보세요'},
    {ok: !!(e.t || '').trim(), msg: '과제가 비어 있습니다. 내가 풀어야 했던 목표를 한 줄로 적으세요'},
    {ok: acts.length >= 2, msg: '행동이 하나뿐입니다. 내가 한 일을 단계로 나눠 두 개 이상 적으세요'},
    {ok: hasNum(e.r), msg: '결과에 숫자가 없습니다. 비율, 횟수, 기간 중 하나라도 넣으세요'},
    {ok: !!(e.l || '').trim(), msg: '배운 점이 비어 있습니다. 다음에 다르게 할 점을 적으세요'},
    {ok: !/우리|저희/.test(e.a || ''), msg: "행동에 '우리'가 들어 있습니다. 내가 한 일로 바꿔 쓰세요"}
  ];
  const passed = checks.filter(c => c.ok).length;
  return {pct: Math.round(passed / checks.length * 100), issues: checks.filter(c => !c.ok).map(c => c.msg)};
}

// ---------- 활동과 경험 연결 ----------
const actById = id => ACTIVITIES.find(a => a.id === +id);
const plannedTitle = a => `${a.title} (참여 예정)`;
// 화면에는 참여 예정 표시를 따로 붙이므로 제목 끝 꼬리표는 떼고 보여줍니다
const showTitle = e => e.planned ? e.title.replace(/ \(참여 예정\)$/, '') : e.title;
const plannedExp = a => store.exps.find(e => e.planned && (e.actId === a.id || e.title === plannedTitle(a)));
// 활동을 참여 예정 경험으로 담습니다. 내 역량 지도에 빗금으로, 경험 목록에 참여 예정으로 나타납니다
function planActivity(id){
  const a = actById(id); if(!a || plannedExp(a)) return;
  const exp = {id: Date.now(), actId: a.id, title: plannedTitle(a), when: '2026.11 ~', role: '참여 예정', pri: 1, tags: a.builds.slice(),
    s: `${a.host}의 ${a.title}에 참여할 예정입니다.`, t: '', a: '', r: '', l: '', used: [], planned: true};
  store.exps.push(exp); ui.flashExp = exp.id; save();
  toast('경험창고에 참여 예정으로 담았습니다. 활동이 끝나면 행동과 결과를 채우세요', {label: '팀원 찾기', href: link.team(a.id)});
}
// 팀원 모집 글 수: 열린 예시 글 + 내가 올린 글
const teamCount = id => POSTS.filter(p => p.act === id && p.status !== 'closed').length + store.posts.filter(p => p.act === id).length;

// ---------- 다음 할 일: 네 화면을 한 흐름으로 잇는 한 줄 ----------
// 직무 고르기, 빈 역량 채울 활동 담기, 담은 활동의 팀 찾기, 지원서 문항 배정 순서로 아직 안 한 일을 찾습니다
const hasTeam = actId => store.posts.some(p => p.act === actId) || Object.keys(store.apps).some(id => [...POSTS, ...store.posts].find(p => p.id === id)?.act === actId);
function nextSteps(){
  const job = store.job, planned = store.exps.filter(e => e.planned), steps = [];
  if(!job) steps.push({view: 'me', text: '지원 직무를 고르면 빈 역량부터 알려 줍니다', label: '직무 고르기', job: true});
  const gap = job && gapsFor(job).find(g => !planned.some(e => e.tags.includes(g.c)));
  if(gap) steps.push({view: 'activities', text: `${job} 직무에 ${gap.c} 경험이 부족합니다. ${gap.c}${josa(gap.c, '을', '를')} 채울 활동을 하나 경험창고에 담아 보세요`, label: `${gap.c} 채울 활동 보기`, href: link.acts(gap.c)});
  const lone = planned.find(e => e.actId && actById(e.actId) && !hasTeam(e.actId));
  if(lone) steps.push({view: 'team', text: `참여 예정인 ${showTitle(lone)}에 함께할 팀이 아직 없습니다`, label: '팀원 찾기', href: link.team(lone.actId)});
  const qs = store.app.questions.filter(q => q.text.trim()), done = qs.filter(q => store.app.assign[q.id] != null).length;
  if(qs.length && done < qs.length) steps.push({view: 'write', text: `지원서 문항 ${qs.length}개 중 ${done}개에 경험을 배정했습니다`, label: '지원서 배정하기', href: '#apply'});
  return steps;
}
let lastNext = '';
function renderNext(){
  const el = $('#next'); if(!el) return;
  // 지금 화면의 일이 먼저면 그것부터 (첫 방문자가 본 흐름에서 벗어나지 않도록)
  const s = nextSteps()[0];
  el.hidden = !s; if(!s) return;
  const go = s.job ? `<button class="linkbtn" type="button" id="next-job">${s.label}</button>` : `<a class="go" href="${s.href}">${esc(s.label)}</a>`;
  el.innerHTML = `<p><b>다음 할 일</b><span>${esc(s.text)}</span>${go}</p>`;
  if(s.text !== lastNext && lastNext && !REDUCED.matches){ el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
  lastNext = s.text;
}

// ---------- 주소 ----------
// #me, #activities?fill=데이터&id=6, #team?act=6, #match, #apply  (#library는 #me로 읽습니다)
const ROUTES = {start: 'start', me: 'me', library: 'me', activities: 'activities', team: 'team', match: 'write', apply: 'write'};
const link = {
  acts: (fill, id) => '#activities' + (fill || id ? '?' + [fill ? 'fill=' + enc(fill) : '', id ? 'id=' + id : ''].filter(Boolean).join('&') : ''),
  team: act => '#team' + (act ? '?act=' + act : '?act=')
};
