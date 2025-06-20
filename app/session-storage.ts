// <reference types="@shopify/shopify-app-remix" />
// import { PrismaSessionStorage } from '@shopify/shopify-app-remix';

import { PrismaClient, Session as PrismaSession } from "@prisma/client";
import { Session } from "@shopify/shopify-api";

export interface SessionStorage {
  storeSession(session: Session): Promise<boolean>;
  loadSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
}

export class PrismaSessionStorageImpl implements SessionStorage {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async storeSession(session: Session): Promise<boolean> {
    try {
      const shopRecord = await this.prisma.shop.upsert({
        where: { shop: session.shop },
        update: {
          // Only update the Shop's main accessToken if this is an offline session
          // and it provides an accessToken.
          ...(session.isOnline === false && session.accessToken && { accessToken: session.accessToken }),
        },
        create: {
          shop: session.shop,
          // Set the Shop's main accessToken if this is an offline session.
          // If it's an online session, accessToken on the Shop record might remain null
          // or be set later by an offline session.
          accessToken: (session.isOnline === false && session.accessToken) ? session.accessToken : null,
        },
      });

      const data = {
        id: session.id,
        shopId: shopRecord.id, // Use the UUID of the shop
        state: session.state,
        isOnline: session.isOnline, // Store the actual isOnline value
        // accessToken on the Session model is for the session itself.
        // Online sessions won't have this; offline sessions will.
        accessToken: session.accessToken ?? null,
        scope: session.scope ?? undefined,
        expires: session.expires ?? undefined,
      };

      await this.prisma.session.upsert({
        where: { id: session.id },
        update: data, // Use the same data for update
        create: data,
      });
      return true;
    } catch (e: any) {
      console.error("Error storing session:", e);
      console.error("Error name:", e.name);
      console.error("Error message:", e.message);
      console.error("Error stack:", e.stack);
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const prismaSession = await this.prisma.session.findUnique({
        where: { id },
        include: {
          shop: { select: { shop: true } }, // Include shop domain
        },
      });
      if (!prismaSession || !prismaSession.shop || !prismaSession.shop.shop) {
        return undefined;
      }

      // Reconstruct the Shopify Session object
      const shopifySession = new Session({
        id: prismaSession.id,
        shop: prismaSession.shop.shop, // Use the actual shop domain
        state: prismaSession.state,
        isOnline: prismaSession.isOnline, // Use stored isOnline value
      });

      // Conditionally set properties that might not exist on all session types
      if (prismaSession.accessToken) {
        shopifySession.accessToken = prismaSession.accessToken;
      }
      if (prismaSession.scope) {
        // shopifySession.scope = prismaSession.scope === null ? undefined : prismaSession.scope;
        // The Session constructor from @shopify/shopify-api handles scope being potentially null
        shopifySession.scope = prismaSession.scope;
      }
      if (prismaSession.expires) {
        shopifySession.expires = new Date(prismaSession.expires);
      }
      return shopifySession;
    } catch (e: any) {
      console.error("Error loading session:", e);
      console.error("Error name:", e.name);
      console.error("Error message:", e.message);
      console.error("Error stack:", e.stack);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await this.prisma.session.delete({
        where: { id },
      });
      return true;
    } catch (e: any) {
      console.error("Error deleting session:", e);
      console.error("Error name:", e.name);
      console.error("Error message:", e.message);
      console.error("Error stack:", e.stack);
      return false;
    }
  }
}

// Export for compatibility with import in shopify.server.ts
export { PrismaSessionStorageImpl as PrismaSessionStorage };
