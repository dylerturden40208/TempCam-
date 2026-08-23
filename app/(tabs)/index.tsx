import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Prevent splash screen from auto-hiding instantly
SplashScreen.preventAutoHideAsync();

export default function CameraScreen() {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [zoom, setZoom] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState('10s');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);

  const cameraRef = useRef<any>(null);
  const [previousDistance, setPreviousDistance] = useState<number | null>(null);

  useEffect(() => {
    const prepare = async () => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await SplashScreen.hideAsync();
    };
    prepare();
  }, []);

  const handleTakePicture = async () => {
    if (!cameraRef.current) return;

    if (!mediaPermission?.granted) {
      const response = await requestMediaPermission();
      if (!response.granted) {
        alert('Permission to save photos to library is required.');
        return;
      }
    }

    try {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo?.uri) {
        await MediaLibrary.saveToLibraryAsync(photo.uri);
        setLastPhoto(photo.uri);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to capture photo.');
    }
  };

  const handleOpenGallery = async () => {
    // Opens the native iOS image library cleanly inside your app
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setLastPhoto(result.assets[0].uri);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
    onPanResponderMove: (evt) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        if (previousDistance !== null) {
          const delta = currentDistance - previousDistance;
          setZoom((prevZoom) => {
            const nextZoom = prevZoom + delta * 0.002;
            return Math.min(Math.max(nextZoom, 0), 1);
          });
        }
        setPreviousDistance(currentDistance);
      }
    },
    onPanResponderRelease: () => setPreviousDistance(null),
    onPanResponderTerminate: () => setPreviousDistance(null),
  });

  if (!permission) return <View style={styles.container} />;
  
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing} zoom={zoom} ref={cameraRef}>
        <View style={styles.timeBarContainer}>
          <Text style={styles.timeBarLabel}>AUTO-DELETE IN:</Text>
          <View style={styles.timeBarOptions}>
            {['10s', '1 Hr', '24 Hrs', '7 Days'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.timeButton,
                  selectedDuration === item && styles.activeTimeButton
                ]}
                onPress={() => setSelectedDuration(item)}
              >
                <Text style={styles.timeButtonText}>
                  {item === '10s' ? `⚡ ${item}` : item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={styles.flipButton} 
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          >
            <Text style={styles.controlText}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureButton} onPress={handleTakePicture}>
            <View style={styles.innerCaptureButton} />
          </TouchableOpacity>

          {/* Tappable Gallery Button */}
          <TouchableOpacity style={styles.galleryPlaceholder} onPress={handleOpenGallery}>
            {lastPhoto && (
              <Image source={{ uri: lastPhoto }} style={styles.thumbnailImage} />
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: '#FF4500',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  timeBarContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
  },
  timeBarLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  timeBarOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeButton: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  activeTimeButton: {
    backgroundColor: '#FF4500',
  },
  timeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  captureButton: {
    width: 75,
    height: 75,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerCaptureButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF4500',
  },
  flipButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  controlText: {
    color: '#fff',
    fontWeight: '600',
  },
  galleryPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});