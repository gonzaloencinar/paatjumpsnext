import { httpRouter } from "convex/server";
import { auth } from "./auth";

// Rutas HTTP de Convex Auth en el dominio .site del deployment:
// /.well-known/openid-configuration y /.well-known/jwks.json (con las que el
// propio deployment valida los JWTs que emite — sin esto, discovery 404 y
// todo queda signed-out) + los callbacks de OAuth cuando se añada Google.
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
