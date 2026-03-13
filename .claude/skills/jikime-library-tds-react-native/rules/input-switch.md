---
title: "Switch - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/switch/"
---

# Switch - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/switch/

## Switch

Switch 컴포넌트는 두 가지 상태(예: 켜짐/꺼짐, 활성화/비활성화)를 전환할 수 있는 UI 요소예요. 단순한 토글 방식으로 동작해서 주로 설정이나 옵션을 활성화하거나 비활성화할 때 사용해요. 체크박스와 비슷하지만 더 직관적인 시각적 요소로 사용자가 상태 변화를 쉽게 인식할 수 있어요.

### 상태

스위치의 켜짐과 꺼짐 상태를 표현하려면 checked 속성을 사용하세요. 상태를 바꾸려면 onCheckedChange 속성과 함께 사용하세요.

```tsx
function States() {
  const [checked1, setChecked1] = useState(true);
  const [checked2, setChecked2] = useState(false);
  return (
    <View style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
      <Switch checked={checked1} onCheckedChange={setChecked1} />
      <Switch checked={checked2} onCheckedChange={setChecked2} />
    </View>
  );
}
```

### 비활성화하기

스위치를 비활성화하려면 disabled 속성을 사용하세요. 비활성화된 스위치는 사용자가 클릭할 수 없고, 시각적으로도 비활성화된 상태임을 나타내요.

```
<Switch checked disabled />
<Switch checked={false} disabled />
```

#### SwitchProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| checked | - | false | true `Switch` 컴포넌트의 켜짐과 꺼짐 상태를 표현해요. 주로 `Switch` 컴포넌트의 상태를 컴포넌트 외부에서 관리할 때, `onCheckedChange` 속성과 함께 사용해요. |
| onCheckedChange | - | (value: boolean) => void `Switch` 컴포넌트의 선택 상태가 변경될 때 실행되는 함수예요. |
| defaultChecked | false | false | true `Switch` 컴포넌트의 상태를 컴포넌트 내부에서 관리할 때, 초기 선택 상태를 지정해요. |
| disabled | false | false | true 이 값이 `true`일 때 컴포넌트가 비활성화돼요. |
| onPress | - | (event: GestureResponderEvent) => void `Switch` 컴포넌트를 클릭했을 때 실행되는 함수예요. |
| style | - | StyleProp<ViewStyle> `Switch` 컴포넌트의 스타일을 설정해요. |
