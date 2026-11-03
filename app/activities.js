// 경험 탐색(활동 추천): 활동 종류마다 슬라이드의 세 항목으로 개인별 적합도를 매기고 추천 근거를 함께 보여줍니다. 모든 점수는 규칙으로 계산합니다

// 공고 포스터와 원문 주소. 비어 있거나 http(s), assets/ 가 아니면 그리지 않고, 이미지를 못 불러오면 그 자리를 지웁니다
const actSafe = u => /^(https?:\/\/|assets\/)/.test(u || '') ? u : '';
const actThumb = it => actSafe(it.poster) ? `<img class="p-thumb" src="${esc(it.poster)}" alt="" loading="lazy" onerror="this.remove()">` : '';
const actSrc = it => actSafe(it.url) ? `<a class="go" href="${esc(it.url)}" target="_blank" rel="noopener">공고 원문 보기</a>` : '';
// 출처: 공고에 source가 있으면 그것을, 없으면 원문 주소의 사이트 이름을 씁니다
const ACT_SITES = {wevity: '위비티', linkareer: '링커리어', campuspick: '캠퍼스픽', allcon: '올콘', thinkcontest: '씽굿', contestkorea: '공모전코리아', 'blog.naver': '네이버 블로그'};
const actSite = k => ACT_SITES[Object.keys(ACT_SITES).find(x => k.includes(x))] || k;
function actSource(it){
  if(it.source) return actSite(String(it.source).toLowerCase());
  try{ return actSite(new URL(it.url).hostname.replace(/^www\./, '')); }catch(e){ return ''; }
}
const actChecked = it => it.checked ? md(it.checked) : `${String(ACT_TODAY.getMonth() + 1).padStart(2, '0')}/${String(ACT_TODAY.getDate()).padStart(2, '0')}`;

// 스크래퍼 공고(FEED)는 칸이 빠질 수 있어 목록 칸은 빈 목록으로 채웁니다. 주당 부담을 모르면 비워 두고 '확인 필요'로 보여줍니다
ACTIVITIES.forEach(a => { a.tags = a.tags || []; a.builds = a.builds || []; a.slots = a.slots || []; });
const actHours = it => +it.hours > 0 ? +it.hours : null;
const actUnk = v => v == null || String(v).trim() === '' || String(v).includes('확인 필요');
// 공고 원문에서 확인하지 못한 값은 흐린 글자로 (빈 값이면 '확인 필요')
const actVal = v => actUnk(v) ? `<span class="unk">${esc(String(v ?? '').trim() || '확인 필요')}</span>` : esc(v);
const actHoursText = it => actHours(it) ? `주 ${actHours(it)}시간` : `<span class="unk">주당 부담 확인 필요</span>`;
const ACT_EST = '<small class="est">틈 추정</small>';
// 종류 탭: 데이터에 있는 종류를 정해진 순서로, 지금 열린 공고가 없는 종류는 숨깁니다
const ACT_KINDS = ['공모전', '대외활동', '서포터즈', '학술제'];
function actKinds(){
  const open = ACTIVITIES.filter(a => actDday(a.deadline) >= 0).map(a => a.kind);
  return ['전체', ...ACT_KINDS.filter(k => open.includes(k)), ...[...new Set(open)].filter(k => k && !ACT_KINDS.includes(k))];
}
// 목록은 20개씩. 조건이 바뀌면 다시 20개부터, 고른 활동이 뒤쪽에 있으면 거기까지 펼칩니다
const ACT_PAGE = 20;
let actShown = ACT_PAGE, actKey = '', actDetailKey = '';
// 검색어와 온라인만은 이 화면에서만 씁니다
ui.actQ = ''; ui.actMajor = false;
// ---------- 내 조건(#start, store.profile)과 한 곳에서 맞춥니다 ----------
// 온라인만은 store.profile.online 하나를 읽고 씁니다. 관심 분야와 주당 시간은 프로필이 바뀌었을 때만 ui로 옮기고, 왼쪽 조건에서 바꾸면 프로필에 다시 씁니다
const actProf = () => (store.profile = store.profile || {});
const actOnlineOn = () => !!actProf().online;
// 프로필의 활동 종류 중 지금 열린 공고가 있는 것
const actProfKinds = () => { const open = actKinds(); return (actProf().kinds || []).filter(k => k !== '전체' && open.includes(k)); };
let actProfSeen = '', actKindsSeen = '';
function actSyncProfile(){
  const p = actProf();
  const k1 = JSON.stringify([p.interests || [], p.hours || 0]);
  if(k1 !== actProfSeen){ actProfSeen = k1; if(p.interests?.length) ui.interests = new Set(p.interests); if(+p.hours) ui.hours = +p.hours; }
  // 종류는 프로필에서 바뀌었을 때만 탭에 반영합니다 (그 뒤 탭을 누른 선택은 그대로 둡니다). 하나면 그 탭, 여럿이면 전체(= 고른 종류들)
  const pk = actProfKinds(), k2 = pk.join(',');
  // 단, 주소로 들어온 활동(?id=)이 다른 종류면 그 활동이 보이도록 전체로 둡니다
  if(k2 !== actKindsSeen){ actKindsSeen = k2; const sel = actById(ui.selected); ui.kind = pk.length === 1 && (!sel || sel.kind === pk[0]) ? pk[0] : '전체'; }
}
function actWriteProfile(){
  const p = actProf(); p.interests = [...ui.interests]; p.hours = ui.hours; save();
  actProfSeen = JSON.stringify([p.interests, p.hours]);
}
const actOnline = it => /온라인/.test(it.region || '') && !/오프라인/.test(it.region || '');
const actSaved = () => (store.saved = Array.isArray(store.saved) ? store.saved : []);

const fmtH = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return mm ? `${hh}:${String(mm).padStart(2,'0')}` : `${hh}시`; };

function overlap(slot){
  return BUSY.filter(b => b.d === slot.d && b.s < slot.e && b.e > slot.s)
    .map(b => ({b, len: Math.min(b.e, slot.e) - Math.max(b.s, slot.s)}));
}
const freeHours = () => (END - START) * 7 - BUSY.reduce((a, b) => a + (b.e - b.s), 0);
// 두 사람이 함께 비는 시간 (30분 단위)
function commonFree(busyA, busyB){
  let n = 0;
  for(let d = 0; d < 7; d++) for(let t = START; t < END; t += .5){
    const hit = arr => arr.some(b => b.d === d && b.s <= t && b.e > t);
    if(!hit(busyA) && !hit(busyB)) n += .5;
  }
  return n;
}

// ---------- 개인별 적합도 ----------
// 팀 아키텍처 슬라이드의 '경험 탐색' 두 갈래를 그대로 따릅니다. 활동 종류마다 다른 세 항목으로 매깁니다
//   대외활동, 서포터즈 (경험을 쌓는 활동): 직무 관련성, 학습 기회, 활동 조건
//   공모전, 학술제, 해커톤 (실력을 겨루는 활동): 주제 적합성, 보유 역량, 팀 구성
// 규칙만으로 계산하고 같은 입력이면 늘 같은 순서가 나옵니다. 식은 상세의 '적합도 계산 방법'에 그대로 적어 둡니다
const fmtLack = v => (Math.round(v * 10) / 10).toString();
// 역량 지도는 한 번 그리는 동안(같은 작업 안) 한 번만 계산해 공고 200개를 평가해도 빠르게 합니다
let actCovMemo = null;
function actCoverage(){
  if(actCovMemo && actCovMemo.job === store.job) return actCovMemo.cov;
  actCovMemo = {job: store.job, cov: coverage(store.job)}; queueMicrotask(() => { actCovMemo = null; });
  return actCovMemo.cov;
}
const ACT_CONTEST = /공모전|학술제|해커톤|경진대회/;
const actFamily = it => ACT_CONTEST.test(it.kind || '') || /해커톤/.test([it.title, ...it.tags].join(' ')) ? 'contest' : 'explore';
// 항목별 만점 (각 갈래 합 100). 관심 분야 중심으로 바꾸면 관심 분야를 쓰는 항목의 무게가 커집니다
const WF = {
  explore: {fit: {rel: 40, learn: 35, cond: 25}, interest: {rel: 40, learn: 30, cond: 30}},
  contest: {fit: {topic: 35, strong: 40, team: 25}, interest: {topic: 55, strong: 25, team: 20}}
};
// 학습 기회: 고른 역량(보통 빈 역량)마다 모자란 칸 수(최소 1/3칸)를 무게로 두고, 이 활동이 쌓는 역량의 무게 합 / 전체 무게 합
// 고른 역량이 없으면 직무가 요구하는 역량을 요구 수준(1~3)으로 무게를 둡니다
function actGapFill(it){
  const job = store.job, jw = job ? JOBS[job] : {}, cov = actCoverage();
  const lackOf = c => cov.find(x => x.c === c)?.lack || 0;
  const target = ui.fill.size ? [...ui.fill].map(c => ({c, wt: Math.max(lackOf(c), 1 / 3), lack: lackOf(c)})) : COMP_KEYS.filter(c => jw[c]).map(c => ({c, wt: jw[c] / 3, lack: lackOf(c)}));
  const total = target.reduce((a, t) => a + t.wt, 0);
  const hitT = target.filter(t => it.builds.includes(t.c)).sort((a, b) => b.wt - a.wt);
  return {share: total ? hitT.reduce((a, t) => a + t.wt, 0) / total : null, hitT, covered: ui.fill.size ? hitT.map(t => t.c) : []};
}
// 직무 관련성: 이 활동이 쌓는 역량의 직무 요구 수준 합 / 같은 개수로 고를 수 있는 가장 높은 요구 수준 합
function actJobRel(it){
  const job = store.job, jw = job ? JOBS[job] : null;
  if(!jw || !it.builds.length) return null;
  const req = Object.values(jw).sort((a, b) => b - a), best = req.slice(0, Math.min(it.builds.length, req.length)).reduce((a, b) => a + b, 0);
  const got = it.builds.reduce((a, c) => a + (jw[c] || 0), 0);
  return {v: best ? Math.min(1, got / best) : 0, hits: it.builds.filter(c => jw[c]).sort((a, b) => jw[b] - jw[a])};
}
// 보유 역량: 이 공모전이 쓰는 역량마다 내 경험창고 보유 수준(0~3) / 2를 1까지, 그 평균. 빈 역량 채우기의 반대로, 이미 강한 역량을 살리는 대회일수록 높습니다
function actStrong(it){
  if(!it.builds.length) return null;
  const cov = actCoverage(), lv = c => cov.find(x => x.c === c)?.have || 0;
  return {v: it.builds.reduce((a, c) => a + Math.min(1, lv(c) / 2), 0) / it.builds.length, lv, strong: it.builds.filter(c => lv(c) >= 2)};
}
// 팀 구성: 개인 참가 가능하거나 내 팀이 있으면 1, 팀 참가만 되면 이 활동 팀원 모집글 수로 (0개 0.3, 1개 0.8, 2개 이상 1), 정보가 없으면 중립
function actTeam(it){
  const t = String(it.team || ''), posts = teamCount(it.id);
  if(typeof hasTeam === 'function' && hasTeam(it.id)) return {v: 1, why: '내 모집글이나 지원한 팀이 있음', short: '내 팀 있음'};
  if(/개인|규정 없음|제한 없음/.test(t)) return {v: 1, why: `개인으로도 참가할 수 있음 (${t})`, short: '개인 참가 가능'};
  if(/팀|\d\s*인|명/.test(t)) return posts ? {v: Math.min(1, .6 + posts * .2), why: `팀으로 참가, 이 활동 팀원 모집글 ${posts}개`, short: `팀원 모집글 ${posts}개`}
    : {v: .3, why: `팀으로 참가하는데 아직 팀원 모집글이 없음 (${t})`, short: ''};
  return null;
}
// 활동 조건: 아는 조건들의 평균. 주당 시간(설정 시간 안이면 1), 일정(캘린더 연결 시 고정 일정 겹침), 온라인(내 조건이 온라인만일 때), 마감 여유(2주 이상 1, 최소 0.3)
function actCond(it){
  const h = actHours(it), d = actDday(it.deadline), free = freeHours(), subs = [], why = [], short = [];
  let clashes = [];
  if(h){ subs.push(Math.min(1, ui.hours / h)); why.push(h <= ui.hours ? `주 ${h}시간은 설정한 ${ui.hours}시간 안` : `주 ${h}시간, 설정보다 ${h - ui.hours}시간 많음`); if(h <= ui.hours) short.push(`주 ${h}시간 맞음`); }
  else why.push('주당 부담 확인 필요');
  if(ui.connected && it.slots.length){
    clashes = it.slots.flatMap(s => overlap(s).map(o => ({slot: s, ...o})));
    const slotH = it.slots.reduce((a, s) => a + (s.e - s.s), 0), clashH = clashes.reduce((a, c) => a + c.len, 0);
    subs.push(slotH ? Math.max(0, 1 - clashH / slotH) : 1);
    why.push(clashes.length ? `고정 일정 ${clashH % 1 ? clashH.toFixed(1) : clashH}시간 겹침` : '고정 일정 모두 빈 시간');
  } else if(ui.connected && h && h > free){ subs.push(0); why.push(`캘린더 빈 시간 ${free}시간보다 많음`); }
  if(actOnlineOn()){ const on = actOnline(it); subs.push(on ? 1 : 0); why.push(on ? '온라인 진행' : `온라인 아님 (${it.region || '지역 미상'})`); }
  subs.push(d >= 14 ? 1 : Math.max(.3, d / 14)); why.push(`D-${d}`); short.push(`D-${d}`);
  return {v: subs.reduce((a, b) => a + b, 0) / subs.length, why: why.join(', '), short: short.join(', '), clashes, h, d};
}
// 전공: 공고가 대상 전공 계열(it.majors)을 밝힌 경우에만 더하거나 뺍니다. 내 계열이 들어 있으면 +5, 다른 계열만 대상이면 -15
const MAJOR_ADJ = {match: 5, other: -15};
const actMajorGroup = () => (store.profile || {}).majorGroup || '';
function actMajor(it){
  const ms = Array.isArray(it.majors) ? it.majors.filter(Boolean) : [], g = actMajorGroup();
  if(!ms.length) return null;
  if(!g) return {adj: 0, why: `대상 전공: ${ms.join(', ')} (내 전공 계열 미입력)`, short: ''};
  return ms.includes(g) ? {adj: MAJOR_ADJ.match, why: `전공 우대: ${g} 대상 공고`, short: '전공 우대'}
    : {adj: MAJOR_ADJ.other, why: `다른 전공 대상: ${ms.join(', ')}`, short: '다른 전공 대상'};
}
// 개인별 적합도 = 아는 항목 점수의 합 / 아는 항목 만점의 합 x 100, 전공 조정값을 더해 0~99로 자릅니다
// 알 수 없는 항목은 상수로 채우지 않고 계산에서 뺍니다. 화면에는 '중립'으로, 아는 항목의 평균 비율만큼 채운 막대로 보여줘서 항목 점수를 더하면 적합도가 됩니다
function evaluate(it){
  const fam = actFamily(it), w = WF[fam][ui.mode] || WF[fam].fit, job = store.job;
  const gap = actGapFill(it), cond = actCond(it), d = cond.d, h = cond.h;
  const hit = it.tags.filter(t => ui.interests.has(t)), titleHit = INTERESTS.some(t => ui.interests.has(t) && (it.title || '').includes(t));
  const interest = it.tags.length ? hit.length / it.tags.length : null;
  let parts;
  if(fam === 'explore'){
    const jr = actJobRel(it);
    // 관심 분야 중심이면 직무 관련성에 관심 분야 일치를 반씩 섞습니다
    const relV = jr ? (ui.mode === 'interest' && interest !== null ? (jr.v + interest) / 2 : jr.v) : (ui.mode === 'interest' ? interest : null);
    const relWhy = !job ? '지원 직무 미선택' : !it.builds.length ? '쌓이는 역량 확인 필요'
      : jr.hits.length ? `${job}이 요구하는 ${jr.hits.map(c => `${c}(${JOBS[job][c]})`).join(', ')}${josa(jr.hits.at(-1), '을', '를')} 쌓음, 요구 수준의 ${Math.round(jr.v * 100)}%` : `${job}이 요구하는 역량은 쌓이지 않음`;
    const lw = gap.hitT;
    parts = [
      {k: 'rel', name: '직무 관련성', max: w.rel, v: relV, why: relWhy + (ui.mode === 'interest' ? (hit.length ? `. 관심 분야 ${hit.join(', ')} 일치 반영` : '. 관심 분야 일치 없음') : ''), short: jr && jr.hits.length ? `직무 관련 ${jr.hits.slice(0, 2).join(', ')}` : ''},
      {k: 'learn', name: '학습 기회', max: w.learn, v: it.builds.length ? gap.share : null,
        why: !it.builds.length ? '쌓이는 역량 확인 필요' : lw.length ? `${ui.fill.size ? '채우려는 역량 중 ' : ''}${lw.map(t => `${t.c}(${t.lack > 0 ? `${fmtLack(t.lack)}칸 부족` : '충분'})`).join(', ')}${josa(lw.at(-1).c, '을', '를')} 채움, 빈 역량 무게의 ${Math.round((gap.share || 0) * 100)}%` : '채우려는 역량을 쌓지 않음',
        short: gap.covered.length ? `${gap.covered.join(', ')} 채움` : ''},
      {k: 'cond', name: '활동 조건', max: w.cond, v: cond.v, why: cond.why, short: cond.short}
    ];
  } else {
    const st = actStrong(it), tm = actTeam(it);
    const topicV = interest === null ? (titleHit ? 1 : null) : Math.min(1, interest + (titleHit ? .25 : 0));
    parts = [
      {k: 'topic', name: '주제 적합성', max: w.topic, v: topicV, why: hit.length ? `관심 분야 ${hit.join(', ')} 일치${titleHit ? ', 제목에도 관심 분야가 있음' : ''}` : titleHit ? '제목에 관심 분야가 있음' : it.tags.length ? `관심 분야와 겹치지 않음 (${it.tags.join(', ')})` : '분야 정보 없음', short: hit.length ? `관심 ${hit.join(', ')}` : ''},
      {k: 'strong', name: '보유 역량', max: w.strong, v: st ? st.v : null, why: !st ? '쓰이는 역량 확인 필요' : `이 대회에 쓰이는 ${it.builds.map(c => `${c}(보유 ${fmtLack(st.lv(c))})`).join(', ')}${st.strong.length ? `, 강점 ${st.strong.join(', ')}` : ', 아직 강점 없음'}`, short: st && st.strong.length ? `강점 ${st.strong.join(', ')}` : ''},
      {k: 'team', name: '팀 구성', max: w.team, v: tm ? tm.v : null, why: tm ? tm.why : '팀 구성 정보 없음', short: tm ? tm.short : ''}
    ];
  }
  const known = parts.filter(p => p.v !== null && p.v !== undefined), kmax = known.reduce((a, p) => a + p.max, 0) || 1;
  const rate = known.reduce((a, p) => a + p.v * p.max, 0) / kmax;
  parts.forEach(p => { p.neutral = p.v === null || p.v === undefined; p.pts = Math.round((p.neutral ? rate : p.v) * p.max); });
  // 전공은 비율이 아니라 더하고 빼는 조정값이라 환산 뒤에 붙입니다 (막대 없이 +5 / -15로 표시)
  const mj = actMajor(it);
  if(mj) parts.push({k: 'major', name: '전공', adj: true, max: 0, v: mj.adj, pts: mj.adj, neutral: false, why: mj.why, short: mj.short});
  const adj = mj ? mj.adj : 0;
  const score = Math.max(0, Math.min(99, parts.reduce((a, p) => a + p.pts, 0)));
  // raw: 정렬에 쓰는 반올림 전 점수
  return {fam, w, covered: gap.covered, share: gap.share, interest, schedule: null, loadKnown: !!h, raw: rate * 100 + adj, score, clashes: cond.clashes, d, h, parts, major: mj};
}
// 목록 한 줄 근거: 아는 항목 중 점수가 난 것만 (예: 고객, 도전 채움 +35, 주 6시간 맞음 +20, D-24 +10)
const actReason = ev => ev.parts.filter(p => !p.neutral && p.pts !== 0 && p.short).map((p, i, l) => `<span class="${p.pts < 0 ? 'neg' : ''}">${esc(p.short)} ${p.pts > 0 ? '+' : ''}${p.pts}${i < l.length - 1 ? ',' : ''}</span>`).join(' ');
// 이번 주 = 오늘부터 이번 주 일요일까지
const actWeekLeft = () => (7 - ACT_TODAY.getDay()) % 7;

// ---------- 왼쪽: 내 조건 ----------
function renderConditions(){
  const cov = coverage(store.job);
  $('#gaps').innerHTML = COMP_KEYS.map(c => {
    const x = cov.find(v => v.c === c);
    // 고른 칩은 남색 바탕이라 '부족'을 같은 흰 글자로 이어 씁니다 (따로 떼면 고정된 조건 칸 안에서 대비 검사가 바탕을 잘못 읽습니다)
    const on = ui.fill.has(c), lack = x.lack > 0;
    return `<button type="button" class="chip c-accent" aria-pressed="${on}" data-gap="${c}">${c}${lack ? (on ? ' 부족' : `<small>부족</small>`) : ''}</button>`;
  }).join('');
  // 부족한 역량 설명은 화면 맨 위 한 줄(actFrame)이 맡고, 여기서는 버튼 쓰는 법만 알려 줍니다
  $('#gap-note').textContent = '부족 표시는 내 경험창고 기준입니다. 역량을 고르면 그 역량을 채우는 활동이 위로 올라옵니다';
  actInterests();
  $('#cal-card').classList.toggle('on', ui.connected);
  $('#cal-text').textContent = ui.connected ? `예시 캘린더에서 일정 ${BUSY.length}개를 불러왔습니다. 고정 일정이 있는 활동만 일정 점수가 바뀝니다` : '캘린더를 연결하면 수업, 알바와 겹치는 활동을 바로 걸러냅니다';
  $('#cal-btn').textContent = ui.connected ? '연결 해제' : 'Google 캘린더 연결';
  $('#cal-btn').className = ui.connected ? 'btn ghost block' : 'btn block';
  $('#free-hours').hidden = !ui.connected;
  $('#free-hours').innerHTML = `9시부터 23시 사이 빈 시간 <b>주 ${freeHours()}시간</b>`;
  $('#hide-clash').disabled = !ui.connected;
  $('#hide-clash').checked = ui.hideClash && ui.connected;
  $('#hours').value = ui.hours; $('#hours-out').textContent = `${ui.hours}시간`;
  $('#sort').value = ui.sort;
  $('#cond-sum').textContent = `${ui.fill.size ? [...ui.fill].join(', ') + ' 채우기' : '역량 미선택'}, 주 ${ui.hours}시간${ui.connected ? ', 캘린더 연결됨' : ''}`;
}

// 관심 분야 22개는 묶음(INTEREST_GROUPS)으로 접어 둡니다. 묶음 버튼에 고른 것과 +N을, 고른 것이 있는 묶음은 처음에 펼칩니다
// 펼침 상태는 actIntOpen에 두어 다시 그려도 그대로입니다 (접힌 칩은 hidden이라 키보드와 화면 읽기에서도 빠집니다)
let actIntOpen = null;
const actGroups = () => typeof INTEREST_GROUPS !== 'undefined' ? INTEREST_GROUPS : {'관심 분야': INTERESTS};
function actInterests(){
  const groups = actGroups();
  if(!actIntOpen) actIntOpen = new Set(Object.keys(groups).filter(g => groups[g].some(t => ui.interests.has(t))));
  $('#interests').innerHTML = Object.entries(groups).map(([g, ts], i) => {
    const on = ts.filter(t => ui.interests.has(t)), open = actIntOpen.has(g);
    return `<div class="int-g"><button type="button" class="int-h" data-intg="${esc(g)}" aria-expanded="${open}" aria-controls="int-g${i}"><b>${esc(g)}</b>${on.length ? `<span>${esc(on.slice(0, 2).join(', ')) + (on.length > 2 ? ` +${on.length - 2}` : '')}</span>` : `<span class="none">${ts.length}개</span>`}</button>
      <div class="chips" id="int-g${i}"${open ? '' : ' hidden'}>${ts.map(t => `<button type="button" class="chip" aria-pressed="${ui.interests.has(t)}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  }).join('');
}
on('click', e => {
  const h = e.target.closest('#interests button[data-intg]'); if(!h) return;
  const g = h.dataset.intg, open = h.getAttribute('aria-expanded') !== 'true';
  open ? actIntOpen.add(g) : actIntOpen.delete(g);
  h.setAttribute('aria-expanded', String(open)); $('#' + h.getAttribute('aria-controls')).hidden = !open;
  return true;
});

// ---------- 가운데: 목록 ----------
// 정렬: 적합도가 같으면 마감 빠른 순
// actKindCount: 종류 탭 옆 개수 (종류를 뺀 나머지 조건을 적용한 수)
let actKindCount = {};
function visibleActs(){
  let list = ACTIVITIES.map(it => ({it, ev: evaluate(it)})).filter(x => x.ev.d >= 0);
  if(ui.hideClash && ui.connected) list = list.filter(x => !x.ev.clashes.length);
  const pk = actProfKinds(); if(pk.length > 1) list = list.filter(x => pk.includes(x.it.kind));
  if(actOnlineOn()) list = list.filter(x => actOnline(x.it));
  const q = ui.actQ.trim().toLowerCase();
  if(q) list = list.filter(x => [x.it.title, x.it.host, x.it.kind, ...x.it.tags, ...(x.it.majors || [])].join(' ').toLowerCase().includes(q));
  if(ui.actMajor && actMajorGroup()) list = list.filter(x => (x.it.majors || []).includes(actMajorGroup()));
  actKindCount = list.reduce((m, x) => (m[x.it.kind] = (m[x.it.kind] || 0) + 1, m), {}); actKindCount['전체'] = list.length;
  if(ui.kind !== '전체') list = list.filter(x => x.it.kind === ui.kind);
  // 같은 입력이면 늘 같은 순서: 적합도(반올림 전), 마감 빠른 순, 공고 번호 순
  list.sort(ui.sort === 'score' ? (a, b) => b.ev.raw - a.ev.raw || a.ev.d - b.ev.d || a.it.id - b.it.id : (a, b) => a.ev.d - b.ev.d || b.ev.raw - a.ev.raw || a.it.id - b.it.id);
  return list;
}
// 화면 틀(index.html)에 없는 칸은 처음 그릴 때 한 번만 만듭니다: 위 한 줄, 관심 목록, 검색, 온라인만, 이번 주 마감
function actChrome(){
  if(!$('#acts-frame')) $('#view-activities .view-h').insertAdjacentHTML('afterend', '<p class="acts-frame" id="acts-frame"></p><div class="act-loop" id="act-loop" role="status" hidden></div>');
  if(!$('#act-bd')) $('#view-activities').insertAdjacentHTML('beforeend', '<div class="sheet-bd" id="act-bd" hidden></div>');
  if(!$('#act-q')){
    $('#view-activities .list-head').insertAdjacentHTML('afterbegin', `<input type="search" id="act-q" class="act-q" placeholder="활동 이름, 주최 검색" aria-label="활동 이름, 주최 검색" autocomplete="off">`);
    $('#hide-clash').closest('label').insertAdjacentHTML('afterend', `<label class="toggle"><input type="checkbox" id="act-online"> 온라인만</label><label class="toggle" id="act-major-l"><input type="checkbox" id="act-major"> <span id="act-major-t">내 계열 우대 공고만</span></label>`);
    $('#basis').insertAdjacentHTML('afterend', '<p class="act-soon" id="act-soon" hidden></p>');
    $('#basis').insertAdjacentHTML('beforebegin', '<p class="act-prof" id="act-prof" hidden></p>');
    $('#view-activities .list-head').insertAdjacentHTML('beforebegin', '<div id="act-saved"></div>');
    const opt = $('#sort option[value="score"]'); if(opt) opt.textContent = '적합도순';
  }
}
// 활동 추천이 첫 화면이라, 제목 아래 한 줄로 내 경험창고의 빈 역량과 이 목록의 순서를 잇습니다
function actFrame(gaps){
  const vault = '<a href="#me">내 경험창고</a>';
  $('#acts-frame').innerHTML = !store.job
    ? `지원 직무를 고르면 ${vault} 기준으로 부족한 역량부터 채우는 활동을 먼저 보여줍니다 <button class="go" type="button" data-mejob>직무 고르기</button>`
    : gaps.length
      ? `${store.job} 직무 기준 ${vault}에서 ${gaps.map(g => g.c).join(', ')}${josa(gaps.at(-1).c, '이', '가')} 부족합니다. 대외활동은 이 역량을 채울 기회를, 공모전은 이미 강한 역량을 살릴 대회를 먼저 보여줍니다`
      : `${store.job} 직무가 요구하는 역량은 ${vault}에 모두 있습니다. 직무에 중요한 역량을 더 쌓는 활동을 먼저 보여줍니다`;
}
// 관심 목록: 담기(할 활동)보다 가벼운 표시. 마감 순으로 모아 보고 한 번에 캘린더로 보냅니다
let actSavedKey = null;
function actSavedPanel(){
  const list = actSaved().map(id => actById(id)).filter(Boolean).map(a => ({a, d: actDday(a.deadline)})).sort((x, y) => (x.d < 0) - (y.d < 0) || x.d - y.d);
  const key = list.map(x => x.a.id).join(',');
  if(key === actSavedKey) return; actSavedKey = key;
  const open = $('#act-saved details')?.open;
  const dd = d => d < 0 ? '마감됨' : `D-${d}`;
  $('#act-saved').innerHTML = !list.length ? '' : `<details class="saved-d"${open ? ' open' : ''}><summary>관심 활동 ${list.length}개<span>${list[0].d >= 0 ? `가장 빠른 마감 ${dd(list[0].d)}` : ''}</span></summary>
    <ul>${list.map(({a, d}) => `<li><button type="button" class="linkbtn" data-actpick="${a.id}">${esc(a.title)}</button><span class="${d >= 0 && d <= 7 ? 'urgent' : ''}">${dd(d)}${d >= 0 ? `, ${md(a.deadline)}` : ''}</span></li>`).join('')}</ul>
    ${list.some(x => x.d >= 0) ? `<button class="btn ghost sm" type="button" data-actsavedcal>관심 활동 마감 모두 캘린더로</button>` : ''}</details>`;
}
const actSaveBtn = (it, cls) => { const on = actSaved().includes(it.id);
  return `<button type="button" class="${cls}" data-actsave="${it.id}" aria-pressed="${on}" aria-label="${esc(it.title)} 관심">${cls === 'act-save' ? '' : '관심 '}<span aria-hidden="true">${on ? '★' : '☆'}</span></button>`; };

function renderActList(){
  actChrome();
  const gaps = gapsFor(store.job);
  actFrame(gaps); actSavedPanel();
  actSyncProfile();
  const pkTabs = actProfKinds(), kinds = pkTabs.length > 1 ? ['전체', ...pkTabs] : actKinds();
  if(!kinds.includes(ui.kind)) ui.kind = '전체';
  $('#mode').innerHTML = [['fit','직무 적합 중심'],['interest','관심 분야 중심']].map(([k, v]) => `<button type="button" data-mode="${k}" aria-pressed="${ui.mode === k}">${v}</button>`).join('');
  if($('#act-q').value !== ui.actQ) $('#act-q').value = ui.actQ;
  $('#act-online').checked = actOnlineOn();
  // 내 조건 한 줄: 프로필이 종류를 여럿으로 좁혔거나 온라인만일 때
  const profBits = [pkTabs.length > 1 ? `${pkTabs.join(', ')}만` : '', actOnlineOn() ? '온라인만' : ''].filter(Boolean);
  $('#act-prof').hidden = !profBits.length;
  $('#act-prof').innerHTML = `내 조건: ${esc(profBits.join(', '))} <a class="go" href="#start">조건 바꾸기</a>`;
  // 맨 위 한 줄과 같은 말이면(직무 적합 중심, 고른 역량 = 빈 역량) 기준 줄은 숨깁니다
  const sameAsFrame = ui.mode === 'fit' && gaps.length && gaps.length === ui.fill.size && gaps.every(g => ui.fill.has(g.c));
  $('#basis').hidden = !!sameAsFrame;
  $('#basis').innerHTML = ui.mode === 'fit'
    ? (ui.fill.size ? `<b>${[...ui.fill].join(', ')}</b> 경험을 채워 주는 활동을 먼저 보여줍니다` : `${store.job || '직무'} 기준으로 중요한 역량을 쌓는 활동을 먼저 보여줍니다`)
    : '관심 분야가 겹치는 활동을 먼저 보여줍니다';
  const all = visibleActs();
  // 종류 탭: 개수를 함께 보여주고, 지금 조건에서 0개인 종류는 흐리게
  $('#kinds').innerHTML = kinds.map(t => `<button type="button" role="tab" data-kind="${t}" aria-selected="${ui.kind === t}" class="${actKindCount[t] ? '' : 'zero'}">${t} <span class="kc">${actKindCount[t] || 0}</span></button>`).join('');
  const g = actMajorGroup();
  $('#act-major-l').hidden = !ACTIVITIES.some(a => (a.majors || []).length);
  $('#act-major').disabled = !g; $('#act-major').checked = ui.actMajor && !!g;
  $('#act-major-t').textContent = g ? `내 계열(${g}) 우대 공고만` : '내 계열 우대 공고만 (조건에서 전공 계열을 고르면 켤 수 있습니다)';
  const soon = all.filter(x => x.ev.d <= actWeekLeft()).length;
  $('#act-soon').hidden = !soon || ui.sort === 'deadline';
  $('#act-soon').innerHTML = `이번 주(일요일까지) 마감 <b>${soon}개</b><button class="go" type="button" data-actsoon>마감 빠른순으로 보기</button>`;
  const key = [ui.kind, ui.hideClash && ui.connected, ui.sort, ui.mode, [...ui.fill].sort(), [...ui.interests].sort(), ui.hours, ui.actQ, actOnlineOn(), pkTabs.join(','), ui.actMajor, actMajorGroup()].join('|');
  if(key !== actKey){ actKey = key; actShown = ACT_PAGE; }
  const at = all.findIndex(x => x.it.id === ui.selected);
  if(at >= actShown) actShown = Math.ceil((at + 1) / ACT_PAGE) * ACT_PAGE;
  const list = all.slice(0, actShown), rest = all.length - list.length;
  $('#act-count').textContent = rest ? `${all.length}개 중 ${list.length}개` : `${all.length}개`;
  if(!list.length){
    const why = [ui.actQ.trim() ? `'${ui.actQ.trim()}' 검색` : '', ui.kind !== '전체' ? ui.kind : '', actOnlineOn() ? '온라인만' : '', ui.actMajor && actMajorGroup() ? '내 계열 우대 공고만' : '', ui.hideClash && ui.connected ? '일정 겹침 숨기기' : ''].filter(Boolean).join(', ');
    $('#act-rows').innerHTML = `<li class="empty"><p>${why ? `${esc(why)} 조건에 맞는 활동이 없습니다` : '지금 열려 있는 활동이 없습니다'}</p>${why ? `<button class="btn ghost sm" type="button" data-actreset>조건 풀고 전체 보기</button>` : ''}</li>`;
    return list;
  }
  $('#act-rows').innerHTML = list.map(({it, ev}) => {
    const cls = ev.score >= 75 ? 'hi' : ev.score >= 55 ? 'mid' : 'lo';
    const flags = [];
    if(ui.connected && it.slots.length && ev.clashes.length) flags.push(`<span class="flag clash">일정 겹침</span>`);
    const tc = teamCount(it.id); if(tc) flags.push(`<span class="flag team">팀원 모집 ${tc}</span>`);
    if(plannedExp(it)) flags.push(`<span class="flag planned">참여 예정</span>`);
    const why = actReason(ev);
    return `<li class="act-li" style="view-transition-name:act-${it.id}"><button type="button" class="row" data-actsel="${it.id}" aria-current="${ui.selected === it.id}">
      <span class="score ${cls}"><span data-n="s${it.id}">${ev.score}</span><small>점</small></span>
      <span class="r-body">${actThumb(it)}<span><p class="r-title">${esc(it.title)}</p>
        <span class="r-meta"><span class="kind">${esc(it.kind)}</span><span>${actVal(it.host)}</span><span>${actHoursText(it)}</span>${flags.join('')}</span>
        ${why ? `<span class="r-why">${why}</span>` : ''}</span></span>
      <span class="dday ${ev.d <= 7 ? 'urgent' : ''}">D-${ev.d}<span>${md(it.deadline)} 마감</span></span>
    </button>${actSaveBtn(it, 'act-save')}</li>`;
  }).join('') + (rest ? `<li class="act-more"><button class="btn ghost" type="button" data-actmore>${Math.min(ACT_PAGE, rest)}개 더 보기</button><span class="muted">${all.length}개 중 ${list.length}개를 보고 있습니다</span></li>` : '');
  return list;
}

// ---------- 주간 일정 격자 (활동 상세와 팀원 일정 비교에서 함께 씁니다) ----------
function weekGrid(it, mate){
  const H = END - START;
  let hours = '';
  for(let h = START; h < END; h++) hours += `<span>${h}</span>`;
  const cols = DAYS.map((_, d) => {
    let blocks = '';
    if(ui.connected) BUSY.filter(b => b.d === d).forEach(b => { blocks += `<div class="blk busy" title="${esc(b.t)}" style="top:calc(var(--hour)*${b.s - START});height:calc(var(--hour)*${b.e - b.s})">${esc(b.t)}</div>`; });
    if(mate) mate.busy.filter(b => b.d === d).forEach(b => { blocks += `<div class="blk matebusy" style="top:calc(var(--hour)*${b.s - START});height:calc(var(--hour)*${b.e - b.s})"></div>`; });
    it.slots.filter(s => s.d === d).forEach(s => {
      const bad = ui.connected && overlap(s).length;
      blocks += `<div class="blk slot ${bad ? 'bad' : ''}" title="${esc(s.t)}" style="top:calc(var(--hour)*${s.s - START});height:calc(var(--hour)*${s.e - s.s})">${esc(s.t)}</div>`;
    });
    return `<div class="day" style="height:calc(var(--hour)*${H})">${blocks}</div>`;
  }).join('');
  return `<div class="week" role="img" aria-label="주간 일정 비교">
    <div class="dh"></div>${DAYS.map(d => `<div class="dh">${d}</div>`).join('')}
    <div class="hours">${hours}</div>${cols}</div>
    <div class="legend"><span><i style="background:repeating-linear-gradient(135deg,var(--wash) 0 3px,var(--busy) 3px 6px)"></i>내 일정</span>${mate ? `<span><i style="background:rgba(var(--accent-rgb),.2);border:1px dashed var(--accent)"></i>${esc(mate.name)} 일정</span>` : ''}<span><i style="background:var(--ok)"></i>활동 일정</span><span><i style="background:var(--bad)"></i>겹침</span></div>`;
}
function verdict(it, ev){
  if(!ui.connected) return `<p class="verdict none">캘린더를 연결하지 않아 일정 겹침은 아직 계산하지 않았습니다. 내 조건의 캘린더 연결을 누르면 바로 반영됩니다</p>`;
  if(!it.slots.length) return `<p class="verdict none">공고에 정해진 모임 시간이 없습니다. 빈 시간에 나눠서 준비하면 되고, 일정 점수는 중립으로 둡니다</p>`;
  if(!ev.clashes.length) return `<p class="verdict ok">${esc(it.slots.map(s => `${DAYS[s.d]}요일 ${fmtH(s.s)}~${fmtH(s.e)} ${s.t}`).join(', '))} 시간이 모두 비어 있습니다</p>`;
  return `<p class="verdict clash">${esc(ev.clashes.map(c => `${DAYS[c.slot.d]}요일 ${c.slot.t}${josa(c.slot.t, '이', '가')} ${c.b.t}와 ${c.len % 1 ? c.len.toFixed(1) : c.len}시간 겹칩니다`).join('. '))}</p>`;
}
// 담기가 역량 지도를 어떻게 바꾸는지. 참여 예정 경험은 우선순위 1로 담기므로 마치고 정리하면 역량마다 1/3칸 오릅니다 (3분의 1 단위로 셉니다)
function actDelta(it, inVault){
  const job = store.job;
  if(!job) return `<p class="delta-note">지원 직무를 고르면 이 활동이 역량 지도를 어떻게 바꾸는지 알려 줍니다</p>`;
  if(!it.builds.length) return `<p class="delta-note">이 공고는 쌓이는 역량을 아직 정하지 않아 역량 지도 변화를 계산하지 않았습니다</p>`;
  const cov = coverage(job), pct = t => (t / 9 * 100).toFixed(1) + '%';
  const rows = it.builds.map(c => cov.find(x => x.c === c)).filter(x => x.st === 'gap').map(x => {
    const now = Math.round(x.have * 3), after = Math.min(9, now + 1);
    return {...x, now, after, done: after >= x.need * 3};
  });
  const ok = it.builds.filter(c => cov.find(x => x.c === c).st === 'ok'), na = it.builds.filter(c => cov.find(x => x.c === c).st === 'na');
  const nun = l => l.join(', ') + josa(l.at(-1), '은', '는');
  if(!rows.length) return `<p class="delta-note">이 활동이 쌓는 ${ok.length && na.length ? `${nun(ok)} 이미 충분하고 ${nun(na)} ${job} 직무와 무관해서,`
    : ok.length ? `${nun(ok)} 이미 충분해서` : `${nun(na)} ${job} 직무와 무관해서`} 담아도 빈 역량은 그대로입니다</p>`;
  return `<div class="delta">
    <p class="delta-h">${inVault ? '활동을 마치고 정리하면' : '담고 활동을 마치면'} ${job} 역량 지도가 이렇게 바뀝니다</p>
    <ul>${rows.map(x => `<li><b>${x.c}</b>
      <span class="dl-track" aria-hidden="true"><span class="dl-have" style="width:${pct(x.now)}"></span><span class="dl-add" style="left:${pct(x.now)};width:${pct(x.after - x.now)}"></span><span class="dl-need" style="left:calc(${pct(x.need * 3)} - 1px)"></span></span>
      <span class="${x.done ? 'ok' : 'bad'}">${x.done ? '부족에서 충분으로' : '여전히 부족'}</span></li>`).join('')}</ul>
    ${ok.length ? `<p class="delta-note">이미 충분한 ${ok.join(', ')}도 더 쌓입니다</p>` : ''}
  </div>`;
}
function actFillBox(it, ev){
  const exp = plannedExp(it);
  const lead = ev.covered.length
    ? `${store.job ? store.job + ' 직무 기준으로 ' : ''}부족한 <b>${ev.covered.join(', ')}</b> 경험을 이 활동으로 채울 수 있습니다`
    : it.builds.length ? `채우려는 역량과는 거리가 있지만, ${it.builds.join(', ')} 경험이 쌓입니다` : '이 공고에서 쌓이는 역량은 공고 원문을 보고 판단하세요';
  return `<div class="fillbox"><p>${lead}</p>
    ${it.builds.length ? `<div class="tags">${it.builds.map(c => `<span class="tg ${ui.fill.has(c) ? 'on' : ''}">${c}</span>`).join('')}${ACT_EST}</div>` : ''}
    ${actDelta(it, !!exp)}
    ${exp
      ? `<p class="linked"><b>경험창고에 담았습니다</b> 참여 예정 경험 ${esc(showTitle(exp))}</p>
         <div class="act-btns"><a class="go" href="#me" data-goexp="${exp.id}" data-planned-next="${it.id}">경험창고에서 보기</a><a class="go" href="${link.team(it.id)}">팀원 찾기</a></div>`
      : `<div class="act-btns"><button class="btn accent sm" type="button" data-plan="${it.id}">경험창고에 담기</button><span class="muted">참여할 활동을 참여 예정 경험으로 담습니다. 눈여겨보기만 할 때는 관심</span></div>`}</div>`;
}
// 추천 근거: 항목마다 막대, 점수, 맞춘 규칙. 중립 항목은 흐리게. 활동 종류에 맞는 갈래의 계산 방법을 먼저 보여줍니다
function actBreakdown(ev){
  const ex = WF.explore[ui.mode] || WF.explore.fit, co = WF.contest[ui.mode] || WF.contest.fit;
  const explore = `<li><b>대외활동, 서포터즈</b>: 직무 관련성 ${ex.rel} + 학습 기회 ${ex.learn} + 활동 조건 ${ex.cond}
      <br><b>직무 관련성</b> = 이 활동이 쌓는 역량의 직무 요구 수준 합 ÷ 같은 개수로 고를 수 있는 가장 높은 요구 수준 합${ui.mode === 'interest' ? '. 관심 분야 중심에서는 관심 분야 일치 비율과 반씩 섞습니다' : ''}
      <br><b>학습 기회</b> = 채우려는 역량마다 모자란 칸 수(직무 요구 수준에서 내 경험창고 보유 수준을 뺀 값, 최소 1/3칸)를 무게로 두고, 이 활동이 쌓는 역량의 무게 합 ÷ 전체 무게 합. 채우려는 역량을 고르지 않으면 직무 요구 역량을 요구 수준으로 무게를 둡니다
      <br><b>활동 조건</b> = 아는 조건의 평균: 주당 시간 min(1, 설정 시간 ÷ 활동 시간), 캘린더를 연결하면 고정 일정이 겹치지 않는 비율, 내 조건이 온라인만이면 온라인 여부(1 또는 0), 마감 여유 min(1, max(0.3, 남은 날 ÷ 14))</li>`;
  const contest = `<li><b>공모전, 학술제, 해커톤</b>: 주제 적합성 ${co.topic} + 보유 역량 ${co.strong} + 팀 구성 ${co.team}
      <br><b>주제 적합성</b> = 활동 분야 중 내 관심 분야와 겹치는 비율, 제목에 관심 분야가 있으면 +0.25 (최대 1)
      <br><b>보유 역량</b> = 이 대회에 쓰이는 역량마다 내 경험창고 보유 수준(0~3) ÷ 2, 최대 1의 평균. 빈 역량을 채우는 것과 반대로 이미 강한 역량을 살리는 대회가 높습니다
      <br><b>팀 구성</b> = 개인 참가 가능하거나 내 팀이 있으면 1, 팀 참가만 되면 이 활동 팀원 모집글 수로 0개 0.3, 1개 0.8, 2개 이상 1</li>`;
  return `<div class="breakdown">${ev.parts.map((p, i) => p.adj ? `<div class="bk-item">
      <div class="bk adj"><span>${p.name}</span><span class="adj-note">${p.pts > 0 ? '우대 가산' : p.pts < 0 ? '대상 아님 감점' : '반영 안 함'}</span><span class="v ${p.pts < 0 ? 'neg' : ''}">${p.pts > 0 ? '+' : ''}${p.pts}</span></div>
      <p class="bk-why">${esc(p.why)}</p></div>` : `<div class="bk-item">
      <div class="bk ${p.neutral ? 'unknown' : ''} ${i === 0 ? 'fitbar' : ''}"><span>${p.name}</span><span class="bar"><i style="width:${Math.round(p.pts / p.max * 100)}%"></i></span><span class="v">${p.neutral ? '중립 ' : ''}${p.pts}/${p.max}</span></div>
      <p class="bk-why">${esc(p.why)}</p></div>`).join('')}
    <details class="how"><summary>적합도 계산 방법</summary>
      <p class="how-ai"><b>틈의 AI는 규칙 기반입니다. 아래 가중치와 근거가 전부입니다</b></p>
      <p>규칙으로만 계산합니다. 활동 종류마다 세 항목을 매기고, 아는 항목 점수의 합을 아는 항목 만점의 합으로 나눠 100점 만점으로 환산한 뒤 전공 조정값을 더해 0점에서 99점 사이로 자릅니다.
        순서는 반올림 전 점수, 같으면 마감이 빠른 순, 그다음 공고 번호 순이라 같은 조건이면 늘 같은 순서가 나옵니다.</p>
      <ul>
        ${ev.fam === 'contest' ? contest + explore : explore + contest}
        <li><b>전공 +${MAJOR_ADJ.match} / ${MAJOR_ADJ.other}</b>: 공고가 대상 전공 계열을 밝힌 경우에만 더하거나 뺍니다. 내 전공 계열이 들어 있으면 +${MAJOR_ADJ.match}(전공 우대), 다른 계열만 대상이면 ${MAJOR_ADJ.other}(다른 전공 대상)</li>
        <li><b>중립</b>: 알 수 없는 항목(지원 직무 미선택, 분야 정보 없음, 팀 구성 정보 없음 등)은 계산에서 뺍니다. 상수로 채우지 않아 모르는 값 때문에 점수가 오르거나 내려가지 않습니다. 막대는 아는 항목의 평균 비율로 채워 보여줘서 항목 점수를 더하면 적합도가 됩니다</li>
        <li>쌓이는 역량, 주당 부담, 고정 일정은 공고를 읽고 틈이 추정한 값입니다</li>
      </ul>
    </details></div>`;
}
function renderActDetail(){
  const it = actById(ui.selected), box = $('#act-detail');
  // 다른 활동을 고르거나 직무를 바꾸면 상세를 맨 위부터 보여줍니다
  const dk = `${ui.selected}|${store.job}`;
  if(dk !== actDetailKey){ actDetailKey = dk; box.scrollTop = 0; }
  if(!it){ box.innerHTML = `<p class="empty">목록에서 활동을 고르면 개인별 적합도와 추천 근거, 일정 겹침, 팀원 모집을 보여줍니다</p>`; return; }
  const ev = evaluate(it), tc = teamCount(it.id), src = actSource(it);
  const morphTo = actPosterMorph === it.id; actPosterMorph = null;
  const h = ev.h, over = h > ui.hours;
  box.innerHTML = `
    <button class="linkbtn act-back" type="button" data-actback="${it.id}">목록으로</button>
    <div class="d-head">
      <div class="d-headtx">
        <p class="d-kind">${esc(it.kind)}</p>
        <h2 class="d-title" tabindex="-1">${esc(it.title)}</h2>
        <p class="d-host">${actVal(it.host)}</p>
        <p class="d-trust">공고 확인 ${actChecked(it)}${src ? `, 출처 ${esc(src)}` : ''}</p>
        <p class="d-links">${actSrc(it)}<button class="linkbtn" type="button" data-actcopy="${it.id}">링크 복사</button>${actSaveBtn(it, 'linkbtn act-save-d')}</p>
      </div>
      ${actSafe(it.poster) ? `<button type="button" class="d-thumb" data-actposter="${it.id}" aria-label="${esc(it.title)} 포스터 크게 보기"><img src="${esc(it.poster)}" alt=""${morphTo ? ' style="view-transition-name:poster-sel"' : ' loading="lazy"'} onerror="this.closest('button').remove()"></button>` : ''}
    </div>
    <h3 class="d-score">개인별 적합도 <span data-n="detail">${ev.score}</span>점</h3>
    <p class="bk-cap">추천 근거</p>
    ${actBreakdown(ev)}
    ${actFillBox(it, ev)}
    <dl class="facts">
      <div><dt>마감</dt><dd>${md(it.deadline)} (D-${ev.d})</dd></div>
      <div><dt>기간</dt><dd>${actVal(it.term)}</dd></div>
      <div><dt>방식</dt><dd>${actVal(it.region)}, ${actVal(it.team)}</dd></div>
      <div><dt>주당 부담 ${ACT_EST}</dt><dd>${h ? `${h}시간` : actVal('')}</dd></div>
      <div class="wide"><dt>혜택</dt><dd>${actVal(it.benefit)}</dd></div>
    </dl>
    <h3>내 일주일과 겹쳐 보기</h3>
    ${verdict(it, ev)}
    ${weekGrid(it)}
    <div class="load">
      <p>${!h ? `공고에 주당 부담이 나와 있지 않아 시간 부담은 중립으로 계산했습니다. 공고 원문에서 활동 시간을 확인하세요`
        : over ? `이 활동은 주 ${h}시간이 필요한데 설정한 시간은 ${ui.hours}시간입니다. ${h - ui.hours}시간이 모자랍니다`
        : h === ui.hours ? `설정한 주 ${ui.hours}시간과 딱 맞습니다` : `설정한 주 ${ui.hours}시간 안에 들어갑니다. ${ui.hours - h}시간이 남습니다`}</p>
    </div>
    <div class="d-actions">
      <button class="btn ghost" type="button" id="add-cal">마감일 캘린더에 추가</button>
      <a class="btn" href="${link.team(it.id)}" id="to-team">${tc ? `이 활동 팀원 모집 ${tc}개 보기` : '이 활동 팀원 모집하기'}</a>
    </div>`;
}

// 포스터 이름은 한 번의 전환에만 씁니다. 전환이 끝나면(350ms 뒤) 지워 다음 전환과 겹치지 않게 합니다
function actClearMorph(){ setTimeout(() => document.querySelectorAll('[style*="poster-sel"]').forEach(el => { el.style.viewTransitionName = ''; }), 420); }
function renderActivities(){
  renderConditions();
  const list = renderActList();
  if(ui.selected === null || !list.some(x => x.it.id === ui.selected)) ui.selected = list[0]?.it.id ?? null;
  document.querySelectorAll('.row').forEach(r => r.setAttribute('aria-current', String(+r.dataset.actsel === ui.selected)));
  // 목록이 비면 상세 칸도 숨깁니다 (고를 활동이 없는 안내가 두 번 나오지 않게)
  $('#act-detail').hidden = !list.length;
  renderActDetail();
  actLoopCheck(list); actSheetSync();
}

// ---------- 새 경험 반영: 경험을 저장하기 직전 역량 지도와 상위 3개를 기억해 두고, 다음에 활동 추천을 그릴 때 달라진 점을 한 줄로 알립니다 (메모리에만) ----------
const actExpSig = () => JSON.stringify(store.exps.filter(e => !e.planned).map(e => [e.id, e.pri, e.tags]));
let actLoopBefore = null, actLoopMsg = null;
function actSnapshot(){
  actCovMemo = null;
  const cov = coverage(store.job), st = Object.fromEntries(cov.map(x => [x.c, x.st])), lack = Object.fromEntries(cov.map(x => [x.c, x.lack])), top = visibleActs().slice(0, 3).map(x => x.it.id);
  actCovMemo = null;
  return {sig: actExpSig(), job: store.job, st, lack, top};
}
// 경험 추가와 '활동 마치고 정리'는 모두 #add-form 제출입니다. 캡처 단계라 main.js가 저장하기 전에 찍힙니다
document.addEventListener('submit', e => { if(e.target.id === 'add-form') actLoopBefore = actSnapshot(); }, true);
function actLoopCheck(list){
  const el = $('#act-loop'); if(!el) return;
  if(actLoopBefore){
    const b = actLoopBefore; actLoopBefore = null;
    if(actExpSig() !== b.sig && store.job === b.job){
      const cov = actCoverage(), now = Object.fromEntries(cov.map(x => [x.c, x])), lackTxt = v => `${fmtLack(v)}칸 부족`;
      // 부족에서 충분으로 바뀐 역량을 먼저, 그다음 아직 부족하지만 줄어든 역량
      const ups = [...COMP_KEYS.filter(c => b.st[c] === 'gap' && now[c].st === 'ok').map(c => `${c} 부족에서 충분으로`),
        ...COMP_KEYS.filter(c => b.st[c] === 'gap' && now[c].st === 'gap' && now[c].lack < b.lack[c] - 1e-9).map(c => `${c} ${lackTxt(b.lack[c])}에서 ${lackTxt(now[c].lack)}으로`)];
      const top = list.slice(0, 3).map(x => x.it.id), moved = top.join() !== b.top.join();
      actLoopMsg = {ups, moved, top, before: b.top};
    }
  }
  el.hidden = !actLoopMsg; if(!actLoopMsg) return;
  const m = actLoopMsg, rank = id => m.before.indexOf(id);
  el.innerHTML = `<p><b>새 경험이 반영됐습니다</b>${m.ups.length ? `: ${esc(m.ups.join(', '))}` : ': 역량 지도에 반영했습니다'}. ${m.moved ? '추천 순서가 바뀌었습니다' : '추천 상위 3개는 그대로입니다'}
    ${m.moved ? `<button class="go" type="button" data-actloop aria-expanded="false" aria-controls="act-loop-top">바뀐 상위 3개 보기</button>` : ''}<button class="linkbtn" type="button" data-actloopx>닫기</button></p>
    ${m.moved ? `<ol id="act-loop-top" hidden>${m.top.map((id, i) => { const a = actById(id), r = rank(id); return a ? `<li><button type="button" class="linkbtn" data-actpick="${id}">${esc(a.title)}</button><span>${r < 0 ? '새로 상위 3개' : r === i ? '그대로' : `이전 ${r + 1}위`}</span></li>` : ''; }).join('')}</ol>` : ''}`;
}

// ---------- 움직임: morph(포스터가 상세로 커짐), push(좁은 화면 상세 시트) ----------
// push: 1240px 이하에서 상세가 목록 위로 올라오는 시트가 되고, 뒤 목록은 조금 작아지며 물러납니다. 닫기 버튼, Esc, 바깥 누르기로 닫습니다
const actPushOn = () => motionOn('push') && innerWidth <= 1240;
let actSheetOpen = false, actPosterMorph = null;
function actSheetSync(){
  const d = $('#act-detail'), g = $('#view-activities .acts-grid'), bd = $('#act-bd'); if(!d || !g) return;
  const sheet = actPushOn() && ui.view === 'activities', open = sheet && actSheetOpen;
  d.classList.toggle('is-sheet', sheet); d.classList.toggle('open', open);
  g.classList.toggle('sheet-back', open); if(bd) bd.hidden = !open;
  document.documentElement.classList.toggle('sheet-lock', open);
  d.inert = sheet && !open;
  if(open){ d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', '활동 상세'); }
  else { d.removeAttribute('role'); d.removeAttribute('aria-modal'); d.removeAttribute('aria-label'); }
  const back = d.querySelector('.act-back'); if(back) back.textContent = open ? '닫기' : '목록으로';
}
function actSheet(open, focusRow){
  actSheetOpen = open; actSheetSync();
  if(open) requestAnimationFrame(() => $('#act-detail .d-title')?.focus({preventScroll: true}));
  else if(focusRow){ const r = $(`#act-rows [data-actsel="${ui.selected}"]`); if(r) r.focus({preventScroll: true}); }
}
// 주소로 들어온 활동(?id=)은 시트를 열어 보여줍니다 (main.js가 주소를 지우기 전에 읽습니다)
const actWantsSheet = () => /^#activities\?.*\bid=/.test(location.hash);
if(actWantsSheet()) actSheetOpen = true;
addEventListener('hashchange', () => { if(actWantsSheet()) actSheetOpen = true; else if(!location.hash.startsWith('#activities')){ actSheetOpen = false; actSheetSync(); } });
addEventListener('resize', () => actSheetSync());
document.addEventListener('keydown', e => { if(e.key === 'Escape' && actSheetOpen && actPushOn() && ui.view === 'activities'){ actSheet(false, true); } });

// ---------- 캘린더 파일: 관심 활동 마감을 한 파일에 모읍니다 (main.js downloadIcs와 같은 형식) ----------
function actIcsAll(items){
  const day = iso => iso.replace(/-/g, '');
  const next = iso => new Date(Date.UTC(...iso.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) + 864e5).toISOString().slice(0, 10);
  const txt = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = it => ['BEGIN:VEVENT', `UID:teum-${it.id}-${day(it.deadline)}@teum.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(it.deadline)}`, `DTEND;VALUE=DATE:${day(next(it.deadline))}`,
    `SUMMARY:${txt(`${it.title} 마감`)}`, `DESCRIPTION:${txt(`${it.host || ''}. ${it.kind}. 틈 관심 활동에서 저장${actSafe(it.url) ? '. ' + it.url : ''}`)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', `DESCRIPTION:${txt(`${it.title} 내일 마감`)}`, 'END:VALARM', 'END:VEVENT'];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//teum//activity//KO', 'CALSCALE:GREGORIAN', ...items.flatMap(ev), 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], {type: 'text/calendar;charset=utf-8'})); a.download = '틈 관심 활동 마감.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 포스터 크게 보기: 처음 누를 때 대화상자를 하나 만들어 계속 씁니다. 바깥을 누르거나 Esc로 닫습니다
function actShowPoster(it){
  let d = $('#poster-dlg');
  if(!d){
    document.body.insertAdjacentHTML('beforeend', `<dialog class="poster-dlg" id="poster-dlg" aria-labelledby="poster-dlg-h"><form method="dialog"><h2 id="poster-dlg-h"></h2><button class="btn ghost sm" value="close">닫기</button></form><img alt=""></dialog>`);
    d = $('#poster-dlg'); d.addEventListener('click', e => { if(e.target === d) d.close(); });
  }
  d.querySelector('h2').textContent = `${it.title} 포스터`;
  const img = d.querySelector('img'); img.src = it.poster; img.alt = `${it.title} 포스터`;
  d.showModal();
}

// 다시 그린 뒤 새로 생긴 요소로 초점을 옮깁니다. View Transition은 다음 프레임에 화면을 바꾸므로, 그리기 전의 같은 요소가 아닌 새 요소가 나올 때까지 몇 프레임 기다립니다
function actFocusAfter(sel, fn){
  const q = () => document.querySelector(`#view-${ui.view} ${sel}`), old = q();
  fn();
  let n = 12;
  const step = () => { const el = q(); if(el && el !== old) return el.focus(); if(n--) requestAnimationFrame(step); };
  step();
}
on('click', e => {
  // 활동 고르기: morph는 고른 줄의 포스터에 이름을 붙여 상세 포스터로 커지게 하고, push는 좁은 화면에서 시트를 엽니다. 둘 다 꺼져 있으면 main.js가 처리합니다
  const row = e.target.closest('#act-rows button[data-actsel]');
  if(row && (motionOn('morph') || actPushOn())){
    const id = +row.dataset.actsel, sheet = actPushOn();
    if(!sheet && motionOn('morph') && canMorph()){ const img = row.querySelector('.p-thumb'); if(img){ img.style.viewTransitionName = 'poster-sel'; actPosterMorph = id; actClearMorph(); } }
    ui.selected = id; if(sheet) actSheetOpen = true;
    render();
    if(sheet) requestAnimationFrame(() => $('#act-detail .d-title')?.focus({preventScroll: true}));
    else if(innerWidth <= 1240) $('#act-detail').scrollIntoView({behavior: 'smooth', block: 'start'});
    return true;
  }
  if(e.target.closest('#act-bd')){ actSheet(false, true); return true; }
  // 담기: 담은 뒤 초점을 다음 할 일(경험창고에서 보기, 팀원 찾기)로 옮깁니다. 경험창고의 채울 활동 목록도 같은 버튼을 씁니다
  const plan = e.target.closest('button[data-plan]');
  if(plan){ const id = +plan.dataset.plan; actFocusAfter(`[data-planned-next="${id}"]`, () => { planActivity(id); render(); }); return true; }
  const exp = e.target.closest('a[data-goexp]');
  if(exp){ e.preventDefault(); ui.flashExp = +exp.dataset.goexp; go('#me'); return true; }
  if(e.target.closest('button[data-actreset]')){ actFocusAfter('#act-rows .row', () => { ui.kind = '전체'; ui.hideClash = false; ui.actQ = ''; ui.actMajor = false; if(actOnlineOn()){ actProf().online = false; save(); } render(); }); return true; }
  // 더 보기: 다음 20개를 펼치고 초점을 새로 나온 첫 활동으로 옮깁니다
  if(e.target.closest('button[data-actmore]')){ const from = actShown; actFocusAfter(`#act-rows > li:nth-child(${from + 1}) .row`, () => { actShown += ACT_PAGE; render(); }); return true; }
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  // 관심: 담기보다 가벼운 표시. 목록과 상세 모두 같은 버튼
  if(d.actsave){
    const id = +d.actsave, s = actSaved(), on = s.includes(id);
    actFocusAfter(`${b.classList.contains('act-save') ? '#act-rows' : '#act-detail'} [data-actsave="${id}"]`, () => { store.saved = on ? s.filter(x => x !== id) : [...s, id]; save(); render(); });
    toast(on ? '관심 활동에서 뺐습니다' : '관심 활동에 넣었습니다. 목록 위 관심 활동에서 마감을 모아 봅니다');
    return true;
  }
  if(d.actpick){ if(actPushOn()) actSheetOpen = true; actFocusAfter('#act-detail .d-title', () => { ui.selected = +d.actpick; render(); }); if(innerWidth <= 1240 && !actPushOn()) $('#act-detail').scrollIntoView({block: 'start'}); return true; }
  if(d.actsavedcal !== undefined){
    const items = actSaved().map(id => actById(id)).filter(a => a && actDday(a.deadline) >= 0);
    actIcsAll(items); toast(`관심 활동 ${items.length}개의 마감을 일정 파일 하나로 받았습니다. 열면 캘린더에 들어갑니다`); return true;
  }
  if(d.actsoon !== undefined){ actFocusAfter('#act-rows .row', () => { ui.sort = 'deadline'; render(); }); return true; }
  if(d.actcopy){ copy(location.origin + location.pathname + link.acts('', +d.actcopy), '활동 링크를 복사했습니다'); return true; }
  if(d.actposter){ actShowPoster(actById(+d.actposter)); return true; }
  // 목록으로: 좁은 화면에서 상세를 보다가 고른 활동 줄로 돌아갑니다
  if(d.actback){ if(actSheetOpen && actPushOn()){ actSheet(false, true); return true; } const row = $(`#act-rows [data-actsel="${d.actback}"]`); if(row){ row.scrollIntoView({block: 'center'}); row.focus({preventScroll: true}); } return true; }
  if(d.actloop !== undefined){ const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); $('#act-loop-top').hidden = !open; return true; }
  if(d.actloopx !== undefined){ actLoopMsg = null; $('#act-loop').hidden = true; return true; }
});
// 왼쪽 조건의 관심 분야와 주당 시간을 바꾸면 내 조건(프로필)에도 씁니다
on('click', e => {
  const t = e.target.closest('#interests button[data-t]'); if(!t) return;
  const v = t.dataset.t; ui.interests.has(v) ? ui.interests.delete(v) : ui.interests.add(v);
  actWriteProfile(); render(); return true;
});
on('input', e => {
  if(e.target.id !== 'hours') return;
  ui.hours = +e.target.value; actWriteProfile(); render(); return true;
});
let actQT;
on('input', e => {
  if(e.target.id !== 'act-q') return;
  clearTimeout(actQT); actQT = setTimeout(() => { ui.actQ = e.target.value; ui.selected = null; render(false); }, 200);
  return true;
});
on('change', e => {
  if(e.target.id !== 'act-major') return;
  ui.actMajor = e.target.checked; render(); return true;
});
on('change', e => {
  if(e.target.id !== 'act-online') return;
  actProf().online = e.target.checked; save(); render(); return true;
});
