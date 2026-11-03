// 경험창고: 직무 기준 역량 지도, 빈 역량을 채울 활동(필요순), 경험창고 목록

function ring(p){
  const r = 24, c = 2 * Math.PI * r, col = p >= 80 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--bad)';
  return `<svg class="ring" viewBox="0 0 56 56" role="img" aria-label="정리 완성도 ${p}%"><circle cx="28" cy="28" r="${r}" fill="none" style="stroke:var(--grid)" stroke-width="5"/><circle class="arc" cx="28" cy="28" r="${r}" fill="none" style="stroke:${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/><text x="28" y="33" text-anchor="middle">${p}</text></svg>`;
}

// 참여 예정 활동의 팀 상태: 내가 올린 모집글 수, 내가 지원한 팀 수. 둘 다 없으면 빈 글자
function meTeamState(actId){
  const posts = store.posts.filter(p => p.act === actId).length;
  const applied = Object.keys(store.apps).filter(id => [...POSTS, ...store.posts].find(p => p.id === id)?.act === actId).length;
  return [posts ? `모집글 ${posts}개` : '', applied ? `팀 지원 ${applied}곳` : ''].filter(Boolean).join(', ');
}
// 이 경험을 배정한 지원서 문항 (번호는 지원서 전체 배정 화면과 같은 1부터)
const meAssignedQs = e => store.app.questions.map((q, i) => ({q, n: i + 1})).filter(x => store.app.assign[x.q.id] === e.id);

// 경험 카드 아래 한 줄: 참여 예정이면 팀 상태, 마친 경험이면 배정된 문항
function meExpLine(e, a){
  if(e.planned){
    const ts = a ? meTeamState(a.id) : '';
    return ts ? `<p class="exp-link"><b class="ok">${ts}</b><a class="go" href="${link.team(a.id)}">팀원 모집에서 보기</a></p>` : '';
  }
  const qs = meAssignedQs(e);
  return qs.length ? `<p class="exp-link"><b class="ac">지원서 ${qs.map(x => x.n).join(', ')}번 문항에 배정</b><a class="go" href="#apply">지원서 배정 보기</a></p>` : '';
}

// 모자란 만큼 많이 채우는 활동 먼저, 같으면 직무에 중요한 역량까지 쌓이는 활동, 그다음 마감 빠른 순
function fillActivities(job, only){
  const lack = Object.fromEntries(coverage(job).map(x => [x.c, x.lack]));
  return ACTIVITIES
    .filter(a => actDday(a.deadline) >= 0)
    .map(a => {
      const fills = a.builds.filter(c => lack[c] > 0 && (!only || c === only));
      const gain = fills.reduce((s, c) => s + lack[c], 0);
      const extra = a.builds.filter(c => !fills.includes(c) && (JOBS[job][c] || 0) >= 2);
      const weight = a.builds.reduce((s, c) => s + (JOBS[job][c] || 0), 0);
      return {a, fills, extra, gain, weight, d: actDday(a.deadline)};
    })
    .filter(x => x.fills.length)
    .sort((x, y) => y.gain - x.gain || y.weight - x.weight || x.d - y.d);
}

function fillPanel(job, gaps){
  if(!job) return '';
  if(!gaps.length) return `<div class="box"><h2 class="box-h">채울 활동</h2><p class="muted" style="margin:0 0 10px">${job} 직무가 요구하는 역량은 모두 갖췄습니다</p><a class="go" href="#activities">더 키울 활동 보기</a></div>`;
  const only = gaps.some(g => g.c === ui.libGap) ? ui.libGap : null;
  const list = fillActivities(job, only).slice(0, 5);
  return `<div class="box">
    <h2 class="box-h">빈 역량을 채울 활동</h2>
    <p class="muted" style="margin:0 0 10px">더 많이 모자란 역량을 채우는 활동부터 보여줍니다</p>
    <div class="chips" role="group" aria-label="역량 고르기" style="margin-bottom:12px">
      <button type="button" class="chip c-accent" data-libgap="" aria-pressed="${!only}">전체</button>
      ${gaps.map(g => `<button type="button" class="chip c-accent" data-libgap="${g.c}" aria-pressed="${only === g.c}">${g.c}<small>${g.lack >= 1 ? '많이 부족' : '조금 부족'}</small></button>`).join('')}
    </div>
    ${list.length ? `<ol class="acts">${list.map(({a, fills, extra, d}) => { const inV = !!plannedExp(a);
      return `<li class="p-row">${actThumb(a)}<div>
        <div class="act-top"><b>${esc(a.title)}</b><span class="act-d ${d <= 7 ? 'urgent' : ''}">D-${d}</span></div>
        <div class="act-meta">${a.kind}, ${esc(a.host)}, ${actHoursText(a)}</div>
        <div class="act-why">모자란 ${fills.join(', ')} 채움${extra.length ? `, 직무에 중요한 ${extra.join(', ')}도 쌓임` : ''}</div>
        <div class="tags">${a.builds.map(c => `<span class="tg ${fills.includes(c) ? 'on' : ''}">${c}</span>`).join('')}</div>
        <div class="act-btns"><a class="btn ghost sm" href="${link.acts(fills[0], a.id)}">일정과 적합도 보기</a>
          <button class="btn ghost sm" type="button" data-plan="${a.id}" ${inV ? 'disabled' : ''}>${inV ? '담았습니다' : '경험창고에 담기'}</button>
          ${inV ? `<a class="go" href="${link.team(a.id)}" data-planned-next="${a.id}">팀원 찾기</a>` : ''}</div>
      </div></li>`; }).join('')}</ol>` : `<p class="muted" style="margin:0 0 10px">지금 열려 있는 공고 중에는 이 역량을 채우는 활동이 없습니다</p><a class="go" href="${link.acts(only)}">활동 추천에서 전체 보기</a>`}
  </div>`;
}

function renderMe(){
  const job = store.job, cov = coverage(job);
  const gaps = cov.filter(x => x.st === 'gap').sort((a, b) => b.lack - a.lack);
  const sort = ui.libSort;
  const list = store.exps.map(e => ({e, q: quality(e)}));
  list.sort(sort === 'quality' ? (a, b) => a.q.pct - b.q.pct : (a, b) => b.e.pri - a.e.pri);
  // 방금 담은 경험은 맨 위로
  if(ui.flashExp){ const i = list.findIndex(x => x.e.id === ui.flashExp); if(i > 0) list.unshift(list.splice(i, 1)[0]); }
  const avg = list.length ? Math.round(list.reduce((a, x) => a + x.q.pct, 0) / list.length) : 0;
  const planned = store.exps.filter(e => e.planned).length;
  $('#view-me').innerHTML = `
  <div class="view-h"><h1>경험창고</h1><p>내 경험을 역량으로 구조화한 AI 경험 역량 DB (규칙 기반). ${job ? `${job} 직무 기준으로 채운 역량과 빈 역량을 보여줍니다` : '지원 직무를 고르면 직무 기준으로 빈 역량을 알려 줍니다'}</p></div>
  <div class="me">
    <div>
      <div class="box">
        <h2 class="box-h">${job ? `${job} 직무 기준 역량 지도` : '역량 지도'}</h2>
        <div class="gap-legend"><span><i></i>내 경험</span>${cov.some(x => x.plan) ? '<span><i class="p"></i>참여 예정</span>' : ''}${job ? '<span><i class="n"></i>직무가 요구하는 수준</span>' : ''}</div>
        ${cov.map(x => `<div class="gap-row"><span>${x.c}</span><span class="track"><span class="have" style="width:${(x.have / 3 * 100).toFixed(0)}%"></span>${x.plan ? `<span class="pl" style="left:${(x.have / 3 * 100).toFixed(0)}%;width:${(x.plan / 3 * 100).toFixed(0)}%"></span>` : ''}${x.need ? `<span class="need" style="left:calc(${(x.need / 3 * 100).toFixed(0)}% - 1px)"></span>` : ''}</span>${x.st === 'gap' ? `<a class="st" href="${link.acts(x.c)}" aria-label="${x.c} 부족, 활동 찾기">부족, 활동 찾기</a>` : `<span class="st ${x.st}">${x.st === 'ok' ? '충분' : '직무 무관'}</span>`}</div>`).join('')}
        ${meNcs()}
        ${gaps.length ? `<div class="tip"><b>${gaps[0].c}</b> 경험이 가장 부족합니다. ${esc(GAP_TIP[gaps[0].c])}
            <div class="go-row">${gaps.map(g => `<a class="go" href="${link.acts(g.c)}">${g.c} 채울 활동</a>`).join('')}</div></div>`
          : job ? `<div class="tip">${job} 직무가 요구하는 역량을 모두 경험으로 보여줄 수 있습니다</div>` : `<div class="tip">위에서 지원 직무를 고르면 부족한 역량을 알려 줍니다<div class="go-row"><button class="go" type="button" data-mejob>직무 고르기</button></div></div>`}
      </div>
      ${fillPanel(job, gaps)}
    </div>
    <div class="lib-list" style="--n:${list.length}">
      <div class="lib-tools">
        <h2 class="lib-h">내 경험</h2>
        <span class="muted">${list.length}개${planned ? `, 참여 예정 ${planned}개` : ''}, 평균 완성도 <b data-n="avg">${avg}%</b>, 보완 필요 ${list.filter(x => x.q.pct < 80).length}개</span>
        <select id="lib-sort" aria-label="정렬">
          <option value="quality" ${sort === 'quality' ? 'selected' : ''}>보완 필요한 순</option>
          <option value="pri" ${sort === 'pri' ? 'selected' : ''}>우선순위 순</option>
        </select>
        <button class="linkbtn" type="button" id="export">JSON 내보내기</button>
        <button class="linkbtn" type="button" id="reset-all">예시로 되돌리기</button>
      </div>
      ${list.length ? list.map(({e, q}, si) => { const a = e.planned && e.actId ? actById(e.actId) : null;
        return `<div class="lib-item ${ui.flashExp === e.id ? 'flash' : ''}" id="exp-${e.id}" style="view-transition-name:lib-${e.id};--si:${si}">
        ${ring(q.pct)}
        <div><p class="exp-title">${esc(showTitle(e))}${e.planned ? '<span class="tag-plan">참여 예정</span>' : ''}</p><div class="exp-meta">${esc(e.when)}, ${esc(e.role)} <span class="stars" role="img" aria-label="우선순위 3 중 ${e.pri}">${'★'.repeat(e.pri)}${'☆'.repeat(3 - e.pri)}</span></div>
          <div class="tags" style="margin-top:8px">${e.tags.map(t => `<span class="tg">${t}</span>`).join('')}</div>
          ${e.planned ? `<p class="muted" style="margin:8px 0 0">아직 역량 지도의 보유 수준에는 넣지 않았습니다. 활동을 마치고 행동과 결과를 채우면 반영됩니다</p>`
            : q.issues.length ? `<ul class="issues">${q.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : `<ul class="issues none"><li>바로 쓸 수 있게 정리되어 있습니다</li></ul>`}
          ${meExpLine(e, a)}
          ${e.used.length ? `<div class="used">이미 쓴 곳: ${esc(e.used.join(', '))}</div>` : ''}
        </div>
        <div class="lib-act">${e.planned
          ? `<button class="btn accent sm" type="button" data-edit="${e.id}" data-done="1">활동 마치고 정리</button>${a ? `<a class="btn ghost sm" href="${link.acts('', a.id)}">활동 보기</a>${meTeamState(a.id) ? '' : `<a class="btn ghost sm" href="${link.team(a.id)}">팀원 모집</a>`}` : ''}`
          : meMainBtn(e)}
          <span class="lib-links"><button class="linkbtn" type="button" data-edit="${e.id}">${e.planned ? '고치기' : '수정'}</button><button class="linkbtn bad" type="button" data-del="${e.id}">삭제</button></span></div>
      </div>`; }).join('') : `<p class="muted">경험이 없습니다. <button class="linkbtn" type="button" data-meadd>경험 추가</button>로 시작하세요</p>`}
    </div>
  </div>`;
}
// 역량 지도의 역량이 NCS 직업기초능력의 어느 영역에 대응하는지 (core.js NCS_MAP)
function meNcs(){
  if(typeof NCS_MAP === 'undefined') return '';
  return `<details class="ncs"><summary>NCS 대응 보기</summary>
    <table><thead><tr><th scope="col">역량</th><th scope="col">NCS 직업기초능력</th></tr></thead>
      <tbody>${COMP_KEYS.map(c => `<tr><th scope="row">${c}</th><td>${esc(NCS_MAP[c] || '대응 영역 없음')}</td></tr>`).join('')}</tbody></table>
    <p class="muted">NCS는 2026년 4월 직업공통능력 7개 영역으로 개편됐습니다. 새 영역 이름은 공식 자료로 확인 중입니다</p>
  </details>`;
}
// 마친 경험의 주 버튼: 배정된 문항이 있으면 그 문항 쓰기(main.js의 data-writeq), 없으면 문항에 써 보기
function meMainBtn(e){
  const x = meAssignedQs(e)[0];
  return x ? `<button class="btn ghost sm" type="button" data-writeq="${x.q.id}">${x.n}번 문항 쓰기</button>` : `<button class="btn ghost sm" type="button" data-try="${e.id}">문항에 써 보기</button>`;
}

on('click', e => {
  const b = e.target.closest('button[data-meadd],button[data-mejob]'); if(!b) return;
  if(b.dataset.meadd !== undefined) openDrawer(); else $('#job').focus();
  return true;
});
