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

// ✨ [1] Generator 함수 임포트 (경로를 본인 프로젝트에 맞게 수정하세요)
// 예: src/utils/FE_Generator.ts 에 있다면:
import {Generator} from '../utils/Fuzzy_Extractor/FE_Generator';

// 🎛️ UI 보정값
const VERTICAL_OFFSET = -50;
const HORIZONTAL_OFFSET = 0;

const CameraComponent = () => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  // TFLite 모델 로드
  const objectDetection = useTensorflowModel(
    require('../assets/MobileFaceNet_new_latest_int8.tflite'),
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  const {resize} = useResizePlugin();

  const [isCaptured, setIsCaptured] = useState(false);

  // ✨ [2] State 확장: 생성된 키와 헬퍼 데이터를 저장할 필드 추가
  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
    keyString: string;
    binaryCode: string;
    helperData: string; // ✨ 추가됨 (P)
    finalKey: string; // ✨ 추가됨 (R)
  }>({
    faces: [],
    frameWidth: 0,
    frameHeight: 0,
    keyString: '',
    binaryCode: '',
    helperData: '',
    finalKey: '',
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

  // ✨ [3] JS 핸들러 수정: Generator 호출 로직 추가
  const handleCaptureJS = Worklets.createRunOnJS(
    (faces: Face[], w: number, h: number, key: string, binary: string) => {
      if (key && key.length > 0) {
        // --- Fuzzy Extractor 실행 ---
        console.log('Generating Fuzzy Key...');
        let generatedHelper = '';
        let generatedKey = '';

        try {
          // 아까 만든 Generator 함수 호출
          const result = Generator(binary);
          generatedHelper = result.helperData;
          generatedKey = result.key;
          console.log('Key Generation Success!');
        } catch (e) {
          console.error('Key Gen Failed:', e);
        }
        // ---------------------------

        setFaceData({
          faces,
          frameWidth: w,
          frameHeight: h,
          keyString: key,
          binaryCode: binary,
          helperData: generatedHelper, // 결과 저장
          finalKey: generatedKey, // 결과 저장
        });

        setIsCaptured(true);
      }
    },
  );

  // 프레임 프로세서 (기존과 동일)
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      const faces = detectFaces(frame);

      if (faces.length > 0 && model != null) {
        const face = faces[0];
        const x = Math.max(0, face.bounds.x);
        const y = Math.max(0, face.bounds.y);
        const width = Math.min(face.bounds.width, frame.width - x);
        const height = Math.min(face.bounds.height, frame.height - y);

        if (width <= 0 || height <= 0) return;

        const resized = resize(frame, {
          scale: {width: 112, height: 112},
          pixelFormat: 'rgb',
          dataType: 'uint8',
          crop: {x, y, width, height},
        });

        const inputData = new Int8Array(resized.length);
        for (let i = 0; i < resized.length; i++) {
          inputData[i] = resized[i] - 128;
        }

        const output = model.runSync([inputData]);
        const embedding = output[0];

        if (embedding) {
          const vectorValues = Array.from(embedding as any) as number[];
          const extractedKey = vectorValues
            .slice(0, 5)
            .map((v: number) => v.toFixed(3))
            .join(', ');

          let binaryStr = '';
          // @ts-ignore
          const len = embedding.length;
          for (let i = 0; i < len; i++) {
            // @ts-ignore
            const val = embedding[i];
            binaryStr += val >= 0 ? '1' : '0';
          }

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
      helperData: '',
      finalKey: '',
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

      {/* 얼굴 박스 (기존 유지) */}
      {faceData.faces.map((face, index) => {
        // ... (기존 박스 그리기 코드 생략 - 위와 동일) ...
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

      {/* ✨ [4] UI 수정: Helper Data와 Key 표시 */}
      <View style={styles.infoOverlay}>
        <Text style={styles.infoTitle}>
          {isCaptured ? '🔐 키 생성 완료' : '👤 얼굴 인식 중...'}
        </Text>

        {isCaptured && (
          <View style={{width: '100%', alignItems: 'center'}}>
            {/* 1. 이진 코드 */}
            <Text style={styles.infoLabel}>Raw Binary Code:</Text>
            <ScrollView style={styles.binaryScroll} nestedScrollEnabled={true}>
              <Text style={styles.binaryValue}>{faceData.binaryCode}</Text>
            </ScrollView>

            {/* 2. Helper Data (P) */}
            <Text style={styles.infoLabel}>Helper Data (저장용 P):</Text>
            <View style={styles.resultBox}>
              <Text style={styles.resultValue} numberOfLines={2}>
                {faceData.helperData}
              </Text>
            </View>

            {/* 3. Final Key (R) */}
            <Text style={styles.infoLabel}>Final Secret Key (생성된 R):</Text>
            <View style={[styles.resultBox, {borderColor: '#FFD700'}]}>
              <Text
                style={[styles.resultValue, {color: '#FFD700'}]}
                numberOfLines={2}>
                {faceData.finalKey}
              </Text>
            </View>

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
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.9)', // 가독성을 위해 배경 더 어둡게
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    maxHeight: 500, // 높이 늘림
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
    marginTop: 8,
    marginBottom: 2,
    alignSelf: 'flex-start',
    fontWeight: '600',
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
    height: 50,
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 5,
    padding: 5,
  },
  binaryValue: {
    color: '#00FFFF',
    fontSize: 10,
    fontFamily: 'Courier',
  },
  // ✨ 결과 박스 스타일 추가
  resultBox: {
    width: '100%',
    padding: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    marginBottom: 5,
  },
  resultValue: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 15,
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
