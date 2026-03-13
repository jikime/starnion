---
title: "Post - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/post/"
---

# Post - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/post/

## Post

Post 컴포넌트는 포스트 형식의 줄글을 쓸 때 적용되는 스타일이에요. 각 스타일은 제목, 본문, 목록과 같은 구성요소로 나뉘어 있으며, 정보를 효과적으로 시각화해요. 공지 사항이나 이벤트 페이지 등에 사용해요.

### 제목에서 사용하기

제목 스타일은 중요도에 따라 다양한 크기로 구분해요. 제목에서 사용할 수 있는 컴포넌트는 4가지 종류가 있어요.

- Post.H1: 가장 큰 제목에 사용해요.
- Post.H2: 큰 제목에 사용해요.
- Post.H3: 일반적인 제목에 사용해요.
- Post.H4: 작은 제목에 사용해요.

#### H4 제목 타이틀

```
<Post.H1>H1 제목 타이틀</Post.H1>
<Post.H2>H2 제목 타이틀</Post.H2>
<Post.H3>H3 제목 타이틀</Post.H3>
<Post.H4>H4 제목 타이틀</Post.H4>
```

### 본문에서 사용하기

Post.Paragraph 컴포넌트는 기본 본문 스타일로, 주로 설명이 필요한 텍스트에 사용해요. 긴 문장을 잘 읽히도록 가독성 높은 글꼴과 적절한 여백을 제공해요.

```
<Post.Paragraph>
  2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
  {'\n'}
  {'\n'}
  또한, 토스 제휴 금융사 계좌 개설 시 자동 삭제되었던 토스머니가 다시 생성되며, 앞으로 모든 연락처 송금은
  토스머니로 입금됩니다.
</Post.Paragraph>
<Post.Paragraph typography="t7">
  2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
  {'\n'}
  {'\n'}
  또한, 토스 제휴 금융사 계좌 개설 시 자동 삭제되었던 토스머니가 다시 생성되며, 앞으로 모든 연락처 송금은
  토스머니로 입금됩니다.
</Post.Paragraph>
```

### 목록에서 사용하기

관련된 정보를 항목별로 구분하여 사용자에게 이해하기 쉽게 제공해요. 목록 스타일은 순서가 필요한 경우와 그렇지 않은 경우로 나뉘어 있어요. 순서가 필요한 경우에는 Post.Ol 컴포넌트를 사용해요. 그렇지 않은 경우에는 Post.Ul 컴포넌트를 사용해요.

각 항목을 표시할 경우에는 Post.Li 컴포넌트를 사용해요. Post.Li 컴포넌트는 부모 요소인 Post.Ol, Post.Ul에 포함하여 사용해요.

#### 순서가 필요할 때

Post.Ol 컴포넌트는 순서가 필요한 항목을 번호로 표시해요. 주로 단계별 지시 사항이나 절차를 안내하는데 적합해요.

```
<Post.Ol>
  <Post.Li>
    2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
  </Post.Li>
  <Post.Li>리스트 텍스트</Post.Li>
  <Post.Ol>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    <Post.Ol>
      <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
      <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    </Post.Ol>
  </Post.Ol>
  <Post.Li>리스트 텍스트</Post.Li>
  <Post.Ol>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
  </Post.Ol>
</Post.Ol>
```

#### 순서가 필요하지 않을 때

Post.Ul 컴포넌트는 순서가 필요하지 않은 항목을 불릿 형태로 표시해요. 주로 간단한 정보나 조건 목록 등에 적합해요.

```
<Post.Ul>
  <Post.Li>
    2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
  </Post.Li>
  <Post.Li>리스트 텍스트</Post.Li>
  <Post.Ul>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    <Post.Ul>
      <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
      <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
    </Post.Ul>
  </Post.Ul>
  <Post.Li>리스트 텍스트</Post.Li>
  <Post.Ul>
    <Post.Li>리스트 안의 리스트 텍스트</Post.Li>
  </Post.Ul>
</Post.Ul>
```

### 구분선 사용하기

Post.Hr 컴포넌트는 요소 주위에 선을 그려서 요소 간의 구분을 명확히 하고 싶을 때 사용해요. UI 요소 간의 명확한 구분과 계층 구조를 표현할 수 있어요.

```
<Post.Paragraph>
  2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
</Post.Paragraph>
<Post.Hr />
<Post.Paragraph>
  2018년 11월 22일부터 토스 가입 시 자동 발급되는 토스 계좌의 명칭이 {"'"}토스머니{"'"}로 변경됩니다.
</Post.Paragraph>
```

#### PostH1Props

Txt 컴포넌트를 확장하여 제작했어요. Txt 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | "t2" | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostH2Props

Txt 컴포넌트를 확장하여 제작했어요. Txt 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | "t2" | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostH3Props

Txt 컴포넌트를 확장하여 제작했어요. Txt 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | "t2" | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostH4Props

Txt 컴포넌트를 확장하여 제작했어요. Txt 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | "t2" | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostParagraphProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| typography | - | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 텍스트 아래 여백 크기를 결정해요. 단위는 `px`이에요. |

#### PostOlProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | - | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostUlProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode 컴포넌트 내부에 표시될 내용을 지정해요. |
| typography | - | Typography 텍스트의 타이포그래피 스타일을 지정해요. |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |

#### PostHrProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| paddingBottom | - | number 컴포넌트 하단의 여백을 결정해요. |
| style | - | StyleProp<ViewStyle> 컴포넌트의 스타일을 변경할 때 사용해요. |
