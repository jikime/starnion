---
title: "ListFooter - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/list-footer/"
---

# ListFooter - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/list-footer/

## ListFooter

ListFooter 컴포넌트는 리스트 항목의 마지막 부분에 위치해, 사용자에게 더 많은 항목을 불러오거나 목록을 확장하는 기능을 제공해요. 기본적으로 "더 보기"와 같은 텍스트를 표시해 리스트가 이어질 수 있다는 암시를 주고, 다양한 옵션으로 시각적 요소를 맞춤 설정할 수 있어요.

### 텍스트 사용하기

리스트의 마지막에 "더 보기" 같은 텍스트를 표시하고 싶다면 text 속성에 ListFooter.Text 컴포넌트를 전달하세요.

```
<ListFooter title={<ListFooter.Title>더 보기</ListFooter.Title>} />
<ListFooter title={<ListFooter.Title color={adaptive.grey600}>더 보기</ListFooter.Title>} />
<ListFooter
  title={
    <ListFooter.Title color={adaptive.blue400} fontWeight="bold">
      더 보기
    </ListFooter.Title>
  }
/>
```

### 아이콘과 함께 사용하기

"더 보기" 기능을 아이콘으로 표시하고 싶다면 right 속성에 ListFooter.Right 컴포넌트와 Icon 컴포넌트로 조합된 요소를 전달하세요.

```
<ListFooter
  title={<ListFooter.Title>더 보기</ListFooter.Title>}
  right={
    <ListFooter.Right>
      <Icon name="icon-plus-small-mono" size={16} color={adaptive.blue500} />
    </ListFooter.Right>
  }
/>
<ListFooter
  title={<ListFooter.Title color={adaptive.grey600}>더 보기</ListFooter.Title>}
  right={
    <ListFooter.Right>
      <Icon name="icon-arrow-down-mono" color={adaptive.grey600} />
    </ListFooter.Right>
  }
/>
<ListFooter
  title={<ListFooter.Title color={adaptive.grey600}>더 보기</ListFooter.Title>}
  right={
    <ListFooter.Right>
      <Icon name="icon-arrow-up-mono" color={adaptive.grey600} />
    </ListFooter.Right>
  }
/>
```

### 상단 구분선 조정하기

border 속성을 사용해 ListFooter의 상단 구분선 스타일을 조정할 수 있어요.

- full: 리스트의 시작에 가느다란 구분선을 전체 너비로 표시해요. 기본값으로 설정된 옵션이며, ListFooter의 경계를 분명히 하고 싶을 때 적합해요.
- none: 구분선을 표시하지 않아요. 구분이 필요없거나 리스트가 하나로 이어진 느낌을 줄 때 사용해요.

```
<ListFooter borderType="full" title={<ListFooter.Title>더 보기</ListFooter.Title>} />
<ListFooter borderType="none" title={<ListFooter.Title>더 보기</ListFooter.Title>} />
```

#### ListFooterProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| title* | - | React.ReactNode `ListFooter` 컴포넌트의 제목을 설정해요. 주로 `ListFooter.Title` 컴포넌트를 사용해요. |
| right | - | React.ReactNode `ListFooter` 컴포넌트의 오른쪽 영역에 표시할 요소를 설정해요. 주로 `ListFooter.Right` 컴포넌트를 사용해요. |
| borderType | 'full' | "full" | "none" `ListFooter` 컴포넌트의 하단 구분선 스타일을 설정해요. - `full`: 전체 너비로 표시해요. - `none`: 구분선을 표시하지 않아요. |
| onPress | - | (event: GestureResponderEvent) => void `ListFooter` 컴포넌트를 눌렀을 때 실행되는 함수예요. |

#### ListFooterTitleProps

Txt 컴포넌트를 확장하여 제작했어요. Txt 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | string `ListFooter.Title` 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | 't5' | "t1" | "st1" | "st2" | "st3" | "t2" | "st4" | "st5" | "st6" | "t3" | "st7" | "t4" | "st8" | "st9" | "t5" | "st10" | "t6" | "st11" | "t7" | "st12" | "st13" `ListFooter.Title` 컴포넌트의 텍스트 스타일을 설정해요. |
| color | colors.blue500 | string `ListFooter.Title` 컴포넌트의 텍스트 색상을 지정해요 |
| fontWeight | 'medium' | "thin" | "extralight" | "extraLight" | "light" | "normal" | "regular" | "medium" | "semibold" | "semiBold" | "bold" | "extrabold" | "extraBold" | "heavy" | "black" `ListFooter.Title` 컴포넌트의 텍스트 굵기를 설정해요. |

#### ListFooterRightProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode `ListFooter.Right` 컴포넌트 내부에 표시될 내용을 지정해요. |
| style | - | StyleProp<ViewStyle> `ListFooter.Right` 컴포넌트의 스타일을 변경할 때 사용해요. |
