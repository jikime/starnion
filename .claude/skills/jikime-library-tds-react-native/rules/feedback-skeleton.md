---
title: "Skeleton - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/skeleton/"
---

# Skeleton - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/skeleton/

## Skeleton

Skeleton 컴포넌트는 콘텐츠가 로딩되는 동안 임시 플레이스홀더를 표시하여 사용자 경험을 개선해요. 실제 콘텐츠의 레이아웃과 유사한 형태로 표시하여 로딩 시간을 덜 지루하게 만들어줘요.

### 기본 사용

너비와 높이를 지정하여 스켈레톤을 표시할 수 있어요.

```
<Skeleton width={200} height={20} />
<Skeleton width="100%" height={40} />
```

### 다양한 형태

borderRadius를 조정하여 다양한 형태의 스켈레톤을 만들 수 있어요.

```
{/* 텍스트 라인 */}
<Skeleton width={300} height={16} borderRadius={4} />

{/* 이미지 */}
<Skeleton width={100} height={100} borderRadius={8} />

{/* 원형 프로필 */}
<Skeleton width={48} height={48} borderRadius={24} />
```

### 리스트 스켈레톤

여러 개의 스켈레톤을 조합하여 리스트 아이템의 로딩 상태를 표현할 수 있어요.

```
<View>
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
    <Skeleton width={48} height={48} borderRadius={24} />
    <View style={{ marginLeft: 12, flex: 1 }}>
      <Skeleton width="80%" height={16} style={{ marginBottom: 8 }} />
      <Skeleton width="60%" height={14} />
    </View>
  </View>
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Skeleton width={48} height={48} borderRadius={24} />
    <View style={{ marginLeft: 12, flex: 1 }}>
      <Skeleton width="80%" height={16} style={{ marginBottom: 8 }} />
      <Skeleton width="60%" height={14} />
    </View>
  </View>
</View>
```

#### SkeletonBaseProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| width | - | DimensionValue 스켈레톤의 너비를 지정해요. |
| height | - | DimensionValue 스켈레톤의 높이를 지정해요. |
| borderRadius | 6 | string | AnimatableNumericValue 스켈레톤의 테두리 둥글기를 지정해요. |
| style | - | StyleProp<ViewStyle> 스켈레톤의 스타일을 변경할 때 사용해요. |
