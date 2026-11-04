#ifndef SAFEROUTE_MIN_HEAP_H
#define SAFEROUTE_MIN_HEAP_H

#include <stdbool.h>
#include <stddef.h>

typedef struct {
    int node;
    int priority;
} HeapItem;

typedef struct {
    HeapItem *items;
    size_t size;
    size_t capacity;
} MinHeap;

bool min_heap_init(MinHeap *heap);
void min_heap_destroy(MinHeap *heap);
bool min_heap_push(MinHeap *heap, HeapItem item);
bool min_heap_pop(MinHeap *heap, HeapItem *item);
bool min_heap_is_empty(const MinHeap *heap);

#endif
