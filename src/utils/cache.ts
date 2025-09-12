interface CacheItem<T> {
   value: T;
   expiresAt: number;
}

export class Cache<T> {
   private cache: Map<string, CacheItem<T>>;
   private readonly ttl: number;
   private readonly maxSize: number;

   constructor(
      options: {
         ttlMinutes?: number;
         maxSize?: number;
      } = {}
   ) {
      this.cache = new Map();
      this.ttl = (options.ttlMinutes || 15) * 60 * 1000;
      this.maxSize = options.maxSize || 1000;
   }

   set(key: string, value: T): void {
      if (this.cache.size >= this.maxSize) {
         this.cleanup();
         if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey!);
         }
      }

      this.cache.set(key, {
         value,
         expiresAt: Date.now() + this.ttl
      });
   }

   get(key: string): T | null {
      const item = this.cache.get(key);

      if (!item) {
         return null;
      }

      if (Date.now() > item.expiresAt) {
         this.cache.delete(key);
         return null;
      }

      return item.value;
   }

   del(key: string): void {
      this.cache.delete(key);
   }

   clear(): void {
      this.cache.clear();
   }

   cleanup(): void {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
         if (now > item.expiresAt) {
            this.cache.delete(key);
         }
      }
   }

   has(key: string): boolean {
      const item = this.cache.get(key);
      if (!item) return false;
      return Date.now() <= item.expiresAt;
   }

   setMany(items: { key: string; value: T }[]): void {
      items.forEach((item) => this.set(item.key, item.value));
   }

   getMany(keys: string[]): (T | null)[] {
      return keys.map((key) => this.get(key));
   }

   update<K extends keyof T>(key: string, updater: (currentValue: T) => T): T | null {
      const currentItem = this.cache.get(key);

      if (!currentItem) {
         return null;
      }

      if (Date.now() > currentItem.expiresAt) {
         this.cache.delete(key);
         return null;
      }

      // Apply the updater function to get the new value
      const updatedValue = updater(currentItem.value);
      this.cache.delete(key);
      // Update the cache with the new value
      this.cache.set(key, {
         value: updatedValue,
         expiresAt: currentItem.expiresAt // Keep the same expiration time
      });

      return updatedValue;
   }
}
