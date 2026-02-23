import {Buffer} from 'buffer';
import CryptoJS from 'crypto-js';
import {NativeModules} from 'react-native';

const {BCHModule} = NativeModules;

export async function Reproducer(faceBinaryString: string, P: string) {
  // 1. P(Helper Data) 분해 => s(Saved Syndrome), x(Salt/Seed)
  const [s_hex, x_hex] = P.split('||');

  const w_noisy = binaryStringToBuffer(faceBinaryString);
  const w_noisy_hex = w_noisy.toString('hex');

  // 2. Secure Sketch Recovery => 원본 w 복구
  // const w_recovered_hex = await Secure_Sketch_Recovery(faceBinaryString, s_hex);
  const w_recovered_hex = await Secure_Sketch_Recovery(w_noisy_hex, s_hex);

  // 3. Strong Extractor => 최종 키 R 추출
  const R_recovered = Strong_Extractor(w_recovered_hex, x_hex);

  console.log('[Reproducer] 복구된 키 R', R_recovered);

  return R_recovered;
}

export async function Secure_Sketch_Recovery(
  // faceBinaryString: string,
  w_noisy_hex: string,
  s_hex: string,
) {
  const saved_syndromes = hexToSyndromeArray(s_hex);

  // 모듈 데이터 확인용 로그
  console.log('[Recover] C++로 넘어가는 데이터', w_noisy_hex, saved_syndromes);
  try {
    const recovered_hex = await BCHModule.recover(
      // faceBinaryString,
      w_noisy_hex,
      saved_syndromes,
    );
    return recovered_hex;
  } catch (e) {
    console.error('복구 실패: 에러가 정정 범위를 벗어났습니다.', e);
    throw e;
  }
}

export function Strong_Extractor(w_hex: string, x_hex: string) {
  return CryptoJS.HmacSHA256(w_hex, x_hex).toString();
}

// 헬퍼 함수: Hex 문자열을 신드롬 정수 배열로 변환
const hexToSyndromeArray = (hex: string): number[] => {
  const arr: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    arr.push(parseInt(hex.substr(i, 2), 16));
  }

  // C++ recover 함수가 s[1]부터 saved_syndromes[1]을 참조하므로,
  // JS 배열의 0번째는 반드시 0(더미)이어야 합니다.
  if (arr[0] !== 0) {
    return [0, ...arr];
  }
  return arr;
};

const binaryStringToBuffer = (str: string): Buffer => {
  // 패딩 추가
  const paddedStr = str.padStart(255, '0');

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      const bitIdx = i * 8 + j;
      if (bitIdx < 255) {
        if (paddedStr[bitIdx] === '1') {
          byte |= 1 << (7 - j);
        }
      }
    }
    bytes[i] = byte;
  }
  return Buffer.from(bytes);
};
