---
title: "BarChart - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/Chart/bar-chart/"
---

# BarChart - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/Chart/bar-chart/

## BarChart

BarChart 컴포넌트는 막대 그래프 형태로 데이터의 값을 시각화하는 도구예요. BarChart를 사용하면 데이터를 막대의 높이로 표현할 수 있고, 색상을 지정하여 특정 막대를 강조 할 수 있어요. 이를 통해 사용자는 데이터의 중요도를 한눈에 파악할 수 있어요.

### 항목 구성하기

BarChart에 data를 전달하려면 아래와 같은 항목을 포함해야 해요.

- value: 해당 막대의 실제 값을 나타내요. 막대의 높이는 이 값에 비례해 설정돼요. 이 값은 보통 막대 상단에 표시돼요.
- xAxisLabel: X축에 나타나는 레이블로, 각 막대가 나타내는 항목을 설명하는 텍스트예요.

```
<BarChart
  data={[
    { value: 6, xAxisLabel: '1월' },
    { value: 5, xAxisLabel: '2월' },
    { value: 4, xAxisLabel: '3월' },
    { value: 3, xAxisLabel: '4월' },
    { value: 2, xAxisLabel: '5월' },
    { value: 1, xAxisLabel: '6월' },
  ]}
/>
```

```
<BarChart
  data={[
    { value: 6, xAxisLabel: '1월' },
    { value: 5, xAxisLabel: '2월' },
    { value: 4, xAxisLabel: '3월' },
    { value: 3, xAxisLabel: '4월' },
    { value: 2, xAxisLabel: '5월' },
    { value: 1, xAxisLabel: '6월' },
  ]}
  fill={{
    type: 'all-bar',
    theme: 'green',
  }}
/>
```

### 차트 스타일 지정하기

BarChart의 막대 스타일은 fill의 type 속성으로 설정할 수 있어요. 세 가지 타입인 all-bar, single-bar, auto를 지원해요. 각 타입에 따라 추가적으로 필요한 속성도 달라져요.

- single-bar: 오른쪽 끝 하나의 막대만 색상을 채우고, 나머지는 기본색(grey100)으로 설정돼요.
- all-bar: 모든 막대를 하나의 색상으로 채워요.
- auto: 기본 규칙에 따라 막대의 색상을 채워요.

#### 전체 막대 색상 변경하기

all-bar는 모든 막대에 동일한 색상을 적용하고 싶을 때 사용하는 옵션이에요. 예를 들어, 모든 막대를 노란색으로 설정할 수 있어요. 이 경우 theme 속성을 이용해 적용할 색상만 지정해 주면 돼요.

```
<BarChart
  data={[
    { value: 6, xAxisLabel: '1월' },
    { value: 5, xAxisLabel: '2월' },
    { value: 4, xAxisLabel: '3월' },
    { value: 3, xAxisLabel: '4월' },
    { value: 2, xAxisLabel: '5월' },
    { value: 1, xAxisLabel: '6월' },
  ]}
  fill={{
    type: 'all-bar',
    theme: 'yellow',
  }}
/>
```

#### 하나의 항목만 강조하기

single-bar는 마지막 하나의 막대만 다른 색상으로 강조할 때 사용하는 옵션이에요.

```
<BarChart
  data={[
    { value: 6, xAxisLabel: '1월' },
    { value: 5, xAxisLabel: '2월' },
    { value: 4, xAxisLabel: '3월' },
    { value: 3, xAxisLabel: '4월' },
    { value: 2, xAxisLabel: '5월' },
    { value: 1, xAxisLabel: '6월' },
  ]}
  fill={{
    type: 'single-bar',
    theme: 'blue',
  }}
/>
```

#### 자동으로 여러 항목 강조하기

auto는 여러 개의 막대를 자동으로 색상 적용하고 싶을 때 사용하는 타입이에요. 이 경우 count 속성을 설정해서 오른쪽부터 몇 개의 막대에 색상을 적용할지 지정할 수 있어요. auto 타입의 색상 적용 순서는 오른쪽부터 blue → green → yellow → orange → red → grey 순서로 적용돼요.

```
<BarChart
  data={[
    { value: 6, xAxisLabel: '1월' },
    { value: 5, xAxisLabel: '2월' },
    { value: 4, xAxisLabel: '3월' },
    { value: 3, xAxisLabel: '4월' },
    { value: 2, xAxisLabel: '5월' },
    { value: 1, xAxisLabel: '6월' },
  ]}
  fill={{
    type: 'auto',
    count: 6,
  }}
/>
```

### 높이 설정하기

차트 전체의 높이를 설정하는 속성이에요. 막대 개수에 상관없이 이 값에 따라 차트 전체 높이가 설정돼요. 막대 하나하나의 높이가 아닌, BarChart 컴포넌트 전체의 세로 길이를 조정할 때 사용해요.

```
<BarChart
  data={[
    { value: 10, xAxisLabel: '1월' },
    { value: 9, xAxisLabel: '2월' },
    { value: 8, xAxisLabel: '3월' },
    { value: 7, xAxisLabel: '4월' },
    { value: 6, xAxisLabel: '5월' },
    { value: 5, xAxisLabel: '6월' },
  ]}
  fill={{
    type: 'single-bar',
    theme: 'orange',
  }}
  height={300}
/>
```

### 데이터가 많은 경우 표시하기

data의 항목 개수가 12개를 초과하면, 차트에서는 첫 번째와 마지막 항목에만 상하에 보조 정보가 표시돼요. 데이터가 많을 때 라벨이 겹쳐 보이는 것을 방지하기 위해 자동으로 제공되는 기능이에요.

```
<BarChart
  data={[
    { value: 8, xAxisLabel: '2012' },
    { value: 7, xAxisLabel: '2013' },
    { value: 6, xAxisLabel: '2014' },
    { value: 5, xAxisLabel: '2015' },
    { value: 4, xAxisLabel: '2016' },
    { value: 3, xAxisLabel: '2017' },
    { value: 2, xAxisLabel: '2018' },
    { value: 3, xAxisLabel: '2019' },
    { value: 4, xAxisLabel: '2020' },
    { value: 5, xAxisLabel: '2021' },
    { value: 6, xAxisLabel: '2022' },
    { value: 7, xAxisLabel: '2023' },
    { value: 8, xAxisLabel: '2024' },
  ]}
  fill={{
    type: 'auto',
    count: 13,
  }}
/>
```

#### BarChartProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| data | [] | BarChartData[] `BarChart` 컴포넌트에 표시할 데이터를 설정해요. |
| fill | 'all-bar' | SingleBar | AllBar | Auto `BarChart` 컴포넌트의 색상 채우기 방식을 설정해요. |
| width | Dimensions.get('window').width | number `BarChart` 컴포넌트의 너비를 설정해요. |
| height | 205 | number `BarChart` 컴포넌트의 높이를 설정해요. |

#### BarChartData

BarChartProps의 data에 들어가는 속성이에요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| value* | - | number `BarChart` 컴포넌트에서 하나의 막대를 나타내는 데이터에요. `value`는 0 이상의 정수여야 해요. 이 값은 보통 막대 상단에 표시돼요. |
| xAxisLabel | - | string `BarChart` 컴포넌트에서 막대 하단 X축에 표시될 레이블이에요. |

#### AllBar

BarChartProps의 fill 속성의 type이 all-bar인 경우 fill에 들어가는 속성이에요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| type* | - | "all-bar" `BarChart` 컴포넌트를 하나의 색상으로 채워요. `color` 속성을 사용해서 색상을 설정할 수 있어요. |
| theme* | - | "blue" | "green" | "yellow" | "orange" | "red" | "grey" `BarChart` 컴포넌트에 채울 색상을 설정해요. |

#### SingleBar

BarChartProps의 fill 속성의 type이 single-bar인 경우 fill에 들어가는 속성이에요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| type* | - | "single-bar" `BarChart` 컴포넌트의 오른쪽 끝 하나만 색상을 채우고, 나머지는 기본색(`grey100`)으로 설정돼요. `color` 속성을 사용해서 색상을 설정할 수 있어요. |
| theme* | - | "blue" | "green" | "yellow" | "orange" | "red" | "grey" `BarChart` 컴포넌트에 채울 색상을 설정해요. |

#### Auto

BarChartProps의 fill 속성의 type이 auto인 경우 fill에 들어가는 속성이에요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| type* | - | "auto" `BarChart` 컴포넌트를 기본 규칙에 따라 막대의 색상을 오른쪽 부터 채워요. `count` 속성을 통해 색상이 적용될 막대의 개수를 제한할 수 있어요. 색상 순서는 다음과 같아요: ['blue', 'green', 'yellow', 'orange', 'red', 'grey']. |
| count* | - | number 색상을 적용할 막대의 개수예요. |
