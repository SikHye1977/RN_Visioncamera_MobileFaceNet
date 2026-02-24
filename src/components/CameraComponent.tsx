import React, {useEffect, useState, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  TouchableOpacity,
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
import {useSharedValue} from 'react-native-worklets-core';

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

  // 상태 변수
  const isFinishedShared = useSharedValue(false);
  const [isCaptured, setIsCaptured] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // 인증 결과 상태 추가 ('SUCCESS' | 'FAILURE' | null)
  const [verificationStatus, setVerificationStatus] = useState<
    'SUCCESS' | 'FAILURE' | null
  >(null);

  const [faceData, setFaceData] = useState<{
    faces: Face[];
    frameWidth: number;
    frameHeight: number;
    helperData: string;
    finalKey: string;
  }>({
    faces: [],
    frameWidth: 0,
    frameHeight: 0,
    helperData: '',
    finalKey: '',
  });

  const {detectFaces} = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'none',
  });

  const {resize} = useResizePlugin();
  const objectDetection = useTensorflowModel(
    require('../assets/MobileFaceNet_new_latest_int8.tflite'),
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  const resetScan = useCallback(() => {
    isFinishedShared.value = false;
    setIsCaptured(false);
    setIsProcessing(false);
    setVerificationStatus(null);
    setFaceData({
      faces: [],
      frameWidth: 0,
      frameHeight: 0,
      helperData: '',
      finalKey: '',
    });
  }, [isFinishedShared]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFocused) {
      resetScan();
      timer = setTimeout(() => setIsCameraActive(true), 300);
    } else {
      setIsCameraActive(false);
    }
    return () => timer && clearTimeout(timer);
  }, [isFocused, resetScan]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const processingRef = React.useRef(false);

  // --- 메인 검증 로직 (JS 실행부) ---
  const handleCaptureJS = Worklets.createRunOnJS(
    async (faces: Face[], w: number, h: number, binary: string) => {
      if (processingRef.current || isCaptured) return;
      processingRef.current = true;
      setIsProcessing(true);

      try {
        if (mode === 'GENERATE') {
          // 1. 키 생성 모드
          const result = await Generator(binary);
          await AsyncStorage.setItem('@helper_data', result.helperData);
          await AsyncStorage.setItem('@registered_key', result.key);

          setFaceData({
            faces,
            frameWidth: w,
            frameHeight: h,
            helperData: result.helperData,
            finalKey: result.key,
          });
        } else {
          // 2. 키 복구 및 검증 모드
          const savedP = await AsyncStorage.getItem('@helper_data');
          const registeredKey = await AsyncStorage.getItem('@registered_key');

          if (!savedP || !registeredKey) {
            Alert.alert(
              '에러',
              '등록된 정보가 없습니다. 먼저 등록을 완료해주세요.',
            );
            navigation.navigate('Home');
            return;
          }

          const recoveredKey = await Reproducer(binary, savedP);

          // 핵심: 원본 키와 복구된 키 대조
          const isMatch = recoveredKey === registeredKey;
          setVerificationStatus(isMatch ? 'SUCCESS' : 'FAILURE');

          setFaceData({
            faces,
            frameWidth: w,
            frameHeight: h,
            helperData: savedP,
            finalKey: recoveredKey,
          });
        }
        setIsCaptured(true);
      } catch (e) {
        console.error('Process Error:', e);
        Alert.alert('실패', '생체 데이터 처리 중 오류가 발생했습니다.');
        resetScan();
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
  );

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (isFinishedShared.value || model == null) return;

      const faces = detectFaces(frame);
      if (faces.length > 0) {
        isFinishedShared.value = true;
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
        } else {
          isFinishedShared.value = false;
        }
      }
    },
    [handleCaptureJS, model, resize],
  );

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device!}
        isActive={isFocused && isCameraActive && !isCaptured}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />

      <View style={styles.infoOverlay}>
        <Text style={styles.infoTitle}>
          {isCaptured
            ? mode === 'GENERATE'
              ? '🔐 등록 완료'
              : verificationStatus === 'SUCCESS'
              ? '✅ 인증 성공'
              : '❌ 인증 실패'
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
            {mode !== 'GENERATE' && (
              <Text
                style={[
                  styles.statusSubText,
                  {
                    color:
                      verificationStatus === 'SUCCESS' ? '#00FF00' : '#FF4444',
                  },
                ]}>
                {verificationStatus === 'SUCCESS'
                  ? '등록된 사용자와 일치합니다.'
                  : '일치하지 않는 사용자입니다.'}
              </Text>
            )}

            <Text style={styles.infoLabel}>Helper Data (P):</Text>
            <View style={styles.resultBox}>
              <Text style={styles.resultValue}>{faceData.helperData}</Text>
            </View>

            <Text style={styles.infoLabel}>
              {mode === 'GENERATE' ? '등록된 키 (R):' : '복구된 키 (R):'}
            </Text>
            <View
              style={[
                styles.resultBox,
                {
                  borderColor:
                    verificationStatus === 'FAILURE' ? '#FF4444' : '#FFD700',
                },
              ]}>
              <Text
                style={[
                  styles.resultValue,
                  {
                    color:
                      verificationStatus === 'FAILURE' ? '#FF4444' : '#FFD700',
                  },
                ]}>
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
  infoOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  infoTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statusSubText: {fontSize: 14, fontWeight: '600', marginBottom: 15},
  infoLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 10,
    alignSelf: 'flex-start',
    marginLeft: 5,
  },
  resultBox: {
    width: '100%',
    padding: 12,
    backgroundColor: '#111',
    borderRadius: 10,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  resultValue: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 15,
  },
  retryText: {color: 'white', fontWeight: 'bold', fontSize: 16},
});

export default CameraComponent;
