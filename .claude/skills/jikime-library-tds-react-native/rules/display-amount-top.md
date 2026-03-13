---
title: "AmountTop - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/amount-top/"
---

# AmountTop - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/amount-top/

## AmountTop

AmountTop 컴포넌트는 금액이나 중요한 숫자를 크게 강조하여 표시하는 데 사용해요. 송금, 결제, 잔액 확인 등의 화면에서 유용해요.

### title과 subTitle 전달하기

title속성과 subTitle속성은 필수 값이에요. string을 전달하면 typography가 세팅돼요.

| 속성 | typography |
| --- | --- |
| title | t1 |
| subTitle | st11 |

```
<AmountTop
  subTitle="보낼 금액"
  title="50,000원"
/>
```

typography의 커스텀이 필요할 경우, ReactNode를 직접 삽입할 수 있어요.

```
<AmountTop
  subTitle="보낼 금액"
  title={<Txt typography="t3" fontWeight="semiBold" color={colors.blue500}>50,000원</Txt>}
/>
```

### 버튼 추가

button 속성을 통해 버튼을 삽입할 수 있어요.

```
<AmountTop
  subTitle="잔액"
  title="1,234,567원"
  button={
    <Button size="medium" onPress={() => handleRefresh()}>
      새로고침
    </Button>
  }
/>
```

### 클릭 가능한 부제목

subTitle에 <AmountTop.SubTitle /> 컴포넌트를 전달할 경우, onPress와 함께 사용하게 되면 underline이 표기돼요.

```
<AmountTop
  subTitle={
    <AmountTop.SubTitle onPress={() => handleChangeAccount()}>
      토스뱅크 1234-5678-9012
    </AmountTop.SubTitle>
  }
  title="1,234,567원"
/>
```

### 패딩 조정

```
// 상단 패딩 조정
<AmountTop
  topPadding={80}
  bottomPadding={24}
  subTitle="보낼 금액"
  title="50,000원"
/>

// 좌우 패딩 제거
<AmountTop
  horizontalPadding={0}
  subTitle="보낼 금액"
  title="50,000원"
/>
```

### 송금 화면

```tsx
const [amount, setAmount] = useState(0);

<View style={{ flex: 1 }}>
  <AmountTop
    topPadding={64}
    bottomPadding={16}
    subTitle="보낼 금액"
    title={`${amount.toLocaleString()}원`}
    button={
      <Button size="medium" style="weak" onPress={() => setAmount(0)}>
        초기화
      </Button>
    }
  />

  <NumberKeypad
    onKeyPress={(num) => setAmount(prev => prev * 10 + num)}
    onBackspacePress={() => setAmount(prev => Math.floor(prev / 10))}
  />
</View>
```

#### AmountTopProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| subTitle* | - | React.ReactNode 부제목을 지정해요. |
| title* | - | React.ReactNode 메인 제목(금액)을 지정해요. |
| topPadding | 64 | 0 | 64 | 80 상단 패딩을 픽셀 단위로 지정해요. |
| bottomPadding | 0 | 0 | 16 | 24 하단 패딩을 픽셀 단위로 지정해요. |
| horizontalPadding | 24 | 0 | 24 좌우 패딩을 픽셀 단위로 지정해요. |
| button | - | React.ReactNode 오른쪽에 표시될 버튼을 지정해요. |

#### AmountTopSubTitleProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | string 부제목의 내용을 지정해요. |
| onPress | - | () => void 부제목을 클릭했을 때 호출되는 함수예요. |
| underline | - | false | true 부제목에 밑줄을 표시할지 여부를 지정해요. onPress가 있으면 자동으로 true가 돼요. |
