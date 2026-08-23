import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CameraScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  if (!cameraPermission) return <View />;

  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
          <Text style={styles.buttonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;

    // Check/Request Media Library Permission on Button Press
    if (!mediaPermission?.granted) {
      const permission = await requestMediaPermission();
      if (!permission.granted) {
        alert("Permission to save photos was denied!");
        return;
      }
    }

    try {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo?.uri) {
        await MediaLibrary.saveToLibraryAsync(photo.uri);
        setLastPhoto(photo.uri);
        alert("Photo captured and saved!");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to take photo");
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          {/* Gallery Preview Thumbnail */}
          <View style={styles.previewBox}>
            {lastPhoto ? (
              <Image source={{ uri: lastPhoto }} style={styles.thumbnail} />
            ) : (
              <View style={styles.emptyThumbnail} />
            )}
          </View>

          {/* Shutter Button */}
          <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
            <View style={styles.innerShutter} />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  text: { color: '#fff', textAlign: 'center', marginTop: 100 },
  button: { backgroundColor: '#ff5500', padding: 15, borderRadius: 10, alignSelf: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  buttonContainer: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerShutter: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#ff3b30',
  },
  previewBox: { width: 50, height: 50, borderRadius: 10, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%' },
  emptyThumbnail: { width: '100%', height: '100%', backgroundColor: '#333' },
});