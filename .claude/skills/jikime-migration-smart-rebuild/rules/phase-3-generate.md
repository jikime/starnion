# Phase 3: Generate (코드 생성) - Claude Code 직접 수행

## 목표

**CRITICAL:** 이 단계는 CLI가 아닌 **Claude Code가 직접 수행**합니다.

스크린샷과 분석 결과를 바탕으로 원본 사이트의 UI를 재현하는 코드를 작성합니다.

## 실행

```bash
/jikime:smart-rebuild generate frontend --mapping=./mapping.json --output=./frontend --capture=./capture --target=nextjs16
```

이 명령을 실행하면 **Claude Code가 다음을 수행**합니다:
1. **타겟 프레임워크 Skill 로드** (CRITICAL)
2. 스크린샷을 Read 도구로 읽고 시각적으로 분석
3. HTML 콘텐츠를 추출하여 텍스트/이미지 확인
4. ui_analysis 결과 참조
5. **로드된 Skill 패턴에 따라 실제 UI를 재현하는 코드 직접 작성**

## Claude Code 실행 지시사항 (EXECUTION DIRECTIVE)

### Step 0: 타겟 프레임워크 + UI 라이브러리 Skill 로드 (CRITICAL)

**반드시 코드 생성 전에 해당 프레임워크와 UI 라이브러리 Skill을 로드해야 합니다.**

#### Step 0-1: 프레임워크 Skill 로드
```
| --target   | 로드할 Skill                         | 프로젝트 생성 (Claude Code 직접 수행) |
|------------|-------------------------------------|-------------------------------------|
| nextjs16   | Skill("jikime-framework-nextjs@16") | npx create-next-app@latest --typescript --tailwind --app |
| nextjs15   | Skill("jikime-framework-nextjs@15") | npx create-next-app@latest --typescript --tailwind --app |
| react      | Skill("jikime-domain-frontend")     | npm create vite@latest -- --template react-ts |
```

> **CRITICAL**: 프로젝트 초기화는 **스크립트가 아닌 Claude Code가 직접** 수행합니다.

#### Step 0-2: UI 라이브러리 Skill 로드 (CRITICAL for modernization)
```
| --ui-library | 로드할 Skill               | 컴포넌트 변환 |
|--------------|---------------------------|--------------|
| shadcn       | Skill("jikime-library-shadcn") | 레거시 HTML → shadcn 컴포넌트 |
| legacy-css   | _(없음)_                   | 레거시 CSS 복사 (비권장) |
```

> **CRITICAL**: UI 라이브러리 스킬은 레거시 HTML/CSS를 현대적 컴포넌트로 변환하는 패턴을 제공합니다.
> `legacy-css` 선택 시 스킬이 로드되지 않고 기존 스타일이 그대로 복사됩니다 (현대화 목표에 부적합).

**스킬을 로드하면 해당 프레임워크/라이브러리의:**
- 프로젝트 초기화 방법
- 디렉토리 구조 및 라우팅 패턴
- 컴포넌트 작성 컨벤션
- CSS 설정 방식
- **레거시 → 현대 컴포넌트 매핑 테이블** (UI 라이브러리 스킬)

을 따라 코드를 작성합니다.

### Step 1: 입력 파일 읽기

```
1. Read 도구로 mapping.json 읽기
2. 페이지 목록과 각 페이지의 경로 확인:
   - capture.screenshot: 스크린샷 경로
   - capture.html: HTML 파일 경로
   - ui_analysis: UI 분석 결과 (있으면)
   - output.frontend.path: 생성할 파일 경로
```

### Step 2: Next.js + shadcn/ui 프로젝트 초기화 (CRITICAL - Claude Code 직접 수행)

**IMPORTANT**: Claude Code는 스크립트에 **의존하지 않고** 다음 원칙을 따라야 합니다:
- Next.js 프로젝트는 **반드시** `create-next-app`으로 생성
- shadcn 초기화는 **반드시** 실행
- **레거시 CSS를 복사하지 않음** - shadcn 컴포넌트 사용

```bash
# Step 2-1: Next.js 프로젝트 생성 (CRITICAL - 스크립트 대신 직접 실행)
npx create-next-app@latest {output_dir}/frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm

# Step 2-2: shadcn/ui 초기화 (CRITICAL)
cd {output_dir}/frontend && npx shadcn@latest init --defaults

# Step 2-3: 필요한 컴포넌트 추가
cd {output_dir}/frontend && npx shadcn@latest add button card table form input dialog alert badge tabs select label textarea
```

> **WHY**:
> - `create-next-app`이 올바른 의존성, 설정 파일, 프로젝트 구조를 자동으로 생성합니다.
> - `shadcn init`이 Tailwind CSS 설정을 확장하고 CSS 변수를 설정합니다.
> - Claude Code는 **스크립트 동작에 의존하지 않고** 이 원칙을 스스로 인지하고 따라야 합니다.

### Step 2-4: 테마 색상 커스터마이징 (선택적)

shadcn init 후 생성된 `src/app/globals.css`에서 CSS 변수를 수정:

```css
/* src/app/globals.css - shadcn이 생성한 파일 수정 */
@layer base {
  :root {
    /* ui_analysis.colors 기반으로 색상 커스터마이징 */
    --primary: {ui_analysis.colors.primary를 HSL로 변환};
    --secondary: {ui_analysis.colors.secondary를 HSL로 변환};
    --background: {ui_analysis.colors.background를 HSL로 변환};
    --foreground: {ui_analysis.colors.text를 HSL로 변환};
    /* ... 기타 색상 변수 */
  }
}
```

> **참고**: shadcn은 HSL 형식의 CSS 변수를 사용합니다. HEX 색상을 HSL로 변환 필요.

### Step 3: 각 페이지 코드 작성

각 페이지에 대해 다음을 수행:

```
1. 스크린샷 읽기 (Read 도구)
   → {capture_dir}/{page.capture.screenshot}

2. HTML 읽기 (Read 도구) - 텍스트 콘텐츠 확인용
   → {capture_dir}/{page.capture.html}

3. 스크린샷을 **시각적으로 분석**하여:
   - 전체 레이아웃 구조 파악
   - 헤더/네비게이션 디자인 확인
   - 메인 콘텐츠 영역 구성 분석
   - 색상, 간격, 폰트 크기 추정
   - 카드, 버튼, 폼 등 컴포넌트 식별

4. 분석 결과를 바탕으로 React 코드 작성:
   - 스크린샷과 유사한 레이아웃 구현
   - Tailwind CSS v4 클래스 사용
   - 반응형 디자인 (md:, lg: 브레이크포인트)
   - HTML에서 추출한 실제 텍스트 콘텐츠 포함

5. Write 도구로 파일 저장
   → {output_dir}/app/{route}/page.tsx
```

## 코드 작성 가이드

### CRITICAL: shadcn/ui 컴포넌트 사용

스크린샷의 UI를 재현할 때 **반드시 shadcn/ui 컴포넌트를 사용**합니다.

```bash
# 페이지에서 사용할 컴포넌트 미리 추가
npx shadcn@latest add button card navigation-menu
```

### 정적 페이지

스크린샷의 UI를 최대한 재현 (shadcn 컴포넌트 사용):

```tsx
// src/app/about-us/page.tsx (kebab-case 폴더명!)
// 스크린샷을 보고 Claude Code가 직접 작성

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'About Us | Example Company',
};

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 - 스크린샷의 네비게이션 바 재현 */}
      <header className="border-b">
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-xl font-bold">Logo</div>
          <div className="hidden md:flex gap-6">
            <Button variant="ghost" asChild>
              <a href="/">Home</a>
            </Button>
            <Button variant="ghost" asChild>
              <a href="/about-us">About</a>
            </Button>
            <Button variant="ghost" asChild>
              <a href="/contact">Contact</a>
            </Button>
          </div>
        </nav>
      </header>

      {/* 히어로 섹션 - 스크린샷에서 확인된 배너 영역 */}
      <section className="bg-primary text-primary-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            회사 소개
          </h1>
          <p className="text-lg opacity-90 max-w-2xl mx-auto">
            2010년부터 고객과 함께 성장해온 신뢰받는 기업입니다.
          </p>
        </div>
      </section>

      {/* 메인 콘텐츠 - HTML에서 추출한 텍스트 + 스크린샷 레이아웃 */}
      <main className="container mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold mb-6">우리의 이야기</h2>
        <p className="text-muted-foreground mb-8">
          {/* HTML에서 추출한 실제 콘텐츠 */}
          저희 회사는 2010년에 설립되어...
        </p>

        {/* 스크린샷에서 확인된 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>사무실</CardTitle>
            </CardHeader>
            <CardContent>
              <img src="/images/office.jpg" alt="사무실" className="rounded-lg" />
            </CardContent>
          </Card>
          {/* ... 추가 카드 */}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 Example Company. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
```

### 동적 페이지 (Mock 데이터)

```bash
# 테이블 컴포넌트 추가
npx shadcn@latest add table badge alert
```

```tsx
// src/app/member-list/page.tsx (kebab-case 폴더명!)
// 스크린샷의 테이블/리스트 UI를 재현하되, Mock 데이터 사용

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AlertTriangle } from 'lucide-react'

// ⚠️ MOCK DATA - Will be replaced by generate connect
const mockMembers = [
  { id: 1, name: '홍길동', email: 'hong@example.com', status: 'ACTIVE' },
  { id: 2, name: '김철수', email: 'kim@example.com', status: 'ACTIVE' },
  { id: 3, name: '이영희', email: 'lee@example.com', status: 'INACTIVE' },
];

export const metadata = {
  title: '회원 목록',
};

export default function MemberListPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Mock 데이터 경고 배너 - shadcn Alert 사용 */}
      <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Mock Data Mode</AlertTitle>
        <AlertDescription>
          이 페이지는 Mock 데이터를 사용합니다. generate connect 실행 후 실제 API와 연동됩니다.
        </AlertDescription>
      </Alert>

      {/* 헤더 */}
      <header className="bg-primary text-primary-foreground py-4">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold">회원 관리</h1>
        </div>
      </header>

      {/* 메인 - shadcn Table 사용 */}
      <main className="container mx-auto px-4 py-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockMembers.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <Badge variant={member.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {member.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
```

## 스크린샷 분석 요령

Claude Code가 스크린샷을 볼 때 확인해야 할 사항:

| 요소 | 확인 사항 | Tailwind 적용 |
|------|----------|---------------|
| **레이아웃** | 전체 구조, 섹션 배치 | flex, grid, container |
| **헤더** | 높이, 배경색, 로고 위치, 메뉴 스타일 | h-16, bg-primary, flex justify-between |
| **색상** | 주요 색상, 배경, 텍스트 | text-primary, bg-background |
| **간격** | 패딩, 마진, 요소 간 거리 | py-8, px-4, gap-6, space-y-4 |
| **타이포그래피** | 제목 크기, 본문 크기 | text-4xl, text-base, font-bold |
| **카드/박스** | 그림자, 라운드, 테두리 | shadow-md, rounded-lg, border |
| **버튼** | 크기, 색상, 호버 효과 | px-4 py-2, bg-primary, hover:opacity-90 |

## 파일 네이밍 규칙 (CRITICAL)

생성되는 모든 파일은 **kebab-case**를 사용합니다:

| 파일 유형 | 규칙 | 좋은 예 | 나쁜 예 |
|----------|------|---------|---------|
| **페이지 폴더** | kebab-case | `about-us/`, `contact-form/` | `aboutUs/`, `ContactForm/` |
| **컴포넌트 파일** | kebab-case | `header-nav.tsx`, `user-card.tsx` | `HeaderNav.tsx`, `userCard.tsx` |
| **유틸리티 파일** | kebab-case | `format-date.ts`, `api-client.ts` | `formatDate.ts`, `ApiClient.ts` |
| **타입 파일** | kebab-case | `user-types.ts`, `api-response.ts` | `UserTypes.ts`, `apiResponse.ts` |

## 생성 파일 구조

```
{output}/frontend/
├── app/
│   ├── globals.css          # Tailwind v4 테마 색상 (nextjs16)
│   ├── layout.tsx           # 루트 레이아웃 (선택적)
│   ├── page.tsx             # 홈 페이지
│   ├── about-us/            # kebab-case 폴더명
│   │   └── page.tsx         # 정적 페이지
│   └── member-list/         # kebab-case 폴더명
│       └── page.tsx         # 동적 페이지 (Mock)
└── components/              # 공통 컴포넌트 (필요시)
    ├── header-nav.tsx       # kebab-case 파일명
    └── footer-links.tsx     # kebab-case 파일명
```

## 주의사항

1. **프로젝트 초기화**: `npx create-next-app@latest` → `cd {project}` → `npx shadcn@latest init` 순서로 생성 (globals.css 직접 만들지 않음)
2. **shadcn/ui 필수**: 모든 UI 컴포넌트는 shadcn/ui 사용 (`Button`, `Card`, `Table` 등)
3. **스크린샷 분석**: 템플릿이 아닌 실제 UI 재현
4. **HTML 콘텐츠 활용**: 실제 텍스트, 이미지 URL 사용
5. **kebab-case 폴더명**: `about-us/`, `member-list/` (URL 표준 준수)
6. **반응형 필수**: md:, lg: 브레이크포인트 적용
7. **동적 페이지는 Mock**: shadcn Alert로 경고 배너 표시

## 다음 단계

→ [Phase 3b: Generate Backend](./phase-3b-backend.md)
→ [Phase 3c: Generate Connect](./phase-3c-connect.md)
