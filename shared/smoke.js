// 화면 점검용 스크립트. 개발 중에만 콘솔이나 자동 점검에서 불러 씁니다 (페이지에서는 로드하지 않음).
// 결과: 가로 넘침, 글자 넘침, 이름 없는 버튼, 너무 작은 터치 영역, 겹친 요소, 대비 부족 텍스트
window.__smoke = function(){
  const out = [];
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  if(document.documentElement.scrollWidth > innerWidth + 1) out.push(`page-overflow ${document.documentElement.scrollWidth}>${innerWidth}`);
  document.querySelectorAll('body *').forEach(e => {
    if(!vis(e) || e.closest('svg')) return;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if(r.right > innerWidth + 1 && !e.closest('.matrix-wrap') && cs.position !== 'fixed') out.push(`offscreen ${e.tagName}.${e.className} ${Math.round(r.right)}`);
    if(e.children.length === 0 && e.textContent.trim() && cs.overflow === 'visible' && e.scrollWidth > e.clientWidth + 2 && cs.display !== 'inline') out.push(`text-spill ${e.tagName}.${e.className} "${e.textContent.trim().slice(0, 24)}"`);
  });
  document.querySelectorAll('button, a, input, select, textarea').forEach(b => {
    if(!vis(b)) return;
    const name = (b.innerText || b.value || b.getAttribute('aria-label') || b.getAttribute('placeholder') || b.title || '').trim() || b.labels?.[0]?.innerText;
    if(!name) out.push(`unnamed ${b.tagName}.${b.className}`);
    const r = b.getBoundingClientRect();
    if(innerWidth < 500 && (r.height < 28) && b.tagName !== 'A' && b.type !== 'checkbox') out.push(`small-target ${b.tagName}.${b.className} "${(b.innerText || '').slice(0, 14)}" ${Math.round(r.height)}px`);
  });
  return [...new Set(out)].slice(0, 40);
};
