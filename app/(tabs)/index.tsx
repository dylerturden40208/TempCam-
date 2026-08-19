import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 48) / 3;

type TimerOption = 10 | 3600 | 86400 | 604800;

interface TempPhoto {
  id: string;
  uri: string;
  expiresAt: number;
}

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  
  // App State
  const [selectedTimer, setSelectedTimer] = useState<TimerOption>(10);
  const [photos, setPhotos] = useState<TempPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<TempPhoto | null>(null);
  
  // Batch Mode State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);

  // Navigation Modals
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Camera & Animation Refs
  const cameraRef = useRef<any>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  // Background Auto-Delete Engine: Checks every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      setPhotos((prevPhotos) => {
        const activePhotos = prevPhotos.filter((p) => p.expiresAt > now);
        
        // If actively viewing a photo that just expired, close preview
        if (selectedPhoto && selectedPhoto.expiresAt <= now) {
          setIsPreviewOpen(false);
          setSelectedPhoto(null);
        }
        
        return activePhotos;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedPhoto]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const triggerFlash = () => {
    flashOpacity.setValue(0.8);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        triggerFlash();
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        
        const expirationMs = Date.now() + selectedTimer * 1000;
        const newPhoto: TempPhoto = { 
          id: Math.random().toString(), 
          uri: photo.uri, 
          expiresAt: expirationMs 
        };

        setPhotos((prev) => [newPhoto, ...prev]);
      } catch (error) {
        console.error('Error taking picture:', error);
      }
    }
  };

  const deletePhotoEarly = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (selectedPhoto?.id === id) {
      setIsPreviewOpen(false);
      setSelectedPhoto(null);
    }
  };

  // Save photo to device camera roll
  const saveToCameraRoll = async (photoUri: string, showNotification = true) => {
    try {
      let currentMediaPermission = mediaPermission;
      
      if (!currentMediaPermission?.granted) {
        currentMediaPermission = await requestMediaPermission();
      }

      if (currentMediaPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(photoUri);
        if (showNotification) {
          Alert.alert('Saved! 📸', 'Photo saved to your device camera roll.');
        }
      } else {
        Alert.alert('Permission Denied', 'Storage permission is required to save photos.');
      }
    } catch (error) {
      console.error('Save error:', error);
      if (showNotification) Alert.alert('Error', 'Failed to save photo.');
    }
  };

  // Extend expiration timer by 1 hour
  const extendPhotoTimer = (id: string, additionalSeconds = 3600) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, expiresAt: p.expiresAt + additionalSeconds * 1000 };
        }
        return p;
      })
    );
    Alert.alert('Timer Extended ⏳', 'Added 1 hour to photo duration.');
  };

  // Trigger Native Share Sheet
  const sharePhoto = async (photoUri: string) => {
    try {
      await Share.share({
        url: photoUri,
        title: 'TempCam Photo',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  // Copy URI to clipboard
  const copyPhotoToClipboard = (photoUri: string) => {
    Clipboard.setString(photoUri);
    Alert.alert('Copied! 📋', 'Photo link copied to clipboard.');
  };

  // Toggle Selection in Batch Mode
  const toggleBatchSelect = (id: string) => {
    if (batchSelectedIds.includes(id)) {
      setBatchSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      setBatchSelectedIds((prev) => [...prev, id]);
    }
  };

  // Execute Batch Delete
  const handleBatchDelete = () => {
    Alert.alert(
      'Delete Selected Photos',
      `Are you sure you want to delete ${batchSelectedIds.length} photos?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            setPhotos((prev) => prev.filter((p) => !batchSelectedIds.includes(p.id)));
            setBatchSelectedIds([]);
            setIsBatchMode(false);
          },
        },
      ]
    );
  };

  // Execute Batch Save
  const handleBatchSave = async () => {
    const selectedPhotos = photos.filter((p) => batchSelectedIds.includes(p.id));
    for (const item of selectedPhotos) {
      await saveToCameraRoll(item.uri, false);
    }
    Alert.alert('Batch Saved! 📸', `${batchSelectedIds.length} photos saved to camera roll.`);
    setBatchSelectedIds([]);
    setIsBatchMode(false);
  };

  // Long press menu handler
  const handleLongPress = (item: TempPhoto) => {
    if (isBatchMode) return;

    Alert.alert(
      'Photo Actions',
      'Choose an action for this temporary snap:',
      [
        {
          text: 'Extend Timer (+1 Hour)',
          onPress: () => extendPhotoTimer(item.id, 3600),
        },
        {
          text: 'Share Photo',
          onPress: () => sharePhoto(item.uri),
        },
        {
          text: 'Copy Image Link',
          onPress: () => copyPhotoToClipboard(item.uri),
        },
        {
          text: 'Select Multiple (Batch Mode)',
          onPress: () => {
            setIsBatchMode(true);
            setBatchSelectedIds([item.id]);
          },
        },
        {
          text: 'Save to Camera Roll',
          onPress: () => saveToCameraRoll(item.uri),
        },
        {
          text: 'Delete Now',
          style: 'destructive',
          onPress: () => deletePhotoEarly(item.id),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const formatTimerLabel = (seconds: TimerOption) => {
    if (seconds === 10) return '⚡ 10s';
    if (seconds === 3600) return '1 Hr';
    if (seconds === 86400) return '24 Hrs';
    return '7 Days';
  };

  const formatRemainingTime = (expiresAt: number) => {
    const diffSec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    if (diffSec < 3600) return `${Math.ceil(diffSec / 60)}m`;
    return `${Math.ceil(diffSec / 3600)}h`;
  };

  const latestPhoto = photos[0] || null;

  return (
    <View style={styles.container}>
      {/* Live Camera View */}
      <CameraView 
        ref={cameraRef} 
        style={StyleSheet.absoluteFillObject} 
        facing={facing} 
      />

      {/* Screen Flash Overlay */}
      <Animated.View 
        style={[
          styles.flashOverlay, 
          { opacity: flashOpacity }
        ]} 
        pointerEvents="none" 
      />

      {/* Controls Overlay */}
      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.titleText}>TempCam</Text>
          <Text style={styles.subtitleText}>Auto-Deleting Camera</Text>
        </View>

        {/* Timer Selector Bar */}
        <View style={styles.timerSelectorContainer}>
          <Text style={styles.timerHeaderLabel}>AUTO-DELETE IN:</Text>
          <View style={styles.timerPillsRow}>
            {([10, 3600, 86400, 604800] as TimerOption[]).map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[
                  styles.timerPill,
                  selectedTimer === sec && styles.activeTimerPill,
                ]}
                onPress={() => setSelectedTimer(sec)}
              >
                <Text
                  style={[
                    styles.timerPillText,
                    selectedTimer === sec && styles.activeTimerPillText,
                  ]}
                >
                  {formatTimerLabel(sec)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bottom Controls Bar */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.secondaryButton} onPress={toggleCameraFacing}>
            <Text style={styles.buttonText}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          {latestPhoto ? (
            <TouchableOpacity 
              style={styles.thumbnailContainer} 
              onPress={() => setIsGalleryOpen(true)}
            >
              <Image source={{ uri: latestPhoto.uri }} style={styles.thumbnailImage} />
              <View style={styles.badgeCount}>
                <Text style={styles.badgeCountText}>{photos.length}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.emptyGalleryButton}
              onPress={() => setIsGalleryOpen(true)}
            >
              <Text style={styles.emptyGalleryIcon}>🖼️</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* GALLERY GRID MODAL */}
      <Modal visible={isGalleryOpen} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.galleryModalContainer}>
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>
              {isBatchMode ? `Selected (${batchSelectedIds.length})` : 'Active Temp Photos'}
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {isBatchMode && (
                <TouchableOpacity 
                  style={styles.batchCancelButton}
                  onPress={() => {
                    setIsBatchMode(false);
                    setBatchSelectedIds([]);
                  }}
                >
                  <Text style={styles.batchCancelText}>Cancel</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.galleryCloseButton} 
                onPress={() => {
                  setIsGalleryOpen(false);
                  setIsBatchMode(false);
                  setBatchSelectedIds([]);
                }}
              >
                <Text style={styles.closeButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {photos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No active temporary photos.</Text>
              <Text style={styles.emptySubtext}>
                Snaps taken with TempCam will appear here until they self-destruct.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.gridContainer}>
              {photos.map((item) => {
                const isBatchSelected = batchSelectedIds.includes(item.id);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.gridItem,
                      isBatchSelected && styles.selectedGridItem,
                    ]}
                    onPress={() => {
                      if (isBatchMode) {
                        toggleBatchSelect(item.id);
                      } else {
                        setSelectedPhoto(item);
                        setIsPreviewOpen(true);
                      }
                    }}
                    onLongPress={() => handleLongPress(item)}
                    delayLongPress={350}
                    activeOpacity={0.7}
                  >
                    <Image source={{ uri: item.uri }} style={styles.gridImage} />
                    
                    {isBatchSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>✓</Text>
                      </View>
                    )}

                    <View style={styles.gridTimerBadge}>
                      <Text style={styles.gridTimerText}>
                        🔥 {formatRemainingTime(item.expiresAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Batch Action Toolbar */}
          {isBatchMode && batchSelectedIds.length > 0 && (
            <View style={styles.batchToolbar}>
              <TouchableOpacity 
                style={[styles.batchActionButton, { backgroundColor: '#28A745' }]} 
                onPress={handleBatchSave}
              >
                <Text style={styles.batchActionText}>Save Selected</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.batchActionButton, { backgroundColor: '#D9534F' }]} 
                onPress={handleBatchDelete}
              >
                <Text style={styles.batchActionText}>Delete Selected</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* FULL-SCREEN SINGLE PHOTO MODAL */}
      {selectedPhoto && (
        <Modal visible={isPreviewOpen} animationType="fade" transparent={false}>
          <SafeAreaView style={styles.modalContainer}>
            <Image source={{ uri: selectedPhoto.uri }} style={styles.fullImage} />
            
            <View style={styles.expirationBadge}>
              <Text style={styles.expirationBadgeText}>
                🔥 Self-destructs in: {formatRemainingTime(selectedPhoto.expiresAt)}
              </Text>
            </View>

            <View style={styles.previewActionsRow}>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={() => saveToCameraRoll(selectedPhoto.uri)}
              >
                <Text style={styles.saveButtonText}>Save 📥</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.sharePreviewButton} 
                onPress={() => sharePhoto(selectedPhoto.uri)}
              >
                <Text style={styles.sharePreviewText}>Share 📤</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.deleteEarlyButton} 
                onPress={() => deletePhotoEarly(selectedPhoto.id)}
              >
                <Text style={styles.deleteEarlyText}>Delete</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => setIsPreviewOpen(false)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 20,
    color: '#FFF',
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 10,
  },
  titleText: {
    color: '#FF4500',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  subtitleText: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 2,
  },
  timerSelectorContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  timerHeaderLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  timerPillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  timerPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeTimerPill: {
    backgroundColor: '#FF4500',
  },
  timerPillText: {
    color: '#CCC',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTimerPillText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF4500',
  },
  secondaryButton: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    width: 60,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  thumbnailContainer: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF4500',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  emptyGalleryButton: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  emptyGalleryIcon: {
    fontSize: 22,
  },
  badgeCount: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#FF4500',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  galleryModalContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  galleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  galleryTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  galleryCloseButton: {
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 15,
  },
  batchCancelButton: {
    backgroundColor: '#444',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 15,
  },
  batchCancelText: {
    color: '#AAA',
    fontWeight: 'bold',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 12,
    paddingBottom: 90,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  selectedGridItem: {
    borderWidth: 3,
    borderColor: '#FF4500',
    borderRadius: 10,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FF4500',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  selectedBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridTimerBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  gridTimerText: {
    color: '#FF4500',
    fontSize: 10,
    fontWeight: 'bold',
  },
  batchToolbar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  batchActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  batchActionText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#777',
    fontSize: 14,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '70%',
    resizeMode: 'contain',
  },
  expirationBadge: {
    position: 'absolute',
    top: 60,
    backgroundColor: 'rgba(255, 69, 0, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  expirationBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  previewActionsRow: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    gap: 8,
  },
  saveButton: {
    backgroundColor: '#28A745',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  sharePreviewButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  sharePreviewText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  deleteEarlyButton: {
    backgroundColor: '#D9534F',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  deleteEarlyText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});