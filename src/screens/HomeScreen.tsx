import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {Text, StyleSheet, Button, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

function HomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Camera', {mode: 'GENERATE'})}>
        <Text style={styles.buttonText}>🔐 생체암호 생성 (등록)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, {backgroundColor: '#4CAF50'}]}
        onPress={() => navigation.navigate('Camera', {mode: 'REPRODUCE'})}>
        <Text style={styles.buttonText}>🔓 생체암호 복구 (인증)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, {backgroundColor: '#9E9E9E'}]}
        onPress={() => navigation.navigate('Profile')}>
        <Text style={styles.buttonText}>👤 프로필 및 키 관리</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {fontSize: 28, fontWeight: 'bold', marginBottom: 10},
  subtitle: {fontSize: 16, color: '#666', marginBottom: 30},
  button: {},
  buttonText: {},
});

export default HomeScreen;
