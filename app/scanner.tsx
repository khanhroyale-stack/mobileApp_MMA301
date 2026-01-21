// app/scanner.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import {
  analyzeImage,
  VocabResult,
  testAPIConnection,
} from "../src/services/geminiService";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VocabResult | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  useEffect(() => {
    testAPIConnection().then((result) => {
      console.log("API Test Result:", result);
      if (!result.success) {
        Alert.alert("API Error", result.error);
      }
    });
  }, []);
  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={{ marginBottom: 10 }}>
          Cần quyền truy cập Camera để học từ vựng
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Cấp quyền</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current && !loading) {
      setLoading(true);
      try {
        // Chụp ảnh
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
        });

        // Resize để giảm dung lượng
        const manipResult = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 800 } }],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        if (!manipResult.base64) {
          throw new Error("Không thể xử lý ảnh");
        }

        // Gọi API
        const data = await analyzeImage(manipResult.base64);

        if (data) {
          setResult(data);
        } else {
          Alert.alert("Lỗi", "AI không trả về kết quả hợp lệ");
        }
      } catch (error: any) {
        console.error("Scanner Error:", error);

        // Xử lý từng loại lỗi cụ thể
        if (error.message === "RATE_LIMIT_EXCEEDED") {
          Alert.alert(
            "Vượt quá giới hạn",
            "Bạn đã dùng hết lượt miễn phí (15 requests/phút).\n\n" +
              "Giải pháp:\n" +
              "1. Đợi 60 giây rồi thử lại\n" +
              "2. Tạo API key mới tại ai.google.dev\n" +
              "3. Kích hoạt billing (vẫn free đến $200/tháng)",
            [{ text: "OK" }]
          );
        } else if (error.message === "INVALID_API_KEY") {
          Alert.alert(
            "API Key không hợp lệ",
            "Vui lòng:\n" +
              "1. Kiểm tra lại API key trong .env\n" +
              "2. Tạo key mới tại https://ai.google.dev/\n" +
              "3. Đảm bảo đã enable Gemini API",
            [{ text: "OK" }]
          );
        } else if (error.message === "ALL_MODELS_FAILED") {
          Alert.alert(
            "Không thể kết nối AI",
            "Tất cả models đều thất bại.\n\n" +
              "Kiểm tra:\n" +
              "- Kết nối internet\n" +
              "- API key còn hạn\n" +
              "- Gemini API đã được bật",
            [{ text: "OK" }]
          );
        } else {
          Alert.alert(
            "Lỗi không xác định",
            error.message || "Không thể chụp/phân tích ảnh",
            [{ text: "OK" }]
          );
        }
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="back">
        {/* Nút Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={30} color="white" />
        </TouchableOpacity>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#00ff00" />
            <Text style={styles.loadingText}>AI đang phân tích...</Text>
            <Text style={styles.loadingSubtext}>Có thể mất 3-5 giây</Text>
          </View>
        )}

        {/* Nút Chụp */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.captureBtn, loading && { opacity: 0.5 }]}
            onPress={takePicture}
            disabled={loading}
          />
        </View>
      </CameraView>

      {/* Modal Kết quả */}
      {result && (
        <Modal animationType="slide" transparent={true} visible={!!result}>
          <View style={styles.modalContainer}>
            <View style={styles.card}>
              <Text style={styles.word}>{result.word}</Text>
              <Text style={styles.phonetic}>/{result.type}/</Text>
              <Text style={styles.meaning}>{result.meaning}</Text>
              <View style={styles.separator} />
              <Text style={styles.sentence}>📝 {result.sentence}</Text>

              <TouchableOpacity
                style={[styles.btn, { marginTop: 20, width: "100%" }]}
                onPress={() => setResult(null)}
              >
                <Text style={styles.btnText}>Chụp tiếp ✨</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  camera: { flex: 1 },
  backBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 25,
    padding: 8,
  },
  bottomBar: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "white",
    borderWidth: 5,
    borderColor: "#3498db",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  loadingText: {
    color: "white",
    marginTop: 15,
    fontSize: 18,
    fontWeight: "bold",
  },
  loadingSubtext: {
    color: "#bbb",
    marginTop: 5,
    fontSize: 14,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  card: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  word: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  phonetic: {
    fontSize: 16,
    color: "#7f8c8d",
    marginBottom: 5,
    fontStyle: "italic",
  },
  meaning: {
    fontSize: 24,
    color: "#e74c3c",
    marginBottom: 15,
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: "#eee",
    width: "100%",
    marginVertical: 10,
  },
  sentence: {
    fontSize: 16,
    color: "#34495e",
    textAlign: "center",
    lineHeight: 24,
  },
  btn: {
    backgroundColor: "#3498db",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
