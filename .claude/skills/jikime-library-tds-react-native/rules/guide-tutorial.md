---
title: "React Native | 앱인토스 개발자센터"
source: "https://developers-apps-in-toss.toss.im/tutorials/react-native.html"
---

# React Native | 앱인토스 개발자센터

> 원본: https://developers-apps-in-toss.toss.im/tutorials/react-native.html

## React Native
​

기존 RN 프로젝트가 있는 경우

이미 React Native로 만든 서비스가 있어도 앱인토스에서 동작하려면 Granite 기반으로 스캐폴딩 해야 해요.

Granite을 사용해 "Welcome!"페이지가 표시되는 서비스를 만들어볼게요.
이를 통해 로컬 서버를 연결하는 방법과 파일 기반 라우팅을 배울 수 있어요.

## 스캐폴딩
​

앱을 만들 위치에서 다음 명령어를 실행하세요.

이 명령어는 프로젝트를 초기화하고 필요한 파일과 디렉토리를 자동으로 생성해요.

```
$ npm create granite-app
```

```
$ pnpm create granite-app
```

```
$ yarn create granite-app
```

### 1. 앱 이름 지정하기
​

앱 이름은 kebab-case 형식으로 만들어 주세요. 예를 들어, 아래와 같이 입력해요.

```
# 예시
my-granite-app
```

### 2. 도구 선택하기
​

granite에서는 프로젝트를 생성할 때 필요한 도구를 선택할 수 있어요. 현재 제공되는 선택지는 다음 두 가지예요. 둘 중 한 가지 방법을 선택해서 개발 환경을 세팅하세요.

- prettier + eslint: 코드 포맷팅과 린팅을 각각 담당하며, 세밀한 설정과 다양한 플러그인으로 유연한 코드 품질 관리를 지원해요.
- biome: Rust 기반의 빠르고 통합적인 코드 포맷팅과 린팅 도구로, 간단한 설정으로 효율적인 작업이 가능해요.

### 3. 의존성 설치하기
​

프로젝트 디렉터리로 이동한 뒤, 사용 중인 패키지 관리자에 따라 의존성을 설치하세요.

```
$ cd my-granite-app
$ npm install
```

```
$ cd my-granite-app
$ pnpm install
```

```
$ cd my-granite-app
$ yarn install
```

### 스캐폴딩 전체 예시
​

아래는 my-granite-app이라는 이름으로 새로운 앱을 스캐폴딩한 결과예요.

스캐폴딩을 마쳤다면 프로젝트 구조가 생성돼요.

## 환경 구성하기
​

ReactNative SDK를 이용해 번들 파일을 생성하고 출시하는 방법을 소개해요.

### 설치하기
​

앱인토스 미니앱을 개발하려면 @apps-in-toss/framework 패키지를 설치해야 해요. 사용하는 패키지 매니저에 따라 아래 명령어를 실행하세요.

```
$ npm install @apps-in-toss/framework
```

```
$ pnpm install @apps-in-toss/framework
```

```
$ yarn add @apps-in-toss/framework
```

### 설정파일 구성하기
​

ait init 명령어로 앱 개발에 필요한 기본 환경을 구성할 수 있어요.
자세한 설정 방법은 공통 설정 문서를 확인해 주세요.

1. 아래 명령어 중 사용하는 패키지 관리자에 맞는 명령어를 실행하세요.

npm
pnpm
yarn
sh
 npx ait init
1. 프레임워크를 선택하세요.
1. 앱 이름(appName)을 입력하세요.

이 이름은 앱인토스 콘솔에서 앱을 만들 때 사용한 이름과 같아야 해요. 앱인토스 콘솔에서 앱 이름을 확인할 수 있어요.

모든 과정을 완료하면 프로젝트 루트에 granite.config.ts 파일이 생성돼요. 이 파일은 앱 설정을 관리하는 데 사용돼요.
자세한 설정 방법은 공통 설정 문서를 확인해 주세요.

```tsx
import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  appName: '<app-name>',
  plugins: [
    appsInToss({
      brand: {
        displayName: '%%appName%%', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
        primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
        icon: null, // 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
      },
      permissions: [],
    }),
  ],
});
```

- <app-name>: 앱인토스에서 만든 앱 이름이에요.
- brand: 앱 브랜드와 관련된 구성이에요.
displayName: 내비게이션 바에 표시할 앱 이름이에요.
icon: 앱 아이콘 이미지 주소예요. 사용자에게 앱 브랜드를 전달해요.
primaryColor: Toss 디자인 시스템(TDS) 컴포넌트에서 사용할 대표 색상이에요. RGB HEX 형식(eg. #3182F6)으로 지정해요.
- permissions: 권한이 필요한 함수 앱 설정하기 문서를 참고해서 설정하세요.

### React Native TDS 패키지 설치하기
​

TDS (Toss Design System) 패키지는 RN 기반 미니앱이 일관된 UI/UX를 유지하도록 돕는 토스의 디자인 시스템이에요.
@apps-in-toss/framework를 사용하려면 TDS React Native 패키지를 추가로 설치해야 해요.
모든 비게임 React Native 미니앱은 TDS 사용이 필수이며, 검수 승인 기준에도 포함돼요.

| @apps-in-toss/framework 버전 | 사용할 패키지 |
| --- | --- |
| < 1.0.0 | @toss-design-system/react-native |
| >= 1.0.0 | @toss/tds-react-native |

TDS에 대한 자세한 가이드는 React Native TDS를 참고해 주세요.

TDS 테스트

로컬 브라우저에서는 TDS가 동작하지 않아, 테스트할 수 없어요.
번거로우시더라도 샌드박스앱을 통한 테스트를 부탁드려요.

### 번들 파일 생성하기
​

번들 파일은 .ait 확장자를 가진 파일로, 빌드된 프로젝트를 패키징한 결과물이에요. 이를 생성하려면 아래 명령어를 실행하세요.

```
npm run build
```

```
pnpm build
```

```
yarn build
```

위 명령어를 실행하면 프로젝트 루트 디렉터리에 <서비스명>.ait 파일이 생성돼요. 해당 파일은 앱을 출시할 때 사용해요.

### 앱 출시하기
​

앱을 출시하는 방법은 앱 출시하기문서를 참고하세요.

## 코드 확인해보기
​

프로젝트의 _app.tsx 파일에 다음과 같은 코드가 들어있을 거예요.

```tsx
import { AppsInToss } from '@apps-in-toss/framework';
import { PropsWithChildren } from 'react';
import { InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return <>{children}</>;
}

export default AppsInToss.registerApp(AppContainer, { context });
```

### 스캐폴딩 된 코드 알아보기
​

스캐폴딩 명령어를 실행하면 다음과 같은 파일이 생성돼요.

```tsx
import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

export const Route = createRoute('/', {
  component: Page,
});

function Page() {
  const navigation = Route.useNavigation();

  const goToAboutPage = () => {
    navigation.navigate('/about');
  };

  return (
    <Container>
      <Text style={styles.title}>🎉 Welcome! 🎉</Text>
      <Text style={styles.subtitle}>
        This is a demo page for the <Text style={styles.brandText}>Granite</Text> Framework.
      </Text>
      <Text style={styles.description}>This page was created to showcase the features of the Granite.</Text>
      <TouchableOpacity style={styles.button} onPress={goToAboutPage}>
        <Text style={styles.buttonText}>Go to About Page</Text>
      </TouchableOpacity>
    </Container>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandText: {
    color: '#0064FF',
    fontWeight: 'bold',
  },
  text: {
    fontSize: 24,
    color: '#202632',
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A202C',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#0064FF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  codeContainer: {
    padding: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    width: '100%',
  },
  code: {
    color: 'white',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    fontSize: 14,
  },
});
```

## 파일 기반 라우팅 이해하기
​

Granite 개발 환경은 Next.js와 비슷한 파일 시스템 기반의 라우팅을 사용해요.

파일 기반 라우팅은 파일 구조에 따라 자동으로 경로(URL 또는 스킴)가 결정되는 시스템이에요. 예를 들어, pages라는 디렉토리에 detail.ts 파일이 있다면, 이 파일은 자동으로 /detail 경로로 연결돼요.

Granite 애플리케이션에서는 이 개념이 스킴과 연결돼요. 스킴은 특정 화면으로 연결되는 주소인데요. 예를 들어, pages/detail.ts라는 파일은 자동으로 intoss://my-granite-app/detail 이라는 스킴으로 접근할 수 있는 화면이에요. 모든 Granite 화면은 intoss:// 스킴으로 시작해요.

```
my-granite-app
└─ pages
    ├─ index.tsx       // intoss://my-granite-app
    ├─ detail.tsx      // intoss://my-granite-app/detail
    └─ item
        ├─ index.tsx    // intoss://my-granite-app/item
        └─ detail.tsx    // intoss://my-granite-app/item/detail
```

- index.tsx 파일: intoss://my-granite-app
- detail.tsx 파일: intoss://my-granite-app/detail
- item/index.tsx 파일: intoss://my-granite-app/item
- item/detail.tsx 파일: intoss://my-granite-app/item/detail

```
┌─ 모든 Granite 화면을 가리키는 스킴은
│  intoss:// 으로 시작해요
│
-------------
intoss://my-granite-app/detail
         ==============~~~~~~~
             │           └─ pages 하위에 있는 경로를 나타내요
             │
             └─ 서비스 이름을 나타내요
```

이렇게 개발자는 별도로 라우팅 설정을 하지 않아도, 파일을 추가하기만 하면 새로운 화면이 자동으로 설정돼요.

### 로컬 개발 서버 실행하기
​

이제 여러분만의 Granite 페이지를 만들 준비가 끝났어요. 🎉 다음으로 로컬에서 my-granite-app 서비스를 실행해 볼게요.

앱 실행 환경을 먼저 설정하세요.

- iOS 환경설정
- Android 환경설정

스캐폴딩된 프로젝트 디렉터리로 이동한 뒤, 선택한 패키지 매니저를 사용해 dev 스크립트를 실행하세요. 이렇게 하면 개발 서버가 시작돼요.

```
$ cd my-granite-app
$ npm run dev
```

```
$ cd my-granite-app
$ pnpm dev
```

```
$ cd my-granite-app
$ yarn dev
```

명령어를 실행하면 아래와 같은 화면이 표시돼요.

개발 서버 실행 중 too many open files 에러가 발생한다면, node_modules 디렉터리를 삭제한 뒤 다시 의존성을 설치해 보세요.

```
rm -rf node_modules
npm install  # 또는 yarn, pnpm에 맞게
```

실행 혹은 빌드시 '[Apps In Toss Plugin] 플러그인 옵션이 올바르지 않습니다' 에러가 발생한다면?

'[Apps In Toss Plugin] 플러그인 옵션이 올바르지 않습니다. granite.config.ts 구성을 확인해주세요.'
라는 메시지가 보인다면, granite.config.ts의 icon 설정을 확인해주세요.
아이콘을 아직 정하지 않았다면 ''(빈 문자열)로 비워둔 상태로도 테스트할 수 있어요.

```
...
displayName: 'test-app', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
icon: '',// 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
...
```

## 미니앱 실행하기(시뮬레이터·실기기)
​

준비가 필요해요

미니앱은 샌드박스 앱을 통해서만 실행되기때문에 샌드박스 앱(테스트앱) 설치가 필수입니다.
개발 및 테스트를 위해 샌드박스앱을 설치해주세요.

### iOS 시뮬레이터(샌드박스앱)에서 실행하기
​

1. 앱인토스 샌드박스 앱을 실행해요.
1. 샌드박스 앱에서 스킴을 실행해요. 예를 들어 서비스 이름이 kingtoss라면, intoss://kingtoss를 입력하고 "스키마 열기" 버튼을 눌러주세요.
1. Metro 서버가 실행 중이라면 시뮬레이터와 자동으로 연결돼요. 화면 상단에 Bundling {n}%...가 표시되면 연결이 성공한 거예요.

아래는 iOS 시뮬레이터에서 로컬 서버를 연결한 후 "Welcome!" 페이지를 표시하는 예시예요.

### 서버 주소 입력하기
​

아이폰에서 앱인토스 샌드박스 앱을 실행하려면 로컬 서버와 같은 와이파이에 연결되어 있어야 해요. 아래 단계를 따라 설정하세요.

1. 샌드박스 앱을 실행하면 "로컬 네트워크" 권한 요청 메시지가 표시돼요. 이때 "허용" 버튼을 눌러주세요.

1. 샌드박스 앱에서 서버 주소를 입력하는 화면이 나타나요.
1. 컴퓨터에서 로컬 서버 IP 주소를 확인하고, 해당 주소를 입력한 뒤 저장해주세요.

IP 주소는 한 번 저장하면 앱을 다시 실행해도 변경되지 않아요.
macOS를 사용하는 경우, 터미널에서 ipconfig getifaddr en0 명령어로 로컬 서버의 IP 주소를 확인할 수 있어요.
1. "스키마 열기" 버튼을 눌러주세요.
1. 화면 상단에 Bundling {n}%... 텍스트가 표시되면 로컬 서버에 성공적으로 연결된 거예요.

### Android 실기기 또는 에뮬레이터 연결하기
​

1. Android 실기기(휴대폰 또는 태블릿)를 컴퓨터와 USB로 연결하세요. (USB 연결 가이드)
1. adb 명령어를 사용해서 8081 포트와 5173포트를 연결하고 연결 상태를 확인해요.

8081 포트, 5173 포트 연결하기

기기가 하나만 연결되어 있다면 아래 명령어만 실행해도 돼요.

shell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5173 tcp:5173

특정 기기를 연결하려면 -s 옵션과 디바이스 아이디를 추가해요.

shell
adb -s {디바이스아이디} reverse tcp:8081 tcp:8081
# 예시: adb -s R3CX30039GZ reverse tcp:8081 tcp:8081
adb -s {디바이스아이디} reverse tcp:5173 tcp:5173
# 예시: adb -s R3CX30039GZ reverse tcp:5173 tcp:5173

연결 상태 확인하기

연결된 기기와 포트를 확인하려면 아래 명령어를 사용하세요.

shell
adb reverse --list
# 연결된 경우 예시: UsbFfs tcp:8081 tcp:8081

특정 기기를 확인하려면 -s 옵션을 추가해요.

shell
adb -s {디바이스아이디} reverse --list
# 예시: adb -s R3CX30039GZ reverse --list

# 연결된 경우 예시: UsbFfs tcp:8081 tcp:8081
1. 앱인토스 샌드박스 앱에서 스킴을 실행하세요. 예를 들어, 서비스 이름이 kingtoss라면 intoss://kingtoss를 입력하고 실행 버튼을 누르세요.
1. Metro 서버가 실행 중이라면 실기기 또는 에뮬레이터와 자동으로 연결돼요. 화면 상단에 번들링 프로세스가 진행 중이면 연결이 완료된 거예요.

아래는 Android 시뮬레이터에서 로컬 서버를 연결한 후 "Welcome!" 페이지를 표시하는 예시예요.

### 자주 쓰는 adb 명령어(Android)
​

개발 중에 자주 쓰는 adb 명령어를 정리했어요.

#### 연결 끊기
​

```
adb kill-server
```

#### 8081 포트 연결하기
​

```
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5173 tcp:5173
# 특정 기기 연결: adb -s {디바이스아이디} reverse tcp:8081 tcp:8081
```

#### 연결 상태 확인하기
​

```
adb reverse --list
# 특정 기기 확인: adb -s {디바이스아이디} reverse --list
```

## 토스앱에서 테스트하기
​

토스앱에서 테스트하는 방법은 토스앱 문서를 참고하세요.

## 출시하기
​

출시하는 방법은 미니앱 출시 문서를 참고하세요.
