import {Buffer} from 'buffer';
import CryptoJS from 'crypto-js';
import {ReedSolomon} from '../misc/ReedSolomon';

// Set Parameter
const DATA_LEN = 16;
const EC_LEN = 12; // Parity Length
const SEED_LEN = 16;

// RS엔진 초기화 (전체 길이 = 데이터 16 + 패리티 12)
const rs = new ReedSolomon(DATA_LEN + EC_LEN, EC_LEN);

export function Generator(faceBinaryString: string) {
  const w = binaryStringToBuffer(faceBinaryString);
  const s = Secure_Sketch(w);

  const {x_hex, R} = Strong_Randomness_Extractor(w);

  const s_hex = s.toString('hex');
  const P = s_hex + x_hex;

  return {
    helperData: P,
    key: R,
  };
}

export function Secure_Sketch(w: Buffer) {
  const encoded = rs.encode(w);
  const s = encoded.slice(DATA_LEN);

  return s;
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
