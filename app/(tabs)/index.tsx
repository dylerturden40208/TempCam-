import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import * as TaskManager from 'expo-task-manager';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

SplashScreen.preventAutoHideAsync();

const STORAGE_KEY = '@tempcam_photos_v1';
const BACKGROUND_CLEANUP_TASK = 'TEMP_CAM_BACKGROUND_CLEANUP';

interface SavedPhoto {
  id: string;
  uri: string;
  expiresAt: number;
}

TaskManager.defineTask(BACKGROUND_CLEANUP_TASK, async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    if (!jsonValue) return BackgroundFetch.BackgroundFetchResult.NoData;

    const photos: SavedPhoto[] = JSON.parse(jsonValue);
    const currentTime = Date.now();

    const unexpired = photos.filter((p) => p.expiresAt > currentTime);
    const expired = photos.filter((p) => p.expiresAt <= currentTime);

    if (expired.length > 0) {
      for (const photo of expired) {
        await FileSystem.deleteAsync(photo.uri, { idempotent: true });
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unexpired));
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

const AnimatedGalleryItem = ({ item, onPress, onLongPress, formatRemainingTime, onExpired }: any) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isExpiringRef = useRef(false);

  useEffect(() => {
    const checkExpiration = () => {
      const remaining = item.expiresAt - Date.now();

      if (remaining <= 300 && !isExpiringRef.current) {
        isExpiringRef.current = true;
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          onExpired(item.id, item.uri);
        });
      }
    };

    const timer = setInterval(checkExpiration, 100);
    return () => clearInterval(timer);
  }, [item.expiresAt]);

  return (
    <Animated.View style={[styles.gridItem, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.uri }} style={styles.gridImage} />
        <View style={styles.timerBadge}>
          <Text style={styles.timerBadgeText}>🔥 {formatRemainingTime(item.expiresAt)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function CameraScreen() {
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [selectedDuration, setSelectedDuration] = useState<string>('7 Days');
  const [zoom, setZoom] = useState<number>(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [, setTick] = useState<number>(0);

  const cameraRef = useRef<any>(null);

  useEffect(() => {
    const prepare = async () => {
      try {
        const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
        if (jsonValue != null) {
          setPhotos(JSON.parse(jsonValue));
        }
      } catch (e) {
        console.error('Failed to load photos:', e);
      } finally {
        setIsLoaded(true);
        await SplashScreen.hideAsync();

        BackgroundFetch.registerTaskAsync(BACKGROUND_CLEANUP_TASK, {
          minimumInterval: 15 * 60,
          stopOnTerminate: false,
          startOnBoot: true,
        }).catch((err) => console.log('Background task error:', err));
      }
    };
    prepare();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(photos)).catch((e) =>
      console.error('Failed to save photos:', e)
    );
  }, [photos, isLoaded]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handlePhotoExpired = async (id: string, uri: string) => {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch((err) =>
      console.error('Error deleting file:', err)
    );
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const getDurationMs = (duration: string): number => {
    switch (duration) {
      case '10s': return 10 * 1000;
      case '1 Hr': return 60 * 60 * 1000;
      case '24 Hrs': return 24 * 60 * 60 * 1000;
      case '7 Days': return 7 * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  };

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

  const handleTakePicture = async () => {
    if (!cameraRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

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

  const handleSelectDuration = (duration: string) => {
    Haptics.selectionAsync();
    setSelectedDuration(duration);
  };

  const handleToggleFlash = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlash((f) => (f === 'off' ? 'on' : 'off'));
  };

  const handleFlipCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  };

  const handleLongPressPhoto = (photo: SavedPhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Photo Options',
      'Choose an action for this temporary photo:',
      [
        {
          text: 'Save to Camera Roll',
          onPress: async () => {
            if (!mediaPermission?.granted) {
              const permissionResult = await requestMediaPermission();
              if (!permissionResult.granted) {
                alert('Permission required.');
                return;
              }
            }
            try {
              await MediaLibrary.saveToLibraryAsync(photo.uri);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              alert('Saved to Camera Roll!');
            } catch (err) {
              alert('Failed to save photo.');
            }
          },
        },
        {
          text: 'Share Photo',
          onPress: async () => {
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(photo.uri);
            }
          },
        },
        {
          text: 'Extend Timer (+1 Hour)',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === photo.id
                  ? { ...p, expiresAt: p.expiresAt + 60 * 60 * 1000 }
                  : p
              )
            );
          },
        },
        {
          text: 'Delete Immediately',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            handlePhotoExpired(photo.id, photo.uri);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

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
    <View style={styles.container}>
      <CameraView 
        style={StyleSheet.absoluteFill} 
        facing={facing} 
        flash={flash} 
        zoom={zoom}
        ref={cameraRef} 
      />

      {/* Top Flash Control */}
      <TouchableOpacity
        style={styles.flashButton}
        onPress={handleToggleFlash}
      >
        <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={22} color="#fff" />
      </TouchableOpacity>

      {/* On-Screen Zoom Controls */}
      <View style={styles.zoomContainer}>
        {[0, 0.5, 1].map((level, idx) => {
          const labels = ['1x', '2x', '3x'];
          return (
            <TouchableOpacity
              key={labels[idx]}
              style={[styles.zoomButton, zoom === level && styles.activeZoomButton]}
              onPress={() => {
                Haptics.selectionAsync();
                setZoom(level);
              }}
            >
              <Text style={[styles.zoomText, zoom === level && styles.activeZoomText]}>
                {labels[idx]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Timer Selection Bar */}
      <View style={styles.timeBarContainer}>
        <Text style={styles.timeBarLabel}>AUTO-DELETE IN:</Text>
        <View style={styles.timeBarOptions}>
          {['7 Days', '24 Hrs', '1 Hr', '10s'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.timeButton,
                selectedDuration === item && styles.activeTimeButton,
              ]}
              onPress={() => handleSelectDuration(item)}
            >
              <Text style={styles.timeButtonText}>
                {item === '10s' ? `⚡ ${item}` : item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Centered Controls Bar */}
      <View style={styles.controlsContainer}>
        <View style={styles.sideControlWrapper}>
          <TouchableOpacity
            style={styles.iconControlButton}
            onPress={handleFlipCamera}
          >
            <Ionicons name="camera-reverse" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleTakePicture}
          activeOpacity={0.6}
        >
          <View style={styles.innerCaptureButton} />
        </TouchableOpacity>

        <View style={styles.sideControlWrapper}>
          <TouchableOpacity 
            style={styles.galleryPlaceholder} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsGalleryOpen(true);
            }}
          >
            {latestPhoto ? (
              <Image source={{ uri: latestPhoto }} style={styles.thumbnailImage} />
            ) : (
              <View style={styles.emptyGalleryTextContainer}>
                <Text style={styles.emptyGalleryText}>0</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Gallery Modal */}
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
                <AnimatedGalleryItem
                  item={item}
                  onPress={() => setSelectedImageUri(item.uri)}
                  onLongPress={() => handleLongPressPhoto(item)}
                  formatRemainingTime={formatRemainingTime}
                  onExpired={handlePhotoExpired}
                />
              )}
            />
          )}

          {/* Zoom Modal */}
          <Modal visible={!!selectedImageUri} transparent={true} animationType="fade">
            <View style={styles.fullscreenContainer}>
              <TouchableOpacity style={styles.fullscreenCloseButton} onPress={() => setSelectedImageUri(null)}>
                <Text style={styles.fullscreenCloseText}>✕ Close</Text>
              </TouchableOpacity>
              
              {selectedImageUri && (
                <ScrollView
                  style={{ width: '100%', height: '100%' }}
                  contentContainerStyle={styles.scrollContainer}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  centerContent={true}
                >
                  <Image source={{ uri: selectedImageUri }} style={styles.fullscreenImage} resizeMode="contain" />
                </ScrollView>
              )}
            </View>
          </Modal>

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
  flashButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  zoomContainer: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
  },
  zoomButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  activeZoomButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  zoomText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeZoomText: {
    color: '#FF4500',
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
    zIndex: 10,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  sideControlWrapper: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
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
  iconControlButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 45,
    height: 45,
    borderRadius: 22.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  timerBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  timerBadgeText: { color: '#FF4500', fontWeight: 'bold', fontSize: 12 },
  fullscreenContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  fullscreenCloseButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
  fullscreenCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fullscreenImage: { width: '100%', height: '80%' },
});