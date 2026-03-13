---
title: "Toast - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/toast/"
---

# Toast - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/toast/

## Toast

Toast 컴포넌트는 사용자에게 짧은 메시지를 일시적으로 표시하는 데 사용해요. 액션의 결과나 상태 변화를 알리는 데 유용하며, 화면 상단이나 하단에 나타났다가 자동으로 사라져요.

### 기본 사용

Toast를 사용하려면 open, text, onClose 속성을 지정하세요.

```
<Toast
  open={isOpen}
  text="저장되었어요"
  onClose={() => setIsOpen(false)}
/>
```

### 위치 설정

position 속성을 사용해 Toast가 표시될 위치를 지정할 수 있어요. top 또는 bottom을 선택할 수 있어요.

```
<Toast
  open={isOpen}
  text="상단에 표시되는 Toast예요"
  position="top"
  onClose={() => setIsOpen(false)}
/>

<Toast
  open={isOpen}
  text="하단에 표시되는 Toast예요"
  position="bottom"
  onClose={() => setIsOpen(false)}
/>
```

### 아이콘 추가

Toast에 아이콘을 추가하려면 icon 속성을 사용하세요. Toast.Icon 또는 Toast.LottieIcon을 사용할 수 있어요.

```
<Toast
  open={isOpen}
  text="아이콘이 있는 Toast예요"
  icon={<Toast.Icon name="icn-attention-color" />}
  onClose={() => setIsOpen(false)}
/>

<Toast
  open={isOpen}
  text="완료되었어요"
  icon={<Toast.LottieIcon preset type="complete" />}
  onClose={() => setIsOpen(false)}
/>
```

### 버튼 추가

하단 Toast에는 button 속성을 사용해 버튼을 추가할 수 있어요.

```
<Toast
  open={isOpen}
  text="작업이 완료되었어요"
  position="bottom"
  button={<Toast.Button text="확인" onPress={() => setIsOpen(false)} />}
  onClose={() => setIsOpen(false)}
/>
```

### 지속 시간 조정

duration 속성을 사용해 Toast가 화면에 표시되는 시간을 조정할 수 있어요.

```
<Toast
  open={isOpen}
  text="5초 동안 표시돼요"
  duration={5}
  onClose={() => setIsOpen(false)}
/>
```

### 하단 여백 조정

bottomOffset 속성을 사용해 하단 Toast의 여백을 조정할 수 있어요.

```
<Toast
  open={isOpen}
  text="하단 여백이 있는 Toast예요"
  position="bottom"
  bottomOffset={40}
  onClose={() => setIsOpen(false)}
/>
```

#### ToastProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| open* | - | false | true Toast가 보이는지 여부를 지정해요. |
| text* | - | string Toast에 표시될 텍스트 내용을 지정해요. |
| onClose* | - | () => void Toast를 닫을 때 호출되는 함수예요. |
| icon | - | React.ReactNode Toast의 왼쪽에 표시될 아이콘을 지정해요. |
| position | 'bottom' | "top" | "bottom" Toast가 표시되는 위치를 지정해요. |
| duration | 3 | number Toast가 화면에 표시되는 시간을 초 단위로 지정해요. button이 있으면 5초, 없으면 3초가 기본값이에요. |
| onExited | - | () => void Toast가 완전히 사라진 후 호출되는 함수예요. |
| onEntered | - | () => void Toast가 완전히 나타난 후 호출되는 함수예요. |
| button | - | React.ReactNode Toast 하단에 표시될 버튼을 지정해요. position이 'bottom'일 때만 사용 가능해요. |
| bottomOffset | 20 | number Toast의 하단 여백을 픽셀 단위로 지정해요. position이 'bottom'일 때만 사용 가능해요. |
