// 틈 진입점: 주소 읽기, 화면 그리기, 모든 클릭과 입력 처리

// ---------- 그리기 ----------
function paint(){
  const navKey = ui.view;
  document.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === navKey ? 'page' : 'false'));
  ['start', 'me', 'activities', 'team', 'write'].forEach(v => { $('#view-' + v).hidden = v !== ui.view; });
  if(ui.view === 'start') renderStart();
  else if(ui.view === 'me') renderMe();
  else if(ui.view === 'activities') renderActivities();
  else if(ui.view === 'team') renderTeam();
  else renderWrite();
  renderNext(); nameThumbs(); moveNavInd(); countUp();
}
// 클릭과 제출로 다시 그릴 때만 자리 이동을 보여줍니다. 타이핑과 슬라이더는 바로 그립니다
let fromClick = false;
['click', 'submit'].forEach(t => document.addEventListener(t, () => { fromClick = true; queueMicrotask(() => { fromClick = false; }); }, true));
function render(anim = fromClick){ anim ? morph(paint) : paint(); }

// ---------- 주소 ----------
let lastView = null;
function route(){
  const raw = location.hash.slice(1);
  const [name, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  // 처음 온 사람은 시작 화면(나를 알려 주고 첫 매칭)부터, 그다음부터는 활동 추천부터
  const view = ROUTES[name] || (startSeen() ? 'activities' : 'start');
  ui.view = view;
  if(name === 'match' || name === 'apply') ui.sub = name;
  if(view === 'activities'){
    if(params.get('fill')) ui.fill = new Set(params.get('fill').split(',').filter(c => COMP_KEYS.includes(c)));
    if(params.get('id')){ ui.selected = +params.get('id'); ui.kind = '전체'; ui.hideClash = false; }
  }
  if(view === 'team' && params.has('act')){
    ui.teamAct = params.get('act') ? +params.get('act') : null; ui.openPost = null; ui.applyFor = null; ui.cmp = null;
    if(params.get('post')) ui.openPost = params.get('post');
  }
  // 매개변수는 한 번 반영하고 주소에서 지웁니다 (같은 연결을 다시 눌러도 동작하도록)
  const canon = '#' + (view === 'write' ? ui.sub : view);
  if(location.hash !== canon) history.replaceState(null, '', canon);
  const entering = lastView !== view;
  if(entering && lastView) $('#toast').classList.remove('show');
  if(entering){ paint(); enterView($('#view-' + view)); } else render(true);
  if(entering || name === 'match' || name === 'apply') window.scrollTo(0, 0);
  if(view === 'team' && params.get('post')) document.querySelector(`[data-open="${CSS.escape(params.get('post'))}"]`)?.scrollIntoView({block: 'start'});
  if(view === 'activities' && params.get('id') && innerWidth <= 1240) $('#act-detail').scrollIntoView({block: 'start'});
  if(view === 'me' && ui.flashExp){ const el = document.getElementById('exp-' + ui.flashExp); if(el && innerWidth <= 1100) el.scrollIntoView({block: 'center'}); }
  lastView = view;
}
function go(hash){ if(location.hash === hash) route(); else location.hash = hash; }

// ---------- 지원 직무 (모든 화면이 같이 씁니다) ----------
function fillJobSelect(){ $('#job').innerHTML = `<option value="">고르지 않음</option>` + Object.keys(JOBS).map(j => `<option ${store.job === j ? 'selected' : ''}>${j}</option>`).join(''); }
$('#job').addEventListener('change', e => {
  store.job = e.target.value; save();
  ui.fill = new Set(gapsFor(store.job).map(g => g.c));
  render();
});

// ---------- 경험 추가와 수정 서랍 ----------
const formTags = new Set();
$('#f-tags').innerHTML = COMP_KEYS.map(c => `<button type="button" class="chip c-accent" data-tag="${c}" aria-pressed="false">${c}</button>`).join('');
function syncTagButtons(){ document.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', String(formTags.has(b.dataset.tag)))); }
function liveHints(){
  const f = $('#add-form');
  const text = ['title', 's', 't', 'a', 'r', 'l'].map(n => f.elements[n].value).join(' ');
  const found = COMP_KEYS.filter(c => COMP[c].some(w => text.includes(w)) && !formTags.has(c));
  $('#f-suggest').innerHTML = found.length ? `본문에서 찾은 역량: ${found.map(c => `<button type="button" class="linkbtn" data-sugg="${c}">${c}</button>`).join(', ')}` : '';
  const a = f.elements.a.value, lines = a.split('\n').filter(s => s.trim()).length;
  $('#f-a-live').textContent = !a.trim() ? '' : /우리|저희/.test(a) ? "'우리' 대신 내가 한 일로 적어 보세요" : lines < 2 ? '한 줄에 하나씩, 두 가지 이상 적으면 더 설득력 있습니다' : '';
  const r = f.elements.r.value;
  $('#f-r-live').textContent = r.trim() && !hasNum(r) ? '숫자를 넣어 보세요. 예: 30% 감소, 1.8배, 24회' : '';
}
function openDrawer(id, done){
  const f = $('#add-form'); f.reset(); formTags.clear();
  ui.editId = id ?? null;
  const e = store.exps.find(x => x.id === id);
  $('#add-h').textContent = e ? (e.planned ? '참여 예정 경험 정리' : '경험 수정') : '경험 추가';
  $('#save-exp').textContent = e ? '수정 저장' : '경험 저장';
  $('#f-done-row').hidden = !(e && e.planned);
  $('#f-done').checked = !!done;
  if(e){
    ['title', 'when', 'role', 's', 't', 'a', 'r', 'l'].forEach(n => { f.elements[n].value = e[n] || ''; });
    if(e.planned){ f.elements.title.value = e.title.replace(/ \(참여 예정\)$/, ''); if(e.role === '참여 예정') f.elements.role.value = ''; }
    f.elements.pri.value = String(e.pri); e.tags.forEach(t => formTags.add(t));
  }
  syncTagButtons(); liveHints();
  $('#drawer').classList.add('open'); $('#f-title').focus();
}
function closeDrawer(){ $('#drawer').classList.remove('open'); }
$('#add-form').addEventListener('input', liveHints);
$('#add-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  if(!formTags.size){ toast('드러나는 역량을 하나 이상 고르세요'); return; }
  const data = {title: f.get('title').trim(), when: f.get('when').trim() || '기간 미입력', role: f.get('role').trim() || '역할 미입력', pri: +f.get('pri'), tags: [...formTags],
    s: f.get('s').trim(), t: f.get('t').trim(), a: f.get('a').trim(), r: f.get('r').trim(), l: f.get('l').trim()};
  if(ui.editId != null){
    const e = store.exps.find(x => x.id === ui.editId);
    if(e.planned && !f.get('done')){ data.title = data.title.endsWith('(참여 예정)') ? data.title : `${data.title} (참여 예정)`; if(data.role === '역할 미입력') data.role = '참여 예정'; }
    Object.assign(e, data);
    if(e.planned && f.get('done')){ e.planned = false; ui.flashExp = e.id; toast('활동을 마친 경험으로 옮겼습니다. 역량 지도에 반영했습니다'); }
    else toast('경험을 수정했습니다');
  } else {
    const exp = {id: Date.now(), ...data, used: []};
    store.exps.push(exp); ui.sel = exp.id; ui.dtab = 'star'; ui.flashExp = exp.id;
    toast('경험을 저장했습니다', {label: '문항에 써 보기', href: '#match'});
  }
  save(); closeDrawer(); render();
});

// ---------- 클릭 ----------
document.addEventListener('click', e => {
  if(runHandlers('click', e)) return;
  const t = e.target, el = t.closest('button');
  if(!el){ if(t.id === 'drawer') closeDrawer(); return; }
  const d = el.dataset;
  // 활동 추천
  if(d.t){ ui.interests.has(d.t) ? ui.interests.delete(d.t) : ui.interests.add(d.t); return render(); }
  if(d.gap){ ui.fill.has(d.gap) ? ui.fill.delete(d.gap) : ui.fill.add(d.gap); return render(); }
  if(d.mode){ ui.mode = d.mode; return render(); }
  if(d.kind){ ui.kind = d.kind; return render(); }
  if(d.actsel){ ui.selected = +d.actsel; render(); if(innerWidth <= 1240) $('#act-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
  // 팀원 모집
  if(d.teamact !== undefined){ ui.teamAct = d.teamact ? +d.teamact : null; ui.openPost = null; ui.applyFor = null; ui.cmp = null; return render(); }
  if(d.open){ ui.openPost = ui.openPost === d.open ? null : d.open; ui.applyFor = null; ui.cmp = null; return render(); }
  if(d.applyopen){ ui.applyFor = ui.applyFor === d.applyopen ? null : d.applyopen; return render(); }
  if(d.unapply){ delete store.apps[d.unapply]; saveApps(); toast('지원을 취소했습니다'); return render(); }
  if(d.cmp){ ui.cmp = ui.cmp === d.cmp ? null : d.cmp; if(!ui.connected) toast('내 일정은 활동 추천에서 캘린더를 연결해야 함께 보입니다'); return render(); }
  if(d.tsort){ ui.teamSort = d.tsort; return render(); }
  if(d.postwrite !== undefined){ ui.writing = !ui.writing; ui.wantDraft = null; return render(); }
  if(d.want){ ui.wantDraft = ui.wantDraft || new Set(ui.fill); ui.wantDraft.has(d.want) ? ui.wantDraft.delete(d.want) : ui.wantDraft.add(d.want); el.setAttribute('aria-pressed', String(ui.wantDraft.has(d.want))); return; }
  if(d.unpost){ store.posts = store.posts.filter(p => p.id !== d.unpost); savePosts(); toast('모집글을 내렸습니다'); return render(); }
  // 지원서
  if(d.s !== undefined){
    ui.q = SAMPLES[+d.s]; ui.sel = null; ui.dtab = 'star';
    // 실제 공채 문항이면 그 회사의 글자 수 제한을 따릅니다
    const known = [...store.app.questions, ...SAMPLE_APP.questions].find(x => x.text === ui.q); if(known) ui.limit = known.limit;
    return render();
  }
  if(d.expsel){ ui.sel = +d.expsel; render(); if(innerWidth <= 1100) $('#exp-detail').scrollIntoView({behavior: 'smooth'}); return; }
  if(d.dtab){ ui.dtab = d.dtab; return render(); }
  if(d.aisel !== undefined){
    const s = TELL.last?.sentences.find(x => x.idx === +d.aisel), ta = $('#draft');
    const at = s ? ta.value.indexOf(s.text.slice(0, 20)) : -1;
    if(at >= 0){ ta.focus(); ta.setSelectionRange(at, at + s.text.length); }
    return;
  }
  if(d.assign){
    const [qid, id] = d.assign.split(':');
    store.app.assign[qid] === +id ? delete store.app.assign[qid] : store.app.assign[qid] = +id;
    save(); renderNext(); return renderApplyResults();
  }
  if(d.qdel){
    if(store.app.questions.length <= 1) return toast('문항은 하나 이상 있어야 합니다');
    store.app.questions = store.app.questions.filter(q => q.id !== d.qdel); delete store.app.assign[d.qdel]; save(); return renderApply();
  }
  if(d.writeq){
    const q = store.app.questions.find(x => x.id === d.writeq);
    ui.q = q.text; ui.limit = q.limit; ui.sel = store.app.assign[q.id]; ui.dtab = 'draft';
    return go('#match');
  }
  // 내 역량
  if(d.libgap !== undefined){ ui.libGap = d.libgap || null; return render(); }
  if(d.edit) return openDrawer(+d.edit, !!d.done);
  if(d.tag){ formTags.has(d.tag) ? formTags.delete(d.tag) : formTags.add(d.tag); syncTagButtons(); return liveHints(); }
  if(d.sugg){ formTags.add(d.sugg); syncTagButtons(); return liveHints(); }
  if(d.try){ ui.sel = +d.try; ui.dtab = 'star'; return go('#match'); }
  if(d.del){
    const ex = store.exps.find(x => x.id === +d.del);
    return ask({title: '경험을 삭제할까요?', body: `'${showTitle(ex)}'${josa(showTitle(ex), '을', '를')} 지웁니다. 지원서 배정에서도 빠지고 되돌릴 수 없습니다`, ok: '삭제', danger: true}).then(ok => {
      if(!ok) return;
      store.exps = store.exps.filter(x => x.id !== +d.del);
      Object.keys(store.app.assign).forEach(k => { if(store.app.assign[k] === +d.del) delete store.app.assign[k]; });
      save(); toast('경험을 삭제했습니다'); render(true);
    });
  }
  switch(el.id){
    case 'cal-btn': ui.connected = !ui.connected; if(!ui.connected) ui.hideClash = false; render(); return toast(ui.connected ? '캘린더를 연결했습니다 (데모)' : '캘린더 연결을 해제했습니다');
    case 'add-cal': { const it = actById(ui.selected); downloadIcs(it); return toast(`${md(it.deadline)} 마감 일정 파일을 받았습니다. 열면 캘린더에 들어갑니다`); }
    case 'next-job': return $('#job').focus();
    case 'open-add': return openDrawer();
    case 'close-add': return closeDrawer();
    case 'import': return ask({title: 'Notion에서 붙여넣기', body: 'Notion 경험 페이지를 통째로 복사해 붙여넣으세요. 상황, 과제, 행동, 결과, 배운 점 제목을 찾아 칸마다 나눠 넣습니다', ok: '칸 나눠 넣기',
      input: {multi: true, ph: '학회 홍보 채널 개편\n기간: 2025.03 ~ 2025.08\n상황: ...\n행동: ...\n결과: ...'}}).then(t => { if(t && t.trim()) importText(t); });
    case 'copy-outline': return copy($('.ol').innerText, '개요를 복사했습니다');
    case 'copy-draft': return copy($('#draft').value, '초안을 복사했습니다');
    case 'reset-draft': {
      const ex = store.exps.find(x => x.id === ui.sel), key = draftKey(ex, ui.q);
      const redo = () => { delete store.drafts[key]; save(); render(true); };
      if(!store.drafts[key]) return redo();
      return ask({title: '초안을 다시 만들까요?', body: '직접 고친 초안을 지우고 경험에서 새로 만듭니다', ok: '다시 만들기', danger: true}).then(ok => ok && redo());
    }
    case 'mark-used': {
      const ex = store.exps.find(x => x.id === ui.sel);
      return ask({title: '어느 지원서에 썼나요?', body: '이 경험을 쓴 곳을 적어 두면 같은 회사에 같은 경험을 다시 쓰지 않게 알려 줍니다', ok: '표시하기',
        input: {value: store.app.company ? `${store.app.company} ${store.job}`.trim() : '', ph: '예: 한빛카드 마케팅'}}).then(name => {
        if(!name || !name.trim()) return;
        if(!ex.used.includes(name.trim())) ex.used.push(name.trim()); save(); render(true); toast(`'${name.trim()}'에 쓴 경험으로 표시했습니다`);
      });
    }
    case 'auto': autoAssign(appScores()); save(); toast('맞음 정도의 합이 가장 큰 조합으로 배정했습니다'); renderNext(); return renderApplyResults();
    case 'clear-assign': store.app.assign = {}; save(); renderNext(); return renderApplyResults();
    case 'add-q': store.app.questions.push({id: 'q' + Date.now(), text: '', limit: 800}); save(); renderApply(); return document.querySelector('.qrow:last-of-type textarea')?.focus();
    case 'sample-app': store.app = clone(SAMPLE_APP); store.job = SAMPLE_APP.job; fillJobSelect(); save(); return renderApply();
    case 'submit-app': {
      const ids = [...new Set(Object.values(store.app.assign))];
      if(!ids.length) return toast('배정한 경험이 없습니다');
      const label = `${store.app.company || '이름 없는 회사'} ${store.job}`.trim();
      ids.forEach(id => { const ex = store.exps.find(x => x.id === id); if(ex && !ex.used.includes(label)) ex.used.push(label); });
      save(); toast(`경험 ${ids.length}개를 '${label}'에 쓴 것으로 표시했습니다`, {label: '경험창고에서 보기', href: '#me'}); renderNext(); return renderApplyResults();
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(store.exps, null, 2)], {type: 'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '경험창고.json'; a.click(); URL.revokeObjectURL(a.href);
      return toast('경험을 JSON 파일로 내보냈습니다');
    }
    case 'reset-all':
      return ask({title: '예시 데이터로 되돌릴까요?', body: '추가하거나 고친 경험, 초안, 지원서 배정을 모두 지웁니다', ok: '되돌리기', danger: true}).then(ok => {
        if(!ok) return;
        Object.assign(store, fresh()); fillJobSelect(); save(); ui.sel = null; ui.fill = new Set(gapsFor(store.job).map(g => g.c)); render(true);
      });
  }
});
// 마감일을 하루 종일 일정으로 담은 .ics 파일. Google, Apple, Outlook 캘린더가 모두 엽니다
function downloadIcs(it){
  const day = iso => iso.replace(/-/g, '');
  const next = new Date(Date.UTC(...it.deadline.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) + 864e5).toISOString().slice(0, 10);
  const txt = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//teum//activity//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:teum-${it.id}-${day(it.deadline)}@teum.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(it.deadline)}`, `DTEND;VALUE=DATE:${day(next)}`,
    `SUMMARY:${txt(`${it.title} 마감`)}`, `DESCRIPTION:${txt(`${it.host}. ${it.kind}, 주 ${it.hours}시간. 틈 활동 추천에서 저장`)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', `DESCRIPTION:${txt(`${it.title} 내일 마감`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], {type: 'text/calendar;charset=utf-8'})); a.download = `${it.title} 마감.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 붙여넣은 경험 글을 제목(상황, 행동 등)으로 나눠 서랍 칸에 넣습니다
const IMPORT_LABELS = [['title', '경험 이름|경험명|제목'], ['when', '기간'], ['role', '내 역할|역할'], ['s', '상황|Situation'], ['t', '과제|Task'], ['a', '행동|Action'], ['r', '결과|Result'], ['l', '배운 점|배운점|느낀 점|Learned']];
function importText(text){
  const out = {}; let cur = null;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/^[\s#>*\-]+/, '').trim();
    if(!line) return;
    const hit = IMPORT_LABELS.find(([, l]) => new RegExp(`^(${l})\\s*([:：)]|$)`, 'i').test(line));
    if(hit){ cur = hit[0]; const rest = line.replace(new RegExp(`^(${hit[1]})\\s*[:：)]?\\s*`, 'i'), ''); if(rest) out[cur] = (out[cur] ? out[cur] + '\n' : '') + rest; return; }
    if(!cur && !out.title){ out.title = line; return; }
    if(cur) out[cur] = (out[cur] ? out[cur] + '\n' : '') + line;
  });
  const n = Object.keys(out).length;
  if(!['s', 't', 'a', 'r', 'l'].some(k => out[k])) return toast('제목(상황, 행동, 결과)을 찾지 못했습니다. 경험 추가에서 직접 적어 주세요');
  openDrawer();
  const f = $('#add-form');
  Object.entries(out).forEach(([k, v]) => { f.elements[k].value = v; });
  COMP_KEYS.filter(c => COMP[c].some(w => Object.values(out).join(' ').includes(w))).forEach(c => formTags.add(c)); syncTagButtons(); liveHints();
  toast(`${n}칸을 채웠습니다. 역량을 확인하고 저장하세요`);
}
function copy(text, msg){ navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('복사하지 못했습니다. 직접 선택해서 복사하세요')); }

// ---------- 입력 ----------
let qT;
document.addEventListener('input', e => {
  if(runHandlers('input', e)) return;
  const t = e.target;
  if(t.id === 'q'){ clearTimeout(qT); qT = setTimeout(() => { ui.q = t.value; ui.sel = null; render(); }, 250); return; }
  if(t.id === 'hours'){ ui.hours = +t.value; return render(); }
  if(t.id === 'draft'){
    const ex = store.exps.find(x => x.id === ui.sel);
    store.drafts[draftKey(ex, ui.q)] = t.value; save(); updateDraftMeta(); return;
  }
  if(t.id === 'company'){ store.app.company = t.value.trim(); save(); renderApplyResults(); return; }
  if(t.dataset.qtext){ store.app.questions.find(q => q.id === t.dataset.qtext).text = t.value; save(); clearTimeout(qT); qT = setTimeout(renderApplyResults, 250); return; }
  if(t.dataset.qlimit){ store.app.questions.find(q => q.id === t.dataset.qlimit).limit = Math.max(100, +t.value || 800); save(); renderApplyResults(); }
});
document.addEventListener('change', e => {
  if(runHandlers('change', e)) return;
  const t = e.target;
  if(t.id === 'limit'){ ui.limit = Math.max(300, Math.min(2000, +t.value || 800)); return render(); }
  if(t.id === 'lib-sort'){ ui.libSort = t.value; return render(); }
  if(t.id === 'sort'){ ui.sort = t.value; return render(); }
  if(t.id === 'hide-clash'){ ui.hideClash = t.checked; return render(); }
  if(t.id === 'open-only'){ ui.openOnly = t.checked; return render(); }
  if(t.id === 'team-act-select'){ ui.teamAct = t.value ? +t.value : null; ui.openPost = null; ui.applyFor = null; ui.cmp = null; return render(); }
});

// ---------- 제출 ----------
document.addEventListener('submit', e => {
  if(runHandlers('submit', e)) return;
  const f = e.target;
  if(f.id === 'apply-form'){
    e.preventDefault();
    const ids = [...f.querySelectorAll('input[name=exp]:checked')].map(x => x.value);
    if(!ids.length) return toast('공유할 경험을 하나 이상 고르세요');
    store.apps[f.dataset.post] = {exps: ids, link: f.elements.link.value.trim(), msg: f.elements.msg.value.trim(), at: `${ACT_TODAY.getMonth() + 1}/${String(ACT_TODAY.getDate()).padStart(2, '0')}`};
    saveApps(); ui.applyFor = null;
    toast(`경험 ${ids.length}개를 포트폴리오로 붙여 지원했습니다 (데모)`); return render();
  }
  if(f.id !== 'post-form') return;
  e.preventDefault();
  const want = [...(ui.wantDraft || ui.fill)];
  if(!want.length) return toast('원하는 역량을 하나 이상 고르세요');
  const chosen = [...f.querySelectorAll('input[name=exp]:checked')].map(x => store.exps.find(ex => String(ex.id) === x.value)).filter(Boolean);
  const mode = f.elements.mode.value, act = +f.elements.act.value;
  store.posts.push({id: 'm' + Date.now(), act, name: '나', major: '', status: 'open',
    title: f.elements.title.value.trim(), need: +f.elements.need.value, filled: 1, mode, region: mode === '온라인' ? '지역 무관' : '서울',
    meet: f.elements.meet.value.trim() || '협의', close: f.elements.close.value || '2026-11-10',
    roles: f.elements.roles.value.split(',').map(x => x.trim()).filter(Boolean), want, wantText: f.elements.wantText.value.trim(),
    has: [...new Set(chosen.flatMap(ex => ex.tags))], busy: ui.connected ? BUSY : [], link: f.elements.link.value.trim(),
    portfolio: chosen.map(ex => ({title: ex.title, role: ex.role, result: ex.r || '진행 중', tags: ex.tags}))});
  savePosts(); ui.wantDraft = null; ui.writing = false; ui.openPost = store.posts.at(-1).id; ui.teamAct = act;
  toast('모집글을 올렸습니다 (이 브라우저에만 저장)'); render();
});

document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDrawer(); });
// 다른 탭에서 고친 내용 반영 (같은 키를 쓰는 이전 버전 페이지 포함)
window.addEventListener('storage', ev => {
  if([KEY, POSTS_KEY, APPS_KEY].includes(ev.key)){ Object.assign(store, loadStore()); fillJobSelect(); render(); }
});
window.addEventListener('hashchange', route);
addEventListener('resize', () => moveNavInd(true));
// 좁은 화면에서는 활동 추천 조건을 접어 두고 목록부터 보여줍니다
const NARROW = matchMedia('(max-width:760px)');
const syncCond = () => { $('#cond-d').open = !NARROW.matches; };
NARROW.addEventListener('change', syncCond); syncCond();

// ---------- 시작 화면 도우미 (app/start.js가 씁니다) ----------
const START_KEY = 'teum-intro-seen';
const startSeen = () => { try{ return localStorage.getItem(START_KEY) === '1'; }catch(e){ return false; } };
function markStartSeen(){ try{ localStorage.setItem(START_KEY, '1'); }catch(e){} }
// 예시 학생 데이터를 비우고 내 정보로 시작합니다. 확인 창에서 취소하면 false
function startBlank(){
  return ask({title: '내 정보로 시작할까요?', body: '예시 학생의 경험창고, 지원서, 직무, 조건을 비웁니다. 언제든 경험창고의 예시로 되돌리기로 돌아올 수 있습니다', ok: '비우고 시작'}).then(ok => {
    if(!ok) return false;
    Object.assign(store, blank()); save(); fillJobSelect(); applyProfile(); ui.fill = new Set(); ui.sel = null; ui.selected = null;
    render(true); return true;
  });
}
// 예시 학생으로 바꿉니다. key는 PERSONAS의 키 (없으면 첫 예시 학생). 확인 없이: 시작 화면에서만 씁니다
function startDemo(key){ Object.assign(store, fresh(key)); save(); fillJobSelect(); applyProfile(); ui.fill = new Set(gapsFor(store.job).map(g => g.c)); render(true); }

// ---------- 움직임 고르기 패널 ----------
function renderMotionLab(){
  $('#mlab-list').innerHTML = MOTIONS.map(([k, name, desc]) => `<label class="mlab-row"><input type="checkbox" data-motion="${k}" ${motionSet.has(k) ? 'checked' : ''}><span><b>${name}</b><small>${desc}</small></span></label>`).join('');
}
function setMotion(next){ motionSet = new Set(next); applyMotion(); renderMotionLab(); render(true); }
on('change', e => { const k = e.target.dataset?.motion; if(!k) return; e.target.checked ? motionSet.add(k) : motionSet.delete(k); applyMotion(); render(true); return true; });
on('click', e => {
  const id = e.target.closest('button')?.id;
  if(id === 'mlab-open' || id === 'mlab-close'){ const open = $('#mlab').hidden; $('#mlab').hidden = !open; $('#mlab-open').setAttribute('aria-expanded', String(open)); if(open) renderMotionLab(); return true; }
  if(id === 'mlab-best'){ setMotion(MOTION_BEST); toast('추천 조합으로 바꿨습니다'); return true; }
  if(id === 'mlab-none'){ setMotion([]); toast('움직임을 모두 껐습니다'); return true; }
  if(id === 'mlab-copy'){ const u = location.origin + location.pathname + '?m=' + [...motionSet].join(',') + location.hash; copy(u, '이 조합으로 여는 주소를 복사했습니다'); return true; }
});

// ---------- 시작 ----------
fillJobSelect();
ui.fill = new Set(gapsFor(store.job).map(g => g.c));
route();
document.fonts?.ready.then(() => moveNavInd(true));
