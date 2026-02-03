/**
 * @format
 */

import 'react-native-get-random-values'; // 1. 난수 생성기 활성화
import {Buffer} from 'buffer'; // 2. Buffer 가져오기
global.Buffer = Buffer; // 3. 전역 변수로 등록

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
