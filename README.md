# **ReactNative 와 react-native-vision-camera를 이용한 Mobile Face Net 구현**

## 사용 라이브러리

- `react-native`: `0.79.5`
- `react-native-vision-camera`: `4.7.2`
- `react-native-worklets-core`: `1.6.2`
- `@shopify/react-native-skia`: `2.2.19`
- `react-native-reanimated`: `~3.17.4`
- `@react-native-firebase`: `^22.2.1`

stack navigation 관련 패키지

- npm install @react-navigation/stack
- npm install react-native-gesture-handler @react-native-masked-view/masked-view
- `npm install react-native-screens@4.14.1`
- npm install react-native-safe-area-context (이거 안하면 unimplement 에러 뜸)

### 참고사항

Face Detector 는 ios 15.5 이상만 지원하기 때문에 podfile에서 최소 지원 버전을 15.5로 수정해야함

```jsx
platform: ios, '15.5';
```

worklet과 reanimated 패키지를 사용하려면 bable.config.js를 다음과 같이 수정해야함

```jsx
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'react-native-worklets-core/plugin',
    'react-native-reanimated/plugin',
  ],
};
```

Property not found : \_Worklet 에러 해결을 위한 참고 : https://github.com/software-mansion/react-native-reanimated/issues/7075

## 사용 모델

참고 : https://modelnova.ai/models/details/mobile-facenet-face-recognition/visualize

패키지

- npm install react-native-fast-tflite
- npm install vision-camera-resize-plugin

### 참고사항

.tflite 파일 인식을 위해 metro.config.js파일을 다음과 같이 수정

```jsx
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const {assetExts, sourceExts} = defaultConfig.resolver;

const config = {
  resolver: {
    // 기존 자산 확장자에 'tflite'를 추가합니다.
    assetExts: [...assetExts, 'tflite'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
```
