// The pinned embedding dimension (blueprint 9.2 Chunk.embedding vector(embedding_dim), 9.7 CorpusVersion.embedding_dim,
// ADR-009 second branch: multilingual-e5-small, 384 dimensions). chunk.embedding is declared with this constant and
// corpus_version.embedding_dim must equal it (AC-ING-13).
export const EMBEDDING_DIM = 384;
