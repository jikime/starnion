---
title: "Text Button - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/text-button/"
---

# Text Button - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/text-button/

## Text Button

TextButton 컴포넌트는 사용자가 어떤 액션을 트리거하거나 이벤트를 실행할 때 사용해요.

### 크기 조정하기

TextButton 컴포넌트의 크기는 typography 속성을 사용해서 변경할 수 있어요. t5, t4 등 다양한 값으로 텍스트 크기를 조정할 수 있어요.

```
<TextButton typography="t5" variant="arrow">
  텍스트 버튼
</TextButton>
<TextButton typography="t3" variant="arrow">
  텍스트 버튼
</TextButton>
<TextButton typography="t1" variant="arrow">
  텍스트 버튼
</TextButton>
```

### 형태 변경하기

TextButton 컴포넌트의 모양을 변경하려면 variant 속성을 사용하세요. 사용할 수 있는 값은 clear, arrow, 그리고 underline이 있어요.

#### 기본 형태

variant 속성에 값을 지정하지 않으면 기본 형태인 clear로 표현돼요. clear는 보조 요소 없이 텍스트만 표시돼요.

```
<TextButton typography="t5">
  텍스트 버튼
</TextButton>
<TextButton typography="t3">
  텍스트 버튼
</TextButton>
<TextButton typography="t1">
  텍스트 버튼
</TextButton>
```

#### 화살표 추가하기

화살표 아이콘과 함께 사용하려면 variant 속성을 arrow로 설정하세요. 컴포넌트 오른쪽에 화살표가 추가돼요.

```
<TextButton typography="t5" variant="arrow">
  텍스트 버튼
</TextButton>
<TextButton typography="t3" variant="arrow">
  텍스트 버튼
</TextButton>
<TextButton typography="t1" variant="arrow">
  텍스트 버튼
</TextButton>
```

#### 밑줄 긋기

TextButton 컴포넌트에 밑줄을 추가하려면 variant 속성을 underline으로 설정하세요.

```
<TextButton typography="t5" variant="underline">
  텍스트 버튼
</TextButton>
<TextButton typography="t3" variant="underline">
  텍스트 버튼
</TextButton>
<TextButton typography="t1" variant="underline">
  텍스트 버튼
</TextButton>
```

### 비활성화

텍스트 버튼을 비활성화하려면 disabled 속성을 사용하세요. 비활성화된 텍스트 버튼은 사용자가 클릭할 수 없고, 시각적으로도 비활성화된 상태임을 나타내요.

```
<TextButton typography="t5" disabled>
  텍스트 버튼
</TextButton>
<TextButton typography="t3" disabled>
  텍스트 버튼
</TextButton>
<TextButton typography="t1" disabled>
  텍스트 버튼
</TextButton>
```

#### TextButtonProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| typography* | - | "t1" | "st1" | "st2" | "st3" | "t2" | "st4" | "st5" | "st6" | "t3" | "st7" | "t4" | "st8" | "st9" | "t5" | "st10" | "t6" | "st11" | "t7" | "st12" | "st13" `TextButton` 컴포넌트의 텍스트 스타일을 설정해요. |
| children* | - | React.ReactNode `TextButton` 컴포넌트 내부에 표시될 내용을 설정해요. |
| variant | 'clear' | "arrow" | "underline" | "clear" `TextButton` 컴포넌트의 형태를 결정해요. |
| disabled | - | false | true `TextButton` 컴포넌트의 비활성화 여부를 나타내요. |
| fontWeight | 'regular' | "regular" | "medium" | "semibold" | "semiBold" | "bold" `TextButton` 컴포넌트의 텍스트 굵기를 설정해요. |
| color | adaptive.grey900 | string `TextButton` 컴포넌트의 텍스트 색상을 설정해요. |
| onPress | - | (event: GestureResponderEvent) => void `TextButton` 컴포넌트가 눌렸을 때 실행되는 함수예요. |
| style | - | StyleProp<ViewStyle> `TextButton` 컴포넌트의 스타일을 변경할 때 사용해요. |
