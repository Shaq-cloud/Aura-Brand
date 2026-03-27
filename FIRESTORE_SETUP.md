# Firestore Setup

## Collections

### `users/{uid}`

```js
{
  uid: string,
  name: string,
  email: string,
  role: "customer" | "admin",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastLoginAt: Timestamp
}
```

### `carts/{uid}`

```js
{
  uid: string,
  items: [
    {
      id: string,
      name: string,
      category: string,
      price: number,
      image: string,
      alt: string,
      quantity: number
    }
  ],
  itemCount: number,
  totalCost: number,
  updatedAt: Timestamp
}
```

### `orders/{orderId}`

```js
{
  uid: string,
  customerName: string,
  customerEmail: string,
  items: Array<CartItem>,
  itemCount: number,
  totalCost: number,
  shippingAddress: {
    fullName: string,
    addressLine1: string,
    addressLine2: string,
    city: string,
    region: string,
    postalCode: string,
    country: string
  },
  notes: string,
  status: "pending",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Current planned product collection

- `products/{productId}`

## Current behavior

- When a Firebase user signs in, the app creates or updates `users/{uid}` automatically.
- New users default to `role: "customer"`.
- Guest users can build a cart locally.
- When a user signs in, the local cart merges into `carts/{uid}` in Firestore.
- Signed-in cart changes sync back to Firestore automatically.
- Checkout writes a new document into `orders`.

## Suggested first Firestore rules

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /carts/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /orders/{orderId} {
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
```

## Next recommended upgrade

- Add admin-only rules for `products`
- Add product CRUD from a dashboard page
- Add an order history page for signed-in customers

## Admin dashboard rules upgrade

When you are ready to lock the database beyond test mode and still let the admin dashboard manage products and read all orders, use rules along these lines:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    function isAdmin() {
      return signedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId) || isAdmin();
    }

    match /carts/{userId} {
      allow read, write: if isOwner(userId) || isAdmin();
    }

    match /orders/{orderId} {
      allow create: if signedIn() && request.resource.data.uid == request.auth.uid;
      allow read: if isAdmin() || (signedIn() && resource.data.uid == request.auth.uid);
      allow update: if isAdmin();
      allow delete: if false;
    }

    match /products/{productId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }
  }
}
```

Notes:

- The admin dashboard created in `admin-dashboard.html` reads all orders and products.
- Product create/update/delete from the dashboard will need the `products` admin rule above.
- Reading all customer orders from the dashboard will need the `orders` admin read rule above.
- For these rules to work, the matching admin user document in `users/{uid}` must have `role: "admin"`.
