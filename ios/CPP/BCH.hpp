//
//  BCH.hpp
//  visioncamera
//
//  Created by 한승훈 on 2/4/26.
//

#ifndef BCH_hpp
#define BCH_hpp

#include <stdio.h>
#include <vector>
#include <iostream>
#include <string>
#include <cmath>

class BCH{
public:
  BCH(int t = 15);
  
  // calculate syndrome
  std::vector<int> compute_syndrome(const std::vector<unsigned char>& data);
  
  // recover s to origin input data w
  std::vector<unsigned char> recover(const std::vector<unsigned char>& noisy_data, const std::vector<int>& saved_syndromes);
  
private:
  int m, n, t;
  std::vector<int> alpha_to;
  std::vector<int> index_of;
  
  void init_galois();
  int gf_mul(int a, int b);
  int gf_inv(int a);
};

#endif /* BCH_hpp */
