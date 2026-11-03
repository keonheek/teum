# 틈 (Teum): career matching for university students

틈 matches a Korean university student to things worth doing next. It uses the competencies their own experiences show, and checks three areas:

- 경험 탐색 (find experiences): open 공모전, 대외활동, 서포터즈 and 학술제, ranked by how well each one fits the student's target role, gaps, interests and weekly hours.
- 경험 활용 (use experiences): for a 자기소개서 question or a job posting (JD), which past experience to write about and which competency to stress.
- 팀원 매칭 (team matching, Phase 2 preview): teammates for a contest, matched in both directions on competencies and meeting times.

Live demo: https://teum-kappa.vercel.app

Built as a PoC for an AI Capstone team project at Sungkyunkwan University.

## How it works

1. 사용자 정보 입력. On the start screen the student enters their major, target role, interests, weekly hours and goals. A poster grid of matches re-ranks after every answer.
2. 경험 역량 DB. Experiences are stored in STAR form (situation, task, action, result, lesson). Keyword rules map each one to 8 competencies, and a job profile turns that into a competency map with gaps.
3. 경험 탐색. Each listing gets a score from role fit (which gaps it fills), interests, schedule, weekly hours, deadline and major, with a written reason for every part.
4. 경험 활용. The app reads what a 자소서 question is asking for and which competency it evaluates. It reads the required competencies from a pasted JD, then suggests the best experience and what to emphasise. It drafts a STAR answer and flags AI-style writing.
5. Feedback loop. Finishing an activity adds it to the DB, and the next recommendations change with it.

### Rule-based on purpose

틈 makes no LLM calls. Every score comes from documented weights and keyword rules, and the app shows the evidence behind each number. We chose rules over a model because there is no interaction data to train on (a cold start), and a ranking you can explain is easier to evaluate and trust.

The 8 competencies are 의사소통, 문제해결, 협업, 리더십, 직업윤리, 데이터, 고객 and 도전. Most of them line up with the NCS 직업기초능력 areas; the app shows the mapping. Required levels per role are the team's estimates.

## Data

- Listings: about a dozen were hand-checked against the hosts' official pages. The rest come from `shared/scrape/sweep.py`, a polite, on-demand scraper of public listing sites: it respects robots.txt, sends at most 1 request every 2 seconds per host, and never logs in. Every listing links to its source.
- Posters belong to their hosts and are not included in this repository. The live demo shows them with credit for class-demo purposes. Without them, the cards render text only.
- Students, experiences and team posts are fictional examples.
- Sample 자소서 questions quote real 2026 recruiting questions where a source is cited in `assets/SOURCES.md`.

## Run it

It's static HTML and JavaScript with no build step:

```bash
python3 -m http.server 8841
```

Then open http://127.0.0.1:8841/. Data is saved to the browser's localStorage only.

## Checks

```bash
python3 shared/e2e.py --base http://127.0.0.1:8841/ --width both --iterations 10
python3 shared/a11y.py --base http://127.0.0.1:8841/
```

- `e2e.py` drives the full cross-view journey with real clicks at 1440px and 390px, plus a reduced-motion run. It repeats the journey to catch flaky steps.
- `a11y.py` runs axe-core on every view.
- Both need Playwright.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | the app shell |
| `app/core.js` | store, competency maths, profile, motion switches |
| `app/main.js` | router and event wiring |
| `app/start.js` | start screen |
| `app/activities.js` | 경험 탐색 |
| `app/me.js` | 경험창고 (experience DB) |
| `app/write.js` | 경험 활용 |
| `app/team.js` | 팀원 매칭 |
| `app/data.js` | competencies, roles, majors, interests and example students |
| `shared/activities.js` | hand-checked listings |
| `shared/feed.js` | generated scraped listings |
| `shared/tell-engine.js` | AI-writing style signals |
