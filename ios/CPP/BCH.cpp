//
//  BCH.cpp
//  visioncamera
//
//  Created by 한승훈 on 2/4/26.
//
#include "BCH.hpp"
#include <iostream>
#include <algorithm>

// 로그용
#include <bitset>

BCH::BCH(int t_val) : m(8), n(255), t(t_val) {
    init_galois();
}

void BCH::init_galois() {
    alpha_to.assign(n + 1, 0);
    index_of.assign(n + 1, -1);
    
    int p_poly = 285; // x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
    int v = 1;
    
    for (int i = 0; i < n; i++) {
        alpha_to[i] = v;
        index_of[v] = i;
        
        v <<= 1; // x를 곱함
        if (v & 256) { // x^8 항이 발생하면 원시 다항식으로 나눔 (XOR)
            v ^= p_poly;
        }
    }
    
    // 순환성을 위해 n번째에 0번째 값을 넣어줌 (alpha^255 = alpha^0 = 1)
    alpha_to[n] = alpha_to[0];
    index_of[0] = -1;
}

int BCH::gf_mul(int a, int b) {
    if (a == 0 || b == 0) return 0;
    return alpha_to[(index_of[a] + index_of[b]) % n];
}

int BCH::gf_inv(int a) {
    if (a == 0) return 0;
    return alpha_to[n - index_of[a]];
}

std::vector<int> BCH::compute_syndrome(const std::vector<unsigned char>& data) {
    std::vector<int> s(2 * t + 1, 0);
    
    for (int j = 1; j <= 2 * t; j++) {
        int result = 0;
        int bit_count = 0;
        for (size_t i = 0; i < data.size(); i++) {
            unsigned char byte = data[i];
            for (int k = 7; k >= 0; k--) {
                if (bit_count >= 255) break;
                int bit = (byte >> k) & 1;
                if (bit) {
                    int power = (j * bit_count) % n;
                    result ^= alpha_to[power];
                }
                bit_count++;
            }
        }
        s[j] = result;
    }
    return s;
}

std::vector<unsigned char> BCH::recover(const std::vector<unsigned char>& noisy_data, const std::vector<int>& saved_syndromes) {
    // --- 비트 확인 로그 추가 ---
    printf("[C++] 입력된 Noisy 데이터 비트스트링:\n");
    for (size_t i = 0; i < noisy_data.size(); i++) {
        std::string bits = std::bitset<8>(noisy_data[i]).to_string();
        printf("%s", bits.c_str()); 
    }
    printf("\n----------------------------\n");
    // -----------------------
    
    std::vector<int> s_prime = compute_syndrome(noisy_data);
    std::vector<int> s(2 * t + 1, 0);
    bool has_error = false;
    
    int syndrome_size = std::min((int)s_prime.size(), (int)saved_syndromes.size());
    for (int i = 1; i < syndrome_size && i <= 2 * t; i++) {
        s[i] = s_prime[i] ^ saved_syndromes[i];
        if (s[i] != 0) has_error = true;
    }

    if (!has_error) return noisy_data;
    // 2. Berlekamp-Massey 알고리즘
    std::vector<int> sigma(t + 1, 0), old_sigma(t + 1, 0);
    sigma[0] = 1;
    old_sigma[0] = 1;
    
    int L = 0;
    int m_val = 1;
    int b = 1;

    for (int r = 1; r <= 2 * t; r++) {
        int d = s[r];
        for (int i = 1; i <= L; i++) {
            d ^= gf_mul(sigma[i], s[r - i]);
        }

        if (d != 0) {
            std::vector<int> T = sigma;
            int scale = gf_mul(d, gf_inv(b));
            
            for (int i = 0; i <= t; i++) {
                if (i + m_val <= t && i < (int)old_sigma.size()) {
                    sigma[i + m_val] ^= gf_mul(scale, old_sigma[i]);
                }
            }

            if (2 * L <= r - 1) {
                L = r - L;
                old_sigma = T;
                b = d;
                m_val = 1;
            } else {
                m_val++;
            }
        } else {
            m_val++;
        }
    }

    // 3. Chien Search
    std::vector<unsigned char> recovered = noisy_data;
    int max_bits = (int)noisy_data.size() * 8; 
    int error_count = 0;

    for (int i = 0; i < n; i++) {
        int eval = 0;
        for (int j = 0; j <= L; j++) {
            if (sigma[j] != 0) {
                eval ^= alpha_to[(index_of[sigma[j]] + j * (n - i)) % n];
            }
        }
        
        if (eval == 0) {
            if (i < max_bits) {
                int byte_idx = i / 8;
                int bit_offset = 7 - (i % 8);

                recovered[byte_idx] ^= (1 << bit_offset);
                error_count++;
            }
        }
    }
     // --- 비트 확인 로그 추가 ---
    printf("[C++] 복구된 결과 데이터 비트스트링:\n");
    for (size_t i = 0; i < recovered.size(); i++) {
        // bitset을 사용하여 8비트씩 2진수로 출력
        std::string bits = std::bitset<8>(recovered[i]).to_string();
        printf("%s", bits.c_str());
    }
    printf("\n----------------------------\n");
    // -----------------------
    printf("[C++] 정정된 비트 수: %d\n", error_count);
    return recovered;
}