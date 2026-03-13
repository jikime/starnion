---
title: "Start - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/start/"
---

# Start - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/start/

## TDS React Native 시작하기

TDS React Native 패키지를 사용하면 모바일 환경에서 다양한 UI 컴포넌트를 쉽게 적용할 수 있어요. 이 문서에서는 TDS React Native을 프로젝트에 설치하고 사용하는 방법을 알려드려요.

### 1. 필수 패키지 설치하기

먼저, TDS React Native을 사용하려면 다음 명령어를 터미널에서 실행해서 필요한 패키지들을 추가해 주세요.

```
npm install @toss/tds-react-native
```

tds-react-native는 react를 18버전까지 지원합니다. 19버전은 아직 지원하지 않아요.

### 2. Provider 설정하기

TDS React Native을 사용하려면, 프로젝트의 최상위를 TDSProvider로 감싸야 해요. 이 컴포넌트는 TDS React Native의 컴포넌트들이 올바르게 동작할 수 있도록 설정해 줘요.

```tsx
import { TDSProvider } from '@toss/tds-react-native';
 
function App({ Component, pageProps }) {
  return (
    <TDSProvider>
      <Component {...pageProps} />
    </TDSProvider>
  );
}
```

### 3. 사용하기

패키지 설치와 설정이 끝났다면, 이제 컴포넌트를 프로젝트에 불러와서 사용할 수 있어요. 예를 들어, Button 컴포넌트를 사용하려면 다음과 같이 코드를 작성하면 돼요.

```tsx
import { Button } from '@toss/tds-react-native';
 
const App = () => <Button>버튼</Button>;
```
