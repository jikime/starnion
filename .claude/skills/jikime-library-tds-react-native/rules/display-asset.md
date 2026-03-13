---
title: "Asset - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/asset/"
---

# Asset - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/asset/

## Asset

Asset 컴포넌트는 이미지, 아이콘, Lottie 애니메이션 등을 일정한 프레임 안에 표시하는 데 사용해요. 다양한 크기와 모양의 프레임을 제공해요.

### 이미지 Asset

```
<View style={{ display: 'flex', flexDirection: 'row', gap: '32px' }}>
  <Asset.Image
    source={{ uri: 'https://static.toss.im/2d-emojis/svg/u1F600.svg' }}
    frameShape={Asset.frameShape.SquareLarge}
    backgroundColor={adaptive.grey100}
    scale={0.55}
  />
  <Asset.Image
    source={{ uri: 'https://static.toss.im/2d-emojis/svg/u1F600.svg' }}
    frameShape={Asset.frameShape.SquareLarge}
    backgroundColor={adaptive.grey100}
    scale={0.55}
    acc={<Asset.ContentImage source={{ uri: 'https://static.toss.im/icons/svg/icon-check-circle-green.svg' }} />}
    accPosition="bottom-right"
  />
  <Asset.Image
    source={{ uri: 'https://static.toss.im/2d-emojis/svg/u1F600.svg' }}
    frameShape={Asset.frameShape.SquareLarge}
    backgroundColor={adaptive.grey100}
    scale={0.55}
    overlap={{ color: '#3182F6' }}
  />
</View>
```

### 아이콘 Asset

```
<Asset.Icon name="heart-line" />
```

### 아이콘 색상 변경

```
<View style={{ display: 'flex', flexDirection: 'row', gap: '32px' }}>
  <Asset.Icon color="green" name="heart-line" />
  <Asset.Icon color="red" name="heart-line" />
  <Asset.Icon color="blue" name="heart-line" />
</View>
```

### Lottie Asset

```
<Asset.Lottie frameShape={Asset.frameShape.CleanW60} src="https://static.toss.im/lotties-common/alarm-spot.json" loop />
```

### 다양한 프레임 크기

```
// 60px 프레임
<Asset
  resource={<Asset.Image source={{ uri: imageUrl }} />}
  frame={Asset.frameShape.CleanW60}
/>

// 48px 프레임
<Asset
  resource={<Asset.Image source={{ uri: imageUrl }} />}
  frame={Asset.frameShape.CleanW48}
/>

// 36px 프레임
<Asset
  resource={<Asset.Image source={{ uri: imageUrl }} />}
  frame={Asset.frameShape.CleanW36}
/>
```

### 커스텀 프레임

```
<Asset
  resource={<Asset.Image source={{ uri: imageUrl }} />}
  frame={{
    width: 80,
    height: 80,
    radius: 12,
    color: '#f5f5f5',
  }}
/>
```

### 그림자 효과

```
<Asset
  resource={<Asset.Image source={{ uri: imageUrl }} />}
  frame={Asset.frameShape.CleanW60}
  union={{
    type: 'overlap',
    color: 'rgba(0, 0, 0, 0.1)',
  }}
/>
```

#### LegacyFrameShape

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| width* | - | number 프레임의 너비를 픽셀 단위로 지정해요. |
| height* | - | number 프레임의 높이를 픽셀 단위로 지정해요. |
| radius* | - | number 프레임의 모서리 반경을 픽셀 단위로 지정해요. |
| color* | - | string 프레임의 배경색을 지정해요. |
| overlap | - | { x: number; y: number; blur: number; } 프레임의 오버랩 설정을 지정해요. |

#### AssetProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| resource* | - | React.ReactElement<any, string | React.JSXElementConstructor<any>> Asset에 표시될 리소스를 지정해요. |
| frame* | - | LegacyFrameShape Asset의 프레임 설정을 지정해요. |
| union | - | { type: "overlap"; color: string; } Asset의 유니온 설정을 지정해요. |
| style | - | StyleProp<ViewStyle> Asset의 스타일을 지정해요. |
