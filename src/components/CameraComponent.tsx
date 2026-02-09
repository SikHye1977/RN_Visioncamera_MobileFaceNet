import React, {useEffect, useState, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation, useRoute, useIsFocused} from '@react-navigation/native';

// 유틸리티 임포트
import {Generator} from '../utils/Fuzzy_Extractor/FE_Generator';
import {Reproducer} from '../utils/Fuzzy_Extractor/FE_Reproducer';

const VERTICAL_OFFSET = -50;
const HORIZONTAL_OFFSET = 0;

const CameraComponent = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const {mode} = route.params;

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

  // 상태 관리
  const [isCaptured, setIsCaptured] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false); // 카메라 하드웨어 활성화 지연용

  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
    binaryCode: string;
    helperData: string;
    finalKey: string;
  }>({
    faces: [],
    frameWidth: 0,
    frameHeight: 0,
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

  const resetScan = useCallback(() => {
    setIsCaptured(false);
    setIsProcessing(false);
    setFaceData({
      faces: [],
      frameWidth: 0,
      frameHeight: 0,
      binaryCode: '',
      helperData: '',
      finalKey: '',
    });
  }, []);

  // ✨ setTimeout 부분의 이상한 문자를 수정하고 로직을 보강했습니다.
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFocused) {
      resetScan();
      // 페이지 전환 시 카메라 리소스 충돌을 막기 위해 300ms 뒤에 활성화
      timer = setTimeout(() => {
        setIsCameraActive(true);
      }, 300);
    } else {
      setIsCameraActive(false);
      setIsProcessing(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isFocused, resetScan]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  const handleCaptureJS = Worklets.createRunOnJS(
    async (faces: Face[], w: number, h: number, binary: string) => {
      if (isCaptured || isProcessing) return;
      setIsProcessing(true);

      try {
        if (mode === 'GENERATE') {
          const result = await Generator(binary);
          setFaceData({
            faces,
            frameWidth: w,
            frameHeight: h,
            binaryCode: binary,
            helperData: result.helperData,
            finalKey: result.key,
          });
          await AsyncStorage.setItem('@helper_data', result.helperData);
          await AsyncStorage.setItem('@registered_key', result.key);
        } else {
          const savedP = await AsyncStorage.getItem('@helper_data');
          if (!savedP) {
            Alert.alert('에러', '등록된 데이터가 없습니다.');
            navigation.navigate('Home');
            return;
          }
          const recoveredKey = await Reproducer(binary, savedP);
          setFaceData({
            faces,
            frameWidth: w,
            frameHeight: h,
            binaryCode: binary,
            helperData: savedP,
            finalKey: recoveredKey,
          });
        }
        setIsCaptured(true);
      } catch (e) {
        console.error('FE Process Error:', e);
        Alert.alert('실패', '처리에 실패했습니다.');
        setIsProcessing(false);
      }
    },
  );

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (isCaptured || isProcessing) return;

      const faces = detectFaces(frame);

      if (faces.length > 0 && model != null) {
        const face = faces[0];
        const {x, y, width, height} = face.bounds;

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
          let binaryStr = '';
          for (let i = 0; i < embedding.length; i++) {
            binaryStr += embedding[i] >= 0 ? '1' : '0';
          }
          handleCaptureJS(faces, frame.width, frame.height, binaryStr);
        }
      }
    },
    [handleCaptureJS, model, resize, isCaptured, isProcessing],
  );

  if (!hasPermission)
    return (
      <View style={styles.center}>
        <Text>권한 대기 중...</Text>
      </View>
    );
  if (device == null)
    return (
      <View style={styles.center}>
        <Text>카메라를 찾을 수 없습니다.</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && isCameraActive && !isCaptured}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        resizeMode="cover"
      />

      {/* 가이드 박스 */}
      {!isCaptured &&
        faceData.faces.map((face, index) => {
          const {bounds} = face;
          const {frameWidth, frameHeight} = faceData;
          if (frameWidth === 0 || frameHeight === 0) return null;

          const scale = Math.max(
            windowWidth / frameHeight,
            windowHeight / frameWidth,
          );
          let finalX =
            bounds.y * scale - (frameHeight * scale - windowWidth) / 2;
          let finalY =
            bounds.x * scale - (frameWidth * scale - windowHeight) / 2;

          if (device.position === 'front')
            finalX = windowWidth - finalX - bounds.height * scale;

          return (
            <View
              key={index}
              style={[
                styles.faceBox,
                {
                  left: finalX + HORIZONTAL_OFFSET,
                  top: finalY + VERTICAL_OFFSET,
                  width: bounds.height * scale,
                  height: bounds.width * scale,
                },
              ]}
            />
          );
        })}

      <View style={styles.infoOverlay}>
        <Text style={styles.infoTitle}>
          {isCaptured
            ? mode === 'GENERATE'
              ? '🔐 생성 완료'
              : '🔓 복구 완료'
            : isProcessing
            ? '⚙️ 연산 중...'
            : '👤 얼굴을 인식해주세요'}
        </Text>

        {isProcessing && !isCaptured && (
          <ActivityIndicator
            size="large"
            color="#00FF00"
            style={{margin: 10}}
          />
        )}

        {isCaptured && (
          <View style={{width: '100%', alignItems: 'center'}}>
            <Text style={styles.infoLabel}>Helper Data (P):</Text>
            <View style={styles.resultBox}>
              <Text style={styles.resultValue}>{faceData.helperData}</Text>
            </View>

            <Text style={styles.infoLabel}>
              {mode === 'GENERATE' ? '원본 키 (R):' : '복구된 키 (R):'}
            </Text>
            <View style={[styles.resultBox, {borderColor: '#FFD700'}]}>
              <Text style={[styles.resultValue, {color: '#FFD700'}]}>
                {faceData.finalKey}
              </Text>
            </View>

            <TouchableOpacity onPress={resetScan} style={styles.retryButton}>
              <Text style={styles.retryText}>🔄 다시 시도</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Home')}
              style={[
                styles.retryButton,
                {backgroundColor: '#444', marginTop: 10},
              ]}>
              <Text style={styles.retryText}>🏠 홈으로</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'black'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  faceBox: {
    position: 'absolute',
    borderColor: '#00FF00',
    borderWidth: 3,
    zIndex: 10,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
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
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  resultBox: {
    width: '100%',
    padding: 10,
    backgroundColor: '#222',
    borderRadius: 8,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#555',
  },
  resultValue: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginTop: 15,
  },
  retryText: {color: 'white', fontWeight: 'bold'},
});

export default CameraComponent;
