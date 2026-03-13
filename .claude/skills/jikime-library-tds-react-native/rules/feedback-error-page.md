---
title: "ErrorPage - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/error-page/"
---

# ErrorPage - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/error-page/

## ErrorPage

ErrorPage 컴포넌트는 에러 상황을 사용자에게 친절하게 안내하는 페이지예요. HTTP 상태 코드에 따라 적절한 메시지와 이미지를 자동으로 표시해요.

### 기본 사용

ErrorPage를 사용하려면 statusCode를 지정하세요. 상태 코드에 따라 적절한 메시지가 자동으로 표시돼요.

```
<ErrorPage
  statusCode={500}
  onPressRightButton={() => {
    // 닫기 동작
  }}
  onPressLeftButton={() => {
    // 고객센터 문의 동작
  }}
/>
```

### 404 에러

페이지나 정보를 찾을 수 없을 때 사용해요.

```
<ErrorPage
  statusCode={404}
  onPressRightButton={() => navigation.goBack()}
  onPressLeftButton={() => openCustomerCenter()}
/>
```

### 400 에러

입력한 정보가 올바르지 않을 때 사용해요.

```
<ErrorPage
  statusCode={400}
  onPressRightButton={() => {
    // 다시 입력하기
    navigation.goBack();
  }}
  onPressLeftButton={() => openCustomerCenter()}
/>
```

### 500 에러

서버 에러나 일시적인 오류가 발생했을 때 사용해요.

```
<ErrorPage
  statusCode={500}
  onPressRightButton={() => navigation.goBack()}
  onPressLeftButton={() => openCustomerCenter()}
/>
```

### 커스텀 메시지

title과 subtitle을 지정해 기본 메시지를 변경할 수 있어요.

```
<ErrorPage
  statusCode={500}
  title="서비스 점검 중이에요"
  subtitle="더 나은 서비스를 위해 잠시 점검 중이에요. 곧 돌아올게요."
  onPressRightButton={() => navigation.goBack()}
/>
```

### 커스텀 콘텐츠

children을 통해 추가 콘텐츠를 표시할 수 있어요.

```
<ErrorPage statusCode={500}>
  <View style={{ padding: 20 }}>
    <Txt>추가 안내 사항을 여기에 표시할 수 있어요</Txt>
  </View>
</ErrorPage>
```

#### ErrorPageProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| statusCode | 500 | number HTTP 상태 코드를 지정해요. 상태 코드에 따라 기본 제목과 설명이 자동으로 설정돼요. |
| title | - | string 에러 페이지의 제목을 지정해요. 지정하지 않으면 statusCode에 따라 기본 제목이 표시돼요. |
| subtitle | - | string 에러 페이지의 부제목을 지정해요. 지정하지 않으면 statusCode에 따라 기본 부제목이 표시돼요. |
| onPressRightButton | - | () => void 오른쪽 버튼을 클릭했을 때 호출되는 함수예요. |
| onPressLeftButton | - | () => void 왼쪽 버튼(고객센터 문의)을 클릭했을 때 호출되는 함수예요. |
