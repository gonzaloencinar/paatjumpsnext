import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

// Convex Auth (F3): provider Password — los admins crean su contraseña. El
// sign-up queda abierto a propósito: el acceso real lo gatea la allowlist
// admin_users (convex/admins.ts), igual que hacía is_admin() en Supabase.
//
// TODO(Google): añadir el provider Google cuando exista el OAuth client
// (setear AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET en el deployment y añadir
// `Google` de @auth/core/providers/google a `providers`).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
