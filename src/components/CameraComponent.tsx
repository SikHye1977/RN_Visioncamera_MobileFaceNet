import React, {useEffect, useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {Face, useFaceDetector} from 'react-native-vision-camera-face-detector';
import {Worklets} from 'react-native-worklets-core';

// 🎛️ 사용자 보정값 설정
// 박스가 아래에 있다면 이 값을 마이너스(-)로 더 크게 하세요. (예: -50, -80)
// 반대로 박스가 너무 위에 있다면 플러스(+) 값을 넣으세요.
const VERTICAL_OFFSET = -50;
const HORIZONTAL_OFFSET = 0; // 좌우가 안 맞으면 이것도 조절 가능

const CameraComponent = () => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
  }>({faces: [], frameWidth: 0, frameHeight: 0});

  const {detectFaces} = useFaceDetector({
    performanceMode: 'fast',
    contourMode: 'none',
    landmarkMode: 'none',
    classificationMode: 'none',
  });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  const handleFacesDetectedJS = Worklets.createRunOnJS(
    (faces: Face[], width: number, height: number) => {
      setFaceData({faces, frameWidth: width, frameHeight: height});
    },
  );

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      const detectedFaces = detectFaces(frame);
      handleFacesDetectedJS(detectedFaces, frame.width, frame.height);
    },
    [handleFacesDetectedJS],
  );

  if (!hasPermission) return <Text>권한이 필요합니다.</Text>;
  if (device == null) return <Text>카메라가 없습니다.</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        resizeMode="cover"
      />

      {faceData.faces.map((face, index) => {
        const {bounds} = face;
        const {frameWidth, frameHeight} = faceData;

        if (frameWidth === 0 || frameHeight === 0) return null;

        // --- 좌표 계산 ---
        const sensorRotatedWidth = frameHeight;
        const sensorRotatedHeight = frameWidth;

        const scaleX = windowWidth / sensorRotatedWidth;
        const scaleY = windowHeight / sensorRotatedHeight;
        const scale = Math.max(scaleX, scaleY);

        const scaledSensorWidth = sensorRotatedWidth * scale;
        const scaledSensorHeight = sensorRotatedHeight * scale;

        const offsetX = (scaledSensorWidth - windowWidth) / 2;
        const offsetY = (scaledSensorHeight - windowHeight) / 2;

        let finalX = bounds.y * scale - offsetX;
        let finalY = bounds.x * scale - offsetY;
        let finalWidth = bounds.height * scale;
        let finalHeight = bounds.width * scale;

        if (device.position === 'front') {
          finalX = windowWidth - finalX - finalWidth;
        }

        // --- 🎛️ 보정값 적용 ---
        finalY = finalY + VERTICAL_OFFSET;
        finalX = finalX + HORIZONTAL_OFFSET;

        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              borderColor: '#00FF00', // 잘 보이게 밝은 녹색으로 변경
              borderWidth: 3,
              left: finalX,
              top: finalY,
              width: finalWidth,
              height: finalHeight,
              zIndex: 100,
            }}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'black'},
});

export default CameraComponent;
