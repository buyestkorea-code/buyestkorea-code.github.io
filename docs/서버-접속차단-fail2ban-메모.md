# 서버 접속 차단(fail2ban) 문제 — 진단·해결 메모

> 2026-11-08 작업 기록. PC에서 서버에 접속해 마저 정리할 때 참고용.
> 이 저장소는 공개(GitHub Pages)라서 **IP 주소·비밀번호는 일부러 적지 않았습니다.** 실제 값은 서버에서 직접 확인하세요.

## 증상
- 툴킷 로그인 화면에 "서버에 연결할 수 없습니다" 표시 (`index.html`이 `buyest.co.kr/toolkit_dashboard_api.php`를 호출하다 실패)
- `buyest.co.kr` 자체가 휴대폰 LTE에서 안 열림 (와이파이에서는 열림)
- 외부 도구로 접속하면 `403 Forbidden (nginx)`

## 원인
- 서버(카페24 전용서버, Ubuntu 22.04)의 **fail2ban**이 LTE 공인 IP를 자동 차단.
- 차단된 규칙(jail): `buyest-limit-req`
  - `findtime` 600초 안에 `maxretry` 30회 초과 → `bantime` **86400초(24시간)** 차단
- `iptables`에 `REJECT` 규칙으로 걸려 있어서 요청이 nginx까지 오지 않음.
  - 그래서 nginx `access.log`에는 403도, 해당 IP 기록도 없었음.
- 서버/nginx/도메인/호스팅 요금은 모두 정상이었음 (진단 과정에서 확인).

## 해결 (이번에 쓴 방법)
와이파이 등 차단되지 않은 네트워크에서 SSH 접속 후:

```bash
# 어느 jail에 걸렸는지 확인
for j in buyest-deep-pagination buyest-limit-req buyest-malformed-400 buyest-noassets buyest-scanner-444 buyest-sequential-product sshd; do echo "== $j"; fail2ban-client status $j | grep "내IP"; done

# 해제
fail2ban-client set buyest-limit-req unbanip 내IP

# 해제 확인 (아무것도 안 나오면 해제됨)
iptables -L -n | grep "내IP"
```

내 IP 확인: LTE 상태에서 휴대폰으로 `https://ifconfig.me` 열기.

## 진단에 쓴 명령 (필요할 때)
```bash
systemctl status nginx --no-pager | head -15   # nginx 상태
nginx -t                                       # 설정 검사
tail -n 20 /var/log/nginx/error.log
grep -c " 403 " /var/log/nginx/access.log      # 403 개수 (0이면 nginx가 낸 403이 아님)
iptables -L -n | grep "IP"                     # 서버 방화벽 차단 여부
fail2ban-client status                         # jail 목록 (buyest-* 6개 + sshd)
fail2ban-client status buyest-limit-req        # 차단 목록
fail2ban-client get buyest-limit-req findtime  # 600
fail2ban-client get buyest-limit-req maxretry  # 30
fail2ban-client get buyest-limit-req bantime   # 86400
```

## 설정 파일 위치 (예외 IP 목록 `ignoreip`)
`/etc/fail2ban/jail.d/` 아래에 파일이 여러 개이고 **규칙마다 `ignoreip`이 따로** 있음. (`jail.local`은 없음)
- `zz-buyest-safe-autoban.local` (jail 여러 개, 예외 목록 줄이 5~6곳)
- `zz-buyest-scraper.local`
- `zz-buyest-sshd.local`
- `buyest-editor-abuse.local`

> 규칙별 목록이 따로라서 `[DEFAULT]`에 추가해도 적용되지 않을 수 있음. 어느 jail에 어느 목록이 붙었는지 먼저 확인:
> ```bash
> grep -n "^\[\|ignoreip" /etc/fail2ban/jail.d/zz-buyest-safe-autoban.local
> ```

## 앞으로 할 일 (PC에서)
1. **차단 원인 요청 패턴 확인** — 툴킷이 같은 API를 반복 호출해서 걸린 건지 확인
   ```bash
   grep "내IP" /var/log/fail2ban.log | tail -5
   zgrep -h "내IP" /var/log/nginx/access.log.1 /var/log/nginx/access.log.*.gz | tail -15
   ```
   - 툴킷이 원인이면 `index.html` 쪽에서 요청 수를 줄이는 수정 (대시보드/지표/HR API 호출이 한꺼번에 나감)
2. **와이파이(고정 IP) 확인** — 와이파이에서 `ifconfig.me`로 나온 IP가 예외 목록에 있는지 확인, 없으면 그 IP만 `ignoreip`에 추가
3. **LTE IP는 예외에 넣지 않기** — 수시로 바뀌고 다른 사람과 공유되어 보안 구멍이 됨
4. (선택) `bantime` 86400 → 3600 등으로 줄이기, `maxretry` 30 상향 검토
5. 설정 변경 후: `fail2ban-client reload`

## 참고
- 설정을 바꾸기 전에 반드시 현재 값을 확인하고, 변경 후 `fail2ban-client status`로 정상 동작 확인.
- 같은 jail에 다른 IP(예: 직원 접속 IP)가 같이 차단돼 있을 수 있음 → `fail2ban-client status buyest-limit-req`로 확인하고 **아는 IP만** 해제.
- 막혔을 때 빠른 우회: 와이파이로 접속.
