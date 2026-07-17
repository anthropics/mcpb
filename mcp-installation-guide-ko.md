# 클로드를 필수 MCP 가이드

컴퓨터를 잘 몰라도, 이 문서만 위에서부터 그대로 따라 하면 됩니다

이 가이드는 "설치"라는 걸 처음 해보는 분을 기준으로 썼습니다. 어려운 말은 최대한 풀어 썼고, 막히기 쉬운 부분은 미리 짚어뒀어요. 순서대로, 한 칸씩 따라오시면 됩니다.

읽는 법: 위에서부터 차례대로. 모르는 단어가 나와도 멈추지 마세요. 바로 아래에 다시 쉽게 풀어놨습니다.

## 먼저, 오늘 우리가 하려는 것

클로드(Claude)는 똑똑하지만, 기본 상태에서는 "말만" 합니다. 내 컴퓨터 파일도 못 열고, 내 노션도 못 보고, 웹사이트도 직접 못 만집니다.

여기에 MCP라는 걸 붙이면, 클로드가 파일을 읽고, 웹을 뒤지고, 노션·깃허브 같은 앱까지 직접 다루는 "비서"가 됩니다.

오늘 할 일은 딱 이겁니다.

1. 준비물 3개 깔기 (10분)
2. 그중 내 일에 맞는 도구 1개를, 클로드에게 시켜서 설치하기 (5분)
3. 잘 되는지 테스트 질문 하나 던져보기 (1분)

끝나면 클로드가 완전히 달라집니다.

## 0단계. 시작 전에 딱 3개만 준비하세요

### 준비물 1. 클로드 데스크톱 앱 (Claude Desktop)

웹 브라우저 클로드가 아니라, 컴퓨터에 까는 "앱"이 필요합니다. MCP는 앱 버전에서 제일 쉽게 됩니다.

- 받는 곳: https://claude.ai/download
- 설치: 내려받은 파일을 더블클릭 → 안내대로 "다음/설치" 누르면 끝. (핸드폰 앱 깔듯이 하면 됩니다.)
- 설치 후 로그인까지 해두세요.

### 준비물 2. Node.js (엔진 같은 것)

대부분의 도구는 설치할 때 이 엔진이 필요합니다. 한 번만 깔면 됩니다.

- 받는 곳: https://nodejs.org (초록색 "LTS" 버튼을 누르세요. LTS = 안정 버전)
- 설치: 내려받은 파일 더블클릭 → 계속 "Next/다음"만 누르면 끝. 특별히 바꿀 것 없습니다.
- 확인(선택): 설치 다 됐는지 굳이 확인 안 해도 됩니다. 그냥 깔았으면 넘어가세요.

### 준비물 3. (있으면 좋은 것) 각 서비스 열쇠, 'API 키'

일부 도구(퍼플렉시티, 파이어크롤 등)는 그 회사의 "열쇠(API 키)"가 필요합니다. 지금 다 준비할 필요 없어요. 그 도구를 실제로 쓸 때, 클로드가 "여기서 키 받아오세요" 하고 안내해줍니다.

팁. 준비물 1(클로드 앱)만 있어도 아래 절반 이상은 바로 됩니다. 부담 갖지 말고 앱부터 까세요.

## 1. MCP가 뭐예요? (딱 한 번만 이해하면 끝)

MCP(엠씨피)는 클로드를 진짜 도구에 꽂아주는 "콘센트" 같은 규격입니다.

- 그냥 클로드 = 손발이 묶인 사람 (말은 잘함)
- MCP 붙인 클로드 = 파일 열고, 웹 뒤지고, 앱 만지고, 정리까지 해오는 사람

콘센트 규격이 통일돼 있으니, 노션이든 깃허브든 브라우저든 "같은 방식"으로 꽂을 수 있어요. 2024년 앤트로픽이 공개했고, 지금은 특정 회사 것이 아니라 공용 표준(Agentic AI Foundation 관리)입니다.

기억할 것 하나: 24개를 다 깔 필요 없습니다. 내 일에 맞는 5개면 충분해요. (뒤에 직업별로 골라드립니다.)

## 2. 설치, 진짜 쉬운 방법 — 클로드에게 시키세요

명령어를 외울 필요가 없습니다. 설치 자체를 클로드에게 부탁하면 됩니다. 아래 회색 상자를 통째로 복사해서, 클로드 앱 채팅창에 붙여넣고 대괄호 부분만 바꾸세요.

```
너는 지금부터 나의 설치 도우미야. 나는 컴퓨터를 잘 몰라.
아래 MCP 서버를 내 Claude Desktop에 설치하고 싶어.

- 서버 이름: [예: context7]
- 참고 링크: [해당 GitHub 링크 붙여넣기]
- 내 컴퓨터: [윈도우 / 맥 중 하나]

다음을 아주 초보자도 알 수 있게 순서대로 알려줘.
1) 이 서버에 API 키가 필요한지, 필요하면 어디서 어떻게 받는지
2) 내 설정 파일(claude_desktop_config.json)을 여는 방법을 클릭 순서대로
3) 그 파일에 붙여넣을 내용을 '완성된 형태'로 통째로
4) 저장하고 앱을 껐다 켜는 것까지
5) 설치가 됐는지 확인할 첫 테스트 질문 한 개
```

이렇게 하면 클로드가 내 상황에 맞춰 하나씩 알려줍니다. 이게 제일 쉽고 실수가 적어요.

### 조금 더 알고 싶다면 — 설정 파일 직접 여는 법

클로드 데스크톱은 mcpServers라는 목록이 담긴 설정 파일 하나로 도구를 관리합니다. 파일 이름은 claude_desktop_config.json 입니다.

여는 방법 (앱에서):

1. 클로드 데스크톱 앱을 켠다
2. 왼쪽 위 메뉴에서 설정(Settings)으로 들어간다
3. Developer(개발자) 탭 → Edit Config(설정 편집) 버튼을 누른다
4. 그러면 설정 파일이 열립니다 (메모장/텍스트 편집기로)

파일 위치(직접 찾을 때):

- 윈도우: `%APPDATA%\Claude\claude_desktop_config.json`
- 맥: `~/Library/Application Support/Claude/claude_desktop_config.json`

붙여넣는 형태 (예: context7 하나만 있을 때):

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

두 개 이상 넣을 때는 이렇게 콤마(,)로 이어붙입니다. 콤마 빠지면 에러 나니 주의하세요.

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] },
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\내작업폴더"] }
  }
}
```

저장한 뒤에는 반드시 클로드 앱을 완전히 껐다가 다시 켜세요. 그래야 새 도구가 인식됩니다.

헷갈리면 그냥 위의 "클로드에게 시키기" 상자를 쓰세요. 파일 편집을 대신 안내해줍니다.

## 3. 24개 전체 — 뭐 하는 도구인지 + GitHub 링크 + 예시

각 도구마다: 한 줄 설명 / 이럴 때 써요 / GitHub(공식) 링크 / 클로드에게 이렇게 말해보세요.

### 버킷 1. 기본 엔진 (5) — 이거 없으면 시작이 안 됩니다

**claude-code** — 파일을 읽고 코드를 고치고 명령까지 실행하는 본체
- 이럴 때: 폴더 전체를 맡겨 정리·수정하고 싶을 때
- 링크: https://github.com/anthropics/claude-code
- 말해보기: "이 폴더 안 파일들을 읽고 뭐가 있는지 정리해줘."

**filesystem** — 허용한 폴더의 파일을 읽고 정리 (공식)
- 이럴 때: PDF·기획서·회의록·엑셀을 폴더째 분석
- 링크: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
- 말해보기: "이 폴더의 회의록들 요약해서 할 일만 뽑아줘."

**memory** — 내 취향·맥락·결정을 기억 (공식)
- 이럴 때: 매번 같은 설명 반복하기 싫을 때
- 링크: https://github.com/modelcontextprotocol/servers/tree/main/src/memory
- 말해보기: "우리 브랜드 톤은 이거야. 기억해뒀다가 앞으로 반영해줘."

**sequential-thinking** — 복잡한 문제를 단계별로 생각 (공식)
- 이럴 때: 전략·의사결정·긴 분석 전에
- 링크: https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
- 말해보기: "이 문제를 단계별로 쪼개서 차근차근 생각해줘."

**fetch** — 링크 하나를 정확히 읽어 요약 (공식)
- 이럴 때: "이 페이지만 제대로 읽어줘"가 필요할 때
- 링크: https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
- 말해보기: "이 링크 내용 읽고 3줄로 요약해줘."

### 버킷 2. 웹·리서치 (5) — 복붙 조사는 그만

**playwright** — 브라우저를 대신 열고 클릭·입력·캡처 (Microsoft)
- 이럴 때: 로그인·폼 입력·화면 확인 자동화
- 링크: https://github.com/microsoft/playwright-mcp
- 말해보기: "이 사이트 열어서 로그인 화면이 잘 뜨는지 확인하고 캡처해줘."

**perplexity** — 출처 달린 실시간 검색
- 이럴 때: 최신 정보·시장조사 (지식 컷오프 해결)
- 링크: https://github.com/ppl-ai/modelcontextprotocol
- 말해보기: "요즘 이 주제 최신 동향을 출처와 함께 정리해줘."

**firecrawl** — 웹페이지를 깔끔한 텍스트로 긁어오기
- 이럴 때: 경쟁사·문서 사이트를 링크만 주고 요약
- 링크: https://github.com/firecrawl/firecrawl-mcp-server
- 말해보기: "이 사이트 긁어와서 핵심만 표로 정리해줘."

**exa** — 키워드가 아니라 '의미'로 찾는 검색
- 이럴 때: 깊은 리서치, 비슷한 자료 찾기
- 링크: https://github.com/exa-labs/exa-mcp-server
- 말해보기: "이 주제랑 진짜 비슷한 사례 자료들을 찾아줘."

**brave-search** — 빠른 웹 검색 (열쇠 필요할 수 있음)
- 이럴 때: 후보 링크·키워드 빠르게 모으기
- 링크: https://github.com/brave/brave-search-mcp-server
- 말해보기: "이 키워드로 참고할 만한 링크 10개 찾아줘."

### 버킷 3. 업무앱 연결 (5) — 회사 자료 매번 첨부하지 마세요

**notion** — 노션 페이지·DB를 읽고 정리 (공식)
- 이럴 때: 지식창고가 노션인 사람은 사실상 필수
- 링크: https://github.com/makenotion/notion-mcp-server
- 말해보기: "내 노션에서 이번 주 회의 페이지 찾아 요약해줘."

**slack** — 채널 대화를 읽고 요약·할 일 추출 (민감 채널 권한 주의)
- 이럴 때: 놓친 대화 따라잡기
- 링크(공식 아카이브): https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack
- 말해보기: "○○ 채널에서 오늘 나온 결정사항만 정리해줘."

**google-drive** — 드라이브 문서를 직접 찾아 읽기
- 이럴 때: 회의 전 관련 문서 요약
- 링크(공식 아카이브): https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive
- 말해보기: "드라이브에서 제안서 초안 찾아 검토해줘."

**linear** — 이슈·로드맵을 읽고 정리 (공식, 원격 연결)
- 이럴 때: 스프린트·우선순위 정리
- 링크(공식 문서): https://linear.app/docs/mcp
- 말해보기: "이번 스프린트에서 나한테 걸린 이슈만 정리해줘."

**figma** — 디자인 맥락을 코드·QA로 연결 (공식 Dev Mode)
- 이럴 때: 컴포넌트·색상 토큰 추출, 구현 누락 점검
- 링크(공식 안내): https://help.figma.com/hc/en-us/articles/32132100833559
- 말해보기: "이 프레임의 색상·간격 값을 뽑아줘."

### 버킷 4. 개발 자동화 (5) — 혼자 일해도 팀처럼

**github** — 이슈·PR·코드·릴리즈노트 (공식)
- 이럴 때: 코드 리뷰·이슈 정리·릴리즈노트
- 링크: https://github.com/github/github-mcp-server
- 말해보기: "이 저장소의 열린 PR들 요약하고 위험한 변경 찾아줘."

**git** — 내 컴퓨터 저장소의 변경·커밋 읽기 (공식)
- 이럴 때: "이번 변경 리뷰해줘", "커밋 메시지 써줘"
- 링크: https://github.com/modelcontextprotocol/servers/tree/main/src/git
- 말해보기: "방금 바꾼 것들 리뷰하고 커밋 메시지 만들어줘."

**context7** — 최신 라이브러리 문서를 실시간 공급 (Upstash)
- 이럴 때: 버전 자주 바뀌는 도구(Next.js 등) 쓸 때
- 링크: https://github.com/upstash/context7
- 말해보기: "최신 문서 기준으로 이 기능 예제 코드 만들어줘."

**docker** — 도구들을 컨테이너로 깔끔하게 관리
- 이럴 때: 설치 환경이 자꾸 꼬일 때
- 링크(공식 안내): https://docs.docker.com/ai/mcp-catalog-and-toolkit/
- 말해보기: "이 서버를 도커로 띄우는 방법 알려줘."

**sentry** — 에러·이슈 원인 분석 (공식)
- 이럴 때: 운영 중 버그가 났을 때
- 링크: https://github.com/getsentry/sentry-mcp
- 말해보기: "최근 발생한 에러의 원인과 수정 방향 정리해줘."

### 버킷 5. 데이터·제작 (4) — 숫자와 비주얼까지

**postgresql** — DB에 자연어로 질문 (읽기 전용부터)
- 이럴 때: 매출·유저·로그를 말로 물어보기
- 링크(공식 아카이브): https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres
- 말해보기: "지난달 가입자 수를 지역별로 보여줘."

**sqlite** — 작은 로컬 DB·로그·CSV 분석
- 이럴 때: 가벼운 데이터 분석 시작
- 링크(공식 아카이브): https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite
- 말해보기: "이 sqlite 파일에서 상위 매출 10건 뽑아줘."

**chrome-devtools** — 페이지 성능·네트워크 진단 (Google)
- 이럴 때: 사이트가 느릴 때 원인 찾기
- 링크: https://github.com/ChromeDevTools/chrome-devtools-mcp
- 말해보기: "이 페이지 느린 이유를 성능 관점에서 진단해줘."

**glif** — 이미지·콘텐츠 생성 워크플로 실행
- 이럴 때: 썸네일·시안·콘텐츠 변형
- 링크: https://github.com/glifxyz/glif-mcp-server
- 말해보기: "이 콘셉트로 썸네일 시안 아이디어를 뽑아줘."

## 4. 뭐부터? 내 직업이면 이 5개부터 (딱 이것만)

| 나는… | 먼저 깔 5개 |
| --- | --- |
| 콘텐츠 크리에이터 | perplexity, firecrawl, glif, notion, memory |
| 마케터 | exa, firecrawl, playwright, google-drive, slack |
| 개발자 | claude-code, github, git, context7, playwright |
| 대표·기획자 | notion, linear, google-drive, slack, sequential-thinking |
| 데이터 담당 | postgresql, sqlite, firecrawl, exa, claude-code |

이 중 딱 1개부터 시작하세요. 위 2단계 "클로드에게 시키기" 상자에 그 도구 이름과 링크만 넣으면 됩니다.

## 5. 안전하게 쓰는 5가지 (꼭 지키세요)

1. 파일은 폴더 단위로만 열어주기. 컴퓨터 전체가 아니라 "작업 폴더" 하나만.
2. 열쇠(API 키)는 채팅창·노션·문서에 그대로 붙여넣지 않기. 설정 파일이나 환경변수에만.
3. 권한은 처음엔 "읽기 전용"부터. 익숙해진 다음에 늘리기.
4. 처음 보는 도구는 GitHub에서 최근 업데이트·별점·이슈를 한 번 훑고 설치.
5. DB·저장소에 "쓰기/삭제" 권한은 제일 마지막에. 읽기로 충분히 테스트한 뒤에.
