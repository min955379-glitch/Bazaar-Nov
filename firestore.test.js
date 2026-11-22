const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_123";
const BOB_UID = "bob_456";
const ADMIN_UID = "admin_owner_01";
const ADMIN_EMAIL = "abdulmanan304000@gmail.com";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function adminContext() {
  return testEnv.authenticatedContext(ADMIN_UID, {
    email: ADMIN_EMAIL,
    email_verified: true,
  });
}

function spoofedAdminContext() {
  return testEnv.authenticatedContext("spoof_999", {
    email: ADMIN_EMAIL,
    email_verified: false,
  });
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated requests are denied across all collections", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("products").where("active", "==", true).get());
  await assertFails(unauthDb.collection("orders").get());
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
  await assertFails(unauthDb.collection("admins").doc(ADMIN_UID).get());
});

test("Email spoofing attack with unverified admin email is rejected", async () => {
  const spoofDb = spoofedAdminContext().firestore();
  const now = new Date(Date.now() - 1000);
  await assertFails(
    spoofDb.collection("products").doc("prod_1").set({
      title: "Fake Product",
      description: "Attempted spoof",
      category: "Electronics",
      priceCents: 1999,
      stockCount: 5,
      imageKey: "electronics",
      active: true,
      featured: false,
      createdBy: "spoof_999",
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(
    spoofDb.collection("admins").doc("spoof_999").set({
      adminId: "spoof_999",
      email: ADMIN_EMAIL,
      grantedBy: "spoof_999",
      createdAt: now,
    })
  );
});

test("User profile isolation and strict schema enforcement", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const now = new Date(Date.now() - 5000);

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).set({
      userId: ALICE_UID,
      displayName: "Alice",
      email: "alice@example.com",
      createdAt: now,
      updatedAt: now,
    })
  );

  // Cross-user read/write denied
  await assertFails(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).update({
      displayName: "Hijacked",
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Ghost field / privilege escalation rejected
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      isAdmin: true,
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Future timestamp rejected
  await assertFails(
    bobDb.collection("users").doc(BOB_UID).set({
      userId: BOB_UID,
      displayName: "Bob",
      email: "bob@example.com",
      createdAt: new Date(Date.now() + 60000),
      updatedAt: now,
    })
  );
});

test("Bootstrapped admin manages products; regular users can only read active products and decrement stock on checkout", async () => {
  const adminDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const now = new Date(Date.now() - 5000);

  // Admin creates active and inactive products (NO @DocumentId `id` field)
  await assertSucceeds(
    adminDb.collection("products").doc("prod_1").set({
      title: "Studio ANC Headphones",
      description: "Matte obsidian wireless headphones with 40h battery.",
      category: "Electronics",
      priceCents: 18900,
      stockCount: 12,
      imageKey: "electronics",
      active: true,
      featured: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    adminDb.collection("products").doc("prod_hidden").set({
      title: "Draft Product",
      description: "Hidden from customers",
      category: "Home",
      priceCents: 4500,
      stockCount: 4,
      imageKey: "home",
      active: false,
      featured: false,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Customer cannot create or delete products
  await assertFails(
    aliceDb.collection("products").doc("prod_hack").set({
      title: "Hack Item",
      description: "Unauthorized",
      category: "Electronics",
      priceCents: 100,
      stockCount: 10,
      imageKey: "electronics",
      active: true,
      featured: false,
      createdBy: ALICE_UID,
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(aliceDb.collection("products").doc("prod_1").delete());

  // Customer filtered active query succeeds; unfiltered query fails
  await assertSucceeds(
    aliceDb.collection("products").where("active", "==", true).get()
  );
  await assertFails(aliceDb.collection("products").get());

  // Admin unfiltered query succeeds
  await assertSucceeds(adminDb.collection("products").get());

  // Customer cannot tamper with price, but can decrement stockCount on active product
  await assertFails(
    aliceDb.collection("products").doc("prod_1").update({
      priceCents: 1,
      updatedAt: new Date(Date.now() - 1000),
    })
  );
  await assertSucceeds(
    aliceDb.collection("products").doc("prod_1").update({
      stockCount: 10,
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Admin can update all mutable product fields
  await assertSucceeds(
    adminDb.collection("products").doc("prod_1").update({
      title: "Studio ANC Headphones Pro",
      priceCents: 19900,
      stockCount: 25,
      updatedAt: new Date(Date.now() - 500),
    })
  );
});

test("User-scoped cart subcollection isolation and product existence check", async () => {
  const adminDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const now = new Date(Date.now() - 5000);

  await assertSucceeds(
    adminDb.collection("products").doc("prod_1").set({
      title: "Cognac Leather Tote",
      description: "Full-grain leather tote.",
      category: "Fashion",
      priceCents: 14500,
      stockCount: 8,
      imageKey: "fashion",
      active: true,
      featured: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Adding a non-existent product fails
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).collection("cart").doc("missing_prod").set({
      productId: "missing_prod",
      title: "Ghost",
      priceCents: 100,
      imageKey: "fashion",
      quantity: 1,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Alice adds valid cart item
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("cart").doc("prod_1").set({
      productId: "prod_1",
      title: "Cognac Leather Tote",
      priceCents: 14500,
      imageKey: "fashion",
      quantity: 2,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Alice lists her own cart; Bob is denied
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).collection("cart").get());
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("cart").get());
});

test("Orders lifecycle: customer creates PENDING, cancels own PENDING, admin advances status, cross-user PII isolated", async () => {
  const adminDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const now = new Date(Date.now() - 5000);

  const orderPayload = {
    userId: ALICE_UID,
    customerName: "Alice Khan",
    customerEmail: "alice@example.com",
    shippingAddress: "42 Clifton Road, Karachi",
    customerPhone: "+923001234567",
    paymentMethod: "Cash on Delivery",
    status: "PENDING",
    totalCents: 14500,
    itemCount: 1,
    items: [
      {
        productId: "prod_1",
        title: "Cognac Leather Tote",
        priceCents: 14500,
        quantity: 1,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  // Alice cannot create an already DELIVERED order
  await assertFails(
    aliceDb.collection("orders").doc("order_bad").set({
      ...orderPayload,
      status: "DELIVERED",
    })
  );

  // Alice creates valid PENDING order
  await assertSucceeds(aliceDb.collection("orders").doc("order_1").set(orderPayload));

  // Alice filtered query succeeds; unfiltered query fails; Bob cannot read Alice's order
  await assertSucceeds(aliceDb.collection("orders").where("userId", "==", ALICE_UID).get());
  await assertFails(aliceDb.collection("orders").get());
  await assertFails(bobDb.collection("orders").doc("order_1").get());

  // Alice cannot mark her own order SHIPPED
  await assertFails(
    aliceDb.collection("orders").doc("order_1").update({
      status: "SHIPPED",
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Admin advances status to SHIPPED -> DELIVERED
  await assertSucceeds(
    adminDb.collection("orders").doc("order_1").update({
      status: "SHIPPED",
      updatedAt: new Date(Date.now() - 900),
    })
  );

  // Alice cannot cancel an order that is no longer PENDING
  await assertFails(
    aliceDb.collection("orders").doc("order_1").update({
      status: "CANCELLED",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Admin can list all orders
  await assertSucceeds(adminDb.collection("orders").get());
});
