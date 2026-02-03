import {Buffer} from 'buffer';

export class ReedSolomon {
  private n: number;
  private k: number;
  private gf_log: number[];
  private gf_exp: number[];

  constructor(n: number, k: number) {
    this.n = n; // 전체 길이 (데이터 + 패리티)
    this.k = k; // 패리티 길이 (ECC Length)
    this.gf_log = new Array(256).fill(0);
    this.gf_exp = new Array(512).fill(0);

    // Galois Field 초기화 (GF(2^8))
    let b = 1;
    for (let i = 0; i < 255; i++) {
      this.gf_log[b] = i;
      this.gf_exp[i] = b;
      this.gf_exp[i + 255] = b;
      b = (b << 1) ^ (b & 0x80 ? 0x11d : 0);
    }
    this.gf_log[0] = 0; // log(0)은 정의되지 않지만 편의상
  }

  private gf_mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return this.gf_exp[this.gf_log[a] + this.gf_log[b]];
  }

  private gf_poly_mul(p: number[], q: number[]): number[] {
    const r = new Array(p.length + q.length - 1).fill(0);
    for (let j = 0; j < q.length; j++) {
      for (let i = 0; i < p.length; i++) {
        r[i + j] ^= this.gf_mul(p[i], q[j]);
      }
    }
    return r;
  }

  // 데이터 인코딩 (패리티 생성)
  public encode(msg: Buffer | number[]): Buffer {
    const data = Array.from(msg);
    // Generator Polynomial 생성
    let g = [1];
    for (let i = 0; i < this.k; i++) {
      g = this.gf_poly_mul(g, [1, this.gf_exp[i]]);
    }

    const info = Buffer.concat([Buffer.from(data), Buffer.alloc(this.k)]);
    const msgArr = Array.from(info);

    // 나눗셈을 통한 패리티 계산
    for (let i = 0; i < data.length; i++) {
      const coef = msgArr[i];
      if (coef !== 0) {
        for (let j = 1; j < g.length; j++) {
          msgArr[i + j] ^= this.gf_mul(g[j], coef);
        }
      }
    }

    // 결과: 원본 데이터 + 계산된 패리티(msgArr의 뒷부분)
    // 원본 데이터 뒤에 패리티를 붙여서 반환
    const parity = Buffer.from(msgArr.slice(data.length));
    return Buffer.concat([Buffer.from(data), parity]);
  }

  public decode(encoded: Buffer): Buffer {
    return encoded.slice(0, this.n - this.k);
  }
}
