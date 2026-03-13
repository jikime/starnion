---
title: "List - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/list/"
---

# List - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/list/

## List

List 컴포넌트는 여러 아이템을 세로로 나열할 때 사용해요. 아이템 사이에 구분선을 자동으로 추가할 수 있어요.

### 기본 사용

List를 사용하려면 children으로 아이템들을 전달하세요.

```
<List>
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 1' }]} />} />
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 2' }]} />} />
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 3' }]} />} />
</List>
```

### 구분선 타입

rowSeparator 속성을 사용해 아이템 사이의 구분선 스타일을 변경할 수 있어요.

```
// 왼쪽 여백이 있는 구분선 (기본값)
<List rowSeparator="indented">
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 1' }]} />} />
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 2' }]} />} />
</List>

// 전체 너비 구분선
<List rowSeparator="full">
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 1' }]} />} />
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 2' }]} />} />
</List>

// 구분선 없음
<List rowSeparator="none">
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 1' }]} />} />
  <ListRow contents={<ListRow.Texts texts={[{ text: '아이템 2' }]} />} />
</List>
```

### 설정 목록

설정 화면에서 자주 사용하는 패턴이에요.

```
<List>
  <ListRow
    contents={<ListRow.Texts texts={[{ text: '알림 설정' }]} />}
    withArrow
    onPress={() => navigation.navigate('Notification')}
  />
  <ListRow
    contents={<ListRow.Texts texts={[{ text: '계정 설정' }]} />}
    withArrow
    onPress={() => navigation.navigate('Account')}
  />
  <ListRow
    contents={<ListRow.Texts texts={[{ text: '개인정보 처리방침' }]} />}
    withArrow
    onPress={() => navigation.navigate('Privacy')}
  />
</List>
```

### 아이콘과 함께 사용

```
<List>
  <ListRow
    left={<ListRow.Icon name="icon-notification" />}
    contents={<ListRow.Texts texts={[{ text: '알림' }]} />}
    right={<Switch value={true} />}
  />
  <ListRow
    left={<ListRow.Icon name="icon-lock" />}
    contents={<ListRow.Texts texts={[{ text: '보안' }]} />}
    withArrow
    onPress={() => {}}
  />
</List>
```

### 정보 목록

```
<List rowSeparator="indented">
  <ListRow
    contents={
      <ListRow.Texts
        texts={[
          { text: '계좌번호', typography: 't6', color: colors.grey600 },
          { text: '1234-5678-9012', typography: 't5' },
        ]}
      />
    }
  />
  <ListRow
    contents={
      <ListRow.Texts
        texts={[
          { text: '예금주', typography: 't6', color: colors.grey600 },
          { text: '김토스', typography: 't5' },
        ]}
      />
    }
  />
</List>
```

#### ListProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 리스트의 아이템들을 지정해요. |
| rowSeparator | 'indented' | "full" | "indented" | "none" 리스트의 row 엘리먼트 사이의 구분선 타입을 지정해요. |
| style | - | StyleProp<ViewStyle> 리스트의 스타일을 지정해요. |
