// 팀원 매칭 (2단계 미리보기): 활동별 모집글, 내 경험을 포트폴리오로 붙여 지원, 모집글 쓰기

// 작성자 아바타 바탕. 내 글은 var(--accent) 하나로 구분하므로 다른 사람은 잉크 계열과 옅은 accent만 씁니다 (흰 글자 대비 4.5 이상)
const AV = ['var(--ink2)','rgba(var(--accent-rgb),.72)','var(--ink)'];

// 양방향 매칭. 두 쪽을 따로 재고 조화평균으로 합칩니다 (한쪽이 높아도 다른 쪽이 낮으면 매칭이 낮게 나옵니다). 바닥 점수는 없습니다
// a: 내가 이 팀에 맞는 정도 = 팀이 원하는 역량 중 내 경험으로 증명하는 비율
// b: 이 팀이 나에게 맞는 정도 = 내 부족 역량 채움 60% + 회의 시간 40%. 모르는 쪽(부족 역량 미선택, 캘린더 미연결)은 빼고 계산
const TEAM_W = {fill: .6, time: .4};
function team_recip({want, proof, gaps, offer, time}){
  const meets = want.filter(c => proof.has(c));
  const a = want.length ? meets.length / want.length : null;
  const fills = gaps.filter(c => offer.has(c));
  const fillS = gaps.length ? Math.min(1, fills.length / Math.min(2, gaps.length)) : null;
  const parts = [[fillS, TEAM_W.fill], [time.score, TEAM_W.time]].filter(x => x[0] != null);
  const b = parts.length ? parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0) : null;
  const h = a == null ? b : b == null ? a : a + b ? 2 * a * b / (a + b) : 0;
  return {a, b, h, pct: Math.round((h || 0) * 100), meets, fills, fillS, time};
}
const team_pc = v => v == null ? '모름' : Math.round(v * 100) + '%';
const team_cls = v => v == null ? 'dim' : v >= .7 ? 'ok' : v < .4 ? 'bad' : '';
function postFit(p){
  const mine = doneExps();
  const proofs = p.want.map(c => ({c, e: mine.filter(e => e.tags.includes(c)).sort((a, b) => b.pri - a.pri)[0]})).filter(x => x.e);
  const r = team_recip({want: p.want, proof: new Set(mine.flatMap(e => e.tags)), gaps: [...ui.fill],
    offer: new Set(p.has.concat(p.portfolio.flatMap(x => x.tags))), time: team_meetFit(p.meet)});
  return {...r, proofs, miss: p.want.filter(c => !r.meets.includes(c))};
}
// 내 글: 예시 지원자(데모)를 같은 양방향 점수로 정렬합니다. 다른 모집글 작성자의 공개 프로필로 만든 가상 지원이고, 실제 지원 수에는 넣지 않습니다
function team_applicants(p){
  const offer = new Set(p.has.concat(p.portfolio.flatMap(x => x.tags)));
  const seen = new Set();
  return POSTS.filter(x => !seen.has(x.name) && seen.add(x.name)).map(x => {
    const r = team_recip({want: p.want, proof: new Set(x.has.concat(x.portfolio.flatMap(y => y.tags))), gaps: x.want, offer, time: team_timeFit(p.meet, x.busy || [])});
    return {x, ...r};
  }).sort((a, b) => b.pct - a.pct || b.a - a.a).slice(0, 3);
}

// 회의 시간 글(예: 주 1회 일요일 21시 온라인)을 요일과 시각으로 읽어 내 일정(BUSY)과 겹치는지 봅니다. 시각만 있으면 1시간 회의로 봅니다
const TEAM_DAY = {월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6};
function team_meetSlots(meet){
  const s = meet || '';
  let days = [...s.matchAll(/([월화수목금토일])요일/g)].map(m => TEAM_DAY[m[1]]), range = false;
  if(!days.length && /평일/.test(s)){ days = [0, 1, 2, 3, 4]; range = true; }
  if(!days.length && /주말/.test(s)){ days = [5, 6]; range = true; }
  if(!days.length && /매일/.test(s)){ days = [0, 1, 2, 3, 4, 5, 6]; range = true; }
  const h = s.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  let st = null, en = null;
  if(h){ st = +h[1] + (h[2] ? +h[2] / 60 : 0); if(/오후/.test(s.slice(0, h.index)) && st < 12) st += 12; en = /이후/.test(s.slice(h.index)) ? Math.max(st + 1, END) : st + 1; }
  else if(/오전/.test(s)){ st = 9; en = 12; }
  else if(/오후/.test(s)){ st = 13; en = 18; }
  else if(/저녁/.test(s)){ st = 18; en = 21; }
  else if(/밤/.test(s)){ st = 21; en = 23; }
  return days.length && st != null ? {range, slots: [...new Set(days)].map(d => ({d, s: st, e: en}))} : null;
}
// busy가 없으면(캘린더 미연결) 모름. 모름은 점수에서 빼므로 높게도 낮게도 치지 않습니다
function team_timeFit(meet, busy){
  if(!busy) return {k: 'off', text: '회의 시간 모름, 캘린더 연결 전', score: null};
  const m = team_meetSlots(meet);
  if(!m) return {k: 'unk', text: '회의 시간 모름, 요일이나 시각이 없음', score: null};
  const hits = m.slots.map(sl => ({sl, b: busy.find(b => b.d === sl.d && b.s < sl.e && b.e > sl.s)}));
  const clash = hits.filter(x => x.b), free = hits.length - clash.length;
  if(!clash.length) return {k: 'free', text: '회의 시간 비어 있음', score: 1};
  if(m.range && free) return {k: 'part', text: `회의 가능한 날 ${free}일`, score: .7};
  const c = clash[0];
  return {k: 'clash', text: `회의 시간 겹침, ${DAYS[c.sl.d]} ${c.b.t || '일정'}`, score: 0};
}
const team_meetFit = meet => team_timeFit(meet, ui.connected ? BUSY : null);
const TEAM_TIME_CLS = {free: 'ok', part: '', clash: 'bad', unk: 'dim', off: 'dim'};
const allPosts = () => POSTS.concat(store.posts.map(p => ({...p, mine: true})));
const team_openActs = () => ACTIVITIES.filter(a => actDday(a.deadline) >= 0);
const team_railActs = (posts, act, cnt) => ACTIVITIES
  .filter(a => a.id === act?.id || (actDday(a.deadline) >= 0 && posts.some(p => p.act === a.id)))
  .sort((a, b) => cnt(b.id) - cnt(a.id));
// 이 활동이 경험창고에 들어 있는지: 참여 예정이거나, 이미 마친 경험으로 옮겼거나
const team_actExp = a => a && (plannedExp(a) || store.exps.find(e => e.actId === a.id));
// 경험창고의 그 경험으로 가는 연결. 주소만으로도 경험창고가 열리고, 누르면 그 경험을 맨 위에 비춥니다
const team_expLink = e => `<a class="team-exp" href="#me" data-teamexp="${e.id}">${esc(showTitle(e))}</a>`;
// 지원할 때는 경험 제목을 저장하므로 제목으로 다시 찾습니다
const team_expByTitle = t => store.exps.find(e => e.title === t);
// 직무에 모자란 역량을 원하는 역량으로 미리 고릅니다. 직무가 없으면 활동 추천에서 고른 채울 역량
const team_gapWant = () => { const g = store.job ? gapsFor(store.job).map(x => x.c) : []; return g.length ? g.slice(0, 3) : [...ui.fill]; };

// 다시 그려도 쓰던 모집글이 남도록 입력값을 들고 있습니다. 올리거나 닫으면 비웁니다
let team_draft = {};
// 다시 그린 뒤 키보드 초점을 옮길 곳
let team_focus = null;
const team_seen = {applyFor: null, writing: false, apps: new Set(), posts: 0};

function team_nextStep(p){
  const a = actById(p.act); if(!a) return '';
  const ex = team_actExp(a);
  return `<div class="next-step" role="status">${ex
    ? `<span>${esc(a.title)}${josa(a.title, '은', '는')} 경험창고에 ${ex.planned ? '참여 예정으로' : '마친 경험으로'} 들어 있습니다</span><a class="go" href="#me" data-teamexp="${ex.id}">경험창고에서 보기</a>`
    : `<span>${p.mine ? '모집하는 활동' : '지원한 활동'}을 경험창고에 담아 두면 역량 지도에 미리 보이고, 끝난 뒤 바로 경험으로 정리할 수 있습니다</span><button class="btn ghost sm" type="button" data-teamplan="${a.id}">이 활동을 경험창고에 참여 예정으로 담기</button>`}</div>`;
}

function applyForm(p){
  const mine = doneExps();
  if(!mine.length) return `<div class="sub-form" id="apply-form-empty"><p class="muted" style="margin:0 0 10px">경험창고에 정리한 경험이 없어 공유할 포트폴리오가 없습니다. 경험을 하나 추가하면 여기서 바로 고를 수 있습니다</p>
    <div class="post-act"><button class="btn accent sm" type="button" data-teamaddexp>경험 추가하기</button><button class="btn ghost sm" type="button" data-applyopen="${p.id}">취소</button></div></div>`;
  // 원하는 역량을 가장 많이, 가장 자신 있게 보여주는 경험 최대 3개를 미리 고릅니다
  const hit = e => e.tags.filter(c => p.want.includes(c)).length;
  const top = mine.filter(e => hit(e)).sort((a, b) => hit(b) - hit(a) || b.pri - a.pri).slice(0, 3).map(e => e.id);
  return `<form class="sub-form" id="apply-form" data-post="${p.id}" novalidate aria-label="${esc(p.title)} 지원">
    <span class="lbl" id="ap-exp-lbl">포트폴리오로 공유할 경험 (내 경험창고)</span>
    <div class="pick-list" role="group" aria-labelledby="ap-exp-lbl" aria-describedby="ap-exp-err">${mine.map(e => `<label class="pick-exp"><input type="checkbox" name="exp" value="${esc(e.title)}" ${top.includes(e.id) ? 'checked' : ''}>
      <span><b>${esc(e.title)}</b><small>${esc(e.role)}, ${esc(e.r || '결과 미입력')}</small><small>${e.tags.map(t => p.want.includes(t) ? `<span class="tg on">${t}</span>` : t).join(', ')}</small></span></label>`).join('')}</div>
    <p class="field-err" id="ap-exp-err" data-err="exp" hidden></p>
    <label for="ap-link">포트폴리오 링크 (선택)</label>
    <input id="ap-link" name="link" inputmode="url" placeholder="노션, 깃허브, 드라이브 링크">
    <label for="ap-msg">한마디</label>
    <textarea id="ap-msg" name="msg">안녕하세요, ${esc(p.roles[0] || '팀원')}${josa(p.roles[0] || '팀원', '을', '를')} 맡고 싶습니다. ${esc(p.meet)} 일정 가능합니다.</textarea>
    <div class="post-act"><button class="btn accent sm" type="submit">포트폴리오 붙여 지원하기</button><button class="btn ghost sm" type="button" data-applyopen="${p.id}">취소</button></div>
  </form>`;
}

const team_errP = (name, id) => `<p class="field-err" id="${id}" data-err="${name}" hidden></p>`;
function postForm(){
  if(!ui.wantDraft) ui.wantDraft = new Set(team_gapWant());
  const want = ui.wantDraft, d = team_draft;
  const mine = doneExps(), open = team_openActs();
  const act = open.find(a => a.id === +(d.act || ui.teamAct)) || open[0];
  const v = (k, fb = '') => esc(d[k] ?? fb);
  const gaps = store.job ? gapsFor(store.job).map(x => x.c) : [];
  const hint = gaps.length ? `지원 직무 ${esc(store.job)}에 모자란 역량을 미리 골랐습니다. 이 역량을 가진 팀원을 만나면 함께 채울 수 있습니다` : '활동 추천에서 고른 채울 역량을 미리 골랐습니다';
  const picked = d.exp ? new Set(d.exp) : null;
  return `<form class="sub-form" id="post-form" novalidate aria-label="모집글 쓰기">
    <label for="pf-act">활동</label>
    <select id="pf-act" name="act" aria-describedby="pf-close-err">${open.map(a => `<option value="${a.id}" ${a.id === act.id ? 'selected' : ''}>${esc(a.title)} (마감 ${md(a.deadline)})</option>`).join('')}</select>
    <label for="pf-title">제목</label>
    <input id="pf-title" name="title" value="${v('title')}" placeholder="예: ${esc(act.title)} 같이 할 팀원 구해요" aria-describedby="pf-title-err">
    ${team_errP('title', 'pf-title-err')}
    <div class="f2">
      <div><label for="pf-need">모집 인원 (나 포함)</label><select id="pf-need" name="need">${[2,3,4,5,6].map(n => `<option ${String(n) === (d.need || '4') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label for="pf-mode">진행 방식</label><select id="pf-mode" name="mode">${['온라인','오프라인','오프라인 혼합'].map(m => `<option ${m === d.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    </div>
    <div class="f2">
      <div><label for="pf-meet">회의 시간</label><input id="pf-meet" name="meet" value="${v('meet')}" placeholder="주 1회 수요일 저녁"></div>
      <div><label for="pf-close">모집 마감</label><input id="pf-close" name="close" type="date" value="${v('close', '2026-11-10')}" min="2026-10-27" max="${act.deadline}" aria-describedby="pf-close-err">${team_errP('close', 'pf-close-err')}</div>
    </div>
    <label for="pf-roles">맡길 역할 (쉼표로 구분)</label>
    <input id="pf-roles" name="roles" value="${v('roles')}" placeholder="자료 조사, 발표">
    <span class="lbl" id="pf-want-lbl">원하는 역량</span>
    <p class="muted want-hint">${hint}</p>
    <div class="chips" role="group" aria-labelledby="pf-want-lbl" aria-describedby="pf-wantc-err">${COMP_KEYS.map(c => `<button type="button" class="chip c-accent" data-want="${c}" aria-pressed="${want.has(c)}">${c}</button>`).join('')}</div>
    ${team_errP('want', 'pf-wantc-err')}
    <label for="pf-want">이런 분을 찾아요</label>
    <textarea id="pf-want" name="wantText" placeholder="함께하고 싶은 사람, 꼭 지켜 줬으면 하는 조건" aria-describedby="pf-want-err">${v('wantText')}</textarea>
    ${team_errP('wantText', 'pf-want-err')}
    <span class="lbl">내 포트폴리오로 보여줄 경험 (내 경험창고)</span>
    <div class="pick-list">${mine.length ? mine.map(e => `<label class="pick-exp"><input type="checkbox" name="exp" value="${e.id}" ${(picked ? picked.has(String(e.id)) : e.pri === 3) ? 'checked' : ''}><span><b>${esc(e.title)}</b><small>${esc(e.role)}, ${esc(e.r || '결과 미입력')}</small></span></label>`).join('')
      : `<p class="muted" style="margin:0">경험창고에 정리한 경험이 없습니다. 경험 없이도 올릴 수 있고, <button class="linkbtn" type="button" data-teamaddexp>경험 추가</button> 뒤에 붙일 수도 있습니다</p>`}</div>
    <label for="pf-link">포트폴리오 링크 (선택)</label>
    <input id="pf-link" name="link" value="${v('link')}" inputmode="url" placeholder="노션, 깃허브, 드라이브 링크">
    <div class="post-act"><button class="btn accent sm" type="submit">모집글 올리기</button><button class="btn ghost sm" type="button" data-postwrite>취소</button></div>
  </form>`;
}

// 발표 슬라이드의 세 근거 이름(역량 DB, 참여 의향, 모집 조건)으로 매칭을 보여줍니다. 참여 의향은 점수에 넣지 않고 참고로만 붙입니다
const team_seats = p => p.status === 'closed' ? '모집 마감' : `인원 ${Math.max(0, p.need - p.filled)}명 더`;
function team_intent(p){
  if(store.apps[p.id]) return {k: 'ok', text: '이 글에 지원함'};
  return team_actExp(actById(p.act)) ? {k: 'ok', text: '이 활동을 경험창고에 담음'} : {k: 'dim', text: '이 활동을 아직 담지 않음'};
}

// 매칭 %가 어디서 왔는지: 두 쪽의 값과 근거, 그리고 합치는 방법
function team_calc(p, f){
  const t = f.time;
  const row = (k, v, val) => `<div><dt>${k}</dt><dd><span>${v}</span><b class="${team_cls(val)}">${team_pc(val)}</b></dd></div>`;
  const fillTxt = f.fillS == null ? '부족 역량을 고르지 않아 모름' : f.fills.length ? `내 부족 역량 ${f.fills.join(', ')}${josa(f.fills.at(-1), '을', '를')} 작성자가 채움` : '작성자 경험이 내 부족 역량을 채우지 않음';
  return `<h3 class="sm">매칭 ${f.pct}% 계산</h3>
    <dl class="calc">
      ${row('내가 이 팀에 맞는 정도', `역량 DB: 원하는 역량 ${p.want.length}개 중 ${f.meets.length}개를 내 경험으로 증명`, f.a)}
      ${row('이 팀이 나에게 맞는 정도', `역량 DB: ${fillTxt}. 모집 조건: <span class="${TEAM_TIME_CLS[t.k]}">${t.text}</span>${t.score == null ? '' : ` (${esc(p.meet)})`}, ${team_seats(p)}${t.score == null ? '. 모르는 쪽은 빼고 계산' : ''}`, f.b)}
      ${row('매칭', '두 값의 조화평균. 한쪽이 낮으면 다른 쪽이 높아도 매칭이 낮아집니다', f.h)}
      <div><dt>참여 의향</dt><dd><span class="${team_intent(p).k}">${team_intent(p).text}</span><span class="dim">점수 밖, 참고</span></dd></div>
    </dl>
    ${t.k === 'off' ? `<p class="calc-more"><a class="go" href="#activities">활동 추천에서 캘린더 연결</a></p>` : ''}`;
}

// 내 글의 예시 지원자 순위
function team_applicantList(p){
  const list = team_applicants(p);
  if(!list.length) return '';
  return `<h3 class="sm">지원이 오면 이 순서로 보여줍니다 (예시 지원자, 데모)</h3>
    <ol class="cand">${list.map(({x, a, b, pct, meets, time}) => `<li><span class="cand-h"><b>${esc(x.name)}</b> ${esc(x.major)}<b class="cand-pct ${team_cls(pct / 100)}">매칭 ${pct}%</b></span>
      <span>우리 팀에 맞는 정도 <b class="${team_cls(a)}">${team_pc(a)}</b>${meets.length ? `, ${meets.join(', ')} 증명` : ''}</span>
      <span>우리 팀이 이 사람에게 맞는 정도 <b class="${team_cls(b)}">${team_pc(b)}</b>, <span class="${TEAM_TIME_CLS[time.k]}">${time.text}</span></span></li>`).join('')}</ol>`;
}

// 원하는 역량마다 내 경험으로 보여줄 수 있는지, 비었다면 어디서 채울지
function team_wantCover(p, f){
  return `<h3 class="sm">원하는 역량과 내 경험</h3>
    <ul class="want-cover">${p.want.map(c => {
      const pr = f.proofs.find(x => x.c === c);
      return pr ? `<li><b>${c}</b><span class="ok">내 경험 ${team_expLink(pr.e)}${josa(showTitle(pr.e), '으로', '로', true)} 보여줄 수 있습니다</span></li>`
        : `<li><b>${c}</b><span class="miss">아직 내 경험창고에 없습니다</span><a class="go" href="${link.acts(c)}">${c} 채울 활동</a></li>`;
    }).join('')}</ul>
    <p class="cover-sum">${f.miss.length ? `원하는 역량 ${p.want.length}개 중 ${f.proofs.length}개를 내 경험으로 보여줄 수 있습니다` : `원하는 역량 ${p.want.length}개를 모두 내 경험으로 보여줄 수 있습니다`}</p>`;
}

function postBody(p, f, i){
  const it = actById(p.act);
  const app = store.apps[p.id];
  let act;
  if(p.mine) act = `<span class="applied">아직 지원자가 없습니다</span><button class="btn ghost sm" type="button" data-unpost="${p.id}">내리기</button>`;
  else if(app) act = `<span class="applied">지원 완료, 경험 ${app.exps.length}개 공유</span><button class="btn ghost sm" type="button" data-unapply="${p.id}">지원 취소</button>`;
  else if(p.status === 'closed') act = `<button class="btn sm" type="button" disabled>모집 마감</button>`;
  else act = `<button class="btn accent sm" type="button" data-applyopen="${p.id}" aria-expanded="${ui.applyFor === p.id}">포트폴리오 붙여 지원하기</button>`;
  const shared = app ? app.exps.map(t => team_expByTitle(t)) : [];
  return `<div class="post-body" id="post-body-${esc(p.id)}">
    <div class="author"><span class="avatar" style="background:${p.mine ? 'var(--accent)' : AV[i % AV.length]}" aria-hidden="true">${esc(p.name.slice(0, 1))}</span><span><b>${esc(p.name)}</b> ${esc(p.major)}</span></div>
    <dl class="pcond">
      <div><dt>모집 인원</dt><dd>${p.filled}/${p.need}명, ${p.need - p.filled}명 더</dd></div>
      <div><dt>진행</dt><dd>${esc(p.mode)}, ${esc(p.region)}</dd></div>
      <div><dt>회의 시간</dt><dd>${esc(p.meet)}</dd></div>
      <div><dt>모집 마감</dt><dd>${md(p.close)}${actDday(p.close) >= 0 ? ` (D-${actDday(p.close)})` : ''}</dd></div>
    </dl>
    <div class="want-box"><h3 class="sm">이런 분을 찾아요</h3>
      <div class="tags">${p.roles.map(r => `<span class="role">${esc(r)}</span>`).join('')}${p.want.map(c => `<span class="tg ${f.proofs.some(x => x.c === c) ? 'on' : ''}">${c}</span>`).join('')}</div>
      ${p.wantText ? `<p>${esc(p.wantText)}</p>` : ''}</div>
    <div class="pf"><h3 class="sm">${p.mine ? '내 포트폴리오' : '작성자 포트폴리오'} ${p.portfolio.length}개</h3>
      ${p.portfolio.map(x => `<div class="pf-card"><b>${esc(x.title)}</b><span>${esc(x.role)}, ${esc(x.result)}</span><div class="tags">${x.tags.map(t => `<span class="tg ${ui.fill.has(t) ? 'on' : ''}">${t}</span>`).join('')}</div></div>`).join('') || '<p class="muted">공유한 경험이 없습니다</p>'}
      ${p.link ? `<span class="pf-link">링크 첨부: <b>${esc(p.link)}</b> (데모)</span>` : ''}</div>
    ${p.mine ? '' : `${team_wantCover(p, f)}
      ${team_calc(p, f)}`}
    ${p.mine ? team_applicantList(p) : ''}
    ${shared.length ? `<p class="shared">공유한 경험: ${app.exps.map((t, k) => shared[k] ? team_expLink(shared[k]) : esc(t)).join(', ')}</p>` : ''}
    <div class="post-act">${act}${p.mine ? '' : `<button class="btn ghost sm" type="button" data-cmp="${p.id}" aria-expanded="${ui.cmp === p.id}">${ui.cmp === p.id ? '일정 비교 닫기' : '일정 비교'}</button>`}<a class="btn ghost sm" href="${link.acts('', p.act)}">활동 분석 보기</a><button class="btn ghost sm" type="button" data-teamcopy="${esc(p.id)}">링크 복사</button></div>
    ${app || p.mine ? team_nextStep(p) : ''}
    ${ui.applyFor === p.id ? applyForm(p) : ''}
    ${ui.cmp === p.id && it ? `<h3 style="margin:16px 0 10px">${esc(p.name)}님과 일정 비교</h3>${weekGrid(it, p)}` : ''}
  </div>`;
}

// 접힌 줄에서도 맡을 역할과 작성자 경험을 훑어볼 수 있게
function team_peek(p){
  const pf = p.portfolio[0];
  return `<span class="post-peek">${p.roles.length ? `<span>맡을 역할 <b>${p.roles.map(esc).join(', ')}</b></span>` : ''}${pf ? `<span>${p.mine ? '내' : '작성자'} 경험 <b>${esc(pf.title)}</b>${p.portfolio.length > 1 ? ` 외 ${p.portfolio.length - 1}개` : ''}</span>` : ''}</span>`;
}

// 넓은 화면의 오른쪽 칸: 지금 목록의 글들이 원하는 역량에 맞춰 내가 보여줄 경험
function team_minePanel(act, rows){
  const want = [...new Set(rows.filter(r => !r.p.mine && r.p.status !== 'closed').flatMap(r => r.p.want))];
  const mine = doneExps(), hit = e => e.tags.filter(c => want.includes(c));
  const top = mine.filter(e => hit(e).length).sort((a, b) => hit(b).length - hit(a).length || b.pri - a.pri).slice(0, 3);
  const missing = want.filter(c => !mine.some(e => e.tags.includes(c)));
  return `<aside class="mine-panel" aria-labelledby="mine-panel-h">
    <h2 id="mine-panel-h">${act ? '이 활동에서' : '지금 목록에서'} 팀원에게 보여줄 내 경험</h2>
    ${want.length ? `<p class="muted">이 글들이 원하는 역량: ${want.join(', ')}</p>
    ${top.length ? `<ul class="mine-exps">${top.map(e => `<li>${team_expLink(e)}<small><span class="tg on">${hit(e).join(', ')}</span> 증명, ${esc(e.r || '결과 미입력')}</small></li>`).join('')}</ul>`
      : `<p class="muted">원하는 역량을 보여줄 경험이 경험창고에 아직 없습니다</p>`}
    ${missing.length ? `<p class="mine-miss">경험이 없는 역량 ${missing.map(c => `<a class="go" href="${link.acts(c)}">${c} 채울 활동</a>`).join('')}</p>` : ''}`
    : `<p class="muted">모집중인 글이 생기면 그 글들이 원하는 역량에 맞는 경험을 여기서 골라 보여줍니다</p>`}
    <button class="btn ghost sm" type="button" data-teamaddexp>경험 추가</button>
    <h3 class="sm">매칭은 양쪽을 다 봅니다</h3>
    <dl class="calc-key"><div><dt>내가 이 팀에 맞는 정도</dt><dd>역량 DB: 원하는 역량 중 내 경험으로 증명한 비율</dd></div><div><dt>이 팀이 나에게 맞는 정도</dt><dd>역량 DB: 내 부족 역량 채움 60%. 모집 조건: 회의 시간 40%, 인원은 함께 표시. 모르는 쪽은 빼고 계산</dd></div><div><dt>매칭</dt><dd>두 값의 조화평균. 한쪽만 높으면 낮게 나옵니다</dd></div><div><dt>참여 의향</dt><dd>지원했는지, 활동을 경험창고에 담았는지. 점수 밖 참고</dd></div></dl>
  </aside>`;
}

// 내 지원 현황: 지원한 글과 내가 올린 글. 누르면 그 활동으로 좁혀 글을 엽니다
function team_myStatus(posts){
  const applied = Object.entries(store.apps).map(([id, a]) => ({p: posts.find(x => x.id === id), a})).filter(x => x.p);
  const mine = posts.filter(p => p.mine);
  if(!applied.length && !mine.length) return '';
  const row = (p, meta, st) => `<li><button type="button" class="my-row" data-mypost="${esc(p.id)}" aria-current="${ui.openPost === p.id}">
    <span class="my-t"><b>${esc(p.title)}</b><small>${meta}</small></span>${st}</button></li>`;
  const planSt = p => { const ex = team_actExp(actById(p.act)); return ex ? `<span class="my-s warn">경험창고에 담음</span>` : `<span class="my-s">경험창고에 아직 없음</span>`; };
  return `<section class="my-status" aria-labelledby="my-status-h">
    <h2 id="my-status-h">내 지원 현황</h2>
    <div class="my-groups">
      ${applied.length ? `<div><h3 class="sm">지원한 글 ${applied.length}개</h3><ul class="my-rows">${applied.map(({p, a}) =>
        row(p, `${esc(actById(p.act)?.title || '')}, 경험 ${a.exps.length}개 공유, ${esc(a.at)} 지원`, planSt(p))).join('')}</ul></div>` : ''}
      ${mine.length ? `<div><h3 class="sm">내가 올린 글 ${mine.length}개</h3><ul class="my-rows">${mine.map(p =>
        row(p, `${esc(actById(p.act)?.title || '')}, ${p.need}명 모집, 마감 ${md(p.close)}`, `<span class="my-s">지원자 0명</span>`)).join('')}</ul></div>` : ''}
    </div>
  </section>`;
}

function team_empty(act, posts){
  const closed = (act ? posts.filter(p => p.act === act.id) : posts).filter(p => p.status === 'closed').length;
  const where = act ? `${esc(act.title)}에는 ` : '';
  return `<div class="empty"><p>${where}${ui.openOnly ? '모집중인' : '올라온'} 글이 아직 없습니다. 먼저 모집글을 올려 팀원을 구해 보세요</p>
    <div class="go-row">${ui.writing ? '' : `<button class="go" type="button" data-postwrite>${act ? '이 활동으로 ' : ''}모집글 쓰기</button>`}
      ${ui.openOnly && closed ? `<button class="go" type="button" data-teamshowclosed>마감된 글 ${closed}개도 보기</button>` : ''}
      ${act ? `<button class="go" type="button" data-teamact="">전체 활동 보기</button>` : `<a class="go" href="#activities">활동 추천에서 활동 고르기</a>`}</div></div>`;
}

// 열고 닫을 때 초점이 갈 곳: 연 지원서, 지원 뒤 다음 단계, 쓰기 칸, 올린 글
function team_planFocus(posts){
  if(team_focus) return;
  if(ui.applyFor && ui.applyFor !== team_seen.applyFor) team_focus = {sel: '#apply-form input[name=exp], [data-teamaddexp]', block: 'center'};
  else if(!ui.applyFor && team_seen.applyFor){
    const id = team_seen.applyFor;
    team_focus = store.apps[id] && !team_seen.apps.has(id) ? {sel: `#post-body-${id} .next-step :is(a,button)`, block: 'center'} : {sel: `[data-applyopen="${id}"]`};
  }
  else if(ui.writing && !team_seen.writing) team_focus = {sel: '#pf-title', block: 'center'};
  else if(!ui.writing && team_seen.writing) team_focus = store.posts.length > team_seen.posts ? {sel: `[data-open="${ui.openPost}"]`, block: 'start'} : {sel: '.board-tools [data-postwrite]'};
}

function renderTeam(){
  const posts = allPosts();
  if(store.posts.length > team_seen.posts) team_draft = {};
  team_planFocus(posts);
  const act = actById(ui.teamAct);
  const all = act ? posts.filter(p => p.act === act.id) : posts;
  let rows = all.map(p => ({p, f: postFit(p)}));
  if(ui.openOnly) rows = rows.filter(r => r.p.status !== 'closed');
  rows.sort(ui.teamSort === 'close' ? (a, b) => a.p.close.localeCompare(b.p.close)
    : (a, b) => (a.p.status === 'closed') - (b.p.status === 'closed') || (b.p.mine ? 1 : 0) - (a.p.mine ? 1 : 0) || b.f.pct - a.f.pct);
  const cnt = id => posts.filter(p => p.act === id && p.status !== 'closed').length;
  // 활동이 70개 가까이 되므로 레일과 선택 상자에는 모집글이 있는 활동(과 지금 고른 활동)만, 모집중 많은 순으로
  const acts = team_railActs(posts, act, cnt);
  const ev = act ? evaluate(act) : null;
  $('#view-team').innerHTML = `
  <div class="view-h"><h1>팀원 매칭</h1><p class="team-phase">2단계 기능 미리보기: 쌓인 역량 DB와 참여 의향, 모집 조건으로 팀원을 연결합니다</p></div>
  <div class="team-grid">
    <aside class="rail" aria-label="활동 고르기">
      <h2 class="lst">활동별 모집중</h2>
      <ul class="rail-list">
        <li><button type="button" data-teamact="" aria-pressed="${!act}">전체 활동<span>${posts.filter(p => p.status !== 'closed').length}</span></button></li>
        ${acts.map(a => `<li><button type="button" class="${cnt(a.id) ? '' : 'zero'}" data-teamact="${a.id}" aria-pressed="${act?.id === a.id}">${esc(a.title)}<span>${cnt(a.id)}</span></button></li>`).join('')}
      </ul>
      <p class="muted rail-note">모집글이 없는 활동은 <a href="#activities">활동 추천</a>에서 고른 뒤 첫 모집글을 쓸 수 있습니다</p>
    </aside>
    <section aria-label="모집글">
      ${team_myStatus(posts)}
      <select class="team-act-select" id="team-act-select" aria-label="활동 고르기"><option value="">전체 활동</option>${acts.map(a => `<option value="${a.id}" ${act?.id === a.id ? 'selected' : ''}>${esc(a.title)} (${cnt(a.id)})</option>`).join('')}</select>
      ${act ? `<div class="ctx"><b>${esc(act.title)}</b><span class="muted">${act.kind}, ${esc(act.team)}, D-${ev.d}, 적합도 ${ev.score}점${ev.covered.length ? `, ${ev.covered.join(', ')} 채움` : ''}</span><a class="go" href="${link.acts('', act.id)}">활동 분석 보기</a></div>` : ''}
      <div class="board-wrap"><div class="board">
      <h2 class="team-sr">모집글 목록</h2>
      <div class="board-tools">
        <div class="seg" role="group" aria-label="정렬">${[['fit','매칭 높은 순'],['close','마감 빠른 순']].map(([k, v]) => `<button type="button" data-tsort="${k}" aria-pressed="${ui.teamSort === k}">${v}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" id="open-only" ${ui.openOnly ? 'checked' : ''}> 모집중만</label>
        <span class="count">${rows.length}개</span>
        <button class="btn sm ${ui.writing ? 'ghost' : 'accent'}" type="button" data-postwrite aria-expanded="${ui.writing}">${ui.writing ? '쓰기 닫기' : '모집글 쓰기'}</button>
      </div>
      ${ui.writing ? postForm() : ''}
      ${rows.length ? rows.map(({p, f}, i) => `<div class="post ${p.mine ? 'mine' : ''} ${p.status === 'closed' ? 'closed' : ''}" style="view-transition-name:post-${esc(p.id)}">
        <button type="button" class="post-head" data-open="${p.id}" aria-expanded="${ui.openPost === p.id}" ${ui.openPost === p.id ? `aria-controls="post-body-${esc(p.id)}"` : ''}>
          <span>${act ? '' : `<span class="post-act-name">${esc(actById(p.act)?.title || '')}</span>`}<span class="post-title"><span class="badge ${p.mine ? 'mine' : p.status}">${p.mine ? '내 글' : p.status === 'closed' ? '마감' : store.apps[p.id] ? '지원함' : '모집중'}</span>${esc(p.title)}</span>
            <span class="post-meta"><span>${esc(p.name)}</span><span>${p.filled}/${p.need}명</span><span>${esc(p.mode)}</span><span>마감 ${md(p.close)}</span><span>원하는 역량 ${p.want.join(', ')}</span></span>
            ${team_peek(p)}${p.mine ? '' : `<span class="post-why"><span>내가 이 팀에 맞는 정도 <b class="${team_cls(f.a)}">${team_pc(f.a)}</b> (역량 DB: 원하는 역량 ${f.meets.length}/${p.want.length} 증명)</span><span>이 팀이 나에게 맞는 정도 <b class="${team_cls(f.b)}">${team_pc(f.b)}</b> (역량 DB: ${f.fillS == null ? '부족 역량 미선택' : `부족 역량 채움 ${f.fills.length ? f.fills.join(', ') : '없음'}`}, 모집 조건: <span class="${TEAM_TIME_CLS[f.time.k]}">${f.time.k === 'off' ? '회의 시간 모름' : f.time.text}</span>, ${team_seats(p)})</span><span>참여 의향 <span class="${team_intent(p).k}">${team_intent(p).text}</span></span></span>`}</span>
          ${p.mine ? '' : `<span class="post-fit"><b data-n="p${esc(p.id)}">${f.pct}%</b><small>매칭</small></span>`}
        </button>
        ${ui.openPost === p.id ? postBody(p, f, i) : ''}
      </div>`).join('') : team_empty(act, posts)}
      </div>${team_minePanel(act, rows)}</div>
    </section>
  </div>`;
  Object.assign(team_seen, {applyFor: ui.applyFor, writing: ui.writing, apps: new Set(Object.keys(store.apps)), posts: store.posts.length});
  const fc = team_focus; team_focus = null;
  const el = fc && document.querySelector('#view-team ' + fc.sel.split(', ').join(', #view-team '));
  if(el){ el.focus({preventScroll: true}); el.scrollIntoView({block: fc.block || 'nearest', behavior: REDUCED.matches ? 'auto' : 'smooth'}); }
}

// ---------- 입력 검사: 토스트 대신 칸 옆에 이유를 적습니다 ----------
function team_setErr(form, name, msg){
  const p = form.querySelector(`[data-err="${name}"]`); if(!p) return;
  p.textContent = msg; p.hidden = !msg;
  const field = form.elements[name];
  if(field && field.setAttribute) field.setAttribute('aria-invalid', String(!!msg));
}
function team_postErrors(f){
  const a = actById(f.elements.act.value), close = f.elements.close.value;
  return {
    title: f.elements.title.value.trim() ? '' : '제목을 적어 주세요. 활동 이름과 찾는 역할이 들어가면 눈에 잘 띕니다',
    close: !close ? '' : actDday(close) < 0 ? '오늘 이후 날짜를 고르세요'
      : a && close > a.deadline ? `활동 마감(${md(a.deadline)})보다 늦습니다. 그 전으로 잡아 주세요` : '',
    want: (ui.wantDraft || ui.fill).size ? '' : '원하는 역량을 하나 이상 고르세요',
    wantText: f.elements.wantText.value.trim() ? '' : '어떤 분을 찾는지 한 줄이라도 적어 주세요'
  };
}
const team_FIRST = {title: '#pf-title', close: '#pf-close', want: '[data-want]', wantText: '#pf-want'};

on('submit', e => {
  const f = e.target;
  if(f.id === 'apply-form'){
    const n = f.querySelectorAll('input[name=exp]:checked').length;
    team_setErr(f, 'exp', n ? '' : '공유할 경험을 하나 이상 고르세요. 원하는 역량이 붙은 경험이 먼저 보입니다');
    if(n) return false;
    e.preventDefault(); f.querySelector('input[name=exp]')?.focus(); return true;
  }
  if(f.id !== 'post-form') return false;
  const errs = team_postErrors(f);
  Object.entries(errs).forEach(([k, m]) => team_setErr(f, k, m));
  const bad = Object.keys(errs).find(k => errs[k]);
  if(!bad) return false;
  e.preventDefault(); f.querySelector(team_FIRST[bad])?.focus(); return true;
});

// 쓰던 모집글 보관 + 이미 틀렸다고 표시한 칸은 고치는 즉시 다시 확인
function team_keepDraft(e){
  const f = e.target.form;
  if(!f || f.id !== 'post-form') return false;
  const t = e.target;
  if(t.name === 'exp') team_draft.exp = [...f.querySelectorAll('input[name=exp]:checked')].map(x => x.value);
  else if(t.name) team_draft[t.name] = t.value;
  if(t.name === 'act'){ const a = actById(t.value); if(a) f.elements.close.max = a.deadline; }
  const errs = team_postErrors(f);
  ['title', 'close', 'wantText'].forEach(k => { if(f.elements[k].getAttribute('aria-invalid') === 'true' || (k === 'close' && (t.name === 'close' || t.name === 'act'))) team_setErr(f, k, errs[k]); });
  return false;
}
on('input', team_keepDraft);
on('change', team_keepDraft);
on('input', e => {
  const f = e.target.form;
  if(f?.id === 'apply-form' && e.target.name === 'exp' && f.querySelector('input[name=exp]:checked')) team_setErr(f, 'exp', '');
  return false;
});

on('click', e => {
  const el = e.target.closest('[data-teamcopy],[data-teamexp],[data-teamplan],[data-mypost],[data-teamshowclosed],[data-teamaddexp],[data-want],[data-postwrite]');
  if(!el || !el.closest('#view-team')) return false;
  const d = el.dataset;
  if(d.teamcopy){
    const p = allPosts().find(x => x.id === d.teamcopy);
    if(p) copy(`${location.origin}${location.pathname}#team?act=${p.act}&post=${enc(p.id)}`, '모집글 링크를 복사했습니다. 받은 사람은 이 글이 열린 채로 봅니다');
    return true;
  }
  if(d.teamexp){ e.preventDefault(); ui.flashExp = +d.teamexp; go('#me'); return true; }
  if(d.teamplan){
    planActivity(+d.teamplan);
    const ex = team_actExp(actById(d.teamplan));
    if(ex) team_focus = {sel: `[data-teamexp="${ex.id}"]`, block: 'nearest'};
    render(); return true;
  }
  if(d.mypost){
    const p = allPosts().find(x => x.id === d.mypost); if(!p) return true;
    ui.teamAct = p.act; ui.openPost = p.id; ui.applyFor = null; ui.cmp = null;
    if(p.status === 'closed') ui.openOnly = false;
    team_focus = {sel: `[data-open="${p.id}"]`, block: 'start'};
    render(); return true;
  }
  if(d.teamshowclosed !== undefined){ ui.openOnly = false; render(); return true; }
  if(d.teamaddexp !== undefined){ openDrawer(); return true; }
  // 원하는 역량 칩과 쓰기 열고 닫기는 main.js가 처리합니다. 여기서는 오류 문구와 보관한 초안만 정리합니다
  if(d.want){ const f = $('#post-form'); if(f) queueMicrotask(() => { if((ui.wantDraft || ui.fill).size) team_setErr(f, 'want', ''); }); }
  if(d.postwrite !== undefined) team_draft = {};
  return false;
});
