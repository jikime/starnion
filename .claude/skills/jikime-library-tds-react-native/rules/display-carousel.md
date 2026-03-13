---
title: "Carousel - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/carousel/"
---

# Carousel - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/carousel/

## Carousel

Carousel 컴포넌트는 여러 아이템을 가로로 슬라이드하며 보여주는 컴포넌트예요. 제스처를 통해 자연스럽게 아이템을 탐색할 수 있어요.

### 기본 사용

Carousel을 사용하려면 itemWidth를 지정하고 Carousel.Item을 children으로 전달하세요.

```
<Carousel itemWidth={320}>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'red' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'blue' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'green' }} />
  </Carousel.Item>
</Carousel>
```

### 이미지 캐러셀

이미지를 슬라이드로 보여줄 수 있어요.

```tsx
const images = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/image3.jpg',
];

<Carousel itemWidth={350}>
  {images.map((imageUrl, index) => (
    <Carousel.Item key={index}>
      <Image
        source={{ uri: imageUrl }}
        style={{ width: 350, height: 250, borderRadius: 12 }}
      />
    </Carousel.Item>
  ))}
</Carousel>
```

### 카드 캐러셀

여러 카드를 슬라이드로 보여줄 수 있어요.

```tsx
const cards = [
  { title: '카드 1', description: '설명 1' },
  { title: '카드 2', description: '설명 2' },
  { title: '카드 3', description: '설명 3' },
];

<Carousel itemWidth={300}>
  {cards.map((card, index) => (
    <Carousel.Item key={index}>
      <View style={{ width: 300, padding: 20, backgroundColor: 'white', borderRadius: 12 }}>
        <Txt typography="h3">{card.title}</Txt>
        <Txt typography="t5" style={{ marginTop: 8 }}>
          {card.description}
        </Txt>
      </View>
    </Carousel.Item>
  ))}
</Carousel>
```

### 아이템 간격 조정

itemGap을 사용해 아이템 사이의 간격을 조정할 수 있어요.

```
<Carousel itemWidth={320} itemGap={20}>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'red' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'blue' }} />
  </Carousel.Item>
</Carousel>
```

### 패딩 조정

padding을 사용해 캐러셀의 좌우 패딩을 조정할 수 있어요.

```
<Carousel itemWidth={320} padding={16}>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'red' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'blue' }} />
  </Carousel.Item>
</Carousel>
```

### 인디케이터 추가

renderIndicators를 사용해 현재 위치를 나타내는 인디케이터를 추가할 수 있어요.

```
<Carousel
  itemWidth={320}
  renderIndicators={({ activeIndex, itemsCount }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16 }}>
      {Array.from({ length: itemsCount }).map((_, index) => (
        <View
          key={index}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            marginHorizontal: 4,
            backgroundColor: index === activeIndex ? colors.blue500 : colors.grey300,
          }}
        />
      ))}
    </View>
  )}
>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'red' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'blue' }} />
  </Carousel.Item>
  <Carousel.Item>
    <View style={{ width: 320, height: 200, backgroundColor: 'green' }} />
  </Carousel.Item>
</Carousel>
```

### 프로모션 배너

```tsx
const promotions = [
  { title: '첫 송금 수수료 무료', image: '...' },
  { title: '적금 금리 특별 혜택', image: '...' },
  { title: '친구 초대 이벤트', image: '...' },
];

<Carousel
  itemWidth={340}
  itemGap={16}
  renderIndicators={({ activeIndex, itemsCount }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
      {Array.from({ length: itemsCount }).map((_, index) => (
        <View
          key={index}
          style={{
            width: index === activeIndex ? 20 : 6,
            height: 6,
            borderRadius: 3,
            marginHorizontal: 3,
            backgroundColor: index === activeIndex ? colors.blue500 : colors.grey300,
          }}
        />
      ))}
    </View>
  )}
>
  {promotions.map((promo, index) => (
    <Carousel.Item key={index}>
      <Pressable onPress={() => handlePromotionPress(promo)}>
        <Image source={{ uri: promo.image }} style={{ width: 340, height: 180, borderRadius: 12 }} />
        <Txt typography="h4" style={{ marginTop: 12 }}>
          {promo.title}
        </Txt>
      </Pressable>
    </Carousel.Item>
  ))}
</Carousel>
```

## 중요 사항

Carousel을 사용하려면 앱 최상위에 GestureHandlerRootView를 추가해야 안드로이드에서 정상적으로 동작해요.

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 앱 콘텐츠 */}
    </GestureHandlerRootView>
  );
}
```

#### CarouselProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| children* | - | React.ReactNode[] 캐러셀의 아이템들을 지정해요. Carousel.Item을 children으로 전달해요. |
| itemWidth | 280 | number 캐러셀 아이템의 너비를 픽셀 단위로 지정해요. |
| itemGap | 12 | number 캐러셀 아이템 사이의 간격을 픽셀 단위로 지정해요. |
| padding | 24 | number 캐러셀을 둘러싸는 패딩을 픽셀 단위로 지정해요. |
| renderIndicators | - | (data: { activeIndex: number; itemsCount: number; }) => React.ReactNode 현재 활성화된 아이템을 나타내는 인디케이터를 렌더링하는 함수예요. |
