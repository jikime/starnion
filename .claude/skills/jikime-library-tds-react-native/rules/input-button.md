---
title: "Button - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/button/"
---

# Button - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/button/

## Button

Button 컴포넌트는 사용자가 어떤 액션을 트리거하거나 이벤트를 실행할 때 사용해요. 버튼은 기본적인 UI 요소로, 폼 제출, 다이얼로그 열기, 작업 취소, 삭제와 같은 다양한 액션을 처리하는 데 사용해요.

### 크기 조정하기

Button 컴포넌트의 크기를 변경하려면 size 속성을 사용하세요. tiny, medium, large, big 중 하나를 선택할 수 있어요.

```
<Button size="tiny">Tiny</Button>
<Button size="medium">Medium</Button>
<Button size="large">Large</Button>
<Button size="big">Big</Button>
```

### 스타일

버튼의 스타일을 설정하려면 style 속성을 사용하세요. 선택 할 수 있는 값에는 fill과 weak이 있어요.

#### fill

fill 스타일은 채도가 높아 시각적으로 강렬하고 눈에 띄는 디자인이라 주요 액션을 강조하는 데 적합해요. 사용자가 버튼을 즉시 인지하고 상호작용할 수 있도록 도와줘요.

```
<Button type="primary" style="fill">
  Primary
</Button>
<Button type="dark" style="fill">
  Dark
</Button>
<Button type="danger" style="fill">
  Danger
</Button>
<View style={{ backgroundColor: colors.blue500, padding: 8 }}>
  <Button type="light" style="fill">
    Light
  </Button>
</View>
```

#### weak

weak 스타일은 채도가 낮아 시각적으로 덜 강렬하며 부드럽고 조용한 느낌을 줘요. 그래서 덜 중요한 액션이나 보조적인 버튼에 적합해요. 이 스타일을 사용하면 주요 액션과 보조 액션을 명확히 구분할 수 있죠. weak 스타일의 버튼은 반투명하게 디자인되어 배경색이 살짝 드러나는 모습이에요.

```
<Button type="primary" style="weak">
  Primary
</Button>
<Button type="dark" style="weak">
  Dark
</Button>
<Button type="danger" style="weak">
  Danger
</Button>
<View style={{ backgroundColor: colors.blue500, padding: 8 }}>
  <Button type="light" style="weak">
    Light
  </Button>
</View>
```

### 형태

버튼의 형태를 변경하려면 display 속성을 사용하세요. 선택할 수 있는 값에는 block, full이 있어요.

- block: 버튼이 줄바꿈되어 화면 너비에 맞게 확장돼요.
- full: 버튼이 부모 요소의 전체 너비를 차지해요.

```
<Button display="block">Block</Button>
<Button display="full">Full</Button>
```

### 로딩

loading 속성을 사용해 버튼의 로딩 상태를 나타낼 수 있어요. 로딩중에는 버튼을 클릭할 수 없고, 로딩 중임을 시각적으로 나타내요.

```
<Button type="primary" loading disabled>
  Primary
</Button>
<Button type="dark" loading disabled>
  Dark
</Button>
<Button type="danger" loading disabled>
  Danger
</Button>
```

### 비활성화

버튼을 비활성화하려면 disabled 속성을 사용하세요. 비활성화된 버튼은 사용자가 클릭할 수 없고, 시각적으로도 비활성화된 상태임을 나타내요.

```
<Button type="primary" disabled>
  Primary
</Button>
<Button type="dark" disabled>
  Dark
</Button>
<Button type="danger" disabled>
  Danger
</Button>
```

#### ButtonProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode `Button` 컴포넌트 내부에 표시될 내용을 지정해요. |
| onPress | - | (event: GestureResponderEvent) => void `Button` 컴포넌트가 눌렸을 때 호출되는 함수예요. |
| type | 'primary' | "primary" | "danger" | "light" | "dark" `Button` 컴포넌트의 색상 타입을 지정해요. |
| style | 'fill' | "fill" | "weak" `Button` 컴포넌트의 스타일을 지정해요. 'fill'은 채워진 스타일, 'weak'은 투명한 스타일이에요. |
| display | 'block' | "block" | "full" `Button` 컴포넌트의 표시 방식을 지정해요. 'block'은 전체 너비를 차지하고, 'full'은 부모 컨테이너에 맞춰요. |
| size | 'big' | "big" | "large" | "medium" | "tiny" `Button` 컴포넌트의 크기를 지정해요. |
| loading | false | false | true true일 경우 버튼에 로딩 스피너가 표시되고 `Button` 컴포넌트가 클릭되지 않아요. |
| disabled | false | false | true `Button` 컴포넌트를 비활성화할지 여부를 지정해요. true일 경우 `Button` 컴포넌트가 클릭되지 않아요. |
| viewStyle | - | StyleProp<ViewStyle> `Button` 컴포넌트의 외부 스타일을 변경할 때 사용해요. 가장 바깥쪽 `View`에 적용돼요. |
| color | - | string `Button` 컴포넌트의 텍스트 색상을 지정해요. 기본으로 설정되는 색상을 덮어씌울 때 사용해요. |
| containerStyle | - | StyleProp<ViewStyle> `Button` 컴포넌트의 컨테이너 스타일을 변경할 때 사용해요. `Button` 컴포넌트 내부의 `View`에 적용돼요. |
| textStyle | - | StyleProp<TextStyle> `Button` 컴포넌트의 텍스트 스타일을 변경할 때 사용해요. |
| leftAccessory | - | React.ReactNode `Button` 컴포넌트의 왼쪽에 추가할 아이콘이나 텍스트를 지정해요. |
