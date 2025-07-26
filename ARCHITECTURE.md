# PB-Remix-Inventory Architecture

This document provides a high-level overview of the `pb-remix-inventory` application architecture. The Mermaid.js diagram below illustrates the primary components and their interactions.

```mermaid
graph TD
    subgraph "User"
        A[Merchant]
    end

    subgraph "Shopify Ecosystem"
        B[Shopify Admin<br/>(Embedded App Host)]
        C[Shopify GraphQL API<br/>(Products, Inventory, Locations)]
    end

    subgraph "Application Infrastructure (Vercel)"
        subgraph "Remix Application (pb-remix-inventory)"
            D[Frontend<br/>(React, Polaris, Remix Routes)]
            E[Backend<br/>(Remix Loaders & Actions)]
            F[Prisma Client<br/>(ORM)]
            G[Cron Endpoint<br/>(/api/cron)]
        end

        subgraph "Backend Services"
            H[shopify.server.ts<br/>(Auth, Webhooks, API Context)]
            I[inventory.server.ts<br/>(Business Logic)]
            J[ai.server.ts<br/>(AI Prompts & Logic)]
            K[notification.server.ts<br/>(User Alerts)]
        end

        subgraph "Data & External APIs"
            L[PostgreSQL Database<br/>(Neon)]
            M[Google Gemini API]
        end

        N[Vercel Cron Scheduler]
    end

    %% --- Main User Flow ---
    A -- Interacts with --> B
    B -- Renders --> D
    D -- Makes requests to --> E

    %% --- Backend Logic ---
    E -- Uses --> H
    E -- Uses --> I
    E -- Uses --> J
    E -- Uses --> K

    %% --- Service Interactions ---
    H -- Authenticates with --> C
    I -- Reads/Writes Inventory --> C
    I -- Reads/Writes App Data --> F
    J -- Uses Inventory Data --> I
    J -- Sends Prompts --> M
    K -- Reads/Writes Notifications --> F

    %% --- Data Layer ---
    F -- Manages connection to --> L

    %% --- Cron Job Flow ---
    N -- Triggers --> G
    G -- Executes --> I
    G -- Executes --> K
```

### Diagram Breakdown

1.  **User & Shopify Ecosystem**: A merchant interacts with your embedded app through the Shopify Admin. The app communicates with the Shopify GraphQL API for core data like products and inventory.
2.  **Remix Application**:
    *   The **Frontend** is built with React and Shopify's Polaris component library.
    *   The **Backend** uses Remix's loaders and actions to handle server-side logic.
    *   **Prisma Client** acts as the Object-Relational Mapper (ORM) to interact with your database.
3.  **Backend Services**: The backend logic is modularized into services for handling Shopify-specific functions, inventory business logic, AI interactions, and user notifications.
4.  **Data & External APIs**:
    *   The application state, session information, and logs are stored in a **PostgreSQL** database hosted on Neon.
    *   The AI features are powered by the **Google Gemini API**.
5.  **Cron Job**: A **Vercel Cron Scheduler** periodically triggers an endpoint in your app (`/api/cron`) to perform background tasks, such as analyzing inventory and sending notifications.