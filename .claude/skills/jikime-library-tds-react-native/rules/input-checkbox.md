---
title: "Checkbox - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/checkbox/"
---

# Checkbox - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/checkbox/

## Checkbox

Checkbox 컴포넌트는 사용자가 하나 이상의 항목을 선택할 때 사용해요. 체크된 상태와 체크되지 않은 상태를 나타내고, 여러 개의 항목을 동시에 선택할 수 있어요.

### 형태

Checkbox는 두 가지 방법으로 표현할 수 있어요.

- <Checkbox.Circle />: 체크 아이콘이 원으로 감싸진 형태로 표현돼요.
- <Checkbox.Line />: 체크 아이콘이 단독으로 표현돼요.

```
<Checkbox.Circle defaultChecked={true} />
<Checkbox.Line defaultChecked={true} />
```

#### 상태를 외부에서 관리하는 방식

Checkbox의 상태를 외부에서 관리하려면 checked와 onCheckedChange 속성을 함께 사용하세요. 이렇게 하면 체크박스가 선택되었는지 아닌지를 외부에서 직접 관리할 수 있어요.

```
<Checkbox.Circle checked={checked} onCheckedChange={setChecked} />
<Checkbox.Line checked={checked} onCheckedChange={setChecked} />
```

#### 상태를 내부에서 관리하는 방식

Checkbox의 상태를 내부에서 자동으로 관리하려면 defaultChecked 속성을 사용하세요. 이 속성은 체크박스가 처음 화면에 표시될 때 선택 상태를 정해주고, 그 후에는 컴포넌트가 스스로 상태를 관리해요. 이 방식은 상태 변화를 추적하지 않아도 될 때 유용해요.

```
<Checkbox.Circle defaultChecked={true} />
<Checkbox.Line defaultChecked={true} />
```

### 크기 조정하기

Checkbox의 크기를 변경하려면 size 속성을 사용하세요.

```
<Checkbox.Circle defaultChecked={true} size={36} />
<Checkbox.Line defaultChecked={true} size={36} />
```

### 비활성화하기

Checkbox를 비활성화하려면 disabled 속성을 사용하세요. 비활성화된 Checkbox를 클릭하면 선택 상태가 바뀌지 않고, 좌우로 흔들리는 애니메이션이 나타나요.

```
<Checkbox.Circle defaultChecked={true} disabled />
<Checkbox.Circle disabled />
<Checkbox.Line defaultChecked={true} disabled />
<Checkbox.Line disabled />
```

#### CheckboxProps

Pressable 컴포넌트를 확장하여 제작했어요. Pressable 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| checked | - | false | true 이 값이 `true`일 때 해당 `Checkbox`가 선택된 상태로 표현돼요. 주로 `Checkbox` 컴포넌트의 상태를 컴포넌트 외부에서 관리할 때, `onCheckedChange` 속성과 함께 사용해요. |
| disabled | - | false | true 이 값이 `true`일 때 `Checkbox` 컴포넌트가 비활성화돼요. |
| defaultChecked | - | false | true `Checkbox` 컴포넌트의 상태를 컴포넌트 내부에서 관리할 때, 초기 선택 상태를 지정해요. |
| onCheckedChange | - | (checked: boolean) => void `Checkbox` 컴포넌트의 선택 상태가 변경될 때 실행되는 함수예요. |
| size | 24 | number `Checkbox` 컴포넌트의 크기를 설정해요. |
| style | - | StyleProp<ViewStyle> `Checkbox` 컴포넌트의 스타일을 설정해요. |
