import { db } from "./firebase";
import { doc, setDoc, getDocs, collection } from "firebase/firestore";

export const initFirebaseSync = async () => {
  try {
    const localData = localStorage.getItem("bkms_extinguishers");
    if (localData && localData !== "[]") {
      const extinguishers = JSON.parse(localData);
      for (const fe of extinguishers) {
        await setDoc(doc(db, "extinguishers", fe.id), fe);
      }
      console.log("✅ 데이터 클라우드 이사 완료!");
    } else {
      const querySnapshot = await getDocs(collection(db, "extinguishers"));
      const cloudData = querySnapshot.docs.map(doc => doc.data());
      if (cloudData.length > 0) {
        localStorage.setItem("bkms_extinguishers", JSON.stringify(cloudData));
      }
    }
  } catch (error) {
    console.error("동기화 실패:", error);
  }
};
