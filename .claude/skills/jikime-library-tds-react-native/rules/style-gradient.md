---
title: "Gradient - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/gradient/"
---

# Gradient - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/gradient/

## Gradient

Gradient 컴포넌트는 선형 또는 방사형 그라데이션을 생성하는 데 사용해요. 배경이나 오버레이 효과를 만들 때 유용해요.

### LinearGradient

선형 그라데이션을 생성해요.

```
<View style={{ width: 300, height: 200 }}>
  <LinearGradient
    colors={['#FF6B6B', '#4ECDC4']}
    degree="180deg"
  />
</View>
```

### 각도 조정

```
// 수평 그라데이션
<LinearGradient
  colors={['#FF6B6B', '#4ECDC4']}
  degree="90deg"
/>

// 수직 그라데이션
<LinearGradient
  colors={['#FF6B6B', '#4ECDC4']}
  degree="180deg"
/>

// 대각선 그라데이션
<LinearGradient
  colors={['#FF6B6B', '#4ECDC4']}
  degree="45deg"
/>
```

### 여러 색상

```
<LinearGradient
  colors={['#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1']}
  degree="180deg"
/>
```

### 색상 위치 지정

```
<LinearGradient
  colors={['#FF6B6B', '#4ECDC4']}
  positions={[0.2, 0.8]}
  degree="180deg"
/>
```

### RadialGradient

방사형 그라데이션을 생성해요.

```
<View style={{ width: 300, height: 300 }}>
  <RadialGradient
    colors={['#FF6B6B', '#4ECDC4']}
    cx={0.5}
    cy={0.5}
    r={0.5}
  />
</View>
```

### 중심점 조정

```
// 왼쪽 상단이 중심
<RadialGradient
  colors={['#FF6B6B', '#4ECDC4']}
  cx={0.2}
  cy={0.2}
  r={0.8}
/>

// 오른쪽 하단이 중심
<RadialGradient
  colors={['#FF6B6B', '#4ECDC4']}
  cx={0.8}
  cy={0.8}
  r={0.8}
/>
```

### 배경 오버레이

```
<View style={{ flex: 1 }}>
  <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} />
  <View style={{ position: 'absolute', width: '100%', height: '100%' }}>
    <LinearGradient
      colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.7)']}
      degree="180deg"
    />
  </View>
  <View style={{ position: 'absolute', bottom: 20, left: 20 }}>
    <Txt color="white" typography="h2">제목</Txt>
  </View>
</View>
```

#### LinearGradientProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| colors* | - | string[] 그라데이션의 색상 배열을 지정해요. |
| degree | '180deg' | string | number 그라데이션의 각도를 지정해요. |
| positions | - | number[] 각 색상의 위치를 0-1 사이의 값으로 지정해요. |
| easing | - | "linear" | "ease-in" | "ease-out" | "ease-in-out" 색상 전환의 이징 함수를 지정해요. |
| colorStopCount | - | number 색상 정지점의 개수를 지정해요. |

#### RadialGradientProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| colors* | - | string[] 그라데이션의 색상 배열을 지정해요. |
| positions | - | number[] 각 색상의 위치를 0-1 사이의 값으로 지정해요. |
| easing | - | "linear" | "ease-in" | "ease-out" | "ease-in-out" 색상 전환의 이징 함수를 지정해요. |
| colorStopCount | - | number 색상 정지점의 개수를 지정해요. |
| cx | - | number 그라데이션의 중심 X 좌표를 0-1 사이의 값으로 지정해요. |
| cy | - | number 그라데이션의 중심 Y 좌표를 0-1 사이의 값으로 지정해요. |
| r | - | number 그라데이션의 반경을 0-1 사이의 값으로 지정해요. |
