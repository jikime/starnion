---
title: "Highlight - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/highlight/"
---

# Highlight - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/highlight/

## Highlight

Highlight 컴포넌트는 특정 요소를 강조하고 설명을 표시하는 데 사용해요. 온보딩이나 튜토리얼에서 유용해요.

### 기본 사용

```tsx
const [showHighlight, setShowHighlight] = useState(false);
const [targetRect, setTargetRect] = useState(null);

const handleLayout = (event) => {
  const { x, y, width, height } = event.nativeEvent.layout;
  setTargetRect({ x, y, width, height });
};

<View>
  <Button
    onLayout={handleLayout}
    onPress={() => {}}
  >
    시작하기
  </Button>

  {targetRect && (
    <Highlight
      open={showHighlight}
      targetRect={targetRect}
      message="이 버튼을 눌러 시작하세요"
      onClose={() => setShowHighlight(false)}
    />
  )}
</View>
```

### 온보딩 튜토리얼

```tsx
const [step, setStep] = useState(0);
const [targetRects, setTargetRects] = useState({});

const tutorialSteps = [
  { target: 'sendButton', message: '여기를 눌러 송금을 시작하세요' },
  { target: 'historyButton', message: '여기서 거래 내역을 확인할 수 있어요' },
  { target: 'settingsButton', message: '설정에서 더 많은 기능을 사용할 수 있어요' },
];

const currentStep = tutorialSteps[step];

<View>
  <Button
    onLayout={(e) => {
      const rect = e.nativeEvent.layout;
      setTargetRects(prev => ({ ...prev, sendButton: rect }));
    }}
  >
    송금
  </Button>

  {currentStep && targetRects[currentStep.target] && (
    <Highlight
      open={true}
      targetRect={targetRects[currentStep.target]}
      message={currentStep.message}
      onClose={() => {
        if (step < tutorialSteps.length - 1) {
          setStep(step + 1);
        } else {
          setStep(-1);
        }
      }}
    />
  )}
</View>
```

#### HighlightProps

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| open* | - | false | true Highlight가 보이는지 여부를 지정해요. |
| targetRect* | - | { x: number; y: number; width: number; height: number; } 하이라이트할 요소의 위치와 크기를 지정해요. |
| onClose* | - | () => void Highlight를 닫을 때 호출되는 함수예요. |
| message | - | React.ReactNode 하이라이트 영역에 표시할 메시지를 지정해요. |
| onExited | - | () => void Highlight가 완전히 사라진 후 호출되는 함수예요. |
