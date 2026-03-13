---
title: "GridList - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/grid-list/"
---

# GridList - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/grid-list/

## GridList

GridList 컴포넌트는 아이템들을 그리드 형태로 배치하는 데 사용해요. 1열, 2열, 3열 레이아웃을 지원해요.

### 기본 사용

```
<GridList column={3}>
  <GridList.Item
    image={<Icon name="icn-bank-toss" />}
    title="토스뱅크"
    onPress={() => handleBankSelect('toss')}
  />
  <GridList.Item
    image={<Icon name="icn-bank-kb" />}
    title="KB국민은행"
    onPress={() => handleBankSelect('kb')}
  />
  <GridList.Item
    image={<Icon name="icn-bank-shinhan" />}
    title="신한은행"
    onPress={() => handleBankSelect('shinhan')}
  />
</GridList>
```

### 열 개수 조정

```
// 1열
<GridList column={1}>
  <GridList.Item image={<Icon name="icn-1" />} title="아이템 1" onPress={() => {}} />
  <GridList.Item image={<Icon name="icn-2" />} title="아이템 2" onPress={() => {}} />
</GridList>

// 2열
<GridList column={2}>
  <GridList.Item image={<Icon name="icn-1" />} title="아이템 1" onPress={() => {}} />
  <GridList.Item image={<Icon name="icn-2" />} title="아이템 2" onPress={() => {}} />
  <GridList.Item image={<Icon name="icn-3" />} title="아이템 3" onPress={() => {}} />
</GridList>

// 3열
<GridList column={3}>
  <GridList.Item image={<Icon name="icn-1" />} title="아이템 1" onPress={() => {}} />
  <GridList.Item image={<Icon name="icn-2" />} title="아이템 2" onPress={() => {}} />
  <GridList.Item image={<Icon name="icn-3" />} title="아이템 3" onPress={() => {}} />
</GridList>
```

### 은행 선택

```tsx
const banks = [
  { id: 'toss', name: '토스뱅크', icon: 'icn-bank-toss' },
  { id: 'kb', name: 'KB국민은행', icon: 'icn-bank-kb' },
  { id: 'shinhan', name: '신한은행', icon: 'icn-bank-shinhan' },
  { id: 'woori', name: '우리은행', icon: 'icn-bank-woori' },
  { id: 'hana', name: '하나은행', icon: 'icn-bank-hana' },
  { id: 'nh', name: 'NH농협은행', icon: 'icn-bank-nh' },
];

const [selectedBank, setSelectedBank] = useState(null);

<GridList column={3}>
  {banks.map(bank => (
    <GridList.Item
      key={bank.id}
      image={<Icon name={bank.icon} />}
      title={bank.name}
      onPress={() => setSelectedBank(bank.id)}
    />
  ))}
</GridList>
```

### 카테고리 선택

```tsx
const categories = [
  { id: 'food', name: '식비', icon: 'icn-food' },
  { id: 'transport', name: '교통', icon: 'icn-transport' },
  { id: 'shopping', name: '쇼핑', icon: 'icn-shopping' },
  { id: 'life', name: '생활', icon: 'icn-life' },
];

<GridList column={2}>
  {categories.map(category => (
    <GridList.Item
      key={category.id}
      image={<Icon name={category.icon} />}
      title={category.name}
      onPress={() => handleCategorySelect(category.id)}
    />
  ))}
</GridList>
```

#### GridListProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode | React.ReactNode[] GridList의 아이템들을 지정해요. GridList.Item을 children으로 전달해요. |
| column* | - | 1 | 2 | 3 GridList의 열 개수를 지정해요. |
| style | - | StyleProp<ViewStyle> GridList의 스타일을 지정해요. |

#### GridListItemProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| image* | - | React.ReactNode 아이템에 표시될 이미지를 지정해요. 최대 높이는 28px이에요. |
| title* | - | React.ReactNode 아이템의 제목을 지정해요. |
| style | - | StyleProp<ViewStyle> 아이템의 스타일을 지정해요. |
| onPress | - | () => void 아이템을 클릭했을 때 호출되는 함수예요. |
