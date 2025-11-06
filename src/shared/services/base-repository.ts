/**
 * Base Repository Class
 * Provides common CRUD operations and query patterns following DRY principles
 */

import * as admin from 'firebase-admin';
import { IStructuredLogger } from '../observability/logger';

/**
 * Base repository class to eliminate code duplication in data access
 */
export abstract class BaseRepository<T> {
  protected firestore: admin.firestore.Firestore;
  protected logger: IStructuredLogger;
  protected collectionName: string;

  constructor(
    firestore: admin.firestore.Firestore,
    logger: IStructuredLogger,
    collectionName: string
  ) {
    this.firestore = firestore;
    this.logger = logger;
    this.collectionName = collectionName;
  }

  /**
   * Generic method to create a document
   */
  async create(data: Omit<T, 'id'>): Promise<T> {
    try {
      const docRef = await this.firestore.collection(this.collectionName).add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const doc = await docRef.get();
      return { id: docRef.id, ...doc.data() } as T;
    } catch (error) {
      this.logger.error(`Error creating document in ${this.collectionName}:`, { error, data });
      throw error;
    }
  }

  /**
   * Generic method to get a document by ID
   */
  async getById(id: string): Promise<T | null> {
    try {
      const doc = await this.firestore.collection(this.collectionName).doc(id).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return { id: doc.id, ...doc.data() } as T;
    } catch (error) {
      this.logger.error(`Error getting document ${id} from ${this.collectionName}:`, { error, id });
      throw error;
    }
  }

  /**
   * Generic method to update a document
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      const docRef = this.firestore.collection(this.collectionName).doc(id);
      
      await docRef.update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() } as T;
    } catch (error) {
      this.logger.error(`Error updating document ${id} in ${this.collectionName}:`, { error, id, data });
      throw error;
    }
  }

  /**
   * Generic method to delete a document
   */
  async delete(id: string): Promise<void> {
    try {
      await this.firestore.collection(this.collectionName).doc(id).delete();
    } catch (error) {
      this.logger.error(`Error deleting document ${id} from ${this.collectionName}:`, { error, id });
      throw error;
    }
  }

  /**
   * Generic method to query documents with filters
   */
  async query(
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    orderBy?: { field: string; direction: 'asc' | 'desc' },
    limit?: number
  ): Promise<T[]> {
    try {
      let query = this.firestore.collection(this.collectionName) as FirebaseFirestore.Query;
      
      // Apply filters
      filters.forEach(filter => {
        query = query.where(filter.field, filter.operator, filter.value);
      });
      
      // Apply ordering
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction);
      }
      
      // Apply limit
      if (limit) {
        query = query.limit(limit);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      this.logger.error(`Error querying ${this.collectionName}:`, { error, filters, orderBy, limit });
      throw error;
    }
  }

  /**
   * Generic method to get all documents
   */
  async getAll(limit?: number): Promise<T[]> {
    try {
      let query = this.firestore.collection(this.collectionName) as FirebaseFirestore.Query;
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      this.logger.error(`Error getting all documents from ${this.collectionName}:`, { error, limit });
      throw error;
    }
  }

  /**
   * Generic method to count documents
   */
  async count(filters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>): Promise<number> {
    try {
      let query = this.firestore.collection(this.collectionName) as FirebaseFirestore.Query;
      
      if (filters) {
        filters.forEach(filter => {
          query = query.where(filter.field, filter.operator, filter.value);
        });
      }
      
      const snapshot = await query.get();
      return snapshot.size;
    } catch (error) {
      this.logger.error(`Error counting documents in ${this.collectionName}:`, { error, filters });
      throw error;
    }
  }

  /**
   * Generic method for batch operations
   */
  async batchCreate(items: Array<Omit<T, 'id'>>): Promise<T[]> {
    try {
      const batch = this.firestore.batch();
      const docRefs: admin.firestore.DocumentReference[] = [];
      
      items.forEach(item => {
        const docRef = this.firestore.collection(this.collectionName).doc();
        batch.set(docRef, {
          ...item,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        docRefs.push(docRef);
      });
      
      await batch.commit();
      
      // Get the created documents
      const docs = await Promise.all(docRefs.map(ref => ref.get()));
      return docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      this.logger.error(`Error batch creating documents in ${this.collectionName}:`, { error, count: items.length });
      throw error;
    }
  }

  /**
   * Generic method to check if document exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const doc = await this.firestore.collection(this.collectionName).doc(id).get();
      return doc.exists;
    } catch (error) {
      this.logger.error(`Error checking if document ${id} exists in ${this.collectionName}:`, { error, id });
      throw error;
    }
  }
}