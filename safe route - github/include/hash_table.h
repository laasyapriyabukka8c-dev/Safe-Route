#ifndef SAFEROUTE_HASH_TABLE_H
#define SAFEROUTE_HASH_TABLE_H

#include <stdbool.h>
#include <stddef.h>

#define HASH_TABLE_BUCKET_COUNT 31

typedef struct HashEntry {
    char key[16];
    size_t value;
    struct HashEntry *next;
} HashEntry;

typedef struct {
    HashEntry *buckets[HASH_TABLE_BUCKET_COUNT];
} HashTable;

void hash_table_init(HashTable *table);
void hash_table_destroy(HashTable *table);
bool hash_table_insert(HashTable *table, const char *key, size_t value);
bool hash_table_get(const HashTable *table, const char *key, size_t *value);

#endif
