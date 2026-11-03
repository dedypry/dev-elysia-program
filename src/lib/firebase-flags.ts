import { get, ref } from "firebase/database";
import { db } from "../configs/firebase";

export async function readCopyDbFlag(): Promise<boolean> {
  const snapshot = await get(ref(db, "copy_db"));
  return snapshot.val() === true;
}
