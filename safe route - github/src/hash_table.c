#include "hash_table.h"

#include <stdlib.h>
#include <string.h>

static size_t hash_key(const char *key)
{
    size_t hash = 5381;

    while (*key != '\0') {
        hash = ((hash << 5) + hash) + (unsigned char)*key;
        key++;
    }

    return hash % HASH_TABLE_BUCKET_COUNT;
}

void hash_table_init(HashTable *table)
{
    memset(table->buckets, 0, sizeof(table->buckets));
}

void hash_table_destroy(HashTable *table)
{
    for (size_t i = 0; i < HASH_TABLE_BUCKET_COUNT; i++) {
        HashEntry *entry = table->buckets[i];

        while (entry != NULL) {
            HashEntry *next = entry->next;
            free(entry);
            entry = next;
        }

        table->buckets[i] = NULL;
    }
}

bool hash_table_insert(HashTable *table, const char *key, size_t value)
{
    const size_t bucket = hash_key(key);

    for (HashEntry *entry = table->buckets[bucket]; entry != NULL; entry = entry->next) {
        if (strcmp(entry->key, key) == 0) {
            entry->value = value;
            return true;
        }
    }

    HashEntry *entry = malloc(sizeof(*entry));
    if (entry == NULL || strlen(key) >= sizeof(entry->key)) {
        free(entry);
        return false;
    }

    strcpy(entry->key, key);
    entry->value = value;
    entry->next = table->buckets[bucket];
    table->buckets[bucket] = entry;
    return true;
}

bool hash_table_get(const HashTable *table, const char *key, size_t *value)
{
    const size_t bucket = hash_key(key);

    for (const HashEntry *entry = table->buckets[bucket]; entry != NULL; entry = entry->next) {
        if (strcmp(entry->key, key) == 0) {
            *value = entry->value;
            return true;
        }
    }

    return false;
}
