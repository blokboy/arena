import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { verifyCredentials } from "@/domain/auth";
import { userRepository } from "@/server/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const result = await verifyCredentials(
          {
            username: String(credentials?.username ?? ""),
            password: String(credentials?.password ?? "")
          },
          userRepository
        );

        return result.ok ? { id: result.user.id, name: result.user.username } : null;
      }
    })
  ]
});
