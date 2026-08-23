import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

SplashScreen.preventAutoHideAsync();

interface SavedPhoto {
  id: string;
  uri: string;
  expiresAt: number;
}

export default function CameraScreen() {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [zoom, setZoom] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState<string>('10s');
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [, setTick] = useState<number>(0);

  const cameraRef = useRef<any>(null);
  const [previousDistance, setPreviousDistance] = useState<number | null>(null);

  // Auto-hide Splash Screen after 2.5 seconds
  useEffect(() => {
    const prepare = async () => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await SplashScreen.hideAsync();
    };
    prepare();
  }, []);

  // Ticker: Refreshes countdown display and removes expired photos cleanly
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      
      setTick((t) => t + 1); // Trigger UI re-render for smooth countdown text

      setPhotos((currentPhotos) => {
        const unexpired = currentPhotos.filter((p) => p.expiresAt > currentTime);
        const expired = currentPhotos.filter((p) => p.expiresAt <= currentTime);

        // Delete expired photo files asynchronously from disk
        expired.forEach((photo) => {
          FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch((err) =>
            console.error('Error deleting file:', err)
          );
        });

        return unexpired;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Duration parser
  const getDurationMs = (duration: string): number => {
    switch (duration) {
      case '10s': return 10 * 1000;
      case '1 Hr': return 60 * 60 * 1000;
      case '24 Hrs': return 24 * 60 * 60 * 1000;
      case '7 Days': return 7 * 24 * 60 * 60 * 1000;
      default: return 10 * 1000;
    }
  };

  // Human-readable timer formatter
  const formatRemainingTime = (expiresAt: number): string => {
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) return '0s';

    const totalSeconds = Math.ceil(diffMs / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `${totalHours}h`;

    const totalDays = Math.floor(totalHours / 24);
    return `${totalDays}d`;
  };

  // Universal Capture Photo Handler
  const handleTakePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        shutterSound: false,
      });

      if (photo && photo.uri) {
        const fileName = `temp_${Date.now()}.jpg`;
        const newPath = `${FileSystem.documentDirectory}${fileName}`;

        await FileSystem.copyAsync({
          from: photo.uri,
          to: newPath,
        });

        const newPhoto: SavedPhoto = {
          id: Date.now().toString(),
          uri: newPath,
          expiresAt: Date.now() + getDurationMs(selectedDuration),
        };

        setPhotos((prev) => [newPhoto, ...prev]);
      }
    } catch (error: any) {
      console.error('Capture error:', error);
      alert(`Capture Error: ${error?.message || error}`);
    }
  };

  // Long-Press Action Menu
  const handleLongPressPhoto = (photo: SavedPhoto) => {
    Alert.alert(
      'Photo Options',
      'What would you like to do with this temporary photo?',
      [
        {
          text: 'Save to Camera Roll',
          onPress: async () => {
            if (!mediaPermission?.granted) {
              const permissionResult = await requestMediaPermission();
              if (!permissionResult.granted) {
                alert('Permission is required to save photos to your library.');
                return;
              }
            }
            try {
              await MediaLibrary.saveToLibraryAsync(photo.uri);
              alert('Photo saved permanently to Camera Roll!');
            } catch (err) {
              console.error('Save error:', err);
              alert('Failed to save photo.');
            }
          },
        },
        {
          text: 'Delete Immediately',
          style: 'destructive',
          onPress: async () => {
            await FileSystem.deleteAsync(photo.uri, { idempotent: true });
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Touch Gesture for Pinch-to-Zoom
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

  const latestPhoto = photos[0]?.uri;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing} zoom={zoom} ref={cameraRef}>
        
        {/* Time Selection Bar */}
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

        {/* Bottom Controls */}
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

          {/* Gallery Button */}
          <TouchableOpacity style={styles.galleryPlaceholder} onPress={() => setIsGalleryOpen(true)}>
            {latestPhoto ? (
              <Image source={{ uri: latestPhoto }} style={styles.thumbnailImage} />
            ) : (
              <View style={styles.emptyGalleryTextContainer}>
                <Text style={styles.emptyGalleryText}>0</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

      </CameraView>

      {/* Built-in TempCam Gallery Overlay */}
      <Modal visible={isGalleryOpen} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>TempCam Gallery ({photos.length})</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsGalleryOpen(false)}>
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {photos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No temporary photos available.</Text>
            </View>
          ) : (
            <FlatList
              data={photos}
              keyExtractor={(item) => item.id}
              numColumns={2}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.gridItem}
                  onPress={() => setSelectedImageUri(item.uri)}
                  onLongPress={() => handleLongPressPhoto(item)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: item.uri }} style={styles.gridImage} />
                  <View style={styles.timerBadge}>
                    <Text style={styles.timerBadgeText}>Expires: {formatRemainingTime(item.expiresAt)}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Full-Screen Preview Modal */}
      <Modal visible={!!selectedImageUri} transparent={true} animationType="fade">
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity style={styles.fullscreenCloseButton} onPress={() => setSelectedImageUri(null)}>
            <Text style={styles.fullscreenCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {selectedImageUri && (
            <Image source={{ uri: selectedImageUri }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#000' },
  permissionText: { color: '#fff', textAlign: 'center', marginBottom: 20, fontSize: 16 },
  permissionButton: { backgroundColor: '#FF4500', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  permissionButtonText: { color: '#fff', fontWeight: 'bold' },
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
  timeBarLabel: { color: '#aaa', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 1 },
  timeBarOptions: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  timeButton: { flex: 1, paddingVertical: 8, marginHorizontal: 3, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' },
  activeTimeButton: { backgroundColor: '#FF4500' },
  timeButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
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
  innerCaptureButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF4500' },
  flipButton: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  controlText: { color: '#fff', fontWeight: '600' },
  galleryPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  emptyGalleryTextContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyGalleryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#000', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  closeButton: { backgroundColor: '#FF4500', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 16 },
  gridItem: { flex: 0.5, height: 200, margin: 5, borderRadius: 10, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  timerBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  timerBadgeText: { color: '#FF4500', fontWeight: 'bold', fontSize: 12 },
  fullscreenContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullscreenCloseButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
  fullscreenCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fullscreenImage: { width: '100%', height: '80%' },
});