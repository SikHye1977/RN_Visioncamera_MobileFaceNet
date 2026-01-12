import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {Text, StyleSheet, Button} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

function HomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title} onPress={() => navigation.navigate('Camera')}>
        카메라 켜기
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // 화면 전체를 쓰겠다는 의미 (필수)
    justifyContent: 'center', // 세로 중앙 정렬
    alignItems: 'center', // 가로 중앙 정렬
    backgroundColor: '#fff',
  },
  title: {fontSize: 28, fontWeight: 'bold', marginBottom: 10},
  subtitle: {fontSize: 16, color: '#666', marginBottom: 30},
});

export default HomeScreen;
