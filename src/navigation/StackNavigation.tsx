import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import CameraComponent from '../components/CameraComponent';
import {createStaticNavigation} from '@react-navigation/native';

const Stack = createStackNavigator({
  screens: {
    Home: HomeScreen,
    Camera: CameraComponent,
  },
});

const Navigation = createStaticNavigation(Stack);

export default Navigation;
