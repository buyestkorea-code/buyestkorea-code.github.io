export const templates=[
 {id:'editorial',name:'에디토리얼',note:'큰 제목과 넓은 상품 사진',color:'#d74932',bg:'#ffffff',layout:'classic'},
 {id:'split',name:'스플릿 룩북',note:'사진 왼쪽 · 정보 오른쪽',color:'#214f65',bg:'#e9f0f4',layout:'split'},
 {id:'gallery',name:'갤러리',note:'액자처럼 담는 상품 중심',color:'#755b48',bg:'#f0e8dc',layout:'gallery'},
 {id:'bold',name:'볼드 타이포',note:'강한 제목과 비대칭 사진',color:'#c4324d',bg:'#fff0f3',layout:'bold'},
 {id:'catalog',name:'상품 카탈로그',note:'품번과 가격을 명료하게',color:'#315b4d',bg:'#e9eee8',layout:'catalog'},
 {id:'note',name:'에디터 노트',note:'메모와 사진을 나란히',color:'#57528b',bg:'#f0edf7',layout:'note'},
 {id:'spotlight',name:'스포트라이트',note:'원형 무대와 중앙 상품',color:'#a87520',bg:'#fcf3d9',layout:'spotlight'},
 {id:'stripe',name:'컬러 블록',note:'컬러 패널과 선명한 정보',color:'#2466ae',bg:'#edf4ff',layout:'stripe'},
 {id:'minimal',name:'미니멀',note:'여백과 작은 타이포그래피',color:'#46505c',bg:'#f8f9fa',layout:'minimal'},
 {id:'poster',name:'캠페인 포스터',note:'하단 헤드라인과 상단 사진',color:'#8a4b36',bg:'#f7e9e1',layout:'poster'},
 {id:'kids',name:'키즈 플레이',note:'둥근 프레임과 밝은 색감',color:'#406bbb',bg:'#fff6db',layout:'kids'}
];
export const getTemplate=id=>templates.find(t=>t.id===id)||templates[0];
