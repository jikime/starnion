---
title: "Badge - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/badge/"
---

# Badge - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/badge/

## Badge

Badge 컴포넌트는 항목의 상태를 빠르게 인식할 수 있도록 강조하는 데 사용돼요.

### 크기 조정하기

Badge 컴포넌트의 크기를 변경하려면 size 속성을 사용하세요. tiny, small, medium, large 중 하나를 선택할 수 있어요.

```
<Badge size="tiny" type="blue" badgeStyle="fill">
  tiny
</Badge>
<Badge size="small" type="blue" badgeStyle="fill">
  small
</Badge>
<Badge size="medium" type="blue" badgeStyle="fill">
  medium
</Badge>
<Badge size="large" type="blue" badgeStyle="fill">
  large
</Badge>
```

### 스타일

Badge 컴포넌트의 스타일을 설정하려면 style 속성을 사용하세요. 선택 할 수 있는 값에는 fill과 weak이 있어요. 이때, type 속성을 사용하여 원하는 색상을 설정할 수 있어요.

#### fill

fill 스타일은 채도가 높아 시각적으로 강렬하고 눈에 띄는 디자인이라 주요 항목을 강조하는 데 적합해요.

```
<Badge size="tiny" type="blue" badgeStyle="fill">
  Badge
</Badge>
<Badge size="tiny" type="teal" badgeStyle="fill">
  Badge
</Badge>
<Badge size="tiny" type="green" badgeStyle="fill">
  Badge
</Badge>
<Badge size="tiny" type="red" badgeStyle="fill">
  Badge
</Badge>
```

#### weak

weak 스타일은 채도가 낮아서 시각적으로 덜 눈에 띄어요.

```
<Badge size="tiny" type="blue" badgeStyle="weak">
  Badge
</Badge>
<Badge size="tiny" type="teal" badgeStyle="weak">
  Badge
</Badge>
<Badge size="tiny" type="green" badgeStyle="weak">
  Badge
</Badge>
<Badge size="tiny" type="red" badgeStyle="weak">
  Badge
</Badge>
```

#### BadgeProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | string `Badge` 컴포넌트 내부에 표시될 텍스트를 지정해요. |
| size | 'small' | "large" | "medium" | "small" | "tiny" `Badge` 컴포넌트의 크기를 지정해요. |
| marginLeft | 0 | number `Badge` 컴포넌트의 왼쪽 여백을 설정해요. |
| marginRight | 0 | number `Badge` 컴포넌트의 오른쪽 여백을 설정해요. |
| badgeStyle | 'fill' | "fill" | "weak" `Badge` 컴포넌트의 스타일(모양)을 설정해요. 'fill'은 채도가 높은 스타일, 'weak'은 채도가 낮은 스타일이에요. |
| type | 'blue' | "blue" | "teal" | "green" | "red" | "yellow" | "elephant" `Badge` 컴포넌트의 색상을 설정해요. |
| typography | 't5' | Typography `Badge` 컴포넌트의 텍스트 스타일을 설정해요. 기본값은 상위 `Paragraph` 컴포넌트의 값을 따라가요. |
| style | - | StyleProp<ViewStyle> `Badge` 컴포넌트의 스타일을 변경할 때 사용해요. |
| fontWeight | 'semiBold' | FontWeight `Badge` 컴포넌트의 텍스트 굵기를 설정해요. |
