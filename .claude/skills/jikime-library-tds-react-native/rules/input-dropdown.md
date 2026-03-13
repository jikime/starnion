---
title: "Dropdown - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/dropdown/"
---

# Dropdown - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/dropdown/

## Dropdown

Dropdown 컴포넌트는 여러 옵션 중 하나를 선택할 수 있는 드롭다운 메뉴를 제공해요. 버튼을 클릭하면 옵션 목록이 펼쳐져요.

### 기본 사용

```
<Dropdown>
  <Dropdown.Item onPress={() => console.log('옵션 1 선택')}>
    옵션 1
  </Dropdown.Item>
  <Dropdown.Item onPress={() => console.log('옵션 2 선택')}>
    옵션 2
  </Dropdown.Item>
  <Dropdown.Item onPress={() => console.log('옵션 3 선택')}>
    옵션 3
  </Dropdown.Item>
</Dropdown>
```

### 비활성화된 아이템

```
<Dropdown>
  <Dropdown.Item onPress={() => {}}>활성화된 옵션</Dropdown.Item>
  <Dropdown.Item disabled={true}>비활성화된 옵션</Dropdown.Item>
  <Dropdown.Item onPress={() => {}}>활성화된 옵션</Dropdown.Item>
</Dropdown>
```

### 메뉴 옵션

```tsx
const handleEdit = () => console.log('수정');
const handleDelete = () => console.log('삭제');
const handleShare = () => console.log('공유');
 
<Dropdown>
  <Dropdown.Item onPress={handleEdit}>수정하기</Dropdown.Item>
  <Dropdown.Item onPress={handleShare}>공유하기</Dropdown.Item>
  <Dropdown.Item onPress={handleDelete}>삭제하기</Dropdown.Item>
</Dropdown>
```

#### DropdownProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode Dropdown의 아이템들을 지정해요. Dropdown.Item을 children으로 전달해요. |

#### DropdownItemProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 아이템의 내용을 지정해요. |
| onPress | - | () => void 아이템을 클릭했을 때 호출되는 함수예요. |
| disabled | false | false | true 아이템의 비활성화 여부를 지정해요. |
