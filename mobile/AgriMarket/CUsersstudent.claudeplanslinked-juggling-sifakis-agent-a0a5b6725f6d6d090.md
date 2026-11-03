# AgriMarket Implementation Plan

## Overview
This plan details the full-stack implementation of the AgriMarket system, connecting farmers and buyers directly. The system consists of a Node.js backend and an Expo/React Native mobile application.

## 1. Server Architecture (Node.js)

### Directory Structure
```text
server/
├── src/
│   ├── config/         # Environment variables, DB connection
│   ├── controllers/    # Request handlers (Auth, Product, Order)
│   ├── middleware/     # Auth guards, error handling, validation
│   ├── models/         # Database schemas (Mongoose/Sequelize)
│   ├── routes/         # API route definitions
│   ├── services/       # Business logic (complex operations)
│   ├── utils/          # Helper functions
│   └── app.ts          # Express application setup
│   └── server.ts       # Entry point (listener)
├── tests/              # Unit and integration tests
├── .env                # Environment secrets
└── package.json
```

### Database Schema (Recommended: MongoDB)
MongoDB is recommended for flexibility in product attributes (different produce types).

**User Collection:**
- `_id`: ObjectId
- `email`: String (unique, indexed)
- `password`: String (hashed)
- `role`: Enum ('FARMER', 'BUYER')
- `profile`: { `name`: String, `phone`: String, `address`: String, `location`: { `type`: 'Point', `coordinates`: [long, lat] } }
- `createdAt`: Date

**Product Collection:**
- `_id`: ObjectId
- `farmerId`: ObjectId (ref: User)
- `name`: String
- `category`: String (e.g., 'Vegetables', 'Fruits')
- `description`: String
- `price`: Number (per unit)
- `unit`: String (e.g., 'kg', 'crate', 'dozen')
- `quantityAvailable`: Number
- `images`: [String] (URLs)
- `createdAt`: Date

**Order Collection:**
- `_id`: ObjectId
- `buyerId`: ObjectId (ref: User)
- `farmerId`: ObjectId (ref: User)
- `productId`: ObjectId (ref: Product)
- `quantity`: Number
- `totalPrice`: Number
- `status`: Enum ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED')
- `orderDate`: Date

### API Endpoints (REST)

#### Auth
- `POST /api/auth/register` - Register user (Role: Farmer/Buyer)
- `POST /api/auth/login` - Authenticate and return JWT
- `GET /api/auth/me` - Get current user profile

#### Products (Farmer)
- `POST /api/products` - Create new product (Farmer only)
- `PUT /api/products/:id` - Update product (Farmer only)
- `DELETE /api/products/:id` - Remove product (Farmer only)
- `GET /api/products/my-products` - Get products owned by current farmer

#### Products (Buyer)
- `GET /api/products` - Browse products (with search/category filters)
- `GET /api/products/:id` - Get product details

#### Orders
- `POST /api/orders` - Create order (Buyer only)
- `GET /api/orders/buyer` - Get orders placed by current buyer
- `GET /api/orders/farmer` - Get orders received by current farmer
- `PATCH /api/orders/:id/status` - Update order status (Farmer only)

## 2. Mobile App Architecture (Expo/React Native)

### New Folder Structure for Screens
Following Expo Router conventions in `src/app/`:

```text
src/app/
├── (auth)/             # Authentication group (no tabs)
│   ├── login.tsx       # Login screen
│   ├── register.tsx     # Registration screen (Role selection)
│   └── _layout.tsx     # Stack layout for auth
├── (tabs)/             # Main application group (with tabs)
│   ├── index.tsx       # Home/Marketplace
│   ├── explore.tsx     # Search/Categories
│   ├── orders.tsx      # Order history (Buyer/Farmer views)
│   ├── profile.tsx     # User profile and settings
│   └── _layout.tsx     # Tab navigator
├── (farmer)/           # Farmer-specific management (hidden from buyers)
│   ├── manage-products/ # Product listing for farmers
│   │   ├── index.tsx   # List of farmer's products
│   │   └── add.tsx     # Add new product form
│   └── _layout.tsx     # Stack layout for farmer tools
└── _layout.tsx         # Root layout (Auth provider, Global state)
```

## 3. Implementation Sequence

### Phase 1: Backend Foundation & Auth
1. **Setup**: Initialize Node.js project, install `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`.
2. **Auth Implementation**:
   - Create User model.
   - Implement Register/Login controllers.
   - Implement `authMiddleware` to verify JWT and check roles.
3. **Verification**: Test endpoints using Postman/Insomnia.

### Phase 2: Product Management
1. **Product Logic**:
   - Create Product model.
   - Implement Farmer endpoints (POST/PUT/DELETE).
   - Implement Buyer endpoints (GET).
2. **Mobile Integration**:
   - Implement `(auth)` screens.
   - Connect Login/Register screens to API.
   - Implement `(farmer)/manage-products` flow.
3. **Verification**: Ensure farmers can post and buyers can see products in the app.

### Phase 3: Order Workflow
1. **Order Logic**:
   - Create Order model.
   - Implement Order placement (POST).
   - Implement Order status updates (PATCH).
   - Implement Order history retrieval (GET).
2. **Mobile Integration**:
   - Add "Buy" button to product details.
   - Implement `(tabs)/orders` screen for both roles.
3. **Verification**: Complete a full cycle: Farmer posts $\rightarrow$ Buyer buys $\rightarrow$ Farmer accepts $\rightarrow$ Order completed.

### Phase 4: Refinement & Polish
1. **UI/UX**: Enhance marketplace search and filters.
2. **Validation**: Add request validation (e.g., `joi` or `zod`).
3. **Error Handling**: Implement global error handling middleware on server.
4. **Verification**: End-to-end testing across different roles.

## 4. Verification Steps

| Phase | Step | Expected Result |
|---|---|---|
| 1 | `POST /api/auth/register` | User created, password hashed, role assigned. |
| 1 | `POST /api/auth/login` | Valid JWT returned for correct credentials. |
| 2 | `POST /api/products` | Product created when authenticated as Farmer; 403 for Buyer. |
| 2 | `GET /api/products` | Returns list of all available products. |
| 3 | `POST /api/orders` | Order created, quantity deducted (optional), notification sent. |
| 3 | `PATCH /api/orders/:id/status` | Order status updates to 'ACCEPTED' by Farmer. |
