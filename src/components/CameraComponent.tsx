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

// --- 설정 상수 ---
const STEPS = [
  {
    id: 'CENTER',
    label: '정면을 바라봐주세요',
    yaw: [-10, 10],
    pitch: [-10, 10],
  },
  {
    id: 'LEFT',
    label: '고개를 오른쪽으로 돌려주세요',
    yaw: [20, 100],
    pitch: [-15, 15],
  },
  {
    id: 'RIGHT',
    label: '고개를 왼쪽으로 돌려주세요',
    yaw: [-100, -20],
    pitch: [-15, 15],
  },
  {
    id: 'TOP',
    label: '고개를 아래로 숙여주세요',
    yaw: [-15, 15],
    pitch: [-100, -20],
  },
  {
    id: 'BOTTOM',
    label: '고개를 위로 들어주세요',
    yaw: [-15, 15],
    pitch: [20, 100],
  },
];

const CameraComponent = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const {mode} = route.params;

  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  // --- 상태 및 공유 값 ---
  const isFinishedShared = useSharedValue(false); // 전체 시퀀스 종료 락
  const isCapturing = useSharedValue(false); // 단계별 촬영 순간 락
  const isGenerateMode = mode === 'GENERATE';
  const targetStepCount = isGenerateMode ? STEPS.length : 1; // 🎯 등록 5장, 인증 1장

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [collectedEmbeddings, setCollectedEmbeddings] = useState<number[][]>(
    [],
  );
  const [isFaceInZone, setIsFaceInZone] = useState(false);
  const [isCaptured, setIsCaptured] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<
    'SUCCESS' | 'FAILURE' | null
  >(null);

  const [faceData, setFaceData] = useState({helperData: '', finalKey: ''});

  // --- 가이드 영역 설정 (중앙 타원형 가이드) ---
  const GUIDE_SIZE = windowWidth * 0.72;
  const GUIDE_TOP = windowHeight * 0.22;
  const GUIDE_LEFT = (windowWidth - GUIDE_SIZE) / 2;

  const {detectFaces} = useFaceDetector({performanceMode: 'fast'});
  const {resize} = useResizePlugin();
  const objectDetection = useTensorflowModel(
    require('../assets/MobileFaceNet_new_latest_int8.tflite'),
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  const resetScan = useCallback(() => {
    isFinishedShared.value = false;
    isCapturing.value = false;
    setIsCaptured(false);
    setIsProcessing(false);
    setVerificationStatus(null);
    setCurrentStepIdx(0);
    setCollectedEmbeddings([]);
    setIsFaceInZone(false);
  }, [isFinishedShared]);

  useEffect(() => {
    if (isFocused) {
      resetScan();
      setTimeout(() => setIsCameraActive(true), 300);
    } else {
      setIsCameraActive(false);
    }
  }, [isFocused, resetScan]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // --- 최종 연산 로직 (평균 임베딩 산출 및 FE 실행) ---
  const processFinalEmbedding = async (allEmbeddings: number[][]) => {
    setIsProcessing(true);
    try {
      // 1. 다중 프레임 평균값 계산
      const avgEmbedding = new Array(128).fill(0);
      for (let i = 0; i < 128; i++) {
        let sum = 0;
        for (let j = 0; j < allEmbeddings.length; j++) {
          sum += allEmbeddings[j][i];
        }
        avgEmbedding[i] = sum / allEmbeddings.length;
      }

      // 2. 비트스트링 변환
      let binaryStr = '';
      for (let i = 0; i < 128; i++) {
        binaryStr += avgEmbedding[i] >= 0 ? '1' : '0';
      }

      // 3. 모드별 FE 로직 실행
      if (isGenerateMode) {
        const result = await Generator(binaryStr);
        await AsyncStorage.setItem('@helper_data', result.helperData);
        await AsyncStorage.setItem('@registered_key', result.key);
        setFaceData({helperData: result.helperData, finalKey: result.key});
      } else {
        const savedP = await AsyncStorage.getItem('@helper_data');
        const registeredKey = await AsyncStorage.getItem('@registered_key');
        if (!savedP || !registeredKey) throw new Error('DATA_NOT_FOUND');

        const recoveredKey = await Reproducer(binaryStr, savedP);
        const isMatch = recoveredKey === registeredKey;
        setVerificationStatus(isMatch ? 'SUCCESS' : 'FAILURE');
        setFaceData({helperData: savedP, finalKey: recoveredKey});
      }
      setIsCaptured(true);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '데이터 처리 중 에러가 발생했습니다.');
      resetScan();
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 단계별 촬영 완료 시 JS 처리부 ---
  const handleStepCaptureJS = Worklets.createRunOnJS((embedding: number[]) => {
    const nextList = [...collectedEmbeddings, embedding];
    setCollectedEmbeddings(nextList);

    if (nextList.length < targetStepCount) {
      setCurrentStepIdx(nextList.length);
      // 고개를 돌릴 시간 여유를 위해 1.2초 후 락 해제
      setTimeout(() => {
        isCapturing.value = false;
        isFinishedShared.value = false;
      }, 1200);
    } else {
      processFinalEmbedding(nextList);
    }
  });

  const setIsFaceInZoneJS = Worklets.createRunOnJS(setIsFaceInZone);

  // --- 프레임 프로세서 (실시간 각도 및 위치 검증) ---
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (isFinishedShared.value || isCapturing.value || model == null) return;

      const faces = detectFaces(frame);
      if (faces.length > 0) {
        const face = faces[0];
        const {bounds, yawAngle, pitchAngle} = face;

        // 1. 가이드 영역(중앙) 판정
        const isCentered =
          Math.abs(bounds.x + bounds.width / 2 - frame.width / 2) <
            frame.width * 0.18 &&
          Math.abs(bounds.y + bounds.height / 2 - frame.height / 2) <
            frame.height * 0.18;

        setIsFaceInZoneJS(isCentered);

        // 2. 각도 검증 (인증 모드일 때는 항상 '정면'인 STEPS[0]만 사용)
        const target = isGenerateMode ? STEPS[currentStepIdx] : STEPS[0];
        const isCorrectAngle =
          yawAngle >= target.yaw[0] &&
          yawAngle <= target.yaw[1] &&
          pitchAngle >= target.pitch[0] &&
          pitchAngle <= target.pitch[1];

        // 3. 촬영 실행
        if (isCentered && isCorrectAngle) {
          isFinishedShared.value = true;
          isCapturing.value = true;

          const resized = resize(frame, {
            scale: {width: 112, height: 112},
            pixelFormat: 'rgb',
            dataType: 'uint8',
            crop: bounds,
          });

          const inputData = new Int8Array(resized.length);
          for (let i = 0; i < resized.length; i++)
            inputData[i] = resized[i] - 128;

          const output = model.runSync([inputData]);
          if (output[0]) {
            // 🛠️ BigInt 타입 에러 해결: 명시적으로 Number 형변환 수행
            handleStepCaptureJS(Array.from(output[0] as any));
          } else {
            isFinishedShared.value = false;
            isCapturing.value = false;
          }
        }
      } else {
        setIsFaceInZoneJS(false);
      }
    },
    [currentStepIdx, model, isGenerateMode],
  );

  if (!hasPermission || !device)
    return (
      <View style={styles.center}>
        <Text>권한 로딩 중...</Text>
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
      />

      {/* 가이드 오버레이 */}
      {!isCaptured && (
        <View style={styles.overlay} pointerEvents="none">
          <View
            style={[
              styles.guideFrame,
              {
                width: GUIDE_SIZE,
                height: GUIDE_SIZE + 40,
                top: GUIDE_TOP,
                borderColor: isFaceInZone ? '#00FF00' : '#FFFFFF44',
              },
            ]}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
        </View>
      )}

      <View style={styles.infoOverlay}>
        <Text style={styles.infoTitle}>
          {isCaptured
            ? isGenerateMode
              ? '🔐 등록 완료'
              : verificationStatus === 'SUCCESS'
              ? '✅ 인증 성공'
              : '❌ 인증 실패'
            : isGenerateMode
            ? STEPS[currentStepIdx].label
            : '정면을 바라봐주세요'}
        </Text>

        {/* 인증 모드에서는 프로그레스 바 숨김 */}
        {!isCaptured && isGenerateMode && (
          <View style={styles.progressBox}>
            <View
              style={[
                styles.progressFill,
                {width: `${(currentStepIdx + 1) * 20}%`},
              ]}
            />
            <Text style={styles.progressText}>{currentStepIdx + 1} / 5</Text>
          </View>
        )}

        {isProcessing && (
          <ActivityIndicator
            size="large"
            color="#00FF00"
            style={{marginTop: 15}}
          />
        )}

        {isCaptured && (
          <View style={styles.resultView}>
            <Text style={styles.statusDesc}>
              {verificationStatus === 'FAILURE'
                ? '사용자 정보가 일치하지 않습니다.'
                : '생체 인증 키가 안전하게 처리되었습니다.'}
            </Text>

            <View style={styles.dataCard}>
              <Text style={styles.dataLabel}>Helper Data (P)</Text>
              <Text style={styles.dataValue} numberOfLines={1}>
                {faceData.helperData || '---'}
              </Text>
            </View>

            <TouchableOpacity onPress={resetScan} style={styles.btnAction}>
              <Text style={styles.btnText}>🔄 다시 시도</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Home')}
              style={[
                styles.btnAction,
                {backgroundColor: '#333', marginTop: 10},
              ]}>
              <Text style={styles.btnText}>🏠 홈으로</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  overlay: {...StyleSheet.absoluteFillObject, alignItems: 'center', zIndex: 1},
  guideFrame: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 120,
    borderStyle: 'dashed',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  progressBox: {
    width: '100%',
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    marginTop: 15,
    overflow: 'hidden',
  },
  progressFill: {height: '100%', backgroundColor: '#00FF00'},
  progressText: {
    color: '#00FF00',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  resultView: {width: '100%', marginTop: 12, alignItems: 'center'},
  statusDesc: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 15,
    textAlign: 'center',
  },
  dataCard: {
    width: '100%',
    padding: 12,
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  dataLabel: {color: '#666', fontSize: 10, marginBottom: 4},
  dataValue: {color: '#fff', fontSize: 11, fontFamily: 'monospace'},
  btnAction: {
    width: '100%',
    padding: 16,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  btnText: {color: '#fff', fontWeight: 'bold', fontSize: 16},
  // 가이드 코너 데코레이션
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00FF00',
    borderTopLeftRadius: 20,
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00FF00',
    borderTopRightRadius: 20,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00FF00',
    borderBottomLeftRadius: 20,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00FF00',
    borderBottomRightRadius: 20,
  },
});

export default CameraComponent;
