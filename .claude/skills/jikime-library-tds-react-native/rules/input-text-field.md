---
title: "TextField - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/text-field/"
---

# TextField - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/text-field/

## TextField

TextField 컴포넌트는 사용자로부터 텍스트 입력을 받는 데 사용해요. 다양한 스타일과 옵션을 제공하여 다양한 입력 상황에 맞게 사용할 수 있어요.

### 기본 사용

TextField를 사용하려면 variant를 지정하세요.

```
<TextField
  variant="line"
  placeholder="텍스트를 입력하세요"
  value={value}
  onChangeText={setValue}
/>
```

### Variant

TextField는 네 가지 variant를 제공해요.

```
<TextField variant="box" placeholder="Box variant" />
<TextField variant="line" placeholder="Line variant" />
<TextField variant="big" placeholder="Big variant" />
<TextField variant="hero" placeholder="Hero variant" />
```

### 라벨

label 속성을 사용해 텍스트 필드에 라벨을 추가할 수 있어요.

```
<TextField
  variant="line"
  label="이름"
  placeholder="이름을 입력하세요"
  value={value}
  onChangeText={setValue}
/>
```

### 라벨 옵션

labelOption을 사용해 라벨 표시 방식을 조정할 수 있어요.

```
// 값이 있을 때만 라벨 표시
<TextField
  variant="line"
  label="이름"
  labelOption="appear"
  value={value}
  onChangeText={setValue}
/>
 
// 항상 라벨 표시
<TextField
  variant="line"
  label="이름"
  labelOption="sustain"
  value={value}
  onChangeText={setValue}
/>
```

### 도움말 및 에러

help와 hasError 속성을 사용해 도움말과 에러 상태를 표시할 수 있어요.

```
<TextField
  variant="line"
  label="이메일"
  value={email}
  onChangeText={setEmail}
  help="이메일 형식으로 입력해주세요"
/>
 
<TextField
  variant="line"
  label="이메일"
  value={email}
  onChangeText={setEmail}
  hasError={true}
  help="올바른 이메일 형식이 아니에요"
/>
```

### 접두사/접미사

prefix와 suffix를 사용해 텍스트 앞뒤에 고정 텍스트를 표시할 수 있어요.

```
<TextField
  variant="line"
  prefix="₩"
  placeholder="0"
  value={amount}
  onChangeText={setAmount}
/>
 
<TextField
  variant="line"
  suffix="원"
  placeholder="0"
  value={amount}
  onChangeText={setAmount}
/>
```

### 포맷팅

format 속성을 사용해 입력값을 특정 형식으로 변환할 수 있어요.

```tsx
import { TextField } from '@toss/tds-react-native';
 
// 금액 포맷
<TextField
  variant="line"
  value={amount}
  onChangeText={setAmount}
  format={TextField.format.amount}
/>
 
// 전화번호 포맷
<TextField
  variant="line"
  value={phone}
  onChangeText={setPhone}
  format={TextField.format.phone}
/>
```

### Clearable TextField

TextField.Clearable을 사용하면 입력값을 쉽게 지울 수 있는 클리어 버튼이 표시돼요.

```
<TextField.Clearable
  variant="line"
  placeholder="검색어를 입력하세요"
  value={searchText}
  onChangeText={setSearchText}
  onClear={() => setSearchText('')}
/>
```

### TextField Button

TextField.Button을 사용하면 클릭 가능한 텍스트 필드를 만들 수 있어요.

```
<TextField.Button
  variant="line"
  label="생년월일"
  placeholder="생년월일을 선택하세요"
  value={birthDate}
  onPress={() => openDatePicker()}
/>
```

### 비활성화

disabled 속성을 사용해 텍스트 필드를 비활성화할 수 있어요.

```
<TextField
  variant="line"
  placeholder="비활성화된 필드"
  disabled={true}
/>
```

#### TextFieldProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| variant* | - | "box" | "line" | "big" | "hero" 텍스트 필드의 모양을 지정해요. |
| value | - | string | number 텍스트 필드의 값이에요. |
| defaultValue | - | string 텍스트 필드의 기본값이에요. |
| onChangeText | - | (text: string) => void 텍스트가 변경될 때 호출되는 함수예요. |
| label | - | string 텍스트 필드의 상단 라벨을 지정해요. |
| labelOption | 'appear' | "appear" | "sustain" 라벨 표시 옵션을 지정해요. - appear: value가 있을 때만 label이 보여요. - sustain: 항상 label이 보여요. |
| help | - | React.ReactNode 텍스트 필드의 하단 도움말을 지정해요. |
| hasError | false | false | true 텍스트 필드의 에러 여부를 지정해요. |
| disabled | false | false | true 텍스트 필드의 비활성화 여부를 지정해요. |
| prefix | - | string 텍스트 앞에 표시될 접두사를 지정해요. |
| suffix | - | string 텍스트 뒤에 표시될 접미사를 지정해요. |
| right | - | React.ReactNode 텍스트 필드의 오른쪽에 위치할 컴포넌트를 지정해요. |
| placeholder | - | string 플레이스홀더 텍스트를 지정해요. |
| format | - | { transform: (value: TextFieldValue) => TextFieldValue; reset?: (formattedValue: TextFieldValue) => TextFieldValue; } 금액, 휴대폰번호 등 특정 형식으로 변환해야 하는 경우 사용해요. - transform: 입력값(value) => 변환된 값 - reset: 변환된 값 => 입력값(value) |
| containerStyle | - | StyleProp<ViewStyle> 컨테이너의 스타일을 지정해요. |
| paddingTop | - | number 상단 패딩을 지정해요. |
| paddingBottom | - | number 하단 패딩을 지정해요. |
| keyboardType | - | "default" | "numeric" | "email-address" | "phone-pad" 키보드 타입을 지정해요. |
| maxLength | - | number 최대 입력 길이를 지정해요. |
| autoFocus | - | false | true 자동 포커스 여부를 지정해요. |
| editable | - | false | true 편집 가능 여부를 지정해요. |

#### ClearableTextFieldProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| onClear | - | () => void 클리어 버튼을 클릭했을 때 호출되는 함수예요. |

#### TextFieldButtonProps

TextField 컴포넌트를 확장하여 제작했어요. TextField 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| focused | false | false | true 텍스트 필드의 포커스 여부를 지정해요. |
| onPress | - | () => void 버튼을 클릭했을 때 호출되는 함수예요. |
| style | - | StyleProp<TextStyle> 텍스트 스타일을 지정해요. |
