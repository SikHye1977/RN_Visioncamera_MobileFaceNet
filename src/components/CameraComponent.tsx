import React, {useEffect, useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  TouchableOpacity,
  ScrollView,
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
  const [isCaptured, setIsCaptured] = useState(false);

  // ✨ 변경: binaryCode 필드 추가
  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
    keyString: string;
    binaryCode: string; // 이진화된 코드 저장
  }>({
    faces: [],
    frameWidth: 0,
    frameHeight: 0,
    keyString: '',
    binaryCode: '',
  });

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
  // ✨ 변경: binary 인자 추가
  const handleCaptureJS = Worklets.createRunOnJS(
    (faces: Face[], w: number, h: number, key: string, binary: string) => {
      // 이미 캡처된 상태라면 무시
      if (key && key.length > 0) {
        setFaceData({
          faces,
          frameWidth: w,
          frameHeight: h,
          keyString: key,
          binaryCode: binary, // 이진 코드 저장
        });
        setIsCaptured(true); // 카메라 정지
      }
    },
  );

  // 4. 프레임 프로세서
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      const faces = detectFaces(frame);

      if (faces.length > 0 && model != null) {
        const face = faces[0];

        // 좌표 보정
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

        // uint8 -> int8 변환 (MobileFaceNet 입력 정규화)
        const inputData = new Int8Array(resized.length);
        for (let i = 0; i < resized.length; i++) {
          inputData[i] = resized[i] - 128;
        }

        // D. 모델 실행
        const output = model.runSync([inputData]);
        const embedding = output[0]; // Int8Array or Float32Array

        // E. 키 추출 및 이진화
        if (embedding) {
          // 1) 화면 표시용 앞 5자리 (기존 로직 유지)
          // TypedArray는 바로 map을 쓸 수 없거나 worklet 환경 특성을 고려하여 루프로 처리할 수도 있음
          // 여기선 간단히 Array.from 사용 (성능이 중요하다면 직접 루프 권장)
          const vectorValues = Array.from(embedding as any) as number[];
          const extractedKey = vectorValues
            .slice(0, 5)
            .map((v: number) => v.toFixed(3))
            .join(', ');

          // ✨ 2) 이진화 (Binarization) 로직 추가
          // Threshold: 0 (0보다 크거나 같으면 1, 아니면 0)
          let binaryStr = '';
          // embedding은 TypedArray이므로 length 프로퍼티가 있습니다.
          // @ts-ignore
          const len = embedding.length;
          for (let i = 0; i < len; i++) {
            // @ts-ignore
            const val = embedding[i];
            binaryStr += val >= 0 ? '1' : '0';
          }

          console.log(`Binary Length: ${binaryStr.length}`); // 128이어야 함]
          console.log(`Binary String: ${binaryStr}`);

          // JS 스레드로 전달
          handleCaptureJS(
            faces,
            frame.width,
            frame.height,
            extractedKey,
            binaryStr,
          );
        }
      }
    },
    [handleCaptureJS, model, resize],
  );

  const resetScan = () => {
    setIsCaptured(false);
    setFaceData({
      faces: [],
      frameWidth: 0,
      frameHeight: 0,
      keyString: '',
      binaryCode: '',
    });
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

      {/* 얼굴 박스 그리기 로직 (기존과 동일) */}
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
          {isCaptured ? '✅ 인식 완료' : '👤 얼굴 인식 중...'}
        </Text>

        {isCaptured && (
          <View style={{width: '100%', alignItems: 'center'}}>
            <Text style={styles.infoLabel}>미리보기 (Vector):</Text>
            <Text style={styles.infoValue}>[{faceData.keyString}, ...]</Text>

            <Text style={styles.infoLabel}>생성된 이진 코드 (Binary):</Text>
            <ScrollView
              style={styles.binaryScroll}
              horizontal={false}
              nestedScrollEnabled={true}>
              <Text style={styles.binaryValue}>{faceData.binaryCode}</Text>
            </ScrollView>

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
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    maxHeight: 300, // 오버레이 최대 높이 제한
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
    alignSelf: 'flex-start',
  },
  infoValue: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  binaryScroll: {
    width: '100%',
    height: 60, // 스크롤 영역 높이
    backgroundColor: '#222',
    borderRadius: 8,
    marginVertical: 10,
    padding: 5,
  },
  binaryValue: {
    color: '#00FFFF', // Cyan color for binary
    fontSize: 12,
    letterSpacing: 1, // 비트 간격 넓히기
    fontFamily: 'Courier', // 고정폭 글꼴 권장 (기기에 따라 다를 수 있음)
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default CameraComponent;
