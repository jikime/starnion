---
title: "NumberKeypad - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/keypad/"
---

# NumberKeypad - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/keypad/

## NumberKeypad

NumberKeypad 컴포넌트는 숫자를 입력할 수 있는 가상 키패드예요. 금액 입력, PIN 번호 입력 등에 사용해요.

### 기본 사용

NumberKeypad를 사용하려면 onKeyPress와 onBackspacePress 함수를 지정하세요.

```tsx
const [value, setValue] = useState('');
 
const handleKeyPress = (key: number) => {
  setValue(prev => prev + key);
};
 
const handleBackspace = () => {
  setValue(prev => prev.slice(0, -1));
};
 
<NumberKeypad
  onKeyPress={handleKeyPress}
  onBackspacePress={handleBackspace}
/>
```

### 금액 입력

NumberKeypad를 사용해 금액 입력 화면을 만들 수 있어요.

```tsx
const [amount, setAmount] = useState('');
 
const handleKeyPress = (key: number) => {
  setAmount(prev => {
    const newValue = prev + key;
    // 최대 금액 제한
    if (Number(newValue) > 1000000) return prev;
    return newValue;
  });
};
 
const handleBackspace = () => {
  setAmount(prev => prev.slice(0, -1));
};
 
const formattedAmount = amount ? `${Number(amount).toLocaleString()}원` : '0원';
 
<View>
  <Txt typography="h1" textAlign="center" style={{ marginBottom: 20 }}>
    {formattedAmount}
  </Txt>
  <NumberKeypad
    onKeyPress={handleKeyPress}
    onBackspacePress={handleBackspace}
  />
</View>
```

### PIN 번호 입력

PIN 번호나 비밀번호를 입력받을 수 있어요.

```tsx
const [pin, setPin] = useState('');
const PIN_LENGTH = 6;
 
const handleKeyPress = (key: number) => {
  if (pin.length < PIN_LENGTH) {
    setPin(prev => prev + key);
  }
};
 
const handleBackspace = () => {
  setPin(prev => prev.slice(0, -1));
};
 
<View>
  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
    {Array.from({ length: PIN_LENGTH }).map((_, index) => (
      <View
        key={index}
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: index < pin.length ? colors.blue500 : colors.grey200,
        }}
      />
    ))}
  </View>
  <NumberKeypad
    onKeyPress={handleKeyPress}
    onBackspacePress={handleBackspace}
  />
</View>
```

### 커스텀 숫자 배열

numbers 속성을 사용해 키패드의 숫자 배열을 커스터마이징할 수 있어요.

```
<NumberKeypad
  numbers={[1, 2, 3, 4, 5, 6, 7, 8, 9, 0]}
  onKeyPress={handleKeyPress}
  onBackspacePress={handleBackspace}
/>
```

### 전화번호 입력

전화번호 입력 화면을 만들 수 있어요.

```tsx
const [phone, setPhone] = useState('');
 
const handleKeyPress = (key: number) => {
  if (phone.length < 11) {
    setPhone(prev => prev + key);
  }
};
 
const handleBackspace = () => {
  setPhone(prev => prev.slice(0, -1));
};
 
const formatPhoneNumber = (value: string) => {
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
};
 
<View>
  <Txt typography="h2" textAlign="center" style={{ marginBottom: 20 }}>
    {formatPhoneNumber(phone) || '전화번호를 입력하세요'}
  </Txt>
  <NumberKeypad
    onKeyPress={handleKeyPress}
    onBackspacePress={handleBackspace}
  />
</View>
```

#### NumberKeypadProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| onKeyPress* | - | (value: number) => void 숫자 키를 클릭했을 때 호출되는 함수예요. |
| onBackspacePress* | - | () => void Backspace 키를 클릭했을 때 호출되는 함수예요. |
| numbers | - | NumberKey[] 숫자 키패드의 숫자 배열을 지정해요. 기본값은 [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]이에요. |
| style | - | StyleProp<ViewStyle> 키패드의 스타일을 지정해요. |
