import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

// Still market photo behind the sign-in card, darkened so the form stays readable.
export function LoginBackground() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={require('@/assets/images/login/market-background.jpg')} contentFit="cover" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 0 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16, 42, 30, 0.5)' },
});
