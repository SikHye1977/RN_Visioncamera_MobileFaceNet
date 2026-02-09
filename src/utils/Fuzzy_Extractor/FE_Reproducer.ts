import {Buffer} from 'buffer';
import CryptoJS from 'crypto-js';
import {NativeModules} from 'react-native';

const {BCHModule} = NativeModules;

const T_VALUE = 12;

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

export function Strong_Extractor(w_hex: string, x_hex: string) {
  return CryptoJS.HmacSHA256(w_hex, x_hex).toString();
}

// 헬퍼 함수: Hex 문자열을 신드롬 정수 배열로 변환
const hexToSyndromeArray = (hex: string): number[] => {
  const arr: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    arr.push(parseInt(hex.substr(i, 2), 16));
  }
  // C++ compute_syndrome 결과인 s[0]~s[2t] 형태에 맞춰야 함
  // s[0]은 보통 사용하지 않으므로 앞에 0을 추가하거나 조정 필요
  return [0, ...arr];
};
