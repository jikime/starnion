---
title: "SegmentedControl - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/segmented-control/"
---

# SegmentedControl - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/segmented-control/

## SegmentedControl

SegmentedControl 컴포넌트는 여러 옵션 중 하나를 선택할 수 있는 세그먼트 컨트롤이에요. Radio와 비슷하지만 더 시각적으로 구분된 형태예요.

### 기본 사용

```tsx
const [value, setValue] = useState('tab1');

<SegmentedControl value={value} onValueChange={setValue}>
  <SegmentedControl.Item value="tab1">탭 1</SegmentedControl.Item>
  <SegmentedControl.Item value="tab2">탭 2</SegmentedControl.Item>
  <SegmentedControl.Item value="tab3">탭 3</SegmentedControl.Item>
</SegmentedControl>
```

### 두 개의 옵션

```tsx
const [period, setPeriod] = useState('month');

<SegmentedControl value={period} onValueChange={setPeriod}>
  <SegmentedControl.Item value="month">월간</SegmentedControl.Item>
  <SegmentedControl.Item value="year">연간</SegmentedControl.Item>
</SegmentedControl>
```

### 여러 개의 옵션

```tsx
const [duration, setDuration] = useState('1m');

<SegmentedControl value={duration} onValueChange={setDuration}>
  <SegmentedControl.Item value="1m">1개월</SegmentedControl.Item>
  <SegmentedControl.Item value="3m">3개월</SegmentedControl.Item>
  <SegmentedControl.Item value="6m">6개월</SegmentedControl.Item>
  <SegmentedControl.Item value="12m">12개월</SegmentedControl.Item>
</SegmentedControl>
```

### 탭 네비게이션

```tsx
const [activeTab, setActiveTab] = useState('all');

<View>
  <SegmentedControl value={activeTab} onValueChange={setActiveTab}>
    <SegmentedControl.Item value="all">전체</SegmentedControl.Item>
    <SegmentedControl.Item value="deposit">입금</SegmentedControl.Item>
    <SegmentedControl.Item value="withdrawal">출금</SegmentedControl.Item>
  </SegmentedControl>

  {activeTab === 'all' && <AllTransactions />}
  {activeTab === 'deposit' && <DepositTransactions />}
  {activeTab === 'withdrawal' && <WithdrawalTransactions />}
</View>
```

#### SegmentedControlProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode SegmentedControl의 아이템들을 지정해요. |
| value | - | string 현재 선택된 값을 지정해요. |
| onValueChange | - | (value: string) => void 값이 변경될 때 호출되는 함수예요. |

#### SegmentedControlItemProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| value* | - | string 아이템의 값을 지정해요. |
| children* | - | React.ReactNode 아이템의 내용을 지정해요. |
