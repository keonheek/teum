// 시작 화면 (나란히형): 왼쪽에서 나를 알려 주면 오른쪽 포스터 매칭이 그 자리에서 다시 줄을 섭니다
// 매칭 점수는 활동 추천의 evaluate()를 그대로 쓰고, 이 화면에서 고른 전공 계열, 학년, 목표만 아래 START_RULES의 작은 가산점과 감점으로 더합니다

const START_GRADES = ['1학년', '2학년', '3학년', '4학년', '졸업 유예'];
const START_KINDS = ['공모전', '대외활동', '서포터즈', '학술제'];
const START_GOALS = ['수상 경력', '직무 경험', '팀 프로젝트', '대외 네트워크'];
const START_TOP = 12;
// 지원 직무와 가까운 공고 분야 (직무 경험 목표에 씁니다)
const START_JOB_TAGS = {
  '마케팅': ['마케팅', '콘텐츠'], '영업관리': ['마케팅', '금융'], '전략기획': ['기획', '데이터'], '데이터 분석': ['데이터', '개발', 'AI'],
  '인사': ['기획', '교육'], '재무/회계': ['금융', '데이터'], '개발': ['개발', '데이터', 'AI'], '디자인': ['디자인', '콘텐츠', '영상'],
  '서비스 기획': ['기획', '개발', 'AI'], '콘텐츠 기획': ['콘텐츠', '영상', '글쓰기'], '연구개발': ['과학', '공학', 'AI'], '생산품질': ['공학', '환경'],
  '공공행정': ['정책', 'ESG'], '교육': ['교육', '봉사'], '보건의료': ['보건의료', '봉사']
};
const start_majors = it => Array.isArray(it.majors) ? it.majors : [];
const start_offline = it => !!it.region && !/확인 필요/.test(it.region) && !actOnline(it);
const start_kindIn = (...k) => it => k.includes(it.kind);
// 가산점과 감점 규칙. 공고의 majors(전공 계열 대상)는 우대 +5, 다른 계열만 대상이면 -15. 목표 하나에 +5, 학년과 전공 분야는 +3
// 순서는 매칭 점수 + 가산점으로 정하고, 카드에는 매칭 점수와 가산점을 따로 적습니다 (활동 추천의 점수와 같은 값이 보이도록)
const START_RULES = [
  {label: '전공 우대', pts: 5, rule: '공고가 내 전공 계열을 대상으로 함', on: p => !!p.majorGroup,
    test: (it, p) => start_majors(it).includes(p.majorGroup), why: () => '전공 우대'},
  {label: '다른 전공 대상', pts: -15, rule: '공고가 다른 전공 계열만 대상으로 함', on: p => !!p.majorGroup,
    test: (it, p) => start_majors(it).length > 0 && !start_majors(it).includes(p.majorGroup), why: () => '다른 전공 대상'},
  {label: '전공 분야', pts: 3, rule: '전공 대상이 없는 공고 중 내 계열의 추천 관심 분야와 겹치는 활동', on: p => !!MAJORS[p.majorGroup],
    test: (it, p) => !start_majors(it).length && it.tags.some(t => MAJORS[p.majorGroup].interests.includes(t)), why: () => '전공 분야'},
  {label: '목표 수상 경력', pts: 5, rule: '공모전, 학술제', on: p => p.goals.includes('수상 경력'), test: start_kindIn('공모전', '학술제'), why: () => '수상 목표'},
  {label: '목표 직무 경험', pts: 5, rule: '지원 직무 분야의 대외활동, 서포터즈', on: p => p.goals.includes('직무 경험'), why: () => '직무 경험 목표',
    test: it => ['대외활동', '서포터즈'].includes(it.kind) && (!store.job || it.tags.some(t => (START_JOB_TAGS[store.job] || []).includes(t)))},
  {label: '목표 팀 프로젝트', pts: 5, rule: '팀원 모집글이 있는 활동', on: p => p.goals.includes('팀 프로젝트'), test: it => teamCount(it.id) > 0, why: it => `팀 모집글 ${teamCount(it.id)}개`},
  {label: '목표 대외 네트워크', pts: 5, rule: '오프라인 모임이 있는 활동', on: p => p.goals.includes('대외 네트워크'), test: start_offline, why: () => '대면 모임'},
  {label: '학년', pts: 3, rule: '1, 2학년: 길게 이어 가는 대외활동, 서포터즈', on: p => ['1학년', '2학년'].includes(p.grade), test: start_kindIn('대외활동', '서포터즈'), why: () => '저학년 추천'},
  {label: '학년', pts: 3, rule: '4학년, 졸업 유예: 짧게 결과가 남는 공모전, 학술제', on: p => ['4학년', '졸업 유예'].includes(p.grade), test: start_kindIn('공모전', '학술제'), why: () => '고학년 추천'}
];
function start_prof(){
  if(!store.profile || typeof store.profile !== 'object') store.profile = clone(EMPTY_PROFILE);
  const p = store.profile;
  Object.keys(EMPTY_PROFILE).forEach(k => { if(p[k] === undefined) p[k] = clone(EMPTY_PROFILE[k]); });
  if(p.majorGroup && !MAJORS[p.majorGroup]) p.majorGroup = '';
  return p;
}
// 프로필을 매칭 조건(ui)으로 옮깁니다. 관심 분야를 모두 끈 것도 그대로 반영합니다
function start_sync(){ const p = start_prof(); applyProfile(); ui.interests = new Set(p.interests); }

// ---------- 예시 학생 ----------
const start_personas = () => typeof PERSONAS !== 'undefined' && PERSONAS && Object.keys(PERSONAS).length ? PERSONAS : null;
// 지금 경험창고가 어느 예시 학생 것인지 (내 정보로 시작했으면 null). 경험 id로 판단해, 비운 뒤 남은 store.persona에 속지 않습니다
function start_demoKey(){
  const ids = new Set(store.exps.map(e => e.id)), P = start_personas();
  if(!P) return SEED.some(s => ids.has(s.id)) ? 'demo' : null;
  const hit = k => (P[k].exps || []).some(e => ids.has(e.id));
  return store.persona in P && hit(store.persona) ? store.persona : Object.keys(P).find(hit) || null;
}
const start_label = k => k === 'demo' || !start_personas() ? '경영학과 3학년' : start_personas()[k]?.label || k;

// ---------- 매칭 ----------
function start_rank(){
  const p = start_prof(), rules = START_RULES.filter(r => r.on(p));
  let list = ACTIVITIES.map(it => ({it, ev: evaluate(it)})).filter(x => x.ev.d >= 0);
  if(p.kinds.length) list = list.filter(x => p.kinds.includes(x.it.kind));
  if(p.online) list = list.filter(x => actOnline(x.it));
  list.forEach(x => {
    x.hits = rules.filter(r => r.test(x.it, p));
    x.boost = x.hits.reduce((a, r) => a + r.pts, 0);
    x.total = x.ev.raw + x.boost;
  });
  // 같은 입력이면 늘 같은 순서: 가산점을 더한 점수, 마감 빠른 순, 공고 번호 순
  return list.sort((a, b) => b.total - a.total || a.ev.d - b.ev.d || a.it.id - b.it.id);
}
// 카드 한 줄 근거: 전공 대상 여부, 채우는 부족 역량, 가산점 이유, 주당 시간 (예: 전공 우대, 부족한 고객 채움, 주 4시간)
function start_why(x, gaps){
  const out = [], major = x.hits.find(r => r.label === '전공 우대' || r.label === '다른 전공 대상');
  if(major) out.push(major.why(x.it));
  const fill = x.ev.covered.filter(c => gaps.includes(c));
  if(fill.length) out.push(`부족한 ${fill.join(', ')} 채움`);
  else { const hit = x.it.builds.filter(c => JOBS[store.job]?.[c]); if(hit.length) out.push(`${hit.slice(0, 2).join(', ')} 쌓임`); }
  const other = x.hits.find(r => r !== major);
  if(other && out.length < 3) out.push(other.why(x.it));
  const tagHit = x.it.tags.filter(t => ui.interests.has(t));
  if(out.length < 2 && tagHit.length) out.push(`관심 ${tagHit[0]}`);
  out.push(x.ev.h ? `주 ${x.ev.h}시간` : '주당 부담 확인 필요');
  return out.join(', ');
}
function start_card({it, ev, boost}, why){
  const img = actSafe(it.poster) ? `<img src="${esc(it.poster)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('none');this.remove()">` : '';
  const adj = boost > 0 ? ` <span class="st-boost">가산 +${boost}</span>` : boost < 0 ? ` <span class="st-boost minus">감점 ${-boost}</span>` : '';
  return `<li style="view-transition-name:st-${it.id}"><a class="st-card" href="${link.acts('', it.id)}" data-stcard="${it.id}">
    <span class="st-poster${img ? '' : ' none'}">${img}<span class="st-fb" aria-hidden="true">${esc(it.kind)}</span></span>
    <span class="st-title">${esc(it.title)}</span>
    <span class="st-meta"><span class="st-kind">${esc(it.kind)}</span> ${esc(it.host || '주최 확인 필요')}</span>
    <span class="st-num"><span class="st-score"><span data-n="st-${it.id}">매칭 점수 ${ev.score}</span>${adj}</span><span class="${ev.d <= 7 ? 'st-dd urgent' : 'st-dd'}">D-${ev.d}</span></span>
    <span class="st-why">${esc(why)}</span></a></li>`;
}

// 오른쪽 매칭과 부족 역량 요약만 다시 그립니다 (왼쪽 칸은 그대로 두어 입력 중인 초점이 남습니다)
function start_paintMatch(){
  if(!$('#st-cards')) return;
  const p = start_prof(), list = start_rank(), gaps = gapsFor(store.job).map(g => g.c), n = list.length;
  const basis = [p.majorGroup ? `${p.majorGroup} 계열` : '', store.job ? `${store.job} 지망` : '', p.grade].filter(Boolean).join(' ');
  $('#st-match-h').textContent = `${basis ? basis + ' 기준 ' : '조건 없이 본 '}매칭 ${n}개`;
  $('#st-cards').innerHTML = list.slice(0, START_TOP).map(x => start_card(x, start_why(x, gaps))).join('');
  $('#st-empty').hidden = !!n;
  $('#st-jump').textContent = `매칭 ${n}개 보기`;
  start_paintHave(); start_paintTop(list, n);
  $('#st-gaps').innerHTML = !store.job ? '지원 직무를 고르면 경험창고 기준으로 부족한 역량을 알려 줍니다'
    : gaps.length ? `경험창고 기준 부족한 역량: <b>${esc(gaps.join(', '))}</b> <a class="go" href="#me">경험창고 보기</a>`
    : `${esc(store.job)} 직무가 요구하는 역량은 경험창고에 모두 있습니다 <a class="go" href="#me">경험창고 보기</a>`;
}
// 사용자 정보 입력 1단계: 기존 경험(경험창고 수)과 보유 역량(coverage 보유 2칸 이상, 많은 순 3개)
function start_paintHave(){
  const done = store.exps.filter(e => !e.planned).length, plan = store.exps.length - done;
  const have = coverage(store.job).filter(x => x.have >= 2).sort((a, b) => b.have - a.have || COMP_KEYS.indexOf(a.c) - COMP_KEYS.indexOf(b.c)).slice(0, 3);
  $('#st-have').innerHTML = `<span class="lbl" id="st-have-l">기존 경험과 보유 역량</span>
    <p>${store.exps.length ? `경험창고에 경험 <b>${done}개</b>${plan ? `, 참여 예정 ${plan}개` : ''}` : '경험창고가 비어 있습니다. 경험을 넣으면 보유 역량을 읽어 매칭에 씁니다'}</p>
    ${store.exps.length ? `<p>보유 역량 ${have.length ? have.map(x => `<b>${esc(x.c)}</b>`).join(', ') : '<span class="muted">아직 2칸 이상 쌓인 역량이 없습니다</span>'}</p>` : ''}
    <div class="st-have-act"><button type="button" class="btn ghost sm" data-stadd>경험 추가</button><button type="button" class="btn ghost sm" data-stimport>Notion에서 붙여넣기</button><a class="go" href="#me">경험창고 보기</a></div>`;
}
// 맨 위 요약 한 줄, 포스터 모자이크(펼쳐지는 층), 포스터 띠(가운데가 커지는 띠). 움직임 스위치가 꺼져 있으면 CSS가 모자이크와 띠를 숨깁니다
function start_paintTop(list, n){
  const demo = start_demoKey(), p = start_prof();
  $('#st-hero-sum').textContent = `${demo ? `예시 학생 ${start_label(demo)}` : '내 정보'}. 기존 경험 ${store.exps.length}개, 목표 직무 ${store.job || '미정'}${p.majorGroup ? ` (${p.majorGroup} 계열)` : ''}. 열린 활동 ${n}개를 매칭 점수순으로 보여줍니다`;
  const pics = list.filter(x => actSafe(x.it.poster)).slice(0, 8);
  $('#st-mosaic').innerHTML = pics.map(x => `<img src="${esc(x.it.poster)}" alt="" loading="lazy" onerror="this.remove()">`).join('');
  $('#st-strip').innerHTML = pics.map((x, i) => `<li><a class="st-strip-i" href="${link.acts('', x.it.id)}" data-stcard="${x.it.id}" aria-label="${i + 1}위 ${esc(x.it.title)}, 매칭 점수 ${x.ev.score}"><img src="${esc(x.it.poster)}" alt="" loading="lazy" onerror="this.closest('li').remove()"></a></li>`).join('');
}
// 답이 바뀌면 저장하고 매칭을 자리 이동과 함께 다시 그립니다. 점수 굴리기(countUp)는 한 번 그릴 때 한 번만 부릅니다 (paint도 부르므로 start_paintMatch 안에서는 부르지 않습니다)
function start_answer(){ save(); start_sync(); start_syncLeft(); morph(() => { start_paintMatch(); renderNext(); nameThumbs(); countUp(); }); }
let start_t;
const start_answerSoon = () => { clearTimeout(start_t); start_t = setTimeout(start_answer, 180); };

// ---------- 왼쪽: 전공 계열에 따라 바뀌는 칸 ----------
// 관심 분야 묶음: 계열과 가장 많이 겹치는 묶음과 고른 관심이 있는 묶음만 펼치고, 나머지는 고른 칩과 +N으로 접어 둡니다
let start_open = new Set();
function start_mainGroup(g){
  const want = MAJORS[g]?.interests || [];
  let best = null, n = 0;
  Object.entries(INTEREST_GROUPS).forEach(([name, list]) => { const k = list.filter(t => want.includes(t)).length; if(k > n){ n = k; best = name; } });
  return best;
}
function start_resetOpen(){
  const p = start_prof(), main = start_mainGroup(p.majorGroup);
  start_open = new Set([main, ...Object.keys(INTEREST_GROUPS).filter(name => INTEREST_GROUPS[name].some(t => p.interests.includes(t)))].filter(Boolean));
  if(!start_open.size) start_open.add(Object.keys(INTEREST_GROUPS)[0]);
}
const start_chip = (key, v, on) => `<button type="button" class="chip" data-${key}="${esc(v)}" aria-pressed="${on}">${esc(v)}</button>`;
function start_ints(){
  const p = start_prof();
  return Object.entries(INTEREST_GROUPS).map(([name, list], i) => {
    const open = start_open.has(name), shown = open ? list : list.filter(t => p.interests.includes(t)), more = list.length - shown.length;
    return `<div class="st-ig${open ? '' : ' closed'}"><span class="st-igh" id="st-ig-${i}">${esc(name)}</span><div class="chips" role="group" aria-labelledby="st-ig-${i}">
      ${shown.map(t => start_chip('stint', t, p.interests.includes(t))).join('')}${more ? `<button type="button" class="linkbtn st-more" data-stmore="${esc(name)}" aria-expanded="false" aria-label="+${more}, ${esc(name)} 더 보기">+${more}</button>` : ''}</div></div>`;
  }).join('');
}
function start_paintMajor(){
  const p = start_prof(), m = MAJORS[p.majorGroup];
  $('#st-majors').innerHTML = (m ? m.ex : Object.values(MAJORS).flatMap(x => x.ex)).map(x => `<option value="${esc(x)}">`).join('');
  $('#st-jobpicks').innerHTML = m ? `<span class="st-pickh" id="st-jp-l">${esc(p.majorGroup)} 추천 직무</span><div class="chips" role="group" aria-labelledby="st-jp-l">${m.jobs.filter(j => JOBS[j]).map(j => start_chip('stjob', j, store.job === j)).join('')}</div>` : '';
  start_paintApply(); $('#st-ints').innerHTML = start_ints();
}

// 눌림 상태와 숫자를 제자리에서 맞춥니다 (버튼을 새로 만들지 않습니다)
function start_syncLeft(){
  const p = start_prof(), demo = start_demoKey(), set = (sel, on) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(on(b))));
  set('[data-stwho]', b => b.dataset.stwho === 'me' ? !demo : b.dataset.stwho === demo);
  set('[data-stgroup]', b => p.majorGroup === b.dataset.stgroup);
  set('[data-stgrade]', b => p.grade === b.dataset.stgrade);
  set('[data-stint]', b => p.interests.includes(b.dataset.stint));
  set('[data-stjob]', b => store.job === b.dataset.stjob);
  set('[data-stkind]', b => p.kinds.includes(b.dataset.stkind));
  set('[data-stgoal]', b => p.goals.includes(b.dataset.stgoal));
  $('#st-job').value = store.job || '';
  $('#st-hours-out').textContent = `주 ${p.hours}시간`;
  $('#st-kind-note').textContent = p.kinds.length ? `${p.kinds.join(', ')}만 봅니다` : '고르지 않으면 모두 봅니다';
}

function renderStart(){
  start_sync(); start_resetOpen();
  const p = start_prof(), demo = start_demoKey(), P = start_personas();
  const chips = (key, list, on) => list.map(v => start_chip(key, v, on(v))).join('');
  // 예시 학생 이름은 '전공 학년, 직무 지망'을 두 줄로 나눠 보여줍니다
  const two = l => { const [x, ...y] = String(l).split(', '); return `<span>${esc(x)}</span>${y.length ? `<small>${esc(y.join(', '))}</small>` : ''}`; };
  const who = P ? Object.keys(P).map(k => `<button type="button" data-stwho="${esc(k)}" aria-pressed="${demo === k}">${two(P[k].label || k)}</button>`).join('')
    : `<button type="button" data-stwho="demo" aria-pressed="${!!demo}">예시 학생으로 보기</button>`;
  $('#view-start').innerHTML = `
  <div class="st-hero" id="st-hero">
    <div class="st-mosaic" aria-hidden="true"><div class="st-mosaic-in" id="st-mosaic"></div></div>
    <div class="st-hero-t"><div class="view-h"><h1>나에게 맞는 활동 찾기</h1><p>틈은 대학생 커리어 매칭 시스템입니다. 나를 알려 주면 오른쪽 매칭이 바로 바뀝니다</p></div>
    <p class="st-hero-sum" id="st-hero-sum"></p></div>
  </div>
  <div class="st">
    <div class="st-q" aria-label="나를 알려 주기" role="region">
      ${P ? '<span class="lbl" id="st-who-l">예시 학생으로 보기</span>' : ''}
      <div class="seg st-who${P ? ' many' : ''}" id="st-who" role="group" ${P ? 'aria-labelledby="st-who-l"' : 'aria-label="누구의 정보로 볼까요"'}>
        ${who}<button type="button" data-stwho="me" aria-pressed="${!demo}">${P ? '<span>내 정보로 시작</span><small>예시 비우기</small>' : '내 정보로 시작'}</button>
      </div>
      <p class="muted st-who-note">${demo ? `${esc(start_label(demo))} 예시 학생의 경험창고로 매칭을 보여줍니다` : '내 경험창고로 매칭합니다. 모든 질문은 건너뛰어도 됩니다'}</p>
      <div class="field st-have" id="st-have" role="group" aria-labelledby="st-have-l"></div>
      <div class="field"><label for="st-job">목표 직무</label>
        <select id="st-job"><option value="">고르지 않음</option>${Object.keys(JOBS).map(j => `<option ${store.job === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select>
        <div class="st-jobpicks" id="st-jobpicks"></div></div>
      <div class="field"><span class="lbl" id="st-grade-l">학년</span>
        <div class="seg st-grade" id="st-grade" role="group" aria-labelledby="st-grade-l">${START_GRADES.map(g => `<button type="button" data-stgrade="${g}" aria-pressed="${p.grade === g}">${g}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl" id="st-group-l">전공 계열</span>
        <div class="chips" role="group" aria-labelledby="st-group-l">${chips('stgroup', Object.keys(MAJORS), v => p.majorGroup === v)}</div>
        <label class="st-sublbl" for="st-major">전공</label>
        <input id="st-major" list="st-majors" value="${esc(p.major)}" placeholder="예: 경영학과" autocomplete="off"><datalist id="st-majors"></datalist></div>
      <div class="field"><span class="lbl">관심 분야</span>
        <div id="st-ints"></div><p class="st-apply" id="st-apply"></p></div>
      <div class="field"><span class="lbl" id="st-kind-l">원하는 활동 종류</span>
        <div class="chips" role="group" aria-labelledby="st-kind-l">${chips('stkind', START_KINDS, v => p.kinds.includes(v))}</div>
        <p class="muted st-sub" id="st-kind-note"></p></div>
      <div class="field"><label for="st-hours">주당 쓸 수 있는 시간</label>
        <div class="range-row"><input id="st-hours" type="range" min="2" max="20" step="1" value="${p.hours}"><output id="st-hours-out" for="st-hours">주 ${p.hours}시간</output></div></div>
      <div class="field"><label class="toggle"><input type="checkbox" id="st-online" ${p.online ? 'checked' : ''}> 온라인으로 할 수 있는 활동만</label></div>
      <div class="field"><span class="lbl" id="st-goal-l">목표</span>
        <div class="chips" role="group" aria-labelledby="st-goal-l">${chips('stgoal', START_GOALS, v => p.goals.includes(v))}</div></div>
      <p class="st-gaps" id="st-gaps"></p>
      <div class="st-end">
        <div class="st-acts"><button type="button" class="btn" data-stgo="match">이 조건으로 매칭 보기</button><button type="button" class="btn ghost" data-stgo="skip">건너뛰고 둘러보기</button></div>
        <p class="muted">모든 조건은 나중에 위쪽 메뉴의 내 조건에서 바꿀 수 있습니다</p>
      </div>
    </div>
    <section class="st-match" id="st-match" aria-labelledby="st-match-h">
      <div class="st-mh"><h2 id="st-match-h"></h2><a class="go" href="#activities">전체 매칭 보기</a></div>
      <details class="st-rules"><summary>매칭 점수 계산 방법</summary>
        <p>활동 추천과 같은 식(직무 적합 50, 관심 분야 10, 일정 15, 시간 부담 15, 마감 여유 10)으로 매칭 점수를 내고, 아래 가산점과 감점을 더한 값으로 줄을 세웁니다. 마감이 지난 활동은 뺍니다</p>
        <ul>${START_RULES.map(r => `<li><b class="${r.pts < 0 ? 'minus' : ''}">${esc(r.label)} ${r.pts > 0 ? '+' : ''}${r.pts}</b> ${esc(r.rule)}</li>`).join('')}</ul></details>
      <ul class="st-strip" id="st-strip" aria-label="매칭 상위 8개 포스터"></ul>
      <ol class="st-cards" id="st-cards"></ol>
      <p class="st-empty" id="st-empty" hidden>조건에 맞는 열린 활동이 없습니다. <button type="button" class="linkbtn" data-streset>종류와 온라인 조건 풀기</button></p>
    </section>
  </div>
  <div class="st-bar" id="st-bar"><button type="button" class="btn ghost block" id="st-jump"></button></div>`;
  start_paintMajor(); start_syncLeft(); start_paintMatch(); start_watchBar();
}
// 좁은 화면: 매칭 칸이 보이면 아래 바를 숨깁니다
let start_io;
function start_watchBar(){
  start_io?.disconnect();
  if(!('IntersectionObserver' in window)) return;
  start_io = new IntersectionObserver(es => { const bar = $('#st-bar'); if(bar) bar.classList.toggle('off', es[0].isIntersecting); });
  start_io.observe($('#st-cards'));
}
// 다시 그린 뒤 새로 생긴 요소로 초점을 옮깁니다 (View Transition은 다음 프레임에 화면을 바꾸므로 새 요소가 나올 때까지 몇 프레임 기다립니다)
function start_focus(sel){
  const old = document.querySelector(sel); let n = 20;
  const step = () => { const el = document.querySelector(sel); if(el && (el !== old || n < 10)) return el.focus(); if(n--) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

on('click', e => {
  if(ui.view !== 'start') return;
  if(e.target.closest('a[data-stcard]')){ markStartSeen(); return true; }
  const b = e.target.closest('button'); if(!b || !b.closest('#view-start')) return;
  const d = b.dataset, p = start_prof();
  const flip = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  if(d.stwho){
    const cur = start_demoKey();
    if(d.stwho === 'me'){ if(cur) startBlank().then(ok => start_focus(`[data-stwho="${ok ? 'me' : cur}"]`)); return true; }
    if(cur === d.stwho) return true;
    startDemo(d.stwho === 'demo' ? undefined : d.stwho); start_focus(`[data-stwho="${d.stwho}"]`); return true;
  }
  if(d.stadd !== undefined){ openDrawer(); return true; }
  if(d.stimport !== undefined){ $('#import').click(); return true; }
  if(d.stgroup){
    p.majorGroup = p.majorGroup === d.stgroup ? '' : d.stgroup;
    // 관심 분야가 비어 있으면 계열의 추천 관심 분야로 채웁니다 (있으면 '전공 추천 관심 분야 적용'으로 고르게 둡니다)
    if(p.majorGroup && !p.interests.length) p.interests = [...MAJORS[p.majorGroup].interests];
    start_resetOpen(); start_paintMajor(); start_answer(); return true;
  }
  if(d.stapply !== undefined){
    p.interests = [...new Set([...p.interests, ...MAJORS[p.majorGroup].interests])];
    start_resetOpen(); start_paintMajor(); start_answer(); start_focus('#st-ints [data-stint]'); return true;
  }
  if(d.stmore){
    const name = d.stmore, first = INTEREST_GROUPS[name].find(t => !p.interests.includes(t));
    start_open.add(name); $('#st-ints').innerHTML = start_ints();
    document.querySelector(`#st-ints [data-stint="${CSS.escape(first)}"]`)?.focus(); return true;
  }
  if(d.stjob){ start_setJob(store.job === d.stjob ? '' : d.stjob); return true; }
  if(d.stgrade){ p.grade = p.grade === d.stgrade ? '' : d.stgrade; start_answer(); return true; }
  if(d.stint){ p.interests = flip(p.interests, d.stint); start_answer(); start_paintApply(); return true; }
  if(d.stkind){ p.kinds = flip(p.kinds, d.stkind); start_answer(); return true; }
  if(d.stgoal){ p.goals = flip(p.goals, d.stgoal); start_answer(); return true; }
  if(d.streset !== undefined){ p.kinds = []; p.online = false; $('#st-online').checked = false; start_answer(); return true; }
  if(b.id === 'st-jump'){ $('#st-match').scrollIntoView({behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start'}); start_focus('#st-match-h'); return true; }
  if(d.stgo){ if(d.stgo === 'match'){ p.done = true; save(); } markStartSeen(); go('#activities'); return true; }
});
// 관심 칩을 누르면 '전공 추천 관심 분야 적용' 줄만 다시 맞춥니다 (칩 묶음은 그대로 두어 초점이 남습니다)
function start_paintApply(){
  const p = start_prof(), m = MAJORS[p.majorGroup], missing = m ? m.interests.filter(t => !p.interests.includes(t)) : [];
  $('#st-apply').innerHTML = !(m && p.interests.length && missing.length) ? '' : `<button type="button" class="linkbtn" data-stapply>전공 추천 관심 분야 적용</button> <span class="muted">${esc(missing.join(', '))} 더하기</span>`;
}
function start_setJob(j){
  store.job = j; fillJobSelect();
  ui.fill = new Set(gapsFor(store.job).map(g => g.c));
  start_answer();
}
on('input', e => {
  const t = e.target, p = start_prof();
  if(t.id === 'st-major'){ p.major = t.value.trim(); start_answerSoon(); return true; }
  if(t.id === 'st-hours'){ p.hours = +t.value; $('#st-hours-out').textContent = `주 ${p.hours}시간`; start_answerSoon(); return true; }
});
on('change', e => {
  const t = e.target, p = start_prof();
  if(t.id === 'st-major' || t.id === 'st-hours') return true;
  if(t.id === 'st-online'){ p.online = t.checked; start_answer(); return true; }
  if(t.id === 'st-job'){ start_setJob(t.value); return true; }
});
