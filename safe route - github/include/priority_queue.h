#ifndef SAFEROUTE_PRIORITY_QUEUE_H
#define SAFEROUTE_PRIORITY_QUEUE_H

#include "min_heap.h"

typedef MinHeap PriorityQueue;
typedef HeapItem PriorityItem;

bool priority_queue_init(PriorityQueue *queue);
void priority_queue_destroy(PriorityQueue *queue);
bool priority_queue_enqueue(PriorityQueue *queue, PriorityItem item);
bool priority_queue_dequeue(PriorityQueue *queue, PriorityItem *item);
bool priority_queue_is_empty(const PriorityQueue *queue);

#endif
