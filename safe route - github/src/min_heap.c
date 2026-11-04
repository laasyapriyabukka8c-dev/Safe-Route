#include "min_heap.h"

#include <stdlib.h>

static bool item_precedes(HeapItem left, HeapItem right)
{
    return left.priority < right.priority ||
           (left.priority == right.priority && left.node < right.node);
}

bool min_heap_init(MinHeap *heap)
{
    heap->items = malloc(16 * sizeof(*heap->items));
    if (heap->items == NULL) {
        heap->size = 0;
        heap->capacity = 0;
        return false;
    }

    heap->size = 0;
    heap->capacity = 16;
    return true;
}

void min_heap_destroy(MinHeap *heap)
{
    free(heap->items);
    heap->items = NULL;
    heap->size = 0;
    heap->capacity = 0;
}

bool min_heap_push(MinHeap *heap, HeapItem item)
{
    if (heap->size == heap->capacity) {
        const size_t next_capacity = heap->capacity * 2;
        HeapItem *items = realloc(heap->items, next_capacity * sizeof(*items));
        if (items == NULL) {
            return false;
        }

        heap->items = items;
        heap->capacity = next_capacity;
    }

    size_t index = heap->size++;
    while (index > 0) {
        const size_t parent = (index - 1) / 2;
        if (!item_precedes(item, heap->items[parent])) {
            break;
        }

        heap->items[index] = heap->items[parent];
        index = parent;
    }

    heap->items[index] = item;
    return true;
}

bool min_heap_pop(MinHeap *heap, HeapItem *item)
{
    if (heap->size == 0) {
        return false;
    }

    *item = heap->items[0];
    const HeapItem last = heap->items[--heap->size];
    if (heap->size == 0) {
        return true;
    }

    size_t index = 0;
    while (index * 2 + 1 < heap->size) {
        size_t child = index * 2 + 1;
        if (child + 1 < heap->size &&
            item_precedes(heap->items[child + 1], heap->items[child])) {
            child++;
        }
        if (!item_precedes(heap->items[child], last)) {
            break;
        }

        heap->items[index] = heap->items[child];
        index = child;
    }

    heap->items[index] = last;
    return true;
}

bool min_heap_is_empty(const MinHeap *heap)
{
    return heap->size == 0;
}
