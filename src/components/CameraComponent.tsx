import React, {useEffect, useRef, useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {useIsFocused} from '@react-navigation/native'; // 화면 포커스 감지용

const CameraComponent = () => {
  // 1. 전면 카메라 기기 가져오기 ('front')
  const device = useCameraDevice('front');

  // 2. 권한 상태 관리
  const {hasPermission, requestPermission} = useCameraPermission();

  // 3. 네비게이션 포커스 상태 (화면을 벗어나면 카메라 끄기 위해)
  const isFocused = useIsFocused();

  // 4. 카메라 제어용 Ref (사진 촬영 시 필요)
  const camera = useRef<Camera>(null);

  // 초기 권한 요청
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // 권한이 없을 때 보여줄 화면
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>카메라 권한이 필요합니다.</Text>
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={styles.link}>설정으로 이동</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 기기가 없을 때 (예: 시뮬레이터)
  if (device == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>카메라 장치를 찾을 수 없습니다.</Text>
        <Text style={styles.subText}>
          (시뮬레이터에서는 작동하지 않습니다. 실물 기기로 테스트하세요.)
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill} // 전체 화면 채우기
        device={device}
        isActive={isFocused} // 화면이 보일 때만 카메라 활성화
        photo={true} // 사진 촬영 기능 활성화
      />

      {/* 촬영 버튼 UI 예시 */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={async () => {
            try {
              const photo = await camera.current?.takePhoto();
              console.log('찍은 사진 경로:', photo?.path);
            } catch (e) {
              console.error('촬영 실패:', e);
            }
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
  },
  subText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  link: {
    color: '#007AFF',
    fontSize: 18,
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    borderWidth: 4,
    borderColor: 'gray',
  },
});

export default CameraComponent;
