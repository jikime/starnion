---
title: "Icon Button - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/icon-button/"
---

# Icon Button - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/icon-button/

## Icon Button

IconButton 컴포넌트는 사용자가 특정 작업을 실행하거나 이벤트를 트리거할 때 사용해요. 아이콘으로 기능을 직관적으로 전달하면서, UI를 간결하게 유지할 수 있어요.

### 형태

IconButton의 형태를 변경하려면 variant 속성을 사용하세요. 선택할 수 있는 값은 'clear', 'fill', 'border'가 있어요.

#### clear

배경 없이 아이콘만 보여주고 싶다면 variant 속성에 'clear'를 넣어주세요. 클릭한 상태에서는 배경 색이 보여요.

```
<IconButton name="icon-search-bold-mono" variant="clear" />
<IconButton name="icon-line-three-mono" variant="clear" />
<IconButton name="icon-alarm-mono" variant="clear" />
<IconButton name="icon-setting-mono" variant="clear" />
```

#### fill

아이콘 버튼에 배경색을 추가하려면 variant에 'fill'을 넣어주세요. 배경이 채워진 스타일로 아이콘이 강조돼요. 클릭한 상태에서는 배경 색이 사라져요.

```
<IconButton name="icon-search-bold-mono" variant="fill" />
<IconButton name="icon-line-three-mono" variant="fill" />
<IconButton name="icon-alarm-mono" variant="fill" />
<IconButton name="icon-setting-mono" variant="fill" />
```

#### border

테두리가 있는 스타일을 원한다면 variant 속성에 'border'를 넣어주세요. 버튼에 테두리가 생겨 아이콘이 구분되어 보여요. 클릭한 상태에서는 배경 색이 보여요.

```
<IconButton name="icon-search-bold-mono" variant="border" />
<IconButton name="icon-line-three-mono" variant="border" />
<IconButton name="icon-alarm-mono" variant="border" />
<IconButton name="icon-setting-mono" variant="border" />
```

### 아이콘 색 변경하기

아이콘 색을 변경하려면 color 속성을 사용하세요. 아이콘의 이름이 -mono로 끝나는 모노타입의 아이콘만 색을 변경할 수 있어요.

```
<IconButton name="icon-search-bold-mono" color={adaptive.red500} />
<IconButton name="icon-search-bold-mono" color={adaptive.blue500} />
<IconButton name="icon-search-bold-mono" color={adaptive.yellow500} />
<IconButton name="icon-search-bold-mono" color={adaptive.green500} />
```

### 배경 색 변경하기

IconButton 컴포넌트의 배경 색을 변경하려면 bgColor 속성을 사용하세요. variant 속성의 값이 'fill'일 때는 지정한 색이 배경 색으로 적용되고, 'clear'나 'border'일 때는 버튼을 눌렀을 때 배경 색으로 적용돼요.

```
<IconButton name="icon-search-bold-mono" variant="clear" bgColor={adaptive.greyOpacity100} />
<IconButton name="icon-search-bold-mono" variant="fill" bgColor={adaptive.greyOpacity100} />
<IconButton name="icon-search-bold-mono" variant="border" bgColor={adaptive.greyOpacity100} />
```

### 크기 조정하기

아이콘의 크기를 변경하려면 iconSize 속성을 사용하세요.

```
<IconButton name="icon-search-bold-mono" iconSize={24} />
<IconButton name="icon-search-bold-mono" iconSize={20} />
<IconButton name="icon-search-bold-mono" iconSize={16} />
```

#### IconButtonProps

Pressable 컴포넌트를 확장하여 제작했어요. Pressable 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| source* | - | "ImageProps['href']" 사용할 아이콘의 경로를 지정해요. `source` 속성은 `name` 속성과 함께 사용할 수 없어요. `@react-native-bedrock/native`의 ImageProps['href'] 속성을 참고해 주세요. |
| name* | - | string 사용할 아이콘의 이름을 지정해요. `name` 속성은 `source` 속성과 함께 사용할 수 없어요. |
| color | - | string `IconButton` 컴포넌트의 아이콘 색상을 설정해요. `-mono`로 끝나는 모노타입 아이콘을 사용할 때만 색상을 지정할 수 있어요. |
| bgColor | adaptive.greyOpacity100 | string `IconButton` 컴포넌트의 배경색을 설정해요. |
| variant | 'clear' | "fill" | "clear" | "border" `IconButton` 컴포넌트의 형태를 설정해요. |
| iconSize | 24 | number `IconButton` 컴포넌트의 아이콘 크기를 설정해요. |
| label | - | string `IconButton` 컴포넌트의 `accessibilityLabel` 속성을 설정해요. 접근성 지원을 위해 의미 있는 라벨을 입력하세요. |
| style | - | StyleProp<ViewStyle> `IconButton` 컴포넌트의 스타일을 설정해요. |
