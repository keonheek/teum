// 지원서: 문항별 경험 매칭, 개요, 초안과 점검, AI 체커, 지원서 전체 자동 배정

// ---------- 문항 읽기와 점수 ----------
// 문항의 형식 문구는 역량을 묻지 않으므로 읽기 전에 지웁니다 ('성공/실패 불문'이 도전으로 읽히지 않게)
const WRITE_BOILER = [/\([^)]*(불문|무관|자유)[^)]*\)/g, /\S+\s*불문/g, /\S+\s*무관하게/g, /자유롭게/g, /구체적으로/g, /상세히/g, /간략히/g];
const write_stripQ = q => WRITE_BOILER.reduce((t, re) => t.replace(re, ' '), q);
// 짧은 단어가 더 긴 단어 안에 들어 있으면 긴 쪽만 셉니다 ('팀장'의 '팀'은 협업이 아님)
function write_findWords(text, pairs){
  const found = [];
  pairs.forEach(([c, w]) => { let i = text.indexOf(w); while(i >= 0){ found.push({c, w, a: i, b: i + w.length}); i = text.indexOf(w, i + 1); } });
  return found.filter(h => !found.some(o => o !== h && o.w.length > h.w.length && o.a <= h.a && o.b >= h.b));
}
function readQuestion(q){
  const qs = write_stripQ(q);
  const typePairs = TYPES.flatMap(t => t.words.map(w => [t.key, w]));
  // 역량 단어끼리, 유형 단어끼리만 긴 쪽을 남깁니다 (유형 '고객 입장'이 역량 '고객'을 지우지 않게)
  const all = write_findWords(qs, Object.entries(COMP).flatMap(([c, ws]) => ws.map(w => ['c:' + c, w]))).concat(write_findWords(qs, typePairs.map(([k, w]) => ['t:' + k, w])));
  const hits = [...new Map(all.filter(h => h.c.startsWith('c:')).map(h => [h.c + h.w, {c: h.c.slice(2), w: h.w}])).values()];
  const comps = [...new Set(hits.map(h => h.c))];
  const tw = all.filter(h => h.c.startsWith('t:'));
  let type = null, best = 0;
  // 지원동기 문항은 '목표' 같은 단어가 섞여도 지원동기로 읽습니다
  TYPES.forEach(t => { const n = new Set(tw.filter(h => h.c === 't:' + t.key).map(h => h.w)).size; const s = n ? n + (t.key === 'motive' ? 0.5 : 0) : 0; if(s > best){ best = s; type = t; } });
  const typeWords = type ? [...new Set(tw.filter(h => h.c === 't:' + type.key).map(h => h.w))] : [];
  const words = [...new Set(hits.map(h => h.w).concat(typeWords))];
  return {q, comps, words, hits, type};
}
// 문항 단어가 직접 가리키는 역량(prim)과, 문항 유형이나 직무가 간접적으로 요구하는 역량(sec)
function wanted(read, job){
  const prim = read.comps.slice();
  let sec = [];
  if(read.type) sec = sec.concat(read.type.comps);
  if(read.type?.useJob && job) sec = sec.concat(Object.entries(JOBS[job]).filter(([, w]) => w >= 2).map(([c]) => c));
  sec = [...new Set(sec)].filter(c => !prim.includes(c));
  return {prim, sec};
}
// ---------- JD 분석: 채용공고에서 지원 직무와 요구 역량을 규칙으로 읽습니다 (서버, AI 호출 없음) ----------
// 직무 이름과 공고에 흔한 다른 이름. JOBS에 있는 직무만 씁니다
const WRITE_JOB_SYN = {
  '마케팅': ['마케팅', '마케터', '퍼포먼스', '브랜드', '그로스', '광고', '캠페인', 'CRM'],
  '영업관리': ['영업', '세일즈', 'B2B', '거래처'], '전략기획': ['전략기획', '경영기획', '사업기획', '전략'],
  '데이터 분석': ['데이터 분석', '데이터분석', '애널리스트', '데이터 사이언티스트', 'BI'],
  '인사': ['인사', 'HR', 'HRD', '조직문화', '채용 담당'], '재무/회계': ['재무', '회계', '세무', '자금'],
  '개발': ['개발자', '백엔드', '프론트엔드', '소프트웨어', '엔지니어'], '디자인': ['디자이너', 'UX', 'UI', '디자인'],
  '서비스 기획': ['서비스 기획', '서비스기획', '프로덕트', 'PM', 'PO'], '콘텐츠 기획': ['콘텐츠', '에디터', '크리에이터'],
  '연구개발': ['R&D', '연구개발', '연구원'], '생산품질': ['품질', 'QA', 'QC', '생산관리', '공정'],
  '공공행정': ['행정', '공공기관'], '교육': ['교육', '강사', '튜터']
};
// 공고에 자주 나오는 표현과 역량. COMP 단어 중 공고에서 뜻이 흐린 것('팀', '운영', '서비스' 등)은 빼고 이 표를 먼저 씁니다
const WRITE_JD_PHRASE = [
  ['커뮤니케이션', '의사소통'], ['소통', '의사소통'], ['설득', '의사소통'], ['발표', '의사소통'], ['설명', '의사소통'], ['문서 작성', '의사소통'], ['보고서', '의사소통'],
  ['협업', '협업'], ['협력', '협업'], ['유관 부서', '협업'], ['조율', '협업'],
  ['데이터 기반', '데이터'], ['데이터', '데이터'], ['분석', '데이터'], ['지표', '데이터'], ['SQL', '데이터'], ['엑셀', '데이터'], ['통계', '데이터'],
  ['고객 경험', '고객'], ['고객', '고객'], ['사용자', '고객'], ['니즈', '고객'],
  ['책임감', '직업윤리'], ['성실', '직업윤리'], ['꼼꼼', '직업윤리'], ['윤리', '직업윤리'], ['정직', '직업윤리'],
  ['리딩', '리더십'], ['리더십', '리더십'], ['주도', '리더십'], ['오너십', '리더십'], ['이끌', '리더십'],
  ['문제 해결', '문제해결'], ['문제해결', '문제해결'], ['개선', '문제해결'], ['논리', '문제해결'], ['원인', '문제해결'],
  ['도전', '도전'], ['새로운', '도전'], ['빠르게 학습', '도전'], ['실행력', '도전']
];
const WRITE_JD_SKIP = ['팀', '운영', '서비스', '처음', '목표', '기록', '매일', '입장', '효율', '바꾸', '공유', '보고', '의견', '근거', '만족', '노력'];
// 구역: 자격요건 x2, 주요 업무와 우대사항 x1. 같은 표현이 여러 번 나오면 그만큼 더합니다
const WRITE_JD_SEC = [[/자격\s*요건|필수\s*(요건|역량)|지원\s*자격|이런 분/, '자격요건', 2], [/우대\s*(사항|조건)?|이런 분이면 더/, '우대사항', 1], [/주요\s*업무|담당\s*업무|하는\s*일|업무\s*내용/, '주요 업무', 1]];
function write_readJD(text){
  const lines = (text || '').split(/\r?\n/);
  // 지원 직무: 앞 세 줄(공고 제목)에 나오면 3배로 셉니다
  const jobScore = {}, jobEv = {};
  lines.forEach((ln, i) => Object.entries(WRITE_JOB_SYN).forEach(([j, syns]) => { if(!JOBS[j]) return;
    write_findWords(ln, syns.map(s => [j, s])).forEach(h => { jobScore[j] = (jobScore[j] || 0) + (i < 3 ? 3 : 1); jobEv[j] = jobEv[j] || h.w; }); }));
  const job = Object.entries(jobScore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const pairs = WRITE_JD_PHRASE.map(([p, c]) => [c, p]).concat(Object.entries(COMP).flatMap(([c, ws]) => ws.filter(w => !WRITE_JD_SKIP.includes(w)).map(w => [c, w])));
  const acc = {};
  let sec = ['', 1];
  lines.forEach(ln => {
    const head = WRITE_JD_SEC.find(([re]) => re.test(ln) && ln.replace(/[\s\-•·:：\[\]【】<>]/g, '').length <= 14);
    if(head){ sec = [head[1], head[2]]; return; }
    // 한 줄에서 같은 역량은 한 번만 셉니다 ('문제를 해결'이 문제해결을 두 번 세지 않게). 여러 줄에 나오면 그만큼 더합니다
    const seen = new Set();
    write_findWords(ln, pairs).forEach(h => {
      const a = acc[h.c] = acc[h.c] || {c: h.c, w: 0, ev: []};
      if(!seen.has(h.c)){ seen.add(h.c); a.w += sec[1]; }
      if(a.ev.length < 3 && !a.ev.some(x => x.p === h.w)) a.ev.push({p: h.w, sec: sec[0]}); });
  });
  const list = Object.values(acc).sort((a, b) => b.w - a.w), max = list[0]?.w || 1;
  list.forEach(x => { x.level = x.w >= max * 0.66 ? 3 : x.w >= max * 0.33 ? 2 : 1; });
  return {job, jobEv: job ? jobEv[job] : null, comps: list};
}
const write_jd = () => store.app.jd?.comps?.length ? store.app.jd.comps : [];
// 강조할 역량: 문항 평가 역량 x JD 요구 역량 x 이 경험의 역량. 셋이 겹치는 것부터, 없으면 두 가지가 겹치는 것. JD가 없으면 직무 프로필을 JD 대신 씁니다
function write_emphasis(e, read){
  const {prim, sec} = wanted(read, store.job);
  const jd = write_jd(), useJD = jd.length > 0;
  const req = useJD ? Object.fromEntries(jd.map(x => [x.c, x.level])) : (store.job ? JOBS[store.job] : {});
  const src = useJD ? 'JD' : store.job ? `${store.job} 직무` : '';
  const srcI = src === 'JD' ? 'JD가' : `${src}${josa(src, '이', '가')}`;
  const q = c => prim.includes(c) ? 3 : sec.includes(c) ? 2 : 0;
  const cand = e.tags.map(c => ({c, q: q(c), j: req[c] || 0}));
  const tiers = [cand.filter(x => x.q && x.j), cand.filter(x => x.q), cand.filter(x => x.j)];
  const tier = tiers.findIndex(t => t.length);
  if(tier < 0) return null;
  const pick = tiers[tier].sort((a, b) => (b.q + b.j) - (a.q + a.j)).slice(0, 2).map(x => x.c);
  const why = tier === 0 ? `문항이 평가하는 역량이면서 ${srcI} 요구하고, 이 경험에 드러납니다`
    : tier === 1 ? `문항이 평가하는 역량이고 이 경험에 드러납니다${src ? ` (${src} 요구 역량에는 없음)` : ''}`
    : `${srcI} 요구하는 역량이고 이 경험에 드러납니다. 문항과 직접 잇는 문장을 하나 넣으세요`;
  return {comps: pick, why, tier};
}

function score(e, read, job){
  if(!read.q.trim()) return {pct: null, why: []};
  const {prim, sec} = wanted(read, job);
  if(!prim.length && !sec.length && !read.words.length) return {pct: null, why: [], unread: true};
  const why = []; let pts = 0, max = 0;
  prim.forEach(c => {
    max += 30;
    if(e.tags.includes(c)){ pts += 30; const w = read.hits.find(h => h.c === c).w; why.push(`문항의 '${w}'${josa(w, '이', '가')} 이 경험의 ${c} 역량과 이어집니다`); }
  });
  sec.forEach(c => {
    max += 18;
    if(e.tags.includes(c)){ pts += 18; why.push(read.type?.useJob && job && !read.type.comps.includes(c) ? `${job} 직무가 요구하는 ${c} 역량이 드러납니다` : `${read.type.label} 문항에서 중요한 ${c} 역량이 있습니다`); }
  });
  if(job){
    max += 12;
    const jw = JOBS[job];
    const top = e.tags.map(c => [c, jw[c] || 0]).sort((a, b) => b[1] - a[1])[0];
    if(top && top[1]){ pts += top[1] * 4; if(top[1] >= 2 && !why.some(w => w.includes(`${top[0]} 역량`))) why.push(`${job} 직무에서 중요한 ${top[0]} 역량이 드러납니다`); }
  }
  const text = expText(e);
  const direct = read.words.filter(w => text.includes(w));
  // JD 요구 역량(있을 때): 상위 셋의 가중 단계 합 중 이 경험이 가진 몫만큼 최대 12점. 직무 프로필 점수와 함께 셉니다
  const jd = write_jd().slice(0, 3);
  if(jd.length){
    max += 12;
    const got = jd.filter(x => e.tags.includes(x.c));
    pts += 12 * got.reduce((a, x) => a + x.level, 0) / jd.reduce((a, x) => a + x.level, 0);
    if(got.length) why.push(`JD가 요구하는 ${got.map(x => x.c).join(', ')} 역량이 드러납니다`);
  }
  max += 18; pts += Math.min(18, direct.length * 9);
  if(direct.length) why.push(`경험 본문에 ${direct.map(w => `'${w}'`).join(', ')}${josa(direct.at(-1), '이', '가')} 그대로 나옵니다`);
  // 결과의 숫자는 아래 quality() 배수에서 한 번만 셉니다
  max += 12; pts += e.pri * 4;
  pts *= 0.8 + 0.2 * quality(e).pct / 100;
  return {pct: Math.min(99, Math.round(pts / max * 100)), why, direct};
}

// ---------- 개요와 초안 ----------
const sent = s => { s = (s || '').trim(); return s && !/[.!?]$/.test(s) ? s + '.' : s; };
const taskSent = t => !t ? '' : /[.다]$/.test(t) ? t : `${t}${josa(t, '이', '가')} 목표였습니다.`;

const PARTS = [['두괄식 첫 문단', .15, 'var(--accent)'], ['상황과 과제', .2, 'var(--accentline)'], ['행동', .4, 'var(--ink)'], ['결과', .12, 'var(--warn)'], ['배운 점과 직무 연결', .13, 'var(--line)']];
function outlineHTML(e, read, limit){
  const acts = actions(e);
  return `<div class="ol">
    <p class="lead">${esc(write_lead(e, read))}</p>
    <h4>상황과 과제</h4><p>${esc(e.s)} ${esc(taskSent(e.t)) || '<span class="todo">[과제를 한 줄로 추가]</span>'}</p>
    <h4>행동</h4><ul>${acts.map(a => `<li>${highlight(a, read.words)}</li>`).join('')}</ul>
    <h4>결과</h4><p>${esc(e.r)}</p>
    <h4>배운 점과 직무 연결</h4><p>${esc(e.l) || '<span class="todo">[배운 점 추가]</span>'} ${esc(write_jobLines(e, store.job, store.app.company).join(' '))}</p>
  </div>
  <div class="budget"><div class="budget-bar">${PARTS.map(([, r, c]) => `<i style="width:${r * 100}%;background:${c}"></i>`).join('')}</div>
  <div class="budget-legend">${PARTS.map(([n, r, c]) => `<span><i style="background:${c}"></i>${n} 약 ${Math.round(limit * r / 10) * 10}자</span>`).join('')}</div></div>`;
}
// 초안 생성기: 문항이 묻는 역량을 첫 문장에 넣고, 정리된 칸(상황, 과제, 행동, 결과, 배운 점)과 직무 연결로 제한의 90% 가까이 채웁니다.
// 대괄호 빈칸은 남기지 않습니다. 지어낸 사실 없이 경험 칸과 직무 프로필만으로 문장을 만듭니다
const WRITE_PHRASE = {
  '리더십': ['먼저 나서 주도하고', '먼저 나서 주도한'],
  '문제해결': ['문제의 원인을 찾아 개선하고', '문제의 원인을 찾아 개선한'],
  '협업': ['팀원과 의견을 조율하며 협업하고', '팀원과 의견을 조율하며 협업한'],
  '도전': ['처음 해 보는 일에 새로운 시도를 하고', '처음 해 보는 일에 새로운 시도를 한'],
  '데이터': ['데이터를 근거로 분석하고', '데이터를 근거로 분석한'],
  '고객': ['고객의 입장에서 서비스를 바꾸고', '고객의 입장에서 서비스를 바꾼'],
  '의사소통': ['상대에게 맞춰 설명하고 설득하고', '상대에게 맞춰 설명하고 설득한'],
  '직업윤리': ['꾸준히 책임감 있게 이어 가고', '꾸준히 책임감 있게 이어 간']
};
const WRITE_TYPE_PHRASE = {
  conflict: ['갈등을 조율하고', '갈등을 조율한'], failure: ['어려움을 극복하고', '어려움을 극복한'],
  challenge: ['어려움 속에서도 목표에 도전하고', '어려움 속에서도 목표에 도전한'], job: ['제 강점을 살리고', '제 강점을 살린'],
  comm: ['생각을 분명하게 전달하고', '생각을 분명하게 전달한']
};
// 직무에서 이 경험을 쓰는 모습 (직무 연결 문장)
const WRITE_JOB_USE = {
  '마케팅': '고객 반응을 수치로 확인하며 캠페인을 개선하는 일', '영업관리': '거래처의 요구를 먼저 듣고 관계를 이어 가는 일',
  '전략기획': '문제를 나눠 보고 근거로 판단하는 일', '데이터 분석': '데이터로 원인을 찾고 개선안을 내는 일',
  '인사': '구성원의 의견을 모아 제도를 다듬는 일', '재무/회계': '숫자를 꼼꼼히 맞추고 근거를 남기는 일',
  '개발': '사용자 문제를 작은 단위로 나눠 해결하는 일', '디자인': '사용자의 불편을 관찰해 화면을 바꾸는 일'
};
// 첫 문장에 넣을 역량: 문항 유형 표현 하나 + 문항이 직접 묻는 역량(이 경험에 있는 것 먼저), 최대 둘
function write_keyPhrases(read, e){
  const out = [], tp = read.type && WRITE_TYPE_PHRASE[read.type.key];
  if(tp) out.push(tp);
  // 강조할 역량을 먼저, 그다음 문항이 직접 묻는 역량. 유형 표현이 없고 강조 역량이 문항과 겹치지 않으면 문항 역량 하나가 앞에 옵니다
  const emph = write_emphasis(e, read)?.comps || [];
  const asked = read.comps.concat(read.type?.comps || []);
  const lead = !tp && emph.length && !emph.some(c => asked.includes(c)) ? asked.filter(c => WRITE_PHRASE[c]).slice(0, 1) : [];
  const comps = [...new Set(lead.concat(emph, [...asked].sort((a, b) => e.tags.includes(b) - e.tags.includes(a))))];
  for(const c of comps){ if(out.length >= 2) break; if(WRITE_PHRASE[c] && !(c === '문제해결' && read.type?.key === 'failure')) out.push(WRITE_PHRASE[c]); }
  if(!out.length && e.tags[0]) out.push(WRITE_PHRASE[e.tags[0]]);
  return out;
}
const write_and = a => a.length < 2 ? (a[0] || '') : `${a[0]}${josa(a[0], '과', '와')} ${a[1]}`;
const write_phraseText = ps => ps.map((p, i) => i < ps.length - 1 ? p[0] : p[1]).join(' ');
function write_lead(e, read){
  const ps = write_keyPhrases(read, e), t = showTitle(e);
  return `저는 ${t}에서 ${e.role}${josa(e.role, '으로서', '로서', true)} ${write_phraseText(ps)} 경험이 있습니다.`;
}
function leadSentence(e){ return write_lead(e, readQuestion(ui.q)); }
// 직무 연결: 회사와 직무, 그 직무가 중요하게 보는 역량, 이 경험이 보여 준 역량
function write_jobLines(e, job, company){
  const where = company ? `${company}${josa(company, '의', '의')} ` : '';
  if(!job) return [`이 경험에서 얻은 ${e.tags[0] || '일하는'} 역량을 입사 후 맡을 일에서도 이어 가겠습니다.`];
  const need = Object.entries(JOBS[job]).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const mine = need.filter(c => e.tags.includes(c)).slice(0, 2);
  return [
    `${where}${job} 직무는 ${write_and(need.slice(0, 2))} 역량을 중요하게 봅니다.`,
    `${mine.length ? `이 경험에서 보여 준 ${write_and(mine)} 역량을 살려 ` : '이 경험에서 익힌 방식을 살려 '}입사 후 ${WRITE_JOB_USE[job] || `${job} 업무`}에 기여하겠습니다.`
  ];
}
function draftText(e, read, job, company, limit = ui.limit){
  const acts = actions(e), t = showTitle(e);
  const conn = acts.length >= 3 ? ['먼저', '이어서', '마지막으로'] : acts.length === 2 ? ['먼저', '이어서'] : [''];
  const body = acts.map((a, i) => sent(/^(먼저|이어서|마지막으로|또한)|\s먼저\s/.test(a) ? a : `${conn[i] || '또한'} ${a}`.trim()));
  const clean = ps => ps.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  const jl = write_jobLines(e, job, company);
  if(read.type?.key === 'motive'){
    const where = company || '이 회사';
    return clean([
      `제가 ${where}에 지원한 이유는 ${job ? `${job} 직무에서 ${WRITE_JOB_USE[job] || '맡은 일'}을 제대로 해내고 싶기 때문입니다` : '지원 직무에서 제 경험을 가장 잘 쓸 수 있다고 보았기 때문입니다'}.`,
      `이런 관심은 ${t} 경험에서 구체화되었습니다. ${sent(e.s)} ${acts.slice(0, 2).map(sent).join(' ')} ${sent('그 결과 ' + e.r)}`,
      `${sent(e.l)} ${jl.join(' ')}`
    ]);
  }
  const ps = write_keyPhrases(read, e);
  // 기본 문단과, 분량이 남을 때만 넣는 문장. 넘치면 뒤에서부터 덜어 냅니다
  const parts = {
    lead: write_lead(e, read), result1: hasNum(e.r) ? sent(`그 결과 ${e.r}`) : '',
    sit: `${sent(e.s)} ${taskSent(e.t)}`, role: `이 일에서 제 역할은 ${e.role}${josa(e.role, '이었습니다', '였습니다')}.`,
    acts: body, result2: hasNum(e.r) ? '' : sent(`그 결과 ${e.r}`),
    meaning: ps.length ? `이 결과로 ${ps.at(-1)[1]} 과정이 실제 성과로 이어진다는 것을 확인했습니다.` : '',
    learn: sent(e.l), job1: jl.length > 1 ? jl[0] : '', job2: jl.at(-1)
  };
  const build = p => clean([`${p.lead} ${p.result1}`, p.sit, `${p.role} ${p.acts.join(' ')}`, `${p.result2} ${p.meaning}`, `${p.learn} ${p.job1} ${p.job2}`]);
  let text = build(parts);
  for(const drop of ['meaning', 'job1', 'role']){ if(text.length <= limit) break; parts[drop] = ''; text = build(parts); }
  while(text.length > limit && parts.acts.length > 2){ parts.acts = parts.acts.slice(0, -1); text = build(parts); }
  // 문항 단어가 절반 넘게 빠졌으면 마지막 문단에 한 문장으로 잇습니다
  const miss = read.words.filter(w => !text.includes(w));
  if(read.words.length && miss.length > read.words.length / 2){
    const add = ` 돌아보면 이 경험은 ${miss.slice(0, 3).join(', ')}에 대한 제 답이었습니다.`;
    if(text.length + add.length <= limit) text += add;
  }
  return text;
}
function draftChecks(text, read, limit){
  const out = [];
  const withSp = text.length, noSp = text.replace(/\s/g, '').length;
  if(withSp > limit) out.push({st: 'fail', t: '글자 수 초과', d: `${withSp - limit}자를 줄이세요`});
  else if(withSp < limit * 0.7) out.push({st: 'warn', t: '분량 부족', d: `제한의 ${Math.round(withSp / limit * 100)}%입니다. 보통 90% 이상 채웁니다`});
  else out.push({st: 'pass', t: '분량 적당', d: `제한의 ${Math.round(withSp / limit * 100)}%`});
  const sents = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const first = sents[0] || '';
  // 첫 문장에 문항이 묻는 핵심(문항 단어나 역량 이름)이 있어야 두괄식으로 봅니다. 문항을 못 읽었을 때만 결론 표현으로 봅니다
  const keys = [...new Set(read.words.concat(read.comps))];
  const keyIn = keys.filter(w => first.includes(w));
  const head = keys.length ? keyIn.length > 0 : /경험|\d|이유는/.test(first);
  out.push(head && first.length <= 130
    ? {st: 'pass', t: '두괄식 첫 문장', d: keys.length ? `첫 문장에 문항의 ${keyIn.slice(0, 2).map(w => `'${w}'`).join(', ')}${josa(keyIn[Math.min(1, keyIn.length - 1)], '이', '가')} 들어 있습니다` : '첫 문장에 핵심이 들어 있습니다'}
    : {st: 'warn', t: '두괄식 첫 문장', d: first.length > 130 ? '첫 문장이 깁니다. 결론 한 문장으로 줄이세요' : `첫 문장에 문항이 묻는 ${keys.slice(0, 2).map(w => `'${w}'`).join(', ')}${josa(keys[Math.min(1, keys.length - 1)], '을', '를')} 넣어 결론부터 쓰세요`});
  if(read.words.length){
    const miss = read.words.filter(w => !text.includes(w));
    out.push(miss.length <= read.words.length / 2
      ? {st: 'pass', t: '문항 단어 반영', d: miss.length ? `${miss.map(w => `'${w}'`).join(', ')}도 넣어 보세요` : '문항의 핵심 단어가 모두 들어 있습니다'}
      : {st: 'warn', t: '문항 단어 반영', d: `${miss.map(w => `'${w}'`).join(', ')}${josa(miss.at(-1), '이', '가')} 빠져 있습니다`});
  }
  out.push(hasNum(text) ? {st: 'pass', t: '숫자 근거', d: '수치가 들어 있습니다'} : {st: 'fail', t: '숫자 근거', d: '결과를 숫자로 보여 주세요'});
  const cl = CLICHES.filter(c => text.includes(c));
  if(cl.length) out.push({st: 'warn', t: '흔한 표현', d: `${cl.map(c => `'${c}'`).join(', ')} 대신 구체적인 사실을 쓰세요`});
  const long = sents.filter(s => s.length > 90).length;
  if(long) out.push({st: 'warn', t: '긴 문장', d: `90자가 넘는 문장이 ${long}개 있습니다. 나눠 쓰세요`});
  const holes = (text.match(/\[[^\]]+\]/g) || []).length;
  if(holes) out.push({st: 'fail', t: '빈칸 남음', d: `대괄호 안 문장 ${holes}곳을 내 이야기로 채우세요`});
  const we = (text.match(/우리|저희/g) || []).length, me = (text.match(/제가|저는|저의/g) || []).length;
  if(we > me) out.push({st: 'warn', t: '주어가 흐림', d: "'우리'보다 '제가'로 내가 한 일을 드러내세요"});
  return {out, withSp, noSp};
}

// ---------- 문항별 쓰기 ----------
function rankedExps(){
  const read = readQuestion(ui.q);
  const list = store.exps.map(e => ({e, ...score(e, read, store.job)}));
  if(list.some(x => x.pct !== null)) list.sort((a, b) => b.pct - a.pct); else list.sort((a, b) => b.e.pri - a.e.pri);
  return {list, read};
}
// 예시 문항 버튼 이름: 문항 유형(readQuestion), 유형이 없으면 가장 먼저 묻는 역량. 같은 이름이 겹치면 번호를 붙입니다
function write_sampleLabels(){
  const raw = SAMPLES.map(s => { const r = readQuestion(s); return r.type ? r.type.label : r.comps[0] ? `${r.comps[0]}형` : '예시'; });
  return raw.map((l, i) => raw.filter(x => x === l).length > 1 ? `${l} ${raw.slice(0, i + 1).filter(x => x === l).length}` : l);
}
function renderSamples(){
  const labels = write_sampleLabels();
  $('#samples').innerHTML = `<span class="s-lead">예시 문항</span>` + SAMPLES.map((s, i) => `<button type="button" class="chip" data-s="${i}" aria-pressed="${ui.q === s}" aria-label="${esc(labels[i])}, ${esc(s)}" title="${esc(s)}">${esc(labels[i])}</button>`).join('') +
    `<span class="limit"><label for="limit">글자 수 제한</label><input id="limit" type="number" min="300" max="2000" step="50" value="${ui.limit}"></span>`;
}
// 지금 문항이 지원서 전체 배정의 문항이면 몇 번인지 (돌아가는 연결과 배정 버튼에 씁니다)
const write_appQuestion = () => store.app.questions.find(x => x.text.trim() && x.text.trim() === ui.q.trim());
const write_LOW = 45;
// 문항별 쓰기에서도 JD를 보이게: 읽은 요구 역량 한 줄, 없으면 붙여넣으러 가는 버튼
function write_jdLine(){
  const jd = store.app.jd;
  return jd?.comps?.length
    ? `<p class="jd-line"><span class="jd-k">JD 요구 역량</span>${jd.comps.slice(0, 4).map(x => `<b>${x.c}</b>`).join(', ')}${jd.job ? `<span class="muted">지원 직무 ${esc(jd.job)}</span>` : ''}<button type="button" class="go" data-wjd>JD 고치기</button></p>`
    : `<p class="jd-line"><span class="muted">채용공고(JD)를 붙여넣으면 지원 직무와 요구 역량까지 함께 맞춥니다</span><button type="button" class="go" data-wjd>JD 붙여넣기</button></p>`;
}
function renderReading(read, list){
  const jdLine = write_jdLine();
  if(!ui.q.trim()){ $('#reading').innerHTML = jdLine + `<p class="muted q-empty">문항을 붙여넣거나 위의 예시를 고르면 문항이 묻는 역량을 읽고, 잘 맞는 경험부터 보여줍니다</p>`; return; }
  const {prim, sec} = wanted(read, store.job);
  const aq = write_appQuestion(), ai = aq ? store.app.questions.indexOf(aq) : -1;
  const sel = store.exps.find(e => e.id === ui.sel);
  const fromApp = aq ? `<p class="from-app"><span>${esc(store.app.company ? store.app.company + ' ' : '')}지원서 ${ai + 1}번 문항, ${aq.limit}자</span>
    ${sel && !sel.planned && store.app.assign[aq.id] !== sel.id ? `<button type="button" class="go" data-wassign="${aq.id}">${esc(showTitle(sel))}${josa(showTitle(sel), '을', '를')} 이 문항에 배정</button>` : ''}
    <a class="go" href="#apply">지원서 전체 배정으로</a></p>` : '';
  if(!prim.length && !sec.length && !read.words.length){
    $('#reading').innerHTML = `${fromApp}${jdLine}<p class="muted">문항에서 역량을 드러내는 단어를 찾지 못했습니다. 문항 원문을 그대로 붙여넣었는지 확인하세요</p>`;
    return;
  }
  // 문항이 묻는 역량인데 끝낸 경험이 없거나, 가장 잘 맞는 경험도 점수가 낮으면 다음 할 일 두 가지를 보여줍니다
  const lacking = prim.concat(sec).filter(c => !doneExps().some(e => e.tags.includes(c)));
  const done = list.filter(x => !x.e.planned && x.pct !== null);
  const best = done.length ? Math.max(...done.map(x => x.pct)) : null;
  let weak = '';
  if(lacking.length || best === null || (best < write_LOW && read.type?.key !== 'motive')){
    const msg = lacking.length ? `${lacking.join(', ')} 역량을 보여줄 경험이 아직 없습니다`
      : best === null ? '이 문항에 쓸 수 있는 경험이 아직 없습니다'
      : `가장 잘 맞는 경험도 ${best}%입니다. 이 문항에 딱 맞는 경험이 아직 없습니다`;
    const fill = (lacking.length ? lacking : prim.concat(sec)).slice(0, 3);
    weak = `<div class="lack-note fit-weak"><span>${msg}</span><div class="go-row">
      <button type="button" class="go" data-wadd>경험 추가</button>${fill.map(c => `<a class="go" href="${link.acts(c)}">${c} 채울 활동</a>`).join('')}</div></div>`;
  }
  $('#reading').innerHTML = `${fromApp}${jdLine}<div class="q-echo">${highlight(ui.q, read.words)}</div>
    <div class="read-row">${read.type ? `<span>질문 의도 <span class="qtype">${read.type.label}</span></span>` : ''}
    <span>평가 역량 ${prim.map(c => `<span class="comp">${c}</span>`).join('')}${sec.map(c => `<span class="tg job">${c}</span>`).join(' ')}</span></div>
    ${read.type ? `<p class="qhint">${esc(read.type.hint)}</p>` : ''}
    ${weak}`;
}
function renderExpList(list, read){
  const asked = list.some(x => x.pct !== null);
  const {prim, sec} = wanted(read, store.job);
  $('#exp-list-title').textContent = asked ? '이 문항에 맞는 경험' : '내 경험';
  $('#exp-list-sub').textContent = asked ? '잘 맞는 순서' : `${store.exps.length}개, 우선순위 순서`;
  if(!list.length){ $('#exp-list').innerHTML = `<div class="w-empty"><p>아직 정리한 경험이 없습니다. 경험을 하나 정리하면 문항에 맞는 순서로 보여줍니다</p><button class="btn accent sm" type="button" data-wadd>경험 추가</button></div>`; return; }
  // 참여 예정 경험은 아직 쓸 내용이 없으므로 고를 수 없게 맨 아래에 따로 둡니다
  const done = list.filter(x => !x.e.planned), planned = list.filter(x => x.e.planned);
  const best = asked && done.length ? done[0].e.id : null;
  const plannedHTML = planned.length ? `<div class="exp-planned"><p class="col-sub">참여 예정 ${planned.length}개는 활동을 마친 뒤 쓸 수 있습니다</p>${planned.map(({e}) => `<div class="exp is-planned">
    <p class="exp-title">${esc(showTitle(e))}<span class="tag-plan">참여 예정</span></p><div class="exp-meta">${esc(e.when)}</div>
    <p class="muted" style="margin:6px 0 0">활동을 마친 뒤 쓸 수 있습니다 <button type="button" class="go" data-edit="${e.id}" data-done="1">활동 마치고 정리하기</button></p></div>`).join('')}</div>` : '';
  if(!done.length){ $('#exp-list').innerHTML = `<div class="w-empty"><p>마친 경험이 아직 없습니다. 경험을 하나 정리하면 이 문항에 맞는 순서로 보여줍니다</p><button class="btn accent sm" type="button" data-wadd>경험 추가</button></div>${plannedHTML}`; return; }
  $('#exp-list').innerHTML = done.map(({e, pct, why}) => {
    const q = quality(e);
    return `<button type="button" class="exp" data-expsel="${e.id}" aria-current="${ui.sel === e.id}" style="view-transition-name:wexp-${e.id}">
    <div class="exp-top"><div><p class="exp-title">${esc(showTitle(e))}${e.planned ? '<span class="tag-plan">참여 예정</span>' : ''}</p><div class="exp-meta">${esc(e.when)}, ${esc(e.role)} <span class="stars" aria-label="우선순위 ${e.pri}">${'★'.repeat(e.pri)}${'☆'.repeat(3 - e.pri)}</span></div></div>
    ${pct !== null ? `<div class="match ${pct < 45 ? 'low' : ''}"><b data-n="m${e.id}">${pct}%</b><small>${e.id === best ? '가장 잘 맞음' : '매칭'}</small></div>` : ''}</div>
    <div class="tags">${e.tags.map(t => `<span class="tg ${prim.includes(t) ? 'on' : sec.includes(t) ? 'on job' : ''}">${t}</span>`).join('')}</div>
    ${asked && why.length ? `<ul class="bullets">${why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    ${q.pct < 70 ? `<div class="qual-mini weak">정리 완성도 ${q.pct}%, 보완할 점 ${q.issues.length}개</div>` : ''}
    ${e.used.length ? `<div class="used">이미 쓴 곳: ${esc(e.used.join(', '))}</div>` : ''}
  </button>`;
  }).join('') + plannedHTML;
}
const draftKey = (e, q) => `${e.id}::${q.trim().slice(0, 80)}`;

// 강조할 역량 제안 한 줄 (문항이 있을 때만)
function write_emphHTML(e, read){
  if(!ui.q.trim() || e.planned) return '';
  const em = write_emphasis(e, read);
  return em ? `<p class="emph"><span class="emph-k">강조할 역량</span><b>${em.comps.join(', ')}</b><span class="emph-why">${esc(em.why)}</span></p>` : '';
}
function renderExpDetail(read){
  const e = store.exps.find(x => x.id === ui.sel);
  if(!e){
    $('#exp-detail').innerHTML = store.exps.length
      ? `<div class="card"><p class="empty" style="padding:26px 22px">왼쪽에서 경험을 고르면 정리된 내용, 개요, 초안을 보여줍니다</p></div>`
      : `<div class="card"><div class="w-empty" style="padding:26px 22px"><p>경험을 정리하면 여기에서 개요와 초안을 바로 만들 수 있습니다</p><button class="btn accent sm" type="button" data-wadd>경험 추가</button></div></div>`;
    return;
  }
  const tabs = [['star', '정리'], ['outline', '개요'], ['draft', '초안 쓰기']];
  const q = quality(e);
  // 정리가 덜 된 경험은 개요와 초안도 그만큼 비어 있게 나옵니다. 무엇이 비었는지와 고칠 곳을 같이 보여줍니다
  const weakNote = e.planned
    ? `<div class="weak-note"><p>참여 예정 경험이라 아직 행동과 결과가 없습니다. 활동을 마친 뒤 정리하면 초안이 채워집니다</p><button type="button" class="go" data-edit="${e.id}" data-done="1">활동 마치고 정리하기</button></div>`
    : q.issues.length ? `<div class="weak-note"><p>정리 완성도 ${q.pct}%. 아래를 보완하면 초안이 더 단단해집니다</p><ul class="issues">${q.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul><button type="button" class="go" data-wfix="${e.id}">경험 정리 보완하기</button></div>` : '';
  let pane = '';
  if(ui.dtab === 'star'){
    const acts = actions(e);
    const dd = (v, w) => v ? `<dd>${w}</dd>` : `<dd class="none">비어 있음</dd>`;
    pane = `<dl class="star">
      <div><dt>상황</dt>${dd(e.s, highlight(e.s, read.words))}</div>
      <div><dt>과제</dt>${dd(e.t, highlight(e.t, read.words))}</div>
      <div><dt>행동</dt>${dd(acts.length, acts.map(a => highlight(a, read.words)).join('<br>'))}</div>
      <div><dt>결과</dt>${dd(e.r, highlight(e.r, read.words))}</div>
    </dl>
    <div class="pane">
      <p class="muted" style="margin:0 0 8px">정리 완성도 ${q.pct}%</p>
      ${q.issues.length ? `<ul class="issues">${q.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul><div class="go-row" style="margin-top:10px"><button type="button" class="go" data-wfix="${e.id}">경험 정리 보완하기</button></div>` : `<ul class="issues none"><li>바로 자소서에 쓸 수 있게 정리되어 있습니다</li></ul>`}
    </div>`;
  } else if(ui.dtab === 'outline'){
    pane = `<div class="pane">${weakNote}${outlineHTML(e, read, ui.limit)}
      <div class="bar-row" style="margin:18px 0 0"><button class="btn accent" type="button" data-dtab="draft">이 개요로 초안 쓰기</button><button class="btn ghost" type="button" id="copy-outline">개요 복사</button></div></div>`;
  } else {
    const key = draftKey(e, ui.q);
    const text = store.drafts[key] ?? draftText(e, read, store.job, store.app.company);
    pane = `<div class="pane">${weakNote}<div class="draft-grid">
      <div>
        <textarea class="draft" id="draft" aria-label="자소서 초안">${esc(text)}</textarea>
        <div class="counter" id="counter"></div>
        <div class="bar-row" style="margin:14px 0 0">
          <button class="btn ghost sm" type="button" id="copy-draft">초안 복사</button>
          <button class="btn ghost sm" type="button" id="reset-draft">경험에서 다시 만들기</button>
          <button class="btn ghost sm" type="button" id="mark-used">이 지원서에 썼다고 표시</button>
        </div>
      </div>
      <div><p class="checks-h">초안 점검</p><ul class="checks" id="checks"></ul><div class="ai" id="ai-check"></div></div>
    </div></div>`;
  }
  $('#exp-detail').innerHTML = `<div class="card">
    <div class="card-h"><div><h3>${esc(showTitle(e))}</h3><p>${esc(e.when)}, ${esc(e.role)}${e.planned ? ', <span class="plan-t">참여 예정</span>' : ''}</p></div>
      <div class="card-act"><button class="linkbtn" type="button" data-wme="${e.id}">경험창고에서 보기</button><button class="btn ghost sm" type="button" data-edit="${e.id}">경험 수정</button></div></div>
    ${write_emphHTML(e, read)}
    <div class="tabs" role="tablist" aria-label="경험 보기">${tabs.map(([k, v]) => `<button type="button" role="tab" id="dtab-${k}" data-dtab="${k}" aria-controls="dpane" aria-selected="${ui.dtab === k}" tabindex="${ui.dtab === k ? 0 : -1}">${v}</button>`).join('')}</div>
    <div id="dpane" role="tabpanel" aria-labelledby="dtab-${ui.dtab}">${pane}</div></div>`;
  if(ui.dtab === 'draft') updateDraftMeta(read);
}
function updateDraftMeta(read){
  const ta = $('#draft'); if(!ta) return;
  const {out, withSp, noSp} = draftChecks(ta.value, read || readQuestion(ui.q), ui.limit);
  write_renderCounter(withSp, noSp);
  $('#checks').innerHTML = out.map(c => `<li class="${c.st}"><b>${esc(c.t)}</b><span>${esc(c.d)}</span></li>`).join('');
  renderAiCheck(ta.value);
}

// 글자 수 막대: 타이핑할 때마다 다시 만들지 않고 값만 바꿔 막대가 부드럽게 늘고 줄게 합니다
function write_renderCounter(withSp, noSp){
  const c = $('#counter'); if(!c) return;
  if(!c.querySelector('.cbar')) c.innerHTML = `<div class="cbar" role="meter" aria-label="공백 포함 글자 수" aria-valuemin="0"><i></i><span class="t90" aria-hidden="true"></span></div>
    <p><span>공백 포함 <b class="n"></b> / <span class="lim"></span>자</span><span class="left"></span><span class="nosp"></span></p>`;
  const lim = ui.limit, left = lim - withSp, pct = withSp / lim * 100;
  const bar = c.querySelector('.cbar'), fill = bar.querySelector('i');
  bar.setAttribute('aria-valuemax', lim); bar.setAttribute('aria-valuenow', Math.min(withSp, lim)); bar.setAttribute('aria-valuetext', `${withSp}자, 제한 ${lim}자`);
  fill.style.width = Math.min(100, pct) + '%'; fill.classList.toggle('over', left < 0);
  c.querySelector('.n').textContent = withSp; c.querySelector('.lim').textContent = lim;
  const el = c.querySelector('.left');
  el.textContent = left < 0 ? `${-left}자 초과` : pct >= 90 ? `${left}자 남음, 충분히 채웠습니다` : `${left}자 남음, ${Math.ceil(lim * 0.9)}자 이상 채우면 좋습니다`;
  el.className = 'left ' + (left < 0 ? 'over' : pct >= 90 ? 'ok' : '');
  c.querySelector('.nosp').textContent = `공백 제외 ${noSp}자`;
}

// ---------- AI 체커 (ai-tell-scanner 엔진과 규칙을 그대로 씁니다, 이 브라우저 안에서만 계산) ----------
// 규칙 파일이 없거나, 형식이 다르거나, 응답이 없으면 이유를 적고 다시 불러올 수 있게 합니다
const TELL = {rules: null, failed: false, why: '', last: null};
function write_loadTell(){
  TELL.rules = null; TELL.failed = false; TELL.why = '';
  const fail = why => { if(TELL.rules || TELL.failed) return; TELL.failed = true; TELL.why = why; updateDraftMeta(); };
  if(!window.TellEngine) return fail('검사 엔진 파일을 불러오지 못했습니다');
  const slow = setTimeout(() => fail('규칙 파일이 응답하지 않습니다'), 8000);
  fetch('shared/tell-rules.json')
    .then(r => { if(!r.ok) throw new Error(`규칙 파일을 찾지 못했습니다 (${r.status})`); return r.json().catch(() => { throw new Error('규칙 파일 형식이 맞지 않습니다'); }); })
    .then(j => {
      try{ TellEngine.analyze('규칙 확인용 문장입니다.', j); }catch(e){ throw new Error('규칙 파일 형식이 맞지 않습니다'); }
      clearTimeout(slow); if(TELL.failed) return; TELL.rules = j; updateDraftMeta();
    })
    .catch(e => { clearTimeout(slow); fail(/규칙/.test(e.message) ? e.message : '규칙 파일을 불러오지 못했습니다'); });
}
write_loadTell();
on('click', e => { if(!e.target.closest('[data-wretry]')) return; write_loadTell(); updateDraftMeta(); return true; });
let aiT;
const write_AI_H = '<p class="checks-h">AI 티 검사</p>';
function renderAiCheck(text){
  const box = $('#ai-check'); if(!box) return;
  if(TELL.failed){ clearTimeout(aiT); box.innerHTML = `${write_AI_H}<p class="ai-fail">AI 티 검사를 할 수 없습니다. ${esc(TELL.why)}</p><p class="muted" style="margin:0 0 6px">초안 점검은 그대로 쓸 수 있습니다</p><button type="button" class="go" data-wretry>다시 불러오기</button>`; return; }
  if(!TELL.rules){ box.innerHTML = `${write_AI_H}<p class="muted">AI 체커 규칙을 불러오는 중입니다</p>`; return; }
  clearTimeout(aiT);
  aiT = setTimeout(() => {
    const b = $('#ai-check'); if(!b) return;
    let r; try{ r = TellEngine.analyze(text, TELL.rules); }catch(e){ b.innerHTML = `${write_AI_H}<p class="ai-fail">AI 체커가 이 글을 읽지 못했습니다. 글을 조금 고친 뒤 다시 확인하세요</p>`; return; }
    TELL.last = r;
    const lp = r.learned_p == null ? null : Math.round(r.learned_p * 100);
    const dens = Math.round(r.doc_score * 100);
    const num = lp ?? dens;
    const cls = lp != null ? (lp >= 70 ? 'hi' : lp >= 45 ? 'mid' : 'lo') : (r.band === 'many' ? 'hi' : r.band === 'some' ? 'mid' : 'lo');
    const label = 'AI 문체 신호: ' + {hi: '높음', mid: '보통', lo: '낮음'}[cls];
    const worst = r.sentences.filter(s => (s.kind === 'body' || s.kind === 'bullet') && s.hits.length && s.score >= .35).sort((a, b) => b.score - a.score).slice(0, 4);
    b.innerHTML = `<p class="checks-h">AI 티 검사</p>
      <div class="ai-score"><b class="${cls}">${num}</b><span>${label}</span></div>
      <p class="meta">${lp != null ? `학습 모델 점수, AI 표현 밀도 ${dens}` : `AI 표현 밀도`}. 우리 AI 체커 규칙으로 이 브라우저 안에서 셉니다</p>
      <p class="meta">문체 신호일 뿐, 사람이 썼는지 판정하지 않습니다</p>
      ${worst.length ? worst.map(s => { const h = s.hits.slice().sort((a, b) => b.weight - a.weight)[0];
        return `<button type="button" class="ai-sent" data-aisel="${s.idx}"><q>${esc(s.text.length > 60 ? s.text.slice(0, 60) + '…' : s.text)}</q><span>${esc(h.label)}: ${esc(h.why_ko || h.why)}</span><em>${esc(h.fix || '')}</em></button>`; }).join('')
        : `<p class="muted" style="margin:0">눈에 띄는 AI 표현이 없습니다</p>`}`;
  }, 200);
}
function renderMatch(){
  renderSamples();
  const {list, read} = rankedExps();
  if(ui.sel === null || !store.exps.some(e => e.id === ui.sel && !e.planned)) ui.sel = list.find(x => !x.e.planned)?.e.id ?? null;
  if($('#q').value !== ui.q) $('#q').value = ui.q;
  renderReading(read, list); renderExpList(list, read); renderExpDetail(read);
}

// ---------- 지원서 전체 배정 ----------
function appScores(){
  return store.app.questions.map(q => {
    const read = readQuestion(q.text);
    return {q, read, scores: Object.fromEntries(store.exps.map(e => [e.id, score(e, read, store.job).pct ?? 0]))};
  });
}
function autoAssign(rows){
  // 문항 수가 적어서 모든 조합을 살펴 합이 가장 큰 배정을 고릅니다 (같은 경험은 한 번만, 참여 예정 경험은 빼고)
  const ids = doneExps().map(e => e.id);
  let best = -1, bestPick = [];
  const pick = [], used = new Set();
  (function dfs(i, sum){
    if(i === rows.length){ if(sum > best){ best = sum; bestPick = pick.slice(); } return; }
    for(const id of ids){
      if(used.has(id)) continue;
      used.add(id); pick.push(id);
      dfs(i + 1, sum + rows[i].scores[id]);
      used.delete(id); pick.pop();
    }
    if(ids.length < rows.length){ pick.push(null); dfs(i + 1, sum); pick.pop(); }
  })(0, 0);
  store.app.assign = {};
  rows.forEach((r, i) => { if(bestPick[i] != null) store.app.assign[r.q.id] = bestPick[i]; });
}
// 칸 색이 진할수록 잘 맞음. 글자는 늘 ink, 선택한 칸(.cell.on)만 흰 글자
function cellStyle(p){ const a = (p / 100) * 0.55; return `background:rgba(var(--accent-rgb),${a.toFixed(2)});color:var(--ink)`; }

function renderApply(){
  const app = store.app;
  $('#write-apply').innerHTML = `
    <div class="apply-head">
      <div class="f" style="margin:0"><label for="company">회사</label><input id="company" value="${esc(app.company)}" placeholder="지원하는 회사"></div>
      <div class="apply-act">
        <button class="btn accent" type="button" id="auto">자동 배정</button>
        <button class="btn ghost" type="button" id="clear-assign">배정 지우기</button>
        <button class="btn ghost" type="button" id="submit-app">제출 완료로 표시</button>
        <button class="btn ghost" type="button" id="sample-app">예시 지원서 불러오기</button>
      </div>
    </div>
    <div id="apply-done" aria-live="polite"></div>
    <section class="jd-box" aria-labelledby="jd-h">
      <div class="col-h"><h2 id="jd-h">JD 분석</h2><span>지원 직무와 요구 역량</span></div>
      <div class="jd-grid">
        <div><label class="jd-l" for="jd-text">채용공고(JD) 붙여넣기</label>
          <textarea id="jd-text" placeholder="공고의 주요 업무, 자격요건, 우대사항을 그대로 붙여넣으세요">${esc(app.jd?.text || '')}</textarea>
          <div class="bar-row" style="margin-top:8px"><button class="btn ghost sm" type="button" data-wjdsample>예시 JD 불러오기</button><button class="btn ghost sm" type="button" data-wjdclear>지우기</button></div></div>
        <div id="jd-result" aria-live="polite"></div>
      </div>
    </section>
    <div class="col-h q-h"><h2>자소서 문항 분석</h2><span>문항마다 질문 의도와 평가 역량을 읽습니다</span></div>
    <div class="qlist" id="qlist">
      ${app.questions.map((q, i) => `<div class="qrow">
        <span class="qn">${i + 1}</span>
        <textarea data-qtext="${q.id}" aria-label="${i + 1}번 문항" placeholder="문항을 그대로 붙여넣으세요">${esc(q.text)}</textarea>
        <input type="number" min="100" max="3000" step="50" data-qlimit="${q.id}" value="${q.limit}" aria-label="${i + 1}번 글자 수">
        <button type="button" class="x" data-qdel="${q.id}" aria-label="${i + 1}번 문항 삭제">×</button>
      </div>`).join('')}
      <button class="btn ghost sm" type="button" id="add-q" ${app.questions.length >= 6 ? 'disabled' : ''}>문항 추가</button>
    </div>
    <div id="apply-results"></div>`;
  write_renderJD();
  renderApplyResults();
  if(write_wantJD){ write_wantJD = false; requestAnimationFrame(() => $('#jd-text')?.focus()); }
}
// 제출 완료로 표시하면 main.js가 배정한 경험마다 '회사 직무'를 쓴 곳(e.used)에 넣습니다. 같은 이름표를 여기서 다시 만들어 상태를 읽습니다
const write_appLabel = () => `${store.app.company || '이름 없는 회사'} ${store.job}`.trim();
const write_cut = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
// 넓은 화면: 문항 x 경험 표. 좁은 화면(760px 이하): 문항마다 카드 하나, 매칭 높은 경험 셋 + 지금 배정한 경험 (같은 data-assign)
const write_NARROW = matchMedia('(max-width:760px)');
write_NARROW.addEventListener('change', () => { if(ui.view === 'write' && ui.sub === 'apply' && $('#apply-results')) renderApplyResults(); });
function write_matrix(rows, exps, counts){
  const app = store.app;
  const head = `<tr><th class="qh">문항</th>${exps.map(e => `<th title="${esc(showTitle(e))}">${esc(write_cut(showTitle(e), 9))}</th>`).join('')}</tr>`;
  const body = rows.map(({q, read, scores}, i) => `<tr><th>${i + 1}. ${q.text.trim() ? esc(write_cut(q.text, 46)) : '<span class="muted">문항을 적어 주세요</span>'}<small>${read.type ? read.type.label + ', ' : ''}${q.limit}자</small></th>
    ${exps.map(e => { const on = app.assign[q.id] === e.id; const dup = on && counts[e.id] > 1;
      return `<td><button type="button" class="cell ${on ? 'on' : ''} ${dup ? 'dup' : ''}" style="${cellStyle(scores[e.id])}" data-assign="${q.id}:${e.id}" aria-pressed="${on}" aria-label="${i + 1}번 문항에 ${esc(showTitle(e))} 배정, 매칭 ${scores[e.id]}%">${scores[e.id]}</button></td>`; }).join('')}</tr>`).join('');
  return `<div class="matrix-wrap" tabindex="0" role="region" aria-label="문항 매칭 표"><table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function write_qcards(rows, exps, counts){
  const app = store.app;
  const opt = (q, e, p, n) => { const on = app.assign[q.id] === e.id;
    return `<button type="button" class="qopt ${on ? 'on' : ''} ${on && counts[e.id] > 1 ? 'dup' : ''}" data-assign="${q.id}:${e.id}" aria-pressed="${on}" aria-label="${n}번 문항에 ${esc(showTitle(e))} 배정, 매칭 ${p}%"><span>${esc(showTitle(e))}</span><b>${p}%</b></button>`; };
  return `<ol class="qcards">${rows.map(({q, read, scores}, i) => {
    const ranked = exps.slice().sort((a, b) => scores[b.id] - scores[a.id]);
    const top = ranked.slice(0, 3), cur = exps.find(e => e.id === app.assign[q.id]);
    if(cur && !top.includes(cur)) top.push(cur);
    const rest = ranked.filter(e => !top.includes(e));
    return `<li class="qcard"><p class="qcard-q"><span class="qn">${i + 1}</span>${q.text.trim() ? esc(write_cut(q.text, 70)) : '<span class="muted">문항을 적어 주세요</span>'}</p>
      <small>${read.type ? read.type.label + ', ' : ''}${q.limit}자</small>
      <div class="qopts">${top.map(e => opt(q, e, scores[e.id], i + 1)).join('')}</div>
      ${rest.length ? `<details class="qmore"><summary>다른 경험 ${rest.length}개</summary><div class="qopts">${rest.map(e => opt(q, e, scores[e.id], i + 1)).join('')}</div></details>` : ''}</li>`; }).join('')}</ol>`;
}
function renderApplyResults(){
  const app = store.app, rows = appScores(), job = store.job;
  const expOf = id => store.exps.find(x => x.id === id);
  const counts = {};
  Object.values(app.assign).forEach(id => { if(expOf(id)) counts[id] = (counts[id] || 0) + 1; });
  const label = write_appLabel(), ids = Object.keys(counts).map(Number);
  const submitted = ids.length > 0 && ids.every(id => expOf(id).used.includes(label));
  // 같은 회사에 쓴 기록. 방금 이 지원서로 제출 표시한 기록은 빼고 봅니다
  const sameCo = e => app.company ? e.used.filter(u => u.startsWith(app.company) && !(submitted && u === label)) : [];

  const done = $('#apply-done');
  if(done) done.innerHTML = submitted ? `<p class="done-line"><b>제출 완료로 표시했습니다</b><span>경험 ${ids.length}개에 '${esc(label)}'${josa(label, '을', '를')} 쓴 곳으로 남겼습니다. 다음 지원서에서 같은 경험이 겹치면 알려 줍니다</span><a class="go" href="#me">경험창고에서 쓴 곳 보기</a></p>` : '';
  const sb = $('#submit-app'); if(sb) sb.textContent = submitted ? '제출 완료로 표시됨' : '제출 완료로 표시';

  // 배정할 수 있는 것은 마친 경험뿐입니다. 참여 예정 경험은 표에서 빼고 아래에 한 줄로 알립니다
  const exps = doneExps(), plannedN = store.exps.length - exps.length;
  if(!exps.length){
    $('#apply-results').innerHTML = `<div class="w-empty" style="margin-top:20px"><p>${plannedN ? `참여 예정 경험 ${plannedN}개는 활동을 마친 뒤 배정할 수 있습니다. ` : ''}마친 경험이 없어 문항에 배정할 수 없습니다. 경험을 하나 정리하면 문항마다 매칭 %를 계산합니다</p><button class="btn accent sm" type="button" data-wadd>경험 추가</button></div>`;
    return;
  }
  const grid = write_NARROW.matches ? write_qcards(rows, exps, counts) : write_matrix(rows, exps, counts);

  const warns = [];
  const assigned = rows.filter(r => expOf(app.assign[r.q.id]));
  rows.forEach((r, i) => { if(!expOf(app.assign[r.q.id])) warns.push(['amb', `${i + 1}번 문항에 아직 경험을 고르지 않았습니다`]); });
  Object.entries(counts).forEach(([id, n]) => { if(n > 1){ const t = showTitle(expOf(+id)); warns.push(['bad', `'${t}'${josa(t, '을', '를')} ${n}개 문항에 썼습니다. 한 지원서 안에서는 경험이 겹치지 않게 하세요`]); } });
  assigned.forEach(r => {
    const e = expOf(app.assign[r.q.id]), t = showTitle(e), n = rows.indexOf(r) + 1;
    const used = sameCo(e);
    if(used.length) warns.push(['bad', `${n}번에 고른 '${t}'${josa(t, '은', '는')} '${used.join("', '")}'에 쓴 것으로 표시된 경험입니다`]);
    if(e.planned) warns.push(['amb', `${n}번에 고른 '${t}'${josa(t, '은', '는')} 참여 예정 경험이라 아직 결과가 없습니다`]);
    else if(r.scores[e.id] < 50 && r.read.type?.key !== 'motive') warns.push(['amb', `${n}번 문항과 '${t}'의 매칭이 ${r.scores[e.id]}%로 낮습니다. 경험을 하나 더 정리하는 편이 낫습니다`]);
  });
  const shown = new Set(assigned.flatMap(r => expOf(app.assign[r.q.id]).tags));
  const missing = job ? Object.entries(JOBS[job]).filter(([, w]) => w >= 2).map(([c]) => c).filter(c => !shown.has(c)) : [];
  missing.forEach(c => warns.push(['bad', `${job} 직무에서 중요한 ${c} 역량이 이 지원서 어디에도 드러나지 않습니다`]));
  if(!warns.length) warns.push(['good', '겹치는 경험 없이 모든 문항이 채워졌고, 직무 핵심 역량도 드러납니다']);

  // 문항별 작성 계획: 배정한 경험마다 겹침, 같은 회사 사용 기록, 정리 완성도를 그 자리에서 보여줍니다
  const rowNotes = (e, q) => {
    const out = [];
    const em = e.planned ? null : write_emphasis(e, readQuestion(q.text));
    if(em && q.text.trim()) out.push(`<p class="pn emph-pn">강조할 역량 <b>${em.comps.join(', ')}</b>. ${esc(em.why)}</p>`);
    if(counts[e.id] > 1){
      const others = rows.map((r, i) => r.q.id !== q.id && app.assign[r.q.id] === e.id ? i + 1 : null).filter(Boolean);
      out.push(`<p class="pn bad">이 경험을 ${others.join(', ')}번 문항에도 배정했습니다. 한 문항에는 다른 경험을 고르세요</p>`);
    }
    const used = sameCo(e);
    if(used.length) out.push(`<p class="pn bad">'${esc(used.join("', '"))}'에 이미 쓴 것으로 표시되어 있습니다</p>`);
    if(e.planned) out.push(`<p class="pn amb">참여 예정 경험이라 아직 결과가 없습니다 <button type="button" class="go" data-edit="${e.id}" data-done="1">활동 마치고 정리하기</button></p>`);
    else { const qa = quality(e); if(qa.issues.length) out.push(`<p class="pn amb">정리 완성도 ${qa.pct}%. ${esc(qa.issues[0])}${qa.issues.length > 1 ? ` 외 ${qa.issues.length - 1}개` : ''} <button type="button" class="go" data-wfix="${e.id}">경험 정리 보완하기</button></p>`); }
    return out.join('');
  };

  const need = job ? Object.entries(JOBS[job]).sort((a, b) => b[1] - a[1]) : [];
  $('#apply-results').innerHTML = `
    ${grid}
    <p class="muted" style="margin:-8px 0 20px">${write_NARROW.matches ? '문항마다 매칭이 높은 경험 셋을 보여줍니다. 누르면 그 경험을 배정합니다' : '숫자는 문항 매칭 %입니다. 칸을 누르면 그 경험을 배정합니다'}${plannedN ? `. 참여 예정 경험 ${plannedN}개는 활동을 마친 뒤 배정할 수 있습니다` : ''}</p>
    <div class="summary">
      <div class="box"><h2 class="box-h">지원서 점검</h2><ul class="warns">${warns.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>
        ${missing.length ? `<div class="go-row">${missing.map(c => `<a class="go" href="${link.acts(c)}">${c} 채울 활동</a>`).join('')}</div>` : ''}</div>
      <div class="box"><h2 class="box-h">이 지원서가 보여주는 역량</h2>
        <div class="tags" style="margin:0 0 10px">${COMP_KEYS.map(c => `<span class="tg ${shown.has(c) ? 'on' : ''}">${c}</span>`).join('')}</div>
        ${job ? `<p class="muted" style="margin:0">${job} 직무에서 중요한 순서: ${need.map(([c, w]) => `${c}(${w})`).join(', ')}</p>` : `<p class="muted" style="margin:0">위에서 지원 직무를 고르면 직무 기준으로도 점검합니다</p>`}
      </div>
    </div>
    <div class="col-h"><h2>문항별 작성 계획</h2></div>
    <ol class="plan">${rows.map(({q, scores}, i) => { const e = expOf(app.assign[q.id]);
      return `<li><span class="qn">${i + 1}</span><div><p>${q.text.trim() ? esc(q.text) : '<span class="muted">문항을 아직 적지 않았습니다</span>'}</p>
      <small>${e ? `<b>${esc(showTitle(e))}</b> 매칭 ${scores[e.id]}%` : `아직 경험을 고르지 않았습니다. 위 ${write_NARROW.matches ? '목록에서 경험을 누르거나' : '표에서 칸을 누르거나'} 자동 배정을 쓰세요`}</small>${e ? rowNotes(e, q) : ''}</div>
      <button class="btn ${e ? 'accent' : 'ghost'} sm" type="button" data-writeq="${q.id}" ${e && q.text.trim() ? '' : 'disabled'}>이 문항 쓰기</button></li>`; }).join('')}</ol>`;
}

// ---------- 지원서 화면의 연결: 경험 추가, 정리 보완, 경험창고로 가기, 배정, 탭과 예시 문항 키보드 ----------
// 다시 그리면 눌렀던 버튼이 새로 만들어져 포커스가 사라지므로, 새 버튼이 생기면 그쪽으로 포커스를 옮깁니다 (View Transition 중에도)
function write_focusSoon(sel){
  const old = document.activeElement; let n = 0;
  const tick = () => { const el = document.querySelector(sel); if(el && el !== old){ el.focus({preventScroll: true}); return; } if(++n < 40) requestAnimationFrame(tick); };
  tick();
}
function write_setDtab(k, focusSel){ ui.dtab = k; render(); write_focusSoon(focusSel || `#dtab-${k}`); }
on('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  if(d.wadd !== undefined){ openDrawer(); return true; }
  if(d.wfix){ openDrawer(+d.wfix); return true; }
  if(d.wme){ ui.flashExp = +d.wme; go('#me'); return true; }
  if(d.wassign){
    store.app.assign[d.wassign] = ui.sel; save();
    const t = showTitle(store.exps.find(x => x.id === ui.sel));
    toast(`'${t}'${josa(t, '을', '를')} 이 문항에 배정했습니다`, {label: '지원서 전체 배정 보기', href: '#apply'}); render(); return true;
  }
  if(d.s !== undefined && b.closest('#samples')){
    ui.q = SAMPLES[+d.s]; ui.sel = null; ui.dtab = 'star';
    const known = [...store.app.questions, ...SAMPLE_APP.questions].find(x => x.text === ui.q); if(known) ui.limit = known.limit;
    render(); write_focusSoon(`#samples [data-s="${d.s}"]`); return true; }
  if(d.dtab && b.closest('#exp-detail')){ write_setDtab(d.dtab, b.getAttribute('role') === 'tab' ? null : d.dtab === 'draft' ? '#draft' : null); return true; }
});
// 탭: 왼쪽, 오른쪽 화살표와 Home, End로 옮깁니다 (WAI-ARIA 탭 패턴)
document.addEventListener('keydown', ev => {
  const tab = ev.target.closest?.('#exp-detail [role="tab"]'); if(!tab) return;
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')], i = tabs.indexOf(tab);
  const n = {ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1}[ev.key];
  if(n === undefined) return;
  ev.preventDefault(); write_setDtab(tabs[n].dataset.dtab);
});

function renderWrite(){
  document.querySelectorAll('[data-sub]').forEach(a => a.setAttribute('aria-current', a.dataset.sub === ui.sub ? 'page' : 'false'));
  $('#write-match').hidden = ui.sub !== 'match';
  $('#write-apply').hidden = ui.sub !== 'apply';
  if(ui.sub === 'match') renderMatch(); else renderApply();
}

// ---------- JD 붙여넣기: 입력, 예시, 지우기 ----------
// 데모용 예시 공고. 실제 회사가 아닌 가상의 공고입니다
const WRITE_SAMPLE_JD = `[예시] 퍼포먼스 마케팅 신입 채용 (가상의 공고)
주요 업무
- 온라인 광고 캠페인 기획과 집행
- 광고 성과 지표 분석과 개선안 도출
- 유관 부서와 협업해 프로모션 실행
자격요건
- 데이터 기반으로 판단하고 결과를 설명할 수 있는 분
- 고객 경험을 이해하고 고객 관점에서 문제를 해결하는 분
- 맡은 일을 끝까지 책임감 있게 마무리하는 분
우대사항
- SQL, 엑셀로 데이터를 다뤄 본 경험
- 원활한 커뮤니케이션 능력
- 새로운 채널에 도전해 본 경험`;
let write_wantJD = false, write_jdT;
function write_renderJD(){
  const box = $('#jd-result'); if(!box) return;
  const jd = store.app.jd;
  if(!jd?.text?.trim()){ box.innerHTML = `<p class="muted jd-empty">붙여넣으면 지원 직무와 요구 역량을 읽어 경험 매칭과 강조할 역량 제안에 함께 씁니다. 공고가 없으면 예시 JD로 먼저 보세요</p>`; return; }
  if(!jd.job && !jd.comps?.length){ box.innerHTML = `<p class="muted jd-empty">공고에서 직무나 역량 표현을 찾지 못했습니다. 주요 업무, 자격요건, 우대사항 부분을 함께 붙여넣으세요</p>`; return; }
  const lv = ['', '낮음', '보통', '높음'];
  box.innerHTML = `<p class="jd-job"><span class="jd-k">지원 직무</span>${jd.job ? `<b>${esc(jd.job)}</b><span class="ev">근거 '${esc(jd.jobEv)}'</span>` : '<span class="muted">공고에서 찾지 못했습니다. 위의 지원 직무에서 고르세요</span>'}</p>
    <h3 class="jd-h3">JD에서 읽은 요구 역량</h3>
    <ul class="jd-comps">${jd.comps.map(x => `<li><b>${x.c}</b><span class="lv lv${x.level}">${lv[x.level]}, 가중치 ${x.w}</span><span class="ev">${x.ev.map(v => `'${esc(v.p)}'${v.sec ? ` ${v.sec}` : ''}`).join(', ')}</span></li>`).join('')}</ul>
    <p class="muted jd-note">자격요건은 2배, 주요 업무와 우대사항은 1배로 셉니다. 이 역량은 경험 매칭 점수와 강조할 역량 제안에 함께 씁니다</p>`;
}
function write_applyJD(text){
  const r = write_readJD(text);
  store.app.jd = {text, job: r.job, jobEv: r.jobEv, comps: r.comps};
  if(r.job && r.job !== store.job){
    store.job = r.job; fillJobSelect(); ui.fill = new Set(gapsFor(store.job).map(g => g.c));
    toast(`JD에서 지원 직무를 ${r.job}${josa(r.job, '으로', '로', true)} 읽었습니다`);
  }
  save(); write_renderJD(); renderApplyResults(); renderNext();
}
on('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  if(d.wjd !== undefined){ write_wantJD = true; if(location.hash === '#apply') renderApply(); else go('#apply'); return true; }
  if(d.wjdsample !== undefined){ $('#jd-text').value = WRITE_SAMPLE_JD; clearTimeout(write_jdT); write_applyJD(WRITE_SAMPLE_JD); return true; }
  if(d.wjdclear !== undefined){ $('#jd-text').value = ''; clearTimeout(write_jdT); write_applyJD(''); $('#jd-text').focus(); return true; }
});
on('input', e => {
  if(e.target.id !== 'jd-text') return;
  const v = e.target.value;
  store.app.jd = {...(store.app.jd || {}), text: v}; save();
  clearTimeout(write_jdT); write_jdT = setTimeout(() => write_applyJD(v), 300);
  return true;
});
