import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import CameraComponent from '../components/CameraComponent';
import {createStaticNavigation} from '@react-navigation/native';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createStackNavigator({
  screens: {
    Home: HomeScreen,
    Camera: CameraComponent,
    Profile: ProfileScreen,
  },
});

const Navigation = createStaticNavigation(Stack);

export default Navigation;
