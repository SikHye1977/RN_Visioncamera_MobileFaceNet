import {NativeModules} from 'react-native';
import {Buffer} from 'buffer';
import CryptoJS from 'crypto-js';

// 네이티브 모듈 import
const {BCHModule} = NativeModules;

const SEED_LEN = 16;

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
    const s_string = JSON.stringify(s_array); // 배열 -> 문자열 변환
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

export async function Secure_Sketch(w_hex: string): Promise<string> {
  return await BCHModule.generateSyndrome(w_hex);
}

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
