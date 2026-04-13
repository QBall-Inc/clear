/**
 * TF-IDF Computation Utilities
 *
 * Pure TypeScript implementation of TF-IDF (Term Frequency-Inverse Document Frequency)
 * for knowledge entry similarity search.
 */
import { TfIdfVector } from './types';
/**
 * Tokenize text into normalized terms
 * @param text - Text to tokenize
 * @returns Array of normalized tokens
 */
export declare function tokenize(text: string): string[];
/**
 * Compute term frequency for a document
 * @param tokens - Array of tokens
 * @returns Map of term -> frequency
 */
export declare function computeTermFrequency(tokens: string[]): Map<string, number>;
/**
 * Compute inverse document frequency for a corpus
 * @param documents - Array of tokenized documents
 * @returns Map of term -> IDF value
 */
export declare function computeIdf(documents: string[][]): Map<string, number>;
/**
 * Compute TF-IDF vector for a document
 * @param tokens - Document tokens
 * @param idf - Pre-computed IDF values
 * @returns Sparse TF-IDF vector
 */
export declare function computeTfIdfVector(tokens: string[], idf: Map<string, number>): TfIdfVector;
/**
 * Compute cosine similarity between two TF-IDF vectors
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Similarity score (0-1)
 */
export declare function cosineSimilarity(vectorA: TfIdfVector, vectorB: TfIdfVector): number;
/**
 * TF-IDF Index Manager
 *
 * Manages IDF values across a corpus and computes TF-IDF vectors
 */
export declare class TfIdfIndex {
    private idf;
    private documents;
    /**
     * Add a document to the corpus
     * @param docId - Document identifier
     * @param text - Document text
     */
    addDocument(docId: string, text: string): void;
    /**
     * Remove a document from the corpus
     * @param docId - Document identifier
     */
    removeDocument(docId: string): void;
    /**
     * Rebuild IDF values from all documents
     */
    rebuildIdf(): void;
    /**
     * Get TF-IDF vector for a document
     * @param docId - Document identifier
     * @returns TF-IDF vector or empty object if not found
     */
    getVector(docId: string): TfIdfVector;
    /**
     * Compute TF-IDF vector for a query (not in corpus)
     * @param query - Query text
     * @returns TF-IDF vector
     */
    getQueryVector(query: string): TfIdfVector;
    /**
     * Get all vectors for all documents
     * @returns Map of docId -> TF-IDF vector
     */
    getAllVectors(): Map<string, TfIdfVector>;
    /**
     * Search for similar documents
     * @param query - Query text
     * @param topK - Number of results to return
     * @param threshold - Minimum similarity threshold
     * @returns Array of [docId, similarity] sorted by similarity
     */
    search(query: string, topK?: number, threshold?: number): Array<{
        docId: string;
        similarity: number;
    }>;
    /**
     * Get IDF values for serialization
     */
    getIdfValues(): Record<string, number>;
    /**
     * Load IDF values from serialized form
     */
    loadIdfValues(idfObj: Record<string, number>): void;
    /**
     * Get document count
     */
    getDocumentCount(): number;
    /**
     * Get term count (vocabulary size)
     */
    getTermCount(): number;
    /**
     * Clear all data
     */
    clear(): void;
}
//# sourceMappingURL=tfidf.d.ts.map