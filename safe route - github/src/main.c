#include "graph.h"

#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define COMMAND_BUFFER_SIZE 128
#define COMMAND_TOKEN_COUNT 6
#define COMMAND_TOKEN_SIZE 32

static void print_error(const char *message)
{
    printf("{\"type\":\"error\",\"message\":\"%s\"}\n", message);
    fflush(stdout);
}

static size_t split_command(char *line, char tokens[COMMAND_TOKEN_COUNT][COMMAND_TOKEN_SIZE])
{
    size_t count = 0;
    char *token = strtok(line, " \t\r\n");

    while (token != NULL && count < COMMAND_TOKEN_COUNT) {
        if (strlen(token) >= COMMAND_TOKEN_SIZE) {
            return COMMAND_TOKEN_COUNT + 1;
        }

        strcpy(tokens[count++], token);
        token = strtok(NULL, " \t\r\n");
    }

    return token == NULL ? count : COMMAND_TOKEN_COUNT + 1;
}

static bool parse_node_id(const char *text, int *node_id)
{
    char *end = NULL;
    errno = 0;
    const long value = strtol(text, &end, 10);
    if (errno != 0 || end == text || *end != '\0' || value < 0 || value > INT_MAX) {
        return false;
    }

    *node_id = (int)value;
    return true;
}

static void print_map(const Graph *graph)
{
    printf("{\"type\":\"map\",\"nodes\":[");
    for (size_t i = 0; i < graph->node_count; i++) {
        const Node *node = &graph->nodes[i];
        const char *facility = strstr(node->name, "Hospital") != NULL
            ? "hospital" : "landmark";
        printf("%s{\"id\":%d,\"name\":\"%s\",\"latitude\":%.6f,\"longitude\":%.6f,\"facilityType\":\"%s\"}",
               i == 0 ? "" : ",", node->id, node->name,
               node->latitude, node->longitude, facility);
    }

    printf("],\"roads\":[");
    for (size_t i = 0; i < graph->road_count; i++) {
        const Road *road = &graph->roads[i];
        static const char *incident_names[] = {
            "normal", "blocked", "accident", "congestion"
        };
        const int delay = road->incident == ROAD_ACCIDENT ? 12 :
            road->incident == ROAD_CONGESTION ? 7 : 0;
        printf("%s{\"id\":\"%s\",\"name\":\"%s\",\"from\":%d,\"to\":%d,\"time\":%d,\"incident\":\"%s\",\"simulatedDelay\":%d}",
               i == 0 ? "" : ",", road->id, road->name, road->from, road->to,
               road->travel_time, incident_names[road->incident], delay);
    }
    printf("]}\n");
    fflush(stdout);
}

static void print_route_item(const Graph *graph, const Route *route, size_t index)
{
    printf("%s{\"recommended\":%s,\"alternate\":%s,\"totalTime\":%d,\"distanceKm\":%.2f,\"segmentCount\":%zu,\"generalizedCost\":%d,\"incidentCount\":%zu,\"nodes\":[",
           index == 0 ? "" : ",",
           route->recommended ? "true" : "false",
           route->alternate ? "true" : "false",
           route->total_time, route->distance_km, route->road_count,
           route->generalized_cost, route->incident_count);
    for (size_t i = 0; i < route->node_count; i++) {
        printf("%s%d", i == 0 ? "" : ",", route->nodes[i]);
    }
    printf("],\"roads\":[");
    for (size_t i = 0; i < route->road_count; i++) {
        printf("%s\"%s\"", i == 0 ? "" : ",",
               graph->roads[route->road_indices[i]].id);
    }
    printf("]}");
}

static bool parse_route_options(const char *preference_text, const char *priority_text,
                                RoutePreference *preference, EmergencyPriority *priority)
{
    if (strcmp(preference_text, "FASTEST") == 0) {
        *preference = ROUTE_FASTEST;
    } else if (strcmp(preference_text, "SHORTEST") == 0) {
        *preference = ROUTE_SHORTEST;
    } else {
        return false;
    }

    if (strcmp(priority_text, "STANDARD") == 0) {
        *priority = PRIORITY_STANDARD;
    } else if (strcmp(priority_text, "CRITICAL") == 0) {
        *priority = PRIORITY_CRITICAL;
    } else {
        return false;
    }
    return true;
}

static bool parse_route_mode(const char *mode_text, RouteMode *mode)
{
    if (strcmp(mode_text, "STANDARD") == 0) {
        *mode = ROUTE_MODE_STANDARD;
    } else if (strcmp(mode_text, "AMBULANCE") == 0) {
        *mode = ROUTE_MODE_AMBULANCE;
    } else {
        return false;
    }
    return true;
}

static bool parse_incident(const char *text, RoadIncident *incident)
{
    if (strcmp(text, "NORMAL") == 0) *incident = ROAD_NORMAL;
    else if (strcmp(text, "BLOCKED") == 0) *incident = ROAD_BLOCKED;
    else if (strcmp(text, "ACCIDENT") == 0) *incident = ROAD_ACCIDENT;
    else if (strcmp(text, "CONGESTION") == 0) *incident = ROAD_CONGESTION;
    else return false;
    return true;
}

static void print_route_result(const Graph *graph, const char *type,
                               RouteMode mode,
                               const Route *routes, size_t route_count)
{
    printf("{\"type\":\"%s\",\"mode\":\"%s\",\"routes\":[", type,
           mode == ROUTE_MODE_AMBULANCE ? "ambulance" : "standard");
    for (size_t i = 0; i < route_count; i++) {
        print_route_item(graph, &routes[i], i);
    }
    printf("]}\n");
    fflush(stdout);
}

static void handle_command(Graph *graph, char tokens[COMMAND_TOKEN_COUNT][COMMAND_TOKEN_SIZE],
                           size_t token_count)
{
    if (token_count == 1 && strcmp(tokens[0], "MAP") == 0) {
        print_map(graph);
        return;
    }

    if ((token_count == 5 || token_count == 6) &&
        strcmp(tokens[0], "ROUTES") == 0) {
        int source;
        int destination;
        RoutePreference preference;
        EmergencyPriority priority;
        RouteMode mode = ROUTE_MODE_STANDARD;
        if (!parse_node_id(tokens[1], &source) ||
            !parse_node_id(tokens[2], &destination) ||
            (size_t)source >= graph->node_count ||
            (size_t)destination >= graph->node_count ||
            !parse_route_options(tokens[3], tokens[4], &preference, &priority) ||
            (token_count == 6 && !parse_route_mode(tokens[5], &mode))) {
            print_error("Invalid route request");
            return;
        }

        Route routes[GRAPH_MAX_ALTERNATIVE_ROUTES];
        size_t route_count = 0;
        if (!graph_calculate_routes(graph, source, destination, preference,
                                    priority, mode, routes, &route_count)) {
            print_error("Unable to calculate routes");
            return;
        }
        print_route_result(graph, "routes", mode, routes, route_count);
        return;
    }

    if ((token_count == 5 || token_count == 6) &&
        strcmp(tokens[0], "NEAREST") == 0) {
        int source;
        RoutePreference preference;
        EmergencyPriority priority;
        RouteMode mode = ROUTE_MODE_STANDARD;
        if (!parse_node_id(tokens[1], &source) ||
            (size_t)source >= graph->node_count ||
            !parse_route_options(tokens[3], tokens[4], &preference, &priority) ||
            (token_count == 6 && !parse_route_mode(tokens[5], &mode))) {
            print_error("Invalid nearest-facility request");
            return;
        }

        Route route;
        if (strcmp(tokens[2], "HOSPITAL") != 0 ||
            !graph_nearest_facility(graph, source, "hospital", preference,
                                    priority, mode, &route)) {
            print_error("Unsupported facility type");
            return;
        }
        print_route_result(graph, "nearest", mode,
                           route.reachable ? &route : NULL,
                           route.reachable ? 1 : 0);
        return;
    }

    if (token_count == 3 && strcmp(tokens[0], "INCIDENT") == 0) {
        RoadIncident incident;
        size_t road_index;
        if (!parse_incident(tokens[2], &incident) ||
            !graph_find_road(graph, tokens[1], &road_index) ||
            !graph_set_road_incident(graph, tokens[1], incident)) {
            print_error("Unknown road or incident type");
            return;
        }

        if (token_count == 2 && strcmp(tokens[0], "BLOCK") == 0) {
            char incident_tokens[COMMAND_TOKEN_COUNT][COMMAND_TOKEN_SIZE] = {{0}};
            strcpy(incident_tokens[0], "INCIDENT");
            strcpy(incident_tokens[1], tokens[1]);
            strcpy(incident_tokens[2], "BLOCKED");
            handle_command(graph, incident_tokens, 3);
            return;
        }

        if (token_count == 2 && strcmp(tokens[0], "OPEN") == 0) {
            char incident_tokens[COMMAND_TOKEN_COUNT][COMMAND_TOKEN_SIZE] = {{0}};
            strcpy(incident_tokens[0], "INCIDENT");
            strcpy(incident_tokens[1], tokens[1]);
            strcpy(incident_tokens[2], "NORMAL");
            handle_command(graph, incident_tokens, 3);
            return;
        }

        static const char *incident_names[] = {
            "normal", "blocked", "accident", "congestion"
        };
        printf("{\"type\":\"road\",\"roadId\":\"%s\",\"incident\":\"%s\"}\n",
               graph->roads[road_index].id, incident_names[incident]);
        fflush(stdout);
        return;
    }

    print_error("Unknown or malformed command");
}

int main(void)
{
    Graph graph;
    if (!graph_init(&graph)) {
        fprintf(stderr, "Failed to initialize the city graph.\n");
        return EXIT_FAILURE;
    }

    char line[COMMAND_BUFFER_SIZE];
    while (fgets(line, sizeof(line), stdin) != NULL) {
        if (strchr(line, '\n') == NULL && !feof(stdin)) {
            int character;
            while ((character = getchar()) != '\n' && character != EOF) {
            }
            print_error("Command is too long");
            continue;
        }

        char tokens[COMMAND_TOKEN_COUNT][COMMAND_TOKEN_SIZE] = {{0}};
        const size_t token_count = split_command(line, tokens);
        if (token_count == 1 && strcmp(tokens[0], "QUIT") == 0) {
            break;
        }
        handle_command(&graph, tokens, token_count);
    }

    graph_destroy(&graph);
    return EXIT_SUCCESS;
}