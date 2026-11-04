#ifndef SAFEROUTE_GRAPH_H
#define SAFEROUTE_GRAPH_H

#include "hash_table.h"

#include <stdbool.h>
#include <stddef.h>

#define GRAPH_MAX_NODES 32
#define GRAPH_MAX_ROADS 64
#define GRAPH_NAME_LENGTH 48
#define GRAPH_ROAD_NAME_LENGTH 64
#define GRAPH_ROAD_ID_LENGTH 8
#define GRAPH_MAX_ALTERNATIVE_ROUTES 3
#define GRAPH_MAX_CANDIDATE_ROUTES 128

typedef enum {
    ROAD_NORMAL = 0,
    ROAD_BLOCKED,
    ROAD_ACCIDENT,
    ROAD_CONGESTION
} RoadIncident;

typedef enum {
    ROUTE_FASTEST = 0,
    ROUTE_SHORTEST
} RoutePreference;

typedef enum {
    PRIORITY_STANDARD = 0,
    PRIORITY_CRITICAL
} EmergencyPriority;

typedef enum {
    ROUTE_MODE_STANDARD = 0,
    ROUTE_MODE_AMBULANCE
} RouteMode;

typedef struct Edge {
    int destination;
    size_t road_index;
    struct Edge *next;
} Edge;

typedef struct {
    int id;
    char name[GRAPH_NAME_LENGTH];
    double latitude;
    double longitude;
    Edge *edges;
} Node;

typedef struct {
    char id[GRAPH_ROAD_ID_LENGTH];
    char name[GRAPH_ROAD_NAME_LENGTH];
    int from;
    int to;
    int travel_time;
    RoadIncident incident;
} Road;

typedef struct {
    Node nodes[GRAPH_MAX_NODES];
    size_t node_count;
    Road roads[GRAPH_MAX_ROADS];
    size_t road_count;
    HashTable road_index;
} Graph;

typedef struct {
    bool reachable;
    bool alternate;
    bool recommended;
    int total_time;
    double distance_km;
    int generalized_cost;
    size_t incident_count;
    int nodes[GRAPH_MAX_NODES];
    size_t node_count;
    size_t road_indices[GRAPH_MAX_NODES];
    size_t road_count;
} Route;

bool graph_init(Graph *graph);
void graph_destroy(Graph *graph);
bool graph_find_road(const Graph *graph, const char *road_id, size_t *road_index);
bool graph_set_road_incident(Graph *graph, const char *road_id, RoadIncident incident);
bool graph_calculate_routes(const Graph *graph, int source, int destination,
                            RoutePreference preference, EmergencyPriority priority,
                            RouteMode mode,
                            Route routes[GRAPH_MAX_ALTERNATIVE_ROUTES], size_t *route_count);
bool graph_nearest_facility(const Graph *graph, int source, const char *facility_type,
                            RoutePreference preference, EmergencyPriority priority,
                            RouteMode mode,
                            Route *route);

#endif
