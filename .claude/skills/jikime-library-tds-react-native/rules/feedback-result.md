---
title: "Result - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/result/"
---

# Result - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/result/

## Result

Result 컴포넌트는 특정 작업의 결과를 시각적으로 보여주는 페이지 컴포넌트예요. 주로 사용자가 작업을 성공했을 때나 에러가 발생했을 때 결과를 알리고, 다양한 메시지나 액션을 제공하는 데 사용해요.

### 요소 추가하기

figure 속성을 사용하면 제목 상단에 다양한 시각적 요소를 추가할 수 있어요. Asset 컴포넌트를 활용해 아이콘, 로띠, 이미지 등의 리소스를 손쉽게 표현할 수 있어요. 이렇게 시각적 요소를 활용하면 사용자에게 메시지를 직관적으로 전달할 수 있어요.

```
<Result
  figure={
    <Asset.Image
      source={{
        uri: 'https://static.toss.im/2d-emojis/png/4x/u1F4FA.png',
      }}
      frameShape={Asset.frameShape.CircleLarge}
    />
  }
  title="라이브 쇼핑 준비 중"
  description="요금이 나오면 알림을 보내드릴게요."
/>
```

### 버튼 추가하기

button 속성을 사용하면 설명 아래에 액션 버튼을 추가할 수 있어요. Result.Button 컴포넌트를 활용해서 다시 시도하기, 홈으로 돌아가기 등의 동작을 쉽게 구현할 수 있어요. 사용자는 이 버튼으로 필요한 액션을 바로 수행할 수 있어요.

```
<Result
  figure={<Asset.Icon name="icn-info-line" frameShape={Asset.frameShape.CleanH24} />}
  title="다시 접속해주세요"
  description={`페이지를 불러올 수 없습니다\n다시 시도해주세요`}
  button={<Result.Button>재시도</Result.Button>}
/>
```

#### ResultProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| figure | - | React.ReactNode `Result` 컴포넌트의 `title` 위에 표시할 시각적 요소로, 주로 아이콘이나 이미지를 나타내요. `Asset` 컴포넌트를 사용해서 다양한 시각적 콘텐츠를 표현할 수 있어요. |
| title | - | React.ReactNode `Result` 컴포넌트의 결과 화면의 제목이에요. 사용자가 어떤 작업을 한 뒤의 성공 여부 같은 상태를 간결하게 전달하는 데에 사용해요. |
| description | - | React.ReactNode `Result` 컴포넌트의 `title` 아래에 추가로 설명을 제공하는 영역이에요. 좀 더 자세한 정보를 제공할 때 사용해요. |
| button | - | React.ReactNode `Result` 컴포넌트의 `description` 아래에 표시할 버튼이에요. `Result.Button` 컴포넌트를 사용해서 다시 시도하기, 홈으로 돌아가기 등과 같은 액션을 추가할 수 있어요. |
| style | - | StyleProp<ViewStyle> `Result` 컴포넌트의 스타일을 변경할 때 사용해요. |
