export function serializeDoc(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

export function serializeDocs(docs) {
  return JSON.parse(JSON.stringify(docs));
}
