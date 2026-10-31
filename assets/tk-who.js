/* 툴킷 로그인 정보를 쓰기 요청에 같이 실어 보낸다 → 서버가 "누가 했는지" 기록한다.
   로그인 안 돼 있으면 아무것도 더하지 않는다(요청은 그대로 가고, 서버에는 '미확인'으로 남는다). */
function tkWho(body) {
  try {
    var a = JSON.parse(localStorage.getItem('buyest.dash.auth') || 'null');
    if (a && a.id && a.pass) { body.tk_user = a.id; body.tk_pass = a.pass; }
  } catch (e) {}
  return body;
}
