//
//  BCH.cpp
//  visioncamera
//
//  Created by 한승훈 on 2/4/26.
//
#include "BCH.hpp"
#include <iostream>
#include <algorithm>

BCH::BCH(int t_val) : m(8), n(255), t(t_val) {
    init_galois();
}

void BCH::init_galois() {
    alpha_to.resize(n + 1);
    index_of.resize(n + 1);
    
    int mask = 1;
    alpha_to[m] = 0;
    for (int i = 0; i < m; i++) {
        alpha_to[i] = mask;
        index_of[alpha_to[i]] = i;
        if (i < m - 1) alpha_to[m] ^= mask;
        mask <<= 1;
    }
    index_of[alpha_to[m]] = m;
    mask >>= 1;
    for (int i = m + 1; i <= n; i++) {
        if (alpha_to[i - 1] >= mask)
            alpha_to[i] = alpha_to[i - 1] << 1 ^ 285; // 0x11d
        else
            alpha_to[i] = alpha_to[i - 1] << 1;
        index_of[alpha_to[i]] = i;
    }
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
    std::vector<int> s_prime = compute_syndrome(noisy_data);
    std::vector<int> s(2 * t + 1, 0);
    bool has_error = false;
    
    // 신드롬 배열 크기 체크 (Index out of bounds 방지)
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
            
            // ✨ [수정] 인덱스 범위 초과 방지 로직 강화
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
    int max_bits = (int)recovered.size() * 8; // 실제 데이터 비트 길이

    for (int i = 0; i < n && i < max_bits; i++) {
        int eval = 0;
        for (int j = 0; j <= L && j <= t; j++) {
            eval ^= gf_mul(sigma[j], alpha_to[(j * i) % n]);
        }
        
        if (eval == 0) {
            int byte_idx = i / 8;
            int bit_offset = 7 - (i % 8);
            
            // ✨ [수정] 벡터 범위 내에 있을 때만 비트 반전 수행
            if (byte_idx >= 0 && byte_idx < (int)recovered.size()) {
                recovered[byte_idx] ^= (1 << bit_offset);
            }
        }
    }

    return recovered;
}
