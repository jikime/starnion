---
title: "Board Row - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/board-row/"
---

# Board Row - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/board-row/

## Board Row

BoardRow는 제한된 공간에서 많은 정보를 깔끔하게 정리해 표시하는 컴포넌트예요. 주로 Q&A와 같은 정보를 표현할 때 사용하며, 펼쳐졌다 접히는 방식으로 정보를 보여주는 아코디언 컴포넌트 같은 역할을 해요.

## 사용법

BoardRow 컴포넌트는 제목, 아이콘, 그리고 콘텐츠 영역으로 구성돼요. 사용자는 제목 영역을 클릭하여 콘텐츠 영역을 열거나 닫을 수 있어요. 제목 옆의 아이콘은 추가적인 정보나 상태를 시각적으로 표시하기 위해 사용해요.

```
<BoardRow
  icon={<BoardRow.QIcon />}
  title="매도 환전이 무엇인가요?"
  contents={<Txt>주식 거래가 실시간이 아니기 때문에 가격이 변할 것에 대비하는 금액을 말해요.</Txt>}
/>
```

### 콘텐츠 영역 채우기

BoardRow의 콘텐츠 영역에는 주로 Txt와 Post 컴포넌트를 사용해요. Post 컴포넌트를 활용하면 깔끔하게 정리된 정보를 전달할 수 있어요.

```
<BoardRow
  icon={<BoardRow.QIcon />}
  title="질문을 적어주세요."
  contents={
    <>
      <Post.Paragraph paddingBottom={24} typography="t6">
        주식 거래가 실시간이 아니기 때문에 가격이 변할 것에 대비하는 금액을 말해요.
      </Post.Paragraph>
      <Post.Ol>
        <Post.Li>아이템1</Post.Li>
        <Post.Li>아이템2</Post.Li>
      </Post.Ol>
    </>
  }
/>
```

#### BoardRowProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| title* | - | string `BoardRow` 컴포넌트의 헤더 영역에 표시될 제목이에요. |
| icon | - | React.ReactNode `BoardRow` 컴포넌트 헤더 영역의 `title` 앞에 표시할 아이콘이에요. 주로 `BoardRow.QIcon` 컴포넌트를 사용해요. |
| contents | - | React.ReactNode `BoardRow` 컴포넌트의 콘텐츠 영역에 표시될 내용이에요. 주로 `Txt` 혹은 `Post` 컴포넌트로 감싼 요소를 사용해요. |
