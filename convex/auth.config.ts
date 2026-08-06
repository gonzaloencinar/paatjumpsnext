// Sin este fichero TODO queda silenciosamente signed-out: es lo que le dice
// a Convex qué JWTs aceptar (los que emite el propio deployment con
// JWT_PRIVATE_KEY y valida contra JWKS).
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
