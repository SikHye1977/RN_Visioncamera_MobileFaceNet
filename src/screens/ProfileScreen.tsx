import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, Button} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

function ProfileScreen() {
  const [storedData, setStoredData] = useState({p: '', r: ''});

  const loadData = async () => {
    const p = await AsyncStorage.getItem('@helper_data');
    const r = await AsyncStorage.getItem('@registered_key');
    setStoredData({p: p || '없음', r: r || '없음'});
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteKey = async () => {
    // await AsyncStorage.clear();
    loadData();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>저장된 Helper Data (P):</Text>
      <Text style={styles.value}>{storedData.p}</Text>

      <Text style={styles.label}>저장된 원본 키 (R):</Text>
      <Text style={styles.value}>{storedData.r}</Text>

      <Button title="키 삭제하기" color="red" onPress={deleteKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {},
  value: {},
});

export default ProfileScreen;
