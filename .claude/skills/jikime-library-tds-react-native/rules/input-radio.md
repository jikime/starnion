---
title: "Radio - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/radio/"
---

# Radio - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/radio/

## Radio

Radio 컴포넌트는 여러 옵션 중 하나를 선택할 수 있게 해주는 컴포넌트예요. 부드러운 애니메이션과 함께 선택된 옵션이 강조되어 표시돼요.

### 기본 사용

Radio를 사용하려면 value, onChange, 그리고 Radio.Option을 children으로 전달하세요.

```tsx
const [value, setValue] = useState('option1');
 
<Radio value={value} onChange={setValue}>
  <Radio.Option value="option1">옵션 1</Radio.Option>
  <Radio.Option value="option2">옵션 2</Radio.Option>
  <Radio.Option value="option3">옵션 3</Radio.Option>
</Radio>
```

### 여백 조정

horizontalMargin 속성을 사용해 라디오 컴포넌트의 좌우 여백을 조정할 수 있어요.

```
<Radio value={value} onChange={setValue} horizontalMargin={20}>
  <Radio.Option value="option1">옵션 1</Radio.Option>
  <Radio.Option value="option2">옵션 2</Radio.Option>
</Radio>
```

### 비활성화

전체 Radio를 비활성화하거나 개별 옵션을 비활성화할 수 있어요.

```
// 전체 비활성화
<Radio value={value} onChange={setValue} disabled={true}>
  <Radio.Option value="option1">옵션 1</Radio.Option>
  <Radio.Option value="option2">옵션 2</Radio.Option>
</Radio>
 
// 개별 옵션 비활성화
<Radio value={value} onChange={setValue}>
  <Radio.Option value="option1">옵션 1</Radio.Option>
  <Radio.Option value="option2" disabled={true}>옵션 2 (비활성)</Radio.Option>
  <Radio.Option value="option3">옵션 3</Radio.Option>
</Radio>
```

### 두 개의 옵션

예/아니오 같은 이진 선택에 사용할 수 있어요.

```tsx
const [agree, setAgree] = useState(false);
 
<Radio value={agree} onChange={setAgree}>
  <Radio.Option value={true}>예</Radio.Option>
  <Radio.Option value={false}>아니오</Radio.Option>
</Radio>
```

### 여러 개의 옵션

네 개 이상의 옵션도 표시할 수 있어요.

```tsx
const [selected, setSelected] = useState('1개월');
 
<Radio value={selected} onChange={setSelected}>
  <Radio.Option value="1개월">1개월</Radio.Option>
  <Radio.Option value="3개월">3개월</Radio.Option>
  <Radio.Option value="6개월">6개월</Radio.Option>
  <Radio.Option value="12개월">12개월</Radio.Option>
</Radio>
```

### react-hook-form과 함께 사용

RadioInput 컴포넌트를 사용하면 react-hook-form과 쉽게 통합할 수 있어요.

```tsx
import { useForm } from 'react-hook-form';
import { RadioInput } from '@toss/tds-react-native';
 
const { control, handleSubmit } = useForm({
  defaultValues: {
    paymentMethod: 'card',
  },
});
 
const onSubmit = (data) => {
  console.log(data);
};
 
<RadioInput control={control} name="paymentMethod">
  <Radio.Option value="card">카드</Radio.Option>
  <Radio.Option value="bank">계좌</Radio.Option>
  <Radio.Option value="mobile">휴대폰</Radio.Option>
</RadioInput>
```

### 추가 onChange 핸들러

RadioInput에서 추가 onChange 핸들러를 사용할 수 있어요.

```
<RadioInput
  control={control}
  name="paymentMethod"
  onChange={(value) => {
    console.log('선택된 값:', value);
  }}
>
  <Radio.Option value="card">카드</Radio.Option>
  <Radio.Option value="bank">계좌</Radio.Option>
</RadioInput>
```

#### RadioOptionProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| value* | - | Value 라디오 옵션의 값을 지정해요. |
| children* | - | React.ReactNode 라디오 옵션의 내용을 지정해요. |
| checked | false | false | true 라디오 옵션이 선택되었는지 여부를 지정해요. |
| disabled | false | false | true 라디오 옵션의 비활성화 여부를 지정해요. |
| onPress | - | (value: Value) => void 라디오 옵션을 클릭했을 때 호출되는 함수예요. |

#### RadioProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| value* | - | Value 현재 선택된 라디오 옵션의 값을 지정해요. |
| onChange* | - | (value: Value) => void 라디오 옵션이 선택될 때 호출되는 함수예요. |
| children* | - | React.ReactElement<RadioOptionProps<Value>, string | React.JSXElementConstructor<any>> | React.ReactElement<RadioOptionProps<Value>, string | React.JSXElementConstructor<any>>[] 라디오 옵션들을 지정해요. Radio.Option 컴포넌트를 children으로 전달해요. |
| disabled | false | false | true 라디오 컴포넌트의 비활성화 여부를 지정해요. |
| horizontalMargin | 0 | number 라디오 컴포넌트의 좌우 여백을 픽셀 단위로 지정해요. |
