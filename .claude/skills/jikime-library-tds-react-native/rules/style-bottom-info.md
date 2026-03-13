---
title: "Bottom Info - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/bottom-info/"
---

# Bottom Info - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/bottom-info/

## Bottom Info

BottomInfo 컴포넌트는 화면 하단에 중요한 정보나 주의사항을 명확하게 표시할 때 사용해요. 특히 금융 상품처럼 법적 고지나 디스클레이머(면책 조항)를 사용자에게 안내해야 하는 상황에서 유용해요. 주로 리스트 형식을 제공할 수 있는 Post 컴포넌트와 함께 사용해 정보를 깔끔하게 정리해 보여줄 수 있어요.

- 대출기간 40년의 경우 만39세 (만 나이를 사용해주세요!) 이하 또는 신혼부부(혼인신고후 7년이내) 대상으로 한 상품입니다.
- 회사 및 대출모집인은 해당상품에 대해 충분히 설명할 의무가 있으며, 고객님께서는 이에 대한 충분한 설명을 받으시길 바랍니다.
- 대출금 중도상환시 중도상환수수료 부과기간 잔여일수에 대해 중도상환수수료가 발생할 수 있습니다.

### 콘텐츠 영역 채우기

BottomInfo의 콘텐츠 영역에는 주로 Post 컴포넌트를 사용해요. Post 컴포넌트를 활용하면 깔끔하게 정리된 정보를 전달할 수 있어요.

```
<BottomInfo>
  <Post.Ul paddingBottom={24} typography="t7">
    <Post.Li>
      대출기간 40년의 경우 만39세 (만 나이를 사용해주세요!) 이하 또는 신혼부부(혼인신고후 7년이내) 대상으로 한
      상품입니다.
    </Post.Li>
    <Post.Li>
      회사 및 대출모집인은 해당상품에 대해 충분히 설명할 의무가 있으며, 고객님께서는 이에 대한 충분한 설명을 받으시길
      바랍니다.
    </Post.Li>
    <Post.Li>대출금 중도상환시 중도상환수수료 부과기간 잔여일수에 대해 중도상환수수료가 발생할 수 있습니다.</Post.Li>
  </Post.Ul>
</BottomInfo>
```

#### BottomInfoProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children | - | React.ReactNode `BottomInfo` 컴포넌트 내부에 표시될 텍스트를 지정해요. |
| style | - | StyleProp<ViewStyle> `BottomInfo` 컴포넌트의 스타일을 변경할 때 사용해요. |
