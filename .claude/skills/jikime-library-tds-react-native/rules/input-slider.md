---
title: "Slider - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/slider/"
---

# Slider - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/slider/

## Slider

Slider 컴포넌트는 사용자가 슬라이딩 제스처로 값을 선택할 수 있게 해주는 컴포넌트예요. 볼륨 조절, 밝기 조절, 범위 선택 등에 사용해요.

### 기본 사용

Slider를 사용하려면 value와 onChange를 지정하세요.

```tsx
const [value, setValue] = useState(50);
 
<Slider
  value={value}
  onChange={setValue}
/>
```

### 범위 설정

min과 max를 사용해 슬라이더의 범위를 설정할 수 있어요.

```
<Slider
  min={0}
  max={100}
  value={value}
  onChange={setValue}
/>
```

### 간격 설정

step 속성을 사용해 값 변경 간격을 설정할 수 있어요.

```
// 5 단위로 변경
<Slider
  min={0}
  max={100}
  step={5}
  value={value}
  onChange={setValue}
/>
 
// 10 단위로 변경
<Slider
  min={0}
  max={100}
  step={10}
  value={value}
  onChange={setValue}
/>
```

### 색상 변경

color 속성을 사용해 슬라이더의 색상을 변경할 수 있어요.

```tsx
import { colors } from '@toss/tds-colors';
 
<Slider
  value={value}
  onChange={setValue}
  color={colors.blue400}
/>
 
<Slider
  value={value}
  onChange={setValue}
  color={colors.green500}
/>
```

### 값 표시와 함께 사용

슬라이더의 현재 값을 텍스트로 함께 표시할 수 있어요.

```tsx
const [value, setValue] = useState(50);
 
<View>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
    <Txt>볼륨</Txt>
    <Txt fontWeight="semiBold">{value}%</Txt>
  </View>
  <Slider
    min={0}
    max={100}
    step={1}
    value={value}
    onChange={setValue}
  />
</View>
```

### 점수 선택

별점이나 평점을 선택하는 데 사용할 수 있어요.

```tsx
const [rating, setRating] = useState(3);
 
<View>
  <Txt>별점: {rating}점</Txt>
  <Slider
    min={1}
    max={5}
    step={1}
    value={rating}
    onChange={setRating}
  />
</View>
```

### 접근성

Slider는 스크린 리더 사용자를 위한 접근성 기능을 제공해요. iOS에서는 상하 스와이프로, Android에서는 볼륨 키로 값을 조절할 수 있어요.

```
<Slider
  value={value}
  onChange={setValue}
  accessibilityLabel="볼륨 조절"
  accessibilityHint="슬라이더를 움직여 볼륨을 조절하세요"
/>
```

#### SliderProps

View 컴포넌트를 확장하여 제작했어요. View 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| min | 0 | number 슬라이더의 최소값을 지정해요. |
| max | 100 | number 슬라이더의 최대값을 지정해요. |
| value | (min + max) / 2 | number 슬라이더의 현재 값을 지정해요. |
| step | 1 | number 슬라이더의 값 변경 간격을 지정해요. 양의 정수만 입력 가능해요. |
| onChange | - | (value: number) => void 슬라이더의 값이 변경될 때 호출되는 함수예요. |
| color | - | string 슬라이더의 색상을 지정해요. |
