// 틈과 경험창고가 함께 쓰는 실제 모집 공고 (2026-11-03 확인, 출처와 포스터 출처는 assets/SOURCES.md)
// 제목, 주최, 마감, 혜택, 팀 구성, 기간, 지역은 공고 원문 기준. builds, hours, slots는 틈의 추정값
// majors: 공고가 특정 전공만 받을 때 MAJORS 키 (12개 모두 전공 제한이 없어 비어 있음)
// builds: 이 활동을 하면 경험창고에 쌓이는 역량. hours: 학기 중 주당 부담. slots: 공고에 날짜가 나온 고정 일정만
const ACTIVITIES = [
  {id:1,kind:'공모전',title:'2026 대국민 재정교육 아이디어 공모전',host:'기획예산처',tags:['금융','기획','교육','정책'],majors:[],builds:['문제해결','고객'],deadline:'2026-11-27',hours:3,slots:[],region:'온라인 접수',term:'약 4주, 제안서 A4 3쪽 이내',benefit:'대상 100만원, 최우수 50만원 등 14편 시상',team:'개인 또는 4인 이내 팀',
   url:'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&gp=1&ix=112031',poster:'assets/posters/1.jpg'},
  {id:2,kind:'서포터즈',title:'2026 고향사랑기부 대학생·청년 발굴단',host:'한국경제TV',tags:['콘텐츠','영상','마케팅','정책'],majors:[],builds:['고객','협업','직업윤리','의사소통'],deadline:'2026-11-08',hours:6,slots:[{d:4,s:14,e:16,t:'발대식 (11/13)'}],region:'온라인, 오프라인 3회 (발대식, 본사 견학, 시상식)',term:'5주 (11/13~12/18)',benefit:'총 상금 300만원, 팀 활동비, PD·기자 멘토링',team:'개인 또는 4인 이내 팀',
   url:'https://www.gohyangdream.com/events/2',poster:'assets/posters/2.jpg'},
  {id:3,kind:'공모전',title:'2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회',host:'한국사회보장정보원',tags:['데이터','AI','개발','기획','정책'],majors:[],builds:['데이터','문제해결'],deadline:'2026-11-20',hours:5,slots:[],region:'온라인 접수, 본선 12/3',term:'약 4주, 제안서 A4 5쪽 이내',benefit:'대상 500만원 (보건복지부 장관상), 총 16팀 시상',team:'개인 또는 팀',
   url:'https://wma.co.kr/ax',poster:'assets/posters/3.jpg'},
  {id:4,kind:'대외활동',title:'제19기 기상청 국민정책기자단',host:'기상청',tags:['글쓰기','콘텐츠','환경','과학','영상'],majors:[],builds:['직업윤리','고객','의사소통'],deadline:'2026-11-19',hours:3,slots:[],region:'전국, 정책현장 탐방',term:'11개월 (2027.1~11)',benefit:'원고료, 활동비, 정책현장 탐방',team:'개인 (텍스트 15명, 영상 4명, 사진 3명)',
   url:'https://blog.naver.com/kma_131/224453795752',poster:'assets/posters/4.jpg'},
  {id:5,kind:'서포터즈',title:'롯데월드타워·몰 서포터즈 2기 (잠실 크루)',host:'롯데물산',tags:['마케팅','콘텐츠','영상','디자인'],majors:[],builds:['고객','협업'],deadline:'2026-11-05',hours:5,slots:[],region:'서울 잠실',term:'5개월 (2026.12~2027.4)',benefit:'월 활동비, 팀 활동비, 월 콘텐츠 교육',team:'개인 (에디터, 영상 크리에이터 12명)',
   url:'https://jamsilcrew.com/jobs/RC20261008037150',poster:'assets/posters/5.jpg'},
  {id:6,kind:'공모전',title:'2026 부여 솔버톤, 지역문제해결 아이디어',host:'부여군, 부여군지역공동체활성화재단',tags:['기획','창업','정책','마케팅','ESG'],majors:[],builds:['고객','문제해결','데이터','협업','의사소통'],deadline:'2026-11-11',hours:4,slots:[{d:4,s:13,e:23,t:'부여 캠프 (11/20)'},{d:5,s:9,e:18,t:'캠프·피칭 (11/21)'}],region:'충남 부여, 1박 2일 캠프',term:'캠프 11/20~21, 상위 3팀 현장 실증',benefit:'총 3,000만원 (상금 900만원, 상위 3팀 실증비 2,100만원)',team:'팀 참가, 15팀 선발',
   url:'https://buyeostartup.kr/',poster:'assets/posters/6.jpg'},
  {id:7,kind:'공모전',title:'햇반 30주년 AI 공모전 (갓 지은 AI디어)',host:'CJ제일제당',tags:['AI','영상','디자인','콘텐츠','마케팅'],majors:[],builds:['도전','고객'],deadline:'2026-11-13',hours:4,slots:[],region:'온라인 (인스타그램·유튜브 업로드)',term:'약 3주, AI 이미지 또는 15~60초 영상',benefit:'대상 1,000만원, 총 16팀 시상',team:'개인 또는 4인 이내 팀',
   url:'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&gp=1&ix=111912',poster:'assets/posters/7.jpg'},
  {id:8,kind:'대외활동',title:'TAMS 글로벌금융인양성과정 17기',host:'미래에셋금융서비스',tags:['금융'],majors:[],builds:['직업윤리','협업'],deadline:'2026-11-27',hours:2,slots:[],region:'서울 강남 (부산 차수 별도)',term:'겨울방학 중 2주, 주중 집중 교육',benefit:'수료증, 소정의 수료비',team:'개인, 차수별 100명',
   url:'http://miraeassetfptams.com',poster:'assets/posters/8.jpg'},
  {id:9,kind:'공모전',title:'현대모비스 창립 50주년 굿즈 아이디어 공모전',host:'현대모비스',tags:['디자인','기획'],majors:[],builds:['도전','문제해결'],deadline:'2026-11-18',hours:3,slots:[],region:'온라인 (이메일 제출)',term:'약 4주, 아이디어 이미지와 설명 PDF',benefit:'대상 200만원, 총 상금 500만원 10명',team:'인원 규정 없음 (참가신청서 1부)',
   url:'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&gp=1&ix=111865',poster:'assets/posters/9.jpg'},
  {id:10,kind:'대외활동',title:'2027 레드불 대학생 마케터',host:'레드불 코리아',tags:['마케팅','기획','스포츠'],majors:[],builds:['고객','도전','협업'],deadline:'2026-11-27',hours:6,slots:[],region:'서울·수도권 캠퍼스',term:'6개월 이상, 월별 미션',benefit:'월 미션 활동비, 실무자 교육, 수료증 (6개월 이상)',team:'개인',
   url:'https://www.wevity.com/?c=find&s=1&gub=1&gbn=view&gp=1&ix=112042',poster:'assets/posters/10.jpg'},
  {id:11,kind:'서포터즈',title:'올리브영 셔터브리티 8기',host:'CJ올리브영',tags:['콘텐츠','영상','마케팅'],majors:[],builds:['고객','직업윤리'],deadline:'2026-11-15',hours:3,slots:[],region:'온라인 (올리브영 앱)',term:'6개월 (2027.1~6)',benefit:'월 활동비 최대 15만원, 할인 쿠폰, 입점 브랜드 협업',team:'개인, 최대 300명',
   url:'https://www.contestkorea.com/sub/view.php?int_gbn=2&Txt_bcode=040710001&str_no=202610260028',poster:'assets/posters/11.jpg'},
  {id:12,kind:'대외활동',title:'SOOP프레스 8기',host:'SOOP',tags:['콘텐츠','글쓰기','영상'],majors:[],builds:['직업윤리','고객','의사소통'],deadline:'2026-11-10',hours:4,slots:[],region:'온라인 중심, 발대식·수료식 필수',term:'약 15주 (11/30~3/13)',benefit:'활동비, 기자단 굿즈',team:'개인, 10명',
   url:'https://www.sooplive.com/station/afreporter/post/211194597',poster:'assets/posters/12.jpg'}
];

// 공고의 마감까지 남은 날 (데모 기준일 2026-11-03)
const ACT_TODAY = new Date('2026-11-03T00:00:00');
const actDday = iso => Math.ceil((new Date(iso + 'T00:00:00') - ACT_TODAY) / 86400000);
