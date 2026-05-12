import { db } from "../firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import type { Extinguisher } from "../types/extinguisher";

const COLLECTION_NAME = "extinguishers";

export const getAllExtinguishers = async (): Promise<Extinguisher[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
  return querySnapshot.docs.map(doc => doc.data() as Extinguisher);
};

export const saveExtinguisher = async (fe: Extinguisher) => {
  await setDoc(doc(db, COLLECTION_NAME, fe.id), fe);
};

export const updateExtinguisher = saveExtinguisher;

export const deleteExtinguisher = async (id: string) => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};
