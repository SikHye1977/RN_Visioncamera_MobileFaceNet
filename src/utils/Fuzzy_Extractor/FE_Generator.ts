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
    const s_raw = await Secure_Sketch(w_hex);
    const s_array = typeof s_raw === 'string' ? JSON.parse(s_raw) : s_raw;
    console.log('[Gen] 생성된 신드롬:', s_array);

    // 3. Strong Randomness Extractor (키 R 및 시드 x 생성)
    const {x_hex, R} = Strong_Randomness_Extractor(w);

    // 4. Helper Data (P) 생성
    const s_hex = s_array
      .map((num: number) => num.toString(16).padStart(2, '0'))
      .join('');
    const P = s_hex + '||' + x_hex;

    console.log('[Generator] 생성된 Helper Data', P);
    console.log('[Generator] 생성된 키 R', R);
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
