---
title: "Colors - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/foundation/colors/"
---

# Colors - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/foundation/colors/

## Colors

토스의 색상 시스템은 개발자와 디자이너가 통일된 색상 이름을 사용하도록 도와줘요. 이 시스템을 활용하면 디자인 가이드에 맞춰 일관된 UI를 쉽게 구현할 수 있어요.

## 기본 사용법

@toss/tds-react-native 패키지의 colors 객체에서 원하는 색상을 가져와 사용할 수 있어요.

```tsx
import { colors } from '@toss/tds-react-native';
 
<View style={{ width:100, height:100, backgroundColor: colors.blue500 }} />
```

### Grey

- colors.grey50

#f9fafb
- colors.grey100

#f2f4f6
- colors.grey200

#e5e8eb
- colors.grey300

#d1d6db
- colors.grey400

#b0b8c1
- colors.grey500

#8b95a1
- colors.grey600

#6b7684
- colors.grey700

#4e5968
- colors.grey800

#333d4b
- colors.grey900

#191f28

### Blue

- colors.blue50

#e8f3ff
- colors.blue100

#c9e2ff
- colors.blue200

#90c2ff
- colors.blue300

#64a8ff
- colors.blue400

#4593fc
- colors.blue500

#3182f6
- colors.blue600

#2272eb
- colors.blue700

#1b64da
- colors.blue800

#1957c2
- colors.blue900

#194aa6

### Red

- colors.red50

#ffeeee
- colors.red100

#ffd4d6
- colors.red200

#feafb4
- colors.red300

#fb8890
- colors.red400

#f66570
- colors.red500

#f04452
- colors.red600

#e42939
- colors.red700

#d22030
- colors.red800

#bc1b2a
- colors.red900

#a51926

### Grey Opacity

- colors.greyOpacity50

#001733, 0.02
- colors.greyOpacity100

#022047, 0.05
- colors.greyOpacity200

#001b37, 0.1
- colors.greyOpacity300

#001d3a, 0.18
- colors.greyOpacity400

#001936, 0.31
- colors.greyOpacity500

#031832, 0.46
- colors.greyOpacity600

#00132b, 0.58
- colors.greyOpacity700

#031228, 0.7
- colors.greyOpacity800

#000c1e, 0.8
- colors.greyOpacity900

#020913, 0.91

### Orange

- colors.orange50

#fff3e0
- colors.orange100

#ffe0b0
- colors.orange200

#ffcd80
- colors.orange300

#ffbd51
- colors.orange400

#ffa927
- colors.orange500

#fe9800
- colors.orange600

#fb8800
- colors.orange700

#f57800
- colors.orange800

#ed6700
- colors.orange900

#e45600

### Yellow

- colors.yellow50

#fff9e7
- colors.yellow100

#ffefbf
- colors.yellow200

#ffe69b
- colors.yellow300

#ffdd78
- colors.yellow400

#ffd158
- colors.yellow500

#ffc342
- colors.yellow600

#ffb331
- colors.yellow700

#faa131
- colors.yellow800

#ee8f11
- colors.yellow900

#dd7d02

### Green

- colors.green50

#f0faf6
- colors.green100

#aeefd5
- colors.green200

#76e4b8
- colors.green300

#3fd599
- colors.green400

#15c47e
- colors.green500

#03b26c
- colors.green600

#02a262
- colors.green700

#029359
- colors.green800

#028450
- colors.green900

#027648

### Teal

- colors.teal50

#edf8f8
- colors.teal100

#bce9e9
- colors.teal200

#89d8d8
- colors.teal300

#58c7c7
- colors.teal400

#30b6b6
- colors.teal500

#18a5a5
- colors.teal600

#109595
- colors.teal700

#0c8585
- colors.teal800

#097575
- colors.teal900

#076565

### Purple

- colors.purple50

#f9f0fc
- colors.purple100

#edccf8
- colors.purple200

#da9bef
- colors.purple300

#c770e4
- colors.purple400

#b44bd7
- colors.purple500

#a234c7
- colors.purple600

#9128b4
- colors.purple700

#8222a2
- colors.purple800

#73228e
- colors.purple900

#65237b

## 배경 색상

- colors.background

#FFFFFF
- colors.greyBackground

lightThemeGrey100
- colors.layeredBackground

#FFFFFF
- colors.floatedBackground

#FFFFFF
