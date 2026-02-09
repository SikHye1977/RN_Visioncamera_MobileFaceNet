//
//  BCHModule.m
//  visioncamera
//
//  Created by 한승훈 on 2/5/26.
//
#import <React/RCTBridgeModule.h>
#import "BCH.hpp"
#include <vector>
#include <sstream>
#include <iomanip>

// 1. 헬퍼 함수들은 그대로 유지
std::vector<unsigned char> hexToBytes(NSString *hexStr) {
    std::string hex = [hexStr UTF8String];
    std::vector<unsigned char> bytes;
    for (unsigned int i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char)strtol(byteString.c_str(), NULL, 16);
        bytes.push_back(byte);
    }
    return bytes;
}

NSString* bytesToHex(const std::vector<unsigned char>& bytes) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < bytes.size(); ++i) {
        ss << std::setw(2) << (int)bytes[i];
    }
    return [NSString stringWithUTF8String:ss.str().c_str()];
}

// 2. [수정됨] 클래스 인터페이스 선언 (Swift용 매크로 대신 정석 문법 사용)
@interface BCHModule : NSObject <RCTBridgeModule>
@end

// 3. [수정됨] 클래스 구현 시작
@implementation BCHModule

// 이 매크로가 있어야 React Native에서 모듈을 인식합니다.
RCT_EXPORT_MODULE();

// --- 메서드 구현 ---

RCT_EXPORT_METHOD(generateSyndrome:(NSString *)hexW
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    try {
        BCH bch(15);
        std::vector<unsigned char> w = hexToBytes(hexW);
        std::vector<int> s = bch.compute_syndrome(w);
        
        NSMutableArray *resultArr = [NSMutableArray array];
        for(int val : s) {
            [resultArr addObject:@(val)];
        }
        resolve(resultArr);
    } catch (...) {
        reject(@"ERR", @"C++ Error", nil);
    }
}

RCT_EXPORT_METHOD(recover:(NSString *)hexWPrime
                  savedSyndromes:(NSArray *)sArray
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    try {
        BCH bch(15);
        std::vector<unsigned char> w_prime = hexToBytes(hexWPrime);
        
        std::vector<int> saved_s;
        for (NSNumber *n in sArray) {
            saved_s.push_back([n intValue]);
        }
        
        std::vector<unsigned char> recovered = bch.recover(w_prime, saved_s);
        
        resolve(bytesToHex(recovered));
    } catch (...) {
        reject(@"ERR", @"Recovery Error", nil);
    }
}

@end
