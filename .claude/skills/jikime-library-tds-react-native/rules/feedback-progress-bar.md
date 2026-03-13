---
title: "ProgressBar - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/progress-bar/"
---

# ProgressBar - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/progress-bar/

## ProgressBar

ProgressBar 컴포넌트는 작업의 진행 상태를 시각적으로 표시하는 데 사용해요. 파일 업로드, 폼 작성 진행률 등을 나타낼 때 유용해요.

### 기본 사용

ProgressBar를 사용하려면 progress와 size 속성을 지정하세요.

```
<ProgressBar progress={60} size="normal" />
```

### 크기 조정

size 속성을 사용해 ProgressBar의 두께를 조정할 수 있어요.

```
<ProgressBar progress={60} size="light" />
<ProgressBar progress={60} size="normal" />
<ProgressBar progress={60} size="bold" />
```

### 색상 변경

color 속성을 사용해 진행 바의 색상을 변경할 수 있어요.

```tsx
import { colors } from '@toss/tds-colors';

<ProgressBar progress={60} size="normal" color={colors.blue500} />
<ProgressBar progress={60} size="normal" color={colors.green500} />
<ProgressBar progress={60} size="normal" color={colors.red500} />
```

### 애니메이션

withAnimation 속성을 사용해 진행률 변경 시 부드러운 애니메이션을 적용할 수 있어요.

```tsx
const [progress, setProgress] = useState(0);

useEffect(() => {
  const interval = setInterval(() => {
    setProgress(prev => {
      if (prev >= 100) return 0;
      return prev + 10;
    });
  }, 500);

  return () => clearInterval(interval);
}, []);

<ProgressBar progress={progress} size="normal" withAnimation={true} />
```

### 진행률 표시

ProgressBar와 함께 텍스트로 진행률을 표시할 수 있어요.

```tsx
const [progress, setProgress] = useState(45);

<View>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
    <Txt>파일 업로드 중</Txt>
    <Txt>{progress}%</Txt>
  </View>
  <ProgressBar progress={progress} size="normal" withAnimation={true} />
</View>
```

#### ProgressBarProps

View 컴포넌트를 확장하여 제작했어요. View 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| progress* | - | number 진행률을 나타내는 값이에요. 0부터 100 사이의 숫자를 입력해요. |
| size* | - | "light" | "normal" | "bold" ProgressBar의 크기를 지정해요. |
| color | - | string ProgressBar의 트랙에 채워지는 색상을 지정해요. |
| withAnimation | false | false | true 애니메이션을 사용할지 여부를 결정해요. |
