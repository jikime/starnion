---
name: ip
description: IP 주소 또는 도메인의 위치, ISP 등 정보를 조회합니다.
keywords: ["IP", "IP주소", "ip address", "lookup", "IPアドレス", "IP地址"]
---

# IP 조회 (ip)

## 도구

- `lookup_ip`: IP 주소 또는 도메인의 위치, ISP 등 정보를 조회

## 도구 사용 지침

- 사용자가 IP 주소 또는 도메인 정보를 물어보면 `lookup_ip`을 호출
- IP 주소(8.8.8.8)와 도메인(google.com) 모두 지원
- IP/도메인을 지정하지 않으면 서버의 공인 IP를 조회
- IPv4, IPv6 모두 지원
- "내 IP", "공인 IP" 등의 요청에도 `lookup_ip`을 호출 (ip 파라미터 비워두기)
- "google.com 서버 어디야?" 같은 도메인 질문에도 `lookup_ip`을 호출

## 응답 스타일

- 위치 정보 (국가, 도시)를 먼저 표시
- ISP/조직 정보도 포함
- 시간대 정보 포함
- 좌표는 참고용으로 표시
