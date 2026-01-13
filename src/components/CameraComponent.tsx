import React, {useEffect, useState} from 'react';
import {StyleSheet, View, Text, TouchableOpacity} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {useFaceDetector} from 'react-native-vision-camera-face-detector';
import {Worklets} from 'react-native-worklets-core'; // 여기를 주목하세요!

const CameraComponent = () => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();
  const [isFaceDetected, setIsFaceDetected] = useState(false);

  // 얼굴 인식 설정
  const {detectFaces} = useFaceDetector({
    performanceMode: 'fast',
    contourMode: 'none',
    landmarkMode: 'none',
    classificationMode: 'none',
  });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // 1. JS 스레드 함수 생성 (Worklets.createRunOnJS 사용)
  // 'detected' 옆에 ': boolean'을 붙여서 빨간 줄 에러를 해결했습니다.
  const handleFaceDetectedJS = Worklets.createRunOnJS((detected: boolean) => {
    setIsFaceDetected(detected);
  });

  // 2. 프레임 프로세서
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      // 이미 인식된 상태라면 연산 건너뛰기 (성능 최적화)
      // 주의: Worklet 안에서는 JS State인 isFaceDetected를 직접 읽지 못할 수 있으므로
      // 여기서는 단순히 얼굴이 있는지만 판단해서 신호를 보냅니다.

      const faces = detectFaces(frame);

      if (faces.length > 0) {
        // 3. 위에서 만든 JS 함수를 "직접" 호출합니다. (runOnJS 불필요)
        handleFaceDetectedJS(true);
      }
    },
    // 의존성 배열에는 Worklet 함수만 넣으면 됩니다.
    [],
  );

  const resetDetection = () => {
    setIsFaceDetected(false);
  };

  if (!hasPermission) return <Text>권한이 필요합니다.</Text>;
  if (device == null) return <Text>카메라가 없습니다.</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        // 얼굴 인식되면 카메라 프리뷰 일시정지
        isActive={!isFaceDetected}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />

      {isFaceDetected && (
        <View style={styles.overlay}>
          <Text style={styles.alertText}>🎉 얼굴 인식됨!</Text>
          <Text style={styles.subText}>촬영이 중단되었습니다.</Text>
          <TouchableOpacity style={styles.button} onPress={resetDetection}>
            <Text style={styles.buttonText}>다시 시작하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'black'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  alertText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  subText: {fontSize: 16, color: 'white', marginBottom: 30},
  button: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {fontSize: 16, fontWeight: 'bold', color: 'black'},
});

export default CameraComponent;
