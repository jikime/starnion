---
title: "Navbar - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/navbar/"
---

# Navbar - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/navbar/

## Navbar

Navbar 컴포넌트는 화면 상단에 표시되는 네비게이션 바예요. React Navigation과 함께 사용하기 쉽게 설계되었어요.

### 기본 사용

```
<Navbar left={<Navbar.BackButton onPress={() => navigation.goBack()} />} title="페이지 제목" />
```

### 오른쪽 버튼 추가

```
<Navbar
  left={<Navbar.BackButton onPress={() => navigation.goBack()} />}
  title="설정"
  right={<Navbar.TextButton onPress={() => handleSave()}>저장</Navbar.TextButton>}
/>
```

### 닫기 버튼

```
<Navbar left={<Navbar.CloseButton onPress={() => navigation.goBack()} />} title="모달" />
```

### React Navigation과 함께 사용

```tsx
import { Navbar } from '@toss/tds-react-native';

<Stack.Screen
  name="Detail"
  component={DetailScreen}
  options={{
    headerLeft: () => <Navbar.BackButton />,
    headerTitle: () => <Navbar.Title>상세</Navbar.Title>,
    headerRight: () => <Navbar.TextButton onPress={() => handleShare()}>공유</Navbar.TextButton>,
  }}
/>;
```

### 커스텀 왼쪽 버튼

```
<Navbar
  left={
    <Pressable onPress={() => navigation.goBack()}>
      <Icon name="icon-arrow-left" size={24} />
    </Pressable>
  }
  title="뒤로 가기"
/>
```

### 여러 개의 오른쪽 버튼

```
<Navbar
  left={<Navbar.BackButton onPress={() => navigation.goBack()} />}
  title="편집"
  right={
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <Navbar.TextButton onPress={() => handleDelete()}>삭제</Navbar.TextButton>
      <Navbar.TextButton onPress={() => handleSave()}>저장</Navbar.TextButton>
    </View>
  }
/>
```

#### NavbarProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| left | - | React.ReactNode Navbar의 왼쪽에 표시될 내용을 지정해요. 주로 뒤로가기 버튼이 들어가요. |
| title | - | React.ReactNode Navbar의 중앙에 표시될 제목을 지정해요. |
| right | - | React.ReactNode Navbar의 오른쪽에 표시될 내용을 지정해요. 주로 액션 버튼이 들어가요. |
