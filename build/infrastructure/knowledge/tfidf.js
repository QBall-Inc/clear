"use strict";
/**
 * TF-IDF Computation Utilities
 *
 * Pure TypeScript implementation of TF-IDF (Term Frequency-Inverse Document Frequency)
 * for knowledge entry similarity search.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TfIdfIndex = void 0;
exports.tokenize = tokenize;
exports.computeTermFrequency = computeTermFrequency;
exports.computeIdf = computeIdf;
exports.computeTfIdfVector = computeTfIdfVector;
exports.cosineSimilarity = cosineSimilarity;
/**
 * Stop words to exclude from TF-IDF computation
 */
const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
    'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'can', 'just', 'should', 'now', 'also',
    'into', 'over', 'after', 'before', 'between', 'through', 'during',
    'above', 'below', 'up', 'down', 'out', 'off', 'about', 'again',
    'then', 'once', 'here', 'there', 'any', 'our', 'your', 'their',
    'we', 'you', 'i', 'me', 'my', 'myself', 'ourselves', 'yourselves',
    'himself', 'herself', 'itself', 'themselves', 'been', 'being',
    'would', 'could', 'might', 'must', 'shall', 'may', 'need', 'dare',
    'ought', 'used', 'using', 'use', 'uses'
]);
/**
 * Minimum word length to include in TF-IDF
 */
const MIN_WORD_LENGTH = 2;
/**
 * Maximum terms to keep in sparse vector
 */
const MAX_VECTOR_TERMS = 50;
/**
 * Tokenize text into normalized terms
 * @param text - Text to tokenize
 * @returns Array of normalized tokens
 */
function tokenize(text) {
    if (!text)
        return [];
    return text
        .toLowerCase()
        // Remove punctuation and special characters
        .replace(/[^\w\s-]/g, ' ')
        // Split on whitespace
        .split(/\s+/)
        // Filter out stop words and short words
        .filter(word => word.length >= MIN_WORD_LENGTH &&
        !STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) // Exclude pure numbers
    );
}
/**
 * Compute term frequency for a document
 * @param tokens - Array of tokens
 * @returns Map of term -> frequency
 */
function computeTermFrequency(tokens) {
    const tf = new Map();
    for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
    }
    // Normalize by document length
    const docLength = tokens.length;
    if (docLength > 0) {
        for (const [term, count] of tf) {
            tf.set(term, count / docLength);
        }
    }
    return tf;
}
/**
 * Compute inverse document frequency for a corpus
 * @param documents - Array of tokenized documents
 * @returns Map of term -> IDF value
 */
function computeIdf(documents) {
    const idf = new Map();
    const docCount = documents.length;
    if (docCount === 0)
        return idf;
    // Count documents containing each term
    const docFreq = new Map();
    for (const doc of documents) {
        const uniqueTerms = new Set(doc);
        for (const term of uniqueTerms) {
            docFreq.set(term, (docFreq.get(term) || 0) + 1);
        }
    }
    // Compute IDF: log(N / df) + 1 (smoothed)
    for (const [term, df] of docFreq) {
        idf.set(term, Math.log(docCount / df) + 1);
    }
    return idf;
}
/**
 * Compute TF-IDF vector for a document
 * @param tokens - Document tokens
 * @param idf - Pre-computed IDF values
 * @returns Sparse TF-IDF vector
 */
function computeTfIdfVector(tokens, idf) {
    const tf = computeTermFrequency(tokens);
    const vector = {};
    // Compute TF-IDF for each term
    const scores = [];
    for (const [term, tfValue] of tf) {
        const idfValue = idf.get(term) || 1; // Default IDF of 1 for unknown terms
        const tfidf = tfValue * idfValue;
        if (tfidf > 0) {
            scores.push({ term, score: tfidf });
        }
    }
    // Sort by score and keep top N terms
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, MAX_VECTOR_TERMS);
    // Normalize to unit vector
    const magnitude = Math.sqrt(topScores.reduce((sum, { score }) => sum + score * score, 0));
    if (magnitude > 0) {
        for (const { term, score } of topScores) {
            vector[term] = parseFloat((score / magnitude).toFixed(4));
        }
    }
    return vector;
}
/**
 * Compute cosine similarity between two TF-IDF vectors
 * @param vectorA - First vector
 * @param vectorB - Second vector
 * @returns Similarity score (0-1)
 */
function cosineSimilarity(vectorA, vectorB) {
    // Since vectors are already normalized, dot product = cosine similarity
    let dotProduct = 0;
    // Iterate over smaller vector for efficiency
    const [smaller, larger] = Object.keys(vectorA).length <= Object.keys(vectorB).length
        ? [vectorA, vectorB]
        : [vectorB, vectorA];
    for (const term of Object.keys(smaller)) {
        if (term in larger) {
            dotProduct += smaller[term] * larger[term];
        }
    }
    return parseFloat(dotProduct.toFixed(4));
}
/**
 * TF-IDF Index Manager
 *
 * Manages IDF values across a corpus and computes TF-IDF vectors
 */
class TfIdfIndex {
    constructor() {
        this.idf = new Map();
        this.documents = new Map(); // docId -> tokens
    }
    /**
     * Add a document to the corpus
     * @param docId - Document identifier
     * @param text - Document text
     */
    addDocument(docId, text) {
        const tokens = tokenize(text);
        this.documents.set(docId, tokens);
    }
    /**
     * Remove a document from the corpus
     * @param docId - Document identifier
     */
    removeDocument(docId) {
        this.documents.delete(docId);
    }
    /**
     * Rebuild IDF values from all documents
     */
    rebuildIdf() {
        const allDocs = Array.from(this.documents.values());
        this.idf = computeIdf(allDocs);
    }
    /**
     * Get TF-IDF vector for a document
     * @param docId - Document identifier
     * @returns TF-IDF vector or empty object if not found
     */
    getVector(docId) {
        const tokens = this.documents.get(docId);
        if (!tokens)
            return {};
        return computeTfIdfVector(tokens, this.idf);
    }
    /**
     * Compute TF-IDF vector for a query (not in corpus)
     * @param query - Query text
     * @returns TF-IDF vector
     */
    getQueryVector(query) {
        const tokens = tokenize(query);
        return computeTfIdfVector(tokens, this.idf);
    }
    /**
     * Get all vectors for all documents
     * @returns Map of docId -> TF-IDF vector
     */
    getAllVectors() {
        const vectors = new Map();
        for (const docId of this.documents.keys()) {
            vectors.set(docId, this.getVector(docId));
        }
        return vectors;
    }
    /**
     * Search for similar documents
     * @param query - Query text
     * @param topK - Number of results to return
     * @param threshold - Minimum similarity threshold
     * @returns Array of [docId, similarity] sorted by similarity
     */
    search(query, topK = 10, threshold = 0.1) {
        const queryVector = this.getQueryVector(query);
        if (Object.keys(queryVector).length === 0) {
            return [];
        }
        const results = [];
        for (const docId of this.documents.keys()) {
            const docVector = this.getVector(docId);
            const similarity = cosineSimilarity(queryVector, docVector);
            if (similarity >= threshold) {
                results.push({ docId, similarity });
            }
        }
        // Sort by similarity descending
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, topK);
    }
    /**
     * Get IDF values for serialization
     */
    getIdfValues() {
        const idfObj = {};
        for (const [term, value] of this.idf) {
            idfObj[term] = parseFloat(value.toFixed(4));
        }
        return idfObj;
    }
    /**
     * Load IDF values from serialized form
     */
    loadIdfValues(idfObj) {
        this.idf.clear();
        for (const [term, value] of Object.entries(idfObj)) {
            this.idf.set(term, value);
        }
    }
    /**
     * Get document count
     */
    getDocumentCount() {
        return this.documents.size;
    }
    /**
     * Get term count (vocabulary size)
     */
    getTermCount() {
        return this.idf.size;
    }
    /**
     * Clear all data
     */
    clear() {
        this.idf.clear();
        this.documents.clear();
    }
}
exports.TfIdfIndex = TfIdfIndex;
//# sourceMappingURL=tfidf.js.map