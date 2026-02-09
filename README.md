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

## Fuzzy Extractor 구현

### 구현 리스트

- Generator
  - Secure Sketch
  - Strong Randomness Extractor
- Reproducer
  - Secure Sketch Recovery
  - Strong Extractor

### Generator

입력값

- 데이터 w

다음 두가지로 구성됨

- Secure Sketch
  - 입력 데이터 w에 parity check matrix H를 곱해 스케치 s를 생성
- Strong Randomness Extractor
  - Seed X를 이용해 Universal Hash 에서 특정 Hash함수 Hx를 뽑아냄
  - w를 Hx에 넣어 키 R 생성

최종적으로 Generator는 생성된 Sketch s와 Seed x를 결합한 Helper Data H와 키 R을 반환

Generator 코드

```ts
export async function Generator(faceBinaryString: string) {
  try {
    // 1. 입력 데이터 준비 (Binary String -> Buffer -> Hex String)
    const w = binaryStringToBuffer(faceBinaryString);
    const w_hex = w.toString('hex');

    console.log('[Gen] C++ BCH 모듈 호출 중...');

    // 2. Secure Sketch (C++ 네이티브 호출)
    const s_array = await Secure_Sketch(w_hex);

    console.log('[Gen] 생성된 신드롬:', s_array);

    // 3. Strong Randomness Extractor (키 R 및 시드 x 생성)
    const {x_hex, R} = Strong_Randomness_Extractor(w);

    // 4. Helper Data (P) 생성
    const s_string = JSON.stringify(s_array);
    const P = s_string + '||' + x_hex;

    return {
      helperData: P,
      key: R,
    };
  } catch (e) {
    console.error('[Gen] 생성 실패:', e);
    throw e;
  }
}
```

secure sketch 코드

```ts
export async function Secure_Sketch(w_hex: string): Promise<string> {
  return await BCHModule.generateSyndrome(w_hex);
}
```

strong randomness extractor 코드

```ts
export function Strong_Randomness_Extractor(w: Buffer) {
  const x_wordArray = CryptoJS.lib.WordArray.random(SEED_LEN);
  const x_hex = x_wordArray.toString(CryptoJS.enc.Hex);

  const w_hex = w.toString('hex');
  const R = CryptoJS.HmacSHA256(w_hex, x_hex).toString();

  return {x_hex, R};
}

const binaryStringToBuffer = (str: string): Buffer => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 8) {
    bytes.push(parseInt(str.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
};
```

### Reproducer

입력값

- 노이즈가 낀 입력 데이터 w'
- Helper Data H

Reproducer는 Helper Data H를 Sketch s와 Seed x로 분해

이후 작업은 다음 두가지로 구성됨

- Secure Sketch Recovery
  - 노이즈가 낀 입력 데이터 w'로부터 원본 데이터 w를 복구함
- Strong Extractor
  - Seed X를 이용해 Universal Hash 에서 특정 Hash함수 Hx를 뽑아냄
  - Secure Sketch Recovery가 복구한 w를 Hx에 넣어 키 R 생성

최종적으로 Reproducer는 키 R을 반환

Reproducer 코드

```ts
export async function Reproducer(faceBinaryString: string, P: string) {
  // 1. P(Helper Data) 분해 => s(Saved Syndrome), x(Salt/Seed)
  const splitPoint = T_VALUE * 2 * 2;

  const s_hex = P.substring(0, splitPoint);
  const x_hex = P.substring(splitPoint);

  // 2. Secure Sketch Recovery => 원본 w 복구
  const w_recovered_hex = await Secure_Sketch_Recovery(faceBinaryString, s_hex);

  // 3. Strong Extractor => 최종 키 R 추출
  const R_recovered = Strong_Extractor(w_recovered_hex, x_hex);

  return R_recovered;
}
```

Secure Sketch Recovery 코드

```ts
export async function Secure_Sketch_Recovery(
  faceBinaryString: string,
  s_hex: string,
) {
  const saved_syndromes = hexToSyndromeArray(s_hex);

  try {
    const recovered_hex = await BCHModule.recover(
      faceBinaryString,
      saved_syndromes,
    );
    return recovered_hex;
  } catch (e) {
    console.error('복구 실패: 에러가 정정 범위를 벗어났습니다.', e);
    throw e;
  }
}
```

Strong Extractor 코드

```ts
export function Strong_Extractor(w_hex: string, x_hex: string) {
  return CryptoJS.HmacSHA256(w_hex, x_hex).toString();
}
```
