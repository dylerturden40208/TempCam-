import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const STORAGE_KEY = '@ephemeral_photos_v1';
const { width } = Dimensions.get('window');

interface EphemeralPhoto {
  id: string;
  uri: string;
  createdAt: number; // Unix timestamp
}

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState<EphemeralPhoto[]>([]);
  const [viewMode, setViewMode] = useState<'camera' | 'gallery'>('camera');
  const cameraRef = useRef<any>(null);

  // Load photos and purge expired ones on launch
  useEffect(() => {
    loadAndPurgePhotos();
  }, []);

  const loadAndPurgePhotos = async () => {
    try {
      const storedData = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const parsedPhotos: EphemeralPhoto[] = JSON.parse(storedData);
        const now = Date.now();

        // Filter out photos older than 7 days
        const validPhotos = parsedPhotos.filter((item) => now - item.createdAt < SEVEN_DAYS_MS);

        // Update storage if any expired photos were removed
        if (validPhotos.length !== parsedPhotos.length) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validPhotos));
        }

        setPhotos(validPhotos);
      }
    } catch (e) {
      console.error('Failed to load photos from storage', e);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const options = { quality: 0.8 };
      const data = await cameraRef.current.takePictureAsync(options);
      
      const newPhoto: EphemeralPhoto = {
        id: Date.now().toString(),
        uri: data.uri,
        createdAt: Date.now(),
      };

      const updatedPhotos = [newPhoto, ...photos];
      setPhotos(updatedPhotos);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPhotos));
    }
  };

  const saveToPermanentGallery = async (photoUri: string) => {
    if (!mediaPermission?.granted) {
      const permissionResult = await requestMediaPermission();
      if (!permissionResult.granted) return;
    }
    await MediaLibrary.saveToLibraryAsync(photoUri);
    alert('Saved permanently to your iPhone Camera Roll!');
  };

  const deletePhotoNow = async (id: string) => {
    const updatedPhotos = photos.filter((p) => p.id !== id);
    setPhotos(updatedPhotos);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPhotos));
  };

  const getTimeRemaining = (createdAt: number) => {
    const elapsed = Date.now() - createdAt;
    const remainingMs = Math.max(0, SEVEN_DAYS_MS - elapsed);
    
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission required.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={[styles.navTab, viewMode === 'camera' && styles.activeTab]} 
          onPress={() => setViewMode('camera')}>
          <Text style={styles.navText}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.navTab, viewMode === 'gallery' && styles.activeTab]} 
          onPress={() => {
            loadAndPurgePhotos();
            setViewMode('gallery');
          }}>
          <Text style={styles.navText}>Ephemeral Vault ({photos.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Camera View Mode */}
      {viewMode === 'camera' ? (
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      ) : (
        /* Gallery View Mode */
        <View style={styles.galleryContainer}>
          {photos.length === 0 ? (
            <Text style={styles.emptyText}>No ephemeral photos stored right now.</Text>
          ) : (
            <FlatList
              data={photos}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Image source={{ uri: item.uri }} style={styles.cardImage} />
                  <View style={styles.cardOverlay}>
                    <Text style={styles.timerBadge}>
                      Expires in: {getTimeRemaining(item.createdAt)}
                    </Text>
                    <View style={styles.cardActions}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.deleteBtn]} 
                        onPress={() => deletePhotoNow(item.id)}>
                        <Text style={styles.btnText}>Delete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.keepBtn]} 
                        onPress={() => saveToPermanentGallery(item.uri)}>
                        <Text style={styles.btnText}>Keep</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  navHeader: {
    flexDirection: 'row',
    paddingTop: 55,
    paddingBottom: 15,
    backgroundColor: '#111',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  navTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: '#333',
  },
  navText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  message: {
    color: '#fff',
    textAlign: 'center',
    margin: 20,
  },
  camera: {
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  galleryContainer: {
    flex: 1,
    padding: 12,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 100,
    fontSize: 16,
  },
  card: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: '100%',
    height: width * 1.1,
    borderRadius: 16,
  },
  cardOverlay: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  timerBadge: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 13,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  deleteBtn: {
    backgroundColor: '#333',
  },
  keepBtn: {
    backgroundColor: '#34C759',
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});