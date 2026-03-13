---
title: "Rating - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/rating/"
---

# Rating - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/rating/

## Rating

Rating 컴포넌트는 점수를 표시하거나 사용자의 입력을 받을 수 있어요. 주로 콘텐츠에 대한 평가를 보여주거나 평가를 진행하기 위해 사용돼요.

### 사용자와 상호작용하기

Rating 컴포넌트는 두 가지 방식으로 사용자에게 정보를 제공해요:

- 읽기 전용: 사용자는 컴포넌트로부터 정보를 확인할 수 있지만, 컴포넌트와 상호작용할 수 없어요.
- 상호 작용: 사용자가 컴포넌트를 직접 제어할 수 있어요. 주로 사용자 입력을 받기 위한 용도로 사용돼요.

### 읽기 전용

읽기 전용 모드는 readonly 속성을 true로 설정하여 사용할 수 있어요. 사용자는 컴포넌트를 클릭하거나 터치하여 상호작용할 수 없어요.

#### 크기 조정하기

Rating 컴포넌트의 크기를 변경하려면 size 속성을 사용하세요. tiny, small, medium, large, big 중 하나를 선택할 수 있어요.

```
<Rating readonly value={5} size="tiny" variant="full" />
<Rating readonly value={5} size="small" variant="full" />
<Rating readonly value={5} size="medium" variant="full" />
<Rating readonly value={5} size="large" variant="full" />
<Rating readonly value={5} size="big" variant="full" />
```

#### 형태 변경하기

Rating 컴포넌트의 형태를 바꾸려면 variant를 사용하세요. full, compact, iconOnly 중에서 선택할 수 있어요.

```
<Rating readonly value={5} size="medium" variant="full" />
<Rating readonly value={5} size="medium" variant="compact" />
<Rating readonly value={5} size="medium" variant="iconOnly" />
```

### 상호 작용하기

상호 작용 모드는 readonly 속성을 false로 설정하여 사용할 수 있어요.

```tsx
function EditableRating() {
  const [value, setValue] = useState(5);
  return <Rating readOnly={false} value={value} max={5} size="medium" onValueChange={setValue} />;
}
```

#### 비활성화하기

Rating 컴포넌트를 비활성화하려면 disabled 속성을 사용하세요.

```
<Rating readonly={false} value={value} size="medium" disabled onValueChange={handleValueChange} />
```

#### EditableRatingProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| readOnly* | false | false 이 값이 `false`일 때 `Rating` 컴포넌트를 제어할 수 있어요. |
| value* | - | number `Rating` 컴포넌트의 현재 점수를 결정해요. |
| size* | - | "medium" | "large" | "big" `Rating` 컴포넌트의 크기를 결정해요. |
| onValueChange | undefined | (value: number) => void `Rating` 컴포넌트의 점수 상태가 바뀔 때 실행되는 함수에요. |
| max | 5 | number `Rating` 컴포넌트에 지정 가능한 최대 점수를 결정해요. |
| disabled | false | false | true 이 값이 `true` 일 때 `Rating` 컴포넌트가 비활성화돼요. |

#### ReadOnlyRatingProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| readOnly* | - | true 이 값이 `true`일 때 `Rating` 컴포넌트를 제어할 수 없어요. |
| value* | - | number `Rating` 컴포넌트의 현재 점수를 결정해요. |
| variant* | - | "full" | "compact" | "iconOnly" `Rating` 컴포넌트의 형태를 결정해요. |
| size* | - | "medium" | "large" | "big" | "tiny" | "small" `Rating` 컴포넌트의 크기를 결정해요. |
| max | 5 | number `Rating` 컴포넌트에 지정 가능한 최대 점수를 결정해요. |
