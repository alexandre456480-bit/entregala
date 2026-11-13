// Routes also reference profiles through operational audit actors.
// Keep the driver relationship explicit so PostgREST never selects an ambiguous FK.
export const routeSelect =
  '*, profiles:profiles!routes_driver_id_fkey(*), route_stops(*, orders(*, establishments(*), order_items(*)))';
