---
name: jikime-library-tds-react-native
description: Toss Design System (TDS) React Native component library built on top of React Native/Expo. Use with jikime-mobile-react-native for complete mobile development patterns.
version: 1.0.0

# Dependency: This skill extends React Native patterns with TDS components
skills: jikime-mobile-react-native

progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~5000

triggers:
  keywords: ["TDS", "toss", "toss design", "@toss/tds-react-native", "토스 디자인"]
  phases: ["run"]
  agents: ["frontend"]
  languages: ["typescript", "javascript"]
---

# Toss Design System (TDS) React Native

Toss Design System React Native 컴포넌트 라이브러리. 토스 스타일의 모바일 앱 UI를 구축하기 위한 종합적인 컴포넌트 패턴을 제공합니다.

> Source: https://tossmini-docs.toss.im/tds-react-native/

## Quick Reference

| Category | Components | Description |
|----------|------------|-------------|
| **Foundation** | Colors, Typography | 디자인 시스템의 기본 토큰 |
| **Guide** | Intro, Start, Tutorial | 시작 가이드 및 튜토리얼 |
| **Input** | Button, TextField, Checkbox, Radio, Switch, Slider, Dropdown, Keypad | 사용자 입력 컴포넌트 |
| **Layout** | List, GridList, ListRow, BoardRow, TableRow | 레이아웃 및 목록 컴포넌트 |
| **Feedback** | Dialog, Toast, Loader, Skeleton, ProgressBar, Result, ErrorPage | 피드백 및 상태 표시 |
| **Navigation** | Navbar, Tab, Stepper, SegmentedControl | 내비게이션 컴포넌트 |
| **Display** | Badge, Rating, AmountTop, Asset, Highlight, Post, Carousel, BarChart | 정보 표시 컴포넌트 |
| **Style** | Border, Shadow, Gradient, BottomInfo | 스타일 유틸리티 |

## Component Categories

### Foundation (2 files)
Core design tokens and styling primitives.

| File | Component | Description |
|------|-----------|-------------|
| `foundation-colors.md` | Colors | 색상 시스템 (adaptive, static colors) |
| `foundation-typography.md` | Typography | 타이포그래피 시스템 (Txt, t1-t7, st1-st13) |

### Guide (3 files)
Getting started and tutorials.

| File | Component | Description |
|------|-----------|-------------|
| `guide-intro.md` | Introduction | TDS React Native 소개 |
| `guide-start.md` | Getting Started | 설치 및 설정 가이드 |
| `guide-tutorial.md` | Tutorial | 기본 사용법 튜토리얼 |

### Input (12 files)
User input and interaction components.

| File | Component | Description |
|------|-----------|-------------|
| `input-button.md` | Button | 기본 버튼 (size, style, disabled) |
| `input-text-button.md` | TextButton | 텍스트 버튼 |
| `input-icon-button.md` | IconButton | 아이콘 버튼 |
| `input-text-field.md` | TextField | 텍스트 입력 필드 |
| `input-search-field.md` | SearchField | 검색 입력 필드 |
| `input-checkbox.md` | Checkbox | 체크박스 (단일/다중 선택) |
| `input-radio.md` | Radio | 라디오 버튼 그룹 |
| `input-switch.md` | Switch | 토글 스위치 |
| `input-slider.md` | Slider | 슬라이더 (범위 선택) |
| `input-dropdown.md` | Dropdown | 드롭다운 선택기 |
| `input-keypad.md` | Keypad | 숫자 키패드 |
| `input-numeric-spinner.md` | NumericSpinner | 숫자 증감 스피너 |

### Layout (7 files)
List and layout structure components.

| File | Component | Description |
|------|-----------|-------------|
| `layout-list.md` | List | 기본 리스트 컨테이너 |
| `layout-grid-list.md` | GridList | 그리드 레이아웃 리스트 |
| `layout-list-row.md` | ListRow | 리스트 행 (1Row, 2Row, 3Row 타입) |
| `layout-board-row.md` | BoardRow | 보드 스타일 행 |
| `layout-list-header.md` | ListHeader | 리스트 헤더 |
| `layout-list-footer.md` | ListFooter | 리스트 푸터 |
| `layout-table-row.md` | TableRow | 테이블 행 (키-값 표시) |

### Feedback (7 files)
User feedback and status indication components.

| File | Component | Description |
|------|-----------|-------------|
| `feedback-dialog.md` | Dialog | 다이얼로그 모달 |
| `feedback-toast.md` | Toast | 토스트 메시지 |
| `feedback-loader.md` | Loader | 로딩 인디케이터 |
| `feedback-skeleton.md` | Skeleton | 스켈레톤 로딩 UI |
| `feedback-progress-bar.md` | ProgressBar | 진행률 표시 바 |
| `feedback-result.md` | Result | 결과 표시 화면 |
| `feedback-error-page.md` | ErrorPage | 에러 페이지 |

### Navigation (4 files)
Navigation and routing components.

| File | Component | Description |
|------|-----------|-------------|
| `navigation-navbar.md` | Navbar | 상단 내비게이션 바 |
| `navigation-tab.md` | Tab | 탭 내비게이션 |
| `navigation-stepper.md` | Stepper/StepperRow | 단계 표시 컴포넌트 |
| `navigation-segmented-control.md` | SegmentedControl | 세그먼트 컨트롤 |

### Display (8 files)
Information display and visualization components.

| File | Component | Description |
|------|-----------|-------------|
| `display-badge.md` | Badge | 배지 (상태 표시) |
| `display-rating.md` | Rating | 별점 컴포넌트 |
| `display-amount-top.md` | AmountTop | 금액 강조 표시 |
| `display-asset.md` | Asset | 이미지/아이콘/Lottie 프레임 |
| `display-highlight.md` | Highlight | 하이라이트 (튜토리얼용) |
| `display-post.md` | Post | 포스트 스타일 (H1-H4, Paragraph, List) |
| `display-carousel.md` | Carousel | 캐러셀 슬라이더 |
| `display-bar-chart.md` | BarChart | 막대 그래프 |

### Style (4 files)
Styling utilities and visual effects.

| File | Component | Description |
|------|-----------|-------------|
| `style-border.md` | Border | 구분선 (full, padding24, height16) |
| `style-shadow.md` | Shadow | 그림자 효과 |
| `style-gradient.md` | Gradient | 그라데이션 (Linear, Radial) |
| `style-bottom-info.md` | BottomInfo | 하단 정보 표시 영역 |

## Installation

```bash
# npm
npm install @toss/tds-react-native

# yarn
yarn add @toss/tds-react-native

# pnpm
pnpm add @toss/tds-react-native
```

## Basic Setup

```tsx
import { TDSProvider } from '@toss/tds-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TDSProvider>
        {/* Your app content */}
      </TDSProvider>
    </GestureHandlerRootView>
  );
}
```

## Usage Example

```tsx
import {
  Button,
  TextField,
  ListRow,
  Dialog,
  colors
} from '@toss/tds-react-native';

function MyScreen() {
  const [name, setName] = useState('');
  const [showDialog, setShowDialog] = useState(false);

  return (
    <View>
      <TextField
        label="이름"
        value={name}
        onChangeText={setName}
        placeholder="이름을 입력하세요"
      />

      <ListRow
        contents={<ListRow.Texts type="2RowTypeA" top="항목 제목" bottom="설명 텍스트" />}
        onClick={() => console.log('clicked')}
      />

      <Button size="large" onPress={() => setShowDialog(true)}>
        저장하기
      </Button>

      <Dialog.Confirm
        open={showDialog}
        title="저장하시겠습니까?"
        description="입력한 내용이 저장됩니다."
        confirmButton={{ text: '저장', onPress: () => {} }}
        cancelButton={{ text: '취소', onPress: () => setShowDialog(false) }}
      />
    </View>
  );
}
```

## Key Features

- **Consistent Design**: 토스 앱과 동일한 디자인 언어
- **Accessibility**: WCAG 접근성 지원
- **Dark Mode**: 자동 다크 모드 지원 (adaptive colors)
- **Performance**: 최적화된 렌더링 성능
- **TypeScript**: 완전한 타입 지원

## Required Skills

This skill is built on top of React Native fundamentals. The following skill is automatically loaded as a dependency:

- **`jikime-mobile-react-native`** (Required): React Native 및 Expo 개발 패턴 - TDS 컴포넌트 사용 전 React Native 기본 지식 필요

## Related Skills

- `jikime-lang-typescript`: TypeScript 개발 패턴
