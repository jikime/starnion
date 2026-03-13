---
title: "TableRow - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/table-row/"
---

# TableRow - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/table-row/

## TableRow

TableRow 컴포넌트는 테이블 형태의 정보를 표시할 때 사용해요. 왼쪽과 오른쪽 두 개의 열로 구성되어 있으며, 정보를 명확하게 전달하는 데 유용해요.

- Label
Value

### 기본 사용

TableRow를 사용하려면 align, left, right를 지정하세요.

```
<TableRow
  align="left"
  left="받는분"
  right="김토스"
  leftRatio={40}
/>
```

### 정렬

align 속성을 사용해 정렬 방식을 지정할 수 있어요.

```
// 왼쪽 정렬
<TableRow
  align="left"
  left="계좌번호"
  right="1234-5678-9012"
  leftRatio={40}
/>

// 양쪽 정렬
<TableRow
  align="right"
  left="받는분"
  right="김토스"
  leftRatio={40}
/>
```

### 비율 조정

leftRatio를 사용해 왼쪽 영역의 너비 비율을 조정할 수 있어요.

```
<TableRow
  align="left"
  left="은행"
  right="토스뱅크"
  leftRatio={30}
/>

<TableRow
  align="left"
  left="계좌번호"
  right="1234-5678-9012-3456"
  leftRatio={30}
/>
```

### 커스텀 텍스트 스타일

TableRow.LeftText와 TableRow.RightText를 사용해 텍스트 스타일을 커스터마이징할 수 있어요.

```tsx
import { colors } from '@toss/tds-colors';

<TableRow
  align="left"
  left={
    <TableRow.LeftText color={colors.grey600}>
      받는분
    </TableRow.LeftText>
  }
  right={
    <TableRow.RightText fontWeight="bold" color={colors.grey900}>
      김토스
    </TableRow.RightText>
  }
  leftRatio={40}
/>
```

### 송금 정보

송금 확인 화면에서 사용할 수 있어요.

```
<View>
  <TableRow
    align="left"
    left="받는분"
    right="김토스"
    leftRatio={35}
  />
  <TableRow
    align="left"
    left="받는 계좌"
    right="토스뱅크 1234-5678-9012"
    leftRatio={35}
  />
  <TableRow
    align="left"
    left="보낼 금액"
    right={
      <TableRow.RightText fontWeight="semiBold">
        50,000원
      </TableRow.RightText>
    }
    leftRatio={35}
  />
</View>
```

### 상품 정보

```
<View>
  <TableRow
    align="right"
    left="상품명"
    right="토스 적금"
    leftRatio={40}
  />
  <TableRow
    align="right"
    left="금리"
    right="연 3.5%"
    leftRatio={40}
  />
  <TableRow
    align="right"
    left="가입 기간"
    right="12개월"
    leftRatio={40}
  />
</View>
```

### 패딩 제거

horizontalPadding을 사용해 좌우 패딩을 제거할 수 있어요.

```
<TableRow
  align="left"
  left="항목"
  right="값"
  horizontalPadding={0}
  leftRatio={40}
/>
```

### List와 함께 사용

TableRow를 List 안에서 사용하면 구분선이 자동으로 추가돼요.

```
<List>
  <TableRow
    align="left"
    left="이름"
    right="김토스"
    leftRatio={35}
  />
  <TableRow
    align="left"
    left="전화번호"
    right="010-1234-5678"
    leftRatio={35}
  />
  <TableRow
    align="left"
    left="이메일"
    right="toss@example.com"
    leftRatio={35}
  />
</List>
```

#### TableRowProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| align* | - | "left" | "right" 테이블 행의 정렬 방식을 지정해요. |
| left* | - | React.ReactNode 왼쪽에 표시될 내용을 지정해요. 문자열이나 TableRow.LeftText 컴포넌트를 사용할 수 있어요. |
| right* | - | React.ReactNode 오른쪽에 표시될 내용을 지정해요. 문자열이나 TableRow.RightText 컴포넌트를 사용할 수 있어요. |
| leftRatio | - | number 왼쪽 영역의 너비 비율을 0-100 사이의 값으로 지정해요. |
| horizontalPadding | 24 | 0 | 24 좌우 패딩을 지정해요. |
| style | - | StyleProp<ViewStyle> 테이블 행의 스타일을 지정해요. |
