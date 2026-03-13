---
title: "SearchField - Toss Design System | React Native"
source: "https://tossmini-docs.toss.im/tds-react-native/components/search-field/"
---

# SearchField - Toss Design System | React Native

> 원본: https://tossmini-docs.toss.im/tds-react-native/components/search-field/

## SearchField

SearchField 컴포넌트는 검색 기능을 제공하는 입력 필드예요. 검색 아이콘과 클리어 버튼이 포함되어 있어 사용자가 쉽게 검색어를 입력하고 지울 수 있어요.

### 기본 사용

SearchField를 사용하려면 기본 속성만 지정하면 돼요.

```
<SearchField
  placeholder="검색어를 입력하세요"
  value={searchText}
  onChange={(e) => setSearchText(e.nativeEvent.text)}
/>
```

### 클리어 버튼

hasClearButton 속성을 사용하면 입력된 텍스트를 쉽게 지울 수 있는 버튼이 표시돼요.

```
<SearchField
  placeholder="검색어를 입력하세요"
  value={searchText}
  onChange={(e) => setSearchText(e.nativeEvent.text)}
  hasClearButton={true}
/>
```

### 자동 포커스

autoFocus 속성을 사용하면 화면이 렌더링될 때 자동으로 포커스가 맞춰져요.

```
<SearchField
  placeholder="검색어를 입력하세요"
  autoFocus={true}
  value={searchText}
  onChange={(e) => setSearchText(e.nativeEvent.text)}
/>
```

### 검색 기능 구현

SearchField를 사용해 실시간 검색 기능을 구현할 수 있어요.

```tsx
const [searchText, setSearchText] = useState('');
const [filteredResults, setFilteredResults] = useState([]);
 
const handleSearch = (text: string) => {
  setSearchText(text);
  // 검색 로직
  const results = data.filter(item =>
    item.name.toLowerCase().includes(text.toLowerCase())
  );
  setFilteredResults(results);
};
 
<SearchField
  placeholder="상품을 검색하세요"
  value={searchText}
  onChange={(e) => handleSearch(e.nativeEvent.text)}
  hasClearButton={true}
/>
```

### 최대 길이 제한

maxLength 속성을 사용해 입력 가능한 최대 문자 수를 제한할 수 있어요.

```
<SearchField
  placeholder="검색어를 입력하세요"
  maxLength={50}
  value={searchText}
  onChange={(e) => setSearchText(e.nativeEvent.text)}
/>
```

### 비활성화

editable 속성을 사용해 검색 필드를 비활성화할 수 있어요.

```
<SearchField
  placeholder="검색어를 입력하세요"
  editable={false}
  value={searchText}
/>
```

#### SearchFieldProps

Accessibility 컴포넌트를 확장하여 제작했어요. Accessibility 컴포넌트의 모든 속성을 사용할 수 있어요.

| 속성 | 기본값 | 타입 |
| --- | --- | --- |
| placeholder | - | string 검색 필드의 플레이스홀더 텍스트를 지정해요. |
| style | - | StyleProp<ViewStyle> 검색 필드의 스타일을 지정해요. |
| hasClearButton | false | false | true 클리어 버튼을 표시할지 여부를 지정해요. |
| defaultValue | - | string 검색 필드의 기본값을 지정해요. |
| value | - | string 검색 필드의 값을 지정해요. |
| onChange | - | (event: { nativeEvent: { text: string; }; }) => void 텍스트가 변경될 때 호출되는 함수예요. |
| keyboardType | - | "default" | "numeric" | "email-address" | "phone-pad" 키보드 타입을 지정해요. |
| maxLength | - | number 최대 입력 길이를 지정해요. |
| autoFocus | - | false | true 자동 포커스 여부를 지정해요. |
| editable | - | false | true 편집 가능 여부를 지정해요. |
