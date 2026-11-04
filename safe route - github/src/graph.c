#include "graph.h"
#include "priority_queue.h"

#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

static bool add_node(Graph *graph, const char *name, double latitude, double longitude)
{
    if (graph->node_count == GRAPH_MAX_NODES) {
        return false;
    }

    Node *node = &graph->nodes[graph->node_count];
    node->id = (int)graph->node_count;
    if (strlen(name) >= sizeof(node->name)) {
        return false;
    }

    strcpy(node->name, name);
    node->latitude = latitude;
    node->longitude = longitude;
    node->edges = NULL;
    graph->node_count++;
    return true;
}

static double road_distance_km(const Graph *graph, const Road *road)
{
    const Node *from = &graph->nodes[road->from];
    const Node *to = &graph->nodes[road->to];
    const double radians = 0.017453292519943295;
    const double latitude_delta = (to->latitude - from->latitude) * radians;
    const double longitude_delta = (to->longitude - from->longitude) * radians;
    const double from_latitude = from->latitude * radians;
    const double to_latitude = to->latitude * radians;
    const double sin_latitude = sin(latitude_delta / 2.0);
    const double sin_longitude = sin(longitude_delta / 2.0);
    double haversine = sin_latitude * sin_latitude +
        cos(from_latitude) * cos(to_latitude) *
        sin_longitude * sin_longitude;

    if (haversine > 1.0) haversine = 1.0;
    return 6371.0 * 2.0 * asin(sqrt(haversine));
}

static bool add_road(Graph *graph, const char *id, const char *name,
                     int from, int to, int travel_time)
{
    if (graph->road_count == GRAPH_MAX_ROADS || from < 0 || to < 0 ||
        (size_t)from >= graph->node_count || (size_t)to >= graph->node_count ||
        travel_time <= 0 || strlen(id) >= GRAPH_ROAD_ID_LENGTH ||
        strlen(name) >= GRAPH_ROAD_NAME_LENGTH) {
        return false;
    }

    const size_t road_index = graph->road_count;
    Road *road = &graph->roads[road_index];
    strcpy(road->id, id);
    strcpy(road->name, name);
    road->from = from;
    road->to = to;
    road->travel_time = travel_time;
    road->incident = ROAD_NORMAL;

    Edge *forward = malloc(sizeof(*forward));
    Edge *reverse = malloc(sizeof(*reverse));
    if (forward == NULL || reverse == NULL) {
        free(forward);
        free(reverse);
        return false;
    }

    forward->destination = to;
    forward->road_index = road_index;
    forward->next = graph->nodes[from].edges;
    reverse->destination = from;
    reverse->road_index = road_index;
    reverse->next = graph->nodes[to].edges;

    if (!hash_table_insert(&graph->road_index, id, road_index)) {
        free(forward);
        free(reverse);
        return false;
    }

    graph->nodes[from].edges = forward;
    graph->nodes[to].edges = reverse;
    graph->road_count++;
    return true;
}

bool graph_init(Graph *graph)
{
    memset(graph, 0, sizeof(*graph));
    hash_table_init(&graph->road_index);

    if (!add_node(graph, "Gachibowli", 17.4401, 78.3489) ||
        !add_node(graph, "AIG Hospitals", 17.4375, 78.3565) ||
        !add_node(graph, "HITEC City", 17.4434, 78.3772) ||
        !add_node(graph, "Raidurg Metro", 17.4391, 78.3814) ||
        !add_node(graph, "Madhapur", 17.4483, 78.3915) ||
        !add_node(graph, "Jubilee Hills Check Post", 17.4305, 78.4070) ||
        !add_node(graph, "Apollo Hospitals Jubilee Hills", 17.4239, 78.4126) ||
        !add_node(graph, "Banjara Hills", 17.4157, 78.4480) ||
        !add_node(graph, "CARE Hospitals Banjara Hills", 17.4167, 78.4554) ||
        !add_node(graph, "Mehdipatnam", 17.3933, 78.4372) ||
        !add_node(graph, "Lakdikapul", 17.4008, 78.4650) ||
        !add_node(graph, "Nampally", 17.3857, 78.4743) ||
        !add_node(graph, "Abids", 17.3891, 78.4781) ||
        !add_node(graph, "Charminar", 17.3616, 78.4747) ||
        !add_node(graph, "Osmania General Hospital", 17.3716, 78.4805) ||
        !add_node(graph, "Secunderabad Station", 17.4348, 78.5013) ||
        !add_node(graph, "Yashoda Hospitals Secunderabad", 17.4412, 78.4980) ||
        !add_node(graph, "KIMS Hospitals Secunderabad", 17.4431, 78.4932) ||
        !add_node(graph, "Begumpet", 17.4370, 78.4570) ||
        !add_node(graph, "Ameerpet", 17.4374, 78.4483) ||
        !add_node(graph, "Tarnaka", 17.4281, 78.5350) ||
        !add_node(graph, "Uppal", 17.4010, 78.5600) ||
        !add_node(graph, "Continental Hospitals", 17.4151, 78.3440) ||
        !add_node(graph, "Gandhi Hospital", 17.4244, 78.5007) ||
        !add_node(graph, "LB Nagar", 17.3457, 78.5522) ||
        !add_road(graph, "R1", "Gachibowli Road", 0, 1, 5) ||
        !add_road(graph, "R2", "Gachibowli - Continental corridor", 0, 22, 8) ||
        !add_road(graph, "R3", "Old Mumbai Highway", 0, 2, 9) ||
        !add_road(graph, "R4", "HITEC City Road", 1, 2, 8) ||
        !add_road(graph, "R5", "Raidurg Link Road", 2, 3, 4) ||
        !add_road(graph, "R6", "Madhapur Road", 3, 4, 7) ||
        !add_road(graph, "R7", "HITEC City - Madhapur Road", 2, 4, 8) ||
        !add_road(graph, "R8", "Madhapur Road", 4, 5, 8) ||
        !add_road(graph, "R9", "Raidurg - Jubilee Hills Road", 3, 5, 9) ||
        !add_road(graph, "R10", "Road No. 36", 5, 6, 4) ||
        !add_road(graph, "R11", "Jubilee Hills Road No. 10", 6, 7, 10) ||
        !add_road(graph, "R12", "Jubilee Hills - Banjara Hills Road", 5, 7, 12) ||
        !add_road(graph, "R13", "Road No. 1, Banjara Hills", 7, 8, 4) ||
        !add_road(graph, "R14", "Banjara Hills Road No. 1", 7, 10, 9) ||
        !add_road(graph, "R15", "Mehdipatnam - Banjara Hills Road", 9, 7, 8) ||
        !add_road(graph, "R16", "Mehdipatnam Road", 9, 10, 9) ||
        !add_road(graph, "R17", "Lakdikapul Road", 10, 11, 6) ||
        !add_road(graph, "R18", "Nampally Road", 11, 12, 5) ||
        !add_road(graph, "R19", "Abids - Charminar Road", 12, 13, 12) ||
        !add_road(graph, "R20", "Charminar - Osmania Hospital Road", 13, 14, 6) ||
        !add_road(graph, "R21", "Afzalgunj Road", 12, 14, 7) ||
        !add_road(graph, "R22", "Secunderabad - Abids corridor", 12, 15, 13) ||
        !add_road(graph, "R23", "Station Road", 15, 16, 4) ||
        !add_road(graph, "R24", "SP Road", 15, 17, 5) ||
        !add_road(graph, "R25", "Begumpet Road", 17, 18, 8) ||
        !add_road(graph, "R26", "Ameerpet Road", 18, 19, 6) ||
        !add_road(graph, "R27", "Ameerpet - Banjara Hills Road", 19, 7, 7) ||
        !add_road(graph, "R28", "Begumpet - Secunderabad Road", 18, 15, 9) ||
        !add_road(graph, "R29", "Tarnaka Road", 15, 20, 7) ||
        !add_road(graph, "R30", "Uppal Main Road", 20, 21, 10) ||
        !add_road(graph, "R31", "Uppal - Charminar corridor", 21, 13, 18) ||
        !add_road(graph, "R32", "Begumpet - Lakdikapul Road", 10, 18, 10) ||
        !add_road(graph, "R33", "Padmarao Nagar Road", 23, 15, 7) ||
        !add_road(graph, "R34", "Gandhi Hospital - Abids Road", 23, 12, 10) ||
        !add_road(graph, "R35", "LB Nagar - Charminar corridor", 24, 13, 15) ||
        !add_road(graph, "R36", "LB Nagar - Uppal Road", 24, 21, 14) ||
        !add_road(graph, "R37", "Continental - Gachibowli Road", 22, 1, 8) ||
        !add_road(graph, "R38", "Mehdipatnam - Charminar Road", 9, 13, 14) ||
        !add_road(graph, "R39", "Secunderabad - Tarnaka Road", 17, 20, 8)) {
        graph_destroy(graph);
        return false;
    }

    return true;
}

void graph_destroy(Graph *graph)
{
    for (size_t i = 0; i < graph->node_count; i++) {
        Edge *edge = graph->nodes[i].edges;
        while (edge != NULL) {
            Edge *next = edge->next;
            free(edge);
            edge = next;
        }
        graph->nodes[i].edges = NULL;
    }

    hash_table_destroy(&graph->road_index);
    graph->node_count = 0;
    graph->road_count = 0;
}

bool graph_find_road(const Graph *graph, const char *road_id, size_t *road_index)
{
    return hash_table_get(&graph->road_index, road_id, road_index);
}

bool graph_set_road_incident(Graph *graph, const char *road_id, RoadIncident incident)
{
    size_t road_index;
    if (incident < ROAD_NORMAL || incident > ROAD_CONGESTION ||
        !graph_find_road(graph, road_id, &road_index) ||
        road_index >= graph->road_count) {
        return false;
    }

    graph->roads[road_index].incident = incident;
    return true;
}

static int incident_delay(const Road *road)
{
    switch (road->incident) {
    case ROAD_ACCIDENT:
        return 12;
    case ROAD_CONGESTION:
        return 7;
    case ROAD_NORMAL:
    case ROAD_BLOCKED:
    default:
        return 0;
    }
}

static int road_cost(const Graph *graph, const Road *road,
                     RoutePreference preference, EmergencyPriority priority,
                     RouteMode mode)
{
    const int minutes = road->travel_time + incident_delay(road);
    const int distance_meters = (int)(road_distance_km(graph, road) * 1000.0 + 0.5);
    const int base_incident_risk = road->incident == ROAD_ACCIDENT
        ? (priority == PRIORITY_CRITICAL ? 1800 : 1000)
        : road->incident == ROAD_CONGESTION
            ? (priority == PRIORITY_CRITICAL ? 600 : 350)
            : 0;
    const int incident_risk = base_incident_risk *
        (mode == ROUTE_MODE_AMBULANCE ? 2 : 1);

    if (preference == ROUTE_SHORTEST) {
        return distance_meters + minutes * 50 + incident_risk;
    }
    return minutes * 100 + distance_meters / 100 + incident_risk;
}

static bool shortest_path(const Graph *graph, int source, int destination,
                          RoutePreference preference, EmergencyPriority priority,
                          RouteMode mode,
                          const bool banned_roads[GRAPH_MAX_ROADS],
                          const bool banned_nodes[GRAPH_MAX_NODES], Route *route)
{
    int distance[GRAPH_MAX_NODES];
    int previous_node[GRAPH_MAX_NODES];
    size_t previous_road[GRAPH_MAX_NODES];
    PriorityQueue queue;

    memset(route, 0, sizeof(*route));
    if (source < 0 || destination < 0 ||
        (size_t)source >= graph->node_count ||
        (size_t)destination >= graph->node_count ||
        banned_nodes[source] || banned_nodes[destination]) {
        return true;
    }
    if (source == destination) {
        route->reachable = true;
        route->nodes[0] = source;
        route->node_count = 1;
        return true;
    }

    for (size_t i = 0; i < graph->node_count; i++) {
        distance[i] = INT_MAX;
        previous_node[i] = -1;
    }
    distance[source] = 0;

    if (!priority_queue_init(&queue)) return false;
    if (!priority_queue_enqueue(&queue, (PriorityItem){source, 0})) {
        priority_queue_destroy(&queue);
        return false;
    }

    while (!priority_queue_is_empty(&queue)) {
        PriorityItem current;
        if (!priority_queue_dequeue(&queue, &current)) {
            priority_queue_destroy(&queue);
            return false;
        }
        if (current.priority != distance[current.node]) continue;
        if (current.node == destination) break;

        for (const Edge *edge = graph->nodes[current.node].edges;
             edge != NULL; edge = edge->next) {
            const Road *road = &graph->roads[edge->road_index];
            if (road->incident == ROAD_BLOCKED || banned_roads[edge->road_index] ||
                banned_nodes[edge->destination]) {
                continue;
            }

            const int weight = road_cost(graph, road, preference, priority, mode);
            if (current.priority > INT_MAX - weight) continue;

            const int candidate = current.priority + weight;
            if (candidate < distance[edge->destination]) {
                distance[edge->destination] = candidate;
                previous_node[edge->destination] = current.node;
                previous_road[edge->destination] = edge->road_index;
                if (!priority_queue_enqueue(
                        &queue, (PriorityItem){edge->destination, candidate})) {
                    priority_queue_destroy(&queue);
                    return false;
                }
            }
        }
    }

    priority_queue_destroy(&queue);
    if (distance[destination] == INT_MAX) return true;

    int reverse_nodes[GRAPH_MAX_NODES];
    size_t reverse_roads[GRAPH_MAX_NODES];
    size_t node_count = 0;
    size_t road_count = 0;
    int node = destination;
    while (node != source) {
        if (node_count >= GRAPH_MAX_NODES - 1 || previous_node[node] < 0) {
            return false;
        }
        reverse_nodes[node_count++] = node;
        reverse_roads[road_count++] = previous_road[node];
        node = previous_node[node];
    }
    reverse_nodes[node_count++] = source;

    route->reachable = true;
    route->generalized_cost = distance[destination];
    route->node_count = node_count;
    route->road_count = road_count;
    for (size_t i = 0; i < node_count; i++) {
        route->nodes[i] = reverse_nodes[node_count - i - 1];
    }
    for (size_t i = 0; i < road_count; i++) {
        const size_t road_index = reverse_roads[road_count - i - 1];
        const Road *road = &graph->roads[road_index];
        route->road_indices[i] = road_index;
        route->total_time += road->travel_time + incident_delay(road);
        route->distance_km += road_distance_km(graph, road);
        if (road->incident != ROAD_NORMAL) route->incident_count++;
    }
    return true;
}

static bool same_route(const Route *left, const Route *right)
{
    return left->road_count == right->road_count &&
        memcmp(left->road_indices, right->road_indices,
               left->road_count * sizeof(left->road_indices[0])) == 0;
}

static bool route_has_prefix(const Route *route, const Route *prefix, size_t road_count)
{
    return route->road_count >= road_count &&
        memcmp(route->road_indices, prefix->road_indices,
               road_count * sizeof(route->road_indices[0])) == 0;
}

static bool combine_routes(const Graph *graph, const Route *root, size_t spur_index,
                           const Route *spur, RoutePreference preference,
                           EmergencyPriority priority, RouteMode mode, Route *combined)
{
    memset(combined, 0, sizeof(*combined));
    if (!root->reachable || !spur->reachable ||
        spur_index + spur->node_count > GRAPH_MAX_NODES) {
        return false;
    }

    combined->reachable = true;
    combined->node_count = spur_index + spur->node_count;
    combined->road_count = spur_index + spur->road_count;
    for (size_t i = 0; i <= spur_index; i++) {
        combined->nodes[i] = root->nodes[i];
    }
    for (size_t i = 1; i < spur->node_count; i++) {
        combined->nodes[spur_index + i] = spur->nodes[i];
    }
    for (size_t i = 0; i < spur_index; i++) {
        combined->road_indices[i] = root->road_indices[i];
    }
    for (size_t i = 0; i < spur->road_count; i++) {
        combined->road_indices[spur_index + i] = spur->road_indices[i];
    }

    for (size_t i = 0; i < combined->road_count; i++) {
        const Road *road = &graph->roads[combined->road_indices[i]];
        if (road->incident == ROAD_BLOCKED) return false;
        combined->generalized_cost += road_cost(graph, road, preference, priority, mode);
        combined->total_time += road->travel_time + incident_delay(road);
        combined->distance_km += road_distance_km(graph, road);
        if (road->incident != ROAD_NORMAL) combined->incident_count++;
    }
    return true;
}

bool graph_calculate_routes(const Graph *graph, int source, int destination,
                            RoutePreference preference, EmergencyPriority priority,
                            RouteMode mode,
                            Route routes[GRAPH_MAX_ALTERNATIVE_ROUTES], size_t *route_count)
{
    bool no_banned_roads[GRAPH_MAX_ROADS] = {false};
    bool no_banned_nodes[GRAPH_MAX_NODES] = {false};
    Route candidates[GRAPH_MAX_CANDIDATE_ROUTES];
    size_t candidate_count = 0;
    Route first;

    *route_count = 0;
    if (preference < ROUTE_FASTEST || preference > ROUTE_SHORTEST ||
        priority < PRIORITY_STANDARD || priority > PRIORITY_CRITICAL ||
        mode < ROUTE_MODE_STANDARD || mode > ROUTE_MODE_AMBULANCE ||
        !shortest_path(graph, source, destination, preference, priority, mode,
                       no_banned_roads, no_banned_nodes, &first)) {
        return false;
    }
    if (!first.reachable) return true;
    routes[(*route_count)++] = first;
    routes[0].recommended = true;

    for (size_t accepted_count = 1;
         accepted_count < GRAPH_MAX_ALTERNATIVE_ROUTES; accepted_count++) {
        const Route *previous = &routes[accepted_count - 1];
        for (size_t spur_index = 0; spur_index + 1 < previous->node_count; spur_index++) {
            bool banned_roads[GRAPH_MAX_ROADS] = {false};
            bool banned_nodes[GRAPH_MAX_NODES] = {false};
            for (size_t i = 0; i < spur_index; i++) {
                banned_nodes[previous->nodes[i]] = true;
            }
            for (size_t i = 0; i < accepted_count; i++) {
                if (route_has_prefix(&routes[i], previous, spur_index)) {
                    banned_roads[routes[i].road_indices[spur_index]] = true;
                }
            }

            Route spur;
            if (!shortest_path(graph, previous->nodes[spur_index], destination,
                               preference, priority, mode, banned_roads,
                               banned_nodes, &spur)) {
                return false;
            }

            Route combined;
            if (!combine_routes(graph, previous, spur_index, &spur, preference,
                                priority, mode, &combined)) {
                continue;
            }
            bool duplicate = false;
            for (size_t i = 0; i < accepted_count; i++) {
                if (same_route(&combined, &routes[i])) duplicate = true;
            }
            for (size_t i = 0; i < candidate_count; i++) {
                if (same_route(&combined, &candidates[i])) duplicate = true;
            }
            if (!duplicate && candidate_count < GRAPH_MAX_CANDIDATE_ROUTES) {
                candidates[candidate_count++] = combined;
            }
        }

        if (candidate_count == 0) break;
        size_t best = 0;
        for (size_t i = 1; i < candidate_count; i++) {
            if (candidates[i].generalized_cost < candidates[best].generalized_cost) {
                best = i;
            }
        }
        routes[accepted_count] = candidates[best];
        routes[accepted_count].alternate = true;
        for (size_t i = best + 1; i < candidate_count; i++) {
            candidates[i - 1] = candidates[i];
        }
        candidate_count--;
        (*route_count)++;
    }
    return true;
}

bool graph_nearest_facility(const Graph *graph, int source, const char *facility_type,
                            RoutePreference preference, EmergencyPriority priority,
                            RouteMode mode,
                            Route *route)
{
    if (strcmp(facility_type, "hospital") != 0 ||
        source < 0 || (size_t)source >= graph->node_count ||
        mode < ROUTE_MODE_STANDARD || mode > ROUTE_MODE_AMBULANCE) {
        memset(route, 0, sizeof(*route));
        return false;
    }

    bool no_banned_roads[GRAPH_MAX_ROADS] = {false};
    bool no_banned_nodes[GRAPH_MAX_NODES] = {false};
    Route best;
    memset(&best, 0, sizeof(best));

    for (size_t i = 0; i < graph->node_count; i++) {
        if (strstr(graph->nodes[i].name, "Hospital") == NULL) continue;
        Route candidate;
        if (!shortest_path(graph, source, (int)i, preference, priority, mode,
                           no_banned_roads, no_banned_nodes, &candidate)) {
            return false;
        }
        if (candidate.reachable &&
            (!best.reachable || candidate.generalized_cost < best.generalized_cost)) {
            best = candidate;
        }
    }

    *route = best;
    route->recommended = best.reachable;
    return true;
}
