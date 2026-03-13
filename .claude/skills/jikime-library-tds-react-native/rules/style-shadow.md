---
title: "Shadow - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/shadow/"
---

# Shadow - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/shadow/

## Shadow

Shadow 컴포넌트는 요소에 그림자 효과를 추가하는 데 사용해요. iOS와 Android 플랫폼에 맞는 그림자 스타일을 자동으로 생성해요.

### 기본 사용

ShadowBackground를 사용하려면 shadow 속성을 지정하세요.

```
<View style={{ position: 'relative', width: 200, height: 100 }}>
  <ShadowBackground
    shadow={{
      color: '#000',
      radius: 10,
      opacity: 0.1,
      offset: { x: 0, y: 2 }
    }}
  />
  <View>{/* 실제 콘텐츠 */}</View>
</View>
```

### 테마별 색상 지정

lightColor와 darkColor를 사용해 라이트/다크 모드에 따라 다른 그림자 색상을 적용할 수 있어요.

```
<View style={{ position: 'relative', width: 200, height: 100 }}>
  <ShadowBackground
    shadow={{
      lightColor: '#000',
      darkColor: '#fff',
      radius: 10,
      opacity: 0.1,
      offset: { x: 0, y: 2 }
    }}
  />
  <View>{/* 실제 콘텐츠 */}</View>
</View>
```

### 다양한 그림자 효과

```
// 약한 그림자
<ShadowBackground
  shadow={{
    color: '#000',
    radius: 4,
    opacity: 0.05,
    offset: { x: 0, y: 1 }
  }}
/>

// 중간 그림자
<ShadowBackground
  shadow={{
    color: '#000',
    radius: 10,
    opacity: 0.1,
    offset: { x: 0, y: 2 }
  }}
/>

// 강한 그림자
<ShadowBackground
  shadow={{
    color: '#000',
    radius: 20,
    opacity: 0.15,
    offset: { x: 0, y: 4 }
  }}
/>
```

### useShadow 훅 사용

useShadow 훅을 사용해 그림자 스타일을 직접 적용할 수도 있어요.

```tsx
import { useShadow } from '@toss/tds-react-native';

const MyComponent = () => {
  const shadowStyle = useShadow({
    color: '#000',
    radius: 10,
    opacity: 0.1,
    offset: { x: 0, y: 2 }
  });

  return (
    <View style={[{ width: 200, height: 100 }, shadowStyle]}>
      {/* 콘텐츠 */}
    </View>
  );
};
```

#### ShadowBackgroundProps

View 컴포넌트를 확장하여 제작했어요. View 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| shadow* | - | ShadowTokenProps | ShadowCustomProps 그림자 설정을 지정해요. |
