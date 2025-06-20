// app/session-storage.ts
import { SessionStorage, Session } from '@shopify/shopify-app-session-storage';
import prisma from '~/db.server'; // Your Prisma client instance

/**
 * Implements Shopify's SessionStorage interface using Prisma.
 * This allows Shopify sessions to be stored in and retrieved from your database.
 */
export const prismaSessionStorage: SessionStorage = {
  /**
   * Stores a Shopify session in the database.
   * It also ensures a corresponding Shop record exists and links the session to it.
   * @param session The Shopify session object to store.
   * @returns true if the session was stored successfully, false otherwise.
   */
  storeSession: async (session: Session): Promise<boolean> => {
    try {
      // Ensure the Shop record exists or create it.
      // The `shop` field in the Session model will store the shop domain (e.g., 'your-shop.myshopify.com').
      // The `shopId` field will store the ID of the related Shop record.
      const shopRecord = await prisma.shop.upsert({
        where: { shop: session.shop }, // Use the shop domain as the unique identifier for finding the Shop
        update: { accessToken: session.accessToken }, // Update accessToken if it changes
        create: {
          shop: session.shop, // Shopify shop domain
          accessToken: session.accessToken,
          // Initialize other Shop fields as necessary, e.g., default notification settings
        },
      });

      // Now, upsert the session, linking it to the shopRecord's ID.
      await prisma.session.upsert({
        where: { id: session.id },
        update: {
          shop: session.shop, // Store the shop domain on the session record as well for direct access if needed
          content: JSON.stringify(session), // Serialize the whole session object
          expires: session.expires,
          accessToken: session.accessToken, // Also store accessToken directly for easier querying if needed
          isOnline: session.isOnline,
          scope: session.scope,
          state: session.state,
          userId: session.onlineAccessInfo?.userId, // Correctly access userId
          shopId: shopRecord.id, // Link to the Shop record using its ID
        },
        create: {
          id: session.id,
          shop: session.shop, // Store the shop domain
          content: JSON.stringify(session),
          expires: session.expires,
          accessToken: session.accessToken,
          isOnline: session.isOnline,
          scope: session.scope,
          state: session.state,
          userId: session.onlineAccessInfo?.userId,
          shopId: shopRecord.id, // Link to the Shop record using its ID
        },
      });
      return true;
    } catch (error) {
      console.error('Failed to store session:', error);
      return false;
    }
  },

  /**
   * Loads a Shopify session from the database by its ID.
   * It reconstructs the Session object from the stored data.
   * @param id The ID of the session to load.
   * @returns The Session object if found, undefined otherwise.
   */
  loadSession: async (id: string): Promise<Session | undefined> => {
    try {
      const prismaSession = await prisma.session.findUnique({
        where: { id },
        // Include the related Shop record to ensure we can reconstruct the session.shop domain if needed.
        // The `shop` field on the Prisma Session model should ideally store the domain.
        // If `content` stores the full session, `shopRecord` might be for referential integrity or other uses.
        include: {
          shopRecord: { // Assuming 'shopRecord' is the relation name in Prisma schema for Session -> Shop
            select: { shop: true } // Select only the shop domain from the related Shop record
          }
        }
      });

      if (!prismaSession || !prismaSession.content) {
        return undefined;
      }

      // Ensure that if shopRecord is included, we use its shop domain for consistency,
      // or ensure prismaSession.shop (domain) is correctly populated and used.
      // The `content` should be the source of truth for the Session object.
      const sessionData = JSON.parse(prismaSession.content) as Session;

      // It's crucial that the `shop` property of the returned Session object
      // matches what Shopify expects (the shop domain).
      // If `prismaSession.shop` stores the domain, and `sessionData.shop` from content also does, they should match.
      // If `sessionData.shop` might be missing from older stored content, use `prismaSession.shopRecord.shop`.
      if (!sessionData.shop && prismaSession.shopRecord?.shop) {
          console.warn(`Session content for ID ${id} was missing shop domain, using from related shopRecord.`);
          sessionData.shop = prismaSession.shopRecord.shop;
      } else if (sessionData.shop !== prismaSession.shopRecord?.shop && prismaSession.shopRecord?.shop) {
          // This case indicates a potential mismatch if both exist and are different.
          // Prioritize the one from shopRecord if it's considered more canonical for the relation.
          // However, session.shop from the Session object itself is usually the authority.
          console.warn(`Mismatch between session content shop domain ('${sessionData.shop}') and related shopRecord domain ('${prismaSession.shopRecord.shop}') for session ID ${id}. Using session content's domain.`);
      }
       // If prismaSession.shop directly stores the domain, that's even simpler:
       // const session = new Session(JSON.parse(prismaSession.content));
       // session.shop = prismaSession.shop; // Ensure shop domain is set from the session record's own shop field.

      // Reconstruct the session object.
      // The Session constructor can take all properties.
      // Ensure all necessary properties from the Shopify Session type are correctly mapped.
      // This includes id, shop, state, isOnline, expires, accessToken, scope, onlineAccessInfo.
      // The `content` field should ideally store all of these.
      // For properties like `expires`, ensure they are correctly converted back to Date objects if needed.
      const session = new Session(sessionData); // This should correctly instantiate from the parsed content.

      // If `expires` was stored as a string, convert it back to a Date object.
      // Prisma handles DateTime conversion automatically if the field type is DateTime.
      // If `content` stores it as ISO string, Session constructor should handle it.
      // session.expires = prismaSession.expires ? new Date(prismaSession.expires) : undefined;

      return session;

    } catch (error) {
      console.error('Failed to load session:', error);
      return undefined;
    }
  },

  /**
   * Deletes a Shopify session from the database by its ID.
   * @param id The ID of the session to delete.
   * @returns true if the session was deleted successfully, false otherwise.
   */
  deleteSession: async (id: string): Promise<boolean> => {
    try {
      await prisma.session.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  },

  /**
   * Deletes all sessions associated with a specific shop domain.
   * @param shop The shop domain (e.g., 'your-shop.myshopify.com').
   * @returns true if sessions were deleted successfully, false otherwise.
   */
  deleteSessions: async (shop: string): Promise<boolean> => {
    try {
      // Find the shop record to get its ID, as sessions are linked by shopId
      const shopRecord = await prisma.shop.findUnique({ where: { shop } });
      if (shopRecord) {
        await prisma.session.deleteMany({ where: { shopId: shopRecord.id } });
      } else {
        // If no shop record, there should be no sessions linked via shopId.
        // However, if some sessions were stored only with `shop` domain (old schema),
        // this might be an alternative:
        // await prisma.session.deleteMany({ where: { shop: shop } });
        // For consistency with the new schema, deleting by shopId is preferred.
        console.warn(`Shop ${shop} not found, no sessions deleted by shopId.`);
      }
      return true;
    } catch (error) {
      console.error(`Failed to delete sessions for shop ${shop}:`, error);
      return false;
    }
  },

  /**
   * Finds all sessions associated with a specific shop domain.
   * This is optional and used for specific use cases like GDPR compliance.
   * @param shop The shop domain.
   * @returns An array of session IDs.
   */
  findSessionsByShop: async (shop: string): Promise<string[]> => {
    try {
      const shopRecord = await prisma.shop.findUnique({ where: { shop } });
      if (!shopRecord) return [];

      const sessions = await prisma.session.findMany({
        where: { shopId: shopRecord.id },
        select: { id: true },
      });
      return sessions.map(s => s.id);
    } catch (error) {
      console.error(`Failed to find sessions for shop ${shop}:`, error);
      return [];
    }
  },

  /**
   * Disconnects from the session storage.
   * For Prisma, this can be a no-op as Prisma Client manages its own connections.
   * However, you can explicitly disconnect if needed for graceful shutdown.
   */
  disconnect: async (): Promise<void> => {
    // await prisma.$disconnect(); // Uncomment if you want to explicitly disconnect Prisma Client
    return Promise.resolve();
  },
};

// Example of how to initialize ShopifyApp with this session storage:
// import { shopifyApp } from "@shopify/shopify-app-remix/server";
//
// const shopify = shopifyApp({
//   // ... other config
//   sessionStorage: prismaSessionStorage,
//   // ...
// });
//
// export default shopify;
// export const apiVersion = ApiVersion.October23; // Or your chosen version
// export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
// export const authenticate = shopify.authenticate;
// export const unauthenticated = shopify.unauthenticated;
// export const login = shopify.login;
// export const registerWebhooks = shopify.registerWebhooks;
// export const sessionStorage = shopify.sessionStorage;
//
// Make sure this file is correctly referenced in your shopify.server.ts or similar setup file.
// The `prismaSessionStorage` object is what you export and provide to ShopifyApp.
