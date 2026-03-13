---
title: "Loader - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/loader/"
---

# Loader - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/loader/

## Loader

Loader 컴포넌트는 데이터를 불러오거나 처리하는 동안 로딩 상태를 시각적으로 표시해요. 애니메이션 효과로 사용자에게 진행 중임을 알리고 기다리도록 유도해요.

### 기본 사용

```
<Loader />
```

### 크기 조정

size 속성으로 로더의 크기를 조정할 수 있어요.

```
<Loader size="small" />
<Loader size="medium" />
<Loader size="large" />
```

### 색상 타입

배경색에 따라 적절한 type을 선택하여 가독성을 높일 수 있어요.

```
<Loader type="primary" />
<Loader type="dark" />
<View style={{ backgroundColor: colors.blue500, padding: 16 }}>
  <Loader type="light" />
</View>
```

### 라벨 표시

label 속성으로 로딩 메시지를 함께 표시할 수 있어요.

```
<Loader label="불러오는 중..." />
<Loader label="처리 중입니다" size="medium" />
```

### 지연 표시

짧은 로딩 시간에 깜빡임을 방지하기 위해 delay 속성으로 로더 표시를 지연시킬 수 있어요.

```
<Loader delay={700} />
```

### 전체 화면 로더

Loader.FullScreen을 사용하면 화면 중앙에 로더를 표시할 수 있어요.

```
<Loader.FullScreen />
<Loader.FullScreen label="데이터를 불러오는 중..." />
```

### 중앙 정렬 로더

Loader.Centered를 사용하면 패딩이 있는 중앙 정렬 로더를 표시할 수 있어요.

```
<Loader.Centered />
```

#### LoaderProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| size | 'large' | "small" | "medium" | "large" 로더의 크기를 지정해요. |
| type | 'primary' | "primary" | "dark" | "light" 로더의 색상 타입을 지정해요. 배경색에 따라 적절한 타입을 선택하세요. |
| style | - | StyleProp<ViewStyle> 로더의 스타일을 변경할 때 사용해요. |
| customStrokeColor | - | string 로더의 색상을 직접 지정할 때 사용해요. type 속성보다 우선해요. |
| customSize | - | number 로더의 크기를 픽셀 단위로 직접 지정할 때 사용해요. size 속성보다 우선해요. |
| delay | - | number 로더 표시를 지연시킬 시간을 밀리초 단위로 지정해요. 짧은 로딩 시간에 깜빡임을 방지하기 위해 사용해요. |
| label | - | string 로더와 함께 표시할 라벨 텍스트를 지정해요. |
