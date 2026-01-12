import React from 'react';
import {StyleSheet, View, Text, SafeAreaView} from 'react-native';

interface CameraComponentProps {}

const CameraComponent = ({}: CameraComponentProps) => {
  return (
    <SafeAreaView>
      <View>
        <Text>camera</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white', // 배경색이 없으면 투명해서 안 보일 수 있음
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CameraComponent;
