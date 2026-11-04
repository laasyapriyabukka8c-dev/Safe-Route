# SafeRoute — Hyderabad Emergency Route Planner

SafeRoute is an educational emergency-dispatch demo for Hyderabad. The
interactive browser map uses Leaflet and OpenStreetMap; a persistent C process
calculates routes using the project's manually implemented adjacency-list
graph, binary min-heap priority queue, Dijkstra algorithm, and chained hash
table. Node.js provides the HTTP API, account/session handling, and bridge to C.

> **Important:** This is a classroom demonstration, not a real emergency
> dispatch or navigation service. The C network is a simplified
> landmark-to-landmark model with illustrative travel-time estimates. It does
> not use live traffic, live closures, turn-by-turn road geometry, or a routing
> service. OpenStreetMap supplies the real Hyderabad basemap and map labels.

## Architecture

```text
Browser: Leaflet map + OpenStreetMap tiles + login/dispatch UI
    │ same-origin JSON HTTP requests
    ▼
Node.js server: authenticated API + profile/preferences persistence + serialized bridge
    │ MAP / ROUTES / INCIDENT / NEAREST lines
    ▼
C backend: Hyderabad graph + road state + weighted Dijkstra/Yen + JSON responses
```

Road and place coordinates are stored in the C graph. The browser renders C's
modeled road/place data on top of OpenStreetMap; the frontend does not calculate
routes. For each request, C runs weighted Dijkstra and a Yen-style loopless
K-shortest-path procedure to return up to three distinct routes, ranked by the
selected generalized cost. Selecting a route highlights it on the map.
Incidents change graph edge state/cost and trigger a fresh calculation. Road
state is in memory for the lifetime of the server; profile and user preference
data are persisted locally. Ambulance emergency mode uses the same graph and
algorithms but doubles the simulated accident/congestion risk penalty; it does
not represent live ambulance privileges or emergency-service integration.

## Project layout

```text
include/       C interfaces for graph, min-heap, priority queue, hash table
src/           C graph data, data-structure implementations, command handler
scripts/       strict GCC-compatible build script
server/        HTTP bridge and local account/session implementation
public/        sign-in, signup, Leaflet dispatch map, responsive styles
data/          created locally for password-hash account records (git-ignored)
```

## Run locally

Install Node.js and GCC (or a compatible compiler), then run in the project
directory:

```powershell
npm.cmd run build
npm.cmd start
```

Open the URL printed by the server, create an account, and sign in. It starts
at <http://127.0.0.1:3000> and tries the next local port (through 3010) if 3000
is already in use. Set `PORT` to require a specific port or `CC` to select a
compatible compiler. Set `SAFEROUTE_DATA_DIR` to keep account and preference
records in a different local directory.

If the sign-up page says it cannot reach the server, confirm the Node server is
still running and open the exact `http://127.0.0.1:<port>` URL printed in its
terminal. The sign-up request uses the page's same origin, so an old browser
tab left on a previous port will keep requesting the stopped server. In
PowerShell, use `npm.cmd` (or `node server/server.js`) if script execution
policy or command lookup prevents the `npm` command from launching.

Leaflet and the OpenStreetMap basemap are loaded from their public services, so
the map requires an internet connection. OSM attribution is displayed on the
map. Please follow the OpenStreetMap tile usage policy.

## Hyderabad network

The C graph includes Gachibowli, HITEC City, Raidurg, Madhapur, Jubilee Hills,
Banjara Hills, Mehdipatnam, Lakdikapul, Nampally, Abids, Charminar,
Secunderabad, Begumpet, Ameerpet, Tarnaka, Uppal, and LB Nagar, as well as
Continental, AIG, Apollo Jubilee Hills, CARE Banjara Hills, Yashoda
Secunderabad, KIMS, Osmania General, and Gandhi hospitals.

The search box finds places in this modeled network. Named hospitals can be
selected as destinations, or the nearest modeled hospital can be requested
using the same graph costs. The current network does not contain verified
police- or fire-station coordinates, so those facility types are explicitly
reported as unavailable rather than assigned invented locations.

The road controls simulate Normal, Blocked, Accident, and Heavy congestion
conditions. A blocked road is removed from path consideration. Accidents add
12 simulated minutes, congestion adds 7, and both add a risk penalty to the
generalized edge cost (accident: 1000 standard / 1800 critical; congestion:
350 standard / 600 critical). The fastest preference scores minutes × 100
plus distance in meters / 100 and incident risk; the shortest preference
scores meters plus minutes × 50 and incident risk. These are demonstration weights, not live traffic or
real emergency-response measurements. The app displays incident markers and
explains when a selected path starts avoiding an affected road. Ambulance mode
doubles the incident-risk portion of either cost function. It changes neither
the simulated delay values nor the rule that blocked roads are unavailable.

The profile menu edits the existing account's name/email and provides saved
appearance, map visibility/default-view, notification, facility-type,
routing, and response-priority preferences. Account records retain salted
scrypt password hashes; settings are stored by account ID in the local,
git-ignored data directory.

## Account behavior

Sign-up validates the name, email, and a 10–128 character password. Passwords
are stored as salted scrypt hashes, not plaintext. Sessions use random
HTTP-only, SameSite cookies and are kept in memory, so a server restart signs
users out. Account hashes are stored in the ignored local `data/accounts.json`
file. This built-in account store is for a local project demo, not production
deployment.

## API

- `GET /api/session` — current session status.
- `POST /api/auth/signup` — `{ "name": "...", "email": "...", "password": "..." }`
- `POST /api/auth/login` — `{ "email": "...", "password": "..." }`
- `POST /api/auth/logout`
- `GET /api/map` — C graph places, roads, and simulated incident states.
- `POST /api/route` — `{ "source": 0, "destination": 13, "preference": "fastest", "priority": "standard", "mode": "standard" }`; returns up to three C-calculated routes. `mode` may be `standard` or `ambulance`; omitted mode defaults to standard.
- `POST /api/route` with `{ "source": 0, "nearestFacility": "hospital", "mode": "ambulance" }` — nearest modeled hospital using the selected mode. Police/fire facility requests return an explicit unsupported-network response.
- `POST /api/roads/R3/incident` — `{ "incident": "blocked" | "accident" | "congestion" | "normal" }`.
- `GET /api/profile` and `PATCH /api/profile` — view or edit the signed-in user's name/email.
- `GET /api/preferences` and `PATCH /api/preferences` — read/update signed-in user's saved settings.

Dispatch endpoints require a signed-in session. The C program's internal
line-based protocol is `MAP`, `ROUTES <source> <destination> <FASTEST|SHORTEST> <STANDARD|CRITICAL>`,
`INCIDENT <road-id> <NORMAL|BLOCKED|ACCIDENT|CONGESTION>`, and
`NEAREST <source> HOSPITAL <preference> <priority>`. Route commands optionally
accept a final `<STANDARD|AMBULANCE>` mode; omitting it preserves standard
routing. Legacy `BLOCK` and `OPEN` commands remain accepted by the C process.

## ADS viva walkthrough

1. `src/graph.c` models weighted roads as adjacency lists and runs Dijkstra
   with banned edge/node sets for each Yen spur path.
2. `src/priority_queue.c` wraps the manually implemented binary min-heap in
   `src/min_heap.c`.
3. `src/hash_table.c` uses separate chaining to map road IDs to graph edges.
4. `src/graph.c` generates distinct loopless alternatives and ranks them using
   generalized time/distance/incident costs.
5. `src/main.c` exposes map, route, incident, and nearest-hospital operations
   over a line-oriented JSON protocol. `server/server.js` serializes access to
   this persistent C process; browser code only renders and requests results.
