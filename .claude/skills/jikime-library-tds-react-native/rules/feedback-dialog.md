---
title: "Dialog - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/dialog/"
---

# Dialog - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/dialog/

## Dialog

Dialog 컴포넌트는 사용자에게 중요한 정보를 전달하거나 확인을 요청할 때 사용해요. AlertDialog와 ConfirmDialog 두 가지 타입을 제공해요.

### AlertDialog

AlertDialog는 사용자에게 정보를 전달하고 확인을 받는 데 사용해요. 하나의 버튼만 표시돼요.

```tsx
import { useOverlay } from '@toss/tds-react-native';

const overlay = useOverlay();

const openAlertDialog = () => {
  return new Promise<void>(resolve => {
    overlay.open(({ isOpen, close, exit }) => (
      <AlertDialog
        open={isOpen}
        title="저장 완료"
        description="변경사항이 저장되었어요"
        buttonText="확인"
        onClose={() => {
          resolve();
          close();
        }}
        onExited={exit}
      />
    ));
  });
};
```

### ConfirmDialog

ConfirmDialog는 사용자에게 선택을 요청할 때 사용해요. 두 개의 버튼을 표시할 수 있어요.

```tsx
import { useOverlay } from '@toss/tds-react-native';

const overlay = useOverlay();

const openConfirmDialog = () => {
  return new Promise<boolean>(resolve => {
    overlay.open(({ isOpen, close, exit }) => (
      <ConfirmDialog
        open={isOpen}
        title="삭제 확인"
        description="정말로 삭제하시겠어요?"
        leftButton={
          <ConfirmDialog.Button
            style="weak"
            type="dark"
            onPress={() => {
              resolve(false);
              close();
            }}
          >
            취소
          </ConfirmDialog.Button>
        }
        rightButton={
          <ConfirmDialog.Button
            type="danger"
            onPress={() => {
              resolve(true);
              close();
            }}
          >
            삭제
          </ConfirmDialog.Button>
        }
        onClose={() => {
          resolve(false);
          close();
        }}
        onExited={exit}
      />
    ));
  });
};
```

### 커스텀 콘텐츠

content 속성을 사용해 다이얼로그에 커스텀 콘텐츠를 추가할 수 있어요.

```
<AlertDialog
  open={isOpen}
  title="상세 정보"
  content={
    <View>
      <Txt>커스텀 콘텐츠를 여기에 추가할 수 있어요</Txt>
    </View>
  }
  onClose={() => setIsOpen(false)}
/>
```

### 딤 클릭으로 닫기

closeOnDimmerClick 속성을 사용해 딤 영역을 클릭했을 때 다이얼로그를 닫을 수 있어요.

```
<AlertDialog
  open={isOpen}
  title="알림"
  description="딤 영역을 클릭하면 닫혀요"
  closeOnDimmerClick={true}
  onClose={() => setIsOpen(false)}
/>
```

#### AlertDialogProps

Accessibility 컴포넌트를 확장하여 제작했어요. Accessibility 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| open* | - | false | true 다이얼로그가 보이는지 여부를 지정해요. |
| title* | - | React.ReactNode 다이얼로그의 제목을 지정해요. |
| onClose* | - | () => void 다이얼로그를 닫을 때 호출되는 함수예요. |
| description | - | React.ReactNode 다이얼로그의 설명 텍스트를 지정해요. |
| content | - | React.ReactNode 다이얼로그 본문에 표시될 커스텀 콘텐츠를 지정해요. |
| buttonText | '확인' | string 다이얼로그 버튼의 텍스트를 지정해요. |
| onButtonPress | - | () => void 다이얼로그 버튼을 클릭했을 때 호출되는 함수예요. |
| closeOnDimmerClick | - | false | true 딤 영역을 클릭했을 때 다이얼로그를 닫을지 여부를 지정해요. |
| onExited | - | () => void 다이얼로그가 완전히 사라진 후 호출되는 함수예요. |
| onEntered | - | () => void 다이얼로그가 완전히 나타난 후 호출되는 함수예요. |

#### ConfirmDialogProps

Accessibility 컴포넌트를 확장하여 제작했어요. Accessibility 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| open* | - | false | true 다이얼로그가 보이는지 여부를 지정해요. |
| title* | - | React.ReactNode 다이얼로그의 제목을 지정해요. |
| leftButton* | - | React.ReactNode 다이얼로그 왼쪽에 표시될 버튼을 지정해요. |
| rightButton* | - | React.ReactNode 다이얼로그 오른쪽에 표시될 버튼을 지정해요. |
| onClose* | - | () => void 다이얼로그를 닫을 때 호출되는 함수예요. |
| description | - | React.ReactNode 다이얼로그의 설명 텍스트를 지정해요. |
| content | - | React.ReactNode 다이얼로그 본문에 표시될 커스텀 콘텐츠를 지정해요. |
| closeOnDimmerClick | - | false | true 딤 영역을 클릭했을 때 다이얼로그를 닫을지 여부를 지정해요. |
| onExited | - | () => void 다이얼로그가 완전히 사라진 후 호출되는 함수예요. |
| onEntered | - | () => void 다이얼로그가 완전히 나타난 후 호출되는 함수예요. |
