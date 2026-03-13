---
title: "Stepper - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/stepper/"
---

# Stepper - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/stepper/

## Stepper

Stepper 컴포넌트는 여러 단계를 시각적으로 보여줄 때 사용하는 컴포넌트예요. 각 단계는 제목과 설명을 가질 수 있고, 오른쪽에는 아이콘이나 버튼을 추가할 수 있어요. 순차적인 흐름을 사용자에게 쉽게 전달하는 데 적합해요.

### 단계 추가하기

StepperRow 컴포넌트의 content 속성에 StepperRow.Texts 컴포넌트를 사용해서 단계를 추가할 수 있어요.

#### 제목과 설명 추가하기

StepperRow.Texts 컴포넌트에서 type 속성을 사용하면 제목과 설명의 스타일을 변경할 수 있어요.

- A: 일반 크기의 제목(t5), 일반 크기의 설명(t6)
- B: 큰 크기의 제목(t4), 일반 크기의 설명(t6)
- C: 일반 크기의 제목(t5), 작은 크기의 설명(t7)

```
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="A" title="일반 크기의 제목" description="일반 크기의 설명" />}
/>
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="B" title="큰 크기의 제목" description="일반 크기의 설명" />}
/>
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="C" title="일반 크기의 제목" description="작은 크기의 설명" />}
  hideLine
/>
```

### 왼쪽에 요소 추가하기

StepperRow 컴포넌트의 left 속성을 사용하면 콘텐츠 영역의 왼쪽에 요소를 배치할 수 있어요. 보통 단계를 나타내기 위한 숫자나 의미를 부각하는 아이콘을 배치하는 데 많이 사용해요.

#### 왼쪽에 숫자 아이콘 추가하기

Stepper.NumberIcon 컴포넌트를 사용해 왼쪽에 숫자 아이콘을 추가할 수 있어요. 각 단계를 명확히 구분할 수 있어 유용해요.

```
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
/>
<StepperRow
  left={<StepperRow.NumberIcon number={2} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
/>
<StepperRow
  left={<StepperRow.NumberIcon number={3} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
  hideLine
/>
```

### 오른쪽에 요소 추가하기

StepperRow 컴포넌트의 right 속성을 사용해서 콘텐츠 영역의 오른쪽에 요소를 추가할 수 있어요.

#### 오른쪽에 화살표 아이콘 추가하기

Stepper.RightArrow 컴포넌트를 사용해서 오른쪽에 화살표 아이콘을 추가할 수 있어요.

```
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
  right={<StepperRow.RightArrow />}
/>
```

#### 오른쪽에 버튼 추가하기

Stepper.RightButton 컴포넌트를 사용해서 오른쪽에 버튼을 추가할 수 있어요.

```
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
  right={<StepperRow.RightButton>버튼</StepperRow.RightButton>}
/>
```

### 연결선 가리기

StepperRow 컴포넌트의 hideLine 속성을 사용하면 연결선을 숨길 수 있어요. 주로 마지막 단계에서 연결선을 제거할 때 사용해요.

```
<StepperRow
  left={<StepperRow.NumberIcon number={1} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
/>
<StepperRow
  left={<StepperRow.NumberIcon number={2} />}
  center={<StepperRow.Texts type="A" title="타이틀" description="설명" />}
  hideLine
/>
```

#### StepperRowProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| left* | - | React.ReactNode `StepperRow` 컴포넌트의 왼쪽 영역에 표시될 컴포넌트를 지정해요. 주로 `StepperRow.NumberIcon`나 `StepperRow.AssetFrame` 컴포넌트가 사용돼요. |
| center* | - | React.ReactNode `StepperRow` 컴포넌트의 중앙 영역에 표시될 타이틀과 설명을 지정해요. 주로 `StepperRow.Texts` 컴포넌트가 사용돼요. |
| right | - | React.ReactNode `StepperRow` 컴포넌트의 오륵쪽 영역에 표시될 컴포넌트를 지정해요. 주로 `StepperRow.RightArrow`나 `StepperRow.RightButton` 컴포넌트가 사용돼요. |
| hideLine | false | false | true `StepperRow` 컴포넌트의 연결선을 숨길지 여부를 설정해요. 주로 마지막 스텝에서 `true`를 사용하여 연결선을 제거해요. |

#### StepperRowNumberIconProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| number* | - | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 `StepperRow` 컴포넌트 왼쪽에 순서를 나타내는 숫자를 설정해요. |

#### StepperRowTextsProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| type* | - | "A" | "B" | "C" `StepperRow.Texts` 컴포넌트의 텍스트의 타입을 설정해요. 타이틀과 설명의 스타일이 타입에 따라 달라져요. |
| title* | - | React.ReactNode `StepperRow.Texts` 컴포넌트에 표시될 타이틀을 지정해요. |
| description | - | React.ReactNode `StepperRow.Texts` 컴포넌트에 표시될 설명을 지정해요. |
