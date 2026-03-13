---
title: "Numeric Spinner - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/numeric-spinner/"
---

# Numeric Spinner - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/numeric-spinner/

## Numeric Spinner

NumericSpinner 컴포넌트는 정수 입력을 쉽게 처리할 수 있도록, 숫자를 증감시키는 버튼을 제공해요. 키보드 없이 숫자를 입력하거나 수정할 때 사용해요.

#### 입력값을 외부에서 관리하기

NumericSpinner 컴포넌트의 입력값을 외부에서 관리하려면, number, onNumberChange 속성을 함께 사용하세요. number는 컴포넌트에 현재 값을 제공하고, onNumberChange는 입력값이 바뀔 때 호출되는 함수예요.

```tsx
function Basic() {
  const [value, setValue] = useState(0);
  return (
    <NumericSpinner
      size="large"
      number={value}
      onNumberChange={number => {
        setValue(number);
      }}
    />
  );
}
```

### 크기 변경하기

NumericSpinner 컴포넌트의 크기를 변경하려면 size 속성을 사용하세요. 지원되는 크기는 small, medium, large가 있어요.

```
<NumericSpinner size="tiny" />
<NumericSpinner size="small" />
<NumericSpinner size="medium" />
<NumericSpinner size="large" />
```

### 비활성화하기

NumericSpinner 컴포넌트를 비활성화하려면 disable 속성을 사용하세요. 비활성화된 NumericSpinner 컴포넌트는 버튼을 클릭해도 숫자가 변하지 않아요.

```
<NumericSpinner size="large" disable />
```

#### NumericSpinnerProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| size* | - | "tiny" | "small" | "medium" | "large" `NumericSpinner` 컴포넌트의 크기에요 |
| number | 0 | number `NumericSpinner` 컴포넌트에 표시되는 값이에요. 주로 입력값을 컴포넌트 외부에서 관리할 때 `onNumberChange` 속성과 함께 사용해요. |
| defaultNumber | - | number `NumericSpinner` 컴포넌트의 초기 입력값이에요. 설정된 값으로 컴포넌트가 초기화되고, 이후 입력값은 `NumericSpinner` 컴포넌트 내부에서 관리돼요. 외부에서 값 변경을 추적할 필요가 없을 때 사용해요. |
| minNumber | 0 | number 입력할 수 있는 최소값이에요. 설정된 값보다 작은 값은 사용자가 입력할 수 없어요. |
| maxNumber | 999 | number 입력할 수 있는 최대값이에요. 설정된 값보다 큰 값은 사용자가 입력할 수 없어요. |
| disable | false | false | true 이 값이 true일 때 `NumericSpinner` 컴포넌트가 비활성화돼요. 사용자가 버튼을 눌러도 숫자가 변하지 않아요. |
| onNumberChange | - | (number: number) => void 입력값이 변경될 때 호출되는 함수예요. 변경된 숫자 값을 매개변수로 받아 처리해요. 예를 들어, 입력값이 변경되면 이를 외부 상태에 반영할 때 사용해요. |
