#include "priority_queue.h"

bool priority_queue_init(PriorityQueue *queue)
{
    return min_heap_init(queue);
}

void priority_queue_destroy(PriorityQueue *queue)
{
    min_heap_destroy(queue);
}

bool priority_queue_enqueue(PriorityQueue *queue, PriorityItem item)
{
    return min_heap_push(queue, item);
}

bool priority_queue_dequeue(PriorityQueue *queue, PriorityItem *item)
{
    return min_heap_pop(queue, item);
}

bool priority_queue_is_empty(const PriorityQueue *queue)
{
    return min_heap_is_empty(queue);
}
