import { Document } from "mongoose";

function normalize<T>(doc: Document | any): T {
  if (!(doc instanceof Document)) {
    const id = doc._id;
    delete doc._id;
    delete doc.__v;
    return { id, ...doc };
  }
  const obj = doc.toObject({
    transform: (_doc, ret) => {
      if (ret._id) {
        // @ts-ignore: reason
        ret.id = ret._id.toString();
      }
      // @ts-ignore: reason
      delete ret._id;
      // @ts-ignore: reason
      delete ret.__v;
      return ret;
    },
  });
  return obj as T;
}

export function normalizeDoc<T>(doc: any | null): T | null {
  return doc ? normalize<T>(doc) : null;
}

export function normalizeDocs<T>(docs: any[]): T[] {
  return docs.map((doc) => normalize<T>(doc));
}
