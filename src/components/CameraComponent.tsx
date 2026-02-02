import React, {useEffect, useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {Face, useFaceDetector} from 'react-native-vision-camera-face-detector';
import {Worklets} from 'react-native-worklets-core';
import {useTensorflowModel} from 'react-native-fast-tflite';
import {useResizePlugin} from 'vision-camera-resize-plugin';

// 🎛️ UI 보정값
const VERTICAL_OFFSET = -50;
const HORIZONTAL_OFFSET = 0;

const CameraComponent = () => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  // 1. TFLite 모델 로드
  const objectDetection = useTensorflowModel(
    require('../assets/MobileFaceNet_new_latest_int8.tflite'),
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  const {resize} = useResizePlugin();

  // 2. 상태 관리
  // isCaptured: 얼굴을 찾아서 멈췄는지 여부
  const [isCaptured, setIsCaptured] = useState(false);

  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
    keyString: string;
  }>({faces: [], frameWidth: 0, frameHeight: 0, keyString: ''});

  const {detectFaces} = useFaceDetector({
    performanceMode: 'fast',
    contourMode: 'none',
    landmarkMode: 'none',
    classificationMode: 'none',
  });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // 3. 데이터 처리 및 캡처 확정 (JS 스레드)
  const handleCaptureJS = Worklets.createRunOnJS(
    (faces: Face[], w: number, h: number, key: string) => {
      // 이미 캡처된 상태라면 무시 (중복 실행 방지)
      if (key && key.length > 0) {
        setFaceData({faces, frameWidth: w, frameHeight: h, keyString: key});
        setIsCaptured(true); // 카메라 정지!
      }
    },
  );

  // 4. 프레임 프로세서
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      const faces = detectFaces(frame);

      // 얼굴이 있고, 모델이 로드되었을 때만 실행
      if (faces.length > 0 && model != null) {
        const face = faces[0];

        // 좌표 보정 (Crash 방지)
        const x = Math.max(0, face.bounds.x);
        const y = Math.max(0, face.bounds.y);
        const width = Math.min(face.bounds.width, frame.width - x);
        const height = Math.min(face.bounds.height, frame.height - y);

        if (width <= 0 || height <= 0) return;

        // 리사이즈
        const resized = resize(frame, {
          scale: {
            width: 112,
            height: 112,
          },
          pixelFormat: 'rgb',
          dataType: 'uint8',
          crop: {
            x: x,
            y: y,
            width: width,
            height: height,
          },
        });

        // uint8 데이터를 int8 데이터로 변환
        // 0~255 범위의 값을 -128~127 범위로 이동 (Pixel - 128)
        const inputData = new Int8Array(resized.length);
        for (let i = 0; i < resized.length; i++) {
          inputData[i] = resized[i] - 128;
        }

        // D. 모델 실행
        const output = model.runSync([inputData]); //

        // E. 결과 추출
        const embedding = output[0];

        // E. 키 추출 성공 시
        if (embedding) {
          const vectorValues = Array.from(embedding as any) as number[];
          const extractedKey = vectorValues
            .slice(0, 5)
            .map((v: number) => v.toFixed(3))
            .join(', ');

          // embedding vector 확인용 로그
          console.log(embedding);

          // 키가 추출되었으면 즉시 JS로 보내고 멈춤 요청
          handleCaptureJS(faces, frame.width, frame.height, extractedKey);
        }
      }
    },
    [handleCaptureJS, model, resize],
  );

  // 재시작 함수
  const resetScan = () => {
    setIsCaptured(false);
    setFaceData({faces: [], frameWidth: 0, frameHeight: 0, keyString: ''});
  };

  if (!hasPermission) return <Text>권한이 필요합니다.</Text>;
  if (device == null) return <Text>카메라가 없습니다.</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isCaptured}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        resizeMode="cover"
      />

      {faceData.faces.map((face, index) => {
        const {bounds} = face;
        const {frameWidth, frameHeight} = faceData;
        if (frameWidth === 0 || frameHeight === 0) return null;

        const sensorRotatedWidth = frameHeight;
        const sensorRotatedHeight = frameWidth;
        const scaleX = windowWidth / sensorRotatedWidth;
        const scaleY = windowHeight / sensorRotatedHeight;
        const scale = Math.max(scaleX, scaleY);

        const scaledSensorWidth = sensorRotatedWidth * scale;
        const offsetX = (scaledSensorWidth - windowWidth) / 2;
        const offsetY = (sensorRotatedHeight * scale - windowHeight) / 2;

        let finalX = bounds.y * scale - offsetX;
        let finalY = bounds.x * scale - offsetY;
        let finalWidth = bounds.height * scale;
        let finalHeight = bounds.width * scale;

        if (device.position === 'front') {
          finalX = windowWidth - finalX - finalWidth;
        }

        finalY += VERTICAL_OFFSET;
        finalX += HORIZONTAL_OFFSET;

        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              borderColor: isCaptured ? '#00FFFF' : '#00FF00',
              borderWidth: 3,
              left: finalX,
              top: finalY,
              width: finalWidth,
              height: finalHeight,
              zIndex: 10,
            }}
          />
        );
      })}

      <View style={styles.infoOverlay}>
        <Text style={styles.infoTitle}>
          {isCaptured ? '✅ 인식 완료 (멈춤)' : '👤 얼굴 인식 중...'}
        </Text>

        {isCaptured && (
          <View style={{alignItems: 'center'}}>
            <Text style={styles.infoLabel}>추출된 키값:</Text>
            <Text style={styles.infoValue}>[{faceData.keyString}, ...]</Text>

            {/* 다시 찍기 버튼 */}
            <TouchableOpacity onPress={resetScan} style={styles.retryButton}>
              <Text style={styles.retryText}>🔄 다시 스캔하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'black'},
  infoOverlay: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 5,
  },
  infoValue: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default CameraComponent;
