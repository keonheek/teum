"""IA에 붙일 화면 스크린샷을 찍습니다. 헤드리스라 화면에 창이 뜨지 않습니다.
실행: .venv/bin/python projects/study/capstone-teum-vault/shared/capture.py
서버: python3 -m http.server 8841 --bind 127.0.0.1 --directory projects/study/capstone-teum-vault  (8841에서 떠 있어야 함)
앱은 하나(index.html)이고 화면은 주소 해시로 나뉩니다: #me, #activities, #team, #match, #apply"""
import asyncio, pathlib
from playwright.async_api import async_playwright

BASE = "http://localhost:8841"
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"

# 와이어프레임: 실제 레이아웃은 그대로 두고 색, 그림자, 장식을 걷어 낸 흑백 틀
WIRE_CSS = """
*{background:transparent!important;background-image:none!important;color:#3d3d3d!important;box-shadow:none!important;
  border-color:#b8b8b8!important;text-shadow:none!important;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif!important}
html,body{background:#fff!important}
aside,section,header,.box,.card,.post,.exp,.lib-item,.fillbox,.pcond div,.facts div,.pf-card,.tip,.week,.ctx,.cal-card,.sub-form,.act-detail{outline:1px solid #cfcfcf}
button,.btn,.go,input,select,textarea,.chip,.tg,.flag,.badge,.role,.cell,.tag-plan{border:1px solid #9a9a9a!important;background:#f3f3f3!important}
.btn:not(.ghost),.cell.on,[aria-pressed="true"],[aria-current="true"],[aria-current="page"],[aria-selected="true"]{background:#d6d6d6!important}
.blk{background:#e8e8e8!important;border:1px dashed #9a9a9a!important}
svg *{stroke:#9a9a9a!important;fill:none!important}
.bar i,.have,.loadbar i,.cbar i,.budget-bar i{background:#bdbdbd!important}
.avatar{background:#cfcfcf!important}
body *{color:#a3a3a3!important}
h1,h2,h3,h4,b,strong,label,.lbl,.r-title,.exp-title,.d-title,.post-title,.col-h h2,.score,.match b,.post-fit b,.tabs button,nav a,.seg button,.seg a,.btn,.go{color:#333!important}
mark{background:#e0e0e0!important}
.gap-row .need{background:#333!important}
.gap-row .pl{background:#e3e3e3!important}
"""

# (파일 이름, 주소, 화면을 만드는 동작). 주 화면마다 한 장씩, 1440 폭
SHOTS = [
    ("00_me_gaps", "/#me", "const j=document.getElementById('job'); j.value='전략기획'; j.dispatchEvent(new Event('change',{bubbles:true}));"),
    ("10_activities", "/#activities?id=6", "document.getElementById('cal-btn').click();"),
    ("11_team_board", "/#team?act=6", "document.querySelector('[data-open=\"p1\"]').click();"),
    ("12_team_apply_portfolio", "/#team?act=6", "(async()=>{document.querySelector('[data-open=\"p1\"]').click(); await __wait(); document.querySelector('[data-applyopen=\"p1\"]').click(); await __wait(); document.getElementById('apply-form').scrollIntoView({block:'center'});})()"),
    ("20_write_match_draft", "/#match", "(async()=>{document.querySelector('[data-s=\"0\"]').click(); await __wait(); document.querySelector('[data-dtab=\"draft\"]').click();})()"),
    ("21_write_apply_assign", "/#apply", "document.getElementById('auto').click();"),
]

async def main():
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, path, js in SHOTS:
            # 새 컨텍스트마다 localStorage가 비어 있어 항상 예시 데이터에서 시작합니다
            ctx = await b.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
            page = await ctx.new_page()
            await page.goto(BASE + path, wait_until="networkidle")
            if js:
                # 클릭으로 다시 그릴 때 View Transition이 한 프레임 뒤에 DOM을 바꾸므로 단계 사이를 기다립니다
                await page.evaluate("void (window.__wait = () => new Promise(r => setTimeout(r, 450)))")
                await page.evaluate(js)
            await page.add_style_tag(content=".toast{display:none!important}")
            await page.wait_for_timeout(1300)  # AI 체커 지연 반영
            await page.evaluate("document.fonts.ready")
            await page.screenshot(path=str(OUT / f"{name}.png"))
            await page.add_style_tag(content=WIRE_CSS)
            await page.wait_for_timeout(150)
            await page.screenshot(path=str(OUT / f"wf_{name}.png"))
            await ctx.close()
            print("saved", name)
        await b.close()

asyncio.run(main())
