# 틈 listing sweeper

`sweep.py` collects real, currently open 공모전 / 대외활동 / 서포터즈 / 학술제 listings for university students and writes them to `shared/feed.js` as `const FEED = [...]`, in the same schema as `ACTIVITIES` in `shared/activities.js`. Posters go to `assets/posters/feed/<id>.jpg`.

It runs on demand only. There is no cron, no schedule and no login, and it never calls an LLM or a paid API.

```bash
python3 shared/scrape/sweep.py --cache <scratch dir>
```

| Flag | Effect |
|---|---|
| (none) | Real run: fetch, filter, normalise, download posters, write `shared/feed.js` |
| `--dry-run` | Fetch and normalise, print the report, write nothing to the repo |
| `--limit N` | Cap the feed at N items (default 60, from `rules.json`) |
| `--selftest` | Parse the gzipped pages in `fixtures/` only. No network. Exit 0 = pass |
| `--offline` | Use cached responses only (no network); regenerates feed.js and posters after a rules.json change |
| `--cache DIR` | Raw response cache (default `$TMPDIR/teum-scrape-cache`; keep it outside the repo) |
| `--report FILE` | Also write the run report as JSON |

## Sources

All requests are plain GETs of public pages.

| Source | What is read | Kinds |
|---|---|---|
| wevity.com | List pages `?c=find&gub=1` (all), `cidx=3` (논문/리포트), `cidx=27` (대외활동/서포터즈), 2 pages each, then each listing's detail page (`분야`, `응모대상`, `주최/주관`, `접수기간`, `총 상금`, `1등 상금`, thumbnail) | 공모전, 학술제, 대외활동, 서포터즈 |
| thinkcontest.com | `sitemap.xml` for the newest 25 `contest/view.do` and 25 `outside/view.do` ids, then each server-rendered detail page (`주최`, `응모분야`, `접수기간`, `참가자격`, `시상종류`, `시상금(1등)`, poster) | 공모전, 대외활동, 서포터즈 |
| linkareer.com | `/list/activity` and `/list/contest`, 3 pages each. The site is Next.js, and every page embeds its Apollo cache in `__NEXT_DATA__`, so list ids and full detail fields (`targets`, `categories`, `benefits`, `regions`, `onoffline`, `recruitStartAt/CloseAt`, `activityStartAt/EndAt`, thumbnail) come from the HTML with no browser | 대외활동, 서포터즈, 공모전, 학술제 |

학술제 / 논문 공모전 come from the wevity 논문/리포트 category plus the 학술제 keyword rule applied to every source.

Not used:
- **linkareer's GraphQL endpoint** (`api.linkareer.com/graphql`). It answers plain POSTs, but the HTML pages carry the same data through GET, so the sweeper stays GET-only.
- **campuspick.com**. The contest list is a client-rendered SPA backed by its own API, with no server-rendered list to read. The sources above already cover 학술제.

## Politeness

- `robots.txt` is fetched once per host and checked for every URL (`urllib.robotparser`). A 4xx robots response means no rules, as RFC 9309 says. A 5xx or a network error means disallow. All three sites allow the paths used. thinkcontest disallows `/upload/files/` and `/ufiles/`, and posters come from `/thinkgood/common/display.do`, which is allowed.
- At most 1 request per 2 s per host (`MIN_GAP`). Hosts are swept one after another.
- A desktop Chrome User-Agent string is sent. Nothing else is spoofed: no cookies, no login, no form submits.
- Every raw response is cached by URL hash in `--cache`, so a rerun with `--offline` costs no requests.
- A control page per source is fetched first (wevity home, thinkcontest contest index, linkareer activity list). A failed control skips that source, and the report says so. The report keeps the two failures apart: an HTTP error (403, 5xx) appears under `blocked` with its status, while a page that loaded but parsed to zero rows appears as `rows: 0` in `list_rows`.

## Rules (`rules.json`)

Every value that is not copied from a listing comes from `rules.json`. Regex match, case-insensitive, over the title plus the site's own category names.

| Field | Rule |
|---|---|
| `kind` | First match wins: 학술제 (`학술제\|학술대회\|논문\|학회\|리포트\|심포지엄\|컨퍼런스…`), then 서포터즈 (`서포터즈\|앰버서더\|홍보대사\|크루…`). Otherwise it keeps the source section's kind (공모전 or 대외활동). |
| `tags` (관심 분야) | Each of 기획, 마케팅, 데이터, 콘텐츠, 디자인, 개발, 금융, ESG has a keyword row that also lists the three sites' category names (e.g. `광고/마케팅` → 마케팅, `과학/공학` → 개발). At most 3 tags, in row order. A listing with no match gets a per-kind fallback. |
| `builds` (역량) | The 8 competencies, using NCS names: 리더십, 문제해결, 협업, 도전, 데이터, 고객, 의사소통, 직업윤리. Keyword rows come first, in row order: 데이터, 리더십, 협업, 고객, 도전, 문제해결, 의사소통 (`기자단\|발표\|스피치\|토론\|홍보\|SNS\|콘텐츠\|인터뷰\|설명회\|PT…`), 직업윤리 (`기자단\|봉사\|월간\|정기…`). Then the kind's base list fills up to 3 (공모전: 문제해결, 도전; 대외활동: 협업, 직업윤리; 서포터즈: 고객, 의사소통, 직업윤리; 학술제: 데이터, 문제해결, 의사소통). 직업윤리 was 성실 before 2026-11-03. |
| `hours` (주당 부담) | An estimate, never read from a listing. Base by kind: 공모전 3, 대외활동 4, 서포터즈 4, 학술제 4. A 공모전/학술제 with a 접수 window of 14 days or less gets +1. A 대외활동/서포터즈 whose activity term is 90 days or longer gets +1. |
| eligibility | The target text (`응모대상` / `참가자격` / `targets`) must match `대학생\|대학원생\|재학생\|휴학생\|제한 없음\|누구나\|일반인\|청년…`. Minor-only listings drop out. |
| exclusions | Titles matching ads, paid courses, events, political party recruiting or job postings are dropped (`exclude_title`). |
| `balance` | Cap 60. At least 5 학술제 when that many exist. The other kinds are filled round-robin, with sources alternating inside each kind and earlier deadlines first. |

Other fields:
- `id`: `1000 + sha1(url)[:8] mod 9,000,000`. It is stable across runs and never collides with the curated ids 1 to 12.
- `slots`: always `[]`. Listings don't give fixed weekly meeting times in a form the scheduler can trust.
- `region`, `term`, `benefit`, `team`: copied from the listing when the source gives them. Otherwise the field reads `확인 필요`. `term` is the activity period when given, otherwise the 접수 window.
- `url`: the listing page on the source site. `source` is `wevity`, `thinkcontest` or `linkareer`.

Filters:
- Deadline on or after tomorrow, with 2026-11-03 as `today` in `rules.json`, the demo's reference date.
- 접수 already started.
- Open to 대학생.
- No duplicates. Titles are normalised by dropping `[주최]` prefixes, brackets and punctuation, then matched by equality, containment, or a difflib ratio of 0.85 or higher. The same 10-character title prefix with the same host also counts as a match. linkareer's copy is kept over wevity's, and wevity's over thinkcontest's.
- Skip anything whose title matches a curated `ACTIVITIES` title in `shared/activities.js`. That file is read only.

## Posters

Each listing's thumbnail is downloaded through the same polite fetcher and checked with `file`. It is converted with `sips -s format jpeg -Z 400`, at quality 75, then 60, then 45, until it fits under 80 KB. The output is checked again with `file`. On any failure, `poster` stays `''`, and the app renders no image. The sweep deletes stale `assets/posters/feed/*.jpg` files that are no longer in the feed. That folder holds generated files only.

## Terms of service note

This is a class PoC for an AI Capstone team project (9조). It is not a public service, and it is not redistributed. Listing facts and posters are the hosts' and the listing sites' material. Each item credits its origin through `source` and links back through `url`, so a reader can check the original. Before any public deployment, get permission from the sites, or link out without copying posters.
