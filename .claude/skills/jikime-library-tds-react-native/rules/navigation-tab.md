---
title: "Tab - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/tab/"
---

# Tab - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/tab/

## Tab

Tab 컴포넌트는 여러 콘텐츠를 한 화면에서 효율적으로 전환할 수 있도록 도와줘요. 각 탭은 콘텐츠 목록을 보여주고, 사용자가 선택한 탭에 따라 해당 콘텐츠를 전환해요. Tab 컴포넌트를 사용하면 여러 콘텐츠를 한 번에 볼 수 있고, 전환도 간편하게 할 수 있어요.

### 크기 조정하기

Tab 컴포넌트의 크기를 변경하려면 size 속성을 사용하세요. small, large 중 하나를 선택할 수 있어요.

```
<Tab defaultValue="탭1" size="small">
  <Tab.Item value={'탭1'}>탭1</Tab.Item>
  <Tab.Item value={'탭2'}>탭2</Tab.Item>
</Tab>
<Tab defaultValue="탭1" size="large">
  <Tab.Item value={'탭1'}>탭1</Tab.Item>
  <Tab.Item value={'탭2'}>탭2</Tab.Item>
</Tab>
```

### 스크롤 되게 하기

아이템이 4개 이상이면 fluid 속성을 사용해보세요. 아이템이 많아지면 탭에 가로 스크롤이 생겨요.

```
<Tab fluid defaultValue="탭1">
  {Array.from({ length: 20 }, (_, index) => (
    <Tab.Item key={index} value={`탭${index + 1}`}>
      긴텍스트
    </Tab.Item>
  ))}
</Tab>
```

#### 상태를 외부에서 관리하는 방식

Tab의 상태를 외부에서 관리하려면 value와 onChange 속성을 함께 사용하세요. 이렇게 하면 Tab.Item 컴포넌트가 선택되었는지 아닌지를 외부에서 직접 관리할 수 있어요. 또한 onChange에 적절한 함수를 전달하여 값의 변화를 감지할 수 있어요.

```tsx
function Controlled() {
  const [value, setValue] = useState('0');
  return (
    <Tab value={value} onChange={setValue}>
      <Tab.Item value={'0'}>탭1</Tab.Item>
      <Tab.Item value={'1'}>탭2</Tab.Item>
      <Tab.Item value={'2'}>탭3</Tab.Item>
    </Tab>
  );
}
```

#### 상태를 내부에서 관리하는 방식

Tab의 상태를 내부에서 자동으로 관리하려면 defaultValue 속성을 사용하세요. 이 속성은 처음 화면에 표시될 때 선택된 Tab.Item 컴포넌트를 정해줘요. 그 후에는 컴포넌트가 스스로 상태를 관리해요. 이 방식은 상태 변화를 추적하지 않아도 될 때 유용해요.

```
<Tab defaultValue="0">
  <Tab.Item value={'0'}>탭1</Tab.Item>
  <Tab.Item value={'1'}>탭2</Tab.Item>
  <Tab.Item value={'2'}>탭3</Tab.Item>
</Tab>
```

#### TabProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| fluid | false | false | true 이 값이 `true`일 때 각 아이템의 너비가 글자 수에 맞춰져요. 아이템의 전체 크기가 `Tab`의 컨테이너를 넘어가면 가로 스크롤이 생겨요. `false`라면 최대 4개의 아이템 사용을 권장해요. |
| size | 'large' | "large" | "small" 사이즈에 따라 `Tab` 컴포넌트의 높이와 텍스트 크기가 변경돼요. |
| defaultValue | - | string `Tab` 컴포넌트에서 초기 선택된 탭의 값을 설정해요. 탭의 상태를 컴포넌트 내부에서 관리할 때 사용해요. |
| value | - | string `Tab` 컴포넌트에서 선택된 탭을 설정해요. `Tab` 컴포넌트의 상태를 컴포넌트 외부에서 관리할 때, `onChange` 속성과 함께 사용해요. |
| children | - | React.ReactNode `Tab` 컴포넌트를 구성하는 하나 이상의 `Tab.Item` 컴포넌트를 받아요. `Tab.Item`은 각각의 탭을 나타내요. |
| onChange | - | (value: string) => void 선택된 `Tab.Item` 컴포넌트가 변경될 때 실행되는 함수예요. |

#### TabItemProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| value* | - | string 탭의 값을 설정해요. `Tab` 컴포넌트에서 탭을 구분하는 데 사용돼요. |
| children* | - | React.ReactNode `Tab.Item` 컴포넌트 내부에 표시될 내용을 설정해요. |
| redBean | false | false | true 이 값이 `true`일 때 `Tab.Item`의 우측 상단에 빨간 동그라미가 표시돼요. 중요한 알림이나 새로운 업데이트가 있음을 사용자에게 시각적으로 전달할 수 있어요. |
| style | - | StyleProp<ViewStyle> `Tab.Item` 컴포넌트의 스타일을 설정해요. |
| onPress | - | (event: GestureResponderEvent) => void `Tab.Item` 컴포넌트를 클릭했을 때 실행되는 함수예요. |
